---
title: Working across environments
description: Share typed steps across local, SSH, Docker and Kubernetes targets
sidebar_position: 3
---

# Working across environments {#working-across-environments}

Xec uses one command interface across local processes, SSH hosts, Docker
containers and Kubernetes pods. Share the command step, then select its target
at the call site. The examples assume the named hosts, containers and pods
already exist and the caller has access to them.

## A step is a function that takes an engine {#a-step-is-a-function-that-takes-an-engine}

A shared step needs only the callable command interface. Target contexts expose
additional operations such as SSH transfers or Kubernetes logs.

```typescript
import { $, type ProcessPromise } from '@xec-sh/core';

type CommandTarget = (strings: TemplateStringsArray, ...values: unknown[]) => ProcessPromise;

async function diskFree(target: CommandTarget): Promise<string> {
  return target`df -Pk /`.text();
}

await diskFree($);
await diskFree($.ssh('deploy@web-1'));
await diskFree($.docker('api'));
await diskFree($.k8s({ pod: 'api-pod', namespace: 'prod', context: 'production' }));
```

## Running one step against many targets {#running-one-step-against-many-targets}

`parallel` starts lazy commands with the declared concurrency limit and waits
for their results. A read-only fleet probe can inspect every target in one run.

```typescript
import { $, parallel } from '@xec-sh/core';

const hosts = ['web-1', 'web-2', 'web-3', 'web-4'];
const outcome = await parallel(
  hosts.map(host => $.ssh(`deploy@${host}`)`systemctl is-active api`.nothrow()),
  { maxConcurrent: 2 }
);

console.log(`${outcome.succeeded.length} active, ${outcome.failed.length} failed`);
```

The default `stopOnError: false` collects both rejected commands and returned
non-zero results. `.nothrow()` preserves a failed command's result for inspection.

### Naming which target failed {#naming-which-target-failed}

`results` preserves input order. A failure can contain an execution result or
an error raised before the command could complete.

```typescript
import { $, parallel } from '@xec-sh/core';

const hosts = ['web-1', 'web-2'];
const outcome = await parallel(
  hosts.map(host => $.ssh(`deploy@${host}`)`systemctl is-active api`.nothrow()),
  { maxConcurrent: 2 }
);

for (const [index, result] of outcome.results.entries()) {
  if (result instanceof Error) {
    console.error(hosts[index], result.message);
  } else if (!result.ok) {
    console.error(hosts[index], result.exitCode, result.stderr);
  }
}
```

### Stopping at the first bad target {#stopping-at-the-first-bad-target}

Use `stopOnError` with concurrency one for a sequential rollout. Commands that
have already started are allowed to settle. Keep the input commands lazy so the
limit controls when they start.

```typescript
import { $, parallel } from '@xec-sh/core';

const hosts = ['web-1', 'web-2'];
const rollout = await parallel(
  hosts.map(host => $.ssh(`deploy@${host}`).cd('/srv/app')`./deploy.sh`.nothrow()),
  { maxConcurrent: 1, stopOnError: true }
);

if (rollout.failed.length > 0) {
  throw new Error(`Stopped after ${rollout.succeeded.length} successful deployments`);
}
```

## Retrying a flaky step {#retrying-a-flaky-step}

`retry` classifies command results using `isRetryable`. This example repeats a
read-only readiness request for selected curl failures. An SSH connection loss
with an unknown remote outcome propagates to the caller for inspection.

```typescript
import { $, retry, RetryError } from '@xec-sh/core';

const web = $.ssh('deploy@web-1');
try {
  await retry(
    () => web`curl --fail --silent --show-error --max-time 5 http://localhost:8080/health`,
    {
      maxRetries: 5,
      initialDelay: 500,
      maxDelay: 4000,
      isRetryable: result => [7, 22, 28].includes(result.exitCode),
    }
  );
} catch (error) {
  if (error instanceof RetryError) {
    console.error(`Readiness failed after ${error.attempts} attempts`);
    console.error(error.lastResult.stderr);
  }
  throw error;
}
```

For state-changing operations, determine the previous attempt's outcome and
its idempotency contract before deciding whether to execute again.

## Stages that depend on each other {#stages-that-depend-on-each-other}

For a short script, `await` makes the order explicit. SSH's public transfer
methods share its target configuration and connection handling.

```typescript
import { $ } from '@xec-sh/core';

const web = $.ssh('deploy@web-1');
await $`npm ci`;
await $`npm run build`;
await web`mkdir -p /srv/app/candidate`;
await web.uploadDirectory('./dist', '/srv/app/candidate');
await web`test -f /srv/app/candidate/index.html`;
```

For reusable build graphs, use Xec tasks with `dependsOn`, concurrency, matrix
and cache configuration. For application deployment, use the shared deployment
operations and define the application's health and rollback procedures. [Task
configuration](../../configuration/tasks/overview.md), [Deployment
operations](../../ops/deploy.md)

## Sharing configuration between targets {#sharing-configuration-between-targets}

Create a configured target once and pass it to the steps that need it.

```typescript
import { $ } from '@xec-sh/core';

export const web = (host: string) =>
  $.ssh(`deploy@${host}`).with({
    defaultCwd: '/srv/app',
    defaultEnv: { NODE_ENV: 'production' },
    timeout: '5m',
  });

console.log(await web('web-1')`node --version`.text());
```

`within()` scopes configuration to an asynchronous operation, including its
concurrent tasks.

```typescript
import { $, within } from '@xec-sh/core';

await within({ defaultEnv: { DEPLOY_ID: 'candidate-42' } }, async () => {
  await Promise.all([
    $`node -e 'console.log(process.env.DEPLOY_ID)'`,
    $`node --version`,
  ]);
});
```

## What this does not give you {#what-this-does-not-give-you}

Application-specific recovery still requires a declared procedure and a health
check. A completed command proves its own exit status. Verify the deployed
version and service state before recording a rollout as accepted. Persistent
controllers can build on these command, task and deployment APIs while owning
their application registry and recovery policy.
