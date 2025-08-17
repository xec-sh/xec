import { describe, bench, expect } from 'vitest';
import { store, type Store } from '../../src/store.optimized.ts.bak';
import { effect } from '../../src/effect.js';
import { batch, createRoot } from '../../src/batch.js';

// Helper to create deeply nested structure
function createDeepNestedObject(depth: number, breadth: number = 3): any {
  if (depth === 0) {
    return {
      value: Math.random(),
      id: Math.random().toString(36),
      timestamp: Date.now()
    };
  }

  const obj: any = {};
  for (let i = 0; i < breadth; i++) {
    obj[`child${i}`] = createDeepNestedObject(depth - 1, breadth);
  }
  obj.metadata = {
    level: depth,
    nodeCount: breadth
  };
  return obj;
}

// Helper to get a deep path
function getDeepPath(depth: number): string[] {
  const path = [];
  for (let i = 0; i < depth; i++) {
    path.push('child1');
  }
  path.push('value');
  return path;
}

// Helper to set nested value
function setNestedValue(obj: any, path: string[], value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

// Helper to get nested value
function getNestedValue(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    current = current[key];
  }
  return current;
}

describe('Deep Nested Store Benchmarks', () => {
  describe('Creation Performance', () => {
    bench('create store with depth=5', () => {
      const data = createDeepNestedObject(5);
      const s = store(data);
    });

    bench('create store with depth=10', () => {
      const data = createDeepNestedObject(10);
      const s = store(data);
    });

    bench('create store with depth=15', () => {
      const data = createDeepNestedObject(15);
      const s = store(data);
    });
  });

  describe('Deep Read Performance', () => {
    const depth5Data = createDeepNestedObject(5);
    const depth10Data = createDeepNestedObject(10);
    const depth15Data = createDeepNestedObject(15);

    let store5: any;
    let store10: any;
    let store15: any;

    createRoot(() => {
      store5 = store(depth5Data);
      store10 = store(depth10Data);
      store15 = store(depth15Data);
    });

    bench('read at depth=5', () => {
      const path = getDeepPath(5);
      let current = store5;
      for (const key of path) {
        current = current[key];
      }
    });

    bench('read at depth=10', () => {
      const path = getDeepPath(10);
      let current = store10;
      for (const key of path) {
        current = current[key];
      }
    });

    bench('read at depth=15', () => {
      const path = getDeepPath(15);
      let current = store15;
      for (const key of path) {
        current = current[key];
      }
    });
  });

  describe('Deep Write Performance', () => {
    bench('write at depth=5', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(5);
        const s = store(data);
        const path = getDeepPath(5);

        // Perform write
        let current = s;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }
        current[path[path.length - 1]] = Math.random();

        dispose();
      });
    });

    bench('write at depth=10', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(10);
        const s = store(data);
        const path = getDeepPath(10);

        // Perform write
        let current = s;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }
        current[path[path.length - 1]] = Math.random();

        dispose();
      });
    });

    bench('write at depth=15', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(15);
        const s = store(data);
        const path = getDeepPath(15);

        // Perform write
        let current = s;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }
        current[path[path.length - 1]] = Math.random();

        dispose();
      });
    });
  });

  describe('Batch Update Performance', () => {
    bench('batch update 100 properties at depth=5', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(5);
        const s = store(data);

        batch(() => {
          for (let i = 0; i < 100; i++) {
            s.child0.child0.value = i;
            s.child1.child1.value = i;
            s.child2.child0.value = i;
          }
        });

        dispose();
      });
    });

    bench('batch update 100 properties at depth=10', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(10);
        const s = store(data);

        batch(() => {
          for (let i = 0; i < 100; i++) {
            s.child0.child0.child0.child0.value = i;
            s.child1.child1.child1.child1.value = i;
            s.child2.child0.child0.child0.value = i;
          }
        });

        dispose();
      });
    });
  });

  describe('Reactive Updates Performance', () => {
    bench('effect tracking at depth=5', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(5);
        const s = store(data);
        let count = 0;

        effect(() => {
          // Access deep property
          const val = s.child1.child1.child1.child1.child1.value;
          count++;
        });

        // Trigger updates
        for (let i = 0; i < 10; i++) {
          s.child1.child1.child1.child1.child1.value = i;
        }

        dispose();
      });
    });

    bench('effect tracking at depth=10', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(10);
        const s = store(data);
        let count = 0;

        effect(() => {
          // Access deep property
          let current = s;
          for (let i = 0; i < 10; i++) {
            current = current.child1;
          }
          const val = current.value;
          count++;
        });

        // Trigger updates
        let current = s;
        for (let i = 0; i < 9; i++) {
          current = current.child1;
        }
        for (let i = 0; i < 10; i++) {
          current.child1.value = i;
        }

        dispose();
      });
    });
  });

  describe('Array Operations in Nested Structure', () => {
    interface NestedArrayData {
      users: {
        id: number;
        name: string;
        posts: {
          id: number;
          title: string;
          comments: {
            id: number;
            text: string;
            replies: {
              id: number;
              text: string;
            }[];
          }[];
        }[];
      }[];
    }

    function createNestedArrayData(userCount: number, postCount: number, commentCount: number): NestedArrayData {
      const users = [];
      for (let u = 0; u < userCount; u++) {
        const posts = [];
        for (let p = 0; p < postCount; p++) {
          const comments = [];
          for (let c = 0; c < commentCount; c++) {
            comments.push({
              id: c,
              text: `Comment ${c}`,
              replies: Array.from({ length: 5 }, (_, r) => ({
                id: r,
                text: `Reply ${r}`
              }))
            });
          }
          posts.push({
            id: p,
            title: `Post ${p}`,
            comments
          });
        }
        users.push({
          id: u,
          name: `User ${u}`,
          posts
        });
      }
      return { users };
    }

    bench('push to deeply nested array', () => {
      createRoot((dispose) => {
        const data = createNestedArrayData(10, 10, 10);
        const s = store(data);

        // Push to deeply nested array
        s.users[5].posts[5].comments.push({
          id: 999,
          text: 'New comment',
          replies: []
        });

        dispose();
      });
    });

    bench('modify deeply nested array item', () => {
      createRoot((dispose) => {
        const data = createNestedArrayData(10, 10, 10);
        const s = store(data);

        // Modify deeply nested item
        s.users[5].posts[5].comments[5].text = 'Modified comment';

        dispose();
      });
    });

    bench('splice deeply nested array', () => {
      createRoot((dispose) => {
        const data = createNestedArrayData(10, 10, 10);
        const s = store(data);

        // Splice deeply nested array
        s.users[5].posts[5].comments.splice(5, 1);

        dispose();
      });
    });
  });

  describe('Memory Usage', () => {
    bench('signal count for depth=5', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(5);
        const s = store(data);

        // Access all properties to create signals
        function traverse(obj: any) {
          for (const key in obj) {
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
              traverse(value);
            }
          }
        }
        traverse(s);

        const signalCount = (s as any).getSignalCount();
        expect(signalCount).toBeGreaterThan(0);

        dispose();
      });
    });

    bench('signal count for depth=10', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(10);
        const s = store(data);

        // Access all properties to create signals
        function traverse(obj: any) {
          for (const key in obj) {
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
              traverse(value);
            }
          }
        }
        traverse(s);

        const signalCount = (s as any).getSignalCount();
        expect(signalCount).toBeGreaterThan(0);

        dispose();
      });
    });
  });

  describe('Subscription Performance', () => {
    bench('subscribe to deep path', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(10);
        const s = store(data);
        let callCount = 0;

        // Subscribe to deep path
        const unsubscribe = (s as any).subscribe('child1.child1.child1.child1.child1.value', (value: any) => {
          callCount++;
        });

        // Trigger updates
        for (let i = 0; i < 100; i++) {
          s.child1.child1.child1.child1.child1.value = i;
        }

        unsubscribe();
        dispose();
      });
    });

    bench('global subscription with deep updates', () => {
      createRoot((dispose) => {
        const data = createDeepNestedObject(5);
        const s = store(data);
        let callCount = 0;

        // Global subscription
        const unsubscribe = (s as any).subscribe((state: any) => {
          callCount++;
        });

        // Trigger deep updates
        for (let i = 0; i < 20; i++) {
          s.child1.child1.child1.child1.child1.value = i;
        }

        unsubscribe();
        dispose();
      });
    });
  });
});