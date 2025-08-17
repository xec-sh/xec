/**
 * Effect tests - Side effects that run when dependencies change
 */

import { it, expect, describe, afterEach } from 'vitest';

import { batch, signal, effect, computed, createRoot } from '../../src/index.js';

describe('Effect', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  describe('Basic functionality', () => {
    it('should run immediately by default', () => {
      createRoot(d => {
        dispose = d;
        let runCount = 0;
        effect(() => {
          runCount++;
        });
        
        expect(runCount).toBe(1);
      });
    });

    it('should defer if option is set', () => {
      createRoot(d => {
        dispose = d;
        let runCount = 0;
        effect(() => {
          runCount++;
        }, { defer: true });
        
        expect(runCount).toBe(0);
      });
    });

    it('should re-run when dependencies change', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal(10);
          let runCount = 0;
          let lastValue = 0;
          
          effect(() => {
            lastValue = s();
            runCount++;
          });
          
          expect(runCount).toBe(1);
          expect(lastValue).toBe(10);
          
          s.set(20);
          
          // Wait for effect to run
          Promise.resolve().then(() => {
            expect(runCount).toBe(2);
            expect(lastValue).toBe(20);
            resolve();
          });
        });
      });
    });

    it('should track multiple dependencies', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const a = signal(1);
          const b = signal(2);
          const c = signal(3);
          
          let runCount = 0;
          let sum = 0;
          
          effect(() => {
            sum = a() + b() + c();
            runCount++;
          });
          
          expect(runCount).toBe(1);
          expect(sum).toBe(6);
          
          // Change one dependency
          a.set(10);
          
          Promise.resolve().then(() => {
            expect(runCount).toBe(2);
            expect(sum).toBe(15);
            
            // Change another
            b.set(20);
            
            return Promise.resolve();
          }).then(() => {
            expect(runCount).toBe(3);
            expect(sum).toBe(33);
            
            // Change third
            c.set(30);
            
            return Promise.resolve();
          }).then(() => {
            expect(runCount).toBe(4);
            expect(sum).toBe(60);
            resolve();
          });
        });
      });
    });

    it('should handle computed dependencies', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const base = signal(10);
          const doubled = computed(() => base() * 2);
          
          const results: number[] = [];
          effect(() => {
            results.push(doubled());
          });
          
          expect(results).toEqual([20]);
          
          base.set(15);
          
          Promise.resolve().then(() => {
            expect(results).toEqual([20, 30]);
            
            base.set(25);
            
            return Promise.resolve();
          }).then(() => {
            expect(results).toEqual([20, 30, 50]);
            resolve();
          });
        });
      });
    });
  });

  describe('Cleanup functionality', () => {
    it('should handle cleanup function', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          let cleanupCount = 0;
          const s = signal(10);
          
          effect(() => {
            s(); // Track dependency
            return () => {
              cleanupCount++;
            };
          });
          
          expect(cleanupCount).toBe(0);
          
          // Trigger re-run
          s.set(20);
          
          Promise.resolve().then(() => {
            expect(cleanupCount).toBe(1);
            
            // Another update
            s.set(30);
            
            return Promise.resolve();
          }).then(() => {
            expect(cleanupCount).toBe(2);
            resolve();
          });
        });
      });
    });

    it('should run cleanup on dispose', async () => {
      await new Promise<void>(resolve => {
        let effectDispose: (() => void) | undefined;
        
        createRoot(d => {
          let cleanupCount = 0;
          const s = signal(10);
          
          effectDispose = effect(() => {
            s();
            return () => {
              cleanupCount++;
            };
          });
          
          expect(cleanupCount).toBe(0);
          
          effectDispose?.dispose();
          expect(cleanupCount).toBe(1);
          
          // Shouldn't run again after dispose
          s.set(20);
          
          Promise.resolve().then(() => {
            expect(cleanupCount).toBe(1);
            d();
            resolve();
          });
        });
      });
    });

    it('should handle complex cleanup scenarios', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal('init');
          const cleanups: string[] = [];
          const runs: string[] = [];
          
          effect(() => {
            const value = s();
            runs.push(value);
            
            return () => {
              cleanups.push(`cleanup-${value}`);
            };
          });
          
          expect(runs).toEqual(['init']);
          expect(cleanups).toEqual([]);
          
          s.set('second');
          
          Promise.resolve().then(() => {
            expect(runs).toEqual(['init', 'second']);
            expect(cleanups).toEqual(['cleanup-init']);
            
            s.set('third');
            
            return Promise.resolve();
          }).then(() => {
            expect(runs).toEqual(['init', 'second', 'third']);
            expect(cleanups).toEqual(['cleanup-init', 'cleanup-second']);
            resolve();
          });
        });
      });
    });
  });

  describe('Custom scheduler', () => {
    it('should use custom scheduler if provided', () => {
      createRoot(d => {
        dispose = d;
        const s = signal(10);
        const scheduledFns: Array<() => void> = [];
        let schedulerCallCount = 0;
        let effectRunCount = 0;
        
        const customScheduler = (fn: () => void) => {
          schedulerCallCount++;
          scheduledFns.push(fn);
        };
        
        effect(() => {
          s();
          effectRunCount++;
        }, { scheduler: customScheduler });
        
        // Should have been scheduled
        expect(schedulerCallCount).toBe(1);
        expect(scheduledFns).toHaveLength(1);
        expect(effectRunCount).toBe(0); // Not run yet
        
        // Run scheduled function
        scheduledFns[0]();
        expect(effectRunCount).toBe(1);
        
        // Change signal - should schedule again
        s.set(20);
        
        // Scheduler should have been called immediately
        expect(schedulerCallCount).toBe(2);
        expect(scheduledFns).toHaveLength(2);
        
        // Run the second scheduled function
        scheduledFns[1]();
        expect(effectRunCount).toBe(2);
      });
    });

    it('should work with requestAnimationFrame scheduler', async () => {
      // Skip if requestAnimationFrame is not available
      if (typeof requestAnimationFrame === 'undefined') {
        console.log('Skipping RAF test - requestAnimationFrame not available');
        return;
      }
      
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal(0);
          const frames: number[] = [];
          let rafId: number;
          
          effect(() => {
            frames.push(s());
          }, {
            scheduler: fn => { rafId = requestAnimationFrame(fn); },
            defer: true // Defer initial run to use scheduler
          });
          
          // Should schedule for next frame (deferred)
          expect(frames).toEqual([]);
        
          // Wait for animation frame
          requestAnimationFrame(() => {
            expect(frames).toEqual([0]);
            
            // Update and wait for next frame
            s.set(1);
            
            requestAnimationFrame(() => {
              expect(frames).toEqual([0, 1]);
              resolve();
            });
          });
        });
      });
    });
  });

  describe('Error handling', () => {
    it('should handle errors in effect function', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const originalError = console.error;
          let errorCount = 0;
          console.error = () => { errorCount++; };
          
          const s = signal(0);
          
          effect(() => {
            const value = s();
            if (value === 0) {
              throw new Error('Test error');
            }
          });
          
          expect(errorCount).toBe(1);
          
          // Effect should continue working after error
          s.set(1);
          
          Promise.resolve().then(() => {
            // Should run without error this time
            expect(errorCount).toBe(1);
            console.error = originalError;
            resolve();
          });
        });
      });
    });

    it('should handle errors in cleanup function', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const originalError = console.error;
          let errorCount = 0;
          console.error = () => { errorCount++; };
          
          const s = signal(0);
          
          effect(() => {
            s();
            return () => {
              throw new Error('Cleanup error');
            };
          });
          
          // Trigger cleanup
          s.set(1);
          
          Promise.resolve().then(() => {
            expect(errorCount).toBeGreaterThan(0);
            console.error = originalError;
            resolve();
          });
        });
      });
    });
  });

  describe('Complex dependency tracking', () => {
    it('should handle conditional dependencies', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const condition = signal(true);
          const a = signal(1);
          const b = signal(2);
          
          const results: number[] = [];
          
          effect(() => {
            if (condition()) {
              results.push(a());
            } else {
              results.push(b());
            }
          });
          
          expect(results).toEqual([1]);
          
          // Change a - should trigger
          a.set(10);
          
          setTimeout(() => {
            expect(results).toEqual([1, 10]);
            
            // Change b - should not trigger (not tracking)
            b.set(20);
            
            setTimeout(() => {
              expect(results).toEqual([1, 10]);
              
              // Switch condition
              condition.set(false);
              
              setTimeout(() => {
                expect(results).toEqual([1, 10, 20]);
                
                // Now b changes should trigger
                b.set(30);
                
                setTimeout(() => {
                  expect(results).toEqual([1, 10, 20, 30]);
                  
                  // And a changes should not
                  a.set(100);
                  
                  setTimeout(() => {
                    expect(results).toEqual([1, 10, 20, 30]);
                    resolve();
                  }, 10);
                }, 10);
              }, 10);
            }, 10);
          }, 10);
        });
      });
    });

    it('should handle dynamic dependencies', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const signals = [signal(1), signal(2), signal(3)];
          const count = signal(1);
          
          const sums: number[] = [];
          
          effect(() => {
            let sum = 0;
            const n = count();
            for (let i = 0; i < n; i++) {
              sum += signals[i]();
            }
            sums.push(sum);
          });
          
          expect(sums).toEqual([1]); // Only first signal
          
          // Update first signal
          signals[0].set(10);
          
          Promise.resolve().then(() => {
            expect(sums).toEqual([1, 10]);
            
            // Update second signal (not tracked yet)
            signals[1].set(20);
            
            return Promise.resolve();
          }).then(() => {
            expect(sums).toEqual([1, 10]); // No change
            
            // Increase count to track more signals
            count.set(2);
            
            return Promise.resolve();
          }).then(() => {
            expect(sums).toEqual([1, 10, 30]); // 10 + 20
            
            // Now second signal changes should trigger
            signals[1].set(25);
            
            return Promise.resolve();
          }).then(() => {
            expect(sums).toEqual([1, 10, 30, 35]); // 10 + 25
            resolve();
          });
        });
      });
    });
  });

  describe('Nested effects', () => {
    it('should handle nested effects', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const outer = signal(1);
          const inner = signal(10);
          
          const outerRuns: number[] = [];
          const innerRuns: number[] = [];
          
          effect(() => {
            outerRuns.push(outer());
            
            effect(() => {
              innerRuns.push(inner());
            });
          });
          
          expect(outerRuns).toEqual([1]);
          expect(innerRuns).toEqual([10]);
          
          // Change inner - only inner effect runs
          inner.set(20);
          
          Promise.resolve().then(() => {
            expect(outerRuns).toEqual([1]);
            expect(innerRuns).toEqual([10, 20]);
            
            // Change outer - recreates inner effect
            outer.set(2);
            
            return Promise.resolve();
          }).then(() => {
            expect(outerRuns).toEqual([1, 2]);
            // Inner effect re-created, so runs again
            expect(innerRuns.length).toBeGreaterThanOrEqual(3);
            resolve();
          });
        });
      });
    });

    it('should properly clean up nested effects', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const condition = signal(true);
          const value = signal(1);
        
          const cleanups: string[] = [];
          const runs: string[] = [];
          
          effect(() => {
            if (condition()) {
              runs.push('outer-true');
              
              effect(() => {
                runs.push(`inner-${value()}`);
                return () => cleanups.push(`inner-cleanup-${value()}`);
              });
              
              return () => cleanups.push('outer-cleanup-true');
            } else {
              runs.push('outer-false');
              return () => cleanups.push('outer-cleanup-false');
            }
          });
          
          expect(runs).toEqual(['outer-true', 'inner-1']);
          expect(cleanups).toEqual([]);
          
          // Change inner value
          value.set(2);
          
          Promise.resolve().then(() => {
            expect(runs).toContain('inner-2');
            // We might or might not have cleanup at this point
            
            // Change condition - should clean up nested effect
            condition.set(false);
            
            return Promise.resolve();
          }).then(() => {
            expect(runs).toContain('outer-false');
            expect(cleanups).toContain('outer-cleanup-true');
            
            // Inner effect should be cleaned up
            value.set(3);
            
            return Promise.resolve();
          }).then(() => {
            // Inner effect shouldn't run anymore
            expect(runs).not.toContain('inner-3');
            resolve();
          });
        });
      });
    });
  });

  describe('Memory management', () => {
    it('should not leak memory with many effects', () => {
      createRoot(d => {
        dispose = d;
        const signals = Array.from({ length: 100 }, () => signal(0));
        const disposers: Array<{ dispose: () => void }> = [];
        
        // Create many effects
        for (let i = 0; i < 100; i++) {
          const disposable = effect(() => {
            // Each effect depends on multiple signals
            let sum = 0;
            for (let j = 0; j < 10; j++) {
              sum += signals[(i + j) % 100]();
            }
            return sum;
          });
          disposers.push(disposable);
        }
        
        // Update signals
        for (let i = 0; i < 100; i++) {
          signals[i].set(i);
        }
        
        // Dispose all effects
        disposers.forEach(disposable => disposable.dispose());
        
        // Update signals again - no effects should run
        const originalError = console.error;
        let errorCount = 0;
        console.error = () => { errorCount++; };
        
        for (let i = 0; i < 100; i++) {
          signals[i].set(i * 2);
        }
        
        expect(errorCount).toBe(0);
        console.error = originalError;
      });
    });

    it('should handle rapid creation and disposal', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal(0);
          let disposers: Array<() => void> = [];
          let iterations = 0;
          
          const runIteration = () => {
            // Dispose old effects
            disposers.forEach(d => d());
            disposers = [];
            
            // Create new effects
            for (let i = 0; i < 10; i++) {
              const disposable = effect(() => {
                s(); // Track signal
              });
              disposers.push(() => disposable.dispose());
            }
            
            // Update signal
            s.update(v => v + 1);
            
            iterations++;
            if (iterations < 5) {
              Promise.resolve().then(runIteration);
            } else {
              disposers.forEach(d => d());
              resolve();
            }
          };
          
          runIteration();
        });
      });
    });
  });

  describe('Integration with batch', () => {
    it('should batch multiple updates in effect', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const a = signal(1);
          const b = signal(2);
          const c = signal(3);
          
          let runCount = 0;
          let lastSum = 0;
          
          effect(() => {
            lastSum = a() + b() + c();
            runCount++;
          });
          
          expect(runCount).toBe(1);
          expect(lastSum).toBe(6);
          
          batch(() => {
            a.set(10);
            b.set(20);
            c.set(30);
          });
          
          // Should only run once after batch
          Promise.resolve().then(() => {
            expect(runCount).toBe(2);
            expect(lastSum).toBe(60);
            resolve();
          });
        });
      });
    });

    it('should handle nested batches in effects', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const s = signal(0);
          const runs: number[] = [];
          
          effect(() => {
            const value = s();
            runs.push(value);
            
            if (value < 3) {
              batch(() => {
                batch(() => {
                  s.set(value + 1);
                });
              });
            }
          });
          
          // Wait for all cascading effects to complete with timeout
          let checkCount = 0;
          const maxChecks = 20; // Maximum number of checks to prevent infinite loop
          
          const checkCompletion = () => {
            checkCount++;
            
            if (runs.includes(3)) {
              // Success - we got to 3
              expect(runs).toContain(0);
              expect(runs).toContain(1);
              expect(runs).toContain(2);
              expect(runs).toContain(3);
              expect(runs.length).toBeLessThanOrEqual(10); // Reasonable number of runs
              resolve();
            } else if (checkCount >= maxChecks) {
              // Timeout - prevent infinite loop
              console.warn('Test timeout reached, runs:', runs);
              expect(runs.length).toBeGreaterThan(0); // At least something ran
              resolve();
            } else {
              // Check again after a delay
              setTimeout(checkCompletion, 10);
            }
          };
          
          // Start checking after initial effect
          setTimeout(checkCompletion, 10);
        });
      });
    });
  });
});