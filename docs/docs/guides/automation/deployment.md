---
sidebar_position: 3
title: Deployment Automation
description: Automate deployments across environments with Xec
---

# Deployment Automation

Master deployment automation with Xec's powerful execution engine. Learn to deploy applications reliably across local, remote, containerized, and cloud environments.

## Overview

Xec transforms deployment automation by providing:
- **Unified deployment API** across all environments
- **Built-in rollback** capabilities
- **Health checking** and verification
- **Zero-downtime** deployment strategies
- **Multi-environment** orchestration

## Basic Deployment Patterns

### Simple File-Based Deployment

```typescript
// deploy/simple-deploy.ts
import { $ } from '@xec-sh/core';
import { confirm } from '@clack/prompts';

async function simpleDeploy() {
  const server = $.ssh({
    host: 'app.example.com',
    username: 'deploy',
    privateKey: '~/.ssh/deploy_key'
  });
  
  console.log('📦 Starting deployment...');
  
  // Build locally
  await $`npm run build`;
  
  // Create deployment directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const deployDir = `/app/releases/${timestamp}`;
  
  await server`mkdir -p ${deployDir}`;
  
  // Upload files
  console.log('📤 Uploading files...');
  await $`rsync -avz --exclude=node_modules ./dist/ deploy@app.example.com:${deployDir}/`;
  
  // Update symlink
  console.log('🔗 Updating application link...');
  await server`ln -sfn ${deployDir} /app/current`;
  
  // Restart service
  console.log('🔄 Restarting service...');
  await server`sudo systemctl restart app`;
  
  // Verify
  console.log('✅ Verifying deployment...');
  await server`curl -f http://localhost:3000/health`;
  
  console.log('✅ Deployment completed successfully!');
}

await simpleDeploy();
```

### Git-Based Deployment

```typescript
// deploy/git-deploy.ts
import { $ } from '@xec-sh/core';

interface GitDeployConfig {
  repo: string;
  branch: string;
  deployPath: string;
  postDeploy?: string;
}

async function gitDeploy(config: GitDeployConfig) {
  const server = $.ssh({
    host: process.env.DEPLOY_HOST!,
    username: process.env.DEPLOY_USER!
  });
  
  console.log(`🌿 Deploying ${config.branch} to ${config.deployPath}`);
  
  // Check if repo exists
  const repoExists = await server`test -d ${config.deployPath}/.git`.nothrow();
  
  if (repoExists.ok) {
    // Pull latest changes
    console.log('📥 Pulling latest changes...');
    await server`cd ${config.deployPath} && git fetch origin`;
    await server`cd ${config.deployPath} && git reset --hard origin/${config.branch}`;
  } else {
    // Clone repository
    console.log('📋 Cloning repository...');
    await server`git clone -b ${config.branch} ${config.repo} ${config.deployPath}`;
  }
  
  // Install dependencies
  console.log('📦 Installing dependencies...');
  await server`cd ${config.deployPath} && npm ci --production`;
  
  // Run post-deploy script if provided
  if (config.postDeploy) {
    console.log('🔧 Running post-deploy script...');
    await server`cd ${config.deployPath} && ${config.postDeploy}`;
  }
  
  console.log('✅ Git deployment completed!');
}

// Usage
await gitDeploy({
  repo: 'git@github.com:example/app.git',
  branch: 'main',
  deployPath: '/app/production',
  postDeploy: 'npm run migrate && pm2 restart app'
});
```

## Zero-Downtime Deployments

### Blue-Green Deployment

```typescript
// deploy/blue-green.ts
import { $ } from '@xec-sh/core';

class BlueGreenDeployment {
  private currentColor: 'blue' | 'green' = 'blue';
  
  constructor(
    private server: any,
    private config: {
      bluePath: string;
      greenPath: string;
      linkPath: string;
      healthCheck: string;
    }
  ) {}
  
  async deploy() {
    // Determine current and target colors
    await this.detectCurrentColor();
    const targetColor = this.currentColor === 'blue' ? 'green' : 'blue';
    const targetPath = targetColor === 'blue' 
      ? this.config.bluePath 
      : this.config.greenPath;
    
    console.log(`🔄 Deploying to ${targetColor} environment`);
    
    // Deploy to inactive environment
    await this.deployToEnvironment(targetPath);
    
    // Health check new deployment
    await this.healthCheck(targetPath);
    
    // Switch traffic
    await this.switchTraffic(targetColor);
    
    // Verify switch
    await this.verifySwitch(targetColor);
    
    console.log(`✅ Successfully switched to ${targetColor}`);
    
    // Optional: cleanup old environment
    const cleanup = await confirm({
      message: 'Remove old deployment?'
    });
    
    if (cleanup) {
      await this.cleanupEnvironment(this.currentColor);
    }
  }
  
  private async detectCurrentColor() {
    const result = await this.server`readlink ${this.config.linkPath}`.nothrow();
    
    if (result.ok) {
      this.currentColor = result.stdout.includes('blue') ? 'blue' : 'green';
    }
    
    console.log(`📍 Current environment: ${this.currentColor}`);
  }
  
  private async deployToEnvironment(path: string) {
    console.log(`📦 Deploying to ${path}...`);
    
    // Clean and prepare directory
    await this.server`rm -rf ${path}`;
    await this.server`mkdir -p ${path}`;
    
    // Upload application
    await $`rsync -avz ./dist/ ${this.server.config.username}@${this.server.config.host}:${path}/`;
    
    // Install and build
    await this.server`cd ${path} && npm ci --production`;
    await this.server`cd ${path} && npm run migrate`;
  }
  
  private async healthCheck(path: string) {
    console.log('🏥 Running health checks...');
    
    // Start application in test mode
    await this.server`cd ${path} && PORT=3001 npm start &`;
    
    // Wait for startup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check health
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.server`curl -f http://localhost:3001${this.config.healthCheck}`.nothrow();
      
      if (result.ok) {
        console.log('✅ Health check passed');
        await this.server`pkill -f "PORT=3001"`;
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Health check failed');
  }
  
  private async switchTraffic(targetColor: 'blue' | 'green') {
    console.log(`🚦 Switching traffic to ${targetColor}...`);
    
    const targetPath = targetColor === 'blue' 
      ? this.config.bluePath 
      : this.config.greenPath;
    
    // Update symlink atomically
    await this.server`ln -sfn ${targetPath} ${this.config.linkPath}.tmp`;
    await this.server`mv -Tf ${this.config.linkPath}.tmp ${this.config.linkPath}`;
    
    // Reload web server
    await this.server`sudo nginx -s reload`;
  }
  
  private async verifySwitch(targetColor: string) {
    console.log('🔍 Verifying switch...');
    
    const result = await this.server`curl -s http://localhost/version`;
    
    if (!result.stdout.includes(targetColor)) {
      throw new Error('Switch verification failed');
    }
  }
  
  private async cleanupEnvironment(color: 'blue' | 'green') {
    const path = color === 'blue' 
      ? this.config.bluePath 
      : this.config.greenPath;
    
    console.log(`🧹 Cleaning up ${color} environment...`);
    await this.server`rm -rf ${path}`;
  }
}

// Usage
const server = $.ssh({
  host: 'prod.example.com',
  username: 'deploy'
});

const deployment = new BlueGreenDeployment(server, {
  bluePath: '/app/blue',
  greenPath: '/app/green',
  linkPath: '/app/current',
  healthCheck: '/health'
});

await deployment.deploy();
```

### Rolling Deployment

```typescript
// deploy/rolling-deploy.ts
import { $ } from '@xec-sh/core';

class RollingDeployment {
  constructor(
    private servers: string[],
    private config: {
      batchSize: number;
      healthCheck: string;
      gracePeriod: number;
    }
  ) {}
  
  async deploy() {
    console.log(`🎯 Starting rolling deployment to ${this.servers.length} servers`);
    
    const batches = this.createBatches();
    
    for (let i = 0; i < batches.length; i++) {
      console.log(`\n📦 Deploying batch ${i + 1}/${batches.length}`);
      
      await this.deployBatch(batches[i]);
      
      if (i < batches.length - 1) {
        console.log(`⏳ Waiting ${this.config.gracePeriod}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, this.config.gracePeriod * 1000));
      }
    }
    
    console.log('✅ Rolling deployment completed successfully!');
  }
  
  private createBatches(): string[][] {
    const batches: string[][] = [];
    
    for (let i = 0; i < this.servers.length; i += this.config.batchSize) {
      batches.push(this.servers.slice(i, i + this.config.batchSize));
    }
    
    return batches;
  }
  
  private async deployBatch(servers: string[]) {
    // Remove servers from load balancer
    await this.removeFromLoadBalancer(servers);
    
    // Deploy to servers in parallel
    await Promise.all(servers.map(server => this.deployToServer(server)));
    
    // Health check all servers
    await Promise.all(servers.map(server => this.healthCheckServer(server)));
    
    // Add back to load balancer
    await this.addToLoadBalancer(servers);
  }
  
  private async deployToServer(host: string) {
    console.log(`  📤 Deploying to ${host}...`);
    
    const server = $.ssh({
      host,
      username: 'deploy'
    });
    
    // Stop service
    await server`sudo systemctl stop app`;
    
    // Update code
    await $`rsync -avz ./dist/ deploy@${host}:/app/current/`;
    
    // Update dependencies
    await server`cd /app/current && npm ci --production`;
    
    // Run migrations
    await server`cd /app/current && npm run migrate`;
    
    // Start service
    await server`sudo systemctl start app`;
    
    console.log(`  ✅ ${host} deployed`);
  }
  
  private async healthCheckServer(host: string) {
    console.log(`  🏥 Health checking ${host}...`);
    
    const server = $.ssh({
      host,
      username: 'deploy'
    });
    
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const result = await server`curl -f http://localhost:3000${this.config.healthCheck}`.nothrow();
      
      if (result.ok) {
        console.log(`  ✅ ${host} healthy`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Health check failed for ${host}`);
  }
  
  private async removeFromLoadBalancer(servers: string[]) {
    console.log('  🔄 Removing from load balancer...');
    
    for (const server of servers) {
      await $`aws elb deregister-instances-from-load-balancer \
        --load-balancer-name prod-lb \
        --instances ${server}`;
    }
    
    // Wait for connections to drain
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  private async addToLoadBalancer(servers: string[]) {
    console.log('  🔄 Adding to load balancer...');
    
    for (const server of servers) {
      await $`aws elb register-instances-with-load-balancer \
        --load-balancer-name prod-lb \
        --instances ${server}`;
    }
  }
}

// Usage
const deployment = new RollingDeployment(
  ['prod1.example.com', 'prod2.example.com', 'prod3.example.com', 'prod4.example.com'],
  {
    batchSize: 2,
    healthCheck: '/health',
    gracePeriod: 60
  }
);

await deployment.deploy();
```

## Container Deployments

### Docker Deployment

```typescript
// deploy/docker-deploy.ts
import { $ } from '@xec-sh/core';

async function dockerDeploy() {
  const image = 'myapp:latest';
  const container = 'myapp-prod';
  const registry = 'registry.example.com';
  
  console.log('🐳 Starting Docker deployment...');
  
  // Build image
  console.log('🔨 Building Docker image...');
  await $`docker build -t ${image} .`;
  
  // Tag for registry
  await $`docker tag ${image} ${registry}/${image}`;
  
  // Push to registry
  console.log('📤 Pushing to registry...');
  await $`docker push ${registry}/${image}`;
  
  // Deploy to servers
  const servers = ['prod1.example.com', 'prod2.example.com'];
  
  for (const host of servers) {
    console.log(`\n🚀 Deploying to ${host}...`);
    
    const server = $.ssh({
      host,
      username: 'deploy'
    });
    
    // Pull latest image
    await server`docker pull ${registry}/${image}`;
    
    // Stop old container
    await server`docker stop ${container} || true`;
    await server`docker rm ${container} || true`;
    
    // Start new container
    await server`docker run -d \
      --name ${container} \
      --restart unless-stopped \
      -p 3000:3000 \
      -e NODE_ENV=production \
      -v /app/data:/data \
      ${registry}/${image}`;
    
    // Health check
    await server`docker exec ${container} curl -f http://localhost:3000/health`;
    
    console.log(`✅ ${host} deployment successful`);
  }
  
  console.log('\n✅ Docker deployment completed!');
}

await dockerDeploy();
```

### Docker Compose Deployment

```typescript
// deploy/compose-deploy.ts
import { $ } from '@xec-sh/core';

async function composeDeploy() {
  const server = $.ssh({
    host: 'prod.example.com',
    username: 'deploy'
  });
  
  console.log('🐳 Docker Compose deployment...');
  
  // Upload compose file
  await $`scp docker-compose.prod.yml deploy@prod.example.com:/app/docker-compose.yml`;
  
  // Upload environment file
  await $`scp .env.production deploy@prod.example.com:/app/.env`;
  
  // Pull latest images
  console.log('📥 Pulling latest images...');
  await server`cd /app && docker-compose pull`;
  
  // Deploy with zero downtime
  console.log('🔄 Starting new containers...');
  await server`cd /app && docker-compose up -d --no-deps --scale app=2 app`;
  
  // Wait for health
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Remove old containers
  await server`cd /app && docker-compose up -d --no-deps --remove-orphans app`;
  
  // Cleanup
  await server`docker system prune -f`;
  
  console.log('✅ Compose deployment complete!');
}

await composeDeploy();
```

### Kubernetes Deployment

```typescript
// deploy/k8s-deploy.ts
import { $ } from '@xec-sh/core';

class KubernetesDeployment {
  constructor(
    private namespace: string,
    private deployment: string
  ) {}
  
  async deploy(image: string) {
    console.log(`☸️ Deploying to Kubernetes...`);
    console.log(`📍 Namespace: ${this.namespace}`);
    console.log(`🚀 Deployment: ${this.deployment}`);
    console.log(`🐳 Image: ${image}`);
    
    // Update deployment image
    await this.updateImage(image);
    
    // Monitor rollout
    await this.monitorRollout();
    
    // Verify deployment
    await this.verifyDeployment();
    
    console.log('✅ Kubernetes deployment successful!');
  }
  
  private async updateImage(image: string) {
    console.log('📦 Updating deployment image...');
    
    await $`kubectl set image deployment/${this.deployment} \
      ${this.deployment}=${image} \
      -n ${this.namespace} \
      --record`;
  }
  
  private async monitorRollout() {
    console.log('⏳ Monitoring rollout...');
    
    const result = await $`kubectl rollout status \
      deployment/${this.deployment} \
      -n ${this.namespace} \
      --timeout=10m`.nothrow();
    
    if (!result.ok) {
      console.error('❌ Rollout failed, initiating rollback...');
      await this.rollback();
      throw new Error('Deployment failed and was rolled back');
    }
  }
  
  private async rollback() {
    await $`kubectl rollout undo \
      deployment/${this.deployment} \
      -n ${this.namespace}`;
    
    await $`kubectl rollout status \
      deployment/${this.deployment} \
      -n ${this.namespace} \
      --timeout=5m`;
  }
  
  private async verifyDeployment() {
    console.log('🔍 Verifying deployment...');
    
    // Check pod status
    const pods = await $`kubectl get pods \
      -n ${this.namespace} \
      -l app=${this.deployment} \
      -o json`;
    
    const podData = JSON.parse(pods.stdout);
    const runningPods = podData.items.filter(
      pod => pod.status.phase === 'Running'
    );
    
    if (runningPods.length === 0) {
      throw new Error('No running pods found');
    }
    
    console.log(`✅ ${runningPods.length} pods running`);
    
    // Run smoke test
    const testPod = runningPods[0].metadata.name;
    const k8s = $.k8s({
      pod: testPod,
      namespace: this.namespace
    });
    
    await k8s`curl -f http://localhost:3000/health`;
    console.log('✅ Health check passed');
  }
}

// Usage
const deployment = new KubernetesDeployment('production', 'myapp');
await deployment.deploy('myapp:v1.2.3');
```

## Cloud Platform Deployments

### AWS ECS Deployment

```typescript
// deploy/aws-ecs.ts
import { $ } from '@xec-sh/core';

async function ecsD
eploy() {
  const cluster = 'prod-cluster';
  const service = 'myapp-service';
  const taskDefinition = 'myapp-task';
  const image = 'myapp:latest';
  
  console.log('☁️ AWS ECS Deployment');
  
  // Build and push to ECR
  console.log('🔨 Building image...');
  await $`docker build -t ${image} .`;
  
  // Get ECR login
  await $`aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin \
    123456789.dkr.ecr.us-east-1.amazonaws.com`;
  
  // Tag and push
  const ecrImage = `123456789.dkr.ecr.us-east-1.amazonaws.com/${image}`;
  await $`docker tag ${image} ${ecrImage}`;
  await $`docker push ${ecrImage}`;
  
  // Update task definition
  console.log('📝 Updating task definition...');
  const taskDef = await $`aws ecs describe-task-definition \
    --task-definition ${taskDefinition} \
    --query 'taskDefinition' \
    --output json`;
  
  const newTaskDef = JSON.parse(taskDef.stdout);
  newTaskDef.containerDefinitions[0].image = ecrImage;
  delete newTaskDef.taskDefinitionArn;
  delete newTaskDef.revision;
  delete newTaskDef.status;
  delete newTaskDef.requiresAttributes;
  delete newTaskDef.compatibilities;
  delete newTaskDef.registeredAt;
  delete newTaskDef.registeredBy;
  
  await $`echo '${JSON.stringify(newTaskDef)}' | \
    aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin`;
  
  // Update service
  console.log('🔄 Updating service...');
  await $`aws ecs update-service \
    --cluster ${cluster} \
    --service ${service} \
    --task-definition ${taskDefinition}`;
  
  // Wait for deployment
  console.log('⏳ Waiting for deployment...');
  await $`aws ecs wait services-stable \
    --cluster ${cluster} \
    --services ${service}`;
  
  console.log('✅ ECS deployment complete!');
}

await ecsDeploy();
```

### Google Cloud Run Deployment

```typescript
// deploy/gcloud-run.ts
import { $ } from '@xec-sh/core';

async function cloudRunDeploy() {
  const project = 'my-project';
  const service = 'myapp';
  const region = 'us-central1';
  const image = `gcr.io/${project}/${service}`;
  
  console.log('☁️ Google Cloud Run Deployment');
  
  // Build with Cloud Build
  console.log('🔨 Building with Cloud Build...');
  await $`gcloud builds submit \
    --tag ${image} \
    --project ${project}`;
  
  // Deploy to Cloud Run
  console.log('🚀 Deploying to Cloud Run...');
  await $`gcloud run deploy ${service} \
    --image ${image} \
    --platform managed \
    --region ${region} \
    --project ${project} \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 10 \
    --min-instances 1`;
  
  // Get service URL
  const url = await $`gcloud run services describe ${service} \
    --platform managed \
    --region ${region} \
    --project ${project} \
    --format 'value(status.url)'`;
  
  console.log(`✅ Deployed to: ${url.stdout.trim()}`);
  
  // Verify deployment
  const health = await $`curl -f ${url.stdout.trim()}/health`;
  console.log('✅ Health check passed');
}

await cloudRunDeploy();
```

### Azure App Service Deployment

```typescript
// deploy/azure-app.ts
import { $ } from '@xec-sh/core';

async function azureAppDeploy() {
  const resourceGroup = 'myapp-rg';
  const appName = 'myapp-prod';
  const plan = 'myapp-plan';
  
  console.log('☁️ Azure App Service Deployment');
  
  // Build application
  console.log('🔨 Building application...');
  await $`npm run build`;
  
  // Create deployment package
  await $`zip -r deploy.zip . -x "*.git*" -x "node_modules/*"`;
  
  // Deploy to Azure
  console.log('🚀 Deploying to Azure...');
  await $`az webapp deployment source config-zip \
    --resource-group ${resourceGroup} \
    --name ${appName} \
    --src deploy.zip`;
  
  // Restart app
  await $`az webapp restart \
    --resource-group ${resourceGroup} \
    --name ${appName}`;
  
  // Wait for startup
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Verify deployment
  const url = await $`az webapp show \
    --resource-group ${resourceGroup} \
    --name ${appName} \
    --query defaultHostName \
    --output tsv`;
  
  const health = await $`curl -f https://${url.stdout.trim()}/health`;
  console.log('✅ Azure deployment complete!');
  
  // Cleanup
  await $`rm deploy.zip`;
}

await azureAppDeploy();
```

## Deployment Strategies

### Canary Deployment

```typescript
// deploy/canary.ts
import { $ } from '@xec-sh/core';

class CanaryDeployment {
  constructor(
    private config: {
      service: string;
      newVersion: string;
      stages: Array<{
        percentage: number;
        duration: number;
        metrics: string[];
      }>;
    }
  ) {}
  
  async deploy() {
    console.log(`🐤 Starting canary deployment of ${this.config.newVersion}`);
    
    for (const stage of this.config.stages) {
      console.log(`\n📊 Stage: ${stage.percentage}% traffic`);
      
      // Update traffic split
      await this.updateTrafficSplit(stage.percentage);
      
      // Monitor metrics
      const success = await this.monitorMetrics(stage);
      
      if (!success) {
        console.error('❌ Canary failed, rolling back...');
        await this.rollback();
        throw new Error('Canary deployment failed');
      }
      
      console.log(`✅ Stage ${stage.percentage}% successful`);
    }
    
    // Full rollout
    await this.updateTrafficSplit(100);
    console.log('✅ Canary deployment complete!');
  }
  
  private async updateTrafficSplit(percentage: number) {
    console.log(`🔄 Routing ${percentage}% traffic to new version...`);
    
    await $`kubectl patch virtualservice ${this.config.service} \
      --type merge \
      -p '{"spec":{"http":[{"route":[
        {"destination":{"host":"${this.config.service}","subset":"stable"},"weight":${100 - percentage}},
        {"destination":{"host":"${this.config.service}","subset":"canary"},"weight":${percentage}}
      ]}]}}'`;
  }
  
  private async monitorMetrics(stage: any): Promise<boolean> {
    console.log(`📈 Monitoring for ${stage.duration} minutes...`);
    
    const startTime = Date.now();
    const endTime = startTime + stage.duration * 60 * 1000;
    
    while (Date.now() < endTime) {
      for (const metric of stage.metrics) {
        const result = await this.checkMetric(metric);
        
        if (!result) {
          console.error(`❌ Metric ${metric} failed`);
          return false;
        }
      }
      
      // Check every 30 seconds
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    return true;
  }
  
  private async checkMetric(metric: string): Promise<boolean> {
    // Query Prometheus for metric
    const query = encodeURIComponent(`rate(http_requests_total{status=~"5.."}[5m])`);
    const result = await $`curl -s http://prometheus:9090/api/v1/query?query=${query}`;
    
    const data = JSON.parse(result.stdout);
    const errorRate = parseFloat(data.data.result[0]?.value[1] || '0');
    
    // Fail if error rate > 1%
    return errorRate < 0.01;
  }
  
  private async rollback() {
    await this.updateTrafficSplit(0);
    await $`kubectl delete deployment ${this.config.service}-canary`;
  }
}

// Usage
const canary = new CanaryDeployment({
  service: 'myapp',
  newVersion: 'v2.0.0',
  stages: [
    { percentage: 10, duration: 5, metrics: ['error_rate', 'latency'] },
    { percentage: 25, duration: 10, metrics: ['error_rate', 'latency'] },
    { percentage: 50, duration: 15, metrics: ['error_rate', 'latency'] },
    { percentage: 75, duration: 10, metrics: ['error_rate', 'latency'] }
  ]
});

await canary.deploy();
```

### Feature Flag Deployment

```typescript
// deploy/feature-flag.ts
import { $ } from '@xec-sh/core';

async function featureFlagDeploy() {
  const feature = 'new-checkout-flow';
  const percentage = process.env.ROLLOUT_PERCENTAGE || '10';
  
  console.log(`🚩 Deploying with feature flag: ${feature}`);
  
  // Deploy new code (feature is behind flag)
  await $`npm run deploy:production`;
  
  // Gradually enable feature
  const stages = [10, 25, 50, 75, 100];
  
  for (const percent of stages) {
    console.log(`\n📊 Enabling for ${percent}% of users...`);
    
    // Update feature flag
    await $`curl -X PATCH https://flags.example.com/api/flags/${feature} \
      -H "Authorization: Bearer $FLAG_API_KEY" \
      -d '{"percentage": ${percent}}'`;
    
    // Monitor metrics
    console.log('📈 Monitoring metrics...');
    await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
    
    // Check error rates
    const metrics = await $`curl https://metrics.example.com/api/errors?feature=${feature}`;
    const errorRate = JSON.parse(metrics.stdout).error_rate;
    
    if (errorRate > 0.01) {
      console.error('❌ High error rate detected, disabling feature...');
      
      await $`curl -X PATCH https://flags.example.com/api/flags/${feature} \
        -H "Authorization: Bearer $FLAG_API_KEY" \
        -d '{"enabled": false}'`;
      
      throw new Error('Feature deployment failed');
    }
    
    console.log(`✅ ${percent}% rollout successful`);
  }
  
  console.log('✅ Feature fully deployed!');
}

await featureFlagDeploy();
```

## Rollback Strategies

### Automated Rollback

```typescript
// deploy/auto-rollback.ts
import { $ } from '@xec-sh/core';

class AutoRollbackDeployment {
  private previousVersion?: string;
  private deployed = false;
  
  constructor(
    private config: {
      service: string;
      version: string;
      healthEndpoint: string;
      metricsEndpoint: string;
      rollbackThreshold: {
        errorRate: number;
        responseTime: number;
      };
    }
  ) {}
  
  async deploy() {
    try {
      // Store current version
      await this.saveCurrentVersion();
      
      // Deploy new version
      await this.deployNewVersion();
      this.deployed = true;
      
      // Monitor for issues
      await this.monitorDeployment();
      
      console.log('✅ Deployment successful!');
    } catch (error) {
      if (this.deployed) {
        await this.performRollback();
      }
      throw error;
    }
  }
  
  private async saveCurrentVersion() {
    const result = await $`kubectl get deployment ${this.config.service} \
      -o jsonpath='{.spec.template.spec.containers[0].image}'`;
    
    this.previousVersion = result.stdout.trim();
    console.log(`📌 Current version: ${this.previousVersion}`);
  }
  
  private async deployNewVersion() {
    console.log(`🚀 Deploying ${this.config.version}...`);
    
    await $`kubectl set image deployment/${this.config.service} \
      ${this.config.service}=${this.config.version}`;
    
    await $`kubectl rollout status deployment/${this.config.service} \
      --timeout=5m`;
  }
  
  private async monitorDeployment() {
    console.log('📊 Monitoring deployment health...');
    
    const monitoringDuration = 10 * 60 * 1000; // 10 minutes
    const checkInterval = 30 * 1000; // 30 seconds
    const endTime = Date.now() + monitoringDuration;
    
    while (Date.now() < endTime) {
      // Check health
      const healthOk = await this.checkHealth();
      if (!healthOk) {
        throw new Error('Health check failed');
      }
      
      // Check metrics
      const metricsOk = await this.checkMetrics();
      if (!metricsOk) {
        throw new Error('Metrics threshold exceeded');
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  private async checkHealth(): Promise<boolean> {
    const result = await $`curl -f ${this.config.healthEndpoint}`.nothrow();
    return result.ok;
  }
  
  private async checkMetrics(): Promise<boolean> {
    const metrics = await $`curl ${this.config.metricsEndpoint}`;
    const data = JSON.parse(metrics.stdout);
    
    const errorRate = data.error_rate || 0;
    const responseTime = data.response_time || 0;
    
    if (errorRate > this.config.rollbackThreshold.errorRate) {
      console.error(`❌ Error rate ${errorRate} exceeds threshold`);
      return false;
    }
    
    if (responseTime > this.config.rollbackThreshold.responseTime) {
      console.error(`❌ Response time ${responseTime}ms exceeds threshold`);
      return false;
    }
    
    return true;
  }
  
  private async performRollback() {
    console.log('⏪ Performing automatic rollback...');
    
    if (!this.previousVersion) {
      throw new Error('No previous version to rollback to');
    }
    
    await $`kubectl set image deployment/${this.config.service} \
      ${this.config.service}=${this.previousVersion}`;
    
    await $`kubectl rollout status deployment/${this.config.service} \
      --timeout=5m`;
    
    console.log('✅ Rollback completed');
  }
}

// Usage
const deployment = new AutoRollbackDeployment({
  service: 'myapp',
  version: 'myapp:v2.0.0',
  healthEndpoint: 'http://myapp.example.com/health',
  metricsEndpoint: 'http://metrics.example.com/api/myapp',
  rollbackThreshold: {
    errorRate: 0.01,  // 1% error rate
    responseTime: 1000  // 1 second
  }
});

await deployment.deploy();
```

## Deployment Configuration

### Environment-Based Config

```typescript
// deploy/config.ts
interface DeploymentConfig {
  environment: string;
  host: string;
  deployPath: string;
  buildCommand: string;
  startCommand: string;
  healthCheck: string;
  rollbackEnabled: boolean;
}

const configs: Record<string, DeploymentConfig> = {
  development: {
    environment: 'development',
    host: 'dev.example.com',
    deployPath: '/app/dev',
    buildCommand: 'npm run build:dev',
    startCommand: 'npm run dev',
    healthCheck: '/health',
    rollbackEnabled: false
  },
  staging: {
    environment: 'staging',
    host: 'staging.example.com',
    deployPath: '/app/staging',
    buildCommand: 'npm run build:staging',
    startCommand: 'npm run start',
    healthCheck: '/health',
    rollbackEnabled: true
  },
  production: {
    environment: 'production',
    host: 'prod.example.com',
    deployPath: '/app/production',
    buildCommand: 'npm run build:prod',
    startCommand: 'npm run start',
    healthCheck: '/health',
    rollbackEnabled: true
  }
};

export function getDeployConfig(env: string): DeploymentConfig {
  const config = configs[env];
  
  if (!config) {
    throw new Error(`Unknown environment: ${env}`);
  }
  
  return config;
}

// Usage in deployment script
const env = process.env.DEPLOY_ENV || 'staging';
const config = getDeployConfig(env);

const server = $.ssh({
  host: config.host,
  username: 'deploy'
});

await $`${config.buildCommand}`;
await server`cd ${config.deployPath} && ${config.startCommand}`;
```

## Best Practices

### 1. Pre-Deployment Checks

```typescript
async function preDeploymentChecks() {
  console.log('🔍 Running pre-deployment checks...');
  
  // Check git status
  const gitStatus = await $`git status --porcelain`;
  if (gitStatus.stdout.trim()) {
    throw new Error('Uncommitted changes detected');
  }
  
  // Run tests
  await $`npm test`;
  
  // Check dependencies
  await $`npm audit --audit-level=high`;
  
  // Verify build
  await $`npm run build`;
  
  console.log('✅ Pre-deployment checks passed');
}
```

### 2. Deployment Notifications

```typescript
async function notifyDeployment(status: 'started' | 'success' | 'failed', details?: any) {
  const webhook = process.env.SLACK_WEBHOOK;
  
  if (!webhook) return;
  
  const message = {
    started: '🚀 Deployment started',
    success: '✅ Deployment successful',
    failed: '❌ Deployment failed'
  };
  
  await $`curl -X POST ${webhook} \
    -H 'Content-Type: application/json' \
    -d '{"text": "${message[status]}", "details": ${JSON.stringify(details)}}'`;
}
```

### 3. Deployment Logging

```typescript
class DeploymentLogger {
  private logs: any[] = [];
  
  log(level: string, message: string, data?: any) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.logs.push(entry);
    console.log(`[${level}] ${message}`);
  }
  
  async save() {
    const filename = `deploy-${Date.now()}.log`;
    await $`echo '${JSON.stringify(this.logs, null, 2)}' > logs/${filename}`;
  }
}
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```typescript
   // Ensure deploy user has necessary permissions
   await server`sudo -n true 2>/dev/null || echo "Need sudo access"`;
   ```

2. **Port Already in Use**
   ```typescript
   // Kill process using port
   await server`fuser -k 3000/tcp || true`;
   ```

3. **Disk Space Issues**
   ```typescript
   // Clean up old deployments
   await server`find /app/releases -maxdepth 1 -mtime +30 -exec rm -rf {} \\;`;
   ```

## Next Steps

- Explore [test automation](./testing.md)
- Learn about [server management](../infrastructure/server-management.md)
- Master [container orchestration](../infrastructure/container-orchestration.md)
- Implement [error handling](../advanced/error-handling.md)

## Summary

You've learned how to:
- ✅ Implement basic file and Git-based deployments
- ✅ Create zero-downtime deployment strategies
- ✅ Deploy to containers and Kubernetes
- ✅ Implement canary and feature flag deployments
- ✅ Set up automatic rollback mechanisms
- ✅ Deploy to cloud platforms
- ✅ Monitor and log deployments

Continue to [test automation](./testing.md) to learn about automating your test suite.