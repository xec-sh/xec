---
sidebar_position: 3
sidebar_label: Pipeline
title: CI/CD Pipeline Engine
---

# Pipeline Engine

Define multi-step CI/CD pipelines with dependency DAG, matrix builds, conditional execution, and retry.

## Basic Pipeline

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('ci')
  .env({ NODE_ENV: 'test' })
  .step('install', { run: 'pnpm install' })
  .step('lint', { run: 'pnpm lint', dependsOn: ['install'] })
  .step('test', { run: 'pnpm test', dependsOn: ['install'] })
  .step('build', { run: 'pnpm build', dependsOn: ['lint', 'test'] })
  .run();

console.log(result.summary); // { total: 4, passed: 4, failed: 0, skipped: 0 }
```

## Features

### Dependencies
Steps run only when their dependencies complete:

```typescript
Pipeline.create('build')
  .step('a', { run: 'echo a' })
  .step('b', { run: 'echo b', dependsOn: ['a'] })
  .step('c', { run: 'echo c', dependsOn: ['a'] })  // b and c can run in parallel
  .step('d', { run: 'echo d', dependsOn: ['b', 'c'] }) // waits for both
```

### Matrix Builds
Run the same step across multiple configurations:

```typescript
.step('test', {
  run: 'pnpm test',
  matrix: {
    node: ['18', '20', '22'],
    os: ['linux', 'macos'],
  },
})
// Creates 6 test runs: node18+linux, node18+macos, node20+linux, ...
```

### Conditional Execution
Skip steps based on runtime conditions:

```typescript
.step('deploy', {
  run: 'pnpm deploy',
  condition: (ctx) => ctx.branch === 'main',
})
```

### Retry
Retry flaky steps:

```typescript
.step('e2e', {
  run: 'pnpm test:e2e',
  retry: { maxAttempts: 3, delay: 5000 },
})
```

### Continue on Error
Mark steps as non-blocking:

```typescript
.step('lint', {
  run: 'pnpm lint',
  continueOnError: true,  // Pipeline continues even if lint fails
})
```

### Function Steps
Use TypeScript functions instead of shell commands:

```typescript
.step('validate', {
  run: async (ctx) => {
    const config = JSON.parse(await fs.readFile('config.json', 'utf-8'));
    if (!config.version) throw new Error('Missing version');
  },
})
```

## Context

Pipeline context is available in conditions and function steps:

```typescript
const result = await Pipeline.create('release')
  .env({ CI: 'true' })
  .step('deploy', {
    run: async (ctx) => {
      console.log(ctx.env.CI);        // 'true'
      console.log(ctx.branch);        // from run() options
      console.log(ctx.outputs);       // step outputs
    },
    condition: (ctx) => ctx.branch === 'main',
  })
  .run({ branch: 'main', commit: 'abc123' });
```
