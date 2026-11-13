---
sidebar_position: 2
title: Container Orchestration
description: Manage Docker services and Kubernetes workloads through Xec
---

# Container Orchestration

## Problem

A container deployment combines artifact selection, service lifecycle and
application readiness. Xec provides shared command and Docker service APIs so
scripts can keep those operations explicit and verify their results.

## Prerequisites

- Xec CLI and its public packages
- A running Docker daemon for Docker examples
- kubectl and an authorized kubeconfig for Kubernetes examples
- Application images, manifests and health checks matching the examples

## Solution

### Step 1: Docker Container Management

Declare the candidate with the public fluent API. Give it a distinct name and
an application health check before starting it. This example assumes the image
serves HTTP on port 3000 and includes Node.js with `fetch` support.

```typescript
import { $ } from '@xec-sh/core';

const candidate = $.docker().ephemeral('registry.example.com/myapp:1.2.3')
  .name('myapp-candidate')
  .autoRemove(false)
  .ports(['127.0.0.1:8081:3000'])
  .env({ NODE_ENV: 'production' })
  .command(['node', 'dist/index.js'])
  .healthcheck(
    'node -e "fetch(\'http://127.0.0.1:3000/health\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"',
    { interval: '5s', timeout: '3s', retries: 3 }
  );

await candidate.start();
await candidate.waitForReady(60_000);
const status = await candidate.status();
if (!status.running || status.healthy !== true) throw new Error('Candidate is not ready');
console.log(status.containers);
```

Keep the active service until the candidate passes readiness and the declared
traffic switch succeeds. Use `$.docker().container(name)` to inspect or control
an existing service through the same lifecycle interface.

### Step 2: Docker Compose Workflows

A Compose file owns its service dependencies, volumes and health checks. Select
one project name consistently across build, start, command execution and logs.

```typescript
import { $, retry } from '@xec-sh/core';

const compose = $.docker().compose('compose.yaml').withProject('myproject');
await compose.build();
await compose.up();
await retry(() => compose.exec('database', 'pg_isready -U postgres'), {
  maxRetries: 15,
  initialDelay: 1000,
  maxDelay: 1000,
  isRetryable: result => result.exitCode === 1 || result.exitCode === 2,
});
await compose.exec('app', 'npm run migrate');
await compose.exec('app', 'curl --fail --silent --show-error --max-time 5 http://localhost:3000/health');
console.log(await compose.ps());
```

The readiness command tests the service itself. A name appearing in `compose
ps` proves neither readiness nor the deployed application version. For
blue-green deployment, give each side its own Compose project, verify the
candidate and switch traffic through the application's configured router.

### Step 3: Kubernetes Deployments

Run cluster operations through the shared command engine with explicit context
and namespace. `$.k8s()` supplies pod execution, file transfer, logs and port
forwarding.

```typescript
import { $ } from '@xec-sh/core';

const cluster = ['--context', 'staging', '--namespace', 'myapp'];
await $.exec('kubectl', {
  args: [...cluster, 'apply', '-f', 'k8s/staging/'],
  shell: false,
  timeout: '2m',
});
await $.exec('kubectl', {
  args: [...cluster, 'rollout', 'status', 'deployment/myapp', '--timeout=120s'],
  shell: false,
  timeout: '130s',
});
const pods = await $.exec('kubectl', {
  args: [...cluster, 'get', 'pods', '-l', 'app=myapp', '-o', 'json'],
  shell: false,
}).json<{ items: { metadata: { name: string } }[] }>();
if (pods.items.length === 0) throw new Error('Deployment has no matching pods');
for (const pod of pods.items) {
  const target = $.k8s({ pod: pod.metadata.name, namespace: 'myapp', context: 'staging' });
  await target`node --version`;
}
```

Readiness and liveness probes belong in the versioned manifest. A rollout must
also pass the application's acceptance checks before retirement of the previous
version.

### Step 4: Hybrid Orchestration

A shared probe can operate on local Docker and Kubernetes targets. Keep target
identity in the result so the operator can locate a failing workload.

```typescript
import { $, parallel } from '@xec-sh/core';

const targets = [
  { name: 'local/myapp', exec: $.docker('myapp') },
  { name: 'staging/myapp-0', exec: $.k8s({ pod: 'myapp-0', namespace: 'myapp', context: 'staging' }) },
];
const result = await parallel(
  targets.map(target => target.exec`curl --fail --silent --show-error --max-time 5 http://localhost:3000/health`.nothrow()),
  { maxConcurrent: 2 }
);
for (const [index, observation] of result.results.entries()) {
  console.log(targets[index]?.name, observation instanceof Error ? observation.message : observation.exitCode);
}
if (result.failed.length) throw new AggregateError(result.failed, 'Workload checks failed');
```

Use Xec tasks for the surrounding build graph and deployment hooks for
application-specific activation and rollback. [Tasks](../../configuration/tasks/overview.md),
[Deployment operations](../../ops/deploy.md)

### Step 5: Container Registry Management

Use a scoped registry credential through standard input. Verify the image before
publishing and retain its digest with the release record.

```typescript
import { $, registerSecret } from '@xec-sh/core';
import { SecretManager } from '@xec-sh/ops';

const registry = 'registry.example.com';
const image = `${registry}/myapp:1.2.3`;
const secrets = new SecretManager({ type: 'env' });
const token = await secrets.getRequired('registry-token');
if (!registerSecret(token)) throw new Error('Registry token is too short to register');
await $.exec('docker', {
  args: ['login', registry, '--username', 'automation', '--password-stdin'],
  shell: false,
  stdin: token,
});
await $.docker().build('.', image).execute();
await $`trivy image --exit-code 1 --severity CRITICAL ${image}`;
await $.docker().run`push ${image}`;
console.log(await $.docker().run`image inspect ${image} --format '{{json .RepoDigests}}'`.text());
```

Configure registry retention against active and rollback references. Retiring
images is a separate operation from publishing a new one.

## Best Practices

- Pin image versions and record registry digests.
- Declare resource limits and readiness checks with each workload.
- Bind local test ports to loopback when external access is unnecessary.
- Keep Kubernetes context and namespace explicit.
- Preserve the previous release until acceptance completes.
- Inspect command failures and partial results before retrying mutations.

## Common Pitfalls

An `unhealthy` state contains the text `healthy`. Compare structured health
values exactly or use the fluent service's `status()` and `waitForReady()`.
Keep application readiness separate from process existence.

## Troubleshooting

### Issue: Container Fails to Start

```typescript
import { $ } from '@xec-sh/core';

const container = $.docker().container('myapp-candidate');
console.log(await container.logs({ tail: 50 }));
console.log(await container.status());
```

### Issue: Pod Stuck in Pending

```bash
kubectl --context staging -n myapp describe pod myapp-0
kubectl --context staging -n myapp get events --sort-by=.lastTimestamp
kubectl --context staging -n myapp get pvc
```

### Issue: Image Pull Errors

```typescript
import { $ } from '@xec-sh/core';

const image = 'registry.example.com/myapp:1.2.3';
await $.docker().pull(image);
await $`kubectl --context staging -n myapp describe pod myapp-0`;
```

Inspect the pod events and the configured image-pull secret reference. Keep
credential contents out of diagnostic output.

### Issue: Service Discovery Failing

```bash
kubectl --context staging -n myapp get services
kubectl --context staging -n myapp get endpointslices
kubectl --context staging -n myapp get networkpolicies
```

## Related Guides

- [Server management](./server-management.md)
- [Working across environments](./multi-environment.md)
- [Error handling](../advanced/error-handling.md)
