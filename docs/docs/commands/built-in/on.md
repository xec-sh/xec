# on

Execute commands on SSH hosts.

## Synopsis

```bash
xec on [options] <hosts> [command...]
```

## Description

The `on` command executes commands, scripts, or tasks on remote SSH hosts. It provides unified SSH execution with support for parallel operations, pattern matching, and direct SSH connections.

## Arguments

- `<hosts>` - SSH host specification (patterns supported)
- `[command...]` - Command to execute (optional for REPL/interactive modes)

### Host Specification

Hosts can be specified as:
- `hosts.name` - Configured SSH host
- `hosts.*` - All configured SSH hosts
- `hosts.web-*` - Pattern matching
- `{hosts.web1,hosts.web2}` - Multiple specific hosts
- `user@hostname` - Direct SSH connection
- `hostname` - Direct connection (uses current user)

## Options

### General Options

- `-p, --profile <profile>` - Configuration profile to use
- `-i, --interactive` - Interactive mode for selecting hosts and options
- `--task <task>` - Execute a configured task on the hosts
- `--repl` - Start a REPL session with $target available
- `-t, --timeout <duration>` - Command timeout (e.g., 30s, 5m)
- `-e, --env <key=value>` - Environment variables (can be used multiple times)
- `-d, --cwd <path>` - Working directory on remote host
- `-u, --user <user>` - User to run command as (overrides config)
- `--parallel` - Execute on multiple hosts in parallel
- `--max-concurrent <n>` - Maximum concurrent executions (default: 10)
- `--fail-fast` - Stop on first failure in parallel mode
- `-v, --verbose` - Enable verbose output
- `-q, --quiet` - Suppress output
- `--dry-run` - Preview execution without running

## Examples

### Basic Command Execution

Execute simple commands on SSH hosts:

```bash
# Single host
xec on hosts.web-1 "uptime"

# Multiple hosts with pattern
xec on hosts.web-* "df -h"

# All SSH hosts
xec on hosts.* "date"

# Direct SSH connection
xec on deploy@server.com "ls -la"
```

### Parallel Execution

Run commands on multiple hosts simultaneously:

```bash
# Check service status on all web servers
xec on hosts.web-* "systemctl status nginx" --parallel

# Deploy to multiple servers
xec on hosts.app-* "./deploy.sh" --parallel --max-concurrent 5

# Stop on first failure
xec on hosts.* "npm test" --parallel --fail-fast
```

### Script Execution

Run scripts with SSH context:

```bash
# Execute TypeScript script
xec on hosts.db-master ./scripts/backup.ts

# Execute JavaScript file
xec on hosts.worker ./migrate.js

# Script with $target context
xec on hosts.app ./deploy-script.js
```

### Task Execution

Run configured tasks on hosts:

```bash
# Run deploy task
xec on hosts.production --task deploy

# Run backup task on all databases
xec on hosts.db-* --task backup --parallel

# Run health check task
xec on hosts.* --task health-check
```

### REPL Mode

Start REPL with SSH context:

```bash
# Start REPL for single host
xec on hosts.dev --repl

# Access host in REPL
# > await $target`ls -la`
# > const mem = await $target`free -m`
```

### Interactive Mode

Use interactive prompts for configuration:

```bash
# Interactive host selection and execution
xec on --interactive

# Prompts for:
# - Host selection (single/multiple)
# - Execution type (command/script/task/REPL)
# - Execution options (parallel, timeout, etc.)
```

### Environment Variables

Set environment variables for remote execution:

```bash
# Single variable
xec on hosts.app -e NODE_ENV=production "node server.js"

# Multiple variables
xec on hosts.worker -e DB_HOST=localhost -e DB_PORT=5432 "./process.sh"

# Override PATH
xec on hosts.build -e PATH=/custom/bin:$PATH "which node"
```

### Working Directory

Set remote working directory:

```bash
# Change to specific directory
xec on hosts.app -d /var/www/html "git pull"

# Run from user home
xec on hosts.backup -d ~ "./backup.sh"

# Temporary directory
xec on hosts.temp -d /tmp "rm -rf old-files-*"
```

### Timeout Control

Set execution timeouts:

```bash
# 30 second timeout
xec on hosts.test -t 30s "npm test"

# 5 minute timeout for longer operations
xec on hosts.build -t 5m "make all"

# 1 hour for backup operations
xec on hosts.backup -t 1h "./full-backup.sh"
```

### User Override

Execute as different user:

```bash
# Run as root
xec on hosts.app -u root "apt-get update"

# Run as deploy user
xec on hosts.production -u deploy "./deploy.sh"

# Override configured user
xec on hosts.db -u postgres "psql -c 'SELECT version()'"
```

## Advanced Usage

### Pattern Matching

Use patterns to select multiple hosts:

```bash
# Wildcard matching
xec on hosts.web-* "nginx -t"

# Brace expansion
xec on {hosts.web1,hosts.web2,hosts.db1} "uptime"

# All hosts
xec on hosts.* "uname -a"

# Complex patterns
xec on "hosts.{prod,staging}-web-*" "systemctl status"
```

### Direct SSH Connections

Connect to hosts not in configuration:

```bash
# User@host format
xec on admin@192.168.1.100 "ls -la"

# Hostname only (uses current user)
xec on example.com "date"

# Multiple direct connections
xec on user@host1,user@host2 "uptime" --parallel
```

### Parallel Execution Control

Fine-tune parallel execution:

```bash
# Limited concurrency
xec on hosts.* "heavy-task.sh" --parallel --max-concurrent 3

# Fail fast on error
xec on hosts.prod-* "test.sh" --parallel --fail-fast

# Progress reporting
xec on hosts.* "backup.sh" --parallel -v
```

### Command Chaining

Execute multiple commands:

```bash
# Sequential commands
xec on hosts.app "cd /app && git pull && npm install && npm run build"

# Conditional execution
xec on hosts.db "pg_isready && pg_dump mydb > backup.sql"

# Pipe operations
xec on hosts.log "tail -f /var/log/app.log | grep ERROR"
```

### Script Context

Scripts have access to SSH context:

```javascript
// deploy.js
const hostname = await $target`hostname`;
console.log(`Deploying to ${hostname.stdout.trim()}`);

await $target`cd /app && git pull`;
await $target`npm install`;
await $target`npm run build`;
```

## Configuration

Configure SSH hosts in `.xec/config.yaml`:

```yaml
targets:
  hosts:
    web-1:
      type: ssh
      host: 192.168.1.10
      username: deploy
      port: 22
      privateKey: ~/.ssh/id_rsa
    
    db-master:
      type: ssh
      host: db.example.com
      username: admin
      password: $SSH_PASSWORD  # From environment
      
    bastion:
      type: ssh
      host: bastion.example.com
      username: jump
      # SSH config for ProxyJump handled

commands:
  on:
    parallel: true
    maxConcurrent: 10
    timeout: "1m"
```

## SSH Features

### Connection Options

The command respects SSH configuration:

```bash
# Uses SSH config file
xec on hosts.configured "date"

# Direct connection with defaults
xec on new-host.com "uptime"

# Connection pooling for efficiency
xec on hosts.* "quick-check" --parallel
```

### Authentication

Supports multiple authentication methods:
- SSH keys (preferred)
- SSH agent
- Password authentication
- SSH config ProxyJump

### Connection Pooling

Connections are pooled for efficiency:
- Reuses existing connections
- Parallel commands share connections
- Automatic cleanup on exit

## Error Handling

The command handles SSH errors gracefully:

- Connection refused
- Authentication failed
- Host unreachable
- Command not found
- Permission denied
- Timeout exceeded

Use `-v, --verbose` for detailed error information.

## Performance Considerations

- Connection pooling reduces overhead
- Parallel execution for multiple hosts
- Streaming for large outputs
- Efficient for batch operations

## Security Notes

- SSH keys preferred over passwords
- Passwords read from environment variables
- Sensitive data not logged
- Respects SSH known_hosts

## Troubleshooting

### Connection Issues

```bash
# Test SSH connection
ssh -v user@host

# Check SSH config
cat ~/.ssh/config

# Verify host key
ssh-keyscan hostname
```

### Authentication Problems

```bash
# Check SSH agent
ssh-add -l

# Test with specific key
xec on hosts.server "date"
# Check config for correct key path
```

### Timeout Issues

```bash
# Increase timeout for slow connections
xec on hosts.remote -t 5m "long-running-task"

# Check network latency
ping hostname
```

## Related Commands

- [in](in.md) - Execute in containers/pods
- [run](run.md) - Run scripts and tasks
- [forward](forward.md) - SSH port forwarding

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Host not found
- `4` - SSH connection failed
- `5` - Command execution failed
- `124` - Timeout exceeded