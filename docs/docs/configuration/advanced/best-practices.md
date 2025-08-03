---
title: Configuration Best Practices
description: Best practices and patterns for Xec configuration
---

# Configuration Best Practices

This guide presents best practices, patterns, and recommendations for creating maintainable, secure, and efficient Xec configurations.

## Configuration Organization

### File Structure

Organize your configuration files logically:

```
.xec/
├── config.yaml           # Main configuration
├── profiles/            # Environment profiles
│   ├── dev.yaml
│   ├── staging.yaml
│   └── production.yaml
├── tasks/              # Reusable task definitions
│   ├── deploy.yaml
│   ├── backup.yaml
│   └── monitoring.yaml
├── targets/            # Target configurations
│   ├── aws.yaml
│   └── on-premise.yaml
└── scripts/            # Custom scripts
    ├── health-check.js
    └── data-migration.js
```

### Modular Configuration

Break large configurations into modules:

```yaml
# .xec/config.yaml
version: "1.0"
name: myapp

# Import modular configurations
$import:
  - tasks/*.yaml
  - profiles/*.yaml
  - targets/*.yaml

# Keep main config focused
vars:
  appName: myapp
  version: "2.0.0"
```

### Separation of Concerns

```yaml
# Separate by functionality
tasks:
  $import:
    - tasks/deployment.yaml    # Deployment tasks
    - tasks/maintenance.yaml   # Maintenance tasks
    - tasks/monitoring.yaml    # Monitoring tasks
```

## Naming Conventions

### Consistent Naming

```yaml
# Good - consistent naming pattern
tasks:
  deploy-web:
  deploy-api:
  deploy-worker:
  
  backup-database:
  backup-files:
  backup-configs:

# Bad - inconsistent naming
tasks:
  deployWeb:
  api_deploy:
  worker-dpl:
```

### Descriptive Names

```yaml
# Good - self-documenting
targets:
  hosts:
    production-web-server:
    staging-database-primary:
    development-cache:

# Bad - cryptic names
targets:
  hosts:
    pws1:
    sdb-p:
    d-cache:
```

### Hierarchical Naming

```yaml
tasks:
  # Group related tasks with prefixes
  db:backup:
  db:restore:
  db:migrate:
  
  app:deploy:
  app:rollback:
  app:health-check:
```

## Variable Management

### Variable Hierarchy

```yaml
# 1. Global defaults
vars:
  timeout: 30000
  retries: 3

# 2. Environment-specific
profiles:
  production:
    vars:
      timeout: 60000  # Override for production
      
# 3. Task-specific
tasks:
  long-running:
    vars:
      timeout: 3600000  # Task-specific override
```

### Variable Documentation

```yaml
vars:
  # API Configuration
  # ==================
  
  # Base URL for API endpoints (must include protocol)
  apiUrl: https://api.example.com
  
  # API version to use (format: vX)
  apiVersion: v2
  
  # Maximum retry attempts for failed API calls
  apiMaxRetries: 3
  
  # Timeout for API calls in milliseconds
  apiTimeout: 10000
```

### Default Values

```yaml
vars:
  # Always provide defaults
  port: ${env.PORT:-8080}
  environment: ${env.NODE_ENV:-development}
  logLevel: ${env.LOG_LEVEL:-info}
  
  # Computed defaults
  workers: ${env.WORKERS:-${runtime.cpus}}
```

## Security Best Practices

### Secret Management

```yaml
# Good - use secret management
vars:
  apiKey: ${secrets.api_key}
  dbPassword: ${secrets.database_password}
  sshKey: ${secrets.deploy_key}

# Bad - hardcoded secrets
vars:
  apiKey: "sk-1234567890abcdef"  # NEVER DO THIS
  dbPassword: "password123"       # SECURITY RISK
```

### Secure Defaults

```yaml
targets:
  defaults:
    ssh:
      strictHostKeyChecking: yes
      passwordAuthentication: no
      pubkeyAuthentication: yes
    
    docker:
      privileged: false
      readonlyRootfs: true
      noNewPrivileges: true
```

### Principle of Least Privilege

```yaml
targets:
  hosts:
    web-server:
      username: deploy  # Not root
      sudo:
        enabled: false  # Only if needed
    
  containers:
    app:
      user: nobody    # Non-root user
      capDrop: [ALL]  # Drop all capabilities
```

### Audit Trail

```yaml
tasks:
  sensitive-operation:
    hooks:
      before:
        - command: echo "$(date) - ${env.USER} executing sensitive operation" >> audit.log
      after:
        - command: echo "$(date) - Operation completed with exit code $?" >> audit.log
    command: sensitive-command
```

## Error Handling

### Graceful Failures

```yaml
tasks:
  resilient-deploy:
    steps:
      - name: Health check
        command: check-health
        onFailure:
          retry: 3
          delay: 10s
      
      - name: Deploy
        command: deploy-app
        onFailure:
          task: rollback
      
      - name: Cleanup
        command: cleanup-temp
        onFailure: continue  # Non-critical
        alwaysRun: true
```

### Validation Steps

```yaml
tasks:
  safe-deploy:
    steps:
      - name: Validate configuration
        command: validate-config
        onFailure: abort
      
      - name: Check prerequisites
        command: check-deps
        onFailure: abort
      
      - name: Deploy
        command: deploy
```

### Error Recovery

```yaml
tasks:
  with-recovery:
    steps:
      - name: Create backup
        command: create-backup
        register: backup_path
      
      - name: Risky operation
        command: modify-data
        onFailure:
          command: restore-backup ${backup_path}
```

## Performance Optimization

### Connection Pooling

```yaml
targets:
  hosts:
    api-server:
      connectionPool:
        min: 2
        max: 10
        idleTimeout: 300000
      keepAlive: true
      keepAliveInterval: 30000
```

### Parallel Execution

```yaml
tasks:
  parallel-deploy:
    parallel: true
    maxConcurrent: 5
    failFast: false  # Continue even if one fails
    targets:
      - hosts.web-1
      - hosts.web-2
      - hosts.web-3
```

### Resource Limits

```yaml
targets:
  containers:
    worker:
      memory: 512m
      cpus: "0.5"
      pidsLimit: 100
```

### Caching

```yaml
tasks:
  expensive-operation:
    cache:
      key: "result-${params.date}"
      ttl: 3600
      storage: redis
    command: generate-report
```

## Environment Management

### Environment Isolation

```yaml
profiles:
  development:
    vars:
      database: dev_db
      apiUrl: http://localhost:3000
    targets:
      containers:
        db:
          image: postgres:15
          ports: ["5432:5432"]
  
  production:
    vars:
      database: prod_db
      apiUrl: https://api.example.com
    targets:
      hosts:
        db:
          host: db.example.com
```

### Environment Validation

```yaml
tasks:
  validate-environment:
    script: |
      const required = {
        development: ['DEBUG', 'LOCAL_DB'],
        production: ['API_KEY', 'DB_PASSWORD']
      };
      
      const profile = xec.profile;
      const missing = required[profile].filter(
        key => !process.env[key]
      );
      
      if (missing.length > 0) {
        throw new Error(`Missing: ${missing.join(', ')}`);
      }
```

## Documentation

### Task Documentation

```yaml
tasks:
  complex-migration:
    description: |
      Database Migration Task
      =======================
      
      Performs a complete database migration with validation.
      
      Prerequisites:
      - Database backup completed
      - All services stopped
      - Migration scripts reviewed
      
      Duration: ~15 minutes
      Risk Level: HIGH
      
      Recovery: Run 'rollback-migration' task if failed
    steps:
      # Implementation...
```

### Inline Comments

```yaml
targets:
  hosts:
    legacy-server:
      host: old.example.com
      # DEPRECATED: Will be removed in v3.0
      # Migration deadline: 2024-12-31
      # Contact: ops-team@example.com
```

### README Integration

```yaml
# .xec/README.md
tasks:
  help:
    script: |
      const readme = await fs.readFile('.xec/README.md');
      console.log(readme);
```

## Testing Configuration

### Configuration Validation

```bash
# Validate before deployment
xec config validate
xec config validate --profile production
```

### Dry Run Testing

```yaml
tasks:
  test-deploy:
    description: Test deployment without making changes
    steps:
      - command: deploy --dry-run
      - command: validate-deployment --dry-run
```

### Smoke Tests

```yaml
tasks:
  smoke-test:
    steps:
      - command: curl -f http://localhost/health
      - command: check-database-connection
      - command: verify-critical-services
```

## Version Control

### Configuration as Code

```bash
# Version control your configuration
git add .xec/
git commit -m "feat: Add production deployment configuration"
git tag -a v1.0.0 -m "Initial configuration release"
```

### Change Management

```yaml
# Track configuration changes
vars:
  configVersion: "2.1.0"
  lastModified: "2024-01-15"
  approvedBy: "platform-team"
```

### Migration Path

```yaml
# Support multiple versions
tasks:
  migrate-config:
    script: |
      const version = vars.configVersion;
      if (version < "2.0.0") {
        await xec.run('migrate-v1-to-v2');
      }
      if (version < "3.0.0") {
        await xec.run('migrate-v2-to-v3');
      }
```

## Common Patterns

### Blue-Green Deployment

```yaml
vars:
  activeColor: blue
  inactiveColor: green

tasks:
  blue-green-deploy:
    steps:
      - name: Deploy to inactive
        command: deploy --target ${inactiveColor}
      
      - name: Test inactive
        command: test --target ${inactiveColor}
      
      - name: Switch traffic
        command: switch-traffic --to ${inactiveColor}
      
      - name: Update active color
        script: |
          vars.activeColor = vars.inactiveColor;
          vars.inactiveColor = vars.activeColor;
```

### Canary Deployment

```yaml
tasks:
  canary-deploy:
    params:
      - name: percentage
        type: number
        min: 1
        max: 100
    steps:
      - command: deploy --canary
      - command: route-traffic --percentage ${params.percentage}
      - command: monitor --duration 5m
      - command: |
          if [ $? -eq 0 ]; then
            route-traffic --percentage 100
          else
            rollback
          fi
```

### Circuit Breaker

```yaml
tasks:
  with-circuit-breaker:
    vars:
      maxFailures: 3
      resetTimeout: 60000
    script: |
      const failures = cache.get('failures') || 0;
      
      if (failures >= vars.maxFailures) {
        const lastFailure = cache.get('lastFailure');
        if (Date.now() - lastFailure < vars.resetTimeout) {
          throw new Error('Circuit breaker open');
        }
        cache.set('failures', 0);
      }
      
      try {
        await execute();
        cache.set('failures', 0);
      } catch (error) {
        cache.set('failures', failures + 1);
        cache.set('lastFailure', Date.now());
        throw error;
      }
```

## Anti-Patterns to Avoid

### 1. Configuration Sprawl

```yaml
# Bad - everything in one file
# 1000+ line config.yaml

# Good - modular configuration
# Split into logical modules
```

### 2. Magic Values

```yaml
# Bad - unexplained values
timeout: 47382

# Good - documented and clear
timeout: 45000  # 45 seconds (API gateway timeout - 5s)
```

### 3. Tight Coupling

```yaml
# Bad - hardcoded dependencies
tasks:
  deploy:
    command: ssh user@192.168.1.100 deploy

# Good - use targets
tasks:
  deploy:
    command: deploy
    target: hosts.production
```

### 4. Overengineering

```yaml
# Bad - unnecessary complexity
vars:
  value: ${fn.compute(fn.transform(fn.parse(env.VALUE)))}

# Good - simple and clear
vars:
  value: ${env.VALUE:-default}
```

## Monitoring and Observability

### Metrics Collection

```yaml
tasks:
  monitored:
    metrics:
      enabled: true
      collector: prometheus
      labels:
        service: api
        environment: ${profile}
```

### Logging

```yaml
commands:
  logs:
    tail: 100
    follow: true
    timestamps: true
    prefix: true
```

### Health Checks

```yaml
tasks:
  health-check:
    schedule: "*/5 * * * *"  # Every 5 minutes
    command: |
      curl -f http://localhost/health || alert
```

## Next Steps

- [Validation](./validation.md) - Configuration validation
- [Troubleshooting](./troubleshooting.md) - Common issues

## See Also

- [Configuration Overview](../overview.md) - Configuration basics
- [CLI Reference](../../commands/overview.md) - Command documentation