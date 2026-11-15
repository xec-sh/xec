---
title: Docker Adapter
description: Command execution in Docker containers
---

# Docker Adapter {#docker-adapter}

The Docker adapter enables command execution within Docker containers with full lifecycle management and advanced features.

## Overview {#overview}

The Docker adapter (`packages/core/src/adapters/docker/index.ts`) provides container command execution with:

- **Container lifecycle management** (create, start, stop, remove)
- **Docker Compose integration** for multi-container applications
- **Volume and network management**
- **Log retrieval**
- **Image building and management**
- **Health checks**

## Basic Usage {#basic-usage}

```typescript
import { $ } from '@xec-sh/core';

// Execute in an existing container — by name (shorthand) or options object
const container = $.docker('my-app');
// same as: $.docker({ container: 'my-app' })

const files = await container`ls -la /app`.text();
console.log(files);

// Execute in a new, one-off container from an image
const ephemeral = $.docker({
  image: 'node:18-alpine',
});

await ephemeral`npm --version`;
```

`$.docker(container)`/`$.docker(options)` both return a plain `ExecutionEngine`
targeting that container, with the same chaining API as any other target. A
one-off container is removed after the command exits by default;
`autoRemove: false` retains its stopped state for inspection. The options
object also accepts names, ports, volumes, networks, labels and entrypoints.
Use the fluent builder below for long-lived services and resource limits.

## Container Configuration {#container-configuration}

### Working with Existing Containers {#working-with-existing-containers}

```typescript
// Connect to a running container
const existing = $.docker('web-server');

// Execute commands
await existing`ps aux`;
for await (const line of existing`tail -f /var/log/nginx/access.log`) {
  console.log(line);
}

// With a specific user
const asRoot = $.docker({
  container: 'database',
  user: 'root'
});
```

### Running in a container that already exists {#running-in-a-container-that-already-exists}

`$.docker({ container })` runs `docker exec`, so the container's mounts,
network and lifetime are whatever they already were. `volumes` there is
refused rather than ignored: mounts are fixed when a container is created,
and accepting them silently meant the command ran against a filesystem the
caller believed was somewhere else. Give an `image` (or `runMode: 'run'`)
to create a container with those mounts.

`Privileged` and the engine's `defaultEnv` apply in both modes. They used
to reach `exec` and not `run`, so one target configuration meant two
different things depending on a mode nobody chose explicitly.

### Creating New Containers {#creating-new-containers}

The plain `$.docker({ image, ... })` form runs one attached command. It
forwards `image`, `container` (name), `volumes`, `workdir`, `user`, `env`,
`ports`, `network`, `platform`, `pull`, `labels`, `entrypoint` and
`privileged`. For an independently managed service, use the fluent builder
returned by `$.docker()` with no arguments:

```typescript
// Create a named container from an image
const newContainer = $.docker()
  .ephemeral('ubuntu:22.04')
  .name('temp-ubuntu')
  .command(['sleep', '3600']);

await newContainer.start();

// With environment variables
const withEnv = $.docker()
  .ephemeral('postgres:15')
  .name('test-db')
  .env({
    POSTGRES_USER: 'admin',
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'testdb'
  });

await withEnv.start();

// With port mapping (host:container)
const webApp = $.docker()
  .ephemeral('nginx:alpine')
  .name('web')
  .port(8080, 80)
  .port(8443, 443);

await webApp.start();
```

`.start()` runs `docker run -d` with everything configured so far, then the
same builder can `.exec()` commands into the running container, `.stop()`,
`.restart()` or `.remove()` it. Nothing runs until you call one of those —
the calls above only build up configuration.

## Cancellation and ownership {#cancellation-and-ownership}

The following ownership and reconciliation contract is available on the development
branch. It is not provided by the published 0.12.0 package.

Run mode creates the container first, obtains its full immutable ID, then
starts it with stdout/stderr attached. The ordinary process handle exposes
that identity as `handle.resource` (`type: 'docker-container'`, `id`).
`handle.pid` still identifies the local Docker CLI, not a container process.

Timeout, `AbortSignal`, `handle.kill()` and adapter disposal wait for both
the local transport and the owned container to finish. Xec checks Docker's
state, requests a bounded stop for a still-running container, and confirms
its exit before returning. Stop uses the requested signal (SIGTERM by
default), with one second before Docker escalates; SIGKILL has no grace.
Cleanup shares one `managementTimeout` budget (60 seconds by default, also
used when ordinary management deadlines are disabled). A failed state
observation, stop or removal remains an error, including with `nothrow`.
A command timeout becomes exit code 124 only after that confirmation.

`autoRemove: false` retains a stopped container. An unstarted container is
removed when admission was interrupted, so a pending start cannot escape
cancellation. An unacknowledged `create` never authorizes a start; its error
reports whether the owned unstarted resource was reconciled and removed,
or cleanup remains unconfirmed. A concurrently replaced name is never a cleanup target.

The reserved `sh.xec.execution` label is assigned a unique operation UUID
before create and cannot be supplied through user options. If the create
reply is lost, Xec reconciles that label within the management deadline,
verifies the full ID and label, and removes only a still-unstarted owned
container. Empty inventory observations do not prove a pending request can
never complete. An unavailable daemon, ambiguous identity, unexpected
running resource or exhausted deadline returns explicit uncertainty with
the label needed for later inspection; no neighboring resource is adopted.

Exec mode addresses an existing container whose lifetime Xec does not own.
Stopping its local transport does **not** prove that the remote command has
stopped, and Xec never stops the entire container for an exec cancellation.
For a job requiring confirmed cancellation, use an owned run-mode container
with the necessary network or volume access instead of a shell wrapper in a
long-lived service. SSH and Kubernetes retain their own transport contracts;
they do not acquire Docker's ownership guarantee.

### Durable ownership {#durable-ownership}

Persist the operation intent before execution. Set `operationId` to its UUID and
`retry: { maxRetries: 0 }`. `onResource(resource, signal)` is awaited before create
with daemon identity and again before start with the full container ID. Persist
each value in the same journal. Callback rejection prevents the next effect;
its supplied signal enforces the command deadline.

`ExecutionResource` contains only `type`, `operationId`, `daemonId` and optional
`id`. Use `assertExecutionResource` to validate persisted values.
`inspectExecution(resource)` is read-only. `terminateExecution(resource)` stops
and removes only the verified owned resource. Both verify the native daemon ID;
a changed context or unreachable daemon cannot prove absence. An unacknowledged
create with no full ID remains unknown even when an inventory is empty.

`ExecutionOutcomeUnknownError` carries `code: 'EXECUTION_OUTCOME_UNKNOWN'`,
`kind: 'outcome-unknown'` and typed resource evidence. Retain the operation's
lifecycle fence until reconciliation. An ordinary run-mode return confirms
cleanup; with `autoRemove: true` the recorded full ID is absent, without another
inspection request.

An operation ID identifies one attempt. Admission and idempotent replay belong
to the caller's durable journal, not an in-memory cache. Automatic retries with
an explicit operation ID are refused; another attempt requires a new ID and a
confirmed previous outcome. Exec inside an existing container cannot provide
this ownership contract.

For a constrained job, use an immutable local image ID, `pull: 'never'`, and
`resources: { cpus: 0.5, memoryBytes: 268435456, pidsLimit: 32 }`. These settings
are enforced by the ordinary run adapter, without a separate Docker command.

## Volume Management {#volume-management}

### Mounting Volumes {#mounting-volumes}

```typescript
// Bind mount
const withBindMount = $.docker()
  .ephemeral('node:18')
  .volume('/local/path', '/container/path')
  .volume('/host/data', '/data', 'ro'); // read-only

// Named volume
const withNamedVolume = $.docker()
  .ephemeral('mysql:8')
  .volumes([
    'mysql-data:/var/lib/mysql',
    'mysql-config:/etc/mysql/conf.d'
  ]);
```

### Volume Operations {#volume-operations}

```typescript
// Copy files to/from a container, via $.transfer's docker:// URLs
await $.transfer.copy('/local/config.json', 'docker://app:/app/config.json');
await $.transfer.copy('docker://app:/app/logs', '/local/backup/logs', { recursive: true });

// Create a named volume
await $.docker().volume('app-data').create();

// Check it exists / inspect it
const exists = await $.docker().volume('app-data').exists();
const info = await $.docker().volume('app-data').inspect();

// Remove a volume
await $.docker().volume('old-data').remove();
```

## Network Configuration {#network-configuration}

### Network Modes {#network-modes}

```typescript
// Host network
const hostNetwork = $.docker().ephemeral('nginx').network('host');

// Custom network
const customNetwork = $.docker().ephemeral('api').network('my-app-network');

// No network
const isolated = $.docker().ephemeral('tool').network('none');
```

### Network Management {#network-management}

```typescript
// Create a network
await $.docker().network('app-network').create({
  driver: 'bridge',
  subnet: '172.20.0.0/16',
  gateway: '172.20.0.1'
});

// Connect a running container to it
await $.docker().network('app-network').connect('web', {
  alias: ['web-service']
});

// Disconnect
await $.docker().network('app-network').disconnect('web');
```

## Docker Compose Integration {#docker-compose-integration}

### Working with Compose Projects {#working-with-compose-projects}

```typescript
// $.docker() with no arguments returns the fluent API; .compose(file?) from there
const compose = $.docker().compose('docker-compose.yml').withProject('myapp');

// Start services
await compose.up(/* detached */ true, /* build */ true);

// Execute a command in a service
await compose.exec('web', 'npm run migrate');

// View logs
const webLogs = await compose.logs('web', /* follow */ false, /* tail */ 100);

// Stop services
await compose.down(/* removeVolumes */ true);
```

### Compose Operations {#compose-operations}

```typescript
const compose = $.docker().compose('docker-compose.yml');

// Restart a service
await compose.restart('web');

// List running services
const running = await compose.ps();

// Build one or more services
await compose.build('web');
```

There is no `.scale(...)` or `.service(name)` sub-target on the compose
fluent API today — scale by passing `--scale` through a raw command if you
need it (`` $.docker().run`compose -f docker-compose.yml up -d --scale worker=3` ``),
and reach a single service the same way you'd reach any container, with
`$.docker('<compose-project>_web_1')` or `$.docker().container(name)` once
you know the container name Compose gave it.

## Container Lifecycle {#container-lifecycle}

### Lifecycle Management {#lifecycle-management}

```typescript
const container = $.docker().ephemeral('app:latest').name('my-app');

// Start container
await container.start();

// Check status
const status = await container.status();
console.log(status.running, status.healthy);

// Restart
await container.restart();

// Remove
await container.remove();
```

There is no `.pause()`/`.unpause()` on the fluent builder — pause a container
with a plain command if you need it: `` $.docker().run`pause my-app` ``.

### Graceful shutdown {#graceful-shutdown}

`DockerAdapter.stopContainer(nameOrId, timeoutSeconds)` and
`DockerContainer.stop(timeoutSeconds)` accept an optional integer grace interval
from 0 to 600 seconds. Zero asks Docker to stop immediately. Omitting it preserves
Docker's configured default. The adapter adds an explicit grace interval to its
`managementTimeout` (milliseconds, default 60,000), so its own request deadline
does not interrupt the requested shutdown interval. An RPC caller must allow
enough time for both intervals and transport overhead.
An explicitly configured `managementTimeout: 0` keeps the request deadline
disabled; it does not disable Docker's own grace interval.

`removeContainer(nameOrId, false, { graceful: true, stopTimeoutSeconds })` uses the
same stop contract before removing the observed immutable container identity.
A transport failure remains an unconfirmed outcome: inspect state before retrying.
Stopping is a native lifecycle operation; it does not change an external
controller's desired state. A controller such as Omnitron may start the container
again while its stack remains declared running.

### Health Checks {#health-checks}

```typescript
const healthy = $.docker()
  .ephemeral('app')
  .name('app')
  .healthcheck(['CMD', 'curl', '-f', 'http://localhost/health'], {
    interval: '30s',
    timeout: '3s',
    retries: 3,
    startPeriod: '40s'
  });

await healthy.start();

// Wait for the container to be running and, since a healthcheck is
// configured, for it to report healthy
await healthy.waitForReady(60000);

// Check status directly
const status = await healthy.status();
if (!status.healthy) {
  console.error('Container unhealthy');
}
```

## Image Management {#image-management}

### Building Images {#building-images}

```typescript
// Build from a Dockerfile
await $.docker()
  .build('./app', 'myapp:latest')
  .dockerfile('Dockerfile')
  .buildArg('NODE_VERSION', '18')
  .buildArg('ENV', 'production')
  .execute();

// Multi-stage build, targeting a specific stage
await $.docker()
  .build('.', 'app:prod')
  .dockerfile('Dockerfile.multi')
  .target('production')
  .execute();

// Control Docker's own build-progress output format
await $.docker()
  .build('.', 'app:dev')
  .progress('plain')
  .execute();
```

`.execute()` runs the build and resolves to the tag that was built. There is
no per-layer progress callback — `.progress()` only selects which of
Docker's own output styles (`auto`, `plain`, `tty`) it prints while building.

### Image Operations {#image-operations}

```typescript
// Pull an image
await $.docker().pull('node:18-alpine');

// Tag and push, as plain docker commands — there's no dedicated wrapper
await $.docker().run`tag app:latest app:v1.0.0`;
await $.docker().run`push myregistry.com/app:latest`;

// Remove an image
await $.docker().rmi('old-app:v0.9.0');

// List images
const images = await $.docker().images();
```

## Logging {#logging}

```typescript
const container = $.docker().ephemeral('app').name('app');
await container.start();

// One-shot log retrieval
const logs = await container.logs({ tail: 50, timestamps: true });
console.log(logs);
```

`.logs({ follow: true })` on the fluent builder still awaits the whole
`docker logs -f` invocation, which never finishes on its own — it isn't a
good fit for following. To stream logs as they arrive, run the command
directly and let Xec's own streaming handle it:

```typescript
const container_name = 'app';
for await (const line of $`docker logs -f ${container_name}`) {
  console.log('LOG:', line);
}
```

For statistics, there's no dedicated stats API either — run `docker stats`
the same way:

```typescript
const container_name = 'app';
const stats = await $`docker stats --no-stream --format '{{json .}}' ${container_name}`.json();
console.log(stats);
```

## Advanced Container Options {#advanced-container-options}

The ephemeral builder covers most of what `docker run` exposes: resource
limits, restart policy and a handful of security-relevant flags.

```typescript
const configured = $.docker()
  .ephemeral('app')
  .memory('512m')
  .cpus('0.5')
  .restartPolicy('unless-stopped')
  .privileged(false)
  .capAdd(['NET_ADMIN'])
  .capDrop(['ALL'])
  .labels({
    'com.example.app': 'web',
    'com.example.version': '1.0.0'
  });
```

Query containers by label with a plain command — there's no Xec-side filter
builder: `` $.docker().run`ps --filter label=com.example.app=web` ``.

## Error Handling {#error-handling}

Docker failures throw `DockerError` (a `container`, `operation` and
`originalError`) or, for a plain `container`-targeted command, `CommandError`
— both extend `ExecutionError` and carry a `kind` you can branch on instead
of parsing the message:

```typescript
import { $, ExecutionError } from '@xec-sh/core';

const container = $.docker('app');

try {
  await container`command`;
} catch (error) {
  if (error instanceof ExecutionError) {
    if (error.kind === 'not-found') {
      console.error('Container does not exist');
    } else if (error.kind === 'connection-refused') {
      console.error('Docker daemon not accessible');
    }
  }
}
```

## Implementation Details {#implementation-details}

The Docker adapter is implemented across:
- `packages/core/src/adapters/docker/index.ts` — main adapter implementation, plus low-level compose/build helpers
- `packages/core/src/adapters/docker/docker-fluent-api/` — the fluent API shown throughout this page (`ephemeral()`, `container()`, `build()`, `compose()`, `network()`, `volume()`, `swarm()`)
- `packages/core/src/adapters/docker/docker-api.ts` — `DockerContainer`, a lower-level lifecycle wrapper used internally

## See Also {#see-also}

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Streaming](/docs/core/execution-engine/features/streaming)
