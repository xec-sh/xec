import { $ } from '@xec-sh/core';
console.log('=== Result Caching Example ===\n');
console.log('1. Basic caching with default TTL:');
console.time('First execution');
const result1 = await $ `echo "Current time: $(date)" && sleep 2`.cache();
console.timeEnd('First execution');
console.log('Result:', result1.stdout.trim());
console.time('Second execution (cached)');
const result2 = await $ `echo "Current time: $(date)" && sleep 2`.cache();
console.timeEnd('Second execution (cached)');
console.log('Result:', result2.stdout.trim());
console.log('Results are identical:', result1.stdout === result2.stdout);
console.log('\n2. Custom cache key:');
const apiKey = 'test-api-key';
const apiResult1 = await $ `echo "Fetching data for key: ${apiKey}"`.cache({
    key: 'api-data-fetch',
    ttl: 5000
});
const apiResult2 = await $ `echo "Getting data for: ${apiKey}"`.cache({
    key: 'api-data-fetch'
});
console.log('Different commands, same cache:', apiResult1.stdout === apiResult2.stdout);
console.log('\n3. Cache with custom TTL:');
const shortLived = await $ `echo "Short-lived data: $(date +%s)"`.cache({
    ttl: 2000
});
console.log('Cached value:', shortLived.stdout.trim());
await new Promise(resolve => setTimeout(resolve, 2500));
const afterExpiry = await $ `echo "Short-lived data: $(date +%s)"`.cache({
    ttl: 2000
});
console.log('New value after expiry:', afterExpiry.stdout.trim());
console.log('Values are different:', shortLived.stdout !== afterExpiry.stdout);
console.log('\n4. Cache invalidation:');
const readResult = await $ `echo "Database records: 100"`.cache({
    key: 'db-count',
    ttl: 60000
});
console.log('Initial read:', readResult.stdout.trim());
await $ `echo "INSERT INTO table..."`.cache({
    key: 'db-write',
    invalidateOn: ['db-count', 'db-*']
});
const readAfterWrite = await $ `echo "Database records: 101"`.cache({
    key: 'db-count',
    ttl: 60000
});
console.log('Read after write:', readAfterWrite.stdout.trim());
console.log('\n5. Caching expensive operations:');
async function expensiveOperation(param) {
    return $ `echo "Computing result for ${param}..." && sleep 1 && echo "Result: ${Math.random()}"`.cache({
        key: `expensive-${param}`,
        ttl: 30000
    });
}
console.time('First expensive call');
const expensive1 = await expensiveOperation('param1');
console.timeEnd('First expensive call');
console.time('Second expensive call (cached)');
const expensive2 = await expensiveOperation('param1');
console.timeEnd('Second expensive call (cached)');
console.log('Cached results match:', expensive1.stdout === expensive2.stdout);
console.log('\n6. Caching in parallel operations:');
const parallelTasks = Array(5).fill(null).map((_, i) => $ `echo "Task ${i}: $(date +%s%N)" && sleep 0.5`.cache({
    key: `parallel-task-${i % 2}`,
    ttl: 5000
}));
const parallelResults = await Promise.all(parallelTasks);
console.log('Tasks 0,2,4 have same result:', parallelResults[0].stdout === parallelResults[2].stdout &&
    parallelResults[2].stdout === parallelResults[4].stdout);
console.log('Tasks 1,3 have same result:', parallelResults[1].stdout === parallelResults[3].stdout);
console.log('\n7. Environment-specific caching:');
const devResult = await $ `echo "Environment: DEV"`.env({ NODE_ENV: 'development' }).cache();
const prodResult = await $ `echo "Environment: PROD"`.env({ NODE_ENV: 'production' }).cache();
console.log('Different environments cached separately:', devResult.stdout !== prodResult.stdout);
console.log('\n8. Caching with error handling:');
try {
    await $ `exit 1`.cache({ key: 'failing-command' });
}
catch (error) {
    console.log('First execution failed');
}
try {
    await $ `exit 1`.cache({ key: 'failing-command' });
    console.log('Second execution also fails (not cached)');
}
catch (error) {
    console.log('Second execution failed too');
}
console.log('\n9. Cache warming:');
const warmupTasks = [
    $ `echo "System info loaded"`.cache({ key: 'system-info', ttl: 300000 }),
    $ `echo "Config loaded"`.cache({ key: 'app-config', ttl: 300000 }),
    $ `echo "Dependencies checked"`.cache({ key: 'deps-check', ttl: 300000 })
];
await Promise.all(warmupTasks);
console.log('Cache warmed up');
console.time('Using warmed cache');
await $ `echo "System info loaded"`.cache({ key: 'system-info' });
await $ `echo "Config loaded"`.cache({ key: 'app-config' });
await $ `echo "Dependencies checked"`.cache({ key: 'deps-check' });
console.timeEnd('Using warmed cache');
console.log('\n10. Conditional caching:');
async function conditionalCache(useCache) {
    const command = $ `echo "Data: $(date +%s)" && sleep 0.5`;
    if (useCache) {
        return command.cache({ ttl: 10000 });
    }
    return command;
}
const cached = await conditionalCache(true);
const notCached1 = await conditionalCache(false);
const notCached2 = await conditionalCache(false);
console.log('Uncached results are different:', notCached1.stdout !== notCached2.stdout);
console.log('\n11. Common caching patterns:');
const versionCheck = await $ `echo "Node version: v18.0.0"`.cache({
    key: 'node-version',
    ttl: 3600000
});
const dynamicData = await $ `echo "User count: ${Math.floor(Math.random() * 1000)}"`.cache({
    key: 'user-count',
    ttl: 5000
});
const isDev = process.env.NODE_ENV === 'development';
const buildResult = await $ `echo "Building project..."`.cache({
    key: 'project-build',
    ttl: isDev ? 60000 : 0
});
console.log('Caching patterns applied');
console.log('\n12. Cache effectiveness:');
console.log('Cache can significantly improve performance for:');
console.log('- Repeated API calls');
console.log('- File system scans');
console.log('- Network requests');
console.log('- Heavy computations');
console.log('- External tool invocations');
console.log('\n=== Caching Example Complete ===');
//# sourceMappingURL=08-result-caching.js.map