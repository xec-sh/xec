---
title: SSH Target Overview
description: Remote command execution via SSH with connection pooling and tunneling
keywords: [ssh, remote, execution, pooling, tunneling]
source_files:
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/ssh/ssh-client.ts
  - packages/core/src/ssh/connection-pool.ts
  - packages/core/src/ssh/port-forwarding.ts
key_functions:
  - SSHAdapter.execute()
  - SSHConnectionPool.acquire()
  - SSHClient.connect()
  - createTunnel()
verification_date: 2025-08-03
---

# SSH Target Overview

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/ssh-adapter.ts` - SSH execution adapter
- `packages/core/src/ssh/ssh-client.ts` - SSH client implementation
- `packages/core/src/ssh/connection-pool.ts` - Connection pooling logic
- `packages/core/src/ssh/port-forwarding.ts` - SSH tunneling
- `packages/core/src/ssh/auth.ts` - Authentication methods
- `apps/xec/src/config/types.ts` - SSH target configuration (lines 53-75)

**Key Classes:**
- `SSHAdapter` - SSH command execution adapter
- `SSHClient` - Core SSH client wrapper
- `SSHConnectionPool` - Connection pool manager
- `SSHTunnel` - Port forwarding implementation

**Key Functions:**
- `SSHAdapter.execute()` - Execute commands via SSH (lines 30-95)
- `SSHConnectionPool.acquire()` - Get pooled connection (lines 45-78)
- `SSHConnectionPool.release()` - Return connection to pool (lines 80-95)
- `SSHClient.connect()` - Establish SSH connection (lines 25-68)
- `createTunnel()` - Create SSH tunnel (lines 15-42)

## Overview

SSH targets enable remote command execution on servers via SSH protocol. Xec provides advanced SSH features including connection pooling, automatic reconnection, port forwarding, and secure credential management.

## Target Configuration

### Basic SSH Target

```yaml
# .xec/config.yaml
targets:
  production:
    type: ssh
    host: prod.example.com
    user: deploy
    port: 22  # Optional, default: 22
    
  staging:
    type: ssh
    host: staging.example.com
    user: ubuntu
    privateKey: ~/.ssh/id_rsa  # Key authentication
```

### Advanced Configuration

```yaml
targets:
  secure-server:
    type: ssh
    host: secure.example.com
    user: admin
    port: 2222
    privateKey: ~/.ssh/deploy_key
    passphrase: ${SSH_KEY_PASSPHRASE}  # From environment
    
    # Connection options
    connectionTimeout: 30000  # 30 seconds
    readyTimeout: 10000      # 10 seconds
    keepaliveInterval: 5000  # 5 seconds
    
    # Retry configuration
    retries: 3
    retryDelay: 1000
    
    # Jump host (bastion)
    jumpHost:
      host: bastion.example.com
      user: jump-user
      privateKey: ~/.ssh/bastion_key
      
    # Environment
    env:
      LANG: en_US.UTF-8
      TERM: xterm-256color
```

## Connection Management

### Connection Pooling

SSH connections are automatically pooled for performance (from `connection-pool.ts`):

```typescript
// Pool configuration
const poolConfig = {
  maxConnections: 10,      // Maximum connections per host
  minConnections: 1,       // Minimum idle connections
  idleTimeout: 300000,     // 5 minutes idle timeout
  acquisitionTimeout: 30000, // 30 seconds to acquire
  testOnBorrow: true       // Test connection before use
};
```

**Pool Behavior:**
1. Connections are reused across commands
2. Idle connections are maintained (min pool size)
3. Connections are tested before use
4. Failed connections are automatically replaced
5. Pool grows on demand up to max size

### Connection Lifecycle

```typescript
// Automatic pooling (recommended)
await $.ssh('user@host')`ls -la`;  // Creates/reuses connection
await $.ssh('user@host')`pwd`;     // Reuses same connection

// Manual connection management
const ssh = await SSHClient.connect({
  host: 'example.com',
  user: 'admin',
  privateKey: readFileSync('~/.ssh/id_rsa')
});

try {
  await ssh.exec('ls -la');
  await ssh.exec('pwd');
} finally {
  await ssh.disconnect();
}
```

## Authentication Methods

### Private Key Authentication

```yaml
targets:
  key-auth:
    type: ssh
    host: server.example.com
    user: deploy
    privateKey: ~/.ssh/id_rsa      # Path to key file
    passphrase: ${SSH_PASSPHRASE}  # Optional key passphrase
```

```typescript
// Programmatic key auth
await $.ssh({
  host: 'server.example.com',
  user: 'deploy',
  privateKey: await fs.readFile('~/.ssh/id_rsa', 'utf8'),
  passphrase: process.env.SSH_PASSPHRASE
})`command`;
```

### Password Authentication

```yaml
targets:
  password-auth:
    type: ssh
    host: server.example.com
    user: admin
    password: ${SSH_PASSWORD}  # From environment variable
```

**Security Note:** Avoid hardcoding passwords. Use environment variables or secret management.

### SSH Agent

```yaml
targets:
  agent-auth:
    type: ssh
    host: server.example.com
    user: deploy
    agent: true  # Use SSH agent (default: true if available)
    agentSocket: ${SSH_AUTH_SOCK}  # Optional custom socket
```

### Multiple Authentication Methods

```typescript
// Try multiple auth methods (order: agent → key → password)
await $.ssh({
  host: 'server.example.com',
  user: 'admin',
  agent: true,  // Try agent first
  privateKey: '~/.ssh/id_rsa',  // Then try key
  password: process.env.FALLBACK_PASSWORD  // Finally password
})`command`;
```

## Command Execution

### Basic Execution

```typescript
// Simple command
await $.ssh('user@host')`ls -la`;

// With configuration object
await $.ssh({
  host: 'server.example.com',
  user: 'deploy'
})`df -h`;

// Using configured target
await $.target('production')`systemctl status nginx`;
```

### Advanced Execution

```typescript
// With environment variables
await $.ssh('user@host').env({
  NODE_ENV: 'production',
  PORT: '3000'
})`npm start`;

// With working directory
await $.ssh('user@host').cwd('/app')`git pull`;

// With timeout
await $.ssh('user@host').timeout(60000)`./long-script.sh`;

// With sudo
await $.ssh('user@host')`sudo systemctl restart nginx`;
```

### Stream Processing

```typescript
// Stream output
await $.ssh('user@host')`tail -f /var/log/app.log`
  .pipe(process.stdout);

// Process lines
await $.ssh('user@host')`cat large-file.txt`
  .lines(async (line) => {
    console.log(`Processing: ${line}`);
  });

// Pipe between commands
await $.ssh('user@host')`cat data.csv`
  .pipe($.ssh('user@host2')`import-data`);
```

## File Transfer

### Upload Files

```typescript
// Upload single file
await $.ssh('user@host').upload('local-file.txt', '/remote/path/file.txt');

// Upload directory
await $.ssh('user@host').upload('./dist/', '/var/www/html/');

// Upload with progress
await $.ssh('user@host').upload('large-file.zip', '/tmp/', {
  onProgress: (transferred, total) => {
    console.log(`Uploaded: ${transferred}/${total} bytes`);
  }
});
```

### Download Files

```typescript
// Download single file
await $.ssh('user@host').download('/remote/file.txt', './local-file.txt');

// Download directory
await $.ssh('user@host').download('/var/log/', './logs/');

// Download with compression
await $.ssh('user@host')`tar czf - /app/`
  .pipe(fs.createWriteStream('backup.tar.gz'));
```

## Port Forwarding

### Local Port Forwarding

```typescript
// Forward local port to remote service
const tunnel = await $.ssh('user@host').forward({
  localPort: 8080,
  remoteHost: 'localhost',
  remotePort: 3000
});

// Access remote service locally
await fetch('http://localhost:8080');

// Close tunnel
await tunnel.close();
```

### Dynamic Port Forwarding (SOCKS)

```typescript
// Create SOCKS proxy
const proxy = await $.ssh('user@host').socks({
  port: 1080
});

// Use proxy for HTTP requests
const agent = new SocksProxyAgent('socks://localhost:1080');
await fetch('http://internal-service', { agent });

await proxy.close();
```

### Reverse Port Forwarding

```typescript
// Expose local service to remote
const tunnel = await $.ssh('user@host').reverseForward({
  remotePort: 8080,
  localHost: 'localhost',
  localPort: 3000
});

// Remote can now access local service
```

## Jump Hosts (Bastion)

### Configuration

```yaml
targets:
  private-server:
    type: ssh
    host: 10.0.1.50  # Private IP
    user: admin
    jumpHost:
      host: bastion.example.com
      user: jump-user
      privateKey: ~/.ssh/bastion_key
```

### Programmatic Jump Host

```typescript
// Connect through bastion
await $.ssh({
  host: '10.0.1.50',
  user: 'admin',
  jumpHost: {
    host: 'bastion.example.com',
    user: 'jump-user',
    privateKey: '~/.ssh/bastion_key'
  }
})`command`;

// Multiple jump hosts
await $.ssh({
  host: 'final-destination',
  jumpHosts: [
    { host: 'jump1.example.com', user: 'user1' },
    { host: 'jump2.example.com', user: 'user2' }
  ]
})`command`;
```

## Performance Characteristics

### Connection Performance

**Based on implementation measurements:**

| Operation | First Time | Pooled | Notes |
|-----------|-----------|---------|-------|
| Connection | 200-500ms | &lt;10ms | Pooled connections ready instantly |
| Authentication | 100-300ms | 0ms | Already authenticated |
| Command Execution | +5-20ms | +5-20ms | Network latency |
| File Transfer | Varies | Varies | Depends on file size and bandwidth |

### Optimization Strategies

1. **Connection Pooling** (automatic):
```typescript
// All commands to same host share connection
for (const cmd of commands) {
  await $.ssh('user@host')`${cmd}`;  // Reuses connection
}
```

2. **Batch Commands**:
```typescript
// Multiple commands in one round-trip
await $.ssh('user@host')`
  cd /app &&
  git pull &&
  npm install &&
  npm run build
`;
```

3. **Parallel Execution**:
```typescript
// Execute on multiple hosts in parallel
const hosts = ['host1', 'host2', 'host3'];
await Promise.all(
  hosts.map(host => $.ssh(`user@${host}`)`uptime`)
);
```

4. **Keep-Alive**:
```yaml
targets:
  long-running:
    type: ssh
    keepaliveInterval: 10000  # Send keep-alive every 10s
    keepaliveCountMax: 3      # Disconnect after 3 failed
```

## Error Handling

### Connection Errors

```typescript
try {
  await $.ssh('user@host')`command`;
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('SSH service not running');
  } else if (error.code === 'ETIMEDOUT') {
    console.error('Connection timeout');
  } else if (error.code === 'EAUTH') {
    console.error('Authentication failed');
  }
}
```

### Automatic Retry

```typescript
// Configure retry behavior
await $.ssh({
  host: 'unreliable.example.com',
  user: 'admin',
  retries: 3,
  retryDelay: 2000,  // 2 seconds between retries
  retryOn: ['ECONNRESET', 'ETIMEDOUT']  // Retry on specific errors
})`command`;
```

## Security Best Practices

### Credential Management

1. **Never hardcode credentials**
2. **Use SSH keys over passwords**
3. **Store keys securely**
4. **Use SSH agent when possible**
5. **Rotate keys regularly**

### Host Verification

```yaml
targets:
  secure:
    type: ssh
    host: server.example.com
    strictHostKeyChecking: true  # Verify host key
    knownHostsFile: ~/.ssh/known_hosts
```

### Secure Configuration

```typescript
// Secure SSH configuration
await $.ssh({
  host: 'secure.example.com',
  user: 'admin',
  privateKey: process.env.SSH_KEY,  // From environment
  passphrase: process.env.SSH_PASSPHRASE,
  strictHostKeyChecking: true,
  algorithms: {
    cipher: ['aes256-gcm', 'aes128-gcm'],
    kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384'],
    serverHostKey: ['ssh-rsa', 'ssh-ed25519']
  }
})`command`;
```

## Troubleshooting

### Debug Mode

```typescript
// Enable SSH debug output
process.env.DEBUG = 'ssh2,xec:ssh:*';

await $.ssh('user@host').debug()`command`;
```

### Common Issues

1. **Connection Refused**: Check SSH service, firewall, port
2. **Authentication Failed**: Verify credentials, key permissions
3. **Timeout**: Check network, increase timeout values
4. **Host Key Verification**: Update known_hosts file

## Related Documentation

- [Connection Configuration](./connection-config.md) - Detailed connection setup
- [Authentication](./authentication.md) - Authentication methods
- [Tunneling](./tunneling.md) - Port forwarding and tunnels
- [Batch Operations](./batch-operations.md) - Multi-host execution
- [SSH Adapter API](../../core/execution-engine/adapters/ssh-adapter.md) - API reference