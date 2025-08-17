# Resources: Managing Async Data

## What is a Resource?

A resource is a reactive primitive specifically designed for handling asynchronous data. It automatically manages loading states, errors, and data fetching while maintaining reactivity throughout the async lifecycle.

```javascript
import { resource, effect } from '@xec-sh/neoflux';

// Create a resource that fetches user data
const user = resource(async () => {
    const response = await fetch('/api/user/1');
    return response.json();
});

// Access the data (reactive)
effect(() => {
    if (user.loading()) {
        console.log('Loading user...');
    } else if (user.error()) {
        console.log('Error:', user.error().message);
    } else {
        console.log('User:', user());
    }
});
```

## Why Do We Need Resources?

Handling async data with signals alone is complex and error-prone:

### The Problem: Manual Async State Management

```javascript
// Without resources - manual chaos
const userData = signal(null);
const userLoading = signal(false);
const userError = signal(null);

async function fetchUser(id) {
    userLoading.set(true);
    userError.set(null);
    
    try {
        const response = await fetch(`/api/user/${id}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        userData.set(data);
    } catch (error) {
        userError.set(error);
        userData.set(null);
    } finally {
        userLoading.set(false);
    }
}

// Need to manually coordinate everything
const userId = signal(1);
effect(() => {
    fetchUser(userId()); // Manually trigger fetch
});

// Handle race conditions manually
let latestRequestId = 0;
async function fetchUserSafe(id) {
    const requestId = ++latestRequestId;
    // ... fetch ...
    if (requestId !== latestRequestId) return; // Outdated
    // ... update state ...
}
```

Problems:
1. **Boilerplate**: Lots of manual state management
2. **Race conditions**: Older requests can overwrite newer ones
3. **Error prone**: Easy to forget loading/error states
4. **No reactivity**: Dependencies aren't automatically tracked

### The Solution: Resources

```javascript
import { resource, signal } from '@xec-sh/neoflux';

const userId = signal(1);

// Resource handles everything automatically
const user = resource(async () => {
    const response = await fetch(`/api/user/${userId()}`);
    if (!response.ok) throw new Error('Failed to fetch');
    return response.json();
});

// Clean reactive access
effect(() => {
    console.log('Loading:', user.loading());
    console.log('Error:', user.error());
    console.log('Data:', user());
});

// Change userId triggers automatic refetch
userId.set(2); // Resource refetches automatically!
```

## How Resources Work

Resources combine three reactive values:
1. **Data**: The fetched value
2. **Loading**: Whether currently fetching
3. **Error**: Any error that occurred

When dependencies change, resources:
1. Set loading to true
2. Cancel any pending fetch
3. Execute the fetcher
4. Update data/error when complete

## Creating Resources

### Basic Resource

```javascript
const posts = resource(async () => {
    const response = await fetch('/api/posts');
    return response.json();
});

// Access data
const data = posts(); // T | undefined
const isLoading = posts.loading(); // boolean
const error = posts.error(); // Error | undefined
```

### Resource with Dependencies

Resources automatically track reactive dependencies:

```javascript
const selectedCategory = signal('tech');
const sortBy = signal('date');

const articles = resource(async () => {
    const category = selectedCategory();
    const sort = sortBy();
    
    const response = await fetch(
        `/api/articles?category=${category}&sort=${sort}`
    );
    return response.json();
});

// Changing dependencies triggers refetch
selectedCategory.set('science'); // Refetches
sortBy.set('popularity'); // Refetches
```

### Resource with Parameters

Create parameterized resources:

```javascript
function createUserResource(userId) {
    return resource(async () => {
        const id = userId(); // Track the signal
        const response = await fetch(`/api/users/${id}`);
        return response.json();
    });
}

const currentUserId = signal(1);
const currentUser = createUserResource(currentUserId);

// Change user
currentUserId.set(2); // Resource refetches
```

## Real-World Examples

### Search with Debouncing

```javascript
const searchTerm = signal('');

// Debounced search resource
const searchResults = resource(async () => {
    const term = searchTerm();
    
    if (!term) return [];
    
    // Debounce by waiting
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    return response.json();
});

// UI binding
effect(() => {
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', (e) => {
        searchTerm.set(e.target.value);
    });
});

// Results display
effect(() => {
    const container = document.getElementById('results');
    
    if (searchResults.loading()) {
        container.innerHTML = '<div class="spinner">Searching...</div>';
    } else if (searchResults.error()) {
        container.innerHTML = `<div class="error">Error: ${searchResults.error().message}</div>`;
    } else {
        const results = searchResults() || [];
        container.innerHTML = results.map(item => 
            `<div class="result">${item.title}</div>`
        ).join('');
    }
});
```

### Paginated Data

```javascript
const currentPage = signal(1);
const pageSize = signal(10);

const paginatedData = resource(async () => {
    const page = currentPage();
    const size = pageSize();
    
    const response = await fetch(
        `/api/items?page=${page}&size=${size}`
    );
    
    const data = await response.json();
    return {
        items: data.items,
        total: data.total,
        hasMore: page * size < data.total
    };
});

// Pagination controls
const pagination = {
    nextPage() {
        const data = paginatedData();
        if (data && data.hasMore) {
            currentPage.update(p => p + 1);
        }
    },
    
    prevPage() {
        if (currentPage() > 1) {
            currentPage.update(p => p - 1);
        }
    },
    
    setPageSize(size) {
        pageSize.set(size);
        currentPage.set(1); // Reset to first page
    }
};

// Display
effect(() => {
    const data = paginatedData();
    
    if (!data) return;
    
    updateItemList(data.items);
    updatePaginationUI({
        currentPage: currentPage(),
        totalPages: Math.ceil(data.total / pageSize()),
        hasNext: data.hasMore,
        hasPrev: currentPage() > 1
    });
});
```

### Dependent Resources

Chain resources that depend on each other:

```javascript
// First resource: get current user
const currentUser = resource(async () => {
    const response = await fetch('/api/me');
    return response.json();
});

// Second resource: get user's projects (depends on currentUser)
const userProjects = resource(async () => {
    const user = currentUser();
    
    // Wait for user to load
    if (!user) return [];
    
    const response = await fetch(`/api/users/${user.id}/projects`);
    return response.json();
});

// Third resource: get project details (depends on selected project)
const selectedProjectId = signal(null);

const projectDetails = resource(async () => {
    const projectId = selectedProjectId();
    
    if (!projectId) return null;
    
    const response = await fetch(`/api/projects/${projectId}`);
    return response.json();
});

// UI effect
effect(() => {
    if (currentUser.loading()) {
        showLoader('Loading user...');
    } else if (userProjects.loading()) {
        showLoader('Loading projects...');
    } else if (projectDetails.loading()) {
        showLoader('Loading project details...');
    } else {
        hideLoader();
        displayDashboard({
            user: currentUser(),
            projects: userProjects(),
            currentProject: projectDetails()
        });
    }
});
```

### Polling Resource

Create a resource that polls for updates:

```javascript
function pollingResource(fetcher, interval = 5000) {
    const triggerSignal = signal(0);
    
    // Set up polling
    const intervalId = setInterval(() => {
        triggerSignal.update(n => n + 1);
    }, interval);
    
    const resource = resource(async () => {
        triggerSignal(); // Create dependency
        return fetcher();
    });
    
    // Return resource with cleanup
    return {
        ...resource,
        stop: () => clearInterval(intervalId)
    };
}

// Usage
const notifications = pollingResource(
    async () => {
        const response = await fetch('/api/notifications');
        return response.json();
    },
    10000 // Poll every 10 seconds
);

// Display notifications
effect(() => {
    const notifs = notifications();
    if (notifs && notifs.length > 0) {
        displayNotifications(notifs);
    }
});

// Clean up when done
onCleanup(() => notifications.stop());
```

## Manual Control

### Refetching

Force a resource to refetch:

```javascript
const data = resource(async () => {
    const response = await fetch('/api/data');
    return response.json();
});

// Manual refetch
async function refresh() {
    await data.refetch();
    console.log('Data refreshed!');
}

// Button handler
document.getElementById('refresh').onclick = refresh;
```

### Mutations with Optimistic Updates

Update the resource optimistically while saving:

```javascript
const todos = resource(async () => {
    const response = await fetch('/api/todos');
    return response.json();
});

async function addTodo(text) {
    // Optimistic update
    const newTodo = { id: Date.now(), text, completed: false };
    todos.mutate(current => [...(current || []), newTodo]);
    
    try {
        // Save to server
        const response = await fetch('/api/todos', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
        const savedTodo = await response.json();
        
        // Update with real data
        todos.mutate(current => 
            current.map(t => t.id === newTodo.id ? savedTodo : t)
        );
    } catch (error) {
        // Revert on error
        todos.mutate(current => 
            current.filter(t => t.id !== newTodo.id)
        );
        throw error;
    }
}
```

## Error Handling

### Retry Logic

Implement retry logic for failed requests:

```javascript
function retryableResource(fetcher, maxRetries = 3) {
    return resource(async () => {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fetcher();
            } catch (error) {
                lastError = error;
                
                // Exponential backoff
                if (i < maxRetries - 1) {
                    await new Promise(resolve => 
                        setTimeout(resolve, Math.pow(2, i) * 1000)
                    );
                }
            }
        }
        
        throw lastError;
    });
}

// Usage
const criticalData = retryableResource(async () => {
    const response = await fetch('/api/critical');
    if (!response.ok) throw new Error('Request failed');
    return response.json();
});
```

### Error Recovery

Handle errors gracefully:

```javascript
const userData = resource(async () => {
    const response = await fetch('/api/user');
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('User not found');
        }
        throw new Error('Failed to load user');
    }
    return response.json();
});

// Error handling UI
effect(() => {
    const error = userData.error();
    
    if (!error) {
        hideError();
        return;
    }
    
    if (error.message === 'User not found') {
        showError('User does not exist', {
            action: 'Create User',
            onAction: () => navigateTo('/signup')
        });
    } else {
        showError('Something went wrong', {
            action: 'Retry',
            onAction: () => userData.refetch()
        });
    }
});
```

## Caching Strategies

### Simple Cache

```javascript
function cachedResource(fetcher, cacheTime = 60000) {
    let cache = null;
    let cacheTimestamp = 0;
    
    return resource(async () => {
        const now = Date.now();
        
        // Return cached data if fresh
        if (cache && now - cacheTimestamp < cacheTime) {
            return cache;
        }
        
        // Fetch new data
        const data = await fetcher();
        cache = data;
        cacheTimestamp = now;
        
        return data;
    });
}

// Usage
const config = cachedResource(
    async () => {
        const response = await fetch('/api/config');
        return response.json();
    },
    5 * 60 * 1000 // Cache for 5 minutes
);
```

### Shared Cache

Share cached data between resources:

```javascript
const cache = new Map();

function sharedCacheResource(key, fetcher, ttl = 60000) {
    return resource(async () => {
        const cached = cache.get(key);
        
        if (cached && Date.now() - cached.timestamp < ttl) {
            return cached.data;
        }
        
        const data = await fetcher();
        cache.set(key, { data, timestamp: Date.now() });
        
        return data;
    });
}

// Multiple resources can share cache
const user1 = sharedCacheResource('user-1', () => fetch('/api/users/1').then(r => r.json()));
const user1Again = sharedCacheResource('user-1', () => fetch('/api/users/1').then(r => r.json()));
// Second one uses cache!
```

## Suspense-like Pattern

Create a suspense-like loading experience:

```javascript
function suspenseResource(fetcher) {
    let promise = null;
    let result = null;
    let error = null;
    
    const trigger = signal(0);
    
    return {
        read() {
            trigger(); // Track for reactivity
            
            if (error) throw error;
            if (result) return result;
            
            if (!promise) {
                promise = fetcher()
                    .then(data => {
                        result = data;
                        trigger.update(n => n + 1);
                    })
                    .catch(err => {
                        error = err;
                        trigger.update(n => n + 1);
                    });
            }
            
            throw promise; // Suspend
        },
        
        reset() {
            promise = null;
            result = null;
            error = null;
            trigger.update(n => n + 1);
        }
    };
}

// Usage with error boundary
function SafeComponent({ resource }) {
    try {
        const data = resource.read();
        return renderData(data);
    } catch (promiseOrError) {
        if (promiseOrError instanceof Promise) {
            return renderLoading();
        }
        return renderError(promiseOrError);
    }
}
```

## Best Practices

### 1. Handle All States

```javascript
// Always handle loading, error, and data states
effect(() => {
    const data = myResource();
    const loading = myResource.loading();
    const error = myResource.error();
    
    if (loading) {
        showSpinner();
    } else if (error) {
        showError(error.message);
    } else if (data) {
        showData(data);
    } else {
        showEmpty();
    }
});
```

### 2. Cleanup Subscriptions

```javascript
const events = resource(async () => {
    const response = await fetch('/api/events');
    return response.json();
});

// Clean up when component unmounts
const dispose = createRoot((dispose) => {
    effect(() => {
        console.log('Events:', events());
    });
    
    return dispose;
});

// Later
dispose(); // Cleans up resource and effects
```

### 3. Avoid Waterfalls

```javascript
// Bad: Sequential loading (waterfall)
const user = resource(async () => {
    const response = await fetch('/api/user');
    return response.json();
});

const posts = resource(async () => {
    const userData = user(); // Waits for user
    if (!userData) return [];
    
    const response = await fetch(`/api/users/${userData.id}/posts`);
    return response.json();
});

// Good: Parallel loading
const [user, posts] = [
    resource(() => fetch('/api/user').then(r => r.json())),
    resource(() => fetch('/api/posts').then(r => r.json()))
];
```

### 4. Type Safety

```typescript
interface User {
    id: number;
    name: string;
}

const user = resource<User>(async () => {
    const response = await fetch('/api/user');
    return response.json();
});

// TypeScript knows the types
effect(() => {
    const data = user(); // User | undefined
    if (data) {
        console.log(data.name); // string
    }
});
```

## Common Pitfalls

### 1. Not Handling Race Conditions

```javascript
// Problem: Old request overwrites new
const id = signal(1);
const data = resource(async () => {
    const response = await fetch(`/api/data/${id()}`);
    await delay(Math.random() * 1000); // Variable delay
    return response.json();
});

// Resources handle this automatically!
// When id changes, old request is ignored
```

### 2. Creating Resources in Effects

```javascript
// WRONG: Creating resources dynamically
effect(() => {
    const res = resource(() => fetch('/api/data')); // Don't do this!
});

// RIGHT: Create resource once
const res = resource(() => fetch('/api/data'));
effect(() => {
    console.log(res());
});
```

### 3. Infinite Refetch Loops

```javascript
// WRONG: Modifying own dependencies
const counter = signal(0);
const data = resource(async () => {
    counter.update(n => n + 1); // Causes infinite loop!
    return fetch('/api/data').then(r => r.json());
});
```

## Summary

Resources are the perfect solution for async data in reactive systems:

- **Automatic fetching** when dependencies change
- **Built-in states** for loading and errors
- **Race condition handling** out of the box
- **Reactive integration** with signals and effects
- **Manual control** via refetch when needed

Resources complete the reactive primitives toolkit. Next, let's explore [Batching & Performance](./07-batching.md) to understand how NeoFlux optimizes updates for maximum performance.