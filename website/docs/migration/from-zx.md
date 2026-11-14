---
title: Migrating from zx/shelljs
description: Guide for migrating from Google's zx or shelljs to Xec
keywords: [migration, zx, shelljs, automation, scripting]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/core/src/core/process-context.ts
  - apps/xec/src/commands/run.ts
---

# Migrating from zx/shelljs to Xec {#migrating-from-zxshelljs-to-xec}

## Overview {#overview}

This guide helps you migrate from Google's zx or shelljs to Xec. While zx brought modern JavaScript to shell scripting, Xec extends this concept with multi-environment execution, better TypeScript support, and enterprise features like SSH/Docker/Kubernetes integration.

## Why Migrate to Xec? {#why-migrate-to-xec}

### zx Example {#zx-example}
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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

### shelljs Example {#shelljs-example}
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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

### Xec Advantages {#xec-advantages}

```typescript
// scripts/deploy.ts
import { $, glob, type ProcessPromise } from '@xec-sh/core';

// Multi-environment execution
await $`npm install`;                           // Local
await $.ssh('server')`npm install`;              // SSH
await $.docker('container')`npm install`;        // Docker
await $.k8s('pod')`npm install`;                 // Kubernetes

// Better TypeScript support with types
const result: ProcessPromise = $`git status`;
const files: string[] = await glob('**/*.ts');

// Advanced parallel execution
await $.parallel.all([
  $`npm run build`,
  $.ssh('server1')`npm test`,
  $.docker('container')`npm lint`
]);

// Enterprise features (SSH connections are pooled automatically)
await $.ssh('server')
  .retry({ maxRetries: 3 })`deploy.sh`;
```

**Benefits over zx/shelljs:**
- Multi-environment execution (SSH, Docker, K8s)
- Connection pooling and management
- Better error handling with Result types
- Full TypeScript with complete type definitions
- Parallel execution across environments
- Enterprise features (retry, timeout, pooling)

## Core API Mapping {#core-api-mapping}

### zx → Xec {#zx--xec}

| zx Feature | Xec Equivalent | Notes |
|------------|----------------|-------|
| `$\`command\`` | `$\`command\`` | Same syntax, more features |
| `cd()` | `$.cd()` or `process.chdir()` | Not global: `$.cd()` returns a new, scoped engine rather than mutating `$` |
| `fetch()` | `fetch()` | Same (native fetch) |
| `question()` | `question()` from `@xec-sh/kit` | Not part of `@xec-sh/core` |
| `sleep()` | `sleep()` | Same behavior |
| `glob()` | `glob()` | Same behavior |
| `fs` | `node:fs/promises` | Not re-exported; import Node's own module |
| `chalk` | `prism` from `@xec-sh/kit` | Built-in terminal styling; no extra Chalk dependency |
| `argv` | `argv` / `args` | zx's `argv` is minimist-parsed; Xec's `argv` is the raw array and `args` holds just the script's arguments — use `parseArgs(args)` for flags |
| `$.verbose` | `$.verbose` | Same behavior |
| `$.shell` | `$.shell()` | A method, not an assignable property |
| `nothrow()` | `nothrow()` | Returns Result type |
| `pipe()` | `pipe()` | Enhanced piping |
| `quiet()` | `quiet()` | Same behavior |

### shelljs → Xec {#shelljs--xec}

`fs` below is Node's own `node:fs/promises`; Xec does not re-export a filesystem module.

| shelljs Method | Xec Equivalent | Example |
|----------------|----------------|---------|
| `shell.exec()` | `$\`\`` | `await $\`command\`` |
| `shell.cd()` | `$.cd()` | `$.cd('/path')` |
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

## Common Pattern Migrations {#common-pattern-migrations}

### 1. Basic Command Execution {#1-basic-command-execution}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
#!/usr/bin/env zx

const branch = await $`git branch --show-current`;
console.log(`Current branch: ${branch}`);

const verbose = await $`ls -la`;

$.verbose = false;
const quiet = await $`npm install`;
```

**shelljs:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
const remoteBranch = await $.ssh('server')`git branch --show-current`;
const containerFiles = await $.docker('app')`ls -la`;
```

### 2. Error Handling {#2-error-handling}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
  console.error(error instanceof Error ? error.message : String(error));
  throw error;
}

// Result pattern (preferred)
const result = await $`might-fail`.nothrow();
if (!result.ok) {
  console.log('Command failed:', result.cause);
  // Access to structured error information
  console.log('Exit code:', result.exitCode);
  console.log('Stderr:', result.stderr);
}

// Multi-environment error handling
const results = await Promise.allSettled([
  $.ssh('server1')`deploy.sh`,
  $.ssh('server2')`deploy.sh`,
  $.ssh('server3')`deploy.sh`
]);

const failed = results.filter(r => r.status === 'rejected');
```

### 3. File Operations {#3-file-operations}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
import { fs } from 'zx';

const files = await fs.readdir('.');
await fs.writeFile('output.txt', 'content');
await fs.rm('temp', { recursive: true });

const configs = await glob('**/*.json');
```

**shelljs:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
shell.ls('-la', '.');
shell.echo('content').to('output.txt');
shell.rm('-rf', 'temp');

const configs = shell.ls('**/*.json');
```

**Xec:**
```typescript
import { glob } from '@xec-sh/core';
import * as fs from 'node:fs/promises';

const files = await fs.readdir('.');
await fs.writeFile('output.txt', 'content');
await fs.rm('temp', { recursive: true });

const configs = await glob('**/*.json');

// Xec additions: remote file operations
await $`xec copy local.txt server:/remote/`;
await $.ssh('server')`cat /remote/local.txt`;

// Docker file operations
await $.transfer.copy('local.txt', 'docker://container:/app/local.txt');
```

### 4. Working Directory {#4-working-directory}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
import { $, within } from '@xec-sh/core';

// $.cd() returns a new, scoped engine rather than mutating $ in place
const tmp = $.cd('/tmp');
await tmp`pwd`; // /tmp
await $`pwd`; // unaffected — the original $ never changed

// Scoped directory change
await within('/tmp', async () => {
  await $`pwd`; // /tmp
});
await $`pwd`; // back to original

// Remote directory context
await $.ssh('server')`cd /app && npm install`;
```

### 5. Environment Variables {#5-environment-variables}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
process.env.NODE_ENV = 'production';
await $`echo $NODE_ENV`;

await $`NODE_ENV=production npm run build`;
```

**shelljs:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
await $.ssh('server').env({ NODE_ENV: 'production' })`npm run build`;

// Docker environment
await $.docker('container')
  .env({ NODE_ENV: 'production' })`npm run build`;
```

### 6. Piping and Streams {#6-piping-and-streams}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
await $`cat file.txt | grep pattern | wc -l`;

const proc1 = $`echo "hello"`;
const proc2 = $`cat`;
await proc1.pipe(proc2);
```

**shelljs:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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
for await (const line of $`tail -f /var/log/app.log`) {
  console.log(line);
}

// Remote streaming
for await (const line of $.ssh('server')`tail -f /var/log/app.log`) {
  console.log(line);
}
```

## Advanced Migration Patterns {#advanced-migration-patterns}

### 1. Parallel Execution {#1-parallel-execution}

**zx:**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
// Basic parallel
await Promise.all([
  $`npm run build`,
  $`npm run test`,
  $`npm run lint`
]);

// This example starts all promises at once
```

**Xec:**
```typescript
// Basic parallel
await Promise.all([
  $`npm run build`,
  $`npm run test`,
  $`npm run lint`
]);

// The callback creates each command only when its concurrency slot opens.
const servers = ['server1.example.com', 'server2.example.com'];
await $.parallel.map(servers,
  host => $.ssh({ host, username: 'deploy' })`node --version`,
  { maxConcurrency: 2 }
);
```

### 2. Remote Execution {#2-remote-execution}

**zx (Limited):**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```javascript
// Manual SSH commands
await $`ssh user@server "cd /app && npm install"`;
await $`scp local.txt user@server:/remote/`;

// This script invokes a separate OpenSSH process for each command
for (const server of servers) {
  await $`ssh ${server} "deploy.sh"`;
}
```

**Xec:**
```typescript
const servers = ['server1.example.com', 'server2.example.com'];
// Native SSH support
await $.ssh('server')`cd /app && npm install`;
await $`xec copy local.txt server:/remote/`;

// Connection pooling is on by default; tune it once, up front, if needed
import { configure } from '@xec-sh/core';
configure({ adapters: { ssh: { connectionPool: { maxConnections: 5 } } } });

await Promise.all(
  servers.map(server =>
    $.ssh(server)`deploy.sh`
  )
);

// Docker execution
await $.docker('container')`npm install`;

// Kubernetes execution
await $.k8s({ pod: 'pod-name', namespace: 'default' })`node --version`;
```

### 3. Configuration and Tasks {#3-configuration-and-tasks}

**zx (Manual):**
<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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

const task = args[0];
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

Programmatic task definition (as opposed to the YAML form above) is provided by `@xec-sh/ops`, not `@xec-sh/core`.

## Complex Script Migration {#complex-script-migration}

### Original zx Script {#original-zx-script}

<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
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

### Migrated to Xec {#migrated-to-xec}

```typescript
// scripts/deploy.ts
import { $, glob, sleep } from '@xec-sh/core';
import { prism as chalk } from '@xec-sh/kit';
import * as fs from 'node:fs/promises';

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

// Enhanced server check — SSH connections are pooled automatically
async function checkServer(server: string): Promise<boolean> {
  const result = await $.ssh(server)`echo "Server accessible"`
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
  await $.withSpinner('Building application...', async () => {
    await fs.rm(config.buildDir, { recursive: true, force: true });
    await $`npm run build`;

    const files = await glob(`${config.buildDir}/**/*`);
    console.log(chalk.green(`Built ${files.length} files`));
  });
}

// Deploy with enhanced error handling and rollback
async function deployToServer(server: string): Promise<void> {
  try {
    await $.withSpinner(`Deploying to ${server}...`, async () => {
      // Create backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = `${config.deployDir}.backup-${timestamp}`;

      await $.ssh(server)`cp -r ${config.deployDir} ${backupDir}`;

      // Copy files with progress
      await $`xec copy ${config.buildDir}/ ${server}:${config.deployDir}/`;

      // Graceful restart
      await $.ssh(server)`systemctl reload app || systemctl restart app`;

      // Health check, capped at 10s
      await sleep(2000);

      const healthCheck = await fetch(`http://${server}${config.healthCheckUrl}`, {
        signal: AbortSignal.timeout(10000)
      });

      if (!healthCheck.ok) {
        throw new Error(`Health check failed: ${healthCheck.status}`);
      }

      // Clean old backups (keep last 3)
      await $.ssh(server)`
        ls -dt ${config.deployDir}.backup-* |
        tail -n +4 |
        xargs rm -rf
      `.nothrow();
    });

    console.log(chalk.green(`Successfully deployed to ${server}`));
  } catch (error) {
    if (config.rollbackOnFailure) {
      console.log(chalk.yellow(`Rolling back ${server}...`));

      await $.ssh(server)`
        rm -rf ${config.deployDir} &&
        mv ${config.deployDir}.backup-* ${config.deployDir} &&
        systemctl restart app
      `;

      console.log(chalk.green(`Rolled back ${server}`));
    }

    throw error;
  }
}

// Main execution with enhanced features
async function main(): Promise<void> {
  const start = performance.now();

  // Parallel server checks — SSH connections are pooled automatically
  console.log(chalk.blue('Checking servers...'));

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

  // Close pooled SSH connections
  await $.dispose();
}

// Error handling and execution
await main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
```

## Feature Comparison {#feature-comparison}

### Features Available in Both {#features-available-in-both}

- Template literal command execution
- File system operations
- Glob pattern matching
- Process control (cd, env)
- Promise-based async operations
- Colored output (chalk)
- HTTP requests (fetch)

### Xec Exclusive Features {#xec-exclusive-features}

| Feature | Description | Example |
|---------|-------------|---------|
| SSH Execution | Native SSH with pooling | `$.ssh('server')\`command\`` |
| Docker Support | Container execution | `$.docker('name')\`cmd\`` |
| Kubernetes | Pod execution | `$.k8s('pod')\`cmd\`` |
| Connection Pooling | Reuse connections, on by default | `configure({ adapters: { ssh: { connectionPool: { maxConnections: 10 } } } })` |
| Retry Logic | Automatic retries | `$.ssh('server').retry({ maxRetries: 3 })` |
| Timeout Control | Command timeouts | `.timeout(5000)` |
| Result Types | Structured errors | `result.ok, result.cause` |
| Task System | Configuration-based | `.xec/config.yaml` |
| Multi-target | Execute on multiple | `Promise.all(hosts.map(h => $.ssh(h)\`cmd\`))` |
| File Transfer | Cross-environment | `xec copy src dst` |

## Migration Strategy {#migration-strategy}

### Phase 1: Setup {#phase-1-setup}
```bash
# Install Xec
npm install -g @xec-sh/cli
npm install @xec-sh/core

# Keep zx during transition
npm install zx
```

### Phase 2: Gradual Migration {#phase-2-gradual-migration}

<!-- doc-check: skip — zx or ShellJS comparison uses its original runtime and dependencies, not Xec -->
```typescript
// hybrid-script.ts
import { $ as zx$ } from 'zx';
import { $ as xec$ } from '@xec-sh/core';

// Use zx for local operations
await zx$`npm install`;

// Use Xec for remote operations
await xec$.ssh('server')`npm install`;

// Gradually replace zx calls with Xec
```

### Phase 3: Complete Migration {#phase-3-complete-migration}

1. Replace all zx imports with Xec
2. Convert to TypeScript for better types
3. Add multi-environment features
4. Implement connection pooling
5. Add retry and timeout logic

## Common Pitfalls {#common-pitfalls}

### 1. Global Imports {#1-global-imports}
**zx:** `import 'zx/globals'` makes everything global
**Xec:** Explicit imports preferred for clarity

### 2. Error Handling {#2-error-handling-1}
**zx:** Throws by default
**Xec:** Use `.nothrow()` for Result pattern

### 3. Shell Differences {#3-shell-differences}
**zx:** Uses system shell
**Xec:** Consistent cross-platform shell

## Summary {#summary}

Migrating from zx/shelljs to Xec provides:
- ✅ Multi-environment execution (SSH, Docker, K8s)
- ✅ Connection pooling and management
- ✅ Enterprise features (retry, timeout)
- ✅ Better TypeScript support
- ✅ Configuration-based tasks
- ✅ Cross-environment file operations

Start with local scripts and gradually add multi-environment features to leverage Xec's full capabilities!