---
title: ProcessPromise API
description: Chainable promise interface for command execution
keywords: [process, promise, execution, chain, pipe]
source_files:
  - packages/core/src/core/process-context.ts
  - packages/core/src/core/result.ts
  - packages/core/src/types/process.ts
key_functions:
  - ProcessPromise.then()
  - ProcessPromise.pipe()
  - ProcessPromise.nothrow()
  - ProcessPromise.quiet()
  - ProcessPromise.timeout()
verification_date: 2026-08-04
---

# ProcessPromise API

## Implementation Reference

**Source Files:**
- `packages/core/src/core/process-context.ts` - Builds and attaches every ProcessPromise method
- `packages/core/src/core/result.ts` - The `ExecutionResult` a ProcessPromise resolves to
- `packages/core/src/types/process.ts` - `ProcessPromise` and `ProcessHandle` types

## Class: ProcessPromise

A chainable, lazy promise that represents a command. Nothing runs until it's
awaited, iterated with `for await`, or one of `.start()` / `.spawned` /
`.child` / `.pid` is read. It extends the native `Promise`, resolving to an
`ExecutionResult` — there is no separate `ProcessPromise<T>` type parameter
and no public constructor; instances are produced by `` $`cmd` ``, `$.exec()`
and equivalents, never built directly.

```typescript
interface ProcessPromise extends Promise<ExecutionResult> { /* see below */ }
```

### Properties

```typescript
interface ProcessPromise {
  readonly stdin: NodeJS.WritableStream; // writable immediately, buffered until spawn
  readonly pid?: number;                 // reading this starts the command
  readonly spawned: Promise<ProcessHandle>; // resolves once actually running
  readonly child?: ProcessHandle;        // reading this starts the command
  exitCode: Promise<number | null>;      // null if the process was signalled
}
```

`stdout` and `stderr` are **not** stream properties on `ProcessPromise` —
those names are taken by the configurator methods below. To read output as
it arrives, use `.child.stdout` / `.child.stderr` (available once `.spawned`
resolves), or iterate the promise itself with `for await`.

## Chaining Methods

### pipe()

Pipe the command's output somewhere else.

```typescript
pipe(target: PipeTarget, ...values: unknown[]): ProcessPromise
```

**Parameters:**
- `target` - A command string, another `ProcessPromise`, a `Command` object, a `Transform`/`Writable` stream, a line-processor function `(line: string) => void`, a conditional function `(result: ExecutionResult) => Command | string | null`, or a template literal (calling `.pipe` itself as a tag)

**Returns:** New `ProcessPromise` for the piped command

**Example:**
```typescript
// Simple pipe
await $`cat file.txt`.pipe('grep pattern');

// Multiple pipes
await $`printf 'b\na\nb\n'`
  .pipe('sort')
  .pipe('uniq');

// With template literals — .pipe itself is a tag
const pattern = 'error';
await $`journalctl -u app`.pipe`grep ${pattern}`;
```

### nothrow()

Prevent throwing on non-zero exit codes.

```typescript
nothrow(): ProcessPromise
```

**Returns:** ProcessPromise that won't throw on error

**Example:**
```typescript
// Check if file exists without throwing
const result = await $`test -f file.txt`.nothrow();
if (result.ok) {
  console.log('File exists');
} else {
  console.log('File does not exist');
}
```

### quiet()

Suppress stdout/stderr output to the terminal (output is still captured on
the result).

```typescript
quiet(): ProcessPromise
```

**Returns:** ProcessPromise with suppressed output

**Example:**
```typescript
await $`npm install`.quiet();
```

There is no `.verbose()` chain method. The equivalent is `$.verbose = true`
— a setter on the top-level `$` (echoes each command, secrets masked, to
stderr before it runs) — or `.config.set({ verbose: true })` on any engine
instance.

### timeout()

Fail the command after a duration.

```typescript
timeout(duration: number | string, timeoutSignal?: string): ProcessPromise
```

**Parameters:**
- `duration` - Milliseconds, or a duration string such as `'30s'`, `'5m'`
- `timeoutSignal` - Signal to send on timeout (default: `'SIGTERM'`)

**Returns:** ProcessPromise with timeout

**Throws:** `TimeoutError` when the timeout fires — this is what the Docker,
Kubernetes and SSH adapters throw, verified by reading their source. The
local adapter, verified empirically, currently throws `AdapterError` instead
(with the same message and `kind: 'timeout'`) rather than a bare
`TimeoutError` — so `instanceof TimeoutError` is not a reliable cross-adapter
check. Test `error.kind === 'timeout'` instead, which every adapter sets
consistently:

```typescript
try {
  await $`slow-command`.timeout('5s');
} catch (error) {
  if (error instanceof ExecutionError && error.kind === 'timeout') {
    console.log('Command timed out');
  }
}
```

**Example:**
```typescript
// Timeout after 5 seconds
await $`slow-command`.timeout('5s');

// Custom signal on timeout
await $`server`.timeout('10s', 'SIGKILL');
```

## Environment Methods

### cwd()

Set working directory.

```typescript
cwd(path: string): ProcessPromise
```

**Parameters:**
- `path` - Working directory path

**Returns:** ProcessPromise with working directory

**Example:**
```typescript
// Run in specific directory
await $`npm build`.cwd('/project');

// Chain with other methods
await $`git pull`
  .cwd('/repo')
  .quiet()
  .timeout('30s');
```

### env()

Set environment variables.

```typescript
env(variables: Record<string, string>): ProcessPromise
```

**Parameters:**
- `variables` - Environment variables object

**Returns:** ProcessPromise with environment

**Example:**
```typescript
// Set environment variables
await $`npm start`.env({
  NODE_ENV: 'production',
  PORT: '3000'
});

// Merge with the current process's environment
await $`deploy`.env({
  ...process.env,
  API_KEY: 'secret'
});
```

### shell()

Set shell for execution.

```typescript
shell(shell: string | boolean): ProcessPromise
```

**Parameters:**
- `shell` - Shell path, or `false` to execute without a shell

**Returns:** ProcessPromise with shell configuration

**Example:**
```typescript
// Use specific shell
await $`echo $SHELL`.shell('/bin/zsh');

// Disable shell (direct execution)
await $`node script.js`.shell(false);
```

## Input/Output Methods

### stdin

Not a method — a writable stream property, available immediately. Writes
are buffered and forwarded once the process actually spawns, so there's no
need to `.start()` first.

```typescript
readonly stdin: NodeJS.WritableStream
```

**Example:**
```typescript
// String input
const p = $`cat`;
p.stdin.write('Hello, World!\n');
p.stdin.end();
await p;

// Stream input — pipe a Readable into it directly
fs.createReadStream('input.txt').pipe($`sort`.stdin);
```

To provide the whole input up front instead, pass it as part of the
`Command` via `.exec()` / `execute()`, or write-then-end as above; there is
no `.stdin(input)` chain method that takes a value as an argument.

### kill()

Kill the process — and everything it spawned. For local, Docker and
Kubernetes this signals the whole process tree, not just the immediate
child, so `sh -c 'node server.js'` doesn't orphan the server.

```typescript
kill(signal?: NodeJS.Signals): void
```

**Parameters:**
- `signal` - Signal to send (default: `'SIGTERM'`)

**Example:**
```typescript
const proc = $`long-running-task`;

// Kill after delay
setTimeout(() => proc.kill(), 5000);

// Kill with specific signal
proc.kill('SIGKILL');
```

### start() / spawned / child / pid

Commands are lazy — nothing runs until the promise is awaited, iterated, or
one of these is touched.

```typescript
start(): ProcessPromise
readonly spawned: Promise<ProcessHandle>
readonly child?: ProcessHandle
readonly pid?: number
```

`start()` begins execution without awaiting the result. `.spawned` resolves
once the command is actually running (spawning is asynchronous — an SSH
"process" needs a connection first). `.child` and `.pid` are synchronous
reads that implicitly call `.start()` — so touching either one begins
execution as a side effect.

`ProcessHandle` (what `.child` is, and what `.spawned` resolves to) is
uniform across environments:

```typescript
interface ProcessHandle {
  readonly pid?: number;   // absent for SSH — the remote pid isn't knowable from the channel
  readonly stdin: Writable | null;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  kill(signal?: NodeJS.Signals): void;
}
```

**Example:**
```typescript
const p = $`long-server-process`.start();
const handle = await p.spawned;
console.log('pid:', handle.pid);
handle.stdout?.on('data', chunk => console.log(chunk.toString()));
```

## Output Methods

### lines()

Get output as an array of lines, once the command finishes. This is a plain
promise, not an async iterable — `for await` does not work directly on its
return value.

```typescript
lines(): Promise<string[]>
```

**Example:**
```typescript
const lines = await $`ls -la`.lines();
lines.forEach(line => console.log(line));
```

To process lines as they arrive rather than after the command finishes,
iterate the `ProcessPromise` itself — see [Async Iteration](#async-iteration) below.

### json()

Parse trimmed output as JSON.

```typescript
json<T = any>(): Promise<T>
```

**Type Parameters:**
- `T` - Expected JSON type

**Returns:** Promise resolving to parsed JSON

**Example:**
```typescript
// Parse JSON output
const data = await $`cat package.json`.json();
console.log(data.name, data.version);

// With type
interface Config {
  host: string;
  port: number;
}
const config = await $`cat config.json`.json<Config>();
```

### text()

Get trimmed output as a string.

```typescript
text(): Promise<string>
```

**Returns:** Promise resolving to output text

**Example:**
```typescript
const content = await $`cat README.md`.text();
console.log(content);
```

### buffer()

Get output as a `Buffer`. Called this way — directly on the `ProcessPromise`,
before awaiting — it re-encodes the already-decoded `stdout` string, so it
is **not** safe for binary data.

```typescript
buffer(): Promise<Buffer>
```

**Example:**
```typescript
const lossy = await $`cat image.png`.buffer();          // corrupts binary output
const exact = (await $`cat image.png`).buffer();        // the awaited result's buffer() — binary-safe
fs.writeFileSync('copy.png', exact);
```

### cache()

Cache the result of this one command. Keyed by command + working directory +
environment + target (host/container/pod), so identical commands against
different machines never collide.

```typescript
cache(options?: { key?: string; ttl?: number; invalidateOn?: string[] }): ProcessPromise
```

**Parameters:**
- `options.key` - Override the computed cache key
- `options.ttl` - Time to live in milliseconds (default: 60000)
- `options.invalidateOn` - Glob-style patterns matched against other cache keys, evicted on a successful run

**Example:**
```typescript
const result = await $`curl https://api.example.com/data`.cache({ ttl: 5000 });
```

## Advanced Methods

### retry

There is no `.retry()` method on `ProcessPromise`. Two real alternatives
exist instead, both taking the same `RetryOptions`:

```typescript
interface RetryOptions {
  maxRetries?: number;        // default 3
  initialDelay?: number;      // default 100ms
  maxDelay?: number;          // default 30000ms
  backoffMultiplier?: number; // default 2
  jitter?: boolean;           // default true
  isRetryable?: (result: ExecutionResult) => boolean;
  onRetry?: (attempt: number, result: ExecutionResult, nextDelay: number) => void;
}
```

The standalone `retry()` export wraps a single call and retries it while it
throws a `CommandError` (a non-`CommandError` throw is treated as a bug and
propagates immediately). Exhaustion throws `RetryError`, carrying every
attempt's result:

```typescript
import { retry } from '@xec-sh/core';

const result = await retry(() => $`flaky-command`, { maxRetries: 5, initialDelay: 1000 });
```

`$.retry(options)` is an **engine**-chaining method — it returns a new
engine that applies retry to every command run through it, not a
`ProcessPromise` method:

```typescript
await $.retry({ maxRetries: 5 })`network-request`;
```

### signal()

Provide an abort signal.

```typescript
signal(signal: AbortSignal): ProcessPromise
```

**Parameters:**
- `signal` - AbortSignal for cancellation

**Example:**
```typescript
const controller = new AbortController();

// Cancel after timeout
setTimeout(() => controller.abort(), 5000);

try {
  await $`long-task`.signal(controller.signal);
} catch (error) {
  // Aborting kills the process, so this is a CommandError carrying the
  // signal it died from — not a generic AbortError.
  if (error instanceof CommandError && error.signal) {
    console.log('Cancelled:', error.signal);
  }
}
```

## Async iteration

A `ProcessPromise` is itself async-iterable, streaming lines as they arrive
rather than waiting for the command to finish — this is what makes it work
for a follow-style command:

```typescript
for await (const line of $`tail -f log.txt`) {
  console.log('Log:', line);
}
```

There is no `.tee()`, `.pipeStdout()` or `.pipeStderr()` method. Setting
`.stdout(customWritable)` redirects output to that stream *instead of*
capturing it on the result — it does not duplicate output to both places —
so there's no built-in way to write to a file while also keeping the
captured string; write both sides explicitly, e.g. by piping to a
`fs.createWriteStream()` and separately reading `.child.stdout`.

## Result Properties

### ExecutionResult

The object an awaited `ProcessPromise` resolves to:

```typescript
interface ExecutionResult {
  stdout: string;
  stderr: string;
  stdall: string;       // stdout and stderr merged in arrival order
  exitCode: number;
  signal?: string;
  ok: boolean;          // exitCode === 0 && !signal
  cause?: string;        // set when !ok
  command: string;
  duration: number;
  startedAt: Date;
  finishedAt: Date;
  adapter: string;
  host?: string;
  container?: string;

  toMetadata(): object;
  throwIfFailed(): void;
  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;      // exact original bytes — binary-safe
}
```

**Example:**
```typescript
const result = await $`echo hello`.nothrow();

console.log(result.stdout);    // "hello\n"
console.log(result.stderr);    // ""
console.log(result.exitCode);  // 0
console.log(result.ok);        // true
console.log(result.duration);  // e.g. 15
```

There is no separate `ProcessOutput` type — a `ProcessOutput` class exists
in the package's source but is dead code, never instantiated or exported;
`ExecutionResult` is what every command actually resolves to.

## Error Handling

### CommandError

Thrown when a command exits non-zero (unless using `nothrow()`). There is
no `ProcessError` class — the real name is `CommandError`, and it extends
the base `ExecutionError`:

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
    console.log('Error output:', error.stderr);
    console.log('Duration:', error.duration, 'ms');
  }
}
```

## Performance Characteristics

Measured on the built `dist`, not estimated (see the project's `CLAUDE.md`
for the full breakdown):

- **Command creation**: ~6µs
- **Pipe setup**: ~12µs
- **Simple execution**: \<5ms overhead over the process spawn itself
- **Memory overhead**: \<5MB per command

There is no fixed "base ProcessPromise" allocation figure published beyond
this — command creation already accounts for attaching every chain method.
The default `maxBuffer` cap is unset at the `Command` level (no truncation)
unless configured; when set, exceeding it throws `MaxBufferExceededError`
rather than silently truncating.

## Usage Patterns

### Sequential Execution

```typescript
// Chain commands sequentially
await $`npm install`;
await $`npm test`;
await $`npm build`;
```

### Parallel Execution

```typescript
// Run commands in parallel
const [install, lint, test] = await Promise.all([
  $`npm install`.quiet(),
  $`npm run lint`.nothrow(),
  $`npm test`.timeout('60s')
]);
```

### Error Recovery

```typescript
// Try primary, fallback to secondary
const result = await $`primary-command`.nothrow();
if (!result.ok) {
  await $`fallback-command`;
}
```

### Stream Processing

```typescript
// Process a live stream of filenames as they're found
for await (const file of $`find . -name "*.log"`) {
  const size = await $`stat -f%z ${file}`.text();
  console.log(`${file}: ${size} bytes`);
}
```

## Related Documentation

- [Execution Engine](./execution-engine.md) - Engine that creates ProcessPromise
- [Types](./types.md) - TypeScript type definitions
- [Error Handling](../guides/advanced/error-handling.md) - Error handling patterns
- [Stream Processing](../scripting/patterns/streaming.md) - Stream patterns
