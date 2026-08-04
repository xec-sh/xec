# Connection Pooling

Connection pooling is a critical performance optimization feature in the Xec execution engine, particularly for SSH connections where establishing new connections is expensive.

## Overview

Connection pooling (`packages/core/src/adapters/ssh/index.ts`) provides:

- **Automatic connection reuse** across multiple commands to the same host — entirely internal, there is no manual borrow/release API
- **A single pool size limit** (`maxConnections`) rather than separate min/max
- **Idle timeout management** for resource cleanup
- **Keepalive pings** to detect a dead connection before it's reused
- **Metrics** on connections created, destroyed, reused and currently active

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

Pool behavior is adapter configuration, not a per-target option — there is
no `pool` field on `$.ssh(options)`. Configure it when the engine is built,
or by registering a pre-configured adapter:

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

const engine = new ExecutionEngine({
  adapters: {
    ssh: {
      connectionPool: {
        maxConnections: 20,     // default: 10
        idleTimeout: 60000,     // ms before an idle connection is evicted; default: 300000 (5 min)
        keepAlive: true,        // default: true
        keepAliveInterval: 30000, // ms between keepalive pings; default: 30000
      }
    }
  }
});

const $ = createCallableEngine(engine);
```

```typescript
import { $, SSHAdapter } from '@xec-sh/core';

// Or register a configured adapter on the default engine
$.registerAdapter('ssh', new SSHAdapter({
  connectionPool: { maxConnections: 20 }
}));
```

There is no separate `min` (a floor of pre-created connections) — the pool
only grows on demand, up to `maxConnections`.

### Pool Metrics

```typescript
import { SSHAdapter } from '@xec-sh/core';

const adapter = $.getAdapter('ssh') as SSHAdapter;
const metrics = adapter.getPoolMetrics();

console.log('Active connections:', metrics.activeConnections);
console.log('Idle connections:', metrics.idleConnections);
console.log('Total ever created:', metrics.connectionsCreated);
console.log('Reused (avoided a new connection):', metrics.reuseCount);
```

`getPoolMetrics()` returns `activeConnections`, `idleConnections`,
`totalConnections`, `connectionsCreated`, `connectionsDestroyed`,
`connectionsFailed`, `reuseCount`, `averageIdleTime`, `averageUseCount` and
`lastCleanup`. There is no `.warmPool()`, `.drainPool()` or `.closePool()`
on the SSH context — connections are created lazily on first use per host,
and released when the engine is disposed (`$.dispose()` or
`await dispose()` for the global engine).

## Connection Lifecycle Events

There is no `connection:state` event and no manual connection state
enum — but the engine does emit real events for the SSH connection
lifecycle, on `$` itself (not on the target-bound context):

```typescript
$.on('ssh:connect', ({ host, port, username }) => {
  console.log(`Connected to ${host}`);
});

$.on('ssh:disconnect', ({ host, reason }) => {
  console.log(`Disconnected from ${host}: ${reason ?? 'unknown reason'}`);
});

$.on('ssh:reconnect', ({ host, attempts, success }) => {
  console.log(`Reconnect attempt ${attempts} for ${host}: ${success ? 'ok' : 'failed'}`);
});

$.on('ssh:pool-metrics', ({ metrics }) => {
  if (metrics.activeConnections / metrics.totalConnections > 0.8) {
    console.warn('Pool utilization high');
  }
});

$.on('ssh:pool-cleanup', ({ cleaned, remaining, reason }) => {
  console.log(`Evicted ${cleaned} idle connections (${reason}), ${remaining} left`);
});
```

### Health Checks

There is no configurable validation strategy (`validateOnBorrow`, a custom
validator function, and so on) — keepalive is the health check, and a
connection that fails it is evicted and replaced automatically the next
time it's needed. `keepAlive`/`keepAliveInterval` (shown above) are the only
two knobs.

## Multi-Host Pooling

Each host gets its own connections within the pool automatically — there is
one pool per adapter instance, keyed by host, not one pool per `$.ssh()`
call:

```typescript
const hosts = [
  'web1.example.com',
  'web2.example.com',
  'web3.example.com'
];

// Each of these targets the same underlying pool, keyed by host
const remotes = hosts.map(host => $.ssh({ host, username: 'deploy' }));

await Promise.all(
  remotes.map(remote => remote`systemctl restart nginx`)
);
```

## Performance Optimization

### Connection Reuse Patterns

```typescript
// Good: reuse one context for batch operations
const remote = $.ssh({ host: 'server.com', username: 'user' });

async function deployApplication() {
  await remote`git pull`;
  await remote`npm install`;
  await remote`npm run build`;
  await remote`pm2 restart app`;
}

// Also fine: pooling matches by host/user/port, so separately-constructed
// contexts targeting the same host still share a connection
async function alsoFine() {
  await $.ssh({ host: 'server.com', username: 'user' })`git pull`;
  await $.ssh({ host: 'server.com', username: 'user' })`npm install`;
}
```

Creating a context with `$.ssh({...})` is cheap either way — it doesn't
open a connection by itself, only running a command against it does, and
the pool is what decides whether that reuses an existing connection.

## Connection Multiplexing

`SSHAdapterConfig` has a `multiplexing` field
(`{ enabled, controlPath?, controlPersist? }`, mirroring OpenSSH's
`ControlMaster`), but it is not currently wired into connection
establishment — setting it has no effect yet. The connection pool described
above is what actually avoids repeated handshakes today.

## Error Handling

There is no `pool:error` event, no built-in retry/circuit-breaker
configuration for the pool, and no `recreateOnError` option — a failed
connection surfaces as a normal thrown error (typically a `ConnectionError`
or an `ExecutionError` with `kind: 'connection-lost'` /
`'connection-refused'`) from whatever command tried to use it:

```typescript
import { ExecutionError } from '@xec-sh/core';

try {
  await remote`some-command`;
} catch (error) {
  if (error instanceof ExecutionError && error.recoverable) {
    // connection-lost or connection-refused — a fresh attempt may succeed
  }
}
```

Build retry behavior on top with `retry()` or `$.retry({...})`, the same as
for any other command — see [Error Handling](/docs/core/execution-engine/features/error-handling).

## Best Practices

### Do's ✅

```typescript
// ✅ Reuse one context for multiple commands against the same host
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`command1`;
await remote`command2`;

// ✅ Size the pool for your actual concurrency
const engine = new ExecutionEngine({
  adapters: { ssh: { connectionPool: { maxConnections: 20 } } }
});

// ✅ Dispose the engine when your program is done with it, so pooled
// connections are closed instead of left open
await $.dispose();

// ✅ Watch utilization via the real metrics
$.on('ssh:pool-metrics', ({ metrics }) => {
  if (metrics.activeConnections >= metrics.totalConnections) {
    console.warn('Pool saturated');
  }
});
```

### Don'ts ❌

```typescript
// ❌ Assume every $.ssh({...}) call opens a new connection — it doesn't;
// the pool matches on host/user/port regardless of how many contexts
// point at them

// ❌ Set maxConnections far above what you'll actually run concurrently
const oversized = new ExecutionEngine({
  adapters: { ssh: { connectionPool: { maxConnections: 1000 } } }
});

// ❌ Exit the process without disposing the engine
process.exit(0);  // Pooled connections are not closed cleanly
```

## Implementation Details

Connection pooling is implemented in:
- `packages/core/src/adapters/ssh/index.ts` - `SSHAdapter`'s connection pool, keepalive and eviction
- `packages/core/src/adapters/ssh/connection-pool-metrics.ts` - `ConnectionPoolMetricsCollector`

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
