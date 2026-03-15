# watch

Watch files for changes and execute commands, tasks, or scripts automatically.

## Synopsis

```bash
xec watch <target> [paths...] [options]
```

## Description

The `watch` command monitors files and directories for changes and automatically executes specified actions. It supports watching files on local filesystem, SSH hosts, Docker containers, and Kubernetes pods.

## Arguments

- `<target>` - Target to watch (local, hosts.name, containers.name, pods.name)
- `[paths...]` - Paths to watch (default: current directory)

## Options

### General Options

- `-p, --profile <profile>` - Configuration profile to use
- `-i, --interactive` - Interactive mode for configuring watch settings

### Watch Configuration

- `--pattern <pattern>` - File patterns to watch (can be used multiple times)
- `--exclude <pattern>` - Patterns to exclude (can be used multiple times)
- `-d, --debounce <ms>` - Debounce interval in milliseconds (default: 300)
- `--initial` - Run command immediately on start
- `--poll` - Use polling instead of native watchers
- `--interval <ms>` - Polling interval when --poll is used (default: 1000)

### Action Options

- `--command <command>` - Command to execute on change
- `--task <task>` - Task to run on change
- `--script <script>` - Script file to execute on change

## Examples

### Interactive Mode

```bash
# Interactive mode to configure file watching
xec watch --interactive
```

### Basic File Watching

```bash
# Watch TypeScript files and run tests
xec watch local "src/**/*.ts" --command "npm test"

# Watch current directory and run build script
xec watch local . --script ./scripts/build.js

# Watch specific files and run task
xec watch local "src/**/*.js" --task build
```

### Remote Watching

```bash
# Watch remote directory and run deploy task
xec watch hosts.dev /app --task deploy

# Watch files in Docker container
xec watch containers.app /src --pattern "*.js" --command "npm run build"

# Watch pod files excluding node_modules
xec watch pods.frontend /app --exclude "node_modules" --task reload
```

### Advanced Configuration

```bash
# Watch with debouncing and initial run
xec watch local "src/**/*.ts" --command "npm test" --debounce 1000 --initial

# Use polling for network filesystems
xec watch hosts.nfs /shared --poll --interval 2000 --task sync

# Watch multiple patterns with exclusions
xec watch local . \
  --pattern "*.ts" \
  --pattern "*.js" \
  --exclude "node_modules" \
  --exclude "*.test.*" \
  --command "npm run lint"
```

### Pattern Matching

```bash
# Watch specific file types
xec watch local . --pattern "*.ts" --pattern "*.js" --command "npm run build"

# Watch with complex patterns
xec watch local . \
  --pattern "src/**/*.{ts,js}" \
  --pattern "config/**/*.yaml" \
  --exclude "**/*.test.*" \
  --exclude "**/node_modules/**" \
  --task build-and-test
```

## Supported Targets

### Local Filesystem

Uses native file system watchers or polling:

```bash
# Watch local files with native watchers
xec watch local src/ --command "npm run build"

# Use polling for better compatibility
xec watch local src/ --poll --command "npm run build"
```

### SSH Hosts

Uses `inotifywait` on remote system or fallback polling:

```bash
# Watch remote files via SSH
xec watch hosts.server /app/src --command "systemctl reload myapp"

# Watch with custom patterns
xec watch hosts.server /etc --pattern "*.conf" --task reload-config
```

### Docker Containers

Executes `inotifywait` inside the container:

```bash
# Watch files in running container
xec watch containers.app /app/src --command "npm run build"

# Watch with exclusions
xec watch containers.web /var/www --exclude "*.log" --task reload-nginx
```

### Kubernetes Pods

Uses `kubectl exec` to run watchers in pods:

```bash
# Watch files in pod
xec watch pods.frontend /app/src --command "npm run build"

# Watch in specific container of multi-container pod
xec watch pods.app /data --task process-data
```

## Pattern Syntax

The watch command supports glob-style patterns:

- `*` - Match any characters except path separators
- `**` - Match any characters including path separators (recursive)
- `?` - Match single character
- `{a,b,c}` - Brace expansion
- `[abc]` - Character ranges

### Pattern Examples

```bash
# TypeScript and JavaScript files
--pattern "**/*.{ts,js}"

# Configuration files
--pattern "**/*.{yaml,yml,json}"

# Source files excluding tests
--pattern "src/**/*.ts" --exclude "**/*.test.*"

# Multiple specific patterns
--pattern "*.ts" --pattern "*.css" --pattern "*.html"
```

## Exclude Patterns

Exclude patterns prevent files from triggering watch events:

```bash
# Exclude common directories
--exclude "node_modules" --exclude ".git" --exclude "dist"

# Exclude file types
--exclude "*.log" --exclude "*.tmp" --exclude "*.cache"

# Exclude test files
--exclude "**/*.test.*" --exclude "**/*.spec.*"
```

## Action Types

### Commands

Execute shell commands when files change:

```bash
# Simple command
xec watch local src/ --command "npm run build"

# Complex command with pipes
xec watch local . --command "npm run lint && npm run test"

# Command with environment variables
xec watch local . --command "NODE_ENV=development npm start"
```

### Tasks

Run configured tasks from `.xec/config.yaml`:

```bash
# Run simple task
xec watch local src/ --task build

# Run task with parameters (if supported by task)
xec watch local . --task deploy

# Run complex multi-step task
xec watch local . --task build-test-deploy
```

### Scripts

Execute Xec scripts when files change:

```bash
# Run TypeScript script
xec watch local src/ --script ./scripts/build.ts

# Run JavaScript script
xec watch local . --script ./automation/deploy.js

# Script with full path
xec watch local . --script /usr/local/bin/custom-build.sh
```

## Debouncing

Debouncing prevents excessive executions when multiple files change rapidly:

```bash
# Short debounce for quick feedback
xec watch local src/ --command "npm run lint" --debounce 100

# Standard debounce (default)
xec watch local . --command "npm run build" --debounce 300

# Long debounce for expensive operations
xec watch local . --task full-rebuild --debounce 2000
```

## Polling vs Native Watchers

### Native Watchers (Default)

- Uses filesystem events (inotify on Linux, FSEvents on macOS)
- More efficient and responsive
- May not work on network filesystems

```bash
# Use native watchers (default)
xec watch local src/ --command "npm run build"
```

### Polling

- Checks files at regular intervals
- Works on all filesystems including network mounts
- Higher resource usage

```bash
# Use polling
xec watch local /network/share --poll --interval 1000 --task sync

# Polling with custom interval
xec watch hosts.nfs /shared --poll --interval 5000 --command "rsync -av /shared/ /local/"
```

## Interactive Mode

Interactive mode provides a guided setup for complex watch configurations:

```bash
xec watch --interactive
```

Interactive mode prompts for:

1. **Target selection** - Choose from configured targets
2. **Paths to watch** - Specify directories and files
3. **File patterns** - Include/exclude patterns
4. **Action type** - Command, task, or script
5. **Advanced options** - Debouncing, polling, initial run

## Remote Watching Implementation

### SSH Hosts

The watch command uses `inotifywait` on the remote system:

```bash
# Command executed on remote host
inotifywait -mr -e modify,create,delete --format '%w%f' /path/to/watch
```

If `inotifywait` is not available, falls back to stat-based polling:

```bash
# Fallback polling command
while true; do
  current_mtime=$(find /path -type f -exec stat -c '%Y' {} \; | sort -n | tail -1)
  if [ "$current_mtime" != "$last_mtime" ]; then
    echo "/path MODIFY"
    last_mtime="$current_mtime"
  fi
  sleep 1
done
```

### Docker Containers

Similar to SSH, but uses `docker exec`:

```bash
docker exec container_name sh -c "inotifywait -mr -e modify,create,delete --format '%w%f' /path"
```

### Kubernetes Pods

Uses `kubectl exec` to run watchers:

```bash
kubectl exec -n namespace pod_name -- sh -c "inotifywait -mr -e modify,create,delete --format '%w%f' /path"
```

## Performance Considerations

- **File count**: Large directories may impact performance
- **Pattern complexity**: Simple patterns are more efficient
- **Debounce timing**: Balance responsiveness vs. resource usage
- **Remote watching**: Network latency affects response time
- **Polling interval**: Lower intervals increase CPU usage

## Error Handling

The watch command handles common scenarios:

- **File not found**: Reports missing paths
- **Permission denied**: Shows access errors
- **Command failures**: Continues watching after failed executions
- **Network issues**: Attempts to reconnect for remote targets
- **Tool unavailability**: Falls back to polling when `inotifywait` is missing

## Signal Handling

The watch command responds to signals:

- **SIGINT (Ctrl+C)**: Graceful shutdown, cleanup watchers
- **SIGTERM**: Clean termination
- **SIGUSR1**: Reload configuration (if supported)

## Logging and Output

Watch output includes:

```
[12:34:56] Change detected: src/index.ts
✓ Command executed successfully
[12:35:02] Change detected: src/utils.ts
✗ Execution failed: Command failed with exit code 1
```

Use `--quiet` to suppress output or `--verbose` for detailed logging.

## Configuration

Default watch settings can be configured in `.xec/config.yaml`:

```yaml
commands:
  watch:
    debounce: 300
    poll: false
    interval: 1000
    clear: true
    initial: false
```

## Related Commands

- [run](run.md) - Execute scripts and tasks
- [on](on.md) - Execute commands on SSH hosts
- [in](in.md) - Execute commands in containers/pods
- [logs](logs.md) - View logs from targets

## Exit Codes

- `0` - Success (watch stopped gracefully)
- `1` - General error
- `2` - Invalid arguments
- `3` - Target not found
- `4` - Watch setup failed
- `5` - Permission error