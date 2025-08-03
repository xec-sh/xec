# Failover Strategies and Resilience

Implement robust failover mechanisms and resilience patterns across multiple environments. This guide covers strategies for handling failures, implementing automated recovery, and ensuring high availability across hybrid infrastructure.

## Overview

Failover strategies in @xec-sh/core enable:
- Automatic switching between primary and backup environments
- Graceful degradation when services become unavailable
- Recovery patterns for different failure scenarios
- Cross-environment redundancy and resilience

## Basic Failover Patterns

### Simple Environment Failover

Switch between environments when the primary becomes unavailable:

```typescript
import { $ } from '@xec-sh/core';

interface EnvironmentTarget {
  name: string;
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  config: any;
  priority: number;
  healthCheck: () => Promise<boolean>;
}

async function executeWithFailover(
  command: string,
  environments: EnvironmentTarget[]
): Promise<any> {
  // Sort by priority (lowest number = highest priority)
  const sortedEnvironments = [...environments].sort((a, b) => a.priority - b.priority);
  
  for (const env of sortedEnvironments) {
    console.log(`Attempting execution on ${env.name}...`);
    
    try {
      // Check environment health first
      const isHealthy = await env.healthCheck();
      if (!isHealthy) {
        console.log(`${env.name} is unhealthy, trying next environment`);
        continue;
      }
      
      // Execute command based on environment type
      const executor = createExecutor(env);
      const result = await executor`${command}`;
      
      console.log(`✅ Successfully executed on ${env.name}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Failed on ${env.name}: ${error.message}`);
      
      // If this is the last environment, throw the error
      if (env === sortedEnvironments[sortedEnvironments.length - 1]) {
        throw new Error(`All environments failed. Last error: ${error.message}`);
      }
      
      // Otherwise, continue to next environment
      continue;
    }
  }
}

function createExecutor(env: EnvironmentTarget) {
  switch (env.type) {
    case 'local':
      return $;
    case 'ssh':
      return $.ssh(env.config);
    case 'docker':
      return $.docker(env.config);
    case 'kubernetes':
      return $.k8s(env.config);
    default:
      throw new Error(`Unknown environment type: ${env.type}`);
  }
}

// Example usage
const environments: EnvironmentTarget[] = [
  {
    name: 'production-k8s',
    type: 'kubernetes',
    config: { namespace: 'production' },
    priority: 1,
    healthCheck: async () => {
      try {
        const result = await $.k8s({ namespace: 'production' })`kubectl get nodes`;
        return result.stdout.includes('Ready');
      } catch {
        return false;
      }
    }
  },
  {
    name: 'backup-ssh',
    type: 'ssh',
    config: { host: 'backup.example.com', username: 'admin' },
    priority: 2,
    healthCheck: async () => {
      try {
        await $.ssh({ host: 'backup.example.com' })`echo "health check"`;
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'local-fallback',
    type: 'local',
    config: {},
    priority: 3,
    healthCheck: async () => true // Local is always available
  }
];

// Execute with automatic failover
await executeWithFailover('python process_data.py', environments);
```

### Database Failover with Connection Pooling

Implement database failover across different environments:

```typescript
class DatabaseFailover {
  private connections: Map<string, any> = new Map();
  private currentPrimary: string | null = null;
  
  constructor(private databases: DatabaseConfig[]) {}
  
  async execute(query: string): Promise<any> {
    const sortedDbs = [...this.databases].sort((a, b) => a.priority - b.priority);
    
    for (const db of sortedDbs) {
      try {
        // Check if we have a healthy connection
        const connection = await this.getConnection(db);
        
        // Execute query
        const result = await this.executeQuery(connection, query);
        
        // Update current primary if successful
        if (this.currentPrimary !== db.name) {
          console.log(`Switched to database: ${db.name}`);
          this.currentPrimary = db.name;
        }
        
        return result;
        
      } catch (error) {
        console.error(`Database ${db.name} failed: ${error.message}`);
        
        // Remove failed connection
        this.connections.delete(db.name);
        
        // Continue to next database
        continue;
      }
    }
    
    throw new Error('All database connections failed');
  }
  
  private async getConnection(db: DatabaseConfig) {
    if (this.connections.has(db.name)) {
      const connection = this.connections.get(db.name);
      
      // Test existing connection
      try {
        await this.testConnection(connection, db);
        return connection;
      } catch {
        // Connection is dead, remove it
        this.connections.delete(db.name);
      }
    }
    
    // Create new connection
    const connection = await this.createConnection(db);
    this.connections.set(db.name, connection);
    return connection;
  }
  
  private async createConnection(db: DatabaseConfig) {
    switch (db.environment.type) {
      case 'local':
        return $;
      
      case 'ssh':
        return $.ssh(db.environment.config);
      
      case 'docker':
        return $.docker(db.environment.config);
      
      case 'kubernetes':
        return $.k8s(db.environment.config);
      
      default:
        throw new Error(`Unknown environment: ${db.environment.type}`);
    }
  }
  
  private async testConnection(connection: any, db: DatabaseConfig) {
    await connection`psql -d ${db.database} -c "SELECT 1"`;
  }
  
  private async executeQuery(connection: any, query: string) {
    return connection`psql -d production -c "${query}"`;
  }
}

interface DatabaseConfig {
  name: string;
  priority: number;
  database: string;
  environment: {
    type: 'local' | 'ssh' | 'docker' | 'kubernetes';
    config: any;
  };
}

// Example usage
const dbFailover = new DatabaseFailover([
  {
    name: 'primary-k8s',
    priority: 1,
    database: 'production',
    environment: {
      type: 'kubernetes',
      config: { namespace: 'database' }
    }
  },
  {
    name: 'replica-ssh',
    priority: 2,
    database: 'production_replica',
    environment: {
      type: 'ssh',
      config: { host: 'db-replica.example.com' }
    }
  },
  {
    name: 'local-dev',
    priority: 3,
    database: 'development',
    environment: {
      type: 'local',
      config: {}
    }
  }
]);

await dbFailover.execute('SELECT COUNT(*) FROM users');
```

## Advanced Failover Patterns

### Circuit Breaker with Environment Switching

Implement circuit breaker pattern across environments:

```typescript
class EnvironmentCircuitBreaker {
  private circuitStates = new Map<string, CircuitState>();
  private lastFailureTimes = new Map<string, number>();
  
  constructor(
    private environments: EnvironmentTarget[],
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      halfOpenMaxCalls: 3
    }
  ) {
    // Initialize all circuits as closed
    environments.forEach(env => {
      this.circuitStates.set(env.name, CircuitState.CLOSED);
    });
  }
  
  async execute(operation: string): Promise<any> {
    const availableEnvironments = this.getAvailableEnvironments();
    
    if (availableEnvironments.length === 0) {
      throw new Error('All circuit breakers are open');
    }
    
    // Try environments in priority order
    for (const env of availableEnvironments) {
      const state = this.circuitStates.get(env.name);
      
      // Skip if circuit is open and not ready for recovery
      if (state === CircuitState.OPEN && !this.isReadyForRecovery(env.name)) {
        continue;
      }
      
      // If circuit is open but ready for recovery, set to half-open
      if (state === CircuitState.OPEN && this.isReadyForRecovery(env.name)) {
        this.circuitStates.set(env.name, CircuitState.HALF_OPEN);
        console.log(`Circuit for ${env.name} is now HALF_OPEN`);
      }
      
      try {
        const executor = createExecutor(env);
        const result = await executor`${operation}`;
        
        // Success: close the circuit
        this.onSuccess(env.name);
        return result;
        
      } catch (error) {
        // Failure: handle based on current state
        this.onFailure(env.name);
        
        // Continue to next environment
        continue;
      }
    }
    
    throw new Error('All available environments failed');
  }
  
  private getAvailableEnvironments(): EnvironmentTarget[] {
    return this.environments
      .filter(env => {
        const state = this.circuitStates.get(env.name);
        return state === CircuitState.CLOSED || 
               state === CircuitState.HALF_OPEN ||
               (state === CircuitState.OPEN && this.isReadyForRecovery(env.name));
      })
      .sort((a, b) => a.priority - b.priority);
  }
  
  private isReadyForRecovery(envName: string): boolean {
    const lastFailure = this.lastFailureTimes.get(envName);
    if (!lastFailure) return true;
    
    return Date.now() - lastFailure > this.config.recoveryTimeout;
  }
  
  private onSuccess(envName: string) {
    const state = this.circuitStates.get(envName);
    
    if (state === CircuitState.HALF_OPEN || state === CircuitState.OPEN) {
      console.log(`Circuit for ${envName} is now CLOSED`);
    }
    
    this.circuitStates.set(envName, CircuitState.CLOSED);
    this.lastFailureTimes.delete(envName);
  }
  
  private onFailure(envName: string) {
    const state = this.circuitStates.get(envName);
    this.lastFailureTimes.set(envName, Date.now());
    
    if (state === CircuitState.HALF_OPEN) {
      // Half-open failure: go back to open
      this.circuitStates.set(envName, CircuitState.OPEN);
      console.log(`Circuit for ${envName} is now OPEN (half-open failure)`);
    } else if (state === CircuitState.CLOSED) {
      // Check if we've exceeded the failure threshold
      // For simplicity, we'll open immediately on any failure
      // In production, you'd track failure count
      this.circuitStates.set(envName, CircuitState.OPEN);
      console.log(`Circuit for ${envName} is now OPEN`);
    }
  }
  
  getCircuitStatus(): Record<string, { state: CircuitState; lastFailure?: number }> {
    const status: Record<string, any> = {};
    
    this.environments.forEach(env => {
      status[env.name] = {
        state: this.circuitStates.get(env.name),
        lastFailure: this.lastFailureTimes.get(env.name)
      };
    });
    
    return status;
  }
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
}

// Example usage
const circuitBreaker = new EnvironmentCircuitBreaker(environments);

try {
  const result = await circuitBreaker.execute('python analytics.py');
  console.log('Operation successful:', result.stdout);
} catch (error) {
  console.error('All environments failed:', error.message);
  console.log('Circuit status:', circuitBreaker.getCircuitStatus());
}
```

### Load Balancing with Health Monitoring

Distribute load across healthy environments:

```typescript
class EnvironmentLoadBalancer {
  private healthStatus = new Map<string, boolean>();
  private currentIndex = 0;
  private requestCounts = new Map<string, number>();
  
  constructor(
    private environments: EnvironmentTarget[],
    private strategy: 'round-robin' | 'least-connections' | 'weighted' = 'round-robin',
    private healthCheckInterval = 30000
  ) {
    this.initializeHealthChecks();
  }
  
  async execute(operation: string): Promise<any> {
    const healthyEnvironments = this.getHealthyEnvironments();
    
    if (healthyEnvironments.length === 0) {
      throw new Error('No healthy environments available');
    }
    
    const selectedEnv = this.selectEnvironment(healthyEnvironments);
    const executor = createExecutor(selectedEnv);
    
    // Track request
    const currentCount = this.requestCounts.get(selectedEnv.name) || 0;
    this.requestCounts.set(selectedEnv.name, currentCount + 1);
    
    try {
      const result = await executor`${operation}`;
      console.log(`Executed on ${selectedEnv.name}`);
      return result;
    } catch (error) {
      // Mark environment as unhealthy on failure
      this.healthStatus.set(selectedEnv.name, false);
      
      // Retry on next healthy environment
      const remainingEnvs = healthyEnvironments.filter(env => env.name !== selectedEnv.name);
      if (remainingEnvs.length > 0) {
        return this.execute(operation);
      }
      
      throw error;
    } finally {
      // Decrement request count
      const count = this.requestCounts.get(selectedEnv.name) || 0;
      this.requestCounts.set(selectedEnv.name, Math.max(0, count - 1));
    }
  }
  
  private selectEnvironment(healthyEnvs: EnvironmentTarget[]): EnvironmentTarget {
    switch (this.strategy) {
      case 'round-robin':
        return this.roundRobinSelect(healthyEnvs);
      
      case 'least-connections':
        return this.leastConnectionsSelect(healthyEnvs);
      
      case 'weighted':
        return this.weightedSelect(healthyEnvs);
      
      default:
        return healthyEnvs[0];
    }
  }
  
  private roundRobinSelect(envs: EnvironmentTarget[]): EnvironmentTarget {
    const env = envs[this.currentIndex % envs.length];
    this.currentIndex++;
    return env;
  }
  
  private leastConnectionsSelect(envs: EnvironmentTarget[]): EnvironmentTarget {
    return envs.reduce((least, current) => {
      const leastCount = this.requestCounts.get(least.name) || 0;
      const currentCount = this.requestCounts.get(current.name) || 0;
      return currentCount < leastCount ? current : least;
    });
  }
  
  private weightedSelect(envs: EnvironmentTarget[]): EnvironmentTarget {
    // Select based on priority (lower number = higher weight)
    const weights = envs.map(env => 1 / (env.priority || 1));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < envs.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return envs[i];
      }
    }
    
    return envs[envs.length - 1];
  }
  
  private getHealthyEnvironments(): EnvironmentTarget[] {
    return this.environments.filter(env => 
      this.healthStatus.get(env.name) !== false
    );
  }
  
  private initializeHealthChecks() {
    // Initial health check for all environments
    this.environments.forEach(env => {
      this.healthStatus.set(env.name, true);
    });
    
    // Periodic health checks
    setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);
  }
  
  private async performHealthChecks() {
    const healthPromises = this.environments.map(async env => {
      try {
        const isHealthy = await env.healthCheck();
        this.healthStatus.set(env.name, isHealthy);
        
        if (!isHealthy) {
          console.log(`Health check failed for ${env.name}`);
        }
      } catch (error) {
        this.healthStatus.set(env.name, false);
        console.error(`Health check error for ${env.name}: ${error.message}`);
      }
    });
    
    await Promise.allSettled(healthPromises);
  }
  
  getStats() {
    return {
      healthStatus: Object.fromEntries(this.healthStatus),
      requestCounts: Object.fromEntries(this.requestCounts),
      healthyCount: this.getHealthyEnvironments().length
    };
  }
}

// Example usage
const loadBalancer = new EnvironmentLoadBalancer(environments, 'least-connections');

// Execute multiple operations with load balancing
const operations = Array(10).fill('echo "Processing request"');
const results = await $.parallel.map(operations, op => loadBalancer.execute(op));

console.log('Load balancer stats:', loadBalancer.getStats());
```

## Service Discovery and Auto-Recovery

### Dynamic Environment Discovery

Automatically discover and register available environments:

```typescript
class EnvironmentDiscovery {
  private discoveredEnvironments = new Map<string, EnvironmentTarget>();
  private discoveryIntervals = new Map<string, NodeJS.Timeout>();
  
  constructor(private discoveryConfig: DiscoveryConfig[]) {
    this.startDiscovery();
  }
  
  private startDiscovery() {
    this.discoveryConfig.forEach(config => {
      // Initial discovery
      this.discoverEnvironments(config);
      
      // Periodic discovery
      const interval = setInterval(() => {
        this.discoverEnvironments(config);
      }, config.interval || 60000);
      
      this.discoveryIntervals.set(config.name, interval);
    });
  }
  
  private async discoverEnvironments(config: DiscoveryConfig) {
    try {
      switch (config.type) {
        case 'kubernetes':
          await this.discoverKubernetesServices(config);
          break;
        case 'consul':
          await this.discoverConsulServices(config);
          break;
        case 'dns':
          await this.discoverDnsServices(config);
          break;
        case 'file':
          await this.discoverFileBasedServices(config);
          break;
      }
    } catch (error) {
      console.error(`Discovery failed for ${config.name}: ${error.message}`);
    }
  }
  
  private async discoverKubernetesServices(config: DiscoveryConfig) {
    const k8s = $.k8s(config.connection);
    
    const services = await k8s`kubectl get services -o json`;
    const serviceData = JSON.parse(services.stdout);
    
    serviceData.items.forEach((service: any) => {
      if (service.metadata.labels?.['app'] === config.selector) {
        const envTarget: EnvironmentTarget = {
          name: `k8s-${service.metadata.name}`,
          type: 'kubernetes',
          priority: config.priority || 10,
          config: {
            namespace: service.metadata.namespace,
            service: service.metadata.name
          },
          healthCheck: async () => {
            try {
              await k8s`kubectl get service ${service.metadata.name}`;
              return true;
            } catch {
              return false;
            }
          }
        };
        
        this.discoveredEnvironments.set(envTarget.name, envTarget);
      }
    });
  }
  
  private async discoverConsulServices(config: DiscoveryConfig) {
    // Query Consul for services
    const consulQuery = await $`curl -s http://${config.connection.host}:8500/v1/catalog/service/${config.selector}`;
    const services = JSON.parse(consulQuery.stdout);
    
    services.forEach((service: any) => {
      const envTarget: EnvironmentTarget = {
        name: `consul-${service.Node}-${service.ServiceName}`,
        type: 'ssh',
        priority: config.priority || 10,
        config: {
          host: service.Address,
          port: service.ServicePort
        },
        healthCheck: async () => {
          try {
            await $`curl -f http://${service.Address}:${service.ServicePort}/health`;
            return true;
          } catch {
            return false;
          }
        }
      };
      
      this.discoveredEnvironments.set(envTarget.name, envTarget);
    });
  }
  
  private async discoverDnsServices(config: DiscoveryConfig) {
    // DNS SRV record discovery
    const srvQuery = await $`dig +short SRV ${config.selector}`;
    const records = srvQuery.stdout.trim().split('\n').filter(Boolean);
    
    records.forEach((record: string) => {
      const [priority, weight, port, target] = record.split(' ');
      
      const envTarget: EnvironmentTarget = {
        name: `dns-${target}`,
        type: 'ssh',
        priority: parseInt(priority) || 10,
        config: {
          host: target.replace(/\.$/, ''), // Remove trailing dot
          port: parseInt(port)
        },
        healthCheck: async () => {
          try {
            await $`nc -z ${target} ${port}`;
            return true;
          } catch {
            return false;
          }
        }
      };
      
      this.discoveredEnvironments.set(envTarget.name, envTarget);
    });
  }
  
  private async discoverFileBasedServices(config: DiscoveryConfig) {
    // File-based service discovery
    const serviceFile = await $`cat ${config.connection.file}`;
    const services = JSON.parse(serviceFile.stdout);
    
    services.environments?.forEach((env: any) => {
      const envTarget: EnvironmentTarget = {
        name: env.name,
        type: env.type,
        priority: env.priority || 10,
        config: env.config,
        healthCheck: async () => {
          // Custom health check based on environment type
          const executor = createExecutor({ ...env, healthCheck: () => Promise.resolve(true) });
          try {
            await executor`echo "health check"`;
            return true;
          } catch {
            return false;
          }
        }
      };
      
      this.discoveredEnvironments.set(envTarget.name, envTarget);
    });
  }
  
  getDiscoveredEnvironments(): EnvironmentTarget[] {
    return Array.from(this.discoveredEnvironments.values());
  }
  
  getEnvironmentByName(name: string): EnvironmentTarget | undefined {
    return this.discoveredEnvironments.get(name);
  }
  
  removeEnvironment(name: string) {
    this.discoveredEnvironments.delete(name);
  }
  
  stopDiscovery() {
    this.discoveryIntervals.forEach(interval => clearInterval(interval));
    this.discoveryIntervals.clear();
  }
}

interface DiscoveryConfig {
  name: string;
  type: 'kubernetes' | 'consul' | 'dns' | 'file';
  selector: string;
  connection: any;
  interval?: number;
  priority?: number;
}

// Example usage
const discovery = new EnvironmentDiscovery([
  {
    name: 'k8s-discovery',
    type: 'kubernetes',
    selector: 'myapp',
    connection: { namespace: 'production' },
    interval: 30000
  },
  {
    name: 'file-discovery',
    type: 'file',
    selector: 'environments',
    connection: { file: './environments.json' },
    interval: 60000
  }
]);

// Wait for discovery to complete
await new Promise(resolve => setTimeout(resolve, 2000));

// Get discovered environments
const environments = discovery.getDiscoveredEnvironments();
console.log('Discovered environments:', environments.map(e => e.name));
```

### Automatic Recovery and Healing

Implement self-healing patterns across environments:

```typescript
class AutoRecoveryManager {
  private recoveryAttempts = new Map<string, number>();
  private lastRecoveryTimes = new Map<string, number>();
  
  constructor(
    private environments: EnvironmentTarget[],
    private recoveryConfig: RecoveryConfig
  ) {}
  
  async monitorAndRecover() {
    console.log('Starting auto-recovery monitoring...');
    
    while (true) {
      await this.performHealthChecks();
      await new Promise(resolve => setTimeout(resolve, this.recoveryConfig.checkInterval));
    }
  }
  
  private async performHealthChecks() {
    const healthPromises = this.environments.map(async env => {
      try {
        const isHealthy = await env.healthCheck();
        
        if (!isHealthy) {
          await this.attemptRecovery(env);
        } else {
          // Reset recovery attempts on successful health check
          this.recoveryAttempts.delete(env.name);
        }
      } catch (error) {
        console.error(`Health check failed for ${env.name}: ${error.message}`);
        await this.attemptRecovery(env);
      }
    });
    
    await Promise.allSettled(healthPromises);
  }
  
  private async attemptRecovery(env: EnvironmentTarget) {
    const attempts = this.recoveryAttempts.get(env.name) || 0;
    const lastRecovery = this.lastRecoveryTimes.get(env.name) || 0;
    
    // Check if we should attempt recovery
    if (attempts >= this.recoveryConfig.maxAttempts) {
      console.log(`Max recovery attempts reached for ${env.name}`);
      return;
    }
    
    // Rate limiting between recovery attempts
    const timeSinceLastRecovery = Date.now() - lastRecovery;
    if (timeSinceLastRecovery < this.recoveryConfig.recoveryInterval) {
      return;
    }
    
    console.log(`Attempting recovery for ${env.name} (attempt ${attempts + 1})`);
    
    try {
      await this.executeRecovery(env);
      
      // Verify recovery was successful
      const isHealthy = await env.healthCheck();
      if (isHealthy) {
        console.log(`✅ Recovery successful for ${env.name}`);
        this.recoveryAttempts.delete(env.name);
      } else {
        throw new Error('Recovery verification failed');
      }
      
    } catch (error) {
      console.error(`❌ Recovery failed for ${env.name}: ${error.message}`);
      this.recoveryAttempts.set(env.name, attempts + 1);
    }
    
    this.lastRecoveryTimes.set(env.name, Date.now());
  }
  
  private async executeRecovery(env: EnvironmentTarget) {
    const executor = createExecutor(env);
    
    switch (env.type) {
      case 'local':
        await this.recoverLocal(executor, env);
        break;
      case 'ssh':
        await this.recoverSsh(executor, env);
        break;
      case 'docker':
        await this.recoverDocker(executor, env);
        break;
      case 'kubernetes':
        await this.recoverKubernetes(executor, env);
        break;
    }
  }
  
  private async recoverLocal(executor: any, env: EnvironmentTarget) {
    // Common local recovery actions
    await executor`pkill -f "${this.recoveryConfig.processName}" || true`;
    await new Promise(resolve => setTimeout(resolve, 2000));
    await executor`${this.recoveryConfig.startCommand}`;
  }
  
  private async recoverSsh(executor: any, env: EnvironmentTarget) {
    // SSH service recovery
    await executor`sudo systemctl restart ${this.recoveryConfig.serviceName}`;
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Additional checks
    const status = await executor`sudo systemctl is-active ${this.recoveryConfig.serviceName}`;
    if (!status.stdout.includes('active')) {
      throw new Error('Service restart failed');
    }
  }
  
  private async recoverDocker(executor: any, env: EnvironmentTarget) {
    // Docker container recovery
    const containerName = env.config.container || this.recoveryConfig.containerName;
    
    // Stop and remove container
    await executor`docker stop ${containerName} || true`;
    await executor`docker rm ${containerName} || true`;
    
    // Restart container
    await executor`docker run -d --name ${containerName} ${this.recoveryConfig.dockerImage}`;
    
    // Wait for container to be ready
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  private async recoverKubernetes(executor: any, env: EnvironmentTarget) {
    const namespace = env.config.namespace || 'default';
    const deployment = this.recoveryConfig.deploymentName;
    
    // Restart deployment
    await executor`kubectl rollout restart deployment/${deployment} -n ${namespace}`;
    await executor`kubectl rollout status deployment/${deployment} -n ${namespace} --timeout=300s`;
    
    // Scale down and up if restart fails
    try {
      const pods = await executor`kubectl get pods -n ${namespace} -l app=${deployment} --field-selector=status.phase=Running`;
      if (!pods.stdout.trim()) {
        await executor`kubectl scale deployment/${deployment} --replicas=0 -n ${namespace}`;
        await new Promise(resolve => setTimeout(resolve, 10000));
        await executor`kubectl scale deployment/${deployment} --replicas=1 -n ${namespace}`;
      }
    } catch (error) {
      console.error('K8s scaling recovery failed:', error.message);
    }
  }
  
  getRecoveryStats() {
    return {
      attempts: Object.fromEntries(this.recoveryAttempts),
      lastRecoveryTimes: Object.fromEntries(this.lastRecoveryTimes)
    };
  }
}

interface RecoveryConfig {
  checkInterval: number;
  recoveryInterval: number;
  maxAttempts: number;
  processName?: string;
  serviceName?: string;
  containerName?: string;
  deploymentName?: string;
  dockerImage?: string;
  startCommand?: string;
}

// Example usage
const recoveryManager = new AutoRecoveryManager(environments, {
  checkInterval: 30000,    // Check every 30 seconds
  recoveryInterval: 60000, // Wait 1 minute between recovery attempts
  maxAttempts: 3,
  serviceName: 'myapp',
  deploymentName: 'myapp',
  containerName: 'myapp-container',
  dockerImage: 'myapp:latest',
  startCommand: 'npm start'
});

// Start monitoring (runs indefinitely)
recoveryManager.monitorAndRecover().catch(console.error);
```

## Best Practices

### 1. Failover Strategy Design
- Define clear priority orders for environments
- Implement proper health checks for each environment type
- Plan for graceful degradation scenarios
- Document recovery procedures

### 2. Circuit Breaker Configuration
- Set appropriate failure thresholds
- Configure reasonable recovery timeouts
- Monitor circuit breaker states
- Implement alerting for circuit breaker state changes

### 3. Load Balancing Considerations
- Choose appropriate load balancing algorithms
- Monitor resource utilization across environments
- Implement connection pooling where appropriate
- Handle environment-specific rate limits

### 4. Monitoring and Alerting
- Track failover events and frequency
- Monitor environment health continuously
- Set up alerts for environment failures
- Log all recovery attempts and outcomes

### 5. Testing Failover Scenarios
- Regularly test failover mechanisms
- Simulate various failure scenarios
- Validate recovery procedures
- Measure failover times and impact

## Conclusion

Robust failover strategies in @xec-sh/core enable building resilient systems that can handle various failure scenarios across hybrid infrastructure. By implementing proper circuit breakers, load balancing, and auto-recovery mechanisms, you can ensure high availability and graceful degradation when services become unavailable.

The key to successful failover implementation is thorough testing, continuous monitoring, and well-defined recovery procedures for each environment type.