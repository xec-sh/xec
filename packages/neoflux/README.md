# NeoFlux

High-performance, fine-grained reactive state management system inspired by SolidJS.

[![npm version](https://img.shields.io/npm/v/@xec-sh/neoflux.svg)](https://www.npmjs.com/package/@xec-sh/neoflux)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-green.svg)](package.json)

## Features

- 🚀 **Zero Dependencies** - Lightweight and standalone
- ⚡ **Fine-Grained Reactivity** - Only update what changes
- 💎 **Diamond Dependency Resolution** - Handles complex dependency graphs efficiently
- 🔄 **Batched Updates** - Automatic batching for optimal performance
- 🧹 **Automatic Cleanup** - Memory-safe with automatic resource disposal
- 📦 **Deep Reactive Stores** - Proxy-based reactivity for nested objects
- 🔍 **TypeScript First** - Full TypeScript support with excellent type inference
- 🎯 **Predictable** - Synchronous and glitch-free updates
- 🏎️ **High Performance** - Optimized with caching, pooling, and smart invalidation

## Installation

```bash
npm install @xec-sh/neoflux
# or
yarn add @xec-sh/neoflux
# or
pnpm add @xec-sh/neoflux
```

## Quick Start

```typescript
import { signal, computed, effect, batch } from '@xec-sh/neoflux';

// Create reactive signals
const [count, setCount] = signal(0);
const [multiplier, setMultiplier] = signal(2);

// Create computed values that auto-update
const doubled = computed(() => count() * 2);
const result = computed(() => count() * multiplier());

// Create side effects that run when dependencies change
effect(() => {
  console.log(`Count: ${count()}, Result: ${result()}`);
});

// Update signals
setCount(5); // Logs: Count: 5, Result: 10

// Batch updates for efficiency
batch(() => {
  setCount(10);
  setMultiplier(3);
}); // Logs once: Count: 10, Result: 30
```

## Core Concepts

### Signals

Signals are the basic reactive primitive. They hold a value and notify dependents when it changes.

```typescript
const [value, setValue] = signal(initialValue);
```

### Computed

Computed values derive from other reactive values and update automatically.

```typescript
const computed = computed(() => signal1() + signal2());
```

### Effects

Effects run side effects when their dependencies change.

```typescript
const dispose = effect(() => {
  console.log('Value changed:', signal());
});

// Clean up when done
dispose();
```

### Stores

Stores provide reactive objects with nested reactivity.

```typescript
const [store, setStore] = createStore({
  user: { name: 'John', age: 30 },
  settings: { theme: 'dark' }
});

// Update nested values
setStore('user', 'name', 'Jane');
setStore('settings', { theme: 'light' });
```

### Resources

Resources handle async data fetching with loading states.

```typescript
const [user, { loading, error, refetch }] = createResource(
  () => userId(), // Source signal
  async (id) => fetchUser(id) // Fetcher function
);
```

## API Reference

### Reactivity
- `signal<T>(value: T)` - Create a reactive signal
- `computed<T>(fn: () => T)` - Create a computed value
- `effect(fn: () => void)` - Create a side effect
- `batch(fn: () => void)` - Batch multiple updates
- `untrack(fn: () => T)` - Read without tracking

### Lifecycle
- `onMount(fn: () => void)` - Run when component mounts
- `onCleanup(fn: () => void)` - Register cleanup function
- `createRoot(fn: (dispose: () => void) => T)` - Create a reactive root

### Stores
- `createStore<T>(initial: T)` - Create a reactive store
- `produce(fn: (draft: T) => void)` - Immutable updates
- `reconcile(value: T)` - Reconcile store with new value

### Resources
- `createResource<T>(...)` - Create an async resource
- `suspense(fn: () => T)` - Suspend on async resources

### Context
- `createContext<T>(defaultValue: T)` - Create a context
- `useContext<T>(context: Context<T>)` - Use a context value

## License

MIT