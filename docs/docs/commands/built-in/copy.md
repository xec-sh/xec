# copy

Copy files and directories between targets (local, SSH hosts, Docker containers, Kubernetes pods).

## Synopsis

```bash
xec copy [options] <source> <destination>
xec cp [options] <source> <destination>  # Alias
```

## Description

The `copy` command transfers files and directories between different targets in your Xec environment. It supports copying between any combination of local filesystem, SSH hosts, Docker containers, and Kubernetes pods.

## Arguments

- `<source>` - Source path in format `[target:]path`
- `<destination>` - Destination path in format `[target:]path`

### Path Format

Paths can be specified as:
- `path` - Local path (relative or absolute)
- `local:path` - Explicit local path
- `hosts.name:path` - SSH host path
- `containers.name:path` - Docker container path
- `pods.name:path` - Kubernetes pod path

## Options

### General Options

- `-p, --profile <profile>` - Configuration profile to use
- `-i, --interactive` - Interactive mode for selecting files and options
- `-r, --recursive` - Copy directories recursively
- `--preserve` - Preserve file attributes (timestamps, permissions)
- `-f, --force` - Force overwrite of existing files
- `--parallel` - Copy multiple files in parallel
- `--max-concurrent <n>` - Maximum concurrent copy operations (default: 4)
- `-v, --verbose` - Enable verbose output
- `-q, --quiet` - Suppress output
- `--dry-run` - Preview copy operations without executing

## Examples

### Basic File Copy

Copy a single file from local to remote:

```bash
# Copy file to SSH host
xec copy ./config.json hosts.web-server:/etc/app/config.json

# Copy file from Docker container
xec copy containers.app:/app/data.csv ./backup/data.csv

# Copy file from Kubernetes pod
xec copy pods.database:/var/lib/mysql/backup.sql ./backups/
```

### Directory Copy

Copy entire directories with `-r` flag:

```bash
# Copy directory to Docker container
xec copy -r ./src containers.app:/app/src

# Copy directory from SSH host
xec copy -r hosts.backup:/var/backups/ ./local-backups/

# Copy with attribute preservation
xec copy -r --preserve ./build/ hosts.prod:/var/www/html/
```

### Multiple Targets

Copy from/to multiple targets using wildcards:

```bash
# Copy from all containers
xec copy containers.*:/app/config.json ./configs/{name}.json

# Copy to multiple SSH hosts
xec copy ./deploy.sh hosts.web-*:/tmp/deploy.sh

# Copy between multiple targets
xec copy containers.app:/data/* hosts.backup:/backup/app/
```

### Cross-Target Copy

Copy directly between different target types:

```bash
# From Docker to SSH
xec copy containers.db:/backup.sql hosts.backup:/var/backups/

# From SSH to Kubernetes
xec copy hosts.source:/data/* pods.processor:/input/

# From Kubernetes to Docker
xec copy pods.app:/logs/* containers.logstash:/data/
```

### Advanced Usage

```bash
# Interactive mode - prompts for options
xec copy -i

# Parallel copy with concurrency limit
xec copy --parallel --max-concurrent 8 ./files/* hosts.storage:/data/

# Force overwrite existing files
xec copy -f ./config.new hosts.*:/etc/app/config.json

# Dry run to preview operations
xec copy --dry-run -r ./dist/ containers.app:/app/
```

## Patterns and Wildcards

The copy command supports various pattern matching:

- `*` - Match any characters
- `?` - Match single character
- `{a,b,c}` - Brace expansion
- `**` - Recursive match (when used in paths)

```bash
# Copy all log files
xec copy hosts.server:/var/log/*.log ./logs/

# Copy specific file types
xec copy ./src/**/*.js containers.app:/app/src/

# Copy from multiple specific targets
xec copy {hosts.web1,hosts.web2}:/etc/nginx/nginx.conf ./configs/
```

## Target Resolution

Targets are resolved from your `.xec/config.yaml`:

```yaml
targets:
  hosts:
    web-server:
      type: ssh
      host: 192.168.1.100
      username: deploy
  containers:
    app:
      type: docker
      container: my-app
  pods:
    database:
      type: k8s
      namespace: default
      pod: mysql-abc123
```

## Performance Considerations

- Use `--parallel` for multiple file operations
- Adjust `--max-concurrent` based on network capacity
- Large files are streamed, not loaded into memory
- Progress indication shown for long operations

## Error Handling

The command handles common errors gracefully:

- Source file not found
- Destination permission denied
- Network connectivity issues
- Target not accessible
- Disk space issues

Use `-v, --verbose` for detailed error information.

## Security Notes

- SSH key authentication preferred over passwords
- File permissions preserved with `--preserve`
- Temporary files cleaned up on failure
- Sensitive data not logged in verbose mode

## Related Commands

- [on](on.md) - Execute commands on SSH hosts
- [in](in.md) - Execute commands in containers/pods
- [watch](watch.md) - Watch files for changes

## Configuration

Command defaults can be set in `.xec/config.yaml`:

```yaml
commands:
  copy:
    recursive: true
    preserve: true
    maxConcurrent: 8
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Source not found
- `4` - Destination error
- `5` - Network error