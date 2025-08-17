# Signals: The Foundation of Reactivity

## What is a Signal?

A signal is the most basic building block of NeoFlux's reactive system. Think of it as a container that holds a value and notifies anyone interested when that value changes.

```javascript
import { signal } from '@xec-sh/neoflux';

// Create a signal with an initial value
const count = signal(0);

// Read the value
console.log(count()); // 0

// Update the value
count.set(1);
console.log(count()); // 1
```

## Why Do We Need Signals?

Let's start with a problem. Imagine you're building a shopping cart:

```javascript
// Without signals - manual tracking
let itemCount = 5;
let itemPrice = 10;
let total = itemCount * itemPrice; // 50

// When itemCount changes...
itemCount = 6;
// Oops! We forgot to update total. It's still 50!
console.log(total); // 50 (wrong!)
```

This manual approach has problems:
1. You must remember to update dependent values
2. Easy to forget updates, causing bugs
3. Hard to track what depends on what
4. Performance issues from unnecessary updates

Signals solve all these problems:

```javascript
import { signal, computed, effect } from '@xec-sh/neoflux';

// With signals - automatic tracking
const itemCount = signal(5);
const itemPrice = signal(10);
const total = computed(() => itemCount() * itemPrice());

console.log(total()); // 50

itemCount.set(6);
console.log(total()); // 60 - automatically updated!
```

## Creating and Using Signals

### Basic Usage

```javascript
// Create a signal
const name = signal('Alice');

// Read the value (creates dependency when inside computed/effect)
console.log(name()); // "Alice"

// Update the value
name.set('Bob');

// The signal is a function that returns its value
const currentName = name(); // "Bob"
```

### Different Value Types

Signals can hold any JavaScript value:

```javascript
// Primitives
const count = signal(0);
const message = signal('Hello');
const isActive = signal(true);
const nothing = signal(null);

// Objects
const user = signal({ name: 'John', age: 30 });

// Arrays
const items = signal([1, 2, 3]);

// Functions (yes, even functions!)
const callback = signal(() => console.log('Called!'));
```

## Updating Signals

NeoFlux provides three ways to update a signal:

### 1. Direct Setting with `set()`

```javascript
const score = signal(0);

// Set a new value directly
score.set(100);

// Set using a function (gets previous value)
score.set(prev => prev + 10); // 110
```

### 2. Functional Updates with `update()`

```javascript
const counter = signal(0);

// update() is specifically for function updates
counter.update(n => n + 1); // 1
counter.update(n => n * 2); // 2
```

### 3. In-Place Mutation with `mutate()`

For objects and arrays, you can mutate them directly:

```javascript
const user = signal({ name: 'Alice', scores: [10, 20] });

// Mutate the object in place
user.mutate(u => {
    u.name = 'Bob';
    u.scores.push(30);
});

console.log(user()); // { name: 'Bob', scores: [10, 20, 30] }
```

**Important**: Use `mutate()` carefully! It's useful for performance with large objects, but breaks immutability.

## Reading Signals

### Normal Reading (Tracks Dependencies)

When you read a signal inside a computed or effect, it automatically creates a dependency:

```javascript
const firstName = signal('John');
const lastName = signal('Doe');

// This computed depends on both signals
const fullName = computed(() => {
    return firstName() + ' ' + lastName(); // Reading creates dependencies
});

// This effect also depends on firstName
effect(() => {
    console.log('Name is:', firstName());
});

firstName.set('Jane'); // Both fullName and effect update
```

### Peeking (No Dependency Tracking)

Sometimes you want to read a value without creating a dependency:

```javascript
const debugMode = signal(false);
const counter = signal(0);

effect(() => {
    // Always runs when counter changes
    console.log('Counter:', counter());
    
    // Only check debugMode, don't depend on it
    if (debugMode.peek()) {
        console.log('Debug: Counter changed');
    }
});

counter.set(1); // Effect runs
debugMode.set(true); // Effect does NOT run (we used peek)
counter.set(2); // Effect runs and now shows debug message
```

## Subscriptions

You can manually subscribe to signal changes:

```javascript
const temperature = signal(20);

// Subscribe to changes
const unsubscribe = temperature.subscribe(value => {
    console.log('Temperature changed to:', value);
});

temperature.set(25); // Logs: "Temperature changed to: 25"
temperature.set(30); // Logs: "Temperature changed to: 30"

// Stop listening
unsubscribe();
temperature.set(35); // No log
```

## Equality Checking

By default, signals use `Object.is()` to check if a value has changed. You can customize this:

```javascript
// Default behavior - uses Object.is()
const num = signal(1);
num.set(1); // No update, same value
num.set(2); // Updates

// Custom equality for objects
const config = signal(
    { theme: 'dark', fontSize: 14 },
    {
        equals: (a, b) => {
            // Only consider theme changes
            return a.theme === b.theme;
        }
    }
);

config.set({ theme: 'dark', fontSize: 16 }); // No update (theme unchanged)
config.set({ theme: 'light', fontSize: 16 }); // Updates (theme changed)
```

This is useful for:
- Ignoring certain property changes
- Deep equality checks
- Performance optimization

## Common Patterns

### Boolean Toggles

```javascript
const isVisible = signal(false);

// Toggle pattern
const toggle = () => isVisible.set(!isVisible());

// Or using update
const toggle2 = () => isVisible.update(v => !v);
```

### Counters

```javascript
const count = signal(0);

const increment = () => count.update(n => n + 1);
const decrement = () => count.update(n => n - 1);
const reset = () => count.set(0);
```

### Lists

```javascript
const todos = signal([]);

const addTodo = (text) => {
    todos.update(list => [...list, { id: Date.now(), text, done: false }]);
};

const toggleTodo = (id) => {
    todos.update(list => 
        list.map(todo => 
            todo.id === id ? { ...todo, done: !todo.done } : todo
        )
    );
};

const removeTodo = (id) => {
    todos.update(list => list.filter(todo => todo.id !== id));
};
```

### Form Fields

```javascript
const form = {
    username: signal(''),
    email: signal(''),
    password: signal('')
};

// Validation using computed
const isValid = computed(() => {
    const user = form.username();
    const email = form.email();
    const pass = form.password();
    
    return user.length >= 3 && 
           email.includes('@') && 
           pass.length >= 8;
});

// Usage
form.username.set('john_doe');
form.email.set('john@example.com');
form.password.set('secret123');

console.log(isValid()); // true
```

## Advanced Signal Patterns

### Signal Factories

Create signals with predefined behavior:

```javascript
function createCounter(initial = 0) {
    const count = signal(initial);
    
    return {
        value: count,
        increment: () => count.update(n => n + 1),
        decrement: () => count.update(n => n - 1),
        reset: () => count.set(initial)
    };
}

const counter = createCounter(10);
counter.increment();
console.log(counter.value()); // 11
```

### Derived Signals

While `computed` is the proper way to derive values, you can create manually updated derived signals:

```javascript
const celsius = signal(0);
const fahrenheit = signal(32);

// Manual synchronization (not recommended)
celsius.subscribe(c => {
    fahrenheit.set(c * 9/5 + 32);
});

// Better: Use computed (automatic)
const celsius2 = signal(0);
const fahrenheit2 = computed(() => celsius2() * 9/5 + 32);
```

### Signal Validation

Ensure signals always contain valid values:

```javascript
function validatedSignal(initial, validator) {
    const sig = signal(initial);
    
    return {
        get: sig,
        set: (value) => {
            if (validator(value)) {
                sig.set(value);
            } else {
                console.error('Invalid value:', value);
            }
        }
    };
}

const age = validatedSignal(0, n => n >= 0 && n <= 120);
age.set(25); // Works
age.set(-5); // Error: Invalid value: -5
```

## Performance Considerations

### 1. Granular Signals

Instead of one large signal, use multiple smaller ones:

```javascript
// Less efficient - entire object updates
const state = signal({
    user: { name: 'John', age: 30 },
    settings: { theme: 'dark' },
    data: [1, 2, 3]
});

// More efficient - granular updates
const user = signal({ name: 'John', age: 30 });
const settings = signal({ theme: 'dark' });
const data = signal([1, 2, 3]);
```

### 2. Avoid Unnecessary Updates

```javascript
const list = signal([1, 2, 3]);

// Bad: Creates new array every time
const addItem = (item) => {
    list.set([...list(), item]); // Always triggers update
};

// Good: Check if actually different
const addItemSmart = (item) => {
    if (!list().includes(item)) {
        list.set([...list(), item]);
    }
};
```

### 3. Use peek() When Appropriate

```javascript
const debug = signal(false);
const data = signal([]);

effect(() => {
    const items = data(); // Create dependency
    
    // Don't create dependency on debug flag
    if (debug.peek()) {
        console.log('Items:', items);
    }
    
    renderItems(items);
});
```

## Common Pitfalls

### 1. Forgetting to Call the Signal

```javascript
const count = signal(5);

// Wrong - passing the signal itself
console.log(count); // [Function]

// Correct - calling the signal
console.log(count()); // 5
```

### 2. Creating Dependencies Accidentally

```javascript
const a = signal(1);
const b = signal(2);

effect(() => {
    // This effect depends on both a AND b
    if (a() > 0) {
        console.log(b()); // Still creates dependency on b!
    }
});

// Better: Use conditional dependency
effect(() => {
    const aValue = a();
    if (aValue > 0) {
        // Only access b if needed
        console.log(b());
    }
});
```

### 3. Modifying Objects Without Notifying

```javascript
const user = signal({ name: 'John' });

// Wrong - signal doesn't know about the change
user().name = 'Jane';

// Correct - use mutate or set
user.mutate(u => u.name = 'Jane');
// Or
user.set({ ...user(), name: 'Jane' });
```

## Summary

Signals are the foundation of NeoFlux's reactivity:

- **Create** with `signal(initialValue)`
- **Read** with `signal()` (tracks) or `signal.peek()` (doesn't track)
- **Update** with `set()`, `update()`, or `mutate()`
- **Subscribe** manually with `signal.subscribe(callback)`
- **Customize** equality with the `equals` option

Signals alone are powerful, but they truly shine when combined with computed values and effects. Next, let's explore [Computed Values](./03-computed.md) to see how we can build derived state that automatically stays in sync.