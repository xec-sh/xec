import { v4 as uuidv4 } from 'uuid';

import { ILockManager } from './interfaces';

interface Lock {
  id: string;
  resource: string;
  acquiredAt: number;
  expiresAt: number;
  holder?: string;
}

export class LockManager implements ILockManager {
  private locks: Map<string, Lock> = new Map();
  private lockQueue: Map<string, Array<{ resolve: (lockId: string) => void; timeout: number }>> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private defaultTimeout: number = 30000; // 30 seconds

  constructor(cleanupIntervalMs: number = 5000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  async acquire(resource: string, timeout?: number): Promise<string> {
    const lockTimeout = timeout || this.defaultTimeout;
    const now = Date.now();
    
    const existingLock = this.locks.get(resource);
    if (existingLock && existingLock.expiresAt > now) {
      return this.queueLockRequest(resource, lockTimeout);
    }

    const lockId = uuidv4();
    const lock: Lock = {
      id: lockId,
      resource,
      acquiredAt: now,
      expiresAt: now + lockTimeout,
    };

    this.locks.set(resource, lock);
    return lockId;
  }

  async release(lockId: string): Promise<void> {
    for (const [resource, lock] of this.locks.entries()) {
      if (lock.id === lockId) {
        this.locks.delete(resource);
        this.processQueue(resource);
        return;
      }
    }
  }

  async extend(lockId: string, timeout: number): Promise<void> {
    for (const [resource, lock] of this.locks.entries()) {
      if (lock.id === lockId) {
        const now = Date.now();
        if (lock.expiresAt <= now) {
          throw new Error('Lock expired');
        }
        lock.expiresAt = now + timeout;
        return;
      }
    }
    
    throw new Error('Lock not found');
  }

  async isLocked(resource: string): Promise<boolean> {
    const lock = this.locks.get(resource);
    if (!lock) return false;
    
    const now = Date.now();
    if (lock.expiresAt <= now) {
      this.locks.delete(resource);
      this.processQueue(resource);
      return false;
    }
    
    return true;
  }

  async tryAcquire(resource: string, timeout?: number): Promise<string | null> {
    const lockTimeout = timeout || this.defaultTimeout;
    const now = Date.now();
    
    const existingLock = this.locks.get(resource);
    if (existingLock && existingLock.expiresAt > now) {
      return null;
    }

    const lockId = uuidv4();
    const lock: Lock = {
      id: lockId,
      resource,
      acquiredAt: now,
      expiresAt: now + lockTimeout,
    };

    this.locks.set(resource, lock);
    return lockId;
  }

  async withLock<T>(resource: string, fn: () => Promise<T>, timeout?: number): Promise<T> {
    const lockId = await this.acquire(resource, timeout);
    
    try {
      return await fn();
    } finally {
      await this.release(lockId);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.locks.clear();
    this.lockQueue.clear();
  }

  private queueLockRequest(resource: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.lockQueue.has(resource)) {
        this.lockQueue.set(resource, []);
      }
      
      const timeoutHandle = setTimeout(() => {
        const queue = this.lockQueue.get(resource);
        if (queue) {
          const index = queue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            queue.splice(index, 1);
            if (queue.length === 0) {
              this.lockQueue.delete(resource);
            }
          }
        }
        reject(new Error('Lock acquisition timeout'));
      }, timeout);
      
      const wrappedResolve = (lockId: string) => {
        clearTimeout(timeoutHandle);
        resolve(lockId);
      };
      
      this.lockQueue.get(resource)!.push({ resolve: wrappedResolve, timeout });
    });
  }

  private processQueue(resource: string): void {
    const queue = this.lockQueue.get(resource);
    if (!queue || queue.length === 0) return;
    
    const { resolve, timeout } = queue.shift()!;
    
    if (queue.length === 0) {
      this.lockQueue.delete(resource);
    }
    
    const lockId = uuidv4();
    const lock: Lock = {
      id: lockId,
      resource,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + timeout,
    };
    
    this.locks.set(resource, lock);
    resolve(lockId);
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredResources: string[] = [];
    
    for (const [resource, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        expiredResources.push(resource);
      }
    }
    
    for (const resource of expiredResources) {
      this.locks.delete(resource);
      this.processQueue(resource);
    }
  }
}

export class DistributedLockManager implements ILockManager {
  private localLocks: LockManager;
  private nodeId: string;
  private storage: Map<string, Lock> = new Map(); // In production, use Redis/etcd

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.localLocks = new LockManager();
  }

  async acquire(resource: string, timeout?: number): Promise<string> {
    const lockTimeout = timeout || 30000;
    const now = Date.now();
    const lockId = `${this.nodeId}:${uuidv4()}`;
    
    const key = `lock:${resource}`;
    const existingLock = this.storage.get(key);
    
    if (existingLock && existingLock.expiresAt > now) {
      // Wait and retry
      await this.sleep(100);
      return this.acquire(resource, timeout);
    }
    
    const lock: Lock = {
      id: lockId,
      resource,
      acquiredAt: now,
      expiresAt: now + lockTimeout,
      holder: this.nodeId,
    };
    
    this.storage.set(key, lock);
    return lockId;
  }

  async release(lockId: string): Promise<void> {
    for (const [key, lock] of this.storage.entries()) {
      if (lock.id === lockId && lock.holder === this.nodeId) {
        this.storage.delete(key);
        return;
      }
    }
  }

  async extend(lockId: string, timeout: number): Promise<void> {
    for (const [key, lock] of this.storage.entries()) {
      if (lock.id === lockId && lock.holder === this.nodeId) {
        lock.expiresAt = Date.now() + timeout;
        this.storage.set(key, lock);
        return;
      }
    }
    
    throw new Error(`Lock ${lockId} not found or not owned by this node`);
  }

  async isLocked(resource: string): Promise<boolean> {
    const key = `lock:${resource}`;
    const lock = this.storage.get(key);
    
    if (!lock) return false;
    
    if (lock.expiresAt <= Date.now()) {
      this.storage.delete(key);
      return false;
    }
    
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}