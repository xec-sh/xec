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
verification_date: 2026-11-14
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

`Target` describes a destination using the `kind` discriminator. Adapter
options describe the execution configuration and use `type`. Parse a target
before mapping it to the corresponding execution context.

```typescript
import { parseTarget, formatTarget, type Target } from '@xec-sh/core';

const parsed = parseTarget('ssh://deploy@server.example.com:2222');
if (parsed.ok === true) {
  const target: Target = parsed.target;
  console.log(formatTarget(target));
  if (target.kind === 'ssh') console.log(target.host, target.user, target.port);
} else {
  console.error(parsed.reason);
}
```

## Core Types

### Adapter Option Types

#### SSHAdapterOptions

```typescript
import type { SSHAdapterOptions } from '@xec-sh/core';

const target = {
  type: 'ssh', host: 'server.example.com', username: 'deploy', port: 2222,
  privateKey: '/home/deploy/.ssh/id_ed25519',
  hostKeyChecking: 'strict', knownHostsPath: '/home/deploy/.ssh/known_hosts',
} satisfies SSHAdapterOptions;
```

#### DockerAdapterOptions

```typescript
import type { DockerAdapterOptions } from '@xec-sh/core';

const target = {
  type: 'docker', container: 'api', user: 'node', workdir: '/app',
} satisfies DockerAdapterOptions;
```

#### KubernetesAdapterOptions

```typescript
import type { KubernetesAdapterOptions } from '@xec-sh/core';

const target = {
  type: 'kubernetes', pod: 'api-pod', container: 'main',
  namespace: 'staging', context: 'staging-cluster',
  kubeconfig: '/home/deploy/.kube/config',
} satisfies KubernetesAdapterOptions;
```

#### LocalAdapterOptions

```typescript
import type { Command } from '@xec-sh/core';

type LocalAdapterOptions = Extract<NonNullable<Command['adapterOptions']>, { type: 'local' }>;
const target: LocalAdapterOptions = { type: 'local' };
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
import { $, type Command } from '@xec-sh/core';

const command = {
  command: process.execPath,
  args: ['-e', 'process.stdout.write(process.env.NODE_ENV ?? "unset")'],
  shell: false,
  env: { NODE_ENV: 'test' },
  timeout: '10s',
  maxBuffer: 1024 * 1024,
  stdout: 'pipe',
  stderr: 'pipe',
  adapter: 'local',
  adapterOptions: { type: 'local' },
  onSpawn: handle => console.log('Started', handle.pid),
} satisfies Command;

console.log((await $.execute(command)).stdout);
```

`Command` also carries `stdin`, `cwd`, `signal`, `timeoutSignal`, `retry` and
`progress`. Derive option subsets with `Pick<Command, ...>` to keep consumer
configuration checked against the public contract.

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

Execution metadata names the selected adapter and, where available, the
remote host or container. `stdall` preserves the order observed by the
parent across stdout and stderr. `buffer()` returns captured original bytes.

#### ProcessOutput

Use the public `ExecutionResult` type for completed command output. The
convenience methods on `ProcessPromise` derive text, JSON and lines from it.

### Error Types

`ExecutionError` carries the classified failure kind, error code and details.
Execution and adapter errors derive from it. `RetryError` extends `Error` and
adds the results of its attempted commands.

```typescript
import type { ExecutionError } from '@xec-sh/core';

type FailureDetails = Pick<ExecutionError, 'kind' | 'code' | 'details' | 'recoverable'>;
```

```typescript
import type { FailureKind } from '@xec-sh/core';

const guidance = {
  'command-failed': 'Inspect the exit code and command output',
  'outcome-unknown': 'Verify the remote effect before considering another attempt',
  timeout: 'Inspect termination and the operation deadline',
  'connection-lost': 'Restore transport and reconcile any possible effect',
  'connection-refused': 'Check that the target is reachable and accepting connections',
  authentication: 'Correct the credentials',
  'not-found': 'Check the resource identity',
  'permission-denied': 'Check the required permission',
  'invalid-usage': 'Correct the command or configuration',
  'host-key-mismatch': 'Verify the peer identity',
  unknown: 'Inspect the original cause',
} satisfies Record<FailureKind, string>;
```

The concrete subclasses, and the fields each actually adds:

```typescript
import type {
  CommandError, ConnectionError, TimeoutError, MaxBufferExceededError,
  RetryError, AdapterError, DockerError, KubernetesError,
  ExecutionOutcomeUnknownError,
} from '@xec-sh/core';

type CommandFailure = Pick<CommandError,
  'command' | 'exitCode' | 'signal' | 'stdout' | 'stderr' | 'duration' | 'callSite'>;
type ConnectionFailure = Pick<ConnectionError, 'host' | 'originalError'>;
type DeadlineFailure = Pick<TimeoutError, 'command' | 'timeout'>;
type OutputLimitFailure = Pick<MaxBufferExceededError, 'limit' | 'stream' | 'partialStdout' | 'partialStderr'>;
type RetryFailure = Pick<RetryError, 'attempts' | 'lastResult' | 'results'>;
type AdapterFailure = Pick<AdapterError, 'adapter' | 'operation' | 'originalError'>;
type DockerFailure = Pick<DockerError, 'container' | 'operation' | 'originalError'>;
type PodFailure = Pick<KubernetesError, 'pod' | 'namespace' | 'container'>;
type UncertainExecution = Pick<ExecutionOutcomeUnknownError, 'kind' | 'originalError'>;
```

`ExecutionError.kind` identifies the cause across adapters. The Node local
adapter preserves `TimeoutError`. A transport classified as recoverable can
be re-established. Inspect a possibly completed effect before replaying it.
`ExecutionOutcomeUnknownError` explicitly records that uncertainty.

`explainExitCode(exitCode: number): string` is the real, exported function
for turning a bare exit code into a short explanation — there is no
`ExitCode` enum:

```typescript
import { explainExitCode } from '@xec-sh/core';

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
import { ExecutionEngine, type CommandStartEvent, type CommandCompleteEvent } from '@xec-sh/core';

const engine = new ExecutionEngine();
engine.on('command:start', (event: CommandStartEvent) => {
  console.log(event.adapter, event.command, event.envKeys);
});
engine.on('command:complete', (event: CommandCompleteEvent) => {
  console.log(event.exitCode, event.duration);
});
await engine.run`node --version`;
await engine.dispose();
```

The full set of exported event types: `UshEvent`, `UshEventMap`, `UshEventType`,
`BaseUshEvent`, `CommandStartEvent`, `CommandCompleteEvent`, `CommandErrorEvent`,
`CommandRetryEvent`, `RetryAttemptEvent`, `RetrySuccessEvent`, `RetryFailedEvent`,
`ConnectionOpenEvent`, `ConnectionCloseEvent`, `SSHConnectEvent`, `SSHDisconnectEvent`,
`SSHReconnectEvent`, `SSHExecuteEvent`, `SSHPoolMetricsEvent`, `DockerRunEvent`,
`DockerExecEvent`, `K8sExecEvent`, `TransferStartEvent`, `TransferCompleteEvent`,
`TransferErrorEvent`, `TypedEventEmitter`.

## Type Guards

Use the public predicates for resource disposal and transport classification.

```typescript
import { ExecutionEngine, classifyFailure, isRecoverable, isDisposable } from '@xec-sh/core';

const engine = new ExecutionEngine();
console.log(isRecoverable(classifyFailure({ code: 'ECONNREFUSED' })));
if (isDisposable(engine)) await engine.dispose();
```

Narrow adapter options with their `type` discriminator and parsed targets
with `kind`. Use `instanceof` for public error classes and `classifyFailure()`
when the thrown value may come from another library.

## The Result Pattern

`.nothrow()` returns an `ExecutionResult` for a completed nonzero command.
Inspect its `ok`, `exitCode`, `stderr` and `cause` fields.

```typescript
import { $ } from '@xec-sh/core';

const result = await $`command`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed:', result.stderr, result.cause);
}
```

Transport, authentication and infrastructure failures may still reject.
Handle them with the typed error hierarchy and preserve uncertain outcomes.

## Related Documentation

- [API Index](./index.md) - API overview
- [Execution Engine](./execution-engine.md) - Engine types
- [Process Promise](./process-promise.md) - Promise types
- [Configuration](../configuration/overview.md) - Configuration structure (`@xec-sh/ops`/CLI-level task and target config lives here, not in `@xec-sh/core`)
