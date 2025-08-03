# Multi-Container Pod Management

Kubernetes pods often contain multiple containers working together in sidecar, ambassador, or adapter patterns. The Kubernetes adapter provides comprehensive support for executing commands in specific containers within multi-container pods, managing container lifecycle, and orchestrating complex container interactions.

## Container Selection

### Targeting Specific Containers
Execute commands in specific containers within a pod:

```javascript
import { $ } from '@xec-sh/core';

// Execute in main application container
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-app-pod',
    container: 'app',
    namespace: 'production'
  }
})`curl -s http://localhost:8080/health`;

// Execute in sidecar logging container
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-app-pod',
    container: 'log-collector',
    namespace: 'production'
  }
})`tail -f /var/log/application.log`;

// Execute in proxy container
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-app-pod',
    container: 'envoy-proxy',
    namespace: 'production'
  }
})`curl -s http://localhost:9901/stats`;
```

### Container Discovery
Discover and list containers within pods:

```javascript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter();

// Get all containers in a pod
async function getContainers(podName, namespace) {
  const result = await k8s.executeKubectl([
    'get', 'pod', podName,
    '-n', namespace,
    '-o', 'jsonpath={.spec.containers[*].name}'
  ]);
  
  return result.stdout.trim().split(' ').filter(Boolean);
}

// List containers in a pod
const containers = await getContainers('multi-container-pod', 'production');
console.log('Available containers:', containers);

// Execute command in each container
for (const container of containers) {
  console.log(`\n--- Container: ${container} ---`);
  
  const result = await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'multi-container-pod',
      container,
      namespace: 'production'
    }
  })`hostname && ps aux | head -5`;
  
  console.log(result.stdout);
}
```

### Container Status Monitoring
Monitor the status of individual containers:

```javascript
// Check container readiness
async function isContainerReady(podName, containerName, namespace) {
  const result = await k8s.executeKubectl([
    'get', 'pod', podName,
    '-n', namespace,
    '-o', `jsonpath={.status.containerStatuses[?(@.name=='${containerName}')].ready}`
  ]);
  
  return result.stdout.trim() === 'true';
}

// Check all containers in a pod
async function checkPodContainers(podName, namespace) {
  const containers = await getContainers(podName, namespace);
  const statuses = {};
  
  for (const container of containers) {
    statuses[container] = {
      ready: await isContainerReady(podName, container, namespace),
      executing: false
    };
  }
  
  return statuses;
}

// Monitor multi-container pod
const statuses = await checkPodContainers('service-mesh-pod', 'production');
console.log('Container statuses:', statuses);
```

## Sidecar Patterns

### Logging Sidecar
Manage logging sidecars alongside main applications:

```javascript
// Main application container
const appResult = await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-service-pod',
    container: 'web-app',
    namespace: 'production'
  }
})`
  echo "Processing user request..."
  ./process-request.sh
  echo "Request completed successfully"
`;

// Logging sidecar operations
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-service-pod',
    container: 'fluentd',
    namespace: 'production'
  }
})`
  echo "Flushing logs to central storage..."
  fluentd-ctl flush
  echo "Log flush completed"
`;

// Verify log processing
const logStatus = await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-service-pod',
    container: 'fluentd',
    namespace: 'production'
  }
})`tail -n 10 /var/log/fluentd/fluentd.log`;

console.log('Log processing status:', logStatus.stdout);
```

### Monitoring Sidecar
Implement monitoring sidecars for metrics collection:

```javascript
// Application metrics collection
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'api-server-pod',
    container: 'api',
    namespace: 'production'
  }
})`
  echo "Generating application metrics..."
  curl -s http://localhost:8080/metrics > /tmp/app-metrics.txt
`;

// Metrics sidecar processing
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'api-server-pod',
    container: 'prometheus-exporter',
    namespace: 'production'
  }
})`
  echo "Exporting metrics to Prometheus..."
  ./export-metrics.sh /tmp/app-metrics.txt
  curl -X POST http://prometheus:9090/api/v1/admin/tsdb/snapshot
`;

// Health check across containers
const containers = ['api', 'prometheus-exporter', 'log-shipper'];
for (const container of containers) {
  const health = await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: 'api-server-pod',
      container,
      namespace: 'production'
    }
  })`curl -f http://localhost:${container === 'api' ? '8080' : '9090'}/health`;
  
  console.log(`${container} health:`, health.exitCode === 0 ? 'OK' : 'FAIL');
}
```

### Security Sidecar
Manage security sidecars for authentication and authorization:

```javascript
// Authentication sidecar
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'secure-app-pod',
    container: 'oauth-proxy',
    namespace: 'production'
  }
})`
  echo "Refreshing OAuth tokens..."
  ./refresh-tokens.sh
  echo "Token refresh completed"
`;

// Main application with authenticated context
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'secure-app-pod',
    container: 'app',
    namespace: 'production'
  }
})`
  echo "Accessing protected resources..."
  curl -H "Authorization: Bearer $(cat /var/run/secrets/oauth/token)" \
       https://api.internal.com/protected/data
`;

// Security scanning sidecar
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'secure-app-pod',
    container: 'security-scanner',
    namespace: 'production'
  }
})`
  echo "Running security scan..."
  ./scan-vulnerabilities.sh /app
  echo "Security scan completed"
`;
```

## Ambassador Patterns

### Service Mesh Ambassador
Manage service mesh ambassador containers:

```javascript
// Envoy proxy configuration
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'service-mesh-pod',
    container: 'envoy',
    namespace: 'production'
  }
})`
  echo "Updating Envoy configuration..."
  curl -X POST http://localhost:9901/config_dump
  
  echo "Checking proxy stats..."
  curl -s http://localhost:9901/stats | grep cluster
`;

// Application container using ambassador
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'service-mesh-pod',
    container: 'app',
    namespace: 'production'
  }
})`
  echo "Making service calls through ambassador..."
  
  # Calls routed through Envoy sidecar
  curl -s http://localhost:8080/api/users
  curl -s http://localhost:8080/api/orders
  curl -s http://localhost:8080/api/metrics
`;

// Traffic management
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'service-mesh-pod',
    container: 'envoy',
    namespace: 'production'
  }
})`
  echo "Updating traffic routing rules..."
  
  # Apply circuit breaker rules
  curl -X PUT http://localhost:9901/circuits \
       -d '{"upstream": "user-service", "threshold": 0.5}'
  
  # Check routing configuration
  curl -s http://localhost:9901/config_dump | jq '.configs[1].route_config'
`;
```

### Database Ambassador
Implement database ambassador patterns:

```javascript
// Database proxy ambassador
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'db-service-pod',
    container: 'pgbouncer',
    namespace: 'production'
  }
})`
  echo "Checking connection pool status..."
  psql -h localhost -p 6432 -U admin -d pgbouncer -c "SHOW POOLS;"
  
  echo "Reloading connection pool configuration..."
  psql -h localhost -p 6432 -U admin -d pgbouncer -c "RELOAD;"
`;

// Application using database ambassador
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'db-service-pod',
    container: 'app',
    namespace: 'production'
  }
})`
  echo "Running database operations through ambassador..."
  
  # Database operations routed through PgBouncer
  psql -h localhost -p 6432 -U appuser -d myapp -c "
    SELECT COUNT(*) as active_users FROM users WHERE last_login > NOW() - INTERVAL '1 day';
    SELECT table_name, pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size 
    FROM information_schema.tables WHERE table_schema = 'public';
  "
`;
```

## Adapter Patterns

### Configuration Adapter
Manage configuration adapters that transform configuration data:

```javascript
// Configuration transformer sidecar
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'config-service-pod',
    container: 'config-transformer',
    namespace: 'production'
  }
})`
  echo "Transforming configuration for application..."
  
  # Transform Kubernetes ConfigMaps to application format
  kubectl get configmap app-config -o yaml | \
    yq eval '.data' - | \
    ./transform-config.sh > /shared/app-config.json
  
  echo "Configuration transformation completed"
`;

// Application consuming transformed configuration
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'config-service-pod',
    container: 'app',
    namespace: 'production'
  }
})`
  echo "Loading transformed configuration..."
  
  # Application reads from shared volume
  cat /shared/app-config.json | jq '.database'
  
  echo "Starting application with new configuration..."
  ./start-app.sh --config=/shared/app-config.json
`;
```

### Protocol Adapter
Implement protocol adapters for legacy systems:

```javascript
// Protocol translation sidecar
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'legacy-integration-pod',
    container: 'protocol-adapter',
    namespace: 'production'
  }
})`
  echo "Starting protocol translation service..."
  
  # Start SOAP to REST adapter
  ./soap-rest-adapter --soap-endpoint=http://legacy:8080/soap \
                      --rest-port=9090 &
  
  # Wait for adapter to be ready
  while ! curl -f http://localhost:9090/health; do sleep 1; done
  echo "Protocol adapter ready"
`;

// Modern application using adapter
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'legacy-integration-pod',
    container: 'modern-app',
    namespace: 'production'
  }
})`
  echo "Making REST calls to legacy system via adapter..."
  
  # REST calls translated to SOAP by adapter
  curl -X GET http://localhost:9090/api/customers
  curl -X POST http://localhost:9090/api/orders \
       -H "Content-Type: application/json" \
       -d '{"customer_id": 123, "items": [{"sku": "ABC", "qty": 2}]}'
`;
```

## Container Coordination

### Sequential Container Operations
Coordinate operations across containers in sequence:

```javascript
// Multi-step deployment process
async function deployApplication(podName, namespace) {
  console.log('Step 1: Preparing deployment...');
  
  // 1. Stop application gracefully
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: podName,
      container: 'app',
      namespace
    }
  })`
    echo "Stopping application gracefully..."
    kill -TERM $(pgrep -f "java.*app.jar")
    sleep 5
  `;
  
  console.log('Step 2: Updating configuration...');
  
  // 2. Update configuration
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: podName,
      container: 'config-manager',
      namespace
    }
  })`
    echo "Updating application configuration..."
    kubectl get configmap app-config -o yaml > /tmp/old-config.yaml
    kubectl apply -f /config/new-config.yaml
  `;
  
  console.log('Step 3: Restarting services...');
  
  // 3. Restart application
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: podName,
      container: 'app',
      namespace
    }
  })`
    echo "Starting application with new configuration..."
    java -jar /app/app.jar --spring.config.location=/config/ &
    
    # Wait for application to be ready
    while ! curl -f http://localhost:8080/health; do sleep 2; done
    echo "Application started successfully"
  `;
  
  console.log('Step 4: Verifying deployment...');
  
  // 4. Verify deployment
  await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: podName,
      container: 'health-checker',
      namespace
    }
  })`
    echo "Running deployment verification..."
    ./verify-deployment.sh
    echo "Deployment verification completed"
  `;
}

// Execute coordinated deployment
await deployApplication('web-app-pod', 'production');
```

### Parallel Container Operations
Execute operations across containers in parallel:

```javascript
// Parallel health checks across all containers
async function parallelHealthCheck(podName, namespace) {
  const containers = await getContainers(podName, namespace);
  
  const healthChecks = containers.map(container => 
    $({
      adapterOptions: {
        type: 'kubernetes',
        pod: podName,
        container,
        namespace
      }
    })`
      echo "Health check for container ${container}"
      
      # Container-specific health checks
      case "${container}" in
        "app")
          curl -f http://localhost:8080/health
          ;;
        "database")
          pg_isready -h localhost -p 5432
          ;;
        "cache")
          redis-cli ping
          ;;
        "proxy")
          curl -f http://localhost:9901/ready
          ;;
        *)
          echo "Unknown container type"
          exit 1
          ;;
      esac
    `.catch(error => ({ container, error }))
  );
  
  const results = await Promise.all(healthChecks);
  
  results.forEach(result => {
    if (result.error) {
      console.error(`Health check failed for ${result.container}:`, result.error.message);
    } else {
      console.log(`Health check passed for container`);
    }
  });
  
  return results.every(result => !result.error);
}

// Execute parallel health checks
const allHealthy = await parallelHealthCheck('multi-service-pod', 'production');
console.log('All containers healthy:', allHealthy);
```

## Inter-Container Communication

### Shared Volume Communication
Use shared volumes for inter-container communication:

```javascript
// Producer container writing to shared volume
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'data-pipeline-pod',
    container: 'data-producer',
    namespace: 'production'
  }
})`
  echo "Producing data for processing..."
  
  for i in {1..100}; do
    echo "Record $i: $(date): $(uuidgen)" >> /shared/data/input.log
    sleep 0.1
  done
  
  echo "COMPLETE" > /shared/data/producer.status
  echo "Data production completed"
`;

// Consumer container reading from shared volume
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'data-pipeline-pod',
    container: 'data-processor',
    namespace: 'production'
  }
})`
  echo "Waiting for data production to complete..."
  
  while [ ! -f /shared/data/producer.status ]; do
    sleep 1
  done
  
  echo "Processing data..."
  cat /shared/data/input.log | \
    grep -E "[0-9]{4}-[0-9]{2}-[0-9]{2}" | \
    sort > /shared/data/processed.log
  
  echo "COMPLETE" > /shared/data/processor.status
  echo "Data processing completed"
`;

// Monitor container reading processed data
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'data-pipeline-pod',
    container: 'data-monitor',
    namespace: 'production'
  }
})`
  echo "Monitoring data pipeline..."
  
  while [ ! -f /shared/data/processor.status ]; do
    echo "Waiting for processing to complete..."
    sleep 2
  done
  
  echo "Pipeline completed. Results:"
  wc -l /shared/data/processed.log
  echo "Data pipeline monitoring completed"
`;
```

### Network Communication
Manage network communication between containers:

```javascript
// Service mesh communication monitoring
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'microservices-pod',
    container: 'service-a',
    namespace: 'production'
  }
})`
  echo "Service A making calls to Service B..."
  
  for i in {1..10}; do
    curl -s http://localhost:8081/api/data/$i
    sleep 1
  done
`;

// Monitor service mesh proxy
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'microservices-pod',
    container: 'envoy-proxy',
    namespace: 'production'
  }
})`
  echo "Monitoring service mesh traffic..."
  
  # Monitor connection stats
  curl -s http://localhost:9901/stats | grep -E "(upstream|downstream)"
  
  # Check circuit breaker status
  curl -s http://localhost:9901/clusters | grep -E "(health_flags|outlier)"
`;
```

## Error Handling and Recovery

### Container-Specific Error Handling
Handle errors specific to individual containers:

```javascript
import { ExecutionError } from '@xec-sh/core';

async function robustMultiContainerOperation(podName, namespace) {
  const containers = ['app', 'proxy', 'monitor'];
  const results = {};
  
  for (const container of containers) {
    try {
      results[container] = await $({
        adapterOptions: {
          type: 'kubernetes',
          pod: podName,
          container,
          namespace
        }
      })`
        echo "Testing container ${container}"
        
        case "${container}" in
          "app")
            curl -f http://localhost:8080/health
            ;;
          "proxy")
            curl -f http://localhost:9901/ready
            ;;
          "monitor")
            pgrep -f monitoring-agent
            ;;
        esac
      `;
      
      results[container].status = 'success';
      
    } catch (error) {
      console.error(`Container ${container} failed:`, error.message);
      results[container] = { status: 'failed', error: error.message };
      
      // Attempt container-specific recovery
      try {
        await recoverContainer(podName, container, namespace);
        results[container].status = 'recovered';
      } catch (recoveryError) {
        console.error(`Recovery failed for ${container}:`, recoveryError.message);
      }
    }
  }
  
  return results;
}

async function recoverContainer(podName, container, namespace) {
  console.log(`Attempting recovery for container ${container}...`);
  
  switch (container) {
    case 'app':
      await $({
        adapterOptions: {
          type: 'kubernetes',
          pod: podName,
          container,
          namespace
        }
      })`
        echo "Restarting application..."
        pkill -f "java.*app.jar"
        sleep 2
        java -jar /app/app.jar &
      `;
      break;
      
    case 'proxy':
      await $({
        adapterOptions: {
          type: 'kubernetes',
          pod: podName,
          container,
          namespace
        }
      })`
        echo "Reloading proxy configuration..."
        curl -X POST http://localhost:9901/config_dump
        kill -HUP $(pgrep envoy)
      `;
      break;
      
    case 'monitor':
      await $({
        adapterOptions: {
          type: 'kubernetes',
          pod: podName,
          container,
          namespace
        }
      })`
        echo "Restarting monitoring agent..."
        systemctl restart monitoring-agent
      `;
      break;
  }
}

// Execute robust multi-container operation
const results = await robustMultiContainerOperation('web-service-pod', 'production');
console.log('Multi-container operation results:', results);
```

## Best Practices

### Container Organization
- Group related containers logically within pods
- Use clear naming conventions for containers
- Implement proper resource sharing between containers
- Plan for container lifecycle dependencies

### Communication Patterns
- Use localhost networking for inter-container communication
- Implement shared volumes for data exchange
- Use proper synchronization mechanisms
- Monitor inter-container dependencies

### Resource Management
- Configure appropriate resource limits per container
- Monitor resource usage across all containers
- Implement graceful shutdown procedures
- Plan for container restart scenarios

### Security Considerations
- Use least-privilege principles for each container
- Isolate sensitive operations in dedicated containers
- Implement proper secret sharing mechanisms
- Monitor security across all containers

```javascript
// Comprehensive multi-container management example
class MultiContainerManager {
  constructor(podName, namespace, containers) {
    this.podName = podName;
    this.namespace = namespace;
    this.containers = containers;
    this.k8s = new KubernetesAdapter();
  }
  
  async executeInContainer(container, command) {
    return await $({
      adapterOptions: {
        type: 'kubernetes',
        pod: this.podName,
        container,
        namespace: this.namespace
      }
    })`${command}`;
  }
  
  async healthCheckAll() {
    const checks = this.containers.map(async container => {
      try {
        const result = await this.executeInContainer(container, 'echo "healthy"');
        return { container, status: 'healthy', result };
      } catch (error) {
        return { container, status: 'unhealthy', error: error.message };
      }
    });
    
    return await Promise.all(checks);
  }
  
  async coordinatedRestart() {
    console.log('Starting coordinated restart...');
    
    // Stop all containers gracefully
    for (const container of this.containers) {
      try {
        await this.executeInContainer(container, 'pkill -TERM -f main-process');
      } catch (error) {
        console.warn(`Graceful stop failed for ${container}:`, error.message);
      }
    }
    
    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Force restart if needed
    for (const container of this.containers) {
      try {
        await this.executeInContainer(container, './start-service.sh');
      } catch (error) {
        console.error(`Restart failed for ${container}:`, error.message);
      }
    }
    
    console.log('Coordinated restart completed');
  }
  
  async dispose() {
    await this.k8s.dispose();
  }
}

// Usage
const manager = new MultiContainerManager(
  'web-service-pod',
  'production',
  ['app', 'proxy', 'monitor']
);

try {
  const health = await manager.healthCheckAll();
  console.log('Health status:', health);
  
  if (health.some(h => h.status === 'unhealthy')) {
    await manager.coordinatedRestart();
  }
} finally {
  await manager.dispose();
}
```