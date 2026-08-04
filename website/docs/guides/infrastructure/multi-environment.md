---
title: Working across environments
sidebar_position: 3
---

# Working across environments

The reason Xec gives every environment the same API is so that the code between
them does not have to care which one it got. This page covers the patterns that
follow from that: writing a step once, running it against many targets, and
reading the result honestly.

Xec is not an orchestrator. There is no dependency graph, no convergence loop
and no state file. What follows is ordinary TypeScript control flow over a
uniform execution API — which is enough for most deployment and maintenance
work, and easier to reason about when it goes wrong.

## A step is a function that takes an engine

This is the whole idea. A step accepts an engine, runs commands on it, and
returns a value. It does not know whether that engine is local, an SSH host, a
container or a pod.

```typescript
import { $ } from '@xec-sh/core';
import type { ExecutionEngine } from '@xec-sh/core';

async function diskFree(target: ExecutionEngine): Promise<string> {
  return target`df -Pk / | tail -1 | awk '{print $5}'`.text();
}

await diskFree($);                       // this machine
await diskFree($.ssh('deploy@web-1'));   // a remote host
await diskFree($.docker('api'));         // a container
await diskFree($.k8s('prod/api-pod'));   // a pod
```

Testing such a step needs no mocking framework: pass it an engine pointed at a
container and let it run for real.

## Running one step against many targets

`parallel` takes commands and runs them with a ceiling on how many go at once.
The ceiling is a safety control, not a tuning knob — "restart 100 hosts, five
at a time" is a different operation from "restart all 100 now".

```typescript
import { $, parallel } from '@xec-sh/core';

const hosts = ['web-1', 'web-2', 'web-3', 'web-4'];

const outcome = await parallel(
  hosts.map(host => $.ssh(`deploy@${host}`)`systemctl restart api`.nothrow()),
  { maxConcurrent: 2 }
);

console.log(`${outcome.succeeded.length} restarted, ${outcome.failed.length} failed`);
```

`.nothrow()` is what makes every host get attempted. Without it the first
failure throws and the remaining hosts are never reached — which is sometimes
what you want, and is covered below.

`succeeded` and `failed` are decided by exit code, so a host that ran the
command and returned non-zero counts as failed even though `.nothrow()` kept it
from throwing.

### Naming which target failed

`results` keeps the order you passed in, so pair it back against your list:

```typescript
const byHost = hosts.map((host, index) => ({ host, result: outcome.results[index] }));
const broken = byHost.filter(({ result }) => 'ok' in result && !result.ok);

for (const { host, result } of broken) {
  console.error(`${host}: exit ${(result as ExecutionResult).exitCode}`);
  console.error((result as ExecutionResult).stderr.trim());
}
```

### Stopping at the first bad target

For a rollout that must not continue past a failure, combine `stopOnError` with
a concurrency limit of one:

```typescript
const rollout = await parallel(
  hosts.map(host => $.ssh(`deploy@${host}`)`./deploy.sh`.nothrow()),
  { maxConcurrent: 1, stopOnError: true }
);

if (rollout.failed.length > 0) {
  throw new Error(`stopped after ${rollout.succeeded.length} of ${hosts.length}`);
}
```

## Retrying a flaky step

`retry` re-runs a command until it exits zero or the attempts run out. It is
for genuine transience — a network hiccup, a service still starting — and not
a substitute for fixing a step that fails deterministically.

```typescript
import { $, retry, RetryError } from '@xec-sh/core';

try {
  await retry(
    () => $.ssh('deploy@web-1')`curl -fsS localhost:8080/health`,
    { maxRetries: 5, initialDelay: 500, backoffMultiplier: 2 }
  );
} catch (error) {
  if (error instanceof RetryError) {
    console.error(`gave up after ${error.attempts} attempts`);
    console.error(error.lastResult.stderr);
  }
  throw error;
}
```

Delays back off exponentially with jitter by default. `isRetryable` decides
which failures are worth another attempt:

```typescript
await retry(() => $.ssh(host)`./migrate.sh`, {
  maxRetries: 3,
  // Exit 2 means the migration is already applied; retrying cannot help.
  isRetryable: result => result.exitCode !== 2,
});
```

## Stages that depend on each other

There is no graph engine, so a pipeline is `await` in the order you wrote it.
This is usually clearer than a declarative alternative, because the failure
path is visible.

```typescript
const build = $.docker('builder');
const web = $.ssh('deploy@web-1');

await build`npm ci && npm run build`;

const staged = await $.transfer.copy('docker://builder:/app/dist', '/tmp/dist', { recursive: true });
if (!staged.success) throw staged.errors?.[0] ?? new Error('could not copy dist out of builder');

const shipped = await $.transfer.copy('/tmp/dist', 'ssh://deploy@web-1/srv/app/dist', { recursive: true });
if (!shipped.success) throw shipped.errors?.[0] ?? new Error('could not copy dist to web-1');

const health = await web`curl -fsS localhost:8080/health`.nothrow();
if (!health.ok) {
  await web`systemctl restart api`;
  throw new Error(`deploy failed health check: ${health.stderr.trim()}`);
}
```

## Sharing configuration between targets

`$.with()` returns a configured engine without touching the original, so a
preset is a value you export:

```typescript
export const web = (host: string) =>
  $.ssh(`deploy@${host}`).with({
    defaultCwd: '/srv/app',
    defaultEnv: { NODE_ENV: 'production' },
    timeout: '5m',
  });

await web('web-1')`npm run migrate`;
```

To scope configuration to part of a program rather than all of it, use
`within()`. It confines the change to its own scope, including across
concurrent tasks:

```typescript
import { within } from '@xec-sh/core';

await within(async () => {
  $.defaults({ env: { DEPLOY_ID: id } });
  await Promise.all(hosts.map(host => deployTo(host)));
});
```

## What this does not give you

- **No inventory.** Targets are values in your code, or entries in `.xec/config.yaml` if you use the CLI. There is nothing that discovers hosts for you.
- **No convergence.** A step runs; it does not check whether it needs to run. If you want idempotence, write it into the step.
- **No rollback.** Recovery is whatever you write in the failure branch.
- **No scheduler.** Order comes from your control flow.

If you need those, an orchestrator is the right tool, and Xec composes with one
happily — a step that takes an engine is easy to call from anywhere.
