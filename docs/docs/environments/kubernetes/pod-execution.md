# Pod Execution

The Kubernetes adapter provides powerful pod execution capabilities, supporting direct pod targeting, label-based selection, multi-container scenarios, and flexible execution options. This guide covers comprehensive pod command execution patterns and best practices.

## Basic Pod Execution

### Direct Pod Execution
Execute commands in specific pods by name:

```javascript
import { $ } from '@xec-sh/core';

// Execute in named pod
const result = await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-server-deployment-abc123',
    namespace: 'production'
  }
})`hostname && whoami`;

console.log('Pod info:', result.stdout);

// Execute with specific container
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'api-server-xyz789',
    container: 'app',
    namespace: 'production'
  }
})`cat /app/config.json`;
```

### Template Literal Execution
Use template literals for dynamic command construction:

```javascript
const serviceName = 'user-service';
const logLevel = 'debug';

// Dynamic command construction
const result = await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: `${serviceName}-pod`,
    namespace: 'production'
  }
})`curl -s http://localhost:8080/${serviceName}/health?level=${logLevel}`;

// Environment variable substitution
const environment = 'production';
await $({
  env: { ENVIRONMENT: environment },
  adapterOptions: {
    type: 'kubernetes',
    pod: 'config-pod'
  }
})`echo "Running in $ENVIRONMENT environment"`;
```

## Pod Selection Strategies

### Label-Based Selection
Select pods using Kubernetes label selectors:

```javascript
// Simple label selector
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: '-l app=web-server',
    namespace: 'production'
  }
})`ps aux | grep nginx`;

// Multiple label selection
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: '-l app=api,version=v2,tier=backend',
    namespace: 'production'
  }
})`curl -s http://localhost:8080/metrics`;

// Advanced label expressions
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: '-l environment in (staging,production),app!=legacy',
    namespace: 'production'
  }
})`cat /proc/version`;
```

### Dynamic Pod Selection
Select pods dynamically based on runtime conditions:

```javascript
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter();

// Get the most recent pod from a deployment
async function getLatestPod(appLabel, namespace) {
  const pods = await k8s.executeKubectl([
    'get', 'pods',
    '-l', `app=${appLabel}`,
    '-n', namespace,
    '--sort-by=.metadata.creationTimestamp',
    '-o', 'jsonpath={.items[-1:].metadata.name}'
  ]);
  
  return pods.stdout.trim();
}

// Execute in the latest pod
const latestPod = await getLatestPod('web-server', 'production');
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: latestPod,
    namespace: 'production'
  }
})`echo "Executing in latest pod: $(hostname)"`;
```

### Conditional Pod Selection
Implement conditional pod selection logic:

```javascript
// Select pod based on conditions
async function selectHealthyPod(selector, namespace) {
  const k8s = new KubernetesAdapter();
  
  // Get all pods matching selector
  const podList = await k8s.executeKubectl([
    'get', 'pods',
    '-l', selector,
    '-n', namespace,
    '-o', 'jsonpath={.items[*].metadata.name}'
  ]);
  
  const pods = podList.stdout.trim().split(' ').filter(Boolean);
  
  // Check each pod's readiness
  for (const pod of pods) {
    if (await k8s.isPodReady(pod, namespace)) {
      return pod;
    }
  }
  
  throw new Error(`No healthy pods found for selector: ${selector}`);
}

// Use conditional selection
try {
  const healthyPod = await selectHealthyPod('app=database', 'production');
  
  const result = await $({
    adapterOptions: {
      type: 'kubernetes',
      pod: healthyPod,
      namespace: 'production'
    }
  })`mysql -e "SELECT 1" --silent`;
  
  console.log('Database is responsive');
} catch (error) {
  console.error('No healthy database pods available:', error.message);
}
```

## Execution Options

### TTY and Interactive Mode
Configure TTY and interactive execution:

```javascript
// Interactive TTY mode
await $({
  stdin: 'SELECT * FROM users LIMIT 10;\n\\q\n',
  adapterOptions: {
    type: 'kubernetes',
    pod: 'postgres-primary',
    container: 'postgresql',
    tty: true
  }
})`psql -U admin -d myapp`;

// Non-interactive mode for scripting
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'batch-processor',
    tty: false
  }
})`
  for i in {1..100}; do
    echo "Processing batch $i"
    ./process-batch.sh $i
  done
`;
```

### Working Directory Configuration
Set working directories for command execution:

```javascript
// Execute in specific directory
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'build-runner',
    workdir: '/workspace/project'
  }
})`
  pwd
  ls -la
  make build
`;

// Override container's default working directory
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'web-app',
    container: 'app',
    execFlags: ['--workdir=/app/scripts']
  }
})`./deploy.sh production`;
```

### Environment Variables
Pass environment variables to pod commands:

```javascript
// Set environment variables for execution
await $({
  env: {
    DATABASE_URL: 'postgresql://user:pass@db:5432/app',
    LOG_LEVEL: 'debug',
    FEATURE_FLAGS: 'feature1,feature2'
  },
  adapterOptions: {
    type: 'kubernetes',
    pod: 'migration-runner',
    namespace: 'production'
  }
})`
  echo "Database URL: $DATABASE_URL"
  echo "Log Level: $LOG_LEVEL"
  ./run-migrations.sh
`;

// Use environment variables in pod selection
const environment = process.env.NODE_ENV || 'development';
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: `-l app=api,environment=${environment}`,
    namespace: environment
  }
})`echo "Running in ${environment} environment"`;
```

## Advanced Execution Patterns

### Command Chaining
Chain multiple commands within pods:

```javascript
// Sequential command execution
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'worker-pod',
    namespace: 'production'
  }
})`
  echo "Starting backup process..."
  pg_dump -h database -U admin myapp > /tmp/backup.sql
  gzip /tmp/backup.sql
  aws s3 cp /tmp/backup.sql.gz s3://backups/$(date +%Y%m%d_%H%M%S).sql.gz
  rm /tmp/backup.sql.gz
  echo "Backup completed successfully"
`;

// Conditional command execution
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'health-checker',
    namespace: 'monitoring'
  }
})`
  if curl -f http://api:8080/health; then
    echo "Service is healthy"
    kubectl scale deployment api --replicas=3
  else
    echo "Service is unhealthy"
    kubectl scale deployment api --replicas=5
  fi
`;
```

### Parallel Execution
Execute commands in multiple pods simultaneously:

```javascript
// Execute health checks across multiple services
const services = ['api', 'worker', 'scheduler'];

const healthChecks = services.map(service => 
  $({
    adapterOptions: {
      type: 'kubernetes',
      pod: `-l app=${service}`,
      namespace: 'production'
    }
  })`curl -f http://localhost:8080/health`
);

try {
  const results = await Promise.all(healthChecks);
  results.forEach((result, index) => {
    console.log(`${services[index]} health:`, result.exitCode === 0 ? 'OK' : 'FAIL');
  });
} catch (error) {
  console.error('Health check failed:', error.message);
}
```

### Stream Processing
Process streaming output from pod commands:

```javascript
// Stream log processing
const logStream = $({
  stdout: 'pipe',
  adapterOptions: {
    type: 'kubernetes',
    pod: 'log-aggregator',
    namespace: 'logging'
  }
})`tail -f /var/log/application.log`;

// Process streaming output
logStream.stdout.on('data', (chunk) => {
  const lines = chunk.toString().split('\n').filter(Boolean);
  lines.forEach(line => {
    if (line.includes('ERROR')) {
      console.error('Error detected:', line);
    } else if (line.includes('WARN')) {
      console.warn('Warning detected:', line);
    }
  });
});

// Stop streaming after 30 seconds
setTimeout(() => {
  logStream.kill();
}, 30000);
```

## Shell and Command Modes

### Shell Command Execution
Execute commands through shell:

```javascript
// Execute through default shell
await $({
  shell: true,
  adapterOptions: {
    type: 'kubernetes',
    pod: 'script-runner',
    namespace: 'automation'
  }
})`
  export PATH=$PATH:/usr/local/bin
  source /app/config/environment.sh
  ./complex-script.sh arg1 arg2
`;

// Execute through specific shell
await $({
  shell: '/bin/bash',
  adapterOptions: {
    type: 'kubernetes',
    pod: 'bash-runner',
    namespace: 'scripts'
  }
})`
  set -euo pipefail
  echo "Starting complex bash script..."
  for file in /data/*.json; do
    echo "Processing $file"
    jq '.status' "$file" >> /tmp/statuses.log
  done
`;
```

### Direct Command Execution
Execute commands directly without shell:

```javascript
// Direct binary execution (no shell)
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'utility-pod',
    namespace: 'tools'
  }
})`cat /proc/meminfo`;

// Execute with arguments array
const k8s = new KubernetesAdapter();
await k8s.execute({
  command: 'kubectl',
  args: ['get', 'pods', '--all-namespaces'],
  adapterOptions: {
    type: 'kubernetes',
    pod: 'kubectl-pod'
  }
});
```

## Error Handling and Recovery

### Execution Error Handling
Handle pod execution errors gracefully:

```javascript
import { ExecutionError } from '@xec-sh/core';

try {
  await $({
    throwOnNonZeroExit: true,
    adapterOptions: {
      type: 'kubernetes',
      pod: 'database-pod',
      namespace: 'production'
    }
  })`mysql -e "INVALID SQL COMMAND"`;
} catch (error) {
  if (error instanceof ExecutionError) {
    console.error('SQL execution failed:');
    console.error('Exit code:', error.result?.exitCode);
    console.error('Stderr:', error.result?.stderr);
    
    // Attempt recovery
    console.log('Attempting database recovery...');
    await $({
      adapterOptions: {
        type: 'kubernetes',
        pod: 'database-pod',
        namespace: 'production'
      }
    })`mysql -e "SELECT 1"`;  // Simple connectivity test
  }
}
```

### Pod Availability Recovery
Handle pod unavailability scenarios:

```javascript
async function executeWithRetry(podSelector, command, maxRetries = 3) {
  const k8s = new KubernetesAdapter();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to find healthy pod
      const pod = await k8s.getPodFromSelector(podSelector, 'production');
      if (!pod) {
        throw new Error('No pods found');
      }
      
      if (!(await k8s.isPodReady(pod, 'production'))) {
        throw new Error('Pod not ready');
      }
      
      // Execute command
      return await $({
        adapterOptions: {
          type: 'kubernetes',
          pod,
          namespace: 'production'
        }
      })`${command}`;
      
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Usage with retry logic
try {
  const result = await executeWithRetry('app=api', 'curl http://localhost:8080/status');
  console.log('API status:', result.stdout);
} catch (error) {
  console.error('All retry attempts failed:', error.message);
}
```

## Performance Optimization

### Efficient Pod Selection
Optimize pod selection for better performance:

```javascript
// Cache pod selection results
const podCache = new Map();

async function getCachedPod(selector, namespace, ttl = 60000) {
  const cacheKey = `${selector}:${namespace}`;
  const cached = podCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.pod;
  }
  
  const k8s = new KubernetesAdapter();
  const pod = await k8s.getPodFromSelector(selector, namespace);
  
  if (pod) {
    podCache.set(cacheKey, {
      pod,
      timestamp: Date.now()
    });
  }
  
  return pod;
}

// Use cached pod selection
const pod = await getCachedPod('app=web-server', 'production');
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod,
    namespace: 'production'
  }
})`echo "Using cached pod selection"`;
```

### Batch Operations
Optimize batch operations in pods:

```javascript
// Batch multiple commands in single execution
await $({
  adapterOptions: {
    type: 'kubernetes',
    pod: 'batch-processor',
    namespace: 'production'
  }
})`
  echo "Starting batch operations..."
  
  # Process multiple files in parallel
  for file in /data/input/*.json; do
    (
      echo "Processing $file"
      jq '.transform' "$file" > "/data/output/$(basename "$file")"
    ) &
  done
  
  # Wait for all background processes
  wait
  
  echo "Batch operations completed"
  ls -la /data/output/
`;

// Parallel execution across multiple pods
const batchTasks = Array.from({ length: 5 }, (_, i) => 
  $({
    adapterOptions: {
      type: 'kubernetes',
      pod: `-l app=worker`,
      namespace: 'production'
    }
  })`echo "Processing batch ${i + 1}" && sleep 2`
);

await Promise.all(batchTasks);
console.log('All batch tasks completed');
```

## Best Practices

### Security Best Practices
- Use specific pod selectors to limit execution scope
- Validate pod existence and readiness before execution
- Avoid passing secrets in command arguments
- Use least-privilege container configurations
- Monitor and log all pod executions

### Performance Best Practices
- Cache pod selection results when appropriate
- Use label selectors efficiently
- Batch multiple operations when possible
- Configure appropriate timeouts
- Monitor resource usage during execution

### Reliability Best Practices
- Implement retry logic for transient failures
- Check pod health before command execution
- Handle pod restarts and migrations gracefully
- Use health checks and readiness probes
- Plan for network partitions and cluster issues

```javascript
// Example of comprehensive pod execution
import { KubernetesAdapter, ExecutionError } from '@xec-sh/core';

class RobustPodExecutor {
  constructor(namespace = 'default') {
    this.k8s = new KubernetesAdapter({ namespace });
    this.namespace = namespace;
  }
  
  async execute(selector, command, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 2000,
      timeout = 30000
    } = options;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Validate cluster connectivity
        if (!(await this.k8s.isAvailable())) {
          throw new Error('Kubernetes cluster not available');
        }
        
        // Select healthy pod
        const pod = await this.selectHealthyPod(selector);
        
        // Execute with timeout
        const result = await Promise.race([
          $({
            adapterOptions: {
              type: 'kubernetes',
              pod,
              namespace: this.namespace
            }
          })`${command}`,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Execution timeout')), timeout)
          )
        ]);
        
        return result;
        
      } catch (error) {
        console.log(`Execution attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw new ExecutionError(
            `Pod execution failed after ${maxRetries} attempts: ${error.message}`,
            'KUBERNETES_ERROR'
          );
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  async selectHealthyPod(selector) {
    const pod = await this.k8s.getPodFromSelector(selector, this.namespace);
    if (!pod) {
      throw new Error(`No pods found for selector: ${selector}`);
    }
    
    if (!(await this.k8s.isPodReady(pod, this.namespace))) {
      throw new Error(`Pod ${pod} is not ready`);
    }
    
    return pod;
  }
  
  async dispose() {
    await this.k8s.dispose();
  }
}

// Usage
const executor = new RobustPodExecutor('production');
try {
  const result = await executor.execute(
    'app=api',
    'curl -f http://localhost:8080/health',
    { maxRetries: 5, timeout: 10000 }
  );
  console.log('Health check passed:', result.stdout);
} finally {
  await executor.dispose();
}
```