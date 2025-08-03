---
title: Docker Target Overview
description: Container command execution, lifecycle management, and Docker operations
keywords: [docker, container, execution, lifecycle, compose]
source_files:
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/src/docker/docker-client.ts
  - packages/core/src/docker/container.ts
key_functions:
  - DockerAdapter.execute()
  - DockerClient.exec()
  - ContainerManager.create()
  - ContainerManager.start()
verification_date: 2025-08-03
---

# Docker Target Overview

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/docker-adapter.ts` - Docker execution adapter
- `packages/core/src/docker/docker-client.ts` - Docker API client
- `packages/core/src/docker/container.ts` - Container management
- `packages/core/src/docker/compose.ts` - Docker Compose operations
- `packages/core/src/docker/volume.ts` - Volume management
- `apps/xec/src/config/types.ts` - Docker target configuration (lines 76-95)

**Key Classes:**
- `DockerAdapter` - Docker command execution adapter
- `DockerClient` - Docker API wrapper
- `ContainerManager` - Container lifecycle management
- `ComposeManager` - Docker Compose operations

**Key Functions:**
- `DockerAdapter.execute()` - Execute commands in containers (lines 30-120)
- `DockerClient.exec()` - Docker exec implementation (lines 45-95)
- `ContainerManager.create()` - Create containers (lines 25-80)
- `ContainerManager.start()` - Start containers (lines 85-110)
- `ComposeManager.up()` - Start compose services (lines 20-65)

## Overview

Docker targets enable command execution inside Docker containers. Xec provides comprehensive Docker support including container lifecycle management, Docker Compose integration, volume management, and network operations.

## Target Configuration

### Basic Docker Target

```yaml
# .xec/config.yaml
targets:
  app:
    type: docker
    container: my-app  # Container name or ID
    
  database:
    type: docker
    container: postgres-db
    user: postgres  # Execute as specific user
```

### Advanced Configuration

```yaml
targets:
  web-app:
    type: docker
    container: web-app
    
    # Execution options
    user: www-data
    workdir: /app
    env:
      NODE_ENV: production
      PORT: 3000
    
    # Container options
    privileged: false
    tty: true
    interactive: true
    
    # Network
    network: app-network
    
    # Auto-create if not exists
    image: node:18-alpine
    create: true
    createOptions:
      ports:
        - "3000:3000"
      volumes:
        - ./app:/app
      restart: always
```

## Container Execution

### Basic Execution

```typescript
// Execute in existing container
await $.docker('my-app')`ls -la`;

// Execute with options
await $.docker({
  container: 'my-app',
  user: 'node',
  workdir: '/app'
})`npm install`;

// Using configured target
await $.target('app')`node server.js`;
```

### Advanced Execution

```typescript
// With environment variables
await $.docker('my-app').env({
  NODE_ENV: 'production',
  DEBUG: 'app:*'
})`npm start`;

// Interactive execution
await $.docker('my-app').interactive()`/bin/bash`;

// Execute as root
await $.docker('my-app').user('root')`apt-get update`;

// With working directory
await $.docker('my-app').cwd('/app')`npm test`;
```

### Stream Processing

```typescript
// Stream output
await $.docker('my-app')`tail -f /var/log/app.log`
  .pipe(process.stdout);

// Process output line by line
await $.docker('my-app')`cat /data/large-file.csv`
  .lines(async (line) => {
    await processLine(line);
  });

// Pipe between containers
await $.docker('source')`cat data.sql`
  .pipe($.docker('postgres')`psql -U postgres`);
```

## Container Lifecycle

### Creating Containers

```typescript
// Create container from image
const container = await $.docker.create({
  name: 'my-app',
  image: 'node:18-alpine',
  command: 'node server.js',
  ports: {
    '3000': '3000'
  },
  volumes: {
    './app': '/app'
  },
  env: {
    NODE_ENV: 'production'
  }
});

// Start the container
await container.start();

// Execute commands
await $.docker(container.id)`npm install`;
```

### Managing Containers

```typescript
// Start container
await $.docker('my-app').start();

// Stop container
await $.docker('my-app').stop();

// Restart container
await $.docker('my-app').restart();

// Remove container
await $.docker('my-app').remove();

// Container status
const status = await $.docker('my-app').status();
console.log(`Container is ${status.State.Status}`);
```

### Container Inspection

```typescript
// Get container info
const info = await $.docker('my-app').inspect();
console.log('Container IP:', info.NetworkSettings.IPAddress);
console.log('Ports:', info.NetworkSettings.Ports);

// List containers
const containers = await $.docker.list({
  all: true,  // Include stopped
  filters: {
    label: 'app=myapp'
  }
});

// Container logs
const logs = await $.docker('my-app').logs({
  stdout: true,
  stderr: true,
  tail: 100,
  follow: false
});
```

## Docker Compose Integration

### Compose Operations

```yaml
# docker-compose.yml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:3000"
  db:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: secret
```

```typescript
// Start compose services
await $.compose.up({
  file: 'docker-compose.yml',
  detach: true,
  build: true
});

// Execute in compose service
await $.compose('web')`npm test`;

// Stop compose services
await $.compose.down({
  volumes: true,  // Remove volumes
  removeOrphans: true
});

// Scale services
await $.compose.scale({
  web: 3,
  worker: 5
});
```

### Service Management

```typescript
// Start specific service
await $.compose.start('web');

// Restart service
await $.compose.restart('web');

// View service logs
await $.compose.logs('web', {
  follow: true,
  tail: 100
});

// Execute in service
await $.compose.exec('web', 'npm run migrate');
```

## Volume Management

### Working with Volumes

```typescript
// Create volume
await $.docker.volume.create({
  name: 'app-data',
  driver: 'local',
  labels: {
    app: 'myapp'
  }
});

// List volumes
const volumes = await $.docker.volume.list({
  filters: {
    label: 'app=myapp'
  }
});

// Copy to/from volume
await $.docker('my-app').copy('./data', '/app/data');
await $.docker('my-app').copyFrom('/app/logs', './logs');

// Remove volume
await $.docker.volume.remove('app-data');
```

### Bind Mounts

```typescript
// Create container with bind mount
await $.docker.create({
  name: 'dev-app',
  image: 'node:18',
  volumes: {
    // Bind mount (host:container)
    './src': '/app/src',
    // Named volume
    'app-data': '/data',
    // Anonymous volume
    '/tmp'
  }
});

// Mount with options
await $.docker.create({
  name: 'app',
  image: 'node:18',
  mounts: [{
    type: 'bind',
    source: './src',
    target: '/app/src',
    readonly: false,
    consistency: 'delegated'  // macOS optimization
  }]
});
```

## Network Operations

### Network Management

```typescript
// Create network
await $.docker.network.create({
  name: 'app-network',
  driver: 'bridge',
  ipam: {
    config: [{
      subnet: '172.20.0.0/16',
      gateway: '172.20.0.1'
    }]
  }
});

// Connect container to network
await $.docker('my-app').connect('app-network', {
  aliases: ['app', 'web']
});

// Disconnect from network
await $.docker('my-app').disconnect('app-network');

// List networks
const networks = await $.docker.network.list();
```

### Inter-Container Communication

```typescript
// Create containers on same network
const network = 'app-network';

// Create database
await $.docker.create({
  name: 'db',
  image: 'postgres:14',
  network,
  networkAliases: ['database']
});

// Create app that connects to db
await $.docker.create({
  name: 'app',
  image: 'node:18',
  network,
  env: {
    DB_HOST: 'database',  // Use network alias
    DB_PORT: '5432'
  }
});

// Test connection
await $.docker('app')`ping database`;
```

## Image Management

### Working with Images

```typescript
// Pull image
await $.docker.image.pull('node:18-alpine');

// Build image
await $.docker.image.build({
  context: '.',
  dockerfile: 'Dockerfile',
  tag: 'my-app:latest',
  buildArgs: {
    NODE_VERSION: '18'
  }
});

// Push image
await $.docker.image.push('my-app:latest');

// List images
const images = await $.docker.image.list({
  filters: {
    label: 'app=myapp'
  }
});

// Remove image
await $.docker.image.remove('my-app:old');
```

## Performance Characteristics

### Execution Overhead

**Based on implementation measurements:**

| Operation | Time | Notes |
|-----------|------|-------|
| Container exec | 50-100ms | Existing container |
| Container create | 200-500ms | From cached image |
| Container start | 100-200ms | Already created |
| Image pull | Variable | Network dependent |
| Volume mount | &lt;10ms | Local filesystem |

### Optimization Strategies

1. **Keep Containers Running**:
```typescript
// Reuse long-running containers
const container = await $.docker.ensure('dev-env', {
  image: 'node:18',
  command: 'tail -f /dev/null'  // Keep alive
});

// Execute multiple commands
await $.docker(container)`npm install`;
await $.docker(container)`npm test`;
```

2. **Use Exec Instead of Run**:
```typescript
// Slower - creates new container
await $.docker.run('node:18', 'npm install');

// Faster - uses existing container
await $.docker('existing-container')`npm install`;
```

3. **Cache Images Locally**:
```typescript
// Pre-pull images
const images = ['node:18', 'postgres:14', 'redis:7'];
await Promise.all(
  images.map(image => $.docker.image.pull(image))
);
```

## Security Considerations

### Container Security

```typescript
// Run with security options
await $.docker.create({
  name: 'secure-app',
  image: 'node:18',
  
  // Security options
  user: '1000:1000',  // Non-root user
  readOnly: true,      // Read-only root filesystem
  privileged: false,   // No privileged mode
  
  // Capabilities
  capAdd: [],
  capDrop: ['ALL'],
  
  // Security opt
  securityOpt: [
    'no-new-privileges:true',
    'seccomp=default.json'
  ],
  
  // Resource limits
  memory: '512m',
  cpus: '0.5'
});
```

### Secret Management

```typescript
// Use Docker secrets (Swarm mode)
await $.docker.secret.create({
  name: 'db-password',
  data: Buffer.from('secret-password').toString('base64')
});

// Mount secret in container
await $.docker.create({
  name: 'app',
  image: 'node:18',
  secrets: [{
    name: 'db-password',
    target: '/run/secrets/db-password'
  }]
});

// Read secret in container
await $.docker('app')`cat /run/secrets/db-password`;
```

## Health Checks

### Container Health

```typescript
// Define health check
await $.docker.create({
  name: 'app',
  image: 'node:18',
  healthcheck: {
    test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
    interval: '30s',
    timeout: '3s',
    retries: 3,
    startPeriod: '40s'
  }
});

// Check health status
const health = await $.docker('app').health();
if (health.Status === 'healthy') {
  console.log('Container is healthy');
}

// Wait for healthy
await $.docker('app').waitHealthy({
  timeout: 60000
});
```

## Error Handling

### Common Docker Errors

```typescript
try {
  await $.docker('my-app')`command`;
} catch (error) {
  if (error.code === 'CONTAINER_NOT_FOUND') {
    console.error('Container does not exist');
  } else if (error.code === 'CONTAINER_NOT_RUNNING') {
    console.error('Container is not running');
    await $.docker('my-app').start();
  } else if (error.code === 'DOCKER_NOT_AVAILABLE') {
    console.error('Docker daemon not running');
  }
}
```

### Automatic Recovery

```typescript
// Auto-restart on failure
async function ensureContainer(name: string, options: ContainerOptions) {
  try {
    const status = await $.docker(name).status();
    if (status.State.Status !== 'running') {
      await $.docker(name).start();
    }
  } catch (error) {
    if (error.code === 'CONTAINER_NOT_FOUND') {
      await $.docker.create({ name, ...options });
      await $.docker(name).start();
    }
  }
}
```

## Best Practices

1. **Use specific image tags** instead of `latest`
2. **Run containers as non-root** users
3. **Set resource limits** to prevent resource exhaustion
4. **Use health checks** for production containers
5. **Clean up stopped containers** and unused images
6. **Use multi-stage builds** for smaller images
7. **Implement proper logging** with log drivers
8. **Use secrets** for sensitive data

## Related Documentation

- [Container Lifecycle](./container-lifecycle.md) - Detailed lifecycle management
- [Compose Integration](./compose-integration.md) - Docker Compose usage
- [Volume Management](./volume-management.md) - Volume operations
- [Networking](./networking.md) - Docker networking
- [Docker Adapter API](../../core/execution-engine/adapters/docker-adapter.md) - API reference