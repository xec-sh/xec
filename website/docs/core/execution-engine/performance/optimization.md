---
title: Performance Optimization
description: Caching, resource usage, and execution performance
---

# Performance Optimization {#performance-optimization}

Optimizing Xec execution performance through caching, efficient resource usage, and strategic command execution patterns.

## Overview {#overview}

Measure command duration and resource use before tuning. Xec provides lazy execution, bounded parallel batches, target connection pooling, per-command result caching and task-level dependency scheduling. Use those mechanisms to keep workflows small and observable.

## Command Caching {#command-caching}

### Result Caching {#result-caching}

There is no engine-level or `$`-level cache method. Caching is per command,
chained on the `ProcessPromise` before awaiting it:

```typescript
import { $ } from '@xec-sh/core';

// First call executes and caches; the default TTL is 60000ms
await $`git rev-parse HEAD`.cache({ ttl: 60000 });

// A second call with the same command, cwd, env and target returns the
// cached result instead of running again
await $`git rev-parse HEAD`.cache({ ttl: 60000 });

// Cache with an explicit key, so unrelated commands can share an entry
await $`cat package.json | jq .version`.cache({
  key: 'app-version',
  ttl: 300000,  // 5 minutes
});
```

The cache key normally covers the command text, cwd, env and target (host,
container, pod, etc.) so two different hosts never share a cached result;
`key` overrides it outright. `invalidateOn: string[]` names glob-style
patterns matched against other cache keys to evict on a successful run.

### Conditional Caching {#conditional-caching}

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

let query: ProcessPromise = $`git show HEAD:package.json`;
if (process.env.CACHE_IMMUTABLE_INPUTS === '1') {
  const revision = (await $`git rev-parse HEAD`.text()).trim();
  query = $`git show ${`${revision}:package.json`}`.cache({ ttl: 60_000 });
}
console.log(await query.json());
```

## Resource Pooling {#resource-pooling}

### Process Pooling {#process-pooling}

Bound the number of independent processes with `parallel`. A shell process has state and command completion boundaries, so keep each command's lifecycle explicit.

```typescript
import { $, parallel } from '@xec-sh/core';

const results = await parallel([$`node --version`, $`git --version`], { maxConcurrent: 2 });
if (results.failed.length) throw new AggregateError(results.failed, 'Tool checks failed');
```

### Connection Pooling {#connection-pooling}

SSH connections are pooled automatically — there is no pool object to
create or drain. Reuse comes from calling `$.ssh(...)` with the same target
repeatedly; pool size and idle timeout are adapter-wide settings. See
[Connection Reuse](/docs/core/execution-engine/performance/connection-reuse) for
the full configuration shape:

```typescript
const server1 = $.ssh({ host: 'server1', username: 'deploy' });
const server2 = $.ssh({ host: 'server2', username: 'deploy' });

await server1`command`;
await server2`command`;
```

## Batch Operations {#batch-operations}

### Command Batching {#command-batching}

```typescript
import { $ } from '@xec-sh/core';

const script = 'set -eu\npnpm install --frozen-lockfile\npnpm build\npnpm test\n';
const remote = $.ssh({ host: 'build.example.com', username: 'build' }).cd('/srv/project');
await remote.with({ stdin: script })`sh -s`;
```

### File Operation Batching {#file-operation-batching}

```typescript
// Batch file operations
async function batchFileOps(operations: Array<{
  action: 'copy' | 'move' | 'delete';
  source: string;
  dest?: string;
}>) {
  const script = operations.map(op => {
    switch (op.action) {
      case 'copy': return `cp ${op.source} ${op.dest}`;
      case 'move': return `mv ${op.source} ${op.dest}`;
      case 'delete': return `rm ${op.source}`;
    }
  }).join('\n');

  const proc = $`bash`;
  proc.stdin.write(script);
  proc.stdin.end();
  return await proc;
}

// Batch remote operations
const remote = $.ssh('server');
await remote`
  cp file1.txt backup/
  mv file2.txt archive/
  rm temp.txt
  chmod 755 script.sh
`;  // Single SSH session
```

## Lazy Evaluation {#lazy-evaluation}

### Deferred Execution {#deferred-execution}

```typescript
import { $, parallel } from '@xec-sh/core';

const checks = [$`node --version`, $`git --version`];
// Constructing a command leaves it pending until it is awaited or started.
const outcomes = await parallel(checks, { maxConcurrent: 2 });
console.log(outcomes.duration);
```

### Conditional Evaluation {#conditional-evaluation}

```typescript
import { $ } from '@xec-sh/core';

if (process.env.RUN_TESTS === 'true') await $`pnpm test`;
await $`pnpm build`;
```

## Memory Management {#memory-management}

### Streaming Large Data {#streaming-large-data}

```typescript
import { $ } from '@xec-sh/core';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

const output = createWriteStream('report.json');
try {
  await $`generate-report`.stdout(output);
} finally {
  output.end();
  await finished(output);
}
```

### Resource Cleanup {#resource-cleanup}

```typescript
import { $ } from '@xec-sh/core';

await $.withTempDir(async directory => {
  await $.writeFile(`${directory}/input.txt`, 'temporary input');
  await $`wc -c ${`${directory}/input.txt`}`;
});
```

## Profiling and Monitoring {#profiling-and-monitoring}

### Performance Profiling {#performance-profiling}

```typescript
import { $ } from '@xec-sh/core';

const durations: number[] = [];
const record = ({ duration }: { duration: number }) => { durations.push(duration); };
$.on('command:complete', record);
try {
  await $`pnpm build`;
  console.log({ commands: durations.length, totalMs: durations.reduce((a, b) => a + b, 0) });
} finally {
  $.off('command:complete', record);
}
```

### Resource Monitoring {#resource-monitoring}

```typescript
import { $ } from '@xec-sh/core';

const start = process.cpuUsage();
let peakHeap = process.memoryUsage().heapUsed;
const timer = setInterval(() => {
  peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
}, 100);
try {
  await $`pnpm build`;
} finally {
  clearInterval(timer);
  console.log({ peakHeap, parentCpu: process.cpuUsage(start) });
}
```

## Optimization Strategies {#optimization-strategies}

### Parallel vs Sequential {#parallel-vs-sequential}

```typescript
// Analyze dependencies for optimal execution
class DependencyOptimizer {
  private tasks = new Map<string, {
    command: any;
    dependencies: string[];
  }>();
  
  addTask(name: string, command: any, dependencies: string[] = []) {
    this.tasks.set(name, { command, dependencies });
  }
  
  async execute() {
    const completed = new Set<string>();
    const executing = new Map<string, Promise<any>>();
    
    const canExecute = (name: string) => {
      const task = this.tasks.get(name)!;
      return task.dependencies.every(dep => completed.has(dep));
    };
    
    while (completed.size < this.tasks.size) {
      // Find tasks that can execute
      const ready = Array.from(this.tasks.keys())
        .filter(name => !completed.has(name) && !executing.has(name) && canExecute(name));
      
      // Execute in parallel
      for (const name of ready) {
        const task = this.tasks.get(name)!;
        const promise = task.command.then((result: any) => {
          completed.add(name);
          executing.delete(name);
          return result;
        });
        executing.set(name, promise);
      }
      
      // Wait for at least one to complete
      if (executing.size > 0) {
        await Promise.race(executing.values());
      }
    }
  }
}

// Optimize execution order
const optimizer = new DependencyOptimizer();
optimizer.addTask('fetch', $`git fetch`);
optimizer.addTask('install', $`npm install`, ['fetch']);
optimizer.addTask('build', $`npm run build`, ['install']);
optimizer.addTask('test', $`npm test`, ['build']);
optimizer.addTask('lint', $`npm run lint`, ['install']);  // Can run parallel with build

await optimizer.execute();
```

## Best Practices {#best-practices}

### Do's ✅ {#dos-}

Measure through command events, bound concurrency with `parallel`, reuse target contexts, and stream large outputs to owned destinations. Use Xec task cache keys that include all declared inputs. Scope result caching to immutable queries.

### Don'ts ❌ {#donts-}

```typescript
// ❌ Don't create unnecessary processes
for (let i = 0; i < 1000; i++) {
  await $`echo ${i}`;  // 1000 processes!
}

// ❌ Don't buffer large outputs
const huge = await $`cat 10gb-file.txt`;  // OOM risk

// ❌ Don't ignore connection limits
const connections = [];
for (let i = 0; i < 100; i++) {
  connections.push($.ssh('server'));  // Too many connections
}

// ❌ Don't skip cleanup
const temp = await $`mktemp`;
// Missing cleanup
```

## Implementation Details {#implementation-details}

`ProcessPromise.cache()` is implemented in:
- `packages/core/src/utils/cache.ts` - the result cache and key generation
- `packages/core/src/core/process-context.ts` - where `.cache()` is wired into `ProcessPromise`

There is no dedicated resource-pooling or profiling module — connection
pooling lives in the SSH adapter (see
[Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)),
and profiling is left to the host application, as shown above.

## See Also {#see-also}

- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Streaming](/docs/core/execution-engine/features/streaming)