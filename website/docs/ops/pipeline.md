---
sidebar_position: 3
sidebar_label: Pipeline
title: CI/CD Pipeline Engine
description: Sequential and parallel step execution with the Pipeline class
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
import { Pipeline } from '@xec-sh/ops';

Pipeline.create('build')
  .step('a', { run: 'echo a' })
  .step('b', { run: 'echo b', dependsOn: ['a'] })
  .step('c', { run: 'echo c', dependsOn: ['a'] })  // b and c can run in parallel
  .step('d', { run: 'echo d', dependsOn: ['b', 'c'] }) // waits for both
```

### Matrix Builds
Run the same step for each combination of parameters. Matrix values become environment variables. Select the matching runtime or remote target explicitly in the command when a variant needs a different Node version or operating system.

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('example')
  .step('test', {
  run: 'pnpm test',
  matrix: {
    node: ['22', '24'],
    os: ['linux', 'macos'],
  },
})
// Creates four parameter combinations on the current executor.
  .run();
```

### Command environment

Each command receives variables declared on the pipeline, run, matrix variant, step and command, in that order. Use a step's `env` to pass a value to an SSH target. Local commands inherit the local process environment through the local adapter. Conditions and function steps execute locally and can read host variables through `ctx.env`.

### Conditional Execution
Skip steps based on runtime conditions:

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('example')
  .step('deploy', {
  run: 'pnpm deploy',
  condition: (ctx) => ctx.branch === 'main',
})
  .run();
```

### Retry
Retry flaky steps:

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('example')
  .step('e2e', {
  run: 'pnpm test:e2e',
  retry: { maxAttempts: 3, delay: 5000 },
})
  .run();
```

### Continue on Error
Mark steps as non-blocking:

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('example')
  .step('lint', {
  run: 'pnpm lint',
  continueOnError: true,  // Pipeline continues even if lint fails
})
  .run();
```

### Function Steps
Use TypeScript functions instead of shell commands:

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('example')
  .step('validate', {
  run: async (ctx) => {
    const config = JSON.parse(await fs.readFile('config.json', 'utf-8'));
    if (!config.version) throw new Error('Missing version');
  },
})
  .run();
```

## Context

Pipeline context is available in conditions and function steps:

```typescript
import { Pipeline } from '@xec-sh/ops';

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

## Observable, cancellable execution

Commands use the asynchronous Xec engine. Set `concurrency` explicitly to run
independent step groups in parallel; its default is one. Matrix variants share
their group's slot and run sequentially. The entire graph is validated before
execution: duplicate names, unknown dependencies and cycles are errors.

```typescript
import { Pipeline } from '@xec-sh/ops';

const controller = new AbortController();
const result = await Pipeline.create('verify')
  .step('types', { run: 'pnpm typecheck' })
  .step('tests', { run: 'pnpm test' })
  .run({}, {
    concurrency: 2,
    signal: controller.signal,
    outputLimit: 64 * 1024,
    onEvent: async (event) => {
      // step-start, step-output and step-complete, with timestamps and attempts.
      // Await your journal here: observer failures cancel and reject the run.
      console.log(event);
    },
  });
console.log(result.status); // success | failed | cancelled
```

Each step retains a bounded UTF-8 output tail per stream; `outputTruncated` says
whether content was omitted. Stream observers receive all chunks with
backpressure. A verbose command does not fail merely because its retained log
is full. Persist or redact output in the host according to its own policy.

String commands use a shell. A `Command` object defaults to direct execution,
so use `{ command: process.execPath, args: ['script.mjs', userInput] }` when values
must remain data. `execute` can supply the host's existing Xec engine.

Cancellation stops admission of further steps and waits for active executors.
Function steps must cooperate with `ctx.signal`; a JavaScript function cannot
be forcibly terminated safely inside its host. For user-authored scripts use
the separate process API below. Remote cancellation signals the SSH channel;
it cannot guarantee that a remote job which daemonized or ignored signals has
stopped. Verify its state before retrying effects. Retries require idempotent
steps. `cache` remains a reserved field and does not cache execution.

## TypeScript scripts in a separate process

```typescript
import { Pipeline, prepareScript } from '@xec-sh/ops';

const script = await prepareScript(
  'const result = await $target`uname -s`; console.log(result.stdout);',
  { cwd: process.cwd(), params: { environment: 'staging' } },
);
try {
  const result = await Pipeline.create('inspect')
    .step('script', { run: script.command, timeout: 30_000 })
    .run();
  if (!result.success) throw new Error(result.steps[0]?.stderr);
} finally {
  await script.dispose();
}
```

`prepareScript` compiles TypeScript through the existing loader and supplies a
command for Xec, without evaluating the source in the caller. Scripts receive
`$`, `$target`, `params`, `args`, `argv`, `__filename` and `__dirname`.
`$` addresses the local host. With `target: { type: 'ssh', host, username,
hostKeyChecking: 'strict' }`, `$target` addresses that SSH host, while script
orchestration and JavaScript filesystem operations remain local.

Source is held in a private temporary directory beneath `cwd`, allowing normal
project module resolution. Dependencies must already be installed. Always call
`dispose()` after the command settles, including cancellation; a host crash may
leave its temporary directory for administrative cleanup. Parameters and SSH
credentials travel over stdin, not command arguments. No credential file is
created. This is process isolation, **not a security sandbox**: the script has
the invoking OS user's authority. Agent-written or untrusted code requires an
external sandbox and a separately authorized execution boundary.
