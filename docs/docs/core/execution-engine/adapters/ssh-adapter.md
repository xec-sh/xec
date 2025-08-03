# SSH Adapter

The SSH adapter enables command execution on remote hosts through secure shell connections with advanced features like connection pooling and tunneling.

## Overview

The SSH adapter (`packages/core/src/adapters/ssh-adapter.ts`) provides seamless remote command execution with enterprise-grade features:

- **Connection pooling** for performance optimization
- **Automatic reconnection** with configurable retry logic
- **SSH tunneling** and port forwarding
- **Key-based and password authentication**
- **File transfer** operations (upload/download)
- **Stream handling** for real-time output

## Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Basic SSH connection
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  privateKey: '~/.ssh/id_rsa'
});

// Execute commands
const result = await remote`ls -la /var/log`;
console.log(result.stdout);

// With password authentication
const passwordRemote = $.ssh({
  host: '192.168.1.100',
  username: 'admin',
  password: 'secure-password',
  port: 2222
});
```

## Connection Configuration

### Authentication Methods

```typescript
// Key-based authentication
const keyAuth = $.ssh({
  host: 'server.com',
  username: 'deploy',
  privateKey: '/path/to/key',
  passphrase: 'key-passphrase' // Optional
});

// Password authentication
const passwordAuth = $.ssh({
  host: 'server.com',
  username: 'admin',
  password: process.env.SSH_PASSWORD
});

// SSH agent authentication
const agentAuth = $.ssh({
  host: 'server.com',
  username: 'user',
  agent: process.env.SSH_AUTH_SOCK
});
```

### Connection Options

```typescript
const connection = $.ssh({
  // Required
  host: 'server.com',
  username: 'user',
  
  // Authentication (one required)
  privateKey: '/path/to/key',
  password: 'password',
  agent: '/path/to/agent.sock',
  
  // Optional
  port: 22,
  passphrase: 'key-passphrase',
  readyTimeout: 20000,
  keepaliveInterval: 10000,
  keepaliveCountMax: 3,
  
  // Advanced
  algorithms: {
    kex: ['ecdh-sha2-nistp256'],
    cipher: ['aes128-gcm'],
    serverHostKey: ['ssh-rsa'],
    hmac: ['hmac-sha2-256']
  }
});
```

## Connection Pooling

The SSH adapter automatically manages connection pooling for optimal performance:

```typescript
// Connection pooling is automatic
const remote = $.ssh({ host: 'server.com', username: 'user' });

// Multiple commands reuse the same connection
await remote`uptime`;
await remote`free -h`;
await remote`df -h`;

// Explicit pool management
await remote.connect(); // Pre-establish connection
await remote.disconnect(); // Close connection
```

### Pool Configuration

```typescript
// Configure pool behavior
const pooledConnection = $.ssh({
  host: 'server.com',
  username: 'user',
  privateKey: '~/.ssh/id_rsa',
  
  // Pool settings
  poolSize: 5,              // Max connections in pool
  poolTimeout: 60000,       // Connection idle timeout
  connectionRetries: 3,     // Retry attempts
  connectionRetryDelay: 1000 // Delay between retries
});
```

## File Operations

### Upload Files

```typescript
const remote = $.ssh({ host: 'server.com', username: 'user' });

// Upload single file
await remote.uploadFile('/local/path/file.txt', '/remote/path/file.txt');

// Upload directory
await remote.uploadDirectory('/local/dir', '/remote/dir');

// Upload with progress
await remote.uploadFile('/large/file.zip', '/remote/file.zip', {
  onProgress: (progress) => {
    console.log(`Uploaded: ${progress.transferred}/${progress.total}`);
  }
});
```

### Download Files

```typescript
// Download single file
await remote.downloadFile('/remote/file.txt', '/local/file.txt');

// Download directory
await remote.downloadDirectory('/remote/dir', '/local/dir');

// Download with filtering
await remote.downloadDirectory('/remote/logs', '/local/logs', {
  filter: (file) => file.endsWith('.log')
});
```

## SSH Tunneling

### Port Forwarding

```typescript
const remote = $.ssh({ host: 'jump.server.com', username: 'user' });

// Local port forwarding
const tunnel = await remote.forward({
  localPort: 3000,
  remoteHost: 'internal.service.com',
  remotePort: 80
});

// Access internal service through localhost:3000
const response = await fetch('http://localhost:3000');

// Close tunnel when done
await tunnel.close();
```

### Dynamic Tunneling

```typescript
// Create SOCKS proxy
const socksProxy = await remote.dynamicForward({
  localPort: 1080
});

// Use with HTTP client
const agent = new SocksProxyAgent('socks://localhost:1080');
const response = await fetch('http://internal.site', { agent });

await socksProxy.close();
```

## Advanced Features

### Command Execution Options

```typescript
const remote = $.ssh({ host: 'server.com', username: 'user' });

// With working directory
const result = await remote.cwd('/var/www')`git pull`;

// With environment variables
const withEnv = await remote.env({
  NODE_ENV: 'production',
  PORT: '3000'
})`npm start`;

// With timeout
const timedOut = await remote.timeout(5000)`long-running-command`;

// With sudo
const sudoResult = await remote`sudo systemctl restart nginx`;
```

### Stream Handling

```typescript
// Real-time output streaming
const remote = $.ssh({ host: 'server.com', username: 'user' });

await remote`tail -f /var/log/app.log`
  .stdout((line) => console.log('LOG:', line))
  .stderr((line) => console.error('ERROR:', line));

// Pipe between commands
const compressed = await remote`tar czf - /data`
  .pipe(remote`ssh backup.server "cat > backup.tar.gz"`);
```

### Error Handling

```typescript
const remote = $.ssh({ host: 'server.com', username: 'user' });

try {
  const result = await remote`command-that-might-fail`;
  if (result.exitCode !== 0) {
    console.error('Command failed:', result.stderr);
  }
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('SSH connection refused');
  } else if (error.code === 'AUTHENTICATION_FAILED') {
    console.error('SSH authentication failed');
  }
}

// With retry logic
const withRetry = await remote.retry(3)`flaky-command`;
```

## Performance Optimization

### Batch Operations

```typescript
// Execute multiple commands efficiently
const remote = $.ssh({ host: 'server.com', username: 'user' });

// Single SSH session for multiple commands
const results = await remote.batch([
  'uptime',
  'free -h',
  'df -h',
  'ps aux | head -10'
]);

results.forEach((result, index) => {
  console.log(`Command ${index}:`, result.stdout);
});
```

### Connection Reuse

```typescript
// Reuse connections across multiple operations
const pool = $.ssh.pool({
  maxConnections: 10,
  idleTimeout: 60000
});

const servers = ['server1.com', 'server2.com', 'server3.com'];

// Parallel execution with connection reuse
await Promise.all(servers.map(async (host) => {
  const remote = pool.connect({ host, username: 'user' });
  return remote`uptime`;
}));

// Clean up pool
await pool.closeAll();
```

## Security Considerations

### Host Key Verification

```typescript
const remote = $.ssh({
  host: 'server.com',
  username: 'user',
  
  // Strict host key checking
  strictHostKeyChecking: true,
  knownHostsFile: '~/.ssh/known_hosts',
  
  // Host key validation
  hostVerifier: (hostkey) => {
    // Custom verification logic
    return isValidHostKey(hostkey);
  }
});
```

### Credential Management

```typescript
// Use environment variables
const remote = $.ssh({
  host: process.env.SSH_HOST,
  username: process.env.SSH_USER,
  privateKey: process.env.SSH_KEY_PATH,
  passphrase: process.env.SSH_KEY_PASSPHRASE
});

// Use credential manager
const credentials = await getCredentialsFromVault('ssh/production');
const secure = $.ssh(credentials);
```

## Implementation Details

The SSH adapter is implemented in:
- `packages/core/src/adapters/ssh-adapter.ts` - Main adapter implementation
- `packages/core/src/ssh/connection-pool.ts` - Connection pooling logic
- `packages/core/src/ssh/port-forwarding.ts` - Tunneling functionality
- `packages/core/src/ssh/sftp-client.ts` - File transfer operations

## See Also

- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Port Forwarding](/docs/core/execution-engine/features/port-forwarding)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
- [SSH Environment Setup](/docs/environments/ssh/setup)