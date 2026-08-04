---
title: Log Streaming
description: Streaming and retrieving logs from Kubernetes pods with Xec
keywords: [kubernetes, k8s, logs, streaming, follow, tail]
sidebar_position: 5
---

# Log Streaming

Log access runs through `kubectl logs`, either as a one-shot call or a followed stream. All of it is available from a pod handle.

## Static Retrieval

```typescript
import { $ } from '@xec-sh/core';

const pod = $.k8s({ namespace: 'production' }).pod('web-server');

const logs = await pod.logs({ tail: 100 });
console.log(logs);

const timestamped = await pod.logs({ tail: 50, timestamps: true });

// Logs from the previous instance of the container, after a restart
const previous = await pod.logs({ previous: true, tail: 200 });
```

`pod.logs()` always returns the full text at once — it does not follow. It throws `ExecutionError` (`code: 'KUBERNETES_ERROR'`) if the underlying `kubectl logs` call fails.

## Real-Time Streaming

```typescript
const stream = await pod.streamLogs(
  (line) => console.log(`[${new Date().toISOString()}] ${line.trim()}`),
  { follow: true, tail: 10 } // tail: how many existing lines to prime with
);

setTimeout(() => stream.stop(), 30_000);
```

`follow()` is `streamLogs()` with `follow` already set to `true` — pass everything else the same way, but leave `follow` out (it isn't part of the type):

```typescript
const stream = await pod.follow(
  (line) => console.log(line.trim()),
  { tail: 20, timestamps: true }
);

stream.stop();
```

Both callbacks are invoked once per line — the adapter splits each `kubectl logs` stdout chunk on newlines and drops empty lines before calling back, so there's no need to split the argument yourself.

## Container-Specific Streaming

```typescript
const multiPod = $.k8s({ namespace: 'production' }).pod('multi-container-pod');

const nginxStream = await multiPod.streamLogs(
  (line) => console.log('[nginx]', line.trim()),
  { container: 'nginx', follow: true, tail: 50 }
);

const appStream = await multiPod.streamLogs(
  (line) => console.log('[app]', line.trim()),
  { container: 'app', follow: true, tail: 50 }
);

// later
nginxStream.stop();
appStream.stop();
```

## Low-Level Adapter Form

The pod methods are a thin wrapper over the adapter's own `streamLogs`, which takes the pod name directly and is useful without a pod handle:

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;

const stream = await k8s.streamLogs(
  'web-server-pod',
  (data) => console.log(data.trim()),
  { namespace: 'production', follow: true, timestamps: true }
);

stream.stop();
```

## Multiple Pods

There's no built-in aggregation — start one stream per pod and merge in your own callback:

```typescript
async function streamAll(pods: string[], namespace: string) {
  const k8s = $.k8s({ namespace });
  const streams = pods.map((name) =>
    k8s.pod(name).follow((line) => console.log(`[${name}] ${line.trim()}`))
  );
  return () => Promise.all(streams).then((s) => s.forEach((stream) => stream.stop()));
}
```

## Best Practices

- Keep `tail` bounded on the initial call — it primes the stream with existing lines before following.
- Always call `.stop()` when done; register it on `SIGINT`/`SIGTERM` for anything long-lived.
- `pod.logs({ previous: true })` only succeeds if the container has actually restarted — there's no fallback.
