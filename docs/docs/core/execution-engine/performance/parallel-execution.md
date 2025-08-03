# Parallel Execution

Execute commands concurrently across multiple environments, maximizing throughput and reducing total execution time.

## Overview

Parallel execution (`packages/core/src/utils/parallel.ts`) provides:

- **Concurrent command execution** across environments
- **Concurrency limiting** to prevent resource exhaustion
- **Work distribution** strategies
- **Result aggregation** with error handling
- **Progress tracking** for long-running operations
- **Load balancing** across resources

## Basic Parallel Execution

### Promise.all Pattern

```typescript
import { $ } from '@xec-sh/core';

// Execute commands in parallel
const results = await Promise.all([
  $`command1`,
  $`command2`,
  $`command3`
]);

// Parallel execution across servers
const servers = ['server1', 'server2', 'server3'];
const results = await Promise.all(
  servers.map(server => 
    $.ssh(server)`deploy.sh`
  )
);

// Process results
results.forEach((result, index) => {
  console.log(`${servers[index]}: ${result.stdout}`);
});
```

### Promise.allSettled for Resilience

```typescript
// Continue even if some fail
const results = await Promise.allSettled([
  $`risky-command1`,
  $`risky-command2`,
  $`risky-command3`
]);

// Separate successes and failures
const successes = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);

const failures = results
  .filter(r => r.status === 'rejected')
  .map(r => r.reason);

console.log(`${successes.length} succeeded, ${failures.length} failed`);
```

## Concurrency Control

### Limiting Parallelism

```typescript
import pLimit from 'p-limit';

// Limit concurrent executions
const limit = pLimit(3);  // Max 3 concurrent

const commands = Array.from({ length: 100 }, (_, i) => `echo ${i}`);

const results = await Promise.all(
  commands.map(cmd => 
    limit(() => $`${cmd}`)
  )
);

// Custom concurrency limiter
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  
  constructor(private maxConcurrent: number) {}
  
  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    this.running++;
    
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// Use custom limiter
const limiter = new ConcurrencyLimiter(5);
const results = await Promise.all(
  commands.map(cmd => limiter.run(() => $`${cmd}`))
);
```

### Dynamic Concurrency

```typescript
// Adjust concurrency based on system load
class DynamicConcurrency {
  private currentLimit: number;
  private minLimit = 1;
  private maxLimit = 10;
  
  constructor(initialLimit = 5) {
    this.currentLimit = initialLimit;
  }
  
  async execute(tasks: Array<() => Promise<any>>) {
    const results = [];
    const executing = new Set<Promise<any>>();
    
    for (const task of tasks) {
      // Wait if at limit
      while (executing.size >= this.currentLimit) {
        await Promise.race(executing);
      }
      
      // Execute task
      const promise = task().then(result => {
        executing.delete(promise);
        this.adjustLimit(true);
        return result;
      }).catch(error => {
        executing.delete(promise);
        this.adjustLimit(false);
        throw error;
      });
      
      executing.add(promise);
      results.push(promise);
    }
    
    return Promise.all(results);
  }
  
  private adjustLimit(success: boolean) {
    if (success && this.currentLimit < this.maxLimit) {
      this.currentLimit++;
    } else if (!success && this.currentLimit > this.minLimit) {
      this.currentLimit--;
    }
  }
}

// Use dynamic concurrency
const dynamic = new DynamicConcurrency();
await dynamic.execute(tasks);
```

## Work Distribution

### Round-Robin Distribution

```typescript
// Distribute work across workers
class RoundRobinDistributor {
  private currentIndex = 0;
  
  constructor(private workers: string[]) {}
  
  async distribute(tasks: string[]) {
    const assignments = new Map<string, string[]>();
    
    // Initialize assignments
    for (const worker of this.workers) {
      assignments.set(worker, []);
    }
    
    // Distribute tasks
    for (const task of tasks) {
      const worker = this.workers[this.currentIndex];
      assignments.get(worker)!.push(task);
      this.currentIndex = (this.currentIndex + 1) % this.workers.length;
    }
    
    // Execute in parallel
    const results = await Promise.all(
      Array.from(assignments.entries()).map(async ([worker, tasks]) => {
        const workerResults = await Promise.all(
          tasks.map(task => $.ssh(worker)`${task}`)\n        );\n        return { worker, results: workerResults };\n      })\n    );\n    \n    return results;\n  }\n}\n\n// Distribute across servers\nconst distributor = new RoundRobinDistributor(['server1', 'server2', 'server3']);\nawait distributor.distribute(['task1', 'task2', 'task3', 'task4', 'task5']);\n```\n\n### Load-Based Distribution\n\n```typescript\n// Distribute based on load\nclass LoadBalancer {\n  private loads = new Map<string, number>();\n  \n  constructor(private workers: string[]) {\n    for (const worker of workers) {\n      this.loads.set(worker, 0);\n    }\n  }\n  \n  async execute(task: string, weight = 1) {\n    // Find least loaded worker\n    const worker = this.getLeastLoaded();\n    \n    // Update load\n    this.loads.set(worker, this.loads.get(worker)! + weight);\n    \n    try {\n      // Execute task\n      const result = await $.ssh(worker)`${task}`;\n      return { worker, result };\n    } finally {\n      // Decrease load\n      this.loads.set(worker, this.loads.get(worker)! - weight);\n    }\n  }\n  \n  private getLeastLoaded(): string {\n    let minLoad = Infinity;\n    let selected = this.workers[0];\n    \n    for (const [worker, load] of this.loads) {\n      if (load < minLoad) {\n        minLoad = load;\n        selected = worker;\n      }\n    }\n    \n    return selected;\n  }\n  \n  async executeMany(tasks: Array<{ command: string; weight?: number }>) {\n    return Promise.all(\n      tasks.map(task => this.execute(task.command, task.weight))\n    );\n  }\n}\n\n// Use load balancer\nconst balancer = new LoadBalancer(['worker1', 'worker2', 'worker3']);\nawait balancer.executeMany([\n  { command: 'light-task', weight: 1 },\n  { command: 'heavy-task', weight: 5 },\n  { command: 'medium-task', weight: 3 }\n]);\n```\n\n## Map-Reduce Pattern\n\n### Parallel Map\n\n```typescript\n// Map operation in parallel\nasync function parallelMap<T, R>(\n  items: T[],\n  mapper: (item: T) => Promise<R>,\n  concurrency = 5\n): Promise<R[]> {\n  const limit = pLimit(concurrency);\n  \n  return Promise.all(\n    items.map(item => limit(() => mapper(item)))\n  );\n}\n\n// Use parallel map\nconst files = ['file1.txt', 'file2.txt', 'file3.txt'];\nconst contents = await parallelMap(\n  files,\n  async (file) => {\n    const result = await $`cat ${file}`;\n    return result.stdout;\n  },\n  3  // Max 3 concurrent\n);\n```\n\n### Reduce with Parallelism\n\n```typescript\n// Parallel reduce operation\nasync function parallelReduce<T>(\n  items: T[],\n  reducer: (acc: T, item: T) => Promise<T>,\n  chunkSize = 2\n): Promise<T> {\n  if (items.length === 0) {\n    throw new Error('Cannot reduce empty array');\n  }\n  \n  if (items.length === 1) {\n    return items[0];\n  }\n  \n  // Process in chunks\n  const chunks = [];\n  for (let i = 0; i < items.length; i += chunkSize) {\n    chunks.push(items.slice(i, i + chunkSize));\n  }\n  \n  // Reduce each chunk in parallel\n  const chunkResults = await Promise.all(\n    chunks.map(async chunk => {\n      let result = chunk[0];\n      for (let i = 1; i < chunk.length; i++) {\n        result = await reducer(result, chunk[i]);\n      }\n      return result;\n    })\n  );\n  \n  // Recursively reduce chunk results\n  return parallelReduce(chunkResults, reducer, chunkSize);\n}\n\n// Example: Merge files in parallel\nconst merged = await parallelReduce(\n  files,\n  async (acc, file) => {\n    const content = await $`cat ${file}`.text();\n    return acc + '\\n' + content;\n  }\n);\n```\n\n## Progress Tracking\n\n### Progress Reporter\n\n```typescript\n// Track parallel execution progress\nclass ParallelProgress {\n  private completed = 0;\n  private failed = 0;\n  private startTime = Date.now();\n  \n  constructor(private total: number) {}\n  \n  async execute<T>(\n    tasks: Array<() => Promise<T>>,\n    concurrency = 5\n  ): Promise<T[]> {\n    const limit = pLimit(concurrency);\n    \n    return Promise.all(\n      tasks.map((task, index) => \n        limit(async () => {\n          try {\n            const result = await task();\n            this.completed++;\n            this.report();\n            return result;\n          } catch (error) {\n            this.failed++;\n            this.report();\n            throw error;\n          }\n        })\n      )\n    );\n  }\n  \n  private report() {\n    const progress = ((this.completed + this.failed) / this.total * 100).toFixed(1);\n    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);\n    const rate = (this.completed / parseFloat(elapsed)).toFixed(1);\n    \n    console.log(\n      `Progress: ${progress}% | ` +\n      `Completed: ${this.completed}/${this.total} | ` +\n      `Failed: ${this.failed} | ` +\n      `Rate: ${rate}/s | ` +\n      `Elapsed: ${elapsed}s`\n    );\n  }\n}\n\n// Execute with progress\nconst progress = new ParallelProgress(100);\nawait progress.execute(tasks, 10);\n```\n\n### Visual Progress Bar\n\n```typescript\nimport { SingleBar } from 'cli-progress';\n\n// Visual progress for parallel tasks\nclass VisualProgress {\n  private bar: SingleBar;\n  private completed = 0;\n  \n  constructor(total: number) {\n    this.bar = new SingleBar({\n      format: 'Progress |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s',\n      barCompleteChar: '\\u2588',\n      barIncompleteChar: '\\u2591'\n    });\n    this.bar.start(total, 0);\n  }\n  \n  async execute<T>(task: () => Promise<T>): Promise<T> {\n    try {\n      const result = await task();\n      this.completed++;\n      this.bar.update(this.completed);\n      return result;\n    } catch (error) {\n      this.bar.stop();\n      throw error;\n    }\n  }\n  \n  async executeAll<T>(\n    tasks: Array<() => Promise<T>>,\n    concurrency = 5\n  ): Promise<T[]> {\n    const limit = pLimit(concurrency);\n    \n    const results = await Promise.all(\n      tasks.map(task => limit(() => this.execute(task)))\n    );\n    \n    this.bar.stop();\n    return results;\n  }\n}\n\n// Use visual progress\nconst visual = new VisualProgress(tasks.length);\nawait visual.executeAll(tasks);\n```\n\n## Error Handling in Parallel\n\n### Partial Failure Handling\n\n```typescript\n// Handle partial failures\nclass ParallelExecutor {\n  async executeWithErrors<T>(\n    tasks: Array<() => Promise<T>>\n  ): Promise<{\n    successes: T[];\n    failures: Array<{ index: number; error: Error }>;\n  }> {\n    const results = await Promise.allSettled(tasks);\n    \n    const successes: T[] = [];\n    const failures: Array<{ index: number; error: Error }> = [];\n    \n    results.forEach((result, index) => {\n      if (result.status === 'fulfilled') {\n        successes.push(result.value);\n      } else {\n        failures.push({ index, error: result.reason });\n      }\n    });\n    \n    return { successes, failures };\n  }\n  \n  async executeWithRetry<T>(\n    tasks: Array<() => Promise<T>>,\n    maxRetries = 3\n  ): Promise<T[]> {\n    const retry = async (task: () => Promise<T>, attempts = 0): Promise<T> => {\n      try {\n        return await task();\n      } catch (error) {\n        if (attempts < maxRetries) {\n          await new Promise(resolve => setTimeout(resolve, 1000 * (attempts + 1)));\n          return retry(task, attempts + 1);\n        }\n        throw error;\n      }\n    };\n    \n    return Promise.all(tasks.map(task => retry(task)));\n  }\n}\n\n// Handle errors gracefully\nconst executor = new ParallelExecutor();\nconst { successes, failures } = await executor.executeWithErrors(tasks);\n\nif (failures.length > 0) {\n  console.error(`${failures.length} tasks failed`);\n  failures.forEach(({ index, error }) => {\n    console.error(`Task ${index}: ${error.message}`);\n  });\n}\n```\n\n### Fast-Fail vs Fail-Safe\n\n```typescript\n// Fast-fail: Stop on first error\nasync function fastFail<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {\n  return Promise.all(tasks.map(task => task()));\n}\n\n// Fail-safe: Continue despite errors\nasync function failSafe<T>(tasks: Array<() => Promise<T>>): Promise<Array<T | Error>> {\n  const results = await Promise.allSettled(tasks.map(task => task()));\n  \n  return results.map(result => \n    result.status === 'fulfilled' ? result.value : result.reason\n  );\n}\n\n// Choose strategy\nconst strategy = critical ? fastFail : failSafe;\nconst results = await strategy(tasks);\n```\n\n## Optimization Strategies\n\n### Task Batching\n\n```typescript\n// Batch tasks for efficiency\nclass TaskBatcher {\n  private batch: any[] = [];\n  private timer: NodeJS.Timeout | null = null;\n  \n  constructor(\n    private batchSize: number,\n    private batchDelay: number,\n    private processor: (batch: any[]) => Promise<any>\n  ) {}\n  \n  add(task: any): Promise<any> {\n    return new Promise((resolve, reject) => {\n      this.batch.push({ task, resolve, reject });\n      \n      if (this.batch.length >= this.batchSize) {\n        this.flush();\n      } else if (!this.timer) {\n        this.timer = setTimeout(() => this.flush(), this.batchDelay);\n      }\n    });\n  }\n  \n  private async flush() {\n    if (this.timer) {\n      clearTimeout(this.timer);\n      this.timer = null;\n    }\n    \n    if (this.batch.length === 0) return;\n    \n    const currentBatch = this.batch;\n    this.batch = [];\n    \n    try {\n      const results = await this.processor(\n        currentBatch.map(item => item.task)\n      );\n      \n      currentBatch.forEach((item, index) => {\n        item.resolve(results[index]);\n      });\n    } catch (error) {\n      currentBatch.forEach(item => item.reject(error));\n    }\n  }\n}\n\n// Use batching\nconst batcher = new TaskBatcher(\n  10,     // Batch size\n  100,    // Delay ms\n  async (batch) => {\n    // Process entire batch at once\n    return await $`process-batch`.stdin(JSON.stringify(batch)).json();\n  }\n);\n\n// Add tasks (automatically batched)\nconst results = await Promise.all(\n  items.map(item => batcher.add(item))\n);\n```\n\n## Best Practices\n\n### Do's ✅\n\n```typescript\n// ✅ Limit concurrency\nconst limit = pLimit(5);\nawait Promise.all(tasks.map(t => limit(t)));\n\n// ✅ Handle partial failures\nconst results = await Promise.allSettled(tasks);\nconst succeeded = results.filter(r => r.status === 'fulfilled');\n\n// ✅ Track progress\nconst progress = new ProgressTracker(tasks.length);\nawait progress.execute(tasks);\n\n// ✅ Use appropriate strategy\nconst strategy = needsAllSuccess ? Promise.all : Promise.allSettled;\nawait strategy(tasks);\n\n// ✅ Clean up resources\ntry {\n  await parallelExecute(tasks);\n} finally {\n  await cleanup();\n}\n```\n\n### Don'ts ❌\n\n```typescript\n// ❌ Unlimited parallelism\nawait Promise.all(\n  thousandTasks.map(t => t())  // May overwhelm system\n);\n\n// ❌ Ignore errors\nawait Promise.all(tasks);  // Will throw on first error\n\n// ❌ No progress indication\nawait executeManyTasks();  // User has no idea of progress\n\n// ❌ Poor error messages\ncatch (error) {\n  console.log('Something failed');  // Which task?\n}\n```\n\n## Implementation Details\n\nParallel execution is implemented in:\n- `packages/core/src/utils/parallel.ts` - Parallel execution utilities\n- `packages/core/src/utils/concurrency.ts` - Concurrency control\n- `packages/core/src/utils/load-balancer.ts` - Load balancing\n- `packages/core/src/utils/progress.ts` - Progress tracking\n\n## See Also\n\n- [Performance Optimization](/core/execution-engine/performance/optimization)\n- [Connection Reuse](/core/execution-engine/performance/connection-reuse)\n- [Error Handling](/core/execution-engine/features/error-handling)\n- [Composition](/core/execution-engine/api/composition)