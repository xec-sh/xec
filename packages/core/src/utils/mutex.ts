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
      return this.releaseOnce();
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        resolve(this.releaseOnce());
      });
    });
  }

  /**
   * Release the lock and process the next waiting task
   */
  private releaseOnce(): () => void {
    let released = false;
    return () => { if (!released) { released = true; this.release(); } };
  }

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
  private locks = new Map<K, { mutex: Mutex; users: number }>();

  /** Count holders and waiters before yielding, so cleanup cannot split a queue. */
  async acquire(key: K): Promise<() => void> {
    let entry = this.locks.get(key);
    if (!entry) { entry = { mutex: new Mutex(), users: 0 }; this.locks.set(key, entry); }
    const owned = entry;
    owned.users++;
    const unlock = await owned.mutex.acquire();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlock();
      owned.users--;
      if (!owned.users && this.locks.get(key) === owned) this.locks.delete(key);
    };
  }

  async withLock<T>(key: K, fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire(key);
    try { return await fn(); } finally { release(); }
  }

  /** Cleanup never abandons a holder or a queued waiter. Idle keys disappear automatically. */
  delete(key: K): void {
    const entry = this.locks.get(key);
    if (entry && !entry.users) this.locks.delete(key);
  }

  clear(): void { for (const key of this.locks.keys()) this.delete(key); }
}
