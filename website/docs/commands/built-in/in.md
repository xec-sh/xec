# in

Execute commands inside Docker containers or Kubernetes pods.

## Synopsis

```bash
xec in [options] <target> [command...]
```

## Description

The `in` command executes commands, scripts, or tasks inside Docker containers and Kubernetes pods. It provides a unified interface for container execution across different container runtimes.

## Arguments

- `<target>` - Target container or pod (supports patterns)
- `[command...]` - Command to execute (optional, defaults to interactive shell)

### Target Patterns

- `containers.name` - Specific Docker container
- `pods.name` - Specific Kubernetes pod
- `containers.*` - All Docker containers
- `pods.*` - All Kubernetes pods
- `{containers.web,containers.api}` - Multiple specific targets

## Options

### General Options

- `-p, --profile <profile>` - Configuration profile to use
- `-i, --interactive` - Interactive mode (attach to container)
- `--task <task>` - Execute a configured task in the target
- `--repl` - Start a REPL session with $target available
- `-t, --timeout <duration>` - Command timeout (e.g., 30s, 5m)
- `-e, --env <key=value>` - Environment variables (can be used multiple times)
- `-d, --cwd <path>` - Working directory in container
- `-u, --user <user>` - User to run command as
- `--parallel` - Execute on multiple targets in parallel
- `-v, --verbose` - Enable verbose output
- `-q, --quiet` - Suppress output
- `--dry-run` - Preview execution without running

## Examples

### Basic Command Execution

Execute simple commands in containers:

```bash
# Execute in Docker container
xec in containers.app "ls -la"

# Execute in Kubernetes pod
xec in pods.webapp "date"

# Check running processes
xec in containers.db "ps aux"

# Run package manager commands
xec in containers.node "npm test"
```

### Interactive Shell

Start interactive shell sessions:

```bash
# Interactive shell in container (default)
xec in containers.app

# Interactive shell with specific user
xec in -u root containers.web

# Interactive shell with custom working directory
xec in -d /app containers.api
```

### Script Execution

Run scripts with container context:

```bash
# Execute TypeScript script
xec in containers.app ./scripts/deploy.ts

# Execute JavaScript file
xec in pods.worker ./migrate.js

# Script with $target context available
xec in containers.test ./test-runner.js
```

### Task Execution

Run configured tasks in containers:

```bash
# Run test task
xec in containers.app --task test

# Run build task
xec in pods.builder --task build

# Run custom task
xec in containers.* --task migrate --parallel
```

### REPL Mode

Start REPL with container context:

```bash
# Start REPL with $target available
xec in containers.app --repl

# REPL for debugging
xec in pods.api --repl

# Access container filesystem in REPL
# > await $target`ls -la`
# > const config = await $target`cat /app/config.json`
```

### Multiple Target Execution

Execute on multiple targets:

```bash
# Run on all containers
xec in containers.* "date"

# Parallel execution
xec in containers.* "npm test" --parallel

# Specific containers
xec in {containers.web,containers.api} "health-check"
```

### Environment Variables

Set environment variables for execution:

```bash
# Single environment variable
xec in containers.app -e NODE_ENV=production "npm start"

# Multiple environment variables
xec in pods.worker -e DB_HOST=localhost -e DB_PORT=5432 "./run.sh"

# Override container defaults
xec in containers.test -e DEBUG=true "pytest"
```

### Working Directory

Set working directory for command:

```bash
# Change to specific directory
xec in containers.app -d /app/src "npm test"

# Run from project root
xec in pods.builder -d /workspace "make build"

# Temporary directory
xec in containers.temp -d /tmp "./cleanup.sh"
```

### Timeout Control

Set execution timeouts:

```bash
# 30 second timeout
xec in containers.app -t 30s "npm test"

# 5 minute timeout
xec in pods.migration -t 5m "./migrate.js"

# 1 hour timeout for long tasks
xec in containers.backup -t 1h "./backup.sh"
```

### User Context

Run commands as specific user:

```bash
# Run as root
xec in -u root containers.app "apt-get update"

# Run as application user
xec in -u app containers.web "npm install"

# Run as numeric UID
xec in -u 1000 pods.worker "./script.sh"
```

## Target Types

### Docker Containers

Execute in Docker containers:

```bash
# Named container
xec in containers.myapp "ls"

# Container by ID
xec in containers.abc123 "date"

# All running containers
xec in containers.* "health-check" --parallel
```

### Kubernetes Pods

Execute in Kubernetes pods:

```bash
# Pod in default namespace
xec in pods.webapp "kubectl version"

# Pod with specific container
xec in pods.multi-container "date"
# (uses container from config)

# All pods matching pattern
xec in pods.worker-* "./process.sh" --parallel
```

## Advanced Usage

### Parallel Execution

Run commands on multiple targets simultaneously:

```bash
# Test all services
xec in containers.* --task test --parallel

# Deploy to multiple pods
xec in pods.app-* "./deploy.sh" --parallel

# Collect logs from all containers
xec in containers.* "tail -n 100 /var/log/app.log" --parallel
```

### Command Chaining

Chain multiple commands:

```bash
# Multiple commands
xec in containers.app "cd /app && npm test && npm build"

# Pipe commands
xec in pods.processor "cat data.json | jq '.items[]' | wc -l"

# Conditional execution
xec in containers.db "pg_isready && psql -c 'SELECT 1'"
```

### Script Context

Scripts have access to container context:

```javascript
// deploy.js
const result = await $target`npm run build`;
console.log(result.stdout);

await $target`cp -r dist/* /var/www/`;
```

### Interactive Testing

Use interactive mode for debugging:

```bash
# Debug container issues
xec in -i containers.broken

# Inspect pod filesystem
xec in -i pods.debug

# Test connectivity
xec in -i containers.network
```

## Configuration

Configure defaults in `.xec/config.yaml`:

```yaml
targets:
  containers:
    app:
      type: docker
      container: my-app
      workdir: /app
      user: node
      shell: /bin/bash
    
  pods:
    worker:
      type: k8s
      namespace: production
      pod: worker-deployment-abc123
      container: worker  # For multi-container pods

commands:
  in:
    timeout: "1m"
    parallel: false
    env:
      - NODE_ENV=production
```

## Docker-Specific Features

### Docker Exec Options

The command maps to `docker exec` with options:

```bash
# Basic execution
xec in containers.app "ls"
# → docker exec app ls

# With user and workdir
xec in -u root -d /tmp containers.app "pwd"
# → docker exec -u root -w /tmp app pwd

# Interactive
xec in -i containers.app
# → docker exec -it app /bin/sh
```

### Container States

- Container must be running
- Use container name or ID
- Supports pattern matching on names

## Kubernetes-Specific Features

### Kubectl Exec Options

The command maps to `kubectl exec` with options:

```bash
# Basic execution
xec in pods.webapp "ls"
# → kubectl exec webapp -- ls

# With namespace (from config)
xec in pods.webapp "date"
# → kubectl exec -n production webapp -- date

# Specific container in pod
xec in pods.multi "ps"
# → kubectl exec multi -c app -- ps
```

### Pod Selection

- Pod must be in Running state
- Namespace from configuration
- Container selection for multi-container pods

## Error Handling

The command handles common errors:

- Container/pod not found
- Container not running
- Command not found in container
- Permission denied
- Timeout exceeded

Use `-v, --verbose` for detailed error information.

## Performance Considerations

- Commands execute directly in containers (no SSH overhead)
- Parallel execution for multiple targets
- Stream processing for large outputs
- Efficient for batch operations

## Security Notes

- Respects container user permissions
- Environment variables not logged
- Sensitive commands should use `--quiet`
- Interactive mode for secure input

## Troubleshooting

### Container Not Found

```bash
# List available containers
docker ps

# Check configuration
xec inspect containers
```

### Pod Not Ready

```bash
# Check pod status
kubectl get pods

# Wait for pod ready
kubectl wait --for=condition=ready pod/webapp
```

### Permission Denied

```bash
# Run as root
xec in -u root containers.app "chmod +x script.sh"

# Check container user
xec in containers.app "whoami"
```

## Related Commands

- [on](on.md) - Execute commands on SSH hosts
- [run](run.md) - Run scripts and tasks
- [logs](logs.md) - View container/pod logs

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Target not found
- `4` - Command execution failed
- `124` - Timeout exceeded