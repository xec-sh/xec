---
title: Adapter Concept
sidebar_label: Concept
description: Architecture of the adapter system for executing commands in various environments
---

# Adapter Concept

Adapters are a key component of the Xec architecture, providing command execution in various environments through a unified API. Each adapter encapsulates the specifics of a particular environment while providing a universal interface.

## Adapter System Architecture

The engine routes each command through the `BaseAdapter` interface to one of the five concrete adapters — four environment adapters plus a mock used in tests:

```mermaid
flowchart TD
    Engine["ExecutionEngine<br/>adapter management · command routing ·<br/>configuration and context"]
    Base["BaseAdapter (internal)<br/>stream processing · data masking ·<br/>error handling"]

    Engine --> Base
    Base --> Local["LocalAdapter"]
    Base --> SSH["SSHAdapter"]
    Base --> Docker["DockerAdapter"]
    Base --> K8s["KubernetesAdapter"]
    Base --> Mock["MockAdapter<br/>(tests)"]
```

## Base Adapter Class

All adapters inherit from `BaseAdapter`. It is real — every adapter you read
about below is built on it — but it is an internal class, not exported from
`@xec-sh/core`. The sections on this page describe it to explain how the
adapters behave, not as an API you can import; see [Creating Your Own
Adapter](#creating-your-own-adapter) below for what that means in practice.

```typescript
abstract class BaseAdapter extends EnhancedEventEmitter implements Disposable {
  protected config: ResolvedBaseAdapterConfig; // BaseAdapterConfig with defaults filled in
  protected abstract readonly adapterName: string;
  
  // Main execution method
  abstract execute(command: Command): Promise<ExecutionResult>;
  
  // Availability check
  abstract isAvailable(): Promise<boolean>;
  
  // Resource cleanup
  abstract dispose(): Promise<void>;
  
  // Optional synchronous version — LocalAdapter implements this; others don't
  executeSync?(command: Command): ExecutionResult;
}
```

### Adapter Configuration

```typescript
interface BaseAdapterConfig {
  defaultTimeout?: number;        // Default timeout, in ms (default: 120000)
  defaultCwd?: string;            // Working directory
  defaultEnv?: Record<string, string>; // Environment variables
  defaultShell?: string | boolean;    // Shell for execution
  encoding?: BufferEncoding;      // Output encoding
  maxBuffer?: number;             // Maximum buffer size, in bytes (default: 10MB)
  throwOnNonZeroExit?: boolean;  // Throw exception on error (default: true)
  sensitiveDataMasking?: {        // Data masking (all fields optional; defaults on)
    enabled?: boolean;
    patterns?: RegExp[];
    replacement?: string;
  };
}
```

## Execution Lifecycle

### 1. Adapter Selection

```typescript
// Explicit selection
await $.ssh({ host: 'server' })`ls`;

// Through configuration
await $.with({ 
  adapter: 'docker',
  adapterOptions: { container: 'app' }
})`ls`;

// Automatic selection
await $`ls`;  // Uses LocalAdapter
```

### 2. Command Preparation

Every adapter fills a command in with its own defaults before running it.
`timeout` accepts either milliseconds or a duration string (`'30s'`); this is
where it gets resolved to a number, so nothing downstream has to parse it
again:

```typescript
protected mergeCommand(command: Command): ResolvedCommand {
  const timeout = command.timeout ?? this.config.defaultTimeout;

  return {
    ...command,
    cwd: command.cwd ?? this.config.defaultCwd,
    env: { ...this.config.defaultEnv, ...command.env },
    timeout: timeout === undefined ? undefined : parseDuration(timeout),
    shell: command.shell ?? this.config.defaultShell,
    maxBuffer: command.maxBuffer ?? this.config.maxBuffer,
    throwOnNonZeroExit: command.throwOnNonZeroExit ?? this.config.throwOnNonZeroExit
  };
}
```

### 3. Execution

```typescript
// Each adapter implements its own logic
async execute(command: Command): Promise<ExecutionResult> {
  const merged = this.mergeCommand(command);
  const startTime = Date.now();

  // Adapter-specific implementation
  const result = await this.runInEnvironment(merged);

  // Creating the unified result — masks sensitive data in stdout/stderr/command,
  // and throws automatically when the command failed and nothing downstream
  // (like ProcessPromise) is going to make that decision instead.
  return this.createResult(
    result.stdout,
    result.stderr,
    result.exitCode,
    result.signal,
    this.buildCommandString(merged),
    startTime,
    Date.now()
  );
}
```

### 4. Result Processing

The result every adapter produces is the same `ExecutionResult` a caller sees
after `await $\`cmd\``:

```typescript
interface ExecutionResult {
  stdout: string;          // Standard output
  stderr: string;          // Error output
  stdall: string;           // stdout and stderr merged in arrival order
  exitCode: number;        // Exit code
  signal?: string;         // Termination signal
  ok: boolean;              // exitCode === 0 && !signal
  cause?: string;            // Why it failed, when not ok
  duration: number;        // Execution time (ms)
  startedAt: Date;         // Start time
  finishedAt: Date;        // Finish time
  adapter: string;         // Used adapter
  host?: string;           // Host (for SSH)
  container?: string;      // Container (for Docker)

  toMetadata(): object;
  throwIfFailed(): void;
  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;        // Exact bytes, binary-safe
}
```

## Adapter Types

### LocalAdapter

Command execution in the local system:

```typescript
const local = $.local();
await local`ls -la`;
```

**Features:**
- Direct execution via child_process
- Bun runtime support
- Synchronous execution
- Minimal overhead

### SSHAdapter

Command execution on remote servers:

```typescript
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  privateKey: '/path/to/key'
});
await ssh`ls -la`;
```

**Features:**
- SSH connection pool
- SSH tunnels
- File transfer (SCP/SFTP)
- Sudo support

### DockerAdapter

Command execution in Docker containers:

```typescript
const docker = $.docker({
  container: 'my-app'
});
await docker`ls -la`;
```

**Features:**
- Container lifecycle management
- Log streaming
- Volume mounting
- Docker Compose integration

### KubernetesAdapter

Command execution in Kubernetes pods:

```typescript
const k8s = $.k8s('my-pod');   // or $.k8s({ pod: 'my-pod' })
await k8s`ls -la`;

// Pod object API (not directly callable — use .exec)
await $.k8s().pod('my-pod').exec`ls -la`;
```

**Features:**
- Port forwarding
- Container logs
- File copying
- Namespace support

### Remote Docker (via SSH Composition)

For Docker on remote hosts, compose SSH and Docker manually:

```typescript
const $ssh = $.ssh({ host: 'server', username: 'user' });
await $ssh`docker exec app ls -la`;
```

## Common Adapter Capabilities

### Stream Processing

```typescript
// StreamHandler for all adapters
protected createStreamHandler(options?: {
  onData?: (chunk: string) => void
}): StreamHandler {
  return new StreamHandler({
    encoding: this.config.encoding,
    maxBuffer: this.config.maxBuffer,
    onData: options?.onData
  });
}
```

### Sensitive Data Masking

```typescript
// Automatic password and key hiding
protected maskSensitiveData(text: string): string {
  if (!this.config.sensitiveDataMasking.enabled) {
    return text;
  }
  
  for (const pattern of this.config.sensitiveDataMasking.patterns) {
    text = text.replace(pattern, this.config.sensitiveDataMasking.replacement);
  }
  
  return text;
}
```

**Masking Examples:**

```typescript
// Passwords
"password=secret123" → "password=[REDACTED]"

// API keys
"api_key: abc123" → "api_key: [REDACTED]"

// Bearer tokens
"Authorization: Bearer xyz789" → "Authorization: Bearer [REDACTED]"

// SSH keys
"-----BEGIN RSA PRIVATE KEY-----..." → "[REDACTED]"
```

### Timeout Handling

```typescript
protected async handleTimeout(
  promise: Promise<any>,
  timeout: number,
  command: string,
  cleanup?: () => void
): Promise<any> {
  if (timeout <= 0) return promise;
  
  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      if (cleanup) cleanup();
      reject(new TimeoutError(command, timeout));
    }, timeout);
    
    promise.finally(() => clearTimeout(timer));
  });
  
  return Promise.race([promise, timeoutPromise]);
}
```

### Adapter Events

```typescript
// Each adapter can generate events
$.on('connection:open', ({ host, type }) => {
  console.log(`Connected to ${host} (${type})`);
});

$.on('transfer:complete', ({ source, destination, bytesTransferred }) => {
  console.log(`Transferred ${bytesTransferred} bytes: ${source} -> ${destination}`);
});

$.on('docker:run', ({ image, container }) => {
  console.log(`Container ${container} started from ${image}`);
});
```

## Creating Your Own Adapter

`BaseAdapter` is not exported from `@xec-sh/core`, so a custom adapter cannot
currently be written outside the package — there is no base class to extend
it from. `ExecutionEngine.registerAdapter(name, adapter: BaseAdapter)` is
real, but its parameter type is `BaseAdapter` itself, which is both
unimported and abstract with protected members, so nothing built outside the
package can satisfy it without an unsafe cast — and even then, the object
would still need to correctly implement everything `BaseAdapter` gives an
in-package adapter for free (timeout/cwd/env defaulting, sensitive-data
masking, buffered streaming with a size cap, retry, and the call-site capture
that names a failure's location) by hand.

If you need an environment none of `local`, `ssh`, `docker` or `kubernetes`
cover, the supported path today is composition: shell out to whatever CLI or
API reaches that environment from inside a command run through an existing
adapter, the way [Remote Docker](#remote-docker-via-ssh-composition) above
composes SSH and Docker.

## Resource Management

### Connection Pools

SSH and other network adapters use pools:

```typescript
class ConnectionPool {
  private connections = new Map<string, Connection>();
  private maxConnections = 10;
  private ttl = 300000; // 5 minutes
  
  async getConnection(key: string): Promise<Connection> {
    // Reuse existing
    if (this.connections.has(key)) {
      return this.connections.get(key)!;
    }
    
    // Create new
    const conn = await this.createConnection();
    this.connections.set(key, conn);
    
    // Auto-cleanup by TTL
    setTimeout(() => {
      this.closeConnection(key);
    }, this.ttl);
    
    return conn;
  }
}
```

### Lazy Initialization

Adapters are created only when needed:

```typescript
class ExecutionEngine {
  private adapters = new Map<string, BaseAdapter>();
  
  private async selectAdapter(command: Command): Promise<BaseAdapter> {
    const type = command.adapter || 'local';
    
    // Create on first use
    if (!this.adapters.has(type)) {
      this.adapters.set(type, this.createAdapter(type));
    }
    
    return this.adapters.get(type)!;
  }
}
```

## Error Handling

### Error Types

`AdapterError`, `CommandError` and `TimeoutError` are real, exported error
classes, all extending `ExecutionError` (which carries a machine-readable
`kind` and a `recoverable` flag — see the [API reference](/docs/api#why-a-failure-failed)
for the full classification). The fields relevant to a `catch` block:

```typescript
class CommandError extends ExecutionError {
  readonly command: string;
  readonly exitCode: number;
  readonly signal: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly duration: number;
  readonly callSite: string;  // where the caller wrote this command, when captured
}

class TimeoutError extends ExecutionError {
  readonly command: string;
  readonly timeout: number;
}

class AdapterError extends ExecutionError {
  readonly adapter: string;
  readonly operation: string;
  readonly originalError?: Error;
}
```

A `CommandError`'s message already includes the sanitized command, what the
exit code usually means (`explainExitCode`), the first few lines of stderr
and the call site — the fields above are for programmatic handling, not for
reconstructing the message yourself.

### Handling Strategies

```typescript
// Automatic retry
async executeWithRetry(command: Command): Promise<ExecutionResult> {
  let lastError;
  
  for (let i = 0; i < 3; i++) {
    try {
      return await this.execute(command);
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  
  throw lastError;
}

// Fallback to another adapter
async executeWithFallback(command: Command): Promise<ExecutionResult> {
  try {
    return await this.primaryAdapter.execute(command);
  } catch {
    return await this.fallbackAdapter.execute(command);
  }
}
```

## Performance

### Adapter Metrics

```typescript
interface AdapterMetrics {
  totalExecutions: number;
  averageDuration: number;
  errorRate: number;
  activeConnections: number;
  cacheHitRate: number;
}

// Metric collection
adapter.on('command:complete', ({ duration }) => {
  metrics.totalExecutions++;
  metrics.averageDuration = 
    (metrics.averageDuration * (metrics.totalExecutions - 1) + duration) / 
    metrics.totalExecutions;
});
```

### Optimizations

1. **Result caching** - for idempotent commands
2. **Connection pools** - connection reuse
3. **Stream processing** - for large outputs
4. **Parallel execution** - for independent commands
5. **Lazy loading** - creation on demand

## Conclusion

The adapter system in Xec provides:

- **Universality**: unified API for all environments
- **Extensibility**: easy addition of new adapters
- **Security**: sensitive data masking
- **Performance**: optimizations for each environment
- **Reliability**: error handling and recovery

Adapters are the foundation for creating powerful automation tools that work in any environment.