---
sidebar_position: 1
sidebar_label: Overview
title: "@xec-sh/ops — DevOps Operations Library"
description: "Deploy, pipelines, workflows, health checks, discovery — all as a library"
---

# @xec-sh/ops

The DevOps operations library. Use it standalone in any TypeScript/JavaScript project — no CLI required.

## Installation

```bash
pnpm add @xec-sh/ops
```

## Modules

| Module | Purpose | Key Class |
|--------|---------|-----------|
| [Deploy](./deploy) | Deployment with strategies & rollback | `Deployer` |
| [Pipeline](./pipeline) | CI/CD pipeline with matrix builds | `Pipeline` |
| [Workflow](./workflow) | DAG-based task orchestration | `Workflow` |
| [Health](./health) | HTTP/TCP/command health checks | `HealthChecker` |
| [Discovery](./discovery) | Docker/K8s/SSH infrastructure discovery | `Discovery` |
| [Release](./release) | Immutable package preparation and resumable publication | `prepareReleaseArtifacts` |
| [Retry](./retry) | Retry policies with backoff | `RetryPolicy` |
| [Config](./config) | Configuration management | `ConfigurationManager` |
| [Secrets](./secrets) | Encrypted secret storage | `SecretManager` |

## Quick Example

```typescript
import { Deployer, HealthChecker, Pipeline } from '@xec-sh/ops';

// Deploy with health verification
const deployer = Deployer.create({
  name: 'api-service',
  targets: ['web-1', 'web-2', 'web-3'],
  strategy: 'rolling',
  maxConcurrent: 1,
  hooks: {
    deploy: async (ctx) => {
      await ctx.exec`docker pull myapp:${ctx.version}`;
      await ctx.exec`docker-compose up -d`;
    },
    verify: async (ctx) => ctx.healthCheck(),
    rollback: async (ctx) => {
      await ctx.exec`docker-compose down`;
      await ctx.exec`docker pull myapp:${ctx.previousVersion}`;
      await ctx.exec`docker-compose up -d`;
    },
  },
  healthCheck: {
    url: 'http://{{target}}:8080/health',
    retries: 3,
  },
});

const result = await deployer.deploy('v1.2.3');
if (!result.success) {
  console.error('Deploy failed, rolling back...');
  await deployer.rollback();
}
```

## Design Principles

1. **Library-first** — No CLI dependency. Import and use in any project.
2. **Fluent API** — Chainable builders for readable configuration.
3. **Composable** — Each module works independently.
4. **Type-safe** — Full TypeScript with strict mode.
5. **Customizable** — Override any default via `ConfigManagerOptions`.

## Shared local build caches

`withKernelFileLock` serializes processes using the same local lock file. It supports macOS with `lockf` and Linux with `flock`. Other platforms receive an explicit error.

```typescript
import { mkdir } from 'node:fs/promises';
import { $ } from '@xec-sh/core';
import { withKernelFileLock } from '@xec-sh/ops/utils/file-lock';

await mkdir('.build-cache', { recursive: true, mode: 0o700 });
await withKernelFileLock('.build-cache/runtime.lock', async () => {
  await $`pnpm run build`;
}, 30);
```

The parent directory must belong to the current user and have private permissions. Symlinks, hard-linked lock files and files writable by other users are rejected. The acquisition timeout is supplied in seconds. Zero requests an immediate attempt.

The open file descriptor holds the lock until the callback settles. Process termination releases it in the kernel. Keep the lock file in place between operations so every participant acquires the same inode. The callback's result and failure propagate to the caller.


## Script utilities

Xec scripts receive the same utilities exposed by `@xec-sh/ops`.

```typescript
import { which, ps, parseArgs } from '@xec-sh/ops';

const executable = await which('node');
const processes = await ps();
const args = parseArgs(['--format=json', '--verbose', '--', '-literal']);
console.log({ executable, count: processes.length, args });
```

From 0.12.0, `which` is asynchronous. It uses the shared execution engine and returns `null` only for confirmed absence. Execution and transport failures propagate. `ps` also reports command and parsing failures to its caller.

`parseArgs` preserves positionals in `_`, values containing `=`, negative numeric values and arguments after `--`. Its dictionary has no object prototype. The `_` option name is reserved for positionals. For a declared option schema and short-option groups, use Node's `util.parseArgs`.
