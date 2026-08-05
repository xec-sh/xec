---
title: Execution API
description: The core interface for executing commands
---

# Execution API

The core execution API provides the fundamental interface for executing commands across all environments with a consistent, powerful syntax.

## Overview

The Execution API (`packages/core/src/core/execution-engine.ts`) provides:

- **Template literal syntax** for natural command execution
- **Method chaining** for composable operations
- **Environment switching** between adapters
- **Configuration merging** with defaults
- **Event emission** for monitoring
- **Result handling** with type safety

## Core API

### Template Literal Execution

```typescript
import { $ } from '@xec-sh/core';

// Basic execution
const listing = await $`ls -la`.text();
console.log(listing);

// With variables
const file = 'document.txt';
await $`cat ${file}`;

// Multi-line commands
await $`
  cd /app
  npm install
  npm run build
`;
```

### ExecutionEngine Class

```typescript
import { ExecutionEngine } from '@xec-sh/core';

// Create custom instance
const engine = new ExecutionEngine({
  shell: '/bin/zsh',
  cwd: '/home/user',
  env: {
    NODE_ENV: 'production'
  }
});

// A raw ExecutionEngine instance isn't callable as a template tag itself —
// only $ and the contexts it returns (from .local(), .ssh(), ...) are.
// Use .run() directly:
await engine.run`command`;
```

### Adapter Selection

```typescript
// Local execution (default)
await $`local-command`;
await $.local()`explicit-local`;

// SSH execution
await $.ssh({ host: 'server', username: 'user' })`remote-command`;

// Docker execution
await $.docker({ container: 'app' })`container-command`;

// Kubernetes execution
await $.k8s({ pod: 'worker', namespace: 'default' })`pod-command`;
```

## Command Building

### String Interpolation

```typescript
// Safe interpolation
const userInput = "'; rm -rf /";
await $`echo ${userInput}`;  // Automatically escaped

// Array expansion
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`cat ${files}`;  // Expands to: cat file1.txt file2.txt file3.txt
```

There is no object-to-flags conversion — interpolating an object stringifies
it as JSON, which is rarely what you want. Build the flag list yourself:

```typescript
const options = { verbose: true, recursive: true };
const flags = [
  options.verbose && '--verbose',
  options.recursive && '--recursive',
].filter(Boolean);
await $`rsync ${flags} source/ dest/`;
```

### Command Options

There is no single `.options()` call — each option is its own chainable
method on `ProcessPromise`, or, for options that aren't exposed as a method
(like `maxBuffer`), a field passed to `.with()` on the engine before the
template tag runs:

```typescript
// Chainable per-command options
const result = await $`command`
  .timeout(5000)
  .shell('/bin/bash')
  .env({ CUSTOM_VAR: 'value' });

// maxBuffer is set on the engine, not on the ProcessPromise
const result2 = await $.with({ maxBuffer: 10 * 1024 * 1024 })`command`;  // 10MB
```

## Environment Configuration

### Working Directory

```typescript
// Change working directory
await $`pwd`.cwd('/tmp');  // Outputs: /tmp

// Chain with cd()
const project = $.cd('/project');
await project`npm install`;
await project`npm test`;

// Temporary directory change
import { within } from '@xec-sh/core';

await within('/tmp', async () => {
  await $`create-temp-files`;
});  // Returns to original directory
```

`within` is a standalone function, not an engine method — there is no
`$.within`. It also accepts a full config object instead of a bare `cwd`
string (`within({ cwd: '/tmp', env: {...} }, fn)`), and a synchronous
counterpart, `withinSync`, for non-async callbacks.

### Environment Variables

```typescript
// Set environment variables
await $`node script.js`.env({
  NODE_ENV: 'production',
  API_KEY: 'secret'
});

// Merge with existing
const production = $.env({ NODE_ENV: 'production' });
await production`npm start`;
```

`.env()` only merges into the inherited environment — it takes a single
`Record<string, string>` argument, with no second options argument and no
way to fully replace or clear it.

### Shell Configuration

```typescript
// Use specific shell
await $`echo $0`.shell('/bin/zsh');

// Disable shell (direct execution)
await $`ls`.shell(false);
```

`.shell()` only accepts a string (a shell path or name) or a boolean — there
is no object form for passing extra shell flags. Put them in the command
itself instead: `` await $`set -eo pipefail; complex-script` ``.

## Process Control

### Signals and Termination

```typescript
// Handle signals
const longRunning = $`sleep 100`;

// Send signal
setTimeout(() => longRunning.kill('SIGTERM'), 5000);

// Graceful shutdown
const server = $`node server.js`;
process.on('SIGINT', async () => {
  await server.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 5000));
  await server.kill('SIGKILL');
});
```

### Abort Controller

```typescript
// Use AbortController
const controller = new AbortController();

const task = $`long-task`.signal(controller.signal);

// Cancel after timeout
setTimeout(() => controller.abort(), 10000);

try {
  await task;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Task cancelled');
  }
}
```

## Input/Output Control

### Standard Input

`stdin` is a property — a live, writable stream — not a method. There are
two ways to feed a command input, depending on whether you already have the
data or want to stream it.

Pass it as part of the command config, before the template tag runs, when
you already have the data:

```typescript
// String input
await $.with({ stdin: 'Hello, World!' })`cat`;

// Buffer input
const data = Buffer.from([0x00, 0x01, 0x02]);
await $.with({ stdin: data })`process-binary`;

// Readable stream input
import { createReadStream } from 'fs';
await $.with({ stdin: createReadStream('input.txt') })`sort`;
```

Or write to `.stdin` directly — writes are buffered and forwarded once the
command starts, so no separate start step is needed:

```typescript
const proc = $`cat`;
proc.stdin.write('Hello, ');
proc.stdin.write('World!');
proc.stdin.end();
await proc;

// Pipe from another command
await $`generate-data`.pipe($`process-data`);
```

### Standard Output

```typescript
// Capture output
const result = await $`echo "test"`;
console.log(result.stdout);  // "test\n"

// Stream to file
import { createWriteStream } from 'fs';
const output = createWriteStream('output.txt');
await $`ls -la`.stdout(output);

// Inherit parent process streams — .interactive() sets stdout, stderr and
// stdin to 'inherit' together; stdin specifically isn't settable through
// .stdout()/.stderr()-style chaining since it's a property, not a method
await $`interactive-command`.interactive();

// The same as an engine: $.interactive() returns a configured engine, so a
// command that owns the terminal — npm login, vim, an ssh session — runs
// attached to it. Output goes to the user, not into result.stdout, and a
// human flow deserves no deadline:
await $.interactive()`npm login`.timeout(0);

// Ignore output
await $`noisy-command`
  .stdout('ignore')
  .stderr('ignore');
```

### Standard Error

```typescript
// Capture stderr
const result = await $`command 2>&1`;
console.log('Errors:', result.stderr);

// Redirect stderr to stdout
await $`command 2>&1`.stdout(process.stdout);
```

`.stdout()`/`.stderr()` accept `'pipe' | 'ignore' | 'inherit'` or a
`Writable` — not a per-line callback function. To handle stdout and stderr
separately as lines arrive, read the live streams off the running process
handle:

```typescript
const proc = $`test-command`;
const handle = await proc.spawned;
handle.stdout?.on('data', (chunk) => console.log('OUT:', chunk.toString()));
handle.stderr?.on('data', (chunk) => console.error('ERR:', chunk.toString()));
await proc;
```

For stdout alone, the simpler option is the async iterator:
`for await (const line of $\`test-command\`)` — it streams lines as they
arrive, though it only covers stdout.

## Result Handling

### Result Object

```typescript
// Result structure
interface ExecutionResult {
  stdout: string;
  stderr: string;
  stdall: string;       // stdout and stderr merged in arrival order
  exitCode: number;
  signal?: string;
  ok: boolean;          // exitCode === 0 && !signal
  cause?: string;        // set when !ok: 'signal: SIGTERM' or 'exitCode: 1'
  command: string;
  duration: number;
  startedAt: Date;
  finishedAt: Date;
  adapter: string;
  host?: string;         // set for SSH
  container?: string;    // set for Docker/Kubernetes
  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;      // exact bytes, binary-safe
  toMetadata(): object;
  throwIfFailed(): void;
}

const result = await $`echo "test"`;
console.log({
  output: result.stdout,
  errors: result.stderr,
  success: result.ok,
  time: result.duration
});
```

There is no `killed` field — a signalled process is distinguishable through
`signal` and `ok` (`ok` is `false` whenever a signal fired, even if
`exitCode` happens to read `0`).

### Error Handling

```typescript
// Default behavior - throws on non-zero exit
try {
  await $`exit 1`;
} catch (error) {
  console.error('Command failed:', error.exitCode);
}

// Use nothrow() to prevent throwing
const result = await $`might-fail`.nothrow();
if (!result.ok) {
  console.error('Failed but continued');
}

// Check specific exit codes
const result = await $`special-command`.nothrow();
switch (result.exitCode) {
  case 0: console.log('Success'); break;
  case 1: console.log('General error'); break;
  case 2: console.log('Misuse'); break;
  default: console.log('Unknown error');
}
```

## Event System

### Command Events

```typescript
const $ = new ExecutionEngine();

// Listen for execution events
$.on('command:start', ({ command, adapter }) => {
  console.log(`Starting: ${command} (${adapter})`);
});

$.on('command:complete', ({ command, exitCode, duration }) => {
  console.log(`Completed in ${duration}ms with code ${exitCode}`);
});

$.on('command:error', ({ command, error }) => {
  console.error(`Failed: ${command}`, error);
});
```

There is no `command:output` event, and `command:start` carries no `id` —
only `command`, `args`, `cwd`, `shell`, `envKeys` (environment variable
*names* only, never values) alongside the `timestamp`/`adapter` every event
carries.

### Custom Events

```typescript
// Emit custom events
$.emit('custom:event', { data: 'value' });

// Listen for custom events
$.on('custom:event', (payload) => {
  console.log('Custom event:', payload);
});

// One-time listeners
$.once('initialization:complete', () => {
  console.log('Initialized');
});

// Remove listeners
const handler = () => console.log('Handler');
$.on('event', handler);
$.off('event', handler);
```

## Utility Methods

### Text Processing

```typescript
// Get output as text (trimmed)
const text = await $`echo "  text  "`.text();
console.log(text);  // "text" (no whitespace)

// Get output lines
const lines = await $`ls -1`.lines();
lines.forEach(line => console.log(`File: ${line}`));

// Get as JSON
const json = await $`echo '{"key": "value"}'`.json();
console.log(json.key);  // "value"
```

### Boolean Checks

There is no `.succeeds()`/`.fails()` — use `.nothrow()` and check `.ok`:

```typescript
// Check if command succeeds
if ((await $`test -f file.txt`.nothrow()).ok) {
  console.log('File exists');
}

// Check if command fails
if (!(await $`test -f missing.txt`.nothrow()).ok) {
  console.log('File does not exist');
}

// Silent check (no output)
const exists = (await $`which node`.quiet().nothrow()).ok;
```

## Performance Options

### Timeout Management

```typescript
// Simple timeout
await $`slow-command`.timeout(5000);  // 5 seconds

// Duration strings work too
await $`slow-command`.timeout('5s');

// Timeout with custom signal
await $`server`.timeout(10000, 'SIGTERM');
```

`.timeout()` takes a duration (milliseconds or a string like `'30s'`) and an
optional signal — there is no object form. The same duration strings work as
a plain `timeout` option wherever `Command` config is accepted, not only
through `.timeout()`: `` $.with({ timeout: '30s' })`server` ``.

### Buffer Limits

`maxBuffer` is a `Command` config field, not a `ProcessPromise` method — set
it through `.with()` before the template tag runs. Exceeding it throws
`MaxBufferExceededError` rather than silently truncating output.

```typescript
// Set max buffer size
await $.with({ maxBuffer: 100 * 1024 * 1024 })`generate-output`;  // 100MB

// Streaming avoids buffering altogether
await $`infinite-output`.stdout(process.stdout);
```

### Parallel Execution

```typescript
// Execute commands in parallel
const results = await Promise.all([
  $`command1`,
  $`command2`,
  $`command3`
]);

// With a concurrency limit — parallel() is exported by @xec-sh/core, no
// extra dependency needed
import { parallel } from '@xec-sh/core';

const commands = ['cmd1', 'cmd2', 'cmd3', 'cmd4'];
const { succeeded, failed } = await parallel(commands, { maxConcurrent: 2 });
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use template literals for safety
const userInput = "dangerous';rm -rf /";
await $`echo ${userInput}`;  // Safe

// ✅ Handle errors appropriately
const result = await $`risky-command`.nothrow();
if (!result.ok) {
  // Handle failure
}

// ✅ Set timeouts for network operations
await $`curl https://api.example.com`.timeout(10000);

// ✅ Use events for monitoring
$.on('command:error', (e) => logger.error(e));
```

### Don'ts ❌

```typescript
// ❌ Don't interpolate through $.raw, which skips escaping
await $.raw`echo ${userInput}`;  // Dangerous — userInput reaches the shell unescaped

// ❌ Don't ignore errors
await $`failing-command`;  // Will throw

// ❌ Don't buffer large outputs
const huge = await $`cat 10gb-file.dat`;  // OOM

// ❌ Don't leak resources
const proc = $`long-running`;
// Should await or kill
```

## Implementation Details

The Execution API is implemented in:
- `packages/core/src/core/execution-engine.ts` - Main engine, adapter selection, chaining methods
- `packages/core/src/core/process-context.ts` - `ProcessPromise` construction and its chainable methods
- `packages/core/src/core/result.ts` - `ExecutionResult`
- `packages/core/src/utils/shell-escape.ts` - Template literal interpolation and escaping

## See Also

- [Template Literals](/docs/core/execution-engine/template-literals)
- [Chaining](/docs/core/execution-engine/api/chaining)
- [Composition](/docs/core/execution-engine/api/composition)
- [Error Handling](/docs/core/execution-engine/features/error-handling)