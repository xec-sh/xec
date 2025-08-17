import { describe, it, expect, vi } from 'vitest';
import { signal, effect, batch, createRoot } from '../../src/index.js';

describe('Sequential Updates', () => {
  describe('Effects outside of batch', () => {
    it('should trigger effect for each sequential signal update', () => {
      const dispose = createRoot((dispose) => {
        const counter = signal(0);
        const values: number[] = [];
        
        effect(() => {
          values.push(counter());
        });
        
        // Initial value
        expect(values).toEqual([0]);
        
        // Sequential updates outside of batch
        counter.set(1);
        counter.set(2);
        
        // Should capture all updates
        expect(values).toEqual([0, 1, 2]);
        
        return dispose;
      });
      
      dispose();
    });

    it('should trigger effect multiple times for multiple set calls', () => {
      const dispose = createRoot((dispose) => {
        const sig = signal('initial');
        const effectFn = vi.fn();
        
        effect(() => {
          effectFn(sig());
        });
        
        expect(effectFn).toHaveBeenCalledTimes(1);
        expect(effectFn).toHaveBeenCalledWith('initial');
        
        sig.set('first');
        expect(effectFn).toHaveBeenCalledTimes(2);
        expect(effectFn).toHaveBeenNthCalledWith(2, 'first');
        
        sig.set('second');
        expect(effectFn).toHaveBeenCalledTimes(3);
        expect(effectFn).toHaveBeenNthCalledWith(3, 'second');
        
        sig.set('third');
        expect(effectFn).toHaveBeenCalledTimes(4);
        expect(effectFn).toHaveBeenNthCalledWith(4, 'third');
        
        return dispose;
      });
      
      dispose();
    });

    it('should handle rapid updates correctly', () => {
      const dispose = createRoot((dispose) => {
        const num = signal(0);
        const log: number[] = [];
        
        effect(() => {
          log.push(num());
        });
        
        // Rapid updates
        for (let i = 1; i <= 5; i++) {
          num.set(i);
        }
        
        // Should capture all values
        expect(log).toEqual([0, 1, 2, 3, 4, 5]);
        
        return dispose;
      });
      
      dispose();
    });
  });

  describe('Effects inside batch', () => {
    it('should trigger effect only once with final value when batched', () => {
      const dispose = createRoot((dispose) => {
        const counter = signal(0);
        const values: number[] = [];
        
        effect(() => {
          values.push(counter());
        });
        
        // Initial value
        expect(values).toEqual([0]);
        
        // Batched updates
        batch(() => {
          counter.set(1);
          counter.set(2);
          counter.set(3);
        });
        
        // Should only capture final value
        expect(values).toEqual([0, 3]);
        
        return dispose;
      });
      
      dispose();
    });

    it('should batch multiple signal updates', () => {
      const dispose = createRoot((dispose) => {
        const sig1 = signal(0);
        const sig2 = signal(0);
        const effectFn = vi.fn();
        
        effect(() => {
          effectFn(sig1() + sig2());
        });
        
        expect(effectFn).toHaveBeenCalledTimes(1);
        expect(effectFn).toHaveBeenCalledWith(0);
        
        batch(() => {
          sig1.set(1);
          sig2.set(2);
          sig1.set(3);
          sig2.set(4);
        });
        
        // Effect should run once with final values
        expect(effectFn).toHaveBeenCalledTimes(2);
        expect(effectFn).toHaveBeenNthCalledWith(2, 7); // 3 + 4
        
        return dispose;
      });
      
      dispose();
    });
  });

  describe('Mixed scenarios', () => {
    it('should handle alternating batched and non-batched updates', () => {
      const dispose = createRoot((dispose) => {
        const sig = signal(0);
        const log: number[] = [];
        
        effect(() => {
          log.push(sig());
        });
        
        expect(log).toEqual([0]);
        
        // Non-batched
        sig.set(1);
        sig.set(2);
        
        expect(log).toEqual([0, 1, 2]);
        
        // Batched
        batch(() => {
          sig.set(3);
          sig.set(4);
          sig.set(5);
        });
        
        expect(log).toEqual([0, 1, 2, 5]);
        
        // Non-batched again
        sig.set(6);
        sig.set(7);
        
        expect(log).toEqual([0, 1, 2, 5, 6, 7]);
        
        return dispose;
      });
      
      dispose();
    });

    it('should handle nested batches correctly', () => {
      const dispose = createRoot((dispose) => {
        const sig = signal(0);
        const log: number[] = [];
        
        effect(() => {
          log.push(sig());
        });
        
        expect(log).toEqual([0]);
        
        batch(() => {
          sig.set(1);
          
          batch(() => {
            sig.set(2);
            sig.set(3);
          });
          
          sig.set(4);
        });
        
        // Should only run once with final value
        expect(log).toEqual([0, 4]);
        
        return dispose;
      });
      
      dispose();
    });

    it('should handle effects that modify their dependencies with depth limit', () => {
      const dispose = createRoot((dispose) => {
        const counter = signal(0);
        let runCount = 0;
        
        effect(() => {
          runCount++;
          const value = counter();
          
          // Effect modifies its own dependency
          // This will run up to MAX_EFFECT_DEPTH times synchronously
          if (value < 200) { // Try to set a very high value
            counter.set(value + 1);
          }
        });
        
        // Should run up to the depth limit, then stop
        // The exact value depends on MAX_EFFECT_DEPTH (100)
        expect(runCount).toBeGreaterThan(0);
        expect(runCount).toBeLessThanOrEqual(101); // Initial + up to 100 depth
        
        // The counter value should be at least partially updated
        expect(counter()).toBeGreaterThan(0);
        expect(counter()).toBeLessThanOrEqual(100);
        
        return dispose;
      });
      
      dispose();
    });
  });

  describe('Regression test for issue #06-sample', () => {
    it('should produce correct output for example 06-sample.ts', () => {
      const output: string[] = [];
      
      // Mock console.log
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        output.push(args.join(' '));
      };
      
      try {
        const dispose = createRoot((dispose) => {
          const counter = signal(0);
          
          effect(() => {
            console.log('Counter:', counter());
          });
          
          counter.set(1);
          counter.set(2);
          
          return dispose;
        });
        
        dispose();
        
        // Verify output matches expected
        expect(output).toEqual([
          'Counter: 0',
          'Counter: 1',
          'Counter: 2'
        ]);
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
  });
});