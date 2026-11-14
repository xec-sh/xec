---
title: Streaming Patterns
description: Live output, backpressure, cancellation, and bounded processing through Xec
---

# Stream Processing Patterns {#stream-processing-patterns}

Xec owns command execution and cancellation. Its output connects to Node streams and async iterators for incremental processing.

## How `.pipe()` Actually Behaves {#how-pipe-actually-behaves}

`ProcessPromise.pipe()` waits for a completed command and forwards its collected output. Configure the command before calling it.

```typescript
import { $ } from '@xec-sh/core';

await $`git status --short`.timeout('10s').pipe(process.stdout);
```

For live output, configure `.stdout()` and `.stderr()`, consume the command's async iterator, or access the readable streams through `await command.spawned`. Use a deadline or an `AbortSignal` for commands that follow a log indefinitely.

## Basic Output Streaming {#basic-output-streaming}

### Streaming to Console {#streaming-to-console}

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm build`
  .stdout(process.stdout)
  .stderr(process.stderr)
  .timeout('5m');
```

The command resolves after process completion and output delivery. A nonzero exit rejects it. The global output streams remain open.

### Streaming to Files {#streaming-to-files}

```typescript
import { createWriteStream } from 'node:fs';
import { $ } from '@xec-sh/core';

await $`pnpm build`
  .stdout(createWriteStream('build.log', { flags: 'a' }))
  .stderr(process.stderr)
  .timeout('5m');
```

The local adapter ends the supplied file destination and awaits its completion. Give concurrent commands separate destinations or use one explicit owner to serialize their writes.

## Real-Time Log Processing {#real-time-log-processing}

### Log Parsing and Filtering {#log-parsing-and-filtering}

```typescript
import { $ } from '@xec-sh/core';

const command = $`journalctl --user -u worker -o json -f`
  .signal(AbortSignal.timeout(60_000));
for await (const line of command) {
  const event: unknown = JSON.parse(line);
  if (typeof event === 'object' && event !== null && 'MESSAGE' in event) {
    console.log(event.MESSAGE);
  }
}
```

The iterator preserves UTF-8 characters and complete line boundaries across chunks. JSON parsing errors propagate. Leaving the loop cancels the command and waits for its completion.

### Multi-Source Log Aggregation {#multi-source-log-aggregation}

```typescript
import { $ } from '@xec-sh/core';

const hosts = ['web1.example.com', 'web2.example.com'];
const signal = AbortSignal.timeout(30_000);
const readers = hosts.map(async host => {
  for await (const line of $.ssh(`deploy@${host}`)`journalctl --user -n 100`.signal(signal)) {
    console.log(JSON.stringify({ host, receivedAt: new Date().toISOString(), line }));
  }
});
const outcomes = await Promise.allSettled(readers);
const failures = outcomes.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
if (failures.length) throw new AggregateError(failures, 'Log collection failed');
```

Each source retains its own order. Record source timestamps alongside reception timestamps when reconstructing events across machines.

## Stream Transformation {#stream-transformation}

### Data Transformation Pipeline {#data-transformation-pipeline}

```typescript
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { $ } from '@xec-sh/core';

const command = $`git log --format=%s -100`.timeout('10s');
await pipeline(
  Readable.from(command),
  async function* (lines) {
    for await (const line of lines) yield `[commit] ${String(line)}\n`;
  },
  createWriteStream('commits.log'),
);
```

Node's pipeline propagates destination errors and closes its inputs. Xec's iterator keeps the associated process lifetime attached to that pipeline.

### JSON Stream Processing {#json-stream-processing}

```typescript
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { $ } from '@xec-sh/core';

await pipeline(
  Readable.from($`journalctl --user -o json -n 100`.timeout('10s')),
  async function* (lines) {
    for await (const line of lines) {
      const event: unknown = JSON.parse(String(line));
      yield JSON.stringify({ receivedAt: new Date().toISOString(), event }) + '\n';
    }
  },
  createWriteStream('events.ndjson'),
);
```

Validate each decoded record against the application's schema before using its fields. Report malformed input together with its source and position.

## Progress Monitoring {#progress-monitoring}

### Progress Stream {#progress-stream}

```typescript
import { $ } from '@xec-sh/core';
import { spinner } from '@xec-sh/kit';

const activity = spinner();
let bytes = 0;
activity.start('Building');
try {
  await $`pnpm build`.timeout('5m').stdout(chunk => {
    bytes += Buffer.byteLength(chunk);
    activity.message(`Building · ${bytes} output bytes`);
  });
  activity.stop('Build complete');
} catch (error) {
  activity.error('Build failed');
  throw error;
}
```

Use a percentage only when the producer supplies a meaningful total. Output byte counts describe observed activity.

## Parallel Stream Processing {#parallel-stream-processing}

### Multi-Stream Processor {#multi-stream-processor}

For independent commands, `$.parallel.settled()` provides a concurrency limit, cancellation, and a result for each admitted command. For transformations of one stream, await each bounded group before consuming the next. Preserve ordering explicitly when transformation completion can differ from input order.

## Buffering and Batching {#buffering-and-batching}

### Batch Stream Processor {#batch-stream-processor}

```typescript
import { appendFile } from 'node:fs/promises';
import { $ } from '@xec-sh/core';

let batch: string[] = [];
for await (const line of $`git log --format=%H -1000`.timeout('30s')) {
  batch.push(line);
  if (batch.length === 100) {
    await appendFile('commits.txt', batch.join('\n') + '\n');
    batch = [];
  }
}
if (batch.length) await appendFile('commits.txt', batch.join('\n') + '\n');
```

The consumer retains at most 100 lines. For unlimited producers, also bound line length and output retention. The execution engine's `maxBuffer` caps collected command output and reports overflow. Direct writable destinations are suitable for byte streams that exceed that capture budget.

## Error Handling in Streams {#error-handling-in-streams}

### Resilient Stream Pipeline {#resilient-stream-pipeline}

Retain both the process outcome and any transformation error. Retry a read with a fresh command and destination. Publish a completed file with an atomic rename only after the producer and writer have both succeeded. A partial output file should retain its incomplete status.

## Complete Streaming Example {#complete-streaming-example}

This finite export validates each log record and publishes its output only after the complete stream succeeds.

```typescript
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { $ } from '@xec-sh/core';

const directory = await mkdtemp(resolve('.log-export-'));
const temporary = join(directory, 'events.ndjson');
let lineNumber = 0;
try {
  await pipeline(
    Readable.from($`journalctl --user -o json -n 1000`.timeout('30s')),
    async function* (lines) {
      for await (const line of lines) {
        lineNumber++;
        const event: unknown = JSON.parse(String(line));
        if (typeof event !== 'object' || event === null || !('MESSAGE' in event)) {
          throw new Error(`Invalid journal event at line ${lineNumber}`);
        }
        yield JSON.stringify(event) + '\n';
      }
    },
    createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
  );
  await rename(temporary, resolve('events.ndjson'));
} finally {
  await rm(directory, { recursive: true, force: true });
}
```
