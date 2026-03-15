---
title: Migrating from zx/shelljs
description: Guide for migrating from Google's zx or shelljs to Xec
keywords: [migration, zx, shelljs, automation, scripting]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/core/src/core/process-promise.ts
  - apps/xec/src/script-runner.ts
verification_date: 2025-08-03
---

# Migrating from zx/shelljs to Xec

## Overview

This guide helps you migrate from Google's zx or shelljs to Xec. While zx brought modern JavaScript to shell scripting, Xec extends this concept with multi-environment execution, better TypeScript support, and enterprise features like SSH/Docker/Kubernetes integration.

## Why Migrate to Xec?

### zx Example
```javascript
#!/usr/bin/env zx

import 'zx/globals';

$.verbose = false;

const branch = await $`git branch --show-current`;
const files = await glob('src/**/*.ts');

cd('/tmp');

await $`npm install`;

// Limited to local execution
await $`ssh user@server "cd /app && npm install"`;

// No built-in parallelization control
await Promise.all([
  $`npm run build`,
  $`npm run test`
]);
```

### shelljs Example
```javascript
const shell = require('shelljs');

if (!shell.which('git')) {
  shell.echo('Git is required');
  shell.exit(1);
}

shell.cd('/tmp');
shell.rm('-rf', 'dist');

const result = shell.exec('npm install');
if (result.code !== 0) {
  shell.echo('Error: npm install failed');
  shell.exit(1);
}

// Synchronous by default, limited async support
shell.cp('-R', 'src/', 'dist/');
```

### Xec Advantages

```typescript
// scripts/deploy.ts
import { $, on, glob } from '@xec-sh/core';

// Multi-environment execution
await $`npm install`;                           // Local
await on('server', 'npm install');              // SSH
await $.docker('container')`npm install`;       // Docker
await $.k8s('pod')`npm install`;               // Kubernetes

// Better TypeScript support with types
const result: ProcessPromise = $`git status`;
const files: string[] = await glob('**/*.ts');

// Advanced parallel execution
await $.parallel([
  $`npm run build`,
  on('server1', 'npm test'),
  $.docker('container')`npm lint`
]);

// Enterprise features
await $.ssh('server')
  .withPool({ max: 10 })
  .withRetry({ attempts: 3 })`deploy.sh`;
```

**Benefits over zx/shelljs:**
- Multi-environment execution (SSH, Docker, K8s)
- Connection pooling and management
- Better error handling with Result types
- Full TypeScript with complete type definitions
- Parallel execution across environments
- Enterprise features (retry, timeout, pooling)

## Core API Mapping

### zx → Xec

| zx Feature | Xec Equivalent | Notes |
|------------|----------------|-------|
| `$\`command\`` | `$\`command\`` | Same syntax, more features |
| `cd()` | `cd()` or `process.chdir()` | Same behavior |
| `fetch()` | `fetch()` | Same (native fetch) |
| `question()` | `question()` | Enhanced prompts |
| `sleep()` | `sleep()` | Same behavior |
| `glob()` | `glob()` | Same behavior |
| `fs` | `fs` | Same (from 'fs/promises') |
| `chalk` | `chalk` | Same package |
| `argv` | `process.argv` | Standard Node.js |
| `$.verbose` | `$.verbose` | Same behavior |
| `$.shell` | `$.shell` | Enhanced shell selection |
| `nothrow()` | `nothrow()` | Returns Result type |
| `pipe()` | `pipe()` | Enhanced piping |
| `quiet()` | `quiet()` | Same behavior |

### shelljs → Xec

| shelljs Method | Xec Equivalent | Example |
|----------------|----------------|---------|
| `shell.exec()` | `$\`\`` | `await $\`command\`` |
| `shell.cd()` | `cd()` | `cd('/path')` |
| `shell.pwd()` | `process.cwd()` | `process.cwd()` |
| `shell.ls()` | `$\`ls\`` or `fs.readdir()` | `await fs.readdir('.')` |
| `shell.cp()` | `$\`cp\`` or `fs.cp()` | `await fs.cp(src, dest)` |
| `shell.mv()` | `$\`mv\`` or `fs.rename()` | `await fs.rename(old, new)` |
| `shell.rm()` | `$\`rm\`` or `fs.rm()` | `await fs.rm(path)` |
| `shell.mkdir()` | `fs.mkdir()` | `await fs.mkdir(dir)` |
| `shell.test()` | `fs.stat()` | `await fs.stat(path)` |
| `shell.cat()` | `fs.readFile()` | `await fs.readFile(file)` |
| `shell.which()` | `$\`which\`` | `await $\`which cmd\`` |
| `shell.echo()` | `console.log()` | `console.log(msg)` |
| `shell.grep()` | `$\`grep\`` | `await $\`grep pattern\`` |
| `shell.sed()` | `$\`sed\`` | `await $\`sed s/a/b/\`` |
| `shell.exit()` | `process.exit()` | `process.exit(code)` |

## Common Pattern Migrations

### 1. Basic Command Execution

**zx:**
```javascript
#!/usr/bin/env zx

const branch = await $`git branch --show-current`;
console.log(`Current branch: ${branch}`);

const verbose = await $`ls -la`;

$.verbose = false;
const quiet = await $`npm install`;
```

**shelljs:**
```javascript
const result = shell.exec('git branch --show-current', { silent: true });
if (result.code === 0) {
  console.log(`Current branch: ${result.stdout}`);
}

shell.exec('ls -la');

shell.exec('npm install', { silent: true });
```

**Xec:**
```typescript
import { $ } from '@xec-sh/core';

const branch = await $`git branch --show-current`.text();
console.log(`Current branch: ${branch}`);

const verbose = await $`ls -la`;

const quiet = await $`npm install`.quiet();

// Xec additions: multi-environment
const remoteBranch = await on('server', 'git branch --show-current');
const containerFiles = await $.docker('app')`ls -la`;
```

### 2. Error Handling

**zx:**
```javascript
try {
  await $`exit 1`;
} catch (p) {
  console.log(`Exit code: ${p.exitCode}`);
  console.log(`Error: ${p.stderr}`);
}

// Or with nothrow
const result = await $`might-fail`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed');
}
```

**shelljs:**
```javascript
const result = shell.exec('exit 1');
if (result.code !== 0) {
  console.error('Command failed');
  console.error(result.stderr);
}

shell.config.fatal = true; // Exit on error
shell.exec('might-fail');
```

**Xec:**
```typescript
import { $ } from '@xec-sh/core';

// Try-catch style
try {
  await $`exit 1`;
} catch (error) {
  console.log(`Exit code: ${error.exitCode}`);
  console.log(`Error: ${error.stderr}`);
}

// Result pattern (preferred)
const result = await $`might-fail`.nothrow();
if (!result.ok) {
  console.log('Command failed:', result.error);
  // Access to structured error information
  console.log('Exit code:', result.exitCode);
  console.log('Stderr:', result.stderr);
}

// Multi-environment error handling
const results = await Promise.allSettled([
  on('server1', 'deploy.sh'),
  on('server2', 'deploy.sh'),
  on('server3', 'deploy.sh')
]);

const failed = results.filter(r => r.status === 'rejected');
```

### 3. File Operations

**zx:**
```javascript
import { fs } from 'zx';

const files = await fs.readdir('.');
await fs.writeFile('output.txt', 'content');
await fs.rm('temp', { recursive: true });

const configs = await glob('**/*.json');
```

**shelljs:**
```javascript
shell.ls('-la', '.');
shell.echo('content').to('output.txt');
shell.rm('-rf', 'temp');

const configs = shell.ls('**/*.json');
```

**Xec:**
```typescript
import { fs, glob } from '@xec-sh/core';

const files = await fs.readdir('.');
await fs.writeFile('output.txt', 'content');
await fs.rm('temp', { recursive: true });

const configs = await glob('**/*.json');

// Xec additions: remote file operations
await $`xec copy local.txt server:/remote/`;
await on('server', 'cat /remote/local.txt');

// Docker file operations
await $.docker('container').copy('local.txt', '/app/');
```

### 4. Working Directory

**zx:**
```javascript
const cwd = process.cwd();
cd('/tmp');
await $`pwd`; // /tmp
cd(cwd);

within(async () => {
  cd('/tmp');
  await $`pwd`; // /tmp
});
await $`pwd`; // back to original
```

**shelljs:**
```javascript
const cwd = shell.pwd();
shell.cd('/tmp');
shell.exec('pwd'); // /tmp
shell.cd(cwd);

shell.pushd('/tmp');
shell.exec('pwd'); // /tmp
shell.popd();
```

**Xec:**
```typescript
import { $ } from '@xec-sh/core';

const cwd = process.cwd();
cd('/tmp');
await $`pwd`; // /tmp
cd(cwd);

// Scoped directory change
await $.within('/tmp', async () => {
  await $`pwd`; // /tmp
});
await $`pwd`; // back to original

// Remote directory context
await on('server', 'cd /app && npm install');
```

### 5. Environment Variables

**zx:**
```javascript
process.env.NODE_ENV = 'production';
await $`echo $NODE_ENV`;

await $`NODE_ENV=production npm run build`;
```

**shelljs:**
```javascript
shell.env.NODE_ENV = 'production';
shell.exec('echo $NODE_ENV');

shell.exec('NODE_ENV=production npm run build');
```

**Xec:**
```typescript
// Local environment
process.env.NODE_ENV = 'production';
await $`echo $NODE_ENV`;

// With env option
await $.env({ NODE_ENV: 'production' })`npm run build`;

// Remote environment
await on('server').env({ NODE_ENV: 'production' })`npm run build`;

// Docker environment
await $.docker('container')
  .env({ NODE_ENV: 'production' })`npm run build`;
```

### 6. Piping and Streams

**zx:**
```javascript
await $`cat file.txt | grep pattern | wc -l`;

const proc1 = $`echo "hello"`;
const proc2 = $`cat`;
await proc1.pipe(proc2);
```

**shelljs:**
```javascript
shell.cat('file.txt').grep('pattern').exec('wc -l');

// Limited pipe support
shell.echo('hello').exec('cat', { silent: true });
```

**Xec:**
```typescript
// Shell pipe
await $`cat file.txt | grep pattern | wc -l`;

// Programmatic pipe
const proc1 = $`echo "hello"`;
const proc2 = $`cat`;
await proc1.pipe(proc2);

// Advanced streaming
const stream = $`tail -f /var/log/app.log`.stream();
stream.on('data', (chunk) => {
  console.log(chunk.toString());
});

// Remote streaming
const remoteLog = on('server', 'tail -f /var/log/app.log').stream();
```

## Advanced Migration Patterns

### 1. Parallel Execution

**zx:**
```javascript
// Basic parallel
await Promise.all([
  $`npm run build`,
  $`npm run test`,
  $`npm run lint`
]);

// No built-in concurrency control
```

**Xec:**
```typescript
// Basic parallel
await Promise.all([
  $`npm run build`,
  $`npm run test`,
  $`npm run lint`
]);

// Parallel with concurrency limit
import pLimit from 'p-limit';
const limit = pLimit(2);

await Promise.all(
  servers.map(server => 
    limit(() => on(server, 'deploy.sh'))
  )
);

// Built-in parallel execution
await $.parallel([
  $`npm run build`,
  on('server', 'npm test'),
  $.docker('container')`npm lint`
], { concurrency: 2 });
```

### 2. Remote Execution

**zx (Limited):**
```javascript
// Manual SSH commands
await $`ssh user@server "cd /app && npm install"`;
await $`scp local.txt user@server:/remote/`;

// No connection management
for (const server of servers) {
  await $`ssh ${server} "deploy.sh"`;
}
```

**Xec:**
```typescript
// Native SSH support
await on('server', 'cd /app && npm install');
await $`xec copy local.txt server:/remote/`;

// Connection pooling
const pool = $.pool({ max: 5 });
await Promise.all(
  servers.map(server => 
    pool.on(server, 'deploy.sh')
  )
);

// Docker execution
await $.docker('container')`npm install`;

// Kubernetes execution
await $.k8s('pod-name')`kubectl get pods`;
```

### 3. Configuration and Tasks

**zx (Manual):**
```javascript
// No built-in task system
const tasks = {
  build: async () => await $`npm run build`,
  test: async () => await $`npm test`,
  deploy: async () => {
    await tasks.build();
    await tasks.test();
    await $`deploy.sh`;
  }
};

const task = process.argv[2];
if (tasks[task]) {
  await tasks[task]();
}
```

**Xec:**
```yaml
# .xec/config.yaml
tasks:
  build:
    command: npm run build
    
  test:
    command: npm test
    
  deploy:
    needs: [build, test]
    steps:
      - name: Deploy to staging
        targets: staging
        command: deploy.sh
      - name: Deploy to production
        targets: production
        command: deploy.sh
        when: ${params.env} == 'prod'
```

```typescript
// Or programmatically
import { defineTask } from '@xec-sh/core';

defineTask('deploy', {
  needs: ['build', 'test'],
  async execute() {
    await on('staging', 'deploy.sh');
    if (process.env.ENV === 'prod') {
      await on('production', 'deploy.sh');
    }
  }
});
```

## Complex Script Migration

### Original zx Script

```javascript
#!/usr/bin/env zx

import 'zx/globals';

$.verbose = true;

// Configuration
const servers = ['web1', 'web2', 'web3'];
const buildDir = 'dist';
const deployDir = '/var/www/app';

// Helper functions
async function checkServer(server) {
  try {
    await $`ssh ${server} "echo 'Server ${server} is accessible'"`;
    return true;
  } catch {
    console.error(chalk.red(`Server ${server} is not accessible`));
    return false;
  }
}

async function buildApp() {
  console.log(chalk.blue('Building application...'));
  
  await $`rm -rf ${buildDir}`;
  await $`npm run build`;
  
  const files = await glob(`${buildDir}/**/*`);
  console.log(chalk.green(`Built ${files.length} files`));
}

async function deployToServer(server) {
  console.log(chalk.yellow(`Deploying to ${server}...`));
  
  // Create backup
  await $`ssh ${server} "cp -r ${deployDir} ${deployDir}.backup"`;
  
  // Copy files
  await $`rsync -avz --delete ${buildDir}/ ${server}:${deployDir}/`;
  
  // Restart service
  await $`ssh ${server} "systemctl restart app"`;
  
  // Health check
  await sleep(2000);
  const response = await fetch(`http://${server}/health`);
  
  if (!response.ok) {
    console.error(chalk.red(`Health check failed for ${server}`));
    // Rollback
    await $`ssh ${server} "rm -rf ${deployDir} && mv ${deployDir}.backup ${deployDir}"`;
    await $`ssh ${server} "systemctl restart app"`;
    throw new Error(`Deployment failed for ${server}`);
  }
  
  console.log(chalk.green(`Successfully deployed to ${server}`));
}

// Main execution
async function main() {
  const start = Date.now();
  
  // Check all servers
  console.log(chalk.blue('Checking servers...'));
  const serverStatus = await Promise.all(
    servers.map(checkServer)
  );
  
  const availableServers = servers.filter((_, i) => serverStatus[i]);
  
  if (availableServers.length === 0) {
    console.error(chalk.red('No servers available'));
    process.exit(1);
  }
  
  // Build application
  await buildApp();
  
  // Deploy to servers
  console.log(chalk.blue('Starting deployment...'));
  
  const deployments = [];
  for (const server of availableServers) {
    deployments.push(deployToServer(server));
  }
  
  try {
    await Promise.all(deployments);
    console.log(chalk.green('Deployment completed successfully!'));
  } catch (error) {
    console.error(chalk.red('Deployment failed:'), error);
    process.exit(1);
  }
  
  const duration = (Date.now() - start) / 1000;
  console.log(chalk.cyan(`Total time: ${duration}s`));
}

await main();
```

### Migrated to Xec

```typescript
// scripts/deploy.ts
import { $, on, glob, sleep, chalk, spinner } from '@xec-sh/core';

// Type-safe configuration
interface DeployConfig {
  servers: string[];
  buildDir: string;
  deployDir: string;
  healthCheckUrl: string;
  rollbackOnFailure: boolean;
}

const config: DeployConfig = {
  servers: ['web1', 'web2', 'web3'],
  buildDir: 'dist',
  deployDir: '/var/www/app',
  healthCheckUrl: '/health',
  rollbackOnFailure: true
};

// Enhanced server check with connection pooling
async function checkServer(server: string): Promise<boolean> {
  const result = await on(server, 'echo "Server accessible"')
    .timeout(5000)
    .nothrow();
  
  if (!result.ok) {
    console.error(chalk.red(`Server ${server} is not accessible`));
    return false;
  }
  
  return true;
}

// Build with progress tracking
async function buildApp(): Promise<void> {
  const spin = spinner('Building application...').start();
  
  try {
    await fs.rm(config.buildDir, { recursive: true, force: true });
    await $`npm run build`;
    
    const files = await glob(`${config.buildDir}/**/*`);
    spin.succeed(`Built ${files.length} files`);
  } catch (error) {
    spin.fail('Build failed');
    throw error;
  }
}

// Deploy with enhanced error handling and rollback
async function deployToServer(server: string): Promise<void> {
  const spin = spinner(`Deploying to ${server}...`).start();
  
  try {
    // Create backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `${config.deployDir}.backup-${timestamp}`;
    
    await on(server, `cp -r ${config.deployDir} ${backupDir}`);
    
    // Copy files with progress
    await $`xec copy ${config.buildDir}/ ${server}:${config.deployDir}/`;
    
    // Graceful restart
    await on(server, 'systemctl reload app || systemctl restart app');
    
    // Enhanced health check
    spin.text = `Health check for ${server}...`;
    await sleep(2000);
    
    const healthCheck = await fetch(`http://${server}${config.healthCheckUrl}`)
      .timeout(10000)
      .retry(3);
    
    if (!healthCheck.ok) {
      throw new Error(`Health check failed: ${healthCheck.status}`);
    }
    
    // Clean old backups (keep last 3)
    await on(server, `
      ls -dt ${config.deployDir}.backup-* | 
      tail -n +4 | 
      xargs rm -rf
    `).nothrow();
    
    spin.succeed(`Successfully deployed to ${server}`);
  } catch (error) {
    spin.fail(`Deployment failed for ${server}`);
    
    if (config.rollbackOnFailure) {
      console.log(chalk.yellow(`Rolling back ${server}...`));
      
      await on(server, `
        rm -rf ${config.deployDir} &&
        mv ${config.deployDir}.backup-* ${config.deployDir} &&
        systemctl restart app
      `);
      
      console.log(chalk.green(`Rolled back ${server}`));
    }
    
    throw error;
  }
}

// Main execution with enhanced features
async function main(): Promise<void> {
  const start = performance.now();
  
  // Parallel server checks with connection pool
  console.log(chalk.blue('Checking servers...'));
  
  const pool = $.pool({ max: 10, idleTimeout: 30000 });
  const serverStatus = await Promise.all(
    config.servers.map(server => checkServer(server))
  );
  
  const availableServers = config.servers.filter((_, i) => serverStatus[i]);
  
  if (availableServers.length === 0) {
    throw new Error('No servers available');
  }
  
  console.log(chalk.green(`Available servers: ${availableServers.join(', ')}`));
  
  // Build application
  await buildApp();
  
  // Deploy with strategies
  console.log(chalk.blue('Starting deployment...'));
  
  const strategy = process.env.DEPLOY_STRATEGY || 'parallel';
  
  if (strategy === 'rolling') {
    // Rolling deployment
    for (const server of availableServers) {
      await deployToServer(server);
      await sleep(5000); // Wait between deployments
    }
  } else if (strategy === 'canary') {
    // Canary deployment
    await deployToServer(availableServers[0]);
    console.log(chalk.yellow('Canary deployment complete. Monitoring...'));
    await sleep(30000); // Monitor canary
    
    // Deploy to rest
    await Promise.all(
      availableServers.slice(1).map(deployToServer)
    );
  } else {
    // Parallel deployment (default)
    await Promise.all(
      availableServers.map(deployToServer)
    );
  }
  
  const duration = (performance.now() - start) / 1000;
  console.log(chalk.cyan(`✨ Deployment completed in ${duration.toFixed(2)}s`));
  
  // Cleanup connection pool
  await pool.destroy();
}

// Error handling and execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}
```

## Feature Comparison

### Features Available in Both

- Template literal command execution
- File system operations
- Glob pattern matching
- Process control (cd, env)
- Promise-based async operations
- Colored output (chalk)
- HTTP requests (fetch)

### Xec Exclusive Features

| Feature | Description | Example |
|---------|-------------|---------|
| SSH Execution | Native SSH with pooling | `on('server', 'command')` |
| Docker Support | Container execution | `$.docker('name')\`cmd\`` |
| Kubernetes | Pod execution | `$.k8s('pod')\`cmd\`` |
| Connection Pooling | Reuse connections | `$.pool({ max: 10 })` |
| Retry Logic | Automatic retries | `.retry({ attempts: 3 })` |
| Timeout Control | Command timeouts | `.timeout(5000)` |
| Result Types | Structured errors | `result.ok, result.error` |
| Task System | Configuration-based | `.xec/config.yaml` |
| Multi-target | Execute on multiple | `on(['s1', 's2'], 'cmd')` |
| File Transfer | Cross-environment | `xec copy src dst` |

## Migration Strategy

### Phase 1: Setup
```bash
# Install Xec
npm install -g @xec-sh/cli
npm install @xec-sh/core

# Keep zx during transition
npm install zx
```

### Phase 2: Gradual Migration

```typescript
// hybrid-script.ts
import { $ as zx$ } from 'zx';
import { $ as xec$, on } from '@xec-sh/core';

// Use zx for local operations
await zx$`npm install`;

// Use Xec for remote operations
await on('server', 'npm install');

// Gradually replace zx calls with Xec
```

### Phase 3: Complete Migration

1. Replace all zx imports with Xec
2. Convert to TypeScript for better types
3. Add multi-environment features
4. Implement connection pooling
5. Add retry and timeout logic

## Common Pitfalls

### 1. Global Imports
**zx:** `import 'zx/globals'` makes everything global
**Xec:** Explicit imports preferred for clarity

### 2. Error Handling
**zx:** Throws by default
**Xec:** Use `.nothrow()` for Result pattern

### 3. Shell Differences
**zx:** Uses system shell
**Xec:** Consistent cross-platform shell

## Summary

Migrating from zx/shelljs to Xec provides:
- ✅ Multi-environment execution (SSH, Docker, K8s)
- ✅ Connection pooling and management
- ✅ Enterprise features (retry, timeout)
- ✅ Better TypeScript support
- ✅ Configuration-based tasks
- ✅ Cross-environment file operations

Start with local scripts and gradually add multi-environment features to leverage Xec's full capabilities!