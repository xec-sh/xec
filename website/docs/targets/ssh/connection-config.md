---
title: SSH Connection Configuration
description: Detailed SSH connection setup, options, and optimization
keywords: [ssh, connection, configuration, timeout, keepalive]
source_files:
  - packages/core/src/ssh/ssh-client.ts
  - packages/core/src/ssh/connection-pool.ts
  - packages/core/src/ssh/config.ts
key_functions:
  - SSHClient.connect()
  - parseSSHConfig()
  - validateConnection()
verification_date: 2025-08-03
---

# SSH Connection Configuration

## Implementation Reference

**Source Files:**
- `packages/core/src/ssh/ssh-client.ts` - SSH client implementation (lines 25-180)
- `packages/core/src/ssh/connection-pool.ts` - Connection pooling (lines 20-250)
- `packages/core/src/ssh/config.ts` - Configuration parsing
- `packages/core/src/types/ssh.ts` - SSH type definitions

**Key Functions:**
- `SSHClient.connect()` - Establish connection (lines 25-68)
- `parseSSHConfig()` - Parse SSH config file
- `validateConnection()` - Test connection health
- `ConnectionPool.configure()` - Pool configuration

## Connection Options

### Complete Configuration Schema

```typescript
// From packages/core/src/types/ssh.ts
interface SSHConnectionConfig {
  // Required
  host: string;
  user: string;
  
  // Connection
  port?: number;                    // Default: 22
  localAddress?: string;            // Local interface to bind
  localPort?: number;               // Local port to bind
  
  // Authentication (see authentication.md)
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  agent?: boolean | string;         // true, false, or socket path
  
  // Timeouts (in milliseconds)
  connectionTimeout?: number;        // Default: 20000 (20s)
  readyTimeout?: number;            // Default: 20000 (20s)
  
  // Keep-alive
  keepaliveInterval?: number;        // Default: 0 (disabled)
  keepaliveCountMax?: number;        // Default: 3
  
  // Host verification
  strictHostKeyChecking?: boolean;   // Default: false
  hostHash?: 'md5' | 'sha256';      // Default: 'sha256'
  hostVerifier?: (hash: string) => boolean;
  
  // Advanced options
  algorithms?: {
    kex?: string[];                 // Key exchange
    cipher?: string[];              // Encryption
    serverHostKey?: string[];       // Host key types
    hmac?: string[];                // Message authentication
    compress?: string[];            // Compression
  };
  
  // Compression
  compress?: boolean | 'force';      // Default: false
  
  // Environment
  env?: Record<string, string>;      // Remote environment variables
  
  // Retry behavior
  retries?: number;                  // Default: 0
  retryDelay?: number;              // Default: 1000 (1s)
  retryOn?: string[];               // Error codes to retry
  
  // Jump hosts
  jumpHost?: SSHConnectionConfig;    // Single jump host
  jumpHosts?: SSHConnectionConfig[]; // Multiple jump hosts
  
  // Debugging
  debug?: boolean | ((msg: string) => void);
}
```

### Basic Connection

```yaml
# Minimal configuration
targets:
  simple:
    type: ssh
    host: example.com
    user: admin
```

```typescript
// Programmatic
await $.ssh({
  host: 'example.com',
  user: 'admin'
})`command`;
```

### Advanced Connection

```yaml
# Full configuration
targets:
  advanced:
    type: ssh
    host: secure.example.com
    user: deploy
    port: 2222
    
    # Timeouts
    connectionTimeout: 30000  # 30 seconds to connect
    readyTimeout: 10000       # 10 seconds to become ready
    
    # Keep-alive (prevent idle disconnect)
    keepaliveInterval: 10000  # Send keepalive every 10s
    keepaliveCountMax: 3      # Disconnect after 3 failed
    
    # Security
    strictHostKeyChecking: true
    hostHash: sha256
    
    # Performance
    compress: true            # Enable compression
    
    # Retry on failure
    retries: 3
    retryDelay: 2000
```

## Connection Pooling

### Pool Configuration

```typescript
// From connection-pool.ts
interface PoolConfig {
  // Pool sizing
  minConnections: number;      // Minimum idle connections (default: 0)
  maxConnections: number;      // Maximum total connections (default: 10)
  
  // Timeouts
  idleTimeout: number;         // Close idle connections after (default: 300000)
  acquisitionTimeout: number;  // Max wait to acquire (default: 30000)
  
  // Connection testing
  testOnBorrow: boolean;       // Test before providing (default: true)
  testOnReturn: boolean;       // Test when returned (default: false)
  testWhileIdle: boolean;      // Test idle connections (default: true)
  testInterval: number;        // Test interval in ms (default: 30000)
  
  // Behavior
  fifo: boolean;              // First-in-first-out (default: true)
  priorityRange: number;      // Priority levels (default: 1)
  autostart: boolean;         // Start on creation (default: true)
  
  // Eviction
  evictionRunInterval: number; // Run eviction every (default: 60000)
  numTestsPerEviction: number; // Connections to test (default: 3)
  softIdleTimeout: number;     // Soft eviction timeout (default: -1)
}
```

### Global Pool Settings

```yaml
# .xec/config.yaml
connectionPool:
  ssh:
    minConnections: 1
    maxConnections: 20
    idleTimeout: 600000      # 10 minutes
    testOnBorrow: true
    testInterval: 30000       # Test every 30s
```

### Per-Target Pool Settings

```yaml
targets:
  high-traffic:
    type: ssh
    host: busy.example.com
    pool:
      minConnections: 5       # Keep 5 connections ready
      maxConnections: 50      # Allow up to 50
      idleTimeout: 3600000    # Keep idle for 1 hour
```

### Pool Behavior

```typescript
// Connection acquisition flow
async function acquireConnection(target: string) {
  // 1. Check for idle connection
  if (pool.idle.length > 0) {
    const conn = pool.idle.pop();
    
    // 2. Test if configured
    if (config.testOnBorrow) {
      if (!await testConnection(conn)) {
        conn.destroy();
        return acquireConnection(target);  // Retry
      }
    }
    
    return conn;
  }
  
  // 3. Create new if under max
  if (pool.size < config.maxConnections) {
    return createConnection(target);
  }
  
  // 4. Wait for available connection
  return waitForConnection(config.acquisitionTimeout);
}
```

## Timeout Configuration

### Connection Timeouts

```typescript
// Different timeout stages
const timeouts = {
  // DNS resolution timeout
  lookupTimeout: 5000,
  
  // TCP connection timeout
  connectionTimeout: 20000,
  
  // SSH handshake timeout
  readyTimeout: 20000,
  
  // Command execution timeout
  execTimeout: 30000,
  
  // Overall session timeout
  sessionTimeout: 3600000  // 1 hour
};
```

### Configuring Timeouts

```yaml
targets:
  slow-network:
    type: ssh
    host: remote.example.com
    
    # Increase timeouts for slow networks
    connectionTimeout: 60000  # 1 minute
    readyTimeout: 30000       # 30 seconds
    
    # Command-specific timeout
    commandTimeout: 120000    # 2 minutes default
```

```typescript
// Per-command timeout override
await $.ssh('user@host')
  .timeout(300000)  // 5 minutes for this command
  `long-running-backup`;
```

## Keep-Alive Configuration

### Preventing Idle Disconnects

```yaml
targets:
  long-session:
    type: ssh
    host: server.example.com
    
    # Keep connection alive
    keepaliveInterval: 15000  # Every 15 seconds
    keepaliveCountMax: 4      # Fail after 4 missed
    
    # Total idle tolerance: 60 seconds
```

### TCP Keep-Alive

```typescript
// Low-level TCP keep-alive
await $.ssh({
  host: 'server.example.com',
  user: 'admin',
  
  // SSH keep-alive
  keepaliveInterval: 10000,
  
  // TCP keep-alive (OS level)
  socketOptions: {
    keepAlive: true,
    keepAliveInitialDelay: 60000  // Start after 1 minute
  }
})`command`;
```

## Compression

### When to Use Compression

```yaml
# Enable for slow networks, large text transfers
targets:
  slow-link:
    type: ssh
    host: remote.example.com
    compress: true  # Enable compression
    
  fast-local:
    type: ssh
    host: 192.168.1.10
    compress: false  # Disable for fast networks
```

### Compression Algorithms

```typescript
await $.ssh({
  host: 'server.example.com',
  user: 'admin',
  compress: true,
  algorithms: {
    compress: ['zlib@openssh.com', 'zlib', 'none']
  }
})`command`;
```

## Security Algorithms

### Cipher Configuration

```yaml
targets:
  secure:
    type: ssh
    host: secure.example.com
    algorithms:
      # Encryption ciphers (order of preference)
      cipher:
        - aes256-gcm@openssh.com
        - aes128-gcm@openssh.com
        - aes256-ctr
        
      # Key exchange
      kex:
        - ecdh-sha2-nistp521
        - ecdh-sha2-nistp384
        - ecdh-sha2-nistp256
        
      # Host key algorithms
      serverHostKey:
        - ssh-ed25519
        - ssh-rsa
        
      # Message authentication
      hmac:
        - hmac-sha2-512
        - hmac-sha2-256
```

### Algorithm Selection

```typescript
// Force specific algorithms
await $.ssh({
  host: 'legacy.example.com',
  user: 'admin',
  algorithms: {
    // For older servers
    cipher: ['aes128-cbc', '3des-cbc'],
    kex: ['diffie-hellman-group14-sha1'],
    serverHostKey: ['ssh-rsa', 'ssh-dss']
  }
})`command`;
```

## Host Key Verification

### Strict Host Checking

```yaml
targets:
  production:
    type: ssh
    host: prod.example.com
    strictHostKeyChecking: true
    knownHostsFile: ~/.ssh/known_hosts
```

### Custom Host Verification

```typescript
await $.ssh({
  host: 'server.example.com',
  user: 'admin',
  hostVerifier: (hostkey) => {
    // Custom verification logic
    const knownKeys = loadKnownKeys();
    return knownKeys.includes(hostkey);
  }
})`command`;
```

### Host Key Formats

```typescript
// Different hash formats
await $.ssh({
  host: 'server.example.com',
  hostHash: 'sha256',  // or 'md5' for legacy
  onHostKey: (key) => {
    console.log(`Host key: ${key}`);
    // SHA256:base64...
  }
})`command`;
```

## Connection Profiles

### Environment-Based Profiles

```yaml
# Production profile
profiles:
  production:
    ssh:
      strictHostKeyChecking: true
      connectionTimeout: 30000
      keepaliveInterval: 10000
      compress: true
      algorithms:
        cipher: [aes256-gcm@openssh.com]
        
# Development profile
profiles:
  development:
    ssh:
      strictHostKeyChecking: false
      connectionTimeout: 10000
      compress: false
```

### Connection Templates

```typescript
// Base configuration
const baseSSHConfig = {
  keepaliveInterval: 10000,
  compress: true,
  algorithms: {
    cipher: ['aes256-gcm@openssh.com']
  }
};

// Environment-specific
const prodConfig = {
  ...baseSSHConfig,
  strictHostKeyChecking: true,
  retries: 3
};

const devConfig = {
  ...baseSSHConfig,
  strictHostKeyChecking: false,
  debug: true
};
```

## Connection Monitoring

### Health Checks

```typescript
// Test connection health
async function healthCheck(connection: SSHClient): Promise<boolean> {
  try {
    const result = await connection.exec('echo test', { timeout: 5000 });
    return result.stdout.trim() === 'test';
  } catch {
    return false;
  }
}

// Monitor pool health
setInterval(async () => {
  const stats = pool.getStats();
  console.log(`Pool: ${stats.idle} idle, ${stats.busy} busy, ${stats.pending} pending`);
  
  // Test idle connections
  for (const conn of pool.idle) {
    if (!await healthCheck(conn)) {
      pool.destroy(conn);
    }
  }
}, 30000);
```

### Connection Metrics

```typescript
// Track connection metrics
const metrics = {
  connectionsCreated: 0,
  connectionsFailed: 0,
  commandsExecuted: 0,
  averageLatency: 0,
  poolHitRate: 0
};

// Hook into connection events
pool.on('create', () => metrics.connectionsCreated++);
pool.on('destroy', () => metrics.connectionsFailed++);
pool.on('acquire', () => metrics.poolHitRate = pool.idle / pool.size);
```

## Troubleshooting

### Debug Logging

```typescript
// Enable detailed SSH debug
process.env.DEBUG = 'ssh2,xec:ssh:*';

await $.ssh({
  host: 'server.example.com',
  debug: (msg) => console.log(`SSH: ${msg}`)
})`command`;
```

### Common Configuration Issues

1. **Connection Timeout**: Increase `connectionTimeout`
2. **Idle Disconnect**: Configure `keepaliveInterval`
3. **Pool Exhaustion**: Increase `maxConnections`
4. **Slow Commands**: Adjust `execTimeout`
5. **Algorithm Mismatch**: Check server supported algorithms

## Best Practices

1. **Use connection pooling** for multiple commands
2. **Configure appropriate timeouts** for network conditions
3. **Enable keep-alive** for long-running sessions
4. **Use compression** for slow networks
5. **Verify host keys** in production
6. **Monitor pool health** in production
7. **Set reasonable pool limits** to avoid resource exhaustion

## Related Documentation

- [SSH Overview](./overview.md) - SSH target fundamentals
- [Authentication](./authentication.md) - Authentication methods
- [Tunneling](./tunneling.md) - Port forwarding configuration
- [Batch Operations](./batch-operations.md) - Multi-host operations