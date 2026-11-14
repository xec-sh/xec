---
title: Configuration Troubleshooting
description: Troubleshooting guide for common Xec configuration issues
---

# Configuration Troubleshooting {#configuration-troubleshooting}

This guide helps you diagnose and resolve common configuration issues in Xec. Each section covers specific problems, their causes, and solutions.

## Diagnostic Tools {#diagnostic-tools}

### Configuration Debugging {#configuration-debugging}

```bash
# Enable debug output — prints which config files are checked and loaded
XEC_DEBUG=true xec config view

# Validate the merged configuration
xec config validate

# Test configuration resolution for a single key
xec config get vars.database.host
```

### Built-in Diagnostics {#built-in-diagnostics}

```bash
# Check and fix configuration issues
xec config doctor

# Show all possible configuration options with defaults
xec config doctor --defaults
```

## Common Issues {#common-issues}

## YAML Syntax Errors {#yaml-syntax-errors}

### Problem: Invalid YAML {#problem-invalid-yaml}

```yaml
# Error: Mapping values are not allowed here
tasks:
  deploy: echo "test"
    target: production  # Wrong indentation
```

### Solution {#solution}

```yaml
# Correct indentation
tasks:
  deploy:
    command: echo "test"
    target: production
```

### Debugging Tips {#debugging-tips}

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

## Variable Resolution Issues {#variable-resolution-issues}

### Problem: Undefined Variable {#problem-undefined-variable}

```yaml
Error: Variable 'database.password' is not defined

tasks:
  connect:
    command: psql -p ${database.password}
```

### Solutions {#solutions}

#### 1. Define the Variable {#1-define-the-variable}

```yaml
vars:
  database:
    password: ${secrets.db_password}
```

#### 2. Provide Default Value {#2-provide-default-value}

```yaml
tasks:
  connect:
    command: psql -p ${database.password:default_password}
```

#### 3. Check Variable Path {#3-check-variable-path}

```bash
# List all variables
xec config list --path vars

# Check specific variable
xec config get vars.database
```

### Problem: Circular Variable Reference {#problem-circular-variable-reference}

```yaml
Error: Circular variable reference detected: a -> b -> c -> a

vars:
  a: ${b}
  b: ${c}
  c: ${a}
```

### Solution {#solution-1}

```yaml
# Break the circular dependency
vars:
  a: "initial_value"
  b: ${a}
  c: ${b}
```

## Target Connection Issues {#target-connection-issues}

### Problem: SSH Connection Failed {#problem-ssh-connection-failed}

```
Error: Failed to connect to hosts.production: Connection refused
```

### Diagnostic Steps {#diagnostic-steps}

```bash
# Test connectivity by running a command on the target
xec on hosts.production "echo ok" --verbose

# Check SSH configuration
xec config get targets.hosts.production

# Manual SSH test
ssh -v user@host -p 22
```

### Common Solutions {#common-solutions}

#### 1. Check SSH Configuration {#1-check-ssh-configuration}

```yaml
targets:
  hosts:
    production:
      host: prod.example.com
      port: 22  # Ensure correct port
      username: deploy  # Verify username
      privateKey: ~/.ssh/id_rsa  # Check key path
```

#### 2. Fix Key Permissions {#2-fix-key-permissions}

```bash
# SSH keys must have correct permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
chmod 700 ~/.ssh
```

#### 3. Add Host to Known Hosts {#3-add-host-to-known-hosts}

```bash
# Add host key
ssh-keyscan -H prod.example.com >> ~/.ssh/known_hosts
```

### Problem: Docker Connection Failed {#problem-docker-connection-failed}

```
Error: Cannot connect to Docker daemon
```

### Solutions {#solutions-1}

#### 1. Check Docker Service {#1-check-docker-service}

```bash
# Ensure Docker is running
docker info

# Start Docker if needed
sudo systemctl start docker  # Linux
open -a Docker  # macOS
```

#### 2. Configure Docker Socket {#2-configure-docker-socket}

```yaml
targets:
  containers:
    app:
      socketPath: /var/run/docker.sock  # Default
      # Or for remote Docker
      dockerHost: tcp://docker-host:2376
```

### Problem: Kubernetes Connection Failed {#problem-kubernetes-connection-failed}

```
Error: Unable to connect to kubernetes cluster
```

### Solutions {#solutions-2}

#### 1. Check Kubeconfig {#1-check-kubeconfig}

```bash
# Verify kubeconfig
kubectl config view
kubectl cluster-info
```

#### 2. Configure Context {#2-configure-context}

```yaml
targets:
  pods:
    app:
      kubeconfig: ~/.kube/config
      context: production-cluster
      namespace: default
```

## Task Execution Issues {#task-execution-issues}

### Problem: Task Not Found {#problem-task-not-found}

```
Error: Task 'deploy' not found
```

### Solutions {#solutions-3}

```bash
# List available tasks
xec config tasks list

# Check task definition
xec config get tasks.deploy
```

### Problem: Task Parameters Missing {#problem-task-parameters-missing}

```
Error: Required parameter 'version' not provided
```

### Solution {#solution-2}

```bash
# Provide parameter
xec run deploy --param version=1.2.3
# or, when running the task by name:
xec deploy --version 1.2.3
```

```yaml
# Or set a default in the task definition
tasks:
  deploy:
    params:
      - name: version
        default: "latest"
```

### Problem: Task Step Failed {#problem-task-step-failed}

```
Error: Step 'build' failed with exit code 1
```

### Debugging Steps {#debugging-steps}

```bash
# Run task with debug output
XEC_DEBUG=true xec run deploy

# Increase verbosity
xec run deploy --verbose
```

## Profile Issues {#profile-issues}

### Problem: Profile Not Found {#problem-profile-not-found}

```
Error: Profile 'production' not found
```

### Solutions {#solutions-4}

```bash
# List profile definitions
xec config list --path profiles

# Check a specific profile
xec config get profiles.production
```

### Problem: Profile Inheritance Error {#problem-profile-inheritance-error}

```
Error: Cannot extend profile 'base': not found
```

### Solution {#solution-3}

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

## Environment Variable Issues {#environment-variable-issues}

### Problem: Environment Variable Not Set {#problem-environment-variable-not-set}

```
Error: Environment variable 'API_KEY' is required but not set
```

### Solutions {#solutions-5}

#### 1. Set Environment Variable {#1-set-environment-variable}

```bash
export API_KEY="your-api-key"
xec run deploy
```

#### 2. Use .env File {#2-use-env-file}

```bash
# .env
API_KEY=your-api-key

# Load environment
source .env && xec run deploy
```

#### 3. Provide Default {#3-provide-default}

```yaml
# Default values use a plain colon: everything after ':' is the default
vars:
  apiKey: ${env.API_KEY:development-key}
```

## Permission Issues {#permission-issues}

### Problem: Permission Denied {#problem-permission-denied}

```
Error: Permission denied: /var/log/app.log
```

### Solutions {#solutions-6}

#### 1. Use Sudo {#1-use-sudo}

```yaml
targets:
  hosts:
    server:
      sudo:
        enabled: true
        password: ${secrets.sudo_password}
```

#### 2. Fix File Permissions {#2-fix-file-permissions}

```bash
# Change ownership
sudo chown $(whoami) /var/log/app.log

# Change permissions
chmod 644 /var/log/app.log
```

#### 3. Run as Different User {#3-run-as-different-user}

```yaml
targets:
  containers:
    app:
      user: root  # Or appropriate user
```

## Secret Management Issues {#secret-management-issues}

### Problem: Secret Not Found {#problem-secret-not-found}

```
Error: Secret 'database_password' not found
```

### Solutions {#solutions-7}

#### 1. Add Secret {#1-add-secret}

```bash
# Add secret to local store
xec secrets set database_password

# Or, with the env provider, set the variable (default prefix SECRET_)
export SECRET_DATABASE_PASSWORD="password"
```

#### 2. Configure Secret Provider {#2-configure-secret-provider}

The supported providers are `local` (encrypted file storage, the default), `env` (environment variables), and `git` (encrypted file in the repository):

```yaml
secrets:
  provider: env
  config:
    prefix: SECRET_
```

## Performance Issues {#performance-issues}

### Problem: Slow Configuration Loading {#problem-slow-configuration-loading}

### Solutions {#solutions-8}

#### 1. Avoid Expensive Command Substitutions {#1-avoid-expensive-command-substitutions}

Every `${cmd:...}` reference executes a shell command at configuration load time. Keep those commands fast, or replace them with static values or environment variables:

```yaml
vars:
  # Runs on every load — keep it cheap
  git_sha: ${cmd:git rev-parse --short HEAD}
```

#### 2. Enable Debug Logging to Find the Bottleneck {#2-enable-debug-logging-to-find-the-bottleneck}

```bash
# Shows which files are checked and loaded
XEC_DEBUG=true xec config view
```

### Problem: Connection Pool Exhausted {#problem-connection-pool-exhausted}

```
Error: Connection pool exhausted for hosts.production
```

### Solution {#solution-4}

```yaml
targets:
  hosts:
    production:
      connectionPool:
        min: 2
        max: 20  # Increase max connections
        idleTimeout: 300000
```

## Validation Errors {#validation-errors}

### Problem: Schema Validation Failed {#problem-schema-validation-failed}

```
Error: Configuration does not match schema: version is required
```

### Solution {#solution-5}

```yaml
# Add required fields
version: "1.0"  # Required
name: myapp     # Optional but recommended
```

### Problem: Type Mismatch {#problem-type-mismatch}

```
Error: Expected number for 'timeout', got string
```

### Solution {#solution-6}

```yaml
# Use correct types
timeout: 30000      # Number (milliseconds)
# Not: timeout: "30000"  # String
```

## Import and Module Issues {#import-and-module-issues}

### Problem: Import File Not Found {#problem-import-file-not-found}

```
Error: Cannot import 'profiles/production.yaml': File not found
```

### Solutions {#solutions-9}

```bash
# Check file exists
ls -la .xec/profiles/

# Create missing file
touch .xec/profiles/production.yaml

# Use correct path
$import:
  - ./profiles/production.yaml  # Relative to config file
```

## Debugging Strategies {#debugging-strategies}

### 1. Incremental Testing {#1-incremental-testing}

```bash
# Test configuration step by step
xec config validate            # Basic validation
xec on hosts.production "echo ok"  # Test connectivity
xec run simple-task            # Test simple task
```

### 2. Isolation Testing {#2-isolation-testing}

```bash
# Point Xec at a minimal test configuration
XEC_CONFIG=test-config.yaml xec run test
```

### 3. Verbose Output {#3-verbose-output}

```bash
# Maximum verbosity
XEC_DEBUG=true xec run deploy --verbose

# Log to file
XEC_DEBUG=true xec run deploy 2>&1 | tee debug.log
```

### 4. Configuration Inspection {#4-configuration-inspection}

```bash
# Show resolved configuration
xec config view

# Show specific sections
xec config targets list
xec config tasks list
xec config vars list

# Export configuration as JSON
xec config list --json > config-snapshot.json
```

## Recovery Procedures {#recovery-procedures}

### Configuration Backup {#configuration-backup}

```bash
# Backup configuration
cp -r .xec .xec.backup

# Version control
git add .xec/
git commit -m "Configuration backup"
```

### Reset Configuration {#reset-configuration}

```bash
# Restore from backup or version control
cp -r .xec.backup .xec
git checkout -- .xec/

# Regenerate a fresh project configuration
xec new project
```

## Getting Help {#getting-help}

### Built-in Help {#built-in-help}

```bash
# General help
xec --help

# Command-specific help
xec config --help
xec run --help
```

### Support Resources {#support-resources}

1. **Documentation**: [Xec documentation](../../introduction/index.md)
2. **GitHub Issues**: https://github.com/xec-sh/xec/issues

### Reporting Issues {#reporting-issues}

When reporting issues, include:

```bash
# Configuration health check
xec config doctor > doctor-output.txt

# Debug log
XEC_DEBUG=true xec [command] --verbose 2>&1 > debug.log

# Error message
# Include full error message and stack trace
```

## Prevention Tips {#prevention-tips}

### 1. Use Version Control {#1-use-version-control}

```bash
git add .xec/
git commit -m "Working configuration"
```

### 2. Test Changes {#2-test-changes}

```bash
# Test before applying
xec config validate
```

### 3. Document Changes {#3-document-changes}

```yaml
# Add comments explaining configuration
vars:
  # Production API endpoint (updated 2024-01-15)
  apiUrl: https://api.example.com
```

### 4. Use Profiles {#4-use-profiles}

```yaml
# Separate environments
profiles:
  development:  # Safe testing
  production:   # Stable configuration
```

### 5. Monitor Configuration {#5-monitor-configuration}

```bash
# Validate regularly (e.g. in CI or a cron job)
xec config validate

# Detect configuration drift against version control
git diff .xec/
```

## Next Steps {#next-steps}

- [Validation](./validation.md) - Configuration validation
- [Best Practices](./best-practices.md) - Avoid common issues

## See Also {#see-also}

- [Configuration Overview](../overview.md) - Configuration basics
- [Known Issues](https://github.com/xec-sh/xec/issues) - GitHub issues