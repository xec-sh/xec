---
sidebar_position: 6
sidebar_label: Discovery
title: Infrastructure Discovery
---

# Infrastructure Discovery

Dynamically discover Docker containers, Kubernetes pods, SSH hosts, and custom targets.

## Usage

```typescript
import { Discovery } from '@xec-sh/ops';

const targets = await Discovery.create()
  .docker({ label: 'env=prod', status: 'running' })
  .kubernetes({ namespace: 'production', label: 'app=web' })
  .ssh({ hosts: ['10.0.1.1', '10.0.1.2'], port: 22 })
  .custom('consul', async () => {
    const resp = await fetch('http://consul:8500/v1/catalog/service/web');
    const svc = await resp.json();
    return svc.map((s: any) => ({ id: s.Node, type: 'custom', host: s.Address }));
  })
  .scan();
```

## Sources

### Docker
```typescript
.docker({
  label: 'env=prod',          // Filter by label
  name: 'api-*',              // Filter by name
  status: 'running',          // 'running' | 'exited' | 'all'
  network: 'my-network',      // Filter by network
})
```

### Kubernetes
```typescript
.kubernetes({
  namespace: 'production',     // Filter by namespace
  label: 'app=web',           // Label selector
  fieldSelector: 'status.phase=Running',
  context: 'prod-cluster',    // kubectl context
})
```

### SSH
```typescript
.ssh({
  hosts: ['10.0.1.1', '10.0.1.2', '10.0.1.3'],
  port: 22,
  timeout: 2000,  // TCP connection timeout
})
```

### Custom
```typescript
.custom('aws', async () => {
  // Return DiscoveredTarget[]
  return [
    { id: 'i-abc123', type: 'custom', host: '10.0.1.5', meta: { instanceType: 't3.medium' } },
  ];
})
```

## Grouped Results

```typescript
const grouped = await discovery.scanGrouped();
// { docker: [...], kubernetes: [...], ssh: [...] }
```

## Target Structure

```typescript
interface DiscoveredTarget {
  id: string;
  type: 'docker' | 'kubernetes' | 'ssh' | 'custom';
  host?: string;
  port?: number;
  container?: string;
  pod?: string;
  namespace?: string;
  labels?: Record<string, string>;
  meta?: Record<string, unknown>;
}
```
