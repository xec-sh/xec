# Port Forwarding

The Kubernetes adapter provides comprehensive port forwarding capabilities, enabling secure tunneling from local ports to services running in pods. This includes support for static and dynamic port allocation, service integration, and advanced forwarding patterns for development and debugging workflows.

## Basic Port Forwarding

### Simple Port Forward
Forward local ports to pod ports:

```javascript
import { $ } from '@xec-sh/core';
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter();

// Forward local port 8080 to pod port 80
const portForward = await k8s.portForward(
  'nginx-pod',     // Pod name
  8080,           // Local port
  80,             // Remote port (in pod)
  {
    namespace: 'production'
  }
);

await portForward.open();
console.log(`Port forward active: localhost:${portForward.localPort} -> pod:${portForward.remotePort}`);

// Use the forwarded port
const response = await $`curl -s http://localhost:8080/health`;
console.log('Health check:', response.stdout);

// Close port forward when done
await portForward.close();
```

### Dynamic Port Allocation
Let the system choose an available local port:

```javascript
// Use dynamic port allocation (local port = 0)
const dynamicPortForward = await k8s.portForward(
  'api-server-pod',
  0,              // Dynamic local port
  8080,           // Remote port
  {
    namespace: 'production',
    dynamicLocalPort: true
  }
);

await dynamicPortForward.open();
console.log(`Dynamic port forward: localhost:${dynamicPortForward.localPort} -> pod:8080`);

// The actual port is available after opening
const localPort = dynamicPortForward.localPort;
await $`curl -s http://localhost:${localPort}/api/status`;

await dynamicPortForward.close();
```

### Label-Based Port Forwarding
Forward to pods selected by labels:

```javascript
// Find pod by label and forward
const selectedPod = await k8s.getPodFromSelector('app=web-server', 'production');
if (!selectedPod) {
  throw new Error('No pod found matching selector');
}

const labelPortForward = await k8s.portForward(
  selectedPod,
  3000,
  8080,
  { namespace: 'production' }
);

await labelPortForward.open();
console.log(`Forwarding to selected pod: ${selectedPod}`);

// Test the forwarded connection
await $`curl -s http://localhost:3000/metrics`;

await labelPortForward.close();
```

## Pod API Integration

### Using Pod Context
Use the pod API for convenient port forwarding:

```javascript
import { $k8s } from '@xec-sh/core';

// Create Kubernetes context
const k8s = $k8s({
  namespace: 'production'
});

// Get pod instance
const webPod = k8s.pod('web-server-pod');

// Static port forwarding
const staticForward = await webPod.portForward(8080, 80);
console.log(`Static forward: localhost:${staticForward.localPort} -> pod:${staticForward.remotePort}`);

// Dynamic port forwarding
const dynamicForward = await webPod.portForwardDynamic(3000);
console.log(`Dynamic forward: localhost:${dynamicForward.localPort} -> pod:3000`);

// Use forwarded ports
await $`curl -s http://localhost:${staticForward.localPort}/`;
await $`curl -s http://localhost:${dynamicForward.localPort}/api`;

// Cleanup
await staticForward.close();
await dynamicForward.close();
```

### Multiple Port Forwards
Manage multiple port forwards for a single pod:

```javascript
const dbPod = k8s.pod('database-pod');

// Forward multiple ports
const pgForward = await dbPod.portForward(5432, 5432);  // PostgreSQL
const redisForward = await dbPod.portForwardDynamic(6379);  // Redis
const adminForward = await dbPod.portForwardDynamic(8080);  // Admin interface

console.log('Database connections:');
console.log(`PostgreSQL: localhost:${pgForward.localPort}`);
console.log(`Redis: localhost:${redisForward.localPort}`);
console.log(`Admin: localhost:${adminForward.localPort}`);

// Test database connections
await $`pg_isready -h localhost -p ${pgForward.localPort}`;
await $`redis-cli -h localhost -p ${redisForward.localPort} ping`;
await $`curl -s http://localhost:${adminForward.localPort}/status`;

// Cleanup all forwards
await Promise.all([
  pgForward.close(),
  redisForward.close(),
  adminForward.close()
]);
```

## Service Port Forwarding

### Service-to-Pod Forwarding
Forward to services and their underlying pods:

```javascript
// Get service endpoints
async function getServiceEndpoints(serviceName, namespace) {
  const result = await k8s.executeKubectl([
    'get', 'endpoints', serviceName,
    '-n', namespace,
    '-o', 'jsonpath={.subsets[0].addresses[0].targetRef.name}'
  ]);
  
  return result.stdout.trim();
}

// Forward to service backend
const servicePod = await getServiceEndpoints('web-service', 'production');
const serviceForward = await k8s.portForward(
  servicePod,
  8080,
  80,
  { namespace: 'production' }
);

await serviceForward.open();

// Test service connectivity
await $`curl -s http://localhost:8080/api/health`;

await serviceForward.close();
```

### Load Balancer Integration
Integrate with Kubernetes load balancing:

```javascript
// Forward to multiple service replicas
async function forwardToAllReplicas(serviceName, namespace, remotePort) {
  // Get all pods behind service
  const podsResult = await k8s.executeKubectl([
    'get', 'pods',
    '-l', `app=${serviceName}`,
    '-n', namespace,
    '-o', 'jsonpath={.items[*].metadata.name}'
  ]);
  
  const pods = podsResult.stdout.trim().split(' ').filter(Boolean);
  const forwards = [];
  
  // Create port forwards for each replica
  for (const pod of pods) {
    const forward = await k8s.portForward(
      pod,
      0,  // Dynamic port
      remotePort,
      { namespace, dynamicLocalPort: true }
    );
    
    await forward.open();
    forwards.push({ pod, forward });
  }
  
  return forwards;
}

// Forward to all web server replicas
const replicaForwards = await forwardToAllReplicas('web-server', 'production', 8080);

console.log('Replica forwards:');
replicaForwards.forEach(({ pod, forward }) => {
  console.log(`${pod}: localhost:${forward.localPort}`);
});

// Test load distribution
for (const { pod, forward } of replicaForwards) {
  const response = await $`curl -s http://localhost:${forward.localPort}/hostname`;
  console.log(`${pod} hostname:`, response.stdout.trim());
}

// Cleanup all replica forwards
await Promise.all(replicaForwards.map(({ forward }) => forward.close()));
```

## Advanced Forwarding Patterns

### Conditional Port Forwarding
Implement conditional forwarding based on pod status:

```javascript
async function conditionalPortForward(podSelector, namespace, localPort, remotePort) {
  // Find healthy pod
  const pods = await k8s.executeKubectl([
    'get', 'pods',
    '-l', podSelector,
    '-n', namespace,
    '--field-selector=status.phase=Running',
    '-o', 'jsonpath={.items[*].metadata.name}'
  ]);
  
  const podList = pods.stdout.trim().split(' ').filter(Boolean);
  
  for (const pod of podList) {
    if (await k8s.isPodReady(pod, namespace)) {
      console.log(`Found healthy pod: ${pod}`);
      
      const forward = await k8s.portForward(pod, localPort, remotePort, { namespace });
      await forward.open();
      
      // Verify connectivity
      try {
        await $`curl -f --max-time 5 http://localhost:${localPort}/health`;
        console.log(`Port forward established to healthy pod: ${pod}`);
        return forward;
      } catch (error) {
        console.warn(`Pod ${pod} not responding, trying next...`);
        await forward.close();
      }
    }
  }
  
  throw new Error(`No healthy pods found for selector: ${podSelector}`);
}

// Use conditional forwarding
try {
  const healthyForward = await conditionalPortForward(
    'app=api,tier=backend',
    'production',
    8080,
    80
  );
  
  // Use the healthy connection
  await $`curl -s http://localhost:8080/api/data`;
  
  await healthyForward.close();
} catch (error) {
  console.error('Failed to establish healthy connection:', error.message);
}
```

### Resilient Port Forwarding
Implement resilient forwarding with automatic recovery:

```javascript
class ResilientPortForward {
  constructor(k8s, podSelector, namespace, localPort, remotePort) {
    this.k8s = k8s;
    this.podSelector = podSelector;
    this.namespace = namespace;
    this.localPort = localPort;
    this.remotePort = remotePort;
    this.currentForward = null;
    this.isActive = false;
  }
  
  async start() {
    this.isActive = true;
    await this.establishConnection();
    this.startHealthMonitoring();
  }
  
  async establishConnection() {
    try {
      const pod = await this.k8s.getPodFromSelector(this.podSelector, this.namespace);
      if (!pod) {
        throw new Error(`No pod found for selector: ${this.podSelector}`);
      }
      
      if (this.currentForward) {
        await this.currentForward.close();
      }
      
      this.currentForward = await this.k8s.portForward(
        pod,
        this.localPort,
        this.remotePort,
        { namespace: this.namespace }
      );
      
      await this.currentForward.open();
      console.log(`Resilient forward established: localhost:${this.localPort} -> ${pod}:${this.remotePort}`);
      
    } catch (error) {
      console.error('Failed to establish connection:', error.message);
      if (this.isActive) {
        setTimeout(() => this.establishConnection(), 5000);
      }
    }
  }
  
  startHealthMonitoring() {
    const healthCheck = async () => {
      if (!this.isActive) return;
      
      try {
        // Test connectivity
        await $`curl -f --max-time 3 http://localhost:${this.localPort}/health`;
      } catch (error) {
        console.warn('Health check failed, re-establishing connection...');
        await this.establishConnection();
      }
      
      if (this.isActive) {
        setTimeout(healthCheck, 10000);  // Check every 10 seconds
      }
    };
    
    setTimeout(healthCheck, 10000);
  }
  
  async stop() {
    this.isActive = false;
    if (this.currentForward) {
      await this.currentForward.close();
      this.currentForward = null;
    }
  }
  
  get localPortNumber() {
    return this.currentForward?.localPort;
  }
  
  get isConnected() {
    return this.currentForward?.isOpen || false;
  }
}

// Use resilient port forwarding
const resilientForward = new ResilientPortForward(
  k8s,
  'app=web-server',
  'production',
  8080,
  80
);

await resilientForward.start();

// Use the resilient connection
setInterval(async () => {
  if (resilientForward.isConnected) {
    try {
      const response = await $`curl -s http://localhost:${resilientForward.localPortNumber}/timestamp`;
      console.log('Service response:', response.stdout.trim());
    } catch (error) {
      console.error('Service call failed:', error.message);
    }
  }
}, 5000);

// Stop after 60 seconds
setTimeout(async () => {
  await resilientForward.stop();
}, 60000);
```

### Multi-Protocol Forwarding
Support multiple protocols through port forwarding:

```javascript
// Forward multiple protocols for a database pod
async function setupDatabaseForwarding(podName, namespace) {
  const dbPod = k8s.pod(podName);
  
  // PostgreSQL main connection
  const pgMain = await dbPod.portForward(5432, 5432);
  
  // PostgreSQL streaming replication
  const pgStream = await dbPod.portForwardDynamic(5433);
  
  // HTTP admin interface
  const adminHttp = await dbPod.portForwardDynamic(8080);
  
  // Metrics endpoint
  const metrics = await dbPod.portForwardDynamic(9187);
  
  console.log('Database forwarding setup:');
  console.log(`PostgreSQL: localhost:${pgMain.localPort}`);
  console.log(`Replication: localhost:${pgStream.localPort}`);
  console.log(`Admin: http://localhost:${adminHttp.localPort}`);
  console.log(`Metrics: http://localhost:${metrics.localPort}/metrics`);
  
  // Test all connections
  await Promise.all([
    $`pg_isready -h localhost -p ${pgMain.localPort}`,
    $`curl -f http://localhost:${adminHttp.localPort}/health`,
    $`curl -f http://localhost:${metrics.localPort}/metrics`
  ]);
  
  return { pgMain, pgStream, adminHttp, metrics };
}

// Setup and use multi-protocol forwarding
const dbForwards = await setupDatabaseForwarding('postgres-primary', 'production');

// Use different protocols
await $`psql -h localhost -p ${dbForwards.pgMain.localPort} -U admin -c "SELECT version();"`;
await $`curl -s http://localhost:${dbForwards.adminHttp.localPort}/api/stats`;

// Cleanup
await Promise.all(Object.values(dbForwards).map(forward => forward.close()));
```

## Development Workflows

### Development Environment Setup
Create development environment with port forwarding:

```javascript
// Setup complete development environment
async function setupDevEnvironment(namespace = 'development') {
  const services = {
    api: { pod: 'api-server', ports: { http: 8080, debug: 5005 } },
    database: { pod: 'postgres', ports: { db: 5432, admin: 8081 } },
    cache: { pod: 'redis', ports: { redis: 6379, monitor: 8082 } },
    frontend: { pod: 'frontend', ports: { http: 3000, hmr: 3001 } }
  };
  
  const forwards = {};
  
  for (const [service, config] of Object.entries(services)) {
    forwards[service] = {};
    
    const podName = await k8s.getPodFromSelector(`app=${config.pod}`, namespace);
    if (!podName) {
      console.warn(`No pod found for service: ${service}`);
      continue;
    }
    
    for (const [portName, remotePort] of Object.entries(config.ports)) {
      const forward = await k8s.portForward(
        podName,
        0,  // Dynamic local port
        remotePort,
        { namespace, dynamicLocalPort: true }
      );
      
      await forward.open();
      forwards[service][portName] = forward;
      
      console.log(`${service}.${portName}: localhost:${forward.localPort} -> ${podName}:${remotePort}`);
    }
  }
  
  return forwards;
}

// Setup development environment
const devEnv = await setupDevEnvironment('development');

// Generate development configuration
const devConfig = {
  api: {
    url: `http://localhost:${devEnv.api.http.localPort}`,
    debugPort: devEnv.api.debug.localPort
  },
  database: {
    url: `postgresql://user:pass@localhost:${devEnv.database.db.localPort}/app`,
    adminUrl: `http://localhost:${devEnv.database.admin.localPort}`
  },
  cache: {
    url: `redis://localhost:${devEnv.cache.redis.localPort}`,
    monitorUrl: `http://localhost:${devEnv.cache.monitor.localPort}`
  },
  frontend: {
    url: `http://localhost:${devEnv.frontend.http.localPort}`,
    hmrPort: devEnv.frontend.hmr.localPort
  }
};

console.log('Development configuration:', JSON.stringify(devConfig, null, 2));

// Test all services
await Promise.all([
  $`curl -f ${devConfig.api.url}/health`,
  $`pg_isready -h localhost -p ${devEnv.database.db.localPort}`,
  $`redis-cli -h localhost -p ${devEnv.cache.redis.localPort} ping`,
  $`curl -f ${devConfig.frontend.url}`
]);

console.log('Development environment ready!');
```

### Debugging Workflows
Support debugging workflows with targeted forwarding:

```javascript
// Setup debugging session
async function setupDebuggingSession(serviceName, namespace) {
  const podName = await k8s.getPodFromSelector(`app=${serviceName}`, namespace);
  if (!podName) {
    throw new Error(`No pod found for service: ${serviceName}`);
  }
  
  const pod = k8s.pod(podName);
  
  // Setup debugging ports
  const httpForward = await pod.portForward(8080, 8080);     // HTTP service
  const debugForward = await pod.portForwardDynamic(5005);   // JVM debug port
  const jmxForward = await pod.portForwardDynamic(9999);     // JMX monitoring
  const profilerForward = await pod.portForwardDynamic(8849); // Profiler
  
  console.log('Debugging session setup:');
  console.log(`Service: http://localhost:${httpForward.localPort}`);
  console.log(`Debug: localhost:${debugForward.localPort} (attach IDE debugger)`);
  console.log(`JMX: service:jmx:rmi:///jndi/rmi://localhost:${jmxForward.localPort}/jmxrmi`);
  console.log(`Profiler: localhost:${profilerForward.localPort}`);
  
  // Enable debugging in the pod
  await pod.exec`
    echo "Enabling debug mode..."
    kill -USR1 $(pgrep java)  # Signal to enable debug
    echo "Debug mode enabled"
  `;
  
  return {
    pod: podName,
    forwards: { httpForward, debugForward, jmxForward, profilerForward },
    cleanup: async () => {
      await Promise.all([
        httpForward.close(),
        debugForward.close(),
        jmxForward.close(),
        profilerForward.close()
      ]);
    }
  };
}

// Start debugging session
const debugSession = await setupDebuggingSession('user-service', 'staging');

console.log(`Debugging ${debugSession.pod}. Connect IDE to port ${debugSession.forwards.debugForward.localPort}`);

// Keep session alive
process.on('SIGINT', async () => {
  console.log('Cleaning up debugging session...');
  await debugSession.cleanup();
  process.exit(0);
});
```

## Error Handling and Recovery

### Connection Error Handling
Handle port forwarding connection errors:

```javascript
import { ExecutionError } from '@xec-sh/core';

async function robustPortForward(podSelector, namespace, localPort, remotePort, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pod = await k8s.getPodFromSelector(podSelector, namespace);
      if (!pod) {
        throw new Error(`No pod found for selector: ${podSelector}`);
      }
      
      if (!(await k8s.isPodReady(pod, namespace))) {
        throw new Error(`Pod ${pod} is not ready`);
      }
      
      const forward = await k8s.portForward(pod, localPort, remotePort, { namespace });
      await forward.open();
      
      // Test the connection
      await $`curl -f --max-time 5 http://localhost:${forward.localPort}/health`;
      
      console.log(`Port forward established successfully on attempt ${attempt}`);
      return forward;
      
    } catch (error) {
      console.error(`Port forward attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        throw new ExecutionError(
          `Failed to establish port forward after ${retries} attempts`,
          'KUBERNETES_ERROR'
        );
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Use robust port forwarding
try {
  const forward = await robustPortForward('app=web-server', 'production', 8080, 80);
  
  // Use the connection
  await $`curl -s http://localhost:8080/api/data`;
  
  await forward.close();
} catch (error) {
  console.error('Port forwarding failed:', error.message);
}
```

### Resource Cleanup
Ensure proper cleanup of port forwards:

```javascript
class PortForwardManager {
  constructor() {
    this.activeForwards = new Set();
    this.setupCleanupHandlers();
  }
  
  async createForward(k8s, pod, localPort, remotePort, options = {}) {
    const forward = await k8s.portForward(pod, localPort, remotePort, options);
    await forward.open();
    
    this.activeForwards.add(forward);
    
    // Wrap the close method to remove from tracking
    const originalClose = forward.close.bind(forward);
    forward.close = async () => {
      await originalClose();
      this.activeForwards.delete(forward);
    };
    
    return forward;
  }
  
  async closeAll() {
    const closes = Array.from(this.activeForwards).map(forward => forward.close());
    await Promise.all(closes);
    this.activeForwards.clear();
  }
  
  setupCleanupHandlers() {
    const cleanup = async () => {
      console.log('Cleaning up port forwards...');
      await this.closeAll();
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
  
  get activeCount() {
    return this.activeForwards.size;
  }
}

// Use port forward manager
const manager = new PortForwardManager();

// Create multiple forwards
const webForward = await manager.createForward(k8s, 'web-pod', 8080, 80, { namespace: 'production' });
const dbForward = await manager.createForward(k8s, 'db-pod', 5432, 5432, { namespace: 'production' });
const cacheForward = await manager.createForward(k8s, 'cache-pod', 6379, 6379, { namespace: 'production' });

console.log(`Active forwards: ${manager.activeCount}`);

// Use the forwards
await $`curl -s http://localhost:8080/health`;
await $`pg_isready -h localhost -p 5432`;
await $`redis-cli -h localhost -p 6379 ping`;

// Cleanup happens automatically on process exit
```

## Best Practices

### Security Considerations
- Use specific namespaces to limit access scope
- Avoid exposing sensitive services to localhost
- Use firewall rules to restrict port forward access
- Monitor and log port forwarding activities
- Use VPN or secure networks for remote access

### Performance Optimization
- Use dynamic ports to avoid conflicts
- Close unused port forwards promptly
- Monitor port forward resource usage
- Use connection pooling when appropriate
- Implement health checks for forwarded services

### Reliability Patterns
- Implement retry logic for connection failures
- Use health checks to verify forwarded services
- Plan for pod restarts and migrations
- Monitor port forward stability
- Implement automatic recovery mechanisms

```javascript
// Complete port forwarding solution
class ComprehensivePortForward {
  constructor(k8s, config) {
    this.k8s = k8s;
    this.config = config;
    this.forwards = new Map();
    this.healthChecks = new Map();
  }
  
  async setup() {
    for (const [name, serviceConfig] of Object.entries(this.config.services)) {
      await this.setupService(name, serviceConfig);
    }
  }
  
  async setupService(name, config) {
    try {
      const pod = await this.k8s.getPodFromSelector(config.selector, config.namespace);
      if (!pod) {
        throw new Error(`No pod found for ${name}`);
      }
      
      const forward = await this.k8s.portForward(
        pod,
        config.localPort || 0,
        config.remotePort,
        { namespace: config.namespace, dynamicLocalPort: !config.localPort }
      );
      
      await forward.open();
      this.forwards.set(name, forward);
      
      if (config.healthCheck) {
        this.setupHealthCheck(name, config.healthCheck);
      }
      
      console.log(`${name}: localhost:${forward.localPort} -> ${pod}:${config.remotePort}`);
      
    } catch (error) {
      console.error(`Failed to setup ${name}:`, error.message);
    }
  }
  
  setupHealthCheck(name, healthConfig) {
    const check = async () => {
      const forward = this.forwards.get(name);
      if (!forward || !forward.isOpen) return;
      
      try {
        await $`curl -f --max-time ${healthConfig.timeout || 5} ${healthConfig.url.replace(':PORT', forward.localPort)}`;
      } catch (error) {
        console.warn(`Health check failed for ${name}, attempting recovery...`);
        await this.recoverService(name);
      }
    };
    
    const interval = setInterval(check, healthConfig.interval || 30000);
    this.healthChecks.set(name, interval);
  }
  
  async recoverService(name) {
    const config = this.config.services[name];
    const forward = this.forwards.get(name);
    
    if (forward) {
      await forward.close();
    }
    
    await this.setupService(name, config);
  }
  
  async cleanup() {
    // Clear health checks
    for (const interval of this.healthChecks.values()) {
      clearInterval(interval);
    }
    this.healthChecks.clear();
    
    // Close all forwards
    const closes = Array.from(this.forwards.values()).map(forward => forward.close());
    await Promise.all(closes);
    this.forwards.clear();
  }
  
  getForward(name) {
    return this.forwards.get(name);
  }
  
  getUrl(name, path = '') {
    const forward = this.forwards.get(name);
    return forward ? `http://localhost:${forward.localPort}${path}` : null;
  }
}

// Usage
const forwardConfig = {
  services: {
    api: {
      selector: 'app=api-server',
      namespace: 'production',
      remotePort: 8080,
      localPort: 8080,
      healthCheck: {
        url: 'http://localhost:PORT/health',
        interval: 30000,
        timeout: 5
      }
    },
    database: {
      selector: 'app=postgres',
      namespace: 'production',
      remotePort: 5432,
      healthCheck: {
        url: 'pg_isready -h localhost -p PORT',
        interval: 60000
      }
    }
  }
};

const portForwardSolution = new ComprehensivePortForward(k8s, forwardConfig);

try {
  await portForwardSolution.setup();
  
  // Use the forwarded services
  console.log('API URL:', portForwardSolution.getUrl('api', '/status'));
  console.log('Database port:', portForwardSolution.getForward('database')?.localPort);
  
  // Keep running...
  await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
  
} finally {
  await portForwardSolution.cleanup();
}
```