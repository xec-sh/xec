# Multi-Environment Execution

Xec provides a unified interface for executing commands across multiple environments, from local shells to remote Kubernetes clusters. This section covers how to configure and use each environment type effectively.

## Supported Environments

### Local Environment
Execute commands directly on your local machine using native shell integration. The local adapter supports both Node.js and Bun runtimes with automatic detection.

**Key Features:**
- Native shell execution (bash, sh, zsh, cmd.exe)
- Bun runtime optimization when available
- Process lifecycle management
- Signal handling and timeout support
- Stream piping and buffering

**Basic Usage:**
```javascript
import { $ } from '@xec-sh/core';

// Simple local execution
const result = await $`ls -la`;
console.log(result.stdout);

// With custom shell
const output = await $.with({ shell: '/bin/zsh' })`echo $ZSH_VERSION`;
```

### SSH Environment
Execute commands on remote servers via SSH with advanced connection management.

**Key Features:**
- Connection pooling with automatic reuse
- SSH tunneling and port forwarding
- Batch operations across multiple hosts
- Secure password handling
- SFTP file transfers
- Keep-alive and auto-reconnect

**Basic Usage:**
```javascript
// Single host execution
const result = await $({
  ssh: {
    host: 'server.example.com',
    username: 'user',
    privateKey: '/path/to/key'
  }
})`uname -a`;

// Connection pooling (enabled by default)
const ssh = {
  host: 'server.example.com',
  username: 'user',
  connectionPool: {
    enabled: true,
    maxConnections: 10,
    idleTimeout: 300000
  }
};

await $.with({ ssh })`command1`;
await $.with({ ssh })`command2`; // Reuses connection
```

### Docker Environment
Execute commands inside Docker containers with comprehensive lifecycle management.

**Key Features:**
- Container lifecycle management
- Docker Compose integration
- Volume and network management
- Image building and management
- Real-time log streaming
- Health check support

**Basic Usage:**
```javascript
// Execute in existing container
const result = await $({
  docker: {
    container: 'my-app'
  }
})`npm test`;

// Run ephemeral container
const output = await $({
  docker: {
    image: 'node:18',
    runMode: 'run',
    rm: true
  }
})`node --version`;

// With volume mounts
await $({
  docker: {
    image: 'alpine',
    runMode: 'run',
    volumes: ['/local/path:/container/path']
  }
})`ls /container/path`;
```

### Kubernetes Environment
Execute commands in Kubernetes pods with cluster-aware features.

**Key Features:**
- Pod and container selection
- Multi-container pod support
- Port forwarding to services
- Real-time log streaming
- Namespace management
- Context switching

**Basic Usage:**
```javascript
// Execute in pod
const result = await $({
  kubernetes: {
    pod: 'app-pod-xyz',
    namespace: 'production'
  }
})`df -h`;

// Specific container in multi-container pod
await $({
  kubernetes: {
    pod: 'app-pod-xyz',
    container: 'web',
    namespace: 'production'
  }
})`nginx -t`;

// With context
await $({
  kubernetes: {
    pod: 'debug-pod',
    context: 'staging-cluster'
  }
})`env`;
```

## Environment Detection and Auto-Selection

Xec can automatically detect the appropriate environment based on the command configuration:

```javascript
import { $, auto } from '@xec-sh/core';

// Auto-detect based on options
const result = await $(auto({
  // Will use SSH if host is provided
  host: process.env.REMOTE_HOST,
  // Falls back to local if not
  fallback: 'local'
}))`echo "Hello from ${await $`hostname`}"`;
```

## Adapter Configuration

### Global Configuration
Set default configurations that apply to all executions:

```javascript
import { configure } from '@xec-sh/core';

configure({
  // Default timeout for all commands
  defaultTimeout: 30000,
  
  // Default encoding
  encoding: 'utf8',
  
  // Maximum output buffer size
  maxBuffer: 10 * 1024 * 1024,
  
  // Throw on non-zero exit codes
  throwOnNonZeroExit: true,
  
  // Default environment variables
  defaultEnv: {
    NODE_ENV: 'production'
  }
});
```

### Per-Execution Configuration
Override settings for specific executions:

```javascript
const result = await $({
  timeout: 60000,
  throwOnNonZeroExit: false,
  env: {
    DEBUG: 'true'
  },
  cwd: '/app'
})`npm run build`;
```

## Environment Chaining

Execute commands that span multiple environments:

```javascript
// Copy file from remote to local via Docker
const remotePath = '/remote/data.tar.gz';
const containerPath = '/tmp/data.tar.gz';
const localPath = './data.tar.gz';

// Download from remote server
await $.with({ ssh: sshConfig })`cat ${remotePath}`
  .pipe($.with({ docker: { container: 'processor' } })`cat > ${containerPath}`);

// Process in Docker
await $.with({ docker: { container: 'processor' } })`
  cd /tmp && 
  tar -xzf data.tar.gz && 
  ./process.sh
`;

// Copy result to local
const processed = await $.with({ docker: { container: 'processor' } })`cat /tmp/result.json`;
await $`echo '${processed}' > ${localPath}`;
```

## Parallel Execution Across Environments

Execute commands simultaneously across multiple environments:

```javascript
import { parallel } from '@xec-sh/core';

const results = await parallel([
  $`local-command`,
  $.with({ ssh: server1 })`remote-command-1`,
  $.with({ ssh: server2 })`remote-command-2`,
  $.with({ docker: { container: 'app' } })`container-command`,
  $.with({ kubernetes: { pod: 'pod-1' } })`pod-command`
]);

// Results array maintains order
const [local, remote1, remote2, docker, k8s] = results;
```

## Error Handling

Each environment provides specific error information:

```javascript
try {
  await $.with({ ssh: sshConfig })`false`;
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('SSH connection refused');
  } else if (error.exitCode === 1) {
    console.error('Command failed with exit code 1');
  }
  
  // Access environment-specific details
  console.error('Host:', error.details?.host);
  console.error('Command:', error.command);
}
```

## Stream Processing

All environments support unified stream processing:

```javascript
// Stream from SSH to Docker
await $.with({ ssh: remoteConfig })`tail -f /var/log/app.log`
  .pipe($.with({ docker: { container: 'logger' } })`tee /logs/remote.log`);

// Real-time processing
const proc = $.with({ kubernetes: { pod: 'streamer' } })`watch -n 1 date`;
proc.stdout.on('data', (chunk) => {
  console.log('K8s output:', chunk.toString());
});

// Graceful shutdown
setTimeout(() => proc.kill(), 10000);
```

## Performance Optimization

### Connection Reuse
SSH and Kubernetes adapters automatically reuse connections:

```javascript
// SSH connection pooling
const sshPool = {
  host: 'server.com',
  connectionPool: {
    maxConnections: 5,
    idleTimeout: 600000, // 10 minutes
    keepAlive: true
  }
};

// Execute 100 commands using only 5 connections
await Promise.all(
  Array.from({ length: 100 }, (_, i) => 
    $.with({ ssh: sshPool })`echo "Task ${i}"`
  )
);
```

### Batch Operations
Execute commands efficiently across multiple targets:

```javascript
const hosts = ['server1.com', 'server2.com', 'server3.com'];

// Parallel execution with connection pooling
const results = await Promise.all(
  hosts.map(host => 
    $.with({ 
      ssh: { 
        host, 
        username: 'deploy',
        connectionPool: { enabled: true }
      } 
    })`systemctl restart app.service`
  )
);
```

## Best Practices

### 1. Use Connection Pooling
Always enable connection pooling for SSH when executing multiple commands:

```javascript
// Good - reuses connection
const ssh = { host: 'server', connectionPool: { enabled: true } };
await $.with({ ssh })`command1`;
await $.with({ ssh })`command2`;

// Bad - creates new connection each time
await $.with({ ssh: { host: 'server' } })`command1`;
await $.with({ ssh: { host: 'server' } })`command2`;
```

### 2. Handle Environment-Specific Errors
Each environment can produce unique errors:

```javascript
try {
  await $.with({ docker: { container: 'app' } })`test -f /app/config.json`;
} catch (error) {
  if (error.code === 'CONTAINER_NOT_FOUND') {
    // Container doesn't exist
    await $.with({ docker: { image: 'app:latest', runMode: 'run' } })`setup.sh`;
  } else if (error.exitCode === 1) {
    // File doesn't exist
    await $.with({ docker: { container: 'app' } })`cp /defaults/config.json /app/`;
  }
}
```

### 3. Use Appropriate Timeouts
Set timeouts based on environment latency:

```javascript
// Local - short timeout
await $.with({ timeout: 5000 })`quick-local-command`;

// SSH - medium timeout
await $.with({ ssh: config, timeout: 30000 })`remote-command`;

// K8s - longer timeout for cluster operations
await $.with({ kubernetes: config, timeout: 60000 })`kubectl apply -f manifest.yaml`;
```

### 4. Clean Up Resources
Always dispose of adapters when done:

```javascript
import { createExecutionEngine } from '@xec-sh/core';

const engine = createExecutionEngine();
try {
  await engine.execute({ ssh: config }, 'command');
} finally {
  await engine.dispose(); // Closes all connections
}
```

## Environment-Specific Features

### Local: Shell Detection
The local adapter automatically detects and uses the appropriate shell:

```javascript
// Auto-detects bash, zsh, sh, or cmd.exe
await $`echo $SHELL`;

// Force specific shell
await $.with({ shell: '/bin/bash' })`echo $BASH_VERSION`;
```

### SSH: Tunneling
Create SSH tunnels for secure access:

```javascript
import { createSSHTunnel } from '@xec-sh/core';

const tunnel = await createSSHTunnel({
  ssh: sshConfig,
  localPort: 3306,
  remotePort: 3306,
  remoteHost: 'database.internal'
});

// Use tunnel
const mysql = new MySQL({ host: 'localhost', port: 3306 });

// Clean up
await tunnel.close();
```

### Docker: Compose Integration
Work with Docker Compose projects:

```javascript
import { compose } from '@xec-sh/core';

// Start services
await compose.up({
  file: 'docker-compose.yml',
  detach: true
});

// Execute in service
await $.with({ 
  docker: { 
    container: 'myapp_web_1' 
  } 
})`npm run migrate`;

// Stop services
await compose.down();
```

### Kubernetes: Port Forwarding
Forward ports from Kubernetes services:

```javascript
import { portForward } from '@xec-sh/core';

const forward = await portForward({
  service: 'web-service',
  namespace: 'default',
  localPort: 8080,
  remotePort: 80
});

// Access service locally
const response = await fetch('http://localhost:8080');

// Clean up
await forward.close();
```

## Next Steps

- [Local Environment Setup](./local/setup.md) - Configure local shell execution
- [SSH Configuration](./ssh/setup.md) - Set up SSH connections and authentication
- [Docker Integration](./docker/setup.md) - Work with Docker containers
- [Kubernetes Operations](./kubernetes/setup.md) - Execute in Kubernetes clusters
- [Hybrid Orchestration](./hybrid/multi-target.md) - Combine multiple environments