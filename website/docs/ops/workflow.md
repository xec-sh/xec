---
sidebar_position: 4
sidebar_label: Workflow
title: DAG Workflow Engine
description: Asynchronous tasks with validated dependencies, data passing and cancellation
---

# Workflow Engine {#workflow-engine}

`Workflow` runs asynchronous tasks, passes their return values to dependents, and reports each task's outcome. It validates duplicate names, unknown dependencies, cycles, timeouts and retry policies before invoking any task.

## Basic Workflow {#basic-workflow}

```typescript
import { Workflow } from '@xec-sh/ops';

const result = await Workflow.create('release')
  .task('build', async ctx => {
    await ctx.exec`pnpm build`;
    return { artifact: 'dist/' };
  })
  .task('test', async ctx => {
    await ctx.exec('pnpm test');
  }, { dependsOn: ['build'] })
  .task('deliver', async ctx => {
    const { artifact } = ctx.taskOutput('build') as { artifact: string };
    await ctx.exec`rsync -az -- ${artifact} deploy@example.com:/srv/app/`;
  }, { dependsOn: ['test'] })
  .run({ env: { NODE_ENV: 'production' } });

console.log(result.success, result.tasks);
```

`ctx.exec` uses the core execution engine. A template escapes substituted values; a string is trusted shell source. Both are asynchronous. A nonzero exit fails the task. In 0.12.0, replace synchronous reads such as `ctx.exec(command).stdout` with `(await ctx.exec(command)).stdout`.

To inspect an expected nonzero exit, pass a normal core `Command` with `throwOnNonZeroExit: false`:

```typescript
import { Workflow } from '@xec-sh/ops';

const result = await Workflow.create('check')
  .task('revision', async ctx => {
    const answer = await ctx.exec({
      command: 'git', args: ['rev-parse', '--verify', 'HEAD'], shell: false,
      throwOnNonZeroExit: false,
    });
    return { initialized: answer.exitCode === 0 };
  }).run();
console.log(result.tasks);
```

All commands started with `ctx.exec` belong to the task attempt. Completion waits for them, including a command whose promise was accidentally not awaited. An unexpected command failure invalidates that attempt; use an explicit nonthrowing command when failure is an expected result.

## Data Passing {#data-passing}

`ctx.taskOutput(name)` returns a successful task's value as `unknown`. Narrow it to the contract shared by those tasks. `ctx.vars` is the run's shared application state; `ctx.env` exposes the environment and declared overrides. These do not replace dependency declarations.

A failed task blocks its descendants. An independent branch can still finish. A false `when` condition produces a skipped task without treating it as a failure.

## Parallel Execution {#parallel-execution}

Ready tasks with `parallel: true` execute concurrently; other ready tasks execute sequentially. Declaring a dependency prevents a task from starting before its inputs have settled.

```typescript
import { Workflow } from '@xec-sh/ops';

const result = await Workflow.create('checks')
  .task('install', async ctx => { await ctx.exec`pnpm install --frozen-lockfile`; })
  .task('tests', async ctx => { await ctx.exec`pnpm test`; }, { dependsOn: ['install'], parallel: true })
  .task('types', async ctx => { await ctx.exec`pnpm typecheck`; }, { dependsOn: ['install'], parallel: true })
  .task('build', async ctx => { await ctx.exec`pnpm build`; }, { dependsOn: ['tests', 'types'] })
  .run();
console.log(result.summary);
```

## Conditional Execution {#conditional-execution}

```typescript
import { Workflow } from '@xec-sh/ops';

await Workflow.create('preview')
  .task('inspect', async ctx => { await ctx.exec`git status --short`; }, {
    when: ctx => ctx.env['INSPECT'] === 'true',
  }).run({ env: { INSPECT: 'true' } });
```

## Error Handling {#error-handling}

### Global Failure Handler {#global-failure-handler}

A configured `onFailure` handler runs once after tasks settle. It has a fresh bounded cleanup scope, so cancellation of the original run does not prevent the requested cleanup. A failure of this handler is recorded as `failureHandlerError`; it does not replace the original task error.

```typescript
import { Workflow } from '@xec-sh/ops';

const result = await Workflow.create('release')
  .task('build', async ctx => { await ctx.exec`pnpm build`; })
  .onFailure(async (ctx, error) => {
    ctx.log(`Build failed: ${error.message}`);
  }).run();
console.log(result.failureHandlerError);
```

### Continue on Error {#continue-on-error}

`continueOnError: true` allows dependents to proceed after a failed task. Its result remains `status: 'failed'` with `continued: true`; the summary still counts the failure. A run can succeed with these explicitly tolerated failures. Cancellation is never treated as a tolerated failure.

### Retry {#retry}

`retry` is the maximum number of attempts, including the first. A retry starts only after the preceding callback and its commands have finished. Set it only for operations that are safe to repeat.

```typescript
import { Workflow } from '@xec-sh/ops';

await Workflow.create('network-check')
  .task('probe', async ctx => {
    const response = await fetch('https://example.com/health', { signal: ctx.signal });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }, { timeout: 5000, retry: 3 })
  .run();
```

## Cancellation {#cancellation}

Pass `signal` to `run`. Core commands inherit it and the attempt deadline. Function tasks must pass `ctx.signal` to their own asynchronous work and finish their cleanup before returning. A timeout does not make unfinished JavaScript disappear: the runner waits for the callback, and does not start a retry while it is still running.
