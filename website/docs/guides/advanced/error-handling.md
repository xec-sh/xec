---
sidebar_position: 2
title: Error Handling
description: Classify command failures, preserve outcomes and verify recovery
---

# Error Handling

## Problem

A command can fail before starting, exit with an error, time out, or lose its
connection after changing remote state. Record the observed outcome and let the
application decide which operations can safely be repeated.

CLI diagnostics retain nested `Error.cause` explanations and parallel failures
from `AggregateError`. Text output shows them without requiring verbose mode;
JSON and YAML include a `causes` array. Both use the same credential masking.
Cyclic references are deduplicated; a limit of 32 causes is reported explicitly
when further entries are omitted.

## Prerequisites

- Xec CLI and its public packages
- JavaScript promises and `async`/`await`
- An application-specific health check and recovery procedure for deployments

## Solution

### Step 1: Basic Error Handling

Xec rejects non-zero exits by default. `CommandError` exposes the result of the
failed command. `ExecutionError.kind` also classifies transport and lifecycle
failures.

```typescript
import { $, CommandError, ExecutionError } from '@xec-sh/core';

try {
  await $`npm run build`;
} catch (error) {
  if (error instanceof CommandError) {
    console.error(error.exitCode, error.stderr);
  } else if (error instanceof ExecutionError) {
    console.error(error.kind, error.message);
  }
  throw error;
}
```

For an expected non-zero exit, inspect a result explicitly. `.nothrow()` still
allows transport failures to reject.

```typescript
import { $ } from '@xec-sh/core';

const result = await $`git diff --quiet`.nothrow();
if (result.exitCode === 1) {
  console.log('Working tree contains changes');
} else if (!result.ok) {
  throw new Error(`Git inspection failed with exit ${result.exitCode}`);
}
```

### Step 2: Error Context and Enrichment

Attach the original error as `cause`. Keep structured context limited to fields
that the operator needs, such as an operation and target identifier.

```typescript
import { $ } from '@xec-sh/core';

async function buildApplication(projectDirectory: string): Promise<void> {
  try {
    await $.cd(projectDirectory)`npm run build`;
  } catch (cause) {
    throw new Error(`Build failed in ${projectDirectory}`, { cause });
  }
}

await buildApplication(process.cwd());
```

The cause retains Xec's error type and classified outcome. Avoid serializing an
entire configuration or environment, which can include credentials.

### Step 3: Remote Execution Error Handling

Use the command's own timeout and the shared `parallel` helper. Results preserve
input order, including errors returned before a command could complete.

```typescript
import { $, parallel, ExecutionError } from '@xec-sh/core';

const hosts = ['deploy@web-1', 'deploy@web-2'];
const result = await parallel(
  hosts.map(host => $.ssh(host)`systemctl is-active app`.timeout('10s').nothrow()),
  { maxConcurrent: 2 }
);

for (const [index, observation] of result.results.entries()) {
  if (observation instanceof ExecutionError) {
    console.error(hosts[index], observation.kind, observation.message);
  } else if (observation instanceof Error) {
    console.error(hosts[index], observation.message);
  } else {
    console.log(hosts[index], observation.exitCode, observation.stdout.trim());
  }
}
if (result.failed.length > 0) process.exitCode = 1;
```

An `outcome-unknown` failure requires reading the remote application's durable
state before retrying a mutation. A connection error alone cannot establish
whether the remote operation took effect.

### Step 4: Transaction-Style Error Recovery

Use the database's transaction mechanism for operations that support it. The
following PostgreSQL migration files must contain transaction-compatible SQL.
`ON_ERROR_STOP` makes a SQL error fail the command and `--single-transaction`
keeps both files in one transaction.

```typescript
import { $ } from '@xec-sh/core';

await $`psql --dbname app --set ON_ERROR_STOP=1 --single-transaction \
  --file migrations/schema.sql --file migrations/data.sql`;
```

Cross-service operations need explicit recovery. Define the previous version,
its restore procedure and a verification step in the application's deployment
contract. Preserve failures from both the attempted operation and recovery.
This wrapper accepts those procedures from the caller.

```typescript
export async function withRecovery(
  apply: () => Promise<void>,
  restore: () => Promise<void>,
  verifyRestored: () => Promise<void>
): Promise<void> {
  try {
    await apply();
  } catch (failure) {
    try {
      await restore();
      await verifyRestored();
    } catch (recoveryFailure) {
      throw new AggregateError([failure, recoveryFailure], 'Operation and recovery failed');
    }
    throw new Error('Operation failed and the previous state was verified', { cause: failure });
  }
}
```

Use this wrapper only when the application can determine the failed operation's
outcome and supports the declared recovery. Keep the durable deployment record
and any backups required by that procedure. For multi-target strategies, use the
shared deployment API. [Deployment operations](../../ops/deploy.md)

### Step 5: Error Aggregation and Reporting

The engine already emits structured command events. Subscribe once and forward
only the fields required by your logging backend.

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine({ defaultTimeout: '30s' });
engine.on('command:error', event => {
  console.error(JSON.stringify({
    type: 'command:error',
    at: event.timestamp,
    adapter: event.adapter,
    error: event.error,
  }));
});
engine.on('command:complete', event => {
  console.log(JSON.stringify({
    type: 'command:complete',
    at: event.timestamp,
    duration: event.duration,
    exitCode: event.exitCode,
  }));
});

try {
  await engine.execute({ command: process.execPath, args: ['--version'], shell: false });
} finally {
  await engine.dispose();
}
```

## Best Practices

- Await each operation and its cleanup before ending the script.
- Use exit codes, signals and `FailureKind` when deciding how to recover.
- Retry read-only or idempotent commands with a bounded policy.
- Verify restored state before recording recovery as complete.
- Keep secrets out of context fields and use the shared redaction boundary.

## Common Pitfalls

A command string held in a variable belongs in `$.exec(command)`. A tagged
interpolation represents an argument. Build dynamic commands from a trusted
executable and separate arguments wherever possible.

```typescript
import { $ } from '@xec-sh/core';

const script = 'build';
await $.exec('npm', { args: ['run', script], shell: false });
```

## Troubleshooting

### Issue: Restating What the Error Already Says

The error message includes the command failure and call site. Inspect individual
fields for decisions and print the message for diagnostics.

```typescript
import { $, CommandError } from '@xec-sh/core';

try {
  await $`npm run build`;
} catch (error) {
  if (error instanceof CommandError) console.error(error.message);
  throw error;
}
```

### Issue: Hand-Rolled Concurrency for Simple Fan-Out

`parallel()` bounds execution and collects success and failure results.

```typescript
import { parallel } from '@xec-sh/core';

const result = await parallel(['npm run lint', 'npm test'], { maxConcurrent: 2 });
if (result.failed.length > 0) throw new AggregateError(result.failed, 'Checks failed');
```

### Issue: Errors Without Context

Catch errors at the awaited entry point. A rejected top-level operation should
leave a failing exit status after awaited cleanup.

```typescript
import { $, dispose } from '@xec-sh/core';

try {
  await $`npm run build`;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await dispose();
}
```

### Issue: Lost Error Details

Use the standard cause field when adding an operation-level message.

```typescript
import { $ } from '@xec-sh/core';

try {
  await $`npm test`;
} catch (cause) {
  throw new Error('Release qualification failed', { cause });
}
```

### Issue: Timeout Handling

Attach the deadline to the command so the adapter owns termination and its
confirmation. A timeout in an unrelated promise leaves the process running.

```typescript
import { $, ExecutionError } from '@xec-sh/core';

try {
  await $`npm test`.timeout('5m');
} catch (error) {
  if (error instanceof ExecutionError) console.error(error.kind);
  throw error;
}
```

### Issue: Resource Leaks

Dispose the owned engine in `finally`. Close resources obtained from its target
API, such as tunnels, at the scope where they were created.

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine();
try {
  console.log((await engine.execute({ command: 'node', args: ['--version'], shell: false })).text());
} finally {
  await engine.dispose();
}
```

## Related Guides

- [Debugging](../development/debugging.md)
- [Testing](../automation/testing.md)
- [Security](./security.md)
