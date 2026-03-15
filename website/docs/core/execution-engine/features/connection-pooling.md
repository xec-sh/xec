# Connection Pooling

Connection pooling is a critical performance optimization feature in the Xec execution engine, particularly for SSH connections where establishing new connections is expensive.

## Overview

Connection pooling (`packages/core/src/ssh/connection-pool.ts`) provides:

- **Automatic connection reuse** across multiple commands
- **Configurable pool sizes** with min/max connections
- **Idle timeout management** for resource cleanup
- **Connection health checks** with automatic reconnection
- **Fair scheduling** with queue management
- **Metrics and monitoring** for pool performance

## SSH Connection Pooling

### Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Connection pooling is automatic for SSH
const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '~/.ssh/id_rsa'
});

// These commands reuse the same connection
await remote`uptime`;
await remote`free -h`;
await remote`df -h`;
```

### Pool Configuration

```typescript
// Configure pool behavior
const pooled = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    min: 2,              // Minimum connections to maintain
    max: 10,             // Maximum connections allowed
    idle: 60000,         // Idle timeout in ms
    acquire: 10000,      // Acquire timeout in ms
    evictionRun: 30000,  // How often to check for idle connections
    validate: true       // Validate connections before use
  }
});
```

### Advanced Pool Management

```typescript
// Get pool statistics
const stats = await remote.getPoolStats();
console.log('Active connections:', stats.active);
console.log('Idle connections:', stats.idle);
console.log('Waiting requests:', stats.waiting);

// Pre-warm connections
await remote.warmPool(5);  // Create 5 connections

// Drain pool (graceful shutdown)
await remote.drainPool();  // Close idle, wait for active

// Force close all connections
await remote.closePool();  // Immediate termination
```

## Connection Lifecycle

### Connection States

```typescript
// Connection states in the pool
enum ConnectionState {
  IDLE = 'idle',           // Available for use
  ACTIVE = 'active',       // Currently in use
  VALIDATING = 'validating', // Being validated
  CLOSING = 'closing'      // Being closed
}

// Monitor connection state changes
remote.on('connection:state', ({ id, from, to }) => {
  console.log(`Connection ${id}: ${from} -> ${to}`);
});
```

### Health Checks

```typescript
// Configure health checks
const healthy = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    validate: true,
    validateInterval: 10000,  // Check every 10s
    validateOnBorrow: true,   // Check before use
    validateOnReturn: false   // Skip check on return
  }
});

// Custom validation function
const custom = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    validator: async (connection) => {
      try {
        await connection.exec('echo ping');
        return true;
      } catch {
        return false;
      }
    }
  }
});
```

## Multi-Host Pooling

### Pool per Host

```typescript
// Each host gets its own pool
const hosts = [
  'web1.example.com',
  'web2.example.com',
  'web3.example.com'
];

const pools = hosts.map(host => 
  $.ssh({
    host,
    username: 'deploy',
    pool: { min: 1, max: 3 }
  })
);

// Execute on all hosts (uses separate pools)
await Promise.all(
  pools.map(pool => pool`systemctl restart nginx`)
);
```

### Shared Pool Configuration

```typescript
// Global pool configuration
const poolConfig = {
  min: 2,
  max: 5,
  idle: 30000
};

// Apply to multiple connections
const production = $.ssh({
  host: 'prod.example.com',
  username: 'deploy',
  pool: poolConfig
});

const staging = $.ssh({
  host: 'staging.example.com',
  username: 'deploy',
  pool: poolConfig
});
```

## Performance Optimization

### Connection Reuse Patterns

```typescript
// Good: Reuse connection for batch operations
const remote = $.ssh({ host: 'server.com', username: 'user' });

async function deployApplication() {
  // All commands use the same connection
  await remote`git pull`;
  await remote`npm install`;
  await remote`npm run build`;
  await remote`pm2 restart app`;
}

// Bad: Creating new connections
async function inefficientDeploy() {
  await $.ssh({ host: 'server.com' })`git pull`;
  await $.ssh({ host: 'server.com' })`npm install`;
  await $.ssh({ host: 'server.com' })`npm run build`;
  await $.ssh({ host: 'server.com' })`pm2 restart app`;
}
```

### Pre-warming Strategies

```typescript
// Pre-warm connections during startup
async function initializeApp() {
  const servers = ['web1', 'web2', 'web3'].map(host =>
    $.ssh({ host: `${host}.example.com`, username: 'deploy' })
  );
  
  // Warm all pools in parallel
  await Promise.all(
    servers.map(server => server.warmPool(2))
  );
  
  console.log('Connection pools ready');
  return servers;
}
```

### Queue Management

```typescript
// Configure queue behavior
const queued = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    max: 5,
    queueSize: 100,        // Max waiting requests
    queueTimeout: 5000,    // Max wait time
    queuePriority: 'fifo'  // or 'lifo'
  }
});

// Handle queue overflow
queued.on('pool:queue:full', () => {
  console.warn('Connection pool queue is full');
});
```

## Connection Sharing

### Multiplexing

```typescript
// SSH connection multiplexing (ControlMaster)
const multiplexed = $.ssh({
  host: 'server.com',
  username: 'user',
  controlMaster: true,      // Enable multiplexing
  controlPath: '~/.ssh/cm_%r@%h:%p',
  controlPersist: '10m'     // Keep master alive
});

// Subsequent connections are instant
await multiplexed`command1`;
await multiplexed`command2`;
await multiplexed`command3`;
```

### Connection Borrowing

```typescript
// Explicit connection management
const pool = $.ssh({ host: 'server.com', username: 'user' });

// Borrow connection for custom use
const conn = await pool.acquire();
try {
  // Use connection directly
  const result = await conn.exec('custom command');
  console.log(result);
} finally {
  // Always return to pool
  await pool.release(conn);
}
```

## Monitoring and Metrics

### Pool Metrics

```typescript
// Enable metrics collection
const monitored = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    metrics: true,
    metricsInterval: 5000
  }
});

// Listen for metrics
monitored.on('pool:metrics', (metrics) => {
  console.log('Pool metrics:', {
    created: metrics.connectionsCreated,
    destroyed: metrics.connectionsDestroyed,
    acquired: metrics.totalAcquired,
    released: metrics.totalReleased,
    avgWaitTime: metrics.averageWaitTime,
    utilizationRate: metrics.utilizationRate
  });
});
```

### Connection Events

```typescript
// Monitor pool events
const pool = $.ssh({ host: 'server.com', username: 'user' });

pool.on('connection:create', ({ id }) => {
  console.log(`Created connection ${id}`);
});

pool.on('connection:acquire', ({ id, waitTime }) => {
  console.log(`Acquired connection ${id} after ${waitTime}ms`);
});

pool.on('connection:release', ({ id, duration }) => {
  console.log(`Released connection ${id} after ${duration}ms use`);
});

pool.on('connection:destroy', ({ id, reason }) => {
  console.log(`Destroyed connection ${id}: ${reason}`);
});
```

## Error Handling

### Connection Failures

```typescript
const resilient = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    max: 5,
    retryFailed: true,      // Retry failed connections
    retryAttempts: 3,       // Number of retries
    retryDelay: 1000,       // Delay between retries
    recreateOnError: true   // Recreate failed connections
  }
});

// Handle pool errors
resilient.on('pool:error', (error) => {
  console.error('Pool error:', error);
  // Implement fallback logic
});
```

### Circuit Breaker

```typescript
// Circuit breaker for failing hosts
const breaker = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    circuitBreaker: {
      enabled: true,
      threshold: 5,        // Failures to open circuit
      timeout: 30000,      // Time before retry
      resetTimeout: 60000  // Time to reset counters
    }
  }
});

breaker.on('circuit:open', () => {
  console.warn('Circuit breaker opened - host unavailable');
});

breaker.on('circuit:half-open', () => {
  console.log('Circuit breaker testing connection');
});

breaker.on('circuit:close', () => {
  console.log('Circuit breaker closed - host recovered');
});
```

## Best Practices

### Do's ✅

```typescript
// ✅ Reuse connections for multiple commands
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`command1`;
await remote`command2`;

// ✅ Configure appropriate pool sizes
const sized = $.ssh({
  host: 'server.com',
  username: 'user',
  pool: {
    min: 2,    // Handle baseline load
    max: 10    // Handle peak load
  }
});

// ✅ Clean up pools when done
try {
  await remote`commands`;
} finally {
  await remote.closePool();
}

// ✅ Monitor pool health
remote.on('pool:metrics', (metrics) => {
  if (metrics.utilizationRate > 0.8) {
    console.warn('Pool utilization high');
  }
});
```

### Don'ts ❌

```typescript
// ❌ Create new connections for each command
for (const cmd of commands) {
  await $.ssh({ host: 'server.com' })`${cmd}`;
}

// ❌ Use excessive pool sizes
const oversized = $.ssh({
  host: 'server.com',
  pool: { max: 1000 }  // Too many connections
});

// ❌ Ignore pool cleanup
process.exit(0);  // Connections not closed properly

// ❌ Disable validation for long-lived pools
const unvalidated = $.ssh({
  host: 'server.com',
  pool: { validate: false }  // Risky for long-running apps
});
```

## Implementation Details

Connection pooling is implemented in:
- `packages/core/src/ssh/connection-pool.ts` - Main pool implementation
- `packages/core/src/ssh/pool-manager.ts` - Pool lifecycle management
- `packages/core/src/ssh/connection-validator.ts` - Health checking
- `packages/core/src/utils/resource-pool.ts` - Generic pool base class

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [Error Handling](/docs/core/execution-engine/features/error-handling)