---
title: Port Forwarding
description: Kubernetes port forwarding for local access to pod services
keywords: [kubernetes, k8s, port-forward, networking, local-access, tunnel]
source_files:
  - packages/core/src/adapters/kubernetes-adapter.ts
  - packages/core/src/utils/kubernetes-api.ts
key_functions:
  - KubernetesAdapter.portForward()
  - KubernetesPortForward.open()
  - KubernetesPortForward.close()
  - K8sPod.portForward()
  - K8sPod.portForwardDynamic()
verification_date: 2025-08-03
---

# Port Forwarding

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/kubernetes-adapter.ts` - Port forwarding implementation
- `packages/core/src/utils/kubernetes-api.ts` - Pod-level port forwarding methods

**Key Functions:**
- `KubernetesAdapter.portForward()` - Create port forward instance
- `KubernetesPortForward.open()` - Establish port forward connection
- `KubernetesPortForward.close()` - Close port forward connection
- `K8sPod.portForward()` - Forward to specific local port
- `K8sPod.portForwardDynamic()` - Forward with dynamic local port allocation

## Overview

Xec provides seamless Kubernetes port forwarding capabilities through `kubectl port-forward`, enabling local access to services running inside pods. This is essential for debugging, development, and accessing services that aren't exposed through Kubernetes Services.

## Basic Port Forwarding

### Fixed Local Port

Forward a specific local port to a pod port:

```typescript
import { $ } from '@xec-sh/core';

const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('web-app');

// Forward local port 8080 to pod port 80
const forward = await pod.portForward(8080, 80);
console.log(`Access app at: http://localhost:${forward.localPort}`);

// Use the forwarded connection
const response = await $`curl http://localhost:8080/health`;
console.log('Health check:', response.stdout);

// Always close when done
await forward.close();
```

### Dynamic Local Port

Let Kubernetes allocate an available local port:

```typescript
const pod = k8s.pod('api-server');

// Kubernetes picks an available port
const forward = await pod.portForwardDynamic(3000);
console.log(`API available at: http://localhost:${forward.localPort}`);

// Use the dynamically allocated port
const apiUrl = `http://localhost:${forward.localPort}/api/v1/status`;
const status = await $`curl ${apiUrl}`;
console.log('API Status:', status.stdout);

await forward.close();
```

## Port Forward Management

### Connection Status

Monitor port forward connection status:

```typescript
const forward = await pod.portForward(5432, 5432);

console.log('Local port:', forward.localPort);
console.log('Remote port:', forward.remotePort);
console.log('Is open:', forward.isOpen);

// Connection is automatically opened
if (forward.isOpen) {
  // Use the connection
  await $`psql -h localhost -p ${forward.localPort} -U admin -c "SELECT 1"`;
}

await forward.close();
console.log('Is open after close:', forward.isOpen); // false
```

### Automatic Cleanup

Use try-finally blocks for guaranteed cleanup:

```typescript
const dbForward = await pod.portForward(5432, 5432);

try {
  // Database operations
  await $`pg_dump -h localhost -p ${dbForward.localPort} mydb > backup.sql`;
  
  // Long-running operations
  await $`psql -h localhost -p ${dbForward.localPort} -f migration.sql`;
  
} finally {
  // Ensure cleanup even if operations fail
  await dbForward.close();
}
```

## Multiple Port Forwards

### Concurrent Forwards

Manage multiple port forwards simultaneously:

```typescript
const k8s = $.k8s({ namespace: 'production' });

// Set up multiple forwards
const webForward = await k8s.pod('web-server').portForward(8080, 80);
const apiForward = await k8s.pod('api-server').portForwardDynamic(3000);
const dbForward = await k8s.pod('database').portForward(5432, 5432);

console.log('Services available:');
console.log(`  Web: http://localhost:${webForward.localPort}`);
console.log(`  API: http://localhost:${apiForward.localPort}`);
console.log(`  DB:  localhost:${dbForward.localPort}`);

// Use all services
await $`curl http://localhost:${webForward.localPort}/health`;
await $`curl http://localhost:${apiForward.localPort}/api/health`;
await $`pg_isready -h localhost -p ${dbForward.localPort}`;

// Clean up all forwards
await Promise.all([
  webForward.close(),
  apiForward.close(),
  dbForward.close()
]);
```

### Sequential Setup

Set up port forwards one by one:

```typescript
const services = [
  { pod: 'frontend', localPort: 3000, remotePort: 80 },
  { pod: 'backend', localPort: 8080, remotePort: 8080 },
  { pod: 'redis', localPort: 6379, remotePort: 6379 }
];

const forwards = [];

for (const service of services) {
  const pod = k8s.pod(service.pod);
  const forward = await pod.portForward(service.localPort, service.remotePort);
  forwards.push(forward);
  
  console.log(`${service.pod} ready on localhost:${forward.localPort}`);
}

// Test all services
for (const forward of forwards) {
  console.log(`Testing port ${forward.localPort}...`);
  const test = await $`nc -z localhost ${forward.localPort}`.nothrow();
  console.log(`  ${test.ok ? 'OK' : 'FAILED'}`);
}

// Cleanup
await Promise.all(forwards.map(f => f.close()));
```

## Advanced Port Forwarding

### Container-Specific Forwarding

Forward to specific containers in multi-container pods:

```typescript
// Forward to specific container port
const forward = await $.k8s({
  pod: 'multi-container-pod',
  namespace: 'default'
}).k8s.pod('multi-container-pod').portForward(8080, 8080);

// The port forward goes to the pod, but you target the right container port
const nginxForward = await pod.portForward(80, 80);    // nginx container
const appForward = await pod.portForward(3000, 3000);  // app container
const metricsForward = await pod.portForward(9090, 9090); // metrics container

await nginxForward.close();
await appForward.close();
await metricsForward.close();
```

### Cross-Namespace Forwarding

Forward to pods in different namespaces:

```typescript
// Production database
const prodDb = $.k8s({ namespace: 'production' }).pod('postgres-primary');
const prodForward = await prodDb.portForward(5433, 5432);

// Staging database  
const stagingDb = $.k8s({ namespace: 'staging' }).pod('postgres-primary');
const stagingForward = await stagingDb.portForward(5434, 5432);

console.log('Database forwards:');
console.log(`  Production: localhost:${prodForward.localPort}`);
console.log(`  Staging:    localhost:${stagingForward.localPort}`);

// Can now access both databases locally
await $`pg_dump -h localhost -p ${prodForward.localPort} proddb > prod-backup.sql`;
await $`pg_dump -h localhost -p ${stagingForward.localPort} stagingdb > staging-backup.sql`;

await Promise.all([prodForward.close(), stagingForward.close()]);
```

## Development Workflows

### Debugging Applications

Set up debugging environment with port forwarding:

```typescript
async function setupDebugSession(appPod: string) {
  const k8s = $.k8s({ namespace: 'development' });
  const pod = k8s.pod(appPod);
  
  // Forward debug ports
  const debugForward = await pod.portForward(9229, 9229); // Node.js debug
  const appForward = await pod.portForwardDynamic(3000);   // Application
  
  console.log('Debug session ready:');
  console.log(`  Debug port: chrome://inspect -> localhost:${debugForward.localPort}`);
  console.log(`  Application: http://localhost:${appForward.localPort}`);
  
  // Keep session alive
  console.log('Press Ctrl+C to end debug session...');
  
  // Return cleanup function
  return async () => {
    console.log('Ending debug session...');
    await Promise.all([debugForward.close(), appForward.close()]);
  };
}

const cleanup = await setupDebugSession('my-app-debug');

// Simulate work or wait for user input
await new Promise(resolve => setTimeout(resolve, 30000));

await cleanup();
```

### Database Operations

Access databases running in pods:

```typescript
async function databaseMaintenance() {
  const db = $.k8s({ namespace: 'production' }).pod('postgres-primary');
  const forward = await db.portForward(5432, 5432);
  
  try {
    console.log('Running database maintenance...');
    
    // Create backup
    await $`pg_dump -h localhost -p ${forward.localPort} -U admin myapp > backup-$(date +%Y%m%d).sql`;
    
    // Run maintenance queries
    await $`psql -h localhost -p ${forward.localPort} -U admin myapp -c "VACUUM ANALYZE;"`;
    
    // Check database stats
    const stats = await $`psql -h localhost -p ${forward.localPort} -U admin myapp -c "SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables ORDER BY n_tup_ins DESC LIMIT 10;"`;
    console.log('Database stats:\n', stats.stdout);
    
  } finally {
    await forward.close();
  }
}
```

### API Testing

Test internal APIs through port forwarding:

```typescript
async function testInternalAPI() {
  const api = $.k8s({ namespace: 'testing' }).pod('internal-api');
  const forward = await api.portForwardDynamic(8080);
  
  const baseUrl = `http://localhost:${forward.localPort}`;
  
  try {
    // Health check
    console.log('Testing health endpoint...');
    const health = await $`curl -f ${baseUrl}/health`;
    console.log('Health:', health.stdout);
    
    // API endpoints
    console.log('Testing API endpoints...');
    const users = await $`curl -f ${baseUrl}/api/users`;
    const userCount = JSON.parse(users.stdout).length;
    console.log(`Found ${userCount} users`);
    
    // Performance test
    console.log('Running performance test...');
    await $`ab -n 100 -c 10 ${baseUrl}/api/status`;
    
  } finally {
    await forward.close();
  }
}
```

## Error Handling

### Connection Failures

Handle port forwarding failures gracefully:

```typescript
async function robustPortForward(podName: string, localPort: number, remotePort: number) {
  const pod = $.k8s({ namespace: 'default' }).pod(podName);
  
  try {
    const forward = await pod.portForward(localPort, remotePort);
    return forward;
  } catch (error) {
    if (error.message.includes('bind: address already in use')) {
      console.log(`Port ${localPort} in use, trying dynamic allocation...`);
      return await pod.portForwardDynamic(remotePort);
    }
    
    if (error.message.includes('pod not found')) {
      throw new Error(`Pod ${podName} not found or not ready`);
    }
    
    throw error;
  }
}
```

### Retry Logic

Implement retry for transient failures:

```typescript
async function establishPortForward(pod: string, localPort: number, remotePort: number, retries = 3) {
  const k8sPod = $.k8s({ namespace: 'default' }).pod(pod);
  
  for (let i = 0; i < retries; i++) {
    try {
      const forward = await k8sPod.portForward(localPort, remotePort);
      console.log(`Port forward established on attempt ${i + 1}`);
      return forward;
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error.message);
      
      if (i === retries - 1) {
        throw new Error(`Failed to establish port forward after ${retries} attempts`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
```

## Security Considerations

### Localhost Binding

Port forwards bind to localhost by default, limiting access:

```typescript
// Port forward is only accessible from localhost
const forward = await pod.portForward(8080, 80);

// To access from other machines, you'd need additional setup
// (kubectl port-forward by default binds to 127.0.0.1)
console.log('Only accessible from localhost:', forward.localPort);
```

### Temporary Access

Use port forwards for temporary access only:

```typescript
async function temporaryDatabaseAccess(query: string) {
  const db = $.k8s({ namespace: 'production' }).pod('secure-db');
  const forward = await db.portForwardDynamic(5432);
  
  try {
    // Limited time window for access
    const timeout = setTimeout(() => {
      throw new Error('Database access timeout');
    }, 60000); // 1 minute max
    
    const result = await $`psql -h localhost -p ${forward.localPort} -c "${query}"`;
    clearTimeout(timeout);
    
    return result.stdout;
  } finally {
    // Always close the forward
    await forward.close();
  }
}
```

## Performance Characteristics

### Connection Overhead

- **Setup Time**: 200-500ms to establish port forward
- **Throughput**: Limited by kubectl proxy and network
- **Latency**: Additional hop through kubectl process

### Resource Usage

```typescript
// Monitor port forward resource usage
const forward = await pod.portForward(8080, 80);

console.log('Port forward details:');
console.log(`  Local port: ${forward.localPort}`);
console.log(`  Remote port: ${forward.remotePort}`);
console.log(`  Status: ${forward.isOpen ? 'Connected' : 'Disconnected'}`);

// Port forwards use kubectl subprocesses
// Each forward consumes ~5-10MB memory
```

### Best Practices

```typescript
// Good: Dynamic ports avoid conflicts
const forward = await pod.portForwardDynamic(8080);

// Good: Always clean up
try {
  await usePortForward(forward);
} finally {
  await forward.close();
}

// Good: Test connectivity before use
const testResult = await $`nc -z localhost ${forward.localPort}`.nothrow();
if (testResult.ok) {
  console.log('Port forward ready');
}
```