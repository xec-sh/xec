---
title: Common Patterns & Best Practices
description: Design patterns and best practices for Xec automation
keywords: [patterns, best practices, design, architecture, automation]
---

# Common Patterns & Best Practices

## Overview

This section covers common patterns, best practices, and design approaches for building robust automation with Xec.

## Pattern Categories

### Execution Patterns
- [Error Handling](../guides/advanced/error-handling.md) - Robust error management
- [Parallel Execution](../core/execution-engine/performance/parallel-execution.md) - Concurrent command execution
- [Async Patterns](../scripting/patterns/async-patterns.md) - Async/await usage

### Target Patterns
- [Multi-Target Execution](../guides/infrastructure/multi-environment.md#running-one-step-against-many-targets) - Running one step across multiple hosts
- [Handling Target Failures](../guides/infrastructure/multi-environment.md#naming-which-target-failed) - Reading failures honestly and stopping a rollout early
- [Multi-Stage Pipelines](../guides/infrastructure/multi-environment.md#stages-that-depend-on-each-other) - Stages that depend on each other

### Data Patterns
- [Stream Processing](../scripting/patterns/streaming.md) - Real-time data handling
- [File Operations](../core/execution-engine/features/file-operations.md) - Cross-environment file management
- [Secret Management](../commands/built-in/secrets.md) - Secure credential handling

### Workflow Patterns
- [Chaining Commands](../scripting/patterns/chaining.md) - Method chaining patterns
- [Error Handling](../scripting/patterns/error-handling.md) - Try/catch patterns
- [Task Automation](../guides/automation/first-automation.md) - Building automation workflows

### Integration Patterns
- [CI/CD Integration](../guides/automation/ci-cd-pipelines.md) - Pipeline automation
- [Database Operations](../recipes/development/database-setup.md) - Database automation
- [Container Orchestration](../guides/infrastructure/container-orchestration.md) - Docker/K8s patterns
- [Deployment Automation](../guides/automation/deployment.md) - Deployment patterns

## Quick Examples

### Error Handling Pattern

```typescript
import { retry } from '@xec-sh/ops';

// Retry a read-only probe. A deployment retry needs its own idempotency contract.
async function probeWithRetry(host: string) {
  return retry(() => $.ssh({ host, username: 'deploy' })
    `curl --fail --silent http://localhost:3000/health`.timeout(5000), {
      maxAttempts: 3,
      initialDelay: 1000
    });
}
```

### Parallel Execution Pattern

```typescript
// Execute commands across multiple targets in parallel
async function healthCheckAll(targets: string[]) {
  const results = await Promise.allSettled(
    targets.map(async target => {
      const result = await $.ssh(target)`
        echo "=== System Health ===" &&
        uptime &&
        df -h / &&
        free -m &&
        systemctl status app
      `.nothrow();

      return {
        target,
        healthy: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr
      };
    })
  );

  // Process results
  const summary = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        target: targets[i],
        healthy: false,
        error: result.reason
      };
    }
  });

  return summary;
}
```

### Pipeline Pattern

```typescript
// Build a data processing pipeline
async function processLogs(logFile: string) {
  const lines = await $`
    cat ${logFile} |
    grep ERROR |
    awk '{print $1, $2, $NF}' |
    sort |
    uniq -c |
    sort -rn |
    head -20
  `.lines();

  return lines.map(line => {
    const [count, date, time, error] = line.trim().split(/\s+/);
    return { count: parseInt(count), date, time, error };
  });
}
```

### State Management Pattern

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('validate')
  .step('types', { run: 'npm run typecheck' })
  .step('tests', { run: 'npm test', dependsOn: ['types'] })
  .step('build', { run: 'npm run build', dependsOn: ['tests'] })
  .run();
console.log(result.steps.map(({ name, success, duration }) => ({ name, success, duration })));
if (!result.success) throw new Error('Validation failed');
// This result is an in-memory report, not durable deployment or rollback state.
```

### Stream Processing Pattern

```typescript
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

async function inspectLogs(file: string) {
  const input = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const entry: unknown = JSON.parse(line);
      if (typeof entry !== 'object' || entry === null || !('level' in entry)) {
        throw new Error('Invalid log entry');
      }
      if (entry.level === 'error') console.error(entry);
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
```

## Best Practices

### 1. Error Handling

Handle expected failures and preserve unexpected ones:

```typescript
// Ordinary execution throws on a nonzero exit; preserve that failure.
try {
  await $`npm run deploy`;
} catch (error) {
  console.error('Deployment failed:', error instanceof Error ? error.message : String(error));
  // Invoke recovery only when its application-specific preconditions are known.
  throw error;
}

// Use nothrow only when the exit code is an expected decision input.
const test = await $`npm test`.nothrow();
if (!test.ok) throw new Error(`Tests exited ${test.exitCode}`);
```

### 2. Resource Management

Always clean up resources:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

// Dispose an engine that this function owns, not a derivative of shared global $.
const engine = new ExecutionEngine();
try {
  await engine.execute({ command: 'node --version' });
} finally {
  await engine.dispose();
}
```

### 3. Timeout Configuration

Set appropriate timeouts:

```typescript
import { config } from '@xec-sh/ops';

await config.load();
const timeout = config.get<number>('vars.backupTimeoutMs') ?? 600_000;
if (!Number.isSafeInteger(timeout) || timeout < 1) throw new Error('Invalid backupTimeoutMs');
await $`npm run backup`.timeout(timeout);
```

### 4. Logging and Monitoring

Add comprehensive logging:

```typescript
const environment = args[0];
if (environment !== 'staging' && environment !== 'production') throw new Error('Select an environment');
const startTime = Date.now();
try {
  await $`npm run ${`deploy:${environment}`}`;
  log.success(`Deployment completed in ${Date.now() - startTime} ms`);
} catch (error) {
  log.error(`Deployment failed after ${Date.now() - startTime} ms`);
  throw error;
}
```

### 5. Configuration Management

Externalize configuration:

```typescript
import { targets } from '@xec-sh/ops';

// Resolve the exact configured target. An absent target is an error.
await targets.exec('hosts.production', 'cd /srv/app && npm run deploy');
```

## Anti-Patterns to Avoid

### 1. Ignoring Exit Codes

```typescript
// Ordinary execution already stops on failure.
await $`npm test`;
await $`npm run deploy`;

// If nothrow is necessary, test the returned result explicitly.
const result = await $`npm test`.nothrow();
if (!result.ok) throw new Error(`Tests failed: exit ${result.exitCode}`);
```

### 2. No Timeout on Long Operations

```typescript
// ❌ Bad - No timeout
await $`long-running-task`;

// ✅ Good - Set timeout
await $`long-running-task`.timeout(300000);
```

### 3. Mixing Concerns

```typescript
async function build() { await $`npm run build`; }
async function test() { await $`npm test`; }
async function deploy() { await $`npm run deploy`; }
await test();
await build();
await deploy();
```

## Performance Patterns

### Connection Reuse

```typescript
// Derive both commands from the same SSH engine; the root manages the pool.
const server = $.ssh({ host: 'server.example.com', username: 'deploy' });
await server`node --version`;
await server`df -h`;
// The Xec CLI owns final disposal of its global engine.
```

### Batch Operations

```typescript
async function inspectHosts(servers: string[]) {
  return $.parallel.map(servers,
    host => $.ssh({ host, username: 'deploy' })`node --version`.timeout(5000),
    { maxConcurrency: 4 }
  );
}
```

## Security Patterns

### Secret Management

```typescript
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error('API_KEY is required');
// An environment variable keeps the value out of command arguments.
await $`npm run deploy`.env({ API_KEY: apiKey });
```

### Input Validation

```typescript
async function inspectHost(host: string) {
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('Invalid hostname');
  // A fixed command is safer than accepting arbitrary shell text from a request.
  await $.ssh({ host, username: 'deploy' })`node --version`.timeout(5000);
}
```

## Testing Patterns

### Unit Testing Commands

```typescript
import { it, expect } from 'vitest';
import { $ } from '@xec-sh/core';

it('preserves arguments containing shell metacharacters', async () => {
  const value = 'a b; literal';
  const result = await $`${process.execPath} -e ${'console.log(process.argv[1])'} ${value}`;
  expect(result.stdout.trim()).toBe(value);
});
```

### Integration Testing

```typescript
import { it, expect } from 'vitest';
import { $ } from '@xec-sh/core';
import { isDockerAvailable } from '@xec-sh/testing';

// Requires Docker and the alpine:3.22 image; this test owns its disposable container.
it.skipIf(!isDockerAvailable())('executes inside the test image', async () => {
  const result = await $.docker({ image: 'alpine:3.22', autoRemove: true })`echo test`;
  expect(result.stdout.trim()).toBe('test');
});
```

## Related Documentation

- [Error Handling](../guides/advanced/error-handling.md) - Detailed error handling patterns
- [Parallel Execution](../core/execution-engine/performance/parallel-execution.md) - Concurrent execution strategies
- [Stream Processing](../scripting/patterns/streaming.md) - Real-time data processing
- [API Reference](../api/index.md) - Core API documentation
- [Examples](../recipes/index.md) - Practical examples
