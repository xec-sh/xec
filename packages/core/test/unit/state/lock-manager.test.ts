import { it, expect, describe, beforeEach } from 'vitest';

import { LockManager } from '../../../src/state/lock-manager.js';

describe('state/lock-manager', () => {
  let lockManager: LockManager;

  beforeEach(() => {
    lockManager = new LockManager();
  });

  describe('acquire', () => {
    it('should acquire a lock for a resource', async () => {
      const lockId = await lockManager.acquire('resource-1');
      
      expect(lockId).toBeDefined();
      expect(typeof lockId).toBe('string');
      expect(await lockManager.isLocked('resource-1')).toBe(true);
    });

    it('should wait for lock to be available', async () => {
      const lock1 = await lockManager.acquire('resource-1');
      
      // Try to acquire the same resource
      const lock2Promise = lockManager.acquire('resource-1', 1000);
      
      // Should still be locked
      expect(await lockManager.isLocked('resource-1')).toBe(true);
      
      // Release first lock
      await lockManager.release(lock1);
      
      // Second lock should now succeed
      const lock2 = await lock2Promise;
      expect(lock2).toBeDefined();
      expect(lock2).not.toBe(lock1);
    });

    it('should timeout if lock cannot be acquired', async () => {
      await lockManager.acquire('resource-1');
      
      // Try to acquire with short timeout
      await expect(
        lockManager.acquire('resource-1', 100)
      ).rejects.toThrow('Lock acquisition timeout');
    });

    it('should handle multiple resources independently', async () => {
      const lock1 = await lockManager.acquire('resource-1');
      const lock2 = await lockManager.acquire('resource-2');
      const lock3 = await lockManager.acquire('resource-3');
      
      expect(lock1).toBeDefined();
      expect(lock2).toBeDefined();
      expect(lock3).toBeDefined();
      expect(lock1).not.toBe(lock2);
      expect(lock2).not.toBe(lock3);
      
      expect(await lockManager.isLocked('resource-1')).toBe(true);
      expect(await lockManager.isLocked('resource-2')).toBe(true);
      expect(await lockManager.isLocked('resource-3')).toBe(true);
    });
  });

  describe('release', () => {
    it('should release a held lock', async () => {
      const lockId = await lockManager.acquire('resource-1');
      expect(await lockManager.isLocked('resource-1')).toBe(true);
      
      await lockManager.release(lockId);
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should handle releasing non-existent lock', async () => {
      await expect(
        lockManager.release('non-existent-lock')
      ).resolves.not.toThrow();
    });

    it('should allow re-acquiring after release', async () => {
      const lock1 = await lockManager.acquire('resource-1');
      await lockManager.release(lock1);
      
      const lock2 = await lockManager.acquire('resource-1');
      expect(lock2).toBeDefined();
      expect(await lockManager.isLocked('resource-1')).toBe(true);
    });

    it('should unblock waiting acquires on release', async () => {
      const lock1 = await lockManager.acquire('resource-1');
      
      // Start multiple waiting acquires
      const waitingAcquires = [
        lockManager.acquire('resource-1', 5000),
        lockManager.acquire('resource-1', 5000),
        lockManager.acquire('resource-1', 5000)
      ];
      
      // Give them time to start waiting
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Release the lock
      await lockManager.release(lock1);
      
      // One of the waiting acquires should succeed
      const result = await Promise.race([
        Promise.race(waitingAcquires),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 1000)
        )
      ]);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string'); // Should be a lock ID
    });
  });

  describe('extend', () => {
    it('should extend lock timeout', async () => {
      const lockId = await lockManager.acquire('resource-1', 1000);
      
      // Extend the lock
      await lockManager.extend(lockId, 5000);
      
      // Lock should still be held
      expect(await lockManager.isLocked('resource-1')).toBe(true);
      
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(await lockManager.isLocked('resource-1')).toBe(true);
    });

    it('should throw error for non-existent lock', async () => {
      await expect(
        lockManager.extend('non-existent', 1000)
      ).rejects.toThrow('Lock not found');
    });

    it('should throw error for expired lock', async () => {
      const lockId = await lockManager.acquire('resource-1', 100);
      
      // Wait for lock to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await expect(
        lockManager.extend(lockId, 1000)
      ).rejects.toThrow('Lock expired');
    });
  });

  describe('isLocked', () => {
    it('should return false for unlocked resource', async () => {
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should return true for locked resource', async () => {
      await lockManager.acquire('resource-1');
      expect(await lockManager.isLocked('resource-1')).toBe(true);
    });

    it('should return false after lock expires', async () => {
      await lockManager.acquire('resource-1', 100);
      expect(await lockManager.isLocked('resource-1')).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent lock requests correctly', async () => {
      const resources = Array.from({ length: 10 }, (_, i) => `resource-${i}`);
      const acquirePromises = resources.map(r => lockManager.acquire(r));
      
      const locks = await Promise.all(acquirePromises);
      
      // All locks should be unique
      const uniqueLocks = new Set(locks);
      expect(uniqueLocks.size).toBe(locks.length);
      
      // All resources should be locked
      const lockStatuses = await Promise.all(
        resources.map(r => lockManager.isLocked(r))
      );
      expect(lockStatuses.every(status => status === true)).toBe(true);
    });

    it('should maintain lock integrity under concurrent access', async () => {
      const resource = 'shared-resource';
      const results: string[] = [];
      
      // Simulate concurrent workers trying to access the resource
      const workers = Array.from({ length: 5 }, async (_, i) => {
        const lockId = await lockManager.acquire(resource, 5000);
        results.push(`worker-${i}-start`);
        
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 50));
        
        results.push(`worker-${i}-end`);
        await lockManager.release(lockId);
      });
      
      await Promise.all(workers);
      
      // Verify that work was done sequentially (no overlapping)
      for (let i = 0; i < results.length; i += 2) {
        expect(results[i].endsWith('-start')).toBe(true);
        expect(results[i + 1].endsWith('-end')).toBe(true);
        
        const workerNum = results[i].match(/worker-(\d+)/)?.[1];
        expect(results[i + 1]).toBe(`worker-${workerNum}-end`);
      }
    });
  });
});