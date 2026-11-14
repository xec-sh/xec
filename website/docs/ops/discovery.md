---
sidebar_position: 6
sidebar_label: Discovery
title: Infrastructure Discovery
description: Bounded asynchronous discovery of Docker containers, Kubernetes pods and TCP targets
---

# Infrastructure Discovery {#infrastructure-discovery}

`Discovery` reads configured sources and returns typed target descriptions. It runs local Docker and kubectl commands through the common Xec execution engine, using literal argument vectors. It does not deploy resources or select targets for later commands automatically.

## Usage {#usage}

```typescript
import { Discovery } from '@xec-sh/ops';

const targets = await Discovery.create()
  .docker({ label: 'env=prod', status: 'running' })
  .kubernetes({ namespace: 'production', label: 'app=web', context: 'production' })
  .scan({ timeout: 30_000 });
console.log(targets);
```

## Sources {#sources}

### Docker {#docker}

Options are `label`, `name`, `status` (`running`, `exited` or `all`) and `network`. They become individual Docker filter arguments. Requesting exited or all containers includes stopped containers in the query.

```typescript
import { Discovery } from '@xec-sh/ops';

const containers = await Discovery.create()
  .docker({ status: 'exited', label: 'managed-by=xec' })
  .scan();
console.log(containers.map(target => target.container));
```

### Kubernetes {#kubernetes}

Options are `namespace`, `label`, `fieldSelector` and `context`. Discovery parses the pod-list response and preserves namespace, pod identity, labels, phase, node and container names. A malformed response is a failure, not an empty cluster.

```typescript
import { Discovery } from '@xec-sh/ops';

const pods = await Discovery.create().kubernetes({
  namespace: 'production', context: 'prod-cluster',
  label: 'app=api', fieldSelector: 'status.phase=Running',
}).scan();
console.log(pods);
```

### SSH {#ssh}

`ssh({ hosts, port, timeout })` probes TCP connectivity to each explicit host. The default port is 22 and per-host timeout is two seconds. It does not expand CIDR ranges, perform an SSH handshake, authenticate, or verify a host key. Successful discovery therefore does not prove that an SSH command will be authorized.

```typescript
import { Discovery } from '@xec-sh/ops';

const hosts = await Discovery.create()
  .ssh({ hosts: ['10.0.1.1', '10.0.1.2'], port: 22, timeout: 2000 })
  .scan({ timeout: 10_000 });
console.log(hosts);
```

### Custom {#custom}

A custom source receives the operation's cancellation signal and returns `DiscoveredTarget[]`. It must finish its work and cleanup before returning.

```typescript
import { Discovery, type DiscoveredTarget } from '@xec-sh/ops';

const discovery = Discovery.create().custom('inventory', async signal => {
  const response = await fetch('https://inventory.example.com/targets', { signal });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Inventory HTTP ${response.status}`); }
  const records = await response.json() as Array<{ id: string; host: string }>;
  return records.map((record): DiscoveredTarget => ({ id: record.id, type: 'custom', host: record.host }));
});
console.log(await discovery.scan());
```

## Grouped Results {#grouped-results}

```typescript
import { Discovery } from '@xec-sh/ops';

const grouped = await Discovery.create().docker({ status: 'running' }).scanGrouped();
console.log(grouped.docker ?? []);
```

## Cancellation and Failures {#cancellation-and-failures}

`scan` and `scanGrouped` accept `timeout` (default 30 seconds), `signal`, `env` and `cwd`. The environment can select a particular tool installation; Kubernetes `context` selects the cluster explicitly. Commands and sockets settle before the operation returns.

Sources run concurrently. If any source fails, discovery waits for all started sources and rejects; inspect the error's causes. An empty successful result means that the queried sources returned no matching targets. It no longer hides missing binaries, permission errors, nonzero command exits or malformed JSON. Custom sources must cooperate with the supplied signal.

## Target Structure {#target-structure}

Every target contains `id` and `type` (`docker`, `kubernetes`, `ssh` or `custom`). Depending on the source it can also contain `host`, `port`, `container`, `pod`, `namespace`, `labels` and `meta`. Protocol values are preserved exactly, including labels; errors and diagnostic events are sanitized separately.
