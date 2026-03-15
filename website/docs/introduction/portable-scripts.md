---
title: Portable Scripts
description: Write once, run anywhere - universal scripts with $target
keywords: [$target, portable, universal, multi-environment, context]
sidebar_position: 5
---

# Portable Scripts

One of Xec's most powerful features is the ability to write scripts that work identically across different environments - local, SSH, Docker, and Kubernetes - without modification.

## The $target Concept

When you execute a script with Xec's CLI commands (`xec run`, `xec on`, `xec in`), the execution engine automatically injects a special `$target` variable into your script's context. This variable represents the current execution environment, allowing you to write truly portable code.

### How It Works

```javascript
// deploy.js - A universal deployment script
console.log(`Deploying to: ${$target.type}`);
console.log(`Target name: ${$target.name}`);

// This same code works everywhere:
await $`npm install`;
await $`npm run build`;
await $`pm2 restart app`;
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
2. **Injects `$target` globally** into your script
3. **Routes all commands** through the appropriate adapter
4. **Maintains consistent behavior** across environments

### Example: Universal Health Check

```javascript
// health-check.js
const checks = {
  local: async () => {
    const disk = await $`df -h /`;
    const memory = await $`free -m`;
    return { disk: disk.stdout, memory: memory.stdout };
  },
  
  ssh: async () => {
    const uptime = await $`uptime`;
    const connections = await $`ss -tun | wc -l`;
    return { uptime: uptime.stdout, connections: connections.stdout };
  },
  
  docker: async () => {
    const processes = await $`ps aux`;
    const network = await $`netstat -an`;
    return { processes: processes.stdout, network: network.stdout };
  },
  
  kubernetes: async () => {
    const pods = await $`kubectl get pods`;
    const services = await $`kubectl get svc`;
    return { pods: pods.stdout, services: services.stdout };
  }
};

// Run environment-specific checks
const results = await checks[$target.type]();
console.log(`Health check for ${$target.name}:`, results);
```

## $target Properties

The `$target` object contains context-specific information:

```typescript
interface Target {
  // Common properties
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  name: string;  // Target name from config
  
  // SSH-specific
  host?: string;
  user?: string;
  port?: number;
  
  // Docker-specific
  container?: string;
  image?: string;
  
  // Kubernetes-specific
  pod?: string;
  namespace?: string;
  cluster?: string;
}
```

### Accessing Target Information

```javascript
// script.js
console.log('Execution context:');
console.log(`  Type: ${$target.type}`);
console.log(`  Name: ${$target.name}`);

if ($target.type === 'ssh') {
  console.log(`  Host: ${$target.host}`);
  console.log(`  User: ${$target.user}`);
} else if ($target.type === 'docker') {
  console.log(`  Container: ${$target.container}`);
} else if ($target.type === 'kubernetes') {
  console.log(`  Pod: ${$target.pod}`);
  console.log(`  Namespace: ${$target.namespace}`);
}
```

## Real-World Use Cases

### 1. Universal Build Script

```javascript
// build.js
console.log(`Building on ${$target.type} environment`);

// Clean previous build
await $`rm -rf dist`;

// Install dependencies
await $`npm ci`;

// Run build
await $`npm run build`;

// Run tests
const testResult = await $`npm test`.nothrow();
if (!testResult.ok) {
  console.error('Tests failed!');
  process.exit(1);
}

// Deploy if tests pass
if ($target.type === 'ssh' && $target.name.includes('prod')) {
  await $`pm2 restart app`;
  console.log('Production deployment complete');
} else {
  console.log('Build complete (no deployment for this target)');
}
```

### 2. Multi-Environment Database Backup

```javascript
// backup.js
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backup-${$target.name}-${timestamp}.sql`;

// Environment-specific connection strings
const connections = {
  local: 'postgresql://localhost/myapp',
  'hosts.staging': 'postgresql://staging-db/myapp',
  'hosts.production': 'postgresql://prod-db/myapp',
  'containers.postgres': 'postgresql://postgres/myapp'
};

const connStr = connections[$target.name] || connections[$target.type];

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

const command = serviceCommands[$target.type][action];
if (!command) {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

console.log(`Executing ${action} on ${$target.name}`);
const result = await $`${command}`;
console.log(result.stdout);
```

## Advanced Patterns

### Conditional Logic Based on Target

```javascript
// deploy.js
// Skip certain steps based on environment
if ($target.type !== 'local') {
  await $`git pull origin main`;
}

// Use different package managers
const installer = $target.type === 'docker' ? 'pnpm' : 'npm';
await $`${installer} install`;

// Environment-specific optimizations
if ($target.type === 'kubernetes') {
  // In K8s, we might want to check other pods
  await $`kubectl get pods -n ${$target.namespace}`;
} else if ($target.type === 'ssh') {
  // On SSH, check system resources
  await $`free -m && df -h`;
}
```

### Target-Aware Logging

```javascript
// logger.js
class TargetAwareLogger {
  log(message) {
    const prefix = `[${$target.type}:${$target.name}]`;
    console.log(`${prefix} ${message}`);
    
    // Also log to environment-specific location
    if ($target.type === 'ssh') {
      $`echo "${prefix} ${message}" >> /var/log/app.log`.nothrow();
    } else if ($target.type === 'docker') {
      $`echo "${prefix} ${message}" >> /app/logs/app.log`.nothrow();
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
await $`npm test`;

// Avoid: Environment-specific paths
await $`/usr/local/bin/npm test`;  // May not exist everywhere
```

### 2. Handle Target Variations Gracefully

```javascript
// Good: Defensive programming
const logPath = {
  local: './logs',
  ssh: '/var/log/app',
  docker: '/app/logs',
  kubernetes: '/var/log/pods'
}[$target.type] || './logs';

await $`mkdir -p ${logPath}`;
```

### 3. Use Target Information for Configuration

```javascript
// Good: Target-aware configuration
const config = {
  apiUrl: $target.name.includes('prod') 
    ? 'https://api.production.com'
    : 'https://api.staging.com',
  logLevel: $target.type === 'local' ? 'debug' : 'info',
  workers: $target.type === 'kubernetes' ? 1 : 4  // K8s handles scaling
};
```

### 4. Leverage Target for Debugging

```javascript
// Good: Enhanced debugging in development
if ($target.type === 'local' || $target.name.includes('dev')) {
  console.log('Debug: Current environment:', $target);
  console.log('Debug: Environment variables:', process.env);
}
```

## Testing Portable Scripts

### Local Testing

```bash
# Test locally first
xec run my-script.js

# Simulate different targets locally
XEC_TARGET_TYPE=ssh xec run my-script.js
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
await $`npm install`;
await $`npm run build`;
await $`npm run deploy:${$target.type}`;
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
console.log(`Running on ${$target.name}`);
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