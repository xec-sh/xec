---
title: Docker Compose Integration
description: Working with Docker Compose in Xec
keywords: [docker, compose, orchestration, services, multi-container]
source_files:
  - packages/core/src/docker/compose.ts
  - packages/core/src/docker/docker-client.ts
  - packages/core/src/adapters/docker-adapter.ts
key_functions:
  - ComposeManager.up()
  - ComposeManager.down()
  - ComposeManager.exec()
  - ComposeManager.logs()
  - ComposeManager.ps()
verification_date: 2025-08-03
---

# Docker Compose Integration

## Implementation Reference

**Source Files:**
- `packages/core/src/docker/compose.ts` - Docker Compose operations
- `packages/core/src/docker/docker-client.ts` - Docker client implementation
- `packages/core/src/adapters/docker-adapter.ts` - Docker adapter
- `packages/core/src/docker/types.ts` - Type definitions

**Key Functions:**
- `ComposeManager.up()` - Start services
- `ComposeManager.down()` - Stop and remove services
- `ComposeManager.exec()` - Execute in service containers
- `ComposeManager.logs()` - Get service logs
- `ComposeManager.ps()` - List service containers
- `ComposeManager.restart()` - Restart services

## Overview

Xec provides seamless integration with Docker Compose, enabling multi-container application management through the execution engine. This allows you to orchestrate complex applications defined in `docker-compose.yml` files.

## Compose File Support

### Supported Versions

Xec supports Docker Compose file formats:
- **Version 2.x** - Legacy format
- **Version 3.x** - Most common format
- **Compose Specification** - Latest format (recommended)

### File Discovery

Compose files are discovered in order:
1. Specified file path
2. `docker-compose.yml` in current directory
3. `docker-compose.yaml` in current directory
4. `compose.yml` in current directory
5. `compose.yaml` in current directory

## Starting Services

### Basic Operations

Start all services defined in compose file:

```typescript
import { $ } from '@xec-sh/core';

// Start all services
await $.compose.up();

// Start specific services
await $.compose.up(['web', 'api']);

// Start with options
await $.compose.up({
  detach: true,           // Run in background
  build: true,            // Build images before starting
  forceRecreate: true,    // Recreate containers
  noDepends: false,       // Don't start dependencies
  scale: {
    worker: 3             // Scale worker service to 3 instances
  }
});

// Start with custom compose file
await $.compose.up({
  file: 'docker-compose.prod.yml',
  project: 'myapp'
});
```

### CLI Usage

```bash
# Start all services
xec compose up

# Start specific services
xec compose up web api

# Start with build
xec compose up --build

# Use specific compose file
xec compose -f docker-compose.prod.yml up
```

## Stopping Services

### Graceful Shutdown

Stop and optionally remove services:

```typescript
// Stop all services (keep containers)
await $.compose.stop();

// Stop specific services
await $.compose.stop(['web', 'api']);

// Stop and remove containers
await $.compose.down();

// Remove with volumes
await $.compose.down({
  volumes: true,
  removeOrphans: true
});

// Stop with timeout
await $.compose.stop({
  timeout: 30  // 30 seconds grace period
});
```

## Service Execution

### Running Commands in Services

Execute commands in service containers:

```typescript
// Execute in service container
const result = await $.compose.exec('web', 'npm test');
console.log(result.stdout);

// Execute with options
await $.compose.exec('api', 'python manage.py migrate', {
  user: 'app',
  workdir: '/app',
  env: {
    DJANGO_SETTINGS: 'production'
  }
});

// Interactive execution
await $.compose.exec('db', 'psql', {
  interactive: true,
  tty: true
});

// Execute in specific instance (scaled services)
await $.compose.exec('worker', 'celery inspect active', {
  index: 2  // Third instance (0-indexed)
});
```

### Running One-off Commands

Run commands in new containers:

```typescript
// Run one-off command
await $.compose.run('web', 'npm run build');

// Run with options
await $.compose.run('api', 'python manage.py test', {
  rm: true,              // Remove container after run
  no_deps: true,         // Don't start dependencies
  entrypoint: '/bin/sh', // Override entrypoint
  user: 'root',
  volumes: ['./data:/data']
});
```

## Service Management

### Restarting Services

Restart running services:

```typescript
// Restart all services
await $.compose.restart();

// Restart specific services
await $.compose.restart(['web', 'worker']);

// Restart with timeout
await $.compose.restart({
  timeout: 10
});
```

### Scaling Services

Scale service instances:

```typescript
// Scale services
await $.compose.scale({
  web: 3,
  worker: 5,
  api: 2
});

// Scale with verification
const scaled = await $.compose.scale({
  worker: 10
});

// Check scaling status
const services = await $.compose.ps();
const workerCount = services.filter(s => s.service === 'worker').length;
console.log(`Worker instances: ${workerCount}`);
```

## Service Monitoring

### Viewing Logs

Access service logs:

```typescript
// Get all logs
const logs = await $.compose.logs();

// Get specific service logs
const webLogs = await $.compose.logs(['web']);

// Follow logs in real-time
const stream = $.compose.logs({
  follow: true,
  tail: 100,
  timestamps: true
});

stream.on('data', (chunk) => {
  console.log(chunk.toString());
});

// Stop following
stream.stop();
```

### Service Status

Check service status:

```typescript
// List all services
const services = await $.compose.ps();

services.forEach(service => {
  console.log({
    name: service.name,
    service: service.service,
    state: service.state,
    ports: service.ports
  });
});

// Check specific service
const isRunning = await $.compose.isRunning('web');

// Get service details
const details = await $.compose.inspect('api');
```

## Environment Management

### Environment Variables

Manage environment variables for services:

```typescript
// Use .env file
await $.compose.up({
  envFile: '.env.production'
});

// Override environment variables
await $.compose.up({
  env: {
    DATABASE_URL: 'postgres://localhost/myapp',
    REDIS_URL: 'redis://localhost:6379'
  }
});

// Service-specific environment
await $.compose.exec('web', 'npm start', {
  env: {
    NODE_ENV: 'production',
    PORT: '3000'
  }
});
```

### Multiple Environments

Work with different environment configurations:

```bash
# Development
xec compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
xec compose -f docker-compose.yml -f docker-compose.prod.yml up

# Testing
xec compose -f docker-compose.test.yml up
```

## Configuration in Xec

### Compose Targets

Define compose services as targets in `.xec/config.yaml`:

```yaml
targets:
  compose:
    web:
      type: docker-compose
      file: docker-compose.yml
      service: web
      
    api:
      type: docker-compose
      file: docker-compose.yml
      service: api
      workdir: /app
      
    db:
      type: docker-compose
      file: docker-compose.yml
      service: postgres
      env:
        PGUSER: postgres
        
    # Multiple compose files
    prod-web:
      type: docker-compose
      files:
        - docker-compose.yml
        - docker-compose.prod.yml
      service: web
      project: production
```

### Compose Tasks

Define tasks for compose operations:

```yaml
tasks:
  dev:
    description: Start development environment
    steps:
      - command: docker-compose up -d
        
  test:
    description: Run tests in containers
    steps:
      - command: docker-compose run --rm web npm test
      - command: docker-compose run --rm api pytest
      
  deploy:
    description: Deploy with compose
    params:
      - name: env
        values: [dev, staging, prod]
    steps:
      - command: docker-compose -f docker-compose.${params.env}.yml up -d
      - command: docker-compose exec web npm run migrate
```

## Advanced Features

### Health Checks

Wait for services to be healthy:

```typescript
// Wait for service health
await $.compose.waitHealthy('web', {
  timeout: 60000,
  interval: 2000
});

// Check all services health
const health = await $.compose.health();
const allHealthy = health.every(s => s.status === 'healthy');
```

### Service Dependencies

Manage service dependencies:

```typescript
// Start with dependencies
await $.compose.up(['web'], {
  with_dependencies: true
});

// Start without dependencies
await $.compose.up(['worker'], {
  no_deps: true
});

// Get dependency graph
const deps = await $.compose.dependencies();
console.log(deps);
// { web: ['api', 'db'], api: ['db'], worker: ['redis'] }
```

### Build Management

Build and rebuild service images:

```typescript
// Build all images
await $.compose.build();

// Build specific services
await $.compose.build(['web', 'api']);

// Build with options
await $.compose.build({
  services: ['web'],
  noCache: true,
  pull: true,
  parallel: true,
  buildArgs: {
    VERSION: '1.2.3'
  }
});

// Rebuild and restart
await $.compose.up({
  build: true,
  forceRecreate: true
});
```

## Multi-Project Support

### Project Isolation

Work with multiple compose projects:

```typescript
// Project A
await $.compose.up({
  project: 'app-a',
  file: 'app-a/docker-compose.yml'
});

// Project B
await $.compose.up({
  project: 'app-b',
  file: 'app-b/docker-compose.yml'
});

// List all projects
const projects = await $.compose.projects();

// Remove project
await $.compose.down({
  project: 'app-a',
  volumes: true
});
```

## Performance Characteristics

**Based on Implementation:**

### Operation Timings
- **Service Start**: 1-5s per service (depends on image)
- **Service Stop**: 100ms-10s (grace period)
- **Service Exec**: 50-100ms overhead
- **Log Retrieval**: 10-100ms
- **Health Check**: 100-500ms per service

### Resource Usage
- **Memory**: ~2MB per service tracking
- **CPU**: Minimal except during operations
- **Network**: Unix socket communication

## Error Handling

### Common Errors

| Error | Code | Solution |
|-------|------|----------|
| Compose file not found | 7 | Check file path |
| Service not found | 3 | Verify service name |
| Port conflict | 8 | Change port mapping |
| Build failed | 8 | Check Dockerfile |
| Network error | 13 | Check network config |

### Error Recovery

```typescript
// Retry with cleanup
async function safeComposeUp() {
  try {
    await $.compose.up();
  } catch (error) {
    if (error.message.includes('port is already allocated')) {
      await $.compose.down();
      await $.compose.up();
    } else {
      throw error;
    }
  }
}

// Health-based startup
async function startWithHealth() {
  await $.compose.up({ detach: true });
  
  const services = ['web', 'api', 'db'];
  for (const service of services) {
    await $.compose.waitHealthy(service);
  }
}
```

## Best Practices

### Compose Management

1. **Use explicit project names** - Avoid conflicts between projects
2. **Define health checks** - Ensure reliable service state
3. **Use .env files** - Manage environment-specific config
4. **Version control compose files** - Track infrastructure changes
5. **Clean up resources** - Remove unused volumes and networks

### Development Workflow

```yaml
# docker-compose.override.yml for local development
version: '3.8'
services:
  web:
    volumes:
      - .:/app  # Mount source code
    environment:
      - DEBUG=true
    ports:
      - "3000:3000"
      
  db:
    ports:
      - "5432:5432"  # Expose for debugging
```

### Production Deployment

```typescript
// Production deployment script
async function deployProduction() {
  // Pull latest images
  await $.compose.pull();
  
  // Stop old containers
  await $.compose.down();
  
  // Start with production config
  await $.compose.up({
    file: 'docker-compose.prod.yml',
    detach: true,
    removeOrphans: true
  });
  
  // Wait for health
  await $.compose.waitHealthy('web');
  
  // Run migrations
  await $.compose.exec('api', 'python manage.py migrate');
}
```

## Related Topics

- [Docker Overview](./overview.md) - Docker basics
- [Container Lifecycle](./container-lifecycle.md) - Container management
- [Volume Management](./volume-management.md) - Data persistence
- [Networking](./networking.md) - Network configuration
- [Commands Reference](../../commands/built-in/in.md) - CLI usage