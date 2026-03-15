# Connection Reuse

Maximizing performance by reusing connections across multiple operations, reducing connection overhead and latency.

## Overview

Connection reuse (`packages/core/src/utils/connection-reuse.ts`) provides:

- **SSH connection multiplexing** for shared sessions
- **Docker connection persistence** across commands
- **Kubernetes client reuse** for API efficiency
- **Connection warming** for predictive optimization
- **Automatic cleanup** with lifecycle management
- **Health monitoring** for connection validity

## SSH Connection Reuse

### Connection Multiplexing

```typescript
import { $ } from '@xec-sh/core';

// Enable SSH multiplexing
const remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  controlMaster: true,
  controlPath: '~/.ssh/cm_%r@%h:%p',
  controlPersist: '10m'  // Keep connection alive for 10 minutes
});

// All commands share the same connection
await remote`uptime`;         // Creates master connection
await remote`free -h`;        // Reuses connection (instant)
await remote`df -h`;          // Reuses connection (instant)
await remote`ps aux | head`;  // Reuses connection (instant)
```

### Manual Connection Management

```typescript
// Explicitly manage connection lifecycle
class SSHConnectionManager {
  private connections = new Map<string, any>();
  
  async getConnection(host: string, options: any) {
    const key = `${host}:${options.username}`;
    
    if (!this.connections.has(key)) {
      const conn = await this.createConnection(host, options);
      this.connections.set(key, conn);
    }
    
    return this.connections.get(key);
  }
  
  private async createConnection(host: string, options: any) {
    const conn = $.ssh({ host, ...options });
    
    // Pre-establish connection
    await conn.connect();
    
    // Setup keepalive
    conn.on('ready', () => {
      conn.setKeepAlive(true, 10000);
    });
    
    return conn;
  }
  
  async execute(host: string, command: string, options = {}) {
    const conn = await this.getConnection(host, options);
    return conn`${command}`;
  }
  
  async closeAll() {
    for (const conn of this.connections.values()) {
      await conn.disconnect();
    }
    this.connections.clear();
  }
}

// Use connection manager
const manager = new SSHConnectionManager();
await manager.execute('server1', 'ls -la');
await manager.execute('server1', 'ps aux');  // Reuses connection
await manager.closeAll();
```

## Docker Connection Reuse

### Docker Client Persistence

```typescript
// Reuse Docker client across operations
class DockerConnectionPool {
  private client: any;
  private lastUsed: number;
  private idleTimeout = 60000;  // 1 minute
  
  async getClient() {
    if (!this.client || this.isExpired()) {
      this.client = await this.createClient();
    }
    
    this.lastUsed = Date.now();
    return this.client;
  }
  
  private async createClient() {
    return $.docker.connect({
      socketPath: '/var/run/docker.sock',
      timeout: 10000
    });
  }
  
  private isExpired() {
    return Date.now() - this.lastUsed > this.idleTimeout;
  }
  
  async execute(container: string, command: string) {
    const client = await this.getClient();
    return client.exec(container, command);
  }
}

// Share Docker connection
const dockerPool = new DockerConnectionPool();
await dockerPool.execute('web', 'ps aux');
await dockerPool.execute('db', 'mysql -e "SHOW DATABASES"');
```

### Container Session Reuse

```typescript
// Reuse exec sessions in containers
class ContainerSession {
  private sessions = new Map<string, any>();
  
  async getSession(container: string) {
    if (!this.sessions.has(container)) {
      const session = await $.docker({ container }).createExecSession({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ['/bin/sh']
      });
      
      await session.start();
      this.sessions.set(container, session);
    }
    
    return this.sessions.get(container);
  }
  
  async execute(container: string, command: string) {
    const session = await this.getSession(container);
    return session.write(`${command}\\n`);
  }
  
  async closeAll() {
    for (const session of this.sessions.values()) {
      await session.end();
    }
    this.sessions.clear();
  }
}

// Reuse container sessions
const sessions = new ContainerSession();
await sessions.execute('app', 'cd /app && ls');
await sessions.execute('app', 'npm list');  // Same session, preserves directory
```

## Kubernetes Connection Reuse

### Kubectl Context Sharing

```typescript
// Share kubectl configuration
class KubeConnectionManager {
  private contexts = new Map<string, any>();
  
  async getContext(namespace: string) {
    if (!this.contexts.has(namespace)) {
      const context = $.k8s.createContext({
        namespace,
        kubeconfig: process.env.KUBECONFIG,
        cluster: 'production'
      });
      
      this.contexts.set(namespace, context);
    }
    
    return this.contexts.get(namespace);
  }
  
  async execute(namespace: string, pod: string, command: string) {
    const context = await this.getContext(namespace);
    return context.exec(pod, command);
  }
  
  async portForward(namespace: string, pod: string, ports: any) {
    const context = await this.getContext(namespace);
    return context.portForward(pod, ports);
  }
}

// Share K8s connections
const k8s = new KubeConnectionManager();
await k8s.execute('production', 'web-pod', 'ls');
await k8s.portForward('production', 'web-pod', { local: 8080, remote: 80 });
```

### API Client Reuse

```typescript
// Reuse Kubernetes API client
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';

class K8sApiPool {
  private apis = new Map<string, CoreV1Api>();
  private config: KubeConfig;
  
  constructor() {
    this.config = new KubeConfig();
    this.config.loadFromDefault();
  }
  
  getApi(context: string): CoreV1Api {
    if (!this.apis.has(context)) {
      this.config.setCurrentContext(context);
      const api = this.config.makeApiClient(CoreV1Api);
      this.apis.set(context, api);
    }
    
    return this.apis.get(context)!;
  }
  
  async listPods(namespace: string, context = 'default') {
    const api = this.getApi(context);
    const { body } = await api.listNamespacedPod(namespace);
    return body.items;
  }
  
  async execInPod(namespace: string, pod: string, command: string[]) {
    const api = this.getApi('default');
    // Reuses authenticated API client
    return api.connect({/* exec options */});
  }
}
```

## Connection Warming

### Predictive Connection Creation

```typescript
// Pre-warm connections before use
class ConnectionWarmer {
  private predictions = new Map<string, number>();
  
  async warmConnections(hosts: string[]) {
    // Create connections in parallel
    const promises = hosts.map(host => 
      $.ssh({ host, username: 'user' }).connect()
        .then(conn => ({ host, conn }))
        .catch(err => ({ host, error: err }))
    );
    
    const results = await Promise.all(promises);
    
    // Track success rate
    for (const result of results) {
      if (!result.error) {
        this.recordSuccess(result.host);
      }\n    }\n    \n    return results.filter(r => !r.error).map(r => r.conn);\n  }\n  \n  private recordSuccess(host: string) {\n    const count = this.predictions.get(host) || 0;\n    this.predictions.set(host, count + 1);\n  }\n  \n  getPredictions(): string[] {\n    // Return hosts likely to be used\n    return Array.from(this.predictions.entries())\n      .sort((a, b) => b[1] - a[1])\n      .slice(0, 5)\n      .map(([host]) => host);\n  }\n}\n\n// Warm likely connections\nconst warmer = new ConnectionWarmer();\nconst likely = warmer.getPredictions();\nawait warmer.warmConnections(likely);\n```\n\n### Scheduled Warming\n\n```typescript\n// Keep connections warm with periodic activity\nclass ConnectionKeepAlive {\n  private connections = new Map<string, any>();\n  private intervals = new Map<string, NodeJS.Timer>();\n  \n  register(name: string, connection: any, intervalMs = 30000) {\n    this.connections.set(name, connection);\n    \n    // Send keepalive periodically\n    const interval = setInterval(async () => {\n      try {\n        await connection`echo keepalive > /dev/null`;\n      } catch (error) {\n        console.error(`Keepalive failed for ${name}:`, error);\n        this.reconnect(name);\n      }\n    }, intervalMs);\n    \n    this.intervals.set(name, interval);\n  }\n  \n  private async reconnect(name: string) {\n    const old = this.connections.get(name);\n    if (old) {\n      try {\n        await old.reconnect();\n      } catch (error) {\n        console.error(`Reconnection failed for ${name}`);\n        this.unregister(name);\n      }\n    }\n  }\n  \n  unregister(name: string) {\n    const interval = this.intervals.get(name);\n    if (interval) {\n      clearInterval(interval);\n      this.intervals.delete(name);\n    }\n    this.connections.delete(name);\n  }\n  \n  async closeAll() {\n    for (const name of this.connections.keys()) {\n      this.unregister(name);\n    }\n  }\n}\n\n// Keep critical connections warm\nconst keepAlive = new ConnectionKeepAlive();\nkeepAlive.register('prod-db', $.ssh('db.prod.example.com'));\nkeepAlive.register('prod-web', $.ssh('web.prod.example.com'));\n```\n\n## Connection Health Monitoring\n\n### Health Checks\n\n```typescript\n// Monitor connection health\nclass ConnectionHealthMonitor {\n  private checks = new Map<string, {\n    connection: any;\n    lastCheck: number;\n    healthy: boolean;\n    failures: number;\n  }>();\n  \n  register(name: string, connection: any) {\n    this.checks.set(name, {\n      connection,\n      lastCheck: 0,\n      healthy: true,\n      failures: 0\n    });\n  }\n  \n  async checkHealth(name: string): Promise<boolean> {\n    const check = this.checks.get(name);\n    if (!check) return false;\n    \n    try {\n      // Simple health check\n      await check.connection`echo health`.timeout(5000);\n      \n      check.healthy = true;\n      check.failures = 0;\n      check.lastCheck = Date.now();\n      \n      return true;\n    } catch (error) {\n      check.failures++;\n      \n      if (check.failures >= 3) {\n        check.healthy = false;\n        await this.handleUnhealthy(name);\n      }\n      \n      return false;\n    }\n  }\n  \n  private async handleUnhealthy(name: string) {\n    const check = this.checks.get(name);\n    if (!check) return;\n    \n    console.log(`Connection ${name} is unhealthy, attempting recovery`);\n    \n    try {\n      await check.connection.reconnect();\n      check.healthy = true;\n      check.failures = 0;\n    } catch (error) {\n      console.error(`Failed to recover ${name}:`, error);\n      this.checks.delete(name);\n    }\n  }\n  \n  async checkAll() {\n    const results = await Promise.all(\n      Array.from(this.checks.keys()).map(name => \n        this.checkHealth(name).then(healthy => ({ name, healthy }))\n      )\n    );\n    \n    return results;\n  }\n}\n\n// Monitor connections\nconst monitor = new ConnectionHealthMonitor();\nmonitor.register('server1', $.ssh('server1'));\nmonitor.register('server2', $.ssh('server2'));\n\nsetInterval(async () => {\n  const health = await monitor.checkAll();\n  console.log('Connection health:', health);\n}, 60000);\n```\n\n## Lifecycle Management\n\n### Automatic Cleanup\n\n```typescript\n// Manage connection lifecycle\nclass ConnectionLifecycle {\n  private connections = new Map<string, {\n    connection: any;\n    created: number;\n    lastUsed: number;\n    useCount: number;\n  }>();\n  \n  private maxAge = 3600000;      // 1 hour\n  private maxIdleTime = 300000;  // 5 minutes\n  \n  async get(key: string, factory: () => Promise<any>) {\n    let entry = this.connections.get(key);\n    \n    if (!entry || this.shouldReplace(entry)) {\n      if (entry) {\n        await this.close(key);\n      }\n      \n      const connection = await factory();\n      entry = {\n        connection,\n        created: Date.now(),\n        lastUsed: Date.now(),\n        useCount: 0\n      };\n      \n      this.connections.set(key, entry);\n    }\n    \n    entry.lastUsed = Date.now();\n    entry.useCount++;\n    \n    return entry.connection;\n  }\n  \n  private shouldReplace(entry: any): boolean {\n    const age = Date.now() - entry.created;\n    const idle = Date.now() - entry.lastUsed;\n    \n    return age > this.maxAge || idle > this.maxIdleTime;\n  }\n  \n  async close(key: string) {\n    const entry = this.connections.get(key);\n    if (entry) {\n      try {\n        await entry.connection.close();\n      } catch (error) {\n        console.error(`Error closing connection ${key}:`, error);\n      }\n      this.connections.delete(key);\n    }\n  }\n  \n  async closeIdle() {\n    const now = Date.now();\n    const toClose = [];\n    \n    for (const [key, entry] of this.connections) {\n      if (now - entry.lastUsed > this.maxIdleTime) {\n        toClose.push(key);\n      }\n    }\n    \n    await Promise.all(toClose.map(key => this.close(key)));\n  }\n  \n  async closeAll() {\n    await Promise.all(\n      Array.from(this.connections.keys()).map(key => this.close(key))\n    );\n  }\n  \n  getStats() {\n    const stats = [];\n    const now = Date.now();\n    \n    for (const [key, entry] of this.connections) {\n      stats.push({\n        key,\n        age: now - entry.created,\n        idle: now - entry.lastUsed,\n        useCount: entry.useCount\n      });\n    }\n    \n    return stats;\n  }\n}\n\n// Use lifecycle manager\nconst lifecycle = new ConnectionLifecycle();\n\n// Get connection (creates or reuses)\nconst conn = await lifecycle.get('server1', () => \n  $.ssh({ host: 'server1', username: 'user' })\n);\n\n// Periodic cleanup\nsetInterval(() => lifecycle.closeIdle(), 60000);\n\n// Cleanup on exit\nprocess.on('exit', () => lifecycle.closeAll());\n```\n\n## Best Practices\n\n### Do's ✅\n\n```typescript\n// ✅ Reuse connections for multiple commands\nconst ssh = $.ssh({ host: 'server' });\nawait ssh`command1`;\nawait ssh`command2`;\nawait ssh`command3`;\n\n// ✅ Use connection pooling\nconst pool = new ConnectionPool({ max: 5 });\nawait pool.execute('command');\n\n// ✅ Implement health checks\nif (!await connection.isHealthy()) {\n  await connection.reconnect();\n}\n\n// ✅ Clean up connections\nprocess.on('SIGTERM', async () => {\n  await closeAllConnections();\n});\n\n// ✅ Monitor connection metrics\nconst stats = connectionManager.getStats();\nconsole.log('Active connections:', stats.active);\n```\n\n### Don'ts ❌\n\n```typescript\n// ❌ Create new connections for each command\nfor (const cmd of commands) {\n  await $.ssh({ host: 'server' })`${cmd}`;  // New connection each time\n}\n\n// ❌ Ignore connection limits\nconst connections = [];\nfor (let i = 0; i < 1000; i++) {\n  connections.push($.ssh('server'));  // Too many!\n}\n\n// ❌ Keep connections forever\nconst conn = $.ssh('server');\n// Never closed or managed\n\n// ❌ Ignore connection errors\ntry {\n  await connection`command`;\n} catch {\n  // Connection might be dead, but we ignore it\n}\n```\n\n## Implementation Details\n\nConnection reuse is implemented in:\n- `packages/core/src/utils/connection-reuse.ts` - Connection reuse strategies\n- `packages/core/src/ssh/connection-manager.ts` - SSH connection management\n- `packages/core/src/docker/client-pool.ts` - Docker client pooling\n- `packages/core/src/k8s/context-manager.ts` - Kubernetes context management\n\n## See Also\n\n- [Connection Pooling](/core/execution-engine/features/connection-pooling)\n- [Performance Optimization](/core/execution-engine/performance/optimization)\n- [SSH Adapter](/core/execution-engine/adapters/ssh-adapter)\n- [Parallel Execution](/core/execution-engine/performance/parallel-execution)