---
title: Targets Overview
description: Understanding execution targets in Xec
---

# Targets Overview

Targets define where your commands execute. Xec supports multiple execution environments, from local development machines to cloud-native Kubernetes clusters. This flexible system allows you to write commands once and run them anywhere.

## Target Types

Xec supports four primary target types:

### 1. Local
Execute commands on your local machine:
```yaml
targets:
  local:
    type: local
    workdir: /home/user/project
```

### 2. SSH Hosts
Connect to remote servers via SSH:
```yaml
targets:
  hosts:
    production:
      host: prod.example.com
      username: deploy
```

### 3. Docker Containers
Run commands in containerized environments:
```yaml
targets:
  containers:
    app:
      image: node:18
      volumes:
        - ./src:/app
```

### 4. Kubernetes Pods
Execute in cloud-native workloads:
```yaml
targets:
  pods:
    frontend:
      namespace: production
      selector: app=frontend
```

## Target Resolution

Xec resolves targets using a dot notation system:

```bash
# Execute on specific target
xec in hosts.production "ls -la"

# Use wildcards for multiple targets
xec on "hosts.*" "uptime"

# Default to local if not specified
xec in "echo Hello"  # Runs locally
```

## Target Hierarchy

Targets follow a configuration hierarchy:

1. **Global Defaults** - Apply to all targets
2. **Type Defaults** - Apply to specific target types
3. **Individual Target** - Specific target configuration
4. **Runtime Override** - Command-line parameters

```yaml
targets:
  # Global defaults
  defaults:
    timeout: 30000
    shell: /bin/bash
    
    # Type-specific defaults
    ssh:
      port: 22
      keepAlive: true
    
    docker:
      tty: true
  
  # Individual targets inherit defaults
  hosts:
    web:
      host: web.example.com  # Inherits port: 22
```

## Dynamic Target Discovery

Xec can discover targets at runtime:

### Docker Containers
```yaml
targets:
  containers:
    # Discover running containers
    $running: true
    
    # Match by label
    $label: "env=production"
```

### Kubernetes Pods
```yaml
targets:
  pods:
    # Discover by selector
    $selector: "app=nginx"
    
    # Discover in namespace
    $namespace: production
```

## Target Groups

Group related targets for batch operations:

```yaml
targets:
  hosts:
    web-1:
      host: web1.example.com
    web-2:
      host: web2.example.com
    web-3:
      host: web3.example.com

tasks:
  restart-web:
    targets:  # Execute on multiple targets
      - hosts.web-1
      - hosts.web-2
      - hosts.web-3
    command: systemctl restart nginx
```

## Connection Management

Xec optimizes connections for performance:

### Connection Pooling
```yaml
targets:
  hosts:
    api:
      host: api.example.com
      connectionPool:
        min: 2
        max: 10
        idleTimeout: 300000
```

### Keep-Alive
```yaml
targets:
  hosts:
    database:
      host: db.example.com
      keepAlive: true
      keepAliveInterval: 30000
```

## Authentication

Multiple authentication methods supported:

### SSH Keys
```yaml
targets:
  hosts:
    secure:
      host: secure.example.com
      privateKey: ~/.ssh/id_rsa
      passphrase: ${secrets.ssh_passphrase}
```

### Passwords
```yaml
targets:
  hosts:
    legacy:
      host: old.example.com
      password: ${secrets.legacy_password}
```

### Kubernetes Contexts
```yaml
targets:
  kubernetes:
    context: production-cluster
    kubeconfig: ~/.kube/production
```

## Environment Configuration

Set environment variables per target:

```yaml
targets:
  containers:
    app:
      image: node:18
      env:
        NODE_ENV: production
        API_KEY: ${secrets.api_key}
        DATABASE_URL: postgres://localhost/mydb
```

## Working Directory

Control where commands execute:

```yaml
targets:
  hosts:
    build:
      host: build.example.com
      workdir: /var/www/app  # Commands run here
      
  containers:
    dev:
      image: python:3.11
      workdir: /workspace
```

## Execution Options

Fine-tune command execution:

```yaml
targets:
  hosts:
    critical:
      host: critical.example.com
      timeout: 60000           # 60 second timeout
      maxBuffer: 10485760      # 10MB output buffer
      encoding: utf8           # Output encoding
      throwOnNonZeroExit: true # Fail on error
      shell: /bin/zsh         # Custom shell
```

## Target Validation

Xec validates targets before execution:

```bash
# Test target connectivity
xec test hosts.production

# Validate all targets
xec config validate --targets

# Show target configuration
xec config show --target hosts.production
```

## Best Practices

### 1. Use Meaningful Names
```yaml
# Good - descriptive names
targets:
  hosts:
    web-production:
    database-primary:
    cache-server:

# Bad - unclear names
targets:
  hosts:
    server1:
    srv2:
    box3:
```

### 2. Group Related Targets
```yaml
targets:
  hosts:
    # Web tier
    web-1:
    web-2:
    
    # Database tier
    db-primary:
    db-replica:
```

### 3. Use Defaults Effectively
```yaml
targets:
  defaults:
    ssh:
      username: deploy  # Common username
      port: 22
      
  hosts:
    special:
      host: special.example.com
      port: 2222  # Override only when needed
```

### 4. Secure Credentials
```yaml
targets:
  hosts:
    secure:
      host: secure.example.com
      privateKey: ${secrets.ssh_key}  # Use secrets
      # privateKey: /path/to/key       # Avoid hardcoding
```

### 5. Document Special Requirements
```yaml
targets:
  hosts:
    vpn-required:
      host: internal.example.com
      description: "Requires VPN connection"
```

## Common Patterns

### Development Environment
```yaml
targets:
  containers:
    dev:
      image: node:18
      volumes:
        - .:/app
      workdir: /app
      env:
        NODE_ENV: development
```

### Production Cluster
```yaml
targets:
  hosts:
    web-prod-1:
      host: web1.prod.example.com
      username: deploy
      privateKey: ~/.ssh/prod_key
    
    web-prod-2:
      host: web2.prod.example.com
      username: deploy
      privateKey: ~/.ssh/prod_key
```

### Multi-Environment
```yaml
profiles:
  dev:
    targets:
      hosts:
        app:
          host: localhost
          port: 2222
  
  prod:
    targets:
      hosts:
        app:
          host: app.example.com
          port: 22
```

## Troubleshooting

### Connection Issues
```bash
# Test connectivity
xec test hosts.production

# Verbose output
xec --verbose in hosts.production "echo test"

# Check configuration
xec config show --target hosts.production
```

### Authentication Failures
```yaml
# Check credentials
targets:
  hosts:
    problem:
      host: problem.example.com
      username: correct_user  # Verify username
      privateKey: ~/.ssh/correct_key  # Verify key path
```

### Timeout Problems
```yaml
# Increase timeout for slow operations
targets:
  hosts:
    slow:
      host: slow.example.com
      timeout: 300000  # 5 minutes
```

## Next Steps

- [SSH Targets](./ssh-targets.md) - Remote server configuration
- [Docker Targets](./docker-targets.md) - Container configuration
- [Kubernetes Targets](./kubernetes-targets.md) - Pod configuration

## See Also

- [Command Execution](../../commands/built-in/in.md) - Running commands on targets