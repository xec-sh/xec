---
title: Multi-Container Pods
description: Targeting specific containers in multi-container Kubernetes pods
keywords: [kubernetes, k8s, multi-container, sidecar, containers]
sidebar_position: 3
---

# Multi-Container Pods

A pod can run several containers — a main process alongside sidecars for logging, proxying, or metrics. `kubectl exec` runs in exactly one container per call, so Xec's `container` option picks which one.

## Targeting a Container

`container` is set where the target is created — via the object form or the shorthand's `:container` suffix — not by chaining:

```typescript
import { $ } from '@xec-sh/core';

await $.k8s({ pod: 'web-app-pod', container: 'app', namespace: 'production' })`curl -s http://localhost:8080/health`;

await $.k8s({ pod: 'web-app-pod', container: 'log-collector', namespace: 'production' })`tail -n 50 /var/log/app.log`;

// Shorthand form
await $.k8s('production/web-app-pod:log-collector')`tail -n 50 /var/log/app.log`;
```

Without `container`, `kubectl exec` uses the pod's default (its first container).

## Discovering Containers

There's no Xec-level container listing — ask `kubectl` directly through the adapter:

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;

async function getContainers(pod: string, namespace: string): Promise<string[]> {
  const { stdout } = await k8s.executeKubectl([
    'get', 'pod', pod,
    '-n', namespace,
    '-o', 'jsonpath={.spec.containers[*].name}',
  ]);
  return stdout.trim().split(' ').filter(Boolean);
}
```

## Running a Command in Every Container

```typescript
const containers = await getContainers('multi-container-pod', 'production');

const results = await Promise.all(
  containers.map((container) =>
    $.k8s({ pod: 'multi-container-pod', container, namespace: 'production' })`hostname`.nothrow()
  )
);

containers.forEach((container, i) => {
  console.log(container, results[i]!.ok ? 'ok' : results[i]!.stderr);
});
```

Each container gets its own `kubectl exec` process — there's no batching, so this is one subprocess per container per command.

## Containers Share the Pod's Network

All containers in a pod share one network namespace and therefore one IP. A container that listens on port 8080 is reachable at `localhost:8080` from any other container in the same pod, and [port forwarding](./port-forwarding.md) targets the pod, not a specific container — there is no `container` option on `portForward`. Pick the container by picking the right remote port, not by naming the container.

## Related

- [Pod Execution](./pod-execution.md) for TTY, stdin, shell/raw, and error handling — all apply the same way per container.
- [Port Forwarding](./port-forwarding.md)
- [File Operations](./file-operations.md)
