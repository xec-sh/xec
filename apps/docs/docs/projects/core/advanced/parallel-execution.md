---
sidebar_position: 1
---

# Parallel Execution

Execute multiple commands concurrently with control over concurrency limits, error handling, and progress tracking.

## Overview

Parallel execution in @xec-sh/core allows you to:

- **Run Multiple Commands** - Execute commands simultaneously
- **Control Concurrency** - Limit how many run at once
- **Handle Errors** - Choose between fail-fast or continue
- **Track Progress** - Monitor completion status
- **Optimize Performance** - Reduce total execution time

## Basic Parallel Execution

### Using Promise.all

The simplest way to run commands in parallel:

```typescript
import { $ } from '@xec-sh/core';

// Run multiple commands simultaneously
const results = await Promise.all([
  $`sleep 1 && echo "Task 1"`,
  $`sleep 1 && echo "Task 2"`,
  $`sleep 1 && echo "Task 3"`
]);

// All complete in ~1 second instead of 3
results.forEach(result => console.log(result.stdout));
```

### Using the parallel() Function

For more control, use the dedicated parallel function:

```typescript
import { parallel } from '@xec-sh/core';

// Execute with parallel helper
const results = await parallel([
  () => $`npm install`,
  () => $`npm run lint`,
  () => $`npm run test`,
  () => $`npm run build`
]);

// Results array maintains order
console.log('Install:', results[0].isSuccess());
console.log('Lint:', results[1].isSuccess());
console.log('Test:', results[2].isSuccess());
console.log('Build:', results[3].isSuccess());
```

## Concurrency Control

### Limiting Concurrent Executions

Control how many commands run simultaneously:

```typescript
// Run maximum 2 commands at a time
const results = await parallel([
  () => $`download file1.zip`,
  () => $`download file2.zip`,
  () => $`download file3.zip`,
  () => $`download file4.zip`,
  () => $`download file5.zip`
], {
  maxConcurrent: 2  // Only 2 downloads at a time
});

// Useful for:
// - Respecting rate limits
// - Managing resource usage
// - Preventing system overload
```

### Dynamic Concurrency

Adjust concurrency based on system resources:

```typescript
import os from 'os';

// Use CPU count for concurrency
const cpuCount = os.cpus().length;

const results = await parallel(
  tasks.map(task => () => $`process-file ${task}`),
  { 
    maxConcurrent: Math.max(1, cpuCount - 1) // Leave one CPU free
  }
);
```

## Error Handling

### Fail-Fast Mode (Default)

By default, parallel execution stops on first error:

```typescript
try {
  const results = await parallel([
    () => $`echo "Success 1"`,
    () => $`exit 1`,  // This fails
    () => $`echo "Never runs"`  // Won't execute
  ]);
} catch (error) {
  console.error('Parallel execution failed:', error.message);
}
```

### Continue on Error

Continue executing even if some commands fail:

```typescript
const results = await parallel([
  () => $`echo "Success 1"`,
  () => $`exit 1`,  // This fails
  () => $`echo "Still runs"`  // Will execute
], {
  stopOnError: false  // Continue despite failures
});

// Check individual results
results.forEach((result, index) => {
  if (result instanceof Error) {
    console.error(`Task ${index} failed:`, result.message);
  } else if (result.isSuccess()) {
    console.log(`Task ${index} succeeded`);
  }
});
```

### Error Aggregation

Collect all errors for reporting:

```typescript
const results = await parallel(tasks, { stopOnError: false });

const errors = results
  .map((result, index) => ({ result, index }))
  .filter(({ result }) => result instanceof Error || !result.isSuccess())
  .map(({ result, index }) => ({
    task: tasks[index].toString(),
    error: result instanceof Error ? result : result.stderr
  }));

if (errors.length > 0) {
  console.error('Failed tasks:', errors);
}
```

## Progress Tracking

### Basic Progress

Track completion as tasks finish:

```typescript
let completed = 0;
const total = tasks.length;

const results = await parallel(
  tasks.map(task => async () => {
    const result = await task();
    completed++;
    console.log(`Progress: ${completed}/${total} (${Math.round(completed/total*100)}%)`);
    return result;
  }),
  { maxConcurrent: 3 }
);
```

### Progress with Callbacks

More sophisticated progress tracking:

```typescript
const results = await parallel(tasks, {
  maxConcurrent: 5,
  onProgress: (completed, total, current) => {
    const percent = Math.round((completed / total) * 100);
    console.log(`[${percent}%] ${completed}/${total} - Running: ${current.length}`);
  },
  onTaskComplete: (index, result) => {
    if (result.isSuccess()) {
      console.log(`✓ Task ${index} completed`);
    } else {
      console.log(`✗ Task ${index} failed`);
    }
  }
});
```

### Progress Bar

Create a visual progress bar:

```typescript
import { parallel } from '@xec-sh/core';

class ProgressBar {
  private width = 40;
  
  update(completed: number, total: number) {
    const percent = completed / total;
    const filled = Math.floor(this.width * percent);
    const empty = this.width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentStr = `${Math.round(percent * 100)}%`.padStart(4);
    
    process.stdout.write(`\r[${bar}] ${percentStr} ${completed}/${total}`);
  }
  
  complete() {
    process.stdout.write('\n');
  }
}

const progress = new ProgressBar();

const results = await parallel(tasks, {
  maxConcurrent: 3,
  onProgress: (completed, total) => {
    progress.update(completed, total);
  }
});

progress.complete();
```

## Advanced Patterns

### Batch Processing

Process items in batches:

```typescript
async function processBatches<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<any>
) {
  const batches: T[][] = [];
  
  // Create batches
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  // Process each batch
  for (const [index, batch] of batches.entries()) {
    console.log(`Processing batch ${index + 1}/${batches.length}`);
    
    await parallel(
      batch.map(item => () => processor(item)),
      { maxConcurrent: batchSize }
    );
  }
}

// Usage
const files = await $`find . -name "*.log"`.lines();
await processBatches(files, 10, async (file) => {
  await $`gzip ${file}`;
});
```

### Task Queue

Implement a dynamic task queue:

```typescript
class TaskQueue {
  private queue: (() => Promise<any>)[] = [];
  private running = 0;
  private maxConcurrent: number;
  
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
  }
  
  async add(task: () => Promise<any>) {
    this.queue.push(task);
    if (this.running < this.maxConcurrent) {
      this.processNext();
    }
  }
  
  private async processNext() {
    if (this.queue.length === 0) return;
    
    const task = this.queue.shift()!;
    this.running++;
    
    try {
      await task();
    } finally {
      this.running--;
      this.processNext();
    }
  }
  
  async waitForAll() {
    while (this.queue.length > 0 || this.running > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Usage
const queue = new TaskQueue(3);

// Add tasks dynamically
for (const file of files) {
  queue.add(() => $`process-file ${file}`);
}

await queue.waitForAll();
```

### Map-Reduce Pattern

Process and aggregate results:

```typescript
// Map phase - process in parallel
async function mapReduce<T, M, R>(
  items: T[],
  mapper: (item: T) => Promise<M>,
  reducer: (acc: R, mapped: M) => R,
  initial: R,
  maxConcurrent = 5
): Promise<R> {
  // Map phase
  const mapped = await parallel(
    items.map(item => () => mapper(item)),
    { maxConcurrent, stopOnError: false }
  );
  
  // Reduce phase
  return mapped.reduce((acc, result) => {
    if (result instanceof Error) {
      console.error('Map error:', result);
      return acc;
    }
    return reducer(acc, result);
  }, initial);
}

// Example: Count lines in files
const totalLines = await mapReduce(
  files,
  async (file) => {
    const result = await $`wc -l ${file}`.text();
    return parseInt(result.split(' ')[0]);
  },
  (sum, lines) => sum + lines,
  0,
  10
);

console.log(`Total lines: ${totalLines}`);
```

## Real-World Examples

### Deploy to Multiple Servers

```typescript
async function deployToServers(servers: string[], version: string) {
  const deployTasks = servers.map(server => async () => {
    console.log(`Deploying to ${server}...`);
    
    const remote = $.ssh({
      host: server,
      username: 'deploy'
    });
    
    try {
      // Pull latest code
      await remote`cd /app && git fetch --tags`;
      await remote`cd /app && git checkout ${version}`;
      
      // Install dependencies
      await remote`cd /app && npm ci`;
      
      // Build
      await remote`cd /app && npm run build`;
      
      // Restart
      await remote`pm2 restart app`;
      
      // Health check
      await remote`curl -f http://localhost:3000/health`;
      
      return { server, status: 'success' };
    } catch (error) {
      return { server, status: 'failed', error: error.message };
    }
  });
  
  // Deploy to all servers, max 3 at a time
  const results = await parallel(deployTasks, {
    maxConcurrent: 3,
    stopOnError: false,
    onTaskComplete: (index, result) => {
      const { server, status } = result;
      console.log(`${status === 'success' ? '✓' : '✗'} ${server}`);
    }
  });
  
  // Summary
  const successful = results.filter(r => r.status === 'success').length;
  console.log(`\nDeployment complete: ${successful}/${servers.length} successful`);
}

await deployToServers([
  'web1.example.com',
  'web2.example.com',
  'web3.example.com',
  'api1.example.com',
  'api2.example.com'
], 'v1.2.3');
```

### Parallel Test Execution

```typescript
async function runTestSuites(suites: string[]) {
  console.log(`Running ${suites.length} test suites...\n`);
  
  const startTime = Date.now();
  
  const results = await parallel(
    suites.map(suite => async () => {
      const start = Date.now();
      console.log(`[${suite}] Starting...`);
      
      const result = await $`npm test -- ${suite}`.nothrow();
      const duration = Date.now() - start;
      
      if (result.isSuccess()) {
        console.log(`[${suite}] ✓ Passed (${duration}ms)`);
      } else {
        console.log(`[${suite}] ✗ Failed (${duration}ms)`);
      }
      
      return { suite, result, duration };
    }),
    {
      maxConcurrent: os.cpus().length,
      stopOnError: false
    }
  );
  
  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.result.isSuccess()).length;
  
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${passed}/${suites.length} passed`);
  console.log(`Time: ${totalDuration}ms`);
  
  // Show failures
  const failed = results.filter(r => !r.result.isSuccess());
  if (failed.length > 0) {
    console.log('\nFailed suites:');
    failed.forEach(({ suite, result }) => {
      console.log(`  - ${suite}`);
      console.log(`    ${result.stderr}`);
    });
  }
}

await runTestSuites([
  'unit/auth',
  'unit/api',
  'unit/database',
  'integration/api',
  'integration/auth',
  'e2e/user-flow',
  'e2e/admin-flow'
]);
```

### Parallel Data Processing

```typescript
async function processDataFiles(pattern: string) {
  // Find all data files
  const files = await $`find . -name "${pattern}"`.lines();
  console.log(`Found ${files.length} files to process`);
  
  // Process metrics
  let processed = 0;
  let failed = 0;
  const startTime = Date.now();
  
  // Process files in parallel
  await parallel(
    files.map(file => async () => {
      try {
        // Process each file
        await $`python process_data.py ${file}`;
        
        // Move to processed directory
        await $`mv ${file} ./processed/`;
        
        processed++;
      } catch (error) {
        console.error(`Failed to process ${file}:`, error.message);
        failed++;
        
        // Move to failed directory
        await $`mv ${file} ./failed/`;
      }
    }),
    {
      maxConcurrent: 10,
      stopOnError: false,
      onProgress: (completed, total) => {
        const elapsed = Date.now() - startTime;
        const rate = completed / (elapsed / 1000);
        console.log(`Progress: ${completed}/${total} (${rate.toFixed(1)} files/sec)`);
      }
    }
  );
  
  console.log(`\nProcessing complete:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Time: ${(Date.now() - startTime) / 1000}s`);
}

await processDataFiles('*.csv');
```

## Best Practices

### 1. Choose Appropriate Concurrency

```typescript
// ✅ Consider system resources
const cpuBound = await parallel(tasks, {
  maxConcurrent: os.cpus().length
});

const ioBound = await parallel(tasks, {
  maxConcurrent: 20  // Higher for I/O bound tasks
});

// ❌ Too high can overwhelm system
await parallel(tasks, {
  maxConcurrent: 1000  // May cause issues
});
```

### 2. Handle Errors Appropriately

```typescript
// ✅ Decide on error strategy
const critical = await parallel(tasks, {
  stopOnError: true  // Fail fast for critical tasks
});

const optional = await parallel(tasks, {
  stopOnError: false  // Continue for optional tasks
});

// ❌ Ignoring errors
await parallel(tasks);  // Errors might go unnoticed
```

### 3. Provide Feedback

```typescript
// ✅ Show progress for long operations
await parallel(tasks, {
  maxConcurrent: 5,
  onProgress: (done, total) => {
    console.log(`Progress: ${done}/${total}`);
  }
});

// ❌ Silent execution
await parallel(hundredsOfTasks);  // No feedback
```

### 4. Clean Up Resources

```typescript
// ✅ Ensure cleanup even on error
const connections = servers.map(s => $.ssh({ host: s }));

try {
  await parallel(
    connections.map(conn => () => conn`backup-database`),
    { maxConcurrent: 3 }
  );
} finally {
  // Clean up all connections
  await Promise.all(connections.map(c => c.dispose()));
}
```

### 5. Test Concurrency Limits

```typescript
// ✅ Test different concurrency levels
async function findOptimalConcurrency(tasks: any[]) {
  const results = [];
  
  for (const concurrent of [1, 2, 4, 8, 16]) {
    const start = Date.now();
    await parallel(tasks, { maxConcurrent: concurrent });
    const duration = Date.now() - start;
    
    results.push({ concurrent, duration });
    console.log(`Concurrency ${concurrent}: ${duration}ms`);
  }
  
  return results;
}
```

## Performance Considerations

### Memory Usage

```typescript
// ✅ Stream large outputs
await parallel(
  files.map(file => () => 
    $`process-large-file ${file}`.stream()
  ),
  { maxConcurrent: 5 }
);

// ❌ Buffering everything
await parallel(
  files.map(file => () => 
    $`cat ${file}`  // Might use lots of memory
  )
);
```

### Resource Pooling

```typescript
// ✅ Reuse connections
const connection = $.ssh({ host: 'server' });

await parallel(
  commands.map(cmd => () => connection`${cmd}`),
  { maxConcurrent: 10 }
);

// ❌ Creating new connections
await parallel(
  commands.map(cmd => () => 
    $.ssh({ host: 'server' })`${cmd}`  // New connection each time
  )
);
```