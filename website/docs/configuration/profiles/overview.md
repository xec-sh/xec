---
title: Profiles Overview
description: Managing environment-specific configurations with profiles
---

# Profiles Overview

Profiles enable you to manage different configurations for various environments (development, staging, production) or scenarios. They provide a clean way to override base configuration values without duplicating entire configuration files.

## What Are Profiles?

Profiles are named configuration sets that can:
- Override global variables
- Modify target configurations
- Set environment-specific values
- Inherit from other profiles
- Be activated via command-line or environment variables

## Basic Profile Structure

```yaml
profiles:
  development:
    vars:
      environment: dev
      debug: true
      logLevel: debug
    
  production:
    vars:
      environment: prod
      debug: false
      logLevel: error
```

## Profile Activation

### Environment Variable

```bash
# Set profile via environment
export XEC_PROFILE=production
xec run deploy
```

### Per-Command Flag

Some commands (`on`, `in`, `copy`, `logs`, `watch`, `forward`, `inspect`) accept a profile flag directly:

```bash
xec on -p production hosts.web "systemctl restart app"
```

There is no global `--profile` flag and no `defaultProfile` configuration key — use `XEC_PROFILE` to select a profile for a whole session.

## Variable Overrides

Profiles can override any variables defined in the main configuration:

```yaml
# Base configuration
vars:
  appName: myapp
  version: "1.0.0"
  replicas: 1

profiles:
  production:
    vars:
      replicas: 3      # Override replicas
      version: stable  # Override version
      # appName inherited as "myapp"
```

## Target Overrides

Modify target configurations per environment:

```yaml
# Base targets
targets:
  hosts:
    app-server:
      host: localhost
      port: 2222

profiles:
  production:
    targets:
      hosts:
        app-server:
          host: prod.example.com
          port: 22
          username: deploy
```

## Profile Inheritance

Profiles can extend other profiles:

```yaml
profiles:
  base:
    vars:
      region: us-east-1
      monitoring: enabled
  
  staging:
    extends: base
    vars:
      environment: staging
      replicas: 2
  
  production:
    extends: base
    vars:
      environment: production
      replicas: 5
      highAvailability: true
```

## Inheritance Chains

`extends` accepts a single parent profile (multi-parent inheritance is not supported). Build layered configurations as a chain instead:

```yaml
profiles:
  base:
    vars:
      encryption: true
      auditLog: enabled
  
  hardened:
    extends: base
    vars:
      caching: true
      compression: true
  
  production:
    extends: hardened
    vars:
      environment: production
```

## Environment Variables in Profiles

Set environment variables for command execution:

```yaml
profiles:
  development:
    env:
      NODE_ENV: development
      DEBUG: "*"
      API_URL: http://localhost:3000
  
  production:
    env:
      NODE_ENV: production
      DEBUG: ""
      API_URL: https://api.example.com
```

## Conditional Configuration

### Profile-Specific Tasks

```yaml
tasks:
  deploy:
    command: |
      if [ "${profile}" = "production" ]; then
        ./deploy-prod.sh
      else
        ./deploy-dev.sh
      fi
```

### Profile Detection in Scripts

The active profile is available to scripts through the environment:

```yaml
tasks:
  smart-deploy:
    script: |
      const profile = process.env.XEC_PROFILE;
      if (profile === 'production') {
        await $`./production-checks.sh`;
      }
      await $`./deploy.sh`;
```

## Profile Files

Profiles that are not defined inline in `config.yaml` are looked up automatically in `.xec/profiles/<name>.yaml`:

```yaml
# .xec/profiles/prod.yaml
extends: base
vars:
  environment: production
  replicas: 5
targets:
  hosts:
    web:
      host: prod-web.example.com
```

```bash
# Activates .xec/profiles/prod.yaml
XEC_PROFILE=prod xec run deploy
```

## Dynamic Profile Selection

Select the profile in the shell before invoking Xec:

```bash
# Based on git branch
branch=$(git branch --show-current)
XEC_PROFILE=$([ "$branch" = "main" ] && echo production || echo staging) xec run deploy

# Based on CI environment
XEC_PROFILE=${CI:+ci} xec run test
```

## Profile Validation

Ensure profile configurations are valid:

```bash
# Validate configuration (including the active profile)
XEC_PROFILE=production xec config validate

# Show a profile definition
xec config get profiles.staging
```

## Common Patterns

### Development Profile

```yaml
profiles:
  development:
    vars:
      environment: dev
      debug: true
      logLevel: debug
      replicas: 1
      cache: false
    
    targets:
      hosts:
        app:
          host: localhost
          port: 2222
      containers:
        db:
          image: postgres:15
          ports: ["5432:5432"]
    
    env:
      NODE_ENV: development
      DEBUG: "*"
```

### Staging Profile

```yaml
profiles:
  staging:
    extends: development
    vars:
      environment: staging
      debug: false
      logLevel: info
      replicas: 2
      cache: true
    
    targets:
      hosts:
        app:
          host: staging.example.com
          port: 22
```

### Production Profile

```yaml
profiles:
  production:
    vars:
      environment: prod
      debug: false
      logLevel: error
      replicas: 5
      cache: true
      monitoring: enabled
      alerting: enabled
    
    targets:
      hosts:
        app:
          host: prod.example.com
          username: deploy
          privateKey: ~/.ssh/prod_key
      
      kubernetes:
        context: production-cluster
        namespace: production
    
    env:
      NODE_ENV: production
      LOG_LEVEL: error
```

## Region-Specific Profiles

```yaml
profiles:
  us-east:
    vars:
      region: us-east-1
      availability_zones:
        - us-east-1a
        - us-east-1b
    targets:
      hosts:
        api:
          host: api-us-east.example.com
  
  eu-west:
    vars:
      region: eu-west-1
      availability_zones:
        - eu-west-1a
        - eu-west-1b
    targets:
      hosts:
        api:
          host: api-eu-west.example.com
```

## Feature Flags

```yaml
profiles:
  feature-x-enabled:
    vars:
      features:
        x: true
        y: false
    
  feature-y-enabled:
    vars:
      features:
        x: false
        y: true
  
  all-features:
    vars:
      features:
        x: true
        y: true
```

## Profile Composition

`extends` takes a single parent, so compose baselines as a chain — each layer extends the previous one:

```yaml
profiles:
  # Security baseline
  secure:
    vars:
      tls: true
      authentication: required
      encryption: aes256
  
  # Performance layer on top of the security baseline
  secure-fast:
    extends: secure
    vars:
      caching: true
      compression: gzip
      connectionPool: 10
  
  # Final profile
  production:
    extends: secure-fast
    vars:
      environment: production
```

## Profile Priority

Configuration sources are merged in this order (later overrides earlier):

1. Built-in defaults
2. Global configuration (`~/.xec/config.yaml`)
3. Project configuration (`.xec/config.yaml`)
4. `XEC_CONFIG` file and `XEC_*` environment variables
5. Active profile (inheritance chain resolved parent-first)

The active profile is the highest-priority source — its values win over everything else.

```yaml
# Base
vars:
  value: "base"

profiles:
  parent:
    vars:
      value: "parent"
  
  child:
    extends: parent
    vars:
      value: "child"  # This wins when child profile is active
```

## Testing with Profiles

```yaml
profiles:
  test:
    vars:
      environment: test
      database: test_db
      mockServices: true
    
    targets:
      containers:
        test-db:
          image: postgres:15
          env:
            POSTGRES_DB: test_db
    
    env:
      NODE_ENV: test
      MOCK_EXTERNAL_APIS: true
```

## CI/CD Profiles

```yaml
profiles:
  ci:
    vars:
      environment: ci
      parallel: true
      failFast: true
    
    env:
      CI: true
      TERM: dumb
      NO_COLOR: true
```

## Best Practices

### 1. Use Descriptive Names

```yaml
# Good
profiles:
  production-us-east:
  staging-eu-west:
  development-local:

# Bad
profiles:
  p1:
  s2:
  d3:
```

### 2. Inherit Common Settings

```yaml
profiles:
  base:
    vars:
      company: acme
      team: platform
  
  production:
    extends: base
    vars:
      environment: production
```

### 3. Keep Secrets Separate

```yaml
profiles:
  production:
    vars:
      apiKey: ${secrets.prod_api_key}  # Good
      # apiKey: "sk-12345"             # Bad
```

### 4. Document Profiles

```yaml
profiles:
  # Production environment profile.
  # Requires: VPN connection, prod credentials
  # Region: us-east-1
  production:
    vars:
      environment: production
```

### 5. Validate Profile Changes

```bash
# Before switching profiles
XEC_PROFILE=new-profile xec config validate
XEC_PROFILE=new-profile xec run smoke-test
```

## Troubleshooting

### Profile Not Found

```bash
# List profile definitions
xec config list --path profiles

# Check the profile definition
xec config get profiles.correct-name
```

### Variable Not Overridden

```yaml
# Check inheritance chain
profiles:
  child:
    extends: parent  # Check parent profile
    vars:
      myVar: value  # Ensure correct path
```

### Circular Inheritance

```yaml
# Avoid circular references
profiles:
  a:
    extends: b  # Error if b extends a
  b:
    extends: a
```

## See Also

- [Configuration Command](../../commands/built-in/config.md) - Profile management
- [Variables](../variables/overview.md) - Variable system
- [Environment Variables](../variables/environment.md) - Environment configuration