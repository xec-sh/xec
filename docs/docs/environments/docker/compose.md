# Docker Compose Integration

The Docker adapter provides seamless integration with Docker Compose for multi-container orchestration. This enables complex application deployments with service dependencies, networking, and volume management.

## Basic Compose Operations

### Starting Services
Launch multi-container applications with Docker Compose:

```javascript
import { DockerAdapter } from '@xec-sh/core';

const docker = new DockerAdapter();

// Start services from default docker-compose.yml
await docker.composeUp();

// Start with specific compose file
await docker.composeUp({
  file: 'docker-compose.prod.yml'
});

// Start with multiple compose files
await docker.composeUp({
  file: ['docker-compose.yml', 'docker-compose.override.yml', 'docker-compose.local.yml']
});

// Start with custom project name
await docker.composeUp({
  projectName: 'myapp-staging',
  file: 'docker-compose.staging.yml'
});
```

### Service Management
Control individual services and complete stacks:

```javascript
// Stop all services
await docker.composeDown();

// Stop with specific options
await docker.composeDown({
  file: 'docker-compose.prod.yml',
  projectName: 'production'
});

// Check service status
const status = await docker.composePs();
console.log('Service status:');
console.log(status);

// Get logs from all services
const logs = await docker.composeLogs();
console.log('All service logs:');
console.log(logs);

// Get logs from specific service
const webLogs = await docker.composeLogs('web');
console.log('Web service logs:');
console.log(webLogs);
```

## Environment Configuration

### Environment Variables
Pass environment variables to Compose operations:

```javascript
// Set environment for compose operations
await docker.composeUp({
  file: 'docker-compose.yml',
  env: {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://prod-db:5432/myapp',
    REDIS_URL: 'redis://cache:6379',
    SECRET_KEY: process.env.SECRET_KEY
  }
});

// Environment-specific compose files
const environments = {
  development: {
    file: 'docker-compose.dev.yml',
    env: {
      NODE_ENV: 'development',
      DEBUG: '*',
      HOT_RELOAD: 'true'
    }
  },
  staging: {
    file: 'docker-compose.staging.yml',
    env: {
      NODE_ENV: 'staging',
      API_URL: 'https://api-staging.example.com'
    }
  },
  production: {
    file: 'docker-compose.prod.yml',
    env: {
      NODE_ENV: 'production',
      API_URL: 'https://api.example.com'
    }
  }
};

const deployToEnvironment = async (env) => {
  const config = environments[env];
  if (!config) {
    throw new Error(`Unknown environment: ${env}`);
  }
  
  console.log(`Deploying to ${env}...`);
  await docker.composeUp({
    file: config.file,
    env: config.env,
    projectName: `myapp-${env}`
  });
};

await deployToEnvironment('staging');
```

## Service Execution

### Execute Commands in Services
Run commands within running Compose services:

```javascript
// Execute command in specific service container
const webContainer = 'myapp_web_1'; // Compose naming convention

// Run database migration
await $({
  adapterOptions: {
    type: 'docker',
    container: webContainer
  }
})`npm run migrate`;

// Run tests in isolated container
await $({
  adapterOptions: {
    type: 'docker',
    container: webContainer,
    workdir: '/app/tests'
  }
})`npm test`;

// Execute shell commands
await $({
  adapterOptions: {
    type: 'docker',
    container: webContainer,
    tty: true
  }
})`/bin/sh -c "ls -la /app && ps aux"`;
```

### Interactive Service Commands
Run interactive commands in services:

```javascript
// Interactive shell in web service
const webShell = async () => {
  return $({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    adapterOptions: {
      type: 'docker',
      container: 'myapp_web_1',
      tty: true
    }
  })`/bin/bash`;
};

// Start interactive session (when needed)
// await webShell();

// Run interactive database client
await $({
  adapterOptions: {
    type: 'docker',
    container: 'myapp_db_1',
    tty: true
  }
})`psql -U postgres -d myapp`;
```

## Multi-Service Orchestration

### Complex Application Stack
Deploy and manage complex multi-service applications:

```javascript
class ComposeApplication {
  constructor(environment = 'development') {
    this.docker = new DockerAdapter();
    this.environment = environment;
    this.config = this.getEnvironmentConfig();
  }

  getEnvironmentConfig() {
    const configs = {
      development: {
        file: ['docker-compose.yml', 'docker-compose.dev.yml'],
        projectName: 'myapp-dev',
        env: {
          NODE_ENV: 'development',
          LOG_LEVEL: 'debug',
          HOT_RELOAD: 'true'
        }
      },
      production: {
        file: ['docker-compose.yml', 'docker-compose.prod.yml'],
        projectName: 'myapp-prod',
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info'
        }
      }
    };
    
    return configs[this.environment];
  }

  async deploy() {
    console.log(`Deploying ${this.environment} environment...`);
    
    try {
      // Pull latest images
      await this.pullImages();
      
      // Start services
      await this.docker.composeUp(this.config);
      
      // Wait for services to be ready
      await this.waitForServices();
      
      // Run post-deployment tasks
      await this.postDeploy();
      
      console.log('Deployment completed successfully');
    } catch (error) {
      console.error('Deployment failed:', error.message);
      throw error;
    }
  }

  async pullImages() {
    console.log('Pulling latest images...');
    
    // Get list of services and their images
    const composeConfig = await this.getComposeConfig();
    const services = Object.keys(composeConfig.services || {});
    
    for (const service of services) {
      const image = composeConfig.services[service].image;
      if (image) {
        try {
          await this.docker.pullImage(image);
          console.log(`Pulled ${image}`);
        } catch (error) {
          console.warn(`Failed to pull ${image}:`, error.message);
        }
      }
    }
  }

  async getComposeConfig() {
    // Parse compose configuration
    const configResult = await this.docker.executeDockerCommand([
      'compose',
      ...this.buildComposeFileArgs(),
      'config'
    ], {});
    
    return JSON.parse(configResult.stdout);
  }

  buildComposeFileArgs() {
    const args = [];
    if (this.config.file) {
      const files = Array.isArray(this.config.file) ? this.config.file : [this.config.file];
      for (const file of files) {
        args.push('-f', file);
      }
    }
    if (this.config.projectName) {
      args.push('-p', this.config.projectName);
    }
    return args;
  }

  async waitForServices() {
    console.log('Waiting for services to be ready...');
    
    const services = await this.getServiceContainers();
    
    for (const [serviceName, containerName] of Object.entries(services)) {
      console.log(`Waiting for ${serviceName} (${containerName})...`);
      
      try {
        await this.docker.waitForHealthy(containerName, 60000);
        console.log(`${serviceName} is ready`);
      } catch (error) {
        console.warn(`${serviceName} health check timeout, continuing...`);
      }
    }
  }

  async getServiceContainers() {
    const psOutput = await this.docker.composePs(this.config);
    const lines = psOutput.trim().split('\n');
    const services = {};
    
    // Parse docker-compose ps output
    for (let i = 1; i < lines.length; i++) { // Skip header
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 2) {
        const containerName = parts[0];
        const serviceName = containerName.split('_')[1]; // Extract service name
        services[serviceName] = containerName;
      }
    }
    
    return services;
  }

  async postDeploy() {
    console.log('Running post-deployment tasks...');
    
    const services = await this.getServiceContainers();
    
    // Run database migrations if web service exists
    if (services.web) {
      try {
        await $({
          adapterOptions: {
            type: 'docker',
            container: services.web
          }
        })`npm run migrate`;
        console.log('Database migration completed');
      } catch (error) {
        console.warn('Migration failed:', error.message);
      }
    }
    
    // Seed initial data if needed
    if (services.web && this.environment === 'development') {
      try {
        await $({
          adapterOptions: {
            type: 'docker',
            container: services.web
          }
        })`npm run seed`;
        console.log('Database seeding completed');
      } catch (error) {
        console.warn('Seeding failed:', error.message);
      }
    }
    
    // Clear cache if cache service exists
    if (services.cache) {
      try {
        await $({
          adapterOptions: {
            type: 'docker',
            container: services.cache
          }
        })`redis-cli FLUSHALL`;
        console.log('Cache cleared');
      } catch (error) {
        console.warn('Cache clear failed:', error.message);
      }
    }
  }

  async getServiceLogs(serviceName, options = {}) {
    return await this.docker.composeLogs(serviceName, {
      ...this.config,
      ...options
    });
  }

  async restart(serviceName = null) {
    if (serviceName) {
      // Restart specific service
      await this.docker.executeDockerCommand([
        'compose',
        ...this.buildComposeFileArgs(),
        'restart',
        serviceName
      ], {});
    } else {
      // Restart all services
      await this.docker.composeDown(this.config);
      await this.docker.composeUp(this.config);
    }
  }

  async scale(serviceName, instances) {
    await this.docker.executeDockerCommand([
      'compose',
      ...this.buildComposeFileArgs(),
      'up',
      '-d',
      '--scale',
      `${serviceName}=${instances}`
    ], {});
  }

  async cleanup() {
    console.log('Cleaning up services...');
    await this.docker.composeDown(this.config);
  }
}

// Usage
const app = new ComposeApplication('development');

await app.deploy();

// Get service logs
const webLogs = await app.getServiceLogs('web', { tail: 100 });
console.log('Recent web service logs:', webLogs);

// Scale service
await app.scale('worker', 3);

// Restart specific service
await app.restart('web');

// Cleanup on exit
process.on('SIGINT', async () => {
  await app.cleanup();
  process.exit(0);
});
```

## Service Dependencies

### Handling Service Dependencies
Manage service startup order and dependencies:

```javascript
// Wait for dependent services before starting main application
const waitForDependencies = async () => {
  console.log('Starting dependency services...');
  
  // Start database first
  await docker.executeDockerCommand([
    'compose', 'up', '-d', 'database'
  ], {});
  
  // Wait for database to be ready
  await docker.waitForHealthy('myapp_database_1', 30000);
  
  // Start cache service
  await docker.executeDockerCommand([
    'compose', 'up', '-d', 'cache'
  ], {});
  
  // Wait for cache to be ready
  await docker.waitForHealthy('myapp_cache_1', 15000);
  
  // Finally start the web application
  await docker.executeDockerCommand([
    'compose', 'up', '-d', 'web'
  ], {});
  
  console.log('All services started successfully');
};

await waitForDependencies();

// Check service connectivity
const testServiceConnectivity = async () => {
  const services = await docker.getServiceContainers();
  
  // Test database connection from web service
  try {
    await $({
      adapterOptions: {
        type: 'docker',
        container: services.web
      }
    })`nc -z database 5432`;
    console.log('Database connectivity: OK');
  } catch (error) {
    console.error('Database connectivity: FAILED');
  }
  
  // Test cache connection from web service
  try {
    await $({
      adapterOptions: {
        type: 'docker',
        container: services.web
      }
    })`nc -z cache 6379`;
    console.log('Cache connectivity: OK');
  } catch (error) {
    console.error('Cache connectivity: FAILED');
  }
};

await testServiceConnectivity();
```

## Advanced Compose Operations

### Blue-Green Deployment
Implement zero-downtime deployments with Compose:

```javascript
class BlueGreenDeployment {
  constructor() {
    this.docker = new DockerAdapter();
    this.activeColor = 'blue';
  }

  async deploy(newVersion) {
    const inactiveColor = this.activeColor === 'blue' ? 'green' : 'blue';
    
    console.log(`Deploying ${newVersion} to ${inactiveColor} environment...`);
    
    try {
      // Deploy to inactive environment
      await this.deployToEnvironment(inactiveColor, newVersion);
      
      // Test inactive environment
      await this.testEnvironment(inactiveColor);
      
      // Switch traffic to new environment
      await this.switchTraffic(inactiveColor);
      
      // Clean up old environment
      await this.cleanupEnvironment(this.activeColor);
      
      this.activeColor = inactiveColor;
      console.log(`Deployment complete. Active environment: ${this.activeColor}`);
    } catch (error) {
      console.error('Deployment failed:', error.message);
      await this.cleanupEnvironment(inactiveColor);
      throw error;
    }
  }

  async deployToEnvironment(color, version) {
    const config = {
      file: `docker-compose.${color}.yml`,
      projectName: `myapp-${color}`,
      env: {
        VERSION: version,
        ENVIRONMENT: color
      }
    };
    
    await this.docker.composeUp(config);
    
    // Wait for services to be ready
    const services = await this.getServiceContainers(color);
    for (const [serviceName, containerName] of Object.entries(services)) {
      await this.docker.waitForHealthy(containerName, 60000);
    }
  }

  async testEnvironment(color) {
    console.log(`Testing ${color} environment...`);
    
    const services = await this.getServiceContainers(color);
    
    // Run health checks
    const healthTests = [
      {
        name: 'API Health Check',
        command: `curl -f http://localhost:8080/health`,
        container: services.web
      },
      {
        name: 'Database Connection',
        command: `pg_isready -h database -U postgres`,
        container: services.web
      }
    ];
    
    for (const test of healthTests) {
      try {
        await $({
          adapterOptions: {
            type: 'docker',
            container: test.container
          }
        })`${test.command}`;
        console.log(`✓ ${test.name} passed`);
      } catch (error) {
        throw new Error(`${test.name} failed: ${error.message}`);
      }
    }
  }

  async switchTraffic(newColor) {
    console.log(`Switching traffic to ${newColor}...`);
    
    // Update load balancer configuration
    await $({
      adapterOptions: {
        type: 'docker',
        container: 'load-balancer'
      }
    })`
      sed -i 's/upstream app-blue/upstream app-${newColor}/g' /etc/nginx/nginx.conf &&
      nginx -s reload
    `;
  }

  async cleanupEnvironment(color) {
    console.log(`Cleaning up ${color} environment...`);
    
    await this.docker.composeDown({
      file: `docker-compose.${color}.yml`,
      projectName: `myapp-${color}`
    });
  }

  async getServiceContainers(color) {
    const psOutput = await this.docker.composePs({
      file: `docker-compose.${color}.yml`,
      projectName: `myapp-${color}`
    });
    
    // Parse and return service containers
    // Implementation similar to previous example
    return {};
  }
}

// Usage
const deployment = new BlueGreenDeployment();
await deployment.deploy('v2.1.0');
```

### Service Scaling and Load Balancing
Scale services dynamically based on load:

```javascript
class ServiceScaler {
  constructor() {
    this.docker = new DockerAdapter();
    this.config = {
      file: 'docker-compose.yml',
      projectName: 'myapp'
    };
  }

  async monitorAndScale() {
    console.log('Starting service monitoring and auto-scaling...');
    
    setInterval(async () => {
      try {
        await this.checkAndScale();
      } catch (error) {
        console.error('Scaling check failed:', error.message);
      }
    }, 30000); // Check every 30 seconds
  }

  async checkAndScale() {
    const services = await this.getServiceContainers();
    
    for (const [serviceName, containers] of Object.entries(services)) {
      if (serviceName === 'web') { // Only scale web service
        const avgCpuUsage = await this.getAverageServiceCpuUsage(containers);
        const currentInstances = containers.length;
        
        console.log(`Service ${serviceName}: ${currentInstances} instances, ${avgCpuUsage}% CPU`);
        
        if (avgCpuUsage > 80 && currentInstances < 5) {
          // Scale up
          await this.scaleService(serviceName, currentInstances + 1);
          console.log(`Scaled up ${serviceName} to ${currentInstances + 1} instances`);
        } else if (avgCpuUsage < 20 && currentInstances > 1) {
          // Scale down
          await this.scaleService(serviceName, currentInstances - 1);
          console.log(`Scaled down ${serviceName} to ${currentInstances - 1} instances`);
        }
      }
    }
  }

  async getAverageServiceCpuUsage(containers) {
    let totalCpu = 0;
    let validContainers = 0;
    
    for (const container of containers) {
      try {
        const stats = await this.docker.getStats(container);
        const cpuPercent = this.calculateCpuPercent(stats);
        totalCpu += cpuPercent;
        validContainers++;
      } catch (error) {
        console.warn(`Failed to get stats for ${container}:`, error.message);
      }
    }
    
    return validContainers > 0 ? totalCpu / validContainers : 0;
  }

  calculateCpuPercent(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
    }
    return 0;
  }

  async scaleService(serviceName, instances) {
    await this.docker.executeDockerCommand([
      'compose',
      '-f', this.config.file,
      '-p', this.config.projectName,
      'up',
      '-d',
      '--scale',
      `${serviceName}=${instances}`,
      '--no-recreate'
    ], {});
  }

  async getServiceContainers() {
    const psOutput = await this.docker.composePs(this.config);
    const lines = psOutput.trim().split('\n');
    const services = {};
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 2) {
        const containerName = parts[0];
        const serviceName = containerName.split('_')[1];
        
        if (!services[serviceName]) {
          services[serviceName] = [];
        }
        services[serviceName].push(containerName);
      }
    }
    
    return services;
  }
}

// Usage
const scaler = new ServiceScaler();
await scaler.monitorAndScale();
```

## Troubleshooting Compose

### Common Issues and Solutions
Handle common Docker Compose issues:

```javascript
// Debug compose configuration
const debugCompose = async () => {
  try {
    // Validate compose file
    const configResult = await docker.executeDockerCommand([
      'compose', 'config'
    ], {});
    
    console.log('Compose configuration is valid');
    console.log(configResult.stdout);
  } catch (error) {
    console.error('Compose configuration error:', error.message);
  }
  
  // Check service dependencies
  const psOutput = await docker.composePs({ projectName: 'myapp' });
  console.log('Current service status:');
  console.log(psOutput);
  
  // Get detailed service information
  const services = await docker.getServiceContainers();
  for (const [serviceName, containerName] of Object.entries(services)) {
    try {
      const info = await docker.inspectContainer(containerName);
      console.log(`\n${serviceName} (${containerName}):`);
      console.log(`- Status: ${info.State.Status}`);
      console.log(`- Health: ${info.State.Health?.Status || 'N/A'}`);
      console.log(`- Restart Count: ${info.RestartCount}`);
      
      if (info.State.ExitCode !== 0) {
        console.log(`- Exit Code: ${info.State.ExitCode}`);
        const logs = await docker.getLogs(containerName, { tail: 50 });
        console.log(`- Recent logs:\n${logs}`);
      }
    } catch (error) {
      console.error(`Failed to inspect ${containerName}:`, error.message);
    }
  }
};

await debugCompose();

// Recreate problematic services
const recreateService = async (serviceName) => {
  console.log(`Recreating service: ${serviceName}`);
  
  try {
    // Stop and remove the service
    await docker.executeDockerCommand([
      'compose', 'rm', '-f', '-s', serviceName
    ], {});
    
    // Start the service again
    await docker.executeDockerCommand([
      'compose', 'up', '-d', serviceName
    ], {});
    
    console.log(`Successfully recreated ${serviceName}`);
  } catch (error) {
    console.error(`Failed to recreate ${serviceName}:`, error.message);
  }
};

// await recreateService('web');
```

This comprehensive Docker Compose integration provides the tools needed for complex multi-container orchestration, from basic service management to advanced deployment patterns like blue-green deployments and auto-scaling.