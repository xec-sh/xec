---
sidebar_position: 1
title: Your First Xec Automation
description: Learn how to create your first automation script with Xec
---

# Your First Xec Automation

Welcome to Xec! This guide will walk you through creating your first automation script, from simple command execution to a fully-featured automation workflow.

## Prerequisites

Before you begin, ensure you have:
- Node.js 18+ installed
- Xec installed globally: `npm install -g @xec-sh/cli`
- Basic knowledge of JavaScript/TypeScript

## Your First Script

### 1. Create a Simple Script

Let's start with a basic automation script that builds and tests a project:

```typescript
// build-and-test.ts
import { $ } from '@xec-sh/core';

// Simple sequential execution
await $`npm install`;
await $`npm run build`;
await $`npm test`;

console.log('✅ Build and test completed successfully!');
```

Run your script:
```bash
xec run build-and-test.ts
```

### 2. Add Error Handling

Real-world automation needs proper error handling:

```typescript
// build-and-test-safe.ts
import { $ } from '@xec-sh/core';

async function buildAndTest() {
  try {
    console.log('📦 Installing dependencies...');
    await $`npm install`;
    
    console.log('🔨 Building project...');
    const buildResult = await $`npm run build`;
    
    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed with exit code ${buildResult.exitCode}`);
    }
    
    console.log('🧪 Running tests...');
    await $`npm test`;
    
    console.log('✅ All tasks completed successfully!');
  } catch (error) {
    console.error('❌ Automation failed:', error.message);
    process.exit(1);
  }
}

await buildAndTest();
```

### 3. Make It Interactive

Add user interaction to your automation:

```typescript
// interactive-build.ts
import { $ } from '@xec-sh/core';
import { confirm, select } from '@clack/prompts';

async function interactiveBuild() {
  // Ask for build type
  const buildType = await select({
    message: 'Select build type:',
    options: [
      { value: 'development', label: 'Development' },
      { value: 'production', label: 'Production' },
      { value: 'test', label: 'Test' }
    ]
  });

  // Confirm before proceeding
  const shouldProceed = await confirm({
    message: `Build for ${buildType}?`
  });

  if (!shouldProceed) {
    console.log('Build cancelled');
    return;
  }

  // Execute build with environment
  await $`npm install`;
  await $.env({ NODE_ENV: buildType })`npm run build`;
  
  // Optionally run tests
  if (buildType !== 'production') {
    const runTests = await confirm({
      message: 'Run tests?'
    });
    
    if (runTests) {
      await $`npm test`;
    }
  }
  
  console.log(`✅ ${buildType} build completed!`);
}

await interactiveBuild();
```

## Multi-Environment Automation

One of Xec's key strengths is executing commands across different environments with the same API:

### Local and Remote Execution

```typescript
// deploy-to-staging.ts
import { $ } from '@xec-sh/core';

async function deployToStaging() {
  // Build locally
  console.log('Building application locally...');
  await $`npm run build`;
  await $`tar -czf app.tar.gz dist/`;
  
  // Deploy to staging server
  console.log('Deploying to staging server...');
  const staging = $.ssh({
    host: 'staging.example.com',
    username: 'deploy',
    privateKey: '~/.ssh/id_rsa'
  });
  
  // Upload build
  await staging`mkdir -p /app/releases/$(date +%Y%m%d_%H%M%S)`;
  await $`scp app.tar.gz deploy@staging.example.com:/app/releases/`;
  
  // Extract and restart
  await staging`cd /app && tar -xzf releases/app.tar.gz`;
  await staging`pm2 restart app`;
  
  console.log('✅ Deployed to staging!');
}

await deployToStaging();
```

### Docker Container Automation

```typescript
// docker-workflow.ts
import { $ } from '@xec-sh/core';

async function dockerWorkflow() {
  // Build Docker image
  console.log('Building Docker image...');
  await $`docker build -t myapp:latest .`;
  
  // Run tests in container
  console.log('Running tests in container...');
  const testContainer = $.docker({
    image: 'myapp:latest',
    rm: true,
    env: { NODE_ENV: 'test' }
  });
  
  await testContainer`npm test`;
  
  // Deploy if tests pass
  console.log('Pushing to registry...');
  await $`docker tag myapp:latest registry.example.com/myapp:latest`;
  await $`docker push registry.example.com/myapp:latest`;
  
  console.log('✅ Docker workflow completed!');
}

await dockerWorkflow();
```

## Parallel Execution

Speed up your automation by running tasks in parallel:

```typescript
// parallel-tasks.ts
import { $ } from '@xec-sh/core';

async function parallelBuild() {
  console.log('Starting parallel builds...');
  
  // Run multiple builds simultaneously
  const results = await Promise.all([
    $`npm run build:frontend`,
    $`npm run build:backend`,
    $`npm run build:docs`
  ]);
  
  // Check all results
  const allSuccessful = results.every(r => r.exitCode === 0);
  
  if (!allSuccessful) {
    throw new Error('One or more builds failed');
  }
  
  console.log('✅ All builds completed successfully!');
}

// Or use Promise.allSettled for more control
async function parallelWithErrorHandling() {
  const tasks = [
    { name: 'Frontend', cmd: $`npm run build:frontend` },
    { name: 'Backend', cmd: $`npm run build:backend` },
    { name: 'Docs', cmd: $`npm run build:docs` }
  ];
  
  const results = await Promise.allSettled(
    tasks.map(t => t.cmd)
  );
  
  results.forEach((result, index) => {
    const taskName = tasks[index].name;
    if (result.status === 'fulfilled') {
      console.log(`✅ ${taskName}: Success`);
    } else {
      console.error(`❌ ${taskName}: Failed - ${result.reason}`);
    }
  });
}

await parallelBuild();
```

## Using Configuration Files

For more complex automations, use Xec's configuration system:

### Create `.xec/config.yaml`

```yaml
name: my-project
description: My automation project

# Define reusable targets
targets:
  local:
    type: local
  staging:
    type: ssh
    host: staging.example.com
    username: deploy
  prod:
    type: ssh
    host: prod.example.com
    username: deploy

# Define automation tasks
tasks:
  build:
    description: Build the application
    steps:
      - name: Install dependencies
        command: npm install
      - name: Run build
        command: npm run build
      - name: Run tests
        command: npm test
        
  deploy:
    description: Deploy to environment
    targets: [staging, prod]
    steps:
      - name: Upload files
        command: rsync -av ./dist/ /app/
      - name: Restart service
        command: pm2 restart app
```

### Use Configuration in Scripts

```typescript
// config-based-automation.ts
import { $ } from '@xec-sh/core';
import { loadConfig } from '@xec-sh/cli';

async function runConfiguredTask() {
  const config = await loadConfig();
  
  // Run build task
  await $.task('build');
  
  // Deploy to staging only
  await $.task('deploy', { targets: ['staging'] });
  
  console.log('✅ Deployment completed!');
}

await runConfiguredTask();
```

## Best Practices

### 1. Always Handle Errors

```typescript
import { $ } from '@xec-sh/core';

// Use try-catch for error handling
try {
  await $`risky-command`;
} catch (error) {
  console.error('Command failed:', error.message);
  // Implement cleanup or recovery logic
}

// Or use nothrow() for non-critical commands
const result = await $`optional-command`.nothrow();
if (!result.ok) {
  console.warn('Optional command failed, continuing...');
}
```

### 2. Use Environment Variables Safely

```typescript
import { $ } from '@xec-sh/core';

// Set environment variables properly
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}

await $.env({ API_KEY: apiKey })`deploy-script`;

// Never log sensitive data
await $.quiet()`echo "API_KEY=${apiKey}" > .env`;
```

### 3. Provide Progress Feedback

```typescript
import { $ } from '@xec-sh/core';
import { spinner } from '@clack/prompts';

async function longRunningTask() {
  const s = spinner();
  
  s.start('Installing dependencies');
  await $`npm install`;
  s.stop('Dependencies installed');
  
  s.start('Building application');
  await $`npm run build`;
  s.stop('Build completed');
  
  s.start('Running tests');
  await $`npm test`;
  s.stop('Tests passed');
  
  console.log('✅ All tasks completed!');
}
```

### 4. Make Scripts Idempotent

```typescript
import { $ } from '@xec-sh/core';
import { existsSync } from 'fs';

async function idempotentSetup() {
  // Check if already set up
  if (existsSync('.env')) {
    console.log('Environment already configured');
  } else {
    await $`cp .env.example .env`;
    console.log('Created .env file');
  }
  
  // Use package manager's built-in idempotency
  await $`npm install`; // npm install is idempotent
  
  // Check before creating
  const dirExists = await $`test -d ./uploads`.nothrow();
  if (!dirExists.ok) {
    await $`mkdir -p ./uploads`;
    console.log('Created uploads directory');
  }
}
```

## Next Steps

Now that you've created your first automation:

1. **Explore Advanced Features**
   - Master [error handling](../advanced/error-handling.md)

2. **Try Different Environments**
   - Set up [SSH automation](../infrastructure/server-management.md)
   - Work with [Docker containers](../infrastructure/container-orchestration.md)
   - Manage [Kubernetes deployments](../infrastructure/container-orchestration.md)

3. **Build Complex Workflows**
   - Create [CI/CD pipelines](./ci-cd-pipelines.md)
   - Automate [deployments](./deployment.md)
   - Set up [test automation](./testing.md)

## Common Patterns

### Cleanup on Exit

```typescript
import { $ } from '@xec-sh/core';

let cleanup = false;

async function runWithCleanup() {
  try {
    // Your automation logic
    await $`npm run start-server`;
    
    // Wait for signal
    await new Promise(resolve => {
      process.on('SIGINT', resolve);
    });
  } finally {
    if (!cleanup) {
      cleanup = true;
      console.log('Cleaning up...');
      await $`npm run stop-server`.nothrow();
    }
  }
}
```

### Conditional Execution

```typescript
import { $ } from '@xec-sh/core';

async function conditionalDeploy() {
  // Check branch
  const branch = await $`git branch --show-current`;
  
  if (branch.stdout.trim() === 'main') {
    await $`npm run deploy:production`;
  } else if (branch.stdout.trim() === 'develop') {
    await $`npm run deploy:staging`;
  } else {
    console.log('Not on deployable branch');
  }
}
```

### Template with Variables

```typescript
import { $ } from '@xec-sh/core';

async function templateExample() {
  const version = '1.2.3';
  const env = 'staging';
  
  // Variables are safely escaped
  await $`docker build -t myapp:${version} .`;
  await $`docker tag myapp:${version} myapp:${env}`;
  await $`docker push myapp:${env}`;
}
```

## Troubleshooting

### Command Not Found

If commands aren't found, check your PATH:

```typescript
// Explicitly set PATH
await $.env({ 
  PATH: `${process.env.PATH}:/usr/local/bin` 
})`my-command`;

// Or use absolute paths
await $`/usr/local/bin/my-command`;
```

### Permission Denied

For commands requiring elevated privileges:

```typescript
// For local execution (will prompt for password)
await $`sudo systemctl restart nginx`;

// For remote execution, ensure proper SSH key setup
const server = $.ssh({
  host: 'server.example.com',
  username: 'admin',
  privateKey: '~/.ssh/id_rsa'
});
```

### Debugging Scripts

Enable verbose output for debugging:

```typescript
// Set verbose mode
$.verbose = true;

// Or use debug logging
if (process.env.DEBUG) {
  console.log('Debug info:', result);
}
```

## Summary

You've learned how to:
- ✅ Create basic automation scripts
- ✅ Handle errors properly
- ✅ Work with different environments
- ✅ Execute tasks in parallel
- ✅ Use configuration files
- ✅ Follow best practices

Continue your journey by exploring more advanced topics in our guides section.