# Port Forwarding

Port forwarding enables secure access to remote services through SSH tunnels and Kubernetes port forwarding, making remote resources accessible as if they were local.

## Overview

Port forwarding (`packages/core/src/ssh/port-forwarding.ts`, `packages/core/src/k8s/port-forward.ts`) provides:

- **SSH tunneling** with local, remote, and dynamic forwarding
- **Kubernetes port forwarding** for pods and services
- **Multiple simultaneous forwards** management
- **Automatic reconnection** on failure
- **SOCKS proxy** support
- **Connection multiplexing** for efficiency

## SSH Port Forwarding

### Local Port Forwarding

```typescript
import { $ } from '@xec-sh/core';

// Forward local port to remote service
const remote = $.ssh({ host: 'jump.server.com', username: 'user' });

const tunnel = await remote.forward({
  type: 'local',
  localPort: 3306,
  remoteHost: 'database.internal',
  remotePort: 3306
});

// Now connect to database through localhost:3306
const db = await mysql.connect({
  host: 'localhost',
  port: 3306,
  user: 'dbuser',
  password: 'dbpass'
});

// Close tunnel when done
await tunnel.close();
```

### Remote Port Forwarding

```typescript
// Make local service available on remote server
const tunnel = await remote.forward({
  type: 'remote',
  remotePort: 8080,
  localHost: 'localhost',
  localPort: 3000
});

// Remote users can now access your local:3000 via remote:8080
console.log('Local service exposed on remote:8080');

// Close when done
await tunnel.close();
```

### Dynamic Port Forwarding (SOCKS)

```typescript
// Create SOCKS proxy
const proxy = await remote.forward({
  type: 'dynamic',
  localPort: 1080
});

// Use SOCKS proxy for HTTP requests
const agent = new SocksProxyAgent('socks://localhost:1080');
const response = await fetch('http://internal-service.com', { agent });

// Or configure system-wide
process.env.ALL_PROXY = 'socks://localhost:1080';
```

## Kubernetes Port Forwarding

### Pod Port Forwarding

```typescript
// Forward pod port
const forward = await $.k8s.portForward({
  pod: 'database-pod',
  namespace: 'production',
  localPort: 5432,
  remotePort: 5432
});

// Connect to database
const client = new pg.Client({
  host: 'localhost',
  port: 5432
});
await client.connect();

// Close forwarding
await forward.close();
```

### Service Port Forwarding

```typescript
// Forward service port
const forward = await $.k8s.portForward({
  service: 'web-service',
  namespace: 'production',
  localPort: 8080,
  remotePort: 80
});

// Access service
const response = await fetch('http://localhost:8080/api');

// Auto-close after use
await forward.use(async () => {
  // Forward is active here
  await fetch('http://localhost:8080/api');
}); // Automatically closed after callback
```

## Multiple Port Forwarding

### Batch Forwarding

```typescript
// Forward multiple ports at once
const forwards = await remote.forwardMultiple([
  { localPort: 3306, remoteHost: 'mysql.internal', remotePort: 3306 },
  { localPort: 6379, remoteHost: 'redis.internal', remotePort: 6379 },
  { localPort: 5432, remoteHost: 'postgres.internal', remotePort: 5432 }
]);

// Use all services
await connectToAllDatabases();

// Close all forwards
await forwards.closeAll();
```

### Kubernetes Multi-Port

```typescript
// Forward multiple ports from same pod
const multiForward = await $.k8s.portForward({
  pod: 'monitoring-stack',
  namespace: 'monitoring',
  forwards: [
    { local: 3000, remote: 3000 },  // Grafana
    { local: 9090, remote: 9090 },  // Prometheus
    { local: 9093, remote: 9093 }   // Alertmanager
  ]
});

// Access all services
await Promise.all([
  fetch('http://localhost:3000'),  // Grafana
  fetch('http://localhost:9090'),  // Prometheus
  fetch('http://localhost:9093')   // Alertmanager
]);
```

## Advanced Tunneling

### Jump Host Chains

```typescript
// Multi-hop SSH tunneling
const jump1 = $.ssh({ host: 'jump1.example.com', username: 'user' });
const jump2 = $.ssh({ 
  host: 'jump2.internal',
  username: 'user',
  proxy: jump1  // Use jump1 as proxy
});

// Forward through multiple hops
const tunnel = await jump2.forward({
  localPort: 8080,
  remoteHost: 'final-destination.internal',
  remotePort: 80
});
```

### SSH Tunnel Options

```typescript
// Configure tunnel behavior
const tunnel = await remote.forward({
  localPort: 3000,
  remoteHost: 'service.internal',
  remotePort: 80,
  
  // Advanced options
  localInterface: '127.0.0.1',    // Bind to specific interface
  gatewayPorts: true,              // Allow external connections
  exitOnFailure: false,            // Don't exit on forward failure
  serverAliveInterval: 30,         // Keepalive interval
  serverAliveCountMax: 3,          // Keepalive attempts
  compression: true                // Enable compression
});
```

## Auto-Reconnection

### Persistent Tunnels

```typescript
// Create persistent tunnel with auto-reconnect
class PersistentTunnel {
  private tunnel: any;
  private config: any;
  private reconnecting = false;
  
  constructor(config: any) {
    this.config = config;
  }
  
  async connect() {
    try {
      this.tunnel = await $.ssh(this.config.ssh).forward(this.config.forward);
      
      this.tunnel.on('close', () => {
        if (!this.reconnecting) {
          this.reconnect();
        }
      });
    } catch (error) {
      console.error('Tunnel failed:', error);
      setTimeout(() => this.reconnect(), 5000);
    }
  }
  
  async reconnect() {
    this.reconnecting = true;
    console.log('Reconnecting tunnel...');
    await this.connect();
    this.reconnecting = false;
  }
  
  async close() {
    if (this.tunnel) {
      await this.tunnel.close();
    }
  }
}

// Usage
const persistent = new PersistentTunnel({
  ssh: { host: 'server.com', username: 'user' },
  forward: { localPort: 3306, remoteHost: 'db.internal', remotePort: 3306 }
});
await persistent.connect();
```

### Health Monitoring

```typescript
// Monitor tunnel health
const tunnel = await remote.forward({
  localPort: 8080,
  remoteHost: 'service.internal',
  remotePort: 80
});

tunnel.on('ready', () => {
  console.log('Tunnel established');
});

tunnel.on('error', (error) => {
  console.error('Tunnel error:', error);
});

tunnel.on('close', () => {
  console.log('Tunnel closed');
});

// Health check
const isHealthy = await tunnel.healthCheck();
if (!isHealthy) {
  await tunnel.reconnect();
}
```

## Use Cases

### Database Access

```typescript
// Access remote database through tunnel
async function accessRemoteDB() {
  const tunnel = await $.ssh({
    host: 'bastion.example.com',
    username: 'deploy'
  }).forward({
    localPort: 5432,
    remoteHost: 'postgres.private.vpc',
    remotePort: 5432
  });
  
  try {
    const client = new pg.Client({
      host: 'localhost',
      port: 5432,
      database: 'production'
    });
    
    await client.connect();
    const result = await client.query('SELECT * FROM users');
    await client.end();
    
    return result.rows;
  } finally {
    await tunnel.close();
  }
}
```

### Development Environment

```typescript
// Forward all development services
async function setupDevEnvironment() {
  const remote = $.ssh({ host: 'dev.server.com', username: 'developer' });
  
  const services = await remote.forwardMultiple([
    { name: 'API', localPort: 3000, remoteHost: 'api.dev', remotePort: 3000 },
    { name: 'Database', localPort: 5432, remoteHost: 'db.dev', remotePort: 5432 },
    { name: 'Redis', localPort: 6379, remoteHost: 'redis.dev', remotePort: 6379 },
    { name: 'Elasticsearch', localPort: 9200, remoteHost: 'es.dev', remotePort: 9200 }
  ]);
  
  console.log('Development services available:');
  console.log('- API: http://localhost:3000');
  console.log('- Database: postgres://localhost:5432');
  console.log('- Redis: redis://localhost:6379');
  console.log('- Elasticsearch: http://localhost:9200');
  
  // Keep alive until interrupted
  process.on('SIGINT', async () => {
    await services.closeAll();
    process.exit(0);
  });
}
```

### Debugging Remote Services

```typescript
// Debug remote Kubernetes pod
async function debugPod(podName: string, namespace: string) {
  // Forward multiple debug ports
  const debug = await $.k8s.portForward({
    pod: podName,
    namespace,
    forwards: [
      { local: 9229, remote: 9229 },    // Node.js debugger
      { local: 3000, remote: 3000 },    // Application
      { local: 9090, remote: 9090 }     // Metrics
    ]
  });
  
  console.log('Debug ports forwarded:');
  console.log('- Debugger: chrome://inspect');
  console.log('- Application: http://localhost:3000');
  console.log('- Metrics: http://localhost:9090/metrics');
  
  // Attach debugger
  const inspector = require('inspector');
  inspector.open(9229, 'localhost', false);
  
  return debug;
}
```

## Security Considerations

### Binding Restrictions

```typescript
// Secure local binding (localhost only)
const secure = await remote.forward({
  localPort: 3306,
  localInterface: '127.0.0.1',  // Only localhost
  remoteHost: 'database.internal',
  remotePort: 3306
});

// Allow external connections (less secure)
const public = await remote.forward({
  localPort: 8080,
  localInterface: '0.0.0.0',    // All interfaces
  gatewayPorts: true,
  remoteHost: 'web.internal',
  remotePort: 80
});
```

### Authentication

```typescript
// Use SSH key authentication
const authenticated = $.ssh({
  host: 'secure.server.com',
  username: 'user',
  privateKey: '~/.ssh/id_rsa',
  passphrase: process.env.SSH_KEY_PASSPHRASE
});

const tunnel = await authenticated.forward({
  localPort: 443,
  remoteHost: 'secure-service.internal',
  remotePort: 443
});
```

### Tunnel Access Control

```typescript
// Implement access control for tunnels
class SecureTunnel {
  private allowedIPs = new Set(['127.0.0.1']);
  private tunnel: any;
  
  async create(config: any) {
    this.tunnel = await $.ssh(config.ssh).forward(config.forward);
    
    // Add access control
    const server = net.createServer((client) => {
      const clientIP = client.remoteAddress;
      
      if (!this.allowedIPs.has(clientIP)) {
        console.log(`Rejected connection from ${clientIP}`);
        client.destroy();
        return;
      }
      
      // Forward to tunnel
      const tunnel = net.connect(config.forward.localPort, '127.0.0.1');
      client.pipe(tunnel).pipe(client);
    });
    
    server.listen(config.forward.localPort + 1);
  }
}
```

## Performance Optimization

### Connection Multiplexing

```typescript
// Reuse SSH connection for multiple tunnels
const connection = $.ssh({
  host: 'server.com',
  username: 'user',
  controlMaster: true,           // Enable multiplexing
  controlPath: '~/.ssh/cm_%r@%h:%p',
  controlPersist: '10m'          // Keep alive for 10 minutes
});

// Multiple tunnels share the connection
const tunnels = await Promise.all([
  connection.forward({ localPort: 3306, remoteHost: 'db1', remotePort: 3306 }),
  connection.forward({ localPort: 3307, remoteHost: 'db2', remotePort: 3306 }),
  connection.forward({ localPort: 3308, remoteHost: 'db3', remotePort: 3306 })
]);
```

### Compression

```typescript
// Enable compression for tunnel traffic
const compressed = await remote.forward({
  localPort: 8080,
  remoteHost: 'service',
  remotePort: 80,
  compression: true,
  compressionLevel: 6  // 1-9, higher = better compression
});
```

## Error Handling

### Tunnel Failures

```typescript
// Handle tunnel failures gracefully
try {
  const tunnel = await remote.forward({
    localPort: 3000,
    remoteHost: 'service',
    remotePort: 80
  });
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} already in use`);
    // Try alternative port
  } else if (error.code === 'ECONNREFUSED') {
    console.error('Remote service not available');
    // Implement retry logic
  } else if (error.code === 'EPERM') {
    console.error('Permission denied for port binding');
    // Use higher port number
  }
}
```

### Recovery Strategies

```typescript
// Automatic port selection on conflict
async function forwardWithAutoPort(config: any) {
  let port = config.localPort;
  const maxAttempts = 10;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await remote.forward({
        ...config,
        localPort: port + i
      });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }
  
  throw new Error('No available ports found');
}
```

## Best Practices

### Do's ✅

```typescript
// ✅ Close tunnels when done
const tunnel = await remote.forward(config);
try {
  await useService();
} finally {
  await tunnel.close();
}

// ✅ Use specific interfaces
await remote.forward({
  localInterface: '127.0.0.1',  // Secure
  localPort: 3306,
  remoteHost: 'db',
  remotePort: 3306
});

// ✅ Handle connection failures
tunnel.on('error', (error) => {
  console.error('Tunnel error:', error);
  // Implement recovery
});

// ✅ Monitor tunnel health
setInterval(async () => {
  if (!await tunnel.isAlive()) {
    await tunnel.reconnect();
  }
}, 30000);
```

### Don'ts ❌

```typescript
// ❌ Leave tunnels open
await remote.forward(config);
// Tunnel never closed

// ❌ Bind to all interfaces without need
await remote.forward({
  localInterface: '0.0.0.0',  // Insecure
  localPort: 3306
});

// ❌ Ignore port conflicts
await remote.forward({ localPort: 80 });  // May fail

// ❌ Create excessive tunnels
for (let i = 0; i < 1000; i++) {
  await remote.forward({ localPort: 3000 + i });
}
```

## Implementation Details

Port forwarding is implemented in:
- `packages/core/src/ssh/port-forwarding.ts` - SSH tunnel implementation
- `packages/core/src/k8s/port-forward.ts` - Kubernetes port forwarding
- `packages/core/src/utils/tunnel-manager.ts` - Tunnel lifecycle management
- `packages/core/src/utils/socks-proxy.ts` - SOCKS proxy support

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
