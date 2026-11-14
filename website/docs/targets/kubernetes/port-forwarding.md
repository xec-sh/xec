---
title: Port Forwarding
description: Kubernetes port forwarding for local access to pod services
keywords: [kubernetes, k8s, port-forward, networking, tunnel]
sidebar_position: 4
---

# Port Forwarding {#port-forwarding}

Port forwarding runs `kubectl port-forward` as a child process and binds a local port to a pod port. It targets the pod's shared network namespace, not an individual container — see [Multi-Container Pods](./multi-container.md).

## Fixed Local Port {#fixed-local-port}

```typescript
import { $ } from '@xec-sh/core';

const pod = $.k8s({ namespace: 'default' }).pod('web-app');

const forward = await pod.portForward(8080, 80); // already open when this resolves
console.log(`Access app at: http://localhost:${forward.localPort}`);

await $`curl http://localhost:8080/health`;

await forward.close();
```

## Dynamic Local Port {#dynamic-local-port}

Let kubectl ask the OS for a local port. The returned `localPort` is the
actual listener reported by kubectl, not a random candidate guessed in advance:

```typescript
const pod = $.k8s({ namespace: 'production' }).pod('web-server');
const forward = await pod.portForwardDynamic(3000); // remote port 3000, local port assigned
console.log(`API available at: http://localhost:${forward.localPort}`);

await forward.close();
```

## Forward State {#forward-state}

```typescript
const pod = $.k8s({ namespace: 'production' }).pod('web-server');
const forward = await pod.portForward(5432, 5432);

console.log(forward.localPort, forward.remotePort, forward.isOpen); // true

await forward.close();
console.log(forward.isOpen); // false
```

Always close forwards you open — each one is a live `kubectl` subprocess:

```typescript
const pod = $.k8s({ namespace: 'production' }).pod('web-server');
const dbForward = await pod.portForward(5432, 5432);
try {
  await $`pg_dump -h localhost -p ${dbForward.localPort} mydb > backup.sql`;
} finally {
  await dbForward.close();
}
```

## Deadlines, Cancellation and Ownership {#deadlines-cancellation-and-ownership}

Both pod methods accept `{ timeout, signal, maxBuffer }` as their final argument.
`timeout` bounds readiness in milliseconds (`0` disables that deadline). The
signal remains attached after readiness, so cancellation also closes an open
forward. Context and kubeconfig from the pod's target apply to the operation.

```typescript
const pod = $.k8s({ namespace: 'production' }).pod('web-server');
import { getExecutionSignal } from '@xec-sh/core';

const forward = await pod.portForwardDynamic(3000, {
  timeout: 10_000,
  signal: getExecutionSignal(),
  maxBuffer: 1024 * 1024,
});
try {
  await $`curl http://localhost:${forward.localPort}/health`;
} finally {
  await forward.close();
}
```

The promise rejects if kubectl exits before reporting readiness, even with exit
code zero. `close()` waits for native termination; adapter disposal also waits
for its open or starting forwards. A ready forward can later stop: `isOpen`
reflects that state, and application-level connectivity still needs checking.

## Multiple Forwards {#multiple-forwards}

```typescript
const k8s = $.k8s({ namespace: 'production' });

const webForward = await k8s.pod('web-server').portForward(8080, 80);
const dbForward = await k8s.pod('database').portForward(5432, 5432);

await $`curl http://localhost:${webForward.localPort}/health`;
await $`pg_isready -h localhost -p ${dbForward.localPort}`;

await Promise.all([webForward.close(), dbForward.close()]);
```

## Low-Level Adapter Form {#low-level-adapter-form}

Without a pod handle, the adapter's own `portForward` requires an explicit `.open()` — unlike the pod API, it doesn't open automatically:

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;

const forward = await k8s.portForward('nginx-pod', 0, 80, {
  namespace: 'production',
  dynamicLocalPort: true,
});
await forward.open();

await forward.close();
```

## Error Handling {#error-handling}

```typescript
async function robustPortForward(podName: string, localPort: number, remotePort: number) {
  const pod = $.k8s({ namespace: 'default' }).pod(podName);

  try {
    return await pod.portForward(localPort, remotePort);
  } catch (error) {
    if (error instanceof Error && error.message.includes('address already in use')) {
      return await pod.portForwardDynamic(remotePort);
    }
    throw error;
  }
}
```

## Best Practices {#best-practices}

- Prefer dynamic ports (`portForwardDynamic`) to avoid local port conflicts.
- Await `close()` in a `finally` block and pass the owning operation's signal. Xec CLI scripts use its cancellation scope instead of competing process signal handlers.
- `kubectl port-forward` binds to localhost only by default; forwards are not reachable from other machines without extra setup.
- Test connectivity before relying on a forward: `` await $`nc -z localhost ${forward.localPort}`.nothrow() ``.
