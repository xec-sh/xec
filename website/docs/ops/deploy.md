---
sidebar_position: 2
sidebar_label: Deploy
title: Deployment Engine
description: Explicit deployment hooks, target concurrency, verification and recovery
---

# Deployment Engine

`Deployer` coordinates hooks for a list of target identifiers. The hooks perform deployment and any traffic switch. A target name alone does not select an SSH connection: `ctx.exec` executes locally unless its `Command` explicitly names an adapter.

## Basic Usage

```typescript
import { Deployer } from '@xec-sh/ops';

const deployer = Deployer.create({
  name: 'api', targets: ['web-1.example.com', 'web-2.example.com'],
  strategy: 'rolling', maxConcurrent: 1, abortOnFirstFailure: true,
  timeout: 120_000,
  hooks: {
    deploy: async ctx => {
      await ctx.exec({
        command: 'deployctl', args: ['activate', ctx.version],
        adapter: 'ssh',
        adapterOptions: { type: 'ssh', host: ctx.target, username: 'deploy' },
      });
    },
    rollback: async ctx => {
      if (!ctx.previousVersion) throw new Error('No previous version recorded');
      await ctx.exec({
        command: 'deployctl', args: ['activate', ctx.previousVersion],
        adapter: 'ssh',
        adapterOptions: { type: 'ssh', host: ctx.target, username: 'deploy' },
      });
    },
  },
});

const result = await deployer.deploy('v1.2.3');
console.log(result.success, result.targets);
```

`deployctl` in this example is the application's own deployment command. Xec owns transport, cancellation and execution results; the application defines how a release becomes active.

## Strategies

| Strategy | Scheduling |
| --- | --- |
| `rolling` | At most `maxConcurrent` targets; the default limit is one. |
| `canary` | First target once, verify it, then roll through the remaining targets. |
| `all-at-once` | Start all targets concurrently. |
| `blue-green` | Same concurrent hook scheduling; provisioning and traffic switching remain explicit hook responsibilities. |

`strategy` is required. With `abortOnFirstFailure`, rolling scheduling stops admitting new targets after a failure, but waits for all in-flight targets. Targets not attempted are recorded with `skipped: true` and `success: false`.

## Health Checks

A configured health check runs after the deploy hook unless a custom `verify` hook replaces it. If both URL and command are supplied, both must pass. `retries` counts attempts; `interval` is the delay between failed attempts.

```typescript
import { Deployer } from '@xec-sh/ops';

const deployer = Deployer.create({
  name: 'api', targets: ['web-1.example.com'], strategy: 'rolling',
  healthCheck: { url: 'https://{{target}}/health', timeout: 5000, retries: 3, interval: 1000 },
  hooks: {
    deploy: async ctx => {
      await ctx.exec`deployment-tool --target ${ctx.target} --version ${ctx.version}`;
    },
  },
});
console.log(await deployer.deploy('v1.2.3'));
```

`healthCheck.command` is trusted local shell source. An unquoted `{{target}}` placeholder is replaced with a shell-quoted argument. Do not surround that placeholder with additional shell quotes. Prefer `verify` and an ordinary `ctx.exec` template or literal argument vector for more complex checks.

## Hooks

| Hook | When |
| --- | --- |
| `beforeDeploy` | Before the target's deployment. |
| `deploy` | Required deployment action. |
| `verify` | Optional verification; returning false fails the target. |
| `afterDeploy` | After successful verification. |
| `rollback` | Explicit recovery after a target fails. |
| `onError` | Error handling after recovery has settled. |

The context contains `target`, `version`, `previousVersion`, `attempt`, `signal`, `exec`, `healthCheck()` and `log()`. Templates escape substituted data. String commands remain supported as trusted shell source. Both forms return a promise of the core `ExecutionResult` and reject on unexpected nonzero exits.

All started `ctx.exec` commands are joined before the hook operation completes. Use a `Command` with `throwOnNonZeroExit: false` for an expected nonzero result. `env` and `cwd` in deployment configuration apply to local hook commands.

## Rollback

A target failure invokes its configured rollback hook only after the original operation has settled. Recovery receives a fresh bounded cancellation scope. `rolledBack: true` means that hook completed successfully; `rollbackError` and `handlerError` expose recovery or error-handler failures.

The explicit `deployer.rollback()` method re-deploys the last known-good version through the deployment hooks. After a successful deployment that is the previous successful version; after a failed deployment it is the last successful version. Version history is in memory, and a failed first deployment has no known-good version to restore.

## Result

`success` requires successful results for every target. `targets` preserves configured order and includes error, duration and recovery fields. `summary` counts total targets, successful targets, failures and successful rollback hooks.

## Cancellation

`deploy(version, { signal })` and `rollback({ signal })` accept an `AbortSignal`. Core commands inherit cancellation and a per-target deadline (`timeout`, default five minutes). Custom hooks must pass `ctx.signal` to asynchronous work. The operation waits for hook cleanup and native command completion; it does not return success while they are still running.
