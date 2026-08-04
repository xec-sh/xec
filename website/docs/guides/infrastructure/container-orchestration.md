---
sidebar_position: 2
title: Container Orchestration
description: Managing Docker and Kubernetes deployments with Xec
---

# Container Orchestration

## Problem

Modern applications require complex container orchestration across Docker and Kubernetes environments. Manual container management leads to configuration drift, deployment failures, and difficulty scaling. Teams need unified tooling to manage containers consistently across development, staging, and production environments.

## Prerequisites

- Xec CLI installed (`npm install -g @xec-sh/cli`)
- Docker installed and running
- kubectl configured (for Kubernetes operations)
- Basic understanding of container concepts
- Access to target environments (local Docker or Kubernetes cluster)

## Solution

### Step 1: Docker Container Management

Create a unified container management script:

```javascript
#!/usr/bin/env xec

import { $, sleep } from '@xec-sh/core';

// Docker engine with connection reuse
const docker = $.docker();

// Container lifecycle management
class ContainerManager {
  constructor(name, image, options = {}) {
    this.name = name;
    this.image = image;
    this.options = options;
  }

  async deploy() {
    // Check if container exists
    const exists = await this.exists();
    
    if (exists) {
      console.log(`Updating container ${this.name}...`);
      await this.stop();
      await this.remove();
    }
    
    // Create and start new container
    await this.create();
    await this.start();
    await this.healthCheck();
  }

  async exists() {
    try {
      await docker.run`inspect ${this.name}`;
      return true;
    } catch {
      return false;
    }
  }

  async create() {
    const { ports = [], env = {}, volumes = [] } = this.options;
    
    let cmd = [`run -d --name ${this.name}`];
    
    // Add port mappings
    ports.forEach(p => cmd.push(`-p ${p}`));
    
    // Add environment variables
    Object.entries(env).forEach(([k, v]) => {
      cmd.push(`-e ${k}=${v}`);
    });
    
    // Add volume mounts
    volumes.forEach(v => cmd.push(`-v ${v}`));
    
    cmd.push(this.image);
    
    await docker.run`${cmd.join(' ')}`;
    console.log(`Created container ${this.name}`);
  }

  async start() {
    await docker.run`start ${this.name}`;
    console.log(`Started container ${this.name}`);
  }

  async stop() {
    await docker.run`stop ${this.name}`;
    console.log(`Stopped container ${this.name}`);
  }

  async remove() {
    await docker.run`rm ${this.name}`;
    console.log(`Removed container ${this.name}`);
  }

  async healthCheck() {
    const maxRetries = 30;
    let retries = 0;
    
    while (retries < maxRetries) {
      const health = await docker.run`inspect ${this.name} --format='{{.State.Health.Status}}'`.nothrow();
      
      if (health.stdout?.includes('healthy')) {
        console.log(`Container ${this.name} is healthy`);
        return true;
      }
      
      await sleep(1000);
      retries++;
    }
    
    throw new Error(`Container ${this.name} failed health check`);
  }
}

// Usage
const app = new ContainerManager('myapp', 'myapp:latest', {
  ports: ['8080:80'],
  env: { NODE_ENV: 'production' },
  volumes: ['./config:/app/config:ro']
});

await app.deploy();
```

### Step 2: Docker Compose Workflows

Manage multi-container applications:

```javascript
#!/usr/bin/env xec

import { $, sleep } from '@xec-sh/core';

// Docker Compose manager
const compose = $.docker().compose('docker-compose.yaml').withProject('myproject');

// Service orchestration
async function deployStack() {
  console.log('Deploying application stack...');
  
  // Build images
  await compose.build();
  
  // Start services in dependency order
  await compose.up();
  
  // Wait for services
  await waitForServices();
  
  // Run migrations
  await compose.exec('database', 'psql -U postgres -c "SELECT 1"');
  await compose.exec('app', 'npm run migrate');
  
  // Health checks
  await verifyDeployment();
}

async function waitForServices() {
  const services = ['database', 'redis', 'app'];
  
  for (const service of services) {
    console.log(`Waiting for ${service}...`);
    
    let ready = false;
    let attempts = 0;
    
    while (!ready && attempts < 30) {
      const state = await compose.ps();
      
      if (state.includes(service)) {
        ready = true;
        console.log(`✓ ${service} is running`);
      } else {
        await sleep(1000);
        attempts++;
      }
    }
    
    if (!ready) {
      throw new Error(`Service ${service} failed to start`);
    }
  }
}

async function verifyDeployment() {
  // docker compose ps marks services with a failing healthcheck as
  // "unhealthy" in its output
  const status = await compose.ps();
  
  if (status.includes('unhealthy')) {
    throw new Error(`Unhealthy services detected:\n${status}`);
  }
  
  console.log('✅ All services deployed successfully');
}

// Blue-green deployment
async function blueGreenDeploy() {
  const currentColor = await getCurrentColor();
  const newColor = currentColor === 'blue' ? 'green' : 'blue';
  
  console.log(`Deploying ${newColor} environment...`);
  
  // Deploy new version
  const newCompose = $.docker()
    .compose(`docker-compose.${newColor}.yaml`)
    .withProject(`myproject-${newColor}`);
  
  await newCompose.up(true, true);
  
  // Health check new deployment
  await verifyNewDeployment(newColor);
  
  // Switch traffic
  await switchTraffic(newColor);
  
  // Stop old version
  const oldCompose = $.docker()
    .compose(`docker-compose.${currentColor}.yaml`)
    .withProject(`myproject-${currentColor}`);
  
  await oldCompose.down();
  
  console.log(`✅ Switched from ${currentColor} to ${newColor}`);
}

// Execute deployment
await deployStack();
```

### Step 3: Kubernetes Deployments

Manage Kubernetes applications:

```javascript
#!/usr/bin/env xec

import { $, sleep } from '@xec-sh/core';

// Kubernetes deployment manager
//
// `$.k8s()` targets a specific pod for `kubectl exec` — it has no general
// cluster operations (apply, get, scale, rollout, ...). Those are plain
// kubectl subcommands, so this class runs them with `$` like any other
// local command and passes `-n <namespace>` itself.
class K8sDeployment {
  constructor(namespace = 'default') {
    this.namespace = namespace;
  }

  async deploy(manifest) {
    console.log(`Deploying to namespace ${this.namespace}...`);
    
    // Apply manifest
    await $`kubectl apply -f ${manifest} -n ${this.namespace}`;
    
    // Wait for rollout
    await this.waitForRollout();
    
    // Verify deployment
    await this.verifyPods();
  }

  async waitForRollout() {
    const deployments = await $`kubectl get deployments -n ${this.namespace} -o json`.json();
    const names = deployments.items.map(d => d.metadata.name);
    
    for (const name of names) {
      console.log(`Waiting for deployment ${name}...`);
      await $`kubectl rollout status deployment/${name} -n ${this.namespace} --timeout=300s`;
      console.log(`✓ Deployment ${name} ready`);
    }
  }

  async verifyPods() {
    const pods = await $`kubectl get pods -n ${this.namespace} -o json`.json();
    const podList = pods.items;
    
    const notReady = podList.filter(pod => {
      const conditions = pod.status.conditions || [];
      const ready = conditions.find(c => c.type === 'Ready');
      return !ready || ready.status !== 'True';
    });
    
    if (notReady.length > 0) {
      console.error('Pods not ready:', notReady.map(p => p.metadata.name));
      throw new Error('Some pods are not ready');
    }
    
    console.log(`✅ All ${podList.length} pods are ready`);
  }

  async scale(deployment, replicas) {
    console.log(`Scaling ${deployment} to ${replicas} replicas...`);
    await $`kubectl scale deployment/${deployment} -n ${this.namespace} --replicas=${replicas}`;
    await $`kubectl rollout status deployment/${deployment} -n ${this.namespace}`;
  }

  async rollback(deployment) {
    console.log(`Rolling back ${deployment}...`);
    await $`kubectl rollout undo deployment/${deployment} -n ${this.namespace}`;
    await $`kubectl rollout status deployment/${deployment} -n ${this.namespace}`;
  }

  async canaryDeploy(deployment, image, percentage = 10) {
    console.log(`Starting canary deployment (${percentage}%)...`);
    
    // Get current replicas
    const current = await $`kubectl get deployment ${deployment} -n ${this.namespace} -o jsonpath='{.spec.replicas}'`.text();
    const totalReplicas = parseInt(current);
    const canaryReplicas = Math.ceil(totalReplicas * percentage / 100);
    const stableReplicas = totalReplicas - canaryReplicas;
    
    // Create canary deployment
    const canaryName = `${deployment}-canary`;
    await $`kubectl create deployment ${canaryName} -n ${this.namespace} --image=${image} --replicas=${canaryReplicas}`;
    
    // Scale down stable deployment
    await this.scale(deployment, stableReplicas);
    
    // Monitor canary
    await this.monitorCanary(canaryName);
    
    // Promote or rollback
    const promote = await this.evaluateCanary(canaryName);
    
    if (promote) {
      await this.promoteCanary(deployment, canaryName, image);
    } else {
      await this.rollbackCanary(deployment, canaryName, totalReplicas);
    }
  }

  async monitorCanary(deployment) {
    console.log('Monitoring canary deployment...');
    
    // Check metrics (simplified example)
    for (let i = 0; i < 5; i++) {
      const pods = await $`kubectl get pods -n ${this.namespace} -l app=${deployment} -o json`.json();
      const podList = pods.items;
      
      for (const pod of podList) {
        const logs = await $`kubectl logs ${pod.metadata.name} -n ${this.namespace} --tail=10`.nothrow();
        if (logs.stderr || logs.stdout?.includes('ERROR')) {
          console.error(`Errors detected in ${pod.metadata.name}`);
          return false;
        }
      }
      
      await sleep(10000); // Wait 10 seconds between checks
    }
    
    return true;
  }

  async evaluateCanary(canaryName) {
    // In production, check real metrics
    const healthy = await this.monitorCanary(canaryName);
    return healthy;
  }

  async promoteCanary(deployment, canaryName, image) {
    console.log('Promoting canary to production...');
    
    // Update main deployment
    await $`kubectl set image deployment/${deployment} -n ${this.namespace} *=${image}`;
    await this.waitForRollout();
    
    // Delete canary
    await $`kubectl delete deployment ${canaryName} -n ${this.namespace}`;
    
    console.log('✅ Canary promoted successfully');
  }

  async rollbackCanary(deployment, canaryName, originalReplicas) {
    console.log('Rolling back canary deployment...');
    
    // Scale up stable
    await this.scale(deployment, originalReplicas);
    
    // Delete canary
    await $`kubectl delete deployment ${canaryName} -n ${this.namespace}`;
    
    console.log('⚠️ Canary rolled back');
  }
}

// Usage
const k8s = new K8sDeployment('production');
await k8s.deploy('manifests/app.yaml');
await k8s.canaryDeploy('myapp', 'myapp:v2.0.0', 20);
```

### Step 4: Hybrid Orchestration

Manage both Docker and Kubernetes:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class HybridOrchestrator {
  constructor(config) {
    this.config = config;
    this.docker = $.docker();
  }

  async deploy(environment) {
    console.log(`Deploying to ${environment}...`);
    
    switch (environment) {
      case 'local':
        await this.deployDocker();
        break;
      case 'staging':
        await this.deployDockerCompose();
        break;
      case 'production':
        await this.deployKubernetes();
        break;
      default:
        throw new Error(`Unknown environment: ${environment}`);
    }
  }

  async deployDocker() {
    console.log('Deploying to local Docker...');
    
    // Build image
    await this.docker.run`build -t ${this.config.image} .`;
    
    // Run container
    await this.docker.run`run -d --name ${this.config.name} -p ${this.config.port}:80 ${this.config.image}`;
  }

  async deployDockerCompose() {
    console.log('Deploying with Docker Compose...');
    
    const compose = $.docker().compose('docker-compose.staging.yaml');
    
    await compose.up(true, true);
  }

  async deployKubernetes() {
    console.log('Deploying to Kubernetes...');
    
    // Build and push image
    await this.buildAndPush();
    
    // Deploy to K8s — `$.k8s()` targets a pod for exec, so cluster-level
    // operations like apply/rollout go through kubectl directly
    await $`kubectl apply -f k8s/production/ -n ${this.config.k8sNamespace}`;
    await $`kubectl rollout status deployment/${this.config.name} -n ${this.config.k8sNamespace}`;
  }

  async buildAndPush() {
    const registry = this.config.registry;
    const tag = `${registry}/${this.config.image}:${await this.getVersion()}`;
    
    await this.docker.run`build -t ${tag} .`;
    await this.docker.run`push ${tag}`;
    
    // Update K8s deployment
    await $`kubectl set image deployment/${this.config.name} -n ${this.config.k8sNamespace} app=${tag}`;
  }

  async getVersion() {
    return $`git describe --tags --always`.text();
  }
}

// Configuration
const orchestrator = new HybridOrchestrator({
  name: 'myapp',
  image: 'myapp',
  registry: 'registry.example.com',
  port: '8080',
  k8sNamespace: 'production'
});

// Deploy based on environment
const env = process.argv[2] || 'local';
await orchestrator.deploy(env);
```

### Step 5: Container Registry Management

Handle container images and registries:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class RegistryManager {
  constructor(registry) {
    this.registry = registry;
    this.docker = $.docker();
  }

  async login(username, password) {
    await this.docker.run`login ${this.registry} -u ${username} -p ${password}`;
  }

  async tag(image, version) {
    const fullTag = `${this.registry}/${image}:${version}`;
    await this.docker.run`tag ${image}:latest ${fullTag}`;
    return fullTag;
  }

  async push(tag) {
    console.log(`Pushing ${tag}...`);
    await this.docker.run`push ${tag}`;
  }

  async pull(tag) {
    console.log(`Pulling ${tag}...`);
    await this.docker.run`pull ${tag}`;
  }

  async scan(image) {
    console.log(`Scanning ${image} for vulnerabilities...`);
    
    // Using trivy for scanning
    const report = await $`trivy image ${image}`.text();
    
    if (report.includes('CRITICAL')) {
      throw new Error('Critical vulnerabilities found');
    }
    
    console.log('✅ Image scan passed');
  }

  async cleanup() {
    console.log('Cleaning up unused images...');
    
    // Remove dangling images
    await this.docker.run`image prune -f`;
    
    // Remove old versions
    const imageList = await this.docker.run`images --format "{{.Repository}}:{{.Tag}}" | grep ${this.registry}`.lines();
    
    // Keep only last 5 versions
    const grouped = {};
    imageList.forEach(img => {
      const [repo] = img.split(':');
      if (!grouped[repo]) grouped[repo] = [];
      grouped[repo].push(img);
    });
    
    for (const [repo, versions] of Object.entries(grouped)) {
      if (versions.length > 5) {
        const toDelete = versions.slice(5);
        for (const img of toDelete) {
          await this.docker.run`rmi ${img}`.nothrow();
        }
      }
    }
  }
}

// Usage
const registry = new RegistryManager('registry.example.com');
await registry.login(process.env.REGISTRY_USER, process.env.REGISTRY_PASS);

const tag = await registry.tag('myapp', 'v1.2.3');
await registry.scan('myapp:latest');
await registry.push(tag);
await registry.cleanup();
```

## Best Practices

1. **Image Optimization**
   - Multi-stage builds for smaller images
   - Layer caching for faster builds
   - Security scanning before deployment
   - Use specific tags, not latest

2. **Resource Management**
   - Set resource limits and requests
   - Implement proper health checks
   - Use horizontal pod autoscaling
   - Monitor resource usage

3. **Configuration Management**
   - Externalize configuration
   - Use secrets for sensitive data
   - Version control manifests
   - Environment-specific configs

4. **Deployment Strategies**
   - Blue-green for zero downtime
   - Canary for gradual rollouts
   - Rolling updates for quick deployments
   - Feature flags for control

5. **Monitoring and Logging**
   - Centralized logging
   - Distributed tracing
   - Metrics collection
   - Alert on anomalies

## Common Pitfalls

1. **Missing Health Checks**
   - ❌ Deploying without health checks
   - ✅ Always define liveness and readiness probes

2. **Hardcoded Configuration**
   - ❌ Embedding secrets in images
   - ✅ Use environment variables or config maps

3. **Ignoring Resource Limits**
   - ❌ No resource constraints
   - ✅ Set appropriate CPU and memory limits

4. **Latest Tag Usage**
   - ❌ Using `image:latest` in production
   - ✅ Use specific version tags

5. **No Rollback Plan**
   - ❌ Deploying without rollback strategy
   - ✅ Keep previous versions available

## Troubleshooting

### Issue: Container Fails to Start
```javascript
// Debug container startup
await docker.run`logs ${containerName} --tail 50`;
await docker.run`inspect ${containerName}`;
await docker.run`exec ${containerName} env`;
```

### Issue: Pod Stuck in Pending
```bash
# Check pod events
kubectl describe pod <pod-name>

# Check node resources
kubectl top nodes

# Check PVC status
kubectl get pvc
```

### Issue: Image Pull Errors
```javascript
// Verify registry credentials
await docker.run`login ${registry}`;

// Check image exists
await docker.run`pull ${image}`;

// Verify K8s secret
await $`kubectl get secret docker-registry -o yaml`;
```

### Issue: Service Discovery Failing
```bash
# Check service endpoints
kubectl get endpoints

# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup service-name

# Check network policies
kubectl get networkpolicies
```

## Related Guides

- [Server Management](./server-management.md) - Managing server infrastructure
- [CI/CD Pipelines](../automation/ci-cd-pipelines.md) - Automated deployments
- [Dev Environments](../development/dev-environments.md) - Local container development