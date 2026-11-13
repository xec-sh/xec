---
title: Composition
description: Building workflows by composing execution primitives
---

# Composition

Composition enables building complex execution workflows by combining simple, reusable components into sophisticated automation patterns.

## Overview

Compose typed target contexts, lazy commands, pipes and bounded parallel batches. Reuse Xec tasks for workflows with dependencies. Each example below defines its own required inputs.

## Function Composition

### Basic Composition

```typescript
import { $, type CallableExecutionEngine } from '@xec-sh/core';

function production(engine: CallableExecutionEngine) {
  return engine.env({ NODE_ENV: 'production' }).timeout('2m');
}
await production($)`pnpm build`;
```

### Command Factories

```typescript
// Create reusable command factories
function createBuildCommand(env: string) {
  return $`npm run build`
    .env({ NODE_ENV: env })
    .timeout(60000)
    .cwd('/app');
}

// Use factories
await createBuildCommand('production');
await createBuildCommand('staging');

// Parameterized factories
function createDeployCommand(options: {
  environment: string;
  region: string;
  version: string;
}) {
  return $`deploy.sh`
    .env({
      ENVIRONMENT: options.environment,
      AWS_REGION: options.region,
      VERSION: options.version
    })
    .timeout(300000);
}
```

## Pipeline Composition

### Linear Pipelines

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

async function runPipeline(input: string) {
  let pipeline: ProcessPromise = $.with({ stdin: input })`jq '.items[] | select(.active)'`;
  pipeline = pipeline.pipe($`jq -s length`);
  return pipeline.json<number>();
}

console.log(await runPipeline(JSON.stringify({ items: [{ active: true }] })));
```

### Branching Pipelines

```typescript
import { $ } from '@xec-sh/core';

const input = JSON.stringify({ items: [1, 2, 3] });
const [formatted, count] = await Promise.all([
  $.with({ stdin: input })`jq .`.text(),
  $.with({ stdin: input })`jq '.items | length'`.json<number>(),
]);
console.log(formatted, count);
```

## Parallel Composition

### Concurrent Execution

```typescript
import { $, parallel } from '@xec-sh/core';

const servers = ['web-1.example.com', 'web-2.example.com'];
const probes = servers.map(host => $.ssh({ host, username: 'deploy' })`systemctl is-active api`.nothrow());
const outcomes = await parallel(probes, { maxConcurrent: 3 });
outcomes.results.forEach((result, index) => console.log(servers[index], result));
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Service checks failed');
```

### Fan-out/Fan-in

```typescript
import { $, parallel, type ProcessPromise } from '@xec-sh/core';

async function sumBatches(values: number[]) {
  const batches: ProcessPromise[] = [];
  for (let offset = 0; offset < values.length; offset += 10) {
    batches.push($.with({ stdin: JSON.stringify(values.slice(offset, offset + 10)) })`jq add`);
  }
  const outcomes = await parallel(batches, { maxConcurrent: 4 });
  if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Batch failed');
  return outcomes.succeeded.reduce((total, result) => total + result.json<number>(), 0);
}

console.log(await sumBatches([1, 2, 3]));
```

## Sequential Composition

### Ordered Operations

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm install --frozen-lockfile`;
await $`pnpm build`;
await $`pnpm test`;
```

### Dependent Operations

```typescript
import { $ } from '@xec-sh/core';

const revision = (await $`git rev-parse HEAD`.text()).trim();
await $`pnpm build`.env({ SOURCE_REVISION: revision });
await $`pnpm test`;
```

## Conditional Composition

### Runtime Branching

```typescript
import { $ } from '@xec-sh/core';

async function check(options: { build: boolean; integration: boolean }) {
  if (options.build) await $`pnpm build`;
  await $`pnpm test:unit`;
  if (options.integration) await $`pnpm test:integration`;
}
await check({ build: true, integration: process.env.CI === 'true' });
```

### Strategy Pattern

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

type Target = (strings: TemplateStringsArray, ...values: unknown[]) => ProcessPromise;
const inspect = (target: Target) => target`node --version`.text();

console.log(await inspect($.local()));
console.log(await inspect($.ssh({ host: 'worker.example.com', username: 'deploy' })));
console.log(await inspect($.docker('worker')));
```

## Higher-Order Compositions

### Command Decorators

```typescript
import { $ } from '@xec-sh/core';

async function measure<T>(name: string, command: PromiseLike<T>): Promise<T> {
  const started = performance.now();
  try {
    return await command;
  } finally {
    console.log(name, performance.now() - started);
  }
}
await measure('build', $`pnpm build`);
```

### Monadic Composition

```typescript
import { $ } from '@xec-sh/core';

const config = await $`cat config.json`.json<{ database: { host: string } }>();
console.log(config.database.host);
```

The output method returns a promise that composes with `then`, `catch` and `finally`. A generic JSON type describes the expected shape. Validate data from untrusted sources before using it.

## Workflow Composition

### Complex Workflows

```yaml
tasks:
  install:
    command: pnpm install --frozen-lockfile
  build:
    dependsOn: [install]
    command: pnpm build
  test:
    dependsOn: [build]
    command: pnpm test
  check:
    dependsOn: [test]
    command: pnpm lint
```

## Best Practices

### Do's ✅

```typescript
import { $, type CallableExecutionEngine } from '@xec-sh/core';

function configureBuild(engine: CallableExecutionEngine, cwd: string) {
  return engine.cd(cwd).env({ NODE_ENV: 'production' }).timeout('2m');
}

await configureBuild($, '/srv/app')`pnpm build`;
```

### Don'ts ❌

Keep dependency ordering in Xec tasks and data transformations in small typed functions. Preserve command failures and identify the failed operation. Repeating a deployment after an unknown transport outcome requires checking its actual state.

## Implementation Details

Command configuration, pipeline execution and result handling are implemented by the core engine. Dependency scheduling belongs to Xec tasks. Run the task graph above with `xec run check`.

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Chaining](/docs/core/execution-engine/api/chaining)
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution)
- [Error Handling](/docs/core/execution-engine/features/error-handling)