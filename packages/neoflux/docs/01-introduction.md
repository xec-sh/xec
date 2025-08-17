# NeoFlux: Introduction to Fine-Grained Reactivity

## What is Reactivity?

Imagine you're building a dashboard that displays live data. When the data changes, you want the display to update automatically. That's reactivity - the ability for your application to automatically respond to changes in data.

Traditional approaches often require you to manually track what changed and update the UI accordingly. This leads to complex code, bugs, and performance issues. NeoFlux solves this problem with **fine-grained reactivity**.

## What is Fine-Grained Reactivity?

Fine-grained reactivity means that only the exact parts of your application that depend on changed data will update - nothing more, nothing less. Let's understand this with a simple example:

```javascript
// Traditional approach - manual updates
let firstName = 'John';
let lastName = 'Doe';
let fullName = firstName + ' ' + lastName;

// When firstName changes...
firstName = 'Jane';
// You must manually update fullName
fullName = firstName + ' ' + lastName; // Manual work!
```

With NeoFlux's fine-grained reactivity:

```javascript
import { signal, computed } from '@xec-sh/neoflux';

// Create reactive values
const firstName = signal('John');
const lastName = signal('Doe');

// fullName automatically updates when dependencies change
const fullName = computed(() => firstName() + ' ' + lastName());

console.log(fullName()); // "John Doe"

firstName.set('Jane');
console.log(fullName()); // "Jane Doe" - automatically updated!
```

## Core Concepts

NeoFlux is built on four fundamental concepts that work together to create a powerful reactive system:

### 1. **Signals** - Reactive Values
Signals are containers for values that notify observers when they change. Think of them as "smart variables" that know who's watching them.

```javascript
const count = signal(0);
console.log(count()); // Read: 0
count.set(1);         // Write: triggers updates
```

### 2. **Computed** - Derived Values
Computed values automatically recalculate when their dependencies change. They're like Excel formulas - always up to date.

```javascript
const price = signal(100);
const quantity = signal(2);
const total = computed(() => price() * quantity());

console.log(total()); // 200
quantity.set(3);
console.log(total()); // 300 - automatically recalculated!
```

### 3. **Effects** - Side Effects
Effects run side effects when their dependencies change. Use them for DOM updates, logging, or any action that should happen in response to data changes.

```javascript
const message = signal('Hello');

effect(() => {
    console.log('Message changed to:', message());
});
// Logs: "Message changed to: Hello"

message.set('Hi there');
// Logs: "Message changed to: Hi there"
```

### 4. **Stores** - Deep Reactive Objects
Stores make entire objects and their nested properties reactive. Perfect for complex application state.

```javascript
const user = store({
    name: 'John',
    settings: {
        theme: 'dark',
        notifications: true
    }
});

// Every property is reactive
effect(() => {
    console.log('Theme:', user.settings.theme);
});

user.settings.theme = 'light'; // Triggers the effect
```

## Why NeoFlux?

### 1. **Performance**
- Only updates what changed (fine-grained)
- Automatic dependency tracking
- Batched updates prevent unnecessary recalculations
- Topological sorting ensures correct execution order

### 2. **Developer Experience**
- Simple, intuitive API
- No boilerplate code
- TypeScript-first with excellent type inference
- Automatic memory management

### 3. **Predictability**
- Synchronous by default (easier to reason about)
- No hidden asynchronous behavior
- Clear execution order
- Circular dependency detection

### 4. **Flexibility**
- Works anywhere JavaScript runs
- Zero runtime dependencies
- Small bundle size (~15KB minified)
- Can be integrated gradually

## How Does It Work?

NeoFlux uses a dependency graph to track relationships between reactive values:

1. **Reading Creates Dependencies**: When you read a signal inside a computed or effect, NeoFlux automatically tracks that dependency.

2. **Writing Triggers Updates**: When you change a signal, NeoFlux knows exactly which computeds and effects depend on it.

3. **Smart Execution**: Updates are batched and executed in the correct order using topological sorting.

Here's a visual representation:

```
signal(price) ──┐
                ├──> computed(total) ──> effect(updateDisplay)
signal(quantity)┘
```

When either `price` or `quantity` changes, `total` recalculates, which then triggers `updateDisplay`.

## When Should You Use NeoFlux?

NeoFlux is perfect for:

- **Complex UIs** with interdependent data
- **Real-time applications** that need instant updates
- **Data-heavy dashboards** with computed metrics
- **Form validation** with complex rules
- **State management** in any JavaScript application
- **Terminal UIs** that need efficient rendering

## Getting Started

Install NeoFlux:

```bash
npm install @xec-sh/neoflux
# or
yarn add @xec-sh/neoflux
```

Import what you need:

```javascript
import { signal, computed, effect, store } from '@xec-sh/neoflux';
```

Create your first reactive application:

```javascript
// Create reactive state
const todos = store<{ items: { text: string; completed: boolean }[], filter: 'all' | 'active' | 'completed' }>({
  items: [],
  filter: 'all' // 'all', 'active', 'completed'
});

// Computed values
const activeTodos = computed(() =>
  todos.items.filter(todo => !todo.completed)
);

const completedTodos = computed(() =>
  todos.items.filter(todo => todo.completed)
);

const visibleTodos = computed(() => {
  switch (todos.filter) {
    case 'active': return activeTodos();
    case 'completed': return completedTodos();
    default: return todos.items;
  }
});

// Side effects
effect(() => {
  console.log(`You have ${activeTodos().length} active todos`);
});

// Add a todo
todos.items.push({ text: 'Learn NeoFlux', completed: false });
// Logs: "You have 1 active todos"

// Complete it
todos.items[0]!.completed = true;
// Logs: "You have 0 active todos"
```

## What's Next?

Now that you understand the basics, let's dive deeper into each concept:

1. **[Signals: The Foundation](./02-signals.md)** - Master the basic building block
2. **[Computed Values: Derived State](./03-computed.md)** - Learn automatic calculations
3. **[Effects: Managing Side Effects](./04-effects.md)** - Handle external interactions
4. **[Stores: Deep Reactivity](./05-stores.md)** - Work with complex objects
5. **[Resources: Async Data](./06-resources.md)** - Manage asynchronous operations
6. **[Batching & Performance](./07-batching.md)** - Optimize your applications
7. **[Advanced Patterns](./08-advanced.md)** - Master complex scenarios

Each guide builds on the previous one, introducing new concepts when you need them and explaining why they're necessary. By the end, you'll have a complete understanding of fine-grained reactivity and how to use it effectively in your applications.