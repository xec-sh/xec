# Kubernetes Adapter

The Kubernetes adapter enables command execution within Kubernetes pods with advanced features like port forwarding and log streaming.

## Overview

The Kubernetes adapter (`packages/core/src/adapters/k8s-adapter.ts`) provides seamless pod command execution with:

- **Pod lifecycle management** (create, exec, delete)
- **Multi-container pod support**
- **Service port forwarding**
- **Real-time log streaming**
- **File operations** (copy to/from pods)
- **Namespace management**
- **ConfigMap and Secret integration**

## Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Execute in existing pod
const pod = $.k8s({
  pod: 'my-app-7d9f8c6b5-x2vjm',
  namespace: 'production'
});

const result = await pod`ls -la /app`;
console.log(result.stdout);

// Execute in specific container
const container = $.k8s({
  pod: 'multi-container-pod',
  container: 'app',
  namespace: 'default'
});

await container`cat /etc/config/app.yaml`;
```

## Pod Configuration

### Working with Existing Pods

```typescript
// Connect to running pod
const existing = $.k8s({
  pod: 'web-server-abc123',
  namespace: 'production'
});

// Execute commands
await existing`ps aux`;
await existing`tail -f /var/log/app.log`;

// With specific container
const sidecar = $.k8s({
  pod: 'app-pod',
  container: 'logging-agent',
  namespace: 'monitoring'
});
```

### Creating Ephemeral Pods

```typescript
// Create pod from image
const ephemeral = $.k8s({
  image: 'busybox:latest',
  name: 'debug-pod',
  namespace: 'default',
  rm: true  // Auto-delete after execution
});

// With resource limits
const limited = $.k8s({
  image: 'ubuntu:22.04',
  name: 'worker',
  resources: {
    requests: {
      memory: '256Mi',
      cpu: '100m'
    },
    limits: {
      memory: '512Mi',
      cpu: '500m'
    }
  }
});

// With environment variables
const withEnv = $.k8s({
  image: 'node:18',
  name: 'node-app',
  env: {
    NODE_ENV: 'production',
    API_KEY: 'secret-key'
  }
});
```

## Namespace Management

### Working with Namespaces

```typescript
// Default namespace
const defaultNs = $.k8s({ pod: 'my-pod' });

// Specific namespace
const prodNs = $.k8s({ 
  pod: 'app-pod',
  namespace: 'production'
});

// Create namespace
await $.k8s.createNamespace('staging');

// List pods in namespace
const pods = await $.k8s.listPods('production');

// Delete namespace
await $.k8s.deleteNamespace('old-namespace');
```

### Cross-Namespace Operations

```typescript
// Copy between namespaces
const source = $.k8s({ pod: 'source-pod', namespace: 'dev' });
const dest = $.k8s({ pod: 'dest-pod', namespace: 'staging' });

const data = await source`cat /data/export.json`;
await dest.stdin(data)`cat > /data/import.json`;
```

## Port Forwarding

### Service Port Forwarding

```typescript
// Forward service port
const forward = await $.k8s.portForward({
  service: 'web-service',
  namespace: 'production',
  localPort: 8080,
  remotePort: 80
});

// Access service locally
const response = await fetch('http://localhost:8080');

// Close forwarding
await forward.close();
```

### Pod Port Forwarding

```typescript
// Forward pod port directly
const podForward = await $.k8s.portForward({
  pod: 'database-pod',
  namespace: 'data',
  localPort: 5432,
  remotePort: 5432
});

// Connect to database through forwarded port
const db = await connectDB('localhost:5432');

// Multiple port forwards
const multiForward = await $.k8s.portForward({
  pod: 'monitoring-pod',
  forwards: [
    { local: 3000, remote: 3000 },  // Grafana
    { local: 9090, remote: 9090 }   // Prometheus
  ]
});
```

## Log Streaming

### Real-time Log Streaming

```typescript
const pod = $.k8s({ pod: 'app-pod', namespace: 'production' });

// Stream logs
await pod.logs({
  follow: true,
  tail: 100,
  timestamps: true,
  since: '10m'
}).stdout((line) => {
  console.log('LOG:', line);
}).stderr((line) => {
  console.error('ERROR:', line);
});

// Multi-container logs
await pod.logs({
  container: 'nginx',
  follow: true
});

// Previous container logs
await pod.logs({
  previous: true,
  container: 'app'
});
```

### Log Aggregation

```typescript
// Get logs from multiple pods
const selector = { app: 'web-server' };
const pods = await $.k8s.getPodsByLabel(selector, 'production');

for (const podName of pods) {
  const pod = $.k8s({ pod: podName, namespace: 'production' });
  const logs = await pod.getLogs({ tail: 50 });
  console.log(`${podName}:\n${logs}`);
}
```

## File Operations

### Copy Files to Pod

```typescript
const pod = $.k8s({ pod: 'app-pod', namespace: 'default' });

// Copy single file
await pod.copyTo('/local/config.yaml', '/app/config.yaml');

// Copy directory
await pod.copyToDir('/local/assets', '/app/static');

// Copy with specific container
await pod.copyTo('/local/nginx.conf', '/etc/nginx/nginx.conf', {
  container: 'nginx'
});
```

### Copy Files from Pod

```typescript
// Copy file from pod
await pod.copyFrom('/app/logs/error.log', '/local/logs/error.log');

// Copy directory from pod
await pod.copyFromDir('/app/data', '/local/backup');

// Copy with tar streaming
await pod.copyFrom('/var/log', '/local/pod-logs', {
  compress: true
});
```

## ConfigMaps and Secrets

### Working with ConfigMaps

```typescript
// Create ConfigMap
await $.k8s.createConfigMap('app-config', {
  namespace: 'production',
  data: {
    'database.yaml': 'host: db.example.com\nport: 5432',
    'app.properties': 'debug=false\nport=8080'
  }
});

// Mount ConfigMap in pod
const podWithConfig = $.k8s({
  image: 'app:latest',
  name: 'configured-app',
  volumes: [{
    name: 'config',
    configMap: 'app-config',
    mountPath: '/etc/config'
  }]
});

// Update ConfigMap
await $.k8s.updateConfigMap('app-config', {
  namespace: 'production',
  data: {
    'database.yaml': 'host: new-db.example.com\nport: 5432'
  }
});
```

### Working with Secrets

```typescript
// Create Secret
await $.k8s.createSecret('api-keys', {
  namespace: 'production',
  type: 'Opaque',
  data: {
    'api-key': Buffer.from('secret-key').toString('base64'),
    'db-password': Buffer.from('password123').toString('base64')
  }
});

// Mount Secret as environment variables
const podWithSecrets = $.k8s({
  image: 'app:latest',
  name: 'secure-app',
  envFrom: [{
    secretRef: { name: 'api-keys' }
  }]
});

// Mount Secret as files
const podWithSecretFiles = $.k8s({
  image: 'app:latest',
  name: 'app-with-certs',
  volumes: [{
    name: 'certs',
    secret: 'tls-certificates',
    mountPath: '/etc/ssl/certs'
  }]
});
```

## Multi-Container Pods

### Container Management

```typescript
// Execute in specific container
const app = $.k8s({
  pod: 'multi-container-pod',
  container: 'app',
  namespace: 'default'
});

await app`npm run migrate`;

// Execute in sidecar
const sidecar = $.k8s({
  pod: 'multi-container-pod',
  container: 'logging-agent'
});

await sidecar`tail -f /var/log/collected.log`;

// List containers in pod
const containers = await $.k8s.getContainers('multi-container-pod');
console.log('Containers:', containers);
```

### Init Containers

```typescript
// Create pod with init container
const podWithInit = $.k8s({
  image: 'app:latest',
  name: 'app-with-init',
  initContainers: [{
    name: 'init-db',
    image: 'migrate:latest',
    command: ['./migrate.sh']
  }]
});

// Wait for init completion
await podWithInit.waitForReady({ timeout: 60000 });
```

## Job and CronJob Execution

### Running Jobs

```typescript
// Create and run job
const job = await $.k8s.createJob({
  name: 'data-processing',
  namespace: 'batch',
  image: 'processor:latest',
  command: ['python', 'process.py'],
  completions: 1,
  parallelism: 1,
  backoffLimit: 3
});

// Wait for job completion
await job.waitForCompletion({ timeout: 300000 });

// Get job logs
const logs = await job.getLogs();
console.log('Job output:', logs);

// Clean up
await job.delete();
```

### Managing CronJobs

```typescript
// Create CronJob
await $.k8s.createCronJob({
  name: 'backup',
  namespace: 'maintenance',
  schedule: '0 2 * * *',  // Daily at 2 AM
  image: 'backup:latest',
  command: ['./backup.sh']
});

// Trigger CronJob manually
await $.k8s.triggerCronJob('backup', 'maintenance');

// Suspend/resume CronJob
await $.k8s.suspendCronJob('backup', 'maintenance');
await $.k8s.resumeCronJob('backup', 'maintenance');
```

## Service Mesh Integration

### Working with Istio

```typescript
// Execute through sidecar proxy
const istioApp = $.k8s({
  pod: 'app-pod',
  container: 'app',  // Skip istio-proxy sidecar
  namespace: 'istio-system'
});

// Check sidecar status
const sidecar = $.k8s({
  pod: 'app-pod',
  container: 'istio-proxy',
  namespace: 'istio-system'
});

await sidecar`curl -s localhost:15000/clusters`;
```

## Health Checks and Probes

### Readiness and Liveness

```typescript
const healthyPod = $.k8s({
  image: 'app:latest',
  name: 'healthy-app',
  livenessProbe: {
    httpGet: {
      path: '/health',
      port: 8080
    },
    initialDelaySeconds: 30,
    periodSeconds: 10
  },
  readinessProbe: {
    exec: {
      command: ['cat', '/tmp/ready']
    },
    initialDelaySeconds: 5,
    periodSeconds: 5
  }
});

// Wait for pod to be ready
await healthyPod.waitForReady();

// Check pod status
const status = await healthyPod.getStatus();
console.log('Pod ready:', status.ready);
```

## Advanced Features

### Resource Management

```typescript
// With resource quotas
const limited = $.k8s({
  image: 'worker:latest',
  resources: {
    requests: { memory: '256Mi', cpu: '250m' },
    limits: { memory: '1Gi', cpu: '1000m' }
  }
});

// With node affinity
const nodeSpecific = $.k8s({
  image: 'gpu-app:latest',
  nodeSelector: {
    'kubernetes.io/gpu': 'true'
  },
  tolerations: [{
    key: 'gpu',
    operator: 'Equal',
    value: 'true',
    effect: 'NoSchedule'
  }]
});
```

### Security Context

```typescript
const secure = $.k8s({
  image: 'app:latest',
  securityContext: {
    runAsUser: 1000,
    runAsGroup: 1000,
    fsGroup: 2000,
    runAsNonRoot: true,
    readOnlyRootFilesystem: true,
    capabilities: {
      drop: ['ALL'],
      add: ['NET_BIND_SERVICE']
    }
  }
});
```

### Labels and Annotations

```typescript
const labeled = $.k8s({
  image: 'app:latest',
  labels: {
    app: 'web-server',
    version: 'v1.0.0',
    environment: 'production'
  },
  annotations: {
    'prometheus.io/scrape': 'true',
    'prometheus.io/port': '9090'
  }
});

// Query by labels
const pods = await $.k8s.getPodsByLabel(
  { app: 'web-server', environment: 'production' },
  'default'
);
```

## Error Handling

```typescript
const pod = $.k8s({ pod: 'app-pod', namespace: 'default' });

try {
  await pod`command`;
} catch (error) {
  if (error.code === 'POD_NOT_FOUND') {
    console.error('Pod does not exist');
  } else if (error.code === 'CONTAINER_NOT_READY') {
    console.error('Container is not ready');
    await pod.waitForReady();
  } else if (error.code === 'KUBECTL_NOT_FOUND') {
    console.error('kubectl not installed or not in PATH');
  } else if (error.code === 'KUBECONFIG_ERROR') {
    console.error('Invalid kubeconfig or cluster unreachable');
  }
}
```

## Implementation Details

The Kubernetes adapter is implemented in:
- `packages/core/src/adapters/k8s-adapter.ts` - Main adapter implementation
- `packages/core/src/k8s/kubectl-client.ts` - kubectl wrapper
- `packages/core/src/k8s/pod-executor.ts` - Pod execution logic
- `packages/core/src/k8s/port-forward.ts` - Port forwarding implementation
- `packages/core/src/k8s/log-stream.ts` - Log streaming functionality

## See Also

- [Kubernetes Environment Setup](/docs/environments/kubernetes/setup)
- [Pod Execution](/docs/environments/kubernetes/pod-execution)
- [Port Forwarding](/docs/environments/kubernetes/port-forwarding)
- [Log Streaming](/docs/environments/kubernetes/log-streaming)
- [Multi-Container Pods](/docs/environments/kubernetes/multi-container)