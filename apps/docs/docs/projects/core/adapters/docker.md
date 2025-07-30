---
sidebar_position: 3
---

# Docker Adapter

Execute commands in Docker containers with support for both ephemeral and persistent containers.

## Overview

The Docker adapter provides:

- **Ephemeral Containers** - Run single commands in auto-removed containers
- **Persistent Container Execution** - Execute commands in existing containers
- **Docker Compose** - Multi-container application management
- **Volume Management** - Mount host directories and named volumes
- **Network Configuration** - Custom networks and port mapping
- **Environment Variables** - Pass configuration to containers

## Simplified API (Recommended)

The Docker adapter provides a simplified API that automatically handles ephemeral vs persistent containers:

### Ephemeral Containers

When you specify an `image`, the adapter runs commands in ephemeral containers that are automatically removed after execution:

```typescript
import { $ } from '@xec-sh/core';

// Run command in ephemeral container
await $.docker({
  image: 'alpine:latest',
  volumes: ['/data:/data']
})`echo "Hello" > /data/output.txt`;

// Using fluent API
await $.docker()
  .ephemeral('node:18-alpine')
  .workdir('/app')
  .env({ NODE_ENV: 'production' })
  .run`node --version`;
```

### Persistent Containers

When you specify a `container` name, the adapter executes commands in existing containers:

```typescript
// Execute in existing container
await $.docker({
  container: 'my-app',
  workdir: '/app'
})`npm test`;

// Using fluent API
await $.docker()
  .container('my-app')
  .workdir('/app')
  .user('node')
  .exec`npm start`;
```

## Basic Usage

### Execute in Existing Container

```typescript
import { $ } from '@xec-sh/core';

// Execute in running container
const container = $.docker({ container: 'my-app' });
await container`ps aux`;
await container`cat /etc/hostname`;
```

### Execute in Ephemeral Container

```typescript
// One-off execution (auto-removed after execution)
const result = await $.docker({ image: 'alpine' })`echo "Hello from Alpine"`;

// With configuration
const result2 = await $.docker({
  image: 'ubuntu:latest',
  volumes: ['./data:/data'],
  workdir: '/data',
  env: { MY_VAR: 'value' }
})`ls -la && echo $MY_VAR`;
```

## Container Configuration

### Ephemeral Container Options

```typescript
// All options for ephemeral containers
const result = await $.docker({
  // Required
  image: 'ubuntu:22.04',
  
  // Container settings
  workdir: '/app',
  user: 'node:node',
  
  // Volume mounting
  volumes: ['./data:/data', 'my-vol:/persist'],
  
  // Environment variables
  env: {
    NODE_ENV: 'production',
    API_KEY: 'secret'
  },
  
  // Network
  network: 'my-network',
  
  // Port mapping (if needed for ephemeral containers)
  ports: ['8080:80', '3306:3306'],
  
  // Labels
  labels: {
    'com.example.app': 'myapp',
    'com.example.version': '1.0.0'
  },
  
  // Privileged mode
  privileged: false
})`node server.js`;
```

### Persistent Container Options

```typescript
// Execute in existing container with options
const app = $.docker({
  container: 'my-app',
  workdir: '/app',
  user: 'node',
  env: {
    NODE_ENV: 'test'
  }
});

await app`npm test`;
await app`npm run coverage`;
```

## Container Lifecycle Management

For containers that need full lifecycle management, use Docker CLI commands:

```typescript
// Create and start a container
await $`docker run -d \
  --name my-app \
  -p 3000:3000 \
  -v ./src:/app \
  -e NODE_ENV=development \
  node:18 npm start`;

// Execute commands in the running container
const app = $.docker({ container: 'my-app' });
await app`npm install`;
await app`npm test`;

// Container management
await $`docker stop my-app`;
await $`docker start my-app`;
await $`docker restart my-app`;

// Get container info
const info = await $`docker inspect my-app`;
const containerInfo = JSON.parse(info.stdout)[0];
console.log('Container ID:', containerInfo.Id);
console.log('State:', containerInfo.State.Status);

// View logs
await $`docker logs my-app --tail 50`;

// Follow logs in real-time
await $`docker logs -f my-app`;

// Clean up
await $`docker stop my-app`;
await $`docker rm my-app`;
```

## Volume Management

### Named Volumes

```typescript
// Create container with named volume
await $`docker run -d \
  --name database \
  -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=myapp \
  postgres:15`;

// Execute commands
const db = $.docker({ container: 'database' });
await db`psql -U postgres -c "SELECT version();"`;

// Data persists even after container removal
await $`docker stop database && docker rm database`;

// Recreate with same volume - data is preserved
await $`docker run -d \
  --name database-new \
  -v pgdata:/var/lib/postgresql/data \
  postgres:15`;
```

### Bind Mounts

```typescript
// Development with live reload
await $`docker run -d \
  --name dev-server \
  -v ./src:/app/src \
  -v ./package.json:/app/package.json \
  -w /app \
  -p 3000:3000 \
  node:18 npm run dev`;

// Changes to ./src are reflected immediately
const dev = $.docker({ container: 'dev-server' });
await dev`npm install`;
```

## Network Management

### Custom Networks

```typescript
// Create network
await $`docker network create app-network`;

// Start containers on network
await $`docker run -d \
  --name api-server \
  --network app-network \
  my-api:latest`;

await $`docker run -d \
  --name web-server \
  --network app-network \
  -e API_URL=http://api-server:3000 \
  my-web:latest`;

// Containers can communicate by name
const web = $.docker({ container: 'web-server' });
await web`curl http://api-server:3000/health`;

// Cleanup
await $`docker stop api-server web-server`;
await $`docker rm api-server web-server`;
await $`docker network rm app-network`;
```

## File Operations

### Copy Files To/From Containers

```typescript
// Start a container
await $`docker run -d --name app node:18 sleep 3600`;

// Copy file to container
await $`docker cp ./config.json app:/app/config.json`;

// Copy directory to container  
await $`docker cp ./src app:/app/src`;

// Verify copy
const app = $.docker({ container: 'app' });
const files = await app`ls -la /app`;
console.log(files.stdout);

// Copy file from container
await $`docker cp app:/app/output.log ./output.log`;

// Copy directory from container
await $`docker cp app:/app/build ./dist`;

// Cleanup
await $`docker rm -f app`;
```

## Health Checks

```typescript
// Run container with health check
await $`docker run -d \
  --name healthy-app \
  --health-cmd "curl -f http://localhost:3000/health || exit 1" \
  --health-interval 30s \
  --health-timeout 10s \
  --health-retries 3 \
  --health-start-period 40s \
  my-app:latest`;

// Wait for container to be healthy
let healthy = false;
for (let i = 0; i < 60; i++) {
  const status = await $`docker inspect healthy-app --format '{{.State.Health.Status}}'`.nothrow();
  if (status.stdout.trim() === 'healthy') {
    healthy = true;
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}

if (healthy) {
  console.log('Container is healthy!');
} else {
  console.error('Container failed health check');
  const logs = await $`docker logs healthy-app --tail 50`;
  console.error('Recent logs:', logs.stdout);
}
```

## Docker Compose

### Basic Compose Operations

```typescript
// Compose up
await $`docker-compose -f docker-compose.yml up -d`;

// Check status
const status = await $`docker-compose ps`;
console.log(status.stdout);

// View logs for specific service
await $`docker-compose logs web --tail 50`;

// Execute command in service container
const web = $.docker({ container: 'myapp_web_1' });
await web`npm test`;

// Compose down
await $`docker-compose down`;

// With volume removal
await $`docker-compose down -v`;
```

### Multiple Compose Files

```typescript
// Development environment
await $`docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d`;

// Production environment
await $`docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d`;
```

## Fluent API

The Docker adapter provides a fluent API for more readable container configuration:

### Basic Fluent Usage

```typescript
// Ephemeral container with method chaining
await $.docker()
  .ephemeral('alpine:latest')
  .volumes(['/data:/data'])
  .workdir('/app')
  .user('nobody')
  .env({ NODE_ENV: 'production' })
  .run`echo "Hello from fluent API"`;

// Existing container execution
await $.docker()
  .container('my-app')
  .workdir('/app')
  .exec`npm test`;
```

### Advanced Fluent Configuration

```typescript
// Complex ephemeral setup
const result = await $.docker()
  .ephemeral('node:18-alpine')
  .volumes([
    './src:/app/src:ro',
    './dist:/app/dist'
  ])
  .workdir('/app')
  .user('node')
  .env({
    NODE_ENV: 'production',
    API_KEY: process.env.API_KEY
  })
  .network('my-network')
  .ports(['3000:3000'])
  .labels({
    app: 'my-service',
    version: '1.0.0'
  })
  .privileged()
  .run`npm run build`;
```

### Build and Run Pattern

```typescript
// Build an image
await $`docker build -t myapp:latest \
  --build-arg VERSION=1.0.0 \
  -f Dockerfile.prod \
  ./docker/myapp`;

// Run with the built image
await $.docker()
  .ephemeral('myapp:latest')
  .volumes(['./data:/data'])
  .run`process-data /data/input.json`;
```

## Advanced Patterns

### Container Factory Pattern

```typescript
// Helper function for common container configurations
function createService(name: string, image: string, port: number) {
  return $`docker run -d \
    --name ${name} \
    -p ${port}:${port} \
    --restart unless-stopped \
    ${image}`;
}

// Create services
await createService('web', 'nginx:alpine', 80);
await createService('api', 'my-api:latest', 3000);
await createService('cache', 'redis:alpine', 6379);
```

### Development Environment

```typescript
// Start development stack
async function startDevStack() {
  // Create network
  await $`docker network create dev-net`.nothrow();
  
  // Start database
  await $`docker run -d \
    --name dev-db \
    --network dev-net \
    -p 5432:5432 \
    -e POSTGRES_PASSWORD=devpass \
    -e POSTGRES_DB=devdb \
    postgres:15`;
  
  // Start Redis
  await $`docker run -d \
    --name dev-redis \
    --network dev-net \
    -p 6379:6379 \
    redis:alpine`;
  
  // Start app with hot reload
  await $`docker run -d \
    --name dev-app \
    --network dev-net \
    -p 3000:3000 \
    -v ${process.cwd()}:/app \
    -w /app \
    -e NODE_ENV=development \
    -e DATABASE_URL=postgresql://postgres:devpass@dev-db:5432/devdb \
    -e REDIS_URL=redis://dev-redis:6379 \
    node:18 npm run dev`;
  
  console.log('Development stack started!');
}

// Stop development stack
async function stopDevStack() {
  await $`docker stop dev-app dev-redis dev-db`.nothrow();
  await $`docker rm dev-app dev-redis dev-db`.nothrow();
  await $`docker network rm dev-net`.nothrow();
  console.log('Development stack stopped!');
}
```

### Testing with Containers

```typescript
// Run tests in isolated environment
async function runIntegrationTests() {
  const testId = Date.now();
  
  try {
    // Start test database
    await $`docker run -d \
      --name test-db-${testId} \
      -e POSTGRES_PASSWORD=test \
      -e POSTGRES_DB=test \
      postgres:15`;
    
    // Wait for database to be ready
    for (let i = 0; i < 30; i++) {
      const ready = await $`docker exec test-db-${testId} pg_isready -U postgres`.nothrow();
      if (ready.ok) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Run tests in container
    const result = await $.docker({
      image: 'node:18',
      volumes: [`${process.cwd()}:/app`],
      workdir: '/app',
      env: {
        DATABASE_URL: `postgresql://postgres:test@test-db-${testId}:5432/test`,
        NODE_ENV: 'test'
      },
      network: 'bridge'
    })`npm test`;
    
    return result;
  } finally {
    // Cleanup
    await $`docker rm -f test-db-${testId}`.nothrow();
  }
}
```

## Best Practices

### 1. Always Clean Up

```typescript
// ✅ Good - ephemeral containers auto-remove
await $.docker({ image: 'alpine' })`echo "test"`;

// ✅ Good - manual cleanup for persistent containers
await $`docker run -d --name test-app my-app`;
try {
  const app = $.docker({ container: 'test-app' });
  await app`run-tests`;
} finally {
  await $`docker rm -f test-app`;
}

// ❌ Bad - leaves containers running
await $`docker run -d --name test-app my-app`;
// No cleanup!
```

### 2. Use Specific Image Tags

```typescript
// ✅ Good - pinned version
await $.docker({ image: 'node:18.17.0-alpine' })`node --version`;

// ❌ Bad - latest tag can change
await $.docker({ image: 'node:latest' })`node --version`;
```

### 3. Name Your Containers

```typescript
// ✅ Good - descriptive names for persistent containers
await $`docker run -d --name myapp-postgres-dev postgres:15`;

// ❌ Bad - random names make debugging hard
await $`docker run -d postgres:15`;
```

### 4. Use Health Checks for Critical Services

```typescript
// ✅ Good - health check ensures readiness
await $`docker run -d \
  --name api \
  --health-cmd "curl -f http://localhost:3000/health" \
  --health-interval 10s \
  my-api:latest`;

// Wait for health
let attempts = 0;
while (attempts < 30) {
  const health = await $`docker inspect api --format '{{.State.Health.Status}}'`.nothrow();
  if (health.stdout.trim() === 'healthy') break;
  await new Promise(resolve => setTimeout(resolve, 2000));
  attempts++;
}
```

### 5. Handle Volumes Appropriately

```typescript
// ✅ Good - use named volumes for data persistence
await $`docker run -d \
  --name db \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:15`;

// ✅ Good - use bind mounts for development
await $`docker run -d \
  --name dev-app \
  -v ./src:/app/src:ro \
  my-app:dev`;
```

## Migration from Old API

If you're using the deprecated DockerContext API, here's how to migrate:

### Old API (Deprecated)
```typescript
// Old lifecycle management
const container = await $.docker({
  image: 'nginx',
  name: 'web'
}).start();
await container.exec`nginx -v`;
await container.stop();
await container.remove();
```

### New API (Recommended)
```typescript
// Use Docker CLI for lifecycle management
await $`docker run -d --name web nginx`;
const container = $.docker({ container: 'web' });
await container`nginx -v`;
await $`docker stop web`;
await $`docker rm web`;

// Or use ephemeral containers
await $.docker({ image: 'nginx' })`nginx -v`;
```

## Troubleshooting

### Container Not Found

```typescript
// Check if container exists
const exists = await $`docker ps -a --filter name=my-app --format '{{.Names}}'`.nothrow();
if (!exists.stdout.includes('my-app')) {
  console.error('Container not found');
}
```

### Permission Denied

```typescript
// Run with specific user
await $.docker({
  container: 'my-app',
  user: '1000:1000'  // uid:gid
})`ls -la`;
```

### Network Issues

```typescript
// Check container network
const network = await $`docker inspect my-app --format '{{.NetworkSettings.Networks}}'`;
console.log('Networks:', network.stdout);

// Test connectivity
const app = $.docker({ container: 'my-app' });
await app`ping -c 1 google.com`;
```