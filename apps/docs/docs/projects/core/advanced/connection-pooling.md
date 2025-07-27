---
sidebar_position: 8
---

# Connection Pooling

Efficiently manage SSH connections with automatic pooling, reuse, and lifecycle management.

## Overview

Connection pooling in @xec-sh/core provides:
- Automatic SSH connection reuse
- Configurable pool size and timeouts
- Connection health monitoring
- Automatic reconnection on failure
- Connection warm-up strategies
- Detailed pool metrics and monitoring

## Basic Connection Pooling

### Automatic Pooling

SSH connections are automatically pooled and reused:

```typescript
import { $ } from '@xec-sh/core';

// First command creates a new connection
const ssh1 = $.ssh({ host: 'server.com', username: 'user' });
await ssh1`uptime`; // New connection

// Same host reuses connection
const ssh2 = $.ssh({ host: 'server.com', username: 'user' });
await ssh2`date`; // Reuses existing connection
```

### Pool Configuration

```typescript
// Configure connection pool settings
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  poolConfig: {
    maxConnections: 10,      // Maximum connections per host
    idleTimeout: 300000,     // Close idle connections after 5 min
    keepAliveInterval: 10000, // Send keepalive every 10s
    warmUpConnections: 2,    // Pre-create 2 connections
    maxRetries: 3,          // Retry failed connections
    connectionTimeout: 30000 // Connection timeout
  }
});
```

## Connection Management

### Manual Connection Control

```typescript
import { SSHConnectionPool } from '@xec-sh/core';

// Get the global pool instance
const pool = SSHConnectionPool.getInstance();

// Check pool status
const stats = pool.getStats();
console.log('Active connections:', stats.activeConnections);
console.log('Idle connections:', stats.idleConnections);
console.log('Total connections:', stats.totalConnections);

// Close idle connections
pool.closeIdleConnections();

// Close all connections
await pool.closeAll();
```

### Connection Warming

```typescript
// Pre-establish connections for better performance
async function warmUpConnections(hosts: string[]) {
  const warmUpTasks = hosts.map(host => {
    const ssh = $.ssh({ 
      host, 
      username: 'deploy',
      poolConfig: { warmUpConnections: 3 }
    });
    
    // Execute a simple command to establish connection
    return ssh`echo "Connection established"`.quiet();
  });
  
  await Promise.all(warmUpTasks);
  console.log('Connection pool warmed up');
}

// Warm up before heavy usage
await warmUpConnections(['web1.example.com', 'web2.example.com', 'web3.example.com']);
```

### Connection Health Checks

```typescript
// Configure health checks
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  poolConfig: {
    healthCheck: {
      enabled: true,
      interval: 60000,        // Check every minute
      timeout: 5000,          // Health check timeout
      command: 'echo "alive"' // Command to verify connection
    }
  }
});

// Monitor connection health
pool.on('connection:healthy', (host) => {
  console.log(`Connection to ${host} is healthy`);
});

pool.on('connection:unhealthy', (host, error) => {
  console.error(`Connection to ${host} failed health check:`, error);
});
```

## Advanced Pooling Strategies

### Per-Host Configuration

```typescript
// Different pool settings for different hosts
class HostPoolConfig {
  private configs = new Map<string, any>();
  
  constructor() {
    // Production servers - more connections
    this.configs.set('prod-.*\\.example\\.com', {
      maxConnections: 20,
      idleTimeout: 600000,    // 10 minutes
      warmUpConnections: 5
    });
    
    // Dev servers - fewer connections
    this.configs.set('dev-.*\\.example\\.com', {
      maxConnections: 5,
      idleTimeout: 60000,     // 1 minute
      warmUpConnections: 1
    });
    
    // Critical servers - persistent connections
    this.configs.set('(db|cache)-.*\\.example\\.com', {
      maxConnections: 10,
      idleTimeout: 0,         // Never timeout
      keepAliveInterval: 5000,
      warmUpConnections: 3
    });
  }
  
  getConfig(host: string): any {
    for (const [pattern, config] of this.configs) {
      if (new RegExp(pattern).test(host)) {
        return config;
      }
    }
    return {}; // Default config
  }
}

const hostConfig = new HostPoolConfig();

// Use with SSH
function createSSH(host: string, username: string) {
  return $.ssh({
    host,
    username,
    poolConfig: hostConfig.getConfig(host)
  });
}
```

### Connection Priority

```typescript
// Implement connection priority queue
class PriorityConnectionPool {
  private queues = new Map<string, Array<{ priority: number; resolve: Function }>>();
  
  async getConnection(host: string, priority = 0): Promise<any> {
    const pool = SSHConnectionPool.getInstance();
    
    // Try to get connection immediately
    const conn = await pool.getConnection(host).catch(() => null);
    if (conn) return conn;
    
    // Queue if no connection available
    return new Promise((resolve) => {
      if (!this.queues.has(host)) {
        this.queues.set(host, []);
      }
      
      const queue = this.queues.get(host)!;
      queue.push({ priority, resolve });
      queue.sort((a, b) => b.priority - a.priority);
      
      this.processQueue(host);
    });
  }
  
  private async processQueue(host: string) {
    const queue = this.queues.get(host);
    if (!queue || queue.length === 0) return;
    
    const pool = SSHConnectionPool.getInstance();
    const conn = await pool.getConnection(host).catch(() => null);
    
    if (conn) {
      const next = queue.shift();
      if (next) {
        next.resolve(conn);
        // Process next in queue
        setImmediate(() => this.processQueue(host));
      }
    }
  }
}
```

### Load Balancing

```typescript
// Distribute connections across multiple hosts
class LoadBalancedSSH {
  private hosts: string[];
  private currentIndex = 0;
  private connectionCounts = new Map<string, number>();
  
  constructor(hosts: string[], private username: string) {
    this.hosts = hosts;
    hosts.forEach(h => this.connectionCounts.set(h, 0));
  }
  
  // Round-robin selection
  getNextHost(): string {
    const host = this.hosts[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.hosts.length;
    return host;
  }
  
  // Least connections selection
  getLeastUsedHost(): string {
    let minHost = this.hosts[0];
    let minCount = Infinity;
    
    for (const [host, count] of this.connectionCounts) {
      if (count < minCount) {
        minCount = count;
        minHost = host;
      }
    }
    
    return minHost;
  }
  
  async execute(command: string, strategy: 'round-robin' | 'least-used' = 'round-robin') {
    const host = strategy === 'round-robin' 
      ? this.getNextHost() 
      : this.getLeastUsedHost();
    
    this.connectionCounts.set(host, (this.connectionCounts.get(host) || 0) + 1);
    
    try {
      const ssh = $.ssh({ host, username: this.username });
      return await ssh`${command}`;
    } finally {
      this.connectionCounts.set(host, (this.connectionCounts.get(host) || 0) - 1);
    }
  }
}

// Usage
const balancer = new LoadBalancedSSH(
  ['server1.com', 'server2.com', 'server3.com'],
  'deploy'
);

// Distribute load across servers
const results = await Promise.all([
  balancer.execute('process-job-1'),
  balancer.execute('process-job-2'),
  balancer.execute('process-job-3')
]);
```

## Monitoring and Metrics

### Pool Metrics

```typescript
// Detailed connection pool metrics
interface PoolMetrics {
  connectionsCreated: number;
  connectionsReused: number;
  connectionsFailed: number;
  averageConnectionTime: number;
  averageIdleTime: number;
  poolEfficiency: number;
}

class ConnectionPoolMonitor {
  private metrics: PoolMetrics = {
    connectionsCreated: 0,
    connectionsReused: 0,
    connectionsFailed: 0,
    averageConnectionTime: 0,
    averageIdleTime: 0,
    poolEfficiency: 0
  };
  
  constructor() {
    const pool = SSHConnectionPool.getInstance();
    
    pool.on('connection:created', (host, duration) => {
      this.metrics.connectionsCreated++;
      this.updateAverageConnectionTime(duration);
    });
    
    pool.on('connection:reused', (host) => {
      this.metrics.connectionsReused++;
      this.updatePoolEfficiency();
    });
    
    pool.on('connection:failed', (host, error) => {
      this.metrics.connectionsFailed++;
    });
    
    pool.on('connection:idle', (host, idleTime) => {
      this.updateAverageIdleTime(idleTime);
    });
  }
  
  private updateAverageConnectionTime(duration: number) {
    const total = this.metrics.averageConnectionTime * (this.metrics.connectionsCreated - 1);
    this.metrics.averageConnectionTime = (total + duration) / this.metrics.connectionsCreated;
  }
  
  private updateAverageIdleTime(idleTime: number) {
    const count = this.metrics.connectionsCreated + this.metrics.connectionsReused;
    const total = this.metrics.averageIdleTime * (count - 1);
    this.metrics.averageIdleTime = (total + idleTime) / count;
  }
  
  private updatePoolEfficiency() {
    const total = this.metrics.connectionsCreated + this.metrics.connectionsReused;
    this.metrics.poolEfficiency = this.metrics.connectionsReused / total;
  }
  
  report() {
    console.log('=== Connection Pool Metrics ===');
    console.log(`Connections Created: ${this.metrics.connectionsCreated}`);
    console.log(`Connections Reused: ${this.metrics.connectionsReused}`);
    console.log(`Connections Failed: ${this.metrics.connectionsFailed}`);
    console.log(`Average Connection Time: ${this.metrics.averageConnectionTime.toFixed(2)}ms`);
    console.log(`Average Idle Time: ${(this.metrics.averageIdleTime / 1000).toFixed(2)}s`);
    console.log(`Pool Efficiency: ${(this.metrics.poolEfficiency * 100).toFixed(2)}%`);
  }
}

// Monitor pool performance
const monitor = new ConnectionPoolMonitor();
setInterval(() => monitor.report(), 60000);
```

### Connection Lifecycle Events

```typescript
// Track connection lifecycle
const pool = SSHConnectionPool.getInstance();

// Connection created
pool.on('connection:created', (host, duration) => {
  console.log(`New connection to ${host} established in ${duration}ms`);
});

// Connection reused
pool.on('connection:reused', (host) => {
  console.log(`Reused connection to ${host}`);
});

// Connection closed
pool.on('connection:closed', (host, reason) => {
  console.log(`Connection to ${host} closed: ${reason}`);
});

// Connection error
pool.on('connection:error', (host, error) => {
  console.error(`Connection error for ${host}:`, error);
});

// Pool full
pool.on('pool:full', (host) => {
  console.warn(`Connection pool full for ${host}`);
});
```

## Error Handling and Recovery

### Automatic Reconnection

```typescript
// Configure automatic reconnection
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  poolConfig: {
    reconnect: {
      enabled: true,
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoff: 'exponential'
    }
  }
});

// Monitor reconnection attempts
pool.on('connection:reconnecting', (host, attempt) => {
  console.log(`Reconnecting to ${host} (attempt ${attempt})`);
});

pool.on('connection:reconnected', (host) => {
  console.log(`Successfully reconnected to ${host}`);
});
```

### Failover Support

```typescript
// Implement connection failover
class FailoverSSH {
  constructor(
    private primaryHost: string,
    private backupHosts: string[],
    private username: string
  ) {}
  
  async execute(command: string): Promise<any> {
    // Try primary first
    try {
      const ssh = $.ssh({ 
        host: this.primaryHost, 
        username: this.username,
        poolConfig: { connectionTimeout: 5000 }
      });
      return await ssh`${command}`;
    } catch (primaryError) {
      console.warn(`Primary host ${this.primaryHost} failed, trying backups...`);
      
      // Try backup hosts
      for (const backupHost of this.backupHosts) {
        try {
          const ssh = $.ssh({ 
            host: backupHost, 
            username: this.username 
          });
          console.log(`Using backup host: ${backupHost}`);
          return await ssh`${command}`;
        } catch (backupError) {
          console.warn(`Backup host ${backupHost} also failed`);
        }
      }
      
      throw new Error('All hosts failed');
    }
  }
}
```

## Performance Optimization

### Connection Caching Strategy

```typescript
// Implement smart connection caching
class SmartConnectionCache {
  private usageStats = new Map<string, {
    lastUsed: number;
    useCount: number;
    averageCommandDuration: number;
  }>();
  
  async execute(host: string, command: string) {
    const stats = this.getStats(host);
    const now = Date.now();
    
    // Determine pool config based on usage patterns
    const poolConfig = this.determinePoolConfig(stats);
    
    const ssh = $.ssh({ host, username: 'user', poolConfig });
    const start = Date.now();
    
    try {
      const result = await ssh`${command}`;
      
      // Update stats
      this.updateStats(host, Date.now() - start);
      
      return result;
    } catch (error) {
      // Reduce pool size on errors
      if (stats.useCount > 0) {
        poolConfig.maxConnections = Math.max(1, poolConfig.maxConnections - 1);
      }
      throw error;
    }
  }
  
  private determinePoolConfig(stats: any) {
    const config: any = {
      maxConnections: 5,
      idleTimeout: 300000
    };
    
    // High frequency usage - more connections, longer timeout
    if (stats.useCount > 100 && stats.averageCommandDuration < 1000) {
      config.maxConnections = 10;
      config.idleTimeout = 600000;
      config.warmUpConnections = 3;
    }
    
    // Low frequency - minimal pooling
    if (stats.useCount < 10 || Date.now() - stats.lastUsed > 3600000) {
      config.maxConnections = 2;
      config.idleTimeout = 60000;
    }
    
    return config;
  }
  
  private getStats(host: string) {
    if (!this.usageStats.has(host)) {
      this.usageStats.set(host, {
        lastUsed: Date.now(),
        useCount: 0,
        averageCommandDuration: 0
      });
    }
    return this.usageStats.get(host)!;
  }
  
  private updateStats(host: string, duration: number) {
    const stats = this.getStats(host);
    stats.lastUsed = Date.now();
    stats.useCount++;
    stats.averageCommandDuration = 
      (stats.averageCommandDuration * (stats.useCount - 1) + duration) / stats.useCount;
  }
}
```

## Testing Connection Pools

### Unit Tests

```typescript
describe('Connection pooling', () => {
  let pool: SSHConnectionPool;
  
  beforeEach(() => {
    pool = SSHConnectionPool.getInstance();
    pool.closeAll();
  });
  
  it('should reuse connections', async () => {
    const stats1 = pool.getStats();
    
    // First connection
    await $.ssh({ host: 'test.com', username: 'user' })`echo test`;
    
    const stats2 = pool.getStats();
    expect(stats2.totalConnections).toBe(stats1.totalConnections + 1);
    
    // Should reuse
    await $.ssh({ host: 'test.com', username: 'user' })`echo test2`;
    
    const stats3 = pool.getStats();
    expect(stats3.totalConnections).toBe(stats2.totalConnections);
  });
  
  it('should respect pool limits', async () => {
    const ssh = $.ssh({
      host: 'test.com',
      username: 'user',
      poolConfig: { maxConnections: 2 }
    });
    
    // Create connections up to limit
    const promises = Array(5).fill(0).map((_, i) => 
      ssh`sleep 1 && echo ${i}`
    );
    
    await Promise.all(promises);
    
    const stats = pool.getStats();
    expect(stats.totalConnections).toBeLessThanOrEqual(2);
  });
});
```

## Best Practices

1. **Configure pool sizes appropriately** - Based on usage patterns
2. **Use connection warming** - Pre-establish connections before peak usage
3. **Monitor pool metrics** - Track efficiency and adjust settings
4. **Implement health checks** - Detect and remove stale connections
5. **Set reasonable timeouts** - Balance resource usage and performance
6. **Handle connection failures gracefully** - Implement retry and failover
7. **Clean up unused connections** - Prevent resource leaks
8. **Use host-specific configurations** - Optimize for different server types
9. **Test pool behavior** - Include connection scenarios in tests
10. **Document pool settings** - Explain configuration choices

## Next Steps

- Explore [SSH Adapter](../adapters/ssh) for SSH features
- See [Caching](./caching) for result optimization
- Learn about [Parallel Execution](./parallel-execution) for performance
- Check [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) for pooling patterns