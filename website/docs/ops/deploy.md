---
sidebar_position: 2
sidebar_label: Deploy
title: Deployment Engine
---

# Deployment Engine

Deploy to multiple targets with rolling, blue-green, canary, or all-at-once strategies.

## Basic Usage

```typescript
import { Deployer } from '@xec-sh/ops';

const deployer = Deployer.create({
  name: 'my-service',
  targets: ['server-1', 'server-2'],
  strategy: 'rolling',
  hooks: {
    deploy: async (ctx) => {
      ctx.log(`Deploying ${ctx.version} to ${ctx.target}`);
      await ctx.exec`docker pull myapp:${ctx.version}`;
      await ctx.exec`docker-compose up -d`;
    },
  },
});

const result = await deployer.deploy('v1.2.3');
console.log(result.summary); // { total: 2, succeeded: 2, failed: 0, rolledBack: 0 }
```

## Strategies

### Rolling (default)
Deploy one target at a time. If one fails, stop.

```typescript
Deployer.create({
  strategy: 'rolling',
  maxConcurrent: 1,        // One at a time
  abortOnFirstFailure: true, // Stop on first failure
  // ...
});
```

### Blue-Green
Deploy to all targets simultaneously, then switch traffic.

```typescript
Deployer.create({
  strategy: 'blue-green',
  // ...
});
```

### Canary
Deploy to first target, verify, then roll out to rest.

```typescript
Deployer.create({
  strategy: 'canary',
  // First target is the canary — if it fails, rest are skipped
  // ...
});
```

### All-at-Once
Deploy to all targets in parallel.

```typescript
Deployer.create({
  strategy: 'all-at-once',
  // ...
});
```

## Health Checks

```typescript
Deployer.create({
  healthCheck: {
    url: 'http://{{target}}:8080/health',  // {{target}} replaced with each target
    command: 'curl -sf http://localhost/health',
    timeout: 10_000,
    retries: 3,
    interval: 2000,
  },
  // ...
});
```

## Hooks

All hooks receive a `DeployContext`:

```typescript
interface DeployContext {
  target: string;           // Current target being deployed
  version: string;          // Version being deployed
  previousVersion?: string; // Previous version (for rollback)
  attempt: number;          // Current attempt number
  exec: (cmd) => Promise<{ stdout, exitCode }>; // Execute shell command
  healthCheck: () => Promise<boolean>;            // Run health check
  log: (message) => void;                         // Log message
}
```

Available hooks:

| Hook | When | Required |
|------|------|----------|
| `beforeDeploy` | Before deploying to a target | No |
| `deploy` | The actual deployment | **Yes** |
| `afterDeploy` | After successful deployment | No |
| `verify` | Health verification | No |
| `rollback` | On failure | No |
| `onError` | On any error | No |

## Rollback

```typescript
const result = await deployer.deploy('v1.2.3');

if (!result.success) {
  // Automatic rollback uses the rollback hook
  await deployer.rollback();
}
```

## Result

```typescript
interface DeployResult {
  success: boolean;
  version: string;
  strategy: DeployStrategy;
  duration: number;
  targets: DeployTargetResult[];
  summary: { total, succeeded, failed, rolledBack };
}
```
