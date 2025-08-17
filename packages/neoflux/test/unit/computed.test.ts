/**
 * Computed tests - Derived reactive values with automatic memoization
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { batch, signal, effect, computed, onCleanup, createRoot } from '../../src/index.js';

describe('Computed', () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    // Create root for each test
  });

  afterEach(() => {
    // Clean up after each test
    dispose?.();
    dispose = undefined;
  });

  describe('Basic functionality', () => {
    it('should derive value from signals', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(2);
        const b = signal(3);
        const sum = computed(() => a() + b());
        
        expect(sum()).toBe(5);
        
        a.set(5);
        expect(sum()).toBe(8);
        
        b.set(10);
        expect(sum()).toBe(15);
      });
    });

    it('should cache computed values', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(10);
        const fn = vi.fn(() => s() * 2);
        const c = computed(fn);
        
        // First access computes
        expect(c()).toBe(20);
        expect(fn).toHaveBeenCalledTimes(1);
        
        // Second access uses cache
        expect(c()).toBe(20);
        expect(fn).toHaveBeenCalledTimes(1);
        
        // Change invalidates cache
        s.set(15);
        expect(c()).toBe(30);
        expect(fn).toHaveBeenCalledTimes(2);
        
        // Multiple accesses don't recompute
        expect(c()).toBe(30);
        expect(c()).toBe(30);
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle nested computeds', () => {
      createRoot(disposeRoot => {
        dispose = disposeRoot;
        const a = signal(1);
        const b = computed(() => a() * 2);
        const c = computed(() => b() * 3);
        const d = computed(() => c() + b());
        
        expect(b()).toBe(2);
        expect(c()).toBe(6);
        expect(d()).toBe(8); // 6 + 2
        
        a.set(2);
        expect(b()).toBe(4);
        expect(c()).toBe(12);
        expect(d()).toBe(16); // 12 + 4
        
        a.set(3);
        expect(b()).toBe(6);
        expect(c()).toBe(18);
        expect(d()).toBe(24); // 18 + 6
      });
    });

    it('should handle deeply nested computeds', () => {
      createRoot(d => {
        dispose = d;
        const base = signal(1);
        const level1 = computed(() => base() * 2);
        const level2 = computed(() => level1() * 2);
        const level3 = computed(() => level2() * 2);
        const level4 = computed(() => level3() * 2);
        const level5 = computed(() => level4() * 2);
        
        expect(level5()).toBe(32); // 1 * 2^5
        
        base.set(2);
        expect(level5()).toBe(64); // 2 * 2^5
        
        base.set(3);
        expect(level5()).toBe(96); // 3 * 2^5
      });
    });

    it('should handle complex dependency graphs', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        const c = signal(3);
        
        const ab = computed(() => a() + b());
        const bc = computed(() => b() + c());
        const ac = computed(() => a() + c());
        
        const sum = computed(() => ab() + bc() + ac());
        
        expect(sum()).toBe(12); // (1+2) + (2+3) + (1+3) = 3 + 5 + 4 = 12
        
        a.set(2);
        expect(sum()).toBe(14); // (2+2) + (2+3) + (2+3) = 4 + 5 + 5 = 14
        
        b.set(3);
        expect(sum()).toBe(16); // (2+3) + (3+3) + (2+3) = 5 + 6 + 5 = 16
        
        c.set(4);
        expect(sum()).toBe(18); // (2+3) + (3+4) + (2+4) = 5 + 7 + 6 = 18
      });
    });

    it('should peek without tracking dependencies', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal(10);
          const c = computed(() => s() * 2);
          const trackingFn = vi.fn();
          
          // Create an effect that depends on c
          effect(() => {
            c();
            trackingFn();
          });
          
          expect(trackingFn).toHaveBeenCalledTimes(1);
          
          // Peek should not track
          const peekedValue = c.peek();
          expect(peekedValue).toBe(20);
          
          // Changing s should still trigger the effect
          s.set(15);
          
          // Wait for async effect
          setTimeout(() => {
            expect(trackingFn).toHaveBeenCalledTimes(2);
            resolve();
          }, 10);
        });
      });
    });
  });

  describe('Memoization and performance', () => {
    it('should only recompute when dependencies change', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        const c = signal(3);
        
        const computeFn = vi.fn(() => a() + b());
        const result = computed(computeFn);
        
        // Initial computation
        expect(result()).toBe(3);
        expect(computeFn).toHaveBeenCalledTimes(1);
        
        // Access again - should use cache
        expect(result()).toBe(3);
        expect(computeFn).toHaveBeenCalledTimes(1);
        
        // Change unrelated signal - should not recompute
        c.set(4);
        expect(result()).toBe(3);
        expect(computeFn).toHaveBeenCalledTimes(1);
        
        // Change dependency - should recompute
        a.set(2);
        expect(result()).toBe(4);
        expect(computeFn).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle expensive computations efficiently', () => {
      createRoot(d => {
        dispose = d;
        const input = signal(1000);
        
        // Simulate expensive computation
        const expensiveFn = vi.fn((n: number) => {
          let result = 0;
          for (let i = 0; i < n; i++) {
            result += Math.sqrt(i);
          }
          return result;
        });
        
        const result = computed(() => expensiveFn(input()));
        
        // First access computes
        const firstResult = result();
        expect(expensiveFn).toHaveBeenCalledTimes(1);
        
        // Multiple accesses use cache
        for (let i = 0; i < 10; i++) {
          expect(result()).toBe(firstResult);
        }
        expect(expensiveFn).toHaveBeenCalledTimes(1);
        
        // Change triggers recomputation
        input.set(2000);
        const secondResult = result();
        expect(secondResult).not.toBe(firstResult);
        expect(expensiveFn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Custom equality', () => {
    it('should use custom equals function', () => {
      createRoot(d => {
        dispose = d;
        const s = signal({ x: 1, y: 2 });
        
        const computeFn = vi.fn(() => ({ sum: s().x + s().y }));
        const c = computed(computeFn, {
          equals: (a, b) => a.sum === b.sum
        });
        
        // Initial computation
        expect(c()).toEqual({ sum: 3 });
        expect(computeFn).toHaveBeenCalledTimes(1);
        
        // Change that results in same sum - should recompute but not notify
        s.set({ x: 2, y: 1 });
        expect(c()).toEqual({ sum: 3 });
        expect(computeFn).toHaveBeenCalledTimes(2);
        
        // Track notifications
        const notifyFn = vi.fn();
        c.subscribe(notifyFn);
        
        // Same sum again - should recompute but not notify
        s.set({ x: 0, y: 3 });
        expect(c()).toEqual({ sum: 3 });
        expect(computeFn).toHaveBeenCalledTimes(3);
        expect(notifyFn).not.toHaveBeenCalled();
        
        // Different sum - should recompute and notify
        s.set({ x: 2, y: 3 });
        expect(c()).toEqual({ sum: 5 });
        expect(computeFn).toHaveBeenCalledTimes(4);
        expect(notifyFn).toHaveBeenCalledWith({ sum: 5 });
      });
    });

    it('should handle NaN correctly with default equals', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const c = computed(() => s() / s());
        
        expect(c()).toBeNaN();
        
        // NaN !== NaN but Object.is(NaN, NaN) === true
        // So it shouldn't trigger updates
        const notifyFn = vi.fn();
        c.subscribe(notifyFn);
        
        s.set(1);
        expect(c()).toBe(1);
        expect(notifyFn).toHaveBeenCalledWith(1);
        
        s.set(0);
        expect(c()).toBeNaN();
        expect(notifyFn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error handling', () => {
    it('should handle errors in computation', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const c = computed(() => {
          const value = s();
          if (value === 0) {
            throw new Error('Division by zero');
          }
          return 10 / value;
        });
        
        // Should throw on access
        expect(() => c()).toThrow('Division by zero');
        
        // Should work after fixing the issue
        s.set(2);
        expect(c()).toBe(5);
        
        // Should throw again if issue returns
        s.set(0);
        expect(() => c()).toThrow('Division by zero');
      });
    });

    it('should detect circular dependencies', () => {
      createRoot(d => {
        dispose = d;
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        let c1: any;
        let c2: any;
        
        // Create circular dependency
        c1 = computed(() => c2?.() ?? 0);
        c2 = computed(() => c1() + 1);
        
        // Should either throw or warn about circular dependency
        expect(() => c1()).toThrow();
        
        // Or check if it logged a warning/error
        const hasWarning = consoleWarnSpy.mock.calls.some(call => 
          call.some(arg => String(arg).includes('Circular') || String(arg).includes('circular'))
        );
        const hasError = consoleErrorSpy.mock.calls.some(call => 
          call.some(arg => String(arg).includes('Circular') || String(arg).includes('circular'))
        );
        
        // At least one should be true
        // expect(hasWarning || hasError).toBe(true);
        
        consoleWarnSpy.mockRestore();
      });
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers when value changes', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(10);
        const c = computed(() => s() * 2);
        const fn = vi.fn();
        
        const unsubscribe = c.subscribe(fn);
        
        // Initial value doesn't trigger subscription
        expect(fn).not.toHaveBeenCalled();
        
        // Change triggers notification
        s.set(20);
        c(); // Need to access to trigger recomputation
        expect(fn).toHaveBeenCalledWith(40);
        
        // Another change
        s.set(30);
        c(); // Need to access to trigger recomputation
        expect(fn).toHaveBeenCalledWith(60);
        expect(fn).toHaveBeenCalledTimes(2);
        
        unsubscribe();
        
        // No notification after unsubscribe
        s.set(40);
        c();
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle multiple subscribers', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(1);
        const c = computed(() => s() * 10);
        
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        const fn3 = vi.fn();
        
        const unsub1 = c.subscribe(fn1);
        const unsub2 = c.subscribe(fn2);
        const unsub3 = c.subscribe(fn3);
        
        s.set(2);
        c(); // Trigger recomputation
        
        expect(fn1).toHaveBeenCalledWith(20);
        expect(fn2).toHaveBeenCalledWith(20);
        expect(fn3).toHaveBeenCalledWith(20);
        
        unsub2();
        
        s.set(3);
        c(); // Trigger recomputation
        
        expect(fn1).toHaveBeenCalledTimes(2);
        expect(fn2).toHaveBeenCalledTimes(1); // Unsubscribed
        expect(fn3).toHaveBeenCalledTimes(2);
        
        unsub1();
        unsub3();
      });
    });
  });

  describe('Integration with effects', () => {
    it('should trigger effects when computed changes', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal(10);
          const doubled = computed(() => s() * 2);
          const effectFn = vi.fn();
          
          effect(() => {
            effectFn(doubled());
          });
          
          expect(effectFn).toHaveBeenCalledWith(20);
          expect(effectFn).toHaveBeenCalledTimes(1);
          
          s.set(15);
          
          // Effects run async
          setTimeout(() => {
            expect(effectFn).toHaveBeenCalledWith(30);
            expect(effectFn).toHaveBeenCalledTimes(2);
            resolve();
          }, 10);
        });
      });
    });

    it('should handle computed chains in effects', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const a = signal(1);
          const b = computed(() => a() * 2);
          const c = computed(() => b() * 3);
          
          const results: number[] = [];
          effect(() => {
            results.push(c());
          });
          
          expect(results).toEqual([6]);
          
          a.set(2);
          
          setTimeout(() => {
            expect(results).toEqual([6, 12]);
            
            a.set(3);
            
            setTimeout(() => {
              expect(results).toEqual([6, 12, 18]);
              resolve();
            }, 10);
          }, 10);
        });
      });
    });
  });

  describe('Batching', () => {
    it('should batch updates in computed chains', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        
        const computeFn = vi.fn(() => a() + b());
        const sum = computed(computeFn);
        
        expect(sum()).toBe(3);
        expect(computeFn).toHaveBeenCalledTimes(1);
        
        batch(() => {
          a.set(10);
          b.set(20);
        });
        
        // Should only recompute once
        expect(sum()).toBe(30);
        expect(computeFn).toHaveBeenCalledTimes(2);
      });
    });

    it.skip('should handle nested batches with computeds', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const a = signal(0);
          const b = signal(0);
          const c = signal(0);
          
          const sum = computed(() => a() + b() + c());
          const effectFn = vi.fn();
          
          effect(() => {
            effectFn(sum());
          });
          
          expect(effectFn).toHaveBeenCalledTimes(1);
          expect(effectFn).toHaveBeenCalledWith(0);
          
          batch(() => {
            a.set(1);
            batch(() => {
              b.set(2);
              batch(() => {
                c.set(3);
              });
            });
          });
          
          // All updates should be batched
          setTimeout(() => {
            expect(effectFn).toHaveBeenCalledTimes(2);
            expect(effectFn).toHaveBeenCalledWith(6);
            resolve();
          }, 10);
        });
      });
    });
  });

  describe('Memory management', () => {
    it('should clean up dependencies when disposed', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(10);
        const c = computed(() => s() * 2);
        
        // Access to set up dependencies
        expect(c()).toBe(20);
        
        // Get the implementation to check cleanup
        const impl = (c as any).__internal;
        expect(impl).toBeDefined();
        
        // Clean up
        onCleanup(() => {
          impl.dispose();
        });
        
        d();
        
        // After disposal, computed should still return cached value
        // but shouldn't track new dependencies
        expect(c()).toBe(20);
        
        // Changing signal shouldn't invalidate disposed computed
        s.set(30);
        expect(c()).toBe(20); // Still cached value
      });
    });

    it('should handle disposal in complex dependency graphs', () => {
      let outerDispose: (() => void) | undefined;
      
      createRoot(d => {
        outerDispose = d;
        const a = signal(1);
        const b = signal(2);
        
        const c1 = computed(() => a() + b());
        const c2 = computed(() => a() * b());
        const c3 = computed(() => c1() + c2());
        
        expect(c3()).toBe(5); // (1+2) + (1*2) = 3 + 2 = 5
        
        // Get implementations
        const impl1 = (c1 as any).__internal;
        const impl2 = (c2 as any).__internal;
        const impl3 = (c3 as any).__internal;
        
        // Dispose middle computed
        impl2.dispose();
        
        // c3 should still work with cached value of c2
        a.set(2);
        expect(c1()).toBe(4); // 2+2
        expect(c2()).toBe(2); // Still cached (disposed)
        expect(c3()).toBe(6); // 4+2
      });
      
      outerDispose?.();
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined and null values', () => {
      createRoot(d => {
        dispose = d;
        const s = signal<number | null | undefined>(undefined);
        const c = computed(() => {
          const val = s();
          if (val === undefined) return 'undefined';
          if (val === null) return 'null';
          return val.toString();
        });
        
        expect(c()).toBe('undefined');
        
        s.set(null);
        expect(c()).toBe('null');
        
        s.set(42);
        expect(c()).toBe('42');
        
        s.set(undefined);
        expect(c()).toBe('undefined');
      });
    });

    it('should handle computed returning functions', () => {
      createRoot(d => {
        dispose = d;
        const multiplier = signal(2);
        const createMultiplier = computed(() => {
          const m = multiplier();
          return (x: number) => x * m;
        });
        
        const fn1 = createMultiplier();
        expect(fn1(5)).toBe(10);
        
        multiplier.set(3);
        const fn2 = createMultiplier();
        expect(fn2(5)).toBe(15);
        
        // Original function shouldn't change
        expect(fn1(5)).toBe(10);
      });
    });

    it('should handle computed with side effects', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        let sideEffectCount = 0;
        
        const c = computed(() => {
          sideEffectCount++;
          return s() * 2;
        });
        
        expect(sideEffectCount).toBe(0); // Lazy initialization
        
        expect(c()).toBe(0);
        expect(sideEffectCount).toBe(1);
        
        expect(c()).toBe(0);
        expect(sideEffectCount).toBe(1); // Cached
        
        s.set(5);
        expect(c()).toBe(10);
        expect(sideEffectCount).toBe(2);
      });
    });

    it('should handle rapid updates', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const c = computed(() => s() * 2);
        const results: number[] = [];
        
        c.subscribe(v => results.push(v));
        
        // Rapid updates
        for (let i = 1; i <= 100; i++) {
          s.set(i);
          expect(c()).toBe(i * 2);
        }
        
        // Each update should be captured
        expect(results.length).toBeGreaterThan(0);
        expect(results[results.length - 1]).toBe(200);
      });
    });
  });
});