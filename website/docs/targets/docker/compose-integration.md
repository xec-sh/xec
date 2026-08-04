---
title: Docker Compose Integration
description: Working with Docker Compose in Xec
keywords: [docker, compose, orchestration, services, multi-container]
sidebar_position: 5
---

# Docker Compose Integration

## Overview

Xec integrates with Docker Compose through the fluent Docker API: `$.docker().compose(file?)` returns a compose handle bound to an optional compose file (the `docker compose` CLI's own discovery applies when no file is given). All operations shell out to `docker compose`, so anything the CLI supports is available.

## Getting a Compose Handle

```typescript
import { $ } from '@xec-sh/core';

// Default compose file discovery (docker-compose.yml, compose.yaml, ...)
const compose = $.docker().compose();

// Explicit file
const prod = $.docker().compose('docker-compose.prod.yml');

// Builder options
const staged = $.docker()
  .compose('docker-compose.yml')
  .withProject('myapp-staging')       // -p project name
  .withProfiles('frontend', 'debug')  // --profile ...
  .withEnv({ TAG: 'v1.2.3' });        // environment for the compose process
```

`withEnv` works by setting `process.env` for the duration of each compose call and restoring it afterward — it's not scoped per-handle. Two `.withEnv()`-configured handles running concurrently will race on `process.env`; don't parallelize compose calls that rely on different env values.

The builder takes a single compose file. For `-f file1 -f file2` overlays, drop to the adapter directly, which accepts an array:

```typescript
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;
await docker.composeUp({ file: ['docker-compose.yml', 'docker-compose.override.yml'] });
```

## Starting and Stopping Services

```typescript
const compose = $.docker().compose();

// Start all services, detached (default). Second argument builds first.
await compose.up();            // docker compose up -d
await compose.up(true, true);  // docker compose up -d --build

// Start / stop / restart specific services
await compose.start('web', 'api');
await compose.stop('web');
await compose.restart('web', 'worker');

// Build services
await compose.build();          // all
await compose.build('web');     // specific

// Tear down. First argument removes volumes, second removes images.
await compose.down();           // docker compose down
await compose.down(true);       // docker compose down -v
```

## Executing Commands in Services

```typescript
// Execute in a running service container
const result = await compose.exec('web', 'npm test');
console.log(result.stdout);

await compose.exec('api', 'python manage.py migrate');
```

For interactive sessions or more control (user, workdir, streaming), target the underlying container directly with the Docker adapter:

```typescript
// Compose containers are named <project>-<service>-<index>
await $.docker({ container: 'myapp-web-1', user: 'node' })`npm run repl`.interactive();
```

## Logs and Status

```typescript
// All service logs
const logs = await compose.logs();

// One service, last 100 lines
const webLogs = await compose.logs('web', false, 100);

// List service containers
const status = await compose.ps();   // docker compose ps output
console.log(status);
```

For live log following, use the CLI with a line-processor pipe:

```typescript
await $`docker compose logs -f --tail 100 web`.pipe((line) => {
  console.log(`[web] ${line}`);
});
```

## Scaling

There is no dedicated scale method — use the CLI form:

```typescript
await $`docker compose up -d --scale worker=5 --no-recreate`;
```

## Configuration via Xec Targets

Compose-managed containers are ordinary Docker containers, so they can be addressed as Xec targets once running:

```yaml
# .xec/config.yaml
targets:
  containers:
    web:
      container: myapp-web-1
    db:
      container: myapp-db-1
```

```bash
xec in containers.web "npm test"
xec logs containers.web --follow
```

## CI/CD Example

```typescript
import { $ } from '@xec-sh/core';

async function integrationTests() {
  const compose = $.docker().compose('docker-compose.test.yml');

  try {
    await compose.up(true, true);          // build and start
    await compose.exec('web', 'npm run wait-for-db');
    const tests = await compose.exec('web', 'npm test');
    console.log(tests.stdout);
  } finally {
    await compose.down(true);              // clean up incl. volumes
  }
}
```

## Related Documentation

- [Docker Target Overview](./overview.md) - Docker execution basics
- [Container Lifecycle](./container-lifecycle.md) - Container management
- [Volume Management](./volume-management.md) - Volume operations
- [Networking](./networking.md) - Docker networking
