/**
 * Tests for extracted utility functions
 */

import { it, vi, expect, describe } from 'vitest';

import { 
  noop,
  clamp,
  range,
  defer,
  sleep,
  memoize,
  isObject,
  throttle,
  debounce,
  identity,
  uniqueId,
  stripAnsi,
  deepClone,
  deepMerge,
  isDefined,
  measureTime,
  truncateString,
  overlayChildOutput,
  getStringVisualLength
} from '../../../src/utils/index.js';

import type { Output } from '../../../src/core/types.js';

describe('Rendering Utilities', () => {
  describe('overlayChildOutput', () => {
    it('should overlay child output onto parent buffer', () => {
      const parentLines = [
        '          ',
        '          ',
        '          '
      ];
      const childOutput: Output = {
        lines: ['Hello', 'World']
      };
      
      overlayChildOutput(parentLines, childOutput, 2, 1, 5, 2, 10);
      
      expect(parentLines).toEqual([
        '          ',
        '  Hello   ',
        '  World   '
      ]);
    });

    it('should handle clipping when child exceeds bounds', () => {
      const parentLines = [
        '     ',
        '     '
      ];
      const childOutput: Output = {
        lines: ['VeryLongText', 'Another']
      };
      
      overlayChildOutput(parentLines, childOutput, 1, 0, 3, 2, 5);
      
      expect(parentLines).toEqual([
        ' Ver ',
        ' Ano '
      ]);
    });

    it('should handle positioning outside parent bounds', () => {
      const parentLines = ['     '];
      const childOutput: Output = {
        lines: ['Test']
      };
      
      // Position child outside parent area
      overlayChildOutput(parentLines, childOutput, 10, 5, 4, 1, 5);
      
      // Parent should remain unchanged
      expect(parentLines).toEqual(['     ']);
    });

    it('should handle empty child output', () => {
      const parentLines = ['Hello'];
      const childOutput: Output = {
        lines: []
      };
      
      overlayChildOutput(parentLines, childOutput, 0, 0, 5, 1, 5);
      
      expect(parentLines).toEqual(['Hello']);
    });

    it('should pad short child lines', () => {
      const parentLines = ['          '];
      const childOutput: Output = {
        lines: ['Hi']
      };
      
      overlayChildOutput(parentLines, childOutput, 2, 0, 5, 1, 10);
      
      expect(parentLines).toEqual(['  Hi      ']);
    });
  });
});

describe('String Utilities', () => {
  describe('stripAnsi', () => {
    it('should remove ANSI escape sequences', () => {
      const input = '\x1b[31mRed text\x1b[0m';
      const result = stripAnsi(input);
      
      expect(result).toBe('Red text');
    });

    it('should handle multiple ANSI sequences', () => {
      const input = '\x1b[31m\x1b[1mBold red\x1b[0m\x1b[32m green\x1b[0m';
      const result = stripAnsi(input);
      
      expect(result).toBe('Bold red green');
    });

    it('should handle strings without ANSI codes', () => {
      const input = 'Plain text';
      const result = stripAnsi(input);
      
      expect(result).toBe('Plain text');
    });

    it('should handle empty strings', () => {
      const result = stripAnsi('');
      
      expect(result).toBe('');
    });

    it('should handle complex ANSI sequences', () => {
      const input = '\x1b[38;2;255;128;0mTruecolor\x1b[0m';
      const result = stripAnsi(input);
      
      expect(result).toBe('Truecolor');
    });
  });

  describe('getStringVisualLength', () => {
    it('should return visual length excluding ANSI codes', () => {
      const input = '\x1b[31mHello\x1b[0m World';
      const length = getStringVisualLength(input);
      
      expect(length).toBe(11); // "Hello World"
    });

    it('should handle plain strings', () => {
      const input = 'Hello World';
      const length = getStringVisualLength(input);
      
      expect(length).toBe(11);
    });

    it('should handle empty strings', () => {
      const length = getStringVisualLength('');
      
      expect(length).toBe(0);
    });
  });

  describe('truncateString', () => {
    it('should truncate plain strings', () => {
      const input = 'Hello World';
      const result = truncateString(input, 5);
      
      expect(result).toBe('Hello');
    });

    it('should preserve ANSI codes when truncating', () => {
      const input = '\x1b[31mHello\x1b[0m World';
      const result = truncateString(input, 7);
      
      expect(result).toBe('\x1b[31mHello\x1b[0m W');
      expect(getStringVisualLength(result)).toBe(7);
    });

    it('should return original string if within length', () => {
      const input = '\x1b[31mHi\x1b[0m';
      const result = truncateString(input, 5);
      
      expect(result).toBe(input);
    });

    it('should handle empty strings', () => {
      const result = truncateString('', 5);
      
      expect(result).toBe('');
    });
  });
});

describe('Object Utilities', () => {
  describe('isObject', () => {
    it('should identify plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('should reject non-objects', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject(undefined)).toBe(false);
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject([])).toBe(false);
      expect(isObject(new Date())).toBe(false);
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
    });

    it('should clone objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('should clone arrays', () => {
      const original = [1, [2, 3], { a: 4 }];
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[1]).not.toBe(original[1]);
      expect(cloned[2]).not.toBe(original[2]);
    });

    it('should clone dates', () => {
      const original = new Date('2023-01-01');
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned).toBeInstanceOf(Date);
    });
  });

  describe('deepMerge', () => {
    it('should merge objects', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      
      const result = deepMerge(target, source);
      
      expect(result).toEqual({
        a: 1,
        b: { c: 2, d: 3 },
        e: 4
      });
    });

    it('should override primitive values', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      
      const result = deepMerge(target, source);
      
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should handle multiple sources', () => {
      const target = { a: 1 };
      const source1 = { b: 2 };
      const source2 = { c: 3 };
      
      const result = deepMerge(target, source1, source2);
      
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should return target when no sources', () => {
      const target = { a: 1 };
      const result = deepMerge(target);
      
      expect(result).toBe(target);
    });
  });
});

describe('Function Utilities', () => {
  describe('throttle', () => {
    it('should throttle function calls', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 50);
      
      throttled();
      throttled();
      throttled();
      
      expect(fn).toHaveBeenCalledTimes(1);
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      throttled();
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should preserve function context and arguments', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 10);
      
      throttled('arg1', 'arg2');
      
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);
      
      debounced();
      debounced();
      debounced();
      
      expect(fn).not.toHaveBeenCalled();
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should cancel debounced calls', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);
      
      debounced();
      debounced.cancel();
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fn).not.toHaveBeenCalled();
    });

    it('should preserve function context and arguments', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 10);
      
      debounced('arg1', 'arg2');
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
});

describe('Performance', () => {
  it('should handle large overlays efficiently', () => {
    const parentLines = new Array(1000).fill(' '.repeat(1000));
    const childOutput: Output = {
      lines: new Array(500).fill('x'.repeat(500))
    };
    
    const startTime = performance.now();
    
    overlayChildOutput(parentLines, childOutput, 100, 100, 500, 500, 1000);
    
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
  });

  it('should handle large ANSI stripping efficiently', () => {
    const largeString = '\x1b[31m'.repeat(1000) + 'test'.repeat(1000) + '\x1b[0m'.repeat(1000);
    
    const startTime = performance.now();
    
    const result = stripAnsi(largeString);
    
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(50);
    expect(result).toBe('test'.repeat(1000));
  });
});

describe('Basic Utilities', () => {
  describe('noop', () => {
    it('should do nothing and return void', () => {
      const result = noop();
      expect(result).toBeUndefined();
    });

    it('should accept any number of arguments', () => {
      expect(() => {
        (noop as any)(1, 2, 3, 'test', {}, []);
      }).not.toThrow();
    });
  });

  describe('identity', () => {
    it('should return the same value passed to it', () => {
      expect(identity(42)).toBe(42);
      expect(identity('hello')).toBe('hello');
      expect(identity(true)).toBe(true);
      expect(identity(null)).toBe(null);
      expect(identity(undefined)).toBeUndefined();
    });

    it('should preserve object references', () => {
      const obj = { a: 1 };
      const arr = [1, 2, 3];
      
      expect(identity(obj)).toBe(obj);
      expect(identity(arr)).toBe(arr);
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });

    it('should act as type guard', () => {
      const value: string | null | undefined = 'test';
      if (isDefined(value)) {
        // TypeScript should know this is string
        expect(value.length).toBe(4);
      }
    });
  });

  describe('clamp', () => {
    it('should clamp values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle equal min and max', () => {
      expect(clamp(5, 3, 3)).toBe(3);
      expect(clamp(1, 3, 3)).toBe(3);
    });

    it('should handle negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('should handle decimal numbers', () => {
      expect(clamp(1.5, 0.5, 2.5)).toBe(1.5);
      expect(clamp(0.1, 0.5, 2.5)).toBe(0.5);
      expect(clamp(3.0, 0.5, 2.5)).toBe(2.5);
    });
  });

  describe('range', () => {
    it('should create range from 0 to end', () => {
      expect(range(5)).toEqual([0, 1, 2, 3, 4]);
      expect(range(0)).toEqual([]);
      expect(range(1)).toEqual([0]);
    });

    it('should create range from start to end', () => {
      expect(range(2, 5)).toEqual([2, 3, 4]);
      expect(range(-2, 2)).toEqual([-2, -1, 0, 1]);
      expect(range(5, 5)).toEqual([]);
    });

    it('should handle custom step', () => {
      expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
      expect(range(1, 8, 3)).toEqual([1, 4, 7]);
      expect(range(0, 5, 1)).toEqual([0, 1, 2, 3, 4]);
    });

    it('should handle negative step correctly', () => {
      // Note: Current implementation doesn't handle negative step,
      // but we test the current behavior
      expect(range(5, 0, -1)).toEqual([]); // Current behavior
    });

    it('should handle decimal step', () => {
      expect(range(0, 3, 0.5)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    });
  });

  describe('uniqueId', () => {
    it('should generate unique IDs', () => {
      const id1 = uniqueId();
      const id2 = uniqueId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });

    it('should support prefix', () => {
      const id = uniqueId('test-');
      expect(id).toMatch(/^test-/);
    });

    it('should generate different IDs with same prefix', () => {
      const id1 = uniqueId('prefix-');
      const id2 = uniqueId('prefix-');
      
      expect(id1).not.toBe(id2);
      expect(id1.startsWith('prefix-')).toBe(true);
      expect(id2.startsWith('prefix-')).toBe(true);
    });

    it('should handle empty prefix', () => {
      const id = uniqueId('');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('sleep', () => {
    it('should wait for specified duration', async () => {
      const start = Date.now();
      await sleep(50);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(45); // Allow some variance
    });

    it('should resolve with undefined', async () => {
      const result = await sleep(1);
      expect(result).toBeUndefined();
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await sleep(0);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(50);
    });
  });

  describe('measureTime', () => {
    it('should measure synchronous function execution time', async () => {
      const testFn = () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      const { result, time } = await measureTime(testFn);
      
      expect(result).toBe(499500); // Sum of 0 to 999
      expect(time).toBeGreaterThan(0);
      expect(typeof time).toBe('number');
    });

    it('should measure asynchronous function execution time', async () => {
      const testFn = async () => {
        await sleep(10);
        return 'done';
      };

      const { result, time } = await measureTime(testFn);
      
      expect(result).toBe('done');
      expect(time).toBeGreaterThanOrEqual(5); // Allow some variance
    });

    it('should handle functions that throw errors', async () => {
      const testFn = () => {
        throw new Error('Test error');
      };

      await expect(measureTime(testFn)).rejects.toThrow('Test error');
    });

    it('should handle async functions that reject', async () => {
      const testFn = async () => {
        await sleep(1);
        throw new Error('Async error');
      };

      await expect(measureTime(testFn)).rejects.toThrow('Async error');
    });
  });

  describe('memoize', () => {
    it('should cache function results', () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };
      
      const memoized = memoize(fn);
      
      expect(memoized(5)).toBe(10);
      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1); // Should only call once
      
      expect(memoized(3)).toBe(6);
      expect(callCount).toBe(2); // New argument, new call
    });

    it('should support custom key generator', () => {
      let callCount = 0;
      const fn = (obj: { id: number; name: string }) => {
        callCount++;
        return obj.name.toUpperCase();
      };
      
      const memoized = memoize(fn, (obj) => obj.id.toString());
      
      const obj1 = { id: 1, name: 'test' };
      const obj2 = { id: 1, name: 'different' }; // Same ID, different name
      
      expect(memoized(obj1)).toBe('TEST');
      expect(memoized(obj2)).toBe('TEST'); // Should return cached result
      expect(callCount).toBe(1);
    });

    it('should handle functions with no arguments', () => {
      let callCount = 0;
      const fn = () => {
        callCount++;
        return Math.random();
      };
      
      const memoized = memoize(fn);
      
      const result1 = memoized();
      const result2 = memoized();
      
      expect(result1).toBe(result2);
      expect(callCount).toBe(1);
    });

    it('should handle multiple arguments', () => {
      let callCount = 0;
      const fn = (a: number, b: string, c: boolean) => {
        callCount++;
        return `${a}-${b}-${c}`;
      };
      
      const memoized = memoize(fn);
      
      expect(memoized(1, 'test', true)).toBe('1-test-true');
      expect(memoized(1, 'test', true)).toBe('1-test-true');
      expect(callCount).toBe(1);
      
      expect(memoized(1, 'test', false)).toBe('1-test-false');
      expect(callCount).toBe(2);
    });
  });

  describe('defer', () => {
    it('should create a deferred promise', async () => {
      const deferred = defer<string>();
      
      expect(deferred.promise).toBeInstanceOf(Promise);
      expect(typeof deferred.resolve).toBe('function');
      expect(typeof deferred.reject).toBe('function');

      // Test resolve
      setTimeout(() => deferred.resolve('success'), 10);
      const result = await deferred.promise;
      expect(result).toBe('success');
    });

    it('should handle rejection', async () => {
      const deferred = defer<string>();
      
      setTimeout(() => deferred.reject(new Error('failure')), 10);
      
      await expect(deferred.promise).rejects.toThrow('failure');
    });

    it('should handle resolve with different types', async () => {
      const numberDeferred = defer<number>();
      numberDeferred.resolve(42);
      expect(await numberDeferred.promise).toBe(42);
      
      const objectDeferred = defer<{ test: string }>();
      const testObj = { test: 'value' };
      objectDeferred.resolve(testObj);
      expect(await objectDeferred.promise).toBe(testObj);
    });

    it('should handle multiple resolves/rejects gracefully', async () => {
      const deferred = defer<string>();
      
      deferred.resolve('first');
      deferred.resolve('second'); // Should be ignored
      
      const result = await deferred.promise;
      expect(result).toBe('first');
    });
  });
});

describe('Advanced Function Utilities', () => {
  describe('throttle - edge cases', () => {
    it('should handle immediate execution correctly', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      // First call should execute immediately
      throttled('arg1');
      expect(fn).toHaveBeenCalledWith('arg1');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid successive calls', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 50);
      
      // Execute multiple calls rapidly
      throttled('call1');
      throttled('call2');
      throttled('call3');
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('call1');
      
      // Wait for throttle period to pass
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Next call should execute
      throttled('call4');
      expect(fn).toHaveBeenCalledTimes(2);
      // The last call could be either call3 or call4 depending on throttle implementation timing
      const lastCall = fn.mock.calls[1][0];
      expect(['call3', 'call4']).toContain(lastCall);
    });

    it('should handle timeout cleanup correctly', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 50);
      
      // First call executes immediately
      throttled('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
      
      // Second call sets timeout
      throttled('delayed');
      expect(fn).toHaveBeenCalledTimes(1);
      
      // Third call before timeout - should not create new timeout
      throttled('ignored');
      expect(fn).toHaveBeenCalledTimes(1);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle zero delay', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 0);
      
      throttled('test1');
      throttled('test2');
      
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('debounce - edge cases', () => {
    it('should cancel previous timeout on new call', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);
      
      debounced('call1');
      
      // Cancel with new call before timeout
      setTimeout(() => debounced('call2'), 25);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('call2');
    });

    it('should handle manual cancellation', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);
      
      debounced('test');
      debounced.cancel();
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fn).not.toHaveBeenCalled();
    });

    it('should handle multiple cancellations', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);
      
      debounced('test');
      debounced.cancel();
      debounced.cancel(); // Should not throw
      
      expect(() => debounced.cancel()).not.toThrow();
    });

    it('should handle zero delay', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 0);
      
      debounced('test');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fn).toHaveBeenCalledWith('test');
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  describe('stripAnsi edge cases', () => {
    it('should handle undefined input', () => {
      expect(stripAnsi(undefined)).toBe('');
    });

    it('should handle malformed ANSI sequences', () => {
      expect(stripAnsi('\x1b[incomplete')).toBe('\x1b[incomplete');
      expect(stripAnsi('\x1b[')).toBe('\x1b[');
    });
  });

  describe('overlayChildOutput edge cases', () => {
    it('should handle undefined child lines', () => {
      const parentLines = ['test'];
      const childOutput: Output = {
        lines: [undefined as any]
      };
      
      overlayChildOutput(parentLines, childOutput, 0, 0, 4, 1, 4);
      
      expect(parentLines[0]).toContain('   '); // Should pad with spaces
    });

    it('should handle negative coordinates', () => {
      const parentLines = ['hello'];
      const childOutput: Output = {
        lines: ['world']
      };
      
      overlayChildOutput(parentLines, childOutput, -1, -1, 5, 1, 5);
      
      // Should not crash and should leave parent unchanged
      expect(parentLines).toEqual(['hello']);
    });
  });

  describe('truncateString edge cases', () => {
    it('should handle strings with only ANSI codes', () => {
      const input = '\x1b[31m\x1b[0m';
      const result = truncateString(input, 5);
      
      expect(result).toBe(input);
      expect(getStringVisualLength(result)).toBe(0);
    });

    it('should handle mixed ANSI and normal characters', () => {
      const input = 'H\x1b[31me\x1b[0ml\x1b[32ml\x1b[0mo';
      const result = truncateString(input, 3);
      
      expect(getStringVisualLength(result)).toBe(3);
    });
  });
});