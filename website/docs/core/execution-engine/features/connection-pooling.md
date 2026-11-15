---
title: Connection Pooling
description: Bound SSH connection reuse, concurrent leases and recovery
---

# Connection Pooling {#connection-pooling}

SSH authentication is expensive. Reuse an authenticated connection for commands
that share the same credentials and trust policy, while keeping each operation's
cancellation and lifetime separate.

> The ownership and strict-trust contracts below describe the upcoming 0.13
> implementation. Published 0.12 does not provide the standalone `@xec-sh/ssh`
> package or recheck `known_hosts` before every pooled borrow.

## Overview {#overview}

`@xec-sh/ssh` owns connections, bounded admission, leases and tunnel listeners.
Core's SSH adapter uses that pool for command execution and file transfers. It
owns shell quoting, sudo and execution results; it does not maintain a second pool.

A pool belongs to one adapter. Creating another target context on the same engine
is cheap and can reuse that pool. Different engines do not share connections.

## SSH Connection Pooling {#ssh-connection-pooling}

### Basic Usage {#basic-usage}

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';
import { $ } from '@xec-sh/core';

const remote = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKeyPath: join(homedir(), '.ssh', 'id_ed25519'),
  hostKeyChecking: 'strict',
});

try {
  await remote`uptime`;
  await remote`df -h`;
} finally {
  await $.dispose();
}
```

Trust the server's verified key in the selected `known_hosts` file first. A target
must declare an authentication method; creating a context does not authenticate.

### Pool Configuration {#pool-configuration}

Configure connection ownership on the adapter, rather than on each target:

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

const run = createCallableEngine(new ExecutionEngine({
  adapters: {
    ssh: {
      connectionPool: {
        enabled: true,
        maxConnections: 10,
        idleTimeout: 300_000,
        maxLifetime: 3_600_000,
        keepAlive: true,
        keepAliveInterval: 30_000,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelay: 1_000,
      },
    },
  },
}));

try {
  // Use run.ssh(...) for this operation's remote work.
} finally {
  await run.dispose();
}
```

These are the defaults. Durations are milliseconds. `maxConnections` must be a
positive integer and includes pending handshakes, active connections and idle
connections. At capacity the pool may retire an idle connection; it rejects
admission with `ENOBUFS` if only active connections remain. It does not kill an
active command to make room or maintain an unbounded wait queue for capacity.

`idleTimeout: 0` disables idle eviction. `maxLifetime: 0` disables age rotation.
Periodic cleanup runs every minute and never evicts an active lease. An expired
connection closes when its final lease is released. `enabled: false` creates a
separate connection per operation and closes it on release; capacity still applies.

### Pool Metrics {#pool-metrics}

```typescript
import { $, SSHAdapter } from '@xec-sh/core';

const adapter = $.getAdapter('ssh') as SSHAdapter;
const metrics = adapter.getConnectionPoolMetrics();
console.log(metrics.activeConnections, metrics.idleConnections, metrics.reuseCount);
```

`activeConnections` counts connections with one or more leases, rather than the
number of commands. `totalConnections` counts established pool entries; pending
handshakes consume capacity but are not established entries yet. The snapshot also
contains `connectionsCreated`, `connectionsDestroyed`, `connectionsFailed`,
`averageIdleTime`, `averageUseCount` and `lastCleanup`.

Dispose the owning engine to close all resources. A target context has no separate
`disconnect`, `warmPool` or `drainPool` operation.

## Connection Lifecycle Events {#connection-lifecycle-events}

```typescript
import { $ } from '@xec-sh/core';

$.on('ssh:connect', ({ host, port }) => console.log('connected', host, port));
$.on('ssh:disconnect', ({ host, reason }) => console.log('disconnected', host, reason));
$.on('ssh:reconnect', ({ host, attempts }) => console.log('retrying handshake', host, attempts));
$.on('ssh:pool-metrics', ({ metrics }) => console.log(metrics));
$.on('ssh:pool-cleanup', ({ cleaned, remaining }) => console.log('cleanup', cleaned, remaining));
```

A reconnect event announces the next handshake attempt; it is not a successful
connection receipt. Keep observers nonthrowing. An admission observer failure
releases that admission and reports `SSH_OBSERVER_ERROR`. Background observation
failures are reported during disposal without interrupting unrelated active work.

### Health Checks {#health-checks}

Protocol keepalives detect broken transports. Before reusing a live connection,
the client checks its saved host key against the current `known_hosts`, explicit
pin or verifier. A revoked or rejected key stops admission without reconnecting
and retires the connection after existing leases finish. Active remote work is
not silently interrupted by a later trust-file edit.

## Multi-Host Pooling {#multi-host-pooling}

Identity covers the effective connection configuration: host, port, account,
authentication material, agent identity, algorithms and verification policy.
Credentials are hashed in the internal key and are not exposed in metrics.
Different passwords, key bytes or trust policies cannot share a connection.
A private-key file is read with a size bound on every acquisition; those exact
bytes are used for both identity and authentication, so rotating the file changes
the connection identity. Cancellation signals belong to an operation, not identity.

Concurrency to one target shares its connection through independent leases.
Unrelated targets acquire independently up to the pool's capacity.

## Performance Optimization {#performance-optimization}

### Connection Reuse Patterns {#connection-reuse-patterns}

Keep an engine alive for a related sequence of operations. Recreating the engine
for each command discards the authentication cost savings. Conversely, scope the
engine to an owner with a reliable `finally` cleanup; do not leave global sockets
alive after a job's work ends.

Choose the capacity from the number of distinct simultaneous connection
identities, not merely the number of commands. One SSH connection can carry
several command channels. SSH server channel limits still apply.

## Connection Multiplexing {#connection-multiplexing}

SSH channels multiplex commands and transfers over pooled connections. This does
not use OpenSSH `ControlMaster` sockets. The old `multiplexing` configuration had
no runtime implementation; 0.13 removes it and rejects supplied values. Configure
`connectionPool` for actual connection reuse.

## Error Handling {#error-handling}

`autoReconnect` retries only a handshake that failed with an authoritative
`ECONNRESET` or `EPIPE` before any command was dispatched. `maxReconnectAttempts`
is the number of additional attempts; `3` permits at most four handshakes. Abort,
authentication rejection and host-key rejection are never retried.

The pool never replays a dispatched command. Losing an acknowledgement, cancelling
an executing command or reaching its deadline can leave the remote outcome
unknown. Core reports `ExecutionOutcomeUnknownError`; `.nothrow()` does not turn
that uncertainty into a completed command result. Reconcile remote effects before
considering another attempt. See [SSH reliability](/docs/targets/ssh/reliability).

## Best Practices {#best-practices}

### Do's ✅ {#dos-}

- Declare authentication and verified trust explicitly.
- Reuse one owned engine for related operations and await its disposal.
- Size capacity for distinct concurrent identities and long-lived tunnels.
- Use metrics and actual results to distinguish resource pressure from failure.

### Don'ts ❌ {#donts-}

- Do not treat a timeout or lost response as proof that a remote mutation failed.
- Do not disable host verification to make a pooled connection reusable.
- Do not increase capacity to hide leaked leases or unclosed tunnel handles.
- Do not exit the process before the owning engine finishes cleanup.

## Implementation Details {#implementation-details}

- `packages/ssh/src/connection-pool.ts`: admission, leases, retirement and tunnels.
- `packages/ssh/src/connection-identity.ts`: effective authentication/trust identity.
- `packages/ssh/src/connection-pool-metrics.ts`: pool snapshots.
- `packages/core/src/adapters/ssh/index.ts`: command and result adaptation.

## See Also {#see-also}

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [SSH Tunneling](/docs/targets/ssh/tunneling)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
