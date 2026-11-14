---
title: Async Patterns
description: Concurrency, cancellation, and dependency scheduling through Xec
---

# Async Patterns for Command Execution {#async-patterns-for-command-execution}

Xec commands are awaitable. Use the execution engine for process ownership and the standard promise APIs for coordinating their results.

## Sequential vs Parallel Execution {#sequential-vs-parallel-execution}

### Sequential Execution {#sequential-execution}

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm install --frozen-lockfile`;
await $`pnpm build`;
```

### Parallel Execution {#parallel-execution}

```typescript
import { $ } from '@xec-sh/core';

const result = await $.parallel.settled(['pnpm lint', 'pnpm typecheck'], {
  maxConcurrent: 2,
  timeout: 120_000,
});
if (result.failed.length) throw new AggregateError(result.failed, 'Checks failed');
```

### Mixed Sequential and Parallel {#mixed-sequential-and-parallel}

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('ci')
  .step('install', { run: 'pnpm install --frozen-lockfile' })
  .step('test', { run: 'pnpm test', dependsOn: ['install'] })
  .step('lint', { run: 'pnpm lint', dependsOn: ['install'] })
  .step('build', { run: 'pnpm build', dependsOn: ['test', 'lint'] })
  .run({}, { concurrency: 2 });
if (!result.success) process.exitCode = 1;
```

## Promise Control Patterns {#promise-control-patterns}

### Promise.allSettled for Resilient Execution {#promiseallsettled-for-resilient-execution}

```typescript
import { $ } from '@xec-sh/core';

const hosts = ['web1.example.com', 'web2.example.com'];
const outcomes = await Promise.allSettled(hosts.map(host => $.ssh(`deploy@${host}`)`uptime`));
for (const [index, outcome] of outcomes.entries()) {
  if (outcome.status === 'fulfilled') console.log(hosts[index], outcome.value.stdout);
  else console.error(hosts[index], outcome.reason);
}
if (outcomes.some(outcome => outcome.status === 'rejected')) process.exitCode = 1;
```

This waits for every submitted operation. With `.nothrow()`, inspect `result.ok` as well because a fulfilled promise may contain a failed exit.

### Promise.race for Timeouts {#promiserace-for-timeouts}

Give the command its deadline through `.timeout()`. A timer raced against a command only settles the outer promise and leaves the command running.

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm test`.timeout('2m');
```

### Promise.any for Fallback Servers {#promiseany-for-fallback-servers}

A read may query redundant endpoints. Cancel and join outstanding attempts after the first successful result. Only use this pattern when requests can safely run concurrently.

```typescript
const endpoints = ['https://a.example.com/health', 'https://b.example.com/health'];
const controller = new AbortController();
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]);
const requests = endpoints.map(async endpoint => {
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
  return response.text();
});
try {
  console.log(await Promise.any(requests));
} finally {
  controller.abort();
  await Promise.allSettled(requests);
}
```

## Concurrency Control {#concurrency-control}

### Limited Parallelism {#limited-parallelism}

```typescript
import { $ } from '@xec-sh/core';

const hosts = ['web1.example.com', 'web2.example.com'];
const commands = hosts.map(host => ({
  command: 'uptime',
  adapter: 'ssh' as const,
  adapterOptions: { type: 'ssh' as const, host, username: 'deploy' },
}));
const result = await $.parallel.settled(commands, { maxConcurrent: 2, timeout: 30_000 });
if (result.failed.length) throw new AggregateError(result.failed, 'Host checks failed');
```

### Batch Processing {#batch-processing}

Use `maxConcurrent` for a rolling work queue. A batch barrier is useful when the next group depends on the complete result of the current group. Await and inspect that result before submitting another group.

## Async Iterators and Generators {#async-iterators-and-generators}

### Async Generator for Streaming Results {#async-generator-for-streaming-results}

```typescript
import { $ } from '@xec-sh/core';

async function* inspectHosts(hosts: string[]) {
  for (const host of hosts) {
    const result = await $.ssh(`deploy@${host}`)`uptime`.timeout('30s').nothrow();
    yield { host, result };
  }
}
for await (const { host, result } of inspectHosts(['web1.example.com'])) {
  console.log(host, result.ok);
}
```

### Async Iterator for Progress Updates {#async-iterator-for-progress-updates}

```typescript
import { $ } from '@xec-sh/core';

for await (const line of $`pnpm build`.timeout('5m')) {
  console.log(line);
}
```

The iterator emits complete output lines. Exceptions from the command still propagate to the consumer.

## Event-Driven Async Patterns {#event-driven-async-patterns}

### Event Emitter for Long Operations {#event-emitter-for-long-operations}

Pipeline supplies typed start, output, and completion events. Use its observer for task progress. If an observer fails, Pipeline cancels the run and rejects it.

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('build')
  .step('build', { run: 'pnpm build', timeout: 300_000 })
  .run({}, {
    onEvent(event) {
      if (event.type === 'step-output') process.stdout.write(event.text);
    },
  });
if (!result.success) process.exitCode = 1;
```

## Queue Management {#queue-management}

### Priority Queue {#priority-queue}

For a finite job list, sort command descriptions by priority before submitting them to `$.parallel`. The scheduler preserves dispatch order within the concurrency limit. Reprioritizing work already running requires application-specific scheduling.

## Async Coordination Patterns {#async-coordination-patterns}

### Semaphore for Resource Limiting {#semaphore-for-resource-limiting}

Share a scheduler for work competing for one resource. Separate calls to `$.parallel` have independent limits. A cross-process critical section can use the kernel-backed `withFileLock` utility in [Ops](../../ops/index.md).

### Barrier Synchronization {#barrier-synchronization}

A Pipeline step with multiple `dependsOn` entries becomes eligible after those dependencies settle successfully. Failure skips dependent work and stays visible in the final result.

## Async Pipelines {#async-pipelines}

### Pipeline Builder {#pipeline-builder}

Use [Pipeline](../../ops/pipeline.md) for command graphs and [Workflow](../../ops/workflow.md) for tasks passing typed application data. Both validate dependencies before execution. Function callbacks must observe their cancellation signal.

## Async Stream Processing {#async-stream-processing}

### Transform Stream for Command Output {#transform-stream-for-command-output}

```typescript
import { $ } from '@xec-sh/core';
import { createWriteStream } from 'node:fs';

await $`pnpm build`
  .timeout('5m')
  .stdout(createWriteStream('build.log', { mode: 0o600 }))
  .stderr(process.stderr);
```

The local adapter observes writable backpressure and completion. See [streaming](./streaming.md) for line transformations and cancellation.

## Complete Async Workflow Example {#complete-async-workflow-example}

```typescript
import { Workflow } from '@xec-sh/ops';

const result = await Workflow.create('verify')
  .task('revision', async ctx => (await ctx.exec`git rev-parse HEAD`).stdout.trim())
  .task('test', async ctx => {
    ctx.log(`Testing ${String(ctx.taskOutput('revision'))}`);
    return ctx.exec`pnpm test`;
  }, { dependsOn: ['revision'], timeout: 300_000 })
  .run();
if (!result.success) process.exitCode = 1;
```
