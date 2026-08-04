---
title: Docker Volume Management
description: Managing Docker volumes and file operations with Xec
keywords: [docker, volumes, mounts, storage, file transfer]
sidebar_position: 4
---

# Docker Volume Management

Named-volume administration (`create`/`remove`/`inspect`) is a handle off `$.docker()`. Bind-mounting a volume into a container is a `docker run`-time decision — it belongs to the ephemeral builder or a target's config, not to something you can attach to an already-running container. File transfer to and from a running container is `docker cp`, unrelated to volumes.

```typescript
import { $ } from '@xec-sh/core';

await $.docker().volume('app-data').create({ driver: 'local' });

await $.docker()
  .ephemeral('postgres:16-alpine')
  .name('db')
  .volume('app-data', '/var/lib/postgresql/data')
  .start();
```

## Named Volumes

```typescript
const vol = $.docker().volume('app-data');

await vol.create({
  driver: 'local',
  labels: { app: 'myapp', env: 'production' },
  driverOpts: { type: 'nfs', o: 'addr=10.0.0.1,rw', device: ':/data' },
});

console.log(await vol.exists());
console.log(await vol.inspect());   // raw `docker volume inspect` JSON
await vol.remove();                 // add `true` to force-remove even if in use
```

The lower-level adapter has the same operations, plus listing:

```typescript
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;

await docker.createVolume('db-data', { driver: 'local' });
const names = await docker.listVolumes();       // string[]
await docker.removeVolume('db-data', true);      // true = force
```

## Bind Mounts

Mounts are set when a container is created, not afterward — Docker itself has no "attach a mount to a running container" operation, so neither does xec. For an ephemeral container:

```typescript
await $.docker()
  .ephemeral('node:22-alpine')
  .volume('./src', '/app/src', 'ro')     // host, container, mode?
  .volumes(['npm-cache:/root/.npm'])     // more mounts, appended; named volume or bind path
  .workdir('/app')
  .start();
```

Or, via the plain object shorthand (only `volumes`/`workdir`/`user` reach `docker run` through this form — see [Overview](./overview.md#container-execution)):

```typescript
await $.docker({
  image: 'node:22-alpine',
  volumes: ['./src:/app/src:ro', 'npm-cache:/root/.npm'],
  workdir: '/app',
})`npm run build`;
```

Or in target config:

```yaml
targets:
  containers:
    app:
      container: my-app
      image: node:22-alpine
      runMode: run
      volumes:
        - app-data:/data
        - ./config:/app/config:ro
```

`volumes` has no effect for `runMode: 'exec'` (the default when only `container` is set, without `image`) — there's no container to attach a fresh mount to at exec time.

## Copying Files

There's no volume-based file API; copying goes through `docker cp`:

```typescript
await $`docker cp ./config.json my-app:/app/config.json`;
await $`docker cp my-app:/app/logs ./logs`;
```

or the equivalent adapter methods, which take the same three arguments in the same order:

```typescript
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;

await docker.copyToContainer('./config.json', 'my-app', '/app/config.json');
await docker.copyFromContainer('my-app', '/app/logs', './logs');
```

Neither form takes ownership, mode, or compression options — `docker cp` doesn't have them either. Chain a follow-up exec if you need to change ownership after copying:

```typescript
await docker.copyToContainer('./app.jar', 'java-app', '/app/app.jar');
await $.docker({ container: 'java-app', user: 'root' })`chown appuser:appuser /app/app.jar`;
```

## Streaming Into a Container

For data that isn't already a file on disk, pipe a stream into `stdin` via `.with()` (there's no dedicated `.stdin()` chain method, so it goes through the general command-options override):

```typescript
import { createReadStream } from 'node:fs';

const stream = createReadStream('./large-file.dat');
await $.docker('processor').with({ stdin: stream })`cat > /tmp/input.dat`;
```

## Pruning

```typescript
// docker system prune --force --volumes (stopped containers, unused networks,
// dangling images, and now unused volumes too)
await $.docker().prune(false, true);

// also remove all unused images, not just dangling ones
await $.docker().prune(true, true);
```

## Related Topics

- [Docker Overview](./overview.md) - Docker basics
- [Container Lifecycle](./container-lifecycle.md) - Container management
- [Compose Integration](./compose-integration.md) - Multi-container apps
- [Networking](./networking.md) - Network configuration
