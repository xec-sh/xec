# SSH Connection Management

Comprehensive guide to SSH connection pooling, connection reuse, keep-alive mechanisms, and connection lifecycle management in Xec.

## Overview

SSH connection management in Xec provides:

- **Automatic connection pooling** with configurable limits
- **Connection reuse** across multiple commands
- **Keep-alive mechanisms** to maintain long-lived connections
- **Auto-reconnection** for failed connections
- **Connection metrics** and monitoring
- **Resource cleanup** and lifecycle management

## Connection Pooling

### Automatic Pool Configuration

```typescript
import { $ } from '@xec-sh/core';

// Connection pooling is enabled by default
const ssh = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '~/.ssh/id_rsa'
});

// These commands automatically reuse the same connection
await ssh`uptime`;
await ssh`free -h`;
await ssh`df -h`;
```

### Custom Pool Configuration

```typescript
import { SSHAdapter } from '@xec-sh/core';

// Configure connection pool behavior
const sshAdapter = new SSHAdapter({
  connectionPool: {
    enabled: true,              // Enable/disable pooling
    maxConnections: 10,         // Maximum concurrent connections
    idleTimeout: 300000,        // 5 minutes idle timeout
    keepAlive: true,            // Enable keep-alive
    keepAliveInterval: 30000,   // 30-second keep-alive interval
    autoReconnect: true,        // Auto-reconnect on failures
    maxReconnectAttempts: 3,    // Maximum reconnection attempts
    reconnectDelay: 1000        // Delay between reconnect attempts
  }
});

// Use the configured adapter
const ssh = $.with({ adapter: sshAdapter }).ssh({
  host: 'server.example.com',
  username: 'deploy'
});
```

### Pool Size Management

```typescript
// Different pool configurations for different scenarios

// High-frequency operations
const highFrequency = new SSHAdapter({
  connectionPool: {
    enabled: true,
    maxConnections: 20,     // Higher limit for frequent use
    idleTimeout: 600000,    // 10 minutes - longer idle time
    keepAlive: true,
    keepAliveInterval: 15000 // More frequent keep-alive
  }
});

// Resource-constrained environments
const resourceConstrained = new SSHAdapter({
  connectionPool: {
    enabled: true,
    maxConnections: 3,      // Conservative limit
    idleTimeout: 120000,    // 2 minutes - shorter idle time
    keepAlive: true,
    keepAliveInterval: 60000 // Less frequent keep-alive
  }
});

// Development/testing
const development = new SSHAdapter({
  connectionPool: {
    enabled: false          // Disable pooling for debugging
  }
});
```

## Connection Reuse Patterns

### Single Server, Multiple Commands

```typescript
// Efficient: Reuses the same connection
const remote = $.ssh({
  host: 'prod.example.com',
  username: 'deploy'
});

async function deployApplication() {
  // All commands use the same pooled connection
  await remote`git pull origin main`;
  await remote`npm install --production`;
  await remote`npm run build`;
  await remote`pm2 restart app`;
  await remote`nginx -s reload`;
}

// The connection is automatically returned to the pool
```

### Multiple Servers with Connection Tracking

```typescript
class ServerConnectionManager {
  private connections = new Map<string, any>();
  
  getConnection(server: { host: string; username: string }) {
    const key = `${server.username}@${server.host}`;
    
    if (!this.connections.has(key)) {
      this.connections.set(key, $.ssh(server));
    }
    
    return this.connections.get(key);
  }
  
  async executeOnAll(servers: any[], command: string) {
    return Promise.all(
      servers.map(server => {
        const ssh = this.getConnection(server);
        return ssh`${command}`;
      })
    );
  }
  
  // Connections are automatically pooled and cleaned up
}

const manager = new ServerConnectionManager();
await manager.executeOnAll(servers, 'systemctl status nginx');
```

### Connection Sharing Across Operations

```typescript
// Share connections across different functions
class DeploymentManager {
  private ssh: any;
  
  constructor(serverConfig: any) {
    this.ssh = $.ssh(serverConfig);
  }
  
  async prepare() {
    await this.ssh`mkdir -p /tmp/deployment`;
    await this.ssh`chmod 755 /tmp/deployment`;
  }
  
  async deploy(version: string) {
    await this.ssh`wget -O /tmp/deployment/app.tar.gz ${downloadUrl}`;
    await this.ssh`tar -xzf /tmp/deployment/app.tar.gz -C /var/www/`;
    await this.ssh`systemctl restart app`;
  }
  
  async cleanup() {
    await this.ssh`rm -rf /tmp/deployment`;
  }
  
  async fullDeploy(version: string) {
    await this.prepare();
    await this.deploy(version);
    await this.cleanup();
    // Single connection used throughout the entire process
  }
}
```

## Keep-Alive Mechanisms

### Configuring Keep-Alive

```typescript
// Enable keep-alive to maintain long-lived connections
const persistentSSH = new SSHAdapter({
  connectionPool: {
    enabled: true,
    keepAlive: true,
    keepAliveInterval: 30000,  // Send keep-alive every 30 seconds
    idleTimeout: 600000        // 10-minute idle timeout
  }
});

// For long-running operations
const longRunning = $.with({ adapter: persistentSSH }).ssh({
  host: 'build-server.example.com',
  username: 'builder'
});

// This connection will stay alive during long build processes
await longRunning`./long-build-process.sh`;
```

### Custom Keep-Alive Strategies

```typescript
class CustomSSHManager {
  private connections = new Map();
  private keepAliveTimers = new Map();
  
  async getConnection(config: any) {
    const key = this.getConnectionKey(config);
    
    if (!this.connections.has(key)) {
      const ssh = $.ssh(config);
      this.connections.set(key, ssh);
      this.startCustomKeepAlive(key, ssh);
    }
    
    return this.connections.get(key);
  }
  
  private startCustomKeepAlive(key: string, ssh: any) {
    const timer = setInterval(async () => {
      try {
        // Send lightweight command to keep connection alive
        await ssh`echo keep-alive-${Date.now()}`.quiet();
      } catch (error) {
        console.warn(`Keep-alive failed for ${key}:`, error.message);
        this.removeConnection(key);
      }
    }, 45000); // Every 45 seconds
    
    this.keepAliveTimers.set(key, timer);
  }
  
  private removeConnection(key: string) {
    const timer = this.keepAliveTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.keepAliveTimers.delete(key);
    }
    this.connections.delete(key);
  }
  
  private getConnectionKey(config: any): string {
    return `${config.username}@${config.host}:${config.port || 22}`;
  }
}
```

## Auto-Reconnection

### Basic Auto-Reconnection

```typescript
// Configure automatic reconnection for unstable networks
const resilientSSH = new SSHAdapter({
  connectionPool: {
    enabled: true,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,     // 2-second initial delay
    keepAlive: true
  }
});

const ssh = $.with({ adapter: resilientSSH }).ssh({
  host: 'unreliable-server.example.com',
  username: 'user'
});

// Commands will automatically retry on connection failures
try {
  await ssh`long-running-command`;
} catch (error) {
  // Only throws after all reconnection attempts are exhausted
  console.error('Command failed after all reconnection attempts:', error.message);
}
```

### Exponential Backoff Reconnection

```typescript
class ExponentialBackoffSSH {
  private adapter: SSHAdapter;
  
  constructor() {
    this.adapter = new SSHAdapter({
      connectionPool: {
        enabled: true,
        autoReconnect: true,
        maxReconnectAttempts: 6,
        reconnectDelay: 1000,  // Base delay
        keepAlive: true
      }
    });
  }
  
  async executeWithBackoff(config: any, command: string, maxAttempts: number = 6) {
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      try {
        const ssh = $.with({ adapter: this.adapter }).ssh(config);
        return await ssh`${command}`;
      } catch (error) {
        attempt++;
        
        if (attempt >= maxAttempts) {
          throw new Error(`Command failed after ${maxAttempts} attempts: ${error.message}`);
        }
        
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await this.delay(delay);
      }
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Connection Limits and Management

### Enforcing Connection Limits

```typescript
// Monitor and enforce connection limits
class ConnectionLimitManager {
  private maxGlobalConnections = 50;
  private currentConnections = 0;
  private pendingRequests: Array<() => void> = [];
  
  async acquireConnection(config: any): Promise<any> {
    return new Promise((resolve) => {
      if (this.currentConnections < this.maxGlobalConnections) {
        this.currentConnections++;
        resolve(this.createConnection(config));
      } else {
        // Queue the request
        this.pendingRequests.push(() => {
          this.currentConnections++;
          resolve(this.createConnection(config));
        });
      }
    });
  }
  
  private createConnection(config: any) {
    const ssh = $.ssh(config);
    
    // Wrap to track connection release
    const originalExecute = ssh.execute?.bind(ssh) || (() => {});
    ssh.execute = async (...args: any[]) => {
      try {
        return await originalExecute(...args);
      } finally {
        this.releaseConnection();
      }
    };
    
    return ssh;
  }
  
  private releaseConnection() {
    this.currentConnections--;
    
    if (this.pendingRequests.length > 0) {
      const nextRequest = this.pendingRequests.shift();
      nextRequest?.();
    }
  }
}
```

### Per-Host Connection Limits

```typescript
class PerHostConnectionManager {
  private hostConnections = new Map<string, number>();
  private maxPerHost = 5;
  
  async executeWithHostLimit(config: any, command: string) {
    const host = config.host;
    const currentCount = this.hostConnections.get(host) || 0;
    
    if (currentCount >= this.maxPerHost) {
      throw new Error(`Maximum connections (${this.maxPerHost}) reached for host ${host}`);
    }
    
    // Track connection
    this.hostConnections.set(host, currentCount + 1);
    
    try {
      const ssh = $.ssh(config);
      return await ssh`${command}`;
    } finally {
      // Release connection
      const newCount = (this.hostConnections.get(host) || 1) - 1;
      if (newCount <= 0) {
        this.hostConnections.delete(host);
      } else {
        this.hostConnections.set(host, newCount);
      }
    }
  }
  
  getHostConnectionCount(host: string): number {
    return this.hostConnections.get(host) || 0;
  }
  
  getTotalConnections(): number {
    return Array.from(this.hostConnections.values()).reduce((sum, count) => sum + count, 0);
  }
}
```

## Connection Metrics and Monitoring

### Built-in Metrics

```typescript
// Access connection pool metrics
const adapter = new SSHAdapter({
  connectionPool: { enabled: true }
});

const ssh = $.with({ adapter }).ssh({
  host: 'server.example.com',
  username: 'user'
});

// Execute some commands
await ssh`uptime`;
await ssh`df -h`;

// Get detailed metrics
const metrics = adapter.getConnectionPoolMetrics();
console.log('Connection Pool Metrics:', {
  totalConnections: metrics.totalConnections,
  activeConnections: metrics.activeConnections,
  idleConnections: metrics.idleConnections,
  connectionsCreated: metrics.connectionsCreated,
  connectionsDestroyed: metrics.connectionsDestroyed,
  reuseCount: metrics.reuseCount,
  connectionsFailed: metrics.connectionsFailed
});
```

### Real-time Monitoring

```typescript
import { EventEmitter } from 'events';

class SSHConnectionMonitor extends EventEmitter {
  private adapter: SSHAdapter;
  private metricsInterval?: NodeJS.Timeout;
  
  constructor() {
    super();
    
    this.adapter = new SSHAdapter({
      connectionPool: {
        enabled: true,
        maxConnections: 10,
        keepAlive: true
      }
    });
    
    this.startMonitoring();
  }
  
  private startMonitoring() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.adapter.getConnectionPoolMetrics();
      this.emit('metrics', metrics);
      
      // Alert on high utilization
      const utilization = metrics.activeConnections / metrics.totalConnections;
      if (utilization > 0.8) {
        this.emit('high-utilization', { utilization, metrics });
      }
      
      // Alert on connection failures
      if (metrics.connectionsFailed > 0) {
        this.emit('connection-failures', { failures: metrics.connectionsFailed });
      }
    }, 5000); // Check every 5 seconds
  }
  
  createSSH(config: any) {
    return $.with({ adapter: this.adapter }).ssh(config);
  }
  
  dispose() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.adapter.dispose();
  }
}

// Usage
const monitor = new SSHConnectionMonitor();

monitor.on('metrics', (metrics) => {
  console.log(`Connections: ${metrics.activeConnections}/${metrics.totalConnections}`);
});

monitor.on('high-utilization', ({ utilization }) => {
  console.warn(`High connection utilization: ${(utilization * 100).toFixed(1)}%`);
});

monitor.on('connection-failures', ({ failures }) => {
  console.error(`Connection failures detected: ${failures}`);
});

const ssh = monitor.createSSH({ host: 'server.com', username: 'user' });
```

### Custom Metrics Collection

```typescript
class ConnectionMetricsCollector {
  private metrics = {
    connectionsCreated: 0,
    connectionsReused: 0,
    connectionsFailed: 0,
    totalCommandTime: 0,
    commandCount: 0,
    connectionTimes: [] as number[]
  };
  
  async monitoredExecute(config: any, command: string) {
    const startTime = Date.now();
    
    try {
      // Track connection creation vs reuse
      const ssh = $.ssh(config);
      const connectionStartTime = Date.now();
      
      const result = await ssh`${command}`;
      
      const totalTime = Date.now() - startTime;
      const connectionTime = Date.now() - connectionStartTime;
      
      // Update metrics
      this.metrics.totalCommandTime += totalTime;
      this.metrics.commandCount++;
      this.metrics.connectionTimes.push(connectionTime);
      
      // Keep only recent connection times
      if (this.metrics.connectionTimes.length > 100) {
        this.metrics.connectionTimes = this.metrics.connectionTimes.slice(-100);
      }
      
      return result;
    } catch (error) {
      this.metrics.connectionsFailed++;
      throw error;
    }
  }
  
  getMetrics() {
    const avgConnectionTime = this.metrics.connectionTimes.length > 0
      ? this.metrics.connectionTimes.reduce((sum, time) => sum + time, 0) / this.metrics.connectionTimes.length
      : 0;
    
    const avgCommandTime = this.metrics.commandCount > 0
      ? this.metrics.totalCommandTime / this.metrics.commandCount
      : 0;
    
    return {
      ...this.metrics,
      averageConnectionTime: avgConnectionTime,
      averageCommandTime: avgCommandTime,
      successRate: this.metrics.commandCount > 0
        ? (this.metrics.commandCount - this.metrics.connectionsFailed) / this.metrics.commandCount
        : 0
    };
  }
  
  reset() {
    this.metrics = {
      connectionsCreated: 0,
      connectionsReused: 0,
      connectionsFailed: 0,
      totalCommandTime: 0,
      commandCount: 0,
      connectionTimes: []
    };
  }
}
```

## Resource Cleanup

### Automatic Cleanup

```typescript
// Xec automatically handles cleanup, but you can control it explicitly
const ssh = $.ssh({
  host: 'server.example.com',
  username: 'deploy'
});

// Execute commands
await ssh`uptime`;
await ssh`df -h`;

// Connections are automatically returned to pool and cleaned up
// when idle timeout is reached or process exits
```

### Manual Connection Management

```typescript
class ManagedSSHConnection {
  private adapter: SSHAdapter;
  private activeConnections = new Set<string>();
  
  constructor() {
    this.adapter = new SSHAdapter({
      connectionPool: {
        enabled: true,
        idleTimeout: 300000,  // 5 minutes
        maxConnections: 10
      }
    });
    
    // Handle process shutdown
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }
  
  async execute(config: any, command: string) {
    const connectionKey = `${config.username}@${config.host}`;
    this.activeConnections.add(connectionKey);
    
    try {
      const ssh = $.with({ adapter: this.adapter }).ssh(config);
      return await ssh`${command}`;
    } finally {
      this.activeConnections.delete(connectionKey);
    }
  }
  
  async gracefulShutdown() {
    console.log('🛑 Shutting down SSH connections...');
    
    // Wait for active connections to finish
    while (this.activeConnections.size > 0) {
      console.log(`⏳ Waiting for ${this.activeConnections.size} active connections...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Dispose of the adapter to close all connections
    await this.adapter.dispose();
    console.log('✅ All SSH connections closed');
  }
}
```

### Connection Pool Drain

```typescript
// Gracefully drain connections before shutdown
class DrainableConnectionPool {
  private adapter: SSHAdapter;
  private isDraining = false;
  
  constructor() {
    this.adapter = new SSHAdapter({
      connectionPool: { enabled: true }
    });
  }
  
  async startDrain() {
    this.isDraining = true;
    console.log('🚰 Starting connection pool drain...');
    
    // Stop accepting new connections (implement in your application logic)
    // Wait for existing operations to complete
    // Close idle connections immediately
    
    const metrics = this.adapter.getConnectionPoolMetrics();
    console.log(`📊 Pool state: ${metrics.activeConnections} active, ${metrics.idleConnections} idle`);
    
    // Monitor drain progress
    const drainInterval = setInterval(() => {
      const currentMetrics = this.adapter.getConnectionPoolMetrics();
      console.log(`⏳ Drain progress: ${currentMetrics.activeConnections} connections remaining`);
      
      if (currentMetrics.totalConnections === 0) {
        clearInterval(drainInterval);
        console.log('✅ Connection pool drained');
      }
    }, 1000);
    
    // Force close after timeout
    setTimeout(async () => {
      clearInterval(drainInterval);
      await this.adapter.dispose();
      console.log('🔚 Connection pool forcibly closed');
    }, 30000); // 30-second timeout
  }
  
  async execute(config: any, command: string) {
    if (this.isDraining) {
      throw new Error('Connection pool is draining, no new connections accepted');
    }
    
    const ssh = $.with({ adapter: this.adapter }).ssh(config);
    return await ssh`${command}`;
  }
}
```

## Best Practices

### Do's ✅

```typescript
// ✅ Configure appropriate pool settings for your use case
const adapter = new SSHAdapter({
  connectionPool: {
    enabled: true,
    maxConnections: 10,        // Based on target server capacity
    idleTimeout: 300000,       // 5 minutes for typical workloads
    keepAlive: true,           // For long-running operations
    autoReconnect: true        // For unstable networks
  }
});

// ✅ Reuse SSH contexts for multiple commands
const ssh = $.ssh(serverConfig);
await ssh`command1`;
await ssh`command2`;
await ssh`command3`;

// ✅ Monitor connection metrics for optimization
const metrics = adapter.getConnectionPoolMetrics();
if (metrics.reuseCount / metrics.connectionsCreated < 2) {
  console.warn('Low connection reuse ratio');
}

// ✅ Handle connection failures gracefully
try {
  await ssh`risky-command`;
} catch (error) {
  if (error.message.includes('Connection closed')) {
    console.log('Connection lost, will auto-reconnect on next command');
  }
}

// ✅ Use appropriate timeouts
const ssh = $.ssh(serverConfig).timeout(30000); // 30-second timeout
```

### Don'ts ❌

```typescript
// ❌ Don't create new SSH contexts for each command
for (const command of commands) {
  await $.ssh(serverConfig)`${command}`; // Creates new connection each time
}

// ❌ Don't set unlimited connections
const bad = new SSHAdapter({
  connectionPool: {
    maxConnections: 1000 // Too many, will overwhelm servers
  }
});

// ❌ Don't ignore connection pool metrics
// Missing: Regular monitoring of pool health

// ❌ Don't disable pooling without good reason
const inefficient = new SSHAdapter({
  connectionPool: {
    enabled: false // Loses all performance benefits
  }
});

// ❌ Don't forget cleanup in long-running applications
// Missing: Proper disposal of adapters and connections
```

## Performance Tuning

### Connection Pool Sizing

```typescript
// Calculate optimal pool size based on workload
function calculateOptimalPoolSize(
  avgCommandsPerSecond: number,
  avgCommandDurationMs: number,
  targetConcurrency: number
): number {
  // Wilson's formula for connection pool sizing
  const minConnections = Math.ceil(avgCommandsPerSecond * (avgCommandDurationMs / 1000));
  const maxConnections = Math.ceil(minConnections * 1.5); // 50% buffer
  
  return Math.min(maxConnections, targetConcurrency);
}

// Example usage
const poolSize = calculateOptimalPoolSize(10, 2000, 20); // 10 cmd/s, 2s avg, max 20
console.log(`Recommended pool size: ${poolSize}`);
```

### Keep-Alive Optimization

```typescript
// Optimize keep-alive based on network characteristics
function optimizeKeepAlive(networkLatencyMs: number, serverTimeoutMs: number) {
  // Keep-alive interval should be less than server timeout
  const keepAliveInterval = Math.min(
    serverTimeoutMs * 0.5,  // 50% of server timeout
    Math.max(15000, networkLatencyMs * 10)  // At least 15s, scale with latency
  );
  
  return {
    keepAlive: true,
    keepAliveInterval,
    idleTimeout: serverTimeoutMs * 0.8 // 80% of server timeout
  };
}

// Apply optimized settings
const networkLatency = 50; // 50ms
const serverTimeout = 300000; // 5 minutes
const optimized = optimizeKeepAlive(networkLatency, serverTimeout);

const adapter = new SSHAdapter({
  connectionPool: optimized
});
```

## See Also

- [SSH Batch Operations](./batch-operations.md) - Multi-host execution patterns
- [SSH Authentication](./authentication.md) - Authentication methods and security
- [SSH Tunneling](./tunneling.md) - Port forwarding and tunnel management
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling) - Generic connection pooling concepts
- [Performance Optimization](/docs/core/execution-engine/performance/optimization) - Performance tuning strategies