---
title: Docker Target Overview
description: Container command execution, lifecycle management, and Docker operations
keywords: [docker, container, execution, lifecycle, compose]
sidebar_position: 1
---

# Docker Target Overview

Docker targets run commands inside containers. Xec shells out to your local `docker` CLI (`packages/core/src/adapters/docker/`) — there's no bundled Docker Engine API client — and layers a fluent API (`$.docker()`) on top for container lifecycle, Compose, networks, volumes, and images.

```typescript
import { $ } from '@xec-sh/core';

await $.docker('my-app')`ls -la`;
```

## Target Configuration

```yaml
# .xec/config.yaml
targets:
  containers:
    app:
      container: my-app  # Container name or ID

    database:
      container: postgres-db
      user: postgres      # Execute as specific user

    web-app:
      container: web-app
      user: www-data
      workdir: /app
      env:
        NODE_ENV: production
        PORT: "3000"
      tty: true

      # Ephemeral: run in a fresh container from an image instead of
      # execing into an existing one
      # image: node:22-alpine
      # runMode: run
      # volumes:
      #   - ./app:/app
      # autoRemove: true
```

## Container Execution

```typescript
// Execute in an existing container — string shorthand
await $.docker('my-app')`ls -la`;

// Same, with options
await $.docker({ container: 'my-app', user: 'node', workdir: '/app' })`npm install`;

// Ephemeral container from an image, removed automatically after the command
await $.docker({
  image: 'node:22-alpine',
  volumes: ['./app:/app'],
  workdir: '/app'
})`npm test`;

// Environment variables: chain .env(), not an `env` key in the target object
// (DockerPersistentOptions/DockerEphemeralOptions declare `env`, but the
// options-object shorthand never applies it — only .env() reaches the command)
await $.docker('my-app').env({ NODE_ENV: 'production', DEBUG: 'app:*' })`npm start`;

// Interactive execution (on the process, not the engine)
await $.docker('my-app')`/bin/bash`.interactive();

// Stream output line by line
for await (const line of $.docker('my-app')`cat /data/large-file.csv`) {
  await processLine(line);
}

// Pipe between containers
await $.docker('source')`cat data.sql`
  .pipe($.docker('postgres')`psql -U postgres`);
```

Two option-object fields only take effect for **ephemeral** containers (`image` set): `volumes` and `workdir`/`user` reach `docker run`, but `env`, `ports`, `network`, `platform`, `pull`, `entrypoint` and `labels` from `DockerEphemeralOptions` are accepted by the type and silently dropped by `$.docker(options)` — they never reach the `docker run` command. For any of those, use the fluent ephemeral builder below.

## The Fluent API

Calling `$.docker()` with no arguments returns the fluent Docker API — the full builder surface, not just exec shortcuts:

```typescript
const docker = $.docker();

// Ephemeral container builder — every setter here actually reaches `docker run`
await docker
  .ephemeral('node:22-alpine')
  .env({ NODE_ENV: 'test' })
  .volume('./app', '/app')
  .workdir('/app')
  .autoRemove()
  .run`npm test`;

// Persistent container management
const app = docker.container('my-app');
await app.start();
await app.exec`npm run migrate`;
const logs = await app.logs({ tail: 100 });
await app.restart();
await app.stop();

if (await app.isRunning()) {
  console.log('Container state:', await app.info());
}
```

See [Container Lifecycle](./container-lifecycle.md) for the full builder surface (`.ports()`, `.healthcheck()`, `.memory()`, lifecycle hooks, and what's live on a persistent vs. an ephemeral container — they don't share the same effective options).

## Docker Compose

```typescript
const compose = $.docker().compose('docker-compose.yml');
await compose.up(true, true);       // detached, build first
await compose.exec('web', 'npm test');
await compose.down(true);           // also remove volumes
```

Full reference: [Compose Integration](./compose-integration.md).

## Volumes and Networks

```typescript
await $.docker().volume('app-data').create({ driver: 'local' });
await $.docker().network('app-network').create({ driver: 'bridge' });
await $.docker().network('app-network').connect('my-app', { alias: ['app', 'web'] });
```

File transfer in and out of containers goes through `docker cp`, not a volume API:

```typescript
await $`docker cp ./data my-app:/app/data`;
await $`docker cp my-app:/app/logs ./logs`;
```

Details: [Volume Management](./volume-management.md), [Networking](./networking.md).

## Image Management

```typescript
const docker = $.docker();

await docker.pull('node:22-alpine');
await docker.build('.', 'my-app:latest').execute();
console.log(await docker.images());
console.log(await docker.ps(true));   // true = include stopped
await docker.rm('old-container', true);
await docker.rmi('my-app:old');
```

## Adapter Configuration

Docker-adapter defaults are set once, globally, through `configure()` — not by constructing `new DockerAdapter()` yourself (that instance wouldn't be wired into `$`):

```typescript
import { configure } from '@xec-sh/core';

configure({
  adapters: {
    docker: {
      managementTimeout: 30_000,     // inspect/ps/start/stop/cp — default 60s
      transferTimeout: 20 * 60_000,  // pull/push/build/compose up — default 10min
      defaultExecOptions: {
        User: '1000:1000',
        WorkingDir: '/workspace',
        Env: ['NODE_ENV=production'],
      },
      autoCreate: {
        enabled: true,
        image: 'alpine:latest',
        autoRemove: true,
      },
    },
  },
});
```

`defaultExecOptions.Env` is a fallback: a chained `.env(...)` (or a raw `env` field on the command) always overrides it for the same key. `autoCreate` transparently creates and starts a throwaway container the first time you target a container name that doesn't exist yet, and removes it on `dispose()` if `autoRemove` is set.

The adapter always shells out to a local `docker` binary — it does not read `socketPath`, `host`, `port`, or `version` from this config, so those fields have no effect. To reach a remote daemon, configure it the same way you would for any other `docker` invocation (`DOCKER_HOST`, `docker context use`), not through xec.

### Events

```typescript
const adapter = $.getAdapter('docker');
adapter?.on('docker:run', (e) => console.log('run:', e.image, e.container));
adapter?.on('docker:exec', (e) => console.log('exec:', e.container, e.command));
adapter?.on('temp:cleanup', (e) => console.log('cleaned up:', e.path));
```

### Availability

```typescript
const available = await $.getAdapter('docker')?.isAvailable();
if (!available) {
  console.error('Docker is not available');
}
```

## Error Handling

```typescript
import { DockerError } from '@xec-sh/core';

try {
  await $.docker('my-app')`command`;
} catch (error) {
  if (error instanceof DockerError) {
    console.error(error.container, error.operation, error.message);
  }
}

// Or without exceptions
const result = await $.docker('my-app')`command`.nothrow();
if (!result.ok) {
  console.error(result.stderr);
}
```

## Best Practices

1. **Use specific image tags** instead of `latest`
2. **Run containers as non-root** users
3. **Set resource limits** to prevent resource exhaustion (`memory()`/`cpus()` on the ephemeral builder)
4. **Use health checks** for production containers (`healthcheck()` on the builder)
5. **Keep containers running** and use exec for repeated commands — executing in an existing container skips container startup entirely, while an ephemeral container pays it on every call

## Related Documentation

- [Container Lifecycle](./container-lifecycle.md) - Detailed lifecycle management
- [Compose Integration](./compose-integration.md) - Docker Compose usage
- [Volume Management](./volume-management.md) - Volume operations
- [Networking](./networking.md) - Docker networking
- [Docker Adapter API](../../core/execution-engine/adapters/docker-adapter.md) - API reference
