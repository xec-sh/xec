---
sidebar_position: 4
---

# Advanced Features & Capabilities

Xec CLI provides powerful advanced features for complex automation scenarios, multi-environment orchestration, and enterprise-scale operations.

## Script Execution System

### Direct Script Execution

Xec can execute JavaScript/TypeScript files directly with full access to the Xec API:

```bash
# Execute a script file
xec deploy.js

# With arguments
xec build.js --env=production --clean

# TypeScript support
xec deploy.ts

# From a specific directory
xec ./scripts/backup.js
```

### Script Features

Your scripts have access to the complete Xec API:

```javascript
// deploy.js
import { $ } from '@xec-sh/core';
import { spinner } from '@xec-sh/cli/utils';

// Command-line arguments are available
const env = process.argv.includes('--prod') ? 'production' : 'staging';

// Use spinners for long operations
const spin = spinner('Building application...');
await $`npm run build`;
spin.succeed('Build complete');

// Environment-specific deployment
if (env === 'production') {
  const server = $.ssh({
    host: 'prod.example.com',
    username: 'deploy'
  });
  
  await server`cd /app && git pull`;
  await server`npm install --production`;
  await server`pm2 restart app`;
}
```

### Interactive Scripts

Create interactive automation scripts:

```javascript
// interactive-deploy.js
import { $ } from '@xec-sh/core';
import { prompt, confirm, select } from '@xec-sh/cli/prompts';

// Get deployment details
const environment = await select('Select environment:', [
  'development',
  'staging',
  'production'
]);

const version = await prompt('Enter version tag:', {
  default: 'latest'
});

if (await confirm(`Deploy ${version} to ${environment}?`)) {
  await $`git tag ${version}`;
  await $`git push origin ${version}`;
  
  // Deploy based on environment
  const config = {
    development: { host: 'dev.example.com' },
    staging: { host: 'staging.example.com' },
    production: { host: 'prod.example.com' }
  };
  
  const server = $.ssh(config[environment]);
  await server`docker pull myapp:${version}`;
  await server`docker-compose up -d`;
}
```

## SSH Advanced Features

### SSH Tunnels

Create SSH tunnels for secure access to remote services:

```javascript
// SSH tunnel for database access
const ssh = $.ssh({
  host: 'bastion.example.com',
  username: 'user',
  privateKey: '~/.ssh/id_rsa'
});

// Create tunnel: local:3306 -> remote:3306
const tunnel = await ssh.tunnel({
  localPort: 3306,
  remoteHost: 'database.internal',
  remotePort: 3306
});

console.log(`Tunnel open on port ${tunnel.localPort}`);

// Now you can connect to localhost:3306
await $`mysql -h localhost -P 3306 -u root -p < backup.sql`;

// Always close tunnels when done
await tunnel.close();
```

#### Dynamic Port Allocation

```javascript
// Let the system assign a free port
const tunnel = await ssh.tunnel({
  localPort: 0, // Dynamic allocation
  remoteHost: 'service.internal',
  remotePort: 8080
});

console.log(`Service available at http://localhost:${tunnel.localPort}`);
```

#### Multiple Tunnels

```javascript
// Create multiple tunnels for microservices
const tunnels = await Promise.all([
  ssh.tunnel({ localPort: 0, remoteHost: 'api.internal', remotePort: 3000 }),
  ssh.tunnel({ localPort: 0, remoteHost: 'db.internal', remotePort: 5432 }),
  ssh.tunnel({ localPort: 0, remoteHost: 'redis.internal', remotePort: 6379 })
]);

console.log('Services available:');
console.log(`API: http://localhost:${tunnels[0].localPort}`);
console.log(`Database: localhost:${tunnels[1].localPort}`);
console.log(`Redis: localhost:${tunnels[2].localPort}`);

// Clean up all tunnels
await Promise.all(tunnels.map(t => t.close()));
```

### SSH File Transfer

Enhanced file transfer capabilities:

```javascript
const ssh = $.ssh({ host: 'server.com', username: 'user' });

// Upload single file
await ssh.uploadFile('./config.json', '/app/config.json');

// Upload entire directory
await ssh.uploadDirectory('./build', '/var/www/html');

// Download files
await ssh.downloadFile('/var/log/app.log', './logs/app.log');

// With progress tracking
await ssh.uploadFile('./large-file.zip', '/tmp/file.zip', {
  onProgress: (transferred, total) => {
    const percent = Math.round((transferred / total) * 100);
    console.log(`Progress: ${percent}%`);
  }
});
```

### SSH Connection Pooling

Xec automatically pools SSH connections for performance:

```javascript
// Connections are reused automatically
const ssh = $.ssh({ host: 'server.com' });

// These commands reuse the same connection
await ssh`uptime`;
await ssh`free -m`;
await ssh`df -h`;

// Explicit connection management
const pool = ssh.getConnectionPool();
console.log(`Active connections: ${pool.size}`);

// Close all connections
await ssh.dispose();
```

## Docker Advanced Features

### Container Lifecycle Management

Full container lifecycle control with the enhanced Docker API:

```javascript
// Create and manage a container
const container = await $.docker({
  image: 'postgres:15',
  name: 'test-db',
  env: {
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'testdb'
  },
  ports: { 5432: 5432 },
  volumes: { './data': '/var/lib/postgresql/data' }
}).start();

console.log(`Container ${container.name} started`);

// Execute commands in the container
await container.exec`psql -U postgres -c "CREATE TABLE users (id SERIAL PRIMARY KEY)"`;

// Stream logs in real-time
await container.follow((log) => {
  console.log(`[DB] ${log}`);
});

// Health checks
await container.waitForHealthy(30000);

// Restart if needed
await container.restart();

// Clean up
await container.stop();
await container.remove();
```

### Docker Compose Support

Work with Docker Compose projects:

```javascript
const compose = $.dockerCompose({
  file: './docker-compose.yml',
  projectName: 'myapp'
});

// Start all services
await compose.up({ detach: true });

// Check service status
const status = await compose.ps();
console.log(status);

// View logs from specific service
const logs = await compose.logs('web', { tail: 100 });

// Stop and remove
await compose.down({ volumes: true });
```

### Streaming Container Logs

Real-time log streaming with filtering:

```javascript
const container = await $.docker({
  image: 'nginx:alpine',
  name: 'web-server'
}).start();

// Stream logs with JSON parsing
await container.streamLogs((log) => {
  try {
    const entry = JSON.parse(log);
    if (entry.level === 'error') {
      console.error(`[ERROR] ${entry.message}`);
    }
  } catch {
    console.log(log);
  }
}, {
  follow: true,
  tail: 50,
  timestamps: true
});
```

### Docker Health Monitoring

```javascript
// Container with health check
const app = await $.docker({
  image: 'myapp:latest',
  healthcheck: {
    test: ['CMD', 'curl', '-f', 'http://localhost/health'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    startPeriod: '40s'
  }
}).start();

// Wait for healthy state
await app.waitForHealthy(60000);

// Monitor container stats
const stats = await app.stats();
console.log(`Memory usage: ${stats.memory_stats.usage / 1024 / 1024}MB`);
```

## Kubernetes Advanced Features

### Enhanced Pod Operations

The new Kubernetes API provides pod-centric operations:

```javascript
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('api-server-xyz');

// Port forwarding with dynamic ports
const forward = await pod.portForwardDynamic(8080);
console.log(`API available at http://localhost:${forward.localPort}`);

// Make requests to the forwarded port
const response = await $`curl http://localhost:${forward.localPort}/health`;
console.log(response.stdout);

// Clean up
await forward.close();
```

### Kubernetes Log Streaming

Real-time log streaming from pods:

```javascript
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('worker-pod');

// Stream logs with filtering
const stream = await pod.follow((log) => {
  // Parse structured logs
  if (log.includes('ERROR')) {
    console.error(`🚨 ${log}`);
  } else if (log.includes('WARN')) {
    console.warn(`⚠️  ${log}`);
  } else {
    console.log(`📝 ${log}`);
  }
}, {
  container: 'app',
  tail: 100,
  timestamps: true
});

// Stop streaming after 5 minutes
setTimeout(() => stream.stop(), 5 * 60 * 1000);
```

### Multi-Pod Operations

Work with multiple pods simultaneously:

```javascript
const k8s = $.k8s({ namespace: 'production' });

// Get all pods for a deployment
const podNames = await $`kubectl get pods -l app=web -o jsonpath='{.items[*].metadata.name}'`
  .then(r => r.stdout.trim().split(' '));

// Create pod instances
const pods = podNames.map(name => k8s.pod(name));

// Execute command on all pods
const results = await Promise.all(
  pods.map(pod => pod.exec`curl -s localhost/health`)
);

// Stream logs from all pods
const streams = await Promise.all(
  pods.map((pod, i) => 
    pod.follow((log) => {
      console.log(`[${podNames[i]}] ${log}`);
    })
  )
);

// Port forward from multiple pods
const forwards = await Promise.all(
  pods.map((pod, i) => pod.portForward(8080 + i, 80))
);

// Clean up
forwards.forEach(f => f.close());
streams.forEach(s => s.stop());
```

### Kubernetes File Operations

Enhanced file transfer capabilities:

```javascript
const pod = $.k8s().pod('data-processor');

// Copy configuration file to pod
await pod.copyTo('./config.yaml', '/app/config.yaml');

// Copy processed data from pod
await pod.copyFrom('/app/output/results.json', './results.json');

// Copy from specific container in multi-container pod
await pod.copyFrom('/var/log/nginx/access.log', './nginx-logs.txt', 'nginx');

// Bulk file operations
const files = ['config.yaml', 'secrets.env', 'data.json'];
await Promise.all(
  files.map(file => pod.copyTo(`./${file}`, `/app/${file}`))
);
```

## Environment Orchestration

### Multi-Environment Deployments

Deploy across multiple environments simultaneously:

```javascript
// deploy-all.js
const environments = {
  staging: {
    ssh: { host: 'staging.example.com' },
    k8s: { namespace: 'staging' }
  },
  production: {
    ssh: { host: 'prod.example.com' },
    k8s: { namespace: 'production' }
  }
};

async function deployEnvironment(env, config) {
  console.log(`Deploying to ${env}...`);
  
  // SSH operations
  const server = $.ssh(config.ssh);
  await server`cd /app && git pull`;
  await server`docker-compose pull`;
  await server`docker-compose up -d`;
  
  // Kubernetes operations
  const k8s = $.k8s(config.k8s);
  await $`kubectl rollout restart deployment/api -n ${config.k8s.namespace}`;
  
  // Wait for pods to be ready
  await $`kubectl wait --for=condition=ready pod -l app=api -n ${config.k8s.namespace}`;
}

// Deploy to all environments in parallel
await Promise.all(
  Object.entries(environments).map(([env, config]) => 
    deployEnvironment(env, config)
  )
);
```

### Cross-Environment Data Sync

Synchronize data between environments:

```javascript
// sync-databases.js
async function syncDatabase(source, target) {
  // Create SSH tunnels to both databases
  const sourceTunnel = await $.ssh(source.ssh).tunnel({
    localPort: 0,
    remoteHost: source.dbHost,
    remotePort: 5432
  });
  
  const targetTunnel = await $.ssh(target.ssh).tunnel({
    localPort: 0,
    remoteHost: target.dbHost,
    remotePort: 5432
  });
  
  // Dump from source
  await $`pg_dump -h localhost -p ${sourceTunnel.localPort} -U ${source.dbUser} ${source.dbName} > dump.sql`;
  
  // Restore to target
  await $`psql -h localhost -p ${targetTunnel.localPort} -U ${target.dbUser} ${target.dbName} < dump.sql`;
  
  // Cleanup
  await sourceTunnel.close();
  await targetTunnel.close();
  await $`rm dump.sql`;
}

// Sync staging to development
await syncDatabase(
  { ssh: { host: 'staging.example.com' }, dbHost: 'db.staging', dbUser: 'postgres', dbName: 'app' },
  { ssh: { host: 'dev.example.com' }, dbHost: 'db.dev', dbUser: 'postgres', dbName: 'app' }
);
```

## Advanced Command Patterns

### Pipeline Processing

Chain commands for complex data processing:

```javascript
// Process logs from multiple sources
const sources = [
  { type: 'ssh', config: { host: 'web1.example.com' }, path: '/var/log/app.log' },
  { type: 'docker', container: 'api-1', path: '/app/logs/api.log' },
  { type: 'k8s', pod: 'worker-1', namespace: 'prod', path: '/logs/worker.log' }
];

async function collectLogs(source) {
  switch (source.type) {
    case 'ssh':
      const ssh = $.ssh(source.config);
      return ssh`cat ${source.path} | grep ERROR | tail -1000`;
    
    case 'docker':
      return $`docker exec ${source.container} cat ${source.path} | grep ERROR | tail -1000`;
    
    case 'k8s':
      const k8s = $.k8s({ namespace: source.namespace });
      return k8s.pod(source.pod).exec`cat ${source.path} | grep ERROR | tail -1000`;
  }
}

// Collect all logs in parallel
const logs = await Promise.all(sources.map(collectLogs));

// Combine and analyze
const combined = logs.map(l => l.stdout).join('\n');
await $`echo ${combined} | sort | uniq -c | sort -rn > error-summary.txt`;
```

### Conditional Execution

Execute commands based on conditions:

```javascript
// Smart deployment with health checks
async function smartDeploy(environment) {
  const server = $.ssh({ host: `${environment}.example.com` });
  
  // Check current version
  const currentVersion = await server`cat /app/version.txt`.nothrow();
  
  if (currentVersion.exitCode !== 0) {
    console.log('Fresh installation required');
    await server`mkdir -p /app`;
  }
  
  // Check available space
  const diskSpace = await server`df -h /app | tail -1 | awk '{print $5}' | sed 's/%//'`;
  
  if (parseInt(diskSpace.stdout) > 80) {
    console.log('Cleaning up old deployments...');
    await server`find /app/releases -mtime +30 -delete`;
  }
  
  // Deploy new version
  await server`cd /app && git pull`;
  
  // Health check
  const health = await server`curl -f http://localhost/health`.nothrow();
  
  if (health.exitCode === 0) {
    console.log('Deployment successful');
  } else {
    console.log('Rolling back...');
    await server`cd /app && git checkout HEAD~1`;
  }
}
```

### Resource Management

Automatic cleanup and resource management:

```javascript
// Resource-aware batch processing
class ResourceManager {
  constructor(maxConnections = 5) {
    this.maxConnections = maxConnections;
    this.activeConnections = new Set();
  }
  
  async withConnection(config, task) {
    // Wait if at capacity
    while (this.activeConnections.size >= this.maxConnections) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const connection = $.ssh(config);
    this.activeConnections.add(connection);
    
    try {
      return await task(connection);
    } finally {
      await connection.dispose();
      this.activeConnections.delete(connection);
    }
  }
}

// Process many servers with connection pooling
const manager = new ResourceManager(5);
const servers = Array.from({ length: 50 }, (_, i) => `server${i}.example.com`);

await Promise.all(
  servers.map(host => 
    manager.withConnection({ host }, async (ssh) => {
      await ssh`apt update && apt upgrade -y`;
      await ssh`systemctl restart nginx`;
    })
  )
);
```

## Performance Optimization

### Parallel Execution

Execute commands in parallel for better performance:

```javascript
// Parallel health checks
const services = [
  { name: 'web', url: 'http://web.local/health' },
  { name: 'api', url: 'http://api.local/health' },
  { name: 'worker', url: 'http://worker.local/health' }
];

const results = await $.parallel(
  services.map(service => 
    $`curl -s -o /dev/null -w "%{http_code}" ${service.url}`
      .then(r => ({ ...service, status: r.stdout.trim() }))
  ),
  { concurrency: 3 }
);

results.forEach(({ name, status }) => {
  console.log(`${name}: ${status === '200' ? '✅' : '❌'} (${status})`);
});
```

### Caching Results

Cache expensive operations:

```javascript
// Cache kubectl results
const k8sCache = new Map();

async function getCachedPods(namespace) {
  const key = `pods-${namespace}`;
  
  if (k8sCache.has(key)) {
    const { data, timestamp } = k8sCache.get(key);
    if (Date.now() - timestamp < 60000) { // 1 minute cache
      return data;
    }
  }
  
  const result = await $`kubectl get pods -n ${namespace} -o json`;
  const data = JSON.parse(result.stdout);
  
  k8sCache.set(key, { data, timestamp: Date.now() });
  return data;
}
```

## Security Best Practices

### Secure Credential Handling

```javascript
// Use environment variables for secrets
const ssh = $.ssh({
  host: process.env.SSH_HOST,
  username: process.env.SSH_USER,
  privateKey: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa'
});

// Secure password input
import { password } from '@xec-sh/cli/prompts';

const dbPassword = await password('Enter database password:');
await $`mysql -u root -p${dbPassword} < script.sql`;
```

### Audit Logging

```javascript
// Log all commands for audit
$.on('command:start', (event) => {
  const log = {
    timestamp: new Date().toISOString(),
    command: event.command,
    environment: event.adapter,
    user: process.env.USER
  };
  
  fs.appendFileSync('audit.log', JSON.stringify(log) + '\n');
});

$.on('command:error', (event) => {
  console.error(`Command failed: ${event.command}`);
  // Send alert to monitoring system
});
```

## Integration Examples

### CI/CD Pipeline

```javascript
// ci-pipeline.js
import { $ } from '@xec-sh/core';

// Run tests in Docker
const testContainer = await $.docker({
  image: 'node:18',
  volumes: { '.': '/app' },
  workdir: '/app'
}).start();

const testResult = await testContainer.exec`npm test`;

if (testResult.exitCode === 0) {
  // Build and push image
  await $`docker build -t myapp:${process.env.CI_COMMIT_SHA} .`;
  await $`docker push myapp:${process.env.CI_COMMIT_SHA}`;
  
  // Deploy to Kubernetes
  const k8s = $.k8s({ namespace: 'staging' });
  await $`kubectl set image deployment/myapp app=myapp:${process.env.CI_COMMIT_SHA}`;
  
  // Wait for rollout
  await $`kubectl rollout status deployment/myapp -n staging`;
}

await testContainer.remove();
```

### Monitoring Script

```javascript
// monitor.js
import { $ } from '@xec-sh/core';

async function checkService(name, check) {
  try {
    await check();
    return { name, status: 'healthy' };
  } catch (error) {
    return { name, status: 'unhealthy', error: error.message };
  }
}

// Define service checks
const checks = [
  {
    name: 'Web Server',
    check: () => $`curl -f http://web.example.com/health`
  },
  {
    name: 'Database',
    check: async () => {
      const ssh = $.ssh({ host: 'db.example.com' });
      await ssh`pg_isready -U postgres`;
    }
  },
  {
    name: 'Redis',
    check: () => $`redis-cli -h redis.example.com ping`
  },
  {
    name: 'Kubernetes API',
    check: () => $`kubectl cluster-info`
  }
];

// Run all checks
const results = await Promise.all(
  checks.map(({ name, check }) => checkService(name, check))
);

// Report results
results.forEach(({ name, status, error }) => {
  const icon = status === 'healthy' ? '✅' : '❌';
  console.log(`${icon} ${name}: ${status}`);
  if (error) console.log(`   Error: ${error}`);
});

// Send alerts for failures
const failures = results.filter(r => r.status === 'unhealthy');
if (failures.length > 0) {
  // Send notification
  await $`curl -X POST https://api.slack.com/webhook -d '${JSON.stringify({
    text: `⚠️ ${failures.length} services are unhealthy`
  })}'`;
}
```

## Next Steps

- Explore [real-world examples](./real-world-examples) for production use cases
- Learn about [performance optimization](./performance-optimization) for large-scale operations
- Review [secure password handling](./secure-password-handling) for security
- Check out [troubleshooting guide](./troubleshooting) for common issues