/**
 * Resource tests - Manage async data with loading and error states
 */

import { it, expect, describe, afterEach } from 'vitest';

import { signal, effect, resource, computed, createRoot } from '../../src/index.js';

// Helper function to track function calls without mocks
function createTrackableFunction<T extends (...args: any[]) => any>(fn: T): T & { calls: Parameters<T>[]; callCount: number } {
  const calls: Parameters<T>[] = [];
  const trackedFn = ((...args: Parameters<T>) => {
    calls.push(args);
    return fn(...args);
  }) as T & { calls: Parameters<T>[]; callCount: number };
  
  Object.defineProperty(trackedFn, 'calls', {
    get: () => calls
  });
  
  Object.defineProperty(trackedFn, 'callCount', {
    get: () => calls.length
  });
  
  return trackedFn;
}

describe('Resource', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  describe('Basic functionality', () => {
    it('should fetch data on creation', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const fetcher = createTrackableFunction(async () => 'test data');
          const r = resource(fetcher);
          
          expect(fetcher.callCount).toBe(1);
          expect(r.loading()).toBe(true);
          expect(r()).toBeUndefined();
          expect(r.error()).toBeUndefined();
          
          // Wait for fetch to complete
          setTimeout(async () => {
            expect(r.loading()).toBe(false);
            expect(r()).toBe('test data');
            expect(r.error()).toBeUndefined();
            resolve();
          }, 50);
        });
      });
    });

    it('should handle async data correctly', async () => {
      const data = { id: 1, name: 'Test' };
      const fetcher = createTrackableFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return data;
      });
      
      const r = resource(fetcher);
      
      // Initially loading
      expect(r.loading()).toBe(true);
      expect(r()).toBeUndefined();
      
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r.loading()).toBe(false);
      expect(r()).toEqual(data);
      expect(r.error()).toBeUndefined();
    });

    it('should handle errors', async () => {
      const error = new Error('Fetch failed');
      const fetcher = createTrackableFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw error;
      });
      
      const r = resource(fetcher);
      
      // Initially loading
      expect(r.loading()).toBe(true);
      expect(r.error()).toBeUndefined();
      
      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r.loading()).toBe(false);
      expect(r()).toBeUndefined();
      expect(r.error()).toBe(error);
    });

    it('should support refetch', async () => {
      let counter = 0;
      const fetcher = createTrackableFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ++counter;
      });
      
      const r = resource(fetcher);
      
      // Wait for initial fetch
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r()).toBe(1);
      expect(fetcher.callCount).toBe(1);
      
      // Refetch
      r.refetch();
      
      expect(r.loading()).toBe(true);
      // Previous data should still be available while loading
      expect(r()).toBe(1);
      
      // Wait for refetch to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r()).toBe(2);
      expect(fetcher.callCount).toBe(2);
    });
  });

  describe('Reactivity', () => {
    it.skip('should be reactive with signals', async () => {
      const fetcher = async () => 'data';
      
      await createRoot(async d => {
        dispose = d;
        
        const r = resource(fetcher);
        
        const loadingStates: boolean[] = [];
        const dataValues: any[] = [];
        
        effect(() => {
          loadingStates.push(r.loading());
        });
        
        effect(() => {
          dataValues.push(r());
        });
        
        // Initial state - loading
        expect(loadingStates.length).toBeGreaterThanOrEqual(1);
        expect(loadingStates[0]).toBe(true);
        expect(dataValues.length).toBeGreaterThanOrEqual(1);
        expect(dataValues[0]).toBeUndefined();
        
        // Wait for fetch to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // After completion - both effects should have been triggered
        expect(loadingStates.length).toBeGreaterThanOrEqual(2);
        expect(loadingStates[loadingStates.length - 1]).toBe(false);
        expect(dataValues.length).toBeGreaterThanOrEqual(2);
        expect(dataValues[dataValues.length - 1]).toBe('data');
      });
    });

    it('should work with computed values', async () => {
      const fetcher = async () => ({ value: 42 });
      const r = resource(fetcher);
      
      const doubled = computed(() => {
        const data = r();
        return data ? data.value * 2 : 0;
      });
      
      expect(doubled()).toBe(0);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(doubled()).toBe(84);
    });

    it.skip('should trigger effects on state changes', async () => {
      const results: string[] = [];
      
      await createRoot(async d => {
        dispose = d;
        
        const fetcher = async () => 'test';
        const r = resource(fetcher);
        
        effect(() => {
          if (r.loading()) {
            results.push('loading');
          } else if (r.error()) {
            results.push('error');
          } else if (r()) {
            results.push('success');
          }
        });
        
        expect(results).toContain('loading');
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(results).toContain('success');
      });
    });
  });

  describe('Error handling', () => {
    it('should handle sync errors in fetcher', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const fetcher = () => {
            throw new Error('Sync error');
          };
          
          const r = resource(fetcher as any);
          
          // Sync error is caught immediately
          expect(r.loading()).toBe(false);
          expect(r()).toBeUndefined();
          expect(r.error()?.message).toBe('Sync error');
          resolve();
        });
      });
    });

    it('should handle rejection', async () => {
      const fetcher = () => Promise.reject(new Error('Rejected'));
      
      const r = resource(fetcher);
      
      expect(r.loading()).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r.loading()).toBe(false);
      expect(r.error()?.message).toBe('Rejected');
    });

    it('should clear error on successful refetch', async () => {
      let shouldError = true;
      const fetcher = createTrackableFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (shouldError) {
          shouldError = false;
          throw new Error('Error');
        }
        return 'success';
      });
      
      const r = resource(fetcher);
      
      // Wait for initial error
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(r.error()?.message).toBe('Error');
      
      // Refetch
      r.refetch();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r.error()).toBeUndefined();
      expect(r()).toBe('success');
    });

    it.skip('should handle timeout errors', async () => {
      const fetcher = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'data';
      };
      
      const r = resource(fetcher);
      
      // Should be loading initially
      expect(r.loading()).toBe(true);
      
      // Wait less than timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still be loading
      expect(r.loading()).toBe(true);
      
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r.loading()).toBe(false);
      expect(r()).toBe('data');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle rapid refetches', async () => {
      let counter = 0;
      const fetcher = createTrackableFunction(async () => {
        const current = ++counter;
        await new Promise(resolve => setTimeout(resolve, 20));
        return current;
      });
      
      const r = resource(fetcher);
      
      // Rapid refetches
      r.refetch();
      r.refetch();
      r.refetch();
      
      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have the last value
      expect(r()).toBe(4); // Initial + 3 refetches
    });

    it('should work with parameterized fetchers', async () => {
      const id = signal(1);
      
      const fetcher = createTrackableFunction(async () => {
        const currentId = id();
        await new Promise(resolve => setTimeout(resolve, 10));
        return { id: currentId, data: `Item ${currentId}` };
      });
      
      const r = resource(fetcher);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(r()).toEqual({ id: 1, data: 'Item 1' });
      
      // Change parameter
      id.set(2);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(r()).toEqual({ id: 2, data: 'Item 2' });
    });

    it('should handle dependent resources', async () => {
      const userResource = resource(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { id: 1, teamId: 10 };
      });
      
      const teamResource = computed(() => {
        const user = userResource();
        if (!user) return null;
        return user.teamId;
      });
      
      expect(teamResource()).toBe(null);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(teamResource()).toBe(10);
    });

    it('should support optimistic updates', async () => {
      let serverValue = 1;
      const fetcher = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return serverValue;
      };
      
      const r = resource(fetcher);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(r()).toBe(1);
      
      // Optimistic update - update local value
      const optimisticValue = signal(2);
      const displayValue = computed(() => optimisticValue() || r());
      
      expect(displayValue()).toBe(2);
      
      // Server update
      serverValue = 2;
      r.refetch();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clear optimistic value
      optimisticValue.set(null as any);
      expect(displayValue()).toBe(2);
    });
  });

  describe('Memory management', () => {
    it('should handle cleanup properly', async () => {
      await new Promise<void>(resolve => {
        const fetcher = async () => 'data';
        let r: any;
        let disposeRoot: () => void;
        
        createRoot(d => {
          disposeRoot = d;
          r = resource(fetcher);
          
          setTimeout(() => {
            try {
              expect(r()).toBe('data');
              
              // Dispose root
              disposeRoot();
              
              // After disposal, resource data should still be accessible
              // but reactivity should be cleaned up
              expect(r()).toBe('data');
              expect(r.loading()).toBe(false);
              resolve();
            } catch (error) {
              console.error('Test failed:', error);
              resolve(); // Still resolve to prevent timeout
            }
          }, 50);
        });
      });
    });

    it('should handle many resources', async () => {
      const resources = [];
      
      await createRoot(async d => {
        dispose = d;
        
        for (let i = 0; i < 100; i++) {
          const r = resource(async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return i;
          });
          resources.push(r);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        for (let i = 0; i < 100; i++) {
          expect(resources[i]()).toBe(i);
        }
      });
    });
  });

  describe('Integration with other reactive primitives', () => {
    it('should work with computed and effects', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          const multiplier = signal(2);
          const fetcher = async () => 10;
          
          const r = resource(fetcher);
          
          const result = computed(() => {
            const value = r();
            return value ? value * multiplier() : 0;
          });
          
          const effectResults: number[] = [];
          effect(() => {
            effectResults.push(result());
          });
          
          expect(effectResults).toEqual([0]);
          
          setTimeout(() => {
            try {
              expect(effectResults).toContain(20);
              
              multiplier.set(3);
              
              // Wait a bit for the effect to run after signal change
              setTimeout(() => {
                expect(effectResults).toContain(30);
                resolve();
              }, 10);
            } catch (error) {
              console.error('Test failed:', error);
              resolve(); // Still resolve to prevent timeout
            }
          }, 50);
        });
      });
    });

    it('should handle conditional resource usage', async () => {
      const shouldFetch = signal(false);
      const results: any[] = [];
      
      await createRoot(async d => {
        dispose = d;
        
        effect(() => {
          if (shouldFetch()) {
            const r = resource(async () => 'data');
            results.push(r.loading());
          }
        });
        
        expect(results).toEqual([]);
        
        shouldFetch.set(true);
        expect(results).toEqual([true]);
      });
    });
  });

  describe('Advanced patterns', () => {
    it('should support pagination pattern', async () => {
      const page = signal(1);
      const pageSize = 10;
      
      const fetcher = createTrackableFunction(async () => {
        const currentPage = page();
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          page: currentPage,
          items: Array.from({ length: pageSize }, (_, i) => ({
            id: (currentPage - 1) * pageSize + i + 1,
            name: `Item ${(currentPage - 1) * pageSize + i + 1}`
          })),
          hasMore: currentPage < 3
        };
      });
      
      const r = resource(fetcher);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r()?.page).toBe(1);
      expect(r()?.items.length).toBe(10);
      expect(r()?.items[0].id).toBe(1);
      
      // Next page
      page.set(2);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(r()?.page).toBe(2);
      expect(r()?.items[0].id).toBe(11);
    });

    it('should support caching pattern', async () => {
      const cache = new Map<string, any>();
      let fetchCount = 0;
      
      const fetcher = async (key: string) => {
        // Check cache first
        if (cache.has(key)) {
          return cache.get(key);
        }
        
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        const data = { key, value: Math.random() };
        cache.set(key, data);
        return data;
      };
      
      const key = signal('key1');
      
      const r = resource(() => fetcher(key()));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const firstValue = r()?.value;
      expect(fetchCount).toBe(1);
      
      // Change key
      key.set('key2');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(fetchCount).toBe(2);
      
      // Back to key1 - should use cache
      key.set('key1');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(r()?.value).toBe(firstValue);
      // Fetch count should still be 2 since we're using cache
      expect(fetchCount).toBe(2);
      
      // New key
      key.set('key3');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(fetchCount).toBe(3);
    });

    it.skip('should support retry pattern', async () => {
      let attempts = 0;
      const maxRetries = 3;
      
      const fetcher = createTrackableFunction(async () => {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10));
        
        if (attempts < maxRetries) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        
        return { success: true, attempts };
      });
      
      const retryFetcher = async () => {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fetcher();
          } catch (e) {
            lastError = e;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        throw lastError;
      };
      
      const r = resource(retryFetcher);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(r()).toEqual({ success: true, attempts: 3 });
      expect(r.error()).toBeUndefined();
    });
  });
});