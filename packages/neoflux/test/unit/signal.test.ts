/**
 * Signal tests - Basic reactive primitive
 */

import { it, vi, expect, describe } from 'vitest';

import { batch, signal, effect, computed, createRoot } from '../../src/index.js';

describe('Signal', () => {
  describe('Basic operations', () => {
    it('should create a signal with initial value', () => {
      const s = signal(10);
      expect(s()).toBe(10);
    });

    it('should update value with set', () => {
      const s = signal(10);
      s.set(20);
      expect(s()).toBe(20);
    });

    it('should update value with function', () => {
      const s = signal(10);
      s.set(prev => prev + 5);
      expect(s()).toBe(15);
    });

    it('should update value with update method', () => {
      const s = signal(10);
      s.update(prev => prev * 2);
      expect(s()).toBe(20);
    });

    it('should mutate objects in place', () => {
      const s = signal({ count: 0 });
      s.mutate(obj => { obj.count = 5; });
      expect(s().count).toBe(5);
    });

    it('should peek without tracking', () => {
      const s = signal(10);
      expect(s.peek()).toBe(10);
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers on change', () => {
      const s = signal(10);
      const fn = vi.fn();
      
      const unsubscribe = s.subscribe(fn);
      s.set(20);
      
      expect(fn).toHaveBeenCalledWith(20);
      expect(fn).toHaveBeenCalledTimes(1);
      
      unsubscribe();
    });

    it('should not notify after unsubscribe', () => {
      const s = signal(10);
      const fn = vi.fn();
      
      const unsubscribe = s.subscribe(fn);
      s.set(20);
      expect(fn).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      s.set(30);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not notify if value does not change', () => {
      const s = signal(10);
      const fn = vi.fn();
      
      s.subscribe(fn);
      s.set(10);
      
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('Custom equality', () => {
    it('should use custom equals function', () => {
      const s = signal(
        { value: 1 },
        { equals: (a, b) => a.value === b.value }
      );
      
      const fn = vi.fn();
      s.subscribe(fn);
      
      // Same value, should not notify
      s.set({ value: 1 });
      expect(fn).not.toHaveBeenCalled();
      
      // Different value, should notify
      s.set({ value: 2 });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Computed', () => {
  it('should derive value from signals', () => {
    createRoot(dispose => {
      const a = signal(2);
      const b = signal(3);
      const sum = computed(() => a() + b());
      
      expect(sum()).toBe(5);
      
      a.set(5);
      expect(sum()).toBe(8);
      
      b.set(10);
      expect(sum()).toBe(15);
      
      dispose();
    });
  });

  it('should cache computed values', () => {
    createRoot(dispose => {
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
      
      dispose();
    });
  });

  it('should handle nested computeds', () => {
    createRoot(dispose => {
      const a = signal(1);
      const b = computed(() => a() * 2);
      const c = computed(() => b() * 3);
      
      expect(c()).toBe(6);
      
      a.set(2);
      expect(c()).toBe(12);
      
      dispose();
    });
  });
});

describe('Effect', () => {
  it('should run immediately by default', () => {
    createRoot(dispose => {
      const fn = vi.fn();
      effect(fn);
      
      expect(fn).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  it('should defer if option is set', () => {
    createRoot(dispose => {
      const fn = vi.fn();
      effect(fn, { defer: true });
      
      expect(fn).not.toHaveBeenCalled();
      dispose();
    });
  });

  it('should re-run when dependencies change', async () => {
    await new Promise<void>(resolve => {
      createRoot(dispose => {
        const s = signal(10);
        const fn = vi.fn(() => s());
        
        effect(fn);
        expect(fn).toHaveBeenCalledTimes(1);
        
        s.set(20);
        // Effect runs async, need to wait
        setTimeout(() => {
          expect(fn).toHaveBeenCalledTimes(2);
          dispose();
          resolve();
        }, 0);
      });
    });
  });

  it('should handle cleanup function', async () => {
    await new Promise<void>(resolve => {
      createRoot(dispose => {
        const cleanup = vi.fn();
        const s = signal(10);
        
        effect(() => {
          s();
          return cleanup;
        });
        
        s.set(20);
        setTimeout(() => {
          expect(cleanup).toHaveBeenCalledTimes(1);
          dispose();
          resolve();
        }, 0);
      });
    });
  });
});

describe('Batch', () => {
  it('should batch multiple updates', async () => {
    await new Promise<void>(resolve => {
      createRoot(dispose => {
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
          dispose();
          resolve();
        }, 0);
      });
    });
  });

  it('should handle nested batches', async () => {
    await new Promise<void>(resolve => {
      createRoot(dispose => {
        const s = signal(0);
        const fn = vi.fn(() => s());
        
        effect(fn);
        
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
          dispose();
          resolve();
        }, 0);
      });
    });
  });
});