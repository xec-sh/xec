/**
 * State Management Module Tests
 */

import { it, expect, describe } from 'vitest';

import {
  batch,
  untrack,
  createMemo,
  createStore,
  createSignal,
  createEffect
} from '../../src/advanced/state.js';

describe('State Management', () => {
  describe('createSignal', () => {
    it('should create a reactive signal', () => {
      const [count, setCount] = createSignal(0);
      
      expect(count()).toBe(0);
      expect(count.value).toBe(0);
      
      setCount(5);
      expect(count()).toBe(5);
      expect(count.value).toBe(5);
    });
    
    it('should notify subscribers on change', () => {
      const [count, setCount] = createSignal(0);
      let notified = false;
      let newValue = 0;
      
      const dispose = count.subscribe(value => {
        notified = true;
        newValue = value;
      });
      
      setCount(10);
      expect(notified).toBe(true);
      expect(newValue).toBe(10);
      
      dispose.dispose();
    });
  });
  
  describe('createMemo', () => {
    it('should create a computed value', () => {
      const [count, setCount] = createSignal(0);
      const doubled = createMemo(() => count() * 2);
      
      expect(doubled()).toBe(0);
      expect(doubled.value).toBe(0);
      
      setCount(5);
      expect(doubled()).toBe(10);
      expect(doubled.value).toBe(10);
    });
    
    it('should only recompute when dependencies change', () => {
      const [count, setCount] = createSignal(0);
      let computeCount = 0;
      
      const doubled = createMemo(() => {
        computeCount++;
        return count() * 2;
      });
      
      expect(computeCount).toBe(0); // Not computed yet
      
      doubled(); // First access
      expect(computeCount).toBe(1);
      
      doubled(); // Second access (should use cached)
      expect(computeCount).toBe(1);
      
      setCount(5); // Change dependency
      doubled(); // Recompute
      expect(computeCount).toBe(2);
    });
  });
  
  describe('createEffect', () => {
    it('should run effect when dependencies change', async () => {
      const [count, setCount] = createSignal(0);
      let effectCount = 0;
      let effectValue = 0;
      
      const dispose = createEffect(() => {
        effectCount++;
        effectValue = count();
      });
      
      // Wait for initial effect to run
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(effectCount).toBe(1); // Initial run
      expect(effectValue).toBe(0);
      
      setCount(5);
      expect(effectCount).toBe(2); // Ran again
      expect(effectValue).toBe(5);
      
      dispose.dispose();
      
      setCount(10);
      expect(effectCount).toBe(2); // Should not run after dispose
    });
    
    it('should handle cleanup function', async () => {
      const [count, setCount] = createSignal(0);
      let cleanupCount = 0;
      
      const dispose = createEffect(() => {
        count(); // Track dependency
        
        return () => {
          cleanupCount++;
        };
      });
      
      // Wait for initial effect to run
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(cleanupCount).toBe(0);
      
      setCount(5);
      expect(cleanupCount).toBe(1); // Cleanup ran before re-run
      
      dispose.dispose();
      expect(cleanupCount).toBe(2); // Final cleanup
    });
  });
  
  describe('createStore', () => {
    it('should create a reactive store', () => {
      const store = createStore({ count: 0, name: 'test' });
      
      expect(store.state.count).toBe(0);
      expect(store.state.name).toBe('test');
      
      store.set('count', 5);
      expect(store.state.count).toBe(5);
      
      store.update('count', prev => prev + 1);
      expect(store.state.count).toBe(6);
    });
    
    it('should notify subscribers on change', () => {
      const store = createStore({ count: 0 });
      let notified = false;
      let newState: any = null;
      
      const dispose = store.subscribe(state => {
        notified = true;
        newState = state;
      });
      
      store.set('count', 10);
      expect(notified).toBe(true);
      expect(newState.count).toBe(10);
      
      dispose.dispose();
    });
    
    it('should support nested updates', () => {
      const store = createStore({
        user: {
          name: 'John',
          age: 30
        }
      });
      
      store.setIn(['user', 'name'], 'Jane');
      expect(store.state.user.name).toBe('Jane');
      
      store.updateIn(['user', 'age'], age => age + 1);
      expect(store.state.user.age).toBe(31);
    });
  });
  
  describe('batch', () => {
    it('should batch multiple updates', async () => {
      const [count1, setCount1] = createSignal(0);
      const [count2, setCount2] = createSignal(0);
      let effectCount = 0;
      
      createEffect(() => {
        count1();
        count2();
        effectCount++;
      });
      
      // Wait for initial effect to run
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(effectCount).toBe(1); // Initial run
      
      batch(() => {
        setCount1(5);
        setCount2(10);
      });
      
      expect(effectCount).toBe(2); // Only ran once after batch
      expect(count1()).toBe(5);
      expect(count2()).toBe(10);
    });
  });
  
  describe('untrack', () => {
    it('should prevent dependency tracking', async () => {
      const [count, setCount] = createSignal(0);
      const [multiplier] = createSignal(2);
      let effectCount = 0;
      
      createEffect(() => {
        effectCount++;
        const c = count();
        const m = untrack(() => multiplier());
        // Only tracks count, not multiplier
      });
      
      // Wait for initial effect to run
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(effectCount).toBe(1);
      
      setCount(5);
      expect(effectCount).toBe(2); // Effect ran
    });
  });
});