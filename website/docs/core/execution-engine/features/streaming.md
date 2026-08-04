# Streaming

The Xec execution engine streams command output as it arrives rather than
buffering it to completion, and can pipe that output into another command, a
line-processing function, or a Node.js stream.

## Overview

Streaming support (`packages/core/src/core/process-context.ts`,
`packages/core/src/core/pipe-implementation.ts`) provides:

- **Real-time line iteration** with `for await`
- **Pipe operations** into another command, a line function, a `Transform`, or a `Writable`
- **Combined output** (`stdall`) preserving the arrival order of stdout and stderr
- **Live process access** (`.spawned`/`.child`) for building a custom stream pipeline

## Basic Streaming

### Line-by-Line Iteration

```typescript
import { $ } from '@xec-sh/core';

// Stream output in real time, as lines arrive — not buffered until the
// command finishes, which is what makes this useful for a follow like
// `tail -f`
for await (const line of $`tail -f /var/log/app.log`) {
  console.log('LOG:', line);
}
```

This iterates stdout only.

### Line Callbacks

```typescript
// .pipe() takes a line-processing function directly
await $`long-running-process`
  .pipe((line) => process.stdout.write(`[OUT] ${line}\n`));
```

`.stdout((line) => ...)` and `.stderr((line) => ...)` do **not** do this —
`.stdout()`/`.stderr()` only accept `'pipe' | 'ignore' | 'inherit'` or a
`Writable`, not a callback function. Passing a function there is silently
ignored rather than throwing.

### Stream to File

```typescript
import { createWriteStream } from 'fs';

// A real Writable is a valid .stdout()/.stderr() target
const logFile = createWriteStream('output.log');
const errorFile = createWriteStream('error.log');

await $`npm run build`
  .stdout(logFile)
  .stderr(errorFile);

// Append mode
const appendStream = createWriteStream('app.log', { flags: 'a' });
await $`echo "New log entry"`.stdout(appendStream);
```

`.stdout()` and `.stderr()` each hold exactly one destination — calling
`.stdout()` twice replaces the first target, it does not chain the two
together (see [Transform Streams](#transform-streams) below).

## Pipe Operations

### Command Piping

```typescript
// Pipe between commands with .pipe as a tagged template, or a plain string
await $`cat large-file.txt`
  .pipe`grep "error"`
  .pipe`sort`
  .pipe`uniq -c`;

// Store an intermediate result
const filtered = await $`cat data.json`.pipe`jq '.items[]'`;
const sorted = await filtered.pipe`sort -n`;
```

Pipe to `` .pipe`command` `` or `.pipe('command')` — not
`.pipe($\`command\`)`. Passing an already-built `ProcessPromise` as the pipe
target does not work correctly in the current build: the target command
runs once on its own (with no input), and the second, correctly-piped run is
lost, so the result comes back empty. If you need a command assembled from a
variable, use `.pipe(commandString)` or interpolate into the tagged form —
`` .pipe`${dynamicPart}` ``.

### Cross-Environment Piping

```typescript
// Pipe from local to remote
await $`cat local-file.txt`
  .pipe($.ssh('server')`cat > remote-file.txt`);
```

The same limitation applies across targets — the example above has the same
shape as `.pipe($cmd)` and does not work. `stdin` is a writable property, not
a method, so feed the destination command by writing to it directly:

```typescript
// Read locally, then write that output into a remote command's stdin
const local = await $`cat local-file.txt`;
const upload = $.ssh('server')`cat > remote-file.txt`;
upload.stdin.write(local.stdout);
upload.stdin.end();
await upload;
```

Piping a command's output into another *target* in one step (local into a
container, a pod into another container, and so on) is not directly
supported today — read the source side's result, then write it to the
destination command's `stdin`, as shown above.

## Transform Streams

### Data Transformation

```typescript
import { Transform } from 'stream';

const uppercase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

// Wire the transform's own output first — .stdout() hands it the raw
// output, it does not also arrange where the transformed output goes
uppercase.pipe(process.stdout);
await $`echo "hello world"`.stdout(uppercase);  // Outputs: HELLO WORLD
```

`pipeUtils`, also exported from `@xec-sh/core`, has a few ready-made
transforms for this: `pipeUtils.toUpperCase()`, `pipeUtils.grep(pattern)`,
`pipeUtils.replace(search, replacement)`, and `pipeUtils.tee(...destinations)`
(writes each chunk to every destination, then passes it through).

```typescript
import { pipeUtils } from '@xec-sh/core';

const grep = pipeUtils.grep(/ERROR/);
grep.pipe(process.stdout);
await $`cat app.log`.stdout(grep);
```

### Line Processing

For line-oriented processing, `.pipe(fn)` (shown above) is simpler than a
hand-rolled `Transform` and is already line-buffered correctly — a raw
`Transform`'s `transform()` callback receives arbitrary chunks, so splitting
on `\n` inside it can split a single line across two calls. `.pipe(fn)`
does not have that problem:

```typescript
await $`tail -f app.log`.pipe((line) => {
  if (line.includes('ERROR')) {
    console.log(`[${new Date().toISOString()}] ${line}`);
  }
});
```

## Multi-Stream Management

### Separate Stream Handling

```typescript
// Handle stdout and stderr with separate callbacks
await $`npm test`
  .pipe((line) => console.log(`✓ ${line}`));
  // .pipe() only attaches to stdout — see stdall below for a
  // stderr-inclusive view
```

To react differently to stdout and stderr as they arrive, read them from the
live process handle directly:

```typescript
const p = $`npm test`;
const handle = await p.spawned;
handle.stdout?.on('data', (chunk) => console.log(`✓ ${chunk}`));
handle.stderr?.on('data', (chunk) => console.error(`✗ ${chunk}`));
await p;
```

### Combined Output

```typescript
// stdout and stderr merged in the order they actually arrived — the full
// picture of which step was running when something printed
const result = await $`build.sh`.nothrow();
console.log(result.stdall);
```

## Log Streaming

### Real-time Logs

```typescript
// Stream Docker logs (the docker CLI, piped through a line processor)
await $`docker logs -f --tail 100 --timestamps my-container`
  .pipe((line) => {
    const [timestamp, ...message] = line.split(' ');
    console.log({ timestamp, message: message.join(' ') });
  });

// Stream Kubernetes logs — K8sPod.follow, reached through .pod()
await $.k8s('production').pod('my-pod').follow((line) => {
  console.log(`[K8S] ${line}`);
}, { container: 'app' });
```

### Multi-Source Log Aggregation

```typescript
// Aggregate logs from multiple SSH hosts
async function aggregateLogs(sources: string[]) {
  await Promise.all(sources.map(source =>
    $.ssh(source)`tail -f /var/log/app.log`
      .pipe((line) => {
        console.log(`[${source}] ${line}`);
      })
  ));
}

await aggregateLogs(['server1', 'server2', 'server3']);
```

## Building a Custom Pipeline

`.spawned` resolves to the live `ProcessHandle` once the command is running,
with real Node.js `stdout`/`stderr`/`stdin` streams — the way to reach
Node's own stream APIs (`pause()`/`resume()`, `pipeline()`, custom
`highWaterMark`, and so on) for anything `.pipe()`/`.stdout()` don't cover
directly:

```typescript
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

const p = $`gunzip -c archive.tar.gz`;
const handle = await p.spawned;

await pipeline(
  handle.stdout!,
  createWriteStream('archive.tar')
);

await p;
```

```typescript
// Pause and resume a live stream
const p = $`tail -f /var/log/syslog`;
const handle = await p.spawned;

setTimeout(() => { handle.stdout?.pause(); console.log('paused'); }, 5000);
setTimeout(() => { handle.stdout?.resume(); console.log('resumed'); }, 10000);
```

## Error Handling in Streams

```typescript
// A ProcessPromise has no .on('error'/'end') of its own — handle failure
// the same way as any other command
try {
  await $`unreliable-stream`.stdout(process.stdout);
} catch (error) {
  console.error('Command failed:', error);
}

// Retry on failure
import { retry } from '@xec-sh/core';

await retry(() => $.exec(command).stdout(process.stdout), { maxRetries: 3 });
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use streaming for large output instead of buffering it all
for await (const line of $`cat large-file.txt`) {
  process(line);
}

// ✅ Read from a single, real Writable destination
await $`generate-data`.stdout(createWriteStream('output.txt'));

// ✅ Reach for .spawned when you need Node's own stream APIs
const handle = await $`process-large-data`.spawned;
handle.stdout?.pipe(myTransform).pipe(process.stdout);
```

### Don'ts ❌

```typescript
// ❌ Buffer entire output in memory when it could be huge
const output = await $`cat huge-file.txt`;  // May cause OOM

// ❌ Pass a callback to .stdout()/.stderr() expecting it to be called
await $`cmd`.stdout((line) => console.log(line));  // Silently does nothing — use .pipe(fn)

// ❌ Pipe to another command via .pipe($cmd)
await $`cmd1`.pipe($`cmd2`);  // Broken — use .pipe`cmd2` or .pipe('cmd2')

// ❌ Ignore command failures
$`stream-command`.stdout(output);  // Not awaited, errors go unhandled
```

## Implementation Details

Streaming is implemented in:
- `packages/core/src/core/process-context.ts` - line iteration (`for await`), `.spawned`/`.child`
- `packages/core/src/core/pipe-implementation.ts` - `.pipe()` and `pipeUtils`
- `packages/core/src/types/process-handle.ts` - the uniform live-process handle

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Pipe Operations](/docs/core/execution-engine/api/chaining)
- [File Operations](/docs/core/execution-engine/features/file-operations)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
