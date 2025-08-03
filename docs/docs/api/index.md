---
title: API Reference
description: Complete API reference for Xec core and CLI packages
keywords: [api, reference, core, cli, types, interfaces]
source_files:
  - packages/core/src/index.ts
  - apps/xec/src/index.ts
verification_date: 2025-08-03
---

# API Reference

## Implementation Reference

**Source Files:**
- `packages/core/src/index.ts` - Core library exports
- `packages/core/src/types/index.ts` - Type definitions
- `apps/xec/src/index.ts` - CLI exports
- `packages/core/src/core/execution-engine.ts` - Main execution engine

## Overview

Complete API reference for the Xec ecosystem, including the core execution engine (@xec-sh/core) and CLI (@xec-sh/cli) packages.

## Package Structure

### @xec-sh/core
The core execution engine providing universal command execution across environments.

- [Execution Engine API](./execution-engine.md) - Main execution interface
- [Process Promise API](./process-promise.md) - Command execution results
- [Types Reference](./types.md) - TypeScript type definitions

### @xec-sh/cli
The command-line interface for Xec.

- [Command System](../commands/overview.md) - Command system overview
- [CLI Reference](../commands/cli-reference.md) - Complete CLI reference
- [Configuration](../configuration/overview.md) - Configuration management

## Core Exports

### Main Function ($)

```typescript
import { $ } from '@xec-sh/core';

// Template literal syntax
const result = await $`ls -la`;

// With target
const sshResult = await $.ssh('host')`uptime`;
const dockerResult = await $.docker('container')`ps aux`;
const k8sResult = await $.k8s('pod')`ls /app`;
```

### Shell Function ($$)

```typescript
import { $$ } from '@xec-sh/core';

// Direct shell execution
await $$('echo "Hello, World!"');

// With options
await $$('npm install', { 
  cwd: '/project',
  timeout: 60000 
});
```

### Type Definitions

```typescript
import type {
  ExecutionEngine,
  ProcessPromise,
  ExecutionResult,
  Target,
  SSHTarget,
  DockerTarget,
  KubernetesTarget,
  ExecutionOptions,
  StreamOptions
} from '@xec-sh/core';
```

## Quick Reference

### Execution Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `$(strings, ...values)` | Template literal execution | `ProcessPromise` |
| `$$(command, options?)` | Direct command execution | `Promise<ExecutionResult>` |
| `$.ssh(target)` | SSH execution context | `ExecutionEngine` |
| `$.docker(container)` | Docker execution context | `ExecutionEngine` |
| `$.k8s(pod)` | Kubernetes execution context | `ExecutionEngine` |
| `$.local()` | Local execution context | `ExecutionEngine` |

### ProcessPromise Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `.pipe(command)` | Pipe output to command | `ProcessPromise` |
| `.nothrow()` | Don't throw on error | `ProcessPromise` |
| `.quiet()` | Suppress output | `ProcessPromise` |
| `.timeout(ms)` | Set timeout | `ProcessPromise` |
| `.cwd(path)` | Set working directory | `ProcessPromise` |
| `.env(vars)` | Set environment | `ProcessPromise` |
| `.stdin(input)` | Provide stdin | `ProcessPromise` |
| `.lines()` | Get output lines | `Promise<string[]>` |
| `.json()` | Parse JSON output | `Promise<any>` |
| `.text()` | Get text output | `Promise<string>` |

### Target Types

```typescript
// SSH Target
interface SSHTarget {
  type: 'ssh';
  host: string;
  port?: number;
  user?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

// Docker Target
interface DockerTarget {
  type: 'docker';
  container: string;
  user?: string;
  workingDir?: string;
}

// Kubernetes Target
interface KubernetesTarget {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  context?: string;
}
```

### Execution Options

```typescript
interface ExecutionOptions {
  cwd?: string;           // Working directory
  env?: Record<string, string>; // Environment variables
  shell?: string | boolean;     // Shell to use
  timeout?: number;       // Timeout in ms
  maxBuffer?: number;     // Max output buffer
  encoding?: BufferEncoding;    // Output encoding
  signal?: AbortSignal;   // Abort signal
  stdin?: string | Buffer | Stream; // Input
  stdout?: Stream;        // Output stream
  stderr?: Stream;        // Error stream
  quiet?: boolean;        // Suppress output
  nothrow?: boolean;      // Don't throw on error
}
```

## Error Handling

### Error Types

```typescript
import {
  ExecutionError,
  ValidationError,
  ConnectionError,
  TimeoutError,
  ConfigurationError
} from '@xec-sh/core';

try {
  await $`command`;
} catch (error) {
  if (error instanceof ExecutionError) {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}
```

### Result Pattern

```typescript
// Using nothrow for Result pattern
const result = await $`command`.nothrow();

if (result.exitCode === 0) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed:', result.stderr);
}
```

## Advanced Usage

### Connection Pooling

```typescript
import { createSSHPool } from '@xec-sh/core';

const pool = createSSHPool({
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000
});

const conn = await pool.acquire({
  host: 'server.example.com',
  user: 'deploy'
});

try {
  await conn.exec('command');
} finally {
  await pool.release(conn);
}
```

### Stream Processing

```typescript
import { $ } from '@xec-sh/core';

// Stream output line by line
const proc = $`tail -f /var/log/app.log`;

for await (const line of proc.lines()) {
  console.log('Log:', line);
}
```

### Parallel Execution

```typescript
const targets = ['host1', 'host2', 'host3'];

const results = await Promise.all(
  targets.map(host => 
    $.ssh(host)`uptime`.nothrow()
  )
);

results.forEach((result, i) => {
  console.log(`${targets[i]}: ${result.stdout}`);
});
```

## Performance Characteristics

**Based on Implementation:**

### Method Performance
- `$` template literal: &lt;1ms overhead
- `$$` direct execution: &lt;1ms overhead  
- `.ssh()` context: 100-500ms (new), &lt;10ms (pooled)
- `.docker()` context: 50-100ms
- `.k8s()` context: 200-500ms

### Memory Usage
- Base import: ~5MB
- Per execution: ~1MB
- Connection pool: ~2MB per connection
- Stream buffer: Configurable (default 10MB)

## Related Documentation

- [Execution Engine](./execution-engine.md) - Detailed engine API
- [Process Promise](./process-promise.md) - Promise chain API
- [Types](./types.md) - TypeScript definitions
- [Configuration](../configuration/overview.md) - Configuration system
- [Commands](../commands/overview.md) - Command reference
- [Examples](../scripting/basics/first-script.md) - Usage examples