---
title: Kubernetes Target Overview
description: Command execution inside Kubernetes pods through kubectl exec, with pod/namespace/container targeting and multi-cluster context
keywords: [kubernetes, k8s, pods, containers, kubectl, namespace, context]
sidebar_position: 1
---

# Kubernetes Target Overview

## Overview

Kubernetes targets run commands inside pods by shelling out to `kubectl exec`. Xec does not talk to the Kubernetes API directly — it drives the `kubectl` binary the same way you would from a terminal. The adapter lives at `packages/core/src/adapters/kubernetes/`.

## Prerequisites

```bash
kubectl version --client
kubectl cluster-info
kubectl config current-context
```

The adapter looks for `kubectl` in common install locations (Homebrew, Docker Desktop, standard Linux paths) and otherwise falls back to `kubectl` on `PATH`. Set `kubectlPath` explicitly if yours lives somewhere else.

## Basic Execution

```typescript
import { $ } from '@xec-sh/core';

// Shorthand: [namespace/]pod[:container]
await $.k8s('api-pod')`ls -la /app`;
await $.k8s('prod/api-7d9f')`hostname`;
await $.k8s('prod/api-7d9f:sidecar')`ps aux`;

// Object form — the only form that accepts every option
await $.k8s({ pod: 'api-pod', namespace: 'production', container: 'app' })`npm test`;
```

`$.k8s(target)` takes exactly one argument, either the shorthand string or an options object — the two cannot be combined. There is no `.container(...)` to chain on afterward; set it in the initial call or the shorthand's `:container` suffix.

## Chaining

`$.k8s(...)` returns a context you can refine before running anything:

```typescript
const app = $.k8s({ pod: 'api-pod' })
  .cd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(30000)                              // milliseconds, not a duration string
  .retry({ maxRetries: 3, initialDelay: 1000 });

await app`npm test`;
```

Each call returns a new context rather than mutating the current one, so it composes like the other adapters. `.env(...)` merges with whatever was already set; the rest replace.

## The Pod API

`.pod(name)` returns a handle bound to one pod, in the namespace already set on the context, with more than plain exec:

```typescript
const pod = $.k8s({ namespace: 'production' }).pod('web-server');

await pod.exec`hostname`;                // through a shell, interpolated values quoted
await pod.raw`echo "no escaping here"`;  // values interpolated literally

await pod.logs({ tail: 100 });
await pod.portForward(8080, 80);
await pod.copyTo('./config.json', '/app/config.json');
```

`pod.exec` and `pod.raw` both return the same `ProcessPromise` any Xec command does — `.nothrow()`, `.timeout()`, `for await` line iteration, `.pipe()` all work. See [Pod Execution](./pod-execution.md) and [Multi-Container Pods](./multi-container.md) for container selection, [Log Streaming](./log-streaming.md), [Port Forwarding](./port-forwarding.md), and [File Operations](./file-operations.md) for each capability in depth.

## Cluster and Context

Every call can name its own cluster:

```typescript
await $.k8s({ pod: 'api', context: 'production-cluster', kubeconfig: '~/.kube/prod-config' })`whoami`;
```

Without `context`, a target runs against whatever `kubectl config current-context` currently points to on the machine running it — set it explicitly for anything that must land on a specific cluster regardless of the operator's local kubectl state.

To set defaults for every `$.k8s(...)` call instead of repeating them, configure the adapter once, up front:

```typescript
import { configure } from '@xec-sh/core';

configure({
  adapters: {
    kubernetes: {
      context: 'production-cluster',
      kubeconfig: '~/.kube/prod-config',
      namespace: 'production',
      kubectlPath: '/usr/local/bin/kubectl',
      kubectlTimeout: 30000,
    },
  },
});
```

Per-target values passed to an individual `$.k8s(...)` call override these defaults.

## Low-Level Adapter Access

For things the pod API doesn't cover — checking pod readiness, resolving a label selector, running arbitrary `kubectl` — reach the adapter directly:

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;

await k8s.isPodReady('api-pod', 'production');
const pod = await k8s.getPodFromSelector('app=web', 'production');
const { stdout } = await k8s.executeKubectl(['get', 'pods', '-o', 'name']);
```

`new KubernetesAdapter(config)` builds a standalone instance outside the engine, taking the same config shape as `configure()` above. It isn't managed by `$`, so call its own `.dispose()` when you're done with it.

## Error Handling

Failures throw a plain `ExecutionError` with `code: 'KUBERNETES_ERROR'` — stdout/stderr live on `.details`, not directly on the error:

```typescript
import { ExecutionError } from '@xec-sh/core';

try {
  await $.k8s('worker-pod')`failing-command`;
} catch (error) {
  if (error instanceof ExecutionError) {
    console.error(error.code, error.details?.stderr);
  }
}

// Or without throwing
const result = await $.k8s('worker-pod')`risky-operation`.nothrow();
if (!result.ok) {
  console.error(result.exitCode, result.stderr);
}
```

## Related

- [Pod Execution](./pod-execution.md)
- [Multi-Container Pods](./multi-container.md)
- [Port Forwarding](./port-forwarding.md)
- [Log Streaming](./log-streaming.md)
- [File Operations](./file-operations.md)
- [Kubernetes targets in `.xec/config.yaml`](../../configuration/targets/kubernetes-targets.md)
- [`xec in` — CLI pod execution](../../commands/built-in/in.md)
