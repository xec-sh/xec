---
title: SSH Tunneling and Port Forwarding
description: SSH tunnels, port forwarding, SOCKS proxies, and jump hosts
keywords: [ssh, tunnel, port-forwarding, socks, proxy, bastion, jump-host]
source_files:
  - packages/core/src/ssh/port-forwarding.ts
  - packages/core/src/ssh/tunnel.ts
  - packages/core/src/ssh/jump-host.ts
key_functions:
  - createTunnel()
  - forwardPort()
  - createSOCKSProxy()
  - connectViaJumpHost()
verification_date: 2025-08-03
---

# SSH Tunneling and Port Forwarding

## Implementation Reference

**Source Files:**
- `packages/core/src/ssh/port-forwarding.ts` - Port forwarding implementation
- `packages/core/src/ssh/tunnel.ts` - Tunnel management
- `packages/core/src/ssh/jump-host.ts` - Jump host connections
- `packages/core/src/ssh/socks.ts` - SOCKS proxy implementation

**Key Functions:**
- `createTunnel()` - Create SSH tunnel (lines 15-85)
- `forwardPort()` - Port forwarding setup (lines 90-145)
- `createSOCKSProxy()` - SOCKS proxy creation (lines 20-75)
- `connectViaJumpHost()` - Jump host connection (lines 30-95)

## Local Port Forwarding

### Basic Local Forwarding

Forward a local port to a remote service:

```typescript
// Forward local:8080 → remote:3000
const tunnel = await $.ssh('user@host').forward({
  localPort: 8080,
  remoteHost: 'localhost',
  remotePort: 3000
});

// Access remote service locally
const response = await fetch('http://localhost:8080');

// Close tunnel when done
await tunnel.close();
```

### Configuration

```yaml
targets:
  database-tunnel:
    type: ssh
    host: db.example.com
    user: admin
    tunnels:
      - type: local
        localPort: 5432
        remoteHost: localhost
        remotePort: 5432
        description: PostgreSQL tunnel
```

### Advanced Local Forwarding

```typescript
// Forward to different remote host
const tunnel = await $.ssh('user@bastion').forward({
  localHost: '127.0.0.1',     // Bind address (default: 127.0.0.1)
  localPort: 3306,            // Local port
  remoteHost: 'db.internal',  // Remote destination
  remotePort: 3306            // Remote port
});

// Multiple tunnels
const tunnels = await Promise.all([
  $.ssh('user@host').forward({ localPort: 8080, remotePort: 80 }),
  $.ssh('user@host').forward({ localPort: 8443, remotePort: 443 }),
  $.ssh('user@host').forward({ localPort: 3306, remotePort: 3306 })
]);

// Dynamic local port
const tunnel = await $.ssh('user@host').forward({
  localPort: 0,  // Use any available port
  remotePort: 3000
});
console.log(`Tunnel on port: ${tunnel.localPort}`);
```

### Use Cases

```typescript
// 1. Database access
const dbTunnel = await $.ssh('user@dbserver').forward({
  localPort: 5432,
  remoteHost: 'localhost',
  remotePort: 5432
});

// Connect to database via tunnel
const db = new Client({
  host: 'localhost',
  port: 5432,
  database: 'production'
});

// 2. Web service access
const webTunnel = await $.ssh('user@webserver').forward({
  localPort: 8080,
  remoteHost: 'internal-api',
  remotePort: 80
});

// Access internal API
const api = axios.create({
  baseURL: 'http://localhost:8080'
});

// 3. Redis access
const redisTunnel = await $.ssh('user@redis').forward({
  localPort: 6379,
  remotePort: 6379
});

const redis = new Redis({
  host: 'localhost',
  port: 6379
});
```

## Remote Port Forwarding

### Basic Remote Forwarding

Expose local service to remote server:

```typescript
// Make local:3000 available as remote:8080
const tunnel = await $.ssh('user@host').reverseForward({
  remotePort: 8080,
  localHost: 'localhost',
  localPort: 3000
});

// Remote server can now access your local service
// http://localhost:8080 on remote → http://localhost:3000 locally
```

### Configuration

```yaml
targets:
  expose-local:
    type: ssh
    host: public.example.com
    tunnels:
      - type: remote
        remotePort: 8080
        localHost: localhost
        localPort: 3000
        description: Expose local dev server
```

### Advanced Remote Forwarding

```typescript
// Bind to specific interface on remote
const tunnel = await $.ssh('user@host').reverseForward({
  remoteHost: '0.0.0.0',  // Bind to all interfaces
  remotePort: 8080,
  localHost: 'localhost',
  localPort: 3000
});

// Multiple services
const tunnels = [
  { remotePort: 8080, localPort: 3000 },  // Web app
  { remotePort: 8081, localPort: 3001 },  // API
  { remotePort: 8082, localPort: 3002 }   // Admin panel
];

for (const config of tunnels) {
  await $.ssh('user@host').reverseForward(config);
}
```

### Use Cases

```typescript
// 1. Share local development server
const devTunnel = await $.ssh('user@staging').reverseForward({
  remotePort: 8080,
  localPort: 3000
});
console.log('Dev server available at: http://staging.example.com:8080');

// 2. Webhook testing
const webhookTunnel = await $.ssh('user@public').reverseForward({
  remoteHost: '0.0.0.0',
  remotePort: 9000,
  localPort: 4000
});
// Register http://public.example.com:9000 as webhook URL

// 3. Remote debugging
const debugTunnel = await $.ssh('user@remote').reverseForward({
  remotePort: 9229,
  localPort: 9229
});
// Attach debugger to remote:9229
```

## Dynamic Port Forwarding (SOCKS)

### SOCKS Proxy Setup

```typescript
// Create SOCKS proxy on local:1080
const proxy = await $.ssh('user@host').socks({
  port: 1080,           // Local SOCKS port
  host: '127.0.0.1'    // Bind address
});

// Use proxy for HTTP requests
const agent = new SocksProxyAgent('socks5://localhost:1080');

const response = await fetch('http://internal-service', {
  agent
});

// Close proxy
await proxy.close();
```

### Configuration

```yaml
targets:
  socks-proxy:
    type: ssh
    host: proxy.example.com
    tunnels:
      - type: socks
        port: 1080
        description: SOCKS5 proxy
```

### Using SOCKS Proxy

```typescript
// 1. With HTTP client
import { SocksProxyAgent } from 'socks-proxy-agent';

const proxy = await $.ssh('user@host').socks({ port: 1080 });

const agent = new SocksProxyAgent('socks5://localhost:1080');
const response = await axios.get('http://internal-api', {
  httpsAgent: agent,
  httpAgent: agent
});

// 2. With curl via command line
await $.ssh('user@host').socks({ port: 1080 });
await $`curl --socks5 localhost:1080 http://internal-service`;

// 3. System-wide proxy (macOS)
await $`networksetup -setsocksfirewallproxy Wi-Fi localhost 1080`;
// ... use proxy ...
await $`networksetup -setsocksfirewallproxystate Wi-Fi off`;
```

### SOCKS with Authentication

```typescript
// SOCKS proxy with authentication
const proxy = await $.ssh('user@host').socks({
  port: 1080,
  auth: {
    username: 'proxy-user',
    password: 'proxy-pass'
  }
});

// Use with auth
const agent = new SocksProxyAgent('socks5://proxy-user:proxy-pass@localhost:1080');
```

## Jump Hosts (Bastion)

### Single Jump Host

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

```typescript
// Programmatic jump host
await $.ssh({
  host: '10.0.1.50',
  user: 'admin',
  privateKey: '~/.ssh/private_key',
  jumpHost: {
    host: 'bastion.example.com',
    user: 'jump-user',
    privateKey: '~/.ssh/bastion_key'
  }
})`command`;
```

### Multiple Jump Hosts

```typescript
// Chain of jump hosts
await $.ssh({
  host: 'final-destination',
  user: 'admin',
  jumpHosts: [
    {
      host: 'jump1.example.com',
      user: 'user1',
      privateKey: '~/.ssh/key1'
    },
    {
      host: 'jump2.internal',
      user: 'user2',
      privateKey: '~/.ssh/key2'
    }
  ]
})`command`;
```

### Jump Host with Tunnels

```typescript
// Tunnel through jump host
const tunnel = await $.ssh({
  host: 'bastion.example.com',
  user: 'jump'
}).forward({
  localPort: 5432,
  remoteHost: 'db.internal',  // Accessible from bastion
  remotePort: 5432
});

// Connect to internal database
const db = new Client({
  host: 'localhost',
  port: 5432
});
```

## Complex Tunneling Scenarios

### Multi-Hop Tunneling

```typescript
// Tunnel through multiple hosts
async function createMultiHopTunnel(hops: Array<SSHConfig>, finalPort: number) {
  let localPort = 10000;
  const tunnels = [];
  
  for (let i = 0; i < hops.length - 1; i++) {
    const tunnel = await $.ssh(hops[i]).forward({
      localPort: localPort + i,
      remoteHost: hops[i + 1].host,
      remotePort: i === hops.length - 2 ? finalPort : 22
    });
    tunnels.push(tunnel);
  }
  
  return {
    port: localPort,
    close: async () => {
      for (const tunnel of tunnels.reverse()) {
        await tunnel.close();
      }
    }
  };
}

// Usage
const tunnel = await createMultiHopTunnel([
  { host: 'jump1.example.com', user: 'user1' },
  { host: 'jump2.internal', user: 'user2' },
  { host: 'target.private', user: 'admin' }
], 3306);  // MySQL on final host
```

### Bidirectional Tunneling

```typescript
// Simultaneous local and remote forwarding
const ssh = await $.ssh('user@host');

// Local forward
const localTunnel = await ssh.forward({
  localPort: 8080,
  remotePort: 80
});

// Remote forward
const remoteTunnel = await ssh.reverseForward({
  remotePort: 9000,
  localPort: 3000
});

// Both tunnels active simultaneously
```

### Dynamic Tunnel Management

```typescript
class TunnelManager {
  private tunnels = new Map<string, SSHTunnel>();
  
  async create(name: string, config: TunnelConfig): Promise<void> {
    if (this.tunnels.has(name)) {
      throw new Error(`Tunnel ${name} already exists`);
    }
    
    const tunnel = await $.ssh(config.ssh).forward(config.forward);
    this.tunnels.set(name, tunnel);
    
    // Auto-reconnect on failure
    tunnel.on('error', async () => {
      console.log(`Tunnel ${name} failed, reconnecting...`);
      await this.recreate(name, config);
    });
  }
  
  async recreate(name: string, config: TunnelConfig): Promise<void> {
    await this.close(name);
    await this.create(name, config);
  }
  
  async close(name: string): Promise<void> {
    const tunnel = this.tunnels.get(name);
    if (tunnel) {
      await tunnel.close();
      this.tunnels.delete(name);
    }
  }
  
  async closeAll(): Promise<void> {
    for (const [name, tunnel] of this.tunnels) {
      await tunnel.close();
    }
    this.tunnels.clear();
  }
}
```

## Performance Optimization

### Connection Reuse

```typescript
// Reuse SSH connection for multiple tunnels
const ssh = await SSHClient.connect({
  host: 'tunnel.example.com',
  user: 'admin'
});

// Create multiple tunnels on same connection
const tunnels = await Promise.all([
  ssh.forwardOut({ srcPort: 8080, dstPort: 80 }),
  ssh.forwardOut({ srcPort: 8443, dstPort: 443 }),
  ssh.forwardOut({ srcPort: 3306, dstPort: 3306 })
]);

// All tunnels share one SSH connection
```

### Compression

```typescript
// Enable compression for tunnel traffic
const tunnel = await $.ssh({
  host: 'host.example.com',
  compress: true  // Compress tunnel data
}).forward({
  localPort: 8080,
  remotePort: 80
});
```

### Keep-Alive

```typescript
// Prevent tunnel timeout
const tunnel = await $.ssh({
  host: 'host.example.com',
  keepaliveInterval: 10000,  // 10 seconds
  keepaliveCountMax: 3
}).forward({
  localPort: 8080,
  remotePort: 80
});
```

## Security Considerations

### Tunnel Security

```typescript
// Secure tunnel configuration
const secureTunnel = await $.ssh({
  host: 'secure.example.com',
  // Strong authentication
  privateKey: process.env.SSH_KEY,
  // Host verification
  strictHostKeyChecking: true,
  // Strong algorithms
  algorithms: {
    cipher: ['aes256-gcm@openssh.com'],
    kex: ['curve25519-sha256']
  }
}).forward({
  // Bind only to localhost
  localHost: '127.0.0.1',
  localPort: 8080,
  remotePort: 80
});
```

### Access Control

```typescript
// Limit tunnel access
const tunnel = await $.ssh('user@host').forward({
  localHost: '127.0.0.1',  // Only localhost can connect
  localPort: 8080,
  remotePort: 80,
  // Custom access control
  onConnection: (info) => {
    // Validate connection
    if (!isAllowedClient(info.srcAddr)) {
      throw new Error('Connection refused');
    }
  }
});
```

## Monitoring and Debugging

### Tunnel Status

```typescript
// Monitor tunnel status
class TunnelMonitor {
  async checkTunnel(tunnel: SSHTunnel): Promise<boolean> {
    try {
      // Test tunnel with simple request
      const response = await fetch(`http://localhost:${tunnel.localPort}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async monitorTunnels(tunnels: SSHTunnel[]) {
    setInterval(async () => {
      for (const tunnel of tunnels) {
        const healthy = await this.checkTunnel(tunnel);
        console.log(`Tunnel ${tunnel.localPort}: ${healthy ? 'UP' : 'DOWN'}`);
        
        if (!healthy) {
          // Alert or restart tunnel
          await this.restartTunnel(tunnel);
        }
      }
    }, 30000);  // Check every 30 seconds
  }
}
```

### Debug Logging

```typescript
// Enable tunnel debugging
process.env.DEBUG = 'ssh2:*,xec:tunnel:*';

const tunnel = await $.ssh('user@host').forward({
  localPort: 8080,
  remotePort: 80,
  debug: (msg) => console.log(`TUNNEL: ${msg}`)
});
```

## Common Issues and Solutions

### Port Already in Use

```typescript
// Find available port
async function findAvailablePort(start = 10000): Promise<number> {
  const net = require('net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(start + 1));
    });
  });
}

const port = await findAvailablePort();
const tunnel = await $.ssh('user@host').forward({
  localPort: port,
  remotePort: 80
});
```

### Tunnel Timeout

```typescript
// Handle tunnel timeouts
const tunnel = await $.ssh({
  host: 'host.example.com',
  // Increase timeouts
  connectionTimeout: 60000,
  // Keep connection alive
  keepaliveInterval: 10000
}).forward({
  localPort: 8080,
  remotePort: 80
});

// Restart on timeout
tunnel.on('timeout', async () => {
  console.log('Tunnel timeout, restarting...');
  await tunnel.restart();
});
```

## Best Practices

1. **Close tunnels when done** to free resources
2. **Use connection pooling** for multiple tunnels
3. **Monitor tunnel health** in production
4. **Implement auto-reconnect** for critical tunnels
5. **Use compression** for slow networks
6. **Secure tunnel endpoints** with proper binding
7. **Log tunnel activity** for debugging

## Related Documentation

- [SSH Overview](./overview.md) - SSH fundamentals
- [Connection Config](./connection-config.md) - Connection setup
- [Batch Operations](./batch-operations.md) - Multi-host operations
- [SSH Authentication](./authentication.md) - Authentication methods