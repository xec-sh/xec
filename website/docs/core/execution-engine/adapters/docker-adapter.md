# Docker Adapter

The Docker adapter enables command execution within Docker containers with full lifecycle management and advanced features.

## Overview

The Docker adapter (`packages/core/src/adapters/docker-adapter.ts`) provides seamless container command execution with:

- **Container lifecycle management** (create, start, stop, remove)
- **Docker Compose integration** for multi-container applications
- **Volume and network management**
- **Real-time log streaming**
- **Image building and management**
- **Health checks and monitoring**

## Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Execute in existing container
const container = $.docker({
  container: 'my-app'
});

const result = await container`ls -la /app`;
console.log(result.stdout);

// Execute in new container from image
const ephemeral = $.docker({
  image: 'node:18-alpine',
  rm: true // Remove after execution
});

await ephemeral`npm --version`;
```

## Container Configuration

### Working with Existing Containers

```typescript
// Connect to running container
const existing = $.docker({
  container: 'web-server'
});

// Execute commands
await existing`ps aux`;
await existing`tail -f /var/log/nginx/access.log`;

// With specific user
const asRoot = $.docker({
  container: 'database',
  user: 'root'
});
```

### Creating New Containers

```typescript
// Create container from image
const newContainer = $.docker({
  image: 'ubuntu:22.04',
  name: 'temp-ubuntu',
  rm: true,  // Auto-remove
  detach: false // Run in foreground
});

// With environment variables
const withEnv = $.docker({
  image: 'postgres:15',
  name: 'test-db',
  env: {
    POSTGRES_USER: 'admin',
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'testdb'
  }
});

// With port mapping
const webApp = $.docker({
  image: 'nginx:alpine',
  name: 'web',
  ports: {
    '80': '8080',    // container:host
    '443': '8443'
  }
});
```

## Volume Management

### Mounting Volumes

```typescript
// Bind mount
const withBindMount = $.docker({
  image: 'node:18',
  volumes: [
    '/local/path:/container/path',
    '/host/data:/data:ro' // Read-only
  ]
});

// Named volume
const withNamedVolume = $.docker({
  image: 'mysql:8',
  volumes: [
    'mysql-data:/var/lib/mysql',
    'mysql-config:/etc/mysql/conf.d'
  ]
});

// Temporary volume
const withTmpfs = $.docker({
  image: 'alpine',
  tmpfs: ['/tmp', '/run']
});
```

### Volume Operations

```typescript
const container = $.docker({ container: 'app' });

// Copy files to container
await container.copyTo('/local/config.json', '/app/config.json');

// Copy files from container
await container.copyFrom('/app/logs', '/local/backup/logs');

// Create volume
await $.docker.createVolume('app-data');

// List volumes
const volumes = await $.docker.listVolumes();

// Remove volume
await $.docker.removeVolume('old-data');
```

## Network Configuration

### Network Modes

```typescript
// Host network
const hostNetwork = $.docker({
  image: 'nginx',
  network: 'host'
});

// Bridge network (default)
const bridgeNetwork = $.docker({
  image: 'app',
  network: 'bridge'
});

// Custom network
const customNetwork = $.docker({
  image: 'api',
  network: 'my-app-network'
});

// No network
const isolated = $.docker({
  image: 'tool',
  network: 'none'
});
```

### Network Management

```typescript
// Create network
await $.docker.createNetwork('app-network', {
  driver: 'bridge',
  subnet: '172.20.0.0/16',
  gateway: '172.20.0.1'
});

// Connect container to network
const container = $.docker({ container: 'web' });
await container.connectToNetwork('app-network', {
  alias: 'web-service'
});

// Disconnect from network
await container.disconnectFromNetwork('old-network');
```

## Docker Compose Integration

### Working with Compose Projects

```typescript
// Use docker-compose
const compose = $.docker.compose({
  file: 'docker-compose.yml',
  project: 'myapp'
});

// Start services
await compose.up({
  detach: true,
  build: true
});

// Execute in service
const web = compose.service('web');
await web`npm run migrate`;

// View logs
await compose.logs('web', { follow: true });

// Stop services
await compose.down({ volumes: true });
```

### Compose Operations

```typescript
const compose = $.docker.compose({ file: 'docker-compose.yml' });

// Scale service
await compose.scale({ web: 3, worker: 2 });

// Restart service
await compose.restart('web');

// Execute one-off command
await compose.run('web', 'npm test', {
  rm: true,
  env: { NODE_ENV: 'test' }
});
```

## Container Lifecycle

### Lifecycle Management

```typescript
const container = $.docker({
  image: 'app:latest',
  name: 'my-app'
});

// Start container
await container.start();

// Check status
const status = await container.status();
console.log(status.state, status.health);

// Pause/unpause
await container.pause();
await container.unpause();

// Stop container
await container.stop({ timeout: 30 });

// Restart
await container.restart();

// Remove
await container.remove({ force: true, volumes: true });
```

### Health Checks

```typescript
const healthy = $.docker({
  image: 'app',
  healthcheck: {
    test: ['CMD', 'curl', '-f', 'http://localhost/health'],
    interval: '30s',
    timeout: '3s',
    retries: 3,
    startPeriod: '40s'
  }
});

// Wait for healthy state
await healthy.waitForHealth({ timeout: 60000 });

// Check health status
const health = await healthy.getHealth();
if (health.status === 'unhealthy') {
  console.error('Container unhealthy:', health.log);
}
```

## Image Management

### Building Images

```typescript
// Build from Dockerfile
await $.docker.build({
  context: './app',
  dockerfile: 'Dockerfile',
  tag: 'myapp:latest',
  args: {
    NODE_VERSION: '18',
    ENV: 'production'
  }
});

// Multi-stage build
await $.docker.build({
  context: '.',
  dockerfile: 'Dockerfile.multi',
  target: 'production',
  tag: 'app:prod'
});

// With build progress
await $.docker.build({
  context: '.',
  tag: 'app:dev',
  onProgress: (progress) => {
    console.log(`Building: ${progress.step}/${progress.total}`);
  }
});
```

### Image Operations

```typescript
// Pull image
await $.docker.pull('node:18-alpine');

// Push image
await $.docker.push('myregistry.com/app:latest');

// Tag image
await $.docker.tag('app:latest', 'app:v1.0.0');

// Remove image
await $.docker.rmi('old-app:v0.9.0');

// List images
const images = await $.docker.images();
```

## Logging and Monitoring

### Log Streaming

```typescript
const container = $.docker({ container: 'app' });

// Stream logs
await container.logs({
  follow: true,
  tail: 100,
  timestamps: true,
  since: '10m'
}).stdout((line) => {
  console.log('LOG:', line);
}).stderr((line) => {
  console.error('ERROR:', line);
});

// Get logs as string
const logs = await container.getLogs({ tail: 50 });
console.log(logs);
```

### Container Statistics

```typescript
// Get container stats
const stats = await container.stats();
console.log('CPU:', stats.cpu_percent);
console.log('Memory:', stats.memory.usage);
console.log('Network:', stats.network);

// Stream stats
await container.streamStats((stats) => {
  console.log(`CPU: ${stats.cpu_percent}%`);
  console.log(`Memory: ${stats.memory.usage_percent}%`);
});
```

## Advanced Features

### Resource Limits

```typescript
const limited = $.docker({
  image: 'app',
  resources: {
    memory: '512m',
    cpus: '0.5',
    memorySwap: '1g',
    cpuShares: 512,
    pidsLimit: 100
  }
});
```

### Security Options

```typescript
const secure = $.docker({
  image: 'app',
  security: {
    readOnly: true,
    noNewPrivileges: true,
    user: '1000:1000',
    capabilities: {
      add: ['NET_ADMIN'],
      drop: ['ALL']
    }
  }
});
```

### Labels and Metadata

```typescript
const labeled = $.docker({
  image: 'app',
  labels: {
    'com.example.app': 'web',
    'com.example.version': '1.0.0',
    'com.example.environment': 'production'
  }
});

// Query by labels
const containers = await $.docker.ps({
  filters: {
    label: ['com.example.app=web']
  }
});
```

## Error Handling

```typescript
const container = $.docker({ container: 'app' });

try {
  await container`command`;
} catch (error) {
  if (error.code === 'CONTAINER_NOT_FOUND') {
    console.error('Container does not exist');
  } else if (error.code === 'CONTAINER_NOT_RUNNING') {
    console.error('Container is not running');
    await container.start();
  } else if (error.code === 'DOCKER_NOT_AVAILABLE') {
    console.error('Docker daemon not accessible');
  }
}
```

## Implementation Details

The Docker adapter is implemented in:
- `packages/core/src/adapters/docker-adapter.ts` - Main adapter implementation
- `packages/core/src/docker/compose.ts` - Docker Compose support
- `packages/core/src/docker/lifecycle.ts` - Container lifecycle management
- `packages/core/src/docker/registry.ts` - Registry operations

## See Also

- [Docker Environment Setup](/docs/environments/docker/setup)
- [Container Lifecycle](/docs/environments/docker/lifecycle)
- [Docker Compose](/docs/environments/docker/compose)
- [Streaming](/docs/core/execution-engine/features/streaming)