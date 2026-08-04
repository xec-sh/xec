# Kubernetes Adapter

The Kubernetes adapter enables command execution within existing Kubernetes pods, with port forwarding, log access and file copying built on top of `kubectl`.

## Overview

The Kubernetes adapter (`packages/core/src/adapters/kubernetes/index.ts`) shells out to `kubectl` and provides:

- **Pod command execution**, including a specific container in a multi-container pod
- **Port forwarding** to a pod
- **Log retrieval and streaming**
- **File copying** to/from a pod (via `kubectl cp`)
- **Namespace and context targeting**

It does not create, patch or delete cluster resources — no pods, Jobs,
ConfigMaps, Secrets or Namespaces. Everything here targets a pod that
already exists; creating one is out of scope, the same way the SSH adapter
doesn't provision the host it connects to.

## Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Execute in an existing pod — string shorthand or options object
const pod = $.k8s('production/my-app-7d9f8c6b5-x2vjm');
// same as: $.k8s({ pod: 'my-app-7d9f8c6b5-x2vjm', namespace: 'production' })

const result = await pod`ls -la /app`;
console.log(result.stdout);

// Execute in a specific container of a multi-container pod
const container = $.k8s({
  pod: 'multi-container-pod',
  container: 'app',
  namespace: 'default'
});

await container`cat /etc/config/app.yaml`;
```

`$.k8s(target)` returns a `K8sExecutionContext` with the same chaining API
every other target has (`.env()`, `.cd()`, `.timeout()`, `.shell()`,
`.retry()`, `.with()`, `.pwd()`, `.which()`, `.transfer`, and so on) — a step
written against a K8s target runs the same way it would against SSH, Docker
or local.

## Pod Configuration

### Working with Existing Pods

```typescript
// Connect to a running pod
const existing = $.k8s({
  pod: 'web-server-abc123',
  namespace: 'production'
});

// Execute commands
await existing`ps aux`;
for await (const line of existing`tail -f /var/log/app.log`) {
  console.log(line);
}

// A specific container
const sidecar = $.k8s({
  pod: 'app-pod',
  container: 'logging-agent',
  namespace: 'monitoring'
});
```

`KubernetesAdapterOptions` also accepts `context` (which cluster context to
use — without it, whatever `kubectl config current-context` happens to be)
and `kubeconfig` (path to a specific kubeconfig file):

```typescript
const staging = $.k8s({
  pod: 'app-pod',
  namespace: 'staging',
  context: 'staging-cluster'
});
```

## Namespace and Context

There is no namespace-management API (`createNamespace`, `deleteNamespace`
and similar don't exist) — `namespace` on a target only selects which
namespace `kubectl` looks in for the pod you name:

```typescript
// Default namespace
const defaultNs = $.k8s({ pod: 'my-pod' });

// A specific one
const prodNs = $.k8s({ pod: 'app-pod', namespace: 'production' });
```

### Moving Data Between Pods

There's no dedicated cross-namespace copy method; capture output and
interpolate it into the next command, the same as you would locally:

```typescript
const source = $.k8s({ pod: 'source-pod', namespace: 'dev' });
const dest = $.k8s({ pod: 'dest-pod', namespace: 'staging' });

const data = (await source`cat /data/export.json`).stdout;
await dest`cat > /data/import.json <<'XEC_EOF'
${data}
XEC_EOF`;
```

## Port Forwarding

Port forwarding is a method on a **pod**, reached through `.pod(name)` —
there is no `$.k8s.portForward(...)`; `k8s` is a method, not a namespace, and
forwarding isn't exposed on the context directly:

```typescript
const pod = $.k8s('production').pod('web-service-7d9f8c6b5-x2vjm');

// Forward a fixed local port to a pod port
const forward = await pod.portForward(8080, 80);

// Access the pod locally
const response = await fetch('http://localhost:8080');

// Close forwarding
await forward.close();
```

```typescript
// Let the OS pick a free local port
const dbForward = await $.k8s('data').pod('database-pod').portForwardDynamic(5432);
console.log('Forwarded on port', dbForward.localPort);

const db = await connectDB(`localhost:${dbForward.localPort}`);
```

`K8sPortForward` has `.localPort`, `.remotePort`, `.isOpen` and `.close()`.
For more than one port on the same pod, open more than one forward — there
is no batch/multi-port form.

## Logs

```typescript
const pod = $.k8s('production').pod('app-pod');

// One-shot retrieval
const logs = await pod.logs({ tail: 100, timestamps: true });

// A specific container's logs
const nginxLogs = await pod.logs({ container: 'nginx' });

// The previous instance of a crashed/restarted container
const crashLogs = await pod.logs({ previous: true, container: 'app' });
```

### Streaming Logs

```typescript
// Callback form
const stream = await pod.streamLogs((line) => {
  console.log('LOG:', line);
}, { follow: true, tail: 100 });

// later
stream.stop();

// Or, equivalently, .follow() — the same thing with follow: true implied
await pod.follow((line) => console.log('LOG:', line));
```

### Logs Across Several Pods

There's no label-based log aggregation call. List matching pods with
`kubectl` directly, then read each one:

```typescript
const names = (await $`kubectl get pods -n production -l app=web-server -o jsonpath='{.items[*].metadata.name}'`)
  .stdout.trim().split(/\s+/);

for (const name of names) {
  const logs = await $.k8s('production').pod(name).logs({ tail: 50 });
  console.log(`${name}:\n${logs}`);
}
```

`KubernetesAdapter.getPodFromSelector(selector, namespace?)` and
`.isPodReady(pod, namespace?)` also exist and do a single-pod version of
this (first match for a label selector, and a readiness check), reachable
via `($.getAdapter('kubernetes'))` with a cast to `KubernetesAdapter`, but
for anything beyond one pod, `kubectl get pods` is simpler.

## File Operations

```typescript
const pod = $.k8s('default').pod('app-pod');

// Copy a file (or a directory — kubectl cp handles both) to the pod
await pod.copyTo('/local/config.yaml', '/app/config.yaml');

// Copy from the pod
await pod.copyFrom('/app/logs/error.log', '/local/logs/error.log');

// With a specific container
await pod.copyTo('/local/nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
```

There is no compression option — `copyTo`/`copyFrom` run `kubectl cp`
exactly as it behaves on the command line. `$.transfer` does not have a
Kubernetes leg (it only handles local/SSH/Docker paths); pod file transfer
goes through `copyTo`/`copyFrom` above instead.

## Multi-Container Pods

A sidecar container — a service mesh proxy like Istio's, a logging agent,
anything running alongside the main container in the same pod — is reached
the same way as any other container: name it explicitly.

```typescript
// The main container
const app = $.k8s({ pod: 'app-pod', container: 'app', namespace: 'default' });
await app`npm run migrate`;

// A sidecar
const proxy = $.k8s({ pod: 'app-pod', container: 'istio-proxy', namespace: 'default' });
await proxy`curl -s localhost:15000/clusters`;
```

There is no dedicated "list containers in this pod" call — read it off
`kubectl get pod` directly: `` await $`kubectl get pod app-pod -n default -o jsonpath='{.spec.containers[*].name}'` ``.

## Error Handling

Failures throw `KubernetesError` or `CommandError`, both extending
`ExecutionError` with a `kind` to branch on rather than a specific error
code:

```typescript
import { $, ExecutionError } from '@xec-sh/core';

const pod = $.k8s({ pod: 'app-pod', namespace: 'default' });

try {
  await pod`command`;
} catch (error) {
  if (error instanceof ExecutionError) {
    if (error.kind === 'not-found') {
      console.error('Pod or container does not exist');
    } else if (error.kind === 'connection-refused' || error.kind === 'connection-lost') {
      console.error('Cluster unreachable — check kubeconfig and context');
    }
  }
}
```

## Implementation Details

The Kubernetes adapter is implemented in:
- `packages/core/src/adapters/kubernetes/index.ts` — main adapter, `kubectl` invocation, port forwarding, log streaming, file copy
- `packages/core/src/adapters/kubernetes/kubernetes-api.ts` — `K8sExecutionContext`/`K8sPod`, the fluent surface shown throughout this page
- `packages/core/src/adapters/kubernetes/kubernetes-utils.ts` — target parsing and helpers

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Docker Adapter](/docs/core/execution-engine/adapters/docker-adapter)
- [Streaming](/docs/core/execution-engine/features/streaming)
