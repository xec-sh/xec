import { bench, describe } from 'vitest';
import {
  signal,
  computed,
  effect,
  batch,
  createRoot,
  store,
  type WritableSignal
} from '../../src/index.js';

describe('Signal Performance', () => {
  bench('create 1000 signals', () => {
    const signals: WritableSignal<number>[] = [];
    for (let i = 0; i < 1000; i++) {
      signals.push(signal(i));
    }
  });

  bench('read signal 10000 times', () => {
    const s = signal(0);
    for (let i = 0; i < 10000; i++) {
      s.get();
    }
  });

  bench('write signal 10000 times', () => {
    const s = signal(0);
    for (let i = 0; i < 10000; i++) {
      s.set(i);
    }
  });

  bench('batch write 1000 signals', () => {
    const signals: WritableSignal<number>[] = [];
    for (let i = 0; i < 1000; i++) {
      signals.push(signal(i));
    }
    
    batch(() => {
      for (let i = 0; i < 1000; i++) {
        signals[i].set(i * 2);
      }
    });
  });
});

describe('Computed Performance', () => {
  bench('create simple computed chain (10 levels)', () => {
    const source = signal(0);
    let prev = source as any;
    
    for (let i = 0; i < 10; i++) {
      const comp = computed(() => prev.get() + 1);
      prev = comp;
    }
  });

  bench('read computed 10000 times (cached)', () => {
    const s = signal(0);
    const c = computed(() => s.get() * 2);
    
    for (let i = 0; i < 10000; i++) {
      c.get();
    }
  });

  bench('invalidate and recompute 1000 times', () => {
    const s = signal(0);
    const c = computed(() => s.get() * 2);
    
    for (let i = 0; i < 1000; i++) {
      s.set(i);
      c.get();
    }
  });

  bench('diamond dependency resolution', () => {
    const source = signal(0);
    const left = computed(() => source.get() * 2);
    const right = computed(() => source.get() * 3);
    const diamond = computed(() => left.get() + right.get());
    
    for (let i = 0; i < 1000; i++) {
      source.set(i);
      diamond.get();
    }
  });

  bench('wide dependency graph (100 computeds from 1 signal)', () => {
    const source = signal(0);
    const computeds = [];
    
    for (let i = 0; i < 100; i++) {
      computeds.push(computed(() => source.get() * i));
    }
    
    source.set(1);
    for (const c of computeds) {
      c.get();
    }
  });

  bench('deep dependency graph (100 levels)', () => {
    const source = signal(0);
    let prev = source as any;
    
    for (let i = 0; i < 100; i++) {
      const comp = computed(() => prev.get() + 1);
      prev = comp;
    }
    
    source.set(1);
    prev.get();
  });
});

describe('Effect Performance', () => {
  bench('create and dispose 1000 effects', () => {
    const s = signal(0);
    
    const dispose = createRoot((d) => {
      for (let i = 0; i < 1000; i++) {
        effect(() => {
          s.get();
        });
      }
      return d;
    });
    
    dispose();
  });

  bench('trigger 100 effects', () => {
    const s = signal(0);
    let count = 0;
    
    const dispose = createRoot((d) => {
      for (let i = 0; i < 100; i++) {
        effect(() => {
          s.get();
          count++;
        });
      }
      return d;
    });
    
    for (let i = 0; i < 10; i++) {
      s.set(i);
    }
    
    dispose();
  });

  bench('batched effect updates', () => {
    const signals: WritableSignal<number>[] = [];
    for (let i = 0; i < 100; i++) {
      signals.push(signal(i));
    }
    
    let count = 0;
    const dispose = createRoot((d) => {
      effect(() => {
        for (const s of signals) {
          s.get();
        }
        count++;
      });
      return d;
    });
    
    batch(() => {
      for (let i = 0; i < 100; i++) {
        signals[i].set(i * 2);
      }
    });
    
    dispose();
  });
});

describe('Store Performance', () => {
  bench('create store with nested object', () => {
    const state = store({
      user: {
        id: 1,
        name: 'John',
        settings: {
          theme: 'dark',
          notifications: {
            email: true,
            push: false
          }
        }
      },
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: i * 10
      }))
    });
  });

  bench('read nested property 10000 times', () => {
    const state = store({
      user: {
        settings: {
          theme: 'dark'
        }
      }
    });
    
    for (let i = 0; i < 10000; i++) {
      const theme = state.user.settings.theme;
    }
  });

  bench('write nested property 1000 times', () => {
    const state = store({
      user: {
        settings: {
          theme: 'dark'
        }
      }
    });
    
    for (let i = 0; i < 1000; i++) {
      state.user.settings.theme = i % 2 === 0 ? 'dark' : 'light';
    }
  });

  bench('array operations', () => {
    const state = store({
      items: [] as number[]
    });
    
    // Push 100 items
    for (let i = 0; i < 100; i++) {
      state.items.push(i);
    }
    
    // Modify items
    for (let i = 0; i < 100; i++) {
      state.items[i] = i * 2;
    }
    
    // Remove items
    while (state.items.length > 0) {
      state.items.pop();
    }
  });

  bench('batch store updates', () => {
    const state = store({
      counters: Array.from({ length: 100 }, (_, i) => ({ value: i }))
    });
    
    batch(() => {
      for (let i = 0; i < 100; i++) {
        state.counters[i].value = i * 2;
      }
    });
  });
});

describe('Memory and Cleanup', () => {
  bench('create and dispose 1000 roots', () => {
    for (let i = 0; i < 1000; i++) {
      const dispose = createRoot((d) => {
        const s = signal(i);
        const c = computed(() => s.get() * 2);
        effect(() => {
          c.get();
        });
        return d;
      });
      dispose();
    }
  });

  bench('nested root creation and disposal', () => {
    const outerDispose = createRoot((d1) => {
      for (let i = 0; i < 10; i++) {
        createRoot((d2) => {
          for (let j = 0; j < 10; j++) {
            const s = signal(i * 10 + j);
            effect(() => s.get());
          }
          return d2;
        })();
      }
      return d1;
    });
    outerDispose();
  });
});

describe('Real-world Scenarios', () => {
  bench('todo list with 100 items', () => {
    interface Todo {
      id: number;
      text: string;
      done: boolean;
    }
    
    const todos = store<{ items: Todo[] }>({
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        text: `Todo ${i}`,
        done: false
      }))
    });
    
    const completedCount = computed(() => 
      todos.items.filter(t => t.done).length
    );
    
    const dispose = createRoot((d) => {
      effect(() => {
        const count = completedCount.get();
      });
      return d;
    });
    
    // Toggle all todos
    batch(() => {
      for (let i = 0; i < 100; i++) {
        todos.items[i].done = !todos.items[i].done;
      }
    });
    
    dispose();
  });

  bench('form with 50 fields and validation', () => {
    const form = store({
      fields: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`field${i}`, ''])
      )
    });
    
    const validations = [];
    for (let i = 0; i < 50; i++) {
      validations.push(computed(() => {
        const value = form.fields[`field${i}`];
        return value.length >= 3;
      }));
    }
    
    const isValid = computed(() => 
      validations.every(v => v.get())
    );
    
    const dispose = createRoot((d) => {
      effect(() => {
        const valid = isValid.get();
      });
      return d;
    });
    
    // Update all fields
    batch(() => {
      for (let i = 0; i < 50; i++) {
        form.fields[`field${i}`] = `value${i}`;
      }
    });
    
    dispose();
  });

  bench('reactive chart data (1000 data points)', () => {
    const data = store({
      points: Array.from({ length: 1000 }, (_, i) => ({
        x: i,
        y: Math.sin(i / 100) * 100
      }))
    });
    
    const stats = {
      min: computed(() => Math.min(...data.points.map(p => p.y))),
      max: computed(() => Math.max(...data.points.map(p => p.y))),
      avg: computed(() => {
        const sum = data.points.reduce((acc, p) => acc + p.y, 0);
        return sum / data.points.length;
      })
    };
    
    const dispose = createRoot((d) => {
      effect(() => {
        const min = stats.min.get();
        const max = stats.max.get();
        const avg = stats.avg.get();
      });
      return d;
    });
    
    // Update data
    batch(() => {
      for (let i = 0; i < 1000; i++) {
        data.points[i].y = Math.cos(i / 100) * 100;
      }
    });
    
    dispose();
  });
});