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
