# Parallel Execution

Execute commands concurrently across multiple environments, maximizing throughput and reducing total execution time.

## Overview

Parallel execution (`packages/core/src/utils/parallel.ts`) provides:

- **Concurrent command execution** across environments
- **Concurrency limiting** to prevent resource exhaustion
- **Result aggregation** with error handling
- **Progress tracking** for long-running operations

## The Real API

Two distinct things share the name "parallel," and they're easy to conflate:

- `parallel(commands, options?)` — a standalone function (`import { parallel } from '@xec-sh/core'`) that runs an array of commands and returns every outcome.
- `$.parallel` — a property on the engine, not a callable function. `$.parallel(...)` throws; use one of its methods instead.

```typescript
import { $, parallel } from '@xec-sh/core';

// Standalone function: runs on the default $ engine unless you pass one
const { succeeded, failed, duration } = await parallel(
  ['echo one', 'echo two', $`echo three`.nothrow()],
  { maxConcurrent: 5 }
);
```

`ParallelOptions.maxConcurrent` (alias `maxConcurrency`) caps how many
commands run at once; omitted or `Infinity` means unlimited. The result is
`{ results, succeeded, failed, duration }`: a command counts as `succeeded`
only if it ran and exited zero without being signalled, so a `.nothrow()`'d
command that exited non-zero lands in `failed` holding an `ExecutionResult`
(not thrown), while a command that could not run at all lands in `failed`
holding an `Error`.

```typescript
// $.parallel: a ParallelEngine instance with several methods
await $.parallel.all([$`test-unit`, $`test-integration`]);      // throws on any failure, resolves ExecutionResult[]
await $.parallel.settled(['cmd1', 'cmd2'], { maxConcurrent: 3 }); // same shape as the standalone parallel()
await $.parallel.race([$`fetch-from-cache`, $`fetch-from-api`]);  // resolves with the first settled result
await $.parallel.map(servers, (server) => `ping -c1 ${server}`);  // one command per item — see note below
await $.parallel.filter(files, (f) => `test -s ${f}`);            // keeps items whose command exits 0
await $.parallel.some(checks, { maxConcurrent: 5 });               // true if any command succeeds
await $.parallel.every(checks, { maxConcurrent: 5 });               // true if all commands succeed
```

`.map()` and `.filter()` build one command per item — their callback must
return a `string`, `Command` or `ProcessPromise`, not an arbitrary computed
value. Gathering several unrelated results per item (not just one command's
outcome) is a plain `Promise.all(items.map(async (item) => {...}))`
instead; forcing that shape through `.map()` does not work.

```typescript
// $.batch(): a thin wrapper defaulting concurrency to 5 and delegating to
// $.parallel.settled()
await $.batch(commands, {
  concurrency: 5,
  onProgress: (completed, total, succeeded, failed) => {
    console.log(`${completed}/${total} (${succeeded} ok, ${failed} failed)`);
  },
});
```

## Basic Parallel Execution

### Promise.all Pattern

Plain `Promise.all`/`Promise.allSettled` work too, since `ProcessPromise`
is a real `Promise`:

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
const deployResults = await Promise.all(
  servers.map(server =>
    $.ssh({ host: server, username: 'deploy' })`deploy.sh`
  )
);

// Process results
deployResults.forEach((result, index) => {
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

`parallel()` and `$.parallel.settled()` above give you this same
succeeded/failed split without the `Promise.allSettled` unwrapping step.

## Concurrency Control

### Limiting Parallelism

`parallel(commands, { maxConcurrent })` and `$.batch(commands, { concurrency })`
cover the common case without a third-party dependency. For arbitrary
async work (not just running `$` commands), a general-purpose limiter like
`p-limit` still applies:

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
```

## Map-Reduce Pattern

### Parallel Map

For per-item async work that isn't a single command (multiple commands, or
non-command computation per item), a plain concurrency-limited map is more
direct than forcing it through `$.parallel.map()`:

```typescript
import pLimit from 'p-limit';

async function parallelMap<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const limit = pLimit(concurrency);

  return Promise.all(
    items.map(item => limit(() => mapper(item)))
  );
}

// Use parallel map
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
const contents = await parallelMap(
  files,
  async (file) => {
    const result = await $`cat ${file}`;
    return result.stdout;
  },
  3  // Max 3 concurrent
);
```

### Reduce with Parallelism

```typescript
// Parallel reduce operation
async function parallelReduce<T>(
  items: T[],
  reducer: (acc: T, item: T) => Promise<T>,
  chunkSize = 2
): Promise<T> {
  if (items.length === 0) {
    throw new Error('Cannot reduce empty array');
  }

  if (items.length === 1) {
    return items[0];
  }

  // Process in chunks
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  // Reduce each chunk in parallel
  const chunkResults = await Promise.all(
    chunks.map(async chunk => {
      let result = chunk[0];
      for (let i = 1; i < chunk.length; i++) {
        result = await reducer(result, chunk[i]);
      }
      return result;
    })
  );

  // Recursively reduce chunk results
  return parallelReduce(chunkResults, reducer, chunkSize);
}

// Example: merge files in parallel
const merged = await parallelReduce(
  files,
  async (acc, file) => {
    const content = await $`cat ${file}`.text();
    return acc + '\n' + content;
  }
);
```

## Progress Tracking

`$.batch()`'s `onProgress` callback (shown above) covers most cases. For a
visual progress bar over arbitrary async tasks:

```typescript
import pLimit from 'p-limit';
import { SingleBar } from 'cli-progress';

class VisualProgress {
  private bar: SingleBar;
  private completed = 0;

  constructor(total: number) {
    this.bar = new SingleBar({
      format: 'Progress |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s',
      barCompleteChar: '█',
      barIncompleteChar: '░'
    });
    this.bar.start(total, 0);
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    try {
      const result = await task();
      this.completed++;
      this.bar.update(this.completed);
      return result;
    } catch (error) {
      this.bar.stop();
      throw error;
    }
  }

  async executeAll<T>(
    tasks: Array<() => Promise<T>>,
    concurrency = 5
  ): Promise<T[]> {
    const limit = pLimit(concurrency);

    const results = await Promise.all(
      tasks.map(task => limit(() => this.execute(task)))
    );

    this.bar.stop();
    return results;
  }
}

// Use visual progress
const visual = new VisualProgress(tasks.length);
await visual.executeAll(tasks);
```

## Error Handling in Parallel

### Partial Failure Handling

```typescript
// Handle partial failures
class ParallelExecutor {
  async executeWithErrors<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<{
    successes: T[];
    failures: Array<{ index: number; error: Error }>;
  }> {
    const results = await Promise.allSettled(tasks.map(task => task()));

    const successes: T[] = [];
    const failures: Array<{ index: number; error: Error }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successes.push(result.value);
      } else {
        failures.push({ index, error: result.reason });
      }
    });

    return { successes, failures };
  }
}

// Handle errors gracefully
const executor = new ParallelExecutor();
const { successes, failures } = await executor.executeWithErrors(tasks);

if (failures.length > 0) {
  console.error(`${failures.length} tasks failed`);
  failures.forEach(({ index, error }) => {
    console.error(`Task ${index}: ${error.message}`);
  });
}
```

`retry()` (`import { retry } from '@xec-sh/core'`) covers the common
per-task retry case directly — it retries a command that throws a
`CommandError`, with configurable backoff, and throws `RetryError` (carrying
every attempt) on exhaustion — rather than the hand-rolled retry loop this
pattern would otherwise need.

### Fast-Fail vs Fail-Safe

```typescript
// Fast-fail: stop on first error
async function fastFail<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(tasks.map(task => task()));
}

// Fail-safe: continue despite errors
async function failSafe<T>(tasks: Array<() => Promise<T>>): Promise<Array<T | Error>> {
  const results = await Promise.allSettled(tasks.map(task => task()));

  return results.map(result =>
    result.status === 'fulfilled' ? result.value : result.reason
  );
}

// Choose strategy
const strategy = critical ? fastFail : failSafe;
const results = await strategy(tasks);
```

`parallel(commands, { stopOnError: false })` (the default) is fail-safe by
construction; pass `stopOnError: true` for fast-fail without writing either
helper above.

## Best Practices

### Do's ✅

```typescript
// ✅ Cap concurrency instead of firing everything at once
await parallel(commands, { maxConcurrent: 5 });

// ✅ Let succeeded/failed do the splitting instead of Promise.allSettled + filter
const { succeeded, failed } = await parallel(commands, { maxConcurrent: 5 });

// ✅ Track progress through $.batch()'s onProgress
await $.batch(commands, {
  concurrency: 5,
  onProgress: (completed, total) => console.log(`${completed}/${total}`),
});

// ✅ Choose all() vs settled() deliberately
const mustAllSucceed = await $.parallel.all(commands);       // throws on first failure
const tolerant = await $.parallel.settled(commands);          // never throws
```

### Don'ts ❌

```typescript
// ❌ Unlimited parallelism
await Promise.all(
  thousandTasks.map(t => t())  // may overwhelm the target or exhaust local resources
);

// ❌ $.parallel is a property, not a function
await $.parallel(commands);  // throws — use $.parallel.all/.settled/...

// ❌ .map()'s callback returning something other than a command
await $.parallel.map(items, async (item) => ({ item, computed: await doStuff(item) }));
// .map() expects a string/Command/ProcessPromise back — see "The Real API" above

// ❌ Swallowing which task failed
try {
  await Promise.all(tasks);
} catch {
  console.log('Something failed');  // which one?
}
```

## Implementation Details

Parallel execution is implemented in:
- `packages/core/src/utils/parallel.ts` - `parallel()`, `ParallelEngine` (`$.parallel`)
- `packages/core/src/utils/parallel-default.ts` - the standalone `parallel()` export bound to the default `$`
- `packages/core/src/utils/retry-adapter.ts` - the standalone `retry()` export and `RetryError`

## See Also

- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
- [Composition](/docs/core/execution-engine/api/composition)
