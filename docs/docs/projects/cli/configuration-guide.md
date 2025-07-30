---
sidebar_position: 7
---

# Configuration Guide

Comprehensive guide to configuring Xec CLI for different environments and use cases.

## Configuration Hierarchy

Xec uses a hierarchical configuration system where settings cascade in the following order (later sources override earlier ones):

1. **Built-in defaults** - Hardcoded safe defaults
2. **Global configuration** - `~/.xec/config.yaml` or `~/.xec.yaml`
3. **Project configuration** - `.xec/config.yaml`, `.xec.yaml`, or `xec.yaml`
4. **Environment variables** - `XEC_*` prefixed variables
5. **Profile settings** - Applied when a profile is active
6. **Command-line arguments** - Runtime overrides

## Configuration File Format

Xec uses YAML format for configuration files with a unified schema that works for both core and CLI.

### Basic Configuration Structure

```yaml
# .xec/config.yaml or xec.yaml
name: my-project
description: My Xec project configuration
version: 1.0.0

# Global defaults
defaults:
  timeout: 30s          # Can use ms, s, m, h units
  shell: /bin/bash      # or true/false
  cwd: /app            # Working directory
  env:                 # Environment variables
    NODE_ENV: production
    DEBUG: "false"
  encoding: utf8
  throwOnNonZeroExit: false

# SSH hosts configuration
hosts:
  production:
    host: prod.example.com
    username: deploy
    port: 22
    privateKey: |
      -----BEGIN RSA PRIVATE KEY-----
      ...
      -----END RSA PRIVATE KEY-----
    privateKeyPath: ~/.ssh/id_rsa  # Alternative to inline key
    readyTimeout: 20000
    keepaliveInterval: 5000
    env:
      APP_ENV: production

  staging:
    host: staging.example.com
    username: deploy
    privateKeyPath: ~/.ssh/staging_key

# Docker containers configuration
containers:
  app:
    name: myapp-prod        # Container name
    image: myapp:latest     # Optional default image
    env:
      NODE_ENV: production

  database:
    container: postgres-prod  # Can use 'container' or 'name'
    
# Kubernetes pods configuration
pods:
  web:
    name: web-deployment-abc123
    namespace: production
    container: nginx        # Specific container in pod
    context: prod-cluster   # Kubernetes context
    kubeconfig: ~/.kube/prod-config

  api:
    name: api-deployment-xyz789
    namespace: production

# Command aliases
aliases:
  deploy: xec on production deploy.sh
  logs: xec logs app --follow
  db-backup: xec in database pg_dump mydb > backup.sql
  k8s-logs: xec forward web kubectl logs -f

# Profiles for different environments
profiles:
  development:
    defaults:
      timeout: 10s
      env:
        NODE_ENV: development
        DEBUG: "*"
    hosts:
      local:
        host: localhost
        username: dev

  production:
    extends: base          # Inherit from another profile
    defaults:
      timeout: 5m
      throwOnNonZeroExit: true
      env:
        NODE_ENV: production
    hosts:
      prod:
        host: prod.example.com
        username: deploy
        privateKeyPath: ~/.ssh/prod_key

  base:
    defaults:
      shell: /bin/bash
      encoding: utf8
```

## Environment Variables

Key configuration options can be set via environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `XEC_CONFIG` | Path to config file | `/path/to/config.yaml` |
| `XEC_PROFILE` | Active profile | `production` |
| `XEC_TIMEOUT` | Command timeout | `60s` |
| `XEC_SHELL` | Default shell | `/bin/zsh` |
| `XEC_CWD` | Working directory | `/app` |

## Using Profiles

Profiles allow you to switch between different configurations easily:

```bash
# Set profile via environment variable
XEC_PROFILE=production xec run deploy.js

# Or programmatically
$.config.applyProfile('production');
```

### Profile Inheritance

Profiles can extend other profiles:

```yaml
profiles:
  base:
    defaults:
      shell: /bin/bash
      timeout: 30s
      
  staging:
    extends: base
    defaults:
      timeout: 1m  # Override base timeout
      env:
        NODE_ENV: staging
        
  production:
    extends: staging
    defaults:
      timeout: 5m  # Override staging timeout
      throwOnNonZeroExit: true
```

## Resource Definitions

### SSH Hosts

Define SSH connections for use with `xec on` command:

```yaml
hosts:
  web-server:
    host: web.example.com
    username: deploy
    port: 2222
    privateKeyPath: ~/.ssh/web_key
    # Optional password (not recommended)
    password: "${SSH_PASSWORD}"
    # Connection options
    readyTimeout: 20000
    keepaliveInterval: 5000
    keepaliveCountMax: 3
    # Host-specific environment
    env:
      APP_SERVER: web
```

### Docker Containers

Define containers for use with `xec in` command:

```yaml
containers:
  app:
    name: myapp-container
    # or
    container: myapp-container
    # Optional image for creating new containers
    image: node:18-alpine
    env:
      NODE_ENV: production
```

### Kubernetes Pods

Define pods for use with `xec forward` command:

```yaml
pods:
  web:
    name: web-deployment-abc123
    namespace: production
    container: nginx  # Optional: specific container in pod
    context: prod-cluster
    kubeconfig: ~/.kube/prod-config
```

## Command Aliases

Create shortcuts for commonly used commands:

```yaml
aliases:
  # Simple command aliases
  deploy: xec on production deploy.sh
  restart: xec on production "systemctl restart app"
  
  # Complex multi-step operations
  backup: xec run backup-all.js
  
  # Docker operations
  logs: xec in app tail -f /var/log/app.log
  shell: xec in app /bin/bash
  
  # Kubernetes operations
  k8s-logs: xec forward web kubectl logs -f
  k8s-exec: xec forward web /bin/bash
```

Use aliases:

```bash
# Instead of: xec on production deploy.sh
xec deploy

# Instead of: xec in app tail -f /var/log/app.log
xec logs
```

## Configuration API

### Loading Configuration

```javascript
import { unifiedConfig } from '@xec-sh/core';

// Load configuration (searches default paths)
const config = await unifiedConfig.load();

// Load from specific paths
const config = await unifiedConfig.load([
  './custom-config.yaml',
  '/etc/xec/config.yaml'
]);

// Check if configuration exists
const exists = await unifiedConfig.exists();
```

### Accessing Configuration

```javascript
// Get entire configuration
const config = unifiedConfig.get();

// Get specific values using dot notation
const timeout = unifiedConfig.getValue('defaults.timeout');
const sshHost = unifiedConfig.getValue('hosts.production.host');

// Get resources
const host = unifiedConfig.getHost('production');
const container = unifiedConfig.getContainer('app');
const pod = unifiedConfig.getPod('web');

// List resources
const hosts = unifiedConfig.listHosts();
const containers = unifiedConfig.listContainers();
const pods = unifiedConfig.listPods();
const profiles = unifiedConfig.listProfiles();

// Resolve aliases
const command = unifiedConfig.resolveAlias('deploy');
```

### Modifying Configuration

```javascript
// Set values using dot notation
unifiedConfig.setValue('defaults.timeout', '60s');
unifiedConfig.setValue('hosts.staging.port', 2222);

// Apply a profile
unifiedConfig.applyProfile('production');

// Get active profile
const profile = unifiedConfig.getActiveProfile();
```

### Converting to Engine Config

```javascript
// Convert to ExecutionEngine configuration
const engineConfig = unifiedConfig.toEngineConfig();

// Use with ExecutionEngine
const engine = new ExecutionEngine(engineConfig);
```

### Converting Resources to Adapter Options

```javascript
// Convert host to SSH adapter options
const sshOptions = await unifiedConfig.hostToSSHOptions('production');
// Returns: { host, username, privateKey, port, ... }

// Convert container to Docker adapter options
const dockerOptions = unifiedConfig.containerToDockerOptions('app');
// Returns: { container: 'myapp-container' }

// Convert pod to Kubernetes adapter options
const k8sOptions = unifiedConfig.podToK8sOptions('web');
// Returns: { pod, namespace, container }
```

### Saving Configuration

```javascript
// Save current configuration
await unifiedConfig.save(config);

// Save to specific path
await unifiedConfig.save(config, './my-config.yaml');
```

## Best Practices

### 1. Use Profiles for Environments

```yaml
profiles:
  development:
    defaults:
      timeout: 30s
      env:
        DEBUG: "*"
        
  staging:
    defaults:
      timeout: 1m
      env:
        NODE_ENV: staging
        
  production:
    defaults:
      timeout: 5m
      throwOnNonZeroExit: true
      env:
        NODE_ENV: production
```

### 2. Secure Sensitive Data

```yaml
# Use environment variables for secrets
hosts:
  production:
    host: prod.example.com
    username: deploy
    password: "${SSH_PASSWORD}"  # Never hardcode passwords
    privateKeyPath: ~/.ssh/id_rsa  # Use key files

# Or use dedicated secret management
secrets:
  provider: vault
  path: /secret/xec
```

### 3. Version Control Strategy

```bash
# .gitignore
.xec/config.local.yaml
.xec/config.*.local.yaml
.xec/secrets/
*.key
*_rsa
```

### 4. Organize by Purpose

```yaml
# Separate configurations by concern
hosts:
  # Web servers
  web-1:
    host: web1.example.com
  web-2:
    host: web2.example.com
    
  # Database servers
  db-primary:
    host: db1.example.com
  db-replica:
    host: db2.example.com
```

### 5. Use Meaningful Aliases

```yaml
aliases:
  # Deployment
  deploy-staging: xec on staging deploy.sh
  deploy-prod: xec on production deploy.sh
  
  # Monitoring
  logs-app: xec in app tail -f /var/log/app.log
  logs-nginx: xec in nginx tail -f /var/log/nginx/access.log
  
  # Maintenance
  db-backup: xec on db-primary "pg_dump mydb > /backup/mydb.sql"
  cache-clear: xec on cache-server "redis-cli FLUSHALL"
```

## Migration from Legacy Format

If you're using an older configuration format, here's how to migrate:

### Old Format (Pre-Unified)
```yaml
# Old format
environments:
  production:
    ssh:
      host: prod.example.com
      username: deploy
```

### New Format (Unified)
```yaml
# New unified format
hosts:
  production:
    host: prod.example.com
    username: deploy

# Use profiles for environment-specific settings
profiles:
  production:
    defaults:
      env:
        NODE_ENV: production
```

## Configuration Examples

### Multi-Host Deployment

```yaml
hosts:
  web-1:
    host: web1.example.com
    username: deploy
  web-2:
    host: web2.example.com
    username: deploy
  web-3:
    host: web3.example.com
    username: deploy

aliases:
  deploy-all: xec run deploy-to-all.js
  restart-all: xec run restart-all-servers.js
```

### CI/CD Configuration

```yaml
profiles:
  ci:
    defaults:
      timeout: 30m
      throwOnNonZeroExit: true
      shell: /bin/sh
      
containers:
  test-runner:
    image: node:18-alpine
    env:
      CI: "true"
      
aliases:
  test: xec in test-runner npm test
  build: xec in test-runner npm run build
```

### Development Setup

```yaml
profiles:
  development:
    defaults:
      timeout: 10s
      env:
        NODE_ENV: development
        DEBUG: "*"
        
hosts:
  local:
    host: localhost
    username: "${USER}"
    
containers:
  dev-db:
    name: postgres-dev
    image: postgres:15
    env:
      POSTGRES_PASSWORD: dev
      
aliases:
  dev: xec run start-dev.js
  db: xec in dev-db psql -U postgres
```

## Troubleshooting

### Configuration Not Loading

1. Check file exists in search paths:
   - Current directory: `.xec/config.yaml`, `.xec.yaml`, `xec.yaml`
   - Home directory: `~/.xec/config.yaml`, `~/.xec.yaml`
   - Or set `XEC_CONFIG` environment variable

2. Validate YAML syntax:
   ```bash
   # Check for syntax errors
   yaml-lint .xec/config.yaml
   ```

3. Check for parsing errors:
   ```javascript
   try {
     await unifiedConfig.load();
   } catch (error) {
     console.error('Config error:', error);
   }
   ```

### Profile Not Found

```javascript
// Check available profiles
const profiles = unifiedConfig.listProfiles();
console.log('Available profiles:', profiles);

// Apply profile with error handling
try {
  unifiedConfig.applyProfile('production');
} catch (error) {
  console.error('Profile error:', error);
}
```

### Invalid Timeout Format

Timeouts support the following formats:
- Number: milliseconds (e.g., `5000`)
- String with unit: `100ms`, `30s`, `5m`, `1h`

```yaml
defaults:
  timeout: 30s      # 30 seconds
  timeout: 5m       # 5 minutes
  timeout: 1h       # 1 hour
  timeout: 5000     # 5000 milliseconds
```