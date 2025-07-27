---
sidebar_position: 3
---

# Your First Project

Let's build a complete automation project with Xec! We'll create a web application deployment system that handles everything from testing to production deployment.

## Project Overview

We'll build an automation system that:
- Runs tests and builds the application
- Manages multiple environments (staging, production)
- Handles database migrations
- Performs health checks and rollbacks
- Sends notifications on success/failure

## Project Structure

Create a new directory for your project:

```bash
mkdir deployment-automation
cd deployment-automation
npm init -y
```

Install Xec dependencies:

```bash
npm install @xec-sh/core typescript @types/node
npm install --save-dev ts-node
```

Create the following structure:

```
deployment-automation/
├── package.json
├── tsconfig.json
├── .env.example
├── config/
│   ├── environments.ts
│   └── settings.ts
├── scripts/
│   ├── deploy.ts
│   ├── rollback.ts
│   └── health-check.ts
├── lib/
│   ├── ssh-manager.ts
│   ├── docker-utils.ts
│   └── notifications.ts
└── recipes/
    ├── full-deploy.ts
    └── quick-patch.ts
```

## Setting Up TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./",
    "declaration": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## Configuration Management

Create `config/environments.ts`:

```typescript
export interface Environment {
  name: string;
  host: string;
  username: string;
  appPath: string;
  branch: string;
  healthCheckUrl: string;
}

export const environments: Record<string, Environment> = {
  staging: {
    name: 'staging',
    host: 'staging.example.com',
    username: 'deploy',
    appPath: '/var/www/app-staging',
    branch: 'develop',
    healthCheckUrl: 'https://staging.example.com/health'
  },
  production: {
    name: 'production',
    host: 'prod.example.com',
    username: 'deploy',
    appPath: '/var/www/app',
    branch: 'main',
    healthCheckUrl: 'https://example.com/health'
  }
};
```

Create `config/settings.ts`:

```typescript
export const settings = {
  // Deployment settings
  deployment: {
    preDeployTests: true,
    buildBeforeDeploy: true,
    runMigrations: true,
    keepReleases: 5,
    timeout: 300000 // 5 minutes
  },
  
  // Notification settings
  notifications: {
    slack: {
      enabled: process.env.SLACK_WEBHOOK ? true : false,
      webhook: process.env.SLACK_WEBHOOK || ''
    },
    email: {
      enabled: false,
      to: process.env.NOTIFY_EMAIL || ''
    }
  },
  
  // Docker settings
  docker: {
    registry: process.env.DOCKER_REGISTRY || 'docker.io',
    namespace: process.env.DOCKER_NAMESPACE || 'mycompany'
  }
};
```

## SSH Connection Manager

Create `lib/ssh-manager.ts`:

```typescript
import { $ } from '@xec-sh/core';
import type { SSHExecutionContext } from '@xec-sh/core';
import type { Environment } from '../config/environments';

export class SSHManager {
  private connections: Map<string, SSHExecutionContext> = new Map();

  async getConnection(env: Environment): Promise<SSHExecutionContext> {
    const key = `${env.username}@${env.host}`;
    
    if (!this.connections.has(key)) {
      const connection = $.ssh({
        host: env.host,
        username: env.username,
        privateKey: process.env.SSH_PRIVATE_KEY
      });
      
      // Test connection
      await connection`echo "Connection established"`;
      this.connections.set(key, connection);
    }
    
    return this.connections.get(key)!;
  }

  async closeAll(): Promise<void> {
    // Connections are managed by the execution engine
    this.connections.clear();
  }
}

export const sshManager = new SSHManager();
```

## Docker Utilities

Create `lib/docker-utils.ts`:

```typescript
import { $ } from '@xec-sh/core';
import { settings } from '../config/settings';

export async function buildDockerImage(
  tag: string,
  dockerfile = 'Dockerfile'
): Promise<void> {
  console.log(`🔨 Building Docker image: ${tag}`);
  
  await $`docker build -f ${dockerfile} -t ${tag} .`;
  
  console.log('✅ Docker image built successfully');
}

export async function pushDockerImage(tag: string): Promise<void> {
  const { registry, namespace } = settings.docker;
  const fullTag = `${registry}/${namespace}/${tag}`;
  
  console.log(`📤 Pushing Docker image: ${fullTag}`);
  
  // Tag for registry
  await $`docker tag ${tag} ${fullTag}`;
  
  // Push to registry
  await $`docker push ${fullTag}`;
  
  console.log('✅ Docker image pushed successfully');
}

export async function deployDockerContainer(
  ssh: any,
  containerName: string,
  image: string,
  env: Record<string, string>
): Promise<void> {
  console.log(`🚀 Deploying container: ${containerName}`);
  
  // Stop existing container
  await ssh`docker stop ${containerName} || true`;
  await ssh`docker rm ${containerName} || true`;
  
  // Pull latest image
  await ssh`docker pull ${image}`;
  
  // Run new container
  const envFlags = Object.entries(env)
    .map(([key, value]) => `-e ${key}="${value}"`)
    .join(' ');
  
  await ssh`docker run -d --name ${containerName} --restart=always ${envFlags} -p 3000:3000 ${image}`;
  
  // Wait for container to be healthy
  await ssh`docker wait ${containerName}`;
  
  console.log('✅ Container deployed successfully');
}
```

## Notification System

Create `lib/notifications.ts`:

```typescript
import { $ } from '@xec-sh/core';
import { settings } from '../config/settings';

export interface DeploymentInfo {
  environment: string;
  version: string;
  status: 'success' | 'failure';
  duration: number;
  error?: string;
}

export async function sendNotification(info: DeploymentInfo): Promise<void> {
  const { notifications } = settings;
  
  // Slack notification
  if (notifications.slack.enabled) {
    await sendSlackNotification(info);
  }
  
  // Email notification
  if (notifications.email.enabled) {
    await sendEmailNotification(info);
  }
}

async function sendSlackNotification(info: DeploymentInfo): Promise<void> {
  const emoji = info.status === 'success' ? '✅' : '❌';
  const color = info.status === 'success' ? 'good' : 'danger';
  
  const payload = {
    attachments: [{
      color,
      title: `${emoji} Deployment ${info.status}`,
      fields: [
        {
          title: 'Environment',
          value: info.environment,
          short: true
        },
        {
          title: 'Version',
          value: info.version,
          short: true
        },
        {
          title: 'Duration',
          value: `${Math.round(info.duration / 1000)}s`,
          short: true
        }
      ],
      footer: 'Xec Deployment System',
      ts: Math.floor(Date.now() / 1000)
    }]
  };
  
  if (info.error) {
    payload.attachments[0].fields.push({
      title: 'Error',
      value: info.error,
      short: false
    });
  }
  
  await $`curl -X POST -H 'Content-type: application/json' \
    --data '${JSON.stringify(payload)}' \
    ${settings.notifications.slack.webhook}`;
}

async function sendEmailNotification(info: DeploymentInfo): Promise<void> {
  // Implementation depends on your email service
  console.log(`Email notification would be sent to: ${settings.notifications.email.to}`);
}
```

## Main Deployment Script

Create `scripts/deploy.ts`:

```typescript
#!/usr/bin/env ts-node

import { $ } from '@xec-sh/core';
import { environments } from '../config/environments';
import { settings } from '../config/settings';
import { sshManager } from '../lib/ssh-manager';
import { sendNotification } from '../lib/notifications';
import { buildDockerImage, pushDockerImage, deployDockerContainer } from '../lib/docker-utils';

async function deploy(envName: string): Promise<void> {
  const startTime = Date.now();
  const env = environments[envName];
  
  if (!env) {
    throw new Error(`Unknown environment: ${envName}`);
  }
  
  console.log(`🚀 Starting deployment to ${env.name}`);
  
  let version = 'unknown';
  
  try {
    // 1. Pre-deployment checks
    if (settings.deployment.preDeployTests) {
      console.log('📋 Running tests...');
      await $`npm test`;
      console.log('✅ Tests passed');
    }
    
    // 2. Get version
    const gitHash = await $`git rev-parse --short HEAD`;
    version = gitHash.stdout.trim();
    
    // 3. Build application
    if (settings.deployment.buildBeforeDeploy) {
      console.log('🔨 Building application...');
      await $`npm run build`;
      
      // Build Docker image if Dockerfile exists
      const hasDocker = await $`test -f Dockerfile`.nothrow();
      if (hasDocker.exitCode === 0) {
        await buildDockerImage(`app:${version}`);
        await pushDockerImage(`app:${version}`);
      }
    }
    
    // 4. Connect to server
    const ssh = await sshManager.getConnection(env);
    
    // 5. Create release directory
    const releaseDir = `${env.appPath}/releases/${version}`;
    console.log(`📁 Creating release directory: ${releaseDir}`);
    await ssh`mkdir -p ${releaseDir}`;
    
    // 6. Upload application
    console.log('📤 Uploading application...');
    await ssh`cd ${env.appPath} && git fetch origin ${env.branch}`;
    await ssh`cd ${env.appPath} && git checkout ${env.branch}`;
    await ssh`cd ${env.appPath} && git pull origin ${env.branch}`;
    
    // 7. Install dependencies
    console.log('📦 Installing dependencies...');
    await ssh`cd ${releaseDir} && npm ci --production`;
    
    // 8. Run migrations
    if (settings.deployment.runMigrations) {
      console.log('🗄️  Running migrations...');
      await ssh`cd ${releaseDir} && npm run migrate`;
    }
    
    // 9. Update symlink
    console.log('🔗 Updating current release...');
    await ssh`cd ${env.appPath} && ln -sfn ${releaseDir} current`;
    
    // 10. Restart application
    console.log('🔄 Restarting application...');
    await ssh`sudo systemctl restart app-${env.name}`;
    
    // 11. Health check
    console.log('❤️  Running health check...');
    await $`sleep 5`; // Give app time to start
    
    const health = await $`curl -f ${env.healthCheckUrl}`.nothrow();
    if (health.exitCode !== 0) {
      throw new Error('Health check failed');
    }
    
    // 12. Clean old releases
    console.log('🧹 Cleaning old releases...');
    await ssh`cd ${env.appPath}/releases && ls -t | tail -n +${settings.deployment.keepReleases + 1} | xargs rm -rf`;
    
    // Success!
    const duration = Date.now() - startTime;
    console.log(`✅ Deployment successful in ${Math.round(duration / 1000)}s`);
    
    await sendNotification({
      environment: env.name,
      version,
      status: 'success',
      duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Deployment failed:', error.message);
    
    await sendNotification({
      environment: env.name,
      version,
      status: 'failure',
      duration,
      error: error.message
    });
    
    throw error;
  } finally {
    await sshManager.closeAll();
  }
}

// Main execution
if (require.main === module) {
  const envName = process.argv[2];
  
  if (!envName) {
    console.error('Usage: deploy.ts <environment>');
    console.error('Available environments:', Object.keys(environments).join(', '));
    process.exit(1);
  }
  
  deploy(envName).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export { deploy };
```

## Health Check Script

Create `scripts/health-check.ts`:

```typescript
#!/usr/bin/env ts-node

import { $ } from '@xec-sh/core';
import { environments } from '../config/environments';

async function healthCheck(envName: string): Promise<boolean> {
  const env = environments[envName];
  
  if (!env) {
    throw new Error(`Unknown environment: ${envName}`);
  }
  
  console.log(`❤️  Checking health of ${env.name}...`);
  
  try {
    // HTTP health check
    const httpCheck = await $`curl -f -s -o /dev/null -w "%{http_code}" ${env.healthCheckUrl}`;
    const statusCode = httpCheck.stdout.trim();
    
    if (statusCode !== '200') {
      console.error(`❌ HTTP health check failed: ${statusCode}`);
      return false;
    }
    
    // Additional checks
    const ssh = $.ssh({
      host: env.host,
      username: env.username
    });
    
    // Check process
    const processCheck = await ssh`systemctl is-active app-${env.name}`.nothrow();
    if (processCheck.stdout.trim() !== 'active') {
      console.error('❌ Application process is not active');
      return false;
    }
    
    // Check disk space
    const diskCheck = await ssh`df -h ${env.appPath} | awk 'NR==2 {print $5}' | sed 's/%//'`;
    const diskUsage = parseInt(diskCheck.stdout.trim());
    
    if (diskUsage > 90) {
      console.error(`⚠️  Disk usage is high: ${diskUsage}%`);
    }
    
    console.log('✅ All health checks passed');
    return true;
    
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    return false;
  }
}

// Main execution
if (require.main === module) {
  const envName = process.argv[2];
  
  if (!envName) {
    console.error('Usage: health-check.ts <environment>');
    process.exit(1);
  }
  
  healthCheck(envName).then(healthy => {
    process.exit(healthy ? 0 : 1);
  });
}

export { healthCheck };
```

## Creating Recipes

Create `recipes/full-deploy.ts`:

```typescript
import { deploy } from '../scripts/deploy';
import { healthCheck } from '../scripts/health-check';

export default async function fullDeploy() {
  // Deploy to staging first
  console.log('🎬 Deploying to staging...');
  await deploy('staging');
  
  // Run extended tests on staging
  console.log('🧪 Running integration tests on staging...');
  const stagingHealthy = await healthCheck('staging');
  
  if (!stagingHealthy) {
    throw new Error('Staging health check failed');
  }
  
  // Ask for confirmation
  console.log('\n⚠️  Ready to deploy to production?');
  console.log('Press Enter to continue or Ctrl+C to cancel...');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  // Deploy to production
  console.log('🚀 Deploying to production...');
  await deploy('production');
  
  console.log('🎉 Full deployment completed!');
}
```

## Package.json Scripts

Update your `package.json`:

```json
{
  "name": "deployment-automation",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "deploy:staging": "ts-node scripts/deploy.ts staging",
    "deploy:production": "ts-node scripts/deploy.ts production",
    "health:staging": "ts-node scripts/health-check.ts staging",
    "health:production": "ts-node scripts/health-check.ts production",
    "recipe:full": "xec recipes/full-deploy.ts"
  },
  "dependencies": {
    "@xec-sh/core": "latest",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "devDependencies": {
    "ts-node": "^10.0.0"
  }
}
```

## Environment Variables

Create `.env.example`:

```bash
# SSH Configuration
SSH_PRIVATE_KEY_PATH=~/.ssh/id_rsa

# Docker Registry
DOCKER_REGISTRY=docker.io
DOCKER_NAMESPACE=mycompany

# Notifications
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
NOTIFY_EMAIL=ops@example.com

# Environment-specific
STAGING_HOST=staging.example.com
PRODUCTION_HOST=prod.example.com
```

## Running Your Project

1. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

2. **Deploy to staging**:
   ```bash
   npm run deploy:staging
   ```

3. **Check health**:
   ```bash
   npm run health:staging
   ```

4. **Full deployment**:
   ```bash
   npm run recipe:full
   ```

## Best Practices Implemented

1. **Environment Separation**: Clear separation between staging and production
2. **Health Checks**: Automated health checks before and after deployment
3. **Rollback Capability**: Keep multiple releases for easy rollback
4. **Notifications**: Team notifications on deployment status
5. **Error Handling**: Proper error handling and logging
6. **Security**: Use environment variables for sensitive data
7. **Modularity**: Reusable components (SSH manager, Docker utils)
8. **Type Safety**: Full TypeScript for compile-time safety

## Extending Your Project

Ideas for extending this project:

1. **Add Database Backups**:
   ```typescript
   await ssh`mysqldump -u user -p db > backup-${version}.sql`;
   ```

2. **Blue-Green Deployment**:
   ```typescript
   // Deploy to blue environment
   // Switch load balancer
   // Keep green as backup
   ```

3. **Monitoring Integration**:
   ```typescript
   // Send deployment events to monitoring
   await $`curl -X POST ${MONITORING_API}/deployments`;
   ```

4. **Automated Rollback**:
   ```typescript
   if (!healthy) {
     await ssh`cd ${appPath} && ln -sfn releases/${previousVersion} current`;
   }
   ```

## Summary

You've now built a complete deployment automation system with Xec! This project demonstrates:

- Multi-environment deployment
- SSH remote execution
- Docker integration
- Health checks and monitoring
- Notification system
- Error handling and rollback

Use this as a foundation for your own automation projects. The patterns and practices shown here can be adapted for any automation need.

## Next Steps

1. Explore the [API Reference](../projects/core/api-reference)
2. Discover [More Examples](../projects/core/examples)
3. Join the [Xec Community](https://github.com/xec-sh/xec)

Happy automating! 🚀