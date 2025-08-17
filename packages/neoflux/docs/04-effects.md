# Effects: Managing Side Effects

## What is an Effect?

An effect is a function that runs automatically when its reactive dependencies change. Unlike computed values which calculate and return values, effects perform side effects - actions that affect the world outside of the reactive system.

```javascript
import { signal, effect } from '@xec-sh/neoflux';

const count = signal(0);

// This effect runs whenever count changes
effect(() => {
    console.log('Count is now:', count());
});
// Immediately logs: "Count is now: 0"

count.set(1);
// Automatically logs: "Count is now: 1"
```

## Why Do We Need Effects?

Reactive values (signals and computed) are pure - they just hold or calculate data. But real applications need to:
- Update the DOM
- Make API calls
- Save to localStorage
- Log to console
- Interact with external systems

Effects bridge the gap between your reactive state and the outside world.

### The Problem: Manual Synchronization

Without effects, you'd need to manually synchronize external systems:

```javascript
// Without effects - manual synchronization nightmare
const theme = signal('light');
const fontSize = signal(14);

// Manually update DOM
function updateTheme() {
    document.body.className = theme();
    localStorage.setItem('theme', theme());
    console.log('Theme changed to:', theme());
}

// Manually update font
function updateFont() {
    document.body.style.fontSize = fontSize() + 'px';
    localStorage.setItem('fontSize', fontSize().toString());
}

// Remember to call these EVERY time
theme.set('dark');
updateTheme(); // Don't forget!

fontSize.set(16);
updateFont(); // Don't forget!

// What if you forget? The UI is out of sync!
```

### The Solution: Automatic Effects

```javascript
import { signal, effect } from '@xec-sh/neoflux';

const theme = signal('light');
const fontSize = signal(14);

// Automatically sync theme
effect(() => {
    const currentTheme = theme();
    document.body.className = currentTheme;
    localStorage.setItem('theme', currentTheme);
    console.log('Theme changed to:', currentTheme);
});

// Automatically sync font size
effect(() => {
    const size = fontSize();
    document.body.style.fontSize = size + 'px';
    localStorage.setItem('fontSize', size.toString());
});

// Just change the signals - effects run automatically!
theme.set('dark');  // Effect runs, everything syncs
fontSize.set(16);   // Effect runs, everything syncs
```

## How Effects Work

### Execution Lifecycle

1. **Initial Run**: Effects run immediately when created
2. **Dependency Tracking**: During execution, NeoFlux tracks which signals/computed values are read
3. **Re-execution**: When any dependency changes, the effect runs again
4. **Cleanup**: Before re-running, any cleanup function from the previous run is called

```javascript
const name = signal('Alice');
const age = signal(25);

effect(() => {
    console.log('Running effect...');
    console.log(`${name()} is ${age()} years old`);
    
    // Optional cleanup function
    return () => {
        console.log('Cleaning up previous effect');
    };
});
// Logs: "Running effect..."
// Logs: "Alice is 25 years old"

name.set('Bob');
// Logs: "Cleaning up previous effect"
// Logs: "Running effect..."
// Logs: "Bob is 25 years old"
```

### Cleanup Functions

Effects can return a cleanup function that runs before the next execution:

```javascript
const interval = signal(1000);

effect(() => {
    const ms = interval();
    const id = setInterval(() => {
        console.log('Tick!');
    }, ms);
    
    // Cleanup: clear the interval
    return () => {
        clearInterval(id);
        console.log('Interval cleared');
    };
});

// Change interval - old one is cleaned up, new one starts
interval.set(500);
// Logs: "Interval cleared"
// New interval starts at 500ms
```

## Real-World Examples

### DOM Updates

```javascript
const todos = signal([
    { id: 1, text: 'Learn NeoFlux', done: false },
    { id: 2, text: 'Build an app', done: false }
]);

const filter = signal('all'); // 'all', 'active', 'completed'

const visibleTodos = computed(() => {
    const items = todos();
    const f = filter();
    
    switch(f) {
        case 'active': return items.filter(t => !t.done);
        case 'completed': return items.filter(t => t.done);
        default: return items;
    }
});

// DOM update effect
effect(() => {
    const container = document.getElementById('todo-list');
    container.innerHTML = '';
    
    visibleTodos().forEach(todo => {
        const li = document.createElement('li');
        li.className = todo.done ? 'completed' : '';
        li.textContent = todo.text;
        container.appendChild(li);
    });
});

// Stats effect
effect(() => {
    const total = todos().length;
    const completed = todos().filter(t => t.done).length;
    document.getElementById('stats').textContent = 
        `${completed} of ${total} completed`;
});
```

### Local Storage Persistence

```javascript
const settings = signal({
    theme: 'light',
    language: 'en',
    notifications: true
});

// Load from localStorage on startup
const stored = localStorage.getItem('settings');
if (stored) {
    settings.set(JSON.parse(stored));
}

// Persist to localStorage on change
effect(() => {
    const current = settings();
    localStorage.setItem('settings', JSON.stringify(current));
    console.log('Settings saved:', current);
});

// Theme effect
effect(() => {
    document.documentElement.setAttribute('data-theme', settings().theme);
});

// Language effect
effect(() => {
    document.documentElement.setAttribute('lang', settings().language);
});
```

### API Synchronization

```javascript
const user = signal({ id: 1, name: 'Alice', email: 'alice@example.com' });
const saveStatus = signal('idle'); // 'idle', 'saving', 'saved', 'error'

// Debounced save to API
let saveTimeout;
effect(() => {
    const userData = user();
    
    // Clear previous timeout
    clearTimeout(saveTimeout);
    saveStatus.set('idle');
    
    // Debounce for 500ms
    saveTimeout = setTimeout(async () => {
        saveStatus.set('saving');
        
        try {
            const response = await fetch(`/api/users/${userData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            if (!response.ok) throw new Error('Save failed');
            
            saveStatus.set('saved');
            setTimeout(() => saveStatus.set('idle'), 2000);
        } catch (error) {
            saveStatus.set('error');
            console.error('Failed to save:', error);
        }
    }, 500);
    
    // Cleanup function
    return () => clearTimeout(saveTimeout);
});

// Status indicator effect
effect(() => {
    const status = saveStatus();
    const indicator = document.getElementById('save-status');
    
    indicator.className = `status-${status}`;
    indicator.textContent = {
        idle: '',
        saving: 'Saving...',
        saved: '✓ Saved',
        error: '✗ Error saving'
    }[status];
});
```

### WebSocket Connection

```javascript
const wsUrl = signal('ws://localhost:8080');
const connected = signal(false);
const messages = signal([]);

effect(() => {
    const url = wsUrl();
    console.log('Connecting to:', url);
    
    const ws = new WebSocket(url);
    
    ws.onopen = () => {
        connected.set(true);
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        messages.update(msgs => [...msgs, event.data]);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connected.set(false);
    };
    
    ws.onclose = () => {
        connected.set(false);
        console.log('WebSocket disconnected');
    };
    
    // Cleanup: close connection
    return () => {
        console.log('Closing WebSocket');
        ws.close();
    };
});

// Connection status effect
effect(() => {
    const isConnected = connected();
    document.getElementById('status').className = 
        isConnected ? 'connected' : 'disconnected';
});

// Message display effect
effect(() => {
    const msgs = messages();
    const container = document.getElementById('messages');
    container.innerHTML = msgs.map(m => `<div>${m}</div>`).join('');
    container.scrollTop = container.scrollHeight;
});
```

## Advanced Effect Patterns

### Conditional Effects

Effects can have conditional logic, and dependencies change dynamically:

```javascript
const isEnabled = signal(true);
const data = signal('initial');
const mode = signal('simple');

effect(() => {
    if (!isEnabled()) {
        console.log('Effect disabled');
        return; // Still depends on isEnabled
    }
    
    const value = data();
    
    if (mode() === 'simple') {
        console.log('Simple:', value);
        // Depends on: isEnabled, data, mode
    } else {
        console.log('Complex:', value.toUpperCase());
        // Would depend on: isEnabled, data, mode
    }
});
```

### Nested Effects

You can create effects inside effects (though usually not recommended):

```javascript
const outerSignal = signal(1);

effect(() => {
    const outerValue = outerSignal();
    console.log('Outer effect:', outerValue);
    
    // Inner effect - be careful!
    effect(() => {
        const innerValue = outerSignal();
        console.log('Inner effect:', innerValue * 2);
    });
});

// Note: This creates a new inner effect each time outer runs!
// Usually better to keep effects flat
```

### Effect Schedulers

Control when effects run with custom schedulers:

```javascript
// Run effect in next animation frame
effect(() => {
    const value = signal();
    updateCanvas(value);
}, {
    scheduler: fn => requestAnimationFrame(fn)
});

// Run effect with custom debouncing
effect(() => {
    const search = searchTerm();
    performSearch(search);
}, {
    scheduler: (() => {
        let timeout;
        return (fn) => {
            clearTimeout(timeout);
            timeout = setTimeout(fn, 300);
        };
    })()
});

// Run effect in next microtask
effect(() => {
    const data = signal();
    processData(data);
}, {
    scheduler: fn => queueMicrotask(fn)
});
```

### onCleanup Helper

NeoFlux provides `onCleanup` for registering cleanup handlers:

```javascript
import { signal, effect, onCleanup } from '@xec-sh/neoflux';

const elementId = signal('my-element');

effect(() => {
    const id = elementId();
    const element = document.getElementById(id);
    
    if (!element) return;
    
    const handleClick = (e) => console.log('Clicked!', e);
    element.addEventListener('click', handleClick);
    
    // Register cleanup
    onCleanup(() => {
        element.removeEventListener('click', handleClick);
    });
});
```

## Managing Effect Lifecycle

### Creating and Disposing Effects

```javascript
import { createRoot } from '@xec-sh/neoflux';

// Create effects in a disposable scope
const dispose = createRoot((dispose) => {
    const timer = signal(0);
    
    // Effect 1
    effect(() => {
        console.log('Timer:', timer());
    });
    
    // Effect 2
    const interval = setInterval(() => {
        timer.update(t => t + 1);
    }, 1000);
    
    // Register cleanup for the root
    onCleanup(() => {
        clearInterval(interval);
        console.log('Root cleaned up');
    });
    
    // Return the dispose function
    return dispose;
});

// Later: dispose everything
dispose(); // Cleans up all effects and intervals
```

### Deferred Effects

Sometimes you don't want an effect to run immediately:

```javascript
const value = signal(0);

// Normal effect - runs immediately
effect(() => {
    console.log('Immediate:', value());
});
// Logs: "Immediate: 0"

// Deferred effect - waits for first change
effect(() => {
    console.log('Deferred:', value());
}, { defer: true });
// No log yet

value.set(1);
// Logs: "Immediate: 1"
// Logs: "Deferred: 1" (first run)
```

## Common Patterns

### Auto-save with Debounce

```javascript
function autoSave(getData, save, delay = 1000) {
    let timeout;
    let lastSaved = JSON.stringify(getData());
    
    effect(() => {
        const current = JSON.stringify(getData());
        
        if (current === lastSaved) return;
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            save(JSON.parse(current));
            lastSaved = current;
        }, delay);
        
        return () => clearTimeout(timeout);
    });
}

// Usage
const document = signal({ title: '', content: '' });

autoSave(
    () => document(),
    async (data) => {
        await fetch('/api/save', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        console.log('Saved!');
    },
    2000 // 2 second delay
);
```

### Media Query Watcher

```javascript
function watchMediaQuery(query, callback) {
    const matches = signal(window.matchMedia(query).matches);
    
    effect(() => {
        const mq = window.matchMedia(query);
        const handler = (e) => matches.set(e.matches);
        
        mq.addListener(handler);
        matches.set(mq.matches);
        
        return () => mq.removeListener(handler);
    });
    
    effect(() => {
        callback(matches());
    });
    
    return matches;
}

// Usage
const isMobile = watchMediaQuery('(max-width: 768px)', (mobile) => {
    console.log('Mobile view:', mobile);
    document.body.classList.toggle('mobile', mobile);
});

const isDark = watchMediaQuery('(prefers-color-scheme: dark)', (dark) => {
    console.log('Dark mode preference:', dark);
});
```

### Scroll Position Sync

```javascript
const scrollPosition = signal({ x: 0, y: 0 });

// Track scroll position
effect(() => {
    const handler = () => {
        scrollPosition.set({
            x: window.scrollX,
            y: window.scrollY
        });
    };
    
    window.addEventListener('scroll', handler, { passive: true });
    handler(); // Get initial position
    
    return () => window.removeEventListener('scroll', handler);
});

// Show/hide "back to top" button
effect(() => {
    const { y } = scrollPosition();
    const button = document.getElementById('back-to-top');
    button.style.display = y > 200 ? 'block' : 'none';
});

// Update reading progress
effect(() => {
    const { y } = scrollPosition();
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (y / height) * 100;
    document.getElementById('progress').style.width = `${progress}%`;
});
```

## Error Handling in Effects

Effects should handle errors gracefully:

```javascript
const userId = signal(1);

effect(() => {
    const id = userId();
    
    fetch(`/api/users/${id}`)
        .then(res => res.json())
        .then(user => {
            console.log('User loaded:', user);
            // Update UI...
        })
        .catch(error => {
            console.error('Failed to load user:', error);
            // Show error message...
        });
});

// Or with try-catch for synchronous errors
effect(() => {
    try {
        const data = riskyOperation(signal());
        updateUI(data);
    } catch (error) {
        console.error('Effect error:', error);
        showErrorMessage(error.message);
    }
});
```

## Best Practices

### 1. Keep Effects Focused

```javascript
// Bad: One effect doing too much
effect(() => {
    const user = currentUser();
    updateHeader(user);
    updateSidebar(user);
    saveToLocalStorage(user);
    trackAnalytics('user-change', user);
});

// Good: Separate concerns
effect(() => updateHeader(currentUser()));
effect(() => updateSidebar(currentUser()));
effect(() => saveToLocalStorage(currentUser()));
effect(() => trackAnalytics('user-change', currentUser()));
```

### 2. Always Clean Up

```javascript
// Bad: Leaking resources
effect(() => {
    const timer = setInterval(() => {
        console.log(counter());
    }, 1000);
    // No cleanup!
});

// Good: Proper cleanup
effect(() => {
    const timer = setInterval(() => {
        console.log(counter());
    }, 1000);
    
    return () => clearInterval(timer);
});
```

### 3. Avoid Creating Signals in Effects

```javascript
// Bad: Creating signals in effects
effect(() => {
    const temp = signal(value()); // Don't do this!
});

// Good: Create signals outside
const temp = signal(0);
effect(() => {
    temp.set(value());
});
```

### 4. Handle Async Properly

```javascript
// Bad: Not handling race conditions
effect(() => {
    const id = userId();
    fetch(`/api/user/${id}`)
        .then(data => updateUI(data)); // Could update with stale data
});

// Good: Cancel stale requests
effect(() => {
    const id = userId();
    const controller = new AbortController();
    
    fetch(`/api/user/${id}`, { signal: controller.signal })
        .then(data => updateUI(data))
        .catch(err => {
            if (err.name !== 'AbortError') {
                console.error(err);
            }
        });
    
    return () => controller.abort();
});
```

## Common Pitfalls

### 1. Infinite Loops

```javascript
// WRONG: Infinite loop!
const counter = signal(0);

effect(() => {
    console.log(counter());
    counter.set(counter() + 1); // Changes its own dependency!
});
```

### 2. Memory Leaks

```javascript
// WRONG: Leaking event listeners
effect(() => {
    document.addEventListener('click', handleClick);
    // Forgot to clean up!
});

// RIGHT: Proper cleanup
effect(() => {
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
});
```

### 3. Over-using Effects

```javascript
// WRONG: Using effect for derived values
const doubled = signal(0);
effect(() => {
    doubled.set(value() * 2);
});

// RIGHT: Use computed for derived values
const doubled = computed(() => value() * 2);
```

## Summary

Effects are the bridge between your reactive state and the outside world:

- **Automatic execution** when dependencies change
- **Cleanup functions** for resource management
- **Dynamic dependencies** based on conditional logic
- **Flexible scheduling** with custom schedulers
- **Error handling** for robust applications

Effects handle "when things change, do something". Combined with signals and computed values, you have a complete reactive system. Next, let's explore [Stores](./05-stores.md) to see how NeoFlux handles complex nested state with deep reactivity.