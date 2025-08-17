# Batching & Performance Optimization

## Understanding Update Batching

When multiple signals change, you don't want effects and computeds to run multiple times. NeoFlux automatically batches updates to ensure optimal performance.

```javascript
import { signal, computed, effect, batch } from '@xec-sh/neoflux';

const firstName = signal('John');
const lastName = signal('Doe');

const fullName = computed(() => {
    console.log('Computing full name...');
    return `${firstName()} ${lastName()}`;
});

effect(() => {
    console.log('Effect: Name is', fullName());
});

// Without batching - would compute twice
firstName.set('Jane');  // Triggers computation
lastName.set('Smith');  // Triggers computation again

// With batching - computes once
batch(() => {
    firstName.set('Alice');
    lastName.set('Johnson');
});
// Only one computation and effect run!
```

## Why Batching Matters

### The Problem: Update Storms

Without batching, cascading updates can cause performance issues:

```javascript
// Imagine a complex dependency graph
const a = signal(1);
const b = signal(2);
const c = computed(() => a() + b());
const d = computed(() => c() * 2);
const e = computed(() => c() + d());

let effectRuns = 0;
effect(() => {
    effectRuns++;
    console.log(`Result: ${e()} (effect run #${effectRuns})`);
});

// Without batching:
a.set(2); // c recalculates, d recalculates, e recalculates, effect runs
b.set(3); // c recalculates, d recalculates, e recalculates, effect runs
// Result: 2 full recalculation cycles

// With batching:
batch(() => {
    a.set(2);
    b.set(3);
});
// Result: 1 recalculation cycle - much more efficient!
```

### Real-World Impact

Consider a data dashboard:

```javascript
const data = signal([]);
const filter = signal('all');
const sortBy = signal('date');

const filtered = computed(() => {
    console.log('Filtering...');
    return data().filter(/* complex filter */);
});

const sorted = computed(() => {
    console.log('Sorting...');
    return filtered().sort(/* complex sort */);
});

const stats = computed(() => {
    console.log('Calculating stats...');
    const items = sorted();
    return {
        total: items.length,
        // Complex statistics calculations
    };
});

// Without batch: 3 updates × 3 computations = 9 operations!
function updateDashboard(newData, newFilter, newSort) {
    data.set(newData);     // Triggers all computations
    filter.set(newFilter);  // Triggers all computations again
    sortBy.set(newSort);    // Triggers all computations yet again
}

// With batch: 1 update cycle = 3 operations
function updateDashboardOptimized(newData, newFilter, newSort) {
    batch(() => {
        data.set(newData);
        filter.set(newFilter);
        sortBy.set(newSort);
    }); // All computations run once
}
```

## How Batching Works

NeoFlux uses a two-phase update system:

1. **Notification Phase**: Mark all affected computations as stale
2. **Execution Phase**: Run computations in topological order

```javascript
// Simplified internal process
batch(() => {
    signal1.set(value1); // Mark dependents as stale
    signal2.set(value2); // Mark dependents as stale
    signal3.set(value3); // Mark dependents as stale
}); // Now execute all stale computations once
```

### Topological Sorting

Updates execute in dependency order:

```javascript
const a = signal(1);
const b = computed(() => a() * 2);    // Depends on a
const c = computed(() => b() + a());  // Depends on a and b
const d = computed(() => c() * 2);    // Depends on c

batch(() => {
    a.set(2);
});

// Execution order (guaranteed):
// 1. b recalculates (depends only on a)
// 2. c recalculates (depends on a and b, b is now fresh)
// 3. d recalculates (depends on c, c is now fresh)
```

## Manual Batching

### Basic Batch

```javascript
import { batch } from '@xec-sh/neoflux';

// Batch multiple updates
batch(() => {
    state.user.name = 'Alice';
    state.user.age = 30;
    state.settings.theme = 'dark';
});
// All dependent computations run once
```

### Nested Batches

Batches can be nested - updates flush when the outermost batch completes:

```javascript
batch(() => {
    console.log('Outer batch start');
    signal1.set(1);
    
    batch(() => {
        console.log('Inner batch');
        signal2.set(2);
        signal3.set(3);
    }); // Inner batch doesn't flush yet
    
    signal4.set(4);
}); // All updates flush here
```

### Async Batching

Batching works with async operations:

```javascript
async function loadUserData(userId) {
    const [profile, posts, friends] = await Promise.all([
        fetchProfile(userId),
        fetchPosts(userId),
        fetchFriends(userId)
    ]);
    
    // Batch all state updates
    batch(() => {
        userProfile.set(profile);
        userPosts.set(posts);
        userFriends.set(friends);
        loadingState.set('complete');
    });
}
```

## Transaction Pattern

Stores provide a transaction method for batched updates:

```javascript
const appState = store({
    user: { name: 'John', age: 25 },
    settings: { theme: 'light' }
});

// Transaction automatically batches
appState.transaction(state => {
    state.user.name = 'Jane';
    state.user.age = 26;
    state.settings.theme = 'dark';
});
// Single update notification
```

## Performance Patterns

### Debouncing Updates

Prevent too frequent updates:

```javascript
function createDebouncedSignal(initial, delay = 100) {
    const immediate = signal(initial);
    const debounced = signal(initial);
    let timeout;
    
    effect(() => {
        const value = immediate();
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            debounced.set(value);
        }, delay);
    });
    
    return {
        set: (value) => immediate.set(value),
        get: () => debounced()
    };
}

// Usage
const searchTerm = createDebouncedSignal('', 300);

effect(() => {
    // Only runs after 300ms of no changes
    performSearch(searchTerm.get());
});

// Rapid updates
searchTerm.set('a');
searchTerm.set('ab');
searchTerm.set('abc'); // Only this triggers the effect after 300ms
```

### Throttling Updates

Limit update frequency:

```javascript
function createThrottledSignal(initial, limit = 100) {
    const source = signal(initial);
    const throttled = signal(initial);
    let lastUpdate = 0;
    let scheduled = null;
    
    effect(() => {
        const value = source();
        const now = Date.now();
        
        if (now - lastUpdate >= limit) {
            throttled.set(value);
            lastUpdate = now;
            clearTimeout(scheduled);
            scheduled = null;
        } else if (!scheduled) {
            scheduled = setTimeout(() => {
                throttled.set(source());
                lastUpdate = Date.now();
                scheduled = null;
            }, limit - (now - lastUpdate));
        }
    });
    
    return {
        set: (value) => source.set(value),
        get: () => throttled()
    };
}

// Usage - good for scroll/mouse events
const scrollPos = createThrottledSignal(0, 50);

window.addEventListener('scroll', () => {
    scrollPos.set(window.scrollY); // Throttled to max 20 updates/second
});
```

### Lazy Evaluation

Defer expensive computations:

```javascript
function lazyComputed(fn) {
    let cache;
    let isStale = true;
    const deps = signal(0); // Trigger recomputation
    
    const result = computed(() => {
        deps(); // Track dependency
        if (isStale) {
            cache = fn();
            isStale = false;
        }
        return cache;
    });
    
    return {
        get: () => result(),
        invalidate: () => {
            isStale = true;
            deps.update(n => n + 1);
        }
    };
}

// Usage
const expensiveCalc = lazyComputed(() => {
    console.log('Running expensive calculation...');
    return heavyComputation();
});

console.log(expensiveCalc.get()); // Calculates
console.log(expensiveCalc.get()); // Uses cache

expensiveCalc.invalidate();
console.log(expensiveCalc.get()); // Recalculates
```

### Selective Updates

Update only what's necessary:

```javascript
const list = signal([
    { id: 1, name: 'Item 1', selected: false },
    { id: 2, name: 'Item 2', selected: false }
]);

// Bad: Replace entire array
function selectItem(id) {
    list.set(list().map(item => 
        item.id === id 
            ? { ...item, selected: true }
            : item
    ));
}

// Better: Granular updates with store
const listStore = store({
    items: [
        { id: 1, name: 'Item 1', selected: false },
        { id: 2, name: 'Item 2', selected: false }
    ]
});

function selectItemOptimized(id) {
    const item = listStore.items.find(i => i.id === id);
    if (item) {
        item.selected = true; // Only this property updates
    }
}
```

## Memory Management

### Cleanup Patterns

Prevent memory leaks with proper cleanup:

```javascript
import { createRoot, onCleanup } from '@xec-sh/neoflux';

function createComponent() {
    return createRoot((dispose) => {
        const timer = signal(0);
        
        // Set up interval
        const intervalId = setInterval(() => {
            timer.update(t => t + 1);
        }, 1000);
        
        // Register cleanup
        onCleanup(() => {
            clearInterval(intervalId);
            console.log('Cleaned up timer');
        });
        
        // Effects are automatically cleaned up
        effect(() => {
            console.log('Timer:', timer());
        });
        
        return {
            timer,
            dispose // Return dispose function
        };
    });
}

const component = createComponent();
// Later: clean up everything
component.dispose();
```

### Weak References

Use weak references for cache:

```javascript
class SignalCache {
    private cache = new WeakMap();
    
    getOrCreate(obj, key, factory) {
        if (!this.cache.has(obj)) {
            this.cache.set(obj, new Map());
        }
        
        const objCache = this.cache.get(obj);
        if (!objCache.has(key)) {
            objCache.set(key, factory());
        }
        
        return objCache.get(key);
    }
}

// Objects can be garbage collected
// when no longer referenced elsewhere
```

## Optimization Techniques

### 1. Memoization

Cache expensive computations:

```javascript
function memoize(fn) {
    const cache = new Map();
    
    return (...args) => {
        const key = JSON.stringify(args);
        
        if (!cache.has(key)) {
            cache.set(key, fn(...args));
        }
        
        return cache.get(key);
    };
}

const expensiveOperation = memoize((data) => {
    console.log('Computing...');
    return data.reduce(/* complex operation */);
});

const result = computed(() => {
    return expensiveOperation(data());
});
```

### 2. Virtual Scrolling

Handle large lists efficiently:

```javascript
function createVirtualList(items, itemHeight, containerHeight) {
    const scrollTop = signal(0);
    
    const visibleRange = computed(() => {
        const scroll = scrollTop();
        const start = Math.floor(scroll / itemHeight);
        const end = Math.ceil((scroll + containerHeight) / itemHeight);
        
        return {
            start,
            end,
            offset: start * itemHeight
        };
    });
    
    const visibleItems = computed(() => {
        const range = visibleRange();
        return items().slice(range.start, range.end);
    });
    
    return {
        visibleItems,
        visibleRange,
        scrollTop,
        totalHeight: computed(() => items().length * itemHeight)
    };
}

// Usage
const list = createVirtualList(
    allItems, // Signal with thousands of items
    50,       // Each item is 50px tall
    500       // Container is 500px tall
);

// Only render visible items
effect(() => {
    const range = list.visibleRange();
    const items = list.visibleItems();
    
    renderItems(items, range.offset);
});
```

### 3. Request Coalescing

Combine multiple requests:

```javascript
class BatchedFetcher {
    private pending = new Map();
    private timeout = null;
    
    fetch(id) {
        return new Promise((resolve, reject) => {
            if (!this.pending.has(id)) {
                this.pending.set(id, []);
            }
            
            this.pending.get(id).push({ resolve, reject });
            
            if (!this.timeout) {
                this.timeout = setTimeout(() => this.flush(), 10);
            }
        });
    }
    
    async flush() {
        const ids = Array.from(this.pending.keys());
        const callbacks = new Map(this.pending);
        
        this.pending.clear();
        this.timeout = null;
        
        try {
            const results = await fetch('/api/batch', {
                method: 'POST',
                body: JSON.stringify({ ids })
            }).then(r => r.json());
            
            ids.forEach(id => {
                const cbs = callbacks.get(id);
                const result = results[id];
                
                cbs.forEach(cb => cb.resolve(result));
            });
        } catch (error) {
            callbacks.forEach(cbs => {
                cbs.forEach(cb => cb.reject(error));
            });
        }
    }
}

const fetcher = new BatchedFetcher();

// Multiple requests get batched
Promise.all([
    fetcher.fetch(1),
    fetcher.fetch(2),
    fetcher.fetch(3)
]); // Single HTTP request for all three
```

## Performance Monitoring

### Tracking Updates

Monitor reactive performance:

```javascript
let updateCount = 0;
let computationTime = 0;

const originalComputed = computed;
const timedComputed = (fn, options) => {
    return originalComputed(() => {
        const start = performance.now();
        const result = fn();
        computationTime += performance.now() - start;
        updateCount++;
        return result;
    }, options);
};

// Use timedComputed for monitoring
const heavyCalc = timedComputed(() => {
    return expensiveOperation();
});

// Check performance
setInterval(() => {
    console.log(`Updates: ${updateCount}, Time: ${computationTime.toFixed(2)}ms`);
    updateCount = 0;
    computationTime = 0;
}, 1000);
```

### Detecting Excessive Updates

```javascript
function detectExcessiveUpdates(threshold = 100) {
    const updateCounts = new Map();
    
    return {
        track(name) {
            const count = (updateCounts.get(name) || 0) + 1;
            updateCounts.set(name, count);
            
            if (count > threshold) {
                console.warn(`Excessive updates detected for ${name}: ${count}`);
            }
        },
        
        reset() {
            updateCounts.clear();
        }
    };
}

const monitor = detectExcessiveUpdates();

// Wrap signals to monitor
function monitoredSignal(initial, name) {
    const sig = signal(initial);
    
    return {
        get: sig,
        set: (value) => {
            monitor.track(name);
            sig.set(value);
        }
    };
}
```

## Best Practices Summary

### Do's ✅

1. **Always batch related updates**
```javascript
batch(() => {
    relatedSignal1.set(value1);
    relatedSignal2.set(value2);
});
```

2. **Use transactions for stores**
```javascript
store.transaction(state => {
    // Multiple updates
});
```

3. **Debounce rapid updates**
```javascript
const debounced = createDebouncedSignal(initial, 300);
```

4. **Clean up resources**
```javascript
onCleanup(() => {
    // Cleanup code
});
```

5. **Use lazy evaluation for expensive computations**
```javascript
const lazy = lazyComputed(() => expensiveCalc());
```

### Don'ts ❌

1. **Don't update signals in computed**
```javascript
// WRONG
const bad = computed(() => {
    otherSignal.set(value); // Don't do this!
    return value;
});
```

2. **Don't create infinite loops**
```javascript
// WRONG
effect(() => {
    const val = signal();
    signal.set(val + 1); // Infinite loop!
});
```

3. **Don't forget cleanup**
```javascript
// WRONG
effect(() => {
    setInterval(() => {}, 1000); // Memory leak!
});
```

## Summary

Performance optimization in NeoFlux:

- **Automatic batching** prevents redundant updates
- **Topological sorting** ensures correct execution order
- **Manual batching** for explicit control
- **Debouncing/throttling** for rate limiting
- **Memory management** through proper cleanup
- **Monitoring tools** to detect issues

Next, let's explore [Advanced Patterns](./08-advanced.md) to master complex reactive scenarios and architectural patterns.