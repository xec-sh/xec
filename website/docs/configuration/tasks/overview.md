---
title: Tasks Overview
description: Understanding automation tasks in Xec
---

# Tasks Overview {#tasks-overview}

Tasks are reusable automation workflows that encapsulate complex operations into simple, parameterized commands. They form the backbone of Xec's automation capabilities, enabling you to define once and execute anywhere.

## What Are Tasks? {#what-are-tasks}

Tasks are named sequences of commands that can:
- Execute across multiple targets
- Accept parameters
- Handle errors gracefully
- Run steps conditionally
- Execute in parallel
- Emit and respond to events
- Be composed into larger workflows

## Basic Task Structure {#basic-task-structure}

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

## Task Types {#task-types}

### 1. Command Tasks {#1-command-tasks}

Single command execution:

```yaml
tasks:
  backup:
    command: tar -czf backup.tar.gz /data
    target: backup-server
```

### 2. Script Tasks {#2-script-tasks}

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

### 3. Multi-Step Tasks {#3-multi-step-tasks}

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

### 4. Parallel Tasks {#4-parallel-tasks}

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

## Task Parameters {#task-parameters}

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

## Task Composition {#task-composition}

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

## Error Handling {#error-handling}

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

## Conditional Execution {#conditional-execution}

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

## Task Hooks {#task-hooks}

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

## Event System {#event-system}

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

## Task Scheduling {#task-scheduling}

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

## Task Templates {#task-templates}

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

## Task Dependencies {#task-dependencies}

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

## Task Caching {#task-caching}

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

## Private Tasks {#private-tasks}

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

## Task Execution {#task-execution}

### Direct Execution {#direct-execution}

```bash
# Execute task
xec run deploy

# With parameters
xec run scale -p replicas=5
# or, invoking the task directly without `run`:
xec scale --replicas 5

# On specific target
xec on hosts.backup-server --task backup
```

### From Configuration {#from-configuration}

```yaml
# Reference in other tasks
tasks:
  full-deploy:
    steps:
      - task: test
      - task: build
      - task: deploy
```

### From Scripts {#from-scripts}

```javascript
import { tasks } from '@xec-sh/ops';

await tasks.run('deploy', { version: '1.2.3' });
```

## Task Variables {#task-variables}

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

## Best Practices {#best-practices}

### 1. Single Responsibility {#1-single-responsibility}

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

### 2. Descriptive Names {#2-descriptive-names}

```yaml
# Good
tasks:
  deploy-production-api:
    description: Deploy API to production cluster

# Bad
tasks:
  d-p-a:  # Unclear
```

### 3. Parameter Validation {#3-parameter-validation}

```yaml
tasks:
  validated:
    params:
      - name: environment
        type: enum
        values: [dev, staging, prod]
        required: true
```

### 4. Error Recovery {#4-error-recovery}

```yaml
tasks:
  resilient:
    steps:
      - command: risky-operation
        onFailure:
          retry: 3
          task: recovery-task
```

### 5. Documentation {#5-documentation}

```yaml
tasks:
  complex-migration:
    description: |
      Performs database migration with backup.
      WARNING: This task modifies production data.
      Duration: ~15 minutes
      Required permissions: DBA role
```

## Common Patterns {#common-patterns}

### Deployment Pipeline {#deployment-pipeline}

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

### Health Monitoring {#health-monitoring}

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

### Backup Strategy {#backup-strategy}

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

## Advanced Features {#advanced-features}

### Dynamic Task Generation {#dynamic-task-generation}

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

### Task Middleware {#task-middleware}

```yaml
tasks:
  authenticated:
    middleware:
      - auth-check
      - rate-limit
    command: sensitive-operation
```

### Task Metrics {#task-metrics}

```yaml
tasks:
  monitored:
    metrics:
      enabled: true
      collector: prometheus
    command: important-operation
```

## Troubleshooting {#troubleshooting}

### Task Not Found {#task-not-found}

```bash
# List available tasks
xec task list

# Check task definition
xec config show --tasks
```

### Parameter Issues {#parameter-issues}

```bash
# Show task parameters
xec task info deploy

# Validate parameters
xec run deploy --dry-run --replicas 5
```

### Execution Failures {#execution-failures}

```bash
# Debug mode
xec run deploy --debug

# Verbose output
xec run deploy --verbose
```

## Next Steps {#next-steps}

- [Simple Tasks](./simple-tasks.md) - Basic task creation
- [Multi-Step Tasks](./multi-step-tasks.md) - Complex workflows

## See Also {#see-also}

- [Task Command](../../commands/built-in/run.md) - Running tasks
- [Best Practices](../advanced/best-practices.md) - Task design patterns