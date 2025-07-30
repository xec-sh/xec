---
sidebar_position: 4
---

# Kubernetes Adapter

The Kubernetes Adapter enables command execution inside Kubernetes pods using `kubectl exec`. It provides a seamless interface for pod operations, including port forwarding, log streaming, and file transfers.

## Overview

The Kubernetes Adapter provides:
- Command execution in pods via `kubectl exec`
- Port forwarding for local development
- Real-time log streaming with follow mode
- File copy to/from pods
- Multi-container pod support
- TTY support for interactive commands
- Namespace and context management

## Prerequisites

- `kubectl` installed and configured
- Valid kubeconfig with cluster access
- Appropriate RBAC permissions for pod operations

## Basic Usage

### Pod Execution

```typescript
import { $ } from '@xec-sh/core';

// Execute in a specific pod
const k8s = $.k8s({ 
  pod: 'my-app-pod',
  namespace: 'default' 
});

await k8s`hostname`;
await k8s`ls -la /app`;
```

### Pod-Centric API

The recommended approach is using the pod-centric API:

```typescript
// Get Kubernetes context
const k8s = $.k8s({ namespace: 'production' });

// Get a pod instance
const webPod = k8s.pod('web-server');

// Execute commands
await webPod.exec`ps aux`;
await webPod.exec`cat /etc/hostname`;
```

## Configuration

### Namespace and Context

```typescript
// Specify namespace
const k8s = $.k8s({ namespace: 'staging' });

// Use specific context
const prod = $.k8s({ 
  context: 'production-cluster',
  namespace: 'app' 
});

// Custom kubeconfig
const custom = $.k8s({ 
  kubeconfig: '/path/to/kubeconfig',
  namespace: 'default' 
});
```

### Container Selection

```typescript
// Multi-container pods
const k8s = $.k8s({
  pod: 'multi-container-pod',
  container: 'app',
  namespace: 'default'
});

await k8s`ps aux`; // Executes in 'app' container

// Or using pod API
const pod = k8s.pod('multi-container-pod');
await pod.exec`nginx -v`; // Default container
```

## Port Forwarding

### Basic Port Forward

```typescript
const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('web-app');

// Forward local 8080 to pod 80
const forward = await pod.portForward(8080, 80);
console.log(`Forwarding localhost:${forward.localPort} -> pod:${forward.remotePort}`);

// Use the forwarded port
const response = await $`curl http://localhost:8080`;

// Always close when done
await forward.close();
```

### Dynamic Port Allocation

```typescript
// Let the system choose a free port
const forward = await pod.portForwardDynamic(3000);
console.log(`Dynamic port: ${forward.localPort}`);

// Use in applications
const apiUrl = `http://localhost:${forward.localPort}/api`;
```

### Multiple Port Forwards

```typescript
const k8s = $.k8s({ namespace: 'microservices' });

// Forward multiple services
const forwards = await Promise.all([
  k8s.pod('frontend').portForward(3000, 3000),
  k8s.pod('backend').portForward(8080, 8080),
  k8s.pod('database').portForward(5432, 5432)
]);

// Use services locally
console.log('Frontend: http://localhost:3000');
console.log('Backend: http://localhost:8080');

// Clean up all
await Promise.all(forwards.map(f => f.close()));
```

## Log Streaming

### Get Logs

```typescript
const pod = k8s.pod('app-server');

// Get recent logs
const logs = await pod.logs({ tail: 100 });
console.log(logs);

// With timestamps
const timedLogs = await pod.logs({ 
  timestamps: true,
  tail: 50 
});

// From specific container
const nginxLogs = await pod.logs({ 
  container: 'nginx',
  tail: 20 
});
```

### Stream Logs

```typescript
// Stream logs in real-time
const stream = await pod.streamLogs(
  (line) => console.log(`[LOG] ${line}`),
  { follow: true, tail: 10 }
);

// Stop streaming after some time
setTimeout(() => stream.stop(), 30000);
```

### Follow Logs

```typescript
// Convenient follow method
const stream = await pod.follow(
  (line) => {
    // Process each log line
    if (line.includes('ERROR')) {
      console.error(`🔴 ${line}`);
    } else {
      console.log(`📝 ${line}`);
    }
  },
  { tail: 0 } // Only new logs
);

// Stop on demand
process.on('SIGINT', () => {
  stream.stop();
  process.exit(0);
});
```

### Multi-Pod Log Aggregation

```typescript
const k8s = $.k8s({ namespace: 'production' });
const pods = ['web-1', 'web-2', 'web-3'];

// Stream from multiple pods
const streams = await Promise.all(
  pods.map(async (podName) => {
    const pod = k8s.pod(podName);
    return pod.follow(
      (line) => console.log(`[${podName}] ${line}`),
      { tail: 0 }
    );
  })
);

// Stop all streams
const stopAll = () => streams.forEach(s => s.stop());
```

## File Operations

### Copy Files to Pod

```typescript
const pod = k8s.pod('app-pod');

// Copy single file
await pod.copyTo('./config.json', '/app/config.json');

// Copy to specific container
await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');

// Copy directory (kubectl handles recursion)
await pod.copyTo('./configs/', '/app/configs/');
```

### Copy Files from Pod

```typescript
// Download pod files
await pod.copyFrom('/app/logs/error.log', './error-backup.log');

// From specific container
await pod.copyFrom('/var/log/nginx/access.log', './nginx.log', 'nginx');

// Copy entire directory
await pod.copyFrom('/app/data/', './backup/');
```

## Advanced Features

### TTY Support

```typescript
// Interactive commands
const k8s = $.k8s({
  pod: 'debug-pod',
  namespace: 'default',
  tty: true
});

// Run interactive shell
await k8s`/bin/bash`;

// Or with pod API
const pod = k8s.pod('debug-pod');
await pod.exec`top`; // Can use TTY when needed
```

### Label Selectors

```typescript
// Execute in pods by label (first matching pod)
const k8s = $.k8s({
  pod: '-l app=web,tier=frontend',
  namespace: 'production'
});

await k8s`hostname`;
```

### Exec with Stdin

```typescript
// Provide stdin input
const k8s = $.k8s({
  pod: 'app-pod',
  namespace: 'default',
  stdin: true
});

// Send data to command
const result = await k8s`cat > /tmp/data.txt`.stdin('Hello from stdin');
```

## Debugging Workflows

### Interactive Debugging

```typescript
const k8s = $.k8s({ namespace: 'staging' });
const debugPod = k8s.pod('app-debug');

// Set up debugging session
async function debugSession() {
  // Forward debug port
  const debugPort = await debugPod.portForward(9229, 9229);
  console.log(`Node.js debugger: chrome://inspect`);
  console.log(`Connect to: localhost:${debugPort.localPort}`);
  
  // Forward app port
  const appPort = await debugPod.portForwardDynamic(3000);
  console.log(`Application: http://localhost:${appPort.localPort}`);
  
  // Stream logs
  const logs = await debugPod.follow(
    (line) => {
      if (line.includes('Debugger listening')) {
        console.log('🐛 Debugger ready!');
      }
      console.log(line);
    }
  );
  
  // Cleanup handler
  const cleanup = async () => {
    logs.stop();
    await debugPort.close();
    await appPort.close();
  };
  
  process.on('SIGINT', cleanup);
  
  return { debugPort, appPort, cleanup };
}
```

### Health Checks

```typescript
async function checkPodHealth(pod: K8sPod) {
  // Check if pod is running
  const hostname = await pod.exec`hostname`.nothrow();
  if (!hostname.ok) {
    console.error('Pod is not responding');
    return false;
  }
  
  // Check application health
  const health = await pod.exec`curl -s http://localhost:8080/health`.nothrow();
  if (!health.ok) {
    console.error('Health check failed');
    return false;
  }
  
  const status = JSON.parse(health.stdout);
  return status.status === 'healthy';
}
```

## Production Patterns

### Rolling Updates Monitoring

```typescript
async function monitorDeployment(deployment: string, namespace: string) {
  const k8s = $.k8s({ namespace });
  
  // Get pods for deployment
  const podsResult = await $`kubectl get pods -n ${namespace} -l app=${deployment} -o json`;
  const pods = JSON.parse(podsResult.stdout).items;
  
  // Monitor each pod
  for (const podInfo of pods) {
    const pod = k8s.pod(podInfo.metadata.name);
    
    console.log(`Checking pod: ${podInfo.metadata.name}`);
    
    // Check readiness
    const ready = await pod.exec`test -f /tmp/ready`.nothrow();
    console.log(`Ready: ${ready.ok}`);
    
    // Get recent logs
    const logs = await pod.logs({ tail: 10 });
    console.log('Recent logs:', logs);
  }
}
```

### Batch Operations

```typescript
async function runMaintenanceOnPods(selector: string, namespace: string) {
  const k8s = $.k8s({ namespace });
  
  // Get all matching pods
  const result = await $`kubectl get pods -n ${namespace} ${selector} -o json`;
  const pods = JSON.parse(result.stdout).items;
  
  // Run maintenance on each pod
  const results = await Promise.all(
    pods.map(async (podInfo) => {
      const pod = k8s.pod(podInfo.metadata.name);
      
      try {
        // Clear cache
        await pod.exec`rm -rf /tmp/cache/*`;
        
        // Restart service
        await pod.exec`supervisorctl restart app`;
        
        return { pod: podInfo.metadata.name, status: 'success' };
      } catch (error) {
        return { pod: podInfo.metadata.name, status: 'failed', error };
      }
    })
  );
  
  console.log('Maintenance results:', results);
}
```

## Error Handling

### Pod Not Found

```typescript
try {
  const pod = k8s.pod('nonexistent-pod');
  await pod.exec`echo test`;
} catch (error) {
  if (error.message.includes('not found')) {
    console.error('Pod does not exist');
  }
}
```

### Permission Errors

```typescript
try {
  await pod.exec`cat /etc/shadow`;
} catch (error) {
  if (error.stderr?.includes('Permission denied')) {
    console.error('Insufficient permissions in container');
  }
}
```

### Connection Issues

```typescript
const k8s = $.k8s({ 
  context: 'remote-cluster',
  kubectlTimeout: 10000 // 10 seconds
});

try {
  await k8s.pod('test').exec`echo "connected"`;
} catch (error) {
  if (error.message.includes('Unable to connect')) {
    console.error('Cannot reach Kubernetes cluster');
  }
}
```

## Best Practices

1. **Always close port forwards** - Prevent resource leaks
2. **Use specific namespaces** - Avoid accidental cross-namespace operations
3. **Handle pod restarts** - Pods can be recreated with new names
4. **Set appropriate timeouts** - Network operations can be slow
5. **Use labels for flexibility** - Pods names change, labels are stable
6. **Stream large logs** - Don't buffer gigabytes of logs in memory
7. **Validate before operations** - Check pod exists and is ready

## Performance Tips

### Connection Reuse

```typescript
// Reuse the same k8s context
const k8s = $.k8s({ namespace: 'production' });

// Multiple operations on same pod
const pod = k8s.pod('app-server');
await pod.exec`date`;
await pod.exec`uptime`;
await pod.exec`df -h`;
```

### Batch File Transfers

```typescript
// Copy multiple files efficiently
const files = ['config.json', 'secrets.env', 'app.yml'];

await Promise.all(
  files.map(file => pod.copyTo(`./${file}`, `/app/${file}`))
);
```

### Selective Log Streaming

```typescript
// Filter logs at source
const stream = await pod.streamLogs(
  (line) => {
    // Only process error logs
    if (line.includes('ERROR') || line.includes('WARN')) {
      processLogLine(line);
    }
  },
  { tail: 100 }
);
```

## Integration Examples

### CI/CD Pipeline

```typescript
async function deployAndTest(image: string, namespace: string) {
  const k8s = $.k8s({ namespace });
  
  // Deploy new version
  await $`kubectl set image deployment/app app=${image} -n ${namespace}`;
  
  // Wait for rollout
  await $`kubectl rollout status deployment/app -n ${namespace}`;
  
  // Get new pod
  const podName = await $`kubectl get pod -l app=app -n ${namespace} -o jsonpath='{.items[0].metadata.name}'`.text();
  const pod = k8s.pod(podName);
  
  // Run tests
  const testResult = await pod.exec`npm test`.nothrow();
  
  if (!testResult.ok) {
    // Rollback on failure
    await $`kubectl rollout undo deployment/app -n ${namespace}`;
    throw new Error('Tests failed, rolled back');
  }
  
  return { pod: podName, status: 'deployed' };
}
```

### Monitoring Script

```typescript
async function monitorPods(namespace: string) {
  const k8s = $.k8s({ namespace });
  
  while (true) {
    const pods = await $`kubectl get pods -n ${namespace} -o json`.json();
    
    for (const pod of pods.items) {
      if (pod.status.phase === 'Running') {
        const podInstance = k8s.pod(pod.metadata.name);
        
        // Check memory usage
        const memory = await podInstance.exec`cat /proc/meminfo | grep MemAvailable`.text();
        console.log(`${pod.metadata.name}: ${memory}`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
```

## Next Steps

- Explore [Docker Adapter](./docker) for container management
- Learn about [SSH Adapter](./ssh) for remote execution
- See [Port Forwarding Examples](https://github.com/xec-sh/xec/blob/main/packages/core/examples/03-advanced-features/13-kubernetes-port-forwarding.ts)
- Check [Parallel Execution](../advanced/parallel-execution) for multiple pod operations