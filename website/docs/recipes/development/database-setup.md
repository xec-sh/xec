---
title: Database Setup
description: Local database setup and management with Xec
keywords: [database, postgres, mysql, mongodb, docker, development]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/health/index.ts
---

# Database Setup Recipe

## Implementation Reference

The recipe uses Xec’s public execution API and standard Node APIs. Its Xec entry points are:

- `packages/core/src/core/execution-engine.ts`
- `packages/ops/src/health/index.ts`

## Overview

This recipe demonstrates how to set up and manage local development databases using Xec's Docker integration. It covers PostgreSQL, MySQL, MongoDB, and Redis. Use only an isolated development Compose project. Declare the referenced image/password variables in your local environment, keep credentials out of Git, and implement the named application migration/verification scripts before invoking them. The full Compose declaration is provided below.

## PostgreSQL Setup

### Basic PostgreSQL Container

```typescript
// Use the reviewed Compose file below; up preserves the declared volume.
await $`docker compose -f compose.dev.yaml up -d --wait postgres`;
await $`docker compose -f compose.dev.yaml exec -T postgres psql -U developer -d myapp -v ON_ERROR_STOP=1 -c ${'SELECT 1'}`;
// Never remove an existing database container or volume merely to repeat setup.
```

### PostgreSQL with Docker Compose

```yaml
services:
  postgres:
    image: ${POSTGRES_IMAGE:?set a compatible pinned PostgreSQL image}
    environment:
      POSTGRES_USER: developer
      POSTGRES_DB: myapp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set a development password}
    ports: ['127.0.0.1:5432:5432']
    volumes: ['postgres-data:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U developer -d myapp']
      interval: 2s
      timeout: 2s
      retries: 30
volumes:
  postgres-data: {}
```

```typescript
// setup-postgres-compose.ts
import { $ } from '@xec-sh/core';

async function setupPostgresCompose() {
  // Start PostgreSQL with compose
  await $`docker-compose up -d postgres`;

  // Wait for health check
  console.log('Waiting for PostgreSQL to be healthy...');
  await $`docker-compose exec -T postgres pg_isready -U developer`;

  // Load seed data
  console.log('Loading seed data...');
  await $`docker-compose exec -T postgres psql -U developer -d myapp -f /docker-entrypoint-initdb.d/seed.sql`;

  console.log('✅ PostgreSQL is ready with seed data!');
}

setupPostgresCompose().catch(console.error);
```

## MySQL Setup

### MySQL with Persistent Data

```typescript
// The complete Compose file declares the image, volume and credentials.
await $`docker compose -f compose.dev.yaml up -d --wait mysql`;
// Application-owned migrations verify authentication and schema compatibility.
await $`npm run db:migrate:mysql`;
await $`npm run db:verify:mysql`;
```

## MongoDB Setup

### MongoDB Replica Set

```typescript
await $`docker compose -f compose.dev.yaml up -d --wait mongodb`;
// Replica-set membership, authentication/keyfile and idempotent initialization
// belong to the application bootstrap; standalone ping is not proof of a replica set.
await $`npm run db:configure-mongo`;
await $`npm run db:verify-mongo`;
```

## Redis Setup

### Redis with Persistence

```typescript
await $`docker compose -f compose.dev.yaml up -d --wait redis`;
const response = await $`docker compose -f compose.dev.yaml exec -T redis redis-cli ping`.text();
if (response.trim() !== 'PONG') throw new Error('Redis did not answer PONG');
// This loopback-only development example does not define production authentication.
```

## Multi-Database Stack

### Complete Development Stack

```yaml
# compose.dev.yaml — image references are chosen and pinned by the application.
services:
  postgres:
    image: ${POSTGRES_IMAGE:?set a compatible pinned image}
    environment:
      POSTGRES_USER: developer
      POSTGRES_DB: myapp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set a development password}
    ports: ['127.0.0.1:5432:5432']
    volumes: ['postgres-data:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U developer -d myapp']
      interval: 2s
      timeout: 2s
      retries: 30
  mysql:
    image: ${MYSQL_IMAGE:?set a compatible pinned image}
    environment:
      MYSQL_DATABASE: myapp
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set a development password}
    ports: ['127.0.0.1:3306:3306']
    volumes: ['mysql-data:/var/lib/mysql']
    healthcheck:
      test: ['CMD-SHELL', 'MYSQL_PWD="$$MYSQL_ROOT_PASSWORD" mysqladmin ping --silent']
      interval: 2s
      timeout: 2s
      retries: 60
  mongodb:
    image: ${MONGO_IMAGE:?set a compatible pinned image}
    command: ['mongod', '--replSet', 'rs0', '--bind_ip_all']
    ports: ['127.0.0.1:27017:27017']
    volumes: ['mongo-data:/data/db']
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1})']
      interval: 2s
      timeout: 2s
      retries: 30
  redis:
    image: ${REDIS_IMAGE:?set a compatible pinned image}
    command: ['redis-server', '--appendonly', 'yes']
    ports: ['127.0.0.1:6379:6379']
    volumes: ['redis-data:/data']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 2s
      timeout: 2s
      retries: 30
volumes:
  postgres-data: {}
  mysql-data: {}
  mongo-data: {}
  redis-data: {}
```

```typescript
// scripts/setup-all-databases.ts
await $`docker compose -f compose.dev.yaml up -d --wait --wait-timeout 120`;
// These application-owned scripts verify schema/replica-set requirements.
await $`npm run db:configure-mongo`;
await $`npm run db:verify`;
console.log('Container health and application database acceptance passed');
```

## Database Management

### Backup and Restore

```typescript
// scripts/backup.ts and scripts/restore.ts are the complete examples in the
// Backup and Restore recipe; provide connection services and acceptance first.
await $`xec run scripts/backup.ts`;
// Restore into a separately provisioned empty test database, never reset the live volume.
```

### Health Monitoring

```typescript
import { HealthChecker } from '@xec-sh/ops';
const report = await HealthChecker.create()
  .command('docker compose -f compose.dev.yaml exec -T postgres psql -U developer -d myapp -v ON_ERROR_STOP=1 -c "SELECT 1"', { timeout: 5000 })
  .command('docker compose -f compose.dev.yaml exec -T redis redis-cli ping', { timeout: 5000, contains: 'PONG' })
  .run();
console.log(report);
if (!report.healthy) throw new Error('Database acceptance failed');
```

## Configuration in Xec

### Task Configuration

```yaml
version: '1.0'
tasks:
  db:setup:
    description: Start configured services and await healthchecks
    command: docker compose -f compose.dev.yaml up -d --wait
  db:stop:
    description: Stop services while retaining their containers and volumes
    command: docker compose -f compose.dev.yaml stop
  db:health:
    command: xec run scripts/db-health.ts
  db:backup:
    command: xec run scripts/backup.ts
```

## Performance Characteristics

### Startup Times

Use the declared healthchecks and SQL acceptance; a fixed sleep cannot establish readiness.

### Resource Usage

Measure the chosen images and actual data volume. Set Compose limits appropriate for the workstation and workload.

### Docker Operations

`up --wait` exits unsuccessfully if the configured health contract fails. It does not replace application migrations or replica-set acceptance. Retain volumes on ordinary stop/start and review version compatibility before changing images.

## Troubleshooting

### Common Issues

1. **Port already in use**: inspect the listener and choose a different loopback mapping. Do not terminate an unrelated database.
   ```bash
   lsof -i :5432
   docker compose -f compose.dev.yaml ps
   ```
2. **An existing Compose project has the same name**: select a distinct project name consistently for every command. Inspect the existing project before changing it.
3. **Volume permissions**: inspect container logs and the volume owner; repair the specific mismatch. Deleting the volume destroys the data and is not a permissions repair.
   ```bash
   docker compose -f compose.dev.yaml logs postgres
   ```
4. **Health timeout**: inspect the failing check, image, available resources and database logs. Increase the budget only after understanding the failure.

## Related Recipes

- [Hot Reload](./hot-reload.md) - Development with file watching
- [API Mocking](./api-mocking.md) - Mock API servers
- [Test Data](./test-data.md) - Generate test data
- [Docker Deploy](../deployment/docker-deploy.md) - Production deployment

## See Also

- [Docker Adapter Documentation](../../core/execution-engine/adapters/docker-adapter.md)
- [Docker Compose Integration](../../targets/docker/compose-integration.md)
- [Container Lifecycle](../../targets/docker/container-lifecycle.md)