# Docker Fluent API

A powerful, type-safe fluent API for Docker operations in the xec execution engine.

## Overview

The Docker Fluent API provides a chainable, intuitive interface for managing Docker containers, images, and services. It's designed to simplify complex Docker operations while maintaining full control and flexibility.

## Architecture

```
docker-fluent-api/
├── index.ts         # Main entry point and orchestration
├── base.ts          # Base classes for container management
├── build.ts         # Docker build operations
├── types.ts         # TypeScript type definitions
└── services/        # Service-specific implementations
    ├── redis.ts     # Redis and Redis Cluster
    ├── databases.ts # PostgreSQL, MySQL, MongoDB
    └── messaging.ts # Kafka, RabbitMQ
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

### Service Presets

The API includes optimized presets for popular services:

#### Redis

```typescript
// Single Redis instance
const redis = $.docker().redis({
  port: 6379,
  password: 'secret',
  persistent: true,
  dataPath: '/data/redis'
});

await redis.start();
await redis.cli('SET key value');
const info = await redis.getInfo();
await redis.stop();

// Redis Cluster
const cluster = $.docker().redisCluster({
  cluster: { masters: 3, replicas: 1 },
  port: 7001,
  network: 'redis-cluster'
});

await cluster.start();
await cluster.exec('CLUSTER INFO');
```

#### PostgreSQL

```typescript
const postgres = $.docker().postgresql({
  database: 'myapp',
  user: 'admin',
  password: 'secret',
  port: 5432,
  extensions: ['uuid-ossp', 'pgcrypto']
});

await postgres.start();
await postgres.createDatabase('test');
await postgres.query('SELECT * FROM users');
await postgres.backup('/backup/db.sql');
```

#### MySQL

```typescript
const mysql = $.docker().mysql({
  database: 'myapp',
  rootPassword: 'root',
  port: 3306,
  charset: 'utf8mb4'
});

await mysql.start();
await mysql.createUser('app', 'password');
await mysql.grantPrivileges('app', 'myapp');
```

#### MongoDB

```typescript
const mongo = $.docker().mongodb({
  database: 'myapp',
  rootUser: 'admin',
  rootPassword: 'secret',
  replicaSet: 'rs0'
});

await mongo.start();
await mongo.createCollection('myapp', 'users');
await mongo.insertDocument('myapp', 'users', { name: 'John' });
```

#### Kafka

```typescript
const kafka = $.docker().kafka({
  port: 9092,
  zookeeper: 'localhost:2181',
  autoCreateTopics: true
});

await kafka.startWithZookeeper();
await kafka.createTopic('events', 3, 2);
await kafka.produce('events', 'Hello Kafka');
const messages = await kafka.consume('events', { fromBeginning: true });
```

#### RabbitMQ

```typescript
const rabbit = $.docker().rabbitmq({
  user: 'admin',
  password: 'secret',
  management: true,
  plugins: ['rabbitmq_stream']
});

await rabbit.start();
await rabbit.createQueue('tasks', '/', true);
await rabbit.publishMessage('', 'tasks', 'Process this');
const messages = await rabbit.getMessages('tasks', 10);
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
const redis = $.docker()
  .redis({ port: 6379 })
  .lifecycle({
    beforeStart: async () => console.log('Starting Redis...'),
    afterStart: async () => console.log('Redis started!'),
    healthCheck: async () => {
      const result = await redis.ping();
      return result.stdout === 'PONG';
    }
  });
```

### Custom Service Implementations

```typescript
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

### Replication & Clustering

```typescript
// PostgreSQL with replication
const master = $.docker().postgresql({
  name: 'pg-master',
  replication: { role: 'master' }
});

const replica = $.docker().postgresql({
  name: 'pg-replica',
  replication: {
    role: 'replica',
    masterHost: 'pg-master'
  }
});

// MongoDB replica set
const mongo1 = $.docker().mongodb({
  name: 'mongo1',
  replicaSet: 'rs0'
});

await mongo1.start();
await mongo1.initReplicaSet();
await mongo1.addReplicaSetMember('mongo2:27017');
```

## Type Safety

All APIs are fully typed with TypeScript:

```typescript
import type {
  RedisServiceConfig,
  PostgresServiceConfig,
  ServiceManager,
  ContainerRuntimeInfo
} from '@xec-sh/core/docker-fluent-api';

// Type-safe configuration
const config: RedisServiceConfig = {
  port: 6379,
  password: 'secret',
  cluster: {
    enabled: true,
    masters: 3,
    replicas: 1
  }
};

// Service manager interface
const service: ServiceManager = $.docker().redis(config);
await service.start();
const status = await service.status();
```

## Error Handling

```typescript
try {
  const postgres = $.docker().postgresql();
  await postgres.start();
} catch (error) {
  if (error.message.includes('port already in use')) {
    // Handle port conflict
  } else if (error.message.includes('image not found')) {
    // Pull image first
    await $.docker().pull('postgres:latest');
  }
}
```

## Performance Considerations

- **Connection Pooling**: Services automatically manage connection pools
- **Lazy Loading**: Service implementations are loaded on-demand
- **Parallel Operations**: Multiple containers can be started in parallel
- **Resource Limits**: CPU and memory limits can be set per container

```typescript
const redis = $.docker()
  .redis()
  .memory('512m')
  .cpus('0.5');
```

## Migration from Legacy API

### Old API
```typescript
await $.docker().run`docker run -d --name redis -p 6379:6379 redis:alpine`;
await $.docker().container('redis').exec`redis-cli ping`;
```

### New Fluent API
```typescript
const redis = $.docker().redis({ name: 'redis', port: 6379 });
await redis.start();
await redis.ping();
```

## Best Practices

1. **Always clean up resources**:
```typescript
const redis = $.docker().redis();
try {
  await redis.start();
  // ... use redis
} finally {
  await redis.remove();
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

const db = $.docker().postgresql().network('isolated');
const app = $.docker().ephemeral('app').network('isolated');
```

## Testing

The fluent API is extensively tested and used in production:

```typescript
// Integration test example
describe('Redis Service', () => {
  let redis: RedisFluentAPI;

  beforeAll(async () => {
    redis = $.docker().redis({ port: 6380 });
    await redis.start();
  });

  afterAll(async () => {
    await redis.remove();
  });

  it('should store and retrieve data', async () => {
    await redis.cli('SET test value');
    const result = await redis.cli('GET test');
    expect(result.stdout).toBe('value');
  });
});
```

## Contributing

When adding new service presets:

1. Create service class extending `DockerEphemeralFluentAPI`
2. Add configuration interface to `types.ts`
3. Implement service-specific methods
4. Add to main `DockerFluentAPI.service()` factory
5. Write tests and documentation

## License

Part of the xec-sh project. See main LICENSE file.