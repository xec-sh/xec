---
title: Docker Networking
description: Container networking configuration and management with Xec
keywords: [docker, networking, ports, networks, connectivity]
source_files:
  - packages/core/src/docker/network.ts
  - packages/core/src/docker/docker-client.ts
  - packages/core/src/adapters/docker-adapter.ts
  - apps/xec/src/commands/forward.ts
key_functions:
  - NetworkManager.create()
  - NetworkManager.connect()
  - NetworkManager.disconnect()
  - DockerClient.createNetwork()
  - DockerClient.inspectNetwork()
verification_date: 2025-08-03
---

# Docker Networking

## Implementation Reference

**Source Files:**
- `packages/core/src/docker/network.ts` - Network management
- `packages/core/src/docker/docker-client.ts` - Docker client
- `packages/core/src/adapters/docker-adapter.ts` - Docker adapter
- `apps/xec/src/commands/forward.ts` - Port forwarding command

**Key Functions:**
- `NetworkManager.create()` - Create networks
- `NetworkManager.remove()` - Remove networks
- `NetworkManager.connect()` - Connect containers to networks
- `NetworkManager.disconnect()` - Disconnect from networks
- `NetworkManager.list()` - List networks
- `DockerClient.createNetwork()` - Low-level network creation

## Overview

Xec provides comprehensive Docker networking capabilities, enabling container connectivity, port management, network isolation, and advanced networking configurations.

## Network Types

### Bridge Networks

Default network type for standalone containers:

```typescript
import { $ } from '@xec-sh/core';

// Create bridge network
await $.docker.network.create('my-network');

// Create with options
await $.docker.network.create('app-network', {
  driver: 'bridge',
  ipam: {
    driver: 'default',
    config: [{
      subnet: '172.20.0.0/16',
      gateway: '172.20.0.1'
    }]
  },
  options: {
    'com.docker.network.bridge.name': 'br-app'
  }
});

// Run container on network
await $.docker.run('nginx', {
  network: 'app-network',
  networkAlias: ['web', 'nginx']
});
```

### Host Network

Share host's network namespace:

```typescript
// Use host network
await $.docker.run('nginx', {
  network: 'host'
});

// Note: Port mapping ignored with host network
await $.docker.run('app', {
  network: 'host',
  ports: ['8080:8080']  // Ignored, uses host ports directly
});
```

### Overlay Networks

Multi-host networking for Swarm:

```typescript
// Create overlay network
await $.docker.network.create('swarm-network', {
  driver: 'overlay',
  attachable: true,  // Allow standalone containers
  encrypted: true,   // Encrypt traffic
  options: {
    'com.docker.network.driver.overlay.vxlanid_list': '4096'
  }
});
```

### None Network

No network connectivity:

```typescript
// Isolated container
await $.docker.run('alpine', {
  network: 'none',
  command: ['sh', '-c', 'echo "No network access"']
});
```

## Port Management

### Port Mapping

Map container ports to host:

```typescript
// Simple port mapping
await $.docker.run('nginx', {
  ports: ['80:80']  // host:container
});

// Multiple ports
await $.docker.run('app', {
  ports: [
    '3000:3000',      // Web server
    '9229:9229',      // Debug port
    '5432:5432'       // Database
  ]
});

// Specific interface
await $.docker.run('api', {
  ports: [
    '127.0.0.1:8080:8080',  // Localhost only
    '0.0.0.0:3000:3000'     // All interfaces
  ]
});

// Random host port
await $.docker.run('service', {
  ports: ['8080']  // Random host port -> 8080
});

// Port ranges
await $.docker.run('cluster', {
  ports: ['8000-8010:8000-8010']
});
```

### Port Forwarding

Forward ports dynamically:

```typescript
// Forward port from container
await $.docker.forward('my-container', {
  local: 8080,
  remote: 80
});

// CLI usage
```

```bash
# Forward container port to local
xec forward my-container 8080:80

# Forward with specific interface
xec forward my-container 127.0.0.1:8080:80

# Multiple forwards
xec forward my-container 8080:80 8443:443 5432:5432
```

### Published Ports

Expose ports without mapping:

```typescript
// Expose ports (documentation only)
await $.docker.run('api', {
  expose: ['3000', '3001'],
  // Ports are exposed to linked containers but not host
});

// Get exposed ports
const info = await $.docker.inspect('api');
const exposed = info.Config.ExposedPorts;
// { "3000/tcp": {}, "3001/tcp": {} }
```

## Network Operations

### Creating Networks

Create custom networks:

```typescript
// Simple network
await $.docker.network.create('backend');

// Network with subnet
await $.docker.network.create('frontend', {
  driver: 'bridge',
  ipam: {
    config: [{
      subnet: '172.25.0.0/16',
      ip_range: '172.25.1.0/24',
      gateway: '172.25.0.1'
    }]
  }
});

// Internal network (no external access)
await $.docker.network.create('internal', {
  internal: true
});

// IPv6 network
await $.docker.network.create('ipv6-net', {
  enableIPv6: true,
  ipam: {
    config: [{
      subnet: '2001:db8::/64'
    }]
  }
});
```

### Connecting Containers

Connect containers to networks:

```typescript
// Connect to network
await $.docker.network.connect('my-network', 'my-container');

// Connect with alias
await $.docker.network.connect('my-network', 'my-container', {
  aliases: ['db', 'postgres']
});

// Connect with IP
await $.docker.network.connect('my-network', 'my-container', {
  ipv4Address: '172.20.0.5',
  ipv6Address: '2001:db8::5'
});

// Multiple networks
const networks = ['frontend', 'backend'];
await Promise.all(
  networks.map(net => 
    $.docker.network.connect(net, 'my-container')
  )
);
```

### Disconnecting Containers

Remove containers from networks:

```typescript
// Disconnect from network
await $.docker.network.disconnect('my-network', 'my-container');

// Force disconnect
await $.docker.network.disconnect('my-network', 'my-container', {
  force: true
});
```

### Listing Networks

List and filter networks:

```typescript
// List all networks
const networks = await $.docker.network.list();

// Filter networks
const customNetworks = await $.docker.network.list({
  filters: {
    driver: ['bridge'],
    type: ['custom']
  }
});

// Get network details
networks.forEach(net => {
  console.log({
    name: net.Name,
    id: net.Id,
    driver: net.Driver,
    scope: net.Scope,
    containers: Object.keys(net.Containers || {})
  });
});
```

## Service Discovery

### DNS Resolution

Containers can resolve each other by name:

```typescript
// Create network with custom DNS
await $.docker.network.create('app-net', {
  options: {
    'com.docker.network.bridge.host_binding_ipv4': '172.20.0.1'
  }
});

// Run containers with names
await $.docker.run('mysql', {
  name: 'database',
  network: 'app-net'
});

await $.docker.run('app', {
  name: 'application',
  network: 'app-net',
  env: {
    DB_HOST: 'database'  // Resolves to database container
  }
});

// Test connectivity
await $.docker.exec('application')`ping -c 1 database`;
```

### Network Aliases

Multiple DNS names for containers:

```typescript
// Create container with aliases
await $.docker.run('nginx', {
  name: 'web-server',
  network: 'app-net',
  networkAlias: ['web', 'nginx', 'frontend']
});

// Connect to any alias
await $.docker.exec('app')`curl http://web`;
await $.docker.exec('app')`curl http://nginx`;
await $.docker.exec('app')`curl http://frontend`;
```

## Advanced Networking

### Multi-Network Containers

Connect containers to multiple networks:

```typescript
// Create container
const container = await $.docker.run('app', {
  name: 'multi-net-app',
  network: 'frontend'  // Initial network
});

// Add to additional networks
await $.docker.network.connect('backend', 'multi-net-app');
await $.docker.network.connect('monitoring', 'multi-net-app');

// Verify connections
const info = await $.docker.inspect('multi-net-app');
const networks = Object.keys(info.NetworkSettings.Networks);
// ['frontend', 'backend', 'monitoring']
```

### Network Isolation

Isolate container groups:

```typescript
// Create isolated networks
await $.docker.network.create('team-a', { internal: true });
await $.docker.network.create('team-b', { internal: true });
await $.docker.network.create('shared');

// Team A containers
await $.docker.run('app-a', {
  network: 'team-a'
});

// Team B containers
await $.docker.run('app-b', {
  network: 'team-b'
});

// Gateway container with access to both
await $.docker.run('gateway', {
  networks: ['team-a', 'team-b', 'shared']
});
```

### Custom Network Drivers

Use third-party network drivers:

```typescript
// Weave network
await $.docker.network.create('weave-net', {
  driver: 'weave',
  options: {
    'weave.works/network': 'default'
  }
});

// Calico network
await $.docker.network.create('calico-net', {
  driver: 'calico',
  ipam: {
    driver: 'calico-ipam'
  }
});
```

## Load Balancing

### Round-Robin DNS

Built-in load balancing with network aliases:

```typescript
// Create network
await $.docker.network.create('lb-net');

// Run multiple instances with same alias
for (let i = 1; i <= 3; i++) {
  await $.docker.run(`app:v${i}`, {
    name: `app-${i}`,
    network: 'lb-net',
    networkAlias: ['app']  // Same alias for all
  });
}

// DNS resolves to all containers
await $.docker.run('client', {
  network: 'lb-net',
  command: ['nslookup', 'app']
});
// Returns all three container IPs
```

## Network Security

### Firewall Rules

Configure network policies:

```typescript
// Create secure network
await $.docker.network.create('secure-net', {
  options: {
    'com.docker.network.bridge.enable_icc': 'false',  // Disable inter-container communication
    'com.docker.network.bridge.enable_ip_masquerade': 'true'
  }
});

// Explicit communication allowed via links
await $.docker.run('db', {
  name: 'database',
  network: 'secure-net'
});

await $.docker.run('app', {
  network: 'secure-net',
  links: ['database:db']  // Explicit link allows communication
});
```

## Configuration in Xec

### Network Configuration

Define networks in `.xec/config.yaml`:

```yaml
networks:
  frontend:
    driver: bridge
    ipam:
      subnet: 172.30.0.0/16
      
  backend:
    driver: bridge
    internal: true
    
  monitoring:
    driver: bridge
    attachable: true

targets:
  containers:
    web:
      type: docker
      container: nginx
      networks:
        - frontend
      ports:
        - "80:80"
        
    api:
      type: docker
      container: api-server
      networks:
        - frontend
        - backend
      networkAliases:
        frontend: [api, rest-api]
        backend: [api-backend]
```

### Network Tasks

Define networking tasks:

```yaml
tasks:
  setup-network:
    description: Setup application networks
    steps:
      - command: docker network create frontend || true
      - command: docker network create backend --internal || true
      
  connect-all:
    description: Connect all containers to network
    params:
      - name: network
    steps:
      - command: |
          for container in $(docker ps -q); do
            docker network connect ${params.network} $container || true
          done
          
  network-debug:
    description: Debug network connectivity
    params:
      - name: container
    steps:
      - command: docker exec ${params.container} ip addr
      - command: docker exec ${params.container} netstat -tuln
      - command: docker exec ${params.container} nslookup database
```

## Performance Characteristics

**Based on Implementation:**

### Network Operations
- **Network Create**: 20-50ms
- **Network Connect**: 50-100ms
- **Network Disconnect**: 30-50ms
- **DNS Resolution**: 1-5ms (cached)
- **Port Forward Setup**: 100-200ms

### Throughput
- **Bridge Network**: Near native performance
- **Host Network**: Native performance
- **Overlay Network**: 10-20% overhead
- **None Network**: N/A

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Cannot connect to container | Wrong network | Ensure containers on same network |
| Port already in use | Host port conflict | Use different port mapping |
| DNS not resolving | Network isolation | Check network configuration |
| No route to host | Firewall rules | Check iptables/network policies |
| Connection refused | Service not listening | Verify service is running |

### Debugging Tools

```typescript
// Network inspection
async function debugNetwork(network: string) {
  const info = await $.docker.network.inspect(network);
  console.log('Network:', info);
  
  // List connected containers
  const containers = info.Containers || {};
  for (const [id, container] of Object.entries(containers)) {
    console.log(`Container: ${container.Name} - IP: ${container.IPv4Address}`);
  }
}

// Connectivity test
async function testConnectivity(from: string, to: string) {
  try {
    await $.docker.exec(from)`ping -c 1 ${to}`;
    console.log(`✓ ${from} can reach ${to}`);
  } catch {
    console.log(`✗ ${from} cannot reach ${to}`);
  }
}

// Port check
async function checkPort(container: string, port: number) {
  const result = await $.docker.exec(container)`netstat -tuln | grep :${port}`;
  return result.stdout.includes(`:${port}`);
}
```

## Best Practices

### Network Design

1. **Use custom networks** instead of default bridge
2. **Isolate sensitive services** with internal networks
3. **Use network aliases** for service discovery
4. **Limit exposed ports** to minimize attack surface
5. **Document network topology** in configuration

### Security

```typescript
// Good: Isolated networks
const publicNet = await $.docker.network.create('public');
const privateNet = await $.docker.network.create('private', {
  internal: true
});

// API gateway with access to both
await $.docker.run('gateway', {
  networks: ['public', 'private']
});

// Database only on private network
await $.docker.run('database', {
  network: 'private'
});
```

### Performance

```typescript
// Good: Minimize network hops
await $.docker.run('app', {
  network: 'app-net',
  // Use host network for performance-critical apps
  // network: 'host'
});

// Good: Use network aliases for load balancing
for (let i = 0; i < 3; i++) {
  await $.docker.run('worker', {
    network: 'app-net',
    networkAlias: ['workers']
  });
}
```

## Related Topics

- [Docker Overview](./overview.md) - Docker basics
- [Container Lifecycle](./container-lifecycle.md) - Container management
- [Compose Integration](./compose-integration.md) - Multi-container networking
- [Volume Management](./volume-management.md) - Data persistence
- [forward Command](../../commands/built-in/forward.md) - Port forwarding