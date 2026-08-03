---
title: Docker Target Overview
description: Container command execution, lifecycle management, and Docker operations
keywords: [docker, container, execution, lifecycle, compose]
---

# Docker Target Overview

## Overview

Docker targets enable command execution inside Docker containers. Xec provides container execution through the Docker adapter (`packages/core/src/adapters/docker/`), plus a fluent API (`$.docker()`) for container lifecycle, Docker Compose, networks, volumes, and common service presets.

## Target Configuration

### Basic Docker Target

```yaml
# .xec/config.yaml
targets:
  containers:
    app:
      container: my-app  # Container name or ID
    
    database:
      container: postgres-db
      user: postgres  # Execute as specific user
```

### Advanced Configuration

```yaml
targets:
  containers:
    web-app:
      container: web-app
      
      # Execution options
      user: www-data
      workdir: /app
      env:
        NODE_ENV: production
        PORT: "3000"
      tty: true
      
      # Ephemeral containers: run in a fresh container from an image
      # image: node:22-alpine
      # runMode: run
      # volumes:
      #   - ./app:/app
      # autoRemove: true
```

## Container Execution

### Basic Execution

```typescript
// Execute in existing container (options object; there is no string form)
await $.docker({ container: 'my-app' })`ls -la`;

// Execute with options
await $.docker({
  container: 'my-app',
  user: 'node',
  workdir: '/app'
})`npm install`;

// Ephemeral container from an image (removed automatically)
await $.docker({
  image: 'node:22-alpine',
  volumes: ['./app:/app'],
  workdir: '/app'
})`npm test`;
```

### Advanced Execution

```typescript
// With environment variables (engine chaining)
await $.docker({ container: 'my-app' })
  .env({ NODE_ENV: 'production', DEBUG: 'app:*' })`npm start`;

// Interactive execution (on the process, not the engine)
await $.docker({ container: 'my-app' })`/bin/bash`.interactive();

// Execute as root
await $.docker({ container: 'my-app', user: 'root' })`apt-get update`;

// With working directory
await $.docker({ container: 'my-app', workdir: '/app' })`npm test`;
```

### Stream Processing

```typescript
// Process output line by line
for await (const line of $.docker({ container: 'my-app' })`cat /data/large-file.csv`) {
  await processLine(line);
}

// Pipe between containers
await $.docker({ container: 'source' })`cat data.sql`
  .pipe($.docker({ container: 'postgres' })`psql -U postgres`);
```

## The Fluent API

Calling `$.docker()` with no arguments returns the fluent Docker API:

```typescript
const docker = $.docker();

// Ephemeral container builder
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

// Status and info
if (await app.isRunning()) {
  const info = await app.info();
  console.log('Container state:', info);
}
```

### Container Lifecycle

```typescript
const container = $.docker().container('my-app');

await container.start();          // Start
await container.stop();           // Stop
await container.restart();        // Restart
await container.remove();         // Remove
const status = await container.status();   // 'running' | 'stopped' | ...
await container.waitForReady(30000);       // Wait until ready
```

### Service Presets

The fluent API ships presets for common services:

```typescript
// Redis with sensible defaults
await $.docker().redis().start();

// PostgreSQL
await $.docker().postgresql({ database: 'app_test' }).start();

// Also available: mysql(), mongodb(), kafka(), rabbitmq(), redisCluster()
```

## Docker Compose Integration

```typescript
const compose = $.docker().compose('docker-compose.yml');

// Start services (detached by default; pass build=true to build first)
await compose.up(true, true);

// Execute in a compose service
await compose.exec('web', 'npm test');

// Service management
await compose.start('web');
await compose.restart('web');
const logs = await compose.logs('web', false, 100);

// Stop everything (optionally removing volumes)
await compose.down(true);
```

## Volume Management

```typescript
// Create a volume
await $.docker().volume('app-data').create({
  driver: 'local',
  labels: { app: 'myapp' }
});

// Inspect / existence
const vol = $.docker().volume('app-data');
if (await vol.exists()) {
  console.log(await vol.inspect());
}

// Remove
await vol.remove();
```

To copy files in and out of containers, use `docker cp` or the container object from `DockerContainer` (`copyTo`/`copyFrom`):

```typescript
await $`docker cp ./data my-app:/app/data`;
await $`docker cp my-app:/app/logs ./logs`;
```

## Network Operations

```typescript
// Create a network
const network = $.docker().network('app-network');
await network.create({ driver: 'bridge', subnet: '172.20.0.0/16' });

// Connect / disconnect containers
await network.connect('my-app', { aliases: ['app', 'web'] });
await network.disconnect('my-app');

// Inspect and remove
console.log(await network.inspect());
await network.remove();
```

### Inter-Container Communication

```typescript
// Containers on the same network reach each other by name/alias
await $.docker().network('app-network').create();
await $.docker().network('app-network').connect('db', { aliases: ['database'] });
await $.docker().network('app-network').connect('app');

await $.docker({ container: 'app' })`ping -c 1 database`;
```

## Image Management

```typescript
const docker = $.docker();

// Pull an image
await docker.pull('node:22-alpine');

// Build an image
await docker.build('.', 'my-app:latest').execute();

// List images / containers
console.log(await docker.images());
console.log(await docker.ps(true));  // true = include stopped

// Remove containers and images
await docker.rm('old-container', true);
await docker.rmi('my-app:old');
```

## Performance Notes

- Executing in an **existing container** (`runMode: 'exec'`, the default when `container` is set) avoids container startup cost entirely.
- **Ephemeral containers** (`image` + `runMode: 'run'`) pay image/container startup on every command — keep a long-running container for repeated commands.
- Pre-pull images (`$.docker().pull(...)`) to avoid network delays at execution time.

## Error Handling

```typescript
import { DockerError } from '@xec-sh/core';

try {
  await $.docker({ container: 'my-app' })`command`;
} catch (error) {
  if (error instanceof DockerError) {
    console.error('Docker operation failed:', error.message);
  }
}

// Or without exceptions
const result = await $.docker({ container: 'my-app' })`command`.nothrow();
if (!result.ok) {
  console.error(result.stderr);
}
```

## Best Practices

1. **Use specific image tags** instead of `latest`
2. **Run containers as non-root** users
3. **Set resource limits** to prevent resource exhaustion (via the ephemeral builder's `memory()`/`cpus()`)
4. **Use health checks** for production containers (`healthcheck()` on the builder)
5. **Clean up stopped containers** and unused images
6. **Keep containers running** and use exec for repeated commands

## Related Documentation

- [Container Lifecycle](./container-lifecycle.md) - Detailed lifecycle management
- [Compose Integration](./compose-integration.md) - Docker Compose usage
- [Volume Management](./volume-management.md) - Volume operations
- [Networking](./networking.md) - Docker networking
- [Docker Adapter API](../../core/execution-engine/adapters/docker-adapter.md) - API reference
