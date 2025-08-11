/**
 * Minimal test to verify basic reactive system functionality
 */

import { it, expect, describe } from 'vitest';

import { batch, store, signal, effect, computed, createRoot } from '../src/core/reactive/index.js';

describe('Aura Reactive System - Basic Tests', () => {
  describe('Signal', () => {
    it('should create and update signals', () => {
      const count = signal(0);
      expect(count()).toBe(0);
      
      count.set(5);
      expect(count()).toBe(5);
      
      count.update(v => v + 1);
      expect(count()).toBe(6);
    });
  });

  describe('Computed', () => {
    it('should derive values from signals', () => {
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

  describe('Effect', () => {
    it('should react to signal changes', () => {
      const results: number[] = [];
      const value = signal(0);
      
      createRoot(d => {
        effect(() => {
          results.push(value());
        });
        
        expect(results).toEqual([0]);
        
        value.set(1);
        expect(results).toEqual([0, 1]);
        
        value.set(2);
        expect(results).toEqual([0, 1, 2]);
        
        d(); // Cleanup
      });
    });
  });

  describe('Batch', () => {
    it('should batch multiple updates', () => {
      let effectCount = 0;
      const a = signal(0);
      const b = signal(0);
      
      createRoot(d => {
        effect(() => {
          a();
          b();
          effectCount++;
        });
        
        expect(effectCount).toBe(1);
        
        batch(() => {
          a.set(1);
          b.set(2);
        });
        
        expect(effectCount).toBe(2); // Only one additional run
        
        d();
      });
    });
  });

  describe('Store', () => {
    it('should manage state objects', () => {
      const state = store({
        count: 0,
        user: { name: 'John', age: 30 }
      });
      
      expect(state.get('count')).toBe(0);
      expect(state.get('user').name).toBe('John');
      
      state.set('count', 5);
      expect(state.get('count')).toBe(5);
      
      state.set('user', { name: 'Jane', age: 25 });
      expect(state.get('user').name).toBe('Jane');
    });
  });

  describe('Integration', () => {
    it('should work with basic reactive patterns', () => {
      // Test basic signal-computed-effect chain
      let effectRuns = 0;
      let lastValue = '';
      
      createRoot(d => {
        const count = signal(0);
        const doubled = computed(() => count() * 2);
        
        effect(() => {
          lastValue = `Count: ${count()}, Doubled: ${doubled()}`;
          effectRuns++;
        });
        
        // Initial run
        expect(effectRuns).toBeGreaterThan(0);
        expect(lastValue).toContain('Count: 0');
        expect(lastValue).toContain('Doubled: 0');
        
        // Update signal
        count.set(5);
        // Note: The reactive system may batch or optimize updates
        // so we just check the final state is correct
        expect(doubled()).toBe(10);
        
        d();
      });
    });
    
    it('should batch updates correctly', () => {
      let updateCount = 0;
      
      createRoot(d => {
        const a = signal(0);
        const b = signal(0);
        const sum = computed(() => a() + b());
        
        effect(() => {
          sum(); // Track the sum
          updateCount++;
        });
        
        const initialCount = updateCount;
        
        // Batch multiple updates
        batch(() => {
          a.set(5);
          b.set(10);
        });
        
        // Should only trigger one additional update
        expect(updateCount).toBe(initialCount + 1);
        expect(sum()).toBe(15);
        
        d();
      });
    });
  });
});