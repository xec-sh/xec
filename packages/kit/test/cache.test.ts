/**
 * Tests for table caching utilities (Phase 4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Cache,
  TableCache,
  memoize,
  getGlobalTableCache,
  resetGlobalTableCache,
  type CacheStrategy,
} from '../src/components/table/cache.js';

describe('cache', () => {
  describe('Cache - LRU strategy', () => {
    let cache: Cache<string, number>;

    beforeEach(() => {
      cache = new Cache<string, number>({ maxSize: 3, strategy: 'lru' });
    });

    it('should store and retrieve values', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(2);
    });

    it('should evict least recently used item when full', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add new item, should evict 'b' (least recently used)
      cache.set('d', 4);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should update LRU order on access', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it most recently used
      cache.get('a');
      cache.get('a');

      // Add new item
      cache.set('d', 4);

      // 'b' should be evicted (least recently used)
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const deleted = cache.delete('a');

      expect(deleted).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.size).toBe(1);
    });

    it('should clear all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('Cache - LFU strategy', () => {
    let cache: Cache<string, number>;

    beforeEach(() => {
      cache = new Cache<string, number>({ maxSize: 3, strategy: 'lfu' });
    });

    it('should evict least frequently used item', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' and 'c' multiple times
      cache.get('a');
      cache.get('a');
      cache.get('c');

      // Add new item, should evict 'b' (least frequently used)
      cache.set('d', 4);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should track access count', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' many times
      for (let i = 0; i < 10; i++) {
        cache.get('a');
      }

      // Access 'b' once
      cache.get('b');

      // Add new items, 'c' and 'd' should be evicted (least frequently used)
      cache.set('d', 4);
      cache.set('e', 5);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(false);
    });
  });

  describe('Cache - FIFO strategy', () => {
    let cache: Cache<string, number>;

    beforeEach(() => {
      cache = new Cache<string, number>({ maxSize: 3, strategy: 'fifo' });
    });

    it('should evict first inserted item', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Add new item, should evict 'a' (first in)
      cache.set('d', 4);

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should maintain insertion order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' multiple times (shouldn't affect FIFO)
      cache.get('a');
      cache.get('a');

      // Add new items
      cache.set('d', 4);
      cache.set('e', 5);

      // 'a' and 'b' should be evicted (first inserted)
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });
  });

  describe('Cache - TTL support', () => {
    it('should expire entries after TTL', async () => {
      const cache = new Cache<string, number>({ maxSize: 10, ttl: 50 });

      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(cache.get('a')).toBeUndefined();
      expect(cache.has('a')).toBe(false);
    });

    it('should not expire entries before TTL', async () => {
      const cache = new Cache<string, number>({ maxSize: 10, ttl: 100 });

      cache.set('a', 1);

      // Wait less than TTL
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(cache.get('a')).toBe(1);
      expect(cache.has('a')).toBe(true);
    });
  });

  describe('Cache - getOrCompute', () => {
    it('should return cached value if exists', () => {
      const cache = new Cache<string, number>();
      const compute = vi.fn(() => 42);

      cache.set('key', 10);

      const result = cache.getOrCompute('key', compute);

      expect(result).toBe(10);
      expect(compute).not.toHaveBeenCalled();
    });

    it('should compute and cache value if not exists', () => {
      const cache = new Cache<string, number>();
      const compute = vi.fn(() => 42);

      const result = cache.getOrCompute('key', compute);

      expect(result).toBe(42);
      expect(compute).toHaveBeenCalledOnce();
      expect(cache.get('key')).toBe(42);
    });

    it('should compute only once for same key', () => {
      const cache = new Cache<string, number>();
      const compute = vi.fn(() => 42);

      cache.getOrCompute('key', compute);
      cache.getOrCompute('key', compute);
      cache.getOrCompute('key', compute);

      expect(compute).toHaveBeenCalledOnce();
    });
  });

  describe('Cache - getStats', () => {
    it('should return cache statistics', () => {
      const cache = new Cache<string, number>({ maxSize: 5, strategy: 'lru' });

      cache.set('a', 1);
      cache.set('b', 2);

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(stats.strategy).toBe('lru');
    });
  });

  describe('memoize', () => {
    it('should memoize function results', () => {
      let callCount = 0;
      const fn = (x: number, y: number) => {
        callCount++;
        return x + y;
      };

      const memoized = memoize(fn);

      expect(memoized(1, 2)).toBe(3);
      expect(memoized(1, 2)).toBe(3);
      expect(memoized(1, 2)).toBe(3);

      expect(callCount).toBe(1);
    });

    it('should handle different arguments', () => {
      let callCount = 0;
      const fn = (x: number, y: number) => {
        callCount++;
        return x + y;
      };

      const memoized = memoize(fn);

      expect(memoized(1, 2)).toBe(3);
      expect(memoized(2, 3)).toBe(5);
      expect(memoized(1, 2)).toBe(3);

      expect(callCount).toBe(2);
    });

    it('should respect cache config', async () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };

      const memoized = memoize(fn, { ttl: 50 });

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(2);
    });

    it('should handle complex arguments', () => {
      let callCount = 0;
      const fn = (obj: { x: number; y: number }) => {
        callCount++;
        return obj.x + obj.y;
      };

      const memoized = memoize(fn);

      expect(memoized({ x: 1, y: 2 })).toBe(3);
      expect(memoized({ x: 1, y: 2 })).toBe(3);

      expect(callCount).toBe(1);
    });
  });

  describe('TableCache', () => {
    let tableCache: TableCache;

    beforeEach(() => {
      tableCache = new TableCache();
    });

    describe('Column width caching', () => {
      it('should cache and retrieve column widths', () => {
        tableCache.cacheColumnWidth('name', 20);
        tableCache.cacheColumnWidth('age', 10);

        expect(tableCache.getColumnWidth('name')).toBe(20);
        expect(tableCache.getColumnWidth('age')).toBe(10);
      });

      it('should return undefined for non-cached columns', () => {
        expect(tableCache.getColumnWidth('nonexistent')).toBeUndefined();
      });

      it('should update cached width', () => {
        tableCache.cacheColumnWidth('name', 20);
        tableCache.cacheColumnWidth('name', 30);

        expect(tableCache.getColumnWidth('name')).toBe(30);
      });
    });

    describe('Formatted cell caching', () => {
      it('should cache and retrieve formatted cells', () => {
        tableCache.cacheFormattedCell(0, 'name', 'Alice');
        tableCache.cacheFormattedCell(1, 'name', 'Bob');

        expect(tableCache.getFormattedCell(0, 'name')).toBe('Alice');
        expect(tableCache.getFormattedCell(1, 'name')).toBe('Bob');
      });

      it('should return undefined for non-cached cells', () => {
        expect(tableCache.getFormattedCell(0, 'name')).toBeUndefined();
      });

      it('should handle large number of cells', () => {
        for (let row = 0; row < 100; row++) {
          for (let col = 0; col < 5; col++) {
            tableCache.cacheFormattedCell(row, `col${col}`, `value-${row}-col${col}`);
          }
        }

        expect(tableCache.getFormattedCell(50, 'col2')).toBe('value-50-col2');
      });
    });

    describe('Sort comparator caching', () => {
      it('should cache and retrieve sort comparators', () => {
        const comparator = (a: any, b: any) => a - b;

        tableCache.cacheSortComparator('age', comparator);

        const cached = tableCache.getSortComparator('age');
        expect(cached).toBe(comparator);
      });

      it('should return undefined for non-cached comparators', () => {
        expect(tableCache.getSortComparator('name')).toBeUndefined();
      });

      it('should cache different comparators', () => {
        const numComparator = (a: any, b: any) => a - b;
        const strComparator = (a: any, b: any) => a.localeCompare(b);

        tableCache.cacheSortComparator('age', numComparator);
        tableCache.cacheSortComparator('name', strComparator);

        expect(tableCache.getSortComparator('age')).toBe(numComparator);
        expect(tableCache.getSortComparator('name')).toBe(strComparator);
      });
    });

    describe('clear', () => {
      it('should clear all caches', () => {
        tableCache.cacheColumnWidth('name', 20);
        tableCache.cacheFormattedCell(0, 'name', 'Alice');
        tableCache.cacheSortComparator('age', (a, b) => a - b);

        tableCache.clear();

        expect(tableCache.getColumnWidth('name')).toBeUndefined();
        expect(tableCache.getFormattedCell(0, 'name')).toBeUndefined();
        expect(tableCache.getSortComparator('age')).toBeUndefined();
      });
    });

    describe('getStats', () => {
      it('should return statistics for all caches', () => {
        tableCache.cacheColumnWidth('name', 20);
        tableCache.cacheColumnWidth('age', 10);
        tableCache.cacheFormattedCell(0, 'name', 'Alice');

        const stats = tableCache.getStats();

        expect(stats.columnWidth.size).toBe(2);
        expect(stats.formattedCell.size).toBe(1);
        expect(stats.sortComparator.size).toBe(0);
        expect(stats.columnWidth.strategy).toBe('lru');
      });
    });
  });

  describe('Global table cache', () => {
    beforeEach(() => {
      resetGlobalTableCache();
    });

    it('should return singleton instance', () => {
      const cache1 = getGlobalTableCache();
      const cache2 = getGlobalTableCache();

      expect(cache1).toBe(cache2);
    });

    it('should persist data across calls', () => {
      const cache1 = getGlobalTableCache();
      cache1.cacheColumnWidth('name', 20);

      const cache2 = getGlobalTableCache();
      expect(cache2.getColumnWidth('name')).toBe(20);
    });

    it('should reset global cache', () => {
      const cache1 = getGlobalTableCache();
      cache1.cacheColumnWidth('name', 20);

      resetGlobalTableCache();

      const cache2 = getGlobalTableCache();
      expect(cache2.getColumnWidth('name')).toBeUndefined();
    });
  });
});
