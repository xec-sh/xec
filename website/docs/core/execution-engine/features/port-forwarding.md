# Port Forwarding

Port forwarding makes a remote service reachable as if it were local (SSH
tunnels, Kubernetes pod forwarding), or the reverse — makes a local service
reachable from a remote host (SSH reverse tunnels).

## Overview

Port forwarding (`packages/core/src/adapters/ssh/ssh-api.ts`,
`packages/core/src/adapters/kubernetes/kubernetes-api.ts`) provides:

- **SSH local tunneling** — a remote `host:port` reachable through a local port
- **SSH reverse tunneling** — a local `host:port` reachable through a port on the remote host
- **Kubernetes pod port forwarding** — a pod's port reachable through a local port, with an optional OS-assigned local port

There is no SOCKS/dynamic forwarding, no jump-host chaining option, no
connection multiplexing configuration, and no automatic reconnection — see
[What Isn't Supported](#what-isnt-supported).

## SSH Port Forwarding

### Local Port Forwarding

```typescript
import { $ } from '@xec-sh/core';

const remote = $.ssh({ host: 'jump.server.com', username: 'user' });

const tunnel = await remote.tunnel({
  remoteHost: 'database.internal',
  remotePort: 3306,
  // localPort omitted — the OS assigns one; pass a number to pin it
});

// Connect through the tunnel's actual local port
const db = await mysql.connect({
  host: 'localhost',
  port: tunnel.localPort,
  user: 'dbuser',
  password: 'dbpass'
});

// Close the tunnel when done
await tunnel.close();
```

`tunnel.localPort`, `.localHost`, `.remoteHost`, `.remotePort` and `.isOpen`
are readable at any time; `.open()` re-opens a tunnel that was closed.

### Reverse Port Forwarding

```typescript
// Make a local service reachable from the remote host
const tunnel = await remote.reverseTunnel({
  remotePort: 8080,
  localPort: 3000,
});

console.log('Local :3000 is now reachable on the remote host at :', tunnel.remotePort);

await tunnel.close();
```

The remote listener binds to `127.0.0.1` on the remote host by default —
pass `remoteHost: '0.0.0.0'` explicitly if you want it reachable from
outside that host, which is a deliberate, security-relevant choice rather
than the default.

There is no dynamic (SOCKS) forwarding — both calls forward exactly one
fixed `host:port` pair.

## Kubernetes Port Forwarding

Port forwarding is a method on a specific pod, reached through `.pod(name)`
— not on the k8s context directly, and there is no way to target a
Kubernetes Service by name.

```typescript
const pod = $.k8s('production').pod('database-pod');

const forward = await pod.portForward(5432, 5432);  // local, remote

const client = new pg.Client({ host: 'localhost', port: forward.localPort });
await client.connect();

await forward.close();
```

To let the OS pick a free local port instead of choosing one yourself:

```typescript
const forward = await pod.portForwardDynamic(5432);
console.log('Forwarded to local port', forward.localPort);
```

This shells out to `kubectl port-forward`, so `kubectl` must be on `PATH`
and configured for the target cluster. `forward.localPort` only resolves to
the real port once kubectl reports it has started forwarding — the
`portForward`/`portForwardDynamic` promise already waits for that, so it is
safe to read immediately after `await`.

## Multiple Forwards

Neither SSH nor Kubernetes has a batch-forwarding helper — open each tunnel
individually and track them yourself:

```typescript
const forwards = await Promise.all([
  remote.tunnel({ localPort: 3306, remoteHost: 'mysql.internal', remotePort: 3306 }),
  remote.tunnel({ localPort: 6379, remoteHost: 'redis.internal', remotePort: 6379 }),
  remote.tunnel({ localPort: 5432, remoteHost: 'postgres.internal', remotePort: 5432 }),
]);

// ... use the services ...

await Promise.all(forwards.map(t => t.close()));
```

The same pattern covers multiple ports on one pod:

```typescript
const pod = $.k8s('monitoring').pod('monitoring-stack');

const [grafana, prometheus, alertmanager] = await Promise.all([
  pod.portForward(3000, 3000),
  pod.portForward(9090, 9090),
  pod.portForward(9093, 9093),
]);
```

## Security Considerations

```typescript
// Local tunnel: bind the local end to loopback only (the default behavior
// of most tools, made explicit here)
const secure = await remote.tunnel({
  localHost: '127.0.0.1',
  remoteHost: 'database.internal',
  remotePort: 3306,
});

// Reverse tunnel: bind the *remote* listener to loopback only — the actual
// default, shown explicitly. Passing '0.0.0.0' exposes your local service
// to the remote host's whole network and should be a deliberate choice.
const tunnel = await remote.reverseTunnel({
  remoteHost: '127.0.0.1',
  remotePort: 8080,
  localPort: 3000,
});
```

## Use Cases

### Database Access

```typescript
async function accessRemoteDB() {
  const tunnel = await $.ssh({
    host: 'bastion.example.com',
    username: 'deploy'
  }).tunnel({
    remoteHost: 'postgres.private.vpc',
    remotePort: 5432,
  });

  try {
    const client = new pg.Client({
      host: 'localhost',
      port: tunnel.localPort,
      database: 'production'
    });

    await client.connect();
    const result = await client.query('SELECT * FROM users');
    await client.end();

    return result.rows;
  } finally {
    await tunnel.close();
  }
}
```

### Debugging a Remote Pod

```typescript
async function debugPod(podName: string, namespace: string) {
  const pod = $.k8s(namespace).pod(podName);

  const [inspector, app, metrics] = await Promise.all([
    pod.portForward(9229, 9229), // Node.js debugger
    pod.portForward(3000, 3000), // Application
    pod.portForward(9090, 9090), // Metrics
  ]);

  console.log('Debug ports forwarded:');
  console.log('- Debugger: chrome://inspect');
  console.log('- Application: http://localhost:3000');
  console.log('- Metrics: http://localhost:9090/metrics');

  return { inspector, app, metrics };
}
```

## What Isn't Supported

The tunnel and port-forward objects are deliberately small — `.localPort`,
`.localHost`, `.remoteHost`, `.remotePort`, `.isOpen`, `.open()` (SSH local
tunnels only), `.close()`. There is no:

- SOCKS/dynamic forwarding
- Jump-host chaining through a `proxy` option — `SSHAdapterOptions` has no
  such field; tunnel to the first host, then connect through it, if you need
  a multi-hop path
- SSH multiplexing options (`controlMaster`/`controlPath`/`controlPersist`)
- Compression options for tunnel traffic
- Forwarding a Kubernetes Service by name, rather than a specific pod
- Automatic reconnection, health checks, or `EventEmitter`-style events
  (`.on('ready'|'error'|'close', ...)`) on a tunnel or port-forward object

Build any of these yourself on top of `.tunnel()`/`.reverseTunnel()`/
`.portForward()` — reconnecting on failure, for instance, is just calling
`.close()` and the same method again.

## Error Handling

```typescript
try {
  const tunnel = await remote.tunnel({
    localPort: 3000,
    remoteHost: 'service.internal',
    remotePort: 80,
  });
} catch (error) {
  console.error('Tunnel failed to open:', error.message);
  // A fixed localPort already in use, or the remote host/port unreachable,
  // both surface as a rejection here — there is no structured error code to
  // switch on, only the message.
}
```

### Automatic Port Selection

```typescript
// .tunnel() does not retry or pick a free port itself if a fixed localPort
// is taken — retry with a different one, or omit localPort so the OS
// assigns one from the start
async function tunnelWithRetry(
  remote: ReturnType<typeof $.ssh>,
  config: { remoteHost: string; remotePort: number; localPort: number },
  maxAttempts = 10
) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await remote.tunnel({ ...config, localPort: config.localPort + i });
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
    }
  }
}
```

## Best Practices

### Do's ✅

```typescript
// ✅ Close tunnels when done
const tunnel = await remote.tunnel(config);
try {
  await useService();
} finally {
  await tunnel.close();
}

// ✅ Let the OS pick a local port when you don't need a specific one —
// avoids collisions, and works for both SSH and Kubernetes
const dbTunnel = await remote.tunnel({ remoteHost: 'db', remotePort: 3306 });
const podForward = await pod.portForwardDynamic(3306);

// ✅ Keep a reverse tunnel's remote listener on loopback unless you
// specifically need it reachable from elsewhere on that network
await remote.reverseTunnel({ remoteHost: '127.0.0.1', remotePort: 8080, localPort: 3000 });
```

### Don'ts ❌

```typescript
// ❌ Leave tunnels open
await remote.tunnel(config);
// Tunnel never closed

// ❌ Assume a fixed localPort is free
await remote.tunnel({ localPort: 80, remoteHost: 'db', remotePort: 3306 });
// May fail with the port already in use — prefer a dynamic port, or catch
// and retry with a different one

// ❌ Open far more tunnels than you'll use concurrently
for (let i = 0; i < 1000; i++) {
  await remote.tunnel({ remoteHost: 'db', remotePort: 3306 });
}
```

## Implementation Details

Port forwarding is implemented in:
- `packages/core/src/adapters/ssh/ssh-api.ts` - `.tunnel()` / `.reverseTunnel()` on the SSH execution context
- `packages/core/src/adapters/ssh/index.ts` - `SSHAdapter.tunnel()` / `.reverseTunnel()`
- `packages/core/src/adapters/kubernetes/kubernetes-api.ts` - `K8sPod.portForward()` / `.portForwardDynamic()`
- `packages/core/src/adapters/kubernetes/index.ts` - `KubernetesAdapter.portForward()`, which shells out to `kubectl port-forward`

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
