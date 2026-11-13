---
title: File Operations
description: File transfer between the local filesystem and Kubernetes pods using kubectl cp
keywords: [kubernetes, k8s, file-transfer, kubectl-cp, copy, upload, download]
sidebar_position: 6
---

# File Operations

File transfer runs through `kubectl cp`, in both directions, via a pod handle.

## Copy To / From a Pod

```typescript
import { $ } from '@xec-sh/core';

const pod = $.k8s({ namespace: 'default' }).pod('web-server');

await pod.copyTo('./config.json', '/app/config.json');
await pod.copyFrom('/app/logs/application.log', './app-logs.log');
```

Both accept a directory path too — `kubectl cp` copies recursively, provided `tar` is available inside the target container (it copies by streaming a tar archive through `kubectl exec`):

```typescript
await pod.copyTo('./assets/', '/app/assets/');
await pod.copyFrom('/app/generated-reports/', './reports/');
```

The uniform cross-target surface reaches the same `kubectl cp` without a pod
handle: `$.k8s(pod).transfer.upload(local, remote)` and
`.download(remote, local)` carry the target's namespace, container and
cluster context — the same calls work against `$.ssh(...)` and
`$.docker(...)` engines. See the
[K8s adapter](../../core/execution-engine/adapters/k8s-adapter.md) page.

## Copying to a Specific Container

`copyTo`/`copyFrom` accept a third `container` argument. Xec passes it as a
separate `kubectl cp -c` option; it never becomes part of a filename. The pod
handle preserves the configured namespace, context and kubeconfig for both
directions.

```typescript
const pod = $.k8s({
  namespace: 'production', context: 'production-cluster',
  kubeconfig: '/etc/kubernetes/production.yaml',
}).pod('multi-container-pod');
await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
await pod.copyFrom('/var/log/nginx/access.log', './access.log', 'nginx');
```

The lower-level adapter exposes the same operation when no pod handle is needed:

```typescript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = $.getAdapter('kubernetes') as KubernetesAdapter;

await k8s.copyFiles('./nginx.conf', 'multi-container-pod:/etc/nginx/nginx.conf', {
  namespace: 'production',
  container: 'nginx',
  direction: 'to',
});
```

## Configuration Deployment

A typical backup-then-deploy-then-validate sequence, using only `copyTo`/`copyFrom`/`exec`/`nothrow`:

```typescript
async function deployConfig(podName: string, configDir: string) {
  const pod = $.k8s({ namespace: 'production' }).pod(podName);
  const backupDir = `./backup/${Date.now()}`;

  await pod.copyFrom('/app/config/', `${backupDir}/`);
  await pod.copyTo(`${configDir}/`, '/app/config/');

  const validation = await pod.exec`/app/bin/validate-config`.nothrow();
  if (!validation.ok) {
    await pod.copyTo(`${backupDir}/`, '/app/config/'); // roll back
    throw new Error(`Configuration validation failed: ${validation.stderr}`);
  }
}
```

## Log and Backup Collection

```typescript
async function collectLogs(podName: string, remoteFiles: string[], localDir: string) {
  const pod = $.k8s({ namespace: 'production' }).pod(podName);

  for (const remote of remoteFiles) {
    await pod.copyFrom(remote, `${localDir}/${remote.split('/').pop()}`);
  }
}

async function backupDatabase(dbPod: string) {
  const pod = $.k8s({ namespace: 'production' }).pod(dbPod);
  const remoteFile = `/tmp/backup-${Date.now()}.sql`;

  await pod.exec`pg_dump myapp > ${remoteFile}`;
  await pod.copyFrom(remoteFile, `./backups/${remoteFile.split('/').pop()}`);
  await pod.exec`rm ${remoteFile}`;
}
```

## Error Handling and Retries

```typescript
import type { K8sPod } from '@xec-sh/core';

async function robustCopy(
  pod: K8sPod,
  localPath: string,
  remotePath: string,
  direction: 'to' | 'from',
  retries = 3
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (direction === 'to') await pod.copyTo(localPath, remotePath);
      else await pod.copyFrom(remotePath, localPath);
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
```

## Integrity Verification

```typescript
import type { K8sPod } from '@xec-sh/core';

async function verifiedCopyTo(pod: K8sPod, localPath: string, remotePath: string) {
  const localHash = (await $`md5sum ${localPath}`.text()).split(' ')[0];

  await pod.copyTo(localPath, remotePath);

  const remoteHash = (await pod.exec`md5sum ${remotePath}`.text()).split(' ')[0];

  if (localHash !== remoteHash) {
    throw new Error(`Integrity check failed: ${localHash} != ${remoteHash}`);
  }
}
```

## Permissions

`copyTo`/`copyFrom` preserve no permission metadata beyond what `kubectl cp` itself does — set permissions explicitly afterward if they matter:

```typescript
await pod.copyTo(configFile, '/tmp/new-config.json');
await pod.exec`chown app:app /tmp/new-config.json && chmod 600 /tmp/new-config.json`;
await pod.exec`mv /tmp/new-config.json /app/config/secure-config.json`;
```

## Performance Notes

- Many small files are slow over `kubectl cp` (one tar stream per call). Archive locally, copy the single archive, and extract inside the pod instead:

  ```typescript
  await $`tar -czf /tmp/transfer.tar.gz -C ${localDir} .`;
  await pod.copyTo('/tmp/transfer.tar.gz', '/tmp/transfer.tar.gz');
  await pod.exec`mkdir -p ${remoteDir} && tar -xzf /tmp/transfer.tar.gz -C ${remoteDir}`;
  ```

- Skip copies that aren't needed by comparing checksums first (as in Integrity Verification above) rather than unconditionally overwriting.
- For very large files, prefer a volume mount or object storage over `kubectl cp`.
