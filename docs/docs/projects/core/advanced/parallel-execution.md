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

// Define commands to run
const commands = [
  $`sleep 1 && echo "Task 1"`,
  $`sleep 1 && echo "Task 2"`,
  $`sleep 1 && echo "Task 3"`
];

// Run multiple commands simultaneously
const results = await Promise.all(commands);

// All complete in ~1 second instead of 3
results.forEach((result, index) => {
  console.log(`Task ${index + 1}: ${result.stdout}`);
});
```

### Using $.parallel Methods

For more control, use the built-in parallel methods:

```typescript
import { $ } from '@xec-sh/core';

// Define commands
const commands = [
  'npm install',
  'npm run lint',
  'npm run test',
  'npm run build'
];

// Execute all commands, fail if any fails
try {
  const results = await $.parallel.all(commands);
  console.log('All commands succeeded!');
  results.forEach((result, index) => {
    console.log(`Command ${index}: exitCode=${result.exitCode}`);
  });
} catch (error) {
  console.error('One or more commands failed:', error.message);
}

// Execute all commands, continue on failure
const parallelResult = await $.parallel.settled(commands);
console.log(`Succeeded: ${parallelResult.succeeded.length}`);
console.log(`Failed: ${parallelResult.failed.length}`);
```

## Concurrency Control

### Limiting Concurrent Executions

Control how many commands run simultaneously:

```typescript
import { $ } from '@xec-sh/core';

// Define download tasks
const files = [
  'file1.zip',
  'file2.zip', 
  'file3.zip',
  'file4.zip',
  'file5.zip'
];

// Run maximum 2 downloads at a time
const results = await $.parallel.settled(
  files.map(file => `curl -O https://example.com/${file}`),
  {
    maxConcurrency: 2  // Only 2 downloads at a time
  }
);

console.log(`Downloaded: ${results.succeeded.length} files`);
console.log(`Failed: ${results.failed.length} files`);

// Useful for:
// - Respecting rate limits
// - Managing resource usage
// - Preventing system overload
```

### Dynamic Concurrency

Adjust concurrency based on system resources:

```typescript
import { $ } from '@xec-sh/core';
import os from 'os';

// Get list of files to process
const files = await $`find . -name "*.log"`.lines();

// Use CPU count for concurrency
const cpuCount = os.cpus().length;

const results = await $.parallel.settled(
  files.map(file => `gzip ${file}`),
  { 
    maxConcurrency: Math.max(1, cpuCount - 1) // Leave one CPU free
  }
);

console.log(`Compressed ${results.succeeded.length} files`);
```

## Error Handling

### Fail-Fast Mode (Default)

By default, `$.parallel.all()` stops on first error:

```typescript
import { $ } from '@xec-sh/core';

try {
  const results = await $.parallel.all([
    'echo "Success 1"',
    'exit 1',  // This fails
    'echo "Never runs"'  // Won't execute
  ]);
} catch (error) {
  console.error('Parallel execution failed:', error.message);
  // The error will be from the first failed command
}
```

### Continue on Error

Use `$.parallel.settled()` to continue executing even if some commands fail:

```typescript
import { $ } from '@xec-sh/core';

const results = await $.parallel.settled([
  'echo "Success 1"',
  'exit 1',  // This fails
  'echo "Still runs"'  // Will execute
]);

// Check individual results
results.results.forEach((result, index) => {
  if (result instanceof Error) {
    console.error(`Task ${index} failed:`, result.message);
  } else if (result.exitCode === 0) {
    console.log(`Task ${index} succeeded`);
  }
});

// Summary
console.log(`Total: ${results.results.length}`);
console.log(`Succeeded: ${results.succeeded.length}`);
console.log(`Failed: ${results.failed.length}`);
console.log(`Duration: ${results.duration}ms`);
```

### Error Aggregation

Collect all errors for reporting:

```typescript
import { $ } from '@xec-sh/core';

// Define test files
const testFiles = [
  'test/unit.test.js',
  'test/integration.test.js',
  'test/e2e.test.js'
];

const results = await $.parallel.settled(
  testFiles.map(file => `jest ${file}`),
  { maxConcurrency: 2 }
);

// Collect error details
const errors = results.results
  .map((result, index) => ({ result, index }))
  .filter(({ result }) => result instanceof Error || result.exitCode !== 0)
  .map(({ result, index }) => ({
    file: testFiles[index],
    error: result instanceof Error ? result.message : result.stderr
  }));

if (errors.length > 0) {
  console.error('Failed tests:');
  errors.forEach(({ file, error }) => {
    console.error(`  ${file}: ${error}`);
  });
}
```

## Progress Tracking

### Built-in Progress Callbacks

Track progress during parallel execution:

```typescript
import { $ } from '@xec-sh/core';

// List of API endpoints to check
const endpoints = [
  'https://api.example.com/health',
  'https://api.example.com/status',
  'https://api.example.com/version',
  // ... more endpoints
];

const startTime = Date.now();

// With $.parallel.settled()
const results = await $.parallel.settled(
  endpoints.map(url => `curl -s -o /dev/null -w "%{http_code}" ${url}`),
  {
    maxConcurrency: 5,
    onProgress: (completed, total, succeeded, failed) => {
      const percentage = Math.round((completed / total) * 100);
      const elapsed = Date.now() - startTime;
      const rate = completed / (elapsed / 1000);
      
      console.clear();
      console.log(`Checking API Endpoints`);
      console.log(`━`.repeat(40));
      console.log(`Progress: ${completed}/${total} (${percentage}%)`);
      console.log(`✓ Succeeded: ${succeeded}`);
      console.log(`✗ Failed: ${failed}`);
      console.log(`Rate: ${rate.toFixed(1)} requests/sec`);
    }
  }
);

// With $.batch() - alias with concurrency option
const batchResults = await $.batch(
  endpoints.map(url => `curl -f ${url}`),
  {
    concurrency: 10,
    onProgress: (completed, total, succeeded, failed) => {
      console.log(`Batch progress: ${completed}/${total}`);
    }
  }
);
```

### Custom Progress Tracking

For more control over progress reporting:

```typescript
import { $ } from '@xec-sh/core';

// Define processing tasks
const dataFiles = await $`ls data/*.json`.lines();
let processedSize = 0;

const tasks = dataFiles.map(file => async () => {
  // Get file size
  const stats = await $`stat -f %z ${file}`.text();
  const size = parseInt(stats);
  
  // Process file
  const result = await $`python process.py ${file}`;
  
  // Update progress
  processedSize += size;
  console.log(`Processed ${file} (${size} bytes)`);
  
  return result;
});

// Execute with concurrency limit
const results = await Promise.all(
  tasks.map((task, i) => 
    // Add delay to respect concurrency
    new Promise(resolve => setTimeout(resolve, Math.floor(i / 3) * 100))
      .then(() => task())
  )
);

console.log(`Total processed: ${processedSize} bytes`);
```

## Advanced Patterns

### Batch Processing

Process items in batches with a reusable function:

```typescript
import { $ } from '@xec-sh/core';

async function processBatches<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => string | Promise<string>
) {
  const results = [];
  
  // Process in chunks
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);
    
    // Process batch with concurrency
    const batchCommands = await Promise.all(
      batch.map(item => processor(item))
    );
    
    const batchResults = await $.parallel.settled(batchCommands, {
      maxConcurrency: batchSize
    });
    
    results.push(...batchResults.results);
  }
  
  return results;
}

// Usage example
const images = await $`find . -name "*.png"`.lines();
const results = await processBatches(images, 5, async (image) => {
  return `convert ${image} -resize 800x600 ${image.replace('.png', '_thumb.png')}`;
});

console.log(`Processed ${results.length} images`);
```

### Dynamic Task Queue

Implement a task queue that can accept new tasks dynamically:

```typescript
import { $ } from '@xec-sh/core';

class TaskQueue {
  private queue: (() => Promise<any>)[] = [];
  private running = 0;
  private results: any[] = [];
  
  constructor(private maxConcurrent = 5) {}
  
  add(command: string | (() => Promise<any>)) {
    const task = typeof command === 'string' 
      ? () => $`${command}` 
      : command;
    
    this.queue.push(task);
    this.processNext();
  }
  
  private async processNext() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift()!;
    this.running++;
    
    try {
      const result = await task();
      this.results.push(result);
    } catch (error) {
      this.results.push(error);
    } finally {
      this.running--;
      this.processNext();
    }
  }
  
  async waitForAll(): Promise<any[]> {
    while (this.queue.length > 0 || this.running > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.results;
  }
}

// Usage
const queue = new TaskQueue(3);

// Add tasks dynamically
const logFiles = await $`find /var/log -name "*.log" -mtime -1`.lines();
for (const file of logFiles) {
  queue.add(`gzip -c ${file} > ${file}.gz`);
}

// Add more tasks while processing
queue.add('df -h');
queue.add('free -m');

const results = await queue.waitForAll();
console.log(`Completed ${results.length} tasks`);
```

### Map-Reduce Pattern

Process and aggregate results in parallel:

```typescript
import { $ } from '@xec-sh/core';

async function mapReduce<T, M, R>(
  items: T[],
  mapper: (item: T) => string,  // Command to execute
  reducer: (acc: R, result: any, item: T) => R,
  initial: R,
  maxConcurrent = 5
): Promise<R> {
  // Map phase - create commands
  const commands = items.map(item => mapper(item));
  
  // Execute in parallel
  const results = await $.parallel.settled(commands, {
    maxConcurrency: maxConcurrent
  });
  
  // Reduce phase
  return results.results.reduce((acc, result, index) => {
    if (result instanceof Error) {
      console.error(`Error processing ${items[index]}:`, result.message);
      return acc;
    }
    return reducer(acc, result, items[index]);
  }, initial);
}

// Example: Count total lines in log files
const logFiles = await $`find /var/log -name "*.log"`.lines();

const totalLines = await mapReduce(
  logFiles,
  (file) => `wc -l ${file}`,
  (sum, result) => {
    const lines = parseInt(result.stdout.trim().split(' ')[0] || '0');
    return sum + lines;
  },
  0,
  10
);

console.log(`Total lines across ${logFiles.length} files: ${totalLines}`);

// Example: Collect file sizes
interface FileInfo {
  totalSize: number;
  fileCount: number;
  largestFile: { name: string; size: number };
}

const fileInfo = await mapReduce<string, any, FileInfo>(
  logFiles,
  (file) => `stat -f "%z" ${file}`,  // macOS syntax
  (acc, result, file) => {
    const size = parseInt(result.stdout.trim());
    return {
      totalSize: acc.totalSize + size,
      fileCount: acc.fileCount + 1,
      largestFile: size > acc.largestFile.size 
        ? { name: file, size }
        : acc.largestFile
    };
  },
  { totalSize: 0, fileCount: 0, largestFile: { name: '', size: 0 } },
  5
);

console.log(`Total size: ${fileInfo.totalSize} bytes`);
console.log(`Largest file: ${fileInfo.largestFile.name} (${fileInfo.largestFile.size} bytes)`);
```

## Real-World Examples

### Deploy to Multiple Servers

```typescript
import { $ } from '@xec-sh/core';

interface DeployResult {
  server: string;
  status: 'success' | 'failed';
  error?: string;
  duration: number;
}

async function deployToServers(servers: string[], version: string): Promise<void> {
  console.log(`Deploying version ${version} to ${servers.length} servers...`);
  
  // Create deployment commands for each server
  const deployCommands = servers.map(server => ({
    server,
    command: `ssh deploy@${server} 'cd /app && git fetch --tags && git checkout ${version} && npm ci && npm run build && pm2 restart app'`
  }));
  
  const startTime = Date.now();
  const deployResults: DeployResult[] = [];
  
  // Deploy with progress tracking
  const results = await $.parallel.settled(
    deployCommands.map(({ command }) => command),
    {
      maxConcurrency: 3,
      onProgress: (completed, total, succeeded, failed) => {
        const elapsed = (Date.now() - startTime) / 1000;
        console.clear();
        console.log('Deployment Progress');
        console.log('═'.repeat(50));
        console.log(`Servers: ${completed}/${total}`);
        console.log(`✓ Succeeded: ${succeeded}`);
        console.log(`✗ Failed: ${failed}`);
        console.log(`Time elapsed: ${elapsed.toFixed(1)}s`);
        console.log('\nServers:');
        deployResults.forEach(r => {
          console.log(`  ${r.status === 'success' ? '✓' : '✗'} ${r.server} (${r.duration}ms)`);
        });
      }
    }
  );
  
  // Process results
  results.results.forEach((result, index) => {
    const server = deployCommands[index].server;
    const deployResult: DeployResult = {
      server,
      status: result instanceof Error || result.exitCode !== 0 ? 'failed' : 'success',
      error: result instanceof Error ? result.message : result.exitCode !== 0 ? result.stderr : undefined,
      duration: Date.now() - startTime
    };
    deployResults.push(deployResult);
  });
  
  // Final summary
  console.clear();
  console.log('\nDeployment Complete!');
  console.log('═'.repeat(50));
  
  const successful = deployResults.filter(r => r.status === 'success');
  const failed = deployResults.filter(r => r.status === 'failed');
  
  console.log(`✓ Successful: ${successful.length}/${servers.length}`);
  successful.forEach(r => console.log(`  - ${r.server}`));
  
  if (failed.length > 0) {
    console.log(`\n✗ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`  - ${r.server}`);
      if (r.error) console.log(`    Error: ${r.error}`);
    });
  }
  
  // Health checks on successful deployments
  if (successful.length > 0) {
    console.log('\nRunning health checks...');
    const healthChecks = await $.parallel.settled(
      successful.map(r => `curl -f http://${r.server}:3000/health`),
      { maxConcurrency: 5 }
    );
    console.log(`Health checks passed: ${healthChecks.succeeded.length}/${successful.length}`);
  }
}

// Execute deployment
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
import { $ } from '@xec-sh/core';
import os from 'os';

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
}

async function runTestSuites(suitePaths: string[]): Promise<void> {
  console.log(`Running ${suitePaths.length} test suites...\n`);
  
  const startTime = Date.now();
  const testResults: TestResult[] = [];
  
  // Execute test suites with optimal concurrency
  const results = await $.parallel.settled(
    suitePaths.map(suite => ({
      suite,
      command: $`npm test -- ${suite}`.nothrow()
    })),
    {
      maxConcurrency: os.cpus().length,
      onProgress: (completed, total, succeeded, failed) => {
        process.stdout.write(`\rProgress: ${completed}/${total} | ✓ ${succeeded} | ✗ ${failed}`);
      }
    }
  );
  
  // Process results
  await Promise.all(results.results.map(async (result, index) => {
    const suite = suitePaths[index];
    const passed = !(result instanceof Error) && result.exitCode === 0;
    
    testResults.push({
      suite,
      passed,
      duration: 0, // Would need to track individually
      output: result instanceof Error ? result.message : result.stdout
    });
  }));
  
  // Display results
  const totalDuration = Date.now() - startTime;
  const passed = testResults.filter(r => r.passed);
  const failed = testResults.filter(r => !r.passed);
  
  console.log('\n\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n✓ Passed: ${passed.length}`);
  passed.forEach(r => console.log(`  - ${r.suite}`));
  
  if (failed.length > 0) {
    console.log(`\n✗ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`  - ${r.suite}`);
      // Show first few lines of error
      const errorLines = r.output.split('\n').slice(0, 3);
      errorLines.forEach(line => console.log(`    ${line}`));
    });
  }
  
  console.log(`\nTotal time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Average time per suite: ${(totalDuration / suitePaths.length / 1000).toFixed(2)}s`);
  
  // Exit with error if any tests failed
  if (failed.length > 0) {
    process.exit(1);
  }
}

// Run tests
await runTestSuites([
  'src/auth/**/*.test.ts',
  'src/api/**/*.test.ts',
  'src/database/**/*.test.ts',
  'src/services/**/*.test.ts',
  'src/utils/**/*.test.ts'
]);
```

### Parallel Data Processing Pipeline

```typescript
import { $ } from '@xec-sh/core';

interface ProcessingStats {
  processed: number;
  failed: number;
  totalSize: number;
  duration: number;
}

async function processDataFiles(pattern: string): Promise<ProcessingStats> {
  // Find all data files
  const files = await $`find . -name "${pattern}"`.lines();
  console.log(`Found ${files.length} files to process`);
  
  if (files.length === 0) {
    return { processed: 0, failed: 0, totalSize: 0, duration: 0 };
  }
  
  // Create processing directories
  await $.parallel.all([
    'mkdir -p ./processed',
    'mkdir -p ./failed',
    'mkdir -p ./logs'
  ]);
  
  // Processing metrics
  const startTime = Date.now();
  const stats: ProcessingStats = {
    processed: 0,
    failed: 0,
    totalSize: 0,
    duration: 0
  };
  
  // Get file sizes first
  const sizeResults = await $.parallel.settled(
    files.map(file => `stat -f %z "${file}"`),
    { maxConcurrency: 20 }
  );
  
  const fileSizes = new Map<string, number>();
  sizeResults.results.forEach((result, index) => {
    if (!(result instanceof Error) && result.exitCode === 0) {
      fileSizes.set(files[index], parseInt(result.stdout.trim()));
    }
  });
  
  // Process files with detailed progress
  const processResults = await $.parallel.settled(
    files.map((file, index) => {
      const commands = [
        // Validate file
        `python validate_data.py "${file}"`,
        // Process file
        `python process_data.py "${file}" -o "./processed/${path.basename(file)}"`,
        // Generate report
        `python generate_report.py "./processed/${path.basename(file)}" -o "./logs/${path.basename(file, '.csv')}.log"`
      ];
      
      // Chain commands - only continue if previous succeeded
      return commands.reduce((prev, cmd) => 
        prev ? `${prev} && ${cmd}` : cmd
      );
    }),
    {
      maxConcurrency: 10,
      onProgress: (completed, total, succeeded, failed) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = completed / elapsed;
        const eta = (total - completed) / rate;
        
        process.stdout.write('\r\x1b[K'); // Clear line
        process.stdout.write(
          `Progress: ${completed}/${total} | ` +
          `✓ ${succeeded} | ✗ ${failed} | ` +
          `${rate.toFixed(1)} files/sec | ` +
          `ETA: ${eta.toFixed(0)}s`
        );
      }
    }
  );
  
  // Move files based on results
  const moveOperations = await Promise.all(
    processResults.results.map(async (result, index) => {
      const file = files[index];
      const size = fileSizes.get(file) || 0;
      
      if (result instanceof Error || result.exitCode !== 0) {
        stats.failed++;
        // Move to failed directory with error log
        const errorLog = result instanceof Error ? result.message : result.stderr;
        await $`echo "${errorLog}" > "./failed/${path.basename(file)}.error"`;
        await $`mv "${file}" ./failed/`;
      } else {
        stats.processed++;
        stats.totalSize += size;
        // Remove original after successful processing
        await $`rm "${file}"`;
      }
    })
  );
  
  stats.duration = Date.now() - startTime;
  
  // Final report
  console.log('\n\nProcessing Complete!');
  console.log('━'.repeat(50));
  console.log(`Total files: ${files.length}`);
  console.log(`Processed: ${stats.processed} (${(stats.totalSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Duration: ${(stats.duration / 1000).toFixed(1)}s`);
  console.log(`Average rate: ${(stats.processed / (stats.duration / 1000)).toFixed(1)} files/sec`);
  
  // Generate summary report
  await $`python generate_summary.py ./logs -o processing_summary.json`;
  
  return stats;
}

// Process CSV files
const stats = await processDataFiles('*.csv');

// Send notification if needed
if (stats.failed > 0) {
  await $`mail -s "Data processing completed with ${stats.failed} failures" admin@example.com < processing_summary.json`;
}
```

## Best Practices

### 1. Choose Appropriate Concurrency

```typescript
import { $ } from '@xec-sh/core';
import os from 'os';

// ✅ Consider system resources for CPU-bound tasks
const cpuTasks = [/* ... */];
await $.parallel.settled(cpuTasks, {
  maxConcurrency: os.cpus().length
});

// ✅ Higher concurrency for I/O-bound tasks
const apiCalls = [/* ... */];
await $.parallel.settled(apiCalls, {
  maxConcurrency: 20  // Network I/O can handle more
});

// ✅ Respect external rate limits
const rateLimitedApi = [/* ... */];
await $.parallel.settled(rateLimitedApi, {
  maxConcurrency: 5  // API allows 5 requests per second
});

// ❌ Too high can overwhelm system
await $.parallel.settled(tasks, {
  maxConcurrency: 1000  // May cause resource exhaustion
});
```

### 2. Handle Errors Appropriately

```typescript
import { $ } from '@xec-sh/core';

// ✅ Use .all() for critical tasks that must all succeed
try {
  await $.parallel.all([
    'npm run build',
    'npm run test',
    'npm run lint'
  ]);
  console.log('All checks passed, ready to deploy!');
} catch (error) {
  console.error('Build failed, not deploying');
  process.exit(1);
}

// ✅ Use .settled() for independent tasks
const results = await $.parallel.settled([
  'backup-db-1.sh',
  'backup-db-2.sh',
  'backup-db-3.sh'
]);
console.log(`Backed up ${results.succeeded.length} databases`);

// ❌ Don't ignore error handling
await $.parallel.all(commands); // Could throw unexpectedly
```

### 3. Provide User Feedback

```typescript
import { $ } from '@xec-sh/core';

// ✅ Show progress for long operations
const files = await $`find . -name "*.jpg"`.lines();

await $.parallel.settled(
  files.map(f => `convert ${f} -quality 85 ${f}`),
  {
    maxConcurrency: 5,
    onProgress: (done, total) => {
      const percent = Math.round((done / total) * 100);
      process.stdout.write(`\rOptimizing images: ${percent}% (${done}/${total})`);
    }
  }
);
console.log('\n✓ Image optimization complete!');

// ❌ Silent execution for many tasks
await $.parallel.settled(hundreds_of_tasks); // No user feedback
```

### 4. Clean Up Resources

```typescript
import { $ } from '@xec-sh/core';

// ✅ Ensure cleanup even on error
const connections = servers.map(server => $.ssh({ host: server }));

try {
  await $.parallel.all(
    connections.map((conn, i) => conn`backup-database db${i}`),
    { maxConcurrency: 3 }
  );
} finally {
  // Always clean up connections
  await Promise.all(connections.map(conn => conn.dispose()));
}

// ✅ Use temporary resources properly
const tempDirs = await Promise.all(
  items.map(() => $.tempDir())
);

try {
  await $.parallel.settled(
    items.map((item, i) => `process-item ${item} -o ${tempDirs[i].path}`),
    { maxConcurrency: 5 }
  );
} finally {
  // Clean up temp directories
  await Promise.all(tempDirs.map(dir => dir.cleanup()));
}
```

### 5. Monitor Performance

```typescript
import { $ } from '@xec-sh/core';

// ✅ Test different concurrency levels
async function findOptimalConcurrency(
  commands: string[],
  testRange = [1, 2, 4, 8, 16]
): Promise<number> {
  const results = [];
  
  for (const concurrency of testRange) {
    const start = Date.now();
    
    await $.parallel.settled(commands.slice(0, 10), { // Test subset
      maxConcurrency: concurrency
    });
    
    const duration = Date.now() - start;
    const throughput = 10 / (duration / 1000);
    
    results.push({ concurrency, duration, throughput });
    console.log(`Concurrency ${concurrency}: ${throughput.toFixed(1)} ops/sec`);
  }
  
  // Return concurrency with best throughput
  return results.reduce((best, current) => 
    current.throughput > best.throughput ? current : best
  ).concurrency;
}

const optimal = await findOptimalConcurrency(allCommands);
console.log(`Using optimal concurrency: ${optimal}`);
```

## Memory Considerations

### Stream Large Outputs

```typescript
import { $ } from '@xec-sh/core';

// ✅ Process large files in streaming fashion
const largeFiles = await $`find . -size +100M`.lines();

await $.parallel.settled(
  largeFiles.map(file => 
    // Use streaming to avoid loading entire file
    $`gzip -c ${file}`.pipe`split -b 100m - ${file}.gz.`
  ),
  { maxConcurrency: 3 }
);

// ❌ Loading everything into memory
await $.parallel.settled(
  largeFiles.map(file => 
    $`cat ${file}` // Loads entire file content
  )
);
```

### Resource Pooling

```typescript
import { $ } from '@xec-sh/core';

// ✅ Reuse expensive resources
const connection = $.ssh({ host: 'server.example.com' });

// Execute many commands over single connection
await $.parallel.settled(
  commands.map(cmd => connection`${cmd}`),
  { maxConcurrency: 10 }
);

await connection.dispose();

// ❌ Creating new connections for each command
await $.parallel.settled(
  commands.map(cmd => 
    $.ssh({ host: 'server.example.com' })`${cmd}` // New connection each time
  )
);
```