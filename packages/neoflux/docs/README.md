# NeoFlux Documentation

## 📚 Complete Guide to Fine-Grained Reactivity

Welcome to the comprehensive documentation for NeoFlux - a high-performance reactive state management system inspired by SolidJS. This guide will take you from basic concepts to advanced patterns, with real-world examples throughout.

## 📖 Table of Contents

### Getting Started
- **[1. Introduction to Fine-Grained Reactivity](./01-introduction.md)**  
  Understand what reactivity is, why you need it, and how NeoFlux solves common state management problems.

### Core Concepts

- **[2. Signals: The Foundation](./02-signals.md)**  
  Learn about the basic building block of reactivity - signals that hold and track values.

- **[3. Computed Values: Derived State](./03-computed.md)**  
  Discover how to create values that automatically update based on other reactive values.

- **[4. Effects: Managing Side Effects](./04-effects.md)**  
  Master the art of performing side effects in response to state changes.

- **[5. Stores: Deep Reactive Objects](./05-stores.md)**  
  Work with complex nested state using deeply reactive stores.

- **[6. Resources: Async Data Management](./06-resources.md)**  
  Handle asynchronous data fetching with automatic loading and error states.

### Optimization & Advanced Topics

- **[7. Batching & Performance](./07-batching.md)**  
  Optimize your application with batching, debouncing, and performance patterns.

- **[8. Advanced Patterns & Best Practices](./08-advanced.md)**  
  Explore architectural patterns, testing strategies, and real-world solutions.

## 🚀 Quick Start

### Installation

```bash
npm install @xec-sh/neoflux
# or
yarn add @xec-sh/neoflux
# or
pnpm add @xec-sh/neoflux
```

### Your First Reactive App

```javascript
import { signal, computed, effect } from '@xec-sh/neoflux';

// Create reactive state
const count = signal(0);

// Derive computed values
const doubled = computed(() => count() * 2);
const quadrupled = computed(() => doubled() * 2);

// React to changes with effects
effect(() => {
    console.log(`
        Count: ${count()}
        Doubled: ${doubled()}
        Quadrupled: ${quadrupled()}
    `);
});

// Make changes - everything updates automatically!
count.set(1);   // Logs: Count: 1, Doubled: 2, Quadrupled: 4
count.set(2);   // Logs: Count: 2, Doubled: 4, Quadrupled: 8
count.set(3);   // Logs: Count: 3, Doubled: 6, Quadrupled: 12
```

## 🎯 Key Features

### ✨ Fine-Grained Reactivity
Only the exact computations that depend on changed values will update - nothing more, nothing less.

### 🚀 Blazing Fast
- Automatic dependency tracking
- Topological sorting for optimal execution order
- Batched updates prevent redundant calculations
- Zero runtime dependencies

### 🛡️ Type Safe
Full TypeScript support with excellent type inference.

### 💪 Powerful Primitives
- **Signals**: Basic reactive values
- **Computed**: Automatically derived values
- **Effects**: Side effects that run on changes
- **Stores**: Deep reactivity for objects
- **Resources**: Async data management
- **Batch**: Group updates for performance

### 🧩 Composable
Build complex reactive systems from simple, composable primitives.

## 📊 When to Use NeoFlux

### Perfect For:
- **Complex UIs** with interdependent state
- **Real-time applications** requiring instant updates
- **Data dashboards** with computed metrics
- **Form management** with complex validation
- **Terminal UIs** needing efficient rendering
- **State machines** and reactive workflows

### Examples by Complexity:

#### Simple: Counter
```javascript
const counter = signal(0);
const increment = () => counter.update(n => n + 1);
```

#### Medium: Todo List
```javascript
const todos = store({ items: [] });
const activeTodos = computed(() => 
    todos.items.filter(t => !t.completed)
);
```

#### Complex: Real-time Dashboard
```javascript
const dashboard = store({
    metrics: {},
    filters: {},
    timeRange: {}
});

const filteredData = computed(() => 
    applyFilters(dashboard.metrics, dashboard.filters)
);

const aggregatedStats = computed(() => 
    calculateStats(filteredData())
);

const chartData = computed(() => 
    prepareChartData(aggregatedStats(), dashboard.timeRange)
);
```

## 🏗️ Architecture

NeoFlux implements a push-pull reactive system:

1. **Push Phase**: When a signal changes, it notifies all dependents
2. **Pull Phase**: Computations only recalculate when accessed
3. **Batch Phase**: Multiple updates are grouped for efficiency

```
Signal Change → Mark Dependents Stale → Lazy Recomputation → Effects Run
```

## 🔄 Comparison with Other Solutions

| Feature | NeoFlux | MobX | Redux | Zustand |
|---------|---------|------|-------|---------|
| Fine-grained | ✅ | ✅ | ❌ | ❌ |
| No boilerplate | ✅ | ✅ | ❌ | ✅ |
| TypeScript | ✅ | ✅ | ✅ | ✅ |
| Computed values | ✅ | ✅ | ❌* | ❌ |
| Async built-in | ✅ | ❌ | ❌* | ❌ |
| Size | ~15KB | ~60KB | ~10KB | ~8KB |
| Learning curve | Low | Medium | High | Low |

*Requires additional libraries

## 🧪 Testing

NeoFlux is designed to be easily testable:

```javascript
import { signal, computed, effect } from '@xec-sh/neoflux';
import { describe, it, expect } from 'vitest';

describe('Shopping Cart', () => {
    it('should calculate total', () => {
        const items = signal([
            { price: 10, quantity: 2 },
            { price: 5, quantity: 3 }
        ]);
        
        const total = computed(() => 
            items().reduce((sum, item) => 
                sum + item.price * item.quantity, 0
            )
        );
        
        expect(total()).toBe(35);
        
        items.update(list => [...list, { price: 20, quantity: 1 }]);
        expect(total()).toBe(55);
    });
});
```

## 🤝 Contributing

We welcome contributions! NeoFlux is part of the xec-sh monorepo.

## 📄 License

MIT

## 🙏 Acknowledgments

NeoFlux is heavily inspired by:
- [SolidJS](https://www.solidjs.com/) - For the fine-grained reactivity model
- [MobX](https://mobx.js.org/) - For observable patterns
- [Vue Composition API](https://vuejs.org/) - For the composable approach

## 📚 Learning Path

1. **Start here**: [Introduction](./01-introduction.md) - Understand the concepts
2. **Learn basics**: [Signals](./02-signals.md) → [Computed](./03-computed.md) → [Effects](./04-effects.md)
3. **Handle complexity**: [Stores](./05-stores.md) → [Resources](./06-resources.md)
4. **Optimize**: [Batching & Performance](./07-batching.md)
5. **Master**: [Advanced Patterns](./08-advanced.md)

Each guide builds on the previous one, introducing concepts when you need them and explaining why they're necessary.

## 💬 Need Help?

- 📖 Read the [detailed guides](./01-introduction.md)
- 🐛 Report issues on [GitHub](https://github.com/xec-sh/xec/issues)
- 💡 Check [examples](../examples/) for real-world usage

---

Ready to build reactive applications? Start with the [Introduction](./01-introduction.md) →