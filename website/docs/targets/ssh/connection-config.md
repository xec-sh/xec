---
title: SSH Connection Configuration
description: Connection pooling, timeouts, and adapter-wide SSH configuration
keywords: [ssh, connection, configuration, pooling, timeout, keepalive]
sidebar_position: 3
---

# SSH Connection Configuration

## Overview

Two different levels of configuration exist. Per-command options (`host`, `username`, `privateKey`, `hostKeyChecking`, ...) are covered in [Authentication](./authentication.md) and go on every `$.ssh({...})` call. This page covers the other level: adapter-wide settings — connection pool sizing, SFTP concurrency, sudo defaults — that apply to every SSH connection the process makes and are configured once, not per call.

## Connection Pooling

Pooling is on by default. Calls to the same host through the same `$.ssh(...)` context reuse one underlying connection:

```typescript
const web = $.ssh('deploy@web-1');
await web`uptime`;   // opens a connection
await web`df -h`;    // reuses it
```

Connections are pooled by username, host, port, **and** a fingerprint of the credentials (key/passphrase/password, hashed — never stored or logged in the clear). Two calls with different credentials for the same `user@host` get separate connections rather than silently sharing one.

### Pool Defaults

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Pooling on/off |
| `maxConnections` | `10` | Cap per adapter instance |
| `idleTimeout` | `300000` (5 min) | Idle connections are closed after this |
| `maxLifetime` | `3600000` (1 hour) | Connections are recycled after this regardless of use |
| `keepAlive` | `true` | Send a keep-alive on an interval |
| `keepAliveInterval` | `30000` (30s) | How often |
| `autoReconnect` | `true` | Reconnect a pooled connection found dead at checkout |
| `maxReconnectAttempts` | `3` | Before giving up and opening a new connection |
| `reconnectDelay` | `1000` | Base delay between reconnect attempts (multiplied by attempt number) |

Keep-alive is a real command, not a protocol ping: the adapter runs `echo "keep-alive"` on the connection every `keepAliveInterval`.

### Applying Adapter-Wide Configuration

There is no per-target pool configuration in `.xec/config.yaml` — the CLI's target resolver (`apps/xec/src/utils/command-base.ts`) only forwards `host`, `username`, `port`, `privateKey`, `password`, `passphrase`, `hostKeyChecking`, `knownHostsPath`, and `env` from a configured target into `$.ssh(...)`. Pool, SFTP, and sudo settings are configured in code, once, for the whole process:

```typescript
import { configure } from '@xec-sh/core';

configure({
  adapters: {
    ssh: {
      connectionPool: {
        enabled: true,
        maxConnections: 20,
        idleTimeout: 600_000,
      },
      sftp: { enabled: true, concurrency: 10 },
      hostKeyChecking: 'strict',
      sudo: { enabled: false, method: 'stdin' },
    },
  },
});
```

`configure()` replaces the default `$` instance, so call it once at startup before any `$.ssh(...)` use. For multiple independent configurations in the same process, construct and register adapters directly instead:

```typescript
import { $, SSHAdapter } from '@xec-sh/core';

const highTraffic = new SSHAdapter({
  connectionPool: { enabled: true, maxConnections: 50, idleTimeout: 600_000 },
});
$.registerAdapter('ssh', highTraffic);
```

### Pool Behavior

1. A checked-out connection is tested with `.isConnected()`; if dead and `autoReconnect` is on, the adapter retries the connection (up to `maxReconnectAttempts`, delay growing with each attempt) before falling back to opening a fresh one.
2. Separately, `execute()` itself retries a command **once** on a brand-new connection if it fails with a `connection-lost` classification (the pooled connection died mid-command) — this happens regardless of `autoReconnect` and is not configurable.
3. A background sweep runs every 60 seconds, closing connections that are idle past `idleTimeout`, older than `maxLifetime`, or found dead — connections with an in-flight command are never evicted mid-use.
4. If the pool is at `maxConnections` when a new connection is needed, the least-recently-used idle connection is evicted to make room.

### Metrics

```typescript
import { $, SSHAdapter } from '@xec-sh/core';

const adapter = new SSHAdapter({ connectionPool: { enabled: true } });
$.registerAdapter('ssh', adapter);

await $.ssh('deploy@web-1')`uptime`;

const metrics = adapter.getConnectionPoolMetrics();
// { activeConnections, idleConnections, totalConnections, connectionsCreated,
//   connectionsDestroyed, connectionsFailed, reuseCount, averageIdleTime,
//   averageUseCount, lastCleanup }
```

## Timeouts

There are two independent timeouts:

- **Command execution timeout** — how long a single command may run before it's killed. Set per call with `.timeout(ms)` on the SSH context, or globally via `configure({ defaultTimeout: 30_000 })` (30s is the built-in default, shared by every adapter, not SSH-specific).

  ```typescript
  await $.ssh('deploy@web-1').timeout(300_000)`long-running-backup.sh`;
  ```

- **Connection/handshake timeout** — how long establishing the TCP+SSH handshake may take. This is `ssh2`'s own `readyTimeout` (default 20s), reachable only through `defaultConnectOptions` on the adapter constructor, since it is not part of `SSHAdapterOptions`:

  ```typescript
  const adapter = new SSHAdapter({ defaultConnectOptions: { readyTimeout: 30_000 } });
  $.registerAdapter('ssh', adapter);
  ```

A command that times out removes its connection from the pool (it may be mid-write on a channel the caller no longer owns) rather than returning it for reuse.

## SFTP Concurrency

File transfer (`uploadFile`, `downloadFile`, `uploadDirectory`) uses SFTP, which can be disabled or tuned:

```typescript
const adapter = new SSHAdapter({ sftp: { enabled: true, concurrency: 5 } }); // 5 is the default
$.registerAdapter('ssh', adapter);
```

With `sftp.enabled: false`, `uploadFile`/`downloadFile`/`uploadDirectory` throw an `AdapterError` instead of connecting.

## Troubleshooting

| Symptom | Likely cause | What to change |
|---|---|---|
| Connection hangs, then times out | Firewall or wrong port | `defaultConnectOptions.readyTimeout`, verify the port |
| `HOST KEY VERIFICATION FAILED` | Host was rebuilt, or something is intercepting the connection | Confirm the host is expected, then `ssh-keygen -R <host>` to clear the stale entry |
| Pool exhausted / commands queue up | `maxConnections` too low for the fan-out | Raise `connectionPool.maxConnections` |
| Every command opens a new connection | A fresh `$.ssh({...})` object is being constructed per call | Keep one context (`const web = $.ssh(target)`) and reuse it |

## Related Documentation

- [SSH Overview](./overview.md) - fundamentals and command execution
- [Authentication](./authentication.md) - per-command connection and auth options
- [Tunneling](./tunneling.md) - port forwarding over a pooled connection
- [Batch Operations](./batch-operations.md) - running across many hosts at once
