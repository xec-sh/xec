---
title: SSH Tunneling
description: Local and reverse SSH port forwarding
keywords: [ssh, tunnel, port-forwarding, bastion]
sidebar_position: 4
---

# SSH Tunneling

## Overview

The SSH context exposes two tunnel types: a local forward (`ssh -L`) and a reverse forward (`ssh -R`), both implemented in `packages/core/src/adapters/ssh/index.ts` on top of the pooled connection. There is no dynamic/SOCKS forwarding and no built-in jump-host chaining — neither exists anywhere in the adapter.

Both methods transparently ensure a connection exists (they run a quiet command first if needed), so you do not need to execute anything before opening a tunnel.

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
