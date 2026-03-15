---
title: Configuration Overview
description: Understanding Xec's declarative configuration system
---

# Configuration Overview

Xec's configuration system provides a powerful, declarative way to define your infrastructure, automation tasks, and execution environments. Using a simple YAML format, you can describe complex workflows, manage multiple environments, and automate repetitive tasks across diverse infrastructure.

## Philosophy

Xec's configuration follows several key principles:

### 1. **Declarative Over Imperative**
Define *what* you want to achieve, not *how* to achieve it. Xec handles the implementation details.

```yaml
# Declarative: Define the desired state
tasks:
  deploy:
    description: Deploy application to production
    target: production-servers
    steps:
      - command: docker-compose up -d
```

### 2. **Convention Over Configuration**
Sensible defaults minimize boilerplate while allowing customization when needed.

```yaml
# Minimal configuration - uses conventions
targets:
  hosts:
    web-server:
      host: web.example.com
      # Port defaults to 22, username to current user
```

### 3. **Composability**
Build complex configurations from simple, reusable components.

```yaml
# Compose configurations through profiles
profiles:
  production:
    extends: base
    vars:
      environment: production
      replicas: 3
```

### 4. **Progressive Disclosure**
Start simple, add complexity only when needed.

```yaml
# Simple start
tasks:
  backup: rsync -av /data /backup

# Add complexity as needed
tasks:
  backup:
    description: Backup data with retention
    schedule: "0 2 * * *"
    steps:
      - command: rsync -av /data /backup/$(date +%Y%m%d)
      - command: find /backup -mtime +7 -delete
```

## Configuration Hierarchy

Xec loads and merges configurations from multiple sources in a specific order:

1. **Built-in Defaults** - Xec's internal defaults
2. **Global Configuration** - `~/.xec/config.yaml`
3. **Project Configuration** - `.xec/config.yaml` in project root
4. **Environment Variables** - `XEC_*` prefixed variables
5. **Profile Configuration** - Profile-specific overrides
6. **Command-line Arguments** - Runtime overrides

Later sources override earlier ones, allowing flexible customization at different levels.

## File Structure

A typical Xec project configuration looks like:

```
.xec/
├── config.yaml           # Main configuration file
├── profiles/            # Environment-specific profiles
│   ├── dev.yaml
│   ├── staging.yaml
│   └── production.yaml
├── tasks/              # Task definitions (can be imported)
│   ├── deploy.yaml
│   └── maintenance.yaml
├── scripts/            # Custom scripts
│   └── health-check.js
└── commands/          # Custom commands
    └── backup.js
```

## Key Concepts

### Targets
Execution environments where commands run:
- **Local** - Your development machine
- **SSH Hosts** - Remote servers via SSH
- **Docker Containers** - Containerized environments
- **Kubernetes Pods** - Cloud-native workloads

### Tasks
Reusable automation workflows with:
- Multi-step execution
- Parameter support
- Error handling
- Conditional logic
- Parallel execution

### Profiles
Environment-specific configurations:
- Development settings
- Staging configurations
- Production parameters
- Custom environments

### Variables
Dynamic values that can be:
- Interpolated in strings
- Shared across configurations
- Overridden at different levels
- Sourced from environment

## Quick Start Example

Here's a complete configuration showcasing key features:

```yaml
# .xec/config.yaml
version: "1.0"
name: my-app
description: My application deployment configuration

# Global variables
vars:
  app_name: myapp
  version: "1.0.0"

# Define execution targets
targets:
  hosts:
    web:
      host: web.example.com
      username: deploy
    db:
      host: db.example.com
      username: admin

# Define reusable tasks
tasks:
  deploy:
    description: Deploy application
    target: web
    steps:
      - command: docker pull ${app_name}:${version}
      - command: docker stop ${app_name} || true
      - command: docker run -d --name ${app_name} ${app_name}:${version}
      
  backup:
    description: Backup database
    target: db
    command: pg_dump mydb > /backup/mydb-$(date +%Y%m%d).sql

# Command defaults
commands:
  logs:
    tail: 100
    follow: true
    
# Environment profiles
profiles:
  production:
    vars:
      version: "stable"
    targets:
      hosts:
        web:
          host: prod-web.example.com
```

## Configuration Validation

Xec validates your configuration at multiple levels:

1. **Schema Validation** - Structure and types
2. **Reference Validation** - Target and task references
3. **Variable Validation** - Variable interpolation
4. **Semantic Validation** - Logical consistency

Run validation explicitly:

```bash
xec config validate
```

## Best Practices

### 1. Keep Secrets Secure
Never store secrets directly in configuration files:

```yaml
# Bad - exposed secret
password: "mysecretpass"

# Good - use secret management
password: ${secrets.db_password}
```

### 2. Use Version Control
Track configuration changes:

```bash
git add .xec/config.yaml
git commit -m "Add production deployment configuration"
```

### 3. Organize by Environment
Separate environment-specific settings:

```yaml
# .xec/profiles/production.yaml
vars:
  replicas: 3
  debug: false
  
# .xec/profiles/development.yaml
vars:
  replicas: 1
  debug: true
```

### 4. Document Complex Tasks
Add descriptions and comments:

```yaml
tasks:
  complex-deployment:
    description: |
      Performs blue-green deployment with health checks.
      Requires: docker, nginx
      Duration: ~5 minutes
    steps:
      # Step 1: Health check
      - command: curl -f http://localhost/health
        name: "Verify current deployment"
```

### 5. Leverage Composition
Build complex configurations from simple components:

```yaml
# Base configuration
tasks:
  base-setup:
    steps:
      - command: apt-get update
      - command: apt-get install -y curl git

# Extended configuration
tasks:
  app-setup:
    steps:
      - task: base-setup
      - command: npm install
```

## Next Steps

- [Configuration File Structure](./config-file.md) - Deep dive into config.yaml
- [Defining Targets](./targets/overview.md) - Configure execution environments
- [Creating Tasks](./tasks/simple-tasks.md) - Build automation workflows
- [Using Profiles](./profiles/overview.md) - Manage multiple environments
- [Variable Management](./variables/overview.md) - Dynamic configuration values

## See Also

- [CLI Commands](../commands/built-in/config.md) - Configuration management commands
- [Best Practices](./advanced/best-practices.md) - Configuration patterns
- [Troubleshooting](./advanced/troubleshooting.md) - Common issues and solutions