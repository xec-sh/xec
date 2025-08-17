# Computed Values: Automatic Derived State

## What is a Computed Value?

A computed value is a reactive value that automatically calculates itself based on other reactive values. It's like a spreadsheet formula - when the cells it references change, the formula recalculates automatically.

```javascript
import { signal, computed } from '@xec-sh/neoflux';

const price = signal(100);
const quantity = signal(2);

// Total automatically updates when price or quantity changes
const total = computed(() => price() * quantity());

console.log(total()); // 200

price.set(150);
console.log(total()); // 300 - automatically recalculated!
```

## Why Do We Need Computed Values?

Let's explore a real scenario to understand why computed values are essential.

### The Problem: Manual Calculation Management

Imagine building an e-commerce cart without computed values:

```javascript
// Without computed - manual nightmare
let items = [
    { name: 'Laptop', price: 999, quantity: 1 },
    { name: 'Mouse', price: 29, quantity: 2 }
];
let subtotal = 1057;  // Manually calculated
let tax = 105.70;     // Manually calculated (10% tax)
let shipping = 10;    // Based on subtotal
let total = 1172.70;  // Manually calculated

// Add an item
items.push({ name: 'Keyboard', price: 79, quantity: 1 });
// Now we must update EVERYTHING manually:
subtotal = 1136;    // Recalculate
tax = 113.60;       // Recalculate
shipping = 10;      // Check if still valid
total = 1259.60;    // Recalculate

// What if we forget one? Bugs!
```

Problems with this approach:
1. **Error-prone**: Easy to forget updating dependent values
2. **Maintenance nightmare**: Changes require updating multiple places
3. **Performance issues**: May recalculate unnecessarily
4. **Complex dependencies**: Hard to track what depends on what

### The Solution: Computed Values

```javascript
import { signal, computed } from '@xec-sh/neoflux';

const items = signal([
    { name: 'Laptop', price: 999, quantity: 1 },
    { name: 'Mouse', price: 29, quantity: 2 }
]);

// All calculations are automatic and always correct
const subtotal = computed(() => 
    items().reduce((sum, item) => sum + item.price * item.quantity, 0)
);

const tax = computed(() => subtotal() * 0.10);

const shipping = computed(() => {
    const sub = subtotal();
    if (sub > 100) return 10;
    if (sub > 50) return 15;
    return 20;
});

const total = computed(() => subtotal() + tax() + shipping());

// Just update the source data
items.update(list => [...list, { name: 'Keyboard', price: 79, quantity: 1 }]);

// Everything updates automatically!
console.log(total()); // Correct total, automatically
```

## How Computed Values Work

### Automatic Dependency Tracking

When a computed runs, NeoFlux tracks every signal or computed it reads:

```javascript
const a = signal(1);
const b = signal(2);
const c = signal(3);

const result = computed(() => {
    console.log('Computing...');
    if (a() > 0) {
        return a() + b(); // Depends on a and b
    }
    return c(); // Would depend on a and c
});

console.log(result()); // "Computing..." then 3

b.set(5);
console.log(result()); // "Computing..." then 6

c.set(10);
console.log(result()); // No recomputation! c is not a dependency
```

### Lazy Evaluation

Computed values are lazy - they only calculate when accessed:

```javascript
const expensive = signal(100);

const veryExpensive = computed(() => {
    console.log('Expensive calculation!');
    return expensive() * Math.random();
});

// Nothing happens yet - no console log

expensive.set(200); // Still nothing

const value = veryExpensive(); // NOW it calculates
// Logs: "Expensive calculation!"
```

### Memoization (Caching)

Computed values cache their results and only recalculate when dependencies change:

```javascript
const base = signal(10);

const squared = computed(() => {
    console.log('Calculating square...');
    return base() ** 2;
});

console.log(squared()); // "Calculating square..." then 100
console.log(squared()); // 100 (no recalculation)
console.log(squared()); // 100 (no recalculation)

base.set(5);
console.log(squared()); // "Calculating square..." then 25
```

## Creating Computed Values

### Basic Syntax

```javascript
const computed1 = computed(() => {
    // Computation function
    return someValue;
});
```

### With Options

```javascript
const computed2 = computed(
    () => expensiveCalculation(),
    {
        equals: (a, b) => {
            // Custom equality check
            return JSON.stringify(a) === JSON.stringify(b);
        },
        name: 'expensiveCalc' // For debugging
    }
);
```

## Real-World Examples

### Form Validation

```javascript
const email = signal('');
const password = signal('');
const confirmPassword = signal('');

// Individual field validation
const emailValid = computed(() => {
    const value = email();
    return value.includes('@') && value.includes('.');
});

const passwordValid = computed(() => {
    const value = password();
    return value.length >= 8 && 
           /[A-Z]/.test(value) && 
           /[0-9]/.test(value);
});

const passwordsMatch = computed(() => {
    return password() === confirmPassword() && password() !== '';
});

// Overall form validity
const formValid = computed(() => {
    return emailValid() && passwordValid() && passwordsMatch();
});

// Validation messages
const validationMessages = computed(() => {
    const messages = [];
    if (!emailValid()) messages.push('Invalid email format');
    if (!passwordValid()) messages.push('Password must be 8+ chars with uppercase and number');
    if (!passwordsMatch()) messages.push('Passwords do not match');
    return messages;
});
```

### Shopping Cart with Discounts

```javascript
const cart = signal([
    { id: 1, name: 'Shirt', price: 29.99, quantity: 2, category: 'clothing' },
    { id: 2, name: 'Book', price: 15.99, quantity: 1, category: 'books' },
    { id: 3, name: 'Laptop', price: 999.99, quantity: 1, category: 'electronics' }
]);

const promoCode = signal('');

// Calculate subtotal
const subtotal = computed(() => {
    return cart().reduce((sum, item) => {
        return sum + (item.price * item.quantity);
    }, 0);
});

// Calculate discount
const discount = computed(() => {
    const code = promoCode();
    const sub = subtotal();
    
    switch(code) {
        case 'SAVE10': return sub * 0.10;
        case 'SAVE20': return sub * 0.20;
        case 'ELECTRONICS15': {
            // Discount only on electronics
            const electronicsTotal = cart()
                .filter(item => item.category === 'electronics')
                .reduce((sum, item) => sum + item.price * item.quantity, 0);
            return electronicsTotal * 0.15;
        }
        default: return 0;
    }
});

// Final calculations
const afterDiscount = computed(() => subtotal() - discount());
const tax = computed(() => afterDiscount() * 0.08); // 8% tax
const shipping = computed(() => subtotal() > 50 ? 0 : 9.99);
const total = computed(() => afterDiscount() + tax() + shipping());

// Summary for display
const orderSummary = computed(() => ({
    items: cart().length,
    subtotal: subtotal().toFixed(2),
    discount: discount().toFixed(2),
    tax: tax().toFixed(2),
    shipping: shipping().toFixed(2),
    total: total().toFixed(2),
    savings: discount() > 0 ? `You saved $${discount().toFixed(2)}!` : ''
}));
```

### Data Filtering and Aggregation

```javascript
const employees = signal([
    { name: 'Alice', department: 'Engineering', salary: 120000, active: true },
    { name: 'Bob', department: 'Marketing', salary: 80000, active: true },
    { name: 'Charlie', department: 'Engineering', salary: 110000, active: false },
    { name: 'Diana', department: 'Sales', salary: 90000, active: true }
]);

const filterDepartment = signal('all');
const showInactive = signal(false);

// Filtered list
const filteredEmployees = computed(() => {
    let list = employees();
    
    // Filter by department
    if (filterDepartment() !== 'all') {
        list = list.filter(e => e.department === filterDepartment());
    }
    
    // Filter by active status
    if (!showInactive()) {
        list = list.filter(e => e.active);
    }
    
    return list;
});

// Statistics
const stats = computed(() => {
    const list = filteredEmployees();
    
    if (list.length === 0) {
        return { count: 0, avgSalary: 0, totalSalary: 0, departments: [] };
    }
    
    const totalSalary = list.reduce((sum, e) => sum + e.salary, 0);
    const departments = [...new Set(list.map(e => e.department))];
    
    return {
        count: list.length,
        avgSalary: Math.round(totalSalary / list.length),
        totalSalary,
        departments
    };
});

// Department breakdown
const departmentBreakdown = computed(() => {
    const breakdown = {};
    
    filteredEmployees().forEach(emp => {
        if (!breakdown[emp.department]) {
            breakdown[emp.department] = { count: 0, totalSalary: 0 };
        }
        breakdown[emp.department].count++;
        breakdown[emp.department].totalSalary += emp.salary;
    });
    
    return Object.entries(breakdown).map(([dept, data]) => ({
        department: dept,
        count: data.count,
        avgSalary: Math.round(data.totalSalary / data.count)
    }));
});
```

## Computed Chains

Computed values can depend on other computed values, forming chains:

```javascript
const firstName = signal('John');
const lastName = signal('Doe');

// Level 1 computed
const fullName = computed(() => `${firstName()} ${lastName()}`);

// Level 2 computed (depends on another computed)
const displayName = computed(() => fullName().toUpperCase());

// Level 3 computed
const greeting = computed(() => `Hello, ${displayName()}!`);

console.log(greeting()); // "Hello, JOHN DOE!"

firstName.set('Jane');
console.log(greeting()); // "Hello, JANE DOE!"
```

NeoFlux automatically handles the execution order using topological sorting.

## Conditional Dependencies

Computed values only depend on what they actually read during execution:

```javascript
const useMetric = signal(true);
const celsius = signal(20);
const fahrenheit = signal(68);

const temperature = computed(() => {
    if (useMetric()) {
        return `${celsius()}°C`; // Depends on useMetric and celsius
    } else {
        return `${fahrenheit()}°F`; // Would depend on useMetric and fahrenheit
    }
});

console.log(temperature()); // "20°C"

// Changing fahrenheit doesn't trigger recomputation
fahrenheit.set(72);
console.log(temperature()); // Still "20°C" (no recomputation)

// Switching the condition changes dependencies
useMetric.set(false);
console.log(temperature()); // "72°F" (now depends on fahrenheit)

// Now celsius changes don't matter
celsius.set(25);
console.log(temperature()); // Still "72°F"
```

## Error Handling

Computed values can throw errors, which propagate to the reader:

```javascript
const numerator = signal(10);
const denominator = signal(2);

const division = computed(() => {
    const denom = denominator();
    if (denom === 0) {
        throw new Error('Division by zero!');
    }
    return numerator() / denom;
});

console.log(division()); // 5

denominator.set(0);
try {
    console.log(division()); // Throws error
} catch (e) {
    console.error(e.message); // "Division by zero!"
}
```

## Advanced Patterns

### Computed Selectors

Create reusable selector functions:

```javascript
const state = signal({
    users: [
        { id: 1, name: 'Alice', role: 'admin', active: true },
        { id: 2, name: 'Bob', role: 'user', active: false },
        { id: 3, name: 'Charlie', role: 'user', active: true }
    ],
    currentUserId: 1
});

// Selector functions
const selectUsers = () => computed(() => state().users);
const selectCurrentUser = () => computed(() => {
    const s = state();
    return s.users.find(u => u.id === s.currentUserId);
});
const selectActiveUsers = () => computed(() => 
    state().users.filter(u => u.active)
);
const selectUsersByRole = (role) => computed(() =>
    state().users.filter(u => u.role === role)
);

// Usage
const currentUser = selectCurrentUser();
const activeUsers = selectActiveUsers();
const admins = selectUsersByRole('admin');
```

### Async-like Computeds with Status

While computed values are synchronous, you can track async operation states:

```javascript
const userId = signal(1);
const userCache = signal(new Map());

const userStatus = computed(() => {
    const id = userId();
    const cache = userCache();
    
    if (!cache.has(id)) {
        // Trigger async fetch (in an effect)
        return { status: 'loading', data: null };
    }
    
    const entry = cache.get(id);
    if (entry.error) {
        return { status: 'error', error: entry.error };
    }
    
    return { status: 'success', data: entry.data };
});

// Effect to handle the actual fetching
effect(() => {
    const id = userId();
    const cache = userCache();
    
    if (!cache.has(id)) {
        fetch(`/api/users/${id}`)
            .then(res => res.json())
            .then(data => {
                userCache.update(c => {
                    const newCache = new Map(c);
                    newCache.set(id, { data });
                    return newCache;
                });
            })
            .catch(error => {
                userCache.update(c => {
                    const newCache = new Map(c);
                    newCache.set(id, { error });
                    return newCache;
                });
            });
    }
});
```

### Debounced Computed

Create computed values that update less frequently:

```javascript
function debouncedComputed(fn, delay = 100) {
    const internalSignal = signal(fn());
    let timeout;
    
    // Effect to update the internal signal
    effect(() => {
        const value = fn();
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            internalSignal.set(value);
        }, delay);
    });
    
    // Return computed that reads from internal signal
    return computed(() => internalSignal());
}

// Usage
const searchTerm = signal('');
const debouncedSearch = debouncedComputed(() => searchTerm(), 300);

// searchTerm updates immediately, debouncedSearch waits 300ms
```

## Performance Best Practices

### 1. Keep Computations Light

```javascript
// Bad: Heavy computation in computed
const filtered = computed(() => {
    return hugeArray().filter(complexFilter).map(complexTransform);
});

// Better: Break into smaller computeds
const filtered = computed(() => hugeArray().filter(complexFilter));
const transformed = computed(() => filtered().map(complexTransform));
```

### 2. Avoid Creating Objects Unnecessarily

```javascript
// Bad: Always creates new object
const summary = computed(() => ({
    count: items().length,
    total: items().reduce((s, i) => s + i.value, 0)
}));

// Better: Use custom equality
const summary = computed(
    () => ({
        count: items().length,
        total: items().reduce((s, i) => s + i.value, 0)
    }),
    {
        equals: (a, b) => a.count === b.count && a.total === b.total
    }
);
```

### 3. Don't Read Signals Unnecessarily

```javascript
// Bad: Reads signal multiple times
const calculation = computed(() => {
    const value = expensiveSignal();
    return value * value + value - value / 2;
});

// Better: Read once
const calculation = computed(() => {
    const value = expensiveSignal();
    return value * value + value - value / 2;
});
```

## Common Pitfalls

### 1. Side Effects in Computed

```javascript
// WRONG: Don't do side effects in computed
const bad = computed(() => {
    const value = signal();
    console.log(value); // Side effect!
    localStorage.setItem('value', value); // Side effect!
    return value * 2;
});

// RIGHT: Use effects for side effects
const good = computed(() => signal() * 2);
effect(() => {
    const value = signal();
    console.log(value);
    localStorage.setItem('value', value);
});
```

### 2. Circular Dependencies

```javascript
// WRONG: Circular dependency
const a = computed(() => b() + 1);
const b = computed(() => a() - 1); // Error: Circular dependency!
```

### 3. Forgetting Dependencies Are Dynamic

```javascript
const condition = signal(true);
const a = signal(1);
const b = signal(2);

const result = computed(() => {
    return condition() ? a() : b();
});

// Dependencies change based on condition
// When condition is true: depends on condition and a
// When condition is false: depends on condition and b
```

## Summary

Computed values are the bridge between your reactive state (signals) and derived data:

- **Automatic updates** when dependencies change
- **Lazy evaluation** for performance
- **Memoization** prevents unnecessary recalculation
- **Dependency tracking** is automatic and dynamic
- **Composable** - computed values can depend on other computeds

Computed values handle the "what" - deriving state from other state. Next, let's explore [Effects](./04-effects.md) to handle the "when" - performing side effects when state changes.