---
title: Chaining Patterns
description: Compose execution settings, pipelines, and result transformations with public Xec APIs
---

# Method Chaining Patterns {#method-chaining-patterns}

Configure a command before starting it, await its outcome, then transform its result. Shared engines carry defaults across commands. Pipeline and Workflow describe dependencies across steps.

## Basic Method Chaining {#basic-method-chaining}

### ProcessPromise Chain Methods {#processpromise-chain-methods}

```typescript
import { $ } from '@xec-sh/core';

const result = await $`pnpm test`
  .cwd('./app')
  .env({ CI: 'true' })
  .timeout('2m')
  .quiet();
console.log(result.exitCode);
```

Each command executes once. Repeatedly awaiting the same `ProcessPromise` observes the same execution. Apply modifiers before awaiting, reading `.spawned`, or piping its result.

### Conditional Chaining {#conditional-chaining}

```typescript
import { $ } from '@xec-sh/core';

const command = $`pnpm test`.timeout(process.env.CI ? '5m' : '2m');
if (process.env.CI) command.env({ CI: 'true' });
await command;
```

## Builder Pattern Chains {#builder-pattern-chains}

### Command Builder {#command-builder}

An engine configured with `.cd()`, `.env()`, and `.timeout()` supplies reusable defaults. Per-command modifiers can override them.

```typescript
import { $ } from '@xec-sh/core';

const app = $.cd('./app').env({ NODE_ENV: 'test' }).timeout('2m');
await app`pnpm lint`;
await app`pnpm test`.timeout('5m');
```

### Pipeline Builder {#pipeline-builder}

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('verify')
  .step('types', { run: 'pnpm typecheck', timeout: 120_000 })
  .step('test', { run: 'pnpm test', timeout: 300_000 })
  .step('build', { run: 'pnpm build', dependsOn: ['types', 'test'] })
  .run({}, { concurrency: 2 });

if (!result.success) throw new Error('Verification failed');
```

Pipeline validates dependencies before execution. Its result includes failed, skipped, and cancelled steps. The caller must inspect `success` when deciding whether to continue.

## Functional Chaining {#functional-chaining}

### Pipe Function Composition {#pipe-function-composition}

Transform completed output with ordinary typed functions.

```typescript
import { $ } from '@xec-sh/core';

const branches = (await $`git branch --format=${'%(refname:short)'}`.lines())
  .map(branch => branch.trim())
  .filter(Boolean)
  .sort();
console.log(branches);
```

### Chainable Wrapper {#chainable-wrapper}

Use the public engine to bind an application directory once. A small domain function can return its `ProcessPromise`, preserving `.timeout()`, `.signal()`, and `.nothrow()` for callers.

```typescript
import { $ } from '@xec-sh/core';

function checkProject(directory: string) {
  return $.cd(directory)`pnpm typecheck`;
}
await checkProject('./app').timeout('2m');
```

## Complex Chain Patterns {#complex-chain-patterns}

### Branching Chains {#branching-chains}

```typescript
import { $ } from '@xec-sh/core';

const branch = await $`git branch --show-current`.text();
if (branch.trim() === 'main') {
  await $`pnpm test`;
} else {
  await $`pnpm typecheck`;
}
```

### Chain Router {#chain-router}

Validate an external choice against the commands your application permits. Keep script text owned by the application.

```typescript
import { $ } from '@xec-sh/core';

const commands = new Map([
  ['test', 'pnpm test'],
  ['build', 'pnpm build'],
]);
const command = commands.get(process.argv[2] ?? 'test');
if (!command) throw new Error('Choose test or build');
await $.exec(command).timeout('5m');
```

## Async Chain Patterns {#async-chain-patterns}

### Sequential Chain {#sequential-chain}

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm install --frozen-lockfile`;
await $`pnpm build`;
await $`pnpm test`;
```

The default command behavior throws on a failed exit. A failed install therefore prevents the next statement from running.

### Parallel Chain {#parallel-chain}

Submit command descriptions to the scheduler so it controls when each command starts.

```typescript
import { $ } from '@xec-sh/core';

const result = await $.parallel.settled(
  ['pnpm typecheck', 'pnpm lint', 'pnpm test'],
  { maxConcurrent: 2, timeout: 300_000 },
);
if (result.failed.length) throw new AggregateError(result.failed, 'Checks failed');
```

A promise that has already started consumes resources before the scheduler receives it. Pass strings or `Command` objects when the concurrency limit must control dispatch.

## Transformation Chains {#transformation-chains}

### Result Transformer Chain {#result-transformer-chain}

```typescript
import { $ } from '@xec-sh/core';

const result = await $`git status --porcelain`.quiet();
const paths = result.stdout.split(/\r?\n/).filter(Boolean).map(line => line.slice(3));
console.log({ changedFiles: paths.length, paths });
```

`ProcessPromise.pipe()` transforms buffered command output after completion. Live output uses `.stdout()`, `.stderr()`, or the async line iterator. See [stream processing](./streaming.md).

## Complete Chaining Example {#complete-chaining-example}

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('package')
  .env({ CI: 'true' })
  .step('install', { run: 'pnpm install --frozen-lockfile', timeout: 180_000 })
  .step('types', { run: 'pnpm typecheck', dependsOn: ['install'], timeout: 120_000 })
  .step('test', { run: 'pnpm test', dependsOn: ['install'], timeout: 300_000 })
  .step('build', { run: 'pnpm build', dependsOn: ['types', 'test'], timeout: 180_000 })
  .run({}, {
    concurrency: 2,
    onEvent(event) {
      if (event.type === 'step-complete') console.log(event.step, event.result.success);
    },
  });

if (!result.success) process.exitCode = 1;
```
