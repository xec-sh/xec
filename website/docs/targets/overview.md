---
title: Targets Overview
description: One execution API across local shells, SSH hosts, Docker containers and Kubernetes pods
keywords: [targets, execution, local, ssh, docker, kubernetes]
sidebar_position: 1
---

# Targets Overview

A target is where a command runs. Xec ships four: the local machine, SSH hosts, Docker containers and Kubernetes pods. All four sit behind the same template-literal API, so the code that runs a command does not change when the place it runs does.

```typescript
import { $ } from '@xec-sh/core';

await $`uptime`;                          // local machine
await $.ssh('deploy@web-1')`uptime`;      // SSH host
await $.docker('my-app')`uptime`;         // Docker container
await $.k8s('prod/api-7d9f')`uptime`;     // Kubernetes pod
```

Each target is implemented as an adapter in `@xec-sh/core`. Adapters are loaded lazily — a script that never touches Kubernetes never pays for the Kubernetes adapter.

## The four targets

### [Local](./local/overview.md)

The default. Commands run on the machine executing the script through Node's `child_process` (or `Bun.spawn` under Bun) — no configuration required. The section covers [shell selection](./local/shell-config.md) and [troubleshooting](./local/troubleshooting.md) of local execution.

### [SSH](./ssh/overview.md)

Commands run on remote hosts over pooled `ssh2` connections. The section covers [connection configuration](./ssh/connection-config.md), [authentication](./ssh/authentication.md), [sudo and security](./ssh/sudo-security.md), [tunneling](./ssh/tunneling.md) and [batch operations](./ssh/batch-operations.md) across many hosts.

### [Docker](./docker/overview.md)

Commands run inside containers by shelling out to your local `docker` CLI — either `exec` into a running container or an ephemeral `run` from an image. The section covers the [container lifecycle API](./docker/container-lifecycle.md), [Compose integration](./docker/compose-integration.md), [volumes](./docker/volume-management.md) and [networking](./docker/networking.md).

### [Kubernetes](./kubernetes/overview.md)

Commands run inside pods through `kubectl exec`, with namespace, container and kubeconfig-context targeting. The section covers [pod execution](./kubernetes/pod-execution.md), [multi-container pods](./kubernetes/multi-container.md), [port forwarding](./kubernetes/port-forwarding.md), [log streaming](./kubernetes/log-streaming.md) and [file operations](./kubernetes/file-operations.md).

## What stays the same across targets

Every target returns the same `ExecutionResult` — `stdout`, `stderr`, `exitCode` and `ok` — and throws the same way on failure unless you opt out:

```typescript
const result = await $.ssh('deploy@web-1')`systemctl is-active nginx`.nothrow();
if (!result.ok) {
  console.error(`nginx is not active: ${result.stderr.trim()}`);
}
```

Every target context accepts the same chainable configuration before the command runs:

```typescript
const app = $.docker('my-app')
  .cd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(30000);

await app`npm run build`;
```

Values interpolated into the template are escaped for the target's shell on every adapter. `$.transfer.copy` moves files between local, SSH and Docker targets (Kubernetes has its own [file operations](./kubernetes/file-operations.md) built on `kubectl cp`). Because the surface is uniform, a function that takes an engine runs unchanged against any of the four — [Working across environments](../guides/infrastructure/multi-environment.md) builds on exactly that to cover multi-host rollouts, retries and cross-target pipelines.

## Targets in the CLI

Scripts pick a target in code, as above. The CLI picks one from `.xec/config.yaml`, where named targets carry the connection details:

```yaml
# .xec/config.yaml
targets:
  hosts:
    production:
      host: prod.example.com
      user: deploy
      privateKey: ~/.ssh/id_ed25519
  containers:
    app:
      container: my-app
```

```bash
xec on hosts.production "systemctl status nginx"   # SSH host
xec in containers.app "npm test"                   # Docker container
```

[Targets Configuration](../configuration/targets/overview.md) documents the full YAML schema for every target type.
