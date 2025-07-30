---
sidebar_position: 2
---

# SSH Adapter

Execute commands on remote servers via SSH with connection pooling, tunneling, and file transfer capabilities.

## Overview

The SSH adapter provides secure remote command execution with features like:

- **Connection Pooling** - Reuse SSH connections for performance
- **Multiple Authentication** - Password, private key, or agent
- **File Transfer** - Upload/download files and directories via SFTP
- **SSH Tunnels** - Port forwarding for secure access
- **Sudo Support** - Execute commands with elevated privileges
- **Key Validation** - Verify SSH keys before use

## Basic Usage

### Simple Connection

```typescript
import { $ } from '@xec-sh/core';

// Connect with password
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  password: 'password'
});

await remote`uname -a`;
await remote`ls -la`;
```

### Key-Based Authentication

```typescript
// Using private key file
const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '~/.ssh/id_rsa'
});

// Using private key content
import { readFileSync } from 'fs';
const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: readFileSync('/path/to/key', 'utf-8')
});

// With passphrase
const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '~/.ssh/id_rsa',
  passphrase: 'key-passphrase'
});
```

### SSH Agent

```typescript
// Use SSH agent (default behavior)
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user'
  // No password or privateKey - uses agent
});

// Explicitly use agent
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  agent: process.env.SSH_AUTH_SOCK
});
```

## Connection Options

### Full Configuration

```typescript
const remote = $.ssh({
  // Connection
  host: 'server.example.com',
  port: 2222,
  username: 'deploy',
  
  // Authentication (one of these)
  password: 'secret',
  privateKey: '~/.ssh/id_rsa',
  passphrase: 'key-passphrase',
  agent: process.env.SSH_AUTH_SOCK,
  
  // SSH Options
  strictHostKeyChecking: true,
  hostVerifier: (key) => true,
  algorithms: {
    serverHostKey: ['ssh-rsa', 'ssh-ed25519']
  },
  
  // Connection settings
  readyTimeout: 20000,
  keepaliveInterval: 10000,
  keepaliveCountMax: 3,
  
  // Advanced
  sock: customSocket,
  agentForward: true,
  debug: (info) => console.log('SSH Debug:', info)
});
```

### Connection Verification

```typescript
// Verify host key
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  hostVerifier: (hostkey) => {
    const knownKey = 'AAAAB3NzaC1yc2EAAAADAQAB...';
    return hostkey === knownKey;
  }
});

// Strict host checking (default)
const strict = $.ssh({
  host: 'server.example.com',
  username: 'user',
  strictHostKeyChecking: true
});
```

## Command Execution

### Basic Commands

```typescript
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user'
});

// Simple commands
await remote`pwd`;
await remote`whoami`;
await remote`date`;

// With output processing
const uptime = await remote`uptime`.text();
const processes = await remote`ps aux | wc -l`.text();
const files = await remote`ls -la`.lines();
```

### Environment and Directory

```typescript
// Set environment variables
await remote.env({ NODE_ENV: 'production' })`node -e "console.log(process.env.NODE_ENV)"`;

// Change directory
await remote.cd('/var/www')`pwd`; // Output: /var/www

// Combine both
await remote
  .cd('/app')
  .env({ PORT: '3000' })`npm start`;
```

### Command Chaining

```typescript
// Execute multiple commands
await remote`
  cd /app &&
  git pull &&
  npm install &&
  npm run build &&
  pm2 restart app
`;

// Or use separate calls
await remote`cd /app`;
await remote`git pull`;
await remote`npm install`;
await remote`npm run build`;
await remote`pm2 restart app`;
```

## File Transfer

### Upload Files

```typescript
// Upload single file
await remote.uploadFile('./local-file.txt', '/remote/path/file.txt');

// Upload with progress
await remote.uploadFile('./large-file.zip', '/tmp/file.zip', {
  onProgress: (transferred, total) => {
    const percent = (transferred / total * 100).toFixed(2);
    console.log(`Uploaded: ${percent}%`);
  }
});
```

### Download Files

```typescript
// Download single file
await remote.downloadFile('/remote/config.json', './local-config.json');

// Download with progress
await remote.downloadFile('/remote/backup.tar.gz', './backup.tar.gz', {
  onProgress: (transferred, total) => {
    const percent = (transferred / total * 100).toFixed(2);
    console.log(`Downloaded: ${percent}%`);
  }
});
```

### Directory Transfer

```typescript
// Upload entire directory
await remote.uploadDirectory('./local-project', '/remote/project');

// Download directory
await remote.downloadDirectory('/remote/logs', './downloaded-logs');

// With options
await remote.uploadDirectory('./dist', '/var/www/html', {
  recursive: true,
  concurrency: 5,
  filter: (path) => !path.includes('node_modules')
});
```

## SSH Tunnels

### Port Forwarding

```typescript
// Create SSH tunnel
const tunnel = await remote.tunnel({
  localPort: 3306,
  remoteHost: 'database.internal',
  remotePort: 3306
});

console.log(`Tunnel open on localhost:${tunnel.localPort}`);

// Use the tunnel
const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: 'localhost',
  port: tunnel.localPort,
  user: 'dbuser',
  password: 'dbpass'
});

// Close tunnel when done
await tunnel.close();
```

### Dynamic Port Allocation

```typescript
// Let system choose local port
const tunnel = await remote.tunnel({
  localPort: 0, // Dynamic
  remoteHost: 'service.internal',
  remotePort: 8080
});

console.log(`Service available at: http://localhost:${tunnel.localPort}`);
```

### Multiple Tunnels

```typescript
// Create multiple tunnels
const dbTunnel = await remote.tunnel({
  localPort: 5432,
  remoteHost: 'postgres.internal',
  remotePort: 5432
});

const redisTunnel = await remote.tunnel({
  localPort: 6379,
  remoteHost: 'redis.internal',
  remotePort: 6379
});

const apiTunnel = await remote.tunnel({
  localPort: 8080,
  remoteHost: 'api.internal',
  remotePort: 80
});

// Use tunnels...

// Clean up - manual close
await Promise.all([
  dbTunnel.close(),
  redisTunnel.close(),
  apiTunnel.close()
]);

// Or let dispose handle it - more robust
// The adapter's dispose method will attempt to close all tunnels
// even if some fail, ensuring maximum cleanup
await remote.getAdapter('ssh').dispose();
```

## Sudo Operations

### Basic Sudo

```typescript
// Execute with sudo
await remote`sudo apt update`;
await remote`sudo systemctl restart nginx`;

// With password
const sudoRemote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  password: 'userpass'
});

// Password will be provided automatically
await sudoRemote`sudo -S apt install nodejs`;
```

### Sudo Options

```typescript
// Configure sudo behavior
await remote`sudo -u postgres psql -c "SELECT 1"`;
await remote`sudo -H pip install requests`;
await remote`sudo -E npm install -g pm2`; // Preserve environment
```

## Connection Management

### Connection Pooling

Connections are automatically pooled and reused:

```typescript
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user'
});

// All these commands reuse the same connection
for (let i = 0; i < 100; i++) {
  await remote`echo "Command ${i}"`;
}
// Only one SSH connection is made
```

### Manual Connection Management

```typescript
// Get the underlying SSH connection
const adapter = remote.getAdapter('ssh');

// Check if connected
if (await adapter.isConnected()) {
  console.log('Connected to SSH');
}

// Manually close connection
await adapter.dispose();
```

### Connection Events

```typescript
// Monitor SSH events
$.on('ssh:connect', (event) => {
  console.log(`Connected to ${event.host}`);
});

$.on('ssh:disconnect', (event) => {
  console.log(`Disconnected from ${event.host}`);
});

$.on('ssh:error', (event) => {
  console.error(`SSH error on ${event.host}:`, event.error);
});
```

## Error Handling

### Connection Errors

```typescript
try {
  const remote = $.ssh({
    host: 'nonexistent.example.com',
    username: 'user'
  });
  await remote`ls`;
} catch (error) {
  if (error.code === 'ENOTFOUND') {
    console.error('Host not found');
  } else if (error.code === 'ECONNREFUSED') {
    console.error('Connection refused');
  } else if (error.code === 'ETIMEDOUT') {
    console.error('Connection timeout');
  }
}
```

### Authentication Errors

```typescript
try {
  const remote = $.ssh({
    host: 'server.example.com',
    username: 'user',
    password: 'wrong-password'
  });
  await remote`ls`;
} catch (error) {
  if (error.message.includes('Authentication failed')) {
    console.error('Invalid credentials');
  }
}
```

### Command Errors

```typescript
// Handle command failures
const result = await remote`test -f /nonexistent`.nothrow();
if (!result.isSuccess()) {
  console.log('File does not exist');
}

// With retry
const retryResult = await remote
  .retry({ times: 3, delay: 1000 })`unstable-command`;
```

## Advanced Features

### SSH Key Validation

```typescript
import { SSHKeyValidator } from '@xec-sh/core';

const validator = new SSHKeyValidator();

// Validate key file
const isValid = await validator.validate('~/.ssh/id_rsa');
if (!isValid.valid) {
  console.error('Invalid SSH key:', isValid.error);
}

// Check key permissions
const perms = await validator.checkPermissions('~/.ssh/id_rsa');
if (!perms.valid) {
  console.error('Insecure key permissions:', perms.error);
}
```

### Secure Password Handling

```typescript
import { SecurePasswordHandler } from '@xec-sh/core';

const handler = new SecurePasswordHandler();
await handler.setPassword('my-secret-password');

const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  password: handler // Pass handler instead of string
});

// Password is securely managed in memory
await remote`ls`;

// Clean up when done
handler.dispose();
```

### Jump Hosts (Bastion)

```typescript
// Connect through jump host
const remote = $.ssh({
  host: 'internal.server',
  username: 'user',
  privateKey: '~/.ssh/id_rsa',
  jump: {
    host: 'bastion.example.com',
    username: 'jumpuser',
    privateKey: '~/.ssh/bastion_key'
  }
});

await remote`hostname`; // Executes on internal.server
```

### Custom SSH Options

```typescript
// Advanced SSH configuration
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  algorithms: {
    kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384'],
    cipher: ['aes128-gcm', 'aes256-gcm'],
    serverHostKey: ['ssh-rsa', 'ssh-ed25519']
  },
  compress: true,
  timeout: 30000
});
```

## Performance Optimization

### Connection Reuse

```typescript
// Reuse connections for multiple operations
async function deployApplication(remote: SSHExecutionContext) {
  // All commands use the same connection
  await remote`cd /app && git pull`;
  await remote`npm install`;
  await remote`npm run build`;
  await remote`pm2 restart app`;
}

// Single connection for entire deployment
const remote = $.ssh({ host: 'server.com', username: 'deploy' });
await deployApplication(remote);
```

### Batch Operations

```typescript
// Execute multiple commands in one session
const remote = $.ssh({ host: 'server.com', username: 'user' });

const results = await remote`
  echo "Starting batch operations"
  df -h
  free -m
  uptime
  ps aux | wc -l
  echo "Batch complete"
`;
```

### Parallel Execution

```typescript
// Run commands on multiple servers
const servers = [
  'web1.example.com',
  'web2.example.com',
  'web3.example.com'
];

const connections = servers.map(host => 
  $.ssh({ host, username: 'admin' })
);

// Execute in parallel
const results = await Promise.all(
  connections.map(conn => conn`uptime`.text())
);

results.forEach((uptime, i) => {
  console.log(`${servers[i]}: ${uptime}`);
});
```

## Best Practices

### 1. Use Key-Based Authentication

```typescript
// ✅ Secure - use SSH keys
const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '~/.ssh/deploy_key'
});

// ❌ Less secure - password auth
const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  password: 'password123'
});
```

### 2. Validate Hosts

```typescript
// ✅ Verify host keys
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  hostVerifier: (key) => {
    return knownHosts.includes(key);
  }
});
```

### 3. Handle Errors Gracefully

```typescript
// ✅ Proper error handling
async function executeRemote(command: string) {
  try {
    const remote = $.ssh({ host: 'server.com', username: 'user' });
    return await remote`${command}`;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('SSH service not running');
    } else if (error.level === 'client-authentication') {
      console.error('Authentication failed');
    } else {
      console.error('SSH error:', error.message);
    }
    throw error;
  }
}
```

### 4. Clean Up Resources

```typescript
// ✅ Ensure cleanup
const remote = $.ssh({ host: 'server.com', username: 'user' });
try {
  await remote`long-running-command`;
} finally {
  // Connections are pooled, but can force cleanup
  await $.dispose();
}
```

When disposing of SSH adapters with active tunnels:

```typescript
// Multiple tunnels are cleaned up gracefully
const tunnel1 = await remote.tunnel({ localPort: 3306, remoteHost: 'db', remotePort: 3306 });
const tunnel2 = await remote.tunnel({ localPort: 6379, remoteHost: 'redis', remotePort: 6379 });

// Dispose will attempt to close all tunnels
// Even if one tunnel fails to close, others will still be attempted
await remote.getAdapter('ssh').dispose();
```

The dispose method ensures all resources are cleaned up properly:
- All active tunnels are closed (failures are logged but don't prevent other cleanups)
- SSH connections in the pool are terminated
- Secure password handlers are cleaned up
- Event listeners are removed

### 5. Use Appropriate Timeouts

```typescript
// ✅ Set reasonable timeouts
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  readyTimeout: 20000 // 20 seconds for connection
});

// For long commands
await remote.timeout(300000)`./slow-backup-script.sh`;
```

## Common Patterns

### Deployment Script

```typescript
async function deploy(host: string) {
  const remote = $.ssh({
    host,
    username: 'deploy',
    privateKey: '~/.ssh/deploy_key'
  });
  
  console.log(`Deploying to ${host}...`);
  
  // Pull latest code
  await remote`cd /app && git pull origin main`;
  
  // Install dependencies
  await remote`cd /app && npm ci`;
  
  // Build application
  await remote`cd /app && npm run build`;
  
  // Run migrations
  await remote`cd /app && npm run migrate`;
  
  // Restart service
  await remote`sudo systemctl restart app`;
  
  // Verify deployment
  const health = await remote`curl -s localhost:3000/health`.json();
  if (health.status !== 'ok') {
    throw new Error('Deployment verification failed');
  }
  
  console.log(`Successfully deployed to ${host}`);
}
```

### Multi-Server Management

```typescript
class ServerManager {
  private connections = new Map<string, any>();
  
  connect(name: string, options: any) {
    this.connections.set(name, $.ssh(options));
  }
  
  async execute(name: string, command: string) {
    const conn = this.connections.get(name);
    if (!conn) throw new Error(`No connection for ${name}`);
    return await conn`${command}`;
  }
  
  async executeAll(command: string) {
    const results = new Map();
    for (const [name, conn] of this.connections) {
      try {
        results.set(name, await conn`${command}`.text());
      } catch (error) {
        results.set(name, error);
      }
    }
    return results;
  }
}

// Usage
const manager = new ServerManager();
manager.connect('web1', { host: 'web1.example.com', username: 'admin' });
manager.connect('web2', { host: 'web2.example.com', username: 'admin' });
manager.connect('db1', { host: 'db1.example.com', username: 'admin' });

const uptimes = await manager.executeAll('uptime');
```