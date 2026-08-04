---
title: Execution Engine API
description: Core execution engine API reference
keywords: [execution, engine, api, core, adapters]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/core/src/core/process-context.ts
  - packages/core/src/adapters/base-adapter.ts
key_functions:
  - ExecutionEngine.constructor()
  - ExecutionEngine.execute()
  - ExecutionEngine.ssh()
  - ExecutionEngine.docker()
  - ExecutionEngine.k8s()
verification_date: 2026-08-04
---

# Execution Engine API

## Implementation Reference

**Source Files:**
- `packages/core/src/core/execution-engine.ts` - Main engine implementation
- `packages/core/src/core/process-context.ts` - ProcessPromise construction and state
- `packages/core/src/adapters/base-adapter.ts` - Base adapter interface (internal — not exported)

## Class: ExecutionEngine

The main execution engine that provides universal command execution across different environments. `import { $ } from '@xec-sh/core'` is a preconfigured instance wrapped so it's callable as a tagged template; `new ExecutionEngine(config)` builds one directly.

### Constructor

```typescript
class ExecutionEngine {
  constructor(config?: ExecutionEngineConfig, existingAdapters?: Map<string, BaseAdapter>)
}

interface ExecutionEngineConfig {
  defaultAdapter?: string;
  throwOnNonZeroExit?: boolean;

  env?: Record<string, string>;
  defaultEnv?: Record<string, string>;

  cwd?: string;
  defaultCwd?: string;

  shell?: string | boolean;
  defaultShell?: string | boolean;

  // Milliseconds, or a duration string such as '30s'
  timeout?: number | string;
  defaultTimeout?: number | string;

  encoding?: BufferEncoding;
  verbose?: boolean;
  quiet?: boolean;

  // Records where each command was written, so a failure names the line.
  // Costs ~1.4µs per command. Defaults to true.
  captureCallSite?: boolean;

  prefix?: string;   // e.g. 'set -euo pipefail;'
  postfix?: string;  // e.g. '; exit $?'

  preferLocal?: boolean | string; // prepend node_modules/.bin to PATH

  retry?: { retries?: number; delay?: number; factor?: number };

  maxBuffer?: number; // cap on captured output, in bytes

  // Per-adapter config, e.g. adapters.ssh.connectionPool — see "Connection
  // Pooling" below.
  adapters?: {
    ssh?: SSHAdapterConfig;
    docker?: DockerAdapterConfig;
    kubernetes?: KubernetesAdapterConfig;
    local?: LocalAdapterConfig;
  };
}
```

The second constructor argument lets a derived engine reuse an existing map
of adapters (and their live connection pools) instead of creating fresh
ones — this is how `.with()`, `.cd()`, `.env()` and friends stay cheap and
keep SSH connections alive across a chain.

### Methods

#### execute()

Run a fully-specified `Command` object directly — the lowest-level entry
point, and the one every other execution method eventually calls.

```typescript
execute(command: Command): Promise<ExecutionResult>
```

**Parameters:**
- `command` - A `Command` object (see [Types](./types.md)). At minimum needs `command: string`.

**Returns:** `Promise<ExecutionResult>` — a plain promise, not a `ProcessPromise`. There is no `.nothrow()`/`.pipe()`/`.timeout()` chain here; those belong to the tagged-template and `.exec()` forms below.

**Example:**
```typescript
const engine = new ExecutionEngine();
const result = await engine.execute({ command: 'ls -la' });
console.log(result.stdout);
```

Passing a bare string instead of a `Command` object does not work — the
adapter reads `command.command`, which is `undefined` for a string, and the
call fails. For a command you already have as a string, use `$.exec(command,
options)` instead, which returns a full `ProcessPromise`:

```typescript
const result = await $.exec('ls -la').nothrow();
```

#### ssh()

Target an SSH host. Returns an `SSHExecutionContext`, not a bare
`ExecutionEngine` — in addition to the full engine surface below, it carries
SSH-only members (`.tunnel()`, `.reverseTunnel()`, `.uploadFile()`,
`.downloadFile()`, `.uploadDirectory()`).

```typescript
ssh(target: string | Omit<SSHAdapterOptions, 'type'>): SSHExecutionContext
```

**Parameters:**
- `target` - `[user@]host[:port]` shorthand, or an options object (note the field is `username`, not `user`)

**Returns:** `SSHExecutionContext`

**Example:**
```typescript
const sshEngine = engine.ssh('deploy@server.example.com');
await sshEngine`uptime`;

// With detailed target
const sshEngine2 = engine.ssh({
  host: 'server.example.com',
  username: 'deploy',
  port: 2222,
  privateKey: '/path/to/key'
});
```

#### docker()

Target a Docker container, or build one with the fluent API.

```typescript
docker(container: string): ExecutionEngine;
docker(options: Omit<DockerAdapterOptions, 'type'>): ExecutionEngine;
docker(): DockerFluentAPI;
```

**Parameters:**
- `container` - Container name/ID, or an options object. Omit entirely for the fluent API (`.compose()`, `.network()`, `.volume()`, `.swarm()`, `.pull()`, `.ps()`, …).

**Returns:** `ExecutionEngine` when a container is specified; `DockerFluentAPI` when called with no arguments.

**Example:**
```typescript
const dockerEngine = engine.docker('my-app');
await dockerEngine`npm test`;

// With detailed target (field is `workdir`, not `workingDir`)
const dockerEngine2 = engine.docker({
  container: 'my-app',
  user: 'node',
  workdir: '/app'
});
```

#### k8s()

Target a Kubernetes pod, or build one with `.pod(name)`. There is no
`kubernetes()` alias — `k8s()` is the only spelling.

```typescript
k8s(target?: string | Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext
```

**Parameters:**
- `target` - `[namespace/]pod[:container]` shorthand, an options object, or omitted to build the target fluently via `.pod(name)`

**Returns:** `K8sExecutionContext`

**Example:**
```typescript
const k8sEngine = engine.k8s('app-pod');
await k8sEngine`ls /app`;

// With detailed target
const k8sEngine2 = engine.k8s({
  pod: 'app-pod',
  container: 'main',
  namespace: 'production',
  context: 'prod-cluster'
});

// Or reach a pod's extras (portForward, logs, copyTo/copyFrom) explicitly:
const pod = engine.k8s({ namespace: 'production' }).pod('app-pod');
```

#### local()

Create a local execution context.

```typescript
local(): ExecutionEngine
```

**Returns:** `ExecutionEngine` - New engine with local context

**Example:**
```typescript
const localEngine = engine.local();
await localEngine`npm install`;
```

#### cd()

Derive an engine with a new working directory. Resolves `~` and relative
paths against the current one; does not mutate `engine`.

```typescript
cd(path: string): ExecutionEngine
```

**Parameters:**
- `path` - Directory path, absolute, relative, or `~`-prefixed

**Returns:** `ExecutionEngine` - New engine with the resolved working directory

**Example:**
```typescript
await engine.cd('/project')`npm run build`;
```

#### env()

Set environment variables.

```typescript
env(variables: Record<string, string>): ExecutionEngine
```

**Parameters:**
- `variables` - Environment variables object

**Returns:** `ExecutionEngine` - Engine with environment variables

**Example:**
```typescript
await engine
  .env({ NODE_ENV: 'production' })`npm start`;
```

#### timeout()

Set execution timeout.

```typescript
timeout(duration: number | string): ExecutionEngine
```

**Parameters:**
- `duration` - Milliseconds, or a duration string such as `'30s'`, `'5m'`

**Returns:** `ExecutionEngine` - Engine with timeout

**Example:**
```typescript
await engine
  .timeout('60s')`long-running-task`;
```

#### parallel

Run multiple commands with a concurrency cap. This is a **property**, not a
callable method — `engine.parallel(...)` throws; call one of its methods
instead.

```typescript
readonly parallel: ParallelEngine

class ParallelEngine {
  all(commands: Array<string | Command | ProcessPromise>, options?: ParallelOptions): Promise<ExecutionResult[]>;    // throws on first failure
  settled(commands: Array<string | Command | ProcessPromise>, options?: ParallelOptions): Promise<ParallelResult>;   // never throws
  race(commands: Array<string | Command | ProcessPromise>): Promise<ExecutionResult>;
  map<T>(items: T[], fn: (item: T, index: number) => string | Command | ProcessPromise, options?: ParallelOptions): Promise<ParallelResult>;
  filter<T>(items: T[], fn: (item: T, index: number) => string | Command | ProcessPromise, options?: ParallelOptions): Promise<T[]>;
  some(commands: Array<string | Command | ProcessPromise>, options?: ParallelOptions): Promise<boolean>;
  every(commands: Array<string | Command | ProcessPromise>, options?: ParallelOptions): Promise<boolean>;
}
```

`ParallelOptions.maxConcurrent` caps how many run at once (unset means
unlimited). `ParallelResult` sorts commands into `succeeded` and `failed` by
exit code — a `.nothrow()`'d command that exited non-zero lands in `failed`
holding an `ExecutionResult`, not thrown.

**Example:**
```typescript
const { succeeded, failed } = await engine.parallel.settled(
  ['npm test', 'npm run lint', 'npm run type-check'],
  { maxConcurrent: 2 }
);
```

For the common case of running a batch of commands against the default `$`
engine, the standalone `parallel()` export is shorter:

```typescript
import { $, parallel } from '@xec-sh/core';

const results = await parallel(['npm test', 'npm run lint'], { maxConcurrent: 2 });
```

## ProcessPromise API

The chainable, lazy promise returned by `` $`cmd` `` and `.exec()`. Nothing
runs until it is awaited, iterated, or one of `.start()`/`.spawned`/`.child`/`.pid`
is read.

### Properties

```typescript
interface ProcessPromise extends Promise<ExecutionResult> {
  readonly stdin: NodeJS.WritableStream;  // writable immediately; buffered until the process exists
  readonly pid?: number;                  // reading this starts the command
  readonly spawned: Promise<ProcessHandle>; // resolves once actually running
  readonly child?: ProcessHandle;         // reading this starts the command
  exitCode: Promise<number | null>;       // null if the process was signalled
}
```

`stdout`/`stderr` are **not** properties here — they're configurator methods
(`.stdout(stream)`, see below) that set where output goes. To read the live
streams of a running command, use `.child.stdout` / `.child.stderr`, or
await `.spawned` first.

### Methods

#### pipe()

Pipe the command's output somewhere else — another command, a stream, or a
function.

```typescript
pipe(target: PipeTarget, ...args: unknown[]): ProcessPromise
```

`PipeTarget` accepts a template literal, a command string, a `Command`
object, another `ProcessPromise`, a `Transform` or `Writable` stream, a
line-processor function `(line: string) => void`, or a conditional function
`(result: ExecutionResult) => Command | string | null`.

**Example:**
```typescript
await $`cat file.txt`.pipe($`grep pattern`);
await $`cat file.txt`.pipe(fs.createWriteStream('out.txt'));
```

#### nothrow()

Don't throw on non-zero exit code.

```typescript
nothrow(): ProcessPromise
```

**Example:**
```typescript
const result = await $`test -f file.txt`.nothrow();
if (!result.ok) {
  console.log('File does not exist');
}
```

#### quiet()

Suppress output.

```typescript
quiet(): ProcessPromise
```

**Example:**
```typescript
await $`npm install`.quiet();
```

#### timeout()

Fail the command after a duration.

```typescript
timeout(duration: number | string, timeoutSignal?: string): ProcessPromise
```

**Example:**
```typescript
await $`slow-command`.timeout('5s');
```

#### signal()

Attach an `AbortSignal`. Aborting kills the process; the awaited call
rejects with a `CommandError` (signalled exit), not a generic `AbortError`.

```typescript
signal(signal: AbortSignal): ProcessPromise
```

**Example:**
```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  await $`long-task`.signal(controller.signal);
} catch (error) {
  if (error instanceof CommandError && error.signal) {
    console.log('Operation cancelled:', error.signal);
  }
}
```

#### cwd()

Set working directory for this execution.

```typescript
cwd(path: string): ProcessPromise
```

**Example:**
```typescript
await $`npm build`.cwd('/project');
```

#### env()

Set environment variables for this execution.

```typescript
env(variables: Record<string, string>): ProcessPromise
```

**Example:**
```typescript
await $`npm start`.env({ PORT: '3000' });
```

#### start()

Begin execution without awaiting. Useful when you need `.child`/`.spawned`/`.pid`
before the command finishes.

```typescript
start(): ProcessPromise
```

**Example:**
```typescript
const p = $`long-server-process`.start();
const handle = await p.spawned;
console.log('pid:', handle.pid);
```

#### cache()

Cache the result of this single command. Keyed by command + cwd + env +
target, so the same command against different hosts or containers never
collides.

```typescript
cache(options?: { key?: string; ttl?: number; invalidateOn?: string[] }): ProcessPromise
```

**Example:**
```typescript
const result = await $`curl https://api.example.com/data`.cache({ ttl: 5000 });
```

#### kill()

Terminate the process, and everything it spawned (the whole process tree,
not just the immediate child).

```typescript
kill(signal?: NodeJS.Signals): void
```

#### stdin

Not a method — a writable stream property. Writes are buffered and
forwarded once the process spawns, so there's no need to `.start()` first.

```typescript
readonly stdin: NodeJS.WritableStream
```

**Example:**
```typescript
const p = $`cat`;
p.stdin.write('Hello, World!\n');
p.stdin.end();
const result = await p;
```

#### lines()

Get output as array of lines.

```typescript
lines(): Promise<string[]>
```

**Example:**
```typescript
const lines = await $`ls -la`.lines();
lines.forEach(line => console.log(line));
```

#### json()

Parse trimmed output as JSON.

```typescript
json<T = any>(): Promise<T>
```

**Example:**
```typescript
const data = await $`cat package.json`.json();
console.log(data.name, data.version);
```

#### text()

Get trimmed output as a string.

```typescript
text(): Promise<string>
```

**Example:**
```typescript
const content = await $`cat README.md`.text();
```

#### buffer()

Get output as a `Buffer`. Called this way — directly on the un-awaited
`ProcessPromise` — it re-encodes the already-decoded `stdout` string, so it
is **not** safe for binary output. For the exact bytes a command wrote, call
`.buffer()` on the awaited `ExecutionResult` instead:

```typescript
buffer(): Promise<Buffer>
```

**Example:**
```typescript
const lossyBuffer = await $`cat image.png`.buffer();       // not binary-safe
const exactBuffer = (await $`cat image.png`).buffer();     // binary-safe
```

### Async iteration

A `ProcessPromise` is async-iterable, streaming lines as they arrive rather
than waiting for the command to finish — the right tool for a follow-style
command:

```typescript
for await (const line of $`tail -f /var/log/app.log`) {
  console.log('Line:', line);
}
```

## Execution Result

The result object an awaited `ProcessPromise` (or `execute()`) resolves to.

```typescript
interface ExecutionResult {
  stdout: string;
  stderr: string;
  stdall: string;      // stdout and stderr merged in arrival order
  exitCode: number;
  signal?: string;
  ok: boolean;         // exitCode === 0 && !signal
  cause?: string;       // set when !ok: 'signal: X' or 'exitCode: N'
  command: string;
  duration: number;
  startedAt: Date;
  finishedAt: Date;
  adapter: string;
  host?: string;        // set for SSH
  container?: string;   // set for Docker/Kubernetes

  toMetadata(): object;
  throwIfFailed(): void;
  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;     // exact original bytes — binary-safe
}
```

## Error Handling

### ExecutionError and CommandError

`ExecutionError` is the base class every error in `@xec-sh/core` extends. It
carries a stable `kind: FailureKind` and a `recoverable` getter, for
branching on *why* something failed rather than on message text.

```typescript
class ExecutionError extends Error {
  readonly kind: FailureKind;
  readonly code: string;
  readonly details?: Record<string, any>;
  get recoverable(): boolean;
}
```

`CommandError` is the one actually thrown when a command exits non-zero — it
extends `ExecutionError` and adds the fields most callers reach for:

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
```

**Example:**
```typescript
try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}
```

See [Types](./types.md) for the full `FailureKind` list and the other error
classes (`TimeoutError`, `MaxBufferExceededError`, `RetryError`,
`AdapterError`, `ConnectionError`, `DockerError`, `KubernetesError`).

## Advanced Features

### Connection Pooling

SSH connections are pooled per adapter and reused automatically — there is
no separate pool object to manage day-to-day. To tune the pool, configure
the SSH adapter directly:

```typescript
const engine = new ExecutionEngine({
  adapters: {
    ssh: {
      connectionPool: {
        enabled: true,
        maxConnections: 10,
        idleTimeout: 300000,     // 5 minutes
        keepAlive: true,
        autoReconnect: true
      }
    }
  }
});

// Connections are reused automatically
for (let i = 0; i < 100; i++) {
  await engine.ssh('server')`echo test`;
}
```

### Stream Processing

Process output as it arrives, via the async iterator — not `.lines()`,
which waits for the command to finish and returns an array:

```typescript
for await (const line of $`tail -f /var/log/app.log`) {
  console.log('Log:', line);
}
```

For lower-level access to the live streams, use `.child` once the command
has started:

```typescript
const p = $`tail -f /var/log/app.log`.start();
const handle = await p.spawned;
handle.stdout?.on('data', chunk => console.log('Log:', chunk.toString()));
```

### Abort Signal

Cancel long-running operations. The command dies from the resulting signal,
so the rejection is a `CommandError`, not a plain `AbortError`:

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await $`long-task`.signal(controller.signal);
} catch (error) {
  if (error instanceof CommandError && error.signal) {
    console.log('Operation cancelled:', error.signal);
  }
}
```

## Performance Characteristics

Measured on the built `dist`, not estimated (see the project's `CLAUDE.md`
for the full breakdown and methodology):

- **Command creation**: ~6µs
- **Simple execution**: `<5ms` overhead over the process spawn itself
- **Pipe setup**: ~12µs
- **SSH connection**: `<100ms`; `<10ms` when pooled
- **Docker exec**: `<50ms`
- **Memory overhead**: `<5MB` per command
- **Startup (`xec --help`)**: ~150ms, against a ~20ms floor for an empty `node -e ""` on the same machine

## Related Documentation

- [Process Promise](./process-promise.md) - Detailed ProcessPromise API
- [Types](./types.md) - TypeScript type definitions
- [Configuration](../configuration/overview.md) - Configuration system
- [Commands](../commands/overview.md) - Command reference
- [Examples](../scripting/basics/command-execution.md) - Usage examples
