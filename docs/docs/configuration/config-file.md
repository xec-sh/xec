---
title: Configuration File Structure
description: Complete reference for the .xec/config.yaml file format
---

# Configuration File Structure

The `.xec/config.yaml` file is the heart of Xec's configuration system. This document provides a comprehensive reference for all configuration options and their usage.

## File Format

Xec configuration files use YAML format with the following conventions:

- **YAML 1.2** specification
- **UTF-8** encoding
- **2-space** indentation (recommended)
- **Comments** supported with `#`

## File Location

Xec searches for configuration in these locations (in order):

1. `.xec/config.yaml` - Project directory (recommended)
2. `.xec/config.yml` - Alternative extension
3. `xec.yaml` - Root directory
4. `xec.yml` - Alternative root location

```bash
# Validate your configuration
xec config validate

# Show loaded configuration
xec config show
```

## Root Structure

```yaml
# Configuration version (required)
version: "1.0"

# Project metadata (optional)
name: my-project
description: My awesome project configuration

# Global variables
vars:
  key: value

# Execution targets
targets:
  # Target definitions...

# Automation tasks
tasks:
  # Task definitions...

# Environment profiles
profiles:
  # Profile definitions...

# Command defaults
commands:
  # Command configurations...

# Script configuration
scripts:
  # Script settings...

# Secrets management
secrets:
  # Secret provider config...

# Extensions
extensions:
  # Extension configurations...
```

## Version Field

The `version` field specifies the configuration format version:

```yaml
version: "1.0"  # Current version
```

**Required**: Yes  
**Type**: String  
**Current Version**: "1.0"

Future versions will maintain backward compatibility or provide migration tools.

## Project Metadata

Optional fields for project identification:

```yaml
name: my-application
description: |
  Production deployment configuration for
  the e-commerce platform backend services.
```

### Fields

- **name** (string): Project identifier
- **description** (string): Human-readable description

## Variables Section

Global variables for reuse throughout configuration:

```yaml
vars:
  # Simple values
  app_name: myapp
  version: "2.1.0"
  port: 8080
  
  # Complex structures
  database:
    host: db.example.com
    port: 5432
    name: production_db
  
  # Lists
  servers:
    - web1.example.com
    - web2.example.com
    - web3.example.com
  
  # Computed values
  image_tag: "${app_name}:${version}"
  connection_string: "postgres://${database.host}:${database.port}/${database.name}"
```

### Variable Types

- **Strings**: Text values
- **Numbers**: Integer or float
- **Booleans**: true/false
- **Objects**: Nested structures
- **Arrays**: Lists of values

### Variable Interpolation

Variables can reference other variables:

```yaml
vars:
  base_url: https://api.example.com
  api_endpoint: "${base_url}/v2"
  
  # Nested references
  env: production
  config_file: "/etc/${app_name}/${env}.conf"
  
  # Environment variables
  home_dir: "${env.HOME}"
  path_with_default: "${env.CUSTOM_PATH:-/default/path}"
```

## Targets Section

Define execution environments:

```yaml
targets:
  # Global defaults for all targets
  defaults:
    timeout: 30000
    shell: /bin/bash
    encoding: utf8
    
    # Type-specific defaults
    ssh:
      port: 22
      keepAlive: true
    docker:
      tty: true
    kubernetes:
      namespace: default
  
  # Local execution (optional, has built-in defaults)
  local:
    type: local
    workdir: /workspace
  
  # SSH hosts
  hosts:
    web-server:
      host: web.example.com
      username: deploy
      privateKey: ~/.ssh/id_rsa
    
    db-server:
      host: db.example.com
      username: admin
      password: ${secrets.db_password}
  
  # Docker containers
  containers:
    app:
      image: node:18
      volumes:
        - ./app:/app
      workdir: /app
    
    database:
      image: postgres:15
      env:
        POSTGRES_PASSWORD: ${secrets.pg_password}
  
  # Kubernetes pods
  pods:
    frontend:
      namespace: production
      selector: app=frontend
      container: nginx
    
    backend:
      namespace: production
      pod: backend-7f8b9c-xyz
      container: app
```

## Tasks Section

Define reusable automation workflows:

```yaml
tasks:
  # Simple command task
  backup:
    command: pg_dump mydb > backup.sql
    target: db-server
  
  # Multi-step task
  deploy:
    description: Deploy application to production
    target: web-server
    steps:
      - name: Pull latest code
        command: git pull origin main
      
      - name: Install dependencies
        command: npm install
      
      - name: Run tests
        command: npm test
        onFailure: abort
      
      - name: Build application
        command: npm run build
      
      - name: Restart service
        command: systemctl restart myapp
  
  # Parameterized task
  scale:
    description: Scale application replicas
    params:
      - name: replicas
        type: number
        required: true
        min: 1
        max: 10
    command: kubectl scale deployment/app --replicas=${params.replicas}
  
  # Parallel execution task
  health-check:
    description: Check all services
    parallel: true
    targets:
      - web-server
      - db-server
      - cache-server
    command: curl -f http://localhost/health
```

## Profiles Section

Environment-specific configurations:

```yaml
profiles:
  # Development profile
  development:
    vars:
      environment: dev
      debug: true
      replicas: 1
    targets:
      hosts:
        web-server:
          host: localhost
          port: 2222
  
  # Staging profile
  staging:
    extends: development  # Inherit from another profile
    vars:
      environment: staging
      debug: false
      replicas: 2
    targets:
      hosts:
        web-server:
          host: staging.example.com
  
  # Production profile
  production:
    vars:
      environment: prod
      debug: false
      replicas: 3
      monitoring: enabled
    targets:
      hosts:
        web-server:
          host: prod-web.example.com
        db-server:
          host: prod-db.example.com
```

## Commands Section

Configure defaults for built-in commands:

```yaml
commands:
  # xec in command defaults
  in:
    defaultTimeout: 30s
    shell: /bin/bash
  
  # xec on command defaults
  on:
    parallel: true
    failFast: false
  
  # xec copy command defaults
  copy:
    compress: true
    progress: true
    preserveMode: true
  
  # xec forward command defaults
  forward:
    dynamic: true
    privileged: false
  
  # xec watch command defaults
  watch:
    interval: 2
    clear: true
    initialRun: true
  
  # xec logs command defaults
  logs:
    tail: 100
    follow: false
    timestamps: true
    prefix: true
```

## Scripts Section

Configure script execution environment:

```yaml
scripts:
  # Environment variables for all scripts
  env:
    NODE_ENV: production
    API_KEY: ${secrets.api_key}
  
  # Auto-loaded global modules
  globals:
    - axios
    - lodash
    - moment
  
  # Security sandbox
  sandbox:
    enabled: true
    restrictions:
      - no_network      # Disable network access
      - no_filesystem   # Disable file system access
      - no_child_process # Disable subprocess spawning
    memoryLimit: 256MB
    cpuLimit: 1
    timeout: 30s
```

## Secrets Section

Configure secret management:

```yaml
secrets:
  # Local encrypted storage (default)
  provider: local
  config:
    storageDir: ~/.xec/secrets
    passphrase: ${env.XEC_PASSPHRASE}
  
  # HashiCorp Vault
  # provider: vault
  # config:
  #   address: https://vault.example.com
  #   token: ${env.VAULT_TOKEN}
  #   path: secret/data/myapp
  
  # AWS Secrets Manager
  # provider: aws-secrets
  # config:
  #   region: us-east-1
  #   prefix: myapp/
  
  # 1Password
  # provider: 1password
  # config:
  #   vault: Production
  #   account: my-team
```

## Extensions Section

Load external extensions:

```yaml
extensions:
  # NPM package
  - source: "@xec/aws-tools"
    tasks:
      - s3-sync
      - ec2-deploy
    config:
      region: us-east-1
  
  # Git repository
  - source: "git+https://github.com/org/xec-extension.git"
    tasks: "*"  # Import all tasks
  
  # Local path
  - source: "./extensions/custom"
    config:
      apiKey: ${secrets.extension_key}
```

## Complete Example

Here's a complete configuration example:

```yaml
version: "1.0"
name: microservices-platform
description: Production microservices deployment

# Global variables
vars:
  project: ecommerce
  environment: ${env.DEPLOY_ENV:-staging}
  region: us-east-1
  
  # Service versions
  versions:
    api: "2.1.0"
    web: "1.5.3"
    worker: "1.2.0"

# Execution targets
targets:
  defaults:
    timeout: 60000
    ssh:
      keepAlive: true
      connectionPool:
        max: 5
  
  hosts:
    api-server:
      host: api.${environment}.example.com
      username: deploy
      privateKey: ~/.ssh/deploy_key
    
    web-server:
      host: web.${environment}.example.com
      username: deploy
      privateKey: ~/.ssh/deploy_key
  
  containers:
    database:
      image: postgres:15
      env:
        POSTGRES_DB: ${project}
        POSTGRES_PASSWORD: ${secrets.db_password}
  
  kubernetes:
    namespace: ${project}-${environment}
    context: ${region}-cluster

# Automation tasks
tasks:
  deploy-api:
    description: Deploy API service
    target: api-server
    steps:
      - command: docker pull ${project}/api:${versions.api}
      - command: docker stop api || true
      - command: docker run -d --name api ${project}/api:${versions.api}
      - command: ./health-check.sh api
        onFailure:
          retry: 3
          delay: 5s
  
  deploy-web:
    description: Deploy web frontend
    target: web-server
    steps:
      - command: docker pull ${project}/web:${versions.web}
      - command: docker stop web || true
      - command: docker run -d --name web ${project}/web:${versions.web}
  
  deploy-all:
    description: Deploy all services
    parallel: true
    steps:
      - task: deploy-api
      - task: deploy-web
      - task: deploy-worker

# Environment profiles
profiles:
  staging:
    vars:
      environment: staging
      replicas: 2
    targets:
      kubernetes:
        namespace: ${project}-staging
  
  production:
    vars:
      environment: production
      replicas: 5
      monitoring: enabled
    targets:
      kubernetes:
        namespace: ${project}-prod
        context: prod-cluster

# Command defaults
commands:
  logs:
    tail: 200
    follow: true
    timestamps: true

# Secrets configuration
secrets:
  provider: vault
  config:
    address: https://vault.example.com
    path: secret/data/${project}/${environment}
```

## Schema Validation

Xec validates configuration against a JSON Schema:

```bash
# Validate configuration
xec config validate

# Validate specific file
xec config validate --file custom-config.yaml

# Show validation errors with details
xec config validate --verbose
```

## Variable Resolution Order

Variables are resolved in this precedence order:

1. **Command-line arguments** - Highest priority
2. **Environment variables** - `XEC_*` prefixed
3. **Profile variables** - Active profile vars
4. **Task parameters** - Task-specific params
5. **Global variables** - Config vars section
6. **Defaults** - Built-in defaults

## Best Practices

### 1. Use Version Control

```bash
# Always version your configuration
git add .xec/config.yaml
git commit -m "Add production deployment configuration"
```

### 2. Separate Environments

```yaml
# Use profiles for different environments
profiles:
  dev:
    vars: { debug: true }
  prod:
    vars: { debug: false }
```

### 3. Keep Secrets Secure

```yaml
# Never hardcode secrets
password: ${secrets.db_password}  # Good
password: "mypassword123"         # Bad
```

### 4. Use Descriptive Names

```yaml
tasks:
  dpl:    # Bad - unclear
  deploy: # Good - descriptive
```

### 5. Document Complex Tasks

```yaml
tasks:
  complex-migration:
    description: |
      Performs database migration with backup.
      Duration: ~15 minutes
      Requirements: 5GB free space
```

## Migration Guide

### From v0.x to v1.0

```yaml
# Old format (v0.x)
hosts:
  - name: web
    address: example.com

# New format (v1.0)
targets:
  hosts:
    web:
      host: example.com
```

## Next Steps

- [Defining Targets](./targets/overview.md) - Configure execution environments
- [Creating Tasks](./tasks/overview.md) - Build automation workflows
- [Using Profiles](./profiles/overview.md) - Manage environments
- [Variable System](./variables/overview.md) - Dynamic configuration
- [Best Practices](./advanced/best-practices.md) - Configuration patterns

## See Also

- [Configuration Commands](../commands/built-in/config.md) - CLI configuration management
- [Troubleshooting](./advanced/troubleshooting.md) - Common issues
- [Validation](./advanced/validation.md) - Configuration validation