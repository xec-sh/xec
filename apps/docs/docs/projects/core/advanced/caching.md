---
sidebar_position: 7
---

# Result Caching

Optimize performance by caching command results to avoid redundant executions.

## Overview

The caching system in @xec-sh/core provides:
- In-memory result caching with TTL support
- Cache key generation from commands and context
- Conditional caching based on command type
- Cache invalidation strategies
- Memory-efficient storage
- Cache statistics and monitoring

## Basic Caching

### Simple Cache Usage

```typescript
import { $ } from '@xec-sh/core';

// Cache command result for 60 seconds
const result = await $`expensive-api-call`.cache(60000);

// Subsequent calls within TTL return cached result
const cached = await $`expensive-api-call`.cache(60000); // Returns instantly
```

### Cache Configuration

```typescript
// Detailed cache configuration
const result = await $`curl https://api.example.com/data`.cache({
  ttl: 300000,              // 5 minutes
  key: 'api-data-v1',       // Custom cache key
  condition: (result) => result.isSuccess(), // Only cache successful results
  onHit: (key) => console.log(`Cache hit: ${key}`),
  onMiss: (key) => console.log(`Cache miss: ${key}`),
  onExpire: (key) => console.log(`Cache expired: ${key}`)
});
```

## Cache Key Strategies

### Automatic Key Generation

```typescript
// Keys are generated from command and context
await $`date +%Y-%m-%d`.cache(60000);  // Key includes command

// Different contexts = different keys
await $.env({ TZ: 'UTC' })`date`.cache(60000);      // Different key
await $.env({ TZ: 'PST' })`date`.cache(60000);      // Different key

// Working directory affects key
await $.cd('/tmp')`ls`.cache(60000);    // One key
await $.cd('/home')`ls`.cache(60000);   // Different key
```

### Custom Cache Keys

```typescript
// Use custom keys for better control
const version = await $`node --version`.cache({
  key: 'node-version',
  ttl: 3600000  // 1 hour
});

// Share cache between similar commands
const files1 = await $`find . -name "*.js"`.cache({
  key: 'js-files-in-project',
  ttl: 60000
});

const files2 = await $`find . -type f -name "*.js"`.cache({
  key: 'js-files-in-project',  // Same key, returns cached result
  ttl: 60000
});
```

### Dynamic Cache Keys

```typescript
// Generate keys based on parameters
async function getFileStats(filename: string) {
  return await $`stat ${filename}`.cache({
    key: `file-stats:${filename}`,
    ttl: 30000
  });
}

// Cache with versioning
async function getProcessedData(version: string) {
  return await $`process-data --version ${version}`.cache({
    key: `processed-data:v${version}`,
    ttl: 600000  // 10 minutes
  });
}
```

## Conditional Caching

### Cache Only Success

```typescript
// Only cache successful results
const result = await $`flaky-api-call`.cache({
  ttl: 60000,
  condition: (result) => result.isSuccess()
});

// Cache based on output
const data = await $`fetch-data`.cache({
  ttl: 300000,
  condition: (result) => {
    // Only cache if we got meaningful data
    return result.isSuccess() && 
           result.stdout.length > 100 &&
           !result.stdout.includes('error');
  }
});
```

### Cache with Validation

```typescript
// Validate cached data is still relevant
const config = await $`get-config`.cache({
  ttl: 600000,
  validate: async (cachedResult) => {
    // Check if config file was modified
    const mtime = await $`stat -c %Y /etc/app.conf`.text();
    const cacheTime = cachedResult.cachedAt.getTime() / 1000;
    return parseInt(mtime) < cacheTime;
  }
});
```

## Cache Management

### Global Cache Instance

```typescript
import { globalCache } from '@xec-sh/core';

// Get cache statistics
const stats = globalCache.stats();
console.log('Cache hits:', stats.hits);
console.log('Cache misses:', stats.misses);
console.log('Cache size:', stats.size);
console.log('Memory usage:', stats.memoryUsage);

// Clear all cache
globalCache.clear();

// Clear specific key
globalCache.delete('node-version');

// Clear by pattern
globalCache.clearPattern(/^api-data/);
```

### Cache Size Limits

```typescript
// Configure cache limits
globalCache.configure({
  maxSize: 100,           // Maximum number of entries
  maxMemory: 50 * 1024 * 1024,  // 50MB
  onEvict: (key, value) => {
    console.log(`Evicted ${key} to make room`);
  }
});

// Check if cache has room
if (globalCache.hasCapacity()) {
  await $`large-operation`.cache(60000);
}
```

## Advanced Caching Patterns

### Hierarchical Caching

```typescript
// Multi-level cache with different TTLs
async function getDataWithCache(id: string) {
  // Try fast local cache first
  const quickCache = await $`get-from-memory ${id}`.cache({
    key: `memory:${id}`,
    ttl: 10000  // 10 seconds
  }).nothrow();
  
  if (quickCache.isSuccess()) {
    return quickCache;
  }
  
  // Try slower persistent cache
  const persistentCache = await $`get-from-redis ${id}`.cache({
    key: `redis:${id}`,
    ttl: 300000  // 5 minutes
  }).nothrow();
  
  if (persistentCache.isSuccess()) {
    return persistentCache;
  }
  
  // Finally, get from source
  return await $`fetch-from-api ${id}`.cache({
    key: `api:${id}`,
    ttl: 600000  // 10 minutes
  });
}
```

### Cache Warming

```typescript
// Pre-populate cache during startup
async function warmCache() {
  const criticalData = [
    { cmd: 'get-config', key: 'app-config', ttl: 3600000 },
    { cmd: 'list-users', key: 'user-list', ttl: 300000 },
    { cmd: 'get-permissions', key: 'permissions', ttl: 600000 }
  ];
  
  await Promise.all(
    criticalData.map(({ cmd, key, ttl }) =>
      $`${cmd}`.cache({ key, ttl }).catch(error => {
        console.error(`Failed to warm cache for ${key}:`, error);
      })
    )
  );
  
  console.log('Cache warmed successfully');
}

// Run on startup
await warmCache();
```

### Distributed Cache Sync

```typescript
// Sync cache across multiple instances
class DistributedCache {
  async get(key: string): Promise<any> {
    // Try local cache first
    const local = globalCache.get(key);
    if (local) return local;
    
    // Try distributed cache
    const remote = await $`redis-cli GET cache:${key}`.nothrow();
    if (remote.isSuccess() && remote.stdout) {
      const value = JSON.parse(remote.stdout);
      globalCache.set(key, value, { ttl: 60000 });
      return value;
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttl: number): Promise<void> {
    // Set in local cache
    globalCache.set(key, value, { ttl });
    
    // Set in distributed cache
    await $`redis-cli SETEX cache:${key} ${Math.floor(ttl / 1000)} '${JSON.stringify(value)}'`;
  }
}
```

## Cache Invalidation

### Manual Invalidation

```typescript
// Invalidate cache after updates
async function updateConfig(newConfig: any) {
  // Update configuration
  await $`echo '${JSON.stringify(newConfig)}' > /etc/app.conf`;
  
  // Invalidate related caches
  globalCache.delete('app-config');
  globalCache.clearPattern(/^config:/);
  
  // Optionally pre-warm with new data
  await $`get-config`.cache({ key: 'app-config', ttl: 3600000 });
}
```

### Event-Based Invalidation

```typescript
// Invalidate cache on events
$.on('command:success', (event) => {
  // Invalidate cache for write operations
  if (event.command.includes('UPDATE') || 
      event.command.includes('INSERT') ||
      event.command.includes('DELETE')) {
    globalCache.clearPattern(/^db-query:/);
  }
});

// File watch invalidation
import { watch } from 'fs';

watch('/etc/app.conf', (eventType) => {
  if (eventType === 'change') {
    globalCache.delete('app-config');
    console.log('Configuration cache invalidated');
  }
});
```

### Time-Based Invalidation

```typescript
// Invalidate cache at specific times
function scheduleCacheInvalidation() {
  // Clear cache at midnight
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  setTimeout(() => {
    globalCache.clearPattern(/^daily-/);
    console.log('Daily cache cleared');
    
    // Schedule next invalidation
    setInterval(() => {
      globalCache.clearPattern(/^daily-/);
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
```

## Performance Monitoring

### Cache Metrics

```typescript
class CacheMonitor {
  private startTime = Date.now();
  
  logMetrics() {
    const stats = globalCache.stats();
    const uptime = (Date.now() - this.startTime) / 1000;
    
    console.log('=== Cache Metrics ===');
    console.log(`Uptime: ${uptime.toFixed(0)}s`);
    console.log(`Hit Rate: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)}%`);
    console.log(`Total Requests: ${stats.hits + stats.misses}`);
    console.log(`Memory Usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Entries: ${stats.size}`);
    console.log(`Evictions: ${stats.evictions}`);
  }
  
  async logSlowMisses() {
    const slowThreshold = 1000; // 1 second
    
    globalCache.on('miss', async (key, duration) => {
      if (duration > slowThreshold) {
        console.warn(`Slow cache miss: ${key} took ${duration}ms`);
        
        // Consider pre-warming this key
        await this.prewarmKey(key);
      }
    });
  }
  
  private async prewarmKey(key: string) {
    // Implementation depends on your key strategy
    console.log(`Pre-warming cache for key: ${key}`);
  }
}
```

### Cache Efficiency Analysis

```typescript
// Analyze cache effectiveness
async function analyzeCacheUsage(duration: number) {
  const analysis = {
    commandStats: new Map<string, { hits: number; misses: number }>(),
    totalSaved: 0,
    avgHitTime: 0,
    avgMissTime: 0
  };
  
  // Track cache events
  globalCache.on('hit', (key, time) => {
    analysis.totalSaved += time;
    analysis.avgHitTime = (analysis.avgHitTime + time) / 2;
  });
  
  globalCache.on('miss', (key, time) => {
    analysis.avgMissTime = (analysis.avgMissTime + time) / 2;
  });
  
  // Wait for duration
  await new Promise(resolve => setTimeout(resolve, duration));
  
  // Report results
  console.log('=== Cache Analysis ===');
  console.log(`Time saved: ${(analysis.totalSaved / 1000).toFixed(2)}s`);
  console.log(`Avg hit time: ${analysis.avgHitTime.toFixed(0)}ms`);
  console.log(`Avg miss time: ${analysis.avgMissTime.toFixed(0)}ms`);
}
```

## Testing with Cache

### Unit Tests

```typescript
import { globalCache } from '@xec-sh/core';

describe('Caching functionality', () => {
  beforeEach(() => {
    globalCache.clear();
  });
  
  it('should cache command results', async () => {
    // First call - cache miss
    const result1 = await $`echo ${Date.now()}`.cache(1000);
    
    // Second call - cache hit
    const result2 = await $`echo ${Date.now()}`.cache(1000);
    
    expect(result1.stdout).toBe(result2.stdout);
  });
  
  it('should expire cache after TTL', async () => {
    const result1 = await $`echo ${Date.now()}`.cache(100);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const result2 = await $`echo ${Date.now()}`.cache(100);
    
    expect(result1.stdout).not.toBe(result2.stdout);
  });
});
```

### Integration Tests

```typescript
describe('Cache with adapters', () => {
  it('should cache SSH results', async () => {
    const ssh = $.ssh({ host: 'server.com', username: 'user' });
    
    const start = Date.now();
    await ssh`expensive-query`.cache(60000);
    const firstDuration = Date.now() - start;
    
    const start2 = Date.now();
    await ssh`expensive-query`.cache(60000);
    const secondDuration = Date.now() - start2;
    
    expect(secondDuration).toBeLessThan(firstDuration / 10);
  });
});
```

## Best Practices

1. **Cache expensive operations** - Network calls, complex calculations
2. **Use appropriate TTLs** - Balance freshness vs performance
3. **Implement cache warming** - Pre-populate critical data
4. **Monitor hit rates** - Aim for >80% for frequently used data
5. **Handle cache misses gracefully** - Always have a fallback
6. **Invalidate proactively** - Clear cache when data changes
7. **Set memory limits** - Prevent unbounded growth
8. **Use custom keys wisely** - Make them predictable and debuggable
9. **Test cache behavior** - Include cache scenarios in tests
10. **Document cache strategy** - Explain TTLs and invalidation rules

## Next Steps

- Learn about [Connection Pooling](./connection-pooling) for network efficiency
- See [Event System](./event-system) for cache monitoring
- Explore [Parallel Execution](./parallel-execution) for performance optimization
- Check [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) for caching patterns