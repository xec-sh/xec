---
title: Docker Container Deployment
description: Deploy immutable container images with explicit readiness and recovery
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/deploy/index.ts
  - packages/ops/src/config/target-resolver.ts
---

# Docker Container Deployment

## Problem

Deploy an exact container image while preserving persistent data and retaining a usable recovery image.

## Solution

Let Docker Compose own the service declaration and Xec own command execution and acceptance. Use a recorded image digest, a named Compose project and a real application healthcheck. A running container is not automatically healthy.

## Quick Example

```typescript
const image = process.env.APP_IMAGE;
if (!image || !/@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('APP_IMAGE must be a pinned image digest');
const docker = $.env({ APP_IMAGE: image });
await docker`docker compose --project-name myapp -f compose.production.yaml pull`;
await docker`docker compose --project-name myapp -f compose.production.yaml up -d --wait --wait-timeout 120`;
await docker`npm run verify:container-release -- ${image}`;
```

The project provides `verify:container-release`, which checks the serving application identity and behavior. [Compose’s wait option](https://docs.docker.com/reference/cli/docker/compose/up/) uses the service’s declared health contract.

## Complete Docker Deployment Recipes

### Configuration

```yaml
# compose.production.yaml — the Node application exposes /health.
services:
  app:
    image: ${APP_IMAGE:?Set the accepted image digest}
    ports:
      - 127.0.0.1:3000:3000
    restart: unless-stopped
    healthcheck:
      test:
        - CMD
        - node
        - --input-type=module
        - -e
        - "const r = await fetch('http://127.0.0.1:3000/health', {signal: AbortSignal.timeout(2000)}); if (!r.ok) process.exitCode = 1"
      interval: 5s
      timeout: 3s
      retries: 12
```

Add reviewed volumes, limits and application secrets to the project’s declaration. Do not put a database password or a mutable `latest` image in a reusable example.

### Multi-Stage Docker Build and Deploy

Build once with the application’s multi-stage Dockerfile, then publish that artifact. The source commit is used as a tag for discovery; resolve and record the registry digest before deployment.

```typescript
const repository = process.env.IMAGE_REPOSITORY;
const commit = (await $`git rev-parse HEAD`.text()).trim();
if (!repository || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Repository and full commit are required');
const image = `${repository}:${commit}`;
await $`docker build --tag ${image} .`;
await $`docker push ${image}`;
console.log(`Published ${image}; resolve its registry digest for APP_IMAGE`);
```

The Dockerfile and lockfile own dependency installation and build inputs. Xec does not generate a second application build process.

### Blue-Green Deployment

Blue-green requires two independent service slots, a reviewed traffic switch and draining. Keep those definitions in the application’s orchestrator. The following Deployer hooks coordinate an existing slot protocol; Xec’s strategy name alone does not create a load balancer.

```typescript
import { Deployer } from '@xec-sh/ops';
const image = process.env.APP_IMAGE;
if (!image || !/@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Pin APP_IMAGE');
const result = await Deployer.create({
  name: 'container-slots', targets: ['myapp'], strategy: 'blue-green', timeout: 300_000,
  hooks: {
    beforeDeploy: async ctx => { await ctx.exec`npm run slot:prepare -- ${ctx.version}`; },
    deploy: async ctx => { await ctx.exec`npm run slot:activate -- ${ctx.version}`; },
    verify: async ctx => (await ctx.exec`npm run slot:verify -- ${ctx.version}`).ok,
    rollback: async ctx => { await ctx.exec`npm run slot:restore-reviewed`; }
  }
}).deploy(image);
if (!result.success) throw new Error(JSON.stringify(result));
```

The named package scripts must implement durable slot identity, readiness, routing, draining and recovery. Keep the previous slot until application acceptance succeeds.

### Docker Registry Management

Authenticate using the CI runner’s credential mechanism, then use the pinned repository reference. Do not echo passwords or embed them in a shell command. Image retirement is a separate retention policy; do not prune all host images or delete the previous accepted digest as part of deployment.

### Container Monitoring and Logging

```typescript
await $`docker compose --project-name myapp -f compose.production.yaml ps`;
await $`docker compose --project-name myapp -f compose.production.yaml logs --tail 100 app`;
```

Use the [health-check recipe](../maintenance/health-checks.md) for explicit readiness and the [logging recipe](../maintenance/log-aggregation.md) for source attribution.

## Usage Examples

```bash
APP_IMAGE=registry.example.com/myapp@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567 xec run scripts/deploy-container.ts
```

Save the quick example under that path and replace the illustrative digest with the accepted registry digest.

## Best Practices

Keep image identity, Compose project name and volume ownership explicit. Check schema compatibility before replacing the application. Preserve the previous digest. `up` may replace containers; it is not inherently a no-pause operation.

## Troubleshooting

### Container Won't Start

```bash
docker compose --project-name myapp -f compose.production.yaml ps
docker compose --project-name myapp -f compose.production.yaml logs --tail 100 app
```

Check the exact image digest, command, environment and declared healthcheck before changing restart policy.

### High Memory Usage

Inspect the target container’s metrics and configured limits. Do not terminate another project’s containers to make a test pass.

### Network Issues

Check the declared networks, loopback publications and target listener. A Docker network connection and an HTTP health response establish different conditions.

## Related Topics

- [Node.js Deployment](node-app-deploy.md)
- [Kubernetes Deployment](k8s-deploy.md)
- [Backup and Restore](../maintenance/backup-restore.md)
