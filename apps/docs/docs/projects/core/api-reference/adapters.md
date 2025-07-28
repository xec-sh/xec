---
sidebar_position: 3
---

# Adapters API

Execution environment adapters that enable @xec-sh/core to run commands across local, SSH, Docker, Kubernetes, and custom environments with a unified interface.

## Overview

The adapter system provides:
- **Unified Interface** - Same API across all environments
- **Environment Abstraction** - Hide complexity of different execution contexts
- **Resource Management** - Connection pooling, lifecycle management
- **Performance Optimization** - Environment-specific optimizations
- **Extensibility** - Create custom adapters for any environment

## Base Adapter

All adapters extend the BaseAdapter class:

```typescript
abstract class BaseAdapter implements Disposable {
  abstract name: string;
  abstract execute(command: Command): Promise<ExecutionResult>;
  abstract isAvailable(): Promise<boolean>;
  abstract dispose(): Promise<void>;
  
  // Optional lifecycle methods
  initialize?(): Promise<void>;
  
  // Event handling
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  emit(event: string, ...args: any[]): void;
}
```

### Core Methods

#### execute(command: Command)
Executes a command in the adapter's environment.

```typescript
const result = await adapter.execute({
  command: 'ls',
  args: ['-la', '/tmp'],
  cwd: '/home/user',
  env: { LANG: 'en_US.UTF-8' },
  timeout: 5000,
  shell: true
});
```

#### isAvailable()
Checks if the adapter can be used.

```typescript
if (await adapter.isAvailable()) {
  // Adapter is ready to use
} else {
  // Handle unavailable adapter
}
```

#### dispose()
Cleans up adapter resources.

```typescript
// Always clean up when done
await adapter.dispose();
```

### Sensitive Data Masking

BaseAdapter automatically masks sensitive data in command output, logs, and error messages to prevent accidental exposure of secrets.

#### Configuration

```typescript
interface SensitiveDataMaskingConfig {
  enabled: boolean;           // Enable/disable masking (default: true)
  patterns: RegExp[];         // Custom patterns to mask
  replacement: string;        // Replacement text (default: '[REDACTED]')
}

// Configure masking in adapter
const adapter = new LocalAdapter({
  sensitiveDataMasking: {
    enabled: true,
    replacement: '***HIDDEN***',
    patterns: [
      /custom-secret=(\S+)/gi,  // Add custom patterns
    ]
  }
});
```

#### Default Masked Patterns

The following sensitive data patterns are automatically masked:

- **API Keys**: `api_key=...`, `apikey: "..."`, `access_token=...`
- **Passwords**: `password=...`, `passwd: ...`, `pwd="..."`
- **Authorization Headers**: `Authorization: Bearer ...`, `Authorization: Basic ...` (supports Base64 with padding)
- **Cloud Credentials**: 
  - AWS: `AWS_ACCESS_KEY_ID=...`, `aws_secret_access_key=...`
  - GitHub: `ghp_...`, `ghs_...`, `github_token=...`
- **SSH Private Keys**: Full RSA, DSA, EC, and OpenSSH private keys
- **Environment Variables**: Any env var containing SECRET, TOKEN, KEY, PASSWORD, etc.
- **Command Line Arguments**: `--password ...`, `--client-secret ...`

#### Example Usage

```typescript
// Sensitive data is automatically masked in results
const result = await adapter.execute({
  command: 'echo $API_KEY'
});
// If API_KEY="sk-secret123", result.stdout will be "[REDACTED]"

// Masking in error messages
try {
  await adapter.execute({
    command: 'curl -H "Authorization: Bearer secret-token" https://api.example.com'
  });
} catch (error) {
  // error.stderr will contain "Authorization: Bearer [REDACTED]"
}

// Disable masking when needed (use with caution!)
const adapter = new LocalAdapter({
  sensitiveDataMasking: { enabled: false }
});
```

#### Custom Patterns

Add your own patterns for application-specific secrets:

```typescript
const adapter = new LocalAdapter({
  sensitiveDataMasking: {
    patterns: [
      // Keep default patterns and add custom ones
      /(internal-api-key):\s*(\S+)/gi,
      /company-secret=([^&\s]+)/gi,
    ]
  }
});
```

> ⚠️ **Security Note**: Sensitive data masking helps prevent accidental exposure but should not be the only security measure. Always follow security best practices like using environment variables, secure storage, and proper access controls.

## Local Adapter

Executes commands on the local machine using Node.js child_process.

### Basic Usage

```typescript
import { LocalAdapter } from '@xec-sh/core';

const adapter = new LocalAdapter({
  shell: true,
  encoding: 'utf8',
  timeout: 30000
});

// Direct execution
const result = await adapter.execute({
  command: 'echo "Hello, World!"'
});

// Via ExecutionEngine
const $local = $.local();
await $local`echo "Hello, World!"`;
```

### Configuration

```typescript
interface LocalAdapterConfig {
  // Shell configuration
  shell?: string | boolean;      // Shell to use (true for default)
  
  // Process options
  cwd?: string;                   // Working directory
  env?: Record<string, string>;   // Environment variables
  timeout?: number;               // Default timeout (ms)
  
  // Output handling
  encoding?: BufferEncoding;      // Output encoding
  maxBuffer?: number;             // Max output buffer size
  
  // Platform-specific
  uid?: number;                   // User ID (Unix)
  gid?: number;                   // Group ID (Unix)
  windowsHide?: boolean;          // Hide console (Windows)
  
  // Runtime
  preferBun?: boolean;            // Use Bun if available
  bunPath?: string;               // Path to Bun executable
}
```

### Features

```typescript
// Streaming output
await $`tail -f /var/log/app.log`
  .stdout(process.stdout);

// Signal handling
const proc = $`long-running-process`;
process.on('SIGINT', () => proc.kill());

// Working with different shells
await $`echo $0`.shell('/bin/zsh');
await $`Get-Process`.shell('powershell.exe');
```

## SSH Adapter

Executes commands on remote machines via SSH with advanced features.

### Basic Usage

```typescript
import { SSHAdapter } from '@xec-sh/core';

const adapter = new SSHAdapter({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '/home/user/.ssh/id_rsa'
});

// Connection pooling is automatic
await adapter.execute({ command: 'uptime' });

// Via ExecutionEngine
const $ssh = $.ssh({
  host: 'server.example.com',
  username: 'deploy'
});
await $ssh`uptime`;
```

### Configuration

```typescript
interface SSHAdapterConfig {
  // Connection
  host: string;                   // Hostname or IP address
  port?: number;                  // SSH port (default: 22)
  username: string;               // SSH username
  
  // Authentication
  password?: string;              // Password (less secure)
  privateKey?: string | Buffer;   // Private key path or content
  passphrase?: string;            // Private key passphrase
  agent?: string;                 // SSH agent socket path
  
  // Connection options
  readyTimeout?: number;          // Connection ready timeout
  keepaliveInterval?: number;     // Keepalive interval (ms)
  keepaliveCountMax?: number;     // Max keepalive attempts
  
  // Behavior
  strictHostKeyChecking?: boolean; // Verify host key
  agentForward?: boolean;         // Forward SSH agent
  forceIPv4?: boolean;            // Force IPv4
  forceIPv6?: boolean;            // Force IPv6
  
  // Advanced
  algorithms?: {                  // Crypto algorithms
    kex?: string[];
    cipher?: string[];
    serverHostKey?: string[];
    hmac?: string[];
  };
  compress?: boolean;             // Enable compression
  
  // Connection pooling
  maxConnections?: number;        // Max pooled connections
  connectionTimeout?: number;     // Connection timeout
}
```

### Connection Management

```typescript
// Connection pooling
const pool = new SSHConnectionPool({
  maxConnections: 5,
  idleTimeout: 60000,
  config: {
    host: 'server.com',
    username: 'user'
  }
});

// Get connection from pool
const conn = await pool.acquire();
try {
  await conn.exec('command');
} finally {
  conn.release(); // Return to pool
}

// Monitor pool
pool.on('connection:created', () => console.log('New connection'));
pool.on('connection:reused', () => console.log('Reused connection'));
```

### SSH Tunnels

```typescript
// Local port forwarding
const tunnel = await $ssh.tunnel({
  localPort: 8080,              // Local port (0 for dynamic)
  remoteHost: 'localhost',      // Remote host
  remotePort: 80                // Remote port
});

console.log(`Tunnel: localhost:${tunnel.localPort} -> remote:80`);

// Use tunnel
const response = await fetch(`http://localhost:${tunnel.localPort}`);

// Dynamic port allocation
const dynamicTunnel = await $ssh.tunnel({
  localPort: 0,  // Let system choose
  remoteHost: 'database.internal',
  remotePort: 5432
});

// Reverse tunnel
const reverse = await $ssh.reverseTunnel({
  remotePort: 8080,
  localHost: 'localhost',
  localPort: 3000
});

// Cleanup
await tunnel.close();
```

### File Transfer

```typescript
// Upload file
await $ssh.uploadFile('/local/app.tar.gz', '/remote/app.tar.gz');

// Download file
await $ssh.downloadFile('/remote/backup.sql', '/local/backup.sql');

// Upload directory
await $ssh.uploadDirectory('/local/dist', '/remote/www', {
  recursive: true,
  filter: (path) => !path.includes('node_modules')
});

// Stream-based transfer
const stream = fs.createReadStream('large-file.bin');
await $ssh.uploadStream(stream, '/remote/large-file.bin');
```

### Advanced Features

```typescript
// Sudo with password
const password = await $.password('Enter sudo password:');
await $ssh`echo ${password} | sudo -S systemctl restart nginx`;

// Interactive session
await $ssh`vim /etc/config`.interactive();

// Keep connection alive
const persistent = $ssh.keepAlive();
await persistent`tail -f /var/log/app.log`;

// SFTP operations
const sftp = await $ssh.sftp();
const files = await sftp.readdir('/home/user');
await sftp.unlink('/tmp/old-file');
```

## Docker Adapter

Executes commands in Docker containers with full lifecycle management.

### Basic Usage

```typescript
import { DockerAdapter } from '@xec-sh/core';

// Existing container
const adapter = new DockerAdapter({
  container: 'my-app'
});

await adapter.execute({ command: 'npm test' });

// Via ExecutionEngine - existing container
const $docker = $.docker({ container: 'my-app' });
await $docker`npm test`;

// New container with lifecycle
const container = await $.docker({
  image: 'node:18-alpine',
  name: 'test-container'
}).start();

await container.exec`npm install`;
await container.stop();
```

### Configuration

```typescript
interface DockerAdapterConfig {
  // Container selection
  container?: string;             // Existing container name/ID
  
  // New container options
  image?: string;                 // Docker image
  name?: string;                  // Container name
  
  // Runtime configuration
  cmd?: string[];                 // Container command
  entrypoint?: string[];          // Container entrypoint
  workdir?: string;               // Working directory
  user?: string;                  // User to run as
  
  // Environment
  env?: Record<string, string>;   // Environment variables
  envFile?: string;               // Env file path
  
  // Volumes
  volumes?: string[] | Record<string, string>;
  // ['/host/path:/container/path:ro']
  // { '/host/path': '/container/path' }
  
  // Networking
  ports?: string[] | Record<string, string>;
  // ['8080:80', '9000:9000']
  // { '8080': '80' }
  network?: string;               // Network name
  hostname?: string;              // Container hostname
  
  // Resources
  memory?: string;                // Memory limit (e.g., '512m')
  cpus?: string;                  // CPU limit (e.g., '0.5')
  
  // Security
  privileged?: boolean;           // Privileged mode
  capAdd?: string[];              // Add capabilities
  capDrop?: string[];             // Drop capabilities
  
  // Behavior
  rm?: boolean;                   // Remove after stop
  restart?: string;               // Restart policy
  pull?: boolean;                 // Pull image before start
}
```

### Container Lifecycle

```typescript
// Full lifecycle management
const container = await $.docker({
  image: 'postgres:14',
  name: 'test-db',
  env: {
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'testdb'
  },
  ports: { '5432': '5432' },
  volumes: { './data': '/var/lib/postgresql/data' }
}).start();

// Check container status
const isRunning = await container.isRunning();
const stats = await container.stats();

// Wait for readiness
await container.waitForPort(5432, 30000);
await container.waitForLog('database system is ready', 60000);

// Execute commands
await container.exec`psql -U postgres -d testdb -c "CREATE TABLE users (id INT)"`;

// Container operations
await container.pause();
await container.unpause();
await container.restart();

// Cleanup
await container.stop({ timeout: 10 });
await container.remove({ volumes: true });
```

### Docker Compose

```typescript
// Docker Compose operations
const compose = $.dockerCompose({
  file: './docker-compose.yml',
  project: 'myapp'
});

// Start services
await compose.up({
  detach: true,
  build: true,
  scale: { web: 3 }
});

// Execute in service
await compose.exec('web', 'npm test');

// View logs
await compose.logs('web', {
  follow: true,
  tail: 100
});

// Stop services
await compose.down({
  removeVolumes: true,
  removeImages: 'local'
});
```

### Advanced Features

```typescript
// Build image
await $.docker.build({
  context: './app',
  dockerfile: 'Dockerfile',
  tag: 'myapp:latest',
  args: {
    NODE_VERSION: '18'
  }
});

// Stream logs
const container = await $.docker({ container: 'app' });
await container.logs({
  follow: true,
  stdout: (line) => console.log(`[stdout] ${line}`),
  stderr: (line) => console.error(`[stderr] ${line}`)
});

// Copy files
await container.copyTo('./config.json', '/app/config.json');
await container.copyFrom('/app/logs', './logs');

// Health checks
const health = await container.health();
if (health.Status !== 'healthy') {
  console.log('Container unhealthy:', health);
}

// Commit changes
await container.commit({
  repo: 'myapp',
  tag: 'snapshot',
  message: 'Configuration updated'
});
```

## Kubernetes Adapter

Executes commands in Kubernetes pods with advanced features.

### Basic Usage

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const adapter = new KubernetesAdapter({
  namespace: 'production',
  kubeconfig: '/home/user/.kube/config'
});

// Direct execution
await adapter.execute({
  command: 'date',
  pod: 'web-server-abc123'
});

// Via ExecutionEngine
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('web-server');

await pod.exec`ps aux`;
```

### Configuration

```typescript
interface KubernetesAdapterConfig {
  // Pod selection
  pod?: string;                   // Pod name or label selector
  namespace?: string;             // Kubernetes namespace
  container?: string;             // Container name in pod
  
  // Cluster configuration
  kubeconfig?: string;            // Path to kubeconfig file
  context?: string;               // Kubernetes context
  cluster?: string;               // Cluster name
  
  // Authentication
  token?: string;                 // Bearer token
  certFile?: string;              // Client certificate
  keyFile?: string;               // Client key
  caFile?: string;                // CA certificate
  
  // Execution options
  stdin?: boolean;                // Attach stdin
  tty?: boolean;                  // Allocate TTY
  
  // Kubectl options
  kubectlPath?: string;           // Path to kubectl binary
  execFlags?: string[];           // Additional kubectl flags
}
```

### Pod Operations

```typescript
// Get pod by name
const pod = k8s.pod('web-server-xyz');

// Get pod by label selector
const pod = k8s.pod('app=web,tier=frontend');

// Execute commands
await pod.exec`hostname`;
await pod.exec`cat /etc/os-release`;

// Specify container
await pod.exec`nginx -t`.container('nginx');

// Interactive commands
await pod.exec`sh`.interactive();
```

### Port Forwarding

```typescript
// Forward pod port to local
const forward = await pod.portForward(8080, 80);
console.log(`Pod available at localhost:${forward.localPort}`);

// Dynamic local port
const dynamic = await pod.portForward(0, 3000);
console.log(`Using port ${dynamic.localPort}`);

// Multiple ports
const multi = await pod.portForward([
  { local: 8080, remote: 80 },
  { local: 9000, remote: 9000 }
]);

// Keep alive and monitor
forward.on('error', (err) => console.error('Forward error:', err));
forward.on('close', () => console.log('Forward closed'));

// Cleanup
await forward.close();
```

### Log Streaming

```typescript
// Stream logs
const stream = await pod.streamLogs({
  follow: true,
  timestamps: true,
  previous: false,
  tailLines: 100
});

stream.on('data', (line) => {
  console.log(`[${pod.name}] ${line}`);
});

stream.on('error', (err) => {
  console.error('Log error:', err);
});

// Stop streaming
stream.destroy();

// Stream with filters
await pod.streamLogs({
  container: 'app',
  sinceTime: '2024-01-01T00:00:00Z',
  grep: 'ERROR'
});
```

### File Operations

```typescript
// Copy file to pod
await pod.copyTo('./config.yaml', '/app/config.yaml');

// Copy from specific container
await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');

// Copy file from pod
await pod.copyFrom('/app/logs/error.log', './error.log');

// Copy directory
await pod.copyTo('./static', '/app/static', {
  recursive: true,
  container: 'app'
});

// Tar operations
await pod.exec`tar -czf /tmp/backup.tar.gz /app/data`;
await pod.copyFrom('/tmp/backup.tar.gz', './backup.tar.gz');
```

### Advanced Features

```typescript
// Get pod details
const details = await pod.describe();
console.log('Pod status:', details.status.phase);
console.log('Containers:', details.spec.containers.map(c => c.name));

// Watch pod events
const watcher = pod.watch();
watcher.on('ADDED', (pod) => console.log('Pod added'));
watcher.on('MODIFIED', (pod) => console.log('Pod modified'));
watcher.on('DELETED', (pod) => console.log('Pod deleted'));

// Ephemeral containers (debugging)
await pod.debug({
  image: 'busybox',
  command: ['sh'],
  stdin: true,
  tty: true
});

// Resource usage
const metrics = await pod.metrics();
console.log('CPU:', metrics.cpu);
console.log('Memory:', metrics.memory);
```

## Remote Docker Adapter

Combines SSH and Docker adapters for Docker operations on remote machines.

### Basic Usage

```typescript
const $remote = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'docker',
    privateKey: '~/.ssh/id_rsa'
  },
  docker: {
    container: 'remote-app'
  }
});

await $remote`ps aux`;
await $remote`tail -f /var/log/app.log`;
```

### Configuration

```typescript
interface RemoteDockerConfig {
  ssh: SSHAdapterConfig;          // SSH connection settings
  docker: DockerAdapterConfig;    // Docker settings
  
  // Additional options
  dockerHost?: string;            // Docker daemon socket
  sudo?: boolean;                 // Use sudo for docker commands
}
```

### Advanced Usage

```typescript
// Full container lifecycle on remote host
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'ops' }
});

// Start container on remote
const container = await remote.docker({
  image: 'nginx:alpine',
  name: 'web-proxy',
  ports: { '80': '80', '443': '443' }
}).start();

// Manage remotely
await container.exec`nginx -s reload`;
await container.logs({ follow: true });
await container.stop();

// Docker operations via SSH
await remote`docker system prune -f`;
await remote`docker-compose -f /app/docker-compose.yml up -d`;
```

## Custom Adapters

Create adapters for any execution environment:

### Example: Cloud Function Adapter

```typescript
import { BaseAdapter, Command, ExecutionResult } from '@xec-sh/core';

class CloudFunctionAdapter extends BaseAdapter {
  name = 'cloudfunction';
  
  constructor(private config: CloudFunctionConfig) {
    super(config);
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Check if cloud SDK is available
      await this.checkCloudSDK();
      return true;
    } catch {
      return false;
    }
  }
  
  async execute(command: Command): Promise<ExecutionResult> {
    // Prepare function invocation
    const payload = this.preparePayload(command);
    
    // Invoke cloud function
    const response = await this.invokeFunction(payload);
    
    // Transform response to ExecutionResult
    return {
      stdout: response.output,
      stderr: response.errors || '',
      exitCode: response.statusCode === 200 ? 0 : 1,
      signal: undefined,
      command: command.command,
      duration: response.duration,
      isSuccess: () => response.statusCode === 200
    };
  }
  
  private async invokeFunction(payload: any) {
    // Cloud-specific implementation
    const client = await this.getCloudClient();
    return await client.functions.invoke(
      this.config.functionName,
      payload
    );
  }
  
  async dispose(): Promise<void> {
    // Cleanup cloud resources
    await this.closeCloudClient();
    await super.dispose();
  }
}

// Register custom adapter
const engine = new ExecutionEngine();
engine.registerAdapter('cloudfunction', CloudFunctionAdapter);

// Use custom adapter
const $cloud = engine.with({
  adapter: 'cloudfunction',
  adapterOptions: {
    functionName: 'data-processor',
    region: 'us-east-1'
  }
});

await $cloud`process --input s3://bucket/data.json`;
```

### Adapter Middleware

```typescript
class LoggingAdapter extends BaseAdapter {
  constructor(
    private innerAdapter: BaseAdapter,
    private logger: Logger
  ) {
    super(innerAdapter.config);
    this.name = `logging-${innerAdapter.name}`;
  }
  
  async execute(command: Command): Promise<ExecutionResult> {
    const start = Date.now();
    this.logger.info('Executing command', { 
      command: command.command,
      adapter: this.innerAdapter.name 
    });
    
    try {
      const result = await this.innerAdapter.execute(command);
      
      this.logger.info('Command completed', {
        duration: Date.now() - start,
        exitCode: result.exitCode
      });
      
      return result;
    } catch (error) {
      this.logger.error('Command failed', {
        duration: Date.now() - start,
        error: error.message
      });
      throw error;
    }
  }
  
  async isAvailable() {
    return this.innerAdapter.isAvailable();
  }
  
  async dispose() {
    await this.innerAdapter.dispose();
  }
}
```

## Performance Optimization

### Connection Pooling

```typescript
// SSH connection pooling
const sshPool = new SSHConnectionPool({
  maxConnections: 10,
  minConnections: 2,
  idleTimeout: 300000, // 5 minutes
  acquireTimeout: 10000
});

// Reuse connections efficiently
await Promise.all(
  commands.map(cmd => 
    sshPool.withConnection(conn => 
      conn.exec(cmd)
    )
  )
);

// Monitor pool health
sshPool.on('stats', (stats) => {
  console.log('Active:', stats.active);
  console.log('Idle:', stats.idle);
  console.log('Pending:', stats.pending);
});
```

### Batch Operations

```typescript
// Batch commands for efficiency
class BatchAdapter extends BaseAdapter {
  private queue: Command[] = [];
  private flushTimer?: NodeJS.Timeout;
  
  async execute(command: Command): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...command, resolve, reject });
      this.scheduleFlush();
    });
  }
  
  private scheduleFlush() {
    if (this.flushTimer) return;
    
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 10); // Batch within 10ms window
  }
  
  private async flush() {
    const batch = this.queue.splice(0);
    this.flushTimer = undefined;
    
    // Execute batch as single operation
    const results = await this.executeBatch(batch);
    
    // Resolve individual promises
    batch.forEach((cmd, i) => {
      cmd.resolve(results[i]);
    });
  }
}
```

## Resource Management

### Automatic Disposal

```typescript
// Using async disposal
{
  await using adapter = new SSHAdapter(config);
  await adapter.execute({ command: 'test' });
} // Automatically disposed

// Manual disposal with try/finally
const adapter = new DockerAdapter(config);
try {
  await adapter.execute({ command: 'test' });
} finally {
  await adapter.dispose();
}

// Disposal with execution engine
const engine = new ExecutionEngine();
try {
  await engine.ssh(config)`command`;
} finally {
  await engine.dispose(); // Disposes all adapters
}
```

### Resource Monitoring

```typescript
// Monitor adapter resources
adapter.on('resource:allocated', (resource) => {
  console.log('Allocated:', resource.type, resource.id);
});

adapter.on('resource:released', (resource) => {
  console.log('Released:', resource.type, resource.id);
});

// Track metrics
const metrics = adapter.getMetrics();
console.log('Commands executed:', metrics.commandCount);
console.log('Average duration:', metrics.avgDuration);
console.log('Active connections:', metrics.activeConnections);
```

## Error Handling

### Adapter-Specific Errors

```typescript
try {
  await adapter.execute(command);
} catch (error) {
  if (error instanceof SSHConnectionError) {
    console.error('SSH connection failed:', error.code);
    // Handle connection errors
  } else if (error instanceof DockerNotFoundError) {
    console.error('Container not found:', error.container);
    // Handle Docker errors
  } else if (error instanceof KubernetesError) {
    console.error('Kubernetes error:', error.reason);
    // Handle K8s errors
  } else if (error instanceof CommandError) {
    console.error('Command failed:', error.exitCode);
    // Handle execution errors
  }
}
```

### Retry Strategies

```typescript
class RetryAdapter extends BaseAdapter {
  async execute(command: Command): Promise<ExecutionResult> {
    const maxRetries = command.retry?.maxRetries || 3;
    const delay = command.retry?.delay || 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.innerAdapter.execute(command);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        if (!this.shouldRetry(error, attempt)) throw error;
        
        await this.sleep(delay * Math.pow(2, attempt - 1));
      }
    }
  }
  
  private shouldRetry(error: any, attempt: number): boolean {
    // Retry on transient errors
    return error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ENOTFOUND';
  }
}
```

## Testing

### Mock Adapter

```typescript
import { MockAdapter } from '@xec-sh/core/testing';

const mock = new MockAdapter();

// Add expected responses
mock.expect('echo test')
  .returns({ stdout: 'test\n', exitCode: 0 });

mock.expect('failing-command')
  .throws(new CommandError('Command not found', 127));

// Use in tests
const engine = new ExecutionEngine({ 
  adapters: { local: mock } 
});

await expect($`echo test`).resolves.toHaveProperty('stdout', 'test\n');
await expect($`failing-command`).rejects.toThrow('Command not found');

// Verify expectations
mock.verify(); // Throws if expectations not met
```

### Adapter Testing

```typescript
describe('CustomAdapter', () => {
  let adapter: CustomAdapter;
  
  beforeEach(() => {
    adapter = new CustomAdapter(config);
  });
  
  afterEach(async () => {
    await adapter.dispose();
  });
  
  test('executes commands', async () => {
    const result = await adapter.execute({
      command: 'echo',
      args: ['test']
    });
    
    expect(result.stdout).toBe('test\n');
    expect(result.exitCode).toBe(0);
    expect(result.isSuccess()).toBe(true);
  });
  
  test('handles errors', async () => {
    await expect(adapter.execute({
      command: 'false'
    })).rejects.toThrow();
  });
  
  test('respects timeout', async () => {
    await expect(adapter.execute({
      command: 'sleep 10',
      timeout: 100
    })).rejects.toThrow('timeout');
  });
});
```

## Best Practices

1. **Always check availability** before using an adapter
   ```typescript
   if (!await adapter.isAvailable()) {
     throw new Error(`${adapter.name} is not available`);
   }
   ```

2. **Handle connection failures gracefully**
   ```typescript
   const result = await adapter.execute(command)
     .catch(err => {
       if (err.code === 'ECONNREFUSED') {
         return fallbackAdapter.execute(command);
       }
       throw err;
     });
   ```

3. **Set appropriate timeouts** for different environments
   ```typescript
   const timeout = adapter.name === 'ssh' ? 30000 : 5000;
   ```

4. **Dispose adapters** to prevent resource leaks
   ```typescript
   process.on('exit', async () => {
     await adapter.dispose();
   });
   ```

5. **Use connection pooling** for network adapters
   ```typescript
   const pool = new ConnectionPool(sshConfig);
   ```

6. **Log adapter events** for debugging
   ```typescript
   adapter.on('command:start', ({ command }) => {
     logger.debug(`Executing: ${command}`);
   });
   ```

7. **Implement retries** for transient failures
   ```typescript
   const withRetry = new RetryAdapter(adapter, {
     maxRetries: 3,
     delay: 1000
   });
   ```

8. **Monitor resource usage**
   ```typescript
   setInterval(() => {
     const metrics = adapter.getMetrics();
     monitor.gauge('adapter.connections', metrics.connections);
   }, 10000);
   ```

## Related Documentation

- [ExecutionEngine](./execution-engine) - Core engine using adapters
- [ProcessPromise](./process-promise) - Command execution results  
- [Events](./events) - Adapter event system
- [Types](./types) - TypeScript definitions