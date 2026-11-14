---
title: Error Handling
description: Error types, exit code explanation, and failure classification
---

# Error Handling {#error-handling}

The Xec execution engine provides comprehensive error handling with a Result pattern, automatic retries, and detailed error context for robust command execution.

## Overview {#overview}

Error handling (`packages/core/src/core/error.ts`) provides:

- **Result pattern** for explicit error handling
- **A stable failure classification** (`kind`) for programmatic branching, independent of message wording
- **Automatic retry logic** with exponential backoff
- **Error context preservation** across adapters
- **Graceful degradation** strategies
- **Event-based logging** and recovery

## Result Pattern {#result-pattern}

### Basic Usage {#basic-usage}

```typescript
import { $ } from '@xec-sh/core';

// Using nothrow() to get a Result instead of throwing
const result = await $`command-that-might-fail`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.error('Exit code:', result.exitCode);
  console.error('Stderr:', result.stderr);
}
```

### Result Type Definition {#result-type-definition}

Import `ExecutionResult` from `@xec-sh/core`. Its `ok`, `exitCode`, `signal` and `cause` describe completion. `stdout`, `stderr`, `stdall` and `buffer()` expose captured output. Metadata includes `command`, `duration`, `startedAt`, `finishedAt`, `adapter`, `host` and `container`. `throwIfFailed()` converts an unsuccessful completed result into a `CommandError`.

Transport or spawn failures can still reject a `.nothrow()` command. Preserve those errors separately from a completed nonzero exit.

## Error Classes {#error-classes}

`CommandError`, `ConnectionError`, `TimeoutError`, `AdapterError`, `DockerError`, `KubernetesError` and `MaxBufferExceededError` extend `ExecutionError`. Its `code` identifies the error type, `kind` classifies the failure and `details` contains adapter-specific context.

`RetryError` extends `Error` and records the attempted results. Use the public classes for `instanceof` checks.

### Handling Specific Errors {#handling-specific-errors}

```typescript
import { $, CommandError, ExecutionError } from '@xec-sh/core';

try {
  await $.ssh({ host: 'web-1', username: 'deploy' })`systemctl is-active api`;
} catch (error) {
  if (error instanceof CommandError) console.error('Service check exited', error.exitCode);
  else if (error instanceof ExecutionError) console.error('Transport failure', error.kind);
  throw error;
}
```

### Why a Failure Failed {#why-a-failure-failed}

```typescript
import { $, classifyFailure } from '@xec-sh/core';

try {
  await $.docker('api')`./migrate.sh`;
} catch (error) {
  const kind = classifyFailure(error);
  if (kind === 'outcome-unknown' || kind === 'connection-lost') {
    console.error('Inspect migration state before deciding whether to repeat it');
  }
  throw new Error(`Migration failed (${kind})`, { cause: error });
}
```

The classifications are `command-failed`, `outcome-unknown`, `timeout`, `connection-lost`, `connection-refused`, `authentication`, `not-found`, `permission-denied`, `invalid-usage`, `host-key-mismatch` and `unknown`. `recoverable` identifies connection failures for which a fresh transport may succeed. Applications must separately establish whether repeating an operation is safe.

## Retry Logic {#retry-logic}

### Automatic Retries {#automatic-retries}

```typescript
import { $, retry } from '@xec-sh/core';

// retry() takes a function returning a command, not a chained call.
// It retries when the command throws a CommandError (the default for a
// command that isn't .nothrow()'d) — other failures propagate immediately.
const result = await retry(() => $`curl --fail --silent https://api.example.com/health`, {
  maxRetries: 5,
  initialDelay: 1000,      // ms before the first retry
  maxDelay: 10000,         // cap on the delay between retries
  backoffMultiplier: 2,    // exponential backoff
  onRetry: (attempt, result, nextDelay) => {
    console.log(`Retry ${attempt} after exit code ${result.exitCode}, waiting ${nextDelay}ms`);
  }
});
```

Exhausting every attempt throws `RetryError`, which carries `attempts`, the
`lastResult` and every intermediate `results`:

```typescript
import { $, retry, RetryError } from '@xec-sh/core';

try {
  await retry(() => $`curl --fail --silent https://api.example.com/health`, { maxRetries: 3 });
} catch (error) {
  if (error instanceof RetryError) {
    console.log(`Failed after ${error.attempts} attempts`);
    console.log('Last exit code:', error.lastResult.exitCode);
  }
}
```

The same options are available as a chain, applied to every command run
through the derived engine — useful when you don't want to wrap each call in
`retry(() => ...)` individually:

```typescript
await $.retry({ maxRetries: 3 })`unstable-service`;
```

### Conditional Retries {#conditional-retries}

```typescript
import { $, retry } from '@xec-sh/core';

await retry(() => $`curl --fail --silent --show-error https://api.example.com/health`, {
  maxRetries: 3,
  initialDelay: 500,
  jitter: true,
  isRetryable: result => [7, 28, 52, 56].includes(result.exitCode),
});
```

This example retries a read-only health probe for selected curl connection failures. A transport error outside `CommandError` propagates immediately.

### Backoff {#backoff}

```typescript
import { $, retry } from '@xec-sh/core';

await retry(() => $`curl --fail --silent https://api.example.com/health`, {
  maxRetries: 3,
  initialDelay: 500,
  maxDelay: 5000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: result => [7, 28].includes(result.exitCode),
});
```

`backoffMultiplier: 1` gives a constant delay. `maxRetries` excludes the initial attempt. The same core options are available through `$.retry(options)`.

## Error Context {#error-context}

### Reading Context From a Result or Error {#reading-context-from-a-result-or-error}

```typescript
const remote = $.ssh({ host: 'server.com', username: 'user' });

const result = await remote`failing-command`.nothrow();
if (!result.ok) {
  console.log('Context:', {
    adapter: result.adapter,
    host: result.host,
    command: result.command,
    duration: result.duration,
  });
}
```

Everything an `ExecutionError` knows about the failure is in `.details` —
its shape depends on the class. `CommandError.details` holds `exitCode`,
`signal`, `stdout`, `stderr`, `duration` and `callSite`;
`ConnectionError.details` holds `host` and `originalError`.

```typescript
import { $, CommandError } from '@xec-sh/core';
const remote = $.ssh({ host: 'web-1', username: 'deploy' });
try {
  await remote`failing-command`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Failed at:', error.callSite);
    console.log('Stderr:', error.stderr);
  }
}
```

### Adding Custom Context {#adding-custom-context}

There is no built-in way to attach arbitrary custom context (a deployment
name, a service version) to a thrown error. Use the standard `cause` chain
instead:

```typescript
try {
  await $`command`;
} catch (error) {
  throw new Error('deployment failed for web-api@1.2.3', { cause: error });
}
```

## Error Recovery {#error-recovery}

### Fallback Chains {#fallback-chains}

Define alternate targets only for reads whose data consistency permits substitution. A failed deployment or migration requires inspection of the original target. Preserve the original error when reporting the unavailable operation. Xec exposes the failure classification so the application can make this decision.

### Circuit Breaker Pattern {#circuit-breaker-pattern}

A circuit breaker belongs to the caller's service policy. Define the failure threshold, cooldown, read-only recovery probe and shared state explicitly when a workflow needs one. Xec exposes classified failures and execution events for that policy. Its SSH connection pool manages transport reuse independently.

## Timeout Handling {#timeout-handling}

### Command Timeouts {#command-timeouts}

```typescript
import { ExecutionError } from '@xec-sh/core';

// Simple timeout
try {
  await $`long-running-command`.timeout(5000);  // 5 seconds
} catch (error) {
  if (error instanceof ExecutionError && error.kind === 'timeout') {
    console.log('Command timed out:', error.message);
  }
}

// Timeout with a custom signal
await $`server-process`.timeout(10000, 'SIGTERM');

// A duration string reads better than a bare number of milliseconds
await $`graceful-shutdown`.timeout('10s', 'SIGTERM');
```

`.timeout()` takes a duration and an optional signal — there is no separate
grace-period option to force-kill after that signal fails to stop the
process.

A `TimeoutError` class exists and some adapters throw it directly, but
others wrap it in an adapter-specific error while classifying it correctly —
checking `error.kind === 'timeout'` is the one pattern that works
consistently across every target.

### Cascading Timeouts {#cascading-timeouts}

```typescript
// Different timeouts for different stages
async function deployWithTimeouts() {
  const remote = $.ssh({ host: 'server.com', username: 'deploy' });
  
  // Quick commands with short timeout
  await remote`git pull`.timeout(10000);
  
  // Build with longer timeout
  await remote`npm run build`.timeout(60000);
  
  // Deployment with very long timeout
  await remote`npm run deploy`.timeout(300000);
}
```

## Validation and Assertions {#validation-and-assertions}

### Input Validation {#input-validation}

```typescript
import { $ } from '@xec-sh/core';

async function checkService(service: string) {
  const allowed = new Set(['api', 'worker']);
  if (!allowed.has(service)) throw new Error('Unknown managed service');
  return $`systemctl is-active ${service}`;
}

console.log(await checkService('api'));
```

Validate the operation and its arguments before execution. Template interpolation escapes argument values. Checking a command string for a few forbidden substrings cannot establish that the whole shell program is safe.

### Output Assertions {#output-assertions}

There is no built-in `.assert()` on `ProcessPromise` — check the result directly:

```typescript
const result = await $`echo "test"`;
if (result.exitCode !== 0 || !/test/.test(result.stdout)) {
  throw new Error(`Unexpected output: ${result.stdout}`);
}

// Or against a health check's parsed output
const status = await $`health-check`.json();
if (status.status !== 'healthy') {
  throw new Error('Health check failed');
}
```

## Error Aggregation {#error-aggregation}

### Parallel Error Handling {#parallel-error-handling}

```typescript
import { $, parallel } from '@xec-sh/core';

// parallel() sorts commands into succeeded/failed by exit code, so a
// .nothrow()'d failure lands in `failed` as an ExecutionResult rather than
// rejecting the whole batch
async function deployToAllServers(servers: string[]) {
  const { failed } = await parallel(
    servers.map(server => $.ssh(server)`deploy.sh`.nothrow())
  );
  
  if (failed.length > 0) {
    console.error('Deployment failures:', failed);
    throw new Error(`${failed.length} of ${servers.length} servers failed`);
  }
}
```

### Error Summaries {#error-summaries}

```typescript
import { ExecutionError } from '@xec-sh/core';
// Summarize multiple errors
class ErrorSummary {
  private errors: ExecutionError[] = [];
  
  add(error: ExecutionError) {
    this.errors.push(error);
  }
  
  getSummary() {
    const byCode = this.errors.reduce((acc, err) => {
      acc[err.code] = (acc[err.code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: this.errors.length,
      byCode,
      mostCommon: Object.entries(byCode)
        .sort(([,a], [,b]) => b - a)[0],
      samples: this.errors.slice(0, 3)
    };
  }
}
```

## Logging and Debugging {#logging-and-debugging}

### Error Logging {#error-logging}

`command:error` fires only when a command could not complete at all — a
timeout, a lost connection, a spawn failure. A command that ran and exited
non-zero is not an error at the adapter level, so it reports through
`command:complete` instead, with the exit code included:

```typescript
$.on('command:complete', ({ command, exitCode, duration }) => {
  if (exitCode !== 0) {
    console.error({ level: 'ERROR', command, exitCode, duration });
  }
});

$.on('command:error', ({ command, error, duration, timestamp }) => {
  console.error({
    timestamp: timestamp.toISOString(),
    level: 'ERROR',
    command,
    error,      // the error message, as a string
    duration,
  });
});

// $.verbose echoes every command (with secrets masked) to stderr before it
// runs — the closest built-in equivalent to a debug mode. It only exists on
// the top-level global $; a derived engine needs .config.set({ verbose: true }).
$.verbose = true;
await $`failing-command`;
```

### Error Telemetry {#error-telemetry}

```typescript
// Send transport-level failures (timeouts, dropped connections) to a
// monitoring service — a plain non-zero exit does not reach this event,
// see command:complete above
$.on('command:error', async ({ command, error, duration }) => {
  await fetch('https://telemetry.example.com/errors', {
    method: 'POST',
    body: JSON.stringify({
      service: 'xec-automation',
      command,
      error,
      duration,
      timestamp: Date.now()
    })
  });
});
```

## Best Practices {#best-practices}

### Do's ✅ {#dos-}

Classify the actual failure, preserve the cause, bound retries and deadlines, and check state after an unknown remote outcome. Keep authentication errors, authorization failures and completed nonzero exits distinguishable in diagnostics.

### Don'ts ❌ {#donts-}

Avoid retrying side effects solely because a connection is recoverable, swallowing failed results, or changing targets after an uncertain mutation. Report the operation and target alongside the original error.

## Implementation Details {#implementation-details}

Error handling is implemented in:
- `packages/core/src/types/result.ts` - `ExecutionResult` type definition
- `packages/core/src/core/result.ts` - `ExecutionResult` implementation
- `packages/core/src/core/error.ts` - Error classes and `explainExitCode`
- `packages/core/src/core/failure-kind.ts` - `FailureKind` classification
- `packages/core/src/utils/retry-adapter.ts` - Retry logic implementation

## See Also {#see-also}

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Debugging Guide](/docs/guides/development/debugging)
