---
title: Node.js Application Deployment
description: Deploy Node.js applications across multiple environments using Xec
keywords: [deployment, node.js, production, staging, rollback]
source_files:
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/src/operations/file.ts
  - apps/xec/src/commands/on.ts
key_functions:
  - SSHAdapter.execute()
  - FileOperations.copy()
  - DockerAdapter.exec()
verification_date: 2025-01-03
---

# Node.js Application Deployment

## Problem

Deploying Node.js applications consistently across development, staging, and production environments while managing dependencies, environment variables, and zero-downtime deployments.

## Solution

Xec provides a unified approach to Node.js deployment using its execution engine to orchestrate deployment steps across different target environments.

## Quick Example

```typescript
// deploy.ts
import { $ } from '@xec-sh/core';

const target = process.argv[2] || 'staging';
const version = process.argv[3] || 'latest';

// Deploy to target environment
await $.ssh(target)`
  cd /app &&
  git pull origin ${version} &&
  npm ci --production &&
  npm run build &&
  pm2 reload ecosystem.config.js --update-env
`;

console.log(`✅ Deployed version ${version} to ${target}`);
```

## Complete Deployment Recipe

### Configuration

```yaml
# .xec/config.yaml
targets:
  staging:
    type: ssh
    host: staging.example.com
    user: deploy
    key: ~/.ssh/deploy_key
    
  production:
    type: ssh
    host: prod.example.com
    user: deploy
    key: ~/.ssh/deploy_key
    
  production-2:
    type: ssh
    host: prod2.example.com
    user: deploy
    key: ~/.ssh/deploy_key

tasks:
  deploy:
    description: Deploy Node.js application
    params:
      - name: env
        required: true
        values: [staging, production]
      - name: version
        default: main
    steps:
      - name: Pre-deployment checks
        command: xec run scripts/pre-deploy.ts ${params.env}
      - name: Deploy application
        command: xec run scripts/deploy.ts ${params.env} ${params.version}
      - name: Post-deployment validation
        command: xec run scripts/post-deploy.ts ${params.env}
```

### Deployment Script

```typescript
// scripts/deploy.ts
import { $, $$, type Target } from '@xec-sh/core';
import chalk from 'chalk';
import { readFile } from 'fs/promises';

const environment = process.argv[2];
const version = process.argv[3] || 'main';

// Configuration
const config = {
  staging: {
    targets: ['staging'],
    appPath: '/var/www/app-staging',
    pm2Name: 'app-staging',
    nodeEnv: 'staging'
  },
  production: {
    targets: ['production', 'production-2'],
    appPath: '/var/www/app',
    pm2Name: 'app-production',
    nodeEnv: 'production'
  }
};

const envConfig = config[environment];
if (!envConfig) {
  console.error(chalk.red(`Unknown environment: ${environment}`));
  process.exit(1);
}

console.log(chalk.blue(`🚀 Deploying ${version} to ${environment}...`));

// Function to deploy to a single target
async function deployToTarget(targetName: string) {
  console.log(chalk.gray(`  Deploying to ${targetName}...`));
  
  const target = $.ssh(targetName);
  
  try {
    // 1. Backup current version
    await target`
      cd ${envConfig.appPath} &&
      if [ -d .git ]; then
        echo "Current version: $(git rev-parse HEAD)" > ../deploy-backup.txt
      fi
    `;
    
    // 2. Pull latest code
    const gitResult = await target`
      cd ${envConfig.appPath} &&
      git fetch origin &&
      git checkout ${version} &&
      git pull origin ${version}
    `.nothrow();
    
    if (!gitResult.ok) {
      throw new Error(`Git pull failed: ${gitResult.error.message}`);
    }
    
    // 3. Install dependencies
    console.log(chalk.gray(`    Installing dependencies...`));
    await target`
      cd ${envConfig.appPath} &&
      npm ci --production
    `;
    
    // 4. Run build
    console.log(chalk.gray(`    Building application...`));
    await target`
      cd ${envConfig.appPath} &&
      NODE_ENV=${envConfig.nodeEnv} npm run build
    `;
    
    // 5. Run migrations
    console.log(chalk.gray(`    Running migrations...`));
    const migrationResult = await target`
      cd ${envConfig.appPath} &&
      NODE_ENV=${envConfig.nodeEnv} npm run migrate
    `.nothrow();
    
    if (!migrationResult.ok) {
      console.warn(chalk.yellow(`    ⚠️  Migration warnings: ${migrationResult.error.message}`));
    }
    
    // 6. Reload application with PM2
    console.log(chalk.gray(`    Reloading application...`));
    await target`
      cd ${envConfig.appPath} &&
      NODE_ENV=${envConfig.nodeEnv} pm2 reload ${envConfig.pm2Name} --update-env
    `;
    
    // 7. Wait for health check
    console.log(chalk.gray(`    Waiting for health check...`));
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      const healthResult = await target`
        curl -f http://localhost:3000/health || exit 1
      `.nothrow();
      
      if (healthResult.ok) {
        healthy = true;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (!healthy) {
      throw new Error('Health check failed after 30 seconds');
    }
    
    console.log(chalk.green(`    ✅ ${targetName} deployed successfully`));
    return true;
    
  } catch (error) {
    console.error(chalk.red(`    ❌ Deployment to ${targetName} failed: ${error.message}`));
    
    // Rollback on failure
    console.log(chalk.yellow(`    Rolling back ${targetName}...`));
    const backupVersion = await target`
      if [ -f ../deploy-backup.txt ]; then
        grep "Current version:" ../deploy-backup.txt | cut -d: -f2 | tr -d ' '
      else
        echo "main"
      fi
    `.text();
    
    await target`
      cd ${envConfig.appPath} &&
      git checkout ${backupVersion.trim()} &&
      npm ci --production &&
      npm run build &&
      pm2 reload ${envConfig.pm2Name} --update-env
    `.nothrow();
    
    throw error;
  }
}

// Deploy to all targets
try {
  // Deploy sequentially for production, parallel for staging
  if (environment === 'production') {
    for (const target of envConfig.targets) {
      await deployToTarget(target);
    }
  } else {
    await Promise.all(
      envConfig.targets.map(target => deployToTarget(target))
    );
  }
  
  console.log(chalk.green(`\n✅ Deployment to ${environment} completed successfully!`));
  
} catch (error) {
  console.error(chalk.red(`\n❌ Deployment failed: ${error.message}`));
  process.exit(1);
}
```

### Pre-deployment Checks

```typescript
// scripts/pre-deploy.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const environment = process.argv[2];

console.log(chalk.blue('🔍 Running pre-deployment checks...'));

// Check disk space
const diskSpace = await $.ssh(environment)`
  df -h /var/www | tail -1 | awk '{print $5}' | sed 's/%//'
`.text();

if (parseInt(diskSpace) > 80) {
  console.error(chalk.red(`❌ Disk space critical: ${diskSpace}% used`));
  process.exit(1);
}

// Check if PM2 is running
const pm2Status = await $.ssh(environment)`
  pm2 status || exit 1
`.nothrow();

if (!pm2Status.ok) {
  console.error(chalk.red('❌ PM2 is not running'));
  process.exit(1);
}

// Check database connectivity
const dbCheck = await $.ssh(environment)`
  cd /var/www/app* &&
  npm run db:ping
`.nothrow();

if (!dbCheck.ok) {
  console.error(chalk.red('❌ Database connection failed'));
  process.exit(1);
}

console.log(chalk.green('✅ All pre-deployment checks passed'));
```

### Post-deployment Validation

```typescript
// scripts/post-deploy.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const environment = process.argv[2];
const endpoints = {
  staging: 'https://staging.example.com',
  production: 'https://example.com'
};

console.log(chalk.blue('🔍 Running post-deployment validation...'));

// Check application health
const healthCheck = await $`
  curl -f ${endpoints[environment]}/health
`.nothrow();

if (!healthCheck.ok) {
  console.error(chalk.red('❌ Health check failed'));
  process.exit(1);
}

// Check critical endpoints
const criticalEndpoints = ['/api/status', '/api/version', '/'];

for (const endpoint of criticalEndpoints) {
  const result = await $`
    curl -f -o /dev/null -w "%{http_code}" ${endpoints[environment]}${endpoint}
  `.text();
  
  if (result !== '200') {
    console.error(chalk.red(`❌ Endpoint ${endpoint} returned ${result}`));
    process.exit(1);
  }
}

// Check application logs for errors
const logs = await $.ssh(environment)`
  pm2 logs --nostream --lines 50 | grep -i error || true
`.text();

if (logs.includes('FATAL') || logs.includes('CRITICAL')) {
  console.error(chalk.red('❌ Critical errors found in logs'));
  console.log(logs);
  process.exit(1);
}

console.log(chalk.green('✅ All post-deployment validations passed'));

// Send deployment notification
await $`
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H 'Content-Type: application/json' \
    -d '{
      "text": "✅ Deployment to '${environment}' completed successfully",
      "channel": "#deployments"
    }'
`.nothrow();
```

## Zero-Downtime Deployment

```typescript
// scripts/zero-downtime-deploy.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const environment = process.argv[2];
const servers = ['prod-1', 'prod-2', 'prod-3'];

// Remove servers from load balancer one by one
for (const server of servers) {
  console.log(chalk.blue(`Deploying to ${server}...`));
  
  // 1. Remove from load balancer
  await $`
    aws elb deregister-instances-from-load-balancer \
      --load-balancer-name prod-lb \
      --instances ${server}
  `;
  
  // 2. Wait for connections to drain
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // 3. Deploy to server
  await $.ssh(server)`
    cd /app &&
    git pull &&
    npm ci --production &&
    npm run build &&
    pm2 reload app
  `;
  
  // 4. Health check
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    const result = await $.ssh(server)`curl -f http://localhost:3000/health`.nothrow();
    if (result.ok) {
      healthy = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!healthy) {
    throw new Error(`Health check failed for ${server}`);
  }
  
  // 5. Add back to load balancer
  await $`
    aws elb register-instances-with-load-balancer \
      --load-balancer-name prod-lb \
      --instances ${server}
  `;
  
  // 6. Wait for load balancer health check
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log(chalk.green(`✅ ${server} deployed and back in rotation`));
}
```

## Docker-based Deployment

```typescript
// scripts/docker-deploy.ts
import { $ } from '@xec-sh/core';

const environment = process.argv[2];
const image = process.argv[3];

// Build and push Docker image
await $`
  docker build -t myapp:${image} . &&
  docker tag myapp:${image} registry.example.com/myapp:${image} &&
  docker push registry.example.com/myapp:${image}
`;

// Deploy to Docker Swarm or Kubernetes
if (environment === 'production') {
  // Update service in Docker Swarm
  await $.ssh('swarm-manager')`
    docker service update \
      --image registry.example.com/myapp:${image} \
      --update-parallelism 1 \
      --update-delay 30s \
      myapp-service
  `;
} else {
  // Update deployment in Kubernetes
  await $`
    kubectl set image deployment/myapp \
      myapp=registry.example.com/myapp:${image} \
      --namespace=${environment}
  `;
  
  // Wait for rollout
  await $`
    kubectl rollout status deployment/myapp \
      --namespace=${environment} \
      --timeout=5m
  `;
}
```

## Usage Examples

```bash
# Deploy to staging
xec deploy --env=staging

# Deploy specific version to production
xec deploy --env=production --version=v1.2.3

# Run deployment script directly
xec run scripts/deploy.ts production v1.2.3

# Zero-downtime deployment
xec run scripts/zero-downtime-deploy.ts production

# Docker deployment
xec run scripts/docker-deploy.ts production latest
```

## Best Practices

1. **Always run pre-deployment checks** to verify system readiness
2. **Use version tags** for production deployments
3. **Implement health checks** to verify successful deployment
4. **Keep rollback scripts** ready for quick recovery
5. **Test deployments** in staging before production
6. **Monitor logs** during and after deployment
7. **Use zero-downtime strategies** for production

## Common Patterns

### Environment-specific Configuration

```typescript
const configs = {
  development: { /* ... */ },
  staging: { /* ... */ },
  production: { /* ... */ }
};

const config = configs[process.env.NODE_ENV || 'development'];
```

### Parallel Deployment

```typescript
// Deploy to multiple servers simultaneously
await Promise.all(
  servers.map(server => deployToServer(server))
);
```

### Sequential Deployment with Validation

```typescript
for (const server of servers) {
  await deployToServer(server);
  await validateDeployment(server);
}
```

## Troubleshooting

### Deployment Fails

```typescript
// Check logs
await $.ssh(target)`pm2 logs --lines 100`;

// Check disk space
await $.ssh(target)`df -h`;

// Check memory
await $.ssh(target)`free -m`;
```

### Rollback Procedure

```typescript
// scripts/rollback.ts
const previousVersion = await $.ssh(target)`
  cd /app && git rev-parse HEAD~1
`.text();

await $.ssh(target)`
  cd /app &&
  git checkout ${previousVersion} &&
  npm ci --production &&
  npm run build &&
  pm2 reload app
`;
```

## Related Topics

- [Docker Deployment](docker-deploy.md)
- [Kubernetes Deployment](k8s-deploy.md)
- [Static Site Deployment](static-site-deploy.md)
- [CI/CD Integration](../integration/github-actions.md)