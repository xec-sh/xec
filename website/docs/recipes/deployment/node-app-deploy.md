---
title: Node.js Application Deployment
description: Deploy Node.js services with explicit release and acceptance contracts
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/deploy/index.ts
  - packages/ops/src/config/target-resolver.ts
---

# Node.js Application Deployment

## Problem

A source update, dependency installation, process switch and healthy application are different states. Deployment must preserve that distinction and provide a known recovery path.

## Solution

Use the shared `Deployer` to coordinate targets. The application owns its release installation, process manager, database compatibility and durable previous-release record. Xec coordinates hooks and reports each target’s outcome; it does not infer that protocol from `git pull` or a process name.

## Quick Example

The target already contains the reviewed `deploy:release` and `verify:release` package scripts. Pass an immutable release identifier rather than `latest`.

```typescript
const version = args[0];
if (!version || !/^[a-f0-9]{40}$/.test(version)) throw new Error('Pass a full release commit');
const server = $.ssh({ host: 'staging.example.com', username: 'deploy' }).cd('/srv/app');
await server`npm run deploy:release -- ${version}`;
await server`npm run verify:release -- ${version}`;
```

These two package scripts must actually install/activate and verify that release. Xec does not provide commands with those application-specific names.

## Complete Deployment Recipe

### Configuration

```yaml
version: '1.0'
targets:
  hosts:
    staging:
      type: ssh
      host: staging.example.com
      user: deploy
      hostKeyChecking: strict
    production:
      type: ssh
      host: production.example.com
      user: deploy
      hostKeyChecking: strict
tasks:
  deploy:
    description: Deploy and verify a prepared release
    params:
      - name: commit
        required: true
    command: xec run scripts/deploy.ts ${params.commit}
```

Provision the expected host key and credentials before running. The application’s deployment entry point must serialize conflicting updates to the same installation.

### Deployment Script

```typescript
// scripts/deploy.ts
import { ConfigurationManager, TargetResolver, createTargetEngine, Deployer } from '@xec-sh/ops';
const version = args[0] ?? process.env.RELEASE_COMMIT;
const environment = process.env.DEPLOY_TARGET ?? 'staging';
if (environment !== 'staging' && environment !== 'production') throw new Error('Select staging or production');
if (!version || !/^[a-f0-9]{40}$/.test(version)) throw new Error('Pass a full release commit');
const config = new ConfigurationManager();
await config.load();
const target = await new TargetResolver(config.getConfig()).resolve(`hosts.${environment}`);
const server = (await createTargetEngine(target)).cd('/srv/app');
const result = await Deployer.create({
  name: 'node-service',
  targets: [target.id],
  strategy: 'rolling',
  maxConcurrent: 1,
  abortOnFirstFailure: true,
  timeout: 300_000,
  hooks: {
    beforeDeploy: async ctx => { await server`npm run deploy:prepare -- ${ctx.version}`.signal(ctx.signal); },
    deploy: async ctx => { await server`npm run deploy:activate -- ${ctx.version}`.signal(ctx.signal); },
    verify: async ctx => (await server`npm run verify:release -- ${ctx.version}`.signal(ctx.signal).nothrow()).ok,
    rollback: async ctx => { await server`npm run deploy:restore-reviewed`.signal(ctx.signal); }
  }
}).deploy(version);
console.log(result);
if (!result.success) throw new Error('Deployment failed; inspect target and rollback results');
```

`deploy:prepare` checks the archive, compatibility and available recovery release without switching processes. `deploy:activate` switches the installation. `verify:release` checks both identity and behavior. `deploy:restore-reviewed` restores the durable previously accepted state and verifies it; it must be safe when preparation failed before activation. Define these scripts in the target project. The in-memory `Deployer` result is not a durable release ledger.

### Pre-deployment Checks

Before the first mutation, verify the target identity, available disk space, exact artifact digest, schema compatibility and recovery artifact. Run the project’s declared checks:

```typescript
const server = $.ssh({ host: 'staging.example.com', username: 'deploy' }).cd('/srv/app');
await server`node --version`;
await server`npm run deploy:preflight`;
```

Do not reinstall production dependencies in the active directory as a preflight probe.

### Post-deployment Validation

```typescript
import { HealthChecker } from '@xec-sh/ops';
const expected = args[0];
if (!expected) throw new Error('Pass the expected release identity');
await HealthChecker.create().http('https://staging.example.com/health', { status: 200, timeout: 3000 })
  .waitUntilHealthy({ timeout: 30_000, interval: 1000 });
await $.ssh({ host: 'staging.example.com', username: 'deploy' }).cd('/srv/app')
  `npm run verify:release -- ${expected}`;
```

HTTP 200 alone cannot distinguish the new release from the old process that is still serving traffic.

## Zero-Downtime Deployment

Availability depends on the application’s readiness contract, spare capacity, connection draining and compatible state transitions. A rolling strategy only controls target ordering; it cannot turn a single process or an incompatible migration into a zero-downtime update. Test the actual transition and recovery before making that guarantee.

## Docker-based Deployment

Use the [Docker deployment recipe](docker-deploy.md) for an immutable image and an explicit Compose project. Avoid building on each production host or retagging an unknown image as the previous release.

## Usage Examples

```bash
xec run scripts/deploy.ts 0123456789abcdef0123456789abcdef01234567
```

The example identifier must be replaced with a real, prepared release available to the target.

## Best Practices

Keep preparation, activation and acceptance separate. Retain the prior artifact and data-recovery policy. Use a per-installation lock, bounded operations and explicit application identity checks. Do not retry a partially completed mutation until its result is known.

## Common Patterns

### Environment-specific Configuration

Resolve declared configuration rather than interpreting the environment name as a hostname:

```typescript
import { ConfigurationManager, TargetResolver, createTargetEngine } from '@xec-sh/ops';
const environment = args[0];
if (environment !== 'staging' && environment !== 'production') throw new Error('Select staging or production');
const config = new ConfigurationManager();
await config.load();
const target = await new TargetResolver(config.getConfig()).resolve(`hosts.${environment}`);
const engine = await createTargetEngine(target);
await engine`hostname`;
```

A missing production target fails; it never silently selects the local machine.

### Parallel Deployment

For independent installations, configure `Deployer` with `strategy: 'rolling'` and a reviewed `maxConcurrent` limit. The hooks must resolve `ctx.target` to that installation’s engine. Avoid a second unbounded `Promise.all` around an already managed deployment.

### Sequential Deployment with Validation

Use `maxConcurrent: 1` and `abortOnFirstFailure: true`. The next target starts only after the preceding target’s hooks and verification complete; a failed target and skipped targets remain visible in the result.

## Troubleshooting

### Deployment Fails

Inspect the result and named target before retrying:

```typescript
await $.ssh({ host: 'staging.example.com', username: 'deploy' }).cd('/srv/app')`npm run deploy:status`;
```

The application’s `deploy:status` should identify the selected release and any incomplete transition.

### Rollback Procedure

Use the recorded recovery release and its verified artifact, not a guessed Git revision. The rollback hook has its own bounded recovery scope and its failure is reported separately. Restoring code does not reverse database changes; incompatible data migrations require their own recovery plan.

## Related Topics

- [Docker Deployment](docker-deploy.md)
- [Health Checks](../maintenance/health-checks.md)
- [Backup and Restore](../maintenance/backup-restore.md)
- [Deployment API](../../ops/deploy.md)
