# Advanced Patterns & Best Practices

## Architectural Patterns

### Model-View-ViewModel (MVVM)

Separate business logic from presentation using reactive patterns:

```javascript
// Model - Pure data
class TodoModel {
    constructor(id, text, completed = false) {
        this.id = id;
        this.text = text;
        this.completed = completed;
        this.createdAt = Date.now();
    }
}

// ViewModel - Reactive business logic
class TodoViewModel {
    constructor() {
        // Reactive state
        this.todos = store({ items: [] });
        this.filter = signal('all');
        this.searchTerm = signal('');
        
        // Computed properties
        this.filteredTodos = computed(() => {
            const items = this.todos.items;
            const filterValue = this.filter();
            const search = this.searchTerm().toLowerCase();
            
            return items
                .filter(todo => {
                    // Filter by status
                    if (filterValue === 'active') return !todo.completed;
                    if (filterValue === 'completed') return todo.completed;
                    return true;
                })
                .filter(todo => {
                    // Filter by search
                    return todo.text.toLowerCase().includes(search);
                });
        });
        
        this.stats = computed(() => ({
            total: this.todos.items.length,
            active: this.todos.items.filter(t => !t.completed).length,
            completed: this.todos.items.filter(t => t.completed).length
        }));
        
        // Actions
        this.addTodo = this.addTodo.bind(this);
        this.toggleTodo = this.toggleTodo.bind(this);
        this.removeTodo = this.removeTodo.bind(this);
        this.clearCompleted = this.clearCompleted.bind(this);
    }
    
    addTodo(text) {
        if (!text.trim()) return;
        
        const todo = new TodoModel(Date.now(), text.trim());
        this.todos.items.push(todo);
    }
    
    toggleTodo(id) {
        const todo = this.todos.items.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
        }
    }
    
    removeTodo(id) {
        const index = this.todos.items.findIndex(t => t.id === id);
        if (index !== -1) {
            this.todos.items.splice(index, 1);
        }
    }
    
    clearCompleted() {
        this.todos.items = this.todos.items.filter(t => !t.completed);
    }
    
    setFilter(filter) {
        this.filter.set(filter);
    }
    
    setSearch(term) {
        this.searchTerm.set(term);
    }
}

// View - Reactive rendering
class TodoView {
    constructor(viewModel, container) {
        this.vm = viewModel;
        this.container = container;
        
        this.setupEffects();
    }
    
    setupEffects() {
        // Render todos when filtered list changes
        effect(() => {
            const todos = this.vm.filteredTodos();
            this.renderTodos(todos);
        });
        
        // Update stats display
        effect(() => {
            const stats = this.vm.stats();
            this.renderStats(stats);
        });
        
        // Update filter buttons
        effect(() => {
            const filter = this.vm.filter();
            this.updateFilterButtons(filter);
        });
    }
    
    renderTodos(todos) {
        const html = todos.map(todo => `
            <li class="${todo.completed ? 'completed' : ''}">
                <input type="checkbox" 
                       ${todo.completed ? 'checked' : ''}
                       onchange="app.vm.toggleTodo(${todo.id})">
                <span>${todo.text}</span>
                <button onclick="app.vm.removeTodo(${todo.id})">×</button>
            </li>
        `).join('');
        
        this.container.querySelector('.todo-list').innerHTML = html;
    }
    
    renderStats(stats) {
        document.querySelector('.stats').textContent = 
            `${stats.active} active, ${stats.completed} completed`;
    }
    
    updateFilterButtons(filter) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
    }
}

// Usage
const app = {
    vm: new TodoViewModel(),
    view: null,
    
    init(container) {
        this.view = new TodoView(this.vm, container);
        this.bindEvents();
    },
    
    bindEvents() {
        // Input handling
        document.querySelector('.new-todo').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.vm.addTodo(e.target.value);
                e.target.value = '';
            }
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.vm.setFilter(btn.dataset.filter);
            });
        });
        
        // Search
        document.querySelector('.search').addEventListener('input', (e) => {
            this.vm.setSearch(e.target.value);
        });
    }
};
```

### Command Pattern with Undo/Redo

Implement undoable operations:

```javascript
class CommandManager {
    constructor(state) {
        this.state = state;
        this.history = [];
        this.currentIndex = -1;
        
        // Reactive properties
        this.canUndo = computed(() => this.currentIndex >= 0);
        this.canRedo = computed(() => this.currentIndex < this.history.length - 1);
    }
    
    execute(command) {
        // Remove future history if we're not at the end
        this.history = this.history.slice(0, this.currentIndex + 1);
        
        // Execute and store command
        command.execute(this.state);
        this.history.push(command);
        this.currentIndex++;
        
        // Limit history size
        if (this.history.length > 100) {
            this.history.shift();
            this.currentIndex--;
        }
    }
    
    undo() {
        if (!this.canUndo()) return;
        
        const command = this.history[this.currentIndex];
        command.undo(this.state);
        this.currentIndex--;
    }
    
    redo() {
        if (!this.canRedo()) return;
        
        this.currentIndex++;
        const command = this.history[this.currentIndex];
        command.execute(this.state);
    }
}

// Example commands
class SetPropertyCommand {
    constructor(path, newValue) {
        this.path = path;
        this.newValue = newValue;
        this.oldValue = null;
    }
    
    execute(state) {
        // Store old value for undo
        this.oldValue = this.getProperty(state, this.path);
        this.setProperty(state, this.path, this.newValue);
    }
    
    undo(state) {
        this.setProperty(state, this.path, this.oldValue);
    }
    
    getProperty(obj, path) {
        return path.split('.').reduce((o, p) => o[p], obj);
    }
    
    setProperty(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((o, p) => o[p], obj);
        target[last] = value;
    }
}

// Usage
const appState = store({
    user: { name: 'John', age: 30 },
    settings: { theme: 'light' }
});

const commandManager = new CommandManager(appState);

// Execute commands
commandManager.execute(new SetPropertyCommand('user.name', 'Jane'));
commandManager.execute(new SetPropertyCommand('settings.theme', 'dark'));

// Undo/Redo
effect(() => {
    document.querySelector('.undo-btn').disabled = !commandManager.canUndo();
    document.querySelector('.redo-btn').disabled = !commandManager.canRedo();
});
```

### Plugin System

Create extensible applications with reactive plugins:

```javascript
class PluginSystem {
    constructor() {
        this.plugins = new Map();
        this.hooks = store({
            beforeStateChange: [],
            afterStateChange: [],
            onRender: [],
            onError: []
        });
        
        this.state = store({});
        this.setupStateInterception();
    }
    
    setupStateInterception() {
        // Intercept state changes
        return new Proxy(this.state, {
            set: (target, prop, value) => {
                // Run before hooks
                for (const hook of this.hooks.beforeStateChange) {
                    const result = hook({ prop, value, oldValue: target[prop] });
                    if (result === false) return false; // Cancel change
                    if (result !== undefined) value = result; // Modify value
                }
                
                const oldValue = target[prop];
                target[prop] = value;
                
                // Run after hooks
                for (const hook of this.hooks.afterStateChange) {
                    hook({ prop, value, oldValue });
                }
                
                return true;
            }
        });
    }
    
    register(plugin) {
        if (this.plugins.has(plugin.name)) {
            throw new Error(`Plugin ${plugin.name} already registered`);
        }
        
        this.plugins.set(plugin.name, plugin);
        
        // Let plugin register hooks
        if (plugin.hooks) {
            Object.entries(plugin.hooks).forEach(([hookName, handler]) => {
                if (this.hooks[hookName]) {
                    this.hooks[hookName].push(handler);
                }
            });
        }
        
        // Initialize plugin with context
        if (plugin.init) {
            plugin.init({
                state: this.state,
                signal,
                computed,
                effect,
                store
            });
        }
    }
    
    unregister(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) return;
        
        // Cleanup
        if (plugin.destroy) {
            plugin.destroy();
        }
        
        // Remove hooks
        if (plugin.hooks) {
            Object.entries(plugin.hooks).forEach(([hookName, handler]) => {
                if (this.hooks[hookName]) {
                    const index = this.hooks[hookName].indexOf(handler);
                    if (index !== -1) {
                        this.hooks[hookName].splice(index, 1);
                    }
                }
            });
        }
        
        this.plugins.delete(pluginName);
    }
}

// Example plugin
class LoggingPlugin {
    constructor() {
        this.name = 'logging';
        this.logs = [];
    }
    
    init(context) {
        this.context = context;
        
        // Create reactive log store
        this.logStore = context.signal([]);
        
        // Watch for state changes
        this.dispose = context.effect(() => {
            console.log('State:', context.state.getState());
        });
    }
    
    hooks = {
        afterStateChange: ({ prop, value, oldValue }) => {
            const entry = {
                timestamp: Date.now(),
                prop,
                oldValue,
                newValue: value
            };
            
            this.logs.push(entry);
            console.log('State change:', entry);
        },
        
        onError: (error) => {
            console.error('Plugin system error:', error);
        }
    };
    
    destroy() {
        if (this.dispose) {
            this.dispose();
        }
    }
    
    getLogs() {
        return this.logs;
    }
}

// Usage
const app = new PluginSystem();

app.register(new LoggingPlugin());
app.register({
    name: 'validation',
    hooks: {
        beforeStateChange: ({ prop, value }) => {
            if (prop === 'age' && value < 0) {
                console.error('Age cannot be negative');
                return false; // Cancel change
            }
        }
    }
});

app.state.user = { name: 'John' }; // Logged
app.state.age = -5; // Blocked by validation
```

## State Management Patterns

### Global State with Context

Implement context-based global state:

```javascript
class StateContext {
    constructor() {
        this.contexts = new Map();
    }
    
    createContext(name, initialValue) {
        const state = store(initialValue);
        const subscribers = new Set();
        
        const context = {
            name,
            state,
            
            Provider: ({ children, value }) => {
                // Override state if value provided
                if (value !== undefined) {
                    Object.assign(state, value);
                }
                
                return children(state);
            },
            
            useContext: () => {
                // Track usage for cleanup
                const caller = getCurrentComponent(); // hypothetical
                if (caller) {
                    subscribers.add(caller);
                }
                
                return state;
            },
            
            subscribe: (fn) => {
                subscribers.add(fn);
                return () => subscribers.delete(fn);
            }
        };
        
        this.contexts.set(name, context);
        return context;
    }
    
    getContext(name) {
        return this.contexts.get(name);
    }
}

// Create contexts
const ThemeContext = createContext('theme', {
    mode: 'light',
    primaryColor: '#007bff'
});

const UserContext = createContext('user', {
    isAuthenticated: false,
    user: null
});

// Use in components
function App() {
    const theme = ThemeContext.useContext();
    const user = UserContext.useContext();
    
    effect(() => {
        document.body.className = theme.mode;
    });
    
    effect(() => {
        if (user.isAuthenticated) {
            loadUserData();
        }
    });
}
```

### Event Sourcing

Track all state changes as events:

```javascript
class EventStore {
    constructor() {
        this.events = [];
        this.currentState = store({});
        this.subscribers = new Map();
        
        // Computed snapshot at any point
        this.snapshot = computed(() => {
            return this.events.reduce((state, event) => {
                return this.applyEvent(state, event);
            }, {});
        });
    }
    
    dispatch(eventType, payload) {
        const event = {
            id: crypto.randomUUID(),
            type: eventType,
            payload,
            timestamp: Date.now(),
            metadata: {
                user: this.getCurrentUser(),
                session: this.getSessionId()
            }
        };
        
        // Store event
        this.events.push(event);
        
        // Apply to current state
        this.currentState = this.applyEvent(this.currentState, event);
        
        // Notify subscribers
        const handlers = this.subscribers.get(eventType) || [];
        handlers.forEach(handler => handler(event));
        
        // Persist event
        this.persistEvent(event);
        
        return event;
    }
    
    applyEvent(state, event) {
        // Event reducers
        switch (event.type) {
            case 'USER_LOGGED_IN':
                return {
                    ...state,
                    user: event.payload.user,
                    isAuthenticated: true
                };
                
            case 'ITEM_ADDED':
                return {
                    ...state,
                    items: [...(state.items || []), event.payload.item]
                };
                
            case 'ITEM_REMOVED':
                return {
                    ...state,
                    items: state.items.filter(i => i.id !== event.payload.id)
                };
                
            default:
                return state;
        }
    }
    
    subscribe(eventType, handler) {
        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, new Set());
        }
        
        this.subscribers.get(eventType).add(handler);
        
        return () => {
            this.subscribers.get(eventType).delete(handler);
        };
    }
    
    // Time travel
    getStateAt(timestamp) {
        const eventsUntil = this.events.filter(e => e.timestamp <= timestamp);
        return eventsUntil.reduce((state, event) => {
            return this.applyEvent(state, event);
        }, {});
    }
    
    // Event replay
    replay(fromTimestamp, toTimestamp) {
        const events = this.events.filter(e => 
            e.timestamp >= fromTimestamp && e.timestamp <= toTimestamp
        );
        
        let state = this.getStateAt(fromTimestamp);
        const states = [];
        
        for (const event of events) {
            state = this.applyEvent(state, event);
            states.push({ event, state, timestamp: event.timestamp });
        }
        
        return states;
    }
    
    persistEvent(event) {
        // Save to backend/localStorage
        localStorage.setItem(
            `event_${event.id}`,
            JSON.stringify(event)
        );
    }
}

// Usage
const eventStore = new EventStore();

// Subscribe to events
eventStore.subscribe('USER_LOGGED_IN', (event) => {
    console.log('User logged in:', event.payload.user);
    trackAnalytics('login', event.payload.user);
});

// Dispatch events
eventStore.dispatch('USER_LOGGED_IN', {
    user: { id: 1, name: 'John' }
});

eventStore.dispatch('ITEM_ADDED', {
    item: { id: 1, name: 'Product' }
});

// Time travel debugging
const yesterday = Date.now() - 86400000;
const stateYesterday = eventStore.getStateAt(yesterday);
```

## Testing Patterns

### Testing Reactive Code

```javascript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Reactive Counter', () => {
    let counter, doubled, effectRuns;
    
    beforeEach(() => {
        // Create fresh reactive state for each test
        counter = signal(0);
        doubled = computed(() => counter() * 2);
        effectRuns = 0;
    });
    
    it('should update computed when signal changes', () => {
        expect(doubled()).toBe(0);
        
        counter.set(5);
        expect(doubled()).toBe(10);
        
        counter.set(10);
        expect(doubled()).toBe(20);
    });
    
    it('should run effects when dependencies change', () => {
        effect(() => {
            counter(); // Track dependency
            effectRuns++;
        });
        
        expect(effectRuns).toBe(1); // Initial run
        
        counter.set(1);
        expect(effectRuns).toBe(2);
        
        counter.set(2);
        expect(effectRuns).toBe(3);
    });
    
    it('should batch updates', () => {
        effect(() => {
            counter();
            doubled();
            effectRuns++;
        });
        
        expect(effectRuns).toBe(1);
        
        batch(() => {
            counter.set(1);
            counter.set(2);
            counter.set(3);
        });
        
        expect(effectRuns).toBe(2); // Only one update after batch
        expect(counter()).toBe(3);
        expect(doubled()).toBe(6);
    });
    
    it('should handle circular dependencies gracefully', () => {
        const a = signal(1);
        const b = computed(() => a() * 2);
        
        // This would create a circular dependency if allowed
        expect(() => {
            const c = computed(() => {
                if (b() > 5) {
                    a.set(0); // Don't do this!
                }
                return b();
            });
            c(); // Trigger computation
        }).toThrow();
    });
});

// Testing async resources
describe('Resource Loading', () => {
    it('should handle loading states', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ data: 'test' });
        
        const resource = resource(mockFetch);
        
        // Initial state
        expect(resource.loading()).toBe(true);
        expect(resource()).toBeUndefined();
        expect(resource.error()).toBeUndefined();
        
        // Wait for loading
        await vi.waitFor(() => !resource.loading());
        
        // Loaded state
        expect(resource.loading()).toBe(false);
        expect(resource()).toEqual({ data: 'test' });
        expect(resource.error()).toBeUndefined();
    });
    
    it('should handle errors', async () => {
        const error = new Error('Failed');
        const mockFetch = vi.fn().mockRejectedValue(error);
        
        const resource = resource(mockFetch);
        
        await vi.waitFor(() => !resource.loading());
        
        expect(resource.loading()).toBe(false);
        expect(resource()).toBeUndefined();
        expect(resource.error()).toBe(error);
    });
});
```

## Performance Patterns

### Lazy Components

Load components only when needed:

```javascript
class LazyComponent {
    constructor(loader) {
        this.loader = loader;
        this.component = signal(null);
        this.loading = signal(false);
        this.error = signal(null);
    }
    
    async load() {
        if (this.component()) return this.component();
        
        this.loading.set(true);
        
        try {
            const module = await this.loader();
            this.component.set(module.default || module);
        } catch (err) {
            this.error.set(err);
        } finally {
            this.loading.set(false);
        }
        
        return this.component();
    }
    
    render(props) {
        if (this.error()) {
            return renderError(this.error());
        }
        
        if (this.loading()) {
            return renderLoading();
        }
        
        const Component = this.component();
        if (Component) {
            return Component(props);
        }
        
        // Trigger load
        this.load();
        return renderLoading();
    }
}

// Usage
const LazyDashboard = new LazyComponent(() => import('./Dashboard'));
const LazySettings = new LazyComponent(() => import('./Settings'));

// In routing
const routes = {
    '/dashboard': () => LazyDashboard.render(),
    '/settings': () => LazySettings.render()
};
```

### Selective Reactivity

Control what triggers updates:

```javascript
class SelectiveReactive {
    constructor(data, options = {}) {
        this.store = store(data);
        this.trackedPaths = new Set(options.track || []);
        this.ignoredPaths = new Set(options.ignore || []);
        
        return new Proxy(this.store, {
            get: (target, prop) => {
                const path = prop.toString();
                
                // Don't track ignored paths
                if (this.ignoredPaths.has(path)) {
                    return untrack(() => target[prop]);
                }
                
                // Only track specified paths
                if (this.trackedPaths.size > 0 && !this.trackedPaths.has(path)) {
                    return untrack(() => target[prop]);
                }
                
                return target[prop];
            }
        });
    }
}

// Usage
const state = new SelectiveReactive({
    // Only userData and settings will be reactive
    userData: { name: 'John' },
    settings: { theme: 'dark' },
    
    // These won't trigger updates
    cache: {},
    temp: {},
    debug: {}
}, {
    track: ['userData', 'settings']
});
```

## Summary

Advanced patterns enable:

- **Architectural flexibility** with MVVM, plugins, and event sourcing
- **Complex state management** with contexts and commands
- **Testability** through proper reactive testing patterns
- **Performance optimization** through lazy loading and selective reactivity
- **Maintainability** through clear separation of concerns

These patterns showcase the full power of NeoFlux's reactive system, enabling you to build complex, performant, and maintainable applications.