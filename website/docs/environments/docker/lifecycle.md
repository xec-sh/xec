# Container Lifecycle Management

The Docker adapter provides comprehensive container lifecycle management, including creation, startup, health monitoring, and cleanup operations. This enables full control over Docker containers programmatically.

## Container Creation

### Basic Container Creation
Create containers with various configurations:

```javascript
import { DockerAdapter } from '@xec-sh/core';

const docker = new DockerAdapter();

// Create a basic container
await docker.createContainer({
  name: 'web-app',
  image: 'nginx:alpine',
  ports: ['80:80', '443:443']
});

// Create container with environment variables
await docker.createContainer({
  name: 'api-server',
  image: 'node:18-alpine',
  env: {
    NODE_ENV: 'production',
    PORT: '3000',
    DATABASE_URL: 'postgresql://localhost/myapp'
  },
  volumes: [
    './app:/usr/src/app',
    './logs:/var/log/app'
  ]
});
```

### Advanced Container Creation
Configure containers with advanced options:

```javascript
// Create container with health check
await docker.createContainer({
  name: 'health-monitored',
  image: 'myapp:latest',
  ports: ['8080:8080'],
  env: {
    HEALTH_CHECK_URL: 'http://localhost:8080/health'
  }
});

// Create privileged container
await docker.createContainer({
  name: 'system-container',
  image: 'ubuntu:22.04',
  volumes: ['/proc:/host/proc:ro'],
  // Note: Privileged mode handled via runContainer method
});
```

## Container Startup

### Starting Containers
Start created containers:

```javascript
// Start a single container
await docker.startContainer('web-app');

// Start multiple containers
const containers = ['web-app', 'api-server', 'database'];
await Promise.all(
  containers.map(name => docker.startContainer(name))
);

// Start with error handling
for (const container of containers) {
  try {
    await docker.startContainer(container);
    console.log(`Started: ${container}`);
  } catch (error) {
    console.error(`Failed to start ${container}:`, error.message);
  }
}
```

### Run Containers (Create + Start)
Create and start containers in one operation:

```javascript
// Basic run with automatic removal
await docker.runContainer({
  name: 'temp-processor',
  image: 'alpine:latest',
  command: ['sh', '-c', 'echo "Processing..." && sleep 5'],
  volumes: ['./data:/data'],
  workdir: '/data'
});

// Production service container
await docker.runContainer({
  name: 'web-service',
  image: 'nginx:alpine',
  ports: ['80:80', '443:443'],
  volumes: [
    './nginx.conf:/etc/nginx/nginx.conf:ro',
    './ssl:/etc/ssl/certs:ro',
    './logs:/var/log/nginx'
  ],
  network: 'web-network',
  restart: 'unless-stopped',
  labels: {
    'traefik.enable': 'true',
    'traefik.http.routers.web.rule': 'Host(`example.com`)'
  }
});
```

### Container with Health Checks
Define health monitoring for containers:

```javascript
// Container with comprehensive health check
await docker.runContainer({
  name: 'monitored-app',
  image: 'myapp:latest',
  ports: ['3000:3000'],
  healthcheck: {
    test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    startPeriod: '60s'
  },
  env: {
    HEALTH_CHECK_ENDPOINT: '/health'
  }
});

// Alternative health check formats
await docker.runContainer({
  name: 'http-service',
  image: 'webapp:latest',
  healthcheck: {
    test: 'curl -f http://localhost:8080/ping || exit 1',
    interval: '15s',
    timeout: '5s',
    retries: 2
  }
});
```

## Health Monitoring

### Wait for Healthy Status
Monitor container health before proceeding:

```javascript
// Start container and wait for healthy status
await docker.runContainer({
  name: 'slow-startup',
  image: 'complex-app:latest',
  healthcheck: {
    test: ['CMD', 'health-check-script.sh'],
    interval: '10s',
    timeout: '5s',
    retries: 5,
    startPeriod: '30s'
  }
});

// Wait for container to be healthy (30 second timeout)
try {
  await docker.waitForHealthy('slow-startup', 30000);
  console.log('Container is healthy and ready');
} catch (error) {
  console.error('Container failed to become healthy:', error.message);
}

// Custom health check loop
const checkHealth = async (container, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const info = await docker.inspectContainer(container);
      const health = info.State?.Health?.Status;
      
      console.log(`Health check ${i + 1}/${maxAttempts}: ${health}`);
      
      if (health === 'healthy') {
        return true;
      } else if (health === 'unhealthy') {
        throw new Error('Container is unhealthy');
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Health check failed: ${error.message}`);
    }
  }
  
  throw new Error('Timeout waiting for container to be healthy');
};

await checkHealth('slow-startup');
```

### Container Inspection
Get detailed container information:

```javascript
// Get container details
const info = await docker.inspectContainer('web-app');

console.log('Container info:');
console.log('- State:', info.State.Status);
console.log('- Health:', info.State.Health?.Status);
console.log('- Started:', info.State.StartedAt);
console.log('- Image:', info.Config.Image);
console.log('- Ports:', info.NetworkSettings.Ports);

// Check if container is running
const isRunning = info.State.Running;
const isHealthy = info.State.Health?.Status === 'healthy';

if (isRunning && isHealthy) {
  console.log('Container is ready for traffic');
}

// Extract specific information
const extractContainerInfo = async (containerName) => {
  const info = await docker.inspectContainer(containerName);
  
  return {
    name: info.Name.replace('/', ''),
    status: info.State.Status,
    health: info.State.Health?.Status,
    uptime: Date.now() - new Date(info.State.StartedAt).getTime(),
    image: info.Config.Image,
    ports: Object.keys(info.NetworkSettings.Ports || {}),
    mounts: info.Mounts.map(m => `${m.Source}:${m.Destination}`),
    networks: Object.keys(info.NetworkSettings.Networks || {})
  };
};

const containerInfo = await extractContainerInfo('web-app');
console.log(JSON.stringify(containerInfo, null, 2));
```

## Container Statistics

### Performance Monitoring
Monitor container resource usage:

```javascript
// Get current container stats
const stats = await docker.getStats('web-app');

console.log('Container statistics:');
console.log('- CPU Usage:', stats.cpu_stats.cpu_usage.total_usage);
console.log('- Memory Usage:', stats.memory_stats.usage);
console.log('- Memory Limit:', stats.memory_stats.limit);
console.log('- Network RX:', stats.networks.eth0.rx_bytes);
console.log('- Network TX:', stats.networks.eth0.tx_bytes);

// Calculate usage percentages
const calculateUsage = (stats) => {
  const cpuPercent = ((stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage) /
    (stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage)) * 
    stats.cpu_stats.online_cpus * 100;
    
  const memoryPercent = (stats.memory_stats.usage / stats.memory_stats.limit) * 100;
  
  return {
    cpu: cpuPercent.toFixed(2) + '%',
    memory: memoryPercent.toFixed(2) + '%',
    memoryUsed: (stats.memory_stats.usage / 1024 / 1024).toFixed(2) + ' MB',
    memoryLimit: (stats.memory_stats.limit / 1024 / 1024).toFixed(2) + ' MB'
  };
};

const usage = calculateUsage(stats);
console.log('Resource usage:', usage);
```

### Continuous Monitoring
Monitor container performance over time:

```javascript
// Monitor container stats continuously
const monitorContainer = async (containerName, duration = 60000) => {
  const startTime = Date.now();
  const samples = [];
  
  console.log(`Monitoring ${containerName} for ${duration/1000} seconds...`);
  
  const monitor = setInterval(async () => {
    try {
      const stats = await docker.getStats(containerName);
      const usage = calculateUsage(stats);
      
      samples.push({
        timestamp: Date.now(),
        ...usage
      });
      
      console.log(`[${new Date().toISOString()}] CPU: ${usage.cpu}, Memory: ${usage.memory}`);
      
      if (Date.now() - startTime >= duration) {
        clearInterval(monitor);
        
        // Calculate averages
        const avgCpu = samples.reduce((sum, s) => sum + parseFloat(s.cpu), 0) / samples.length;
        const avgMemory = samples.reduce((sum, s) => sum + parseFloat(s.memory), 0) / samples.length;
        
        console.log(`\nMonitoring complete. Averages:`);
        console.log(`- CPU: ${avgCpu.toFixed(2)}%`);
        console.log(`- Memory: ${avgMemory.toFixed(2)}%`);
      }
    } catch (error) {
      clearInterval(monitor);
      console.error('Monitoring failed:', error.message);
    }
  }, 5000);
};

await monitorContainer('web-app', 60000);
```

## Container Stopping

### Graceful Shutdown
Stop containers gracefully:

```javascript
// Stop single container
await docker.stopContainer('web-app');

// Stop multiple containers gracefully
const activeContainers = await docker.listContainers();
console.log('Stopping containers:', activeContainers);

for (const container of activeContainers) {
  try {
    console.log(`Stopping ${container}...`);
    await docker.stopContainer(container);
    console.log(`Stopped ${container}`);
  } catch (error) {
    console.error(`Failed to stop ${container}:`, error.message);
  }
}

// Stop with custom timeout (Docker default is 10 seconds)
const stopWithTimeout = async (containerName, timeout = 30) => {
  console.log(`Stopping ${containerName} with ${timeout}s timeout...`);
  
  // Docker stop command with timeout
  try {
    await docker.executeDockerCommand(['stop', '-t', timeout.toString(), containerName], {});
    console.log(`Gracefully stopped ${containerName}`);
  } catch (error) {
    console.error(`Failed to stop ${containerName}:`, error.message);
    
    // Force kill if graceful stop fails
    try {
      await docker.executeDockerCommand(['kill', containerName], {});
      console.log(`Force killed ${containerName}`);
    } catch (killError) {
      console.error(`Failed to kill ${containerName}:`, killError.message);
    }
  }
};

await stopWithTimeout('slow-shutdown-app', 60);
```

## Container Removal

### Clean Removal
Remove containers after stopping:

```javascript
// Remove stopped container
await docker.removeContainer('web-app');

// Force remove running container
await docker.removeContainer('stubborn-container', true);

// Remove multiple containers
const containersToRemove = ['temp-1', 'temp-2', 'temp-3'];

await Promise.all(
  containersToRemove.map(async (container) => {
    try {
      // Stop first, then remove
      await docker.stopContainer(container);
      await docker.removeContainer(container);
      console.log(`Removed ${container}`);
    } catch (error) {
      if (error.message.includes('No such container')) {
        console.log(`Container ${container} already removed`);
      } else {
        console.error(`Failed to remove ${container}:`, error.message);
      }
    }
  })
);
```

### Cleanup Patterns
Implement common cleanup patterns:

```javascript
// Clean up all containers with specific label
const cleanupByLabel = async (label, value) => {
  const containers = await docker.listContainers(true); // Include stopped
  
  for (const container of containers) {
    try {
      const info = await docker.inspectContainer(container);
      const labels = info.Config.Labels || {};
      
      if (labels[label] === value) {
        console.log(`Cleaning up ${container} (${label}=${value})`);
        await docker.stopContainer(container);
        await docker.removeContainer(container, true);
      }
    } catch (error) {
      console.error(`Failed to cleanup ${container}:`, error.message);
    }
  }
};

await cleanupByLabel('app', 'test-suite');

// Clean up containers older than specified time
const cleanupOldContainers = async (maxAge = 24 * 60 * 60 * 1000) => { // 24 hours
  const containers = await docker.listContainers(true);
  const cutoff = Date.now() - maxAge;
  
  for (const container of containers) {
    try {
      const info = await docker.inspectContainer(container);
      const created = new Date(info.Created).getTime();
      
      if (created < cutoff) {
        console.log(`Removing old container: ${container}`);
        await docker.removeContainer(container, true);
      }
    } catch (error) {
      console.error(`Failed to remove old container ${container}:`, error.message);
    }
  }
};

await cleanupOldContainers();
```

## Auto-Creation and Cleanup

### Temporary Container Management
Handle ephemeral containers automatically:

```javascript
// Configure auto-creation with cleanup
const docker = new DockerAdapter({
  autoCreate: {
    enabled: true,
    image: 'alpine:latest',
    autoRemove: true,
    volumes: ['/tmp:/tmp:rw']
  }
});

// Temporary containers are automatically created and cleaned up
const result = await docker.execute({
  command: 'echo',
  args: ['Temporary processing'],
  adapterOptions: {
    type: 'docker',
    container: 'auto-created-temp'
  }
});

console.log(result.stdout); // "Temporary processing"
// Container is automatically removed after execution

// Manual cleanup of all temporary containers
await docker.dispose();
```

### Lifecycle Event Monitoring
Monitor container lifecycle events:

```javascript
// Set up event listeners
docker.on('docker:run', (event) => {
  console.log(`Container started: ${event.container} (${event.image})`);
});

docker.on('docker:exec', (event) => {
  console.log(`Command executed in ${event.container}: ${event.command}`);
});

docker.on('temp:cleanup', (event) => {
  console.log(`Cleaning up temporary resource: ${event.path}`);
});

// Execute operations with monitoring
await docker.runContainer({
  name: 'monitored-service',
  image: 'nginx:alpine',
  ports: ['80:80']
});

await docker.execute({
  command: 'nginx',
  args: ['-t'],
  adapterOptions: {
    type: 'docker',
    container: 'monitored-service'
  }
});

await docker.stopContainer('monitored-service');
await docker.removeContainer('monitored-service');
```

## Complete Lifecycle Example

### Full Application Deployment
Complete example showing full container lifecycle:

```javascript
import { DockerAdapter } from '@xec-sh/core';

class ApplicationDeployment {
  constructor() {
    this.docker = new DockerAdapter();
    this.containers = [];
  }

  async deploy() {
    try {
      // 1. Create and start database
      await this.deployDatabase();
      
      // 2. Create and start application
      await this.deployApplication();
      
      // 3. Wait for health checks
      await this.waitForServices();
      
      // 4. Run smoke tests
      await this.runSmokeTests();
      
      console.log('Deployment completed successfully');
    } catch (error) {
      console.error('Deployment failed:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  async deployDatabase() {
    console.log('Deploying database...');
    
    await this.docker.runContainer({
      name: 'app-database',
      image: 'postgres:15-alpine',
      env: {
        POSTGRES_DB: 'myapp',
        POSTGRES_USER: 'appuser',
        POSTGRES_PASSWORD: 'securepassword'
      },
      volumes: ['db-data:/var/lib/postgresql/data'],
      ports: ['5432:5432'],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U appuser -d myapp'],
        interval: '10s',
        timeout: '5s',
        retries: 5
      }
    });
    
    this.containers.push('app-database');
  }

  async deployApplication() {
    console.log('Deploying application...');
    
    await this.docker.runContainer({
      name: 'app-server',
      image: 'myapp:latest',
      env: {
        DATABASE_URL: 'postgresql://appuser:securepassword@app-database:5432/myapp',
        NODE_ENV: 'production',
        PORT: '3000'
      },
      ports: ['3000:3000'],
      volumes: ['./logs:/app/logs'],
      healthcheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
        interval: '15s',
        timeout: '10s',
        retries: 3,
        startPeriod: '30s'
      }
    });
    
    this.containers.push('app-server');
  }

  async waitForServices() {
    console.log('Waiting for services to be healthy...');
    
    for (const container of this.containers) {
      await this.docker.waitForHealthy(container, 60000);
      console.log(`${container} is healthy`);
    }
  }

  async runSmokeTests() {
    console.log('Running smoke tests...');
    
    // Test database connectivity
    const dbTest = await this.docker.execute({
      command: 'pg_isready',
      args: ['-h', 'app-database', '-U', 'appuser'],
      adapterOptions: {
        type: 'docker',
        image: 'postgres:15-alpine',
        runMode: 'run'
      }
    });
    
    if (dbTest.exitCode !== 0) {
      throw new Error('Database smoke test failed');
    }
    
    // Test application endpoint
    const appTest = await this.docker.execute({
      command: 'curl',
      args: ['-f', 'http://app-server:3000/health'],
      adapterOptions: {
        type: 'docker',
        image: 'curlimages/curl:latest',
        runMode: 'run'
      }
    });
    
    if (appTest.exitCode !== 0) {
      throw new Error('Application smoke test failed');
    }
    
    console.log('All smoke tests passed');
  }

  async cleanup() {
    console.log('Cleaning up containers...');
    
    for (const container of this.containers.reverse()) {
      try {
        await this.docker.stopContainer(container);
        await this.docker.removeContainer(container, true);
        console.log(`Cleaned up ${container}`);
      } catch (error) {
        console.error(`Failed to cleanup ${container}:`, error.message);
      }
    }
    
    await this.docker.dispose();
  }

  async getStatus() {
    const status = {};
    
    for (const container of this.containers) {
      try {
        const info = await this.docker.inspectContainer(container);
        status[container] = {
          running: info.State.Running,
          health: info.State.Health?.Status,
          uptime: Date.now() - new Date(info.State.StartedAt).getTime()
        };
      } catch (error) {
        status[container] = { error: error.message };
      }
    }
    
    return status;
  }
}

// Usage
const deployment = new ApplicationDeployment();

try {
  await deployment.deploy();
  
  // Monitor deployment
  setInterval(async () => {
    const status = await deployment.getStatus();
    console.log('Service status:', JSON.stringify(status, null, 2));
  }, 30000);
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, cleaning up...');
  await deployment.cleanup();
  process.exit(0);
});
```

This comprehensive lifecycle management enables full control over Docker containers, from creation through monitoring to cleanup, providing the foundation for robust containerized applications.