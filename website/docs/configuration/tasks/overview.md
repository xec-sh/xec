---
title: Tasks Overview
description: Understanding automation tasks in Xec
---

# Tasks Overview

Tasks are reusable automation workflows that encapsulate complex operations into simple, parameterized commands. They form the backbone of Xec's automation capabilities, enabling you to define once and execute anywhere.

## What Are Tasks?

Tasks are named sequences of commands that can:
- Execute across multiple targets
- Accept parameters
- Handle errors gracefully
- Run steps conditionally
- Execute in parallel
- Emit and respond to events
- Be composed into larger workflows

## Basic Task Structure

```yaml
tasks:
  # Simple command task
  hello:
    command: echo "Hello, World!"
  
  # Multi-step task
  deploy:
    description: Deploy application
    steps:
      - command: git pull
      - command: npm install
      - command: npm run build
      - command: pm2 restart app
```

## Task Types

### 1. Command Tasks

Single command execution:

```yaml
tasks:
  backup:
    command: tar -czf backup.tar.gz /data
    target: backup-server
```

### 2. Script Tasks

Execute scripts:

```yaml
tasks:
  process:
    script: |
      const data = await fetchData();
      const processed = transform(data);
      await save(processed);
    description: Process data pipeline
```

### 3. Multi-Step Tasks

Complex workflows:

```yaml
tasks:
  release:
    steps:
      - name: Run tests
        command: npm test
      - name: Build application
        command: npm run build
      - name: Deploy to production
        task: deploy-prod
```

### 4. Parallel Tasks

Concurrent execution:

```yaml
tasks:
  health-check:
    parallel: true
    targets:
      - hosts.web-1
      - hosts.web-2
      - hosts.web-3
    command: curl http://localhost/health
```

## Task Parameters

Accept input parameters:

```yaml
tasks:
  scale:
    description: Scale deployment
    params:
      - name: replicas
        type: number
        required: true
        min: 1
        max: 10
        description: Number of replicas
    command: |
      kubectl scale deployment/app \
        --replicas=${params.replicas}
```

## Task Composition

Build complex tasks from simpler ones:

```yaml
tasks:
  setup:
    steps:
      - command: apt-get update
      - command: apt-get install -y nginx
  
  deploy:
    steps:
      - task: setup
      - command: cp app.conf /etc/nginx/
      - command: systemctl restart nginx
```

## Error Handling

Control error behavior:

```yaml
tasks:
  resilient:
    steps:
      - command: test-connection
        onFailure:
          retry: 3
          delay: 5s
      
      - command: critical-operation
        onFailure: abort
      
      - command: optional-cleanup
        onFailure: continue
```

## Conditional Execution

Execute steps conditionally:

```yaml
tasks:
  smart-deploy:
    steps:
      - command: check-health
        register: health_status
      
      - command: deploy-blue
        when: health_status.exitCode != 0
      
      - command: deploy-green
        when: health_status.exitCode == 0
```

## Task Hooks

Execute code at specific points:

```yaml
tasks:
  monitored:
    hooks:
      before:
        - command: echo "Starting task..."
      after:
        - command: echo "Task completed"
      onError:
        - command: send-alert
    
    command: critical-operation
```

## Event System

Emit and respond to events:

```yaml
tasks:
  producer:
    command: process-data
    emits:
      - name: data-processed
        data: { status: "complete" }
  
  consumer:
    on:
      data-processed: |
        echo "Data processing complete"
```

## Task Scheduling

Schedule recurring tasks:

```yaml
tasks:
  backup:
    schedule: "0 2 * * *"  # 2 AM daily
    command: backup.sh
    
  cleanup:
    schedule: "@hourly"
    command: clean-temp-files.sh
```

## Task Templates

Create reusable patterns:

```yaml
tasks:
  $template-deploy:
    params:
      - name: service
        required: true
    steps:
      - command: docker pull ${params.service}:latest
      - command: docker stop ${params.service}
      - command: docker run -d ${params.service}:latest
  
  deploy-web:
    template: $template-deploy
    params:
      service: web-app
  
  deploy-api:
    template: $template-deploy
    params:
      service: api-server
```

## Task Dependencies

Define execution order:

```yaml
tasks:
  prepare:
    command: setup-environment
  
  build:
    dependsOn: [prepare]
    command: compile-code
  
  test:
    dependsOn: [build]
    command: run-tests
  
  deploy:
    dependsOn: [test]
    command: deploy-application
```

## Task Caching

Cache task results:

```yaml
tasks:
  expensive-operation:
    command: generate-report
    cache:
      key: "report-${params.date}"
      ttl: 3600  # 1 hour
      storage: redis
```

## Private Tasks

Hide internal tasks:

```yaml
tasks:
  _internal-setup:  # Prefix with underscore
    private: true
    command: internal-configuration
  
  public-task:
    steps:
      - task: _internal-setup
      - command: public-operation
```

## Task Execution

### Direct Execution

```bash
# Execute task
xec run deploy

# With parameters
xec run scale --replicas 5

# On specific target
xec run backup --target hosts.backup-server
```

### From Configuration

```yaml
# Reference in other tasks
tasks:
  full-deploy:
    steps:
      - task: test
      - task: build
      - task: deploy
```

### From Scripts

```javascript
// In xec scripts
await xec.run('deploy', {
  params: { version: '1.2.3' }
});
```

## Task Variables

Access task context:

```yaml
tasks:
  context-aware:
    command: |
      echo "Task: ${task.name}"
      echo "Target: ${target.name}"
      echo "Profile: ${profile}"
      echo "Param: ${params.value}"
```

## Best Practices

### 1. Single Responsibility

```yaml
# Good - focused tasks
tasks:
  test:
    command: npm test
  build:
    command: npm run build

# Bad - doing too much
tasks:
  do-everything:
    command: npm test && npm build && deploy
```

### 2. Descriptive Names

```yaml
# Good
tasks:
  deploy-production-api:
    description: Deploy API to production cluster

# Bad
tasks:
  d-p-a:  # Unclear
```

### 3. Parameter Validation

```yaml
tasks:
  validated:
    params:
      - name: environment
        type: enum
        values: [dev, staging, prod]
        required: true
```

### 4. Error Recovery

```yaml
tasks:
  resilient:
    steps:
      - command: risky-operation
        onFailure:
          retry: 3
          task: recovery-task
```

### 5. Documentation

```yaml
tasks:
  complex-migration:
    description: |
      Performs database migration with backup.
      WARNING: This task modifies production data.
      Duration: ~15 minutes
      Required permissions: DBA role
```

## Common Patterns

### Deployment Pipeline

```yaml
tasks:
  ci-pipeline:
    steps:
      - name: Checkout code
        command: git pull origin main
      
      - name: Install dependencies
        command: npm ci
      
      - name: Run tests
        command: npm test
        onFailure: abort
      
      - name: Build application
        command: npm run build
      
      - name: Deploy
        task: deploy-${params.environment}
```

### Health Monitoring

```yaml
tasks:
  monitor-services:
    parallel: true
    targets:
      - hosts.web-server
      - hosts.api-server
      - hosts.db-server
    steps:
      - command: check-service-health
      - command: check-disk-space
      - command: check-memory-usage
```

### Backup Strategy

```yaml
tasks:
  backup-all:
    steps:
      - name: Backup database
        task: backup-db
        target: hosts.db-server
      
      - name: Backup files
        task: backup-files
        target: hosts.file-server
      
      - name: Verify backups
        task: verify-backups
        target: hosts.backup-server
```

## Advanced Features

### Dynamic Task Generation

```yaml
tasks:
  deploy-all:
    script: |
      const services = await getServices();
      for (const service of services) {
        await xec.run('deploy', {
          params: { service: service.name }
        });
      }
```

### Task Middleware

```yaml
tasks:
  authenticated:
    middleware:
      - auth-check
      - rate-limit
    command: sensitive-operation
```

### Task Metrics

```yaml
tasks:
  monitored:
    metrics:
      enabled: true
      collector: prometheus
    command: important-operation
```

## Troubleshooting

### Task Not Found

```bash
# List available tasks
xec task list

# Check task definition
xec config show --tasks
```

### Parameter Issues

```bash
# Show task parameters
xec task info deploy

# Validate parameters
xec run deploy --dry-run --replicas 5
```

### Execution Failures

```bash
# Debug mode
xec run deploy --debug

# Verbose output
xec run deploy --verbose
```

## Next Steps

- [Simple Tasks](./simple-tasks.md) - Basic task creation
- [Multi-Step Tasks](./multi-step-tasks.md) - Complex workflows

## See Also

- [Task Command](../../commands/built-in/run.md) - Running tasks
- [Best Practices](../advanced/best-practices.md) - Task design patterns