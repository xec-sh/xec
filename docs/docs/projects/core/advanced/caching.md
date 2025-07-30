---
sidebar_position: 7
---

# Result Caching

Optimize performance by caching command results to avoid redundant executions.

## Overview

The caching system in @xec-sh/core provides:
- In-memory result caching with TTL support
- Automatic cache key generation from command, working directory, and environment
- Custom cache keys for better control
- Cache invalidation patterns
- Integration with ProcessPromise methods

## Basic Caching

### Simple Cache Usage

```typescript
import { $ } from '@xec-sh/core';

// Cache with custom key
const result = await $`expensive-api-call`.cache({ key: 'api-data' });

// Subsequent calls with same key return cached result
const cached = await $`different-command`.cache({ key: 'api-data' }); // Returns cached result

// Cache with TTL (time to live)
const ttlResult = await $`curl https://api.example.com/data`.cache({
  key: 'api-response',
  ttl: 60000 // Cache for 60 seconds
});
```

### Automatic Cache Key Generation

```typescript
// If no key is provided, cache key is generated from command, cwd, and env
const result1 = await $`echo "hello"`.cache();
const result2 = await $`echo "hello"`.cache(); // Same result (cached)

// Different commands generate different keys
const result3 = await $`echo "world"`.cache(); // Different result
```

## Cache Key Strategies

### Environment-Based Caching

```typescript
// Different environments = different cache keys
const dev = await $`echo $NODE_ENV`.env({ NODE_ENV: 'development' }).cache();
const prod = await $`echo $NODE_ENV`.env({ NODE_ENV: 'production' }).cache();
// These are cached separately

// Same environment = same cache
const dev2 = await $`echo "anything"`.env({ NODE_ENV: 'development' }).cache();
// Returns the cached result from the first dev command
```

### Working Directory-Based Caching

```typescript
// Different working directories = different cache keys
const tmp = await $`pwd`.cwd('/tmp').cache();
const usr = await $`pwd`.cwd('/usr').cache();
// These are cached separately

// Same directory = same cache
const tmp2 = await $`echo "test"`.cwd('/tmp').cache();
// Returns the cached result from the first tmp command
```

### Custom Cache Keys

```typescript
// Use custom keys for explicit control
const version = await $`node --version`.cache({
  key: 'node-version',
  ttl: 3600000  // 1 hour
});

// Share cache between different commands
const files1 = await $`find . -name "*.js"`.cache({
  key: 'js-files',
  ttl: 60000
});

const files2 = await $`ls *.js`.cache({
  key: 'js-files'  // Same key, returns cached result
});
```

## Cache TTL (Time To Live)

### TTL Configuration

```typescript
// Cache expires after specified milliseconds
const result = await $`date`.cache({
  key: 'current-date',
  ttl: 5000  // 5 seconds
});

// After 5 seconds, the cache expires
await new Promise(resolve => setTimeout(resolve, 6000));
const newResult = await $`date`.cache({
  key: 'current-date',
  ttl: 5000
}); // Executes command again

// Zero or negative TTL means no expiration
const permanent = await $`echo "permanent"`.cache({
  key: 'permanent-data',
  ttl: 0  // Never expires
});
```

## Cache Invalidation

### Invalidation Patterns

```typescript
// Cache a read operation
const users = await $`get-users`.cache({
  key: 'user-list',
  ttl: 300000  // 5 minutes
});

// Write operation that invalidates related caches
await $`add-user "John"`.cache({
  key: 'add-user-john',
  invalidateOn: ['user-list']  // Invalidates the user-list cache
});

// Next read will execute the command again
const updatedUsers = await $`get-users`.cache({
  key: 'user-list',
  ttl: 300000
}); // Fresh data
```

### Pattern-Based Invalidation

```typescript
// Cache multiple related operations
await $`get-api-users`.cache({ key: 'api-users' });
await $`get-api-posts`.cache({ key: 'api-posts' });
await $`get-db-stats`.cache({ key: 'db-stats' });

// Invalidate all api-* caches
await $`update-api-data`.cache({
  key: 'update',
  invalidateOn: ['api-*']  // Invalidates api-users and api-posts
});

// db-stats remains cached
```

## Error Handling

### Failed Commands

```typescript
// By default, failed commands are NOT cached
try {
  await $`exit 1`.cache({ key: 'fail-test' });
} catch (error) {
  // Command failed
}

// Subsequent call will execute again
await $`exit 0`.cache({ key: 'fail-test' }); // Executes successfully

// With nothrow(), error results ARE cached
const errorResult = await $`exit 42`.nothrow().cache({ key: 'error-test' });
// errorResult.exitCode === 42

const cachedError = await $`exit 0`.nothrow().cache({ key: 'error-test' });
// cachedError.exitCode === 42 (cached error result)
```

## Integration with ProcessPromise

### Method Chaining

```typescript
// Cache works with all ProcessPromise methods
const quiet = await $`echo "quiet"`.quiet().cache({ key: 'quiet-output' });

const timeout = await $`slow-command`.timeout(5000).cache({ key: 'timeout-cmd' });

const combined = await $`echo "TEST=$TEST PWD=$(pwd)"`
  .env({ TEST: 'value' })
  .cwd('/tmp')
  .cache({ key: 'combined' });
```

### Concurrent Cache Access

```typescript
// Multiple concurrent requests for the same cache key
const promises = Array.from({ length: 5 }, () => 
  $`expensive-operation`.cache({ key: 'shared-key' })
);

// All requests will share the same cached result
const results = await Promise.all(promises);
// Only the first request executes the command
```

## Cache Management

### Global Cache Instance

```typescript
import { globalCache } from '@xec-sh/core';

// Clear all cached entries
globalCache.clear();

// Cache is automatically managed and cleaned up
// Expired entries are removed periodically
```

## Testing with Cache

### Unit Tests

```typescript
import { globalCache, $ } from '@xec-sh/core';

describe('Caching functionality', () => {
  beforeEach(() => {
    // Clear cache before each test
    globalCache.clear();
  });
  
  it('should cache command results', async () => {
    const timestamp = Date.now();
    
    // First call - executes command
    const result1 = await $`echo ${timestamp}`.cache({ key: 'test-key' });
    
    // Second call - returns cached result
    const result2 = await $`echo "different"`.cache({ key: 'test-key' });
    
    expect(result1.stdout).toBe(result2.stdout);
  });
  
  it('should respect TTL', async () => {
    jest.useFakeTimers();
    
    const result1 = await $`echo "test"`.cache({ key: 'ttl-test', ttl: 1000 });
    
    // Advance time past TTL
    jest.advanceTimersByTime(2000);
    
    const result2 = await $`echo "new"`.cache({ key: 'ttl-test', ttl: 1000 });
    
    expect(result2.stdout).toContain('new');
    
    jest.useRealTimers();
  });
});
```

## Practical Examples

### API Response Caching

```typescript
async function getWeatherData(city: string) {
  return await $`curl -s "https://api.weather.com/v1/cities/${city}"`.cache({
    key: `weather:${city}`,
    ttl: 600000  // 10 minutes
  });
}

// First call fetches from API
const weather1 = await getWeatherData('london');

// Subsequent calls within 10 minutes return cached data
const weather2 = await getWeatherData('london'); // Instant
```

### Build Artifact Caching

```typescript
async function buildProject() {
  // Check if source files have changed
  const sourceHash = await $`find src -type f -exec md5sum {} \\; | sort | md5sum`.cache({
    key: 'source-hash',
    ttl: 1000  // Very short TTL just for the build process
  });
  
  // Use hash as part of cache key
  const buildResult = await $`npm run build`.cache({
    key: `build:${sourceHash.stdout.trim()}`,
    ttl: 3600000  // 1 hour
  });
  
  return buildResult;
}
```

### Database Query Caching

```typescript
async function getActiveUsers() {
  return await $`psql -c "SELECT * FROM users WHERE active = true"`.cache({
    key: 'active-users',
    ttl: 30000  // 30 seconds
  });
}

async function createUser(name: string) {
  const result = await $`psql -c "INSERT INTO users (name, active) VALUES ('${name}', true)"`;
  
  // Invalidate user cache after insert
  await $`echo "cache invalidated"`.cache({
    key: 'invalidate-users',
    invalidateOn: ['active-users']
  });
  
  return result;
}
```

## Best Practices

1. **Choose appropriate TTLs** - Balance data freshness with performance
2. **Use meaningful cache keys** - Make them descriptive and predictable
3. **Cache expensive operations** - Network calls, complex calculations, slow commands
4. **Invalidate proactively** - Clear cache when data changes
5. **Handle cache misses** - Always be prepared for commands to execute
6. **Test with cache cleared** - Ensure tests are deterministic
7. **Consider memory usage** - Cache stores results in memory
8. **Use environment/cwd scoping** - Let the library handle context-aware caching

## Next Steps

- Learn about [Connection Pooling](./connection-pooling) for network efficiency
- See [Event System](./event-system) for monitoring command execution
- Explore [Parallel Execution](./parallel-execution) for performance optimization
- Check [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) for more caching patterns