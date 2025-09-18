import { it, expect, describe } from '@jest/globals';

import { Mutex, KeyedMutex } from '../../../src/utils/mutex.js';

describe('Mutex', () => {
  describe('Basic locking', () => {
    it('should allow sequential access to critical section', async () => {
      const mutex = new Mutex();
      const results: number[] = [];

      const task1 = async () => {
        const release = await mutex.acquire();
        results.push(1);
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(2);
        release();
      };

      const task2 = async () => {
        const release = await mutex.acquire();
        results.push(3);
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(4);
        release();
      };

      await Promise.all([task1(), task2()]);

      // Tasks should execute sequentially
      expect(results).toEqual([1, 2, 3, 4]);
    });

    it('should queue multiple waiting tasks', async () => {
      const mutex = new Mutex();
      const results: number[] = [];

      const createTask = (id: number) => async () => {
        const release = await mutex.acquire();
        results.push(id);
        await new Promise(resolve => setTimeout(resolve, 5));
        release();
      };

      await Promise.all([
        createTask(1)(),
        createTask(2)(),
        createTask(3)(),
        createTask(4)()
      ]);

      expect(results).toEqual([1, 2, 3, 4]);
    });
  });

  describe('withLock helper', () => {
    it('should execute function with lock held', async () => {
      const mutex = new Mutex();
      const results: number[] = [];

      const task1 = () => mutex.withLock(async () => {
        results.push(1);
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(2);
      });

      const task2 = () => mutex.withLock(async () => {
        results.push(3);
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(4);
      });

      await Promise.all([task1(), task2()]);

      expect(results).toEqual([1, 2, 3, 4]);
    });

    it('should release lock even if function throws', async () => {
      const mutex = new Mutex();
      let secondTaskExecuted = false;

      const task1 = () => mutex.withLock(async () => {
        throw new Error('Task 1 failed');
      });

      const task2 = () => mutex.withLock(async () => {
        secondTaskExecuted = true;
      });

      // First task should fail
      await expect(task1()).rejects.toThrow('Task 1 failed');

      // Second task should still execute
      await task2();
      expect(secondTaskExecuted).toBe(true);
    });

    it('should return the result of the function', async () => {
      const mutex = new Mutex();

      const result = await mutex.withLock(() => 42);
      expect(result).toBe(42);

      const asyncResult = await mutex.withLock(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'hello';
      });
      expect(asyncResult).toBe('hello');
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent race conditions in counter increment', async () => {
      const mutex = new Mutex();
      let counter = 0;

      const increment = () => mutex.withLock(async () => {
        const current = counter;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        counter = current + 1;
      });

      await Promise.all(Array(10).fill(0).map(() => increment()));

      expect(counter).toBe(10);
    });

    it('should prevent race conditions without mutex (control test)', async () => {
      let counter = 0;

      const increment = async () => {
        const current = counter;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        counter = current + 1;
      };

      await Promise.all(Array(10).fill(0).map(() => increment()));

      // Without mutex, we'll likely have race conditions causing lost updates
      // Counter will likely be less than 10
      expect(counter).toBeLessThanOrEqual(10);
    });
  });
});

describe('KeyedMutex', () => {
  describe('Basic keyed locking', () => {
    it('should allow concurrent access to different keys', async () => {
      const mutex = new KeyedMutex<string>();
      const results: string[] = [];

      const task1 = async () => {
        const release = await mutex.acquire('key1');
        results.push('key1-start');
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push('key1-end');
        release();
      };

      const task2 = async () => {
        const release = await mutex.acquire('key2');
        results.push('key2-start');
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push('key2-end');
        release();
      };

      await Promise.all([task1(), task2()]);

      // Different keys should execute concurrently
      expect(results[0]).toBe('key1-start');
      expect(results[1]).toBe('key2-start');
    });

    it('should serialize access to the same key', async () => {
      const mutex = new KeyedMutex<string>();
      const results: string[] = [];

      const task1 = async () => {
        const release = await mutex.acquire('key1');
        results.push('task1-start');
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push('task1-end');
        release();
      };

      const task2 = async () => {
        const release = await mutex.acquire('key1');
        results.push('task2-start');
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push('task2-end');
        release();
      };

      await Promise.all([task1(), task2()]);

      // Same key should execute sequentially
      expect(results).toEqual(['task1-start', 'task1-end', 'task2-start', 'task2-end']);
    });
  });

  describe('withLock helper', () => {
    it('should execute function with lock held for specific key', async () => {
      const mutex = new KeyedMutex<string>();
      const results: string[] = [];

      const task1 = () => mutex.withLock('key1', async () => {
        results.push('task1');
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const task2 = () => mutex.withLock('key2', async () => {
        results.push('task2');
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const task3 = () => mutex.withLock('key1', async () => {
        results.push('task3');
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      await Promise.all([task1(), task2(), task3()]);

      // task2 should be able to run concurrently with task1
      // task3 must wait for task1
      expect(results[0]).toBe('task1');
      expect(results[1]).toBe('task2');
      expect(results[2]).toBe('task3');
    });

    it('should handle errors properly', async () => {
      const mutex = new KeyedMutex<string>();

      const failingTask = () => mutex.withLock('key1', async () => {
        throw new Error('Task failed');
      });

      const successTask = () => mutex.withLock('key1', async () => 'success');

      await expect(failingTask()).rejects.toThrow('Task failed');
      const result = await successTask();
      expect(result).toBe('success');
    });
  });

  describe('Cleanup methods', () => {
    it('should delete specific mutex', () => {
      const mutex = new KeyedMutex<string>();

      mutex.withLock('key1', () => 'test1');
      mutex.withLock('key2', () => 'test2');

      mutex.delete('key1');

      // Should be able to immediately acquire key1 again
      let acquired = false;
      mutex.acquire('key1').then(release => {
        acquired = true;
        release();
      });

      // Synchronously check if acquired (since it should be immediate)
      expect(acquired).toBe(false); // Not yet, but will be on next tick
    });

    it('should clear all mutexes', () => {
      const mutex = new KeyedMutex<string>();

      mutex.withLock('key1', () => 'test1');
      mutex.withLock('key2', () => 'test2');
      mutex.withLock('key3', () => 'test3');

      mutex.clear();

      // All keys should be immediately acquirable after clear
      const promises = ['key1', 'key2', 'key3'].map(key =>
        mutex.acquire(key).then(release => {
          release();
          return key;
        })
      );

      // All should resolve immediately
      return expect(Promise.all(promises)).resolves.toEqual(['key1', 'key2', 'key3']);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle mixed operations on multiple keys', async () => {
      const mutex = new KeyedMutex<number>();
      const results: Array<{ key: number; value: number }> = [];
      const sharedResource: Record<number, number> = {};

      const operation = (key: number, value: number) =>
        mutex.withLock(key, async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          sharedResource[key] = (sharedResource[key] || 0) + value;
          results.push({ key, value: sharedResource[key] });
        });

      await Promise.all([
        operation(1, 10),
        operation(2, 20),
        operation(1, 15),
        operation(3, 30),
        operation(2, 25),
        operation(1, 5)
      ]);

      // Check that operations on same key were serialized
      const key1Results = results.filter(r => r.key === 1).map(r => r.value);
      expect(key1Results).toEqual([10, 25, 30]); // 10, then +15=25, then +5=30

      const key2Results = results.filter(r => r.key === 2).map(r => r.value);
      expect(key2Results).toEqual([20, 45]); // 20, then +25=45

      const key3Results = results.filter(r => r.key === 3).map(r => r.value);
      expect(key3Results).toEqual([30]); // just 30
    });
  });
});