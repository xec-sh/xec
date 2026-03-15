# SSH Tunnels and Proxies

Comprehensive guide to SSH tunneling, port forwarding, and SOCKS proxy configuration for secure network access.

## Port Forwarding

### Local Port Forwarding
Forward local ports to remote destinations:

```javascript
import { createSSHTunnel } from '@xec-sh/core';

// Basic local port forwarding
const tunnel = await createSSHTunnel({
  ssh: {
    host: 'jump.server.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa'
  },
  localPort: 3306,
  remoteHost: 'database.internal',
  remotePort: 3306
});

// Use the tunnel
const mysql = new MySQLClient({
  host: 'localhost',
  port: 3306
});

// Clean up when done
await tunnel.close();
```

### Dynamic Port Forwarding (SOCKS Proxy)
Create a SOCKS proxy for dynamic forwarding:

```javascript
// Create SOCKS proxy
const socksProxy = await createSSHTunnel({
  ssh: {
    host: 'proxy.server.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa'
  },
  dynamic: true,
  localPort: 1080
});

// Configure applications to use SOCKS proxy at localhost:1080
process.env.https_proxy = 'socks5://localhost:1080';
process.env.http_proxy = 'socks5://localhost:1080';

// Make requests through the proxy
const response = await fetch('https://internal.service.com/api');

await socksProxy.close();
```

### Remote Port Forwarding
Forward remote ports to local services:

```javascript
// Make local service accessible from remote server
const remoteTunnel = await createSSHTunnel({
  ssh: {
    host: 'public.server.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa'
  },
  reverse: true,
  remotePort: 8080,
  localHost: 'localhost',
  localPort: 3000
});

// Now public.server.com:8080 forwards to localhost:3000
console.log('Service accessible at public.server.com:8080');

await remoteTunnel.close();
```

## Multiple Tunnels

### Tunnel Manager
Manage multiple SSH tunnels:

```javascript
class SSHTunnelManager {
  constructor() {
    this.tunnels = new Map();
  }
  
  async createTunnel(name, config) {
    if (this.tunnels.has(name)) {
      throw new Error(`Tunnel ${name} already exists`);
    }
    
    const tunnel = await createSSHTunnel(config);
    this.tunnels.set(name, tunnel);
    
    console.log(`Tunnel ${name} created:`, {
      local: `localhost:${config.localPort}`,
      remote: `${config.remoteHost}:${config.remotePort}`
    });
    
    return tunnel;
  }
  
  async closeTunnel(name) {
    const tunnel = this.tunnels.get(name);
    if (tunnel) {
      await tunnel.close();
      this.tunnels.delete(name);
      console.log(`Tunnel ${name} closed`);
    }
  }
  
  async closeAll() {
    for (const [name, tunnel] of this.tunnels) {
      await tunnel.close();
      console.log(`Closed tunnel: ${name}`);
    }
    this.tunnels.clear();
  }
}

// Usage
const manager = new SSHTunnelManager();

// Create multiple tunnels
await manager.createTunnel('database', {
  ssh: sshConfig,
  localPort: 5432,
  remoteHost: 'db.internal',
  remotePort: 5432
});

await manager.createTunnel('redis', {
  ssh: sshConfig,
  localPort: 6379,
  remoteHost: 'redis.internal',
  remotePort: 6379
});

// Clean up
await manager.closeAll();
```

## Tunnel Through Commands

### Execute Commands with Tunneling
Run commands that use tunneled connections:

```javascript
// Create tunnel and execute command
async function withTunnel(tunnelConfig, callback) {
  const tunnel = await createSSHTunnel(tunnelConfig);
  
  try {
    return await callback(tunnel);
  } finally {
    await tunnel.close();
  }
}

// Use tunnel for database backup
await withTunnel({
  ssh: sshConfig,
  localPort: 5432,
  remoteHost: 'database.internal',
  remotePort: 5432
}, async (tunnel) => {
  // Backup database through tunnel
  await $`pg_dump -h localhost -p 5432 -U user dbname > backup.sql`;
});
```

## Advanced Tunneling

### Multi-Hop Tunnels
Create tunnels through multiple jump hosts:

```javascript
// Tunnel through multiple servers
const multiHopTunnel = await createSSHTunnel({
  ssh: {
    host: 'bastion1.example.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa',
    jumpHost: {
      host: 'bastion2.example.com',
      username: 'jumpuser',
      privateKey: '~/.ssh/jump_key'
    }
  },
  localPort: 3306,
  remoteHost: 'database.private',
  remotePort: 3306
});
```

### Auto-Reconnecting Tunnels
Create self-healing tunnels:

```javascript
class ResilientTunnel {
  constructor(config) {
    this.config = config;
    this.tunnel = null;
    this.reconnectAttempts = 0;
    this.maxReconnects = 5;
  }
  
  async connect() {
    try {
      this.tunnel = await createSSHTunnel(this.config);
      this.reconnectAttempts = 0;
      
      // Monitor tunnel health
      this.startHealthCheck();
      
      return this.tunnel;
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        console.log(`Reconnect attempt ${this.reconnectAttempts}`);
        await new Promise(r => setTimeout(r, 2000 * this.reconnectAttempts));
        return this.connect();
      }
      throw error;
    }
  }
  
  startHealthCheck() {
    this.healthInterval = setInterval(async () => {
      try {
        // Test tunnel connectivity
        await $`nc -zv localhost ${this.config.localPort}`;
      } catch (error) {
        console.log('Tunnel health check failed, reconnecting...');
        await this.reconnect();
      }
    }, 30000); // Check every 30 seconds
  }
  
  async reconnect() {
    if (this.tunnel) {
      await this.tunnel.close().catch(() => {});
    }
    await this.connect();
  }
  
  async close() {
    clearInterval(this.healthInterval);
    if (this.tunnel) {
      await this.tunnel.close();
    }
  }
}
```

## Integration with Applications

### Database Connections
Use tunnels for database access:

```javascript
// PostgreSQL through tunnel
const pgTunnel = await createSSHTunnel({
  ssh: sshConfig,
  localPort: 5432,
  remoteHost: 'postgres.internal',
  remotePort: 5432
});

const { Client } = require('pg');
const pgClient = new Client({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'dbuser',
  password: 'dbpass'
});

await pgClient.connect();
const result = await pgClient.query('SELECT NOW()');
await pgClient.end();
await pgTunnel.close();
```

### HTTP Services
Access internal HTTP services:

```javascript
// Access internal API through tunnel
const apiTunnel = await createSSHTunnel({
  ssh: sshConfig,
  localPort: 8080,
  remoteHost: 'api.internal',
  remotePort: 80
});

// Make API requests
const response = await fetch('http://localhost:8080/api/data');
const data = await response.json();

await apiTunnel.close();
```

## Security Considerations

### Tunnel Authentication
Secure tunnel creation:

```javascript
// Validate tunnel endpoints
async function createSecureTunnel(config) {
  // Validate remote host
  const allowedHosts = ['database.internal', 'api.internal'];
  if (!allowedHosts.includes(config.remoteHost)) {
    throw new Error(`Unauthorized remote host: ${config.remoteHost}`);
  }
  
  // Validate ports
  const allowedPorts = [3306, 5432, 6379, 80, 443];
  if (!allowedPorts.includes(config.remotePort)) {
    throw new Error(`Unauthorized port: ${config.remotePort}`);
  }
  
  // Create tunnel with logging
  console.log(`Creating tunnel to ${config.remoteHost}:${config.remotePort}`);
  return await createSSHTunnel(config);
}
```

### Tunnel Monitoring
Monitor tunnel usage:

```javascript
class TunnelMonitor {
  constructor(tunnel, name) {
    this.tunnel = tunnel;
    this.name = name;
    this.startTime = Date.now();
    this.bytesTransferred = 0;
  }
  
  async monitor() {
    // Monitor network traffic through tunnel
    const interval = setInterval(async () => {
      const stats = await this.getTunnelStats();
      console.log(`Tunnel ${this.name} stats:`, {
        uptime: Date.now() - this.startTime,
        bytesTransferred: stats.bytes,
        connections: stats.connections
      });
    }, 60000); // Every minute
    
    return () => clearInterval(interval);
  }
  
  async getTunnelStats() {
    // Get tunnel statistics
    const result = await $`netstat -an | grep ${this.tunnel.localPort}`;
    const connections = result.stdout.split('\n').length - 1;
    
    return {
      bytes: this.bytesTransferred,
      connections
    };
  }
}
```

## Best Practices

### 1. Always Clean Up Tunnels
```javascript
// Use try-finally to ensure cleanup
const tunnel = await createSSHTunnel(config);
try {
  // Use tunnel
  await doWork();
} finally {
  await tunnel.close();
}
```

### 2. Use Connection Pooling
```javascript
// Reuse tunnels for multiple operations
const tunnelPool = new Map();

function getTunnel(key, config) {
  if (!tunnelPool.has(key)) {
    tunnelPool.set(key, createSSHTunnel(config));
  }
  return tunnelPool.get(key);
}
```

### 3. Handle Tunnel Failures
```javascript
// Graceful degradation
try {
  const tunnel = await createSSHTunnel(config);
  // Use tunnel
} catch (error) {
  console.log('Tunnel failed, trying direct connection');
  // Fallback logic
}
```

## Next Steps

- [SSH Setup](./setup.md) - Basic SSH configuration
- [Authentication](./authentication.md) - SSH authentication methods
- [Batch Operations](./batch-operations.md) - Multi-host execution
- [Connection Management](./connection-mgmt.md) - Connection pooling
- [Port Forwarding](../../core/execution-engine/features/port-forwarding.md) - Advanced port forwarding