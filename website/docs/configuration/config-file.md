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

Xec first determines the project root by walking up from the current directory, taking the first of:

1. A directory containing `.xec/config.yaml` (or `.yml`)
2. A monorepo root (`package.json` with `workspaces`)
3. A git repository root (`.git`)
4. The current directory, if none of the above are found

Within that root it loads the first configuration file found among (in order):

1. `.xec/config.yaml` - Project directory (recommended)
2. `.xec/config.yml` - Alternative extension
3. `xec.yaml` - Root directory
4. `xec.yml` - Alternative root location

A global configuration at `~/.xec/config.yaml` (overridable via `XEC_HOME_DIR`) is loaded before the project file, and `XEC_CONFIG` can point to an additional file that overrides both. See [Configuration Precedence](#configuration-precedence) below for the full merge order.

```bash
# Validate your configuration
xec config validate

# Show loaded configuration
xec config view
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

Variables can reference other variables. The supported reference forms are `${vars.name}` (or bare `${name}`), `${env.NAME}`, `${params.name}` (inside tasks), `${secrets.name}` / `${secret:name}`, and `${cmd:command}`:

```yaml
vars:
  base_url: https://api.example.com
  api_endpoint: "${base_url}/v2"
  
  # Nested references
  env: production
  config_file: "/etc/${app_name}/${env}.conf"
  
  # Environment variables
  home_dir: "${env.HOME}"
  # Default values: everything after ':' is the default
  # (bash-style ':-' is NOT supported — ':-x' would yield the default '-x')
  path_with_default: "${env.CUSTOM_PATH:/default/path}"
```

### Command Substitution

`${cmd:command}` executes a shell command **at configuration load time** and substitutes its trimmed stdout. Keep these commands fast and side-effect free — they run every time the configuration is loaded, and their output is never written back to disk by `xec config set`:

```yaml
vars:
  git_sha: ${cmd:git rev-parse --short HEAD}
  build_date: ${cmd:date +%Y-%m-%d}
  image_tag: "myapp:${cmd:git describe --tags --always}"
```

If the command fails, configuration loading fails with a descriptive error.

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
  
  # SSH hosts (the field is 'user'; the programmatic $.ssh() API uses 'username')
  hosts:
    web-server:
      host: web.example.com
      user: deploy
      privateKey: ~/.ssh/id_rsa
    
    db-server:
      host: db.example.com
      user: admin
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
```

:::warning Not implemented
The schema also accepts `scripts.globals` and `scripts.sandbox` keys, but they are only validated — **no sandboxing or global-module auto-loading is enforced at runtime**. Do not rely on `sandbox` for security isolation.
:::

## Secrets Section

Configure secret management. The supported providers are `local`, `env`, and `git`:

```yaml
secrets:
  # Local encrypted storage (default)
  provider: local
  config:
    storageDir: ~/.xec/secrets
    passphrase: ${env.XEC_PASSPHRASE}
  
  # Environment variables (reads SECRET_* by default)
  # provider: env
  # config:
  #   prefix: SECRET_
  
  # Encrypted file tracked in git
  # provider: git
```

:::warning Not implemented
`vault`, `aws-secrets`, `1password`, and `dotenv` are declared in the provider type but **not implemented** — selecting them fails with a configuration error listing the supported providers.
:::

## Extensions Section

:::warning Not implemented
The configuration schema accepts an `extensions:` array (each entry with a `source` and optional `tasks`/`config`), and it passes validation — but **nothing loads extensions at runtime**. The section currently has no effect. To extend Xec, use [custom commands](../commands/custom/creating-commands.md) in `.xec/commands/` instead.
:::

## Complete Example

Here's a complete configuration example:

```yaml
version: "1.0"
name: microservices-platform
description: Production microservices deployment

# Global variables
vars:
  project: ecommerce
  environment: ${env.DEPLOY_ENV:staging}
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
      user: deploy
      privateKey: ~/.ssh/deploy_key
    
    web-server:
      host: web.${environment}.example.com
      user: deploy
      privateKey: ~/.ssh/deploy_key
  
  containers:
    database:
      image: postgres:15
      env:
        POSTGRES_DB: ${project}
        POSTGRES_PASSWORD: ${secrets.db_password}
  
  kubernetes:
    $namespace: ${project}-${environment}
    $context: ${region}-cluster

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
        $namespace: ${project}-staging
  
  production:
    vars:
      environment: production
      replicas: 5
      monitoring: enabled
    targets:
      kubernetes:
        $namespace: ${project}-prod
        $context: prod-cluster

# Command defaults
commands:
  logs:
    tail: 200
    follow: true
    timestamps: true

# Secrets configuration
secrets:
  provider: local
  config:
    storageDir: ~/.xec/secrets
```

## Schema Validation

Xec validates the merged configuration on load:

```bash
# Validate configuration
xec config validate

# Validate a specific file
XEC_CONFIG=custom-config.yaml xec config validate
```

## Configuration Precedence

Configuration sources are merged in this order — later sources override earlier ones:

1. **Built-in defaults** - Lowest priority
2. **Global configuration** - `~/.xec/config.yaml` (or `$XEC_HOME_DIR/config.yaml`)
3. **Project configuration** - First file found (see [File Location](#file-location))
4. **`XEC_CONFIG` file** - Extra file referenced by the environment variable
5. **`XEC_*` environment variables** - e.g. `XEC_VARS_PORT=9000` sets `vars.port`
6. **Active profile** - Selected via `XEC_PROFILE`; highest priority

Task parameters (`${params.name}`) are not part of this merge — they are supplied per task invocation and live in their own namespace.

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