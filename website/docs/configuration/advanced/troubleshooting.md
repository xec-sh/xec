---
title: Configuration Troubleshooting
description: Troubleshooting guide for common Xec configuration issues
---

# Configuration Troubleshooting

This guide helps you diagnose and resolve common configuration issues in Xec. Each section covers specific problems, their causes, and solutions.

## Diagnostic Tools

### Configuration Debugging

```bash
# Enable debug output
xec --debug config show

# Trace configuration loading
xec --trace config validate

# Show configuration sources
xec config sources

# Test configuration resolution
xec config resolve --var database.host
```

### Built-in Diagnostics

```bash
# Run full diagnostics
xec doctor

# Check specific component
xec doctor --check configuration
xec doctor --check targets
xec doctor --check connectivity
```

## Common Issues

## YAML Syntax Errors

### Problem: Invalid YAML

```yaml
# Error: Mapping values are not allowed here
tasks:
  deploy: echo "test"
    target: production  # Wrong indentation
```

### Solution

```yaml
# Correct indentation
tasks:
  deploy:
    command: echo "test"
    target: production
```

### Debugging Tips

```bash
# Validate YAML syntax
yamllint .xec/config.yaml

# Use YAML validator
python -c "import yaml; yaml.safe_load(open('.xec/config.yaml'))"

# Common YAML issues:
# - Tabs instead of spaces
# - Inconsistent indentation
# - Missing colons
# - Unclosed quotes
```

## Variable Resolution Issues

### Problem: Undefined Variable

```yaml
Error: Variable 'database.password' is not defined

tasks:
  connect:
    command: psql -p ${database.password}
```

### Solutions

#### 1. Define the Variable

```yaml
vars:
  database:
    password: ${secrets.db_password}
```

#### 2. Provide Default Value

```yaml
tasks:
  connect:
    command: psql -p ${database.password:-default_password}
```

#### 3. Check Variable Path

```bash
# List all variables
xec config show --vars

# Check specific variable
xec config get vars.database
```

### Problem: Circular Variable Reference

```yaml
Error: Circular variable reference detected: a -> b -> c -> a

vars:
  a: ${b}
  b: ${c}
  c: ${a}
```

### Solution

```yaml
# Break the circular dependency
vars:
  a: "initial_value"
  b: ${a}
  c: ${b}
```

## Target Connection Issues

### Problem: SSH Connection Failed

```
Error: Failed to connect to hosts.production: Connection refused
```

### Diagnostic Steps

```bash
# Test SSH connectivity
xec test hosts.production --verbose

# Check SSH configuration
xec config show --target hosts.production

# Manual SSH test
ssh -v user@host -p 22
```

### Common Solutions

#### 1. Check SSH Configuration

```yaml
targets:
  hosts:
    production:
      host: prod.example.com
      port: 22  # Ensure correct port
      username: deploy  # Verify username
      privateKey: ~/.ssh/id_rsa  # Check key path
```

#### 2. Fix Key Permissions

```bash
# SSH keys must have correct permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
chmod 700 ~/.ssh
```

#### 3. Add Host to Known Hosts

```bash
# Add host key
ssh-keyscan -H prod.example.com >> ~/.ssh/known_hosts
```

### Problem: Docker Connection Failed

```
Error: Cannot connect to Docker daemon
```

### Solutions

#### 1. Check Docker Service

```bash
# Ensure Docker is running
docker info

# Start Docker if needed
sudo systemctl start docker  # Linux
open -a Docker  # macOS
```

#### 2. Configure Docker Socket

```yaml
targets:
  containers:
    app:
      socketPath: /var/run/docker.sock  # Default
      # Or for remote Docker
      dockerHost: tcp://docker-host:2376
```

### Problem: Kubernetes Connection Failed

```
Error: Unable to connect to kubernetes cluster
```

### Solutions

#### 1. Check Kubeconfig

```bash
# Verify kubeconfig
kubectl config view
kubectl cluster-info
```

#### 2. Configure Context

```yaml
targets:
  pods:
    app:
      kubeconfig: ~/.kube/config
      context: production-cluster
      namespace: default
```

## Task Execution Issues

### Problem: Task Not Found

```
Error: Task 'deploy' not found
```

### Solutions

```bash
# List available tasks
xec task list

# Search for tasks
xec task search deploy

# Check task definition
xec config show --tasks
```

### Problem: Task Parameters Missing

```
Error: Required parameter 'version' not provided
```

### Solution

```bash
# Provide parameter
xec run deploy --version 1.2.3

# Or set default
tasks:
  deploy:
    params:
      - name: version
        default: "latest"
```

### Problem: Task Step Failed

```
Error: Step 'build' failed with exit code 1
```

### Debugging Steps

```bash
# Run task with debug output
xec run deploy --debug

# Run specific step
xec run deploy --only-step build

# Dry run
xec run deploy --dry-run
```

## Profile Issues

### Problem: Profile Not Found

```
Error: Profile 'production' not found
```

### Solutions

```bash
# List available profiles
xec config profiles

# Check profile definition
xec config show --profiles
```

### Problem: Profile Inheritance Error

```
Error: Cannot extend profile 'base': not found
```

### Solution

```yaml
# Ensure base profile exists
profiles:
  base:
    vars:
      environment: base
  
  production:
    extends: base  # Now valid
    vars:
      environment: production
```

## Environment Variable Issues

### Problem: Environment Variable Not Set

```
Error: Environment variable 'API_KEY' is required but not set
```

### Solutions

#### 1. Set Environment Variable

```bash
export API_KEY="your-api-key"
xec run deploy
```

#### 2. Use .env File

```bash
# .env
API_KEY=your-api-key

# Load environment
source .env && xec run deploy
```

#### 3. Provide Default

```yaml
vars:
  apiKey: ${env.API_KEY:-development-key}
```

## Permission Issues

### Problem: Permission Denied

```
Error: Permission denied: /var/log/app.log
```

### Solutions

#### 1. Use Sudo

```yaml
targets:
  hosts:
    server:
      sudo:
        enabled: true
        password: ${secrets.sudo_password}
```

#### 2. Fix File Permissions

```bash
# Change ownership
sudo chown $(whoami) /var/log/app.log

# Change permissions
chmod 644 /var/log/app.log
```

#### 3. Run as Different User

```yaml
targets:
  containers:
    app:
      user: root  # Or appropriate user
```

## Secret Management Issues

### Problem: Secret Not Found

```
Error: Secret 'database_password' not found
```

### Solutions

#### 1. Add Secret

```bash
# Add secret to local store
xec secret set database_password

# Or use environment
export XEC_SECRET_DATABASE_PASSWORD="password"
```

#### 2. Configure Secret Provider

```yaml
secrets:
  provider: vault
  config:
    address: https://vault.example.com
    token: ${env.VAULT_TOKEN}
```

## Performance Issues

### Problem: Slow Configuration Loading

### Solutions

#### 1. Optimize Imports

```yaml
# Instead of multiple imports
$import:
  - tasks/*.yaml  # Glob pattern is faster

# Than individual files
$import:
  - tasks/deploy.yaml
  - tasks/backup.yaml
  - tasks/monitoring.yaml
```

#### 2. Cache Configuration

```bash
# Enable configuration cache
xec config cache enable

# Clear cache if needed
xec config cache clear
```

### Problem: Connection Pool Exhausted

```
Error: Connection pool exhausted for hosts.production
```

### Solution

```yaml
targets:
  hosts:
    production:
      connectionPool:
        min: 2
        max: 20  # Increase max connections
        idleTimeout: 300000
```

## Validation Errors

### Problem: Schema Validation Failed

```
Error: Configuration does not match schema: version is required
```

### Solution

```yaml
# Add required fields
version: "1.0"  # Required
name: myapp     # Optional but recommended
```

### Problem: Type Mismatch

```
Error: Expected number for 'timeout', got string
```

### Solution

```yaml
# Use correct types
timeout: 30000      # Number (milliseconds)
# Not: timeout: "30000"  # String
```

## Import and Module Issues

### Problem: Import File Not Found

```
Error: Cannot import 'profiles/production.yaml': File not found
```

### Solutions

```bash
# Check file exists
ls -la .xec/profiles/

# Create missing file
touch .xec/profiles/production.yaml

# Use correct path
$import:
  - ./profiles/production.yaml  # Relative to config file
```

## Debugging Strategies

### 1. Incremental Testing

```bash
# Test configuration step by step
xec config validate           # Basic validation
xec test --all-targets        # Test connectivity
xec run simple-task          # Test simple task
xec run complex-task --dry-run  # Test without execution
```

### 2. Isolation Testing

```yaml
# Create minimal test configuration
# test-config.yaml
version: "1.0"
tasks:
  test:
    command: echo "test"

# Test isolated configuration
xec --config test-config.yaml run test
```

### 3. Verbose Output

```bash
# Maximum verbosity
xec --debug --trace --verbose run deploy

# Log to file
xec --debug run deploy 2>&1 | tee debug.log
```

### 4. Configuration Inspection

```bash
# Show resolved configuration
xec config show --resolved

# Show specific section
xec config show --targets
xec config show --tasks
xec config show --vars

# Export configuration
xec config export > config-snapshot.yaml
```

## Recovery Procedures

### Configuration Backup

```bash
# Backup configuration
cp -r .xec .xec.backup

# Version control
git add .xec/
git commit -m "Configuration backup"
```

### Safe Mode

```bash
# Run with minimal configuration
xec --safe-mode run task

# Skip validation
xec --skip-validation run task
```

### Reset Configuration

```bash
# Reset to defaults
xec config reset

# Regenerate configuration
xec init --force
```

## Getting Help

### Built-in Help

```bash
# General help
xec help

# Command-specific help
xec help config
xec help run

# Show examples
xec examples
```

### Support Resources

1. **Documentation**: https://xec.sh/docs
2. **GitHub Issues**: https://github.com/xec-sh/xec/issues
3. **Discord Community**: https://discord.gg/xec
4. **Stack Overflow**: Tag `xec-cli`

### Reporting Issues

When reporting issues, include:

```bash
# System information
xec doctor --system-info > system-info.txt

# Configuration (sanitized)
xec config export --sanitize > config.yaml

# Debug log
xec --debug --trace [command] 2>&1 > debug.log

# Error message
# Include full error message and stack trace
```

## Prevention Tips

### 1. Use Version Control

```bash
git add .xec/
git commit -m "Working configuration"
```

### 2. Test Changes

```bash
# Test before applying
xec config validate
xec run task --dry-run
```

### 3. Document Changes

```yaml
# Add comments explaining configuration
vars:
  # Production API endpoint (updated 2024-01-15)
  apiUrl: https://api.example.com
```

### 4. Use Profiles

```yaml
# Separate environments
profiles:
  development:  # Safe testing
  production:   # Stable configuration
```

### 5. Monitor Configuration

```bash
# Regular validation
xec config validate --schedule daily

# Configuration drift detection
xec config diff
```

## Next Steps

- [Validation](./validation.md) - Configuration validation
- [Best Practices](./best-practices.md) - Avoid common issues

## See Also

- [Configuration Overview](../overview.md) - Configuration basics
- [Known Issues](https://github.com/xec-sh/xec/issues) - GitHub issues
- [Community Forum](https://forum.xec.sh) - Community support