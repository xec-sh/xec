---
title: Type Definitions
description: TypeScript type definitions for Xec core library
keywords: [types, typescript, interfaces, definitions]
source_files:
  - packages/core/src/types/index.ts
  - packages/core/src/types/target.ts
  - packages/core/src/types/result.ts
  - packages/core/src/types/options.ts
verification_date: 2025-08-03
---

# Type Definitions

## Implementation Reference

**Source Files:**
- `packages/core/src/types/index.ts` - Main type exports
- `packages/core/src/types/target.ts` - Target type definitions
- `packages/core/src/types/result.ts` - Result type definitions
- `packages/core/src/types/options.ts` - Options type definitions
- `packages/core/src/types/config.ts` - Configuration types

## Core Types

### Target Types

#### Target

Base target interface for all execution targets.

```typescript
interface Target {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  name?: string;
  description?: string;
}
```

#### LocalTarget

Local execution target.

```typescript
interface LocalTarget extends Target {
  type: 'local';
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}
```

#### SSHTarget

SSH remote execution target.

```typescript
interface SSHTarget extends Target {
  type: 'ssh';
  host: string;
  port?: number;
  user?: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  agentForward?: boolean;
  strictHostKeyChecking?: boolean;
  knownHosts?: string;
  timeout?: number;
  keepaliveInterval?: number;
  keepaliveCountMax?: number;
  readyTimeout?: number;
  compress?: boolean;
  algorithms?: {
    kex?: string[];
    cipher?: string[];
    serverHostKey?: string[];
    hmac?: string[];
  };
}
```

#### DockerTarget

Docker container execution target.

```typescript
interface DockerTarget extends Target {
  type: 'docker';
  container: string;
  image?: string;
  user?: string;
  workingDir?: string;
  env?: Record<string, string>;
  privileged?: boolean;
  network?: string;
  volumes?: string[];
  ports?: string[];
  detach?: boolean;
  remove?: boolean;
  tty?: boolean;
  interactive?: boolean;
}
```

#### KubernetesTarget

Kubernetes pod execution target.

```typescript
interface KubernetesTarget extends Target {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  context?: string;
  kubeconfig?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  serviceAccount?: string;
}
```

### Execution Types

#### ExecutionOptions

Options for command execution.

```typescript
interface ExecutionOptions {
  // Working directory
  cwd?: string;
  
  // Environment variables
  env?: Record<string, string | undefined>;
  
  // Shell configuration
  shell?: string | boolean;
  
  // Timeout in milliseconds
  timeout?: number;
  
  // Maximum buffer size for stdout/stderr
  maxBuffer?: number;
  
  // Encoding for output
  encoding?: BufferEncoding;
  
  // Abort signal for cancellation
  signal?: AbortSignal;
  
  // Input stream or data
  stdin?: string | Buffer | Readable;
  
  // Output streams
  stdout?: Writable;
  stderr?: Writable;
  
  // Behavior flags
  quiet?: boolean;
  verbose?: boolean;
  nothrow?: boolean;
  
  // Process options
  uid?: number;
  gid?: number;
  windowsHide?: boolean;
  killSignal?: string | number;
}
```

#### ExecutionResult

Result of command execution.

```typescript
interface ExecutionResult {
  // Output
  stdout: string;
  stderr: string;
  
  // Exit status
  exitCode: number;
  signal?: string;
  
  // Success indicator
  ok: boolean;
  
  // Metadata
  command: string;
  duration: number;
  target?: Target;
  
  // Original options
  options?: ExecutionOptions;
}
```

#### ProcessOutput

Extended output with additional properties.

```typescript
interface ProcessOutput extends ExecutionResult {
  // Additional stream data
  combined?: string;
  
  // Parsed data
  lines?: string[];
  json?: any;
  
  // Process info
  pid?: number;
  killed?: boolean;
}
```

### Configuration Types

#### Config

Main configuration interface.

```typescript
interface Config {
  // Project metadata
  name?: string;
  description?: string;
  version?: string;
  
  // Targets
  targets?: {
    hosts?: Record<string, SSHTarget>;
    containers?: Record<string, DockerTarget>;
    pods?: Record<string, KubernetesTarget>;
    groups?: Record<string, string[]>;
  };
  
  // Tasks
  tasks?: Record<string, Task>;
  
  // Variables
  variables?: Record<string, any>;
  
  // Defaults
  defaults?: {
    shell?: string;
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
    ssh?: Partial<SSHTarget>;
    docker?: Partial<DockerTarget>;
    kubernetes?: Partial<KubernetesTarget>;
  };
  
  // Commands configuration
  commands?: Record<string, CommandConfig>;
  
  // Aliases
  aliases?: Record<string, string>;
  
  // Scripts configuration
  scripts?: {
    env?: Record<string, string>;
    globals?: string[];
    runtime?: 'auto' | 'node' | 'bun' | 'deno';
  };
}
```

#### Task

Task definition.

```typescript
interface Task {
  // Basic info
  name?: string;
  description?: string;
  
  // Execution
  command?: string;
  script?: string;
  steps?: TaskStep[];
  
  // Parameters
  params?: TaskParameter[];
  
  // Target selection
  targets?: string | string[];
  parallel?: boolean;
  
  // Options
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  
  // Conditions
  condition?: string;
  continueOnError?: boolean;
  
  // Dependencies
  depends?: string[];
  
  // Hooks
  before?: string | string[];
  after?: string | string[];
  onError?: string | string[];
}
```

#### TaskStep

Individual step in a multi-step task.

```typescript
interface TaskStep {
  name: string;
  command?: string;
  script?: string;
  targets?: string | string[];
  condition?: string;
  continueOnError?: boolean;
  timeout?: number;
  env?: Record<string, string>;
}
```

#### TaskParameter

Task parameter definition.

```typescript
interface TaskParameter {
  name: string;
  description?: string;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  values?: any[];
  pattern?: string;
  min?: number;
  max?: number;
}
```

### Connection Types

#### ConnectionPool

SSH connection pool configuration.

```typescript
interface ConnectionPoolConfig {
  // Pool size
  max?: number;
  min?: number;
  
  // Timeouts
  acquireTimeoutMillis?: number;
  createTimeoutMillis?: number;
  destroyTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  reapIntervalMillis?: number;
  
  // Behavior
  createRetryIntervalMillis?: number;
  propagateCreateError?: boolean;
  
  // Validation
  testOnBorrow?: boolean;
  testOnReturn?: boolean;
  testWhileIdle?: boolean;
  
  // Eviction
  evictionRunIntervalMillis?: number;
  numTestsPerEvictionRun?: number;
  softIdleTimeoutMillis?: number;
}
```

#### SSHConnection

Active SSH connection.

```typescript
interface SSHConnection {
  // Connection state
  connected: boolean;
  ready: boolean;
  
  // Execute command
  exec(command: string, options?: ExecOptions): Promise<ExecutionResult>;
  
  // File operations
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  
  // Port forwarding
  forwardPort(localPort: number, remoteHost: string, remotePort: number): Promise<void>;
  reverseForward(remotePort: number, localHost: string, localPort: number): Promise<void>;
  
  // Connection management
  close(): Promise<void>;
  destroy(): void;
}
```

### Error Types

#### XecError

Base error class for all Xec errors.

```typescript
class XecError extends Error {
  readonly code: string;
  readonly details?: any;
  readonly cause?: Error;
}
```

#### ExecutionError

Error thrown when command execution fails.

```typescript
class ExecutionError extends XecError {
  readonly exitCode: number;
  readonly signal?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly command: string;
  readonly duration: number;
  readonly target?: Target;
}
```

#### ValidationError

Error thrown for validation failures.

```typescript
class ValidationError extends XecError {
  readonly field?: string;
  readonly value?: any;
  readonly constraint?: string;
}
```

#### ConnectionError

Error thrown for connection failures.

```typescript
class ConnectionError extends XecError {
  readonly host?: string;
  readonly port?: number;
  readonly protocol?: string;
  readonly attempt?: number;
}
```

#### TimeoutError

Error thrown when operation times out.

```typescript
class TimeoutError extends XecError {
  readonly timeout: number;
  readonly operation?: string;
}
```

#### ConfigurationError

Error thrown for configuration issues.

```typescript
class ConfigurationError extends XecError {
  readonly configPath?: string;
  readonly key?: string;
}
```

### Event Types

#### ExecutionEvent

Events emitted during execution.

```typescript
interface ExecutionEvent {
  type: 'start' | 'stdout' | 'stderr' | 'end' | 'error';
  timestamp: Date;
  command?: string;
  target?: Target;
  data?: any;
}
```

#### ConnectionEvent

Events for connection lifecycle.

```typescript
interface ConnectionEvent {
  type: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
  timestamp: Date;
  target: Target;
  error?: Error;
}
```

### Utility Types

#### DeepPartial

Make all properties optional recursively.

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

#### ValueOf

Get union of all values in object.

```typescript
type ValueOf<T> = T[keyof T];
```

#### Promisable

Value or Promise of value.

```typescript
type Promisable<T> = T | Promise<T>;
```

#### Nullable

Value or null/undefined.

```typescript
type Nullable<T> = T | null | undefined;
```

## Type Guards

### Target Guards

```typescript
function isSSHTarget(target: Target): target is SSHTarget {
  return target.type === 'ssh';
}

function isDockerTarget(target: Target): target is DockerTarget {
  return target.type === 'docker';
}

function isKubernetesTarget(target: Target): target is KubernetesTarget {
  return target.type === 'kubernetes';
}

function isLocalTarget(target: Target): target is LocalTarget {
  return target.type === 'local';
}
```

### Error Guards

```typescript
function isExecutionError(error: unknown): error is ExecutionError {
  return error instanceof ExecutionError;
}

function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError;
}
```

## Generic Types

### Result Type

Result pattern for error handling.

```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
```

### AsyncResult

Async version of Result.

```typescript
type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
```

## Constants

### Exit Codes

```typescript
enum ExitCode {
  Success = 0,
  GeneralError = 1,
  MisuseOfShellBuiltin = 2,
  PermissionDenied = 126,
  CommandNotFound = 127,
  InvalidExitArgument = 128,
  // Signal-based codes
  SIGHUP = 129,
  SIGINT = 130,
  SIGQUIT = 131,
  SIGTERM = 143,
}
```

### Signals

```typescript
enum Signal {
  SIGHUP = 'SIGHUP',
  SIGINT = 'SIGINT',
  SIGQUIT = 'SIGQUIT',
  SIGILL = 'SIGILL',
  SIGTRAP = 'SIGTRAP',
  SIGABRT = 'SIGABRT',
  SIGBUS = 'SIGBUS',
  SIGFPE = 'SIGFPE',
  SIGKILL = 'SIGKILL',
  SIGUSR1 = 'SIGUSR1',
  SIGSEGV = 'SIGSEGV',
  SIGUSR2 = 'SIGUSR2',
  SIGPIPE = 'SIGPIPE',
  SIGALRM = 'SIGALRM',
  SIGTERM = 'SIGTERM',
}
```

## Usage Examples

### Using Target Types

```typescript
import { SSHTarget, DockerTarget } from '@xec-sh/core';

const sshTarget: SSHTarget = {
  type: 'ssh',
  host: 'server.example.com',
  user: 'deploy',
  privateKey: '/home/user/.ssh/id_rsa'
};

const dockerTarget: DockerTarget = {
  type: 'docker',
  container: 'my-app',
  user: 'node',
  workingDir: '/app'
};
```

### Using Result Type

```typescript
import { Result } from '@xec-sh/core';

async function tryOperation(): Promise<Result<string>> {
  try {
    const data = await riskyOperation();
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, error };
  }
}

const result = await tryOperation();
if (result.ok) {
  console.log('Success:', result.value);
} else {
  console.log('Error:', result.error.message);
}
```

### Type Guards

```typescript
import { isSSHTarget, isExecutionError } from '@xec-sh/core';

function handleTarget(target: Target) {
  if (isSSHTarget(target)) {
    console.log('SSH host:', target.host);
  }
}

try {
  await $`command`;
} catch (error) {
  if (isExecutionError(error)) {
    console.log('Exit code:', error.exitCode);
  }
}
```

## Related Documentation

- [API Index](./index.md) - API overview
- [Execution Engine](./execution-engine.md) - Engine types
- [Process Promise](./process-promise.md) - Promise types
- [Configuration](../configuration/overview.md) - Config structure