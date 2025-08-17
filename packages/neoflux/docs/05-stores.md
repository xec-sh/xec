# Stores: Deep Reactive Objects

## What is a Store?

A store is a deeply reactive object where every property, including nested ones, automatically triggers updates when changed. Unlike signals which hold single values, stores manage complex object structures with full reactivity at every level.

```javascript
import { store, effect } from '@xec-sh/neoflux';

// Create a deeply reactive store
const user = store({
    name: 'Alice',
    age: 30,
    address: {
        city: 'New York',
        country: 'USA'
    }
});

// Effects track any accessed property
effect(() => {
    console.log(`${user.name} lives in ${user.address.city}`);
});
// Logs: "Alice lives in New York"

// Changing nested properties triggers updates
user.address.city = 'San Francisco';
// Logs: "Alice lives in San Francisco"
```

## Why Do We Need Stores?

As applications grow, managing state with individual signals becomes cumbersome:

### The Problem: Signal Explosion

```javascript
// Without stores - managing complex state with signals
const userName = signal('Alice');
const userAge = signal(30);
const userEmail = signal('alice@example.com');
const addressStreet = signal('123 Main St');
const addressCity = signal('New York');
const addressZip = signal('10001');
const settingsTheme = signal('dark');
const settingsNotifications = signal(true);
// ... dozens more signals!

// Updating related data requires multiple signal updates
function updateAddress(street, city, zip) {
    addressStreet.set(street);
    addressCity.set(city);
    addressZip.set(zip);
    // Easy to forget one!
}

// Passing around is verbose
function UserProfile({ nameSignal, ageSignal, emailSignal, ... }) {
    // So many parameters!
}
```

### The Solution: Unified Reactive State

```javascript
import { store } from '@xec-sh/neoflux';

// With store - clean, organized state
const appState = store({
    user: {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
        address: {
            street: '123 Main St',
            city: 'New York',
            zip: '10001'
        }
    },
    settings: {
        theme: 'dark',
        notifications: true
    }
});

// Update related data naturally
function updateAddress(address) {
    Object.assign(appState.user.address, address);
    // All properties update atomically
}

// Pass around easily
function UserProfile({ state }) {
    // Just one parameter with everything
}
```

## How Stores Work

Stores use JavaScript Proxies to intercept property access and modifications:

1. **Read Interception**: When you read a property, the store tracks it as a dependency
2. **Write Interception**: When you write a property, the store notifies all dependents
3. **Deep Proxying**: Objects and arrays are automatically wrapped in proxies
4. **Lazy Proxying**: Nested objects are only proxied when accessed

```javascript
const data = store({
    level1: {
        level2: {
            level3: {
                value: 'deep'
            }
        }
    }
});

effect(() => {
    // Only the accessed path is tracked
    console.log(data.level1.level2.level3.value);
});

// Changes at any level trigger updates
data.level1.level2.level3.value = 'changed'; // Effect runs
data.level1.level2 = { level3: { value: 'new' }}; // Effect runs
data.level1 = { level2: { level3: { value: 'replaced' }}}; // Effect runs
```

## Creating and Using Stores

### Basic Store Creation

```javascript
const state = store({
    // Any JavaScript object structure
    counter: 0,
    user: null,
    items: [],
    config: {
        theme: 'light',
        autoSave: true
    }
});
```

### Reading Store Values

```javascript
// Direct property access (creates dependencies)
console.log(state.counter); // 0
console.log(state.config.theme); // 'light'

// Get entire state
const fullState = state.getState();

// Get specific property
const theme = state.get('config').theme;
// Or for top-level properties
const counter = state.get('counter');
```

### Updating Store Values

```javascript
// Direct assignment
state.counter = 1;
state.config.theme = 'dark';

// Using set method
state.set('counter', 2);

// Batch updates
state.update({
    counter: 3,
    user: { name: 'Bob', age: 25 }
});

// Object.assign for partial updates
Object.assign(state.config, {
    theme: 'light',
    fontSize: 14
});
```

### Arrays in Stores

```javascript
const todos = store({
    items: [
        { id: 1, text: 'Learn NeoFlux', done: false },
        { id: 2, text: 'Build app', done: false }
    ]
});

// Array methods work and trigger updates
todos.items.push({ id: 3, text: 'Deploy', done: false });
todos.items[0].done = true;
todos.items.splice(1, 1);

// Array operations are reactive
effect(() => {
    console.log(`${todos.items.filter(t => t.done).length} completed`);
});
```

## Real-World Examples

### Application State Management

```javascript
const app = store({
    user: null,
    isAuthenticated: false,
    theme: 'system',
    language: 'en',
    
    navigation: {
        currentPage: 'home',
        history: [],
        breadcrumbs: []
    },
    
    data: {
        posts: [],
        comments: {},
        users: new Map()
    },
    
    ui: {
        sidebar: {
            isOpen: true,
            width: 250
        },
        modal: {
            isOpen: false,
            content: null
        },
        notifications: []
    }
});

// Login function
async function login(email, password) {
    try {
        const response = await api.login(email, password);
        
        // Update multiple related properties
        app.user = response.user;
        app.isAuthenticated = true;
        app.navigation.currentPage = 'dashboard';
        app.navigation.history.push('login');
        
        // Load user preferences
        app.theme = response.user.preferences.theme;
        app.language = response.user.preferences.language;
    } catch (error) {
        app.ui.notifications.push({
            type: 'error',
            message: 'Login failed',
            timestamp: Date.now()
        });
    }
}

// Theme effect
effect(() => {
    document.documentElement.setAttribute('data-theme', app.theme);
});

// Navigation effect
effect(() => {
    console.log('Navigated to:', app.navigation.currentPage);
    updateBreadcrumbs(app.navigation.currentPage);
});

// Notification effect
effect(() => {
    const latest = app.ui.notifications[app.ui.notifications.length - 1];
    if (latest) {
        showToast(latest);
    }
});
```

### Form State Management

```javascript
const formStore = store({
    values: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: {
            street: '',
            city: '',
            state: '',
            zip: ''
        },
        preferences: {
            newsletter: false,
            notifications: true
        }
    },
    
    errors: {},
    touched: {},
    isSubmitting: false,
    isValid: false
});

// Validation computed
const validation = computed(() => {
    const errors = {};
    const values = formStore.values;
    
    if (!values.firstName) errors.firstName = 'Required';
    if (!values.lastName) errors.lastName = 'Required';
    
    if (!values.email) {
        errors.email = 'Required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        errors.email = 'Invalid email';
    }
    
    if (values.phone && !/^\d{10}$/.test(values.phone.replace(/\D/g, ''))) {
        errors.phone = 'Invalid phone number';
    }
    
    if (!values.address.zip || !/^\d{5}$/.test(values.address.zip)) {
        errors['address.zip'] = 'Invalid ZIP code';
    }
    
    return errors;
});

// Update errors when validation changes
effect(() => {
    formStore.errors = validation();
    formStore.isValid = Object.keys(validation()).length === 0;
});

// Field handler
function handleFieldChange(path, value) {
    // Set nested value
    const parts = path.split('.');
    let target = formStore.values;
    
    for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]];
    }
    
    target[parts[parts.length - 1]] = value;
    formStore.touched[path] = true;
}

// Submit handler
async function handleSubmit() {
    formStore.isSubmitting = true;
    
    try {
        await api.submitForm(formStore.values);
        console.log('Form submitted successfully');
    } catch (error) {
        formStore.errors.submit = error.message;
    } finally {
        formStore.isSubmitting = false;
    }
}
```

### Shopping Cart

```javascript
const cart = store({
    items: [],
    coupon: null,
    shipping: {
        method: 'standard',
        address: null
    }
});

// Cart operations
const cartOps = {
    addItem(product, quantity = 1) {
        const existing = cart.items.find(item => item.id === product.id);
        
        if (existing) {
            existing.quantity += quantity;
        } else {
            cart.items.push({
                id: product.id,
                name: product.name,
                price: product.price,
                quantity
            });
        }
    },
    
    removeItem(productId) {
        const index = cart.items.findIndex(item => item.id === productId);
        if (index !== -1) {
            cart.items.splice(index, 1);
        }
    },
    
    updateQuantity(productId, quantity) {
        const item = cart.items.find(item => item.id === productId);
        if (item) {
            if (quantity <= 0) {
                this.removeItem(productId);
            } else {
                item.quantity = quantity;
            }
        }
    },
    
    applyCoupon(code) {
        // Validate and apply coupon
        cart.coupon = { code, discount: 0.1 };
    },
    
    clear() {
        cart.items = [];
        cart.coupon = null;
    }
};

// Computed values
const cartTotals = computed(() => {
    const subtotal = cart.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );
    
    const discount = cart.coupon 
        ? subtotal * cart.coupon.discount 
        : 0;
    
    const shipping = cart.shipping.method === 'express' ? 20 : 5;
    
    return {
        subtotal,
        discount,
        shipping,
        total: subtotal - discount + shipping,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0)
    };
});

// Persistence effect
effect(() => {
    localStorage.setItem('cart', JSON.stringify({
        items: cart.items,
        coupon: cart.coupon
    }));
});

// Analytics effect
effect(() => {
    const totals = cartTotals();
    analytics.track('cart_updated', {
        itemCount: totals.itemCount,
        value: totals.total
    });
});
```

## Advanced Store Features

### Transactions

Batch multiple updates into a single notification cycle:

```javascript
const state = store({
    a: 1,
    b: 2,
    c: 3
});

let updateCount = 0;
effect(() => {
    // Access all values
    console.log(state.a, state.b, state.c);
    updateCount++;
});

// Without transaction - 3 updates
state.a = 10;
state.b = 20;
state.c = 30;
console.log('Updates:', updateCount); // 4 (initial + 3)

// With transaction - 1 update
updateCount = 0;
state.transaction(s => {
    s.a = 100;
    s.b = 200;
    s.c = 300;
});
console.log('Updates:', updateCount); // 1
```

### Store Methods

Stores provide several utility methods:

```javascript
const myStore = store({ count: 0, name: 'test' });

// Get entire state
const state = myStore.getState();

// Get specific property
const count = myStore.get('count');

// Set property
myStore.set('count', 5);

// Update multiple properties
myStore.update({ count: 10, name: 'updated' });

// Subscribe to all changes
const unsubscribe = myStore.subscribe(state => {
    console.log('Store changed:', state);
});

// Reset to initial state
myStore.reset({ count: 0, name: 'test' });

// Get metadata
console.log('Version:', myStore.getVersion());
console.log('Signal count:', myStore.getSignalCount());
```

### Selective Subscriptions

Track only specific paths:

```javascript
const config = store({
    ui: {
        theme: 'dark',
        fontSize: 14,
        sidebarOpen: true
    },
    data: {
        user: null,
        posts: []
    }
});

// Only runs when theme changes
effect(() => {
    console.log('Theme:', config.ui.theme);
});

// Only runs when any ui property changes
effect(() => {
    const ui = config.ui;
    console.log('UI updated:', ui.theme, ui.fontSize, ui.sidebarOpen);
});

// Doesn't run when data changes
config.data.user = { name: 'Alice' }; // No effect runs
config.ui.theme = 'light'; // Both effects run
```

### Store Options

Configure store behavior:

```javascript
const customStore = store(
    { value: 1 },
    {
        // Shallow reactive paths (nested objects won't be reactive)
        shallow: ['metadata', 'cache'],
        
        // Custom equality function
        equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        
        // Lazy proxy creation (better performance for large objects)
        lazy: true
    }
);
```

## Performance Optimization

### Granular Updates

Stores track dependencies at the property level:

```javascript
const bigStore = store({
    section1: { /* lots of data */ },
    section2: { /* lots of data */ },
    section3: { /* lots of data */ }
});

// This effect only runs when section1 changes
effect(() => {
    processSection(bigStore.section1);
});

// Changing other sections doesn't trigger it
bigStore.section2.someProperty = 'new'; // No effect run
bigStore.section3.otherProperty = 'new'; // No effect run
bigStore.section1.anyProperty = 'new'; // Effect runs!
```

### Shallow Reactive Paths

For performance, make some paths shallow:

```javascript
const store = store({
    // Deep reactive
    appState: {
        user: { name: 'Alice', settings: { theme: 'dark' }}
    },
    
    // Shallow reactive (configured in options)
    cache: {
        apiResponses: new Map(), // Won't be deeply reactive
        tempData: {}
    }
}, {
    shallow: ['cache']
});

// Changes to cache properties don't trigger deep updates
store.cache.apiResponses.set('key', 'value'); // No update
store.cache = { ...store.cache }; // This triggers update
```

### Transaction Batching

Always use transactions for multiple updates:

```javascript
// Bad: Multiple updates
function updateUser(user) {
    store.user.name = user.name;
    store.user.email = user.email;
    store.user.age = user.age;
    // Triggers 3 updates
}

// Good: Single transaction
function updateUser(user) {
    store.transaction(s => {
        s.user.name = user.name;
        s.user.email = user.email;
        s.user.age = user.age;
    });
    // Triggers 1 update
}
```

## Integration Patterns

### With Computed Values

```javascript
const gameState = store({
    player: {
        health: 100,
        maxHealth: 100,
        mana: 50,
        maxMana: 50,
        level: 1,
        experience: 0
    },
    enemies: []
});

// Computed values from store
const playerStats = computed(() => ({
    healthPercent: (gameState.player.health / gameState.player.maxHealth) * 100,
    manaPercent: (gameState.player.mana / gameState.player.maxMana) * 100,
    experienceToNext: gameState.player.level * 100 - gameState.player.experience,
    isDead: gameState.player.health <= 0
}));

const gameStatus = computed(() => {
    if (playerStats().isDead) return 'game-over';
    if (gameState.enemies.length === 0) return 'victory';
    return 'playing';
});
```

### With Effects

```javascript
const appStore = store({
    user: null,
    preferences: {
        theme: 'auto',
        language: 'en'
    }
});

// Auto-save effect
effect(() => {
    if (appStore.user) {
        api.savePreferences(appStore.user.id, appStore.preferences);
    }
});

// Theme effect
effect(() => {
    const theme = appStore.preferences.theme;
    
    if (theme === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
});

// Language effect  
effect(() => {
    document.documentElement.setAttribute('lang', appStore.preferences.language);
    loadTranslations(appStore.preferences.language);
});
```

## Common Patterns

### Store Factory

Create stores with predefined behavior:

```javascript
function createEntityStore(name, initialData = []) {
    const store = store({
        entities: initialData,
        selectedId: null,
        isLoading: false,
        error: null
    });
    
    return {
        store,
        
        // Computed
        selected: computed(() => 
            store.entities.find(e => e.id === store.selectedId)
        ),
        
        // Actions
        add(entity) {
            store.entities.push({ ...entity, id: Date.now() });
        },
        
        remove(id) {
            const index = store.entities.findIndex(e => e.id === id);
            if (index !== -1) {
                store.entities.splice(index, 1);
                if (store.selectedId === id) {
                    store.selectedId = null;
                }
            }
        },
        
        update(id, updates) {
            const entity = store.entities.find(e => e.id === id);
            if (entity) {
                Object.assign(entity, updates);
            }
        },
        
        select(id) {
            store.selectedId = id;
        },
        
        async load() {
            store.isLoading = true;
            store.error = null;
            
            try {
                const data = await api.fetch(name);
                store.entities = data;
            } catch (error) {
                store.error = error.message;
            } finally {
                store.isLoading = false;
            }
        }
    };
}

// Usage
const users = createEntityStore('users');
const posts = createEntityStore('posts');

await users.load();
users.select(1);
console.log(users.selected());
```

### Undo/Redo

Implement undo/redo with stores:

```javascript
function createUndoableStore(initial) {
    const history = [];
    let currentIndex = -1;
    
    const store = store(initial);
    
    // Track changes
    effect(() => {
        const state = JSON.stringify(store.getState());
        
        // Remove future history if we're not at the end
        history.splice(currentIndex + 1);
        
        // Add new state
        history.push(state);
        currentIndex++;
        
        // Limit history size
        if (history.length > 50) {
            history.shift();
            currentIndex--;
        }
    });
    
    return {
        store,
        
        undo() {
            if (currentIndex > 0) {
                currentIndex--;
                const state = JSON.parse(history[currentIndex]);
                Object.assign(store, state);
            }
        },
        
        redo() {
            if (currentIndex < history.length - 1) {
                currentIndex++;
                const state = JSON.parse(history[currentIndex]);
                Object.assign(store, state);
            }
        },
        
        canUndo: computed(() => currentIndex > 0),
        canRedo: computed(() => currentIndex < history.length - 1)
    };
}
```

## Common Pitfalls

### 1. Destructuring Loses Reactivity

```javascript
const store = store({ user: { name: 'Alice' }});

// WRONG: Destructuring breaks reactivity
const { user } = store;
effect(() => console.log(user.name)); // Won't update!

// RIGHT: Access through store
effect(() => console.log(store.user.name)); // Updates correctly
```

### 2. Replacing Nested Objects

```javascript
// WRONG: Replacing objects might break references
store.user = { name: 'Bob' }; // Old references are stale

// BETTER: Update properties
Object.assign(store.user, { name: 'Bob' });
// Or use transaction
store.transaction(s => {
    s.user.name = 'Bob';
});
```

### 3. Array Index Assignment

```javascript
const store = store({ items: [1, 2, 3] });

// Sometimes problematic in effects
store.items[0] = 10;

// More reliable
store.items.splice(0, 1, 10);
// Or
store.items = [...store.items.slice(0, 0), 10, ...store.items.slice(1)];
```

## Summary

Stores provide deep reactivity for complex state:

- **Deep reactivity** - Every nested property is reactive
- **Natural syntax** - Use normal JavaScript property access
- **Automatic tracking** - Dependencies tracked at property level
- **Performance** - Granular updates and lazy proxying
- **Transactions** - Batch multiple updates

Stores are perfect for application state, forms, and complex data structures. Next, let's explore [Resources](./06-resources.md) to see how NeoFlux handles asynchronous data fetching and management.