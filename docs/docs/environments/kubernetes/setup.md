# Kubernetes Environment Setup

The Kubernetes adapter enables seamless command execution within Kubernetes pods, providing comprehensive cluster management, pod selection, and kubectl integration. It supports both direct pod execution and label-based pod selection with full namespace and context management.

## Installation and Prerequisites

### kubectl Installation
Ensure kubectl is installed and properly configured:

```bash
# Check kubectl installation
kubectl version --client
kubectl cluster-info

# Verify cluster connectivity
kubectl get nodes
kubectl get namespaces
```

The Kubernetes adapter automatically detects kubectl in common locations:
- `/usr/local/bin/kubectl` (Docker Desktop, official releases)
- `/usr/bin/kubectl` (Linux package managers)
- `/opt/homebrew/bin/kubectl` (Homebrew on macOS)

### Cluster Configuration
Configure kubectl to connect to your cluster:

```bash
# Configure context for local cluster
kubectl config set-context local --cluster=local --user=local

# Use specific context
kubectl config use-context production

# View current context
kubectl config current-context

# List available contexts
kubectl config get-contexts
```

### Basic Configuration

```javascript
import { $ } from '@xec-sh/core';

// Basic pod execution
const result = await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'my-app-pod',
    namespace: 'default'
  }
})`ls -la /app`;

console.log(result.stdout);
```

## Configuration Options

### Adapter Configuration
Configure the Kubernetes adapter with various options:

```javascript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter({
  // kubectl configuration
  kubectlPath: '/usr/local/bin/kubectl',
  kubeconfig: '~/.kube/config',
  context: 'production',
  
  // Default namespace
  namespace: 'app-namespace',
  
  // Command timeout
  kubectlTimeout: 30000,
  
  // Default execution options
  throwOnNonZeroExit: true,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 10  // 10MB
});

// Use the configured adapter
const result = await k8s.execute({
  command: 'kubectl',
  args: ['get', 'pods'],
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-server'
  }
});
```

### Kubeconfig and Context Management
Manage multiple clusters and contexts:

```javascript
// Use specific kubeconfig file
const k8sProd = new KubernetesAdapter({
  kubeconfig: '~/.kube/production-config',
  context: 'production-cluster',
  namespace: 'production'
});

// Use default kubeconfig with specific context
const k8sDev = new KubernetesAdapter({
  context: 'development',
  namespace: 'dev'
});

// Override context per command
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'test-pod',
    namespace: 'staging'
  }
})`echo "Running in staging"`;
```

### Global Options
Configure global kubectl options:

```javascript
const k8s = new KubernetesAdapter({
  // Always use specific kubeconfig
  kubeconfig: '/path/to/custom/kubeconfig',
  
  // Always use specific context
  context: 'my-cluster',
  
  // Default namespace for all operations
  namespace: 'my-namespace',
  
  // Custom kubectl binary
  kubectlPath: '/custom/path/kubectl'
});

// These options are applied to all kubectl commands
await k8s.execute({
  command: 'whoami',
  adapterOptions: {
    type: 'kubernetes',
    pod: 'app-pod'
  }
});
```

## Namespace Management

### Default Namespace Configuration
Set default namespace for all operations:

```javascript
const k8s = new KubernetesAdapter({
  namespace: 'production'
});

// Uses 'production' namespace by default
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-server'
  }
})`hostname`;

// Override namespace per command
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'test-pod',
    namespace: 'staging'  // Override default
  }
})`env | grep NAMESPACE`;
```

### Cross-Namespace Operations
Work with pods across different namespaces:

```javascript
// Monitor multiple namespaces
const namespaces = ['production', 'staging', 'development'];

for (const ns of namespaces) {
  const pods = await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'monitoring-pod',
      namespace: ns
    }
  })`kubectl get pods -n ${ns} --field-selector=status.phase=Running`;
  
  console.log(`Running pods in ${ns}:`, pods.stdout);
}
```

### Namespace Validation
The adapter validates namespace access:

```javascript
import { ExecutionError } from '@xec-sh/core';

try {
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'secret-pod',
      namespace: 'restricted'
    }
  })`echo "Accessing restricted namespace"`;
} catch (error) {
  if (error instanceof ExecutionError) {
    console.error('Namespace access denied:', error.message);
  }
}
```

## Context Management

### Multi-Context Setup
Manage multiple Kubernetes contexts:

```javascript
// Production context
const prodK8s = new KubernetesAdapter({
  context: 'production-cluster',
  namespace: 'production'
});

// Development context  
const devK8s = new KubernetesAdapter({
  context: 'development-cluster',
  namespace: 'development'
});

// Execute in production
await prodK8s.execute({
  command: 'echo',
  args: ['Production deployment'],
  adapterOptions: {
    type: 'kubernetes',
    pod: 'api-server'
  }
});

// Execute in development
await devK8s.execute({
  command: 'echo',
  args: ['Development test'],
  adapterOptions: {
    type: 'kubernetes',
    pod: 'test-runner'
  }
});
```

### Context Switching
Switch contexts dynamically:

```javascript
const k8s = new KubernetesAdapter();

// Check current context
const currentContext = await k8s.executeKubectl(['config', 'current-context']);
console.log('Current context:', currentContext.stdout.trim());

// Execute with different contexts
const contexts = ['production', 'staging', 'development'];

for (const context of contexts) {
  const contextK8s = new KubernetesAdapter({ context });
  
  const result = await contextK8s.execute({
    command: 'kubectl',
    args: ['get', 'nodes', '--no-headers'],
    adapterOptions: {
      type: 'kubernetes',
      pod: 'kubectl-pod'
    }
  });
  
  console.log(`Nodes in ${context}:`, result.stdout);
}
```

## Pod Selection and Validation

### Direct Pod Selection
Execute commands in specific pods:

```javascript
// Execute in named pod
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-server-78f5d6bb58-abc123',
    namespace: 'production'
  }
})`curl -s http://localhost:8080/health`;

// Check pod status before execution
const k8s = new KubernetesAdapter();
const isReady = await k8s.isPodReady('web-server-pod', 'production');

if (isReady) {
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'web-server-pod',
      namespace: 'production'
    }
  })`echo "Pod is ready for execution"`;
} else {
  console.log('Pod is not ready');
}
```

### Label-Based Pod Selection
Select pods using label selectors:

```javascript
// Select pod by label
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: '-l app=web-server',  // Label selector
    namespace: 'production'
  }
})`hostname && cat /proc/version`;

// Complex label selectors
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: '-l app=api,version=v2,environment=production',
    namespace: 'production'
  }
})`echo "Selected pod with multiple labels"`;

// Alternative selector syntax
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'app=web-server,tier=frontend',  // Without -l prefix
    namespace: 'production'
  }
})`ps aux | grep nginx`;
```

### Pod Availability Check
Verify pod availability before execution:

```javascript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter();

// Check if specific pod exists and is ready
const podExists = await k8s.isPodReady('api-server', 'production');
if (!podExists) {
  console.error('Pod api-server not ready in production namespace');
  process.exit(1);
}

// Get pod from label selector
const selectedPod = await k8s.getPodFromSelector('app=web-server', 'production');
if (!selectedPod) {
  console.error('No pod found matching app=web-server in production');
  process.exit(1);
}

console.log('Selected pod:', selectedPod);

// Execute in the selected pod
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: selectedPod,
    namespace: 'production'
  }
})`echo "Executing in dynamically selected pod"`;
```

## Availability and Health Checks

### Cluster Connectivity
Check cluster connectivity:

```javascript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter();

// Check if Kubernetes is available
const isAvailable = await k8s.isAvailable();
if (!isAvailable) {
  console.error('Kubernetes cluster is not available');
  process.exit(1);
}

// Get cluster information
const clusterInfo = await k8s.executeKubectl(['cluster-info'], {
  throwOnNonZeroExit: false
});

if (clusterInfo.exitCode === 0) {
  console.log('Cluster Info:', clusterInfo.stdout);
} else {
  console.error('Failed to get cluster info:', clusterInfo.stderr);
}
```

### Kubectl Version Check
Verify kubectl compatibility:

```javascript
const k8s = new KubernetesAdapter();

// Check kubectl version
const clientVersion = await k8s.executeKubectl(['version', '--client', '--output=json']);
const versionInfo = JSON.parse(clientVersion.stdout);

console.log('kubectl version:', versionInfo.clientVersion.gitVersion);

// Check server version
const serverVersion = await k8s.executeKubectl(['version', '--output=json'], {
  throwOnNonZeroExit: false
});

if (serverVersion.exitCode === 0) {
  const serverInfo = JSON.parse(serverVersion.stdout);
  console.log('Server version:', serverInfo.serverVersion.gitVersion);
}
```

### Resource Availability
Check resource availability:

```javascript
// Check namespace access
const namespaces = await k8s.executeKubectl(['get', 'namespaces', '--output=name']);
console.log('Available namespaces:', namespaces.stdout.split('\n').filter(Boolean));

// Check RBAC permissions
const canCreate = await k8s.executeKubectl([
  'auth', 'can-i', 'create', 'pods', '--namespace=production'
], { throwOnNonZeroExit: false });

if (canCreate.exitCode === 0 && canCreate.stdout.trim() === 'yes') {
  console.log('Can create pods in production namespace');
} else {
  console.log('Cannot create pods in production namespace');
}
```

## Error Handling

### Common Error Scenarios
Handle Kubernetes-specific errors:

```javascript
import { ExecutionError } from '@xec-sh/core';

try {
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'non-existent-pod',
      namespace: 'production'
    }
  })`echo "test"`;
} catch (error) {
  if (error instanceof ExecutionError) {
    if (error.message.includes('not found')) {
      console.error('Pod not found');
    } else if (error.message.includes('forbidden')) {
      console.error('Access denied to namespace or pod');
    } else {
      console.error('Kubernetes error:', error.message);
    }
  }
}
```

### Connection Error Handling
Handle cluster connection issues:

```javascript
const k8s = new KubernetesAdapter({
  context: 'unreachable-cluster'
});

try {
  await k8s.execute({
    command: 'echo',
    args: ['test'],
    adapterOptions: {
      type: 'kubernetes',
      pod: 'test-pod'
    }
  });
} catch (error) {
  if (error.message.includes('connection refused')) {
    console.error('Cluster is unreachable');
    // Fallback to different cluster or local execution
  } else if (error.message.includes('unauthorized')) {
    console.error('Authentication failed');
    // Handle authentication error
  }
}
```

### Resource Cleanup
Ensure proper resource cleanup:

```javascript
const k8s = new KubernetesAdapter();

try {
  // Execute commands
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'worker-pod'
    }
  })`long-running-process`;
} finally {
  // Always cleanup resources
  await k8s.dispose();
}
```

## Best Practices

### Security Considerations
- Use specific namespaces to limit access scope
- Validate pod names and selectors to prevent injection
- Use least-privilege RBAC configurations
- Avoid passing secrets in command arguments
- Use Kubernetes secrets and configmaps for sensitive data

### Performance Optimization
- Reuse adapter instances for multiple operations
- Use label selectors efficiently
- Configure appropriate timeouts
- Monitor resource usage during execution
- Use connection pooling when available

### Reliability Patterns
- Always check pod readiness before execution
- Implement retry logic for transient failures
- Use health checks and availability validation
- Handle network partitions gracefully
- Monitor and log execution metrics

```javascript
// Example of robust Kubernetes execution
const k8s = new KubernetesAdapter({
  namespace: 'production',
  kubectlTimeout: 30000
});

async function robustExecution(podSelector, command) {
  try {
    // Check cluster availability
    if (!(await k8s.isAvailable())) {
      throw new Error('Cluster not available');
    }
    
    // Get pod from selector
    const pod = await k8s.getPodFromSelector(podSelector, 'production');
    if (!pod) {
      throw new Error(`No pod found for selector: ${podSelector}`);
    }
    
    // Check pod readiness
    if (!(await k8s.isPodReady(pod, 'production'))) {
      throw new Error(`Pod ${pod} is not ready`);
    }
    
    // Execute command
    const result = await k8s.execute({
      command,
      adapterOptions: {
        type: 'kubernetes',
        pod,
        namespace: 'production'
      }
    });
    
    return result;
  } catch (error) {
    console.error('Robust execution failed:', error.message);
    throw error;
  } finally {
    await k8s.dispose();
  }
}

// Usage
try {
  const result = await robustExecution('app=web-server', 'health-check.sh');
  console.log('Health check result:', result.stdout);
} catch (error) {
  console.error('Health check failed:', error.message);
}
```