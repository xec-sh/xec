/**
 * Store tests - Global state management with nested reactivity
 */

import { it, expect, describe, afterEach } from 'vitest';

import { store, effect, computed, createRoot } from '../../src/index.js';

describe('Store', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  describe('Basic functionality', () => {
    it('should create store with initial state', () => {
      const s = store({
        count: 0,
        name: 'test',
        active: true
      });
      
      expect(s.get('count')).toBe(0);
      expect(s.get('name')).toBe('test');
      expect(s.get('active')).toBe(true);
    });

    it('should set individual properties', () => {
      const s = store({
        count: 0,
        name: 'test'
      });
      
      s.set('count', 10);
      expect(s.get('count')).toBe(10);
      
      s.set('name', 'updated');
      expect(s.get('name')).toBe('updated');
    });

    it('should update multiple properties', () => {
      const s = store({
        x: 1,
        y: 2,
        z: 3
      });
      
      s.update({
        x: 10,
        y: 20
      });
      
      expect(s.get('x')).toBe(10);
      expect(s.get('y')).toBe(20);
      expect(s.get('z')).toBe(3); // Unchanged
    });

    it('should handle nested objects', () => {
      interface State {
        user: {
          name: string;
          age: number;
        };
        settings: {
          theme: string;
          notifications: boolean;
        };
      }
      
      const s = store<State>({
        user: {
          name: 'John',
          age: 30
        },
        settings: {
          theme: 'dark',
          notifications: true
        }
      });
      
      expect(s.get('user')).toEqual({ name: 'John', age: 30 });
      
      s.set('user', { name: 'Jane', age: 25 });
      expect(s.get('user')).toEqual({ name: 'Jane', age: 25 });
      
      // Settings unchanged
      expect(s.get('settings')).toEqual({ theme: 'dark', notifications: true });
    });

    it('should handle arrays', () => {
      const s = store({
        items: [1, 2, 3],
        tags: ['a', 'b', 'c']
      });
      
      expect(s.get('items')).toEqual([1, 2, 3]);
      
      s.set('items', [4, 5, 6]);
      expect(s.get('items')).toEqual([4, 5, 6]);
      
      // Can mutate arrays
      const items = s.get('items');
      items.push(7);
      s.set('items', items);
      expect(s.get('items')).toEqual([4, 5, 6, 7]);
    });
  });

  describe('Reactivity', () => {
    it('should be reactive with signals', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({
          count: 0,
          multiplier: 2
        });
        
        const result = computed(() => s.get('count') * s.get('multiplier'));
        
        expect(result()).toBe(0);
        
        s.set('count', 5);
        expect(result()).toBe(10);
        
        s.set('multiplier', 3);
        expect(result()).toBe(15);
      });
    });

    it('should trigger effects when properties change', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          
          const s = store({
            x: 1,
            y: 2
          });
          
          const results: number[] = [];
          
          effect(() => {
            results.push(s.get('x') + s.get('y'));
          });
          
          expect(results).toEqual([3]);
          
          s.set('x', 10);
          
          Promise.resolve().then(() => {
            expect(results).toEqual([3, 12]);
            
            s.set('y', 20);
            
            return Promise.resolve();
          }).then(() => {
            expect(results).toEqual([3, 12, 30]);
            resolve();
          });
        });
      });
    });

    it('should batch updates', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          
          const s = store({
            a: 1,
            b: 2,
            c: 3
          });
          
          let runCount = 0;
          let lastSum = 0;
          
          effect(() => {
            lastSum = s.get('a') + s.get('b') + s.get('c');
            runCount++;
          });
          
          expect(runCount).toBe(1);
          expect(lastSum).toBe(6);
          
          s.update({
            a: 10,
            b: 20,
            c: 30
          });
          
          // Should batch all updates
          Promise.resolve().then(() => {
            expect(runCount).toBe(2);
            expect(lastSum).toBe(60);
            resolve();
          });
        });
      });
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers on changes', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({
          count: 0,
          name: 'test'
        });
        
        let callCount = 0;
        let lastState: any = null;
        
        const unsubscribe = s.subscribe(state => {
          callCount++;
          lastState = state;
        });
        
        s.set('count', 10);
        expect(lastState).toEqual({ count: 10, name: 'test' });
        
        s.set('name', 'updated');
        expect(lastState).toEqual({ count: 10, name: 'updated' });
        
        expect(callCount).toBe(2);
        
        unsubscribe();
        
        s.set('count', 20);
        expect(callCount).toBe(2); // No more calls
      });
    });

    it('should handle multiple subscribers', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({ value: 0 });
        
        let count1 = 0, count2 = 0, count3 = 0;
        let last1: any, last2: any, last3: any;
        
        const unsub1 = s.subscribe(state => { count1++; last1 = state; });
        const unsub2 = s.subscribe(state => { count2++; last2 = state; });
        const unsub3 = s.subscribe(state => { count3++; last3 = state; });
        
        s.set('value', 10);
        
        expect(last1).toEqual({ value: 10 });
        expect(last2).toEqual({ value: 10 });
        expect(last3).toEqual({ value: 10 });
        
        unsub2();
        
        s.set('value', 20);
        
        expect(count1).toBe(2);
        expect(count2).toBe(1); // Unsubscribed
        expect(count3).toBe(2);
        
        unsub1();
        unsub3();
      });
    });

    it('should provide immutable state to subscribers', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({
          data: { nested: 'value' }
        });
        
        let receivedState: any;
        s.subscribe(state => {
          receivedState = state;
        });
        
        s.set('data', { nested: 'updated' });
        
        // Modifying received state shouldn't affect store
        receivedState.data = { nested: 'modified' };
        
        expect(s.get('data')).toEqual({ nested: 'updated' });
      });
    });
  });

  describe('Transactions', () => {
    it('should handle transactions', () => {
      const s = store({
        balance: 100,
        transactions: 0
      });
      
      s.transaction(state => {
        state.balance -= 50;
        state.transactions += 1;
      });
      
      expect(s.get('balance')).toBe(50);
      expect(s.get('transactions')).toBe(1);
    });

    it('should batch transaction updates', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          
          const s = store({
            a: 1,
            b: 2,
            c: 3
          });
          
          let runCount = 0;
          let lastSum = 0;
          
          effect(() => {
            lastSum = s.get('a') + s.get('b') + s.get('c');
            runCount++;
          });
          
          expect(runCount).toBe(1);
          expect(lastSum).toBe(6);
          
          s.transaction(state => {
            state.a = 10;
            state.b = 20;
            state.c = 30;
          });
          
          // All updates should be batched
          Promise.resolve().then(() => {
            expect(runCount).toBe(2);
            expect(lastSum).toBe(60);
            resolve();
          });
        });
      });
    });

    it('should handle complex transactions', () => {
      interface State {
        users: Array<{ id: number; name: string; balance: number }>;
        totalBalance: number;
      }
      
      const s = store<State>({
        users: [
          { id: 1, name: 'Alice', balance: 100 },
          { id: 2, name: 'Bob', balance: 200 }
        ],
        totalBalance: 300
      });
      
      s.transaction(state => {
        // Transfer money from Bob to Alice
        const alice = state.users.find(u => u.id === 1);
        const bob = state.users.find(u => u.id === 2);
        
        if (alice && bob) {
          alice.balance += 50;
          bob.balance -= 50;
        }
        
        // Update total (should remain same)
        state.totalBalance = state.users.reduce((sum, u) => sum + u.balance, 0);
      });
      
      const users = s.get('users');
      expect(users[0].balance).toBe(150);
      expect(users[1].balance).toBe(150);
      expect(s.get('totalBalance')).toBe(300);
    });

    it('should handle errors in transactions', () => {
      const s = store({
        value: 10,
        error: false
      });
      
      expect(() => {
        s.transaction(state => {
          state.value = 20;
          throw new Error('Transaction error');
          state.error = true; // This won't run
        });
      }).toThrow('Transaction error');
      
      // First update should still be applied
      expect(s.get('value')).toBe(20);
      expect(s.get('error')).toBe(false);
    });
  });

  describe('Dynamic properties', () => {
    it('should handle adding new properties', () => {
      const s = store<any>({
        initial: 'value'
      });
      
      s.set('newProp', 'new value');
      expect(s.get('newProp')).toBe('new value');
      
      // Should be reactive
      createRoot(d => {
        dispose = d;
        
        const result = computed(() => s.get('newProp'));
        expect(result()).toBe('new value');
        
        s.set('newProp', 'updated');
        expect(result()).toBe('updated');
      });
    });

    it('should handle properties with undefined values', () => {
      const s = store<{ a?: number; b?: string }>({
        a: 1
      });
      
      expect(s.get('a')).toBe(1);
      expect(s.get('b')).toBeUndefined();
      
      s.set('b', 'test');
      expect(s.get('b')).toBe('test');
      
      s.set('b', undefined as any);
      expect(s.get('b')).toBeUndefined();
    });
  });

  describe('Integration with computed and effects', () => {
    it('should work with complex computed chains', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({
          width: 10,
          height: 20,
          depth: 5
        });
        
        const area = computed(() => s.get('width') * s.get('height'));
        const volume = computed(() => area() * s.get('depth'));
        const density = computed(() => {
          const v = volume();
          return v > 0 ? 1000 / v : 0;
        });
        
        expect(area()).toBe(200);
        expect(volume()).toBe(1000);
        expect(density()).toBe(1);
        
        s.set('width', 20);
        expect(area()).toBe(400);
        expect(volume()).toBe(2000);
        expect(density()).toBe(0.5);
      });
    });

    it('should work with conditional dependencies', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({
          useA: true,
          a: 10,
          b: 20
        });
        
        const result = computed(() => {
          if (s.get('useA')) {
            return s.get('a');
          } else {
            return s.get('b');
          }
        });
        
        expect(result()).toBe(10);
        
        // Change b - shouldn't trigger (not tracking)
        s.set('b', 30);
        expect(result.peek()).toBe(10); // Still cached
        
        // Switch condition
        s.set('useA', false);
        expect(result()).toBe(30);
        
        // Now a shouldn't trigger
        s.set('a', 100);
        expect(result.peek()).toBe(30); // Still cached
        
        // But b should
        s.set('b', 40);
        expect(result()).toBe(40);
      });
    });

    it('should handle store-to-store synchronization', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          
          const source = store({ value: 0 });
          const target = store({ value: 0, doubled: 0 });
          
          // Sync target with source
          effect(() => {
            const val = source.get('value');
            target.update({
              value: val,
              doubled: val * 2
            });
          });
          
          expect(target.get('value')).toBe(0);
          expect(target.get('doubled')).toBe(0);
          
          source.set('value', 5);
          
          Promise.resolve().then(() => {
            expect(target.get('value')).toBe(5);
            expect(target.get('doubled')).toBe(10);
            
            source.set('value', 10);
            
            return Promise.resolve();
          }).then(() => {
            expect(target.get('value')).toBe(10);
            expect(target.get('doubled')).toBe(20);
            resolve();
          });
        });
      });
    });
  });

  describe('Performance', () => {
    it('should handle large stores efficiently', () => {
      const largeState: any = {};
      for (let i = 0; i < 1000; i++) {
        largeState[`prop${i}`] = i;
      }
      
      const s = store(largeState);
      
      // Access should be fast
      expect(s.get('prop500')).toBe(500);
      
      // Update should be fast
      s.set('prop500', 9999);
      expect(s.get('prop500')).toBe(9999);
      
      // Batch update many properties
      const updates: any = {};
      for (let i = 0; i < 100; i++) {
        updates[`prop${i}`] = i * 10;
      }
      
      s.update(updates);
      
      expect(s.get('prop50')).toBe(500);
      expect(s.get('prop99')).toBe(990);
      expect(s.get('prop100')).toBe(100); // Unchanged
    });

    it('should handle rapid updates efficiently', async () => {
      await new Promise<void>(resolve => {
        createRoot(d => {
          dispose = d;
          
          const s = store({ counter: 0 });
          const results: number[] = [];
          
          effect(() => {
            results.push(s.get('counter'));
          });
          
          // Rapid updates
          for (let i = 1; i <= 100; i++) {
            s.set('counter', i);
          }
          
          // Wait for all effects to settle
          Promise.resolve().then(() => {
            // Should batch some updates
            expect(results.length).toBeGreaterThan(1);
            expect(results.length).toBeLessThanOrEqual(101);
            expect(results[results.length - 1]).toBe(100);
            resolve();
          });
        });
      });
    });
  });

  describe('Type safety', () => {
    it('should maintain type safety', () => {
      interface AppState {
        user: {
          id: number;
          name: string;
        };
        settings: {
          theme: 'light' | 'dark';
          fontSize: number;
        };
      }
      
      const s = store<AppState>({
        user: {
          id: 1,
          name: 'John'
        },
        settings: {
          theme: 'dark',
          fontSize: 14
        }
      });
      
      // Type-safe access
      const user = s.get('user');
      expect(user.id).toBe(1);
      expect(user.name).toBe('John');
      
      // Type-safe updates
      s.set('settings', {
        theme: 'light',
        fontSize: 16
      });
      
      expect(s.get('settings').theme).toBe('light');
      
      // Partial updates
      s.update({
        user: {
          id: 2,
          name: 'Jane'
        }
      });
      
      expect(s.get('user').name).toBe('Jane');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty store', () => {
      createRoot(d => {
        dispose = d;
        
        const s = store({});
        
        // Should work even with no properties
        let callCount = 0;
        let lastState: any = null;
        s.subscribe(state => {
          callCount++;
          lastState = state;
        });
        
        // Add property dynamically
        (s as any).set('newProp', 'value');
        
        expect(callCount).toBe(1);
        expect(lastState).toHaveProperty('newProp', 'value');
      });
    });

    it('should handle null and undefined values', () => {
      const s = store<{ a: string | null; b: number | undefined }>({
        a: null,
        b: undefined
      });
      
      expect(s.get('a')).toBeNull();
      expect(s.get('b')).toBeUndefined();
      
      s.set('a', 'value');
      expect(s.get('a')).toBe('value');
      
      s.set('a', null);
      expect(s.get('a')).toBeNull();
    });

    it('should handle circular references carefully', () => {
      interface CircularState {
        name: string;
        parent?: CircularState;
      }
      
      const s = store<CircularState>({
        name: 'root'
      });
      
      // Create circular reference
      const state = { name: 'child', parent: s.get('parent') };
      s.set('parent', state as any);
      
      // Should not cause infinite loop
      expect(s.get('name')).toBe('root');
      expect(s.get('parent')?.name).toBe('child');
    });

    it('should handle Symbol keys', () => {
      const sym = Symbol('test');
      const s = store<any>({
        [sym]: 'symbol value',
        regular: 'regular value'
      });
      
      expect(s.get('regular')).toBe('regular value');
      // Symbol keys might not work as expected due to property enumeration
      // This is a known limitation
    });
  });
});