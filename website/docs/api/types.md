---
title: Type Definitions
description: TypeScript type definitions for Xec core library
keywords: [types, typescript, interfaces, definitions]
source_files:
  - packages/core/src/types/command.ts
  - packages/core/src/types/result.ts
  - packages/core/src/types/process.ts
  - packages/core/src/types/execution.ts
  - packages/core/src/types/events.ts
  - packages/core/src/core/failure-kind.ts
verification_date: 2026-08-04
---

# Type Definitions

## Implementation Reference

**Source Files:**
- `packages/core/src/types/command.ts` - `Command` and adapter option types
- `packages/core/src/types/result.ts` - `ExecutionResult`
- `packages/core/src/types/process.ts` - `ProcessPromise`, `ProcessHandle`
- `packages/core/src/types/execution.ts` - `ExecutionEngineConfig`
- `packages/core/src/types/events.ts` - Event types
- `packages/core/src/core/failure-kind.ts` - `FailureKind`

There is no generic `Target` base type, and no `SSHTarget`/`DockerTarget`/`KubernetesTarget`/`LocalTarget`
hierarchy — those names do not appear anywhere in `@xec-sh/core`. Each
adapter has its own options type instead, distinguished by a `type` literal.

## Core Types

### Adapter Option Types

#### SSHAdapterOptions

```typescript
interface SSHAdapterOptions {
  type: 'ssh';
  host: string;
  username: string;         // not `user`
  port?: number;
  privateKey?: string | Buffer;
  passphrase?: string;
  password?: string;
  hostKeyChecking?: 'accept-new' | 'strict' | 'off'; // default: 'accept-new'
  knownHostsPath?: string;
  sudo?: {
    enabled: boolean;
    password?: string;
    user?: string;
    passwordMethod?: 'stdin' | 'askpass' | 'echo' | 'secure';
    secureHandler?: SecurePasswordHandler;
  };
}
```

#### DockerAdapterOptions

```typescript
interface DockerAdapterOptions {
  type: 'docker';
  container: string;
  user?: string;
  workdir?: string;          // not `workingDir`
  tty?: boolean;
  runMode?: 'exec' | 'run';
  image?: string;
  volumes?: string[];
  autoRemove?: boolean;
}
```

#### KubernetesAdapterOptions

```typescript
interface KubernetesAdapterOptions {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  execFlags?: string[];
  tty?: boolean;
  stdin?: boolean;
  context?: string;      // which cluster — defaults to the ambient kubeconfig context otherwise
  kubeconfig?: string;
}
```

#### LocalAdapterOptions

```typescript
interface LocalAdapterOptions {
  type: 'local';
}
```

These four are combined as `AdapterSpecificOptions` internally (not itself
exported by name) and set on a `Command` via `adapter`/`adapterOptions` —
though in practice you reach them through `$.ssh(...)`, `$.docker(...)`,
`$.k8s(...)`, `$.local()` rather than building a `Command` by hand.

### Execution Types

#### Command

The full shape accepted by `$.execute()` and built internally by every
other execution method.

```typescript
interface Command {
  command: string;
  args?: string[];

  cwd?: string;
  env?: Record<string, string>;
  timeout?: number | string;      // ms, or a duration string like '30s'
  timeoutSignal?: string;
  maxBuffer?: number;             // cap on captured output, in bytes
  throwOnNonZeroExit?: boolean;   // `.nothrow()` sets this to false

  stdin?: string | Buffer | Readable;
  stdout?: StreamOption;          // 'pipe' | 'ignore' | 'inherit' | Writable
  stderr?: StreamOption;

  shell?: string | boolean;
  detached?: boolean;
  signal?: AbortSignal;
  nothrow?: boolean;

  onSpawn?: (handle: ProcessHandle) => void;
  callSite?: { stack?: string } | null;

  retry?: RetryOptions;
  progress?: {
    enabled?: boolean;
    onProgress?: (event: any) => void;
    updateInterval?: number;
    reportLines?: boolean;
  };

  adapter?: AdapterType;  // 'local' | 'ssh' | 'docker' | 'kubernetes' | 'auto' | 'mock'
  adapterOptions?: SSHAdapterOptions | DockerAdapterOptions | KubernetesAdapterOptions | LocalAdapterOptions;
}
```

There is no `ExecutionOptions` type, and no `uid`/`gid`/`windowsHide`/`killSignal`
fields.

#### ExecutionResult

What an awaited `ProcessPromise` (or `execute()`) resolves to:

```typescript
interface ExecutionResult {
  stdout: string;
  stderr: string;
  stdall: string;         // stdout and stderr merged in arrival order
  exitCode: number;
  signal?: string;
  ok: boolean;            // exitCode === 0 && !signal
  cause?: string;          // set when !ok

  command: string;
  duration: number;
  startedAt: Date;
  finishedAt: Date;

  adapter: string;
  host?: string;           // set for SSH
  container?: string;      // set for Docker/Kubernetes

  toMetadata(): object;
  throwIfFailed(): void;
  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;        // exact original bytes — binary-safe
}
```

There is no `target`/`options` field on the real interface.

#### ProcessOutput

A `ProcessOutput` class exists in the package's source
(`packages/core/src/core/process-output.ts`), but it is dead code — nothing
in the implementation constructs one, and it is not exported. `ExecutionResult`
is what a command actually resolves to; there is no `ProcessOutput` type to
import.

### Error Types

There is no `XecError`, `ValidationError` or `ConfigurationError` — those
names don't exist. Every real error extends `ExecutionError` directly:

```typescript
class ExecutionError extends Error {
  readonly kind: FailureKind;
  readonly code: string;
  readonly details?: Record<string, any>;
  get recoverable(): boolean;
}
```

```typescript
type FailureKind =
  | 'command-failed'       // ran to completion, exited non-zero
  | 'timeout'
  | 'connection-lost'      // recoverable
  | 'connection-refused'   // recoverable
  | 'authentication'
  | 'not-found'
  | 'permission-denied'
  | 'invalid-usage'
  | 'host-key-mismatch'    // never retry — the peer may be an impostor
  | 'unknown';

function classifyFailure(error: unknown): FailureKind;
function isRecoverable(kind: FailureKind): boolean; // true only for connection-lost / connection-refused
```

The concrete subclasses, and the fields each actually adds:

```typescript
class CommandError extends ExecutionError {
  readonly command: string;
  readonly exitCode: number;
  readonly signal: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly duration: number;
  readonly callSite: string; // where the caller wrote the command, if captured
}

class ConnectionError extends ExecutionError {
  readonly host: string;
  readonly originalError: Error;
}

class TimeoutError extends ExecutionError {
  readonly command: string;
  readonly timeout: number;
}

class MaxBufferExceededError extends ExecutionError {
  readonly limit: number;
  readonly stream: 'stdout' | 'stderr';
  partialStdout: string;   // output collected before the cap was hit
  partialStderr: string;
}

class RetryError extends Error {
  readonly attempts: number;
  readonly lastResult: ExecutionResult;
  readonly results: ExecutionResult[];
}

class AdapterError extends ExecutionError {
  readonly adapter: string;
  readonly operation: string;
  readonly originalError?: Error;
}

class DockerError extends ExecutionError {
  readonly container: string;
  readonly operation: string;
  readonly originalError: Error;
}

class KubernetesError extends ExecutionError {
  readonly pod: string;
  readonly namespace?: string;
  readonly container?: string;
}
```

One adapter inconsistency worth knowing: a `.timeout()` that fires throws a
genuine `TimeoutError` on the Docker, Kubernetes and SSH adapters (their
source explicitly re-throws it unwrapped), but on the local adapter it
currently surfaces as `AdapterError` with the same message instead — verified
by triggering it directly. `error.kind === 'timeout'` is the one check that
works the same way on every adapter; `instanceof TimeoutError` is not
reliable across all of them.

`explainExitCode(exitCode: number): string` is the real, exported function
for turning a bare exit code into a short explanation — there is no
`ExitCode` enum:

```typescript
explainExitCode(2);   // 'misuse of shell builtins'
explainExitCode(126); // 'command found but not executable'
explainExitCode(127); // 'command not found'
explainExitCode(137); // 'killed — SIGKILL, commonly an out-of-memory kill'
explainExitCode(143); // 'terminated — SIGTERM, commonly an orchestrator stopping the process'
explainExitCode(0);   // '' — nothing worth explaining
```

Signals are plain `NodeJS.Signals` strings throughout (`kill(signal?: NodeJS.Signals)`,
`ExecutionResult.signal?: string`) — there is no custom `Signal` enum.

### Event Types

Every engine (and the SSH/K8s/Docker contexts, since they delegate to one)
is a `TypedEventEmitter<UshEventMap>`: `.on(event, listener)`, `.once(...)`,
`.off(...)`, `.emit(...)`. There is no generic `ExecutionEvent`/`ConnectionEvent`
pair — each event has its own named, specific shape. All events share a base:

```typescript
interface BaseUshEvent {
  timestamp: Date;
  adapter: string;
}
```

A few representative event shapes:

```typescript
interface CommandStartEvent extends BaseUshEvent {
  command: string;      // redacted — secrets are masked before this is emitted
  args?: string[];
  cwd?: string;
  shell?: boolean;
  envKeys?: string[];   // names only, never values
}

interface CommandCompleteEvent extends BaseUshEvent {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  duration: number;
}

interface CommandErrorEvent extends BaseUshEvent {
  command: string;
  error: string;
  duration: number;
}
```

The full set of exported event types: `UshEvent`, `UshEventMap`, `UshEventType`,
`BaseUshEvent`, `CommandStartEvent`, `CommandCompleteEvent`, `CommandErrorEvent`,
`CommandRetryEvent`, `RetryAttemptEvent`, `RetrySuccessEvent`, `RetryFailedEvent`,
`ConnectionOpenEvent`, `ConnectionCloseEvent`, `SSHConnectEvent`, `SSHDisconnectEvent`,
`SSHReconnectEvent`, `SSHExecuteEvent`, `SSHPoolMetricsEvent`, `DockerRunEvent`,
`DockerExecEvent`, `K8sExecEvent`, `TransferStartEvent`, `TransferCompleteEvent`,
`TransferErrorEvent`, `TypedEventEmitter`.

## Type Guards

Only two guard functions are exported, and neither is about targets or
errors specifically:

```typescript
function isRecoverable(kind: FailureKind): boolean;
function isDisposable(value: unknown): value is Disposable;
```

There is no `isSSHTarget`, `isDockerTarget`, `isKubernetesTarget`, `isLocalTarget`,
`isExecutionError`, `isTimeoutError` or `isConnectionError`. For adapter
options, check the `type` field directly (`options.type === 'ssh'`). For
errors, `instanceof` already does the job a guard would — `error instanceof CommandError`,
`error instanceof ExecutionError`, etc. — since these are real classes, not
structural types.

## The Result Pattern

There is no generic `Result<T, E>` / `AsyncResult<T, E>` union type, and no
`isOk`/`isErr` — those names don't exist in `@xec-sh/core`. The project's
actual "Result pattern" is `ExecutionResult` itself, reached with
`.nothrow()`:

```typescript
const result = await $`command`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed:', result.stderr, result.cause);
}
```

For anything outside a single command, the codebase uses ordinary throw/catch
with the typed `ExecutionError` hierarchy above, not a wrapped `Result` value.

## Related Documentation

- [API Index](./index.md) - API overview
- [Execution Engine](./execution-engine.md) - Engine types
- [Process Promise](./process-promise.md) - Promise types
- [Configuration](../configuration/overview.md) - Configuration structure (`@xec-sh/ops`/CLI-level task and target config lives here, not in `@xec-sh/core`)
