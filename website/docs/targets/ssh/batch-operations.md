---
title: SSH Batch Operations
description: Running commands across multiple SSH hosts
keywords: [ssh, batch, parallel, multi-host]
sidebar_position: 5
---

# SSH Batch Operations

## Overview

There is no dedicated "run this on N hosts" API. Multi-host execution is plain `Promise.all`/`Promise.allSettled` over a list of `$.ssh(host)` contexts, or the CLI's `xec on` with a target pattern. (`$.batch()` exists but is unrelated: it parallelizes an array of command strings or `Command` objects against a single target, and returns a `Promise` directly rather than being callable as a tagged template — `$.batch(hosts)\`cmd\`` does not work.)

## Running on Every Host

```typescript
import { $ } from '@xec-sh/core';

const hosts = ['web1.example.com', 'web2.example.com', 'web3.example.com'];

// Fails fast: rejects as soon as any host fails
const results = await Promise.all(
  hosts.map(host => $.ssh(`deploy@${host}`)`uptime`)
);
results.forEach((r, i) => console.log(`${hosts[i]}: ${r.stdout.trim()}`));
```

```typescript
// Resilient: every host runs regardless of others failing
const settled = await Promise.allSettled(
  hosts.map(host => $.ssh(`deploy@${host}`)`systemctl status nginx`)
);

for (const [i, result] of settled.entries()) {
  if (result.status === 'fulfilled') {
    console.log(`${hosts[i]}: ${result.value.stdout.trim()}`);
  } else {
    console.error(`${hosts[i]} failed:`, result.reason.message);
  }
}
```

`.nothrow()` is usually the better fit than `Promise.allSettled` when you just want every host's result without a rejected promise to unwrap:

```typescript
const results = await Promise.all(hosts.map(host => $.ssh(`deploy@${host}`)`uptime`.nothrow()));
const failed = results.filter(r => !r.ok);
```

## Limiting Concurrency

Running `Promise.all` over hundreds of hosts opens that many SSH connections at once. Chunk the work instead:

```typescript
async function runWithConcurrency<T>(items: string[], limit: number, fn: (item: string) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...await Promise.all(chunk.map(fn)));
  }
  return results;
}

await runWithConcurrency(hosts, 5, host => $.ssh(`deploy@${host}`)`apt-get update`);
```

## Retrying Failed Hosts

`$.ssh(target).retry({ maxRetries, initialDelay, maxDelay })` retries a single host's command on failure (see [SSH Overview](./overview.md)). To retry only the hosts that failed in a batch:

```typescript
async function withHostRetry(hosts: string[], command: string, maxAttempts = 3) {
  let remaining = hosts;
  const succeeded: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts && remaining.length > 0; attempt++) {
    const results = await Promise.allSettled(
      remaining.map(host => $.ssh(`deploy@${host}`)`${command}`)
    );

    const stillFailing: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') succeeded.push(remaining[i]!);
      else stillFailing.push(remaining[i]!);
    });

    remaining = stillFailing;
    if (remaining.length > 0 && attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return { succeeded, failed: remaining };
}
```

## Rolling / Sequential Execution

For changes that must not hit every host at once, execute in order and stop on first failure:

```typescript
for (const host of hosts) {
  console.log(`Deploying to ${host}...`);
  await $.ssh(`deploy@${host}`)`
    cd /app &&
    git pull &&
    npm ci &&
    npm run build &&
    pm2 reload app
  `;
}
```

Wrap the loop body in `try`/`catch` if later hosts should still run after one fails.

## From the CLI

`xec on` executes a command against one or more configured hosts. A target pattern containing `*` or `{...}` is expanded against `.xec/config.yaml`'s `targets.hosts`:

```bash
xec on hosts.web-1 "uptime"
xec on "hosts.web-*" "systemctl status nginx" --parallel
xec on "hosts.*" --task deploy --parallel --max-concurrent 5 --fail-fast
```

`--parallel` runs across matched hosts concurrently (default max 10 concurrent, set with `--max-concurrent`); without it, hosts run one at a time. `--fail-fast` stops launching new hosts once one has failed (hosts already running are not cancelled). Target patterns match host names — there is no tag-based selection.

## Related Documentation

- [SSH Overview](./overview.md) - `.retry()` and other per-command chain methods
- [Connection Configuration](./connection-config.md) - pool sizing when fanning out to many hosts
- [Authentication](./authentication.md) - per-host credentials
