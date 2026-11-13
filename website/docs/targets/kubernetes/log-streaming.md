---
title: Log Streaming
description: Retrieve or follow Kubernetes logs with bounded buffering and explicit completion
keywords: [kubernetes, k8s, logs, streaming, follow, tail]
sidebar_position: 5
---

# Log Streaming

Pod handles run `kubectl logs` with the namespace, context and kubeconfig selected
on `$.k8s(...)`. One-shot retrieval returns text; streaming exposes a handle with
observable completion and awaited shutdown.

## Static Retrieval

```typescript
import { $ } from '@xec-sh/core';

const pod = $.k8s({ namespace: 'production' }).pod('web-server');
const logs = await pod.logs({ tail: 100, timestamps: true });
console.log(logs);

// Requires an actual previous container instance.
const previous = await pod.logs({ previous: true, tail: 200 });
```

`pod.logs()` does not follow. A nonzero kubectl exit rejects with
`ExecutionError` and `code: 'KUBERNETES_ERROR'`.

## Real-Time Streaming

```typescript
const stream = await pod.streamLogs(
  line => process.stdout.write(line),
  { follow: true, tail: 10, maxBuffer: 1024 * 1024 }
);

try {
  await stream.completion;
} finally {
  await stream.stop();
}
```

The callback receives complete lines, including their original newline. Empty
lines, whitespace and UTF-8 split across native chunks are preserved. An
unterminated final line is delivered once without adding a newline. Trimming or
formatting is the caller's choice.

`stream.completion` settles after the child and its output have finished. It
rejects on a failed exit, callback error, cancellation, deadline or buffer limit.
`await stream.stop()` requests termination and waits for that same completion;
repeated calls share the result. Deliberate stopping does not manufacture a
kubectl error, but an already observed failure remains a failure.

`follow()` enables `follow: true`; its options omit `follow` and `previous`:

```typescript
const stream = await pod.follow(line => process.stdout.write(line), {
  tail: 20, timestamps: true,
});

// When the owning operation is finished:
await stream.stop();
```

## Deadlines and Cancellation

Follow streams have no deadline by default. `timeout` is in milliseconds; `0`
disables it. Non-follow streams use the adapter's configured deadline. `maxBuffer`
bounds each log line and captured stderr rather than retaining the entire stream.
A limit or deadline stops the owned kubectl process before completion rejects.

```typescript
const cancellation = new AbortController();
const stream = await pod.follow(line => process.stdout.write(line), {
  signal: cancellation.signal,
  timeout: 60_000,
  maxBuffer: 1024 * 1024,
});

try {
  await stream.completion;
} finally {
  await stream.stop();
}
```

Pass the owning operation's `AbortSignal` when embedding this API. In an Xec CLI
script, `getExecutionSignal()` exposes the command's cooperative cancellation
scope; do not install competing process signal handlers.

## Container-Specific Streaming

```typescript
const multiPod = $.k8s({ namespace: 'production' }).pod('multi-container-pod');
const stream = await multiPod.follow(line => process.stdout.write(line), {
  container: 'nginx', tail: 50,
});
try {
  await stream.completion;
} finally {
  await stream.stop();
}
```

## Low-Level Adapter Form

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;
const stream = await k8s.streamLogs('web-server-pod', line => process.stdout.write(line), {
  namespace: 'production', context: 'production-cluster',
  follow: true, timestamps: true,
});
try {
  await stream.completion;
} finally {
  await stream.stop();
}
```

## Multiple Pods

There is no built-in aggregation. Own each stream, attach completion handlers and
await all shutdowns. The `finally` block also covers a later stream failing to
start after an earlier one was opened.

```typescript
import type { K8sLogStream } from '@xec-sh/core';

async function streamAll(pods: string[], namespace: string, signal: AbortSignal) {
  const streams: K8sLogStream[] = [];
  try {
    for (const name of pods) {
      streams.push(await $.k8s({ namespace }).pod(name).follow(
        line => process.stdout.write(`[${name}] ${line}`), { signal, tail: 50 },
      ));
    }
    await Promise.all(streams.map(stream => stream.completion));
  } finally {
    await Promise.allSettled(streams.map(stream => stream.stop()));
  }
}
```

## Best Practices

- Bound `tail` to limit the initial history delivered before following.
- Observe `completion`; receiving a handle is not proof that a stream stays healthy.
- Await `stop()` before releasing the resources owned by your operation.
- `previous: true` requires an actual prior container instance; there is no fallback.
