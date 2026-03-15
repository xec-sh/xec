---
title: Simple Tasks
description: Creating basic automation tasks in Xec
---

# Simple Tasks

Simple tasks are the foundation of Xec automation. They encapsulate single commands or basic operations that can be executed repeatedly across different environments.

## Command Tasks

The simplest form of task is a single command:

```yaml
tasks:
  # Inline command
  hello: echo "Hello, World!"
  
  # Command with description
  backup:
    command: tar -czf backup.tar.gz /data
    description: Create backup archive
```

## Task Properties

### Basic Properties

```yaml
tasks:
  example:
    # Required (one of these)
    command: echo "Command to execute"
    # OR
    script: |
      console.log("JavaScript code");
    
    # Optional metadata
    description: Task description
    target: hosts.production
    workdir: /app
    timeout: 30000
```

### Complete Example

```yaml
tasks:
  deploy-static:
    command: rsync -av ./dist/ /var/www/html/
    description: Deploy static files to web server
    target: hosts.web-server
    workdir: /home/deploy/project
    timeout: 60000
```

## Target Specification

### Single Target

```yaml
tasks:
  check-disk:
    command: df -h
    target: hosts.backup-server
```

### Multiple Targets

```yaml
tasks:
  check-all:
    command: uptime
    targets:
      - hosts.web-1
      - hosts.web-2
      - hosts.db-server
```

### Dynamic Targets

```yaml
tasks:
  update-all:
    command: apt-get update
    targets: "hosts.*"  # All hosts
```

## Environment Variables

Set environment for task execution:

```yaml
tasks:
  build:
    command: npm run build
    env:
      NODE_ENV: production
      API_URL: https://api.example.com
      BUILD_NUMBER: ${env.CI_BUILD_NUMBER}
```

## Working Directory

Control where commands execute:

```yaml
tasks:
  compile:
    command: make all
    workdir: /project/src
    
  # Relative to target's workdir
  relative:
    command: ./scripts/deploy.sh
    target: hosts.build-server
```

## Timeout Configuration

Prevent hanging tasks:

```yaml
tasks:
  quick:
    command: ping -c 1 google.com
    timeout: 5000  # 5 seconds
  
  long-running:
    command: ./backup-database.sh
    timeout: 3600000  # 1 hour
  
  no-timeout:
    command: tail -f /var/log/app.log
    timeout: 0  # No timeout
```

## Shell Configuration

Control shell behavior:

```yaml
tasks:
  # Default (use shell)
  with-shell:
    command: echo $HOME && ls -la
  
  # No shell (direct execution)
  no-shell:
    command: ["/usr/bin/python3", "script.py"]
    shell: false
  
  # Custom shell
  custom-shell:
    command: echo $0
    shell: /bin/zsh
```

## Output Handling

### Capture Output

```yaml
tasks:
  get-version:
    command: cat /etc/version
    register: version_info
    
  use-output:
    command: echo "Version is ${version_info.stdout}"
```

### Silent Execution

```yaml
tasks:
  quiet:
    command: ./noisy-script.sh
    silent: true  # Suppress output
```

## Error Handling

### Basic Error Control

```yaml
tasks:
  # Fail on error (default)
  strict:
    command: test -f /important/file
    throwOnNonZeroExit: true
  
  # Continue on error
  lenient:
    command: rm -f /tmp/maybe-exists
    throwOnNonZeroExit: false
```

### Exit Code Handling

```yaml
tasks:
  check-service:
    command: systemctl is-active nginx
    acceptExitCodes: [0, 3]  # 0=active, 3=inactive
```

## Common Patterns

### System Information

```yaml
tasks:
  system-info:
    command: |
      echo "=== System Information ==="
      uname -a
      echo "=== CPU Info ==="
      lscpu | head -10
      echo "=== Memory Info ==="
      free -h
      echo "=== Disk Usage ==="
      df -h
    description: Gather system information
```

### Service Management

```yaml
tasks:
  restart-nginx:
    command: systemctl restart nginx
    target: hosts.web-server
    description: Restart Nginx web server
  
  check-nginx:
    command: systemctl status nginx
    target: hosts.web-server
    description: Check Nginx status
```

### File Operations

```yaml
tasks:
  create-backup:
    command: |
      BACKUP_FILE="/backup/data-$(date +%Y%m%d).tar.gz"
      tar -czf "$BACKUP_FILE" /var/data/
      echo "Backup created: $BACKUP_FILE"
    target: hosts.backup-server
    
  cleanup-old:
    command: find /backup -name "*.tar.gz" -mtime +30 -delete
    description: Remove backups older than 30 days
```

### Git Operations

```yaml
tasks:
  git-pull:
    command: git pull origin main
    workdir: /var/www/app
    
  git-status:
    command: git status --short
    workdir: /var/www/app
    
  git-reset:
    command: git reset --hard origin/main
    workdir: /var/www/app
    description: Reset to remote main branch
```

### Docker Operations

```yaml
tasks:
  docker-cleanup:
    command: docker system prune -af
    description: Clean up unused Docker resources
    
  docker-logs:
    command: docker logs --tail 100 -f app-container
    target: containers.app
    
  docker-restart:
    command: docker restart app-container
    target: hosts.docker-host
```

### Database Operations

```yaml
tasks:
  db-backup:
    command: |
      mysqldump -u root -p${secrets.db_password} \
        production > /backup/db-$(date +%Y%m%d).sql
    target: hosts.db-server
    timeout: 600000
    
  db-optimize:
    command: mysqlcheck -o --all-databases
    target: hosts.db-server
    
  db-connections:
    command: |
      mysql -e "SHOW PROCESSLIST" | wc -l
    target: hosts.db-server
    description: Count active database connections
```

## Task Execution

### Command Line

```bash
# Run task
xec run hello

# Run on specific target
xec run backup --target hosts.backup-server

# Override timeout
xec run long-task --timeout 120000
```

### From Scripts

```javascript
// In xec scripts
await xec.run('deploy-static');

// With options
await xec.run('backup', {
  target: 'hosts.backup-server',
  timeout: 60000
});
```

### From Other Tasks

```yaml
tasks:
  prepare:
    command: echo "Preparing..."
  
  main:
    steps:
      - task: prepare
      - command: echo "Main task"
```

## Best Practices

### 1. Use Descriptive Names

```yaml
# Good
tasks:
  backup-database:
    command: pg_dump production > backup.sql
  
# Bad
tasks:
  bd:  # Unclear abbreviation
    command: pg_dump production > backup.sql
```

### 2. Add Descriptions

```yaml
tasks:
  migrate-data:
    command: ./migrate.sh
    description: |
      Migrate user data from v1 to v2 schema.
      WARNING: This modifies production data.
      Duration: ~10 minutes
```

### 3. Set Appropriate Timeouts

```yaml
tasks:
  health-check:
    command: curl http://localhost/health
    timeout: 5000  # Quick check
  
  data-processing:
    command: ./process-large-dataset.sh
    timeout: 3600000  # Long operation
```

### 4. Handle Errors Gracefully

```yaml
tasks:
  safe-cleanup:
    command: rm -f /tmp/tempfile
    throwOnNonZeroExit: false  # OK if file doesn't exist
```

### 5. Use Environment Variables

```yaml
tasks:
  flexible:
    command: deploy --env ${DEPLOY_ENV:-staging}
    env:
      DEPLOY_ENV: ${params.environment}
```

## Debugging Tasks

### Test Execution

```bash
# Dry run
xec run deploy --dry-run

# Verbose output
xec run deploy --verbose

# Debug mode
xec run deploy --debug
```

### Task Information

```bash
# Show task details
xec task info deploy

# List all tasks
xec task list

# Search tasks
xec task search backup
```

## Common Issues

### Command Not Found

```yaml
# Ensure command exists on target
tasks:
  fixed:
    command: /usr/local/bin/custom-tool  # Use full path
    # OR
    command: custom-tool
    env:
      PATH: /usr/local/bin:$PATH
```

### Permission Denied

```yaml
# Use appropriate permissions
tasks:
  privileged:
    command: sudo systemctl restart nginx
    target: hosts.server
```

### Working Directory Issues

```yaml
# Ensure directory exists
tasks:
  safe:
    command: |
      mkdir -p /app/logs
      cd /app/logs
      touch app.log
```

## Next Steps

- [Multi-Step Tasks](./multi-step-tasks.md) - Complex workflows
- [Task Overview](./overview.md) - Task management concepts

## See Also

- [Task Command](../../commands/built-in/run.md) - Running tasks
- [Command Execution](../../commands/built-in/in.md) - Direct command execution
- [Best Practices](../advanced/best-practices.md) - Task design patterns