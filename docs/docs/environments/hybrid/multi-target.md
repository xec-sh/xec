# Multi-Target Command Execution

Execute commands across different environment types (local, SSH, Docker, Kubernetes) in coordinated workflows. This guide demonstrates patterns for orchestrating operations across heterogeneous infrastructure.

## Overview

Multi-target execution enables you to:
- Deploy applications across different environment types
- Coordinate operations between local development and remote production
- Build complex data pipelines spanning multiple environments
- Implement hybrid cloud strategies

## Basic Multi-Target Patterns

### Sequential Cross-Environment Deployment

Deploy from local development to remote staging, then to Kubernetes production:

```typescript
import { $ } from '@xec-sh/core';

async function deployToEnvironments() {
  // 1. Build locally
  console.log('Building application locally...');
  await $`npm run build`;
  await $`npm run test`;
  
  // 2. Deploy to staging server via SSH
  console.log('Deploying to staging...');
  const staging = $.ssh({
    host: 'staging.example.com',
    username: 'deploy',
    privateKey: await fs.readFile('~/.ssh/deploy_key', 'utf8')
  });
  
  // Transfer and deploy to staging
  await staging`rsync -avz ./dist/ /var/www/staging/`;
  await staging`sudo systemctl restart nginx`;
  
  // Run staging tests
  const stagingTests = await staging`npm run test:integration`.nothrow();
  if (!stagingTests.ok) {
    throw new Error('Staging tests failed');
  }
  
  // 3. Deploy to Kubernetes production
  console.log('Deploying to production Kubernetes...');
  const k8s = $.k8s({ namespace: 'production' });
  
  // Apply Kubernetes manifests
  await k8s`kubectl apply -f k8s/production/`;
  await k8s`kubectl rollout status deployment/app`;
  
  // Verify deployment
  const healthCheck = await k8s`kubectl get pods -l app=myapp --field-selector=status.phase=Running`;
  console.log('Production pods:', healthCheck.stdout);
}
```

### Parallel Multi-Environment Operations

Execute operations simultaneously across different environment types:

```typescript
async function parallelEnvironmentOperations() {
  const operations = [
    // Local backup
    $`tar -czf backup-$(date +%Y%m%d).tar.gz ./data`,
    
    // Remote database backup via SSH
    $.ssh({ host: 'db.example.com', username: 'admin' })`
      pg_dump myapp_prod | gzip > /backups/db-$(date +%Y%m%d).sql.gz
    `,
    
    // Docker container health checks
    $.docker({ container: 'monitoring' })`
      /opt/monitoring/check-services.sh
    `,
    
    // Kubernetes cluster status
    $.k8s({ context: 'production' })`
      kubectl get nodes -o json | jq '.items[].status.conditions'
    `
  ];
  
  const results = await $.parallel.settled(operations);
  
  results.succeeded.forEach((result, i) => {
    console.log(`Operation ${i + 1} succeeded`);
  });
  
  if (results.failed.length > 0) {
    console.error(`${results.failed.length} operations failed`);
    results.failed.forEach((error, i) => {
      console.error(`Failed operation: ${error.message}`);
    });
  }
}
```

## Data Pipeline Across Environments

### ETL Pipeline with Multiple Sources

Extract data from various sources, transform locally, and load to different targets:

```typescript
async function etlPipeline() {
  // Extract from different sources
  const extractionTasks = await $.parallel.all([
    // Extract from remote database
    $.ssh({ host: 'legacy-db.example.com' })`
      mysqldump --single-transaction legacy_db users > /tmp/users.sql
    `,
    
    // Extract from API in Kubernetes
    $.k8s({ namespace: 'data-services' }).pod('api-extractor')`
      python extract_api_data.py --output /shared/api-data.json
    `,
    
    // Extract from local files
    $`find ./raw-data -name "*.csv" -type f > /tmp/csv-files.txt`
  ]);
  
  // Transfer remote data locally for transformation
  await $`scp legacy-db.example.com:/tmp/users.sql ./temp/`;
  await $.k8s().transfer.download('/shared/api-data.json', './temp/');
  
  // Transform data locally
  console.log('Transforming data...');
  await $`python transform_pipeline.py --input ./temp/ --output ./processed/`;
  
  // Load to different targets
  const loadTasks = [
    // Load to data warehouse via SSH
    $.ssh({ host: 'warehouse.example.com' })`
      psql -d warehouse < ./processed/transformed_users.sql
    `,
    
    // Load to analytics cluster in Kubernetes
    $.k8s({ namespace: 'analytics' })`
      kubectl exec -i analytics-loader -- \
        python load_data.py --source /processed/analytics_data.json
    `,
    
    // Update local development database
    $`psql -d dev_db < ./processed/dev_schema.sql`
  ];
  
  await $.parallel.all(loadTasks);
  console.log('ETL pipeline completed successfully');
}
```

### Real-time Data Synchronization

Keep data synchronized across multiple environments:

```typescript
async function syncDataAcrossEnvironments() {
  const syncInterval = 30000; // 30 seconds
  
  setInterval(async () => {
    try {
      // Check for changes in source systems
      const changes = await $.parallel.settled([
        // Check local file changes
        $`find ./sync-data -newer .last-sync -type f`,
        
        // Check remote database changes
        $.ssh({ host: 'source-db.example.com' })`
          psql -t -c "SELECT count(*) FROM audit_log WHERE created_at > '$(cat .last-sync-time)'"
        `,
        
        // Check Kubernetes volume changes
        $.k8s().pod('data-monitor')`
          find /data -newer /tmp/last-sync -type f | wc -l
        `
      ]);
      
      let hasChanges = false;
      
      // Process local changes
      if (changes.results[0] && changes.results[0].stdout.trim()) {
        hasChanges = true;
        await syncLocalChanges();
      }
      
      // Process database changes
      if (changes.results[1] && parseInt(changes.results[1].stdout.trim()) > 0) {
        hasChanges = true;
        await syncDatabaseChanges();
      }
      
      // Process Kubernetes changes
      if (changes.results[2] && parseInt(changes.results[2].stdout.trim()) > 0) {
        hasChanges = true;
        await syncKubernetesChanges();
      }
      
      if (hasChanges) {
        // Update sync timestamps
        await $`date > .last-sync`;
        await $.ssh({ host: 'source-db.example.com' })`date > .last-sync-time`;
        await $.k8s().pod('data-monitor')`date > /tmp/last-sync`;
        
        console.log('Data synchronization completed');
      }
      
    } catch (error) {
      console.error('Sync error:', error.message);
    }
  }, syncInterval);
}

async function syncLocalChanges() {
  // Sync local changes to remote environments
  await $.parallel.all([
    $.ssh({ host: 'backup.example.com' })`
      rsync -avz --delete ./sync-data/ /backup/local-data/
    `,
    $.k8s().transfer.upload('./sync-data/', '/shared/local-data/')
  ]);
}

async function syncDatabaseChanges() {
  // Export changes and apply to other environments
  await $.ssh({ host: 'source-db.example.com' })`
    pg_dump --data-only --inserts changed_table > /tmp/changes.sql
  `;
  
  await $.parallel.all([
    $`scp source-db.example.com:/tmp/changes.sql ./temp/ && psql -d local_db < ./temp/changes.sql`,
    $.k8s().pod('replica-db')`psql -d replica < /shared/changes.sql`
  ]);
}

async function syncKubernetesChanges() {
  // Sync Kubernetes volume changes
  await $.k8s().transfer.download('/data/changed-files/', './temp/k8s-changes/');
  
  await $.parallel.all([
    $`rsync -avz ./temp/k8s-changes/ ./local-mirror/`,
    $.ssh({ host: 'archive.example.com' })`
      rsync -avz ./temp/k8s-changes/ /archive/k8s-data/
    `
  ]);
}
```

## Environment-Specific Deployment Patterns

### Development to Production Flow

Implement a complete development-to-production deployment flow:

```typescript
async function devToProdFlow(version: string) {
  // 1. Local development checks
  console.log('Running local development checks...');
  await $`npm run lint`;
  await $`npm run test`;
  await $`npm run build`;
  
  // 2. Deploy to development Docker environment
  console.log('Deploying to development Docker...');
  await $.docker().build('myapp:dev', '.');
  
  const devContainer = await $.docker().run({
    image: 'myapp:dev',
    name: 'myapp-dev',
    ports: ['3000:3000'],
    env: { NODE_ENV: 'development' },
    autoRemove: true
  });
  
  // Run integration tests
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for startup
  const devTests = await $`curl -f http://localhost:3000/health`.nothrow();
  
  if (!devTests.ok) {
    await devContainer.stop();
    throw new Error('Development tests failed');
  }
  
  await devContainer.stop();
  
  // 3. Deploy to staging via SSH
  console.log('Deploying to staging...');
  const staging = $.ssh({
    host: 'staging.example.com',
    username: 'deploy'
  });
  
  // Build on staging server
  await staging`
    cd /apps/myapp &&
    git pull origin main &&
    npm ci --production &&
    npm run build
  `;
  
  // Deploy with zero-downtime
  await staging`
    cd /apps/myapp &&
    pm2 reload ecosystem.config.js --env staging
  `;
  
  // Staging smoke tests
  const stagingHealth = await staging`curl -f http://localhost:8080/health`;
  console.log('Staging health check:', stagingHealth.stdout);
  
  // 4. Deploy to production Kubernetes
  console.log('Deploying to production Kubernetes...');
  const k8s = $.k8s({ namespace: 'production' });
  
  // Update image tag in deployment
  await k8s`
    kubectl set image deployment/myapp myapp=myapp:${version} &&
    kubectl rollout status deployment/myapp --timeout=300s
  `;
  
  // Production health checks
  const prodPods = await k8s`kubectl get pods -l app=myapp -o jsonpath='{.items[*].status.phase}'`;
  if (!prodPods.stdout.includes('Running')) {
    throw new Error('Production deployment failed');
  }
  
  console.log('Deployment flow completed successfully');
}
```

### Microservices Coordination

Deploy and coordinate multiple microservices across different environments:

```typescript
interface Service {
  name: string;
  environment: 'local' | 'docker' | 'ssh' | 'kubernetes';
  config: any;
  dependencies: string[];
  healthCheck: string;
}

async function deployMicroservices(services: Service[]) {
  // Build dependency graph
  const dependencyGraph = buildDependencyGraph(services);
  const deploymentOrder = topologicalSort(dependencyGraph);
  
  console.log('Deployment order:', deploymentOrder.map(s => s.name));
  
  for (const service of deploymentOrder) {
    console.log(`Deploying ${service.name} to ${service.environment}...`);
    
    // Wait for dependencies to be healthy
    await waitForDependencies(service.dependencies);
    
    // Deploy based on environment type
    switch (service.environment) {
      case 'local':
        await deployLocalService(service);
        break;
      case 'docker':
        await deployDockerService(service);
        break;
      case 'ssh':
        await deploySshService(service);
        break;
      case 'kubernetes':
        await deployKubernetesService(service);
        break;
    }
    
    // Verify deployment
    await verifyServiceHealth(service);
    console.log(`✅ ${service.name} deployed successfully`);
  }
}

async function deployLocalService(service: Service) {
  await $`cd ./services/${service.name} && npm start`.env(service.config);
}

async function deployDockerService(service: Service) {
  const container = await $.docker().run({
    image: `${service.name}:latest`,
    name: service.name,
    env: service.config,
    network: 'microservices'
  });
  
  return container;
}

async function deploySshService(service: Service) {
  const ssh = $.ssh(service.config.ssh);
  
  await ssh`
    cd /apps/${service.name} &&
    git pull &&
    npm ci --production &&
    pm2 restart ${service.name}
  `;
}

async function deployKubernetesService(service: Service) {
  const k8s = $.k8s(service.config.k8s);
  
  await k8s`kubectl apply -f /manifests/${service.name}/`;
  await k8s`kubectl rollout status deployment/${service.name}`;
}

async function waitForDependencies(dependencies: string[]) {
  const healthChecks = dependencies.map(dep => 
    checkServiceHealth(dep)
  );
  
  await $.parallel.all(healthChecks);
}

async function verifyServiceHealth(service: Service) {
  const maxRetries = 30;
  const retryDelay = 2000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const health = await checkServiceHealth(service.name);
      if (health.ok) {
        return;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Service ${service.name} failed health check after ${maxRetries} attempts`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
}

async function checkServiceHealth(serviceName: string) {
  // Implementation depends on service discovery mechanism
  return $`curl -f http://${serviceName}/health`;
}
```

## Advanced Cross-Environment Patterns

### Environment-Aware Configuration Management

Manage configurations across different environment types:

```typescript
interface EnvironmentConfig {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  configs: Record<string, string>;
  secrets?: Record<string, string>;
}

async function manageEnvironmentConfigs(environments: Record<string, EnvironmentConfig>) {
  for (const [envName, config] of Object.entries(environments)) {
    console.log(`Updating configuration for ${envName}...`);
    
    switch (config.type) {
      case 'local':
        await updateLocalConfig(config);
        break;
      case 'ssh':
        await updateSshConfig(envName, config);
        break;
      case 'docker':
        await updateDockerConfig(envName, config);
        break;
      case 'kubernetes':
        await updateKubernetesConfig(envName, config);
        break;
    }
  }
}

async function updateLocalConfig(config: EnvironmentConfig) {
  const envContent = Object.entries(config.configs)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  await $`echo "${envContent}" > .env.local`;
}

async function updateSshConfig(envName: string, config: EnvironmentConfig) {
  const ssh = $.ssh({ host: `${envName}.example.com` });
  
  for (const [key, value] of Object.entries(config.configs)) {
    await ssh`echo "export ${key}=${value}" >> /etc/environment`;
  }
  
  if (config.secrets) {
    for (const [key, value] of Object.entries(config.secrets)) {
      await ssh`echo "${key}=${value}" >> /etc/secrets.env`;
      await ssh`chmod 600 /etc/secrets.env`;
    }
  }
}

async function updateDockerConfig(envName: string, config: EnvironmentConfig) {
  // Create environment file for Docker containers
  const envContent = Object.entries({...config.configs, ...config.secrets})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  await $`echo "${envContent}" > ./docker/env/${envName}.env`;
}

async function updateKubernetesConfig(envName: string, config: EnvironmentConfig) {
  const k8s = $.k8s({ namespace: envName });
  
  // Create ConfigMap for non-secret configs
  const configMapData = Object.entries(config.configs)
    .map(([key, value]) => `  ${key}: "${value}"`)
    .join('\n');
  
  const configMapYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: ${envName}
data:
${configMapData}
`;

  await $`echo '${configMapYaml}' | kubectl apply -f -`;
  
  // Create Secret for sensitive configs
  if (config.secrets) {
    const secretData = Object.entries(config.secrets)
      .map(([key, value]) => `  ${key}: ${Buffer.from(value).toString('base64')}`)
      .join('\n');
    
    const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: ${envName}
type: Opaque
data:
${secretData}
`;
    
    await $`echo '${secretYaml}' | kubectl apply -f -`;
  }
}
```

### Cross-Environment Monitoring

Monitor and collect metrics from all environment types:

```typescript
async function crossEnvironmentMonitoring() {
  const monitoringTasks = [
    // Local system metrics
    collectLocalMetrics(),
    
    // SSH-based server metrics
    collectSshMetrics(),
    
    // Docker container metrics
    collectDockerMetrics(),
    
    // Kubernetes cluster metrics
    collectKubernetesMetrics()
  ];
  
  const metrics = await $.parallel.settled(monitoringTasks);
  
  // Aggregate and analyze metrics
  const aggregatedMetrics = aggregateMetrics(metrics.succeeded);
  
  // Send to monitoring system
  await sendToMonitoring(aggregatedMetrics);
  
  // Generate alerts if needed
  await checkAlerts(aggregatedMetrics);
}

async function collectLocalMetrics() {
  return {
    environment: 'local',
    cpu: await $`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
    memory: await $`free | grep Mem | awk '{print ($3/$2) * 100}'`,
    disk: await $`df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`,
    timestamp: new Date().toISOString()
  };
}

async function collectSshMetrics() {
  const servers = ['web1.example.com', 'web2.example.com', 'db.example.com'];
  
  const serverMetrics = await $.parallel.map(servers, async (server) => {
    const ssh = $.ssh({ host: server });
    
    return {
      environment: 'ssh',
      server,
      cpu: await ssh`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
      memory: await ssh`free | grep Mem | awk '{print ($3/$2) * 100}'`,
      disk: await ssh`df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`,
      timestamp: new Date().toISOString()
    };
  });
  
  return serverMetrics.succeeded;
}

async function collectDockerMetrics() {
  const containers = await $.docker()`docker ps --format "{{.Names}}"`;
  const containerNames = containers.stdout.trim().split('\n').filter(Boolean);
  
  const containerMetrics = await $.parallel.map(containerNames, async (container) => {
    const stats = await $.docker()`docker stats ${container} --no-stream --format "{{.CPUPerc}},{{.MemPerc}}"`;
    const [cpu, memory] = stats.stdout.trim().split(',');
    
    return {
      environment: 'docker',
      container,
      cpu: cpu.replace('%', ''),
      memory: memory.replace('%', ''),
      timestamp: new Date().toISOString()
    };
  });
  
  return containerMetrics.succeeded;
}

async function collectKubernetesMetrics() {
  const k8s = $.k8s();
  
  const pods = await k8s`kubectl get pods -o json`;
  const podData = JSON.parse(pods.stdout);
  
  const podMetrics = await $.parallel.map(podData.items, async (pod) => {
    try {
      const metrics = await k8s`kubectl top pod ${pod.metadata.name} --no-headers`;
      const [cpu, memory] = metrics.stdout.trim().split(/\s+/).slice(1);
      
      return {
        environment: 'kubernetes',
        namespace: pod.metadata.namespace,
        pod: pod.metadata.name,
        cpu,
        memory,
        timestamp: new Date().toISOString()
      };
    } catch {
      return null;
    }
  });
  
  return podMetrics.succeeded.filter(Boolean);
}
```

## Error Handling and Recovery

### Cross-Environment Error Recovery

Implement robust error handling across different environment types:

```typescript
async function robustCrossEnvironmentOperation() {
  const operations = [
    {
      name: 'local-backup',
      fn: () => $`tar -czf backup.tar.gz ./data`,
      recovery: () => $`rm -f backup.tar.gz`
    },
    {
      name: 'ssh-deploy',
      fn: () => $.ssh({ host: 'app.example.com' })`systemctl restart myapp`,
      recovery: () => $.ssh({ host: 'app.example.com' })`systemctl start myapp`
    },
    {
      name: 'k8s-scale',
      fn: () => $.k8s()`kubectl scale deployment myapp --replicas=5`,
      recovery: () => $.k8s()`kubectl scale deployment myapp --replicas=3`
    }
  ];
  
  const completedOperations = [];
  
  try {
    for (const operation of operations) {
      console.log(`Executing ${operation.name}...`);
      await operation.fn();
      completedOperations.push(operation);
      console.log(`✅ ${operation.name} completed`);
    }
  } catch (error) {
    console.error(`❌ Operation failed: ${error.message}`);
    console.log('Starting recovery process...');
    
    // Reverse recovery for completed operations
    for (const operation of completedOperations.reverse()) {
      try {
        console.log(`Recovering ${operation.name}...`);
        await operation.recovery();
        console.log(`✅ ${operation.name} recovered`);
      } catch (recoveryError) {
        console.error(`❌ Recovery failed for ${operation.name}: ${recoveryError.message}`);
      }
    }
    
    throw error;
  }
}
```

## Best Practices

### 1. Environment Isolation
- Use separate configurations for each environment type
- Implement proper secret management
- Maintain environment-specific resource limits

### 2. Coordination Strategies
- Implement proper dependency management between environments
- Use health checks to verify environment readiness
- Plan for partial failure scenarios

### 3. Resource Management
- Clean up temporary resources across all environments
- Monitor resource usage across environment types
- Implement proper timeout and retry strategies

### 4. Security Considerations
- Use secure authentication methods for each environment
- Implement proper network security between environments
- Audit cross-environment operations

### 5. Monitoring and Observability
- Implement comprehensive logging across all environments
- Use distributed tracing for cross-environment operations
- Monitor performance and resource usage patterns

## Conclusion

Multi-target execution in @xec-sh/core enables sophisticated hybrid infrastructure patterns. By coordinating operations across local, SSH, Docker, and Kubernetes environments, you can build resilient, scalable systems that leverage the strengths of each environment type.

The key to successful multi-target operations is proper planning, robust error handling, and comprehensive monitoring across all environment types.