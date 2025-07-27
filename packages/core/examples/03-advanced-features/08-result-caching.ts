/**
 * 08. Result Caching - Cache Command Results for Performance
 * 
 * Demonstrates how to cache command execution results to avoid
 * running expensive operations multiple times.
 * 
 * Caching is useful for:
 * - Expensive operations (API calls, heavy computations)
 * - Idempotent commands (commands that produce the same result)
 * - Reducing system load and improving performance
 * - Development workflows (avoid re-running slow commands)
 */

import { $ } from '@xec-sh/core';

console.log('=== Result Caching Example ===\n');

// 1. Basic caching - default TTL (1 minute)
console.log('1. Basic caching with default TTL:');
console.time('First execution');
const result1 = await $`echo "Current time: $(date)" && sleep 2`.cache();
console.timeEnd('First execution');
console.log('Result:', result1.stdout.trim());

// Running the same command again will use cached result
console.time('Second execution (cached)');
const result2 = await $`echo "Current time: $(date)" && sleep 2`.cache();
console.timeEnd('Second execution (cached)');
console.log('Result:', result2.stdout.trim());
console.log('Results are identical:', result1.stdout === result2.stdout);

// 2. Custom cache key - useful when command varies but result is the same
console.log('\n2. Custom cache key:');
const apiKey = 'test-api-key';
const apiResult1 = await $`echo "Fetching data for key: ${apiKey}"`.cache({
  key: 'api-data-fetch',
  ttl: 5000 // 5 seconds
});

// Different command but same cache key
const apiResult2 = await $`echo "Getting data for: ${apiKey}"`.cache({
  key: 'api-data-fetch'
});
console.log('Different commands, same cache:', apiResult1.stdout === apiResult2.stdout);

// 3. Cache with TTL (Time To Live)
console.log('\n3. Cache with custom TTL:');
const shortLived = await $`echo "Short-lived data: $(date +%s)"`.cache({
  ttl: 2000 // 2 seconds
});
console.log('Cached value:', shortLived.stdout.trim());

// Wait for cache to expire
await new Promise(resolve => setTimeout(resolve, 2500));

const afterExpiry = await $`echo "Short-lived data: $(date +%s)"`.cache({
  ttl: 2000
});
console.log('New value after expiry:', afterExpiry.stdout.trim());
console.log('Values are different:', shortLived.stdout !== afterExpiry.stdout);

// 4. Cache invalidation patterns
console.log('\n4. Cache invalidation:');

// Cache a "read" operation
const readResult = await $`echo "Database records: 100"`.cache({
  key: 'db-count',
  ttl: 60000
});
console.log('Initial read:', readResult.stdout.trim());

// "Write" operation that invalidates related caches
await $`echo "INSERT INTO table..."`.cache({
  key: 'db-write',
  invalidateOn: ['db-count', 'db-*'] // Invalidate related caches
});

// Next read will execute again (cache was invalidated)
const readAfterWrite = await $`echo "Database records: 101"`.cache({
  key: 'db-count',
  ttl: 60000
});
console.log('Read after write:', readAfterWrite.stdout.trim());

// 5. Caching expensive operations
console.log('\n5. Caching expensive operations:');

// Simulate an expensive operation
async function expensiveOperation(param: string) {
  return $`echo "Computing result for ${param}..." && sleep 1 && echo "Result: ${Math.random()}"`.cache({
    key: `expensive-${param}`,
    ttl: 30000 // 30 seconds
  });
}

console.time('First expensive call');
const expensive1 = await expensiveOperation('param1');
console.timeEnd('First expensive call');

console.time('Second expensive call (cached)');
const expensive2 = await expensiveOperation('param1');
console.timeEnd('Second expensive call (cached)');

console.log('Cached results match:', expensive1.stdout === expensive2.stdout);

// 6. Caching in parallel operations
console.log('\n6. Caching in parallel operations:');

const parallelTasks = Array(5).fill(null).map((_, i) =>
  $`echo "Task ${i}: $(date +%s%N)" && sleep 0.5`.cache({
    key: `parallel-task-${i % 2}`, // Only 2 unique keys
    ttl: 5000
  })
);

const parallelResults = await Promise.all(parallelTasks);
console.log('Tasks 0,2,4 have same result:', 
  parallelResults[0].stdout === parallelResults[2].stdout &&
  parallelResults[2].stdout === parallelResults[4].stdout
);
console.log('Tasks 1,3 have same result:', 
  parallelResults[1].stdout === parallelResults[3].stdout
);

// 7. Environment-specific caching
console.log('\n7. Environment-specific caching:');

// Cache keys are automatically scoped by cwd and env
const devResult = await $`echo "Environment: DEV"`.env({ NODE_ENV: 'development' }).cache();
const prodResult = await $`echo "Environment: PROD"`.env({ NODE_ENV: 'production' }).cache();

console.log('Different environments cached separately:', devResult.stdout !== prodResult.stdout);

// 8. Caching with error handling
console.log('\n8. Caching with error handling:');

// Failed commands are not cached by default
try {
  await $`exit 1`.cache({ key: 'failing-command' });
} catch (error) {
  console.log('First execution failed');
}

try {
  await $`exit 1`.cache({ key: 'failing-command' });
  console.log('Second execution also fails (not cached)');
} catch (error) {
  console.log('Second execution failed too');
}

// 9. Cache warming
console.log('\n9. Cache warming:');

// Pre-populate cache with common operations
const warmupTasks = [
  $`echo "System info loaded"`.cache({ key: 'system-info', ttl: 300000 }),
  $`echo "Config loaded"`.cache({ key: 'app-config', ttl: 300000 }),
  $`echo "Dependencies checked"`.cache({ key: 'deps-check', ttl: 300000 })
];

await Promise.all(warmupTasks);
console.log('Cache warmed up');

// Subsequent calls will be instant
console.time('Using warmed cache');
await $`echo "System info loaded"`.cache({ key: 'system-info' });
await $`echo "Config loaded"`.cache({ key: 'app-config' });
await $`echo "Dependencies checked"`.cache({ key: 'deps-check' });
console.timeEnd('Using warmed cache');

// 10. Conditional caching
console.log('\n10. Conditional caching:');

// Only cache if certain conditions are met
async function conditionalCache(useCache: boolean) {
  const command = $`echo "Data: $(date +%s)" && sleep 0.5`;
  
  if (useCache) {
    return command.cache({ ttl: 10000 });
  }
  return command;
}

const cached = await conditionalCache(true);
const notCached1 = await conditionalCache(false);
const notCached2 = await conditionalCache(false);

console.log('Uncached results are different:', notCached1.stdout !== notCached2.stdout);

// 11. Cache patterns for different scenarios
console.log('\n11. Common caching patterns:');

// Pattern 1: Version checks (cache for longer)
const versionCheck = await $`echo "Node version: v18.0.0"`.cache({
  key: 'node-version',
  ttl: 3600000 // 1 hour
});

// Pattern 2: Dynamic data (cache for shorter)
const dynamicData = await $`echo "User count: ${Math.floor(Math.random() * 1000)}"`.cache({
  key: 'user-count',
  ttl: 5000 // 5 seconds
});

// Pattern 3: Development vs Production
const isDev = process.env.NODE_ENV === 'development';
const buildResult = await $`echo "Building project..."`.cache({
  key: 'project-build',
  ttl: isDev ? 60000 : 0 // Cache in dev, no cache in prod
});

console.log('Caching patterns applied');

// 12. Cache metrics (conceptual - actual implementation would need stats tracking)
console.log('\n12. Cache effectiveness:');
console.log('Cache can significantly improve performance for:');
console.log('- Repeated API calls');
console.log('- File system scans');
console.log('- Network requests');
console.log('- Heavy computations');
console.log('- External tool invocations');

console.log('\n=== Caching Example Complete ===');