---
sidebar_position: 2
title: Building CI/CD Pipelines
description: Create powerful CI/CD pipelines with Xec's execution engine
---

# Building CI/CD Pipelines

Learn how to leverage Xec's universal execution capabilities to build robust CI/CD pipelines that work across local development, staging, and production environments.

## Why Xec for CI/CD?

Traditional CI/CD tools often require separate configurations for different environments. Xec provides:

- **Unified API**: Same code works locally and in CI/CD systems
- **Environment Abstraction**: Seamlessly switch between local, SSH, Docker, and Kubernetes
- **Native TypeScript**: Type-safe pipeline definitions
- **Parallel Execution**: Built-in support for concurrent tasks
- **Error Recovery**: Robust error handling with retry capabilities

## Basic Pipeline Structure

### Simple Build Pipeline

```typescript
// pipelines/build.ts
import { $ } from '@xec-sh/core';

export async function buildPipeline() {
  const startTime = Date.now();
  
  try {
    // Stage 1: Validate
    console.log('🔍 Stage 1: Validation');
    await $`npm run lint`;
    await $`npm run type-check`;
    
    // Stage 2: Test
    console.log('🧪 Stage 2: Testing');
    await $`npm test`;
    
    // Stage 3: Build
    console.log('🔨 Stage 3: Building');
    await $`npm run build`;
    
    // Stage 4: Package
    console.log('📦 Stage 4: Packaging');
    await $`npm pack`;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Pipeline completed in ${duration}s`);
    
    return { success: true, duration };
  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await buildPipeline();
}
```

### Pipeline with Stages

```typescript
// pipelines/staged-pipeline.ts
import { $ } from '@xec-sh/core';

interface Stage {
  name: string;
  parallel?: boolean;
  tasks: Array<() => Promise<any>>;
}

class Pipeline {
  private stages: Stage[] = [];
  private results: Map<string, any> = new Map();
  
  addStage(name: string, tasks: Array<() => Promise<any>>, parallel = false) {
    this.stages.push({ name, tasks, parallel });
    return this;
  }
  
  async run() {
    for (const stage of this.stages) {
      console.log(`\n🎯 Stage: ${stage.name}`);
      console.log('─'.repeat(40));
      
      try {
        if (stage.parallel) {
          // Run tasks in parallel
          const results = await Promise.all(stage.tasks.map(task => task()));
          this.results.set(stage.name, results);
        } else {
          // Run tasks sequentially
          const results = [];
          for (const task of stage.tasks) {
            results.push(await task());
          }
          this.results.set(stage.name, results);
        }
        
        console.log(`✅ ${stage.name} completed`);
      } catch (error) {
        console.error(`❌ ${stage.name} failed:`, error.message);
        throw new Error(`Pipeline failed at stage: ${stage.name}`);
      }
    }
    
    return this.results;
  }
}

// Example usage
const pipeline = new Pipeline();

pipeline
  .addStage('Validation', [
    () => $`npm run lint`,
    () => $`npm run type-check`
  ], true)  // Run in parallel
  .addStage('Test', [
    () => $`npm run test:unit`,
    () => $`npm run test:integration`
  ])
  .addStage('Build', [
    () => $`npm run build:prod`
  ])
  .addStage('Deploy', [
    () => $`npm run deploy:staging`
  ]);

await pipeline.run();
```

## GitHub Actions Integration

### Xec-Powered GitHub Action

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install Xec
        run: npm install -g @xec-sh/cli
        
      - name: Install dependencies
        run: npm ci
        
      - name: Run CI Pipeline
        run: xec run pipelines/ci.ts
        env:
          NODE_ENV: ci
          CI: true
```

### CI Pipeline Script

```typescript
// pipelines/ci.ts
import { $ } from '@xec-sh/core';

async function ciPipeline() {
  const isCI = process.env.CI === 'true';
  const branch = process.env.GITHUB_REF_NAME || 'local';
  
  console.log(`🚀 Running CI Pipeline`);
  console.log(`📍 Branch: ${branch}`);
  console.log(`🏗️ Environment: ${isCI ? 'CI' : 'Local'}`);
  
  // Parallel validation
  console.log('\n📋 Running validations...');
  await Promise.all([
    $`npm run lint`,
    $`npm run type-check`,
    $`npm audit --audit-level=moderate`
  ]);
  
  // Run tests with coverage
  console.log('\n🧪 Running tests...');
  const coverage = await $`npm run test:coverage`;
  
  // Parse coverage results
  const coverageMatch = coverage.stdout.match(/Lines\s+:\s+(\d+\.?\d*)%/);
  const coveragePercent = coverageMatch ? parseFloat(coverageMatch[1]) : 0;
  
  if (coveragePercent < 80) {
    throw new Error(`Coverage ${coveragePercent}% is below threshold (80%)`);
  }
  
  // Build artifacts
  console.log('\n🔨 Building artifacts...');
  await $`npm run build`;
  
  // Upload artifacts if in CI
  if (isCI) {
    console.log('\n📤 Uploading artifacts...');
    await $`tar -czf dist.tar.gz dist/`;
    // GitHub Actions will handle artifact upload
  }
  
  console.log('\n✅ CI Pipeline completed successfully!');
}

await ciPipeline();
```

## Multi-Environment Deployments

### Progressive Deployment Pipeline

```typescript
// pipelines/deploy.ts
import { $ } from '@xec-sh/core';
import { confirm } from '@clack/prompts';

interface Environment {
  name: string;
  target: any;  // Xec execution context
  healthCheck: string;
  rollback?: () => Promise<void>;
}

class DeploymentPipeline {
  private environments: Environment[] = [];
  private deployedVersions: Map<string, string> = new Map();
  
  constructor(private version: string) {}
  
  addEnvironment(env: Environment) {
    this.environments.push(env);
    return this;
  }
  
  async deploy() {
    for (const env of this.environments) {
      console.log(`\n🚀 Deploying to ${env.name}`);
      
      try {
        // Store current version for rollback
        const currentVersion = await this.getCurrentVersion(env);
        this.deployedVersions.set(env.name, currentVersion);
        
        // Deploy new version
        await this.deployToEnvironment(env);
        
        // Health check
        await this.performHealthCheck(env);
        
        // Smoke tests
        await this.runSmokeTests(env);
        
        console.log(`✅ Successfully deployed to ${env.name}`);
        
        // Ask for confirmation before next environment
        if (env !== this.environments[this.environments.length - 1]) {
          const proceed = await confirm({
            message: `Continue to next environment?`
          });
          
          if (!proceed) {
            console.log('Deployment halted by user');
            break;
          }
        }
      } catch (error) {
        console.error(`❌ Deployment to ${env.name} failed:`, error.message);
        
        if (env.rollback) {
          console.log(`⏪ Rolling back ${env.name}...`);
          await env.rollback();
        }
        
        throw error;
      }
    }
  }
  
  private async getCurrentVersion(env: Environment) {
    const result = await env.target`cat version.txt`.nothrow();
    return result.ok ? result.stdout.trim() : 'unknown';
  }
  
  private async deployToEnvironment(env: Environment) {
    // Upload new version
    await env.target`mkdir -p /app/releases/${this.version}`;
    await $`rsync -av ./dist/ ${env.name}:/app/releases/${this.version}/`;
    
    // Update symlink
    await env.target`ln -sfn /app/releases/${this.version} /app/current`;
    
    // Restart service
    await env.target`systemctl restart app`;
    
    // Wait for startup
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  private async performHealthCheck(env: Environment) {
    const maxAttempts = 30;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const result = await env.target`curl -f ${env.healthCheck}`.nothrow();
      
      if (result.ok) {
        return;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Health check failed after ${maxAttempts} attempts`);
  }
  
  private async runSmokeTests(env: Environment) {
    await env.target`npm run test:smoke`;
  }
}

// Configure deployment
const version = process.env.VERSION || 'latest';

const deployment = new DeploymentPipeline(version);

// Add environments
deployment
  .addEnvironment({
    name: 'staging',
    target: $.ssh({
      host: 'staging.example.com',
      username: 'deploy'
    }),
    healthCheck: 'http://localhost:3000/health',
    rollback: async () => {
      const staging = $.ssh({
        host: 'staging.example.com',
        username: 'deploy'
      });
      await staging`ln -sfn /app/releases/previous /app/current`;
      await staging`systemctl restart app`;
    }
  })
  .addEnvironment({
    name: 'production',
    target: $.ssh({
      host: 'prod.example.com',
      username: 'deploy'
    }),
    healthCheck: 'http://localhost:3000/health'
  });

await deployment.deploy();
```

## Docker-Based CI/CD

### Building and Testing in Containers

```typescript
// pipelines/docker-ci.ts
import { $ } from '@xec-sh/core';

async function dockerCI() {
  const imageName = 'myapp';
  const version = process.env.VERSION || 'latest';
  
  console.log('🐳 Docker CI Pipeline');
  
  // Build stages
  const stages = [
    {
      name: 'build',
      dockerfile: 'Dockerfile',
      target: 'builder',
      tag: `${imageName}:build-${version}`
    },
    {
      name: 'test',
      dockerfile: 'Dockerfile',
      target: 'tester',
      tag: `${imageName}:test-${version}`
    },
    {
      name: 'production',
      dockerfile: 'Dockerfile',
      target: 'production',
      tag: `${imageName}:${version}`
    }
  ];
  
  for (const stage of stages) {
    console.log(`\n🔨 Building stage: ${stage.name}`);
    
    await $`docker build \
      --target ${stage.target} \
      --tag ${stage.tag} \
      --build-arg VERSION=${version} \
      .`;
  }
  
  // Run tests in container
  console.log('\n🧪 Running tests in container...');
  const testContainer = $.docker({
    image: `${imageName}:test-${version}`,
    rm: true,
    env: {
      NODE_ENV: 'test',
      CI: 'true'
    }
  });
  
  await testContainer`npm test`;
  await testContainer`npm run test:integration`;
  
  // Security scanning
  console.log('\n🔒 Running security scan...');
  await $`docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image ${imageName}:${version}`;
  
  // Push to registry
  if (process.env.CI === 'true') {
    console.log('\n📤 Pushing to registry...');
    const registry = process.env.DOCKER_REGISTRY || 'docker.io';
    
    await $`docker tag ${imageName}:${version} ${registry}/${imageName}:${version}`;
    await $`docker push ${registry}/${imageName}:${version}`;
    
    // Also tag as latest for main branch
    if (process.env.GITHUB_REF === 'refs/heads/main') {
      await $`docker tag ${imageName}:${version} ${registry}/${imageName}:latest`;
      await $`docker push ${registry}/${imageName}:latest`;
    }
  }
  
  console.log('✅ Docker CI completed successfully');
}

await dockerCI();
```

### Kubernetes Deployment Pipeline

```typescript
// pipelines/k8s-deploy.ts
import { $ } from '@xec-sh/core';

async function k8sDeploy() {
  const namespace = process.env.K8S_NAMESPACE || 'default';
  const deployment = process.env.K8S_DEPLOYMENT || 'myapp';
  const image = process.env.DOCKER_IMAGE || 'myapp:latest';
  
  console.log('☸️ Kubernetes Deployment Pipeline');
  console.log(`📍 Namespace: ${namespace}`);
  console.log(`🚀 Deployment: ${deployment}`);
  console.log(`🐳 Image: ${image}`);
  
  // Check cluster connection
  console.log('\n🔍 Checking cluster connection...');
  await $`kubectl cluster-info`;
  
  // Update deployment
  console.log('\n📦 Updating deployment...');
  await $`kubectl set image deployment/${deployment} \
    ${deployment}=${image} \
    -n ${namespace} \
    --record`;
  
  // Wait for rollout
  console.log('\n⏳ Waiting for rollout...');
  const rolloutResult = await $`kubectl rollout status \
    deployment/${deployment} \
    -n ${namespace} \
    --timeout=5m`.nothrow();
  
  if (!rolloutResult.ok) {
    console.error('❌ Rollout failed, initiating rollback...');
    await $`kubectl rollout undo deployment/${deployment} -n ${namespace}`;
    throw new Error('Deployment failed and was rolled back');
  }
  
  // Verify deployment
  console.log('\n✅ Verifying deployment...');
  const pods = await $`kubectl get pods \
    -n ${namespace} \
    -l app=${deployment} \
    -o json`;
  
  const podData = JSON.parse(pods.stdout);
  const readyPods = podData.items.filter(
    pod => pod.status.phase === 'Running'
  ).length;
  
  console.log(`✅ ${readyPods}/${podData.items.length} pods running`);
  
  // Run smoke tests
  console.log('\n🧪 Running smoke tests...');
  const testPod = podData.items[0]?.metadata?.name;
  
  if (testPod) {
    const k8s = $.k8s({
      pod: testPod,
      namespace,
      container: deployment
    });
    
    await k8s`curl -f http://localhost:3000/health`;
    console.log('✅ Health check passed');
  }
  
  console.log('\n✅ Kubernetes deployment completed successfully');
}

await k8sDeploy();
```

## Advanced Pipeline Features

### Conditional Execution

```typescript
// pipelines/conditional.ts
import { $ } from '@xec-sh/core';

async function conditionalPipeline() {
  const branch = await $`git branch --show-current`;
  const branchName = branch.stdout.trim();
  
  // Determine pipeline flow based on branch
  const pipelineConfig = {
    main: {
      runTests: true,
      runIntegration: true,
      deploy: 'production',
      requireApproval: true
    },
    develop: {
      runTests: true,
      runIntegration: true,
      deploy: 'staging',
      requireApproval: false
    },
    feature: {
      runTests: true,
      runIntegration: false,
      deploy: null,
      requireApproval: false
    }
  };
  
  const config = branchName.startsWith('feature/')
    ? pipelineConfig.feature
    : pipelineConfig[branchName] || pipelineConfig.feature;
  
  console.log(`🎯 Running pipeline for branch: ${branchName}`);
  
  // Always run basic tests
  if (config.runTests) {
    await $`npm test`;
  }
  
  // Conditionally run integration tests
  if (config.runIntegration) {
    await $`npm run test:integration`;
  }
  
  // Conditional deployment
  if (config.deploy) {
    if (config.requireApproval) {
      // In CI, this would check for approval
      console.log('⏸️ Waiting for deployment approval...');
    }
    
    await $`npm run deploy:${config.deploy}`;
  }
}

await conditionalPipeline();
```

### Matrix Testing

```typescript
// pipelines/matrix-test.ts
import { $ } from '@xec-sh/core';

interface TestMatrix {
  node: string[];
  os: string[];
  database: string[];
}

async function matrixTest() {
  const matrix: TestMatrix = {
    node: ['18', '20', '22'],
    os: ['ubuntu-latest', 'macos-latest'],
    database: ['postgres:14', 'postgres:15', 'mysql:8']
  };
  
  const combinations = [];
  
  // Generate all combinations
  for (const node of matrix.node) {
    for (const os of matrix.os) {
      for (const database of matrix.database) {
        combinations.push({ node, os, database });
      }
    }
  }
  
  console.log(`🔢 Running ${combinations.length} test combinations`);
  
  // Run tests in parallel batches
  const batchSize = 3;
  for (let i = 0; i < combinations.length; i += batchSize) {
    const batch = combinations.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (combo) => {
      console.log(`Testing: Node ${combo.node}, ${combo.os}, ${combo.database}`);
      
      // Run in Docker container
      const testEnv = $.docker({
        image: `node:${combo.node}`,
        rm: true,
        env: {
          DATABASE: combo.database,
          OS: combo.os
        }
      });
      
      await testEnv`npm ci`;
      await testEnv`npm test`;
    }));
  }
  
  console.log('✅ All matrix tests completed');
}

await matrixTest();
```

### Pipeline Monitoring

```typescript
// pipelines/monitored-pipeline.ts
import { $ } from '@xec-sh/core';

class MonitoredPipeline {
  private metrics: Map<string, any> = new Map();
  private startTime: number;
  
  constructor(private name: string) {
    this.startTime = Date.now();
  }
  
  async runStage(name: string, fn: () => Promise<any>) {
    const stageStart = Date.now();
    console.log(`\n📊 Stage: ${name}`);
    
    try {
      const result = await fn();
      const duration = Date.now() - stageStart;
      
      this.metrics.set(name, {
        status: 'success',
        duration,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ ${name} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - stageStart;
      
      this.metrics.set(name, {
        status: 'failed',
        duration,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      console.error(`❌ ${name} failed after ${duration}ms`);
      throw error;
    }
  }
  
  async reportMetrics() {
    const totalDuration = Date.now() - this.startTime;
    
    const report = {
      pipeline: this.name,
      totalDuration,
      stages: Array.from(this.metrics.entries()).map(([name, data]) => ({
        name,
        ...data
      })),
      timestamp: new Date().toISOString()
    };
    
    // Send to monitoring service
    if (process.env.MONITORING_ENDPOINT) {
      await $`curl -X POST ${process.env.MONITORING_ENDPOINT} \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify(report)}'`;
    }
    
    // Log summary
    console.log('\n📈 Pipeline Metrics:');
    console.log('─'.repeat(40));
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Stages: ${this.metrics.size}`);
    console.log(`Success: ${Array.from(this.metrics.values()).filter(m => m.status === 'success').length}`);
    console.log(`Failed: ${Array.from(this.metrics.values()).filter(m => m.status === 'failed').length}`);
  }
}

// Usage
const pipeline = new MonitoredPipeline('build-and-deploy');

try {
  await pipeline.runStage('lint', () => $`npm run lint`);
  await pipeline.runStage('test', () => $`npm test`);
  await pipeline.runStage('build', () => $`npm run build`);
  await pipeline.runStage('deploy', () => $`npm run deploy`);
} finally {
  await pipeline.reportMetrics();
}
```

## Integration with CI/CD Platforms

### GitLab CI Integration

```yaml
# .gitlab-ci.yml
image: node:18

stages:
  - validate
  - test
  - build
  - deploy

before_script:
  - npm install -g @xec-sh/cli
  - npm ci

validate:
  stage: validate
  script:
    - xec run pipelines/validate.ts
  only:
    - merge_requests

test:
  stage: test
  script:
    - xec run pipelines/test.ts
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  stage: build
  script:
    - xec run pipelines/build.ts
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

deploy_staging:
  stage: deploy
  script:
    - xec run pipelines/deploy.ts --env staging
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - develop

deploy_production:
  stage: deploy
  script:
    - xec run pipelines/deploy.ts --env production
  environment:
    name: production
    url: https://example.com
  when: manual
  only:
    - main
```

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    tools {
        nodejs 'Node-18'
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g @xec-sh/cli'
                sh 'npm ci'
            }
        }
        
        stage('Validate') {
            steps {
                sh 'xec run pipelines/validate.ts'
            }
        }
        
        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh 'xec run pipelines/test-unit.ts'
                    }
                }
                stage('Integration Tests') {
                    steps {
                        sh 'xec run pipelines/test-integration.ts'
                    }
                }
            }
        }
        
        stage('Build') {
            steps {
                sh 'xec run pipelines/build.ts'
            }
        }
        
        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                input 'Deploy to production?'
                sh 'xec run pipelines/deploy.ts --env production'
            }
        }
    }
    
    post {
        always {
            sh 'xec run pipelines/cleanup.ts'
        }
    }
}
```

## Best Practices

### 1. Pipeline as Code

Keep your pipeline definitions in version control:

```typescript
// pipelines/index.ts
export { buildPipeline } from './build';
export { testPipeline } from './test';
export { deployPipeline } from './deploy';
export { releasePipeline } from './release';
```

### 2. Environment Configuration

Use environment-specific configurations:

```typescript
// pipelines/config.ts
export const config = {
  development: {
    skipTests: false,
    parallel: true,
    deploy: false
  },
  staging: {
    skipTests: false,
    parallel: true,
    deploy: true,
    target: 'staging.example.com'
  },
  production: {
    skipTests: false,
    parallel: false,
    deploy: true,
    target: 'prod.example.com',
    requireApproval: true
  }
};

export function getConfig() {
  const env = process.env.ENVIRONMENT || 'development';
  return config[env];
}
```

### 3. Secrets Management

Never hardcode secrets in pipeline code:

```typescript
// pipelines/secure-deploy.ts
import { $ } from '@xec-sh/core';

async function secureDeploy() {
  // Load secrets from environment or secret manager
  const apiKey = process.env.API_KEY;
  const dbPassword = process.env.DB_PASSWORD;
  
  if (!apiKey || !dbPassword) {
    throw new Error('Required secrets not found');
  }
  
  // Use secrets safely
  await $.env({
    API_KEY: apiKey,
    DB_PASSWORD: dbPassword
  }).quiet()`deploy-script`;
  
  // Never log secrets
  console.log('Deployment completed (secrets hidden)');
}
```

### 4. Artifact Management

Properly manage build artifacts:

```typescript
// pipelines/artifacts.ts
import { $ } from '@xec-sh/core';

async function manageArtifacts() {
  const version = process.env.VERSION || 'latest';
  const artifactDir = `artifacts/${version}`;
  
  // Create artifact directory
  await $`mkdir -p ${artifactDir}`;
  
  // Copy build outputs
  await $`cp -r dist/* ${artifactDir}/`;
  
  // Create manifest
  const manifest = {
    version,
    buildTime: new Date().toISOString(),
    commit: await $`git rev-parse HEAD`.then(r => r.stdout.trim()),
    branch: await $`git branch --show-current`.then(r => r.stdout.trim())
  };
  
  await $`echo ${JSON.stringify(manifest)} > ${artifactDir}/manifest.json`;
  
  // Upload to artifact storage
  if (process.env.CI) {
    await $`aws s3 cp ${artifactDir} s3://artifacts/${version}/ --recursive`;
  }
}
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```typescript
   // Ensure proper permissions
   await $`chmod +x deploy.sh`;
   await $`./deploy.sh`;
   ```

2. **Network Timeouts**
   ```typescript
   // Add timeout and retry logic
   const result = await $`npm install`.timeout(300000).retry(3);
   ```

3. **Resource Cleanup**
   ```typescript
   // Always cleanup resources
   try {
     await runPipeline();
   } finally {
     await $`docker-compose down`.nothrow();
     await $`rm -rf temp/*`.nothrow();
   }
   ```

## Next Steps

- Learn about [deployment automation](./deployment.md)
- Explore [test automation](./testing.md)
- Implement [error handling](../advanced/error-handling.md)

## Summary

You've learned how to:
- ✅ Build basic CI/CD pipelines with Xec
- ✅ Create multi-stage pipelines
- ✅ Integrate with GitHub Actions, GitLab CI, and Jenkins
- ✅ Deploy to multiple environments
- ✅ Implement matrix testing
- ✅ Monitor pipeline execution
- ✅ Handle secrets and artifacts properly

Continue to [deployment automation](./deployment.md) to learn more about automating deployments.