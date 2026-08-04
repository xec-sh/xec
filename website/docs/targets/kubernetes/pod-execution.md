---
title: Pod Execution
description: Executing commands inside Kubernetes pods with Xec
keywords: [kubernetes, k8s, pod, exec, containers, execution]
sidebar_position: 2
---

# Pod Execution

Command execution in a pod goes through `kubectl exec`. This page covers the options that shape that call: pod selection, TTY/stdin, shell vs. raw, environment and working directory, timeouts, and error handling. See [Kubernetes Target Overview](./overview.md) for the basics of `$.k8s(...)` and [Multi-Container Pods](./multi-container.md) for targeting a specific container.

## Direct Pod Execution

```typescript
import { $ } from '@xec-sh/core';

const processes = await $.k8s({
  pod: 'web-server-abc123',
  namespace: 'production',
})`ps aux`.text();

console.log(processes);
```

## Using a Pod Instance

For multiple commands against the same pod, get a handle once:

```typescript
const pod = $.k8s({ namespace: 'default' }).pod('my-app-pod');

const hostname = await pod.exec`hostname`.text();
const processes = await pod.exec`ps aux | grep node`;

console.log(`Pod: ${hostname}`);
```

## Pod Selection by Label

A `pod` value that starts with `-l` is resolved to a matching pod name before the exec call runs — the adapter looks up the first pod the selector matches and execs into it, not into the selector itself:

```typescript
await $.k8s({
  pod: '-l app=web,env=production',
  namespace: 'production',
})`systemctl status nginx`;
```

There is no glob or regex matching on pod names — a `pod` value without the `-l` prefix is used as a literal pod name.

## TTY and Stdin

```typescript
// Full interactive TTY (implies stdin)
await $.k8s({ pod: 'debug-pod', tty: true })`top -b -n 1`;

// Explicitly disable stdin (no -i passed to kubectl)
await $.k8s({ pod: 'worker-pod', stdin: false })`batch-process --config /app/config.json`;
```

`kubectl exec` gets `-i` by default whenever `stdin` isn't explicitly `false` — plain commands are already run with stdin attached. `tty: true` adds `-t` as well and always implies `-i`, regardless of the `stdin` option.

## Custom kubectl Flags

`execFlags` appends raw arguments to the `kubectl exec` invocation:

```typescript
await $.k8s({
  pod: 'my-pod',
  execFlags: ['--request-timeout=30s'],
})`long-running-command`;
```

## Shell vs. Raw Execution

```typescript
// Through a shell — interpolated values are quoted for it
await pod.exec`ps aux | grep node | wc -l`;
await pod.exec`echo $HOME`;                 // shell expands this

const userInput = 'x; rm -rf /tmp/*';
await pod.exec`echo ${userInput}`;          // safe: shell-escaped, printed literally
await pod.raw`echo ${userInput}`;           // unsafe: spliced into the command as-is
```

Both still run through a shell in the pod (pipes, `&&`, redirects work in either) — the difference is only whether interpolated `${}` values are escaped first. `exec` is the default and safe for untrusted values; use `raw` only for values you already trust or that are meant to be shell syntax.

## Environment and Working Directory

`namespace` and `container` are set once, at `$.k8s(...)` or shorthand time — they can't be changed by chaining. `env` and `cwd` can:

```typescript
const configured = $.k8s({ pod: 'my-pod' })
  .env({ DATABASE_URL: 'postgres://localhost:5432/mydb' })
  .cd('/app');

await configured`echo "DB: $DATABASE_URL" && pwd`;
```

Both reach the pod as a shell prelude (`cd ... && export ... && <command>`) — they run inside the pod, not on the machine running Xec.

## Timeouts and Retries

```typescript
const longRunning = $.k8s({ pod: 'batch-processor' }).timeout(300_000); // ms
await longRunning`large-batch-job --input /data/large-file.csv`;

const resilient = $.k8s({ pod: 'api-pod' }).retry({
  maxRetries: 3,
  initialDelay: 1000,
});
await resilient`curl -f http://external-api/data`;
```

## Streaming Output

`ProcessPromise` supports async line iteration for any long-running command, kubernetes included:

```typescript
const tail = pod.exec`tail -f /var/log/app.log`;

for await (const line of tail) {
  if (line.includes('ERROR')) console.error(line);
}
```

Break out of the loop and call `tail.kill()` to stop it. For pod logs specifically (as opposed to an arbitrary streaming command), prefer `pod.streamLogs()` / `pod.follow()` — see [Log Streaming](./log-streaming.md).

## Error Handling

```typescript
import { ExecutionError } from '@xec-sh/core';

try {
  await $.k8s({ pod: 'worker-pod' })`failing-command`;
} catch (error) {
  if (error instanceof ExecutionError && error.code === 'KUBERNETES_ERROR') {
    console.log('kubectl failed:', error.message);
    console.log('stderr:', error.details?.stderr);
  }
}
```

Use `.nothrow()` to get a result instead of a thrown error:

```typescript
const result = await $.k8s({ pod: 'test-pod' })`risky-operation`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed with code:', result.exitCode);
  console.log('Error:', result.stderr);
}
```

## Checking Pod Readiness

`isPodReady` and `getPodFromSelector` live on the adapter, not on the pod context — reach them through `$.getAdapter('kubernetes')`:

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;

if (await k8s.isPodReady('my-pod', 'default')) {
  await $.k8s({ pod: 'my-pod' })`echo ready`;
}
```
