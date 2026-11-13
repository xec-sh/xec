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
verification_date: 2026-11-14
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
`.child` / `.pid` is read. It implements the `Promise<ExecutionResult>` interface. Create commands with `` $`cmd` `` or `$.exec()` and await the result.

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

const command: ProcessPromise = $`node --version`;
const result = await command;
console.log(result.text());
```

### Properties

```typescript
import type { ProcessPromise } from '@xec-sh/core';

type ProcessProperties = Pick<ProcessPromise, 'stdin' | 'pid' | 'spawned' | 'child' | 'exitCode'>;
```

`stdout` and `stderr` are **not** stream properties on `ProcessPromise` —
those names are taken by the configurator methods below. To read output as
it arrives, use `.child.stdout` / `.child.stderr` (available once `.spawned`
resolves), or iterate the promise itself with `for await`.

## Chaining Methods

### pipe()

Pipe the command's output somewhere else.

`pipe(target: PipeTarget, ...values: unknown[]): ProcessPromise`

**Parameters:**
- `target` - A command string, another `ProcessPromise`, a `Command` object, a `Transform`/`Writable` stream, a line-processor function `(line: string) => void`, a conditional function `(result: ExecutionResult) => Command | string | null`, or a template literal (calling `.pipe` itself as a tag)

**Returns:** New `ProcessPromise` for the piped command

**Example:**
```typescript
import { $ } from '@xec-sh/core';

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

Interpolated values are escaped for the target shell, exactly as in the
main tag: `pattern` above reaches `grep` as one argument whatever it
contains. Use a plain string when you mean to hand the shell syntax it
should interpret.

:::caution Changed in 0.11.0
Before 0.11.0 the tagged form did **not** escape its interpolations — it
concatenated them — so a value carrying `;` or `|` was read as shell
syntax. If you relied on that to build a pipeline, pass the command as a
string instead.
:::

### nothrow()

Prevent throwing on non-zero exit codes.

`nothrow(): ProcessPromise`

**Returns:** ProcessPromise that won't throw on error

**Example:**
```typescript
import { $ } from '@xec-sh/core';

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

`quiet(): ProcessPromise`

**Returns:** ProcessPromise with suppressed output

**Example:**
```typescript
import { $ } from '@xec-sh/core';

await $`npm install`.quiet();
```

There is no `.verbose()` chain method. The equivalent is `$.verbose = true`
— a setter on the top-level `$` (echoes each command, secrets masked, to
stderr before it runs) — or `.config.set({ verbose: true })` on any engine
instance.

### timeout()

Fail the command after a duration.

`timeout(duration: number | string, timeoutSignal?: string): ProcessPromise`

**Parameters:**
- `duration` - Milliseconds, or a duration string such as `'30s'`, `'5m'`
- `timeoutSignal` - Signal to send on timeout (default: `'SIGTERM'`)

**Returns:** ProcessPromise with timeout

A timeout rejects the command. Branch on `ExecutionError.kind` to handle
its classified cause across adapters. The Node local adapter preserves
`TimeoutError`. Failure to confirm process termination has its own error.


```typescript
import { $, ExecutionError } from '@xec-sh/core';

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
import { $ } from '@xec-sh/core';

// Timeout after 5 seconds
await $`slow-command`.timeout('5s');

// Custom signal on timeout
await $`server`.timeout('10s', 'SIGKILL');
```

## Environment Methods

### cwd()

Set working directory.

`cwd(path: string): ProcessPromise`

**Parameters:**
- `path` - Working directory path

**Returns:** ProcessPromise with working directory

**Example:**
```typescript
import { $ } from '@xec-sh/core';

// Run in specific directory
await $`npm run build`.cwd('/project');

// Chain with other methods
await $`git pull`
  .cwd('/repo')
  .quiet()
  .timeout('30s');
```

### env()

Set environment variables.

`env(variables: Record<string, string>): ProcessPromise`

**Parameters:**
- `variables` - Environment variables object

**Returns:** ProcessPromise with environment

**Example:**
```typescript
import { $ } from '@xec-sh/core';

// Set environment variables
await $`npm start`.env({
  NODE_ENV: 'production',
  PORT: '3000'
});

// Add a required value to the inherited process environment
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error('API_KEY is required');
await $`deploy`.env({ API_KEY: apiKey });
```

### shell()

Set shell for execution.

`shell(shell: string | boolean): ProcessPromise`

**Parameters:**
- `shell` - Shell path, or `false` to execute without a shell

**Returns:** ProcessPromise with shell configuration

**Example:**
```typescript
import { $ } from '@xec-sh/core';

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

`readonly stdin: NodeJS.WritableStream`

**Example:**
```typescript
import { $ } from '@xec-sh/core';
import * as fs from 'node:fs';

// String input
const p = $`cat`;
p.stdin.write('Hello, World!\n');
p.stdin.end();
await p;

// Stream input
const sorted = $`sort`;
fs.createReadStream('input.txt').pipe(sorted.stdin);
console.log((await sorted).stdout);
```

To provide the whole input up front instead, pass it as part of the
`Command` via `.exec()` / `execute()`, or write-then-end as above; there is
no `.stdin(input)` chain method that takes a value as an argument.

### kill()

Kill the process — and everything it spawned. For local, Docker and
Kubernetes this signals the whole process tree, not just the immediate
child, so `sh -c 'node server.js'` doesn't orphan the server.

`kill(signal?: NodeJS.Signals): void`

**Parameters:**
- `signal` - Signal to send (default: `'SIGTERM'`)

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const proc = $`node -e 'setInterval(() => {}, 1000)'`.nothrow().start();
await proc.spawned;
proc.kill('SIGTERM');
const result = await proc;
console.log(result.signal, result.exitCode);
```

### start() / spawned / child / pid

Commands are lazy — nothing runs until the promise is awaited, iterated, or
one of these is touched.

`start(): ProcessPromise`

`readonly spawned: Promise<ProcessHandle>`

`readonly child?: ProcessHandle`

`readonly pid?: number`

`start()` begins execution without awaiting the result. `.spawned` resolves
once the command is actually running (spawning is asynchronous — an SSH
"process" needs a connection first). `.child` and `.pid` are synchronous
reads that implicitly call `.start()` — so touching either one begins
execution as a side effect.

`ProcessHandle` (what `.child` is, and what `.spawned` resolves to) is
uniform across environments:

```typescript
import type { ProcessPromise } from '@xec-sh/core';

type ProcessHandle = Awaited<ProcessPromise['spawned']>;

function reportHandle(handle: ProcessHandle) {
  console.log(handle.pid);
  handle.stdout?.on('data', chunk => console.log(chunk.toString()));
}
```

**Example:**
```typescript
import { $ } from '@xec-sh/core';

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

`lines(): Promise<string[]>`

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const lines = await $`ls -la`.lines();
lines.forEach(line => console.log(line));
```

A line ends with `\n` or `\r\n`, and the terminator is never part of the
line: a command run on Windows, or a Windows tool invoked from anywhere,
answers the same array as its POSIX equivalent. A lone `\r` is left alone —
it is what a progress bar writes to return to the start of the line, not a
line ending.

To process lines as they arrive rather than after the command finishes,
iterate the `ProcessPromise` itself — see [Async Iteration](#async-iteration) below.

### json()

Parse trimmed output as JSON.

`json<T = any>(): Promise<T>`

**Type Parameters:**
- `T` - Expected JSON type

**Returns:** Promise resolving to parsed JSON

**Example:**
```typescript
import { $ } from '@xec-sh/core';

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

`text(): Promise<string>`

**Returns:** Promise resolving to output text

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const content = await $`cat README.md`.text();
console.log(content);
```

### buffer()

Get output as a `Buffer`. Called this way — directly on the `ProcessPromise`,
before awaiting — it re-encodes the already-decoded `stdout` string, so it
is **not** safe for binary data.

`buffer(): Promise<Buffer>`

**Example:**
```typescript
import { $ } from '@xec-sh/core';
import * as fs from 'node:fs';

const lossy = await $`cat image.png`.buffer();          // corrupts binary output
const exact = (await $`cat image.png`).buffer();        // the awaited result's buffer() — binary-safe
fs.writeFileSync('copy.png', exact);
```

### cache()

Cache the result of this one command. Keyed by command + working directory +
environment + target (host/container/pod), so identical commands against
different machines never collide.

`cache(options?: { key?: string; ttl?: number; invalidateOn?: string[] }): ProcessPromise`

**Parameters:**
- `options.key` - Override the computed cache key
- `options.ttl` - Time to live in milliseconds (default: 60000)
- `options.invalidateOn` - Glob-style patterns matched against other cache keys, evicted on a successful run

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const result = await $`curl https://api.example.com/data`.cache({ ttl: 5000 });
```

## Advanced Methods

### retry

There is no `.retry()` method on `ProcessPromise`. Two real alternatives
exist instead, both taking the same `RetryOptions`:

```typescript
import type { RetryOptions } from '@xec-sh/core';

const options = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 30_000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: result => result.exitCode === 75,
  onRetry: (attempt, result, nextDelay) => console.log(attempt, result.exitCode, nextDelay),
} satisfies RetryOptions;
```

The standalone `retry()` export wraps a single call and retries it while it
throws a `CommandError` (a non-`CommandError` throw is treated as a bug and
propagates immediately). Exhaustion throws `RetryError`, carrying every
attempt's result:

```typescript
import { $ } from '@xec-sh/core';

import { retry } from '@xec-sh/core';

const result = await retry(() => $`flaky-command`, { maxRetries: 5, initialDelay: 1000 });
```

`$.retry(options)` is an **engine**-chaining method — it returns a new
engine that applies retry to every command run through it, not a
`ProcessPromise` method:

```typescript
import { $ } from '@xec-sh/core';

await $.retry({ maxRetries: 5 })`network-request`;
```

### signal()

Provide an abort signal.

`signal(signal: AbortSignal): ProcessPromise`

**Parameters:**
- `signal` - AbortSignal for cancellation

**Example:**
```typescript
import { $, CommandError } from '@xec-sh/core';

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
import { $ } from '@xec-sh/core';

for await (const line of $`tail -f log.txt`) {
  console.log('Log:', line);
}
```

`.stdout(customWritable)` directs output to that writable stream. Use a
callback when consuming text chunks, or `.pipe(writable)` when connecting
the process to a writable destination. Set the stream behavior before
starting the command. The command result reflects the capture policy of
that destination.

## Result Properties

### ExecutionResult

The object an awaited `ProcessPromise` resolves to:

```typescript
import { $, type ExecutionResult } from '@xec-sh/core';

const result: ExecutionResult = await $`node --version`;
console.log(result.text(), result.duration, result.startedAt, result.finishedAt);
const bytes: Buffer = result.buffer();
```

**Example:**
```typescript
import { $ } from '@xec-sh/core';

const result = await $`echo hello`.nothrow();

console.log(result.stdout);    // "hello\n"
console.log(result.stderr);    // ""
console.log(result.exitCode);  // 0
console.log(result.ok);        // true
console.log(result.duration);  // e.g. 15
```

`ExecutionResult` is the public completed-output contract. Its `.buffer()`
method exposes original captured bytes, while `.text()`, `.json()` and
`.lines()` provide decoded views.

## Error Handling

### CommandError

Thrown when a command exits non-zero (unless using `nothrow()`). There is
no `ProcessError` class — the real name is `CommandError`, and it extends
the base `ExecutionError`:

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
    console.log('Error output:', error.stderr);
    console.log('Duration:', error.duration, 'ms');
  }
}
```

## Performance Characteristics

Lazy construction permits a command to be configured before execution.
Measure throughput and memory with the adapters and capture policy used
by your workload. The default `maxBuffer` cap is unset at the `Command` level (no truncation)
unless configured; when set, exceeding it throws `MaxBufferExceededError`
rather than silently truncating.

## Usage Patterns

### Sequential Execution

```typescript
import { $ } from '@xec-sh/core';

// Chain commands sequentially
await $`npm install`;
await $`npm test`;
await $`npm run build`;
```

### Parallel Execution

```typescript
import { $ } from '@xec-sh/core';

// Install before starting independent checks
await $`npm install`.quiet();
const [build, lint, test] = await Promise.all([
  $`npm run build`.quiet(),
  $`npm run lint`.nothrow(),
  $`npm test`.timeout('60s')
]);
```

### Error Recovery

```typescript
import { $ } from '@xec-sh/core';

// Try primary, fallback to secondary
const result = await $`primary-command`.nothrow();
if (!result.ok) {
  await $`fallback-command`;
}
```

### Stream Processing

```typescript
import { $ } from '@xec-sh/core';
import * as fs from 'node:fs';

// Process a live stream of filenames as they're found
for await (const file of $`find . -name "*.log"`) {
  const { size } = await fs.promises.stat(file);
  console.log(`${file}: ${size} bytes`);
}
```

## Related Documentation

- [Execution Engine](./execution-engine.md) - Engine that creates ProcessPromise
- [Types](./types.md) - TypeScript type definitions
- [Error Handling](../guides/advanced/error-handling.md) - Error handling patterns
- [Stream Processing](../scripting/patterns/streaming.md) - Stream patterns
