# Docker Adapter

The Docker adapter enables command execution within Docker containers with full lifecycle management and advanced features.

## Overview

The Docker adapter (`packages/core/src/adapters/docker/index.ts`) provides seamless container command execution with:

- **Container lifecycle management** (create, start, stop, remove)
- **Docker Compose integration** for multi-container applications
- **Volume and network management**
- **Log retrieval**
- **Image building and management**
- **Health checks**

## Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Execute in an existing container — by name (shorthand) or options object
const container = $.docker('my-app');
// same as: $.docker({ container: 'my-app' })

const result = await container`ls -la /app`;
console.log(result.stdout);

// Execute in a new, one-off container from an image
const ephemeral = $.docker({
  image: 'node:18-alpine',
});

await ephemeral`npm --version`;
```

`$.docker(container)`/`$.docker(options)` both return a plain `ExecutionEngine`
targeting that container, with the same chaining API as any other target. A
one-off container created this way is always removed after the command exits
— there is no option to keep it. For anything with more shape — a name you
choose, ports, volumes, health checks, resource limits — use the fluent
builder below.

## Container Configuration

### Working with Existing Containers

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

### Creating New Containers

The plain `$.docker({ image, ... })` form only forwards `image`, `volumes`,
`workdir`, `user` and `env` — it always runs detached and removes the
container afterward, and other fields (name, ports, network, ...) are
silently dropped. For a named container, port mappings, or anything else,
use the fluent builder returned by `$.docker()` with no arguments:

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

## Volume Management

### Mounting Volumes

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

### Volume Operations

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

## Network Configuration

### Network Modes

```typescript
// Host network
const hostNetwork = $.docker().ephemeral('nginx').network('host');

// Custom network
const customNetwork = $.docker().ephemeral('api').network('my-app-network');

// No network
const isolated = $.docker().ephemeral('tool').network('none');
```

### Network Management

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

## Docker Compose Integration

### Working with Compose Projects

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

### Compose Operations

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

## Container Lifecycle

### Lifecycle Management

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

### Health Checks

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

## Image Management

### Building Images

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

### Image Operations

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

## Logging

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
for await (const line of $`docker logs -f ${container_name}`) {
  console.log('LOG:', line);
}
```

For statistics, there's no dedicated stats API either — run `docker stats`
the same way:

```typescript
const stats = await $`docker stats --no-stream --format '{{json .}}' ${container_name}`;
console.log(JSON.parse(stats.stdout));
```

## Advanced Container Options

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

## Error Handling

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

## Implementation Details

The Docker adapter is implemented across:
- `packages/core/src/adapters/docker/index.ts` — main adapter implementation, plus low-level compose/build helpers
- `packages/core/src/adapters/docker/docker-fluent-api/` — the fluent API shown throughout this page (`ephemeral()`, `container()`, `build()`, `compose()`, `network()`, `volume()`, `swarm()`)
- `packages/core/src/adapters/docker/docker-api.ts` — `DockerContainer`, a lower-level lifecycle wrapper used internally

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Streaming](/docs/core/execution-engine/features/streaming)
