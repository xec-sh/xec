---
title: Multi-Step Tasks
description: Creating complex workflows with multi-step tasks
---

# Multi-Step Tasks

Multi-step tasks enable you to create complex workflows by combining multiple commands, tasks, and scripts into a single, orchestrated operation. They provide advanced control flow, error handling, and parallel execution capabilities.

## Basic Multi-Step Structure

```yaml
tasks:
  deploy:
    description: Deploy application
    steps:
      - command: git pull origin main
      - command: npm install
      - command: npm run build
      - command: pm2 restart app
```

## Step Types

### Command Steps

Execute shell commands:

```yaml
tasks:
  setup:
    steps:
      - command: apt-get update
      - command: apt-get install -y nginx
      - command: systemctl start nginx
```

### Task Steps

Call other tasks:

```yaml
tasks:
  backup-db:
    command: pg_dump production > backup.sql
  
  backup-files:
    command: tar -czf files.tar.gz /var/www
  
  full-backup:
    steps:
      - task: backup-db
      - task: backup-files
      - command: rsync -av /backup/ remote:/backup/
```

### Script Steps

Execute JavaScript code:

```yaml
tasks:
  process:
    steps:
      - script: |
          const data = await fetchData();
          console.log(`Processing ${data.length} items`);
          return data;
        register: fetched_data
      
      - script: |
          const processed = fetched_data.map(transform);
          await saveResults(processed);
```

## Step Properties

### Named Steps

Add names for clarity:

```yaml
tasks:
  deploy:
    steps:
      - name: Pull latest code
        command: git pull origin main
      
      - name: Install dependencies
        command: npm install
      
      - name: Run tests
        command: npm test
      
      - name: Build application
        command: npm run build
      
      - name: Deploy to production
        command: ./deploy.sh
```

### Step Targets

Override task target per step:

```yaml
tasks:
  multi-server:
    steps:
      - name: Update web server
        command: apt-get update
        target: hosts.web-server
      
      - name: Update database server
        command: apt-get update
        target: hosts.db-server
      
      - name: Update cache server
        command: apt-get update
        target: hosts.cache-server
```

### Step Environment

Set environment per step:

```yaml
tasks:
  build-multiple:
    steps:
      - name: Build for development
        command: npm run build
        env:
          NODE_ENV: development
      
      - name: Build for production
        command: npm run build
        env:
          NODE_ENV: production
          MINIFY: true
```

## Parallel Execution

### Parallel Steps

Execute steps concurrently:

```yaml
tasks:
  parallel-deploy:
    steps:
      - name: Deploy services
        parallel: true
        steps:
          - command: deploy-web.sh
            target: hosts.web
          - command: deploy-api.sh
            target: hosts.api
          - command: deploy-worker.sh
            target: hosts.worker
```

### Parallel with Groups

Group parallel operations:

```yaml
tasks:
  complex-parallel:
    steps:
      - name: Prepare all servers
        parallel: true
        steps:
          - command: prepare.sh
            targets: ["hosts.web-1", "hosts.web-2"]
      
      - name: Deploy application
        parallel: true
        steps:
          - command: deploy.sh
            targets: ["hosts.web-1", "hosts.web-2"]
      
      - name: Verify deployment
        command: health-check.sh
        targets: ["hosts.web-1", "hosts.web-2"]
```

## Conditional Execution

### When Conditions

Execute steps conditionally:

```yaml
tasks:
  smart-deploy:
    steps:
      - name: Check environment
        command: echo $ENVIRONMENT
        register: env_check
      
      - name: Deploy to staging
        command: deploy-staging.sh
        when: env_check.stdout == "staging"
      
      - name: Deploy to production
        command: deploy-production.sh
        when: env_check.stdout == "production"
      
      - name: Validate deployment
        command: validate.sh
        when: env_check.exitCode == 0
```

### Complex Conditions

```yaml
tasks:
  conditional:
    steps:
      - command: check-health
        register: health
      
      - command: restart-service
        when: health.exitCode != 0
      
      - command: scale-up
        when: |
          health.stdout.includes("high-load") &&
          params.autoScale == true
```

## Error Handling

### Step Failure Behavior

```yaml
tasks:
  resilient:
    steps:
      - name: Critical step
        command: important-operation
        onFailure: abort  # Stop task (default)
      
      - name: Optional step
        command: nice-to-have
        onFailure: continue  # Continue to next step
      
      - name: Ignorable step
        command: cleanup-maybe
        onFailure: ignore  # Don't count as failure
```

### Retry Logic

```yaml
tasks:
  with-retry:
    steps:
      - name: Connect to service
        command: test-connection
        onFailure:
          retry: 3
          delay: 5s
      
      - name: Complex retry
        command: unstable-operation
        onFailure:
          retry: 5
          delay: 10s
          backoff: exponential  # 10s, 20s, 40s...
```

### Error Recovery

```yaml
tasks:
  with-recovery:
    steps:
      - name: Main operation
        command: risky-operation
        onFailure:
          task: recovery-task
      
      - name: Alternative approach
        command: backup-operation
        onFailure:
          command: emergency-cleanup
```

## Data Flow

### Register Variables

Pass data between steps:

```yaml
tasks:
  data-pipeline:
    steps:
      - name: Get version
        command: cat version.txt
        register: version
      
      - name: Build with version
        command: docker build -t app:${version.stdout} .
      
      - name: Tag latest
        command: docker tag app:${version.stdout} app:latest
        when: version.stdout.includes("stable")
```

### Complex Data Flow

```yaml
tasks:
  process-data:
    steps:
      - name: Fetch data
        script: |
          const data = await api.getData();
          return { count: data.length, items: data };
        register: dataset
      
      - name: Process items
        script: |
          const processed = dataset.items.map(item => ({
            ...item,
            processed: true
          }));
          return processed;
        register: processed_data
      
      - name: Save results
        command: echo '${processed_data}' > results.json
```

## Step Dependencies

### Sequential Dependencies

```yaml
tasks:
  sequential:
    steps:
      - name: step1
        command: echo "First"
        id: first
      
      - name: step2
        command: echo "Second"
        dependsOn: [first]
      
      - name: step3
        command: echo "Third"
        dependsOn: [step2]
```

### Complex Dependencies

```yaml
tasks:
  complex-deps:
    steps:
      - name: prepare-db
        command: setup-database.sh
        id: db
      
      - name: prepare-cache
        command: setup-cache.sh
        id: cache
      
      - name: prepare-storage
        command: setup-storage.sh
        id: storage
      
      - name: deploy-app
        command: deploy.sh
        dependsOn: [db, cache, storage]
```

## Always Run Steps

Execute regardless of previous failures:

```yaml
tasks:
  with-cleanup:
    steps:
      - name: Main operation
        command: process-data
      
      - name: Risky operation
        command: dangerous-task
      
      - name: Cleanup
        command: cleanup-resources
        alwaysRun: true  # Runs even if previous steps failed
      
      - name: Send notification
        command: notify-complete
        alwaysRun: true
```

## Hooks

### Task-Level Hooks

```yaml
tasks:
  monitored:
    hooks:
      before:
        - command: echo "Task starting at $(date)"
        - command: check-prerequisites
      
      after:
        - command: echo "Task completed at $(date)"
        - command: cleanup-temp
      
      onError:
        - command: send-alert
        - command: rollback
    
    steps:
      - command: main-operation
      - command: verify-results
```

### Step-Level Hooks

```yaml
tasks:
  detailed-monitoring:
    steps:
      - name: Critical operation
        command: important-task
        hooks:
          before:
            - command: create-snapshot
          after:
            - command: verify-state
          onError:
            - command: restore-snapshot
```

## Real-World Examples

### CI/CD Pipeline

```yaml
tasks:
  ci-pipeline:
    description: Complete CI/CD pipeline
    steps:
      - name: Checkout code
        command: git checkout ${params.branch}
      
      - name: Install dependencies
        command: npm ci
        timeout: 300000
      
      - name: Run linting
        command: npm run lint
        onFailure: continue
      
      - name: Run tests
        command: npm test
        onFailure: abort
      
      - name: Build application
        command: npm run build
        env:
          NODE_ENV: production
      
      - name: Build Docker image
        command: |
          docker build -t app:${params.version} .
          docker tag app:${params.version} app:latest
      
      - name: Push to registry
        command: docker push app:${params.version}
        when: params.branch == "main"
      
      - name: Deploy to staging
        task: deploy-staging
        when: params.branch == "develop"
      
      - name: Deploy to production
        task: deploy-production
        when: params.branch == "main" && params.deploy == true
```

### Database Migration

```yaml
tasks:
  db-migration:
    description: Safe database migration with rollback
    steps:
      - name: Create backup
        command: pg_dump production > backup-$(date +%Y%m%d).sql
        target: hosts.db-primary
        register: backup_file
      
      - name: Verify backup
        command: test -s ${backup_file.stdout}
        onFailure: abort
      
      - name: Run migration
        command: psql production < migration.sql
        target: hosts.db-primary
        register: migration_result
        onFailure:
          command: psql production < ${backup_file.stdout}
      
      - name: Verify migration
        script: |
          const result = await db.query('SELECT version FROM schema_info');
          if (result.version !== expectedVersion) {
            throw new Error('Migration verification failed');
          }
        onFailure:
          command: psql production < ${backup_file.stdout}
      
      - name: Update replicas
        parallel: true
        steps:
          - command: pg_dump production | psql replica
            target: hosts.db-replica-1
          - command: pg_dump production | psql replica
            target: hosts.db-replica-2
      
      - name: Cleanup old backup
        command: find /backup -name "*.sql" -mtime +30 -delete
        alwaysRun: true
```

### Blue-Green Deployment

```yaml
tasks:
  blue-green-deploy:
    description: Zero-downtime blue-green deployment
    steps:
      - name: Identify current environment
        command: kubectl get service app -o jsonpath='{.spec.selector.version}'
        register: current_env
      
      - name: Set target environment
        script: |
          const target = current_env.stdout === 'blue' ? 'green' : 'blue';
          return { target };
        register: deploy_env
      
      - name: Deploy to inactive environment
        command: |
          kubectl set image deployment/app-${deploy_env.target} \
            app=myapp:${params.version}
      
      - name: Wait for rollout
        command: |
          kubectl rollout status deployment/app-${deploy_env.target} \
            --timeout=600s
        onFailure:
          retry: 3
          delay: 30s
      
      - name: Run smoke tests
        command: ./smoke-test.sh ${deploy_env.target}
        onFailure:
          command: kubectl rollout undo deployment/app-${deploy_env.target}
      
      - name: Switch traffic
        command: |
          kubectl patch service app \
            -p '{"spec":{"selector":{"version":"${deploy_env.target}"}}}'
      
      - name: Verify switch
        command: curl -f https://app.example.com/health
        onFailure:
          retry: 5
          delay: 10s
      
      - name: Scale down old environment
        command: kubectl scale deployment/app-${current_env.stdout} --replicas=0
        when: params.keepOld != true
```

## Best Practices

### 1. Use Named Steps

```yaml
# Good - clear step purposes
steps:
  - name: Install dependencies
    command: npm install
  - name: Run tests
    command: npm test

# Bad - unclear steps
steps:
  - command: npm install
  - command: npm test
```

### 2. Handle Errors Appropriately

```yaml
steps:
  - name: Critical operation
    command: important-task
    onFailure: abort
  
  - name: Optional enhancement
    command: nice-to-have
    onFailure: continue
```

### 3. Use Parallel Execution Wisely

```yaml
# Good - independent operations
steps:
  - name: Parallel independent tasks
    parallel: true
    steps:
      - command: backup-db
      - command: backup-files
      - command: backup-configs

# Bad - dependent operations
steps:
  - parallel: true
    steps:
      - command: stop-service
      - command: start-service  # Depends on stop!
```

### 4. Clean Up Resources

```yaml
steps:
  - name: Main operation
    command: create-resources
  
  - name: Cleanup
    command: delete-resources
    alwaysRun: true
```

### 5. Document Complex Logic

```yaml
tasks:
  complex-workflow:
    description: |
      This task performs a rolling update with health checks.
      It will automatically rollback on failure.
      Expected duration: 15-20 minutes
    steps:
      # Step descriptions...
```

## Next Steps

- [Simple Tasks](./simple-tasks.md) - Basic task concepts
- [Task Overview](./overview.md) - Task management concepts

## See Also

- [Task Command](../../commands/built-in/run.md) - Running tasks
- [Best Practices](../advanced/best-practices.md) - Task design guidelines