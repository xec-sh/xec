---
title: Error Handling Patterns
description: Error handling patterns for production scripts
---

# Error Handling Patterns

Robust error handling is crucial for production scripts. This guide covers comprehensive error handling patterns for Xec scripts, from basic try-catch to advanced recovery strategies.

## Basic Error Handling

### Try-Catch Pattern

```typescript
import { $, CommandError, sanitizeErrorForDiagnostics } from '@xec-sh/core';

try {
  await $`pnpm test`.timeout('2m');
} catch (error) {
  const diagnostic = sanitizeErrorForDiagnostics(error instanceof Error ? error : new Error(String(error)));
  console.error(diagnostic.message);
  if (error instanceof CommandError) console.error('Exit code', error.exitCode);
  process.exitCode = 1;
}
```

### Non-Throwing Commands

Use `.nothrow()` to prevent exceptions and handle errors manually:

```javascript
const result = await $`test -f /nonexistent`.nothrow();

if (result.exitCode !== 0) {
  console.log('File does not exist');
} else {
  console.log('File exists');
}

// Using the ok property
if (!result.ok) {
  console.error('Command failed:', result.cause);
}
```

`result.ok` is `true` only when the command exited zero and was not killed by
a signal; when it's `false`, `result.cause` gives the short reason
(`exitCode: 1` or `signal: SIGTERM`).

## Error Recovery Patterns

### Retry with Exponential Backoff

Create a fresh command inside each attempt. Retry operations whose effects can safely be repeated.

```typescript
import { $ } from '@xec-sh/core';
import { RetryPolicy } from '@xec-sh/ops';

const signal = AbortSignal.timeout(30_000);
const policy = RetryPolicy.create()
  .maxAttempts(3)
  .backoff('exponential', { initial: 250, max: 2_000 })
  .signal(signal)
  .build();
await policy.execute(() => $`pg_isready -h localhost -p 5432`.signal(signal).timeout('5s'));
```

A transport failure after a mutation can leave an unknown outcome. Verify the resulting state before repeating that mutation.

### Circuit Breaker Pattern

A long-lived caller can stop admitting work after repeated failures and probe recovery after a cooldown. Keep that state in the owning service and record the affected target. Xec supplies execution and cancellation for admitted commands. A short-lived script can stop on its first failed prerequisite.

### Fallback Strategy

The alternative endpoint must satisfy the same read contract. Preserve both causes if neither source succeeds.

```typescript
import { $ } from '@xec-sh/core';

async function readData() {
  try {
    return await $`curl --fail https://primary-api.example.com/data`.timeout('5s').text();
  } catch (primaryError) {
    try {
      return await $`curl --fail https://backup-api.example.com/data`.timeout('5s').text();
    } catch (fallbackError) {
      throw new AggregateError([primaryError, fallbackError], 'Both data sources failed');
    }
  }
}
const data = await readData();
console.log(data);
```

## Structured Error Types

### Custom Error Classes

Add domain context while preserving the original cause.

```typescript
class VerificationError extends Error {
  constructor(readonly target: string, cause: unknown) {
    super(`Verification failed for ${target}`, { cause });
    this.name = 'VerificationError';
  }
}
```

## Error Context and Logging

### Contextual Error Wrapping

```typescript
import { $ } from '@xec-sh/core';

async function checkHost(host: string) {
  try {
    return await $.ssh(`deploy@${host}`)`uptime`.timeout('30s');
  } catch (cause) {
    throw new Error(`Health check failed for ${host}`, { cause });
  }
}
```

### Structured Logging

Use the shared sanitizer when writing errors to diagnostics.

```typescript
import { $, sanitizeErrorForDiagnostics } from '@xec-sh/core';

try {
  await $`pnpm test`;
} catch (error) {
  const diagnostic = sanitizeErrorForDiagnostics(error instanceof Error ? error : new Error(String(error)));
  console.error(JSON.stringify({ event: 'test-failed', message: diagnostic.message }));
  process.exitCode = 1;
}
```

## Graceful Degradation

### Feature Flags

Check optional prerequisites before dispatch. Record intentionally skipped capabilities in the result. A required prerequisite should fail the operation.

### Partial Success Handling

```typescript
import { $ } from '@xec-sh/core';

const result = await $.parallel.settled(['pnpm typecheck', 'pnpm lint'], { maxConcurrent: 2 });
console.log({ succeeded: result.succeeded.length, failed: result.failed.length });
if (result.failed.length) throw new AggregateError(result.failed, 'Verification incomplete');
```

## Cleanup and Resource Management

### Finally Blocks

```typescript
import { $ } from '@xec-sh/core';

const tunnel = await $.ssh('deploy@bastion.example.com').tunnel({
  localPort: 0, remoteHost: '127.0.0.1', remotePort: 8080,
});
try {
  const response = await fetch(`http://127.0.0.1:${tunnel.localPort}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Health check returned ${response.status}`);
} finally {
  await tunnel.close();
}
```

### Resource Pool with Error Recovery

The SSH adapter owns its connection pool. Reuse an engine and stable target options, then await disposal when the owning application ends. A command result is execution data and carries no resource-release method.

## Error Aggregation

### Collecting Multiple Errors

```typescript
import { $ } from '@xec-sh/core';

const results = await Promise.allSettled([$`pnpm lint`, $`pnpm typecheck`]);
const failures: unknown[] = [];
for (const result of results) {
  if (result.status === 'rejected') failures.push(result.reason);
}
if (failures.length) throw new AggregateError(failures, 'Project checks failed');
```

## Complete Error Handling Example

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('verify-and-build')
  .step('types', { run: 'pnpm typecheck', timeout: 120_000 })
  .step('tests', { run: 'pnpm test', timeout: 300_000 })
  .step('build', { run: 'pnpm build', dependsOn: ['types', 'tests'], timeout: 180_000 })
  .run({}, { concurrency: 2 });
for (const step of result.steps) console.log(step.name, step.success, step.skipped, step.error);
if (!result.success) process.exitCode = 1;
```
