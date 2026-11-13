---
title: Port Forwarding
description: Reach remote services through owned SSH and Kubernetes forwards
---

# Port Forwarding

A forward exposes one remote service through a local listener. An SSH reverse
forward exposes a local service through a listener on the SSH server. Keep the
handle for the full operation and close it in `finally`.

## Overview

- SSH local tunnels forward to a remote host and port.
- SSH reverse tunnels forward a remote listener to a local host and port.
- Kubernetes forwards expose a specific pod port through kubectl.

Use OS-assigned ports when the caller can consume the returned address. The
application using the forward still owns service authentication and readiness.

## SSH Port Forwarding

### Local Port Forwarding

```typescript
import { $, dispose } from '@xec-sh/core';

const remote = $.ssh('deploy@bastion.example.com');
const tunnel = await remote.tunnel({
  localHost: '127.0.0.1',
  remoteHost: 'api.internal',
  remotePort: 8080,
});
try {
  const response = await fetch(`http://127.0.0.1:${tunnel.localPort}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Health check returned ${response.status}`);
} finally {
  await tunnel.close();
  await dispose();
}
```

The returned handle exposes `localPort`, `localHost`, `remoteHost`,
`remotePort`, `isOpen` and `closed`. `open()` reopens a closed local tunnel.

### Reverse Port Forwarding

```typescript
import { $, dispose } from '@xec-sh/core';

const remote = $.ssh('deploy@bastion.example.com');
const tunnel = await remote.reverseTunnel({
  remoteHost: '127.0.0.1', remotePort: 8080,
  localHost: '127.0.0.1', localPort: 3000,
});
try {
  await remote`curl --fail --silent --show-error --max-time 5 http://127.0.0.1:${tunnel.remotePort}/health`;
} finally {
  await tunnel.close();
  await dispose();
}
```

The local service must already be running. The remote listener defaults to
loopback. Bind another address only when the deployment's access policy calls
for that exposure.

## Kubernetes Port Forwarding

The pod API waits for kubectl to report readiness before returning the handle.
Use the returned port, including when selecting a dynamic port.

```typescript
import { $ } from '@xec-sh/core';

const pod = $.k8s({ pod: 'api-0', namespace: 'staging', context: 'staging' }).pod('api-0');
const forward = await pod.portForwardDynamic(3000, { timeout: 10_000 });
try {
  const response = await fetch(`http://127.0.0.1:${forward.localPort}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Health check returned ${response.status}`);
} finally {
  await forward.close();
}
```

For a fixed local port, use `pod.portForward(8080, 3000, options)`. The forward
reports `localPort`, `remotePort`, `isOpen`, `open()` and `close()`.

## Multiple Forwards

When opening a batch, retain successful handles even if another open fails.
Await all open results before cleanup so a late success also gets closed.

```typescript
import { $, dispose } from '@xec-sh/core';

const remote = $.ssh('deploy@bastion.example.com');
const opened = await Promise.allSettled([
  remote.tunnel({ remoteHost: 'api.internal', remotePort: 8080 }),
  remote.tunnel({ remoteHost: 'metrics.internal', remotePort: 9090 }),
]);
const handles = opened.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
try {
  const failures = opened.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, 'Forward setup failed');
  console.log(handles.map(handle => handle.localPort));
} finally {
  const closed = await Promise.allSettled(handles.map(handle => handle.close()));
  await dispose();
  const failures = closed.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, 'Forward cleanup failed');
}
```

The same ownership rule applies to several pod forwards.

## Security Considerations

Bind listeners to loopback, verify SSH host identities and pin Kubernetes
context and namespace. Forwarding grants access through the authority of the
SSH or Kubernetes account. Apply the destination service's own authentication
and authorization policy as well.

## Use Cases

### Database Access

Use the database client through the returned listener. This example assumes
PostgreSQL authentication is configured for `psql` through an approved password
file or credential environment.

```typescript
import { $, dispose } from '@xec-sh/core';

const remote = $.ssh('deploy@bastion.example.com');
const tunnel = await remote.tunnel({ remoteHost: 'postgres.internal', remotePort: 5432 });
try {
  await $.exec('psql', {
    args: ['--host', '127.0.0.1', '--port', String(tunnel.localPort),
      '--dbname', 'app', '--set', 'ON_ERROR_STOP=1', '--command', 'SELECT 1'],
    shell: false,
    timeout: '10s',
  });
} finally {
  await tunnel.close();
  await dispose();
}
```

### Debugging a Remote Pod

Expose the pod's inspector on a dynamic local port and keep it open until the
operator finishes. The application must have enabled its inspector beforehand.

```typescript
import { $ } from '@xec-sh/core';
import { confirm } from '@xec-sh/kit';

const pod = $.k8s({ pod: 'api-0', namespace: 'staging', context: 'staging' }).pod('api-0');
const inspector = await pod.portForwardDynamic(9229, { timeout: 10_000 });
try {
  console.log(`Inspector is available at 127.0.0.1:${inspector.localPort}`);
  await confirm({ message: 'Close the inspector forward?' });
} finally {
  await inspector.close();
}
```

## What Isn't Supported

These APIs describe individual fixed-destination forwards. SOCKS proxying,
Kubernetes Service selection and automatic reconnection need additional
contracts. Reconnection changes the transport and can invalidate active client
sessions, so applications must inspect the outcome of in-flight requests before
resuming their work.

## Error Handling

Setup failure rejects the opening call. After setup, failures can surface through
the client request or a closed transport. Keep the service operation and cleanup
in one awaited scope and preserve their errors in application diagnostics.

### Automatic Port Selection

Omit SSH `localPort` or call `pod.portForwardDynamic(remotePort)` to let the
operating system select the listener. Read the actual returned port after the
opening promise resolves. A requested fixed port can fail if it is occupied.

## Best Practices

### Do's ✅

- Retain each handle and await `close()` in `finally`.
- Verify the destination service after opening the listener.
- Use returned ports in client configuration.
- Bound setup and client requests with explicit deadlines.
- Track successful handles when opening multiple forwards concurrently.

### Don'ts ❌

- A ready listener does not prove database or application health.
- A transport failure does not prove that an in-flight mutation was rejected.
- A failed batch open does not close the handles that already succeeded.

## Implementation Details

The SSH context uses the shared SSH adapter. Kubernetes uses the common local
process lifecycle for kubectl and confirms forwarding readiness from its output.
Each handle owns the listener or process it creates.

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
