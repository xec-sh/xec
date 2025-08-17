/**
 * Comprehensive Edge Case Tests for Reactive System
 * Testing all corner cases and unusual scenarios
 */

import { it, expect, describe, afterEach } from 'vitest';

import {
  batch,
  store,
  signal,
  effect,
  untrack,
  computed,
  resource,
  onCleanup,
  createRoot,
  type WritableSignal
} from '../../src/index.js';

describe('Comprehensive Reactive System Tests', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  describe('Signal Edge Cases', () => {
    it('should handle rapid synchronous updates correctly', () => {
      createRoot(d => {
        dispose = d;
        
        const s = signal(0);
        const updates: number[] = [];
        
        effect(() => {
          updates.push(s());
        });
        
        // Clear initial
        updates.length = 0;
        
        // Rapid updates
        for (let i = 1; i <= 10; i++) {
          s.set(i);
        }
        
        // Should capture all updates in sync context
        expect(updates.length).toBeGreaterThan(0);
        expect(updates[updates.length - 1]).toBe(10);
      });
    });
    
    it('should handle undefined, null, and NaN correctly', () => {
      createRoot(d => {
        dispose = d;
        
        const s = signal<any>(undefined);
        const values: any[] = [];
        
        effect(() => {
          values.push(s());
        });
        
        s.set(null);
        s.set(NaN);
        s.set(0);
        s.set(false);
        s.set('');
        
        expect(values).toContain(undefined);
        expect(values).toContain(null);
        expect(values.some(v => Number.isNaN(v))).toBe(true);
        expect(values).toContain(0);
        expect(values).toContain(false);
        expect(values).toContain('');
      });
    });
    
    it('should handle complex object updates with mutations', () => {
      createRoot(d => {
        dispose = d;
        
        const obj = signal({ count: 0, nested: { value: 'test' } });
        let updateCount = 0;
        
        effect(() => {
          obj();
          updateCount++;
        });
        
        updateCount = 0;
        
        // Mutate object
        obj.mutate(o => {
          o.count++;
          o.nested.value = 'changed';
        });
        
        expect(updateCount).toBe(1);
        expect(obj().count).toBe(1);
        expect(obj().nested.value).toBe('changed');
      });
    });
  });
  
  describe('Computed Dependency Resolution', () => {
    it('should resolve diamond dependencies correctly', () => {
      createRoot(d => {
        dispose = d;
        
        const source = signal(1);
        const left = computed(() => source() * 2);
        const right = computed(() => source() + 10);
        const diamond = computed(() => left() + right());
        
        expect(diamond()).toBe(13); // (1*2) + (1+10) = 2 + 11 = 13
        
        source.set(2);
        expect(diamond()).toBe(16); // (2*2) + (2+10) = 4 + 12 = 16
      });
    });
    
    it('should handle computed with async-like patterns', () => {
      createRoot(d => {
        dispose = d;
        
        const loading = signal(true);
        const data = signal<string | null>(null);
        
        const result = computed(() => {
          if (loading()) {
            return 'Loading...';
          }
          return data() || 'No data';
        });
        
        expect(result()).toBe('Loading...');
        
        loading.set(false);
        expect(result()).toBe('No data');
        
        data.set('Success');
        expect(result()).toBe('Success');
      });
    });
    
    it('should handle dynamic computed chains', () => {
      createRoot(d => {
        dispose = d;
        
        const mode = signal<'add' | 'multiply'>('add');
        const a = signal(2);
        const b = signal(3);
        
        const result = computed(() => {
          const m = mode();
          if (m === 'add') {
            return computed(() => a() + b())();
          } else {
            return computed(() => a() * b())();
          }
        });
        
        expect(result()).toBe(5);
        
        mode.set('multiply');
        expect(result()).toBe(6);
        
        a.set(4);
        expect(result()).toBe(12);
      });
    });
  });
  
  describe('Effect Ordering and Timing', () => {
    it('should maintain correct execution order in complex graphs', () => {
      const order: string[] = [];
      
      createRoot(d => {
        dispose = d;
        
        const s1 = signal(0);
        const s2 = signal(0);
        
        const c1 = computed(() => {
          order.push('c1');
          return s1() + 1;
        });
        
        const c2 = computed(() => {
          order.push('c2');
          return s2() + c1();
        });
        
        effect(() => {
          c2();
          order.push('effect');
        });
        
        // Clear initial
        order.length = 0;
        
        // Update both signals
        batch(() => {
          s1.set(1);
          s2.set(1);
        });
        
        // Should compute in dependency order
        const c1Index = order.indexOf('c1');
        const c2Index = order.indexOf('c2');
        const effectIndex = order.indexOf('effect');
        
        expect(c1Index).toBeLessThan(c2Index);
        expect(c2Index).toBeLessThan(effectIndex);
      });
    });
    
    it('should handle effect disposal during execution', () => {
      createRoot(d => {
        dispose = d;
        
        const trigger = signal(0);
        let effectDisposer: (() => void) | null = null;
        let runCount = 0;
        
        createRoot(innerD => {
          effectDisposer = innerD;
          
          effect(() => {
            runCount++;
            const value = trigger();
            
            // Dispose self when reaching threshold
            if (value >= 3) {
              effectDisposer?.();
            }
          });
        });
        
        expect(runCount).toBe(1);
        
        trigger.set(1);
        expect(runCount).toBe(2);
        
        trigger.set(3);
        expect(runCount).toBe(3);
        
        // Should not run anymore
        trigger.set(4);
        trigger.set(5);
        expect(runCount).toBe(3);
      });
    });
  });
  
  describe('Resource Advanced Scenarios', () => {
    it('should handle resource with synchronous errors', async () => {
      await createRoot(async d => {
        dispose = d;
        
        let shouldThrow = true;
        
        const fetcher = async () => {
          if (shouldThrow) {
            throw new Error('Sync error');
          }
          return { data: 'success' };
        };
        
        const res = resource(fetcher);
        
        // Wait a bit
        await new Promise(r => setTimeout(r, 10));
        
        expect(res.error()?.message).toBe('Sync error');
        expect(res.loading()).toBe(false);
        expect(res()).toBeUndefined();
        
        // Fix the error
        shouldThrow = false;
        res.refetch();
        
        await new Promise(r => setTimeout(r, 10));
        
        expect(res.error()).toBeUndefined();
        expect(res()?.data).toBe('success');
      });
    });
    
    it('should handle resource race conditions', async () => {
      await createRoot(async d => {
        dispose = d;
        
        const delay = signal(100);
        let fetchId = 0;
        
        const fetcher = async () => {
          const id = ++fetchId;
          const currentDelay = delay();
          await new Promise(r => setTimeout(r, currentDelay));
          return { id, delay: currentDelay };
        };
        
        const res = resource(fetcher);
        
        // Start with long delay
        await new Promise(r => setTimeout(r, 20));
        
        // Trigger new fetch with short delay
        delay.set(10);
        
        // Wait for second to complete
        await new Promise(r => setTimeout(r, 30));
        
        // Should have result from second fetch (shorter delay)
        expect(res()?.id).toBe(2);
        expect(res()?.delay).toBe(10);
      });
    });
  });
  
  describe('Batch Edge Cases', () => {
    it('should handle exceptions in nested batches', () => {
      createRoot(d => {
        dispose = d;
        
        const s1 = signal(0);
        const s2 = signal(0);
        const s3 = signal(0);
        let effectRuns = 0;
        
        effect(() => {
          s1();
          s2();
          s3();
          effectRuns++;
        });
        
        effectRuns = 0;
        
        expect(() => {
          batch(() => {
            s1.set(1);
            batch(() => {
              s2.set(2);
              throw new Error('Inner batch error');
            });
            s3.set(3); // Won't execute
          });
        }).toThrow('Inner batch error');
        
        // Partial updates should still apply
        expect(s1()).toBe(1);
        expect(s2()).toBe(2);
        expect(s3()).toBe(0);
        
        // Effect should run despite error
        expect(effectRuns).toBeGreaterThan(0);
      });
    });
    
    it('should handle recursive batches correctly', () => {
      createRoot(d => {
        dispose = d;
        
        const counter = signal(0);
        let batchDepth = 0;
        let maxDepth = 0;
        
        const recursiveBatch = (depth: number): void => {
          if (depth <= 0) return;
          
          batch(() => {
            batchDepth++;
            maxDepth = Math.max(maxDepth, batchDepth);
            counter.update(c => c + 1);
            recursiveBatch(depth - 1);
            batchDepth--;
          });
        };
        
        recursiveBatch(5);
        
        expect(counter()).toBe(5);
        expect(maxDepth).toBe(5);
      });
    });
  });
  
  describe('Store Complex Updates', () => {
    it('should handle store with circular references', () => {
      createRoot(d => {
        dispose = d;
        
        interface Node {
          id: number;
          parent?: Node;
          children: Node[];
        }
        
        const root: Node = { id: 1, children: [] };
        const child: Node = { id: 2, parent: root, children: [] };
        root.children.push(child);
        
        const state = store({ root });
        let updateCount = 0;
        
        effect(() => {
          state.get('root');
          updateCount++;
        });
        
        updateCount = 0;
        
        // Update circular structure
        state.set('root', r => ({
          ...r,
          children: [...r.children, { id: 3, parent: r, children: [] }]
        }));
        
        expect(updateCount).toBe(1);
        expect(state.get('root').children.length).toBe(2);
      });
    });
    
    it('should handle store with deep path updates', () => {
      createRoot(d => {
        dispose = d;
        
        const state = store({
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    value: 'deep'
                  }
                }
              }
            }
          }
        });
        
        let accessCount = 0;
        
        effect(() => {
          const value = state.get('level1').level2.level3.level4.level5.value;
          accessCount++;
        });
        
        accessCount = 0;
        
        // Deep update with functional approach
        state.set('level1', l1 => ({
          ...l1,
          level2: {
            ...l1.level2,
            level3: {
              ...l1.level2.level3,
              level4: {
                ...l1.level2.level3.level4,
                level5: {
                  value: 'updated'
                }
              }
            }
          }
        }));
        
        expect(accessCount).toBe(1);
        expect(state.get('level1').level2.level3.level4.level5.value).toBe('updated');
      });
    });
  });
  
  describe('Memory and Performance Stress Tests', () => {
    it('should handle thousands of signals efficiently', () => {
      const startTime = performance.now();
      
      createRoot(d => {
        dispose = d;
        
        const signals = Array.from({ length: 1000 }, (_, i) => signal(i));
        const sum = computed(() => 
          signals.reduce((acc, s) => acc + s(), 0)
        );
        
        expect(sum()).toBe(499500);
        
        // Update many signals
        batch(() => {
          for (let i = 0; i < 100; i++) {
            signals[i].set(1000);
          }
        });
        
        const newSum = sum();
        expect(newSum).toBeGreaterThan(499500);
      });
      
      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeLessThan(100); // Should be fast
    });
    
    it('should handle deep effect chains without stack overflow', () => {
      createRoot(d => {
        dispose = d;
        
        const signals: WritableSignal<number>[] = [];
        const depth = 100;
        
        // Create chain of effects
        for (let i = 0; i < depth; i++) {
          const s = signal(i);
          signals.push(s);
          
          if (i > 0) {
            effect(() => {
              const prev = signals[i - 1]();
              if (s.peek() < prev) {
                s.set(prev + 1);
              }
            });
          }
        }
        
        // Trigger cascade
        signals[0].set(1000);
        
        // Should propagate through chain
        expect(signals[depth - 1]()).toBeGreaterThanOrEqual(1000);
      });
    });
  });
  
  describe('Untracking Complex Scenarios', () => {
    it('should handle partial untracking in computed', () => {
      createRoot(d => {
        dispose = d;
        
        const tracked = signal(1);
        const untracked1 = signal(10);
        const untracked2 = signal(100);
        
        const mixed = computed(() => {
          const t = tracked();
          const [u1, u2] = untrack(() => [untracked1(), untracked2()]);
          return t + u1 + u2;
        });
        
        expect(mixed()).toBe(111);
        
        // Change untracked - should not recompute
        untracked1.set(20);
        untracked2.set(200);
        expect(mixed()).toBe(111); // Still cached
        
        // Change tracked - should recompute with new untracked values
        tracked.set(2);
        expect(mixed()).toBe(222);
      });
    });
    
    it('should handle untrack in effect with cleanup', () => {
      createRoot(d => {
        dispose = d;
        
        const tracked = signal(0);
        const untracked = signal(0);
        let cleanupCount = 0;
        
        effect(() => {
          const t = tracked();
          const u = untrack(() => untracked());
          
          onCleanup(() => {
            cleanupCount++;
          });
          
          return () => {
            // Additional cleanup
            untrack(() => {
              untracked(); // Should not create dependency
            });
          };
        });
        
        tracked.set(1);
        expect(cleanupCount).toBe(1);
        
        // Changing untracked should not trigger cleanup
        untracked.set(1);
        untracked.set(2);
        expect(cleanupCount).toBe(1);
        
        tracked.set(2);
        expect(cleanupCount).toBe(2);
      });
    });
  });
});