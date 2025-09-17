import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { ExecutionResultImpl } from '../../../src/core/result.js';
import { ResultCache, globalCache } from '../../../src/utils/cache.js';

import type { ExecutionResult } from '../../../src/core/result.js';

// Mock execution result
function createMockResult(stdout: string, exitCode = 0): ExecutionResult {
  return new ExecutionResultImpl(
    stdout,
    '',
    exitCode,
    undefined,
    'test command',
    100,
    new Date(),
    new Date(),
    'mock'
  );
}

describe('ResultCache', () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache(60000);
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('Basic operations', () => {
    it('should store and retrieve results', () => {
      const result = createMockResult('test output');
      const key = 'test-key';

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved).toBe(result);
      expect(retrieved?.stdout).toBe('test output');
    });

    it('should return null for non-existent keys', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should clear all entries', () => {
      cache.set('key1', createMockResult('result1'));
      cache.set('key2', createMockResult('result2'));
      cache.set('key3', createMockResult('result3'));

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('TTL (Time To Live)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const result = createMockResult('test output');
      const key = 'ttl-test';
      const ttl = 5000; // 5 seconds

      cache.set(key, result, ttl);

      // Should exist before TTL
      expect(cache.get(key)).toBe(result);

      // Advance time past TTL
      jest.advanceTimersByTime(6000);

      // Should be expired
      expect(cache.get(key)).toBeNull();
    });

    it('should not expire entries with 0 TTL', () => {
      const result = createMockResult('test output');
      const key = 'no-ttl';

      cache.set(key, result, 0);

      // Advance time significantly
      jest.advanceTimersByTime(3600000); // 1 hour

      // Should still exist
      expect(cache.get(key)).toBe(result);
    });

    it('should clean up expired entries periodically', () => {
      // Create cache with short cleanup interval
      const shortCache = new ResultCache(1000); // 1 second cleanup

      shortCache.set('key1', createMockResult('result1'), 500);
      shortCache.set('key2', createMockResult('result2'), 1500);
      shortCache.set('key3', createMockResult('result3'), 0);

      // Advance time to expire key1
      jest.advanceTimersByTime(1000);

      // key1 should be cleaned up
      expect(shortCache.get('key1')).toBeNull();
      expect(shortCache.get('key2')).not.toBeNull();
      expect(shortCache.get('key3')).not.toBeNull();

      shortCache.dispose();
    });
  });

  describe('Key generation', () => {
    it('should generate consistent keys for same inputs', () => {
      const command = 'echo test';
      const cwd = '/home/user';
      const env = { NODE_ENV: 'test' };

      const key1 = cache.generateKey(command, cwd, env);
      const key2 = cache.generateKey(command, cwd, env);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash
    });

    it('should generate different keys for different commands', () => {
      const key1 = cache.generateKey('echo test1');
      const key2 = cache.generateKey('echo test2');

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different cwd', () => {
      const key1 = cache.generateKey('echo test', '/dir1');
      const key2 = cache.generateKey('echo test', '/dir2');

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different env', () => {
      const key1 = cache.generateKey('echo test', '/', { VAR: 'value1' });
      const key2 = cache.generateKey('echo test', '/', { VAR: 'value2' });

      expect(key1).not.toBe(key2);
    });

    it('should use process.cwd() as default', () => {
      const key1 = cache.generateKey('echo test');
      const key2 = cache.generateKey('echo test', process.cwd());

      expect(key1).toBe(key2);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate entries matching patterns', () => {
      cache.set('db-count', createMockResult('100'));
      cache.set('db-users', createMockResult('50'));
      cache.set('api-data', createMockResult('data'));

      cache.invalidate(['db-*']);

      expect(cache.get('db-count')).toBeNull();
      expect(cache.get('db-users')).toBeNull();
      expect(cache.get('api-data')).not.toBeNull();
    });

    it('should handle exact match patterns', () => {
      cache.set('exact-key', createMockResult('value'));
      cache.set('exact-key-2', createMockResult('value2'));

      cache.invalidate(['exact-key']);

      expect(cache.get('exact-key')).toBeNull();
      expect(cache.get('exact-key-2')).not.toBeNull();
    });

    it('should handle multiple patterns', () => {
      cache.set('api-users', createMockResult('users'));
      cache.set('api-posts', createMockResult('posts'));
      cache.set('db-stats', createMockResult('stats'));
      cache.set('cache-info', createMockResult('info'));

      cache.invalidate(['api-*', 'db-*']);

      expect(cache.get('api-users')).toBeNull();
      expect(cache.get('api-posts')).toBeNull();
      expect(cache.get('db-stats')).toBeNull();
      expect(cache.get('cache-info')).not.toBeNull();
    });

    it('should handle wildcard patterns', () => {
      cache.set('test-1-data', createMockResult('data1'));
      cache.set('test-2-data', createMockResult('data2'));
      cache.set('prod-1-data', createMockResult('data3'));

      cache.invalidate(['test-?-data']);

      expect(cache.get('test-1-data')).toBeNull();
      expect(cache.get('test-2-data')).toBeNull();
      expect(cache.get('prod-1-data')).not.toBeNull();
    });

    it('should handle empty pattern array', () => {
      cache.set('key1', createMockResult('value1'));

      cache.invalidate([]);

      expect(cache.get('key1')).not.toBeNull();
    });
  });

  describe('Global cache instance', () => {
    afterEach(() => {
      globalCache.clear();
    });

    it('should be a singleton instance', () => {
      const key = 'global-test';
      const result = createMockResult('global result');

      globalCache.set(key, result);

      // Access from another reference
      const retrieved = globalCache.get(key);
      expect(retrieved).toBe(result);
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in commands', () => {
      const specialCommand = 'echo "test with $pecial ch@rs & symbols"';
      const key = cache.generateKey(specialCommand);
      const result = createMockResult('output');

      cache.set(key, result);
      expect(cache.get(key)).toBe(result);
    });

    it('should handle very long commands', () => {
      const longCommand = 'echo ' + 'x'.repeat(10000);
      const key = cache.generateKey(longCommand);
      const result = createMockResult('output');

      cache.set(key, result);
      expect(cache.get(key)).toBe(result);
    });

    it('should handle concurrent access', async () => {
      const promises = [];

      // Simulate concurrent writes
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            cache.set(`concurrent-${i}`, createMockResult(`result-${i}`));
          })
        );
      }

      await Promise.all(promises);

      // Verify all writes succeeded
      for (let i = 0; i < 10; i++) {
        const result = cache.get(`concurrent-${i}`);
        expect(result?.stdout).toBe(`result-${i}`);
      }
    });
  });

  describe('Cache stats', () => {
    it('should return basic statistics', () => {
      cache.set('key1', createMockResult('result1'));
      cache.set('key2', createMockResult('result2'));
      cache.set('key3', createMockResult('result3'));

      const stats = cache.stats();

      expect(stats.size).toBe(3);
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });
  });
});