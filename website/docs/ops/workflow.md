---
sidebar_position: 4
sidebar_label: Workflow
title: DAG Workflow Engine
---

# Workflow Engine

DAG-based workflow orchestration with data passing, parallel execution, conditional branches, and failure handling.

## Basic Workflow

```typescript
import { Workflow } from '@xec-sh/ops';

const result = await Workflow.create('release')
  .task('build', async (ctx) => {
    const { stdout } = ctx.exec('pnpm build');
    return { artifact: 'dist/' };
  })
  .task('test', async (ctx) => {
    ctx.exec('pnpm test');
  }, { dependsOn: ['build'], parallel: true })
  .task('deploy', async (ctx) => {
    const { artifact } = ctx.taskOutput('build') as { artifact: string };
    ctx.exec(`rsync -az ${artifact} server:/app/`);
  }, { dependsOn: ['test'] })
  .run();
```

## Data Passing

Tasks can return data that downstream tasks consume:

```typescript
Workflow.create('etl')
  .task('extract', async () => ({ rows: 1000, file: '/tmp/data.csv' }))
  .task('transform', async (ctx) => {
    const { file } = ctx.taskOutput('extract') as { file: string };
    // Process file...
    return { processed: 1000 };
  }, { dependsOn: ['extract'] })
  .task('load', async (ctx) => {
    const { processed } = ctx.taskOutput('transform') as { processed: number };
    console.log(`Loading ${processed} records`);
  }, { dependsOn: ['transform'] })
```

## Parallel Execution

Tasks marked with `parallel: true` run concurrently if their dependencies are met:

```typescript
Workflow.create('parallel')
  .task('setup', async () => 'ready')
  .task('tests', async () => { /* ... */ }, { dependsOn: ['setup'], parallel: true })
  .task('lint', async () => { /* ... */ }, { dependsOn: ['setup'], parallel: true })
  .task('build', async () => { /* ... */ }, { dependsOn: ['setup'], parallel: true })
  .task('deploy', async () => { /* ... */ }, { dependsOn: ['tests', 'lint', 'build'] })
```

## Conditional Execution

```typescript
.task('deploy-prod', async (ctx) => { /* ... */ }, {
  dependsOn: ['build'],
  when: (ctx) => ctx.env['DEPLOY_ENV'] === 'production',
})
```

## Error Handling

### Global Failure Handler

```typescript
Workflow.create('deploy')
  .task('deploy', async () => { throw new Error('Connection refused'); })
  .onFailure(async (ctx, error) => {
    ctx.exec(`slack-notify "Deploy failed: ${error.message}"`);
  })
```

### Continue on Error

```typescript
.task('non-critical', async () => { /* may fail */ }, {
  continueOnError: true,  // Workflow continues
})
```

### Retry

```typescript
.task('flaky', async () => { /* ... */ }, {
  retry: 3,  // Retry up to 3 times
  timeout: 30000,  // 30s timeout per attempt
})
```
