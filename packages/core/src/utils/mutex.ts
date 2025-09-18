/**
 * Simple mutex implementation for preventing race conditions
 * Uses JavaScript's single-threaded nature with async/await for synchronization
 */
export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  /**
   * Acquire the lock. Returns a promise that resolves when the lock is acquired.
   * Must call the returned release function when done with the critical section.
   */
  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  /**
   * Release the lock and process the next waiting task
   */
  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function with the lock held
   */
  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Keyed mutex for locking on specific keys (useful for connection pools)
 */
export class KeyedMutex<K = string> {
  private locks = new Map<K, Mutex>();

  /**
   * Get or create a mutex for a specific key
   */
  private getMutex(key: K): Mutex {
    let mutex = this.locks.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.locks.set(key, mutex);
    }
    return mutex;
  }

  /**
   * Acquire lock for a specific key
   */
  async acquire(key: K): Promise<() => void> {
    return this.getMutex(key).acquire();
  }

  /**
   * Execute a function with the lock held for a specific key
   */
  async withLock<T>(key: K, fn: () => T | Promise<T>): Promise<T> {
    return this.getMutex(key).withLock(fn);
  }

  /**
   * Remove a mutex for a key (useful for cleanup)
   */
  delete(key: K): void {
    this.locks.delete(key);
  }

  /**
   * Clear all locks
   */
  clear(): void {
    this.locks.clear();
  }
}