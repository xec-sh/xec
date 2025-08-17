/**
 * Complex Scenarios Test Suite
 * Tests edge cases and complex interactions in the reactive system
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import {
  signal,
  computed,
  effect,
  batch,
  createRoot,
  untrack,
  store,
  resource,
  onCleanup
} from '../../src/index.js';

describe('Complex Reactive Scenarios', () => {
  let dispose: (() => void) | null = null;

  afterEach(() => {
    if (dispose) {
      dispose();
      dispose = null;
    }
  });

  describe('Nested Batch Operations', () => {
    it('should handle deeply nested batches correctly', () => {
      createRoot(d => {
        dispose = d;
        
        const a = signal(1);
        const b = signal(2);
        const c = signal(3);
        
        const sum = computed(() => a() + b() + c());
        const product = computed(() => a() * b() * c());
        const combined = computed(() => sum() + product());
        
        const results: number[] = [];
        effect(() => {
          results.push(combined());
        });
        
        expect(results).toEqual([12]); // 1+2+3=6, 1*2*3=6, 6+6=12
        
        batch(() => {
          a.set(2);
          batch(() => {
            b.set(3);
            batch(() => {
              c.set(4);
            });
          });
        });
        
        expect(results).toEqual([12, 33]); // 2+3+4=9, 2*3*4=24, 9+24=33
      });
    });

    it('should handle interleaved batch and direct updates', () => {
      createRoot(d => {
        dispose = d;
        
        const s = signal(0);
        const double = computed(() => s() * 2);
        const quad = computed(() => double() * 2);
        
        const results: number[] = [];
        effect(() => {
          results.push(quad());
        });
        
        expect(results).toEqual([0]);
        
        batch(() => {
          s.set(1);
          expect(quad()).toBe(4);
          s.set(2);
          expect(quad()).toBe(8);
        });
        
        expect(results).toEqual([0, 8]);
        
        s.set(3); // Direct update outside batch
        expect(results).toEqual([0, 8, 12]);
      });
    });
  });

  describe('Diamond Dependency Patterns', () => {
    it('should handle complex diamond dependencies', () => {
      createRoot(d => {
        dispose = d;
        
        const base = signal(1);
        
        // Create diamond pattern
        const left1 = computed(() => base() * 2);
        const left2 = computed(() => left1() + 1);
        
        const right1 = computed(() => base() * 3);
        const right2 = computed(() => right1() + 2);
        
        const middle = computed(() => base() * 4);
        
        const combined = computed(() => left2() + right2() + middle());
        
        const results: number[] = [];
        effect(() => {
          results.push(combined());
        });
        
        expect(results).toEqual([12]); // (2+1) + (3+2) + 4 = 12
        
        batch(() => {
          base.set(2);
        });
        
        expect(results).toEqual([12, 21]); // (4+1) + (6+2) + 8 = 21
      });
    });

    it('should handle multiple paths to same computed', () => {
      createRoot(d => {
        dispose = d;
        
        const a = signal(1);
        const b = signal(2);
        
        const sum = computed(() => a() + b());
        const product = computed(() => a() * b());
        const diff = computed(() => Math.abs(a() - b()));
        
        // Multiple paths to final computed
        const result1 = computed(() => sum() + product());
        const result2 = computed(() => sum() * diff());
        const final = computed(() => result1() + result2());
        
        const results: number[] = [];
        effect(() => {
          results.push(final());
        });
        
        expect(results).toEqual([8]); // (3+2) + (3*1) = 8
        
        batch(() => {
          a.set(5);
          b.set(3);
        });
        
        expect(results).toEqual([8, 39]); // (8+15) + (8*2) = 39
      });
    });
  });

  describe.skip('Circular Reference Prevention', () => {
    it('should detect and handle circular dependencies gracefully', () => {
      createRoot(d => {
        dispose = d;
        
        const a = signal(1);
        let bValue = 0;
        let cValue = 0;
        
        // Create computeds that would form a cycle if not handled
        const b = computed(() => {
          const aVal = a();
          // Attempt to read c during computation
          const cVal = untrack(() => cValue); // Use untrack to prevent actual circular dependency
          bValue = aVal + cVal;
          return bValue;
        });
        
        const c = computed(() => {
          const bVal = untrack(() => bValue); // Use untrack to prevent actual circular dependency
          cValue = bVal + 1;
          return cValue;
        });
        
        expect(b()).toBe(1);
        expect(c()).toBe(2);
        
        a.set(5);
        expect(b()).toBe(7); // 5 + 2
        expect(c()).toBe(8); // 7 + 1
      });
    });
  });

  describe('Large Scale Updates', () => {
    it('should handle updates to many signals efficiently', () => {
      createRoot(d => {
        dispose = d;
        
        const signals = Array.from({ length: 100 }, (_, i) => signal(i));
        const sum = computed(() => signals.reduce((acc, s) => acc + s(), 0));
        
        let updateCount = 0;
        effect(() => {
          sum();
          updateCount++;
        });
        
        expect(updateCount).toBe(1);
        expect(sum()).toBe(4950); // Sum of 0 to 99
        
        batch(() => {
          signals.forEach((s, i) => s.set(i * 2));
        });
        
        expect(updateCount).toBe(2); // Should only update once after batch
        expect(sum()).toBe(9900); // Sum of 0, 2, 4, ..., 198
      });
    });

    it('should handle deep computed chains', () => {
      createRoot(d => {
        dispose = d;
        
        const base = signal(1);
        
        // Create a chain of computeds
        const computeds: any[] = [computed(() => base() * 2)];
        for (let i = 1; i < 50; i++) {
          const prev = computeds[i - 1];
          computeds.push(computed(() => prev() + 1));
        }
        
        const final = computeds[computeds.length - 1];
        
        let updateCount = 0;
        effect(() => {
          final();
          updateCount++;
        });
        
        expect(updateCount).toBe(1);
        expect(final()).toBe(51); // 2 + 49
        
        batch(() => {
          base.set(2);
        });
        
        expect(updateCount).toBe(2);
        expect(final()).toBe(53); // 4 + 49
      });
    });
  });

  describe.skip('Store with Complex Nested Updates', () => {
    it('should handle nested store updates in batch', () => {
      createRoot(d => {
        dispose = d;
        
        const state = store({
          user: {
            profile: {
              name: 'John',
              age: 30,
              settings: {
                theme: 'dark',
                notifications: true
              }
            },
            posts: [
              { id: 1, title: 'Post 1', likes: 10 },
              { id: 2, title: 'Post 2', likes: 20 }
            ]
          }
        });
        
        const totalLikes = computed(() => 
          state.user.posts.reduce((sum, post) => sum + post.likes, 0)
        );
        
        const userSummary = computed(() => 
          `${state.user.profile.name} (${state.user.profile.age}) - ${totalLikes()} likes`
        );
        
        const results: string[] = [];
        effect(() => {
          results.push(userSummary());
        });
        
        expect(results).toEqual(['John (30) - 30 likes']);
        
        batch(() => {
          state.user.profile.name = 'Jane';
          state.user.profile.age = 25;
          state.user.posts[0].likes = 15;
          state.user.posts.push({ id: 3, title: 'Post 3', likes: 25 });
        });
        
        expect(results).toEqual(['John (30) - 30 likes', 'Jane (25) - 60 likes']);
      });
    });
  });

  describe.skip('Resource with Rapid Updates', () => {
    it('should handle rapid resource updates correctly', async () => {
      await new Promise(resolve => {
        createRoot(async d => {
          dispose = d;
          
          const id = signal(1);
          let fetchCount = 0;
          
          const userData = resource({
            source: () => id(),
            fetcher: async (id) => {
              fetchCount++;
              await new Promise(r => setTimeout(r, 10));
              return { id, name: `User ${id}` };
            }
          });
          
          const results: any[] = [];
          effect(() => {
            const state = userData();
            results.push({
              loading: state.loading,
              data: state.data,
              error: state.error
            });
          });
          
          // Initial state
          expect(results[0]).toEqual({
            loading: true,
            data: undefined,
            error: undefined
          });
          
          // Rapid updates
          id.set(2);
          id.set(3);
          id.set(4);
          
          // Wait for fetches to complete
          await new Promise(r => setTimeout(r, 50));
          
          // Should have fetched the latest value
          expect(fetchCount).toBeGreaterThan(0);
          expect(results[results.length - 1].data).toEqual({ id: 4, name: 'User 4' });
          
          resolve(undefined);
        });
      });
    });
  });

  describe('Memory Cleanup', () => {
    it('should properly clean up dependencies when disposed', () => {
      const s = signal(0);
      let computedExecutions = 0;
      let effectExecutions = 0;
      
      createRoot(d => {
        const c = computed(() => {
          computedExecutions++;
          return s() * 2;
        });
        
        effect(() => {
          effectExecutions++;
          c();
        });
        
        expect(computedExecutions).toBe(1);
        expect(effectExecutions).toBe(1);
        
        s.set(1);
        expect(computedExecutions).toBe(2);
        expect(effectExecutions).toBe(2);
        
        // Dispose the root
        d();
      });
      
      // After disposal, updates should not trigger computations
      s.set(2);
      s.set(3);
      
      expect(computedExecutions).toBe(2); // No new executions
      expect(effectExecutions).toBe(2); // No new executions
    });

    it('should handle cleanup functions in effects', () => {
      createRoot(d => {
        dispose = d;
        
        const s = signal(0);
        const cleanups: number[] = [];
        
        effect(() => {
          const value = s();
          onCleanup(() => {
            cleanups.push(value);
          });
        });
        
        expect(cleanups).toEqual([]);
        
        s.set(1);
        expect(cleanups).toEqual([0]);
        
        s.set(2);
        expect(cleanups).toEqual([0, 1]);
        
        d();
        expect(cleanups).toEqual([0, 1, 2]);
      });
    });
  });

  describe('Performance Optimizations', () => {
    it.skip('should not recompute unchanged values', () => {
      createRoot(d => {
        dispose = d;
        
        const a = signal(1);
        const b = signal(2);
        
        let computeCount = 0;
        const sum = computed(() => {
          computeCount++;
          return a() + b();
        });
        
        let effectCount = 0;
        effect(() => {
          effectCount++;
          sum();
        });
        
        expect(computeCount).toBe(1);
        expect(effectCount).toBe(1);
        
        // Update a but the sum stays the same
        batch(() => {
          a.set(2);
          b.set(1);
        });
        
        expect(computeCount).toBe(2); // Computed did run
        expect(sum()).toBe(3); // Sum is still 3
        // Effect count depends on equals function - default is Object.is
        expect(effectCount).toBe(1); // Effect should not run if value didn't change
      });
    });

    it('should handle equals function correctly', () => {
      createRoot(d => {
        dispose = d;
        
        const s = signal({ value: 1 }, {
          equals: (a, b) => a.value === b.value
        });
        
        let effectCount = 0;
        effect(() => {
          effectCount++;
          s();
        });
        
        expect(effectCount).toBe(1);
        
        // Set to new object with same value
        s.set({ value: 1 });
        expect(effectCount).toBe(1); // Should not trigger effect
        
        // Set to new object with different value
        s.set({ value: 2 });
        expect(effectCount).toBe(2); // Should trigger effect
      });
    });
  });
});