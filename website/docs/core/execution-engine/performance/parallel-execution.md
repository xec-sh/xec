---
title: Parallel Execution
description: Running commands concurrently across environments
---

# Parallel Execution {#parallel-execution}

Execute commands concurrently across multiple environments, maximizing throughput and reducing total execution time.

## Overview {#overview}

Parallel execution (`packages/core/src/utils/parallel.ts`) provides:

- **Concurrent command execution** across environments
- **Concurrency limiting** to prevent resource exhaustion
- **Result aggregation** with error handling
- **Progress tracking** for long-running operations

## The Real API {#the-real-api}

`parallel(commands, options)` runs lazy commands with a concurrency limit and returns ordered `results`, `succeeded`, `failed` and elapsed `duration`. A signalled or nonzero result enters `failed`, including when `.nothrow()` is enabled. A rejected command enters `failed` as an error.

```typescript
import { $, parallel } from '@xec-sh/core';

const outcomes = await parallel([$`node --version`, $`git --version`], { maxConcurrent: 2 });
console.log(outcomes.results);
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Tool checks failed');
```

`$.parallel` offers `all`, `settled`, `race`, `map`, `filter`, `some` and `every`. The map and filter callbacks return a command. `$.batch` accepts `concurrency` and `onProgress`.

## Basic Parallel Execution {#basic-parallel-execution}

### Promise.all Pattern {#promiseall-pattern}

```typescript
import { $ } from '@xec-sh/core';

const results = await Promise.all([$`node --version`, $`git --version`]);
console.log(results.map(result => result.stdout.trim()));
```

`ProcessPromise` is a lazy thenable accepted by native promise combinators. `Promise.all` rejects when an input rejects while the other commands can continue running.

### Promise.allSettled for Resilience {#promiseallsettled-for-resilience}

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

## Concurrency Control {#concurrency-control}

### Limiting Parallelism {#limiting-parallelism}

```typescript
import { $, parallel } from '@xec-sh/core';

const files = ['README.md', 'package.json', 'pnpm-lock.yaml'];
const outcomes = await parallel(files.map(file => $`wc -c ${file}`), { maxConcurrent: 2 });
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'File measurement failed');
```

`maxConcurrent` must be a positive safe integer or `Infinity`; an invalid limit rejects before execution. `maxConcurrency` is an alias. The same scheduler and limit apply to `filter` and `some`; both wait for started work before returning.

`timeout` is a per-command deadline in milliseconds (`0` disables it). It combines with the command’s existing cancellation signal and the surrounding `within()` scope. Keep `ProcessPromise` inputs lazy so the scheduler can apply its limit and deadline before execution. A command explicitly started elsewhere already owns its running lifetime.

## Map-Reduce Pattern {#map-reduce-pattern}

### Parallel Map {#parallel-map}

```typescript
import { $ } from '@xec-sh/core';

const files = ['README.md', 'package.json'];
const outcomes = await $.parallel.map(files, file => $`wc -c ${file}`, { maxConcurrent: 2 });
console.log(outcomes);
```

### Reduce with Parallelism {#reduce-with-parallelism}

```typescript
import { $, parallel } from '@xec-sh/core';

const files = ['README.md', 'package.json'];
const outcomes = await parallel(files.map(file => $`wc -c < ${file}`), { maxConcurrent: 2 });
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'File measurement failed');
const total = outcomes.succeeded.reduce((bytes, result) => bytes + Number(result.stdout.trim()), 0);
console.log(total);
```

## Progress Tracking {#progress-tracking}

```typescript
import { $ } from '@xec-sh/core';

const checks = ['node --version', 'git --version'];
const outcomes = await $.batch(checks, {
  concurrency: 2,
  onProgress: (completed, total, succeeded, failed) => {
    console.log(`${completed}/${total}, ${succeeded} succeeded, ${failed} failed`);
  },
});
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Checks failed');
```

## Error Handling in Parallel {#error-handling-in-parallel}

### Partial Failure Handling {#partial-failure-handling}

```typescript
import { $, parallel } from '@xec-sh/core';

const hosts = ['web-1.example.com', 'web-2.example.com'];
const outcomes = await parallel(
  hosts.map(host => $.ssh({ host, username: 'deploy' })`systemctl is-active api`.nothrow()),
  { maxConcurrent: 2 },
);
outcomes.results.forEach((outcome, index) => console.log(hosts[index], outcome));
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Some services are unavailable');
```

### Fast-Fail vs Fail-Safe {#fast-fail-vs-fail-safe}

With finite concurrency, `stopOnError: true` stops scheduling new work after an observed failure. Already-started commands finish. `stopOnError: false` is the default and collects every outcome. Unlimited concurrency submits all commands before observing results, so use a finite limit when stopping further work matters.

```typescript
import { $, parallel } from '@xec-sh/core';

const outcomes = await parallel([$`pnpm test:unit`, $`pnpm test:integration`], {
  maxConcurrent: 1,
  stopOnError: true,
});
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Test sequence stopped');
```

## Best Practices {#best-practices}

### Do's ✅ {#dos-}

Keep commands lazy until the limiter schedules them. Select a limit appropriate for target resources, retain input-to-result identity and report all observed failures. Use task dependencies for operations that require ordering.

### Don'ts ❌ {#donts-}

Avoid starting every command before passing it to the limiter. A failed promise does not cancel sibling operations. Inspect the state of started mutations before retrying a batch.

## Implementation Details {#implementation-details}

Parallel execution is implemented in:
- `packages/core/src/utils/parallel.ts` - `parallel()`, `ParallelEngine` (`$.parallel`)
- `packages/core/src/utils/parallel-default.ts` - the standalone `parallel()` export bound to the default `$`
- `packages/core/src/utils/retry-adapter.ts` - the standalone `retry()` export and `RetryError`

## See Also {#see-also}

- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
- [Composition](/docs/core/execution-engine/api/composition)
