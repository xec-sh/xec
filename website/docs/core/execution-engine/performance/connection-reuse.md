---
title: Connection Reuse
description: Avoid repeated SSH handshakes without sharing operation lifetimes
---

# Connection Reuse {#connection-reuse}

Reuse authenticated SSH connections for related operations. Keep cancellation,
output and completion evidence separate for every command.

## Overview {#overview}

Connection reuse is adapter-specific:

- **SSH** pools live connections by their full authentication and trust identity.
- **Docker** and **Kubernetes** invoke their native CLI for each command. Any daemon
  connection reuse belongs to those tools, not an Xec pool.
- **Local** execution starts a process and has no transport connection to reuse.

The upcoming 0.13 implementation moves SSH pooling into `@xec-sh/ssh`. Core uses
that single owner rather than keeping its own duplicate pool. See
[Connection Pooling](/docs/core/execution-engine/features/connection-pooling) for
version boundaries, defaults and failure behavior.

## SSH Connection Pooling {#ssh-connection-pooling}

### Automatic Reuse {#automatic-reuse}

```typescript
import { $ } from '@xec-sh/core';

const target = {
  host: 'server.example.com', username: 'deploy',
  agent: process.env.SSH_AUTH_SOCK,
  hostKeyChecking: 'strict' as const,
};
if (!target.agent) throw new Error('Start an SSH agent and load the deployment key');

try {
  await $.ssh(target)`uptime`;
  await $.ssh(target)`df -h`;
} finally {
  await $.dispose();
}
```

Both contexts share the same engine and effective connection identity. Creating a
context does not connect; the first command opens and authenticates a transport.
A different password, key, agent or trust policy gets a different connection.

### Pool Configuration {#pool-configuration}

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

const run = createCallableEngine(new ExecutionEngine({
  adapters: {
    ssh: {
      connectionPool: {
        maxConnections: 10,
        idleTimeout: 60_000,
        maxLifetime: 3_600_000,
        keepAliveInterval: 30_000,
      },
    },
  },
}));

try {
  // A bounded operation owns run and any target contexts derived from it.
} finally {
  await run.dispose();
}
```

Capacity includes pending authentication and long-lived tunnel leases. A busy
pool refuses a new identity instead of evicting an active operation. Max-age and
idle cleanup apply when a connection is no longer in use. The old `multiplexing`
settings did not implement OpenSSH control sockets and are rejected in 0.13.

### Observing the Pool {#observing-the-pool}

```typescript
import { $ } from '@xec-sh/core';

$.on('ssh:pool-metrics', ({ metrics }) => {
  console.log({ active: metrics.activeConnections, idle: metrics.idleConnections,
    reused: metrics.reuseCount });
});
$.on('ssh:reconnect', ({ host, attempts }) => {
  console.log('retrying handshake', host, attempts);
});
```

`activeConnections` counts connections, not commands. A reconnect event announces
an attempt, not its success. Neither event is evidence that a remote mutation
completed; use the command result and reconcile unknown outcomes.

## Docker and Kubernetes {#docker-and-kubernetes}

Every command is a separate `docker exec`/`docker run` or `kubectl exec` invocation.
Keep target contexts for readability and common configuration; do not expect an
SSH-style persistent transport or configure a nonexistent pool for these adapters.

## Best Practices {#best-practices}

Reuse an engine across related work, dispose it after that work ends, and bound
concurrency to the server's actual capacity. Observe failed handshakes separately
from command latency. Do not benchmark a warmed connection as a cold login, and
do not bypass host verification to reduce latency. In 0.13 every pooled borrow
rechecks the saved host key against current trust policy.

## Implementation {#implementation}

- `packages/ssh/src/connection-pool.ts`: connection and listener ownership.
- `packages/core/src/adapters/ssh/index.ts`: Core command/stream/result adaptation.

## See Also {#see-also}

- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution)
