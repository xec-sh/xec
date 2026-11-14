---
title: Streaming
description: Streaming command output as it arrives
---

# Streaming {#streaming}

The Xec execution engine streams command output as it arrives rather than
buffering it to completion, and can pipe that output into another command, a
line-processing function, or a Node.js stream.

## Overview {#overview}

Streaming support (`packages/core/src/core/process-context.ts`,
`packages/core/src/core/pipe-implementation.ts`) provides:

- **Real-time line iteration** with `for await`
- **Pipe operations** into another command, a line function, a `Transform`, or a `Writable`
- **Combined output** (`stdall`) preserving the arrival order of stdout and stderr
- **Live process access** (`.spawned`/`.child`) for building a custom stream pipeline

## Basic Streaming {#basic-streaming}

### Line-by-Line Iteration {#line-by-line-iteration}

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

### Line Callbacks {#line-callbacks}

```typescript
import { $ } from '@xec-sh/core';

await $`long-running-process`.pipe((line: string) => {
  process.stdout.write(`[OUT] ${line}\n`);
});
```

`.stdout((line) => ...)` and `.stderr((line) => ...)` do **not** do this —
`.stdout()` and `.stderr()` accept a destination stream, a stream mode, or a chunk callback. `.pipe(fn)` groups stdout into lines.

### Stream to File {#stream-to-file}

```typescript
import { $ } from '@xec-sh/core';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

const output = createWriteStream('build.log', { flags: 'a' });
try {
  await $`pnpm build`.stdout(output).stderr(process.stderr);
} finally {
  output.end();
  await finished(output);
}
```

## Pipe Operations {#pipe-operations}

### Command Piping {#command-piping}

```typescript
import { $ } from '@xec-sh/core';

const filtered = $`cat data.json`.pipe($`jq '.items[]'`);
const result = await filtered.pipe($`sort -n`);
console.log(result.stdout);
```

A pipeline target can be a lazy `ProcessPromise`, command string, command object or tagged template. Configure each command before executing the pipeline. Completed results contain output and metadata.

### Cross-Environment Piping {#cross-environment-piping}

```typescript
import { $ } from '@xec-sh/core';

const remote = $.ssh({ host: 'web-1.example.com', username: 'deploy' });
await $`printf %s ${'configuration'}`.pipe(remote`cat > /srv/app/config.txt`);
```

The target keeps its adapter and options. Use the transfer API for large or binary files. Command pipelines can buffer output according to adapter and pipeline implementation.

## Transform Streams {#transform-streams}

### Data Transformation {#data-transformation}

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

### Line Processing {#line-processing}

For line-oriented processing, `.pipe(fn)` (shown above) is simpler than a
hand-rolled `Transform` and is already line-buffered correctly — a raw
`Transform`'s `transform()` callback receives arbitrary chunks, so splitting
on `\n` inside it can split a single line across two calls. `.pipe(fn)`
does not have that problem:

```typescript
await $`tail -f app.log`.pipe((line: string) => {
  if (line.includes('ERROR')) {
    console.log(`[${new Date().toISOString()}] ${line}`);
  }
});
```

## Multi-Stream Management {#multi-stream-management}

### Separate Stream Handling {#separate-stream-handling}

```typescript
// Handle stdout and stderr with separate callbacks
await $`npm test`
  .pipe((line: string) => console.log(`✓ ${line}`));
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

### Combined Output {#combined-output}

```typescript
// stdout and stderr merged in the order they actually arrived — the full
// picture of which step was running when something printed
const result = await $`build.sh`.nothrow();
console.log(result.stdall);
```

## Log Streaming {#log-streaming}

### Real-time Logs {#real-time-logs}

```typescript
// Stream Docker logs (the docker CLI, piped through a line processor)
await $`docker logs -f --tail 100 --timestamps my-container`
  .pipe((line: string) => {
    const [timestamp, ...message] = line.split(' ');
    console.log({ timestamp, message: message.join(' ') });
  });

// Stream Kubernetes logs — K8sPod.follow, reached through .pod()
const stream = await $.k8s({ namespace: 'production' }).pod('my-pod').follow(line => {
  process.stdout.write(`[K8S] ${line}`);
}, { container: 'app' });
try { await stream.completion; } finally { await stream.stop(); }
```

### Multi-Source Log Aggregation {#multi-source-log-aggregation}

```typescript
// Aggregate logs from multiple SSH hosts
async function aggregateLogs(sources: string[]) {
  await Promise.all(sources.map(source =>
    $.ssh(source)`tail -f /var/log/app.log`
      .pipe((line: string) => {
        console.log(`[${source}] ${line}`);
      })
  ));
}

await aggregateLogs(['server1', 'server2', 'server3']);
```

## Building a Custom Pipeline {#building-a-custom-pipeline}

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

## Error Handling in Streams {#error-handling-in-streams}

```typescript
import { $ } from '@xec-sh/core';

try {
  await $`journalctl --since '5 minutes ago'`.stdout(process.stdout);
} catch (error) {
  throw new Error('Journal stream failed', { cause: error });
}
```

## Best Practices {#best-practices}

### Do's ✅ {#dos-}

```typescript
import { $ } from '@xec-sh/core';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

const destination = createWriteStream('output.txt');
try {
  await $`generate-data`.stdout(destination);
} finally {
  destination.end();
  await finished(destination);
}
```

### Don'ts ❌ {#donts-}

Choose a destination before awaiting execution. Track completion and destination errors, release owned streams in `finally`, and keep output limits appropriate for the adapter's buffering behavior. A returned `ExecutionResult` represents a completed command.

## Implementation Details {#implementation-details}

Streaming is implemented in:
- `packages/core/src/core/process-context.ts` - line iteration (`for await`), `.spawned`/`.child`
- `packages/core/src/core/pipe-implementation.ts` - `.pipe()` and `pipeUtils`
- `packages/core/src/types/process-handle.ts` - the uniform live-process handle

## See Also {#see-also}

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Pipe Operations](/docs/core/execution-engine/api/chaining)
- [File Operations](/docs/core/execution-engine/features/file-operations)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
