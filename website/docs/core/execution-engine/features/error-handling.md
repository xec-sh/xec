---
title: Error Handling
description: Error types, exit code explanation, and failure classification
---

# Error Handling

The Xec execution engine provides comprehensive error handling with a Result pattern, automatic retries, and detailed error context for robust command execution.

## Overview

Error handling (`packages/core/src/core/error.ts`) provides:

- **Result pattern** for explicit error handling
- **A stable failure classification** (`kind`) for programmatic branching, independent of message wording
- **Automatic retry logic** with exponential backoff
- **Error context preservation** across adapters
- **Graceful degradation** strategies
- **Event-based logging** and recovery

## Result Pattern

### Basic Usage

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

### Result Type Definition

```typescript
interface ExecutionResult {
  stdout: string;
  stderr: string;
  stdall: string;                       // stdout and stderr merged in arrival order
  exitCode: number;
  signal?: string;
  ok: boolean;                          // exitCode === 0 && !signal
  cause?: string;                       // set when !ok: 'signal: SIGTERM' or 'exitCode: 1'
  command: string;
  duration: number;
  startedAt: Date;
  finishedAt: Date;
  adapter: string;
  host?: string;                        // set for SSH
  container?: string;                   // set for Docker/Kubernetes
  toMetadata(): object;
  throwIfFailed(): void;
  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;
}
```

There is no `.error` field on a result — `nothrow()` gives you the plain
outcome (`exitCode`, `stderr`, `signal`, `cause`), not a wrapped error object.
To get an actual error instance, let the command throw and catch it.

## Error Classes

```typescript
import {
  ExecutionError,
  CommandError,
  ConnectionError,
  TimeoutError,
  AdapterError,
  DockerError,
  KubernetesError,
  MaxBufferExceededError,
  RetryError,
} from '@xec-sh/core';
```

Every one of these extends `ExecutionError`:

```typescript
class ExecutionError extends Error {
  readonly code: string;              // fixed per class, e.g. 'COMMAND_FAILED', 'TIMEOUT'
  readonly kind: FailureKind;         // stable classification, see below
  readonly details?: Record<string, any>;
  get recoverable(): boolean;
}
```

`code` is a constant per class (`CommandError` is always `'COMMAND_FAILED'`,
`TimeoutError` is always `'TIMEOUT'`, `MaxBufferExceededError` is always
`'MAX_BUFFER_EXCEEDED'`, and so on) — useful for a quick check without an
`instanceof`. `kind` is the classification meant for branching: it also
covers failures this package didn't throw itself, via `classifyFailure`
below.

### Handling Specific Errors

```typescript
import { CommandError, ExecutionError, ConnectionError } from '@xec-sh/core';

try {
  await $`risky-command`;
} catch (error) {
  if (error instanceof ExecutionError && error.kind === 'timeout') {
    console.log('Command timed out, retrying with a longer budget...');
    await $`risky-command`.timeout(30000);
  } else if (error instanceof CommandError && error.exitCode === 126) {
    console.log('Permission denied, trying with sudo...');
    await $`sudo risky-command`;
  } else if (error instanceof ConnectionError) {
    console.log('Connection failed, using the local fallback...');
    await $.local()`fallback-command`;
  } else {
    throw error;
  }
}
```

### Why a Failure Failed

```typescript
import { classifyFailure, isRecoverable, type FailureKind } from '@xec-sh/core';

try {
  await $.docker('api')`./migrate.sh`;
} catch (error) {
  if (error instanceof ExecutionError && error.recoverable) {
    // The daemon went away mid-flight; a fresh connection may succeed.
    await reconnect();
  }
}
```

`kind` is one of `command-failed`, `timeout`, `connection-lost`,
`connection-refused`, `authentication`, `not-found`, `permission-denied`,
`invalid-usage`, `host-key-mismatch` or `unknown`. Only `connection-lost` and
`connection-refused` are `recoverable` — retrying rejected credentials or a
missing container only multiplies the error, and a host key that no longer
matches the recorded one must never be retried automatically.
`classifyFailure(error)` applies the same rules to any thrown value,
including a raw stderr string from a tool you shelled out to yourself.

## Retry Logic

### Automatic Retries

```typescript
import { $, retry } from '@xec-sh/core';

// retry() takes a function returning a command, not a chained call.
// It retries when the command throws a CommandError (the default for a
// command that isn't .nothrow()'d) — any other thrown value is treated as a
// caller bug and propagates immediately.
const result = await retry(() => $`unstable-service`, {
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
import { RetryError } from '@xec-sh/core';

try {
  await retry(() => $`unstable-service`, { maxRetries: 3 });
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

### Conditional Retries

```typescript
// Retry only on specific outcomes
const selective = await retry(() => $`network-command`, {
  maxRetries: 3,
  isRetryable: (result) => result.exitCode === 124 || result.exitCode === 1,
});

// Jitter (±25% of the delay, on by default) spreads retries out to avoid a
// thundering herd against a recovering service
const jittered = await retry(() => $`api-call`, {
  maxRetries: 5,
  initialDelay: 1000,
  jitter: true,
});
```

### Backoff

```typescript
// Default: exponential backoff, doubling each attempt
await retry(() => $`command`, {
  maxRetries: 5,
  initialDelay: 1000,
  backoffMultiplier: 2,  // 1s, 2s, 4s, 8s, 16s
});

// A multiplier of 1 keeps the delay constant instead of growing
await retry(() => $`command`, {
  maxRetries: 5,
  initialDelay: 1000,
  backoffMultiplier: 1,  // 1s, 1s, 1s, 1s, 1s
});
```

There is no linear, fibonacci or custom-function backoff — only exponential
(or constant, with `backoffMultiplier: 1`), each optionally jittered.

## Error Context

### Reading Context From a Result or Error

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
try {
  await remote`failing-command`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Failed at:', error.callSite);
    console.log('Stderr:', error.stderr);
  }
}
```

### Adding Custom Context

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

## Error Recovery

### Fallback Chains

```typescript
// Try multiple approaches
async function executeWithFallback(command: string) {
  // Try SSH first
  const ssh = await $.ssh('prod-server')`${command}`.nothrow();
  if (ssh.ok) return ssh;
  
  // Fallback to Docker
  const docker = await $.docker({ container: 'backup-container' })`${command}`.nothrow();
  if (docker.ok) return docker;
  
  // Final fallback to local
  return await $`${command}`;
}
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeout = 60000,
    private halfOpenRequests = 3
  ) {}
  
  async execute(command: () => Promise<any>) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await command();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      throw error;
    }
  }
}

// Usage
const breaker = new CircuitBreaker();
await breaker.execute(() => $`risky-command`);
```

## Timeout Handling

### Command Timeouts

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

### Cascading Timeouts

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

## Validation and Assertions

### Input Validation

```typescript
// Validate before execution
function validateAndExecute(command: string) {
  // Check for dangerous patterns
  if (command.includes('rm -rf /')) {
    throw new Error('Dangerous command detected');
  }
  
  // Check for required variables
  if (!process.env.API_KEY) {
    throw new Error('API_KEY environment variable required');
  }
  
  // $.exec() runs an already-assembled string with the full chaining API;
  // interpolating it into a template (`` $`${command}` ``) would quote the
  // whole string as a single argument instead of parsing it as a command line.
  return $.exec(command);
}
```

### Output Assertions

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

## Error Aggregation

### Parallel Error Handling

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

### Error Summaries

```typescript
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

## Logging and Debugging

### Error Logging

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

### Error Telemetry

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

## Best Practices

### Do's ✅

```typescript
// ✅ Use nothrow() for explicit error handling
const result = await $`command`.nothrow();
if (!result.ok) {
  // Handle error explicitly
}

// ✅ Add retry logic for network operations
import { retry } from '@xec-sh/core';
await retry(() => $.ssh('server')`api-call`, { maxRetries: 3 });

// ✅ Set appropriate timeouts
await $`build`.timeout(60000);

// ✅ Log errors with context
$.on('command:error', ({ command, error }) => {
  logger.error('Command failed', { command, error });
});

// ✅ Branch on the stable classification, not on message text
if (error instanceof ExecutionError && error.kind === 'authentication') {
  // Handle auth failure specifically
}
```

### Don'ts ❌

```typescript
// ❌ Ignore errors silently
try {
  await $`command`;
} catch {
  // Don't swallow errors
}

// ❌ Retry indefinitely
await retry(() => $`command`, { maxRetries: Infinity });  // Bad idea

// ❌ Use generic error messages
throw new Error('Something went wrong');  // Too vague

// ❌ Mix error handling patterns
// Pick either Result pattern (.nothrow()) or try/catch, not both randomly
```

## Implementation Details

Error handling is implemented in:
- `packages/core/src/types/result.ts` - `ExecutionResult` type definition
- `packages/core/src/core/result.ts` - `ExecutionResult` implementation
- `packages/core/src/core/error.ts` - Error classes and `explainExitCode`
- `packages/core/src/core/failure-kind.ts` - `FailureKind` classification
- `packages/core/src/utils/retry-adapter.ts` - Retry logic implementation

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Debugging Guide](/docs/guides/development/debugging)
