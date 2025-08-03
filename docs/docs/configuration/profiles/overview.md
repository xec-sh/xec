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

### Command-Line

```bash
# Use specific profile
xec --profile production run deploy

# Short form
xec -p staging run test
```

### Environment Variable

```bash
# Set profile via environment
export XEC_PROFILE=production
xec run deploy
```

### Configuration Default

```yaml
# .xec/config.yaml
defaultProfile: development

profiles:
  development:
    # ...
```

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

## Multiple Inheritance

```yaml
profiles:
  security:
    vars:
      encryption: true
      auditLog: enabled
  
  performance:
    vars:
      caching: true
      compression: true
  
  production:
    extends: [security, performance]
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

```yaml
tasks:
  smart-deploy:
    script: |
      const profile = xec.profile;
      if (profile === 'production') {
        await xec.run('production-checks');
      }
      await xec.run('deploy');
```

## Profile Files

Organize profiles in separate files:

```yaml
# .xec/config.yaml
profiles:
  $import:
    - profiles/dev.yaml
    - profiles/staging.yaml
    - profiles/prod.yaml
```

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

## Dynamic Profile Selection

### Based on Git Branch

```yaml
tasks:
  auto-deploy:
    script: |
      const branch = await $`git branch --show-current`;
      const profile = branch === 'main' ? 'production' : 'staging';
      await xec.useProfile(profile);
      await xec.run('deploy');
```

### Based on Environment

```yaml
tasks:
  smart-profile:
    script: |
      const profile = process.env.CI 
        ? 'ci' 
        : process.env.USER === 'developer' 
          ? 'development' 
          : 'production';
      await xec.useProfile(profile);
```

## Profile Validation

Ensure profile configurations are valid:

```bash
# Validate specific profile
xec config validate --profile production

# List available profiles
xec config profiles

# Show profile configuration
xec config show --profile staging
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

### Base Profiles

```yaml
profiles:
  # Security baseline
  secure:
    vars:
      tls: true
      authentication: required
      encryption: aes256
  
  # Performance baseline
  fast:
    vars:
      caching: true
      compression: gzip
      connectionPool: 10
  
  # Combine baselines
  production:
    extends: [secure, fast]
    vars:
      environment: production
```

### Layered Profiles

```yaml
profiles:
  # Infrastructure layer
  aws:
    vars:
      cloud: aws
      region: us-east-1
  
  # Application layer
  api:
    vars:
      service: api
      port: 3000
  
  # Combined profile
  aws-api-prod:
    extends: [aws, api]
    vars:
      environment: production
```

## Profile Priority

Configuration sources are merged in this order:

1. Base configuration
2. Imported configurations
3. Profile inheritance chain
4. Active profile
5. Environment variables
6. Command-line arguments

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
  production:
    description: |
      Production environment profile.
      Requires: VPN connection, prod credentials
      Region: us-east-1
    vars:
      environment: production
```

### 5. Validate Profile Changes

```bash
# Before switching profiles
xec config validate --profile new-profile
xec run smoke-test --profile new-profile --dry-run
```

## Troubleshooting

### Profile Not Found

```bash
# List available profiles
xec config profiles

# Check profile name
xec config show --profile correct-name
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