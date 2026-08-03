---
title: API Reference
description: Complete API reference for Xec core and CLI packages
keywords: [api, reference, core, cli, types, interfaces]
---

# API Reference

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

// With target — string shorthands
const sshResult = await $.ssh('deploy@host:2222')`uptime`;
const k8sResult = await $.k8s('prod/api-pod:sidecar')`ls /app`;

// With target — full options
const dockerResult = await $.docker({ container: 'my-app' })`ps aux`;
```

`$.ssh()` accepts either a `[user@]host[:port]` string or an options object
(`Omit<SSHAdapterOptions, 'type'>`). `$.k8s()` accepts either a
`[namespace/]pod[:container]` string or an options object
(`Omit<KubernetesAdapterOptions, 'type'>`). `$.docker()` requires an options
object (or no arguments, which returns the fluent Docker API) — there is no
string shorthand for Docker.

### Programmatic Execution

`$.run` and `$.raw` are tagged templates. Calling them as ordinary functions
(`$.run('echo hello')`) throws a `TypeError` — a plain string would be
iterated character by character. The supported programmatic forms are:

```typescript
// Full control via a Command object
const result = await $.execute({
  command: 'npm install',
  cwd: '/project',
  timeout: 60000,
});

// Command already assembled in a variable
const cmd = 'echo hello';
await $.run([cmd]);   // array form is a valid template substitute
await $`${cmd}`;      // or interpolate into the template
```

### Type Definitions

```typescript
import type {
  ProcessPromise,
  ExecutionResult,
  Command,
  AdapterType,
  SSHAdapterOptions,
  DockerAdapterOptions,
  KubernetesAdapterOptions,
  CallableExecutionEngine,
  SSHExecutionContext,
  K8sExecutionContext,
  K8sPod,
  DockerOptions,
  RetryOptions,
  PipeTarget,
} from '@xec-sh/core';
```

## Quick Reference

### Execution Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `` $`command` `` | Template literal execution | `ProcessPromise` |
| `$.execute(command)` | Execute a `Command` object | `Promise<ExecutionResult>` |
| `$.ssh(target)` | SSH execution context (string shorthand or options) | `SSHExecutionContext` |
| `$.docker(options)` | Docker execution context (options object) | `ExecutionEngine` |
| `$.docker()` | Fluent Docker API | `DockerFluentAPI` |
| `$.k8s(target?)` | Kubernetes execution context (string shorthand, options, or empty) | `K8sExecutionContext` |
| `$.local()` | Local execution context | `ExecutionEngine` |
| `$.with(config)` | Derived engine with merged config | `ExecutionEngine` |

### ProcessPromise Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `.pipe(target)` | Pipe output to command, stream, or function | `ProcessPromise` |
| `.nothrow()` | Don't throw on non-zero exit | `ProcessPromise` |
| `.quiet()` | Suppress output | `ProcessPromise` |
| `.timeout(ms, signal?)` | Set timeout | `ProcessPromise` |
| `.signal(abortSignal)` | Attach an AbortSignal | `ProcessPromise` |
| `.cwd(path)` | Set working directory | `ProcessPromise` |
| `.env(vars)` | Set environment | `ProcessPromise` |
| `.shell(shell)` | Select shell (string or boolean) | `ProcessPromise` |
| `.interactive()` | Inherit stdio for interactive commands | `ProcessPromise` |
| `.stdout(stream)` / `.stderr(stream)` | Redirect output streams | `ProcessPromise` |
| `.cache(options?)` | Cache the result | `ProcessPromise` |
| `.kill(signal?)` | Terminate the process | `void` |
| `.text()` | Get trimmed text output | `Promise<string>` |
| `.json()` | Parse JSON output | `Promise<T>` |
| `.lines()` | Get output lines | `Promise<string[]>` |
| `.buffer()` | Get raw output | `Promise<Buffer>` |

`stdin` is a property (`NodeJS.WritableStream`), not a method. A
`ProcessPromise` is also async-iterable: `for await (const line of $`cmd`)`.

### Adapter Option Types

```typescript
// SSH (programmatic API uses `username`; YAML target config uses `user`)
interface SSHAdapterOptions {
  type: 'ssh';
  host: string;
  username: string;
  port?: number;
  privateKey?: string | Buffer;
  passphrase?: string;
  password?: string;
  sudo?: {
    enabled: boolean;
    password?: string;
    user?: string;
    passwordMethod?: 'stdin' | 'askpass' | 'echo' | 'secure';
  };
}

// Docker
interface DockerAdapterOptions {
  type: 'docker';
  container: string;
  user?: string;
  workdir?: string;
  tty?: boolean;
  runMode?: 'exec' | 'run';
  image?: string;
  volumes?: string[];
  autoRemove?: boolean;
}

// Kubernetes
interface KubernetesAdapterOptions {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  execFlags?: string[];
  tty?: boolean;
  stdin?: boolean;
}
```

### Command Object

`$.execute()` takes a `Command`:

```typescript
interface Command {
  command: string;                      // Command to execute
  args?: string[];                      // Command arguments
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  timeout?: number;                     // Execution timeout (ms)
  timeoutSignal?: string;               // Signal to send on timeout
  stdin?: string | Buffer | Readable;   // Input data
  stdout?: StreamOption;                // Output handling
  stderr?: StreamOption;                // Error output handling
  shell?: string | boolean;             // Use shell
  detached?: boolean;                   // Detached process
  signal?: AbortSignal;                 // Abort signal
  nothrow?: boolean;                    // Don't throw on non-zero exit
  retry?: RetryOptions;                 // Retry options
  adapter?: AdapterType;                // Adapter selection
  adapterOptions?: AdapterSpecificOptions;
}
```

## Error Handling

### Error Types

The error classes exported by `@xec-sh/core`:

```typescript
import {
  ExecutionError,
  CommandError,
  ConnectionError,
  TimeoutError,
  AdapterError,
  DockerError,
  KubernetesError,
  RetryError,
} from '@xec-sh/core';

try {
  await $`command`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}
```

### Why a Failure Failed

Every `ExecutionError` carries a `kind` — a stable, machine-readable
classification — and a `recoverable` flag. Branch on those rather than on the
message text, which changes between versions and tools.

```typescript
import { classifyFailure, isRecoverable, type FailureKind } from '@xec-sh/core';

try {
  await $.docker({ container: 'api' })`./migrate.sh`;
} catch (error) {
  if (error instanceof ExecutionError && error.recoverable) {
    // The daemon went away mid-flight; a fresh connection may succeed.
    await reconnect();
  }
}
```

`kind` is one of `command-failed`, `timeout`, `connection-lost`,
`connection-refused`, `authentication`, `not-found`, `permission-denied`,
`invalid-usage` or `unknown`. Only `connection-lost` and `connection-refused`
are reported as `recoverable` — retrying rejected credentials or a missing
container only multiplies the error.

`classifyFailure(error)` applies the same rules to any thrown value, including
a raw stderr string from a tool you shelled out to yourself.

### Result Pattern

```typescript
// Using nothrow for Result pattern
const result = await $`command`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed:', result.stderr);
}
```

## Advanced Usage

### SSH Connection Reuse

The SSH adapter pools connections automatically — repeated commands against
the same host reuse one connection. There is no separate pool object to
manage:

```typescript
const server = $.ssh('deploy@server.example.com');

// All of these share a pooled connection
await server`uptime`;
await server`df -h`;
await server`systemctl status app`;
```

### Stream Processing

```typescript
import { $ } from '@xec-sh/core';

// Stream output line by line
for await (const line of $`tail -f /var/log/app.log`) {
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

## Related Documentation

- [Execution Engine](./execution-engine.md) - Detailed engine API
- [Process Promise](./process-promise.md) - Promise chain API
- [Types](./types.md) - TypeScript definitions
- [Configuration](../configuration/overview.md) - Configuration system
- [Commands](../commands/overview.md) - Command reference
- [Examples](../scripting/basics/first-script.md) - Usage examples
