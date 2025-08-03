# @xec-sh/core

**Universal Command Execution for the Modern Stack**

The powerful execution engine at the heart of Xec - providing a unified API for running commands across local, SSH, Docker, and Kubernetes environments through a single, elegant TypeScript interface.

## 🚀 Execute Anywhere with the Same API

```typescript
import { $ } from '@xec-sh/core';

// Local execution
await $`npm run build`;

// SSH execution with connection pooling
await $.ssh('prod-server')`systemctl restart app`;

// Docker container execution
await $.docker('my-container')`python manage.py migrate`;

// Kubernetes pod execution
await $.k8s('app-pod')`kubectl rollout status deployment/app`;
```

## Installation

```bash
npm install @xec-sh/core
```

## 🎯 The Problem We Solve

Modern infrastructure spans multiple environments, each traditionally requiring different tools and APIs:

| Environment | Traditional Approach | With @xec-sh/core |
|-------------|---------------------|-------------------|
| Local | `child_process.exec()` | `$\`command\`` |
| SSH | Complex SSH libraries | `$.ssh()\`command\`` |
| Docker | Docker SDK/CLI | `$.docker()\`command\`` |
| Kubernetes | kubectl/K8s client | `$.k8s()\`command\`` |

**One API to rule them all** - Write your automation logic once using familiar TypeScript syntax, then execute it anywhere.

## ✨ Key Features

### 🔄 Universal Execution Engine
- **Single API** for all environments
- **Automatic adaptation** to each platform's requirements
- **Consistent behavior** across all targets
- **Zero configuration** for common use cases

### 🏢 Enterprise Features
- **Connection pooling** - Reuse SSH connections automatically
- **Automatic retries** - Built-in exponential backoff
- **Result caching** - Avoid redundant executions
- **Stream processing** - Real-time output without buffering
- **Error recovery** - Consistent error handling across environments

### 💻 Developer Experience
- **TypeScript native** - Full type safety and IntelliSense
- **Template literals** - Natural command syntax with automatic escaping
- **Method chaining** - Fluent API for configuration
- **Promise-based** - Modern async/await support
- **Event system** - Monitor and debug execution

## 📋 Real-World Use Cases

### Multi-Environment Deployment
```typescript
// Deploy to dev, staging, and production simultaneously
await Promise.all([
  $.ssh('dev-server')`./deploy.sh ${version}`,
  $.docker('staging')`./deploy.sh ${version}`,
  $.k8s('prod-cluster')`kubectl set image deployment/app app=${version}`
]);
```

### Infrastructure Health Checks
```typescript
// Check health across all environments
const targets = ['web-1', 'web-2', 'api-1', 'api-2'];
const results = await Promise.all(
  targets.map(t => $.ssh(t)`curl -f http://localhost/health`.nothrow())
);

const healthy = results.filter(r => r.ok).length;
console.log(`Health: ${healthy}/${targets.length} services healthy`);
```

### CI/CD Pipeline
```typescript
// Build, test, and deploy with proper error handling
try {
  // Build locally
  await $`npm run build`;
  
  // Test in container
  await $.docker({ image: 'node:20' })
    .volumes([`${process.cwd()}:/app`])
    .workdir('/app')
    `npm test`;
  
  // Deploy to production
  await $.ssh('prod')`docker pull myapp:latest && docker-compose up -d`;
  
} catch (error) {
  // Rollback on failure
  await $.ssh('prod')`docker-compose down && docker-compose up -d`;
  throw error;
}
```

### Log Aggregation
```typescript
// Stream logs from multiple sources
const sources = [
  $.ssh('web-server'),
  $.docker('api-container'),
  $.k8s('worker-pod')
];

for (const source of sources) {
  source`tail -f /var/log/app.log`.stream(
    line => console.log(`[${source.name}] ${line}`)
  );
}
```

## 🛠 Core API

### Basic Execution

```typescript
import { $ } from '@xec-sh/core';

// Simple command
await $`echo "Hello, World!"`;

// With variables (automatically escaped)
const filename = "file with spaces.txt";
await $`touch ${filename}`;

// Error handling
const result = await $`grep pattern file.txt`.nothrow();
if (!result.ok) {
  console.log('Pattern not found');
}

// Streaming output
await $`npm install`.stream(line => console.log(line));
```

### SSH Execution

```typescript
// Quick execution
await $.ssh('user@server.com')`uptime`;

// With configuration
const ssh = $.ssh({
  host: 'server.com',
  username: 'deploy',
  privateKey: '/path/to/key',
  port: 22
});

// Connection pooling (automatic)
await ssh`ls -la`;  // New connection
await ssh`pwd`;     // Reuses connection
await ssh`exit`;    // Still reuses connection

// File operations
await ssh.uploadFile('./local.txt', '/remote/path.txt');
await ssh.downloadFile('/remote/file.txt', './local-copy.txt');

// SSH tunneling
const tunnel = await ssh.tunnel({
  localPort: 5433,
  remoteHost: 'localhost',
  remotePort: 5432
});
// Access database at localhost:5433
```

### Docker Execution

```typescript
// Execute in running container
await $.docker('my-app')`ps aux`;

// Create and manage container
const container = await $.docker({ 
  image: 'node:18',
  name: 'test-container',
  ports: ['3000:3000'],
  volumes: ['./app:/app']
}).start();

await container`npm install`;
await container`npm test`;
await container.stop();

// Docker Compose
const compose = $.compose('./docker-compose.yml');
await compose.up({ detach: true });
await compose.exec('web', 'npm run migrate');
await compose.down();
```

### Kubernetes Execution

```typescript
const k8s = $.k8s({ 
  namespace: 'production',
  context: 'prod-cluster' 
});

// Pod execution
const pod = k8s.pod('app-xyz-123');
await pod`hostname`;
await pod`cat /etc/os-release`;

// Multi-container pods
await pod.container('nginx')`nginx -t`;
await pod.container('app')`npm run health`;

// Log streaming
await pod.logs({ follow: true, tail: 100 })
  .stream(line => console.log(line));

// Port forwarding
const forward = await pod.portForward(8080, 80);
console.log(`Access at http://localhost:${forward.localPort}`);
```

### Advanced Configuration

```typescript
// Global configuration
import { configure } from '@xec-sh/core';

configure({
  shell: '/bin/bash',
  timeout: 30000,
  env: { NODE_ENV: 'production' },
  ssh: {
    connectionTimeout: 10000,
    keepaliveInterval: 5000
  }
});

// Per-command configuration
await $`npm test`
  .cwd('/app')
  .env({ NODE_ENV: 'test' })
  .timeout(60000)
  .retry(3)
  .quiet()  // Suppress output
  .nothrow(); // Don't throw on error

// Parallel execution with limits
import { parallel } from '@xec-sh/core';

const results = await parallel([
  $`test-1.sh`,
  $`test-2.sh`,
  $`test-3.sh`,
  $`test-4.sh`
], { 
  maxConcurrent: 2,
  stopOnError: false 
});
```

### Event System

```typescript
// Monitor execution
$.on('command:start', ({ command, target }) => {
  console.log(`[${target}] Starting: ${command}`);
});

$.on('command:output', ({ line, stream }) => {
  if (stream === 'stderr') {
    console.error(`Error output: ${line}`);
  }
});

$.on('command:complete', ({ command, duration, exitCode }) => {
  console.log(`Completed in ${duration}ms with code ${exitCode}`);
});

// Connection events
$.on('ssh:connect', ({ host }) => {
  console.log(`Connected to ${host}`);
});

$.on('ssh:connection:reused', ({ host }) => {
  console.log(`Reused connection to ${host}`);
});
```

## 🚀 Performance Characteristics

### Connection Management
- **SSH Connection Pooling**: Reuse connections automatically
- **Connection Keep-Alive**: Maintains idle connections for 30s
- **Parallel Execution**: Execute on multiple targets simultaneously
- **Smart Retries**: Exponential backoff with jitter

### Execution Performance
| Operation | Performance |
|-----------|------------|
| Local command | ~5ms overhead |
| SSH (new connection) | 100-500ms |
| SSH (pooled) | <10ms overhead |
| Docker exec | 50-100ms |
| K8s exec | 200-500ms |

### Memory Usage
- **Base library**: ~15MB
- **Per SSH connection**: ~2MB
- **Command buffer**: 1MB default (configurable)

## 🔄 Comparison with Other Tools

| Feature | @xec-sh/core | node-ssh | dockerode | @kubernetes/client-node | shelljs | zx |
|---------|--------------|----------|-----------|------------------------|---------|-----|
| **Multi-environment** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **TypeScript native** | ✅ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ |
| **Connection pooling** | ✅ | ❌ | N/A | N/A | N/A | N/A |
| **Template literals** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Unified API** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Error recovery** | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ |

## 📖 Documentation

- 🌐 [Official Documentation](https://xec.sh/docs)
- 📚 [API Reference](https://xec.sh/docs/core/api)
- 🚀 [Quick Start Guide](https://xec.sh/docs/introduction/quick-start)
- 💡 [Examples](./examples)
- 🎯 [Recipes](https://xec.sh/docs/recipes)

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](https://github.com/xec-sh/xec/blob/main/CONTRIBUTING.md) for details.

## 📄 License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)

## 🔗 Links

- 🌐 [Website](https://xec.sh)
- 💬 [GitHub Discussions](https://github.com/xec-sh/xec/discussions)
- 🐛 [Issue Tracker](https://github.com/xec-sh/xec/issues)
- 📦 [npm Package](https://www.npmjs.com/package/@xec-sh/core)

---

**@xec-sh/core** - The universal execution engine that powers [Xec](https://xec.sh)