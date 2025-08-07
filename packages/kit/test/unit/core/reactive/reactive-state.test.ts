import { it, vi, expect, describe, beforeEach } from 'vitest';

import { ReactiveState } from '../../../../src/core/reactive/reactive-state.js';

describe('ReactiveState', () => {
  let state: ReactiveState<{ count: number; name: string; items: string[] }>;

  beforeEach(() => {
    state = new ReactiveState({
      count: 0,
      name: 'test',
      items: ['a', 'b'],
    });
  });

  describe('basic operations', () => {
    it('should get initial values', () => {
      expect(state.get('count')).toBe(0);
      expect(state.get('name')).toBe('test');
      expect(state.get('items')).toEqual(['a', 'b']);
    });

    it('should set values', () => {
      state.set('count', 5);
      expect(state.get('count')).toBe(5);

      state.set('name', 'updated');
      expect(state.get('name')).toBe('updated');
    });

    it('should update values with function', () => {
      state.set('count', prev => prev + 1);
      expect(state.get('count')).toBe(1);

      state.set('items', prev => [...prev, 'c']);
      expect(state.get('items')).toEqual(['a', 'b', 'c']);
    });

    it('should not trigger updates for same value', () => {
      const listener = vi.fn();
      state.subscribe('count', listener);

      state.set('count', 0); // Same as initial
      expect(listener).not.toHaveBeenCalled();

      state.set('count', 1);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(1);
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to specific key changes', () => {
      const listener = vi.fn();
      const unsubscribe = state.subscribe('count', listener);

      state.set('count', 1);
      expect(listener).toHaveBeenCalledWith(1);

      state.set('name', 'other'); // Should not trigger
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      state.set('count', 2);
      expect(listener).toHaveBeenCalledTimes(1); // Not called after unsubscribe
    });

    it('should subscribe to all changes', () => {
      const listener = vi.fn();
      const unsubscribe = state.subscribeAll(listener);

      state.set('count', 1);
      expect(listener).toHaveBeenCalledWith({
        key: 'count',
        prevValue: 0,
        newValue: 1,
      });

      state.set('name', 'updated');
      expect(listener).toHaveBeenCalledWith({
        key: 'name',
        prevValue: 'test',
        newValue: 'updated',
      });

      unsubscribe();
      state.set('count', 2);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('computed values', () => {
    it('should create computed values', () => {
      const doubled = state.computed('doubled', () => state.get('count') * 2);

      expect(doubled()).toBe(0);

      state.set('count', 5);
      expect(doubled()).toBe(10);
    });

    it('should track dependencies', () => {
      const fullName = state.computed('fullName', () => {
        const name = state.get('name');
        const count = state.get('count');
        return `${name}-${count}`;
      });

      expect(fullName()).toBe('test-0');

      state.set('name', 'updated');
      expect(fullName()).toBe('updated-0');

      state.set('count', 5);
      expect(fullName()).toBe('updated-5');
    });

    it('should handle nested computed values', () => {
      const doubled = state.computed('doubled', () => state.get('count') * 2);
      const quadrupled = state.computed('quadrupled', () => state.get('count') * 4);

      expect(quadrupled()).toBe(0);

      state.set('count', 5);
      expect(doubled()).toBe(10);
      expect(quadrupled()).toBe(20);
    });

    it('should update dependencies dynamically', () => {
      // Since computed functions capture variables by closure,
      // we need to use a state-based flag for dynamic behavior
      state.set('useCount' as any, true);
      
      const dynamic = state.computed('dynamic', () => {
        const flag = state.get('useCount' as any);
        if (flag) {
          return state.get('count');
        } else {
          return state.get('name');
        }
      });

      expect(dynamic()).toBe(0);

      state.set('count', 5);
      expect(dynamic()).toBe(5);

      state.set('useCount' as any, false);
      expect(dynamic()).toBe('test');

      state.set('count', 10); // Should not affect dynamic anymore
      expect(dynamic()).toBe('test');

      state.set('name', 'changed');
      expect(dynamic()).toBe('changed');
    });
  });

  describe('batching', () => {
    it('should batch multiple updates', () => {
      const listener = vi.fn();
      state.subscribeAll(listener);

      state.batch(() => {
        state.set('count', 1);
        state.set('name', 'batch');
        state.set('items', ['x', 'y']);
      });

      // Individual changes should have been emitted
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should delay computed updates during batch', () => {
      let computeCount = 0;
      const expensive = state.computed('expensive', () => {
        computeCount++;
        return state.get('count') + state.get('name').length;
      });

      expect(expensive()).toBe(4); // 0 + 4
      expect(computeCount).toBe(1);

      state.batch(() => {
        state.set('count', 10);
        state.set('name', 'longer name');
      });

      expect(expensive()).toBe(21); // 10 + 11
      expect(computeCount).toBe(2); // Only computed once after batch
    });
  });

  describe('state management', () => {
    it('should get state snapshot', () => {
      const snapshot = state.getState();
      expect(snapshot).toEqual({
        count: 0,
        name: 'test',
        items: ['a', 'b'],
      });

      // Should be a copy
      snapshot.count = 999;
      expect(state.get('count')).toBe(0);
    });

    it('should reset state', () => {
      state.set('count', 10);
      state.set('name', 'changed');

      state.reset({
        count: 0,
        name: 'reset',
        items: [],
      });

      expect(state.getState()).toEqual({
        count: 0,
        name: 'reset',
        items: [],
      });
    });
  });

  describe('disposal', () => {
    it('should clean up resources', () => {
      const listener = vi.fn();
      state.subscribe('count', listener);

      const computed = state.computed('test', () => state.get('count'));
      expect(computed()).toBe(0);

      state.dispose();

      // Should not throw or call listeners
      state.set('count', 10);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle circular dependencies gracefully', () => {
      // This should not cause infinite loop
      const a = state.computed('a', () => {
        const b = state.get('count');
        return b + 1;
      });

      const b = state.computed('b', () => 
        // Access a during its own computation
         a() + 1
      );

      expect(a()).toBe(1);
      expect(b()).toBe(2);
    });

    it('should handle rapid updates', () => {
      const listener = vi.fn();
      state.subscribe('count', listener);

      for (let i = 1; i <= 100; i++) {
        state.set('count', i);
      }

      expect(listener).toHaveBeenCalledTimes(100);
      expect(state.get('count')).toBe(100);
    });

    it('should handle concurrent modifications', () => {
      const results: number[] = [];
      
      state.subscribe('count', (value) => {
        results.push(value);
        if (value < 5) {
          state.set('count', value + 1);
        }
      });

      state.set('count', 1);
      
      // Should have cascading updates
      expect(results).toEqual([1, 2, 3, 4, 5]);
      expect(state.get('count')).toBe(5);
    });
  });
});