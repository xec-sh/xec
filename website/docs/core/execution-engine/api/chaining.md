---
title: Chaining
description: Fluent method chaining on the execution engine
---

# Chaining {#chaining}

Method chaining enables fluent, readable command composition by linking multiple operations together in a single expression.

## Overview {#overview}

Chaining support (`packages/core/src/core/process-context.ts`) provides:

- **Fluent interface** for readable code
- **Immutable operations** preventing side effects
- **Type-safe chaining** with IntelliSense
- **Conditional chaining** based on runtime values
- **Pipeline composition** for complex flows
- **Error propagation** through the chain

## Basic Chaining {#basic-chaining}

### Method Chaining {#method-chaining}

```typescript
import { $ } from '@xec-sh/core';

// Chain multiple methods
await $`command`
  .cwd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(10000)
  .quiet();

// Each method returns a new instance
const base = $`npm install`;
const production = base.env({ NODE_ENV: 'production' });
const development = base.env({ NODE_ENV: 'development' });
```

There is no `.retry()` on `ProcessPromise` — retry configures the engine,
not an already-created command, because it has to wrap `execute()` to retry
the whole run. Apply it before the template tag: `` $.retry({ maxRetries: 3 })`command` ``.

### Configuration Chaining {#configuration-chaining}

```typescript
// Build complex configurations. maxBuffer isn't a ProcessPromise method —
// set it on the engine with .with() before the template tag runs. There is
// no process-priority control (no .nice()).
const result = await $.with({ maxBuffer: 50 * 1024 * 1024 })`build.sh`
  .cwd('/project')
  .env({
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  })
  .timeout(60000)
  .shell('/bin/bash')
  .nothrow();
```

## Pipe Chaining {#pipe-chaining}

### Command Pipes {#command-pipes}

```typescript
// Pipe commands together
await $`cat data.json`
  .pipe($`jq '.items[]'`)
  .pipe($`grep "active"`)
  .pipe($`sort`)
  .pipe($`uniq -c`);

// Store intermediate results
const filtered = $`cat large-file.txt`
  .pipe($`grep ERROR`);

const sorted = filtered
  .pipe($`sort -k2`);

const result = await sorted
  .pipe($`head -100`);
```

### Cross-Environment Pipes {#cross-environment-pipes}

```typescript
// Pipe across different adapters
await $.ssh('server')`cat remote-file.txt`
  .pipe($.docker({ container: 'processor' })`python process.py`)
  .pipe($`gzip > output.gz`);

// Complex pipeline
await $.k8s('pod')`kubectl logs -f`
  .pipe($`grep ERROR`)
  .pipe($.ssh('log-server')`cat >> /var/log/errors.log`);
```

## Stream Chaining {#stream-chaining}

### Output Stream Chains {#output-stream-chains}

`.stdout(stream)` takes a single `Writable` — calling it more than once
doesn't build a pipeline, it just replaces the previous target, and the
earlier streams never receive anything. To route output through several
transforms, pipe the Node streams together yourself first, then hand the
head of that chain to one `.stdout()` call:

```typescript
import { Transform } from 'stream';

const uppercase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

const addTimestamp = new Transform({
  transform(chunk, encoding, callback) {
    const timestamp = new Date().toISOString();
    callback(null, `[${timestamp}] ${chunk}`);
  }
});

uppercase.pipe(addTimestamp).pipe(process.stdout);
await $`tail -f app.log`.stdout(uppercase);
```

### Handling Both Streams {#handling-both-streams}

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm test`
  .stdout(chunk => { process.stdout.write(chunk); })
  .stderr(chunk => { process.stderr.write(chunk); });
```

These callbacks receive chunks. Use `.pipe((line: string) => ...)` for stdout lines or the process handle when a Node stream consumer is required.

## Conditional Chaining {#conditional-chaining}

### Runtime Conditions {#runtime-conditions}

```typescript
// Conditional method application
const isProduction = process.env.NODE_ENV === 'production';
const command = $`deploy.sh`;

const configured = isProduction
  ? command.env({ NODE_ENV: 'production' }).timeout(300000)
  : command.env({ NODE_ENV: 'development' }).timeout(60000);

await configured;

// Chain with conditionals
function buildCommand(options: any) {
  let cmd = $`build`;
  
  if (options.verbose) cmd = cmd.env({ VERBOSE: '1' });
  if (options.debug) cmd = cmd.env({ DEBUG: '1' });
  if (options.timeout) cmd = cmd.timeout(options.timeout);
  
  return cmd;
}
```

### Dynamic Chaining {#dynamic-chaining}

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

let command: ProcessPromise = $`pnpm build`.env({ NODE_ENV: 'production' });
if (process.env.USE_CACHE === '1') command = command.env({ USE_CACHE: '1' });
if (process.env.VERBOSE === '1') command = command.env({ VERBOSE: '1' });
await command.timeout(60_000);
```

## Error Chain Handling {#error-chain-handling}

### Error Recovery Chains {#error-recovery-chains}

```typescript
// Chain error handlers
await $`primary-command`
  .catch(() => $`fallback-command`)
  .catch(() => $`emergency-command`)
  .catch(() => {
    console.error('All commands failed');
    process.exit(1);
  });

// With specific error handling — retry configures the engine, so it's
// applied before the template tag rather than chained after it
await $.retry({ maxRetries: 3 })`risky-operation`
  .timeout(5000)
  .nothrow()
  .then(result => {
    if (!result.ok) {
      return $`recovery-operation`;
    }
    return result;
  });
```

### Try-Chain Pattern {#try-chain-pattern}

```typescript
// Try multiple approaches
async function executeWithFallbacks(target: string) {
  const attempts = [
    () => $.ssh(target)`command`,
    () => $.docker({ container: target })`command`,
    () => $`command`
  ];
  
  for (const attempt of attempts) {
    const result = await attempt().nothrow();
    if (result.ok) return result;
  }
  
  throw new Error('All attempts failed');
}
```

## Transformation Chains {#transformation-chains}

### Output Transformations {#output-transformations}

```typescript
import { $ } from '@xec-sh/core';

type Item = { name: string; active: boolean };
const names = await $`cat data.json`
  .json<{ items: Item[] }>()
  .then(data => data.items.filter(item => item.active).map(item => item.name));
console.log(names);

const lines = await $`cat file.txt`.text()
  .then(text => text.split('\n').map(line => line.trim()).filter(Boolean));
console.log(lines);
```

### Data Processing Chains {#data-processing-chains}

```typescript
import { $ } from '@xec-sh/core';

type RecordData = { name: string; active: boolean };
const records = await $`generate-csv`.pipe($`csvtojson`).json<RecordData[]>();
const names = records.filter(record => record.active).map(record => record.name.trim());
await $.writeFile('output.json', JSON.stringify(names, null, 2));
```

## Composition Patterns {#composition-patterns}

### Builder Pattern {#builder-pattern}

```typescript
import { $ } from '@xec-sh/core';

const build = $.cd('/app').env({ NODE_ENV: 'production' }).timeout('2m');
await build`pnpm build`;
```

### Pipeline Builder {#pipeline-builder}

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

async function runPipeline(commands: ProcessPromise[]) {
  const [first, ...rest] = commands;
  if (!first) throw new Error('A pipeline needs an input command');
  return rest.reduce((pipeline, command) => pipeline.pipe(command), first);
}

await runPipeline([$`cat data.txt`, $`sort`, $`uniq`]);
```

## Async Chain Operations {#async-chain-operations}

### Promise Chains {#promise-chains}

```typescript
import { $ } from '@xec-sh/core';

await $`git log -5 --oneline`
  .then(result => $.writeFile('recent-commits.txt', result.stdout))
  .finally(() => console.log('History export finished'));
```

### Sequential Execution {#sequential-execution}

```typescript
import { $, type ExecutionResult } from '@xec-sh/core';

const commands = ['pnpm install --frozen-lockfile', 'pnpm build', 'pnpm test'];
const results: ExecutionResult[] = [];
for (const command of commands) results.push(await $.exec(command));
console.log(results.map(result => result.exitCode));
```

## Advanced Chaining {#advanced-chaining}

### Middleware Pattern {#middleware-pattern}

```typescript
import { $, type CallableExecutionEngine } from '@xec-sh/core';

function configure(engine: CallableExecutionEngine) {
  return engine.timeout('10s').env({ LOG_LEVEL: 'debug' });
}
await configure($)`node --version`;
```

### Decorator Pattern {#decorator-pattern}

There is no `.on()` on `ProcessPromise` — a command has no per-instance
event hooks. Decorate the act of running it instead, by wrapping a thunk
rather than the `ProcessPromise` itself:

```typescript
// Decorate commands with additional behavior
async function withLogging<T>(run: () => Promise<T>): Promise<T> {
  console.log('Starting...');
  const result = await run();
  console.log('Complete');
  return result;
}

function withTiming<T>(run: () => Promise<T>): () => Promise<T> {
  return async () => {
    const start = Date.now();
    try {
      return await run();
    } finally {
      console.log(`Took ${Date.now() - start}ms`);
    }
  };
}

// Apply decorators
const decorated = withTiming(() => withLogging(() => $`long-operation`));
await decorated();
```

## Best Practices {#best-practices}

### Do's ✅ {#dos-}

```typescript
import { $ } from '@xec-sh/core';

let command = $`pnpm build`.env({ NODE_ENV: 'production' });
if (process.env.CI) command = command.timeout('2m');
await command;
```

### Don'ts ❌ {#donts-}

Keep each returned chain value when applying configuration conditionally. Await the final command or output method, and configure retries only for operations whose effects can safely repeat.

## Implementation Details {#implementation-details}

Chaining is implemented in:
- `packages/core/src/core/process-context.ts` - `ProcessPromise` construction and its chainable methods
- `packages/core/src/core/execution-engine.ts` - Engine-level chaining methods (`.with()`, `.retry()`, `.env()`, ...)
- `packages/core/src/core/pipe-implementation.ts` - `.pipe()`

## See Also {#see-also}

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Composition](/docs/core/execution-engine/api/composition)
- [Streaming](/docs/core/execution-engine/features/streaming)
- [Error Handling](/docs/core/execution-engine/features/error-handling)