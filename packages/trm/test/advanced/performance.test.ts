import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createPerformanceMonitor } from '../../src/advanced/performance';

describe('Performance Monitoring Module', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createPerformanceMonitor', () => {
    it('should create performance monitor', () => {
      const monitor = createPerformanceMonitor();
      
      expect(monitor).toBeDefined();
      expect(monitor.metrics).toBeDefined();
      expect(monitor.startMeasure).toBeTypeOf('function');
    });

    it('should measure synchronous operations', () => {
      vi.useRealTimers(); // Use real timers for performance measurement
      
      const monitor = createPerformanceMonitor();
      
      const result = monitor.measure('test-operation', () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      });
      
      expect(result).toBe(499500);
      
      const metric = monitor.metrics.get('test-operation');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(1);
      expect(metric?.total).toBeGreaterThanOrEqual(0); // Allow 0 for very fast operations
      expect(metric?.min).toBeGreaterThanOrEqual(0);
      expect(metric?.max).toBeGreaterThanOrEqual(0);
      expect(metric?.average).toBeGreaterThanOrEqual(0);
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('should measure asynchronous operations', async () => {
      vi.useRealTimers(); // Use real timers for async test
      
      const monitor = createPerformanceMonitor();
      
      const result = await monitor.measureAsync('async-operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });
      
      expect(result).toBe('done');
      
      const metric = monitor.metrics.get('async-operation');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(1);
      expect(metric?.total).toBeGreaterThanOrEqual(0);
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('should support manual timing', () => {
      const monitor = createPerformanceMonitor();
      
      const stop = monitor.startMeasure('manual-timing');
      
      // Simulate some work
      vi.advanceTimersByTime(150);
      
      stop();
      
      const metric = monitor.metrics.get('manual-timing');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(1);
      expect(metric?.total).toBeGreaterThanOrEqual(150);
    });

    it('should aggregate multiple measurements', () => {
      const monitor = createPerformanceMonitor();
      
      monitor.measure('operation', () => 1);
      vi.advanceTimersByTime(10);
      monitor.measure('operation', () => 2);
      vi.advanceTimersByTime(20);
      monitor.measure('operation', () => 3);
      
      const metric = monitor.metrics.get('operation');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(3);
      expect(metric?.samples.length).toBe(3);
    });

    it('should calculate statistics correctly', () => {
      const monitor = createPerformanceMonitor();
      
      // Create predictable measurements
      const times = [10, 20, 30, 40, 50];
      times.forEach((time, i) => {
        const stop = monitor.startMeasure('stats-test');
        vi.advanceTimersByTime(time);
        stop();
      });
      
      const metric = monitor.metrics.get('stats-test');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(5);
      expect(metric?.min).toBe(10);
      expect(metric?.max).toBe(50);
      expect(metric?.average).toBe(30);
      
      // Check aggregates
      const average = monitor.metrics.average.get('stats-test');
      expect(average).toBe(30);
      
      const median = monitor.metrics.median.get('stats-test');
      expect(median).toBe(30);
    });

    it('should calculate percentiles', () => {
      const monitor = createPerformanceMonitor();
      
      // Create 100 measurements
      for (let i = 1; i <= 100; i++) {
        const stop = monitor.startMeasure('percentile-test');
        vi.advanceTimersByTime(i);
        stop();
      }
      
      const p95 = monitor.metrics.p95.get('percentile-test');
      expect(p95).toBe(95);
      
      const p99 = monitor.metrics.p99.get('percentile-test');
      expect(p99).toBe(99);
    });

    it('should support profiling', () => {
      const monitor = createPerformanceMonitor();
      
      const profiler = monitor.startProfiling();
      
      profiler.mark('start');
      vi.advanceTimersByTime(100);
      profiler.mark('middle');
      vi.advanceTimersByTime(50);
      profiler.mark('end');
      
      profiler.measure('first-half', 'start', 'middle');
      profiler.measure('second-half', 'middle', 'end');
      profiler.measure('total', 'start', 'end');
      
      const entries = profiler.getEntries();
      expect(entries.length).toBeGreaterThan(0);
      
      const profileData = monitor.stopProfiling();
      expect(profileData.entries).toEqual(entries);
      expect(profileData.summary.size).toBeGreaterThan(0);
      expect(profileData.timestamp).toBeDefined();
    });

    it('should monitor memory usage', () => {
      const monitor = createPerformanceMonitor();
      
      const memory = monitor.memory;
      expect(memory).toBeDefined();
      expect(memory.used).toBeTypeOf('number');
      expect(memory.total).toBeTypeOf('number');
      expect(memory.external).toBeTypeOf('number');
      expect(memory.arrayBuffers).toBeTypeOf('number');
    });

    it('should monitor CPU usage', () => {
      const monitor = createPerformanceMonitor();
      
      const cpu = monitor.cpu;
      expect(cpu).toBeDefined();
      expect(cpu.usage).toBeTypeOf('number');
      expect(cpu.user).toBeTypeOf('number');
      expect(cpu.system).toBeTypeOf('number');
    });

    it('should track frame timing', () => {
      const monitor = createPerformanceMonitor();
      
      expect(monitor.frameTime).toBeTypeOf('number');
      expect(monitor.fps).toBeTypeOf('number');
      expect(monitor.fps).toBeLessThanOrEqual(60);
    });

    it('should support threshold alerts', () => {
      const monitor = createPerformanceMonitor();
      const alerts: any[] = [];
      
      monitor.onThresholdExceeded((metric, value, threshold) => {
        alerts.push({ metric, value, threshold });
      });
      
      monitor.setThreshold('slow-operation', 100);
      
      // Measure something that exceeds threshold
      const stop = monitor.startMeasure('slow-operation');
      vi.advanceTimersByTime(150);
      stop();
      
      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('slow-operation');
      expect(alerts[0].value).toBe(150);
      expect(alerts[0].threshold).toBe(100);
    });

    it('should clear metrics', () => {
      const monitor = createPerformanceMonitor();
      
      monitor.measure('test', () => 1);
      expect(monitor.metrics.get('test')).toBeDefined();
      
      monitor.metrics.clear();
      expect(monitor.metrics.get('test')).toBeUndefined();
      expect(monitor.metrics.getAll().size).toBe(0);
    });

    it('should get all metrics', () => {
      const monitor = createPerformanceMonitor();
      
      monitor.measure('op1', () => 1);
      monitor.measure('op2', () => 2);
      monitor.measure('op3', () => 3);
      
      const all = monitor.metrics.getAll();
      expect(all.size).toBe(3);
      expect(all.has('op1')).toBe(true);
      expect(all.has('op2')).toBe(true);
      expect(all.has('op3')).toBe(true);
    });

    it('should handle errors in measured functions', () => {
      const monitor = createPerformanceMonitor();
      
      expect(() => {
        monitor.measure('error-op', () => {
          throw new Error('Test error');
        });
      }).toThrow('Test error');
      
      // Should still record the metric
      const metric = monitor.metrics.get('error-op');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(1);
    });

    it('should handle async errors', async () => {
      const monitor = createPerformanceMonitor();
      
      await expect(
        monitor.measureAsync('async-error', async () => {
          throw new Error('Async error');
        })
      ).rejects.toThrow('Async error');
      
      // Should still record the metric
      const metric = monitor.metrics.get('async-error');
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(1);
    });
  });
});