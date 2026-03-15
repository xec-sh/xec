---
title: Pod Execution
description: Executing commands inside Kubernetes pods using Xec
keywords: [kubernetes, k8s, pod, exec, containers, execution]
source_files:
  - packages/core/src/adapters/kubernetes-adapter.ts
  - packages/core/src/utils/kubernetes-api.ts
  - packages/core/src/core/command.ts
key_functions:
  - KubernetesAdapter.execute()
  - KubernetesAdapter.buildKubectlExecArgs()
  - createK8sPod()
  - K8sPod.exec()
verification_date: 2025-08-03
---

# Pod Execution

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/kubernetes-adapter.ts` - Main Kubernetes adapter
- `packages/core/src/utils/kubernetes-api.ts` - K8s API utilities and pod instances
- `packages/core/src/core/command.ts` - KubernetesAdapterOptions interface

**Key Functions:**
- `KubernetesAdapter.execute()` - Main command execution in pods
- `KubernetesAdapter.buildKubectlExecArgs()` - Build kubectl exec arguments
- `createK8sPod()` - Create pod instance with execution methods
- `K8sPod.exec()` - Execute commands in specific pod
- `K8sPod.raw()` - Raw command execution without shell

## Overview

Xec provides powerful capabilities for executing commands inside Kubernetes pods through the `kubectl exec` interface. The execution engine handles pod selection, container targeting, and command execution with proper error handling and stream management.

## Basic Pod Execution

### Direct Pod Execution

Execute commands in pods using the Kubernetes adapter:

```typescript
import { $ } from '@xec-sh/core';

// Execute in specific pod
const result = await $.k8s({
  pod: 'web-server-abc123',
  namespace: 'production'
})`ps aux`;

console.log(result.stdout);
```

### Using Pod Instance

Get a pod instance for multiple operations:

```typescript
const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('my-app-pod');

// Execute multiple commands
const hostname = await pod.exec`hostname`;
const processes = await pod.exec`ps aux | grep node`;
const diskUsage = await pod.exec`df -h`;

console.log(`Pod: ${hostname.stdout.trim()}`);
console.log(`Node processes: ${processes.stdout}`);
```

## Container Selection

### Multi-Container Pods

Target specific containers in multi-container pods:

```typescript
// Execute in specific container
const appResult = await $.k8s({
  pod: 'multi-container-pod',
  container: 'app',
  namespace: 'production'
})`cat /app/version.txt`;

// Execute in sidecar container
const sidecarResult = await $.k8s({
  pod: 'multi-container-pod',
  container: 'nginx',
  namespace: 'production'
})`nginx -t`;
```

### Container Methods

Use pod instance methods for container-specific operations:

```typescript
const pod = k8s.pod('multi-container-pod');

// Different containers in same pod
const appStatus = await pod.exec`curl localhost:3000/health`;
const nginxConfig = await pod.exec`nginx -T`; // Uses default container

// Override container per command
const specificContainer = await $.k8s({
  pod: 'multi-container-pod',
  container: 'sidecar'
})`tail -f /var/log/sidecar.log`;
```

## Execution Options

### TTY and Interactive Mode

Control TTY and interactive options:

```typescript
// Enable TTY for interactive commands
const interactive = await $.k8s({
  pod: 'debug-pod',
  tty: true,
  stdin: true
})`top -b -n 1`;

// Non-interactive mode (default)
const batch = await $.k8s({
  pod: 'worker-pod',
  tty: false
})`batch-process --config /app/config.json`;
```

### Custom kubectl Flags

Pass additional flags to kubectl exec:

```typescript
const result = await $.k8s({
  pod: 'my-pod',
  execFlags: ['--quiet', '--request-timeout=30s']
})`long-running-command`;
```

## Shell vs Raw Execution

### Shell Execution (Default)

Commands are executed through shell by default:

```typescript
// Shell command with pipes and redirects
const result = await pod.exec`ps aux | grep node | wc -l`;

// Environment variable expansion
const path = await pod.exec`echo $PATH`;

// Complex shell operations
const cleanup = await pod.exec`find /tmp -name "*.log" -mtime +7 -delete`;
```

### Raw Execution

Execute commands directly without shell interpretation:

```typescript
// Raw command execution
const direct = await pod.raw`ls -la /app`;

// Safer for commands with special characters
const literal = await pod.raw`echo "Hello | World"`;
```

## Pod Selection Patterns

### Exact Pod Names

Target pods by exact name:

```typescript
// Full pod name
await $.k8s({
  pod: 'web-deployment-abc123-xyz',
  namespace: 'production'
})`uptime`;
```

### Label Selectors

Select pods using Kubernetes label selectors:

```typescript
// Using label selector syntax
await $.k8s({
  pod: '-l app=web,env=production',
  namespace: 'production'
})`systemctl status nginx`;

// The adapter automatically resolves to first matching pod
```

### Pattern Matching

Use patterns for pod selection:

```typescript
// Regex pattern (handled by kubectl)
const webPods = await $.k8s({
  pod: 'web-.*',
  namespace: 'production'
})`curl localhost:8080/health`;
```

## Environment and Working Directory

### Environment Variables

Set environment variables for pod execution:

```typescript
const configured = $.k8s({
  pod: 'my-pod'
}).env({
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  LOG_LEVEL: 'debug'
});

await configured`echo "DB: $DATABASE_URL"`;
```

### Working Directory

Execute commands in specific directories:

```typescript
const app = $.k8s({
  pod: 'app-pod'
}).cd('/app');

// All commands run in /app directory
await app`npm test`;
await app`ls -la package.json`;
```

## Error Handling

### Command Failures

Handle pod execution failures:

```typescript
try {
  await $.k8s({
    pod: 'worker-pod'
  })`failing-command`;
} catch (error) {
  if (error.code === 'KUBERNETES_ERROR') {
    console.log('Kubectl failed:', error.message);
    console.log('Stderr:', error.stderr);
  }
}
```

### Non-throwing Execution

Use `.nothrow()` to handle failures gracefully:

```typescript
const result = await $.k8s({
  pod: 'test-pod'
})`risky-operation`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed with code:', result.exitCode);
  console.log('Error:', result.stderr);
}
```

### Pod Availability

Check pod readiness before execution:

```typescript
const adapter = $.getAdapter('kubernetes');

// Check if pod is ready
const isReady = await adapter.isPodReady('my-pod', 'default');
if (!isReady) {
  console.log('Pod not ready, waiting...');
  // Implementation would wait or retry
}
```

## Advanced Execution

### Timeout Configuration

Set execution timeouts:

```typescript
const longRunning = $.k8s({
  pod: 'batch-processor'
}).timeout(300000); // 5 minutes

await longRunning`large-batch-job --input /data/large-file.csv`;
```

### Retry Logic

Implement retry for transient failures:

```typescript
const resilient = $.k8s({
  pod: 'api-pod'
}).retry({
  attempts: 3,
  delay: 1000
});

await resilient`curl -f http://external-api/data`;
```

### Streaming Output

Stream command output in real-time:

```typescript
const stream = $.k8s({
  pod: 'log-processor'
})`tail -f /var/log/app.log`;

// Process streaming output
stream.stdout.on('data', (chunk) => {
  process.stdout.write(`[${pod}] ${chunk}`);
});

await stream;
```

## Common Patterns

### Health Checks

Implement pod health checking:

```typescript
async function checkPodHealth(podName: string) {
  const pod = $.k8s({ pod: podName, namespace: 'production' });
  
  const health = await pod.exec`curl -f http://localhost:8080/health`.nothrow();
  
  if (health.ok) {
    const status = JSON.parse(health.stdout);
    return { healthy: status.status === 'ok', details: status };
  }
  
  return { healthy: false, error: health.stderr };
}
```

### Log Collection

Collect logs from application files:

```typescript
async function collectApplicationLogs(pods: string[]) {
  const results = await Promise.all(
    pods.map(async (podName) => {
      const pod = $.k8s({ pod: podName, namespace: 'production' });
      const logs = await pod.exec`tail -n 100 /var/log/app.log`.nothrow();
      
      return {
        pod: podName,
        logs: logs.ok ? logs.stdout : `Error: ${logs.stderr}`
      };
    })
  );
  
  return results;
}
```

### Configuration Validation

Validate configuration in pods:

```typescript
async function validateConfig(podName: string) {
  const pod = $.k8s({ pod: podName, namespace: 'staging' });
  
  // Check config file exists
  const configCheck = await pod.exec`test -f /app/config.json`.nothrow();
  if (!configCheck.ok) {
    throw new Error('Configuration file missing');
  }
  
  // Validate JSON syntax
  const jsonCheck = await pod.exec`python -m json.tool /app/config.json`.nothrow();
  if (!jsonCheck.ok) {
    throw new Error('Invalid JSON configuration');
  }
  
  // Application-specific validation
  const appCheck = await pod.exec`/app/bin/validate-config`.nothrow();
  if (!appCheck.ok) {
    throw new Error(`Config validation failed: ${appCheck.stderr}`);
  }
  
  return true;
}
```

## Performance Considerations

### Command Efficiency

- **Batch Commands**: Combine multiple operations into single commands
- **Shell Pipelines**: Use shell features to reduce round trips
- **Local Processing**: Process data locally when possible

### Resource Usage

- **Memory**: Each kubectl exec creates a new process
- **Network**: Commands go through Kubernetes API server
- **Timing**: Allow 200-500ms overhead per command

### Best Practices

```typescript
// Good: Single command with pipeline
await pod.exec`ps aux | grep node | awk '{print $2}' | head -5`;

// Less efficient: Multiple separate commands
const ps = await pod.exec`ps aux`;
const filtered = await pod.exec`echo "${ps.stdout}" | grep node`;
const pids = await pod.exec`echo "${filtered.stdout}" | awk '{print $2}'`;
```