# Xec — Universal Execution System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@xec-sh/core.svg)](https://github.com/xec-sh/xec/blob/main/LICENSE)

Execute commands across local, SSH, Docker, and Kubernetes with a single TypeScript API. Deploy, orchestrate, and automate infrastructure at any scale.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| **[@xec-sh/core](packages/core)** | Shell execution engine — adapters for local, SSH, Docker, K8s | `pnpm add @xec-sh/core` |
| **[@xec-sh/ops](packages/ops)** | DevOps library — deploy, pipelines, workflows, health checks, discovery | `pnpm add @xec-sh/ops` |
| **[@xec-sh/kit](packages/kit)** | TUI components — prompts, spinners, tables, colors | `pnpm add @xec-sh/kit` |
| **[@xec-sh/loader](packages/loader)** | Script loading — TypeScript transform, CDN modules, REPL, plugins | `pnpm add @xec-sh/loader` |
| **[@xec-sh/testing](packages/testing)** | Test utilities — Docker/SSH helpers, binary detection | `pnpm add -D @xec-sh/testing` |
| **[@xec-sh/cli](apps/xec)** | Command-line tool — thin wrapper over @xec-sh/ops | `pnpm add -g @xec-sh/cli` |

## Quick Start

### Shell Execution

```typescript
import { $, echo, sleep, glob } from '@xec-sh/core';

// Local
await $`npm run build`;

// SSH with connection pooling
const $ssh = $.ssh({ host: 'prod.example.com', username: 'deploy' });
await $ssh`systemctl restart app`;

// Docker
await $.docker({ container: 'my-app' })`python manage.py migrate`;

// Kubernetes
await $.k8s({ pod: 'api', namespace: 'production' })`cat /var/log/app.log`;

// Utilities
await sleep('5s');
echo`Build complete!`;
const files = await glob('src/**/*.ts');
```

### DevOps Automation

```typescript
import { Deployer, Pipeline, HealthChecker, Discovery } from '@xec-sh/ops';

// Deploy with rollback
const deployer = Deployer.create({
  targets: ['web-1', 'web-2', 'web-3'],
  strategy: 'rolling',
  hooks: {
    deploy: async (ctx) => { await ctx.exec`docker pull app:${ctx.version}`; },
    verify: async (ctx) => ctx.healthCheck(),
    rollback: async (ctx) => { await ctx.exec`docker rollback`; },
  },
});
await deployer.deploy('v1.2.3');

// CI/CD Pipeline
await Pipeline.create('ci')
  .step('test', { run: 'pnpm test', matrix: { node: ['18', '20', '22'] } })
  .step('build', { run: 'pnpm build', dependsOn: ['test'] })
  .step('deploy', { run: 'pnpm deploy', dependsOn: ['build'], condition: ctx => ctx.branch === 'main' })
  .run({ branch: 'main' });

// Health checks
const report = await HealthChecker.create()
  .http('https://api.example.com/health')
  .tcp('db.example.com', 5432)
  .run();

// Infrastructure discovery
const targets = await Discovery.create()
  .docker({ label: 'env=prod' })
  .kubernetes({ namespace: 'production' })
  .scan();
```

### CLI

```bash
xec run deploy.ts                    # Execute script
xec on server-1 "systemctl restart"  # Remote execution
xec in my-container "npm test"       # Container execution
xec tasks list                       # Show configured tasks
xec watch --command "pnpm test"      # Watch mode
```

## Architecture

```
@xec-sh/cli  ──→  @xec-sh/ops  ──→  @xec-sh/core
     │                  │                   │
     └──→  @xec-sh/kit  ←──  @xec-sh/loader
                                            │
                                 @xec-sh/testing
```

- **CLI** is a thin wrapper — all logic lives in **ops**
- **ops** provides deploy, pipelines, workflows, config, secrets as a library
- **core** handles shell execution with SSH, Docker, K8s adapters
- **kit** provides TUI components (prompts, spinners, tables)
- **loader** handles script loading, CDN modules, REPL
- **testing** provides Docker/SSH test infrastructure

## Development

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

## License

MIT
