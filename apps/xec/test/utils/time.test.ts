import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import {
  sleep,
  withTimeout,
  parseTimeout,
  parseInterval,
  formatDuration,
  getNextRunTime,
  retryWithBackoff,
  createTimeoutPromise
} from '../../src/utils/time.js';

describe('time utils', () => {
  describe('parseTimeout', () => {
    it('should parse milliseconds', () => {
      expect(parseTimeout('100ms')).toBe(100);
      expect(parseTimeout('500ms')).toBe(500);
      expect(parseTimeout('1500ms')).toBe(1500);
    });
    
    it('should parse seconds', () => {
      expect(parseTimeout('1s')).toBe(1000);
      expect(parseTimeout('30s')).toBe(30000);
      expect(parseTimeout('1.5s')).toBe(1500);
    });
    
    it('should parse minutes', () => {
      expect(parseTimeout('1m')).toBe(60000);
      expect(parseTimeout('5m')).toBe(300000);
      expect(parseTimeout('2.5m')).toBe(150000);
    });
    
    it('should parse hours', () => {
      expect(parseTimeout('1h')).toBe(3600000);
      expect(parseTimeout('2h')).toBe(7200000);
      expect(parseTimeout('0.5h')).toBe(1800000);
    });
    
    it('should default to seconds when no unit', () => {
      expect(parseTimeout('60')).toBe(60000);
      expect(parseTimeout('1.5')).toBe(1500);
    });
    
    it('should handle number input', () => {
      expect(parseTimeout(5000)).toBe(5000);
      expect(parseTimeout(0)).toBe(0);
    });
    
    it('should throw for invalid format', () => {
      expect(() => parseTimeout('invalid')).toThrow('Invalid timeout format');
      expect(() => parseTimeout('1x')).toThrow('Invalid timeout format');
      expect(() => parseTimeout('ms')).toThrow('Invalid timeout format');
    });
  });
  
  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });
    
    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(30000)).toBe('30s');
      expect(formatDuration(59000)).toBe('59s');
    });
    
    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m');
      expect(formatDuration(300000)).toBe('5m');
    });
    
    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(3660000)).toBe('1h 1m');
      expect(formatDuration(7200000)).toBe('2h');
      expect(formatDuration(7260000)).toBe('2h 1m');
    });
    
    it('should handle negative durations', () => {
      expect(formatDuration(-1000)).toBe('-1s');
      expect(formatDuration(-60000)).toBe('-1m');
    });
  });
  
  describe('parseInterval', () => {
    it('should parse named intervals', () => {
      const namedIntervals = [
        '@yearly', '@annually', '@monthly', '@weekly',
        '@daily', '@midnight', '@hourly'
      ];
      
      namedIntervals.forEach(interval => {
        const result = parseInterval(interval);
        expect(result.type).toBe('named');
        expect(typeof result.value).toBe('string');
      });
    });
    
    it('should parse cron expressions', () => {
      const cronExpressions = [
        '0 0 * * *',
        '*/5 * * * *',
        '0 9-17 * * MON-FRI',
        '0 0 1 * *'
      ];
      
      cronExpressions.forEach(expr => {
        const result = parseInterval(expr);
        expect(result.type).toBe('cron');
        expect(result.value).toBe(expr);
      });
    });
    
    it('should parse simple intervals', () => {
      const result1 = parseInterval('every 5m');
      expect(result1.type).toBe('interval');
      expect(result1.value).toBe(300000);
      
      const result2 = parseInterval('every 1h');
      expect(result2.type).toBe('interval');
      expect(result2.value).toBe(3600000);
      
      const result3 = parseInterval('EVERY 30s');
      expect(result3.type).toBe('interval');
      expect(result3.value).toBe(30000);
    });
    
    it('should throw for invalid interval format', () => {
      expect(() => parseInterval('invalid')).toThrow('Invalid interval format');
      expect(() => parseInterval('every')).toThrow('Invalid interval format');
    });
  });
  
  describe('getNextRunTime', () => {
    it('should calculate next run time for interval type', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      const interval = { type: 'interval' as const, value: 300000 }; // 5 minutes
      
      const next = getNextRunTime(interval, now);
      expect(next.getTime()).toBe(now.getTime() + 300000);
    });
    
    it('should use current time when from is not provided', () => {
      const interval = { type: 'interval' as const, value: 60000 };
      const before = Date.now();
      const next = getNextRunTime(interval);
      const after = Date.now();
      
      expect(next.getTime()).toBeGreaterThanOrEqual(before + 60000);
      expect(next.getTime()).toBeLessThanOrEqual(after + 60000);
    });
    
    it('should throw for cron expressions (not implemented)', () => {
      const interval = { type: 'cron' as const, value: '0 0 * * *' };
      expect(() => getNextRunTime(interval)).toThrow('Cron expression parsing not implemented');
    });
  });
  
  describe('sleep', () => {
    let originalSetTimeout: typeof setTimeout;
    let setTimeoutSpy: jest.SpiedFunction<typeof setTimeout>;
    
    beforeEach(() => {
      originalSetTimeout = global.setTimeout;
      jest.useFakeTimers();
      setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    });
    
    afterEach(() => {
      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
      global.setTimeout = originalSetTimeout;
    });
    
    it('should sleep for specified duration', async () => {
      const promise = sleep('100ms');
      
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      
      jest.runAllTimers();
      await promise;
    });
    
    it('should accept number input', async () => {
      const promise = sleep(500);
      
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
      
      jest.runAllTimers();
      await promise;
    });
  });
  
  describe('createTimeoutPromise', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should reject after timeout', async () => {
      const promise = createTimeoutPromise('1s');
      
      jest.runAllTimers();
      
      await expect(promise).rejects.toThrow('Operation timed out');
    });
    
    it('should use custom error message', async () => {
      const promise = createTimeoutPromise(500, 'Custom timeout');
      
      jest.runAllTimers();
      
      await expect(promise).rejects.toThrow('Custom timeout');
    });
  });
  
  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should resolve if function completes before timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const promise = withTimeout(fn, '1s');
      
      // Function completes immediately
      await Promise.resolve();
      
      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });
    
    it('should reject if function takes too long', async () => {
      const fn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('too late'), 2000))
      );
      
      const promise = withTimeout(fn, '1s', 'Function timed out');
      
      jest.advanceTimersByTime(1000);
      
      await expect(promise).rejects.toThrow('Function timed out');
    });
    
    it('should propagate function errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Function error'));
      
      await expect(withTimeout(fn, '1s')).rejects.toThrow('Function error');
    });
  });
  
  describe('retryWithBackoff', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
    
    it('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      const promise = retryWithBackoff(fn, { maxRetries: 3, initialDelay: 100 });
      
      // Process all timers and promises
      await jest.runAllTimersAsync();
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    }, 10000);
    
    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      const promise = retryWithBackoff(fn, { maxRetries: 2, initialDelay: 10 });
      
      // Use real timers for this test to avoid issues with async timer handling
      jest.useRealTimers();
      
      await expect(promise).rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
      
      // Restore fake timers
      jest.useFakeTimers();
    }, 10000);
    
    it('should respect maxDelay', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));
      const delays: number[] = [];
      
      // Use real timers for this test
      jest.useRealTimers();
      
      // Mock setTimeout to capture delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback, delay) => {
        if (delay && delay > 0) delays.push(delay);
        return originalSetTimeout(callback, delay);
      }) as any;
      
      const promise = retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: '100ms',
        maxDelay: '250ms',
        factor: 2
      });
      
      await expect(promise).rejects.toThrow();
      
      // Check delays: 100ms, 200ms, 250ms (capped at maxDelay)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(250);
      
      // Restore original setTimeout and fake timers
      global.setTimeout = originalSetTimeout;
      jest.useFakeTimers();
    }, 10000);
    
    it('should apply timeout to each attempt', async () => {
      // Mock a function that never resolves
      const fn = jest.fn().mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );
      
      // Use real timers for this test
      jest.useRealTimers();
      
      const promise = retryWithBackoff(fn, {
        maxRetries: 1,
        timeout: '10ms',  // Very short timeout
        initialDelay: '5ms'  // Very short delay
      });
      
      await expect(promise).rejects.toThrow('Operation timed out');
      expect(fn).toHaveBeenCalledTimes(2); // Initial attempt + 1 retry
      
      // Restore fake timers
      jest.useFakeTimers();
    }, 1000); // 1 second should be plenty
    
    it('should use default options', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      const promise = retryWithBackoff(fn);
      
      // First attempt fails, wait for default delay (1s)
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });
});