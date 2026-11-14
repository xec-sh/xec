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
verification_date: 2026-11-14
---

# Execution Engine API {#execution-engine-api}

## Implementation Reference {#implementation-reference}

**Source Files:**
- `packages/core/src/core/execution-engine.ts` - Main engine implementation
- `packages/core/src/core/process-context.ts` - ProcessPromise construction and state
- `packages/core/src/adapters/base-adapter.ts` - Base adapter interface (internal — not exported)

## Class: ExecutionEngine {#class-executionengine}

The execution engine runs commands through local, SSH, Docker and Kubernetes adapters. `$` is a callable engine. `new ExecutionEngine(config)` provides `.run` as a template tag and `.execute()` for command objects. `createCallableEngine()` exposes the same instance as a callable tag.

### Constructor {#constructor}

```typescript
import { createCallableEngine, ExecutionEngine, type ExecutionEngineConfig } from '@xec-sh/core';

const config = {
  defaultCwd: process.cwd(),
  defaultTimeout: '30s',
  defaultEnv: { NODE_ENV: 'development' },
  captureCallSite: true,
  maxBuffer: 4 * 1024 * 1024,
} satisfies ExecutionEngineConfig;

const engine = createCallableEngine(new ExecutionEngine(config));
try {
  console.log(await engine`node --version`.text());
} finally {
  await engine.dispose();
}
```

The second constructor argument lets a derived engine reuse an existing map
of adapters (and their live connection pools) instead of creating fresh
ones — this is how `.with()`, `.cd()`, `.env()` and friends stay cheap and
keep SSH connections alive across a chain.

### Configuration Updates {#configuration-updates}

The constructor and `engine.config.set()` accept the same aliases: `env` / `defaultEnv`, `cwd` / `defaultCwd`, `shell` / `defaultShell`, and `timeout` / `defaultTimeout`. Durations are normalized to milliseconds. When both spellings are supplied, the `default*` value takes precedence; environment maps combine with `defaultEnv` winning duplicate keys.

`config.set()` validates the entire update before changing state, merges environment keys, and leaves the caller’s object unchanged. `config.get()` returns a snapshot of plain configuration data. Subsequent commands receive their own resolved defaults, including `encoding`, `maxBuffer` and nonzero-exit policy. A running command keeps its original snapshot, and derived engines retain their own defaults while sharing connections.

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine({ timeout: '30s', env: { APP_ENV: 'development' } });
try {
  engine.config.set({ timeout: '10s', encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const result = await engine.execute({ command: process.execPath, args: ['--version'], shell: false });
  console.log(result.stdout);
} finally {
  await engine.dispose();
}
```

Adapter configuration is fixed when an engine is constructed. `config.set({ adapters: ... })` rejects before applying any part of the update. Create an engine with the required adapter settings to change connection pools, cluster identity or transport policy; `config.set()` does not silently reconfigure shared connections. Per-command settings remain available through `.with()` and `execute()`.

### Exact API payloads {#exact-api-payloads}

Captured output is redacted by default. For structured API data, use a per-command `redactOutput: false` snapshot. This preserves exact `stdout`, `stderr`, `stdall` and decoded JSON. Error objects, diagnostic events and progress messages retain credential masking. The parent engine keeps its existing defaults. Native process streams and caller-supplied writable destinations carry their original bytes.

```typescript
import { $ } from '@xec-sh/core';

const response = await $.with({ redactOutput: false })`docker inspect my-app`;
const containers = response.json<unknown[]>();
console.log(containers.length);
```

### Methods {#methods}

#### execute() {#execute}

Run a fully-specified `Command` object directly — the lowest-level entry
point, and the one every other execution method eventually calls.

`execute(command: Command): Promise<ExecutionResult>`

**Parameters:**
- `command` - A `Command` object (see [Types](./types.md)). At minimum needs `command: string`.

**Returns:** `Promise<ExecutionResult>` — a plain promise, not a `ProcessPromise`. There is no `.nothrow()`/`.pipe()`/`.timeout()` chain here; those belong to the tagged-template and `.exec()` forms below.

**Example:**
```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine();
const result = await engine.execute({ command: 'ls -la' });
console.log(result.stdout);
```

Passing a bare string instead of a `Command` object does not work — the
adapter reads `command.command`, which is `undefined` for a string, and the
call fails. For a command you already have as a string, use `$.exec(command,
options)` instead, which returns a full `ProcessPromise`:

```typescript
import { $ } from '@xec-sh/core';

const result = await $.exec('ls -la').nothrow();
```

#### ssh() {#ssh}

Target an SSH host. Returns an `SSHExecutionContext`, not a bare
`ExecutionEngine` — in addition to the full engine surface below, it carries
SSH-only members (`.tunnel()`, `.reverseTunnel()`, `.uploadFile()`,
`.downloadFile()`, `.uploadDirectory()`).

`ssh(target: string | Omit<SSHAdapterOptions, 'type'>): SSHExecutionContext`

**Parameters:**
- `target` - `[user@]host[:port]` shorthand, or an options object (note the field is `username`, not `user`)

**Returns:** `SSHExecutionContext`

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

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

#### docker() {#docker}

Target a Docker container, or build one with the fluent API.

`docker(container: string): ExecutionEngine;`

`docker(options: Omit<DockerAdapterOptions, 'type'>): ExecutionEngine;`

`docker(): DockerFluentAPI;`

**Parameters:**
- `container` - Container name/ID, or an options object. Omit entirely for the fluent API (`.compose()`, `.network()`, `.volume()`, `.swarm()`, `.pull()`, `.ps()`, …).

**Returns:** `ExecutionEngine` when a container is specified; `DockerFluentAPI` when called with no arguments.

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

const dockerEngine = engine.docker('my-app');
await dockerEngine`npm test`;

// With detailed target (field is `workdir`, not `workingDir`)
const dockerEngine2 = engine.docker({
  container: 'my-app',
  user: 'node',
  workdir: '/app'
});
```

#### k8s() {#k8s}

Target a Kubernetes pod, or build one with `.pod(name)`. There is no
`kubernetes()` alias — `k8s()` is the only spelling.

`k8s(target?: string | Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext`

**Parameters:**
- `target` - `[namespace/]pod[:container]` shorthand, an options object, or omitted to build the target fluently via `.pod(name)`

**Returns:** `K8sExecutionContext`

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

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
const pod = engine.k8s({ pod: 'app-pod', namespace: 'production', context: 'prod-cluster' }).pod('app-pod');
```

#### local() {#local}

Create a local execution context.

`local(): ExecutionEngine`

**Returns:** `ExecutionEngine` - New engine with local context

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

const localEngine = engine.local();
await localEngine`npm install`;
```

#### cd() {#cd}

Derive an engine with a new working directory. Resolves `~` and relative
paths against the current one; does not mutate `engine`.

`cd(path: string): ExecutionEngine`

**Parameters:**
- `path` - Directory path, absolute, relative, or `~`-prefixed

**Returns:** `ExecutionEngine` - New engine with the resolved working directory

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

await engine.cd('/project')`npm run build`;
```

#### env() {#env}

Set environment variables.

`env(variables: Record<string, string>): ExecutionEngine`

**Parameters:**
- `variables` - Environment variables object

**Returns:** `ExecutionEngine` - Engine with environment variables

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

await engine
  .env({ NODE_ENV: 'production' })`npm start`;
```

#### timeout() {#timeout}

Set execution timeout.

`timeout(duration: number | string): ExecutionEngine`

**Parameters:**
- `duration` - Milliseconds, or a duration string such as `'30s'`, `'5m'`

**Returns:** `ExecutionEngine` - Engine with timeout

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

await engine
  .timeout('60s')`long-running-task`;
```

#### parallel {#parallel}

Run multiple commands with a concurrency cap. This is a **property**, not a
callable method — `engine.parallel(...)` throws; call one of its methods
instead.

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine();
type ParallelOptions = Parameters<typeof engine.parallel.settled>[1];
const options = { maxConcurrent: 2 } satisfies ParallelOptions;
const results = await engine.parallel.settled(['npm test', 'npm run lint'], options);
console.log(results.succeeded.length, results.failed.length);
```

| Method | Result |
| --- | --- |
| `all(commands, options?)` | Successful results, rejecting a failed command |
| `settled(commands, options?)` | Results grouped into `succeeded` and `failed` |
| `race(commands)` | First settled command |
| `map(items, fn, options?)` | Grouped results from mapped commands |
| `filter(items, fn, options?)` | Items whose command succeeds |
| `some(commands, options?)` | Whether at least one command succeeds |
| `every(commands, options?)` | Whether every command succeeds |

`ParallelOptions.maxConcurrent` caps how many run at once (unset means
unlimited). `ParallelResult` sorts commands into `succeeded` and `failed` by
exit code — a `.nothrow()`'d command that exited non-zero lands in `failed`
holding an `ExecutionResult`, not thrown.

**Example:**
```typescript
import { $ as engine } from '@xec-sh/core';

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

### Executable lookup {#executable-lookup}

`await $.which(name)` returns the first executable path on the selected target,
or `null` when its lookup confirms absence. `await $.isCommandAvailable(name)`
uses the same observation and returns a boolean. Both propagate cancellation,
timeouts, authentication failures and unavailable transports; an unavailable
target is not evidence that its command is missing. Local Windows uses
`where.exe`; POSIX targets acknowledge the result of `which` through their shell.
The name is passed as a literal argument in both cases; a failed remote transport
cannot turn into an absent executable.

## ProcessPromise API {#processpromise-api}

The chainable, lazy promise returned by `` $`cmd` `` and `.exec()`. Nothing
runs until it is awaited, iterated, or one of `.start()`/`.spawned`/`.child`/`.pid`
is read.

### Properties {#properties}

```typescript
import type { ProcessPromise } from '@xec-sh/core';

type ProcessProperties = Pick<ProcessPromise, 'stdin' | 'pid' | 'spawned' | 'child' | 'exitCode'>;
type ProcessHandle = Awaited<ProcessPromise['spawned']>;
```

`stdout`/`stderr` are **not** properties here — they're configurator methods
(`.stdout(stream)`, see below) that set where output goes. To read the live
streams of a running command, use `.child.stdout` / `.child.stderr`, or
await `.spawned` first.

### Exact API payloads {#exact-api-payloads-1}

Captured output is redacted by default. For structured API data, use a per-command `redactOutput: false` snapshot. This preserves exact `stdout`, `stderr`, `stdall` and decoded JSON. Error objects, diagnostic events and progress messages retain credential masking. The parent engine keeps its existing defaults. Native process streams and caller-supplied writable destinations carry their original bytes.

```typescript
import { $ } from '@xec-sh/core';

const response = await $.with({ redactOutput: false })`docker inspect my-app`;
const containers = response.json<unknown[]>();
console.log(containers.length);
```

### Methods {#methods-1}

#### pipe() {#pipe}

Pipe the command's output somewhere else — another command, a stream, or a
function.

`pipe(target: PipeTarget, ...args: unknown[]): ProcessPromise`

`PipeTarget` accepts a template literal, a command string, a `Command`
object, another `ProcessPromise`, a `Transform` or `Writable` stream, a
line-processor function `(line: string) => void`, or a conditional function
`(result: ExecutionResult) => Command | string | null`.

**Example:**
```typescript
import { $ } from '@xec-sh/core';
import * as fs from 'node:fs';

await $`cat file.txt`.pipe($`grep pattern`);
await $`cat file.txt`.pipe(fs.createWriteStream('out.txt'));
```

#### nothrow() {#nothrow}

Don't throw on non-zero exit code.

`nothrow(): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const result = await $`test -f file.txt`.nothrow();
if (!result.ok) {
  console.log('File does not exist');
}
```

#### quiet() {#quiet}

Suppress output.

`quiet(): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

await $`npm install`.quiet();
```

#### timeout() {#timeout-1}

Fail the command after a duration.

`timeout(duration: number | string, timeoutSignal?: string): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

await $`slow-command`.timeout('5s');
```

#### signal() {#signal}

Attach an `AbortSignal`. Aborting kills the process; the awaited call
rejects with a `CommandError` (signalled exit), not a generic `AbortError`.

`signal(signal: AbortSignal): ProcessPromise`

**Example:**
```typescript
import { $, CommandError } from '@xec-sh/core';

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

#### cwd() {#cwd}

Set working directory for this execution.

`cwd(path: string): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

await $`npm build`.cwd('/project');
```

#### env() {#env-1}

Set environment variables for this execution.

`env(variables: Record<string, string>): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

await $`npm start`.env({ PORT: '3000' });
```

#### start() {#start}

Begin execution without awaiting. Useful when you need `.child`/`.spawned`/`.pid`
before the command finishes.

`start(): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const p = $`long-server-process`.start();
const handle = await p.spawned;
console.log('pid:', handle.pid);
```

#### cache() {#cache}

Cache the result of this single command. Keyed by command + cwd + env +
target, so the same command against different hosts or containers never
collides.

`cache(options?: { key?: string; ttl?: number; invalidateOn?: string[] }): ProcessPromise`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const result = await $`curl https://api.example.com/data`.cache({ ttl: 5000 });
```

#### kill() {#kill}

Terminate the process, and everything it spawned (the whole process tree,
not just the immediate child).

`kill(signal?: NodeJS.Signals): void`

#### stdin {#stdin}

Not a method — a writable stream property. Writes are buffered and
forwarded once the process spawns, so there's no need to `.start()` first.

`readonly stdin: NodeJS.WritableStream`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const p = $`cat`;
p.stdin.write('Hello, World!\n');
p.stdin.end();
const result = await p;
```

#### lines() {#lines}

Get output as array of lines.

`lines(): Promise<string[]>`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const lines = await $`ls -la`.lines();
lines.forEach(line => console.log(line));
```

#### json() {#json}

Parse trimmed output as JSON.

`json<T = any>(): Promise<T>`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const data = await $`cat package.json`.json();
console.log(data.name, data.version);
```

#### text() {#text}

Get trimmed output as a string.

`text(): Promise<string>`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const content = await $`cat README.md`.text();
```

#### buffer() {#buffer}

Get output as a `Buffer`. Called this way — directly on the un-awaited
`ProcessPromise` — it re-encodes the already-decoded `stdout` string, so it
is **not** safe for binary output. For the exact bytes a command wrote, call
`.buffer()` on the awaited `ExecutionResult` instead:

`buffer(): Promise<Buffer>`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const lossyBuffer = await $`cat image.png`.buffer();       // not binary-safe
const exactBuffer = (await $`cat image.png`).buffer();     // binary-safe
```

### Async iteration {#async-iteration}

Iteration applies backpressure while the consumer processes a line. Captured
command output is still subject to `maxBuffer`. A normal nonzero exit is reported
after all output lines have been delivered, unless `.nothrow()` was requested.
Breaking the loop stops that command and awaits its completion; failure to
confirm cleanup still rejects instead of reporting a successful stop.
Local cancellation is recorded as `aborted: true` on the result and `CommandError`
after process exit and output cleanup are confirmed. This remains distinct from
an ordinary failure on Windows, where stopping a process tree may produce exit
code 1 without a POSIX signal. Native exit codes and signals remain unchanged;
`ok` is false for an aborted command, even if its shutdown handler exits zero.

A `ProcessPromise` is async-iterable, streaming lines as they arrive rather
than waiting for the command to finish — the right tool for a follow-style
command:

```typescript
import { $ } from '@xec-sh/core';

for await (const line of $`tail -f /var/log/app.log`) {
  console.log('Line:', line);
}
```

## Execution Result {#execution-result}

The result object an awaited `ProcessPromise` (or `execute()`) resolves to.

```typescript
import type { ExecutionResult } from '@xec-sh/core';

function summarize(result: ExecutionResult) {
  return {
    succeeded: result.ok,
    exitCode: result.exitCode,
    signal: result.signal,
    output: result.stdall,
    durationMs: result.duration,
    metadata: result.toMetadata(),
  };
}
```

## Error Handling {#error-handling}

### ExecutionError and CommandError {#executionerror-and-commanderror}

`ExecutionError` is the base class for execution and adapter failures. It
carries a stable `kind: FailureKind` and a `recoverable` getter, for
branching on *why* something failed rather than on message text.

```typescript
import type { ExecutionError } from '@xec-sh/core';

type FailureDetails = Pick<ExecutionError, 'kind' | 'code' | 'details' | 'recoverable'>;
```

`CommandError` is the one actually thrown when a command exits non-zero — it
extends `ExecutionError` and adds the fields most callers reach for:

```typescript
import type { CommandError } from '@xec-sh/core';

type CommandFailure = Pick<CommandError,
  'command' | 'exitCode' | 'signal' | 'stdout' | 'stderr' | 'duration' | 'callSite'>;
```

**Example:**
```typescript
import { $, CommandError } from '@xec-sh/core';

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

## Advanced Features {#advanced-features}

### Connection Pooling {#connection-pooling}

SSH connections are pooled per adapter and reused automatically. To tune the
pool, configure the SSH adapter directly:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

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

### Stream Processing {#stream-processing}

Process output as it arrives, via the async iterator — not `.lines()`,
which waits for the command to finish and returns an array:

```typescript
import { $ } from '@xec-sh/core';

for await (const line of $`tail -f /var/log/app.log`) {
  console.log('Log:', line);
}
```

For lower-level access to the live streams, use `.child` once the command
has started:

```typescript
import { $ } from '@xec-sh/core';

const p = $`tail -f /var/log/app.log`.start();
const handle = await p.spawned;
handle.stdout?.on('data', chunk => console.log('Log:', chunk.toString()));
```

### Abort Signal {#abort-signal}

Cancel long-running operations. The command dies from the resulting signal,
so the rejection is a `CommandError`, not a plain `AbortError`:

```typescript
import { $, CommandError } from '@xec-sh/core';

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

## Performance Characteristics {#performance-characteristics}

Command construction is lazy. Derived engines share adapter instances and SSH connection pools. `maxBuffer` bounds captured output, and `parallel` supplies a concurrency limit. Measure execution overhead with the built package, target shell and transport used by your application. Connection latency and child-process memory depend on that environment.

## Related Documentation {#related-documentation}

- [Process Promise](./process-promise.md) - Detailed ProcessPromise API
- [Types](./types.md) - TypeScript type definitions
- [Configuration](../configuration/overview.md) - Configuration system
- [Commands](../commands/overview.md) - Command reference
- [Examples](../scripting/basics/command-execution.md) - Usage examples
