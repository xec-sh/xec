# Docker Fluent API

A type-safe fluent API for Docker operations in the xec execution engine.

## Overview

The Docker Fluent API provides a chainable interface for managing Docker
containers, images, Compose projects, networks, volumes and Swarm. It wraps
the `docker` CLI through the execution engine, so everything runs wherever the
engine runs.

> **Service presets moved to the CLI.** The pre-configured service containers
> (Redis, Redis Cluster, PostgreSQL, MySQL, MongoDB, Kafka, RabbitMQ, SSH)
> that used to live here (`$.docker().redis()` and friends) are a CLI
> convenience, not an execution-engine concern. They now live in
> `@xec-sh/cli` (`apps/xec/src/docker-services/`) and are reachable as
> `xec docker service redis`, `xec docker service postgres`, etc. Programmatic
> consumers who want a preset build it on top of `DockerEphemeralFluentAPI` —
> see “Custom Service Implementations” below, which is exactly how the CLI
> does it.

## Architecture

```
docker-fluent-api/
├── index.ts         # Main entry point and orchestration
├── base.ts          # Base classes for container management
├── build.ts         # Docker build operations
└── types.ts         # TypeScript type definitions
```

## Quick Start

### Basic Container Management

```typescript
// Ephemeral container (removed after execution)
await $.docker()
  .ephemeral('ubuntu:latest')
  .name('my-container')
  .port(8080, 80)
  .env({ NODE_ENV: 'production' })
  .volume('/host/data', '/container/data')
  .start();

// Persistent container
await $.docker()
  .container('existing-container')
  .exec`ls -la`;
```

### Building Images

```typescript
const build = $.docker()
  .build('./app')
  .tag('myapp:latest')
  .dockerfile('Dockerfile.prod')
  .buildArg('NODE_VERSION', '20')
  .platform('linux/amd64')
  .noCache();

await build.execute();

// Build and run
const container = await build.buildAndRun();
await container.exec`npm test`;

// Multi-platform build
await build.buildMultiPlatform(['linux/amd64', 'linux/arm64']);

// Scan for vulnerabilities
const report = await build.scanImage();
```

### Docker Compose

```typescript
const compose = $.docker()
  .compose('docker-compose.yml')
  .withProject('myapp')
  .withProfiles('dev', 'debug')
  .withEnv({ API_KEY: 'secret' });

await compose.up(true, true); // detached, build
await compose.logs('web', true); // follow logs
await compose.exec('web', 'npm test');
await compose.down(true, true); // volumes, images
```

### Networking

```typescript
const network = $.docker().network('myapp-net');

await network.create({
  driver: 'bridge',
  subnet: '172.20.0.0/16',
  attachable: true
});

await network.connect('container1', { ip: '172.20.0.5' });
await network.disconnect('container2');
```

### Volumes

```typescript
const volume = $.docker().volume('myapp-data');

await volume.create({
  driver: 'local',
  labels: { app: 'myapp' }
});

const info = await volume.inspect();
await volume.remove();
```

### Docker Swarm

```typescript
const swarm = $.docker().swarm();

// Initialize swarm
const token = await swarm.init({ advertiseAddr: '192.168.1.1' });

// Create service
await swarm.createService('web', 'nginx:alpine', {
  replicas: 3,
  ports: ['80:80'],
  constraints: ['node.role == worker']
});

// Scale service
await swarm.scaleService('web', 5);

// Deploy stack
await swarm.deployStack('myapp', 'stack.yml');
```

## Advanced Features

### Lifecycle Hooks

```typescript
const app = $.docker()
  .ephemeral('myapp:latest')
  .lifecycle({
    beforeStart: async () => console.log('Starting...'),
    afterStart: async () => console.log('Started!'),
    healthCheck: async () => {
      const result = await app.exec('curl -f http://localhost:8080/health');
      return result.exitCode === 0;
    }
  });
```

### Custom Service Implementations

`DockerEphemeralFluentAPI` is exported from `@xec-sh/core` precisely so that
service wrappers can be built outside core — the xec CLI's service presets
extend it this way:

```typescript
import { ExecutionEngine, DockerEphemeralFluentAPI } from '@xec-sh/core';

class CustomServiceAPI extends DockerEphemeralFluentAPI {
  constructor(engine: ExecutionEngine) {
    super(engine, 'custom:latest');
    this.applyConfiguration();
  }

  private applyConfiguration() {
    this.port(8080, 8080)
        .env({ CUSTOM_ENV: 'value' })
        .healthcheck('curl -f http://localhost:8080/health');
  }

  async customMethod() {
    return await this.exec`custom-command`;
  }
}
```

## Type Safety

All APIs are fully typed with TypeScript:

```typescript
import { $, type ServiceManager, type ContainerRuntimeInfo } from '@xec-sh/core';

// ServiceManager is the lifecycle interface every container wrapper follows
const service: ServiceManager = $.docker().ephemeral('nginx:alpine').name('web');
await service.start();
const status = await service.status();
```

## Error Handling

```typescript
try {
  await $.docker().ephemeral('postgres:15-alpine').name('db').start();
} catch (error) {
  if (error.message.includes('port already in use')) {
    // Handle port conflict
  } else if (error.message.includes('image not found')) {
    // Pull image first
    await $.docker().pull('postgres:15-alpine');
  }
}
```

## Best Practices

1. **Always clean up resources**:
```typescript
const app = $.docker().ephemeral('myapp').name('app');
try {
  await app.start();
  // ... use the container
} finally {
  await app.remove();
}
```

2. **Use health checks**:
```typescript
const service = $.docker()
  .ephemeral('myapp')
  .healthcheck('curl -f http://localhost/health', {
    interval: '30s',
    retries: 3
  });

await service.waitForReady();
```

3. **Handle network isolation**:
```typescript
const network = $.docker().network('isolated');
await network.create({ internal: true });

const db = $.docker().ephemeral('postgres:15-alpine').network('isolated');
const app = $.docker().ephemeral('app').network('isolated');
```

## License

Part of the xec-sh project. See main LICENSE file.
