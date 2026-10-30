---
title: SSH Tunneling
description: Local and reverse SSH port forwarding
keywords: [ssh, tunnel, port-forwarding, bastion]
sidebar_position: 4
---

# SSH Tunneling

## Overview

The SSH context exposes two tunnel types: a local forward (`ssh -L`) and a reverse forward (`ssh -R`), both implemented in `packages/core/src/adapters/ssh/index.ts` on top of the pooled connection. There is no dynamic/SOCKS forwarding and no built-in jump-host chaining — neither exists anywhere in the adapter.

Both methods establish their connection when needed. Local forwarding binds directly to the SSH context’s target, including when different targets open tunnels concurrently; no preparatory command is required.

## Local Forwarding

Forwards a local port to a destination reachable from the remote host:

```typescript
const tunnel = await $.ssh('deploy@bastion').tunnel({
  localPort: 5432,           // 0 picks a free port — read back tunnel.localPort
  localHost: '127.0.0.1',    // default; the bind address for the local listener
  remoteHost: 'db.internal', // reachable from bastion, not necessarily from you
  remotePort: 5432,
});

console.log(`listening on localhost:${tunnel.localPort}`);
// connect to localhost:5432 locally — it reaches db.internal:5432 via bastion

await tunnel.close();
```

`tunnel.isOpen` reflects current state; `tunnel.open()` exists on the returned object but is a no-op — the tunnel is already listening when `tunnel()` resolves.

Multiple tunnels can be open at once, including several through the same host:

```typescript
const [http, db] = await Promise.all([
  $.ssh('deploy@host').tunnel({ localPort: 8080, remoteHost: 'localhost', remotePort: 80 }),
  $.ssh('deploy@host').tunnel({ localPort: 5432, remoteHost: 'localhost', remotePort: 5432 }),
]);
```

## Lifetime and recovery

A local tunnel holds a lease on its pooled SSH connection until it closes. Idle
and maximum-age cleanup cannot evict that connection while the tunnel is open.
`connectionPool.maxLifetime` defaults to one hour; set it to `0` to disable age
rotation. Rotation applies when a connection is no longer in use.

`await tunnel.close()` is idempotent. It stops accepting clients, cancels pending
forward requests and destroys existing forwarded sockets; it does not wait for a
half-open client to send its own FIN. Close explicitly when abandoning a tunnel.
The `closed` promise also resolves if the underlying SSH transport fails, and
`isOpen` becomes false:

```typescript
await tunnel.closed;
// Stop using the old endpoint. Open and authenticate a new connection if needed.
```

Opening each forwarded channel has a 15-second deadline. The low-level
`NodeSSH.forwardOut` API accepts an optional `{ timeoutMs, signal }` argument;
cancellation, timeout or transport closure rejects the request and releases any
channel returned after cancellation. A closed tunnel is not silently re-created:
its caller owns reconnect/backoff policy and decides which operations can be
retried safely.

## Reverse Forwarding

Makes a local service reachable from the remote host:

```typescript
const tunnel = await $.ssh('deploy@public-host').reverseTunnel({
  remotePort: 8080,        // 0 asks the server to pick a free port — read tunnel.remotePort
  remoteHost: '127.0.0.1', // default; binds loopback-only on the remote side
  localHost: 'localhost',  // default; where the remote's connections are forwarded to
  localPort: 3000,
});

console.log(`remote :${tunnel.remotePort} now reaches local :3000`);

await tunnel.close();
```

`remoteHost` defaults to `127.0.0.1`, not `0.0.0.0` — the remote listener is loopback-only unless you explicitly bind it wider. Exposing a local service to a whole remote network is something you opt into, not the default.

## Related Documentation

- [SSH Overview](./overview.md) - fundamentals and command execution
- [Connection Configuration](./connection-config.md) - the pooled connection tunnels run over
- [Authentication](./authentication.md) - connecting to the host a tunnel goes through
