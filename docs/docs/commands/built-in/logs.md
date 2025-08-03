# logs

View and stream logs from targets across local, SSH hosts, Docker containers, and Kubernetes pods with advanced filtering and analysis capabilities.

## Synopsis

```bash
xec logs [options] [target] [path]
xec l [options] [target] [path]  # Alias
```

## Description

The `logs` command provides unified log viewing and streaming across all target types in your Xec environment. It supports real-time log streaming, pattern filtering, time-based queries, and log analysis tasks. When no target is specified, it launches an interactive mode to help you select targets and configure viewing options.

## Arguments

- `[target]` - Target specification (optional for interactive mode)
- `[path]` - Log file path (required for SSH/local targets, optional for containers/pods)

### Target Format

- `local` - Local filesystem
- `hosts.name` - SSH host
- `containers.name` - Docker container
- `pods.name` - Kubernetes pod
- `containers.*` - All containers (wildcard support)
- `hosts.web-*` - Pattern matching

## Options

### General Options

- `-p, --profile <profile>` - Configuration profile to use
- `-i, --interactive` - Interactive mode for selecting targets and options
- `-v, --verbose` - Enable verbose output with debug information
- `-q, --quiet` - Suppress progress and metadata output
- `--dry-run` - Preview log operations without executing

### Log Viewing Options

- `-f, --follow` - Follow log output (stream new logs in real-time)
- `-n, --tail <lines>` - Number of lines to show from the end (default: 50)
- `--since <time>` - Show logs since timestamp (e.g., 10m, 1h, 2d)
- `--until <time>` - Show logs until timestamp
- `-t, --timestamps` - Show timestamps with log lines
- `--previous` - Show previous container logs (Kubernetes only)

### Container/Pod Specific Options

- `--container <name>` - Container name (for pods with multiple containers)

### Filtering Options

- `-g, --grep <pattern>` - Filter logs by regex pattern
- `-v, --invert` - Invert grep match (exclude matching lines)
- `-A, --after <lines>` - Show N lines after grep match
- `-B, --before <lines>` - Show N lines before grep match
- `-C, --context <lines>` - Show N lines before and after grep match

### Output Format Options

- `--no-color` - Disable colored output for log levels
- `--json` - Output logs as JSON with metadata
- `--prefix` - Prefix each line with target name
- `--timestamps` - Add timestamps to log lines

### Multi-Target Options

- `--parallel` - View logs from multiple targets in parallel
- `--aggregate` - Aggregate logs from multiple sources (time-sorted)

### Task Integration

- `--task <task>` - Run a log analysis task on the logs

## Examples

### Basic Log Viewing

View recent logs from different target types:

```bash
# View container logs
xec logs containers.app

# View SSH host logs
xec logs hosts.web-1 /var/log/nginx/access.log

# View Kubernetes pod logs
xec logs pods.api --tail 100

# View local log file
xec logs local /var/log/system.log
```

### Real-time Log Streaming

Stream live logs with the `--follow` flag:

```bash
# Stream container logs
xec logs containers.app -f

# Stream with limited initial lines
xec logs hosts.web-1 /var/log/app.log -f --tail 20

# Stream from specific container in pod
xec logs pods.worker --container sidecar -f
```

### Time-based Filtering

Filter logs by time range:

```bash
# Logs from last hour
xec logs containers.db --since 1h

# Logs from specific time range
xec logs hosts.api /var/log/app.log --since "2h ago" --until "1h ago"

# Recent logs with timestamps
xec logs pods.frontend --since 30m --timestamps
```

### Pattern Filtering and Search

Use grep-style filtering for log analysis:

```bash
# Find error logs
xec logs containers.app --grep "ERROR|FATAL"

# Exclude debug logs
xec logs hosts.web-1 /var/log/app.log --grep "DEBUG" --invert

# Search with context lines
xec logs pods.api --grep "exception" --context 5

# Complex regex patterns
xec logs containers.* --grep "user.*login.*failed" --before 2 --after 3
```

### Multi-Target Log Viewing

View logs from multiple targets simultaneously:

```bash
# Parallel viewing with prefixes
xec logs containers.* --parallel --prefix

# Sequential viewing from pattern
xec logs hosts.web-* /var/log/nginx/error.log

# Mixed target types
xec logs "containers.app,hosts.backup" --parallel
```

### Container and Pod Specific Features

Leverage container/pod specific capabilities:

```bash
# Kubernetes pod logs with timestamps
xec logs pods.database --timestamps --since 10m

# Previous container instance (after restart)
xec logs pods.api --previous

# Specific container in multi-container pod
xec logs pods.worker --container init --tail 50

# Docker logs with since parameter
xec logs containers.web --since 5m --timestamps
```

### Output Formatting

Control output format and appearance:

```bash
# JSON output for parsing
xec logs containers.app --json --tail 10

# Disable colors for pipelines
xec logs hosts.web-1 /var/log/app.log --no-color

# Add prefixes for multi-target clarity
xec logs containers.* --prefix --tail 20

# Combined formatting options
xec logs pods.api --json --timestamps --since 1h
```

### Log Analysis Tasks

Run analysis tasks on log data:

```bash
# Run custom analysis task
xec logs hosts.web-* /var/log/access.log --task analyze-traffic

# Error analysis across containers
xec logs containers.* --task find-errors --since 1d

# Performance analysis with custom task
xec logs pods.database --task performance-check
```

### Interactive Mode

Use interactive mode for guided log viewing:

```bash
# Start interactive mode
xec logs

# Interactive with initial options
xec logs --interactive

# The interactive mode will guide you through:
# - Selecting log source type (container, pod, file, syslog)
# - Choosing specific targets
# - Configuring viewing options (tail, follow, search)
# - Setting time ranges and filters
# - Choosing output formats
```

### Advanced Use Cases

Complex log operations and workflows:

```bash
# Follow logs with filtering and context
xec logs containers.app -f --grep "ERROR|WARN" --context 2

# Multi-target error hunting
xec logs "containers.*,pods.*" --grep "exception" --parallel --prefix

# Time-windowed analysis
xec logs hosts.api-* /var/log/app.log --since "1h ago" --grep "slow.*query" --context 3

# JSON output for log aggregation
xec logs containers.microservice-* --json --since 30m | jq '.[] | select(.level == "ERROR")'

# Continuous monitoring setup
xec logs pods.critical-service -f --grep "CRITICAL|FATAL" --timestamps
```

## Target Configuration

Targets are resolved from your `.xec/config.yaml`:

```yaml
targets:
  hosts:
    web-1:
      type: ssh
      host: 192.168.1.100
      username: deploy
      logPath: /var/log/nginx/access.log  # Default log path
    api-server:
      type: ssh
      host: api.example.com
      username: app
      
  containers:
    app:
      type: docker
      container: my-app-container
    database:
      type: docker
      container: postgres-db
      
  pods:
    frontend:
      type: k8s
      namespace: production
      pod: frontend-abc123
    worker:
      type: k8s
      namespace: default
      pod: worker-def456
      container: main  # Default container for multi-container pods
```

## Time Specifications

Time values support multiple formats:

### Relative Time
- `5s`, `30s` - Seconds
- `10m`, `45m` - Minutes  
- `2h`, `12h` - Hours
- `1d`, `7d` - Days

### Absolute Time
- `2024-01-01T10:00:00Z` - ISO 8601 format
- `2024-01-01 10:00:00` - Standard format
- `Jan 1 10:00` - Syslog format

### Human-friendly
- `1h ago`, `30m ago` - Relative descriptions
- `yesterday`, `today` - Day references

## Log Pattern Filtering

The `--grep` option supports full regex patterns:

```bash
# Basic patterns
--grep "ERROR"                    # Simple string match
--grep "ERROR|WARN|FATAL"        # Multiple levels
--grep "user.*login.*failed"     # Complex patterns
--grep "^\d{4}-\d{2}-\d{2}"      # Timestamp patterns
--grep "exception.*stack"        # Multi-word patterns

# With context
--grep "ERROR" --context 3        # 3 lines before and after
--grep "ERROR" --before 2 --after 5  # Asymmetric context

# Inverted matching
--grep "DEBUG|TRACE" --invert     # Exclude debug logs
```

## Output Formats

### Standard Output
Default human-readable format with optional colorization:

```
2024-01-01 10:00:00 [INFO] Application started
2024-01-01 10:00:01 [ERROR] Database connection failed
2024-01-01 10:00:02 [WARN] Retrying connection
```

### JSON Output
Structured output for programmatic processing:

```json
{
  "target": "containers.app",
  "timestamp": "2024-01-01T10:00:00Z",
  "message": "Application started"
}
```

### Prefixed Output
Multi-target output with target identification:

```
[app [docker]] 2024-01-01 10:00:00 Application started
[web-1 [ssh]] 2024-01-01 10:00:01 HTTP request processed
[api [k8s]] 2024-01-01 10:00:02 API call completed
```

## Log Analysis Tasks

Create custom analysis tasks in your configuration:

```yaml
tasks:
  analyze-errors:
    description: Analyze error patterns in logs
    steps:
      - name: Count errors
        command: |
          grep -c "ERROR" "$LOG_PATH" || echo "0"
      - name: Find common errors
        command: |
          grep "ERROR" "$LOG_PATH" | sort | uniq -c | sort -nr | head -10
          
  performance-check:
    description: Check for performance issues
    steps:
      - name: Slow queries
        command: |
          grep -i "slow.*query" "$LOG_PATH" | wc -l
      - name: High memory usage
        command: |
          grep -i "memory.*high" "$LOG_PATH" | tail -5
```

## Performance Considerations

### Streaming Performance
- Use `--tail` to limit initial log volume
- Apply `--grep` filters to reduce output
- Consider `--since` for time-bounded queries

### Multi-Target Operations
- `--parallel` improves performance for multiple targets
- `--max-concurrent` controls resource usage (future feature)
- Network latency affects SSH target performance

### Large Log Files
- Streaming (`-f`) is more efficient than large batch reads
- Time-based filtering (`--since`, `--until`) reduces processing
- Grep filtering happens at the source when possible

## Error Handling

Common error scenarios and solutions:

### Target Not Found
```bash
Error: Target 'containers.missing' not found
Solution: Check target configuration in .xec/config.yaml
```

### Log File Not Found
```bash
Error: No such file: /var/log/missing.log
Solution: Verify log file path exists on target
```

### Permission Denied
```bash
Error: Permission denied: /var/log/secure
Solution: Ensure SSH user has read access to log files
```

### Container Not Running
```bash
Error: Container 'app' is not running
Solution: Start container or check container name
```

## Security Considerations

### SSH Authentication
- Use SSH key authentication when possible
- Avoid password authentication in automation
- Configure proper SSH host key verification

### Log Content
- Sensitive data in logs is displayed as-is
- Use `--grep` to filter sensitive information if needed
- Consider log rotation and retention policies

### File Access
- SSH users need read access to log files
- Container logs accessible via Docker daemon
- Kubernetes logs require appropriate RBAC permissions

## Related Commands

- [on](on.md) - Execute commands on SSH hosts
- [in](in.md) - Execute commands in containers/pods  
- [copy](copy.md) - Copy files between targets
- [forward](forward.md) - Port forwarding

## Configuration

Set command defaults in `.xec/config.yaml`:

```yaml
commands:
  logs:
    tail: 100              # Default number of lines
    timestamps: true       # Always show timestamps
    color: true           # Enable colors by default
    follow: false         # Default to batch mode
    prefix: false         # Disable prefixes by default
    since: null           # No default time filter
    grep: null            # No default pattern filter
```

## Exit Codes

- `0` - Success
- `1` - General error (target not found, file not accessible)
- `2` - Invalid arguments or options
- `3` - Configuration error
- `4` - Network/connection error
- `5` - Log processing error

## Tips and Best Practices

### Efficient Log Monitoring
```bash
# Monitor critical services
xec logs containers.critical -f --grep "ERROR|FATAL" --timestamps

# Track deployment progress
xec logs pods.app -f --since 5m --grep "deploy|start|ready"

# Debug application issues
xec logs hosts.api /var/log/app.log --grep "exception" --context 5
```

### Log Analysis Workflows
```bash
# Error trend analysis
xec logs containers.* --since 1d --grep "ERROR" --json | jq -r '.timestamp' | sort | uniq -c

# Performance monitoring
xec logs pods.database --grep "slow.*query" --context 2 --since 1h

# Security monitoring
xec logs hosts.* /var/log/auth.log --grep "failed.*login" --timestamps
```

### Automation Integration
```bash
# CI/CD log monitoring
xec logs pods.deployment -f --grep "DEPLOY" --json > deployment.log

# Health check automation
xec logs containers.healthcheck --tail 1 --grep "healthy" > /dev/null && echo "OK"

# Alert on errors
xec logs pods.critical --since 5m --grep "FATAL" && ./send-alert.sh
```