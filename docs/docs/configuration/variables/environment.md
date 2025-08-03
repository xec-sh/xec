---
title: Environment Variables
description: Using environment variables in Xec configuration
---

# Environment Variables

Environment variables provide a flexible way to configure Xec without modifying configuration files. They're ideal for secrets, deployment-specific settings, and CI/CD integration.

## Environment Variable Types

### 1. Xec System Variables

Variables that control Xec behavior:

```bash
# Configuration
XEC_CONFIG=/path/to/config.yaml     # Custom config file
XEC_PROFILE=production               # Active profile
XEC_PROJECT_ROOT=/path/to/project   # Project directory

# Behavior
XEC_DEBUG=true                       # Enable debug output
XEC_VERBOSE=true                     # Verbose output
XEC_NO_COLOR=true                    # Disable colored output
XEC_QUIET=true                       # Suppress output

# Secrets
XEC_SECRETS_DIR=~/.xec/secrets      # Secrets storage
XEC_PASSPHRASE=encryption-key       # Secrets encryption key
```

### 2. Configuration Variables

Override configuration values:

```bash
# Override vars section
XEC_VARS_APP_NAME=myapp
XEC_VARS_VERSION=2.0.0
XEC_VARS_DATABASE_HOST=db.example.com
XEC_VARS_DATABASE_PORT=5432

# Nested variables
XEC_VARS_CACHE__HOST=redis.example.com  # cache.host
XEC_VARS_CACHE__PORT=6379              # cache.port
```

### 3. Secret Variables

Provide secrets via environment:

```bash
# Direct secrets
XEC_SECRET_API_KEY=sk-1234567890
XEC_SECRET_DATABASE_PASSWORD=secure-password
XEC_SECRET_SSH_PASSPHRASE=key-passphrase

# Secret provider configuration
XEC_VAULT_TOKEN=vault-token
XEC_AWS_SECRET_ACCESS_KEY=aws-key
```

### 4. User Environment Variables

Access system environment in configuration:

```bash
# System variables
HOME=/home/user
USER=developer
PATH=/usr/local/bin:/usr/bin:/bin

# Custom variables
API_URL=https://api.example.com
NODE_ENV=production
DEBUG=app:*
```

## Using Environment Variables

### In Configuration Files

```yaml
# Access environment variables
vars:
  # Direct access
  home: ${env.HOME}
  user: ${env.USER}
  
  # With defaults
  apiUrl: ${env.API_URL:-http://localhost:3000}
  nodeEnv: ${env.NODE_ENV:-development}
  
  # Complex usage
  database:
    host: ${env.DB_HOST:-localhost}
    port: ${env.DB_PORT:-5432}
    name: ${env.DB_NAME:-myapp}
    url: postgres://${env.DB_USER}:${env.DB_PASSWORD}@${database.host}:${database.port}/${database.name}
```

### In Tasks

```yaml
tasks:
  environment-aware:
    command: |
      echo "User: ${env.USER}"
      echo "Home: ${env.HOME}"
      echo "Path: ${env.PATH}"
      echo "Custom: ${env.CUSTOM_VAR}"
    
    # Pass environment to command
    env:
      NODE_ENV: ${env.NODE_ENV:-development}
      API_KEY: ${env.API_KEY}
      WORKERS: ${env.WORKERS:-4}
```

### In Scripts

```yaml
tasks:
  script-env:
    script: |
      // Access environment variables
      const homeDir = process.env.HOME;
      const apiUrl = process.env.API_URL || 'http://localhost:3000';
      
      // Use in logic
      if (process.env.NODE_ENV === 'production') {
        await runProductionChecks();
      }
      
      // Set new environment variables
      process.env.CUSTOM_VAR = 'value';
```

## Environment Variable Precedence

Variables are resolved in this order (highest to lowest):

1. **Command-line arguments**
2. **XEC_VARS_* variables**
3. **Profile variables**
4. **Configuration file variables**
5. **Default values**

Example:

```bash
# Configuration file
vars:
  port: 8080

# Profile
profiles:
  production:
    vars:
      port: 3000

# Environment variable
export XEC_VARS_PORT=9000

# Command line
xec --var port=5000 run server

# Result: port = 5000 (command-line wins)
```

## Setting Environment Variables

### Shell Export

```bash
# Bash/Zsh
export XEC_PROFILE=production
export API_KEY=secret-key

# Fish
set -x XEC_PROFILE production
set -x API_KEY secret-key

# Windows CMD
set XEC_PROFILE=production
set API_KEY=secret-key

# Windows PowerShell
$env:XEC_PROFILE = "production"
$env:API_KEY = "secret-key"
```

### .env Files

```bash
# .env file
XEC_PROFILE=development
NODE_ENV=development
API_URL=http://localhost:3000
DATABASE_URL=postgres://localhost/dev

# Load .env file
source .env  # Bash
export $(cat .env | xargs)  # Alternative
```

### dotenv Integration

```yaml
# Configure dotenv support
secrets:
  provider: dotenv
  config:
    file: .env
    encoding: utf8
    override: false
```

### CI/CD Systems

#### GitHub Actions

```yaml
# .github/workflows/deploy.yml
env:
  XEC_PROFILE: production
  API_KEY: ${{ secrets.API_KEY }}

jobs:
  deploy:
    steps:
      - run: xec run deploy
```

#### GitLab CI

```yaml
# .gitlab-ci.yml
variables:
  XEC_PROFILE: production
  API_KEY: ${CI_API_KEY}

deploy:
  script:
    - xec run deploy
```

#### Jenkins

```groovy
// Jenkinsfile
environment {
  XEC_PROFILE = 'production'
  API_KEY = credentials('api-key')
}

stage('Deploy') {
  sh 'xec run deploy'
}
```

## Profile Selection via Environment

### Default Profile

```bash
# Set default profile
export XEC_PROFILE=staging

# All commands use staging profile
xec run deploy  # Uses staging
xec run test    # Uses staging
```

### Override Profile

```bash
# Environment sets default
export XEC_PROFILE=staging

# Command-line overrides
xec --profile production run deploy  # Uses production
```

### Dynamic Profile Selection

```yaml
tasks:
  auto-profile:
    script: |
      // Select profile based on environment
      const profile = process.env.CI 
        ? 'ci'
        : process.env.USER === 'developer'
          ? 'development'
          : 'production';
      
      await xec.useProfile(profile);
```

## Secret Management

### Environment-Based Secrets

```bash
# Provide secrets via environment
export XEC_SECRET_API_KEY=sk-1234567890
export XEC_SECRET_DB_PASSWORD=secure-password

# Use in configuration
vars:
  apiKey: ${secrets.api_key}
  dbPassword: ${secrets.db_password}
```

### Secret Provider Configuration

```bash
# HashiCorp Vault
export VAULT_ADDR=https://vault.example.com
export VAULT_TOKEN=token

# AWS Secrets Manager
export AWS_REGION=us-east-1
export AWS_SECRET_ACCESS_KEY=key
export AWS_SECRET_ACCESS_KEY_ID=id

# 1Password
export OP_SESSION_myteam=session-token
```

## Debugging Environment Variables

### List All Variables

```bash
# Show all environment variables
env | grep XEC_

# Show in Xec
xec config show --env

# Debug script
xec debug env
```

### Trace Variable Resolution

```yaml
tasks:
  debug-env:
    script: |
      console.log('XEC variables:');
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('XEC_'))
        .forEach(([key, value]) => {
          console.log(`  ${key}=${value}`);
        });
```

### Test Variable Override

```bash
# Test different values
XEC_VARS_PORT=3000 xec config get vars.port
XEC_VARS_DEBUG=true xec run test
```

## Common Patterns

### Development Environment

```bash
# .env.development
XEC_PROFILE=development
NODE_ENV=development
DEBUG=*
API_URL=http://localhost:3000
DATABASE_URL=postgres://localhost/dev
REDIS_URL=redis://localhost:6379
```

### Production Environment

```bash
# .env.production
XEC_PROFILE=production
NODE_ENV=production
DEBUG=
API_URL=https://api.example.com
DATABASE_URL=${DATABASE_URL}  # From CI/CD
REDIS_URL=${REDIS_URL}        # From CI/CD
```

### Docker Environment

```dockerfile
# Dockerfile
ENV XEC_PROFILE=production
ENV NODE_ENV=production
ENV API_URL=https://api.example.com

# docker-compose.yml
services:
  app:
    environment:
      - XEC_PROFILE=production
      - API_KEY=${API_KEY}
      - DATABASE_URL=${DATABASE_URL}
```

### Kubernetes Environment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        env:
        - name: XEC_PROFILE
          value: production
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: api-key
```

## Security Best Practices

### 1. Never Commit Secrets

```bash
# .gitignore
.env
.env.*
!.env.example
```

### 2. Use Secret Management

```yaml
# Good - use secret management
vars:
  apiKey: ${secrets.api_key}

# Bad - hardcoded secret
vars:
  apiKey: "sk-1234567890"  # NEVER DO THIS
```

### 3. Validate Required Variables

```yaml
tasks:
  validate-env:
    script: |
      const required = [
        'API_KEY',
        'DATABASE_URL',
        'REDIS_URL'
      ];
      
      const missing = required.filter(
        key => !process.env[key]
      );
      
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }
```

### 4. Sanitize Output

```yaml
tasks:
  safe-echo:
    command: |
      # Don't echo secrets
      echo "API URL: ${API_URL}"
      echo "API Key: [REDACTED]"
```

### 5. Use Minimal Exposure

```yaml
# Only expose needed variables
tasks:
  limited:
    env:
      NODE_ENV: production
      # Don't pass all environment
```

## Troubleshooting

### Variable Not Found

```bash
# Check if variable is set
echo $MY_VAR

# Check in Xec
xec config get env.MY_VAR

# Debug resolution
xec --debug config show --vars
```

### Variable Not Overriding

```bash
# Check precedence
xec config sources

# Force override
xec --var myVar=value run task
```

### Special Characters

```bash
# Escape special characters
export MY_VAR='value with $pecial characters'
export MY_VAR="value with \"quotes\""
export MY_VAR=$'value with\nnewline'
```

## Platform-Specific Notes

### Linux/macOS

```bash
# Persistent environment
echo 'export XEC_PROFILE=production' >> ~/.bashrc
echo 'export XEC_PROFILE=production' >> ~/.zshrc
```

### Windows

```powershell
# Persistent environment (PowerShell)
[System.Environment]::SetEnvironmentVariable(
  'XEC_PROFILE', 'production', 'User'
)

# Persistent environment (CMD)
setx XEC_PROFILE production
```

### WSL

```bash
# Share with Windows
export WSLENV=$WSLENV:XEC_PROFILE
```

## Best Practices

### 1. Document Required Variables

```yaml
# .xec/README.md
vars:
  _required_env:
    - API_KEY: API authentication key
    - DATABASE_URL: PostgreSQL connection string
    - REDIS_URL: Redis connection string
```

### 2. Provide Example Configuration

```bash
# .env.example
XEC_PROFILE=development
API_URL=http://localhost:3000
DATABASE_URL=postgres://user:pass@localhost/db
```

### 3. Validate Early

```yaml
tasks:
  init:
    hooks:
      before:
        - task: validate-environment
```

### 4. Use Consistent Naming

```bash
# Good - consistent prefix
XEC_API_KEY=value
XEC_DATABASE_URL=value
XEC_REDIS_URL=value

# Bad - mixed naming
apiKey=value
DB_URL=value
REDIS=value
```

### 5. Group Related Variables

```bash
# Database configuration
XEC_DB_HOST=localhost
XEC_DB_PORT=5432
XEC_DB_NAME=myapp
XEC_DB_USER=user
XEC_DB_PASSWORD=pass
```

## Next Steps

- [Best Practices](../advanced/best-practices.md) - Configuration patterns

## See Also

- [Configuration Overview](../overview.md) - Configuration basics
- [Variables Overview](./overview.md) - Variable system
- [Profiles](../profiles/overview.md) - Profile configuration