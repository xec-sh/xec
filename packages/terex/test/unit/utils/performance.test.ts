/**
 * Comprehensive tests for performance optimization utilities
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import {
  Lazy,
  profiler,
  ObjectPool,
  BatchManager,
  batchManager,
  FrameLimiter,
  memoizeAdvanced,
  ResourceManager,
  PerformanceProfiler
} from '../../../src/utils/index.js';

// ============================================================================
// Test Suite
// ============================================================================

describe('Performance Utilities', () => {
  // ========================================================================
  // BatchManager
  // ========================================================================

  describe('BatchManager', () => {
    let batchMgr: BatchManager;

    beforeEach(() => {
      batchMgr = new BatchManager();
    });

    afterEach(() => {
      batchMgr.clearAll();
    });

    it('should batch functions with delay', async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();

      batchMgr.batch('test', fn1, 10);
      batchMgr.batch('test', fn2, 10);
      batchMgr.batch('test', fn3, 10);

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
      expect(fn3).not.toHaveBeenCalled();

      await new Promise(resolve => setTimeout(resolve, 15));

      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
      expect(fn3).toHaveBeenCalled();
    });

    it('should process batch immediately', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      batchMgr.batch('immediate', fn1, 100);
      batchMgr.batch('immediate', fn2, 100);

      batchMgr.processBatch('immediate');

      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });

    it('should process all batches', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();

      batchMgr.batch('batch1', fn1, 100);
      batchMgr.batch('batch2', fn2, 100);
      batchMgr.batch('batch2', fn3, 100);

      batchMgr.processAll();

      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
      expect(fn3).toHaveBeenCalled();
    });

    it('should clear specific batch', () => {
      const fn = vi.fn();
      batchMgr.batch('clear-test', fn, 100);

      expect(batchMgr.getPendingBatchCount()).toBe(1);

      batchMgr.clearBatch('clear-test');
      expect(batchMgr.getPendingBatchCount()).toBe(0);

      // Function should not be called after clearing
      batchMgr.processAll();
      expect(fn).not.toHaveBeenCalled();
    });

    it('should clear all batches', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      batchMgr.batch('batch1', fn1, 100);
      batchMgr.batch('batch2', fn2, 100);

      expect(batchMgr.getPendingBatchCount()).toBe(2);

      batchMgr.clearAll();
      expect(batchMgr.getPendingBatchCount()).toBe(0);
    });

    it('should handle errors in batched functions', () => {
      const goodFn = vi.fn();
      const errorFn = vi.fn(() => { throw new Error('Test error'); });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      batchMgr.batch('error-test', goodFn, 0);
      batchMgr.batch('error-test', errorFn, 0);

      batchMgr.processBatch('error-test');

      expect(goodFn).toHaveBeenCalled();
      expect(errorFn).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should track processing state', () => {
      expect(batchMgr.isProcessingBatch()).toBe(false);

      const longRunningFn = vi.fn(() => {
        expect(batchMgr.isProcessingBatch()).toBe(true);
      });

      batchMgr.batch('processing', longRunningFn, 0);
      batchMgr.processBatch('processing');

      expect(batchMgr.isProcessingBatch()).toBe(false);
    });
  });

  // ========================================================================
  // Advanced Memoization
  // ========================================================================

  describe('memoizeAdvanced', () => {
    it('should memoize function results', () => {
      const expensiveFn = vi.fn((x: number) => x * 2);
      const memoized = memoizeAdvanced(expensiveFn);

      const result1 = memoized(5);
      const result2 = memoized(5);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(expensiveFn).toHaveBeenCalledTimes(1);
    });

    it('should respect TTL', async () => {
      const fn = vi.fn((x: number) => x * 2);
      const memoized = memoizeAdvanced(fn, { ttl: 50 });

      memoized(5);
      await new Promise(resolve => setTimeout(resolve, 60));
      memoized(5);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect max cache size', () => {
      const fn = vi.fn((x: number) => x * 2);
      const memoized = memoizeAdvanced(fn, { maxSize: 2 });

      memoized(1);
      memoized(2);
      memoized(3);

      // Should evict oldest entry
      expect(memoized.cache.size).toBe(2);
    });

    it('should use custom key generator', () => {
      const fn = vi.fn((obj: { id: number; value: string }) => obj.id * 2);
      const memoized = memoizeAdvanced(fn, { getKey: (obj) => String(obj.id) });

      memoized({ id: 1, value: 'a' });
      memoized({ id: 1, value: 'b' }); // Different value, same ID

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow cache clearing', () => {
      const fn = vi.fn((x: number) => x * 2);
      const memoized = memoizeAdvanced(fn);

      memoized(5);
      memoized.clear();
      memoized(5);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // ========================================================================
  // ResourceManager
  // ========================================================================

  describe('ResourceManager', () => {
    let resourceMgr: ResourceManager;

    beforeEach(() => {
      resourceMgr = new ResourceManager();
    });

    afterEach(async () => {
      await resourceMgr.dispose();
    });

    it('should register and manage resources', () => {
      const resource = { data: 'test' };
      const cleanup = vi.fn();

      const registered = resourceMgr.register('test', resource, cleanup);

      expect(registered).toBe(resource);
      expect(resourceMgr.has('test')).toBe(true);
      expect(resourceMgr.get('test')).toBe(resource);
    });

    it('should cleanup resources on unregister', async () => {
      const cleanup = vi.fn();
      resourceMgr.register('test', {}, cleanup);

      await resourceMgr.unregister('test');

      expect(cleanup).toHaveBeenCalled();
      expect(resourceMgr.has('test')).toBe(false);
    });

    it('should cleanup existing resource when registering with same ID', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      resourceMgr.register('same-id', {}, cleanup1);
      resourceMgr.register('same-id', {}, cleanup2);

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).not.toHaveBeenCalled();
    });

    it('should cleanup old resources', async () => {
      const cleanup = vi.fn();
      resourceMgr.register('old', {}, cleanup);

      // Wait a bit then cleanup old resources
      await new Promise(resolve => setTimeout(resolve, 10));
      await resourceMgr.cleanupOld(5);

      expect(cleanup).toHaveBeenCalled();
    });

    it('should dispose all resources', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      resourceMgr.register('res1', {}, cleanup1);
      resourceMgr.register('res2', {}, cleanup2);

      await resourceMgr.dispose();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
      expect(resourceMgr.size()).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      const errorCleanup = vi.fn(() => { throw new Error('Cleanup failed'); });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      resourceMgr.register('error-test', {}, errorCleanup);
      await resourceMgr.unregister('error-test');

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  // ========================================================================
  // PerformanceProfiler
  // ========================================================================

  describe('PerformanceProfiler', () => {
    let prof: PerformanceProfiler;

    beforeEach(() => {
      prof = new PerformanceProfiler();
    });

    afterEach(() => {
      prof.clearAll();
    });

    it('should measure function performance', async () => {
      const testFn = () => {
        // Simulate some work
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait
        }
      };

      await prof.measure('test', testFn);
      const stats = prof.get('test');

      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
      expect(stats!.totalTime).toBeGreaterThan(0);
      expect(stats!.avgTime).toBeGreaterThan(0);
    });

    it('should measure async functions', async () => {
      const asyncFn = () => new Promise(resolve => setTimeout(resolve, 10));

      await prof.measure('async-test', asyncFn);
      const stats = prof.get('async-test');

      expect(stats).toBeDefined();
      expect(stats!.totalTime).toBeGreaterThan(5);
    });

    it('should track multiple measurements', async () => {
      const fastFn = () => 1 + 1;

      await prof.measure('multi', fastFn);
      await prof.measure('multi', fastFn);
      await prof.measure('multi', fastFn);

      const stats = prof.get('multi');
      expect(stats!.count).toBe(3);
      expect(stats!.avgTime).toBe(stats!.totalTime / 3);
    });

    it('should handle measurement errors', async () => {
      const errorFn = () => { throw new Error('Test error'); };

      await expect(prof.measure('error-test', errorFn)).rejects.toThrow('Test error');

      const stats = prof.get('error-test');
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });

    it('should provide start/end measurement API', () => {
      const measurement = prof.start('manual');
      
      // Simulate work
      const start = Date.now();
      while (Date.now() - start < 5) {
        // Busy wait
      }
      
      measurement.end();

      const stats = prof.get('manual');
      expect(stats).toBeDefined();
      expect(stats!.totalTime).toBeGreaterThan(0);
    });

    it('should generate performance report', async () => {
      await prof.measure('test1', () => 1 + 1);
      await prof.measure('test2', () => 2 + 2);

      const report = prof.getReport();

      expect(report).toContain('Performance Report:');
      expect(report).toContain('test1:');
      expect(report).toContain('test2:');
      expect(report).toContain('Count:');
      expect(report).toContain('Avg:');
    });

    it('should clear specific measurements', async () => {
      await prof.measure('keep', () => 1);
      await prof.measure('clear', () => 2);

      prof.clear('clear');

      expect(prof.get('keep')).toBeDefined();
      expect(prof.get('clear')).toBeUndefined();
    });

    it('should track min and max times', async () => {
      // Simulate variable execution times
      await prof.measure('variable', () => {
        const delay = Math.random() * 5;
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Variable delay
        }
      });

      await prof.measure('variable', () => {
        const delay = Math.random() * 5;
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Variable delay
        }
      });

      const stats = prof.get('variable');
      expect(stats!.minTime).toBeGreaterThanOrEqual(0);
      expect(stats!.maxTime).toBeGreaterThanOrEqual(stats!.minTime);
    });
  });

  // ========================================================================
  // FrameLimiter
  // ========================================================================

  describe('FrameLimiter', () => {
    let limiter: FrameLimiter;

    beforeEach(() => {
      limiter = new FrameLimiter(10); // 10 FPS for faster testing
    });

    it('should limit frame rate', (done) => {
      let frameCount = 0;
      const startTime = Date.now();

      const frame = () => {
        frameCount++;
        if (frameCount < 3) {
          limiter.requestFrame(frame);
        } else {
          const elapsed = Date.now() - startTime;
          // Should take at least 200ms for 3 frames at 10 FPS
          expect(elapsed).toBeGreaterThan(150);
          done();
        }
      };

      limiter.requestFrame(frame);
    });

    it('should allow changing FPS', () => {
      limiter.setFPS(60);
      expect(limiter.getCurrentFPS()).toBeCloseTo(60, 10);

      limiter.setFPS(30);
      expect(limiter.getCurrentFPS()).toBeCloseTo(30, 10);
    });
  });

  // ========================================================================
  // ObjectPool
  // ========================================================================

  describe('ObjectPool', () => {
    it('should create and reuse objects', () => {
      const createFn = vi.fn(() => ({ value: 0 }));
      const resetFn = vi.fn((obj) => { obj.value = 0; });
      
      const pool = new ObjectPool(createFn, resetFn, 10);

      const obj1 = pool.get();
      obj1.value = 5;
      
      pool.release(obj1);
      
      const obj2 = pool.get();
      
      expect(obj2).toBe(obj1);
      expect(obj2.value).toBe(0); // Should be reset
      expect(resetFn).toHaveBeenCalledWith(obj1);
    });

    it('should create new objects when pool is empty', () => {
      const createFn = vi.fn(() => ({ id: Math.random() }));
      const pool = new ObjectPool(createFn);

      const obj1 = pool.get();
      const obj2 = pool.get();

      expect(obj1).not.toBe(obj2);
      expect(createFn).toHaveBeenCalledTimes(2);
    });

    it('should respect max pool size', () => {
      const pool = new ObjectPool(() => ({}), undefined, 2);

      pool.preFill(3);
      expect(pool.size()).toBe(2);

      const obj1 = pool.get();
      const obj2 = pool.get();
      const obj3 = {};

      pool.release(obj1);
      pool.release(obj2);
      pool.release(obj3);

      expect(pool.size()).toBe(2);
    });

    it('should pre-fill pool', () => {
      const pool = new ObjectPool(() => ({}));
      
      pool.preFill(5);
      expect(pool.size()).toBe(5);
    });

    it('should clear pool', () => {
      const pool = new ObjectPool(() => ({}));
      
      pool.preFill(3);
      pool.clear();
      expect(pool.size()).toBe(0);
    });
  });

  // ========================================================================
  // Lazy
  // ========================================================================

  describe('Lazy', () => {
    it('should compute value only once', () => {
      const computeFn = vi.fn(() => 'computed value');
      const lazy = new Lazy(computeFn);

      expect(lazy.isComputed()).toBe(false);

      const value1 = lazy.get();
      const value2 = lazy.get();

      expect(value1).toBe('computed value');
      expect(value2).toBe('computed value');
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(lazy.isComputed()).toBe(true);
    });

    it('should reset lazy value', () => {
      const computeFn = vi.fn(() => 'computed');
      const lazy = new Lazy(computeFn);

      lazy.get();
      lazy.reset();
      
      expect(lazy.isComputed()).toBe(false);
      
      lazy.get();
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('should allow setting value directly', () => {
      const computeFn = vi.fn(() => 'computed');
      const lazy = new Lazy(computeFn);

      lazy.set('direct value');
      
      expect(lazy.get()).toBe('direct value');
      expect(lazy.isComputed()).toBe(true);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('should handle complex computed values', () => {
      const data = [1, 2, 3, 4, 5];
      const lazy = new Lazy(() => data.reduce((sum, n) => sum + n, 0));

      expect(lazy.get()).toBe(15);
    });
  });

  // ========================================================================
  // Global Instances
  // ========================================================================

  describe('Global Instances', () => {
    it('should provide global batch manager', () => {
      expect(batchManager).toBeInstanceOf(BatchManager);
      
      const fn = vi.fn();
      batchManager.batch('global-test', fn, 0);
      batchManager.processBatch('global-test');
      
      expect(fn).toHaveBeenCalled();
    });

    it('should provide global profiler', async () => {
      expect(profiler).toBeInstanceOf(PerformanceProfiler);
      
      await profiler.measure('global-test', () => 1 + 1);
      const stats = profiler.get('global-test');
      
      expect(stats).toBeDefined();
    });
  });

  // ========================================================================
  // Integration Tests
  // ========================================================================

  describe('Integration', () => {
    it('should work together for performance optimization', async () => {
      // Create a resource manager
      const resourceMgr = new ResourceManager();
      
      // Create a memoized expensive function
      const expensiveFn = memoizeAdvanced((x: number) => {
        // Simulate expensive computation
        let result = 0;
        for (let i = 0; i < x * 1000; i++) {
          result += i;
        }
        return result;
      }, { maxSize: 10 });

      // Register the memoized function as a resource
      resourceMgr.register('expensiveFn', expensiveFn, () => {
        expensiveFn.clear();
      });

      // Batch some operations
      const results: number[] = [];
      batchManager.batch('calculations', () => {
        results.push(expensiveFn(5));
      }, 0);
      
      batchManager.batch('calculations', () => {
        results.push(expensiveFn(5)); // Should hit cache
      }, 0);

      // Process batch
      batchManager.processBatch('calculations');

      expect(results).toEqual([expect.any(Number), expect.any(Number)]);
      expect(results[0]).toBe(results[1]); // Same cached result

      // Cleanup
      await resourceMgr.dispose();
    });

    it('should handle complex performance scenarios', async () => {
      const prof = new PerformanceProfiler();
      const pool = new ObjectPool(() => ({ data: [] as number[] }), (obj) => { obj.data = []; });

      await prof.measure('pooled-operation', () => {
        const obj = pool.get();
        
        // Simulate work with pooled object
        for (let i = 0; i < 100; i++) {
          obj.data.push(i);
        }
        
        pool.release(obj);
      });

      const stats = prof.get('pooled-operation');
      expect(stats!.count).toBe(1);
      expect(stats!.totalTime).toBeGreaterThan(0);
    });
  });
});