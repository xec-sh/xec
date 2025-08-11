/**
 * Batch tests - Group multiple updates into a single render
 */

import { it, vi, expect, describe, afterEach } from 'vitest';

import { batch, signal, effect, untrack, computed, createRoot } from '../../../src/core/reactive/index.js';

describe('Batch', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  describe('Basic batching', () => {
    it('should batch multiple signal updates', (done) => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        const fn = vi.fn(() => a() + b());
        
        effect(fn);
        expect(fn).toHaveBeenCalledTimes(1);
        
        batch(() => {
          a.set(10);
          b.set(20);
        });
        
        // Should only run once after batch
        setTimeout(() => {
          expect(fn).toHaveBeenCalledTimes(2);
          expect(fn).toHaveBeenLastCalledWith(30);
          done();
        }, 10);
      });
    });

    it('should batch updates synchronously within batch scope', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const values: number[] = [];
        
        s.subscribe(v => values.push(v));
        
        batch(() => {
          s.set(1);
          expect(values).toEqual([]); // No notifications yet
          
          s.set(2);
          expect(values).toEqual([]); // Still no notifications
          
          s.set(3);
          expect(values).toEqual([]); // Still batched
        });
        
        // After batch completes
        expect(values).toEqual([3]); // Only final value
      });
    });

    it('should handle nested batches', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const fn = vi.fn(() => s());
        
        effect(fn);
        expect(fn).toHaveBeenCalledTimes(1);
        
        batch(() => {
          s.set(1);
          batch(() => {
            s.set(2);
            batch(() => {
              s.set(3);
            });
          });
        });
        
        // All updates batched together
        setTimeout(() => {
          expect(fn).toHaveBeenCalledTimes(2); // Initial + one batch
          expect(s()).toBe(3);
        }, 10);
      });
    });

    it('should batch updates across multiple computeds', (done) => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        
        const sum = computed(() => a() + b());
        const product = computed(() => a() * b());
        const combined = computed(() => sum() + product());
        
        const fn = vi.fn();
        effect(() => fn(combined()));
        
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith(5); // (1+2) + (1*2) = 3 + 2 = 5
        
        batch(() => {
          a.set(3);
          b.set(4);
        });
        
        setTimeout(() => {
          expect(fn).toHaveBeenCalledTimes(2);
          expect(fn).toHaveBeenCalledWith(19); // (3+4) + (3*4) = 7 + 12 = 19
          done();
        }, 10);
      });
    });
  });

  describe('Batch with complex scenarios', () => {
    it('should handle interleaved reads and writes', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        const results: number[] = [];
        
        batch(() => {
          a.set(10);
          results.push(a()); // Read after write
          
          b.set(20);
          results.push(b()); // Read after write
          
          a.set(a() + b()); // Read and write
          results.push(a());
        });
        
        expect(results).toEqual([10, 20, 30]);
        expect(a()).toBe(30);
        expect(b()).toBe(20);
      });
    });

    it('should batch updates from effects', (done) => {
      createRoot(d => {
        dispose = d;
        const trigger = signal(0);
        const a = signal(1);
        const b = signal(2);
        
        const sums: number[] = [];
        
        // Effect that updates other signals
        effect(() => {
          if (trigger() > 0) {
            batch(() => {
              a.set(a() + 1);
              b.set(b() + 1);
            });
          }
        });
        
        // Effect that tracks a and b
        effect(() => {
          sums.push(a() + b());
        });
        
        expect(sums).toEqual([3]); // 1 + 2
        
        trigger.set(1);
        
        setTimeout(() => {
          // Should batch the updates from first effect
          expect(sums).toEqual([3, 5]); // Initial, then (2 + 3)
          
          trigger.set(2);
          
          setTimeout(() => {
            expect(sums).toEqual([3, 5, 7]); // Then (3 + 4)
            done();
          }, 10);
        }, 10);
      });
    });

    it('should handle errors within batch', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const values: number[] = [];
        
        s.subscribe(v => values.push(v));
        
        expect(() => {
          batch(() => {
            s.set(1);
            throw new Error('Test error');
            s.set(2); // This won't run
          });
        }).toThrow('Test error');
        
        // First update should have been applied
        expect(values).toEqual([1]);
        expect(s()).toBe(1);
      });
    });

    it('should handle recursive batches', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        let recursionDepth = 0;
        const maxDepth = 5;
        
        const recursiveBatch = () => {
          if (recursionDepth < maxDepth) {
            recursionDepth++;
            batch(() => {
              s.set(s() + 1);
              recursiveBatch();
            });
          }
        };
        
        recursiveBatch();
        
        expect(s()).toBe(maxDepth);
        expect(recursionDepth).toBe(maxDepth);
      });
    });
  });

  describe('Untrack', () => {
    it('should not track dependencies within untrack', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        
        const fn = vi.fn(() => {
          const aVal = a();
          const bVal = untrack(() => b());
          return aVal + bVal;
        });
        
        const c = computed(fn);
        
        expect(c()).toBe(3);
        expect(fn).toHaveBeenCalledTimes(1);
        
        // Update b - should not trigger recomputation
        b.set(10);
        expect(c()).toBe(3); // Still using cached value
        expect(fn).toHaveBeenCalledTimes(1);
        
        // Update a - should trigger recomputation
        a.set(5);
        expect(c()).toBe(15); // 5 + 10 (reads current b value)
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    it('should work with nested untrack', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        const c = signal(3);
        
        const result = computed(() => a() + untrack(() => b() + untrack(() => c())));
        
        expect(result()).toBe(6);
        
        // Only a should trigger updates
        b.set(10);
        c.set(10);
        expect(result.peek()).toBe(6); // Cached
        
        a.set(2);
        expect(result()).toBe(22); // 2 + 10 + 10
      });
    });

    it('should untrack effect dependencies', (done) => {
      createRoot(d => {
        dispose = d;
        const tracked = signal(1);
        const untracked = signal(2);
        
        const runs = vi.fn();
        
        effect(() => {
          runs(tracked() + untrack(() => untracked()));
        });
        
        expect(runs).toHaveBeenCalledTimes(1);
        expect(runs).toHaveBeenCalledWith(3);
        
        // Untracked change - no effect
        untracked.set(10);
        
        setTimeout(() => {
          expect(runs).toHaveBeenCalledTimes(1);
          
          // Tracked change - triggers effect
          tracked.set(5);
          
          setTimeout(() => {
            expect(runs).toHaveBeenCalledTimes(2);
            expect(runs).toHaveBeenCalledWith(15); // 5 + 10
            done();
          }, 10);
        }, 10);
      });
    });
  });

  describe('CreateRoot', () => {
    it('should create isolated reactive scope', () => {
      const results: number[] = [];
      
      const value1 = createRoot(dispose => {
        const s = signal(10);
        effect(() => {
          results.push(s());
        });
        
        s.set(20);
        const finalValue = s();
        
        dispose();
        return finalValue;
      });
      
      expect(value1).toBe(20);
      expect(results).toContain(10);
      expect(results).toContain(20);
      
      // Create another root - isolated from first
      const value2 = createRoot(dispose => {
        const s = signal(30);
        effect(() => {
          results.push(s());
        });
        
        s.set(40);
        const finalValue = s();
        
        dispose();
        return finalValue;
      });
      
      expect(value2).toBe(40);
      expect(results).toContain(30);
      expect(results).toContain(40);
    });

    it('should clean up all computations on dispose', (done) => {
      const s = signal(0);
      let effectRuns = 0;
      
      createRoot(dispose => {
        effect(() => {
          s();
          effectRuns++;
        });
        
        expect(effectRuns).toBe(1);
        
        // Update signal - effect runs
        s.set(1);
        
        setTimeout(() => {
          expect(effectRuns).toBe(2);
          
          // Dispose root
          dispose();
          
          // Update signal - effect should not run
          s.set(2);
          
          setTimeout(() => {
            expect(effectRuns).toBe(2); // No change
            done();
          }, 10);
        }, 10);
      });
    });

    it('should handle nested roots', () => {
      const outerSignal = signal(1);
      const results: string[] = [];
      
      createRoot(outerDispose => {
        effect(() => {
          results.push(`outer-${outerSignal()}`);
        });
        
        createRoot(innerDispose => {
          const innerSignal = signal(10);
          
          effect(() => {
            results.push(`inner-${innerSignal()}`);
          });
          
          innerSignal.set(20);
          innerDispose();
        });
        
        // Inner root disposed, its effects won't run
        outerSignal.set(2);
        
        setTimeout(() => {
          expect(results).toContain('outer-1');
          expect(results).toContain('outer-2');
          expect(results).toContain('inner-10');
          expect(results).toContain('inner-20');
          outerDispose();
        }, 10);
      });
    });

    it('should return value from root function', () => {
      const result = createRoot(dispose => {
        const a = signal(5);
        const b = signal(10);
        const sum = computed(() => a() + b());
        
        const value = sum();
        dispose();
        return { value, message: 'computed sum' };
      });
      
      expect(result).toEqual({ value: 15, message: 'computed sum' });
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle large batch operations efficiently', (done) => {
      createRoot(d => {
        dispose = d;
        const signals = Array.from({ length: 1000 }, () => signal(0));
        const sum = computed(() => signals.reduce((acc, s) => acc + s(), 0));
        
        const fn = vi.fn();
        effect(() => fn(sum()));
        
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith(0);
        
        // Update all signals in batch
        batch(() => {
          signals.forEach((s, i) => s.set(i));
        });
        
        // Should only recompute once
        setTimeout(() => {
          expect(fn).toHaveBeenCalledTimes(2);
          // Sum of 0..999 = 499500
          expect(fn).toHaveBeenCalledWith(499500);
          done();
        }, 10);
      });
    });

    it('should handle rapid batch operations', (done) => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const results: number[] = [];
        
        effect(() => {
          results.push(s());
        });
        
        // Rapid batches
        for (let i = 0; i < 100; i++) {
          batch(() => {
            s.set(i);
          });
        }
        
        setTimeout(() => {
          // Should have reasonable number of updates
          expect(results.length).toBeGreaterThan(1);
          expect(results.length).toBeLessThan(150); // Not every update
          expect(results[results.length - 1]).toBe(99);
          done();
        }, 50);
      });
    });

    it('should maintain consistency with circular updates', () => {
      createRoot(d => {
        dispose = d;
        const a = signal(1);
        const b = signal(2);
        
        let aUpdates = 0;
        let bUpdates = 0;
        const maxUpdates = 3;
        
        effect(() => {
          const aVal = a();
          if (aUpdates < maxUpdates) {
            aUpdates++;
            batch(() => {
              b.set(aVal * 2);
            });
          }
        });
        
        effect(() => {
          const bVal = b();
          if (bUpdates < maxUpdates) {
            bUpdates++;
            batch(() => {
              a.set(bVal + 1);
            });
          }
        });
        
        // Let effects stabilize
        setTimeout(() => {
          expect(aUpdates).toBe(maxUpdates);
          expect(bUpdates).toBe(maxUpdates);
          expect(a()).toBeGreaterThan(1);
          expect(b()).toBeGreaterThan(2);
        }, 50);
      });
    });

    it('should handle mixed sync and async operations', (done) => {
      createRoot(d => {
        dispose = d;
        const s = signal(0);
        const results: string[] = [];
        
        // Sync effect
        effect(() => {
          results.push(`sync-${s()}`);
        });
        
        // Async effect
        effect(() => {
          const value = s();
          setTimeout(() => {
            results.push(`async-${value}`);
          }, 5);
        });
        
        expect(results).toEqual(['sync-0']);
        
        batch(() => {
          s.set(1);
          s.set(2);
          s.set(3);
        });
        
        // Sync should update immediately with final value
        setTimeout(() => {
          expect(results).toContain('sync-3');
          
          // Async should eventually get all values
          setTimeout(() => {
            expect(results).toContain('async-0');
            expect(results).toContain('async-3');
            done();
          }, 20);
        }, 10);
      });
    });
  });
});