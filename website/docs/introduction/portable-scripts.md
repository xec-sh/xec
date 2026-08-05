---
title: Portable Scripts
description: Write once, run anywhere - universal scripts with $target
keywords: [$target, portable, universal, multi-environment, context]
sidebar_position: 5
---

# Portable Scripts

One of Xec's most powerful features is the ability to write scripts that work identically across different environments - local, SSH, Docker, and Kubernetes - without modification.

## The $target Concept

When you execute a script with Xec's CLI commands (`xec run`, `xec on`, `xec in`), the execution engine injects two globals into your script's context: `$target`, an execution engine bound to the current target — run commands through it and they execute there — and `$targetInfo`, a plain object describing that target. Plain `$` always executes locally, whatever the target.

### How It Works

```javascript
// deploy.js - A universal deployment script
console.log(`Deploying to: ${$targetInfo.type}`);
console.log(`Target name: ${$targetInfo.name}`);

// This same code works everywhere — $target routes each
// command to whatever environment the script was launched against:
await $target`npm install`;
await $target`npm run build`;
await $target`pm2 restart app`;
```

Run this script in any environment:

```bash
# Local execution
xec run deploy.js
# Output: Deploying to: local

# SSH execution
xec on prod-server deploy.js
# Output: Deploying to: ssh

# Docker execution
xec in my-container deploy.js
# Output: Deploying to: docker

# Kubernetes execution
xec in my-pod deploy.js
# Output: Deploying to: kubernetes
```

## The Magic: Automatic Context Injection

When you use CLI commands to execute scripts, Xec:

1. **Creates an execution context** based on the target
2. **Injects `$target` and `$targetInfo` globally** into your script
3. **Routes `$target` commands** through the appropriate adapter
4. **Maintains consistent behavior** across environments

### Example: Universal Health Check

```javascript
// health-check.js
const checks = {
  local: async () => {
    const disk = await $target`df -h /`.text();
    const memory = await $target`free -m`.text();
    return { disk, memory };
  },
  
  ssh: async () => {
    const uptime = await $target`uptime`.text();
    const connections = await $target`ss -tun | wc -l`.text();
    return { uptime, connections };
  },
  
  docker: async () => {
    const processes = await $target`ps aux`.text();
    const network = await $target`netstat -an`.text();
    return { processes, network };
  },
  
  kubernetes: async () => {
    const pods = await $target`cat /etc/hostname`.text();
    const memory = await $target`cat /sys/fs/cgroup/memory.max`.text();
    return { pods, memory };
  }
};

// Run environment-specific checks
const results = await checks[$targetInfo.type]();
console.log(`Health check for ${$targetInfo.name}:`, results);
```

## $targetInfo Properties

`$target` itself is an execution engine — call it with a template literal. The
metadata lives on `$targetInfo`:

```typescript
interface TargetInfo {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  name?: string;       // Target name from config
  host?: string;       // SSH targets
  container?: string;  // Docker targets
  pod?: string;        // Kubernetes targets
  namespace?: string;  // Kubernetes targets
  config: any;         // Full resolved target configuration
}
```

### Accessing Target Information

```javascript
// script.js
console.log('Execution context:');
console.log(`  Type: ${$targetInfo.type}`);
console.log(`  Name: ${$targetInfo.name}`);

if ($targetInfo.type === 'ssh') {
  console.log(`  Host: ${$targetInfo.host}`);
} else if ($targetInfo.type === 'docker') {
  console.log(`  Container: ${$targetInfo.container}`);
} else if ($targetInfo.type === 'kubernetes') {
  console.log(`  Pod: ${$targetInfo.pod}`);
  console.log(`  Namespace: ${$targetInfo.namespace}`);
}
```

## Real-World Use Cases

### 1. Universal Build Script

```javascript
// build.js
console.log(`Building on ${$targetInfo.type} environment`);

// Clean previous build
await $target`rm -rf dist`;

// Install dependencies
await $target`npm ci`;

// Run build
await $target`npm run build`;

// Run tests
const testResult = await $target`npm test`.nothrow();
if (!testResult.ok) {
  console.error('Tests failed!');
  process.exit(1);
}

// Deploy if tests pass
if ($targetInfo.type === 'ssh' && $targetInfo.name.includes('prod')) {
  await $target`pm2 restart app`;
  console.log('Production deployment complete');
} else {
  console.log('Build complete (no deployment for this target)');
}
```

### 2. Multi-Environment Database Backup

```javascript
// backup.js — pg_dump connects over the network, so the commands
// themselves run locally; the target only selects the connection string.
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backup-${$targetInfo.name}-${timestamp}.sql`;

// Environment-specific connection strings
const connections = {
  local: 'postgresql://localhost/myapp',
  'hosts.staging': 'postgresql://staging-db/myapp',
  'hosts.production': 'postgresql://prod-db/myapp',
  'containers.postgres': 'postgresql://postgres/myapp'
};

const connStr = connections[$targetInfo.name] || connections[$targetInfo.type];

// Perform backup
await $`pg_dump ${connStr} > ${backupFile}`;
console.log(`Backup created: ${backupFile}`);

// Upload to S3 (works from any environment)
await $`aws s3 cp ${backupFile} s3://my-backups/${backupFile}`;
console.log(`Backup uploaded to S3`);

// Clean local file
await $`rm ${backupFile}`;
```

### 3. Service Management

```javascript
// service-control.js
const action = process.argv[2] || 'status';

const serviceCommands = {
  local: {
    start: 'npm run dev',
    stop: 'pkill -f "node.*dev"',
    status: 'ps aux | grep node',
    restart: 'npm run dev:restart'
  },
  ssh: {
    start: 'systemctl start myapp',
    stop: 'systemctl stop myapp',
    status: 'systemctl status myapp',
    restart: 'systemctl restart myapp'
  },
  docker: {
    start: 'supervisorctl start app',
    stop: 'supervisorctl stop app',
    status: 'supervisorctl status',
    restart: 'supervisorctl restart app'
  },
  kubernetes: {
    start: 'kubectl scale deployment myapp --replicas=3',
    stop: 'kubectl scale deployment myapp --replicas=0',
    status: 'kubectl get pods -l app=myapp',
    restart: 'kubectl rollout restart deployment myapp'
  }
};

const command = serviceCommands[$targetInfo.type][action];
if (!command) {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

console.log(`Executing ${action} on ${$targetInfo.name}`);
// The command already exists as one string — interpolating it into a
// template tag would escape it into a single argument, so use .exec().
const output = await $target.exec(command).text();
console.log(output);
```

## Advanced Patterns

### Conditional Logic Based on Target

```javascript
// deploy.js
// Skip certain steps based on environment
if ($targetInfo.type !== 'local') {
  await $target`git pull origin main`;
}

// Use different package managers
const installer = $targetInfo.type === 'docker' ? 'pnpm' : 'npm';
await $target`${installer} install`;

// Environment-specific optimizations
if ($targetInfo.type === 'kubernetes') {
  // Inspect the cluster from the local machine — kubectl runs here
  await $`kubectl get pods -n ${$targetInfo.namespace}`;
} else if ($targetInfo.type === 'ssh') {
  // On SSH, check system resources
  await $target`free -m && df -h`;
}
```

### Target-Aware Logging

```javascript
// logger.js
class TargetAwareLogger {
  log(message) {
    const prefix = `[${$targetInfo.type}:${$targetInfo.name}]`;
    console.log(`${prefix} ${message}`);
    
    // Also log to environment-specific location on the target
    if ($targetInfo.type === 'ssh') {
      $target`echo "${prefix} ${message}" >> /var/log/app.log`.nothrow();
    } else if ($targetInfo.type === 'docker') {
      $target`echo "${prefix} ${message}" >> /app/logs/app.log`.nothrow();
    }
  }
}

const logger = new TargetAwareLogger();
logger.log('Application started');
```

## Best Practices

### 1. Design for Portability

```javascript
// Good: Works everywhere
await $target`npm test`;

// Avoid: Environment-specific paths
await $target`/usr/local/bin/npm test`;  // May not exist everywhere
```

### 2. Handle Target Variations Gracefully

```javascript
// Good: Defensive programming
const logPath = {
  local: './logs',
  ssh: '/var/log/app',
  docker: '/app/logs',
  kubernetes: '/var/log/pods'
}[$targetInfo.type] || './logs';

await $target`mkdir -p ${logPath}`;
```

### 3. Use Target Information for Configuration

```javascript
// Good: Target-aware configuration
const config = {
  apiUrl: $targetInfo.name.includes('prod') 
    ? 'https://api.production.com'
    : 'https://api.staging.com',
  logLevel: $targetInfo.type === 'local' ? 'debug' : 'info',
  workers: $targetInfo.type === 'kubernetes' ? 1 : 4  // K8s handles scaling
};
```

### 4. Leverage Target for Debugging

```javascript
// Good: Enhanced debugging in development
if ($targetInfo.type === 'local' || $targetInfo.name.includes('dev')) {
  console.log('Debug: Current environment:', $targetInfo);
  console.log('Debug: Environment variables:', process.env);
}
```

## Testing Portable Scripts

### Local Testing

```bash
# Test locally first — under `xec run` the script gets a local-bound
# $target, so target-aware code paths are exercised with type 'local'
xec run my-script.js
```

### Multi-Environment Testing

```javascript
// test-portable.js
const environments = ['local', 'hosts.staging', 'containers.test'];

for (const env of environments) {
  console.log(`Testing on ${env}...`);
  const result = await $`xec on ${env} ./my-script.js`.nothrow();
  
  if (result.ok) {
    console.log(`✓ ${env} passed`);
  } else {
    console.log(`✗ ${env} failed:`, result.stderr);
  }
}
```

## Comparison with Traditional Approaches

### Traditional: Environment-Specific Scripts

```bash
# Different scripts for different environments
deploy-local.sh
deploy-ssh.sh
deploy-docker.sh
deploy-k8s.sh
```

### Xec: One Portable Script

```javascript
// deploy.js - Works everywhere
await $target`npm install`;
await $target`npm run build`;
await $target`npm run deploy:${$targetInfo.type}`;
```

## Integration with Configuration

Combine `$target` with Xec's configuration system:

```yaml
# .xec/config.yaml
targets:
  hosts:
    prod:
      type: ssh
      host: prod.example.com
      env:
        NODE_ENV: production
        API_KEY: ${secrets.prod_api_key}
```

```javascript
// script.js
// Access both $target and config
console.log(`Running on ${$targetInfo.name}`);
console.log(`API Key: ${process.env.API_KEY}`);
```

## Summary

The `$target` concept enables:

- **Write Once, Run Anywhere**: Same script works across all environments
- **Environment Awareness**: Scripts can adapt based on execution context
- **Simplified Maintenance**: One script instead of many
- **Consistent Behavior**: Same commands, different environments
- **Powerful Abstractions**: Focus on logic, not environment details

This makes Xec ideal for:
- DevOps automation
- Multi-environment deployments
- Cross-platform testing
- Infrastructure management
- Universal tooling

## Next Steps

- [Core Concepts](./core-concepts.md) - Understand Xec's architecture
- [Configuration](../configuration/overview.md) - Configure targets
- [CLI Commands](../commands/overview.md) - Use CLI for portable execution
- [Scripting Guide](../scripting/basics/first-script.md) - Write advanced scripts