---
title: Docker Container Lifecycle
description: Managing Docker container lifecycle with Xec
keywords: [docker, containers, lifecycle, start, stop, restart, exec]
sidebar_position: 2
---

# Docker Container Lifecycle {#docker-container-lifecycle}

Two fluent builders cover container lifecycle: `$.docker().container(name)` for a container that already exists (or will), and `$.docker().ephemeral(image)` for one built fresh from an image. Both come from `$.docker()` with no arguments, and both implement the same `start`/`stop`/`restart`/`remove`/`status`/`exec`/`info`/`isRunning`/`logs`/`waitForReady` surface — but the options each one actually honors differ, covered below.

```typescript
import { $ } from '@xec-sh/core';

const app = $.docker().container('my-app');
await app.start();
await app.exec`npm run migrate`;
await app.stop();
```

## Persistent Containers {#persistent-containers}

`.container(name)` targets a container by name. The setters that actually affect its `exec`/`run` calls are `.workdir()`, `.user()`, `.env()`/`.addEnv()`, and `.lifecycle()`:

```typescript
const app = $.docker()
  .container('my-app')
  .workdir('/app')
  .user('node')
  .env({ NODE_ENV: 'production' })
  .lifecycle({
    beforeStart: () => console.log('starting...'),
    afterStart: () => console.log('started'),
    beforeStop: () => console.log('stopping...'),
  });

await app.start();          // docker start (no-ops if already running)
await app.exec`npm test`;   // workdir/user/env above are applied here
await app.restart();
await app.stop();
await app.remove();         // stops first unless already stopped
```

`.labels()`, `.addLabel()`, `.command()` and `.entrypoint()` are also present on this builder (inherited from a base class shared with the ephemeral one) but have no effect on a persistent container — nothing in `.exec()`/`.start()`/`.stop()` reads them. They only matter for `.ephemeral()`.

## Ephemeral Containers {#ephemeral-containers}

`.ephemeral(image)` builds a `docker run` invocation. Every setter below reaches the actual command:

```typescript
const worker = $.docker()
  .ephemeral('node:22-alpine')
  .name('build-worker')
  .env({ NODE_ENV: 'test' })
  .volume('./app', '/app')            // single bind mount, host, container, mode?
  .volumes(['npm-cache:/root/.npm'])  // more volumes, appended
  .ports(['3000:3000'])
  .network('app-network')
  .workdir('/app')
  .user('node')
  .memory('512m')
  .cpus('0.5')
  .restartPolicy('unless-stopped')
  .healthcheck(['CMD', 'curl', '-f', 'http://localhost:3000/health'], {
    interval: '30s', timeout: '5s', retries: 3,
  })
  .pull();                            // pull the image before running

await worker.start();
```

`.name()` matters for how `.exec()` behaves. Named **and** started, `.exec()`/`.run` execs into that same running container, same as the persistent builder:

```typescript
const cache = $.docker().ephemeral('redis:alpine').name('cache').autoRemove();
await cache.start();
await cache.exec`redis-cli ping`;   // execs into the running `cache` container
await cache.exec`redis-cli ping`;   // same container again
await cache.stop();                 // also removes it (autoRemove)
```

Before `.start()` assigns a name, an unnamed builder's `.exec()` runs a fresh, one-off `docker run --rm ... sh -c '<command>'` — a new container per call:

```typescript
const run = $.docker().ephemeral('node:22-alpine').volume('./app', '/app').workdir('/app');
await run.exec`npm test`;   // its own container, removed when it exits
await run.exec`npm test`;   // a *different* container, not the same one
```

For repeated commands, call `.start()` once. An unnamed service receives a generated name available through `.build().name`. Later execution and cleanup address that service. Calling `.start()` on an existing stopped service starts its recorded Docker identity. A named builder requires its target to exist before `.exec()` can run.

`status()` reports the observed Docker state. The ephemeral builder derives `running`, `healthy` and published `endpoints` from the same inspection, including image-defined health checks and dynamically allocated ports. An optional `lifecycle({ healthCheck })` callback supplies application readiness. Failed inventory reads and malformed replies reject. Confirmed absence produces `info() === null` and `isRunning() === false`.

## Executing Commands {#executing-commands}

Both builders expose the same two calling conventions:

```typescript
const app = $.docker().container('my-app');

// Tagged template — returns a ProcessPromise (streaming, .pipe(), .nothrow(), ...)
await app.exec`npm run build`;
await app.run`npm run build`;        // .run is an alias for .exec

// String or argv array — returns Promise<ExecutionResult> directly
const result = await app.exec('npm run build');
const result2 = await app.exec(['npm', 'run', 'build']);
```

## Waiting for Readiness {#waiting-for-readiness}

`.waitForReady(timeout?)` defaults to 30000ms. The ephemeral builder observes the running state and the container health check, including checks inherited from its image. A supplied lifecycle `healthCheck` callback provides application readiness. A container with no health check is ready once running. The persistent builder waits for the running state.

The lower-level `DockerAdapter.waitForHealthy(container, timeout?)` is stricter — it polls `docker inspect`'s `State.Health.Status` directly and only resolves on `"healthy"`. If the container has no `HEALTHCHECK` (set on the image or passed to `runContainer`), health status is never reported and this call just runs out the clock and throws.

```typescript
const worker = $.docker().ephemeral('node:24-alpine').name('build-worker');
await worker.waitForReady(60000);

// Or, against the adapter directly, when you need the stricter check
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;
await docker.waitForHealthy('my-app', 60000);
```

## The Adapter Underneath {#the-adapter-underneath}

Named `.exec()` calls use `DockerAdapter`, reachable directly via `$.getAdapter('docker')`. Lifecycle commands use the configured host execution engine and the same container identity parser as the adapter. It's lower-level — plain container names and option objects, no chaining — but has a couple of things the builders don't: `getStats()`, and two-step create/start instead of only the combined `run`.

```typescript
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;

await docker.createContainer({ name: 'db', image: 'postgres:16-alpine' });
await docker.startContainer('db');
// or in one call:
await docker.runContainer({ name: 'db', image: 'postgres:16-alpine', ports: ['5432:5432'] });

const names = await docker.listContainers(true);      // string[], true = include stopped
const info = await docker.inspectContainer('db');     // raw `docker inspect` JSON
await docker.stopContainer('db');
await docker.removeContainer('db', true);              // true = force
```

`getStats(container)` returns the parsed JSON from `docker stats --no-stream --format json <container>` — the CLI's flat per-container line (`CPUPerc`, `MemUsage`, `MemPerc`, `NetIO`, `BlockIO`, `PIDs`, plus `Container`/`ID`/`Name`), already formatted as human-readable strings. It is not the nested `cpu_stats`/`memory_stats`/`precpu_stats` shape from the Docker Engine HTTP API — there's no byte-level math to do on the result, just read the fields.

```typescript
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;
const stats = await docker.getStats('db');
console.log(stats.CPUPerc, stats.MemUsage);
```

## Auto-Creation and Cleanup {#auto-creation-and-cleanup}

Configured once via `configure({ adapters: { docker: { autoCreate: {...} } } })` (see [Adapter Configuration](./overview.md#adapter-configuration)): the first exec against a container name that doesn't exist yet transparently creates and starts one from `autoCreate.image`, and `dispose()` removes every container it created this way if `autoCreate.autoRemove` is set.

```typescript
// Dispose the adapter when its work is complete. Engine disposal also releases its adapters.
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;
await docker.dispose();
```

## Error Handling {#error-handling}

A refused stop or removal rejects and keeps its failure available to the caller. `afterStop` runs only after an acknowledged stop or confirmed absence. Removal resolves the immutable container ID before mutation and verifies absence afterward. A replacement with the same name is reported explicitly.

```typescript
import { DockerError } from '@xec-sh/core';

try {
  await $.docker('missing-container')`echo hi`;
} catch (error) {
  if (error instanceof DockerError) {
    console.error(error.container, error.operation, error.message);
  }
}
```

In exec mode (no `autoCreate`), targeting a container that doesn't exist is checked before `docker exec` ever runs: xec raises its own `DockerError`, or — with `.nothrow()` — returns a result with `exitCode: 125` and no output.

## Related Topics {#related-topics}

- [Docker Overview](./overview.md) - Docker target basics
- [Compose Integration](./compose-integration.md) - Docker Compose support
- [Volume Management](./volume-management.md) - Managing volumes
- [Networking](./networking.md) - Container networking

## Confirmed removal {#confirmed-removal}

`DockerAdapter.removeContainer(nameOrId, force)` resolves the reference against a
successful Docker inventory, removes that immutable ID, and confirms absence before
resolving. An already absent container is an idempotent success. An unavailable
daemon or a permission error cannot be interpreted as absence. If a different
container replaces the original name during removal, the operation rejects and
leaves the replacement untouched. Callers should refresh their inventory before
retrying a conflicting operation.

For an orderly shutdown before removal, use
`removeContainer(nameOrId, false, { graceful: true, stopTimeoutSeconds: 30 })`.
Both steps target the same immutable ID. A failed stop prevents removal. The
configured management-command timeout still applies; the grace period does not
permit an unbounded command. The default remains direct removal, with forced
removal only when the second argument is `true`.
