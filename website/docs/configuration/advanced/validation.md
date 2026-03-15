---
title: Configuration Validation
description: Validating and testing Xec configurations
---

# Configuration Validation

Xec provides comprehensive validation capabilities to ensure your configurations are correct, secure, and optimized before deployment. This guide covers validation strategies, tools, and best practices.

## Validation Levels

### 1. Schema Validation

Validates configuration structure and types:

```bash
# Validate against schema
xec config validate

# Output
✓ Schema validation passed
✓ Version: 1.0 (supported)
✓ Structure: Valid YAML
✓ Required fields present
```

### 2. Semantic Validation

Checks logical consistency:

```bash
# Detailed validation
xec config validate --verbose

# Checks:
# - Target references exist
# - Task dependencies are valid
# - Variables are defined
# - Profiles inheritance is correct
```

### 3. Runtime Validation

Validates execution environment:

```bash
# Test runtime compatibility
xec config validate --runtime

# Checks:
# - Target connectivity
# - Command availability
# - Resource access
# - Secret availability
```

## Configuration Schema

### Schema Structure

```yaml
# Xec follows this schema
$schema: https://xec.sh/schema/v1.0/config.json

version: "1.0"  # Required, must match schema version
name: string    # Optional, project name
description: string  # Optional, project description

vars:           # Optional, variable definitions
  type: object
  additionalProperties: true

targets:        # Optional, target definitions
  type: object
  properties:
    defaults: object
    hosts: object
    containers: object
    pods: object

tasks:          # Optional, task definitions
  type: object
  additionalProperties:
    oneOf:
      - type: string
      - type: object

profiles:       # Optional, profile definitions
  type: object
  additionalProperties: object
```

### Type Validation

```yaml
# Types are enforced
vars:
  port: 8080        # Must be number
  enabled: true     # Must be boolean
  name: "myapp"     # Must be string
  servers:          # Must be array
    - server1
    - server2
  config:           # Must be object
    key: value
```

## Validation Commands

### Basic Validation

```bash
# Validate current configuration
xec config validate

# Validate specific file
xec config validate --file custom-config.yaml

# Validate with profile
xec config validate --profile production
```

### Detailed Validation

```bash
# Show all validation details
xec config validate --verbose

# Show validation errors only
xec config validate --errors-only

# Output as JSON
xec config validate --json
```

### Selective Validation

```bash
# Validate specific sections
xec config validate --targets
xec config validate --tasks
xec config validate --variables

# Validate specific target
xec config validate --target hosts.production
```

## Common Validation Errors

### Missing Required Fields

```yaml
# Error: version is required
name: myapp
tasks:
  deploy: echo "deploy"

# Fix: Add version
version: "1.0"
name: myapp
tasks:
  deploy: echo "deploy"
```

### Invalid References

```yaml
# Error: Target 'hosts.nonexistent' not found
tasks:
  deploy:
    command: deploy
    target: hosts.nonexistent

# Fix: Use existing target
tasks:
  deploy:
    command: deploy
    target: hosts.production
```

### Circular Dependencies

```yaml
# Error: Circular dependency detected
profiles:
  a:
    extends: b
  b:
    extends: a

# Fix: Remove circular reference
profiles:
  base:
    vars: {...}
  a:
    extends: base
  b:
    extends: base
```

### Type Mismatches

```yaml
# Error: Expected number, got string
vars:
  port: "8080"  # String

tasks:
  connect:
    command: connect --port ${port + 100}  # Math operation

# Fix: Use correct type
vars:
  port: 8080  # Number
```

## Variable Validation

### Undefined Variables

```yaml
# Detect undefined variables
vars:
  defined: value

tasks:
  test:
    command: echo ${undefined}  # Error: undefined variable

# Fix: Define or provide default
tasks:
  test:
    command: echo ${undefined:-default}
```

### Variable Resolution

```bash
# Test variable resolution
xec config show --vars

# Test specific variable
xec config get vars.database.host

# Test with profile
xec config get vars.database.host --profile production
```

### Circular References

```yaml
# Detect circular variable references
vars:
  a: ${b}
  b: ${c}
  c: ${a}  # Error: circular reference

# Fix: Remove circular dependency
vars:
  a: value1
  b: ${a}
  c: ${b}
```

## Target Validation

### Connectivity Testing

```bash
# Test target connectivity
xec test hosts.production

# Test all targets
xec test --all-targets

# Verbose testing
xec test hosts.production --verbose
```

### SSH Target Validation

```yaml
# Validate SSH configuration
targets:
  hosts:
    server:
      host: example.com
      username: deploy
      privateKey: ~/.ssh/id_rsa

# Validation checks:
# - Host resolves
# - Port is open
# - Key file exists
# - Key has correct permissions
```

### Docker Target Validation

```yaml
# Validate Docker configuration
targets:
  containers:
    app:
      image: node:18

# Validation checks:
# - Docker daemon accessible
# - Image exists or can be pulled
# - Port bindings available
# - Volume paths exist
```

### Kubernetes Target Validation

```yaml
# Validate Kubernetes configuration
targets:
  pods:
    web:
      namespace: production
      selector: app=web

# Validation checks:
# - Cluster accessible
# - Namespace exists
# - Pods match selector
# - RBAC permissions
```

## Task Validation

### Task Structure

```yaml
# Validate task definition
tasks:
  valid-task:
    description: "Valid task"
    command: echo "test"
    target: hosts.production
    timeout: 30000

# Validation checks:
# - Command or script defined
# - Target exists if specified
# - Timeout is valid number
# - Parameters have valid types
```

### Step Dependencies

```yaml
tasks:
  with-deps:
    steps:
      - name: step1
        command: echo "1"
        id: first
      
      - name: step2
        command: echo "2"
        dependsOn: [first]  # Validates dependency exists
```

### Parameter Validation

```yaml
tasks:
  parameterized:
    params:
      - name: count
        type: number
        required: true
        min: 1
        max: 100
      
      - name: environment
        type: enum
        values: [dev, staging, prod]
        required: true

# Validation enforces:
# - Required parameters provided
# - Type constraints met
# - Value ranges respected
```

## Profile Validation

### Inheritance Chain

```yaml
profiles:
  base:
    vars:
      region: us-east-1
  
  staging:
    extends: base  # Validates base exists
    vars:
      environment: staging
  
  production:
    extends: staging  # Validates chain
    vars:
      environment: production
```

### Profile Merging

```bash
# Test profile merging
xec config show --profile production

# Validate merged configuration
xec config validate --profile production
```

## Custom Validation

### Validation Scripts

```yaml
tasks:
  validate-custom:
    script: |
      // Custom validation logic
      const errors = [];
      
      // Check custom requirements
      if (!vars.apiKey || vars.apiKey.length < 32) {
        errors.push('API key must be at least 32 characters');
      }
      
      if (vars.replicas < 2 && profile === 'production') {
        errors.push('Production must have at least 2 replicas');
      }
      
      if (errors.length > 0) {
        throw new Error(errors.join('\n'));
      }
```

### Pre-execution Validation

```yaml
tasks:
  deploy:
    hooks:
      before:
        - task: validate-environment
        - task: validate-permissions
        - task: validate-resources
    command: deploy-application
```

### Validation Rules

```yaml
# Define validation rules
vars:
  validation:
    rules:
      - field: database.host
        required: true
        pattern: "^[a-z0-9.-]+$"
      
      - field: database.port
        type: number
        min: 1024
        max: 65535
      
      - field: apiKey
        required: true
        minLength: 32
        maxLength: 64
```

## Environment Validation

### Environment Checks

```yaml
tasks:
  validate-environment:
    script: |
      // Check environment
      const checks = {
        'Node.js': () => process.version,
        'Docker': () => $`docker --version`,
        'kubectl': () => $`kubectl version --client`,
        'SSH': () => $`ssh -V`
      };
      
      for (const [name, check] of Object.entries(checks)) {
        try {
          const version = await check();
          console.log(`✓ ${name}: ${version}`);
        } catch {
          console.error(`✗ ${name}: Not found`);
        }
      }
```

### Resource Validation

```yaml
tasks:
  validate-resources:
    script: |
      // Check resources
      const required = {
        diskSpace: 10 * 1024 * 1024 * 1024,  // 10GB
        memory: 4 * 1024 * 1024 * 1024,       // 4GB
        cpus: 2
      };
      
      const available = await getSystemResources();
      
      for (const [resource, required] of Object.entries(required)) {
        if (available[resource] < required) {
          throw new Error(`Insufficient ${resource}`);
        }
      }
```

## Continuous Validation

### Pre-commit Hooks

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Validate configuration before commit
xec config validate || {
  echo "Configuration validation failed"
  exit 1
}
```

### CI/CD Integration

```yaml
# .github/workflows/validate.yml
name: Validate Configuration
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install Xec
        run: npm install -g @xec/cli
      - name: Validate configuration
        run: xec config validate --strict
```

### Automated Testing

```yaml
tasks:
  test-configuration:
    steps:
      - name: Schema validation
        command: xec config validate
      
      - name: Target connectivity
        command: xec test --all-targets
      
      - name: Task dry-run
        command: xec run deploy --dry-run
      
      - name: Security scan
        command: xec security scan
```

## Validation Reports

### Generate Reports

```bash
# Generate validation report
xec config validate --report validation-report.json

# Generate HTML report
xec config validate --report validation-report.html
```

### Report Format

```json
{
  "timestamp": "2024-01-15T10:00:00Z",
  "version": "1.0",
  "status": "passed",
  "checks": {
    "schema": { "status": "passed" },
    "variables": { "status": "passed" },
    "targets": { 
      "status": "warning",
      "warnings": ["hosts.backup: Connection timeout"]
    },
    "tasks": { "status": "passed" }
  }
}
```

## Best Practices

### 1. Validate Early and Often

```bash
# Add to development workflow
alias xec-save='xec config validate && git add .xec/'
```

### 2. Use Strict Mode

```bash
# Fail on warnings in production
xec config validate --strict --profile production
```

### 3. Automate Validation

```yaml
# Add validation task
tasks:
  ci:
    steps:
      - command: xec config validate --strict
      - command: xec test --all-targets
      - command: xec run test-suite
```

### 4. Document Validation Rules

```yaml
# Document requirements
vars:
  _validation:
    description: |
      Required environment variables:
      - API_KEY: API authentication key
      - DB_PASSWORD: Database password
      
      Required commands:
      - docker: Container management
      - kubectl: Kubernetes management
```

### 5. Progressive Validation

```yaml
# Start lenient, increase strictness
profiles:
  development:
    validation:
      strict: false
      warnOnly: true
  
  production:
    validation:
      strict: true
      failOnWarning: true
```

## Troubleshooting

### Validation Failures

```bash
# Debug validation issues
xec config validate --debug

# Show configuration after resolution
xec config show --resolved

# Test specific component
xec config validate --tasks --verbose
```

### Common Solutions

| Error | Solution |
|-------|----------|
| Schema version mismatch | Update `version` field to "1.0" |
| Undefined variable | Add variable definition or use default |
| Target not found | Check target name and definition |
| Invalid YAML | Validate YAML syntax with linter |
| Circular dependency | Break circular reference chain |
| Type mismatch | Ensure correct type in definition |

## Next Steps

- [Troubleshooting](./troubleshooting.md) - Fixing common issues
- [Best Practices](./best-practices.md) - Configuration patterns

## See Also

- [Configuration Overview](../overview.md) - Configuration basics
- [Best Practices](./best-practices.md) - Configuration patterns
- [CLI Reference](../../commands/built-in/config.md) - Config commands