---
sidebar_position: 3
---

# Docker Adapter

Execute commands in Docker containers with full lifecycle management, streaming logs, and Docker Compose support.

## Overview

The Docker adapter provides:

- **Container Lifecycle** - Create, start, stop, remove containers
- **Command Execution** - Run commands in new or existing containers
- **Log Streaming** - Real-time log monitoring
- **File Operations** - Copy files to/from containers
- **Docker Compose** - Multi-container application management
- **Health Checks** - Container health monitoring
- **Volume Management** - Persistent data handling

## Basic Usage

### Execute in Existing Container

```typescript
import { $ } from '@xec-sh/core';

// Execute in running container
const container = $.docker({ container: 'my-app' });
await container`ps aux`;
await container`cat /etc/hostname`;
```

### Container Lifecycle Management

```typescript
// Create and manage a new container
const app = await $.docker({
  image: 'node:18',
  name: 'my-node-app',
  ports: { '3000': '3000' },
  volumes: { './src': '/app' },
  env: { NODE_ENV: 'development' }
}).start();

// Execute commands
await app.exec`npm install`;
await app.exec`npm start`;

// Clean up
await app.stop();
await app.remove();
```

## Container Configuration

### Full Options

```typescript
const container = await $.docker({
  // Required
  image: 'ubuntu:22.04',
  
  // Container settings
  name: 'my-container',
  hostname: 'myhost',
  workdir: '/app',
  user: 'node:node',
  
  // Port mapping
  ports: {
    '8080': '80',      // host:container
    '3306': '3306'
  },
  // Or array format
  ports: ['8080:80', '3306:3306'],
  
  // Volume mounting
  volumes: {
    './data': '/data',
    'my-vol': '/persist'
  },
  // Or array format
  volumes: ['./data:/data', 'my-vol:/persist'],
  
  // Environment variables
  env: {
    NODE_ENV: 'production',
    API_KEY: 'secret'
  },
  
  // Network
  network: 'my-network',
  
  // Restart policy
  restart: 'unless-stopped', // 'no' | 'always' | 'unless-stopped' | 'on-failure'
  
  // Command to run
  command: ['node', 'server.js'],
  // Or string
  command: 'node server.js',
  
  // Labels
  labels: {
    'com.example.app': 'myapp',
    'com.example.version': '1.0.0'
  },
  
  // Privileged mode
  privileged: false,
  
  // Health check
  healthcheck: {
    test: 'curl -f http://localhost/health || exit 1',
    interval: '30s',
    timeout: '10s',
    retries: 3,
    startPeriod: '40s'
  }
}).start();
```

## Command Execution

### Execute in Running Container

```typescript
const app = $.docker({ container: 'my-app' });

// Simple command
await app`ls -la`;

// With working directory
const appWithDir = $.docker({ 
  container: 'my-app',
  workdir: '/app'
});
await appWithDir`npm test`;

// With user
const appAsUser = $.docker({
  container: 'my-app',
  user: 'node'
});
await appAsUser`whoami`; // Output: node
```

### Execute in New Container

```typescript
// One-off execution
const result = await $.docker({ image: 'alpine' })`echo "Hello from Alpine"`;

// With auto-cleanup
const temp = await $.docker({
  image: 'ubuntu:latest',
  name: 'temp-container'
}).start();

await temp.exec`apt update`;
await temp.exec`apt install -y curl`;
const response = await temp.exec`curl https://example.com`;

await temp.remove(); // Cleanup
```

## Container Lifecycle

### Starting Containers

```typescript
// Basic start
const nginx = await $.docker({
  image: 'nginx:latest',
  name: 'web-server',
  ports: { '8080': '80' }
}).start();

// With health check wait
const app = await $.docker({
  image: 'my-app:latest',
  healthcheck: {
    test: 'curl -f http://localhost:3000/health',
    interval: '10s'
  }
}).start();

await app.waitForHealthy(60000); // Wait up to 60 seconds
console.log('Application is healthy!');
```

### Managing Containers

```typescript
const container = await $.docker({
  image: 'redis:alpine',
  name: 'cache'
}).start();

// Check if running
console.log('Started:', container.started); // true

// Stop container
await container.stop();

// Restart
await container.restart();

// Get container info
const info = await container.inspect();
console.log('Container ID:', info.Id);
console.log('State:', info.State.Status);

// Remove when done
await container.remove();
console.log('Removed:', container.removed); // true
```

## Log Management

### Get Logs

```typescript
const app = await $.docker({
  image: 'my-app',
  name: 'app-instance'
}).start();

// Get recent logs
const logs = await app.logs({ tail: 100 });
console.log('Recent logs:', logs);

// Get logs with timestamps
const timedLogs = await app.logs({ 
  timestamps: true,
  since: '2024-01-01T00:00:00Z'
});
```

### Stream Logs

```typescript
// Stream logs in real-time
await app.streamLogs((line) => {
  console.log(`[LOG] ${line}`);
});

// Stream with options
await app.streamLogs(
  (line) => {
    // Parse and process each line
    if (line.includes('ERROR')) {
      console.error('❌', line);
    } else {
      console.log('📝', line);
    }
  },
  {
    follow: true,      // Keep following
    tail: 50,          // Start with last 50 lines
    timestamps: true   // Include timestamps
  }
);

// Follow logs (alias for streamLogs with follow: true)
await app.follow((line) => {
  console.log(line);
});
```

### Multi-Container Log Aggregation

```typescript
// Start multiple containers
const containers = await Promise.all([
  $.docker({ image: 'web-app', name: 'web' }).start(),
  $.docker({ image: 'api-app', name: 'api' }).start(),
  $.docker({ image: 'worker-app', name: 'worker' }).start()
]);

// Stream logs from all containers
const streams = containers.map((container, index) => {
  const prefix = ['WEB', 'API', 'WORKER'][index];
  return container.streamLogs((line) => {
    console.log(`[${prefix}] ${line.trim()}`);
  });
});

// Wait for some time
await new Promise(resolve => setTimeout(resolve, 60000));

// Stop all streams
streams.forEach(stream => stream.stop());
```

## File Operations

### Copy Files To Container

```typescript
const app = await $.docker({
  image: 'node:18',
  name: 'app'
}).start();

// Copy single file
await app.copyTo('./config.json', '/app/config.json');

// Copy directory
await app.copyTo('./src', '/app/src');

// Verify copy
const files = await app.exec`ls -la /app`;
console.log(files.stdout);
```

### Copy Files From Container

```typescript
// Copy file from container
await app.copyFrom('/app/output.log', './output.log');

// Copy directory
await app.copyFrom('/app/build', './dist');

// Copy with different names
await app.copyFrom('/etc/nginx/nginx.conf', './nginx-backup.conf');
```

## Volume Management

### Named Volumes

```typescript
// Use named volumes for persistence
const db = await $.docker({
  image: 'postgres:15',
  name: 'database',
  volumes: {
    'pgdata': '/var/lib/postgresql/data'  // Named volume
  },
  env: {
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'myapp'
  }
}).start();

// Data persists even after container removal
await db.stop();
await db.remove();

// Recreate with same volume
const db2 = await $.docker({
  image: 'postgres:15',
  name: 'database-new',
  volumes: {
    'pgdata': '/var/lib/postgresql/data'  // Same data
  }
}).start();
```

### Bind Mounts

```typescript
// Development with live reload
const dev = await $.docker({
  image: 'node:18',
  name: 'dev-server',
  volumes: {
    './src': '/app/src',               // Source code
    './package.json': '/app/package.json',
    './node_modules': '/app/node_modules'
  },
  workdir: '/app',
  ports: { '3000': '3000' },
  command: 'npm run dev'
}).start();

// Changes to ./src are reflected immediately
```

## Network Management

### Custom Networks

```typescript
// Create network first (using docker CLI)
await $`docker network create app-network`;

// Connect containers to network
const api = await $.docker({
  image: 'api:latest',
  name: 'api-server',
  network: 'app-network'
}).start();

const web = await $.docker({
  image: 'web:latest',
  name: 'web-server',
  network: 'app-network',
  env: {
    API_URL: 'http://api-server:3000'  // Use container name
  }
}).start();

// Containers can communicate by name
await web.exec`curl http://api-server:3000/health`;
```

### Port Publishing

```typescript
// Multiple port mappings
const app = await $.docker({
  image: 'complex-app',
  ports: {
    '8080': '80',      // HTTP
    '8443': '443',     // HTTPS
    '9000': '9000',    // Metrics
    '3306': '3306'     // Database
  }
}).start();

// Random host port
const service = await $.docker({
  image: 'service',
  ports: ['0:8080']  // Random available port
}).start();

// Get assigned port
const info = await service.inspect();
const assignedPort = info.NetworkSettings.Ports['8080/tcp'][0].HostPort;
console.log(`Service available at localhost:${assignedPort}`);
```

## Health Monitoring

### Health Checks

```typescript
// Define health check
const healthy = await $.docker({
  image: 'web-app',
  healthcheck: {
    test: ['CMD', 'curl', '-f', 'http://localhost/health'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    startPeriod: '40s'
  }
}).start();

// Wait for healthy state
try {
  await healthy.waitForHealthy(120000); // 2 minutes
  console.log('Container is healthy!');
} catch (error) {
  console.error('Container failed health check');
  const logs = await healthy.logs({ tail: 50 });
  console.error('Recent logs:', logs);
}
```

### Container Stats

```typescript
// Monitor resource usage
const stats = await container.stats();
console.log('CPU Usage:', stats.cpu_stats.cpu_usage.total_usage);
console.log('Memory Usage:', stats.memory_stats.usage);
console.log('Network RX:', stats.networks.eth0.rx_bytes);
console.log('Network TX:', stats.networks.eth0.tx_bytes);

// Continuous monitoring
setInterval(async () => {
  const stats = await container.stats();
  const memoryMB = stats.memory_stats.usage / 1024 / 1024;
  console.log(`Memory: ${memoryMB.toFixed(2)} MB`);
}, 5000);
```

## Docker Compose

### Basic Compose Operations

```typescript
// Compose up
await $.docker.composeUp({
  file: './docker-compose.yml',
  projectName: 'myapp'
});

// Check status
const status = await $.docker.composePs({
  file: './docker-compose.yml'
});
console.log(status);

// View logs
const logs = await $.docker.composeLogs('web', {
  file: './docker-compose.yml'
});

// Compose down
await $.docker.composeDown({
  file: './docker-compose.yml'
});
```

### Multiple Compose Files

```typescript
// Use multiple compose files
await $.docker.composeUp({
  file: ['docker-compose.yml', 'docker-compose.override.yml'],
  projectName: 'dev-env'
});

// Production setup
await $.docker.composeUp({
  file: ['docker-compose.yml', 'docker-compose.prod.yml'],
  projectName: 'prod-app'
});
```

## Advanced Patterns

### Container Factory

```typescript
class ContainerFactory {
  static async createWebServer(config: {
    name: string;
    port: number;
    env?: Record<string, string>;
  }) {
    return $.docker({
      image: 'nginx:alpine',
      name: config.name,
      ports: { [config.port]: '80' },
      volumes: {
        './nginx.conf': '/etc/nginx/nginx.conf:ro',
        './public': '/usr/share/nginx/html:ro'
      },
      env: config.env || {},
      restart: 'unless-stopped'
    }).start();
  }
  
  static async createDatabase(config: {
    name: string;
    password: string;
    volume: string;
  }) {
    return $.docker({
      image: 'postgres:15',
      name: config.name,
      volumes: { [config.volume]: '/var/lib/postgresql/data' },
      env: {
        POSTGRES_PASSWORD: config.password,
        POSTGRES_DB: 'app'
      },
      healthcheck: {
        test: 'pg_isready -U postgres',
        interval: '10s'
      }
    }).start();
  }
}

// Usage
const web = await ContainerFactory.createWebServer({
  name: 'web-prod',
  port: 80
});

const db = await ContainerFactory.createDatabase({
  name: 'db-prod',
  password: 'secret',
  volume: 'prod-db-data'
});
```

### Development Environment

```typescript
class DevEnvironment {
  private containers: Map<string, any> = new Map();
  
  async start() {
    // Start database
    const db = await $.docker({
      image: 'postgres:15',
      name: 'dev-db',
      ports: { '5432': '5432' },
      env: {
        POSTGRES_PASSWORD: 'devpass',
        POSTGRES_DB: 'devdb'
      }
    }).start();
    this.containers.set('db', db);
    
    // Start Redis
    const redis = await $.docker({
      image: 'redis:alpine',
      name: 'dev-redis',
      ports: { '6379': '6379' }
    }).start();
    this.containers.set('redis', redis);
    
    // Start app with hot reload
    const app = await $.docker({
      image: 'node:18',
      name: 'dev-app',
      volumes: {
        '.': '/app',
        '/app/node_modules': '' // Anonymous volume for node_modules
      },
      workdir: '/app',
      ports: { '3000': '3000' },
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:devpass@dev-db:5432/devdb',
        REDIS_URL: 'redis://dev-redis:6379'
      },
      command: 'npm run dev'
    }).start();
    this.containers.set('app', app);
    
    // Stream logs
    await app.follow((line) => {
      console.log(`[APP] ${line}`);
    });
  }
  
  async stop() {
    for (const [name, container] of this.containers) {
      console.log(`Stopping ${name}...`);
      await container.stop();
      await container.remove();
    }
    this.containers.clear();
  }
}

const dev = new DevEnvironment();
await dev.start();
// ... development ...
await dev.stop();
```

### Testing with Containers

```typescript
// Integration test setup
async function setupTestEnvironment() {
  // Start test database
  const db = await $.docker({
    image: 'postgres:15',
    name: 'test-db',
    env: {
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test'
    }
  }).start();
  
  // Wait for database
  await db.waitForHealthy();
  
  // Run migrations
  await db.exec`psql -U postgres -d test -f /schema.sql`;
  
  // Start application
  const app = await $.docker({
    image: 'app:test',
    name: 'test-app',
    env: {
      DATABASE_URL: 'postgresql://postgres:test@test-db:5432/test',
      NODE_ENV: 'test'
    },
    network: 'bridge'
  }).start();
  
  // Wait for app
  await app.waitForHealthy();
  
  return { db, app };
}

// Run tests
const env = await setupTestEnvironment();
try {
  // Run test suite
  await $`npm test`;
} finally {
  // Cleanup
  await env.app.remove();
  await env.db.remove();
}
```

## Best Practices

### 1. Always Clean Up

```typescript
// ✅ Use try-finally for cleanup
const container = await $.docker({ image: 'app' }).start();
try {
  await container.exec`run-tests`;
} finally {
  await container.stop();
  await container.remove();
}

// ❌ No cleanup
const container = await $.docker({ image: 'app' }).start();
await container.exec`run-tests`;
// Container keeps running!
```

### 2. Use Health Checks

```typescript
// ✅ Define health checks
const app = await $.docker({
  image: 'web-app',
  healthcheck: {
    test: 'curl -f http://localhost/health',
    interval: '30s'
  }
}).start();

await app.waitForHealthy();

// ❌ No health verification
const app = await $.docker({ image: 'web-app' }).start();
// Might not be ready!
```

### 3. Name Your Containers

```typescript
// ✅ Use descriptive names
const db = await $.docker({
  image: 'postgres',
  name: 'myapp-postgres-dev'
}).start();

// ❌ Random names make debugging hard
const db = await $.docker({ image: 'postgres' }).start();
```

### 4. Use Specific Tags

```typescript
// ✅ Pin versions
const app = await $.docker({
  image: 'node:18.17.0-alpine'
}).start();

// ❌ Latest tag can break
const app = await $.docker({
  image: 'node:latest'
}).start();
```

### 5. Handle Logs Appropriately

```typescript
// ✅ Stream logs for long-running containers
const app = await $.docker({ image: 'app' }).start();
const logStream = await app.follow((line) => {
  logger.info(line);
});

// ❌ Getting all logs can use lots of memory
const logs = await app.logs(); // Might be gigabytes!
```