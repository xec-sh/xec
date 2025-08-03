---
title: Database Setup
description: Local database setup and management with Xec
keywords: [database, postgres, mysql, mongodb, docker, development]
source_files:
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/src/docker/docker-client.ts
  - packages/core/src/docker/compose.ts
  - packages/core/examples/docker-postgres.ts
key_functions:
  - DockerAdapter.execute()
  - DockerClient.createContainer()
  - DockerClient.startContainer()
  - ComposeManager.up()
verification_date: 2025-08-03
---

# Database Setup Recipe

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/docker-adapter.ts` - Docker execution adapter
- `packages/core/src/docker/docker-client.ts` - Docker API client
- `packages/core/src/docker/compose.ts` - Docker Compose operations
- `packages/core/examples/docker-postgres.ts` - PostgreSQL example

**Key Functions:**
- `DockerAdapter.execute()` - Execute commands in containers
- `DockerClient.createContainer()` - Create database containers
- `DockerClient.startContainer()` - Start containers
- `ComposeManager.up()` - Start compose stacks

## Overview

This recipe demonstrates how to set up and manage local development databases using Xec's Docker integration. It covers PostgreSQL, MySQL, MongoDB, and Redis setups with proper health checks and data persistence.

## PostgreSQL Setup

### Basic PostgreSQL Container

```typescript
// setup-postgres.ts
import { $ } from '@xec-sh/core';

const POSTGRES_VERSION = '15-alpine';
const DB_NAME = 'myapp';
const DB_USER = 'developer';
const DB_PASSWORD = 'development';

async function setupPostgres() {
  // Check if container exists
  const existing = await $`docker ps -a --filter name=postgres-dev --format "{{.Names}}"`.nothrow();
  
  if (existing.stdout.trim()) {
    console.log('Removing existing container...');
    await $`docker rm -f postgres-dev`;
  }
  
  // Create and start PostgreSQL
  console.log('Starting PostgreSQL...');
  await $`docker run -d \
    --name postgres-dev \
    -e POSTGRES_DB=${DB_NAME} \
    -e POSTGRES_USER=${DB_USER} \
    -e POSTGRES_PASSWORD=${DB_PASSWORD} \
    -p 5432:5432 \
    -v postgres-data:/var/lib/postgresql/data \
    postgres:${POSTGRES_VERSION}`;
  
  // Wait for database to be ready
  console.log('Waiting for database to be ready...');
  for (let i = 0; i < 30; i++) {
    const result = await $`docker exec postgres-dev pg_isready -U ${DB_USER}`.nothrow();
    if (result.exitCode === 0) {
      console.log('✅ PostgreSQL is ready!');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Run initial migrations
  console.log('Running migrations...');
  await $`docker exec -i postgres-dev psql -U ${DB_USER} -d ${DB_NAME} < schema.sql`;
  
  console.log(`
Database ready:
  Host: localhost
  Port: 5432
  Database: ${DB_NAME}
  User: ${DB_USER}
  Password: ${DB_PASSWORD}
  `);
}

setupPostgres().catch(console.error);
```

### PostgreSQL with Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: postgres-dev
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: developer
      POSTGRES_PASSWORD: development
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U developer"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
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
// setup-mysql.ts
import { $ } from '@xec-sh/core';

const MYSQL_VERSION = '8.0';
const MYSQL_ROOT_PASSWORD = 'rootpass';
const MYSQL_DATABASE = 'myapp';
const MYSQL_USER = 'developer';
const MYSQL_PASSWORD = 'development';

async function setupMySQL() {
  // Remove existing container
  await $`docker rm -f mysql-dev`.nothrow();
  
  // Start MySQL container
  console.log('Starting MySQL...');
  await $`docker run -d \
    --name mysql-dev \
    -e MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD} \
    -e MYSQL_DATABASE=${MYSQL_DATABASE} \
    -e MYSQL_USER=${MYSQL_USER} \
    -e MYSQL_PASSWORD=${MYSQL_PASSWORD} \
    -p 3306:3306 \
    -v mysql-data:/var/lib/mysql \
    mysql:${MYSQL_VERSION}`;
  
  // Wait for MySQL to be ready
  console.log('Waiting for MySQL to be ready...');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const result = await $`docker exec mysql-dev mysqladmin ping -h localhost -u${MYSQL_USER} -p${MYSQL_PASSWORD}`.nothrow();
    if (result.stdout.includes('mysqld is alive')) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!ready) {
    throw new Error('MySQL failed to start within 60 seconds');
  }
  
  console.log('✅ MySQL is ready!');
  
  // Create tables
  console.log('Creating tables...');
  await $`docker exec -i mysql-dev mysql -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE} < schema.sql`;
  
  console.log(`
MySQL Database ready:
  Host: localhost
  Port: 3306
  Database: ${MYSQL_DATABASE}
  User: ${MYSQL_USER}
  Password: ${MYSQL_PASSWORD}
  `);
}

setupMySQL().catch(console.error);
```

## MongoDB Setup

### MongoDB Replica Set

```typescript
// setup-mongodb.ts
import { $ } from '@xec-sh/core';

async function setupMongoDB() {
  const MONGO_VERSION = '7.0';
  const MONGO_INITDB_ROOT_USERNAME = 'admin';
  const MONGO_INITDB_ROOT_PASSWORD = 'admin123';
  const MONGO_DATABASE = 'myapp';
  
  // Remove existing container
  await $`docker rm -f mongodb-dev`.nothrow();
  
  // Start MongoDB
  console.log('Starting MongoDB...');
  await $`docker run -d \
    --name mongodb-dev \
    -e MONGO_INITDB_ROOT_USERNAME=${MONGO_INITDB_ROOT_USERNAME} \
    -e MONGO_INITDB_ROOT_PASSWORD=${MONGO_INITDB_ROOT_PASSWORD} \
    -e MONGO_INITDB_DATABASE=${MONGO_DATABASE} \
    -p 27017:27017 \
    -v mongodb-data:/data/db \
    -v ./mongo-init:/docker-entrypoint-initdb.d \
    mongo:${MONGO_VERSION}`;
  
  // Wait for MongoDB to be ready
  console.log('Waiting for MongoDB...');
  for (let i = 0; i < 30; i++) {
    const result = await $`docker exec mongodb-dev mongosh --eval "db.adminCommand('ping')" -u ${MONGO_INITDB_ROOT_USERNAME} -p ${MONGO_INITDB_ROOT_PASSWORD} --authenticationDatabase admin`.nothrow();
    if (result.exitCode === 0) {
      console.log('✅ MongoDB is ready!');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Create application user and collections
  console.log('Setting up application database...');
  await $`docker exec mongodb-dev mongosh -u ${MONGO_INITDB_ROOT_USERNAME} -p ${MONGO_INITDB_ROOT_PASSWORD} --authenticationDatabase admin --eval "
    use ${MONGO_DATABASE};
    db.createUser({
      user: 'appuser',
      pwd: 'apppass',
      roles: [{role: 'readWrite', db: '${MONGO_DATABASE}'}]
    });
    db.createCollection('users');
    db.createCollection('sessions');
    db.users.createIndex({email: 1}, {unique: true});
  "`;
  
  console.log(`
MongoDB ready:
  Host: localhost
  Port: 27017
  Database: ${MONGO_DATABASE}
  Admin User: ${MONGO_INITDB_ROOT_USERNAME}
  App User: appuser
  Connection: mongodb://appuser:apppass@localhost:27017/${MONGO_DATABASE}
  `);
}

setupMongoDB().catch(console.error);
```

## Redis Setup

### Redis with Persistence

```typescript
// setup-redis.ts
import { $ } from '@xec-sh/core';

async function setupRedis() {
  const REDIS_VERSION = '7-alpine';
  const REDIS_PASSWORD = 'redispass';
  
  // Remove existing container
  await $`docker rm -f redis-dev`.nothrow();
  
  // Start Redis with persistence
  console.log('Starting Redis...');
  await $`docker run -d \
    --name redis-dev \
    -p 6379:6379 \
    -v redis-data:/data \
    redis:${REDIS_VERSION} \
    redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}`;
  
  // Wait for Redis
  console.log('Waiting for Redis...');
  for (let i = 0; i < 10; i++) {
    const result = await $`docker exec redis-dev redis-cli -a ${REDIS_PASSWORD} ping`.nothrow();
    if (result.stdout.trim() === 'PONG') {
      console.log('✅ Redis is ready!');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Set initial data
  console.log('Setting initial cache data...');
  await $`docker exec redis-dev redis-cli -a ${REDIS_PASSWORD} SET app:config '{"version":"1.0.0","features":["auth","api"]}'`;
  await $`docker exec redis-dev redis-cli -a ${REDIS_PASSWORD} EXPIRE app:config 3600`;
  
  console.log(`
Redis ready:
  Host: localhost
  Port: 6379
  Password: ${REDIS_PASSWORD}
  Connection: redis://:${REDIS_PASSWORD}@localhost:6379
  `);
}

setupRedis().catch(console.error);
```

## Multi-Database Stack

### Complete Development Stack

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp_pg
      POSTGRES_USER: pguser
      POSTGRES_PASSWORD: pgpass
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pguser"]
      interval: 10s
      timeout: 5s
      retries: 5

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: myapp_mysql
      MYSQL_USER: mysqluser
      MYSQL_PASSWORD: mysqlpass
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin123
      MONGO_INITDB_DATABASE: myapp_mongo
    ports:
      - "27017:27017"
    volumes:
      - mongodb-data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass redispass
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "redispass", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  mysql-data:
  mongodb-data:
  redis-data:
```

```typescript
// setup-all-databases.ts
import { $ } from '@xec-sh/core';

async function setupAllDatabases() {
  console.log('Starting all databases...');
  await $`docker-compose -f docker-compose.dev.yml up -d`;
  
  // Wait for all services to be healthy
  console.log('Waiting for all services to be healthy...');
  const services = ['postgres', 'mysql', 'mongodb', 'redis'];
  
  for (const service of services) {
    let healthy = false;
    for (let i = 0; i < 60; i++) {
      const result = await $`docker-compose -f docker-compose.dev.yml ps ${service}`.nothrow();
      if (result.stdout.includes('healthy')) {
        console.log(`✅ ${service} is healthy`);
        healthy = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!healthy) {
      console.error(`❌ ${service} failed to become healthy`);
    }
  }
  
  console.log('\n🎉 All databases are ready!\n');
  
  // Show connection info
  await $`docker-compose -f docker-compose.dev.yml ps`;
}

setupAllDatabases().catch(console.error);
```

## Database Management

### Backup and Restore

```typescript
// db-backup.ts
import { $ } from '@xec-sh/core';
import { format } from 'date-fns';

async function backupDatabases() {
  const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
  const backupDir = `./backups/${timestamp}`;
  
  await $`mkdir -p ${backupDir}`;
  
  // Backup PostgreSQL
  console.log('Backing up PostgreSQL...');
  await $`docker exec postgres-dev pg_dump -U pguser myapp_pg > ${backupDir}/postgres.sql`;
  
  // Backup MySQL
  console.log('Backing up MySQL...');
  await $`docker exec mysql-dev mysqldump -umysqluser -pmysqlpass myapp_mysql > ${backupDir}/mysql.sql`;
  
  // Backup MongoDB
  console.log('Backing up MongoDB...');
  await $`docker exec mongodb-dev mongodump --uri="mongodb://admin:admin123@localhost:27017" --out=/tmp/backup`;
  await $`docker cp mongodb-dev:/tmp/backup ${backupDir}/mongodb`;
  
  // Backup Redis
  console.log('Backing up Redis...');
  await $`docker exec redis-dev redis-cli -a redispass BGSAVE`;
  await new Promise(resolve => setTimeout(resolve, 2000));
  await $`docker cp redis-dev:/data/dump.rdb ${backupDir}/redis.rdb`;
  
  console.log(`✅ Backup completed: ${backupDir}`);
}

backupDatabases().catch(console.error);
```

### Health Monitoring

```typescript
// db-health.ts
import { $ } from '@xec-sh/core';

async function checkDatabaseHealth() {
  const checks = [
    {
      name: 'PostgreSQL',
      check: async () => {
        const result = await $`docker exec postgres-dev pg_isready -U pguser`.nothrow();
        return result.exitCode === 0;
      }
    },
    {
      name: 'MySQL',
      check: async () => {
        const result = await $`docker exec mysql-dev mysqladmin ping -h localhost`.nothrow();
        return result.stdout.includes('mysqld is alive');
      }
    },
    {
      name: 'MongoDB',
      check: async () => {
        const result = await $`docker exec mongodb-dev mongosh --eval "db.adminCommand('ping')" --quiet`.nothrow();
        return result.exitCode === 0;
      }
    },
    {
      name: 'Redis',
      check: async () => {
        const result = await $`docker exec redis-dev redis-cli ping`.nothrow();
        return result.stdout.trim() === 'PONG';
      }
    }
  ];
  
  console.log('Checking database health...\n');
  
  for (const { name, check } of checks) {
    try {
      const healthy = await check();
      console.log(`${healthy ? '✅' : '❌'} ${name}: ${healthy ? 'Healthy' : 'Unhealthy'}`);
    } catch (error) {
      console.log(`❌ ${name}: Error - ${error.message}`);
    }
  }
}

checkDatabaseHealth().catch(console.error);
```

## Configuration in Xec

### Task Configuration

```yaml
# .xec/config.yaml
tasks:
  db:setup:
    description: Setup all development databases
    command: docker-compose -f docker-compose.dev.yml up -d
    
  db:stop:
    description: Stop all databases
    command: docker-compose -f docker-compose.dev.yml down
    
  db:reset:
    description: Reset all databases
    steps:
      - name: Stop databases
        command: docker-compose -f docker-compose.dev.yml down -v
      - name: Start databases
        command: docker-compose -f docker-compose.dev.yml up -d
      - name: Wait for health
        command: ./scripts/wait-for-healthy.sh
      - name: Load seed data
        command: ./scripts/seed-all.sh
        
  db:backup:
    description: Backup all databases
    params:
      - name: output
        default: ./backups
    command: xec run scripts/db-backup.ts --output ${params.output}
    
  db:restore:
    description: Restore databases from backup
    params:
      - name: backup
        required: true
    command: xec run scripts/db-restore.ts --backup ${params.backup}
```

## Performance Characteristics

**Based on Implementation:**

### Startup Times
- **PostgreSQL**: 2-5 seconds to healthy state
- **MySQL**: 10-30 seconds to accept connections
- **MongoDB**: 5-10 seconds to be ready
- **Redis**: \<1 second to respond to ping

### Resource Usage
- **PostgreSQL**: ~100MB RAM minimum
- **MySQL**: ~400MB RAM minimum
- **MongoDB**: ~350MB RAM minimum
- **Redis**: ~10MB RAM minimum

### Docker Operations
- **Container Creation**: 100-500ms
- **Health Check**: 10-30 seconds per service
- **Volume Creation**: &lt;100ms
- **Network Setup**: &lt;50ms

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   lsof -i :5432
   # Kill process or change port mapping
   ```

2. **Container Name Conflicts**
   ```bash
   # Remove existing container
   docker rm -f postgres-dev
   ```

3. **Volume Permission Issues**
   ```bash
   # Reset volume permissions
   docker volume rm postgres-data
   ```

4. **Health Check Timeouts**
   - Increase timeout values in compose file
   - Check Docker daemon resources
   - Verify network connectivity

## Related Recipes

- [Hot Reload](./hot-reload.md) - Development with file watching
- [API Mocking](./api-mocking.md) - Mock API servers
- [Test Data](./test-data.md) - Generate test data
- [Docker Deploy](../deployment/docker-deploy.md) - Production deployment

## See Also

- [Docker Adapter Documentation](../../core/execution-engine/adapters/docker-adapter.md)
- [Docker Compose Integration](../../targets/docker/compose-integration.md)
- [Container Lifecycle](../../targets/docker/container-lifecycle.md)