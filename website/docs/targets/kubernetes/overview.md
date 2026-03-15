---
title: Kubernetes Overview
description: Working with Kubernetes clusters and resources using Xec
keywords: [kubernetes, k8s, pods, containers, orchestration]
source_files:
  - packages/core/src/adapters/k8s-adapter.ts
  - packages/core/src/k8s/kubectl-client.ts
  - packages/core/src/k8s/types.ts
  - apps/xec/src/commands/in.ts
key_functions:
  - K8sAdapter.execute()
  - KubectlClient.exec()
  - KubectlClient.getNamespaces()
  - KubectlClient.getPods()
verification_date: 2025-08-03
---

# Kubernetes Overview

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/k8s-adapter.ts` - Kubernetes adapter implementation
- `packages/core/src/k8s/kubectl-client.ts` - kubectl wrapper client
- `packages/core/src/k8s/types.ts` - Kubernetes type definitions
- `packages/core/src/k8s/pod-executor.ts` - Pod execution logic
- `apps/xec/src/commands/in.ts` - Container/pod execution command

**Key Functions:**
- `K8sAdapter.execute()` - Main execution entry point
- `KubectlClient.exec()` - Execute commands in pods
- `KubectlClient.getPods()` - List pods
- `KubectlClient.getNamespaces()` - List namespaces
- `KubectlClient.portForward()` - Setup port forwarding
- `KubectlClient.logs()` - Stream pod logs

## Overview

Xec provides seamless integration with Kubernetes clusters through the `@xec-sh/core` execution engine. This enables command execution in pods, resource management, and cluster operations using familiar Xec patterns.

## Prerequisites

### kubectl Configuration

Xec uses `kubectl` for Kubernetes operations:

```bash
# Verify kubectl is installed
kubectl version --client

# Verify cluster access
kubectl cluster-info

# Check current context
kubectl config current-context
```

### Cluster Access

Ensure proper cluster authentication:

```bash
# List available contexts
kubectl config get-contexts

# Switch context
kubectl config use-context my-cluster

# Test access
xec in my-pod:container whoami
```

## Basic Concepts

### Target Definition

Define Kubernetes targets in configuration:

```yaml
targets:
  pods:
    web:
      type: kubernetes
      namespace: default
      pod: web-server
      container: nginx  # Optional, defaults to first container
      
    api:
      type: kubernetes  
      namespace: production
      pod: api-server-.*  # Regex pattern for pod selection
      
    worker:
      type: kubernetes
      namespace: jobs
      selector: app=worker  # Label selector
```

### Execution Context

Kubernetes execution context includes:
- **Namespace** - Kubernetes namespace
- **Pod** - Target pod name or pattern
- **Container** - Specific container in pod
- **Context** - kubectl context (cluster)

## Pod Execution

### Direct Execution

Execute commands in pods using the Kubernetes adapter:

```typescript
import { $ } from '@xec-sh/core';

// Execute in pod
const result = await $.k8s('my-pod')`ls -la /app`;
console.log(result.stdout);

// Execute in specific namespace
const result = await $.k8s('my-pod', {
  namespace: 'production'
})`kubectl get services`;

// Execute in specific container
const result = await $.k8s('my-pod', {
  container: 'app'
})`npm list`;

// Execute with working directory
const result = await $.k8s('my-pod', {
  cwd: '/app'
})`npm test`;
```

### CLI Execution

Use the `in` command for pod execution:

```bash
# Execute in pod
xec in my-pod ls -la

# Execute in specific container
xec in my-pod:nginx nginx -t

# Execute in namespace
xec in prod/my-pod whoami

# Interactive shell
xec in my-pod /bin/bash
```

## Namespace Management

### Working with Namespaces

```typescript
// List namespaces
const namespaces = await $.k8s.getNamespaces();
namespaces.forEach(ns => {
  console.log({
    name: ns.metadata.name,
    status: ns.status.phase,
    created: ns.metadata.creationTimestamp
  });
});

// Execute in specific namespace
await $.k8s('my-pod', {
  namespace: 'staging'
})`echo "Running in staging"`;

// Get pods in namespace
const pods = await $.k8s.getPods('production');
```

### Default Namespace

Configure default namespace:

```yaml
# .xec/config.yaml
kubernetes:
  defaultNamespace: production
  
targets:
  pods:
    app:
      type: kubernetes
      pod: my-app
      # Uses defaultNamespace if not specified
```

## Pod Selection

### By Name

Select pods by exact name:

```typescript
// Exact pod name
await $.k8s('web-server-abc123')`ps aux`;

// With namespace
await $.k8s('prod/web-server-abc123')`ps aux`;
```

### By Pattern

Select pods using patterns:

```typescript
// Regex pattern
await $.k8s('web-server-.*')`uptime`;

// Glob pattern
await $.k8s('worker-*')`celery status`;

// First matching pod
const pod = await $.k8s.findPod('api-.*');
await $.k8s(pod.metadata.name)`health-check`;
```

### By Labels

Select pods using label selectors:

```typescript
// Label selector
const pods = await $.k8s.getPods({
  labelSelector: 'app=web,env=production'
});

// Execute on all matching pods
for (const pod of pods) {
  await $.k8s(pod.metadata.name)`restart-app`;
}
```

## Container Selection

### Multi-Container Pods

Work with specific containers:

```typescript
// List containers in pod
const pod = await $.k8s.getPod('my-pod');
const containers = pod.spec.containers.map(c => c.name);
console.log('Containers:', containers);

// Execute in specific container
await $.k8s('my-pod', {
  container: 'sidecar'
})`tail -f /var/log/sidecar.log`;

// Execute in init container
await $.k8s('my-pod', {
  container: 'init-db',
  containerType: 'init'
})`check-migration`;
```

### Default Container

Xec uses the first container by default:

```yaml
targets:
  pods:
    multi:
      type: kubernetes
      pod: multi-container-pod
      container: app  # Specify default container
```

## Resource Management

### Getting Resources

Query Kubernetes resources:

```typescript
// Get deployments
const deployments = await $.k8s.get('deployments');

// Get services
const services = await $.k8s.get('services', {
  namespace: 'default'
});

// Get specific resource
const configmap = await $.k8s.get('configmap/app-config');

// Get with JSON output
const pods = await $.k8s.getJson('pods', {
  labelSelector: 'app=web'
});
```

### Resource Operations

Manage Kubernetes resources:

```typescript
// Scale deployment
await $.k8s.scale('deployment/web', 3);

// Restart deployment
await $.k8s.rollout.restart('deployment/api');

// Delete pod
await $.k8s.delete('pod/failed-pod');

// Apply configuration
await $.k8s.apply('./k8s/deployment.yaml');
```

## Cluster Information

### Cluster Status

Get cluster information:

```typescript
// Cluster info
const info = await $.k8s.clusterInfo();
console.log('Kubernetes master:', info.master);

// Node status
const nodes = await $.k8s.get('nodes');
nodes.forEach(node => {
  console.log({
    name: node.metadata.name,
    status: node.status.conditions,
    capacity: node.status.capacity
  });
});

// Component status
const components = await $.k8s.get('componentstatuses');
```

### Context Management

Work with multiple clusters:

```typescript
// Get current context
const context = await $.k8s.currentContext();

// List contexts
const contexts = await $.k8s.getContexts();

// Switch context (affects subsequent operations)
await $.k8s.useContext('production-cluster');

// Execute with specific context
await $.k8s('my-pod', {
  context: 'staging-cluster'
})`hostname`;
```

## Authentication

### Service Account

Use service account authentication:

```yaml
targets:
  pods:
    admin:
      type: kubernetes
      pod: admin-pod
      serviceAccount: admin-sa
```

### Kubeconfig

Specify custom kubeconfig:

```typescript
// Use custom kubeconfig
await $.k8s('my-pod', {
  kubeconfig: '/path/to/kubeconfig'
})`whoami`;

// Environment variable
process.env.KUBECONFIG = '/path/to/kubeconfig';
await $.k8s('my-pod')`ls`;
```

## Configuration in Xec

### Kubernetes Settings

Configure Kubernetes in `.xec/config.yaml`:

```yaml
kubernetes:
  defaultNamespace: default
  defaultContext: minikube
  timeout: 30s
  
  # kubectl path (if not in PATH)
  kubectlPath: /usr/local/bin/kubectl
  
  # Default labels for operations
  labels:
    managed-by: xec
    environment: development

targets:
  pods:
    web:
      type: kubernetes
      namespace: default
      pod: web-.*
      container: nginx
      
    db:
      type: kubernetes
      namespace: database
      selector: app=postgres
      
    # Pattern-based selection
    workers:
      type: kubernetes
      namespace: jobs
      podPattern: worker-\d+
      
    # Multi-cluster target
    prod-api:
      type: kubernetes
      context: production
      namespace: api
      pod: api-server
```

### Kubernetes Tasks

Define Kubernetes operations as tasks:

```yaml
tasks:
  deploy:
    description: Deploy application to Kubernetes
    steps:
      - command: kubectl apply -f k8s/
      
  scale:
    params:
      - name: replicas
        default: 3
    steps:
      - command: kubectl scale deployment/web --replicas=${params.replicas}
      
  logs:
    params:
      - name: pod
    steps:
      - command: kubectl logs -f ${params.pod}
      
  debug:
    params:
      - name: pod
    steps:
      - command: kubectl describe pod ${params.pod}
      - command: kubectl logs ${params.pod} --previous
```

## Performance Characteristics

**Based on Implementation:**

### Operation Timings
- **Pod Exec**: 200-500ms (API call + network)
- **Pod List**: 50-200ms
- **Namespace List**: 20-50ms
- **Log Streaming**: 100ms to start
- **Port Forward**: 200-500ms to establish

### Resource Usage
- **Memory**: ~5MB per active connection
- **CPU**: Minimal except during operations
- **Network**: HTTPS API calls to cluster

## Error Handling

### Common Errors

| Error | Code | Solution |
|-------|------|----------|
| Pod not found | 3 | Verify pod name and namespace |
| Container not found | 3 | Check container name in pod |
| Permission denied | 11 | Check RBAC permissions |
| Connection refused | 4 | Verify cluster connectivity |
| Context not found | 2 | Check kubeconfig contexts |
| Namespace not found | 3 | Create namespace or fix name |

### Error Recovery

```typescript
// Retry with pod selection
async function executeWithRetry(pattern: string, command: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const pod = await $.k8s.findPod(pattern);
      if (pod) {
        return await $.k8s(pod.metadata.name)`${command}`;
      }
    } catch (error) {
      if (i === 2) throw error;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Wait for pod ready
async function executeWhenReady(pod: string, command: string) {
  await $.k8s.waitForPod(pod, {
    condition: 'Ready',
    timeout: 60000
  });
  return await $.k8s(pod)`${command}`;
}
```

## Best Practices

### Pod Selection

1. **Use specific names** when possible
2. **Verify pod existence** before execution
3. **Handle multiple matches** with patterns
4. **Use labels** for group operations
5. **Specify namespace** explicitly

### Resource Management

```typescript
// Good: Explicit namespace
await $.k8s('my-pod', {
  namespace: 'production'
})`command`;

// Good: Error handling
try {
  await $.k8s('my-pod')`risky-operation`;
} catch (error) {
  if (error.code === 'PodNotFound') {
    console.log('Pod not available');
  }
}

// Good: Wait for readiness
await $.k8s.waitForPod('new-pod');
await $.k8s('new-pod')`startup-check`;
```

### Security

```yaml
# Use service accounts
targets:
  pods:
    secure:
      type: kubernetes
      pod: secure-pod
      serviceAccount: limited-sa
      namespace: restricted
```

## Related Topics

- [Pod Execution](./pod-execution.md) - Detailed pod execution
- [Port Forwarding](./port-forwarding.md) - Kubernetes port forwarding
- [Log Streaming](./log-streaming.md) - Pod log management
- [File Operations](./file-operations.md) - File transfer with pods
- [in Command](../../commands/built-in/in.md) - CLI pod execution