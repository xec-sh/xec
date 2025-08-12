/**
 * Phase 2 Improvements Tests
 * Tests for deep reactivity, dependency graph, and performance optimizations
 */

import { it, expect, describe, afterEach, beforeEach, vi } from 'vitest';

import {
  batch,
  signal,
  effect,
  computed,
  createRoot,
  deepStore,
  type DeepStoreType
} from '../../src/core/reactive/index.js';

import {
  DependencyGraph,
  globalDependencyGraph,
  exportDependencyGraph,
  exportDependencyGraphAsDot
} from '../../src/core/reactive/dependency-graph.js';

describe('Phase 2: Deep Reactivity', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  describe('Deep Store with Proxy', () => {
    it('should track nested object changes', () => {
      const updates: string[] = [];
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          user: {
            profile: {
              name: 'John',
              settings: {
                theme: 'dark',
                notifications: {
                  email: true,
                  push: false
                }
              }
            },
            posts: [] as { id: number; title: string }[]
          }
        });
        
        // Track deep property
        effect(() => {
          const emailNotif = state.user.profile.settings.notifications.email;
          updates.push(`email: ${emailNotif}`);
        });
        
        expect(updates).toEqual(['email: true']);
        
        // Deep property change should trigger effect
        state.user.profile.settings.notifications.email = false;
        
        expect(updates).toEqual(['email: true', 'email: false']);
      });
    });
    
    it('should handle array mutations', () => {
      const updates: string[] = [];
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          items: [1, 2, 3],
          nested: {
            tags: ['a', 'b', 'c']
          }
        });
        
        effect(() => {
          updates.push(`items: ${state.items.join(',')}`);
        });
        
        effect(() => {
          updates.push(`tags: ${state.nested.tags.join(',')}`);
        });
        
        expect(updates).toEqual(['items: 1,2,3', 'tags: a,b,c']);
        
        // Array push
        state.items.push(4);
        expect(updates).toContain('items: 1,2,3,4');
        
        // Nested array modification
        state.nested.tags.pop();
        expect(updates).toContain('tags: a,b');
        
        // Array methods
        state.items.reverse();
        expect(updates).toContain('items: 4,3,2,1');
        
        // Splice
        state.nested.tags.splice(1, 0, 'x');
        expect(updates).toContain('tags: a,x,b');
      });
    });
    
    it('should support Map and Set', () => {
      const updates: string[] = [];
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          cache: new Map<string, number>([
            ['a', 1],
            ['b', 2]
          ]),
          tags: new Set<string>(['tag1', 'tag2'])
        });
        
        effect(() => {
          updates.push(`cache size: ${state.cache.size}`);
        });
        
        effect(() => {
          updates.push(`tags size: ${state.tags.size}`);
        });
        
        expect(updates).toEqual(['cache size: 2', 'tags size: 2']);
        
        // Map operations
        state.cache.set('c', 3);
        expect(updates).toContain('cache size: 3');
        
        state.cache.delete('a');
        expect(updates).toContain('cache size: 2');
        
        // Set operations
        state.tags.add('tag3');
        expect(updates).toContain('tags size: 3');
        
        state.tags.delete('tag1');
        expect(updates).toContain('tags size: 2');
        
        // Clear operations
        state.cache.clear();
        expect(updates).toContain('cache size: 0');
        
        state.tags.clear();
        expect(updates).toContain('tags size: 0');
      });
    });
    
    it('should batch nested updates efficiently', () => {
      let effectCount = 0;
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          level1: {
            level2: {
              level3: {
                value: 0
              },
              another: 0
            }
          }
        });
        
        effect(() => {
          // Access multiple nested properties
          const v1 = state.level1.level2.level3.value;
          const v2 = state.level1.level2.another;
          effectCount++;
        });
        
        expect(effectCount).toBe(1);
        
        // Multiple updates in batch
        batch(() => {
          state.level1.level2.level3.value = 1;
          state.level1.level2.another = 2;
          state.level1.level2.level3.value = 3;
        });
        
        // Should only trigger effect once
        expect(effectCount).toBe(2);
      });
    });
    
    it('should handle shallow option for performance', () => {
      const updates: string[] = [];
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          reactive: {
            tracked: 'value'
          },
          shallow: {
            notTracked: 'value'
          }
        }, {
          shallow: ['shallow']
        });
        
        effect(() => {
          updates.push(`reactive: ${state.reactive.tracked}`);
        });
        
        // This won't be reactive due to shallow option
        let shallowAccess = '';
        effect(() => {
          shallowAccess = state.shallow.notTracked;
        });
        
        expect(updates).toEqual(['reactive: value']);
        
        // Change reactive property
        state.reactive.tracked = 'new';
        expect(updates).toEqual(['reactive: value', 'reactive: new']);
        
        // Change shallow property - won't trigger effect
        state.shallow.notTracked = 'changed';
        expect(shallowAccess).toBe('value'); // Still old value
      });
    });
    
    it('should handle circular references gracefully', () => {
      interface CircularStructure {
        name: string;
        parent?: CircularStructure;
        children: CircularStructure[];
      }
      
      createRoot(d => {
        dispose = d;
        
        const node1: CircularStructure = {
          name: 'node1',
          children: []
        };
        
        const node2: CircularStructure = {
          name: 'node2',
          parent: node1,
          children: []
        };
        
        node1.children.push(node2);
        
        // Should not cause infinite loop
        const state = deepStore({ root: node1 });
        
        let accessCount = 0;
        effect(() => {
          accessCount++;
          // Access circular structure
          const name = state.root.name;
          const childName = state.root.children[0]?.name;
        });
        
        expect(accessCount).toBe(1);
        
        // Modify should work
        state.root.name = 'modified';
        expect(accessCount).toBe(2);
      });
    });
    
    it('should provide debugging utilities', () => {
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          a: { b: { c: 1 } },
          x: [1, 2, 3],
          y: new Map([['key', 'value']])
        });
        
        // Access some properties to create signals
        effect(() => {
          const _ = state.a.b.c;
          const __ = state.x.length;
        });
        
        // Check signal count
        const signalCount = state.getSignalCount();
        expect(signalCount).toBeGreaterThan(0);
        
        // Get signal paths
        const paths = state.getSignalPaths();
        expect(paths).toContain('a.b.c');
        expect(paths.some(p => p.includes('length'))).toBe(true);
        
        // Export as JSON
        const json = state.toJSON();
        expect(json).toEqual({
          a: { b: { c: 1 } },
          x: [1, 2, 3],
          y: {} // Maps don't serialize directly to JSON
        });
      });
    });
    
    it('should handle complex real-world scenarios', () => {
      interface TodoItem {
        id: number;
        text: string;
        completed: boolean;
        tags: string[];
      }
      
      interface AppState {
        todos: TodoItem[];
        filter: 'all' | 'active' | 'completed';
        searchTerm: string;
        user: {
          name: string;
          preferences: {
            sortBy: 'date' | 'priority';
            showCompleted: boolean;
          };
        };
      }
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore<AppState>({
          todos: [
            { id: 1, text: 'Learn Aura', completed: false, tags: ['learning'] },
            { id: 2, text: 'Build app', completed: false, tags: ['development'] },
            { id: 3, text: 'Write tests', completed: true, tags: ['testing'] }
          ],
          filter: 'all',
          searchTerm: '',
          user: {
            name: 'Developer',
            preferences: {
              sortBy: 'date',
              showCompleted: true
            }
          }
        });
        
        // Computed filtered todos
        const filteredTodos = computed(() => {
          let todos = state.todos;
          
          // Filter by completion status
          if (state.filter === 'active') {
            todos = todos.filter(t => !t.completed);
          } else if (state.filter === 'completed') {
            todos = todos.filter(t => t.completed);
          }
          
          // Filter by search term
          if (state.searchTerm) {
            todos = todos.filter(t => 
              t.text.toLowerCase().includes(state.searchTerm.toLowerCase())
            );
          }
          
          // Filter by user preference
          if (!state.user.preferences.showCompleted) {
            todos = todos.filter(t => !t.completed);
          }
          
          return todos;
        });
        
        expect(filteredTodos().length).toBe(3);
        
        // Change filter
        state.filter = 'active';
        expect(filteredTodos().length).toBe(2);
        
        // Complete a todo
        state.todos[0].completed = true;
        expect(filteredTodos().length).toBe(1);
        
        // Add a tag to a todo
        state.todos[1].tags.push('urgent');
        expect(state.todos[1].tags).toContain('urgent');
        
        // Change user preference
        state.user.preferences.showCompleted = false;
        expect(filteredTodos().length).toBe(1);
        
        // Batch multiple changes
        batch(() => {
          state.filter = 'all';
          state.searchTerm = 'app';
          state.user.preferences.showCompleted = true;
        });
        
        expect(filteredTodos().length).toBe(1);
        expect(filteredTodos()[0].text).toBe('Build app');
      });
    });
  });

  describe('Dependency Graph', () => {
    it('should track dependencies between signals and computeds', () => {
      const graph = new DependencyGraph();
      
      createRoot(d => {
        dispose = d;
        
        const a = signal(1);
        const b = signal(2);
        const c = computed(() => a() + b());
        const derived = computed(() => c() * 2);
        
        // Manually add to graph for testing
        const aId = graph.addSignal(a, 'a');
        const bId = graph.addSignal(b, 'b');
        const cId = graph.addComputed(c, 'c');
        const dId = graph.addComputed(derived, 'd');
        
        // Add dependencies
        graph.addDependency(cId, aId);
        graph.addDependency(cId, bId);
        graph.addDependency(dId, cId);
        
        // Check graph structure
        const viz = graph.visualize();
        expect(viz.nodes.length).toBe(4);
        expect(viz.edges.length).toBe(3);
        expect(viz.depth).toBe(2);
        
        // Topological sort
        const sorted = graph.topologicalSort();
        expect(sorted[0].name).toBe('a');
        expect(sorted[1].name).toBe('b');
        
        // Get dependents
        const aDependents = graph.getDependents(aId);
        expect(aDependents.some(n => n.name === 'c')).toBe(true);
        
        // Get dependencies
        const dDependencies = graph.getDependencies(dId);
        expect(dDependencies.some(n => n.name === 'c')).toBe(true);
      });
    });
    
    it('should detect cycles', () => {
      const graph = new DependencyGraph();
      
      const a = signal(1);
      const aId = graph.addSignal(a, 'a');
      const bId = graph.addComputed(a, 'b'); // Reuse signal for testing
      const cId = graph.addComputed(a, 'c');
      
      // Create a cycle: a -> b -> c -> a
      graph.addDependency(aId, bId);
      graph.addDependency(bId, cId);
      graph.addDependency(cId, aId);
      
      const cycles = graph.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain(aId);
      expect(cycles[0]).toContain(bId);
      expect(cycles[0]).toContain(cId);
    });
    
    it('should generate DOT format for visualization', () => {
      const graph = new DependencyGraph();
      
      const a = signal(1);
      const b = computed(() => a() * 2);
      
      const aId = graph.addSignal(a, 'signal-a');
      const bId = graph.addComputed(b, 'computed-b');
      
      graph.addDependency(bId, aId);
      
      const dot = graph.toDot();
      expect(dot).toContain('digraph DependencyGraph');
      expect(dot).toContain('signal-a');
      expect(dot).toContain('computed-b');
      expect(dot).toContain('->');
      expect(dot).toContain('fillcolor=lightblue'); // Signal color
      expect(dot).toContain('fillcolor=lightgreen'); // Computed color
    });
    
    it('should provide graph statistics', () => {
      const graph = new DependencyGraph();
      
      // Build a complex graph
      const signals = Array.from({ length: 5 }, (_, i) => {
        const s = signal(i);
        return graph.addSignal(s, `signal-${i}`);
      });
      
      const computeds = Array.from({ length: 3 }, (_, i) => {
        const c = signal(0); // Use signal as placeholder
        return graph.addComputed(c, `computed-${i}`);
      });
      
      // Add dependencies
      graph.addDependency(computeds[0], signals[0]);
      graph.addDependency(computeds[0], signals[1]);
      graph.addDependency(computeds[1], signals[2]);
      graph.addDependency(computeds[2], computeds[0]);
      graph.addDependency(computeds[2], computeds[1]);
      
      const stats = graph.getStats();
      expect(stats.nodeCount).toBe(8);
      expect(stats.signalCount).toBe(5);
      expect(stats.computedCount).toBe(3);
      expect(stats.edgeCount).toBe(5);
      expect(stats.maxDepth).toBeGreaterThan(0);
      expect(stats.averageDependencies).toBeGreaterThan(0);
    });
  });

  describe('Performance Optimizations', () => {
    it('should handle large numbers of nested properties efficiently', () => {
      const startTime = performance.now();
      
      createRoot(d => {
        dispose = d;
        
        // Create a deeply nested structure
        const createNestedObject = (depth: number): any => {
          if (depth === 0) return { value: Math.random() };
          return {
            child: createNestedObject(depth - 1),
            value: Math.random()
          };
        };
        
        const state = deepStore({
          root: createNestedObject(10) // 10 levels deep
        });
        
        let accessCount = 0;
        
        // Access deeply nested property
        effect(() => {
          let current = state.root;
          for (let i = 0; i < 10; i++) {
            current = current.child;
          }
          accessCount++;
          const _ = current.value;
        });
        
        expect(accessCount).toBe(1);
        
        // Modify deeply nested property
        let current = state.root;
        for (let i = 0; i < 10; i++) {
          current = current.child;
        }
        current.value = 42;
        
        expect(accessCount).toBe(2);
      });
      
      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeLessThan(100); // Should be fast
    });
    
    it('should optimize array operations', () => {
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          items: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            value: Math.random()
          }))
        });
        
        let updateCount = 0;
        
        // Track array length
        effect(() => {
          const _ = state.items.length;
          updateCount++;
        });
        
        expect(updateCount).toBe(1);
        
        const startTime = performance.now();
        
        // Batch array operations
        batch(() => {
          state.items.push({ id: 1001, value: 1 });
          state.items.push({ id: 1002, value: 2 });
          state.items.pop();
        });
        
        const elapsed = performance.now() - startTime;
        
        expect(updateCount).toBe(2); // Only one update after batch
        expect(elapsed).toBeLessThan(10);
        expect(state.items.length).toBe(1001);
      });
    });
    
    it('should handle Map/Set operations efficiently', () => {
      createRoot(d => {
        dispose = d;
        
        const state = deepStore({
          cache: new Map<number, string>(),
          tags: new Set<string>()
        });
        
        // Populate with data
        for (let i = 0; i < 100; i++) {
          state.cache.set(i, `value-${i}`);
          state.tags.add(`tag-${i}`);
        }
        
        let mapSizeUpdates = 0;
        let setSizeUpdates = 0;
        
        effect(() => {
          const _ = state.cache.size;
          mapSizeUpdates++;
        });
        
        effect(() => {
          const _ = state.tags.size;
          setSizeUpdates++;
        });
        
        // Reset counters after initial setup
        mapSizeUpdates = 0;
        setSizeUpdates = 0;
        
        const startTime = performance.now();
        
        // Batch operations
        batch(() => {
          for (let i = 0; i < 10; i++) {
            state.cache.delete(i);
            state.tags.delete(`tag-${i}`);
          }
        });
        
        const elapsed = performance.now() - startTime;
        
        expect(mapSizeUpdates).toBe(1);
        expect(setSizeUpdates).toBe(1);
        expect(elapsed).toBeLessThan(10);
        expect(state.cache.size).toBe(90);
        expect(state.tags.size).toBe(90);
      });
    });
  });

  describe('Integration with existing reactive system', () => {
    it('should work with signals and computeds', () => {
      createRoot(d => {
        dispose = d;
        
        const multiplier = signal(2);
        const state = deepStore({
          values: [1, 2, 3]
        });
        
        const sum = computed(() => {
          return state.values.reduce((acc, val) => acc + val * multiplier(), 0);
        });
        
        expect(sum()).toBe(12); // (1+2+3) * 2
        
        // Change multiplier
        multiplier.set(3);
        expect(sum()).toBe(18); // (1+2+3) * 3
        
        // Change array
        state.values.push(4);
        expect(sum()).toBe(30); // (1+2+3+4) * 3
        
        // Batch changes
        batch(() => {
          multiplier.set(1);
          state.values[0] = 10;
        });
        
        expect(sum()).toBe(19); // (10+2+3+4) * 1
      });
    });
    
    it('should maintain type safety', () => {
      interface TypedState {
        user: {
          id: number;
          name: string;
          roles: string[];
        };
        settings: {
          theme: 'light' | 'dark';
          notifications: boolean;
        };
      }
      
      createRoot(d => {
        dispose = d;
        
        const state = deepStore<TypedState>({
          user: {
            id: 1,
            name: 'Admin',
            roles: ['admin', 'user']
          },
          settings: {
            theme: 'dark',
            notifications: true
          }
        });
        
        // TypeScript should enforce types
        state.user.id = 2; // OK
        state.user.name = 'Super Admin'; // OK
        state.settings.theme = 'light'; // OK
        
        // @ts-expect-error - Type error should be caught
        // state.settings.theme = 'blue';
        
        // Array methods should be typed
        state.user.roles.push('moderator');
        expect(state.user.roles).toContain('moderator');
        
        // Methods should be available
        const json = state.toJSON();
        expect(json.user.name).toBe('Super Admin');
      });
    });
  });
});