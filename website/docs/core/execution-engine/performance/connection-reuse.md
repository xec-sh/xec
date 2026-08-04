# Connection Reuse

Reducing connection overhead by reusing transport connections across multiple commands.

## Overview

Connection reuse is automatic and adapter-specific:

- **SSH** holds a pool of live connections (via `ssh2`) keyed by host/port/user, reused across every command run against that target. This is the only adapter with a real, persistent connection to reuse.
- **Docker** and **Kubernetes** shell out to the `docker`/`kubectl` CLI per command. There is no persistent connection object at the Xec level to pool — whatever connection reuse happens (e.g. the Docker daemon's own socket handling) is internal to those tools, not something Xec manages or exposes.
- **Local** has no connection concept at all.

There is no manual pool object to create or manage for any adapter — you get reuse simply by running more than one command against the same target.

## SSH Connection Pooling

### Automatic Reuse

```typescript
import { $ } from '@xec-sh/core';

const remote = $.ssh({ host: 'server.example.com', username: 'deploy' });

// All of these share one pooled connection
await remote`uptime`;
await remote`free -h`;
await remote`df -h`;
await remote`ps aux | head`;
```

Reuse is keyed by the full connection identity — host, port, username, and a
hash of the credential material (private key or password, never the
credential itself) — so two callers with different credentials for the same
host never share a connection, but two `$.ssh(...)` calls with the same
target and credentials do, even if they were created separately:

```typescript
await $.ssh('deploy@server.example.com')`uptime`;
await $.ssh('deploy@server.example.com')`df -h`; // reuses the same connection
```

### Pool Configuration

Pool behavior is set per adapter instance, not per command, through
`ExecutionEngineConfig.adapters.ssh` (typed as `SSHAdapterConfig`, exported
from `@xec-sh/core`):

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const $ = new ExecutionEngine({
  adapters: {
    ssh: {
      connectionPool: {
        enabled: true,
        maxConnections: 10,
        idleTimeout: 60000,       // close idle connections after 1 minute
        maxLifetime: 3600000,     // force a fresh connection after 1 hour
        keepAlive: true,
        keepAliveInterval: 10000,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelay: 1000,
      },
      // SSH multiplexing (ControlMaster-style connection sharing)
      multiplexing: {
        enabled: true,
        controlPath: '~/.ssh/cm_%r@%h:%p',
        controlPersist: '10m',
      },
    },
  },
});
```

### Observing the Pool

The adapter emits events rather than exposing a pool object to poll:

```typescript
$.on('ssh:pool-metrics', ({ metrics }) => {
  console.log(
    `active=${metrics.activeConnections} idle=${metrics.idleConnections} ` +
    `reused=${metrics.reuseCount}`
  );
});

$.on('ssh:reconnect', ({ host, attempts, success }) => {
  console.log(`reconnect to ${host}: attempt ${attempts}, success=${success}`);
});
```

## Docker and Kubernetes

Neither adapter holds a reusable connection object. Each command is its own
`docker exec`/`docker run` or `kubectl exec` invocation:

```typescript
const web = $.docker('web');
await web`ps aux`;   // separate docker exec invocation
await web`df -h`;    // another separate invocation

const pod = $.k8s('production').pod('api-abc123');
await pod.exec`ps aux`;  // separate kubectl exec invocation
await pod.exec`df -h`;   // another separate invocation
```

There is no `connectionPool`/`multiplexing`-style config for these adapters,
and no API to pre-warm or keep a Docker/Kubernetes connection alive beyond
what the `docker`/`kubectl` binaries and their daemons already do on their
own.

## Best Practices

```typescript
// ✅ Keep one target context and reuse it across commands
const ssh = $.ssh({ host: 'server', username: 'deploy' });
await ssh`command1`;
await ssh`command2`;
await ssh`command3`;

// ✅ Size the pool for your fan-out, not the default
const $ = new ExecutionEngine({
  adapters: { ssh: { connectionPool: { enabled: true, maxConnections: 50 } } },
});

// ✅ Watch pool health instead of polling a nonexistent pool object
$.on('ssh:pool-metrics', ({ metrics }) => reportMetrics(metrics));
```

```typescript
// ❌ Re-resolving the target doesn't defeat pooling (reuse is keyed by
// host/port/user), but constructing it fresh in a hot loop is still
// needless allocation — hoist it once
for (const cmd of commands) {
  await $.ssh({ host: 'server', username: 'deploy' })`${cmd}`;
}

// ❌ There is no connection object to close manually for SSH — the pool
// manages its own lifetime via idleTimeout/maxLifetime. Calling methods
// like .disconnect() or .close() on what $.ssh(...) returns does not exist.
```

## Implementation

- `packages/core/src/adapters/ssh/index.ts` — connection pool, multiplexing, reconnect logic
- `packages/core/src/adapters/ssh/connection-pool-metrics.ts` — metrics collection behind `ssh:pool-metrics`

## See Also

- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution)
