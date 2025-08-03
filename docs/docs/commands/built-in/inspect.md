# inspect

Inspect and analyze Xec project configuration, tasks, and resources.

## Synopsis

```bash
xec inspect [type] [name] [options]
xec i [type] [name] [options]  # Alias
```

## Description

The `inspect` command provides comprehensive analysis and visualization of your Xec project configuration, tasks, targets, variables, scripts, commands, and system information. It offers multiple output formats and validation capabilities.

## Arguments

- `[type]` - Type of resource to inspect: `all`, `tasks`, `targets`, `vars`, `scripts`, `commands`, `config`, `system`, `cache`
- `[name]` - Specific resource name to inspect

## Options

### Display Options

- `-f, --filter <pattern>` - Filter results by pattern (regex)
- `--format <format>` - Output format: `table`, `json`, `yaml`, `tree` (default: table)
- `-r, --resolve` - Resolve and show interpolated values
- `-e, --explain` - Show execution plan and details

### Analysis Options

- `--validate` - Validate configuration and connectivity
- `-p, --profile <name>` - Use specific profile for inspection

## Examples

### Interactive Mode

```bash
# Interactive mode to browse all resources
xec inspect

# Interactive inspection with alias
xec i
```

### Resource Type Inspection

```bash
# List all tasks
xec inspect tasks

# List all configured targets
xec inspect targets

# View all variables
xec inspect vars

# Show custom scripts
xec inspect scripts

# List available commands
xec inspect commands

# Display system information
xec inspect system

# View cache information
xec inspect cache
```

### Specific Resource Inspection

```bash
# Inspect specific task with execution plan
xec inspect tasks deploy --explain

# View specific target configuration
xec inspect targets hosts.production

# Show specific variable with resolved value
xec inspect vars DATABASE_URL --resolve

# Inspect specific script
xec inspect scripts deploy.js

# View system version information
xec inspect system version
```

### Output Formats

```bash
# JSON output for automation
xec inspect tasks --format json

# YAML output for readability
xec inspect config --format yaml

# Tree view for hierarchical data
xec inspect all --format tree

# Table view with filtering
xec inspect targets --filter "production" --format table
```

### Validation and Analysis

```bash
# Validate all configuration
xec inspect --validate

# Validate with specific profile
xec inspect --validate -p production

# Explain task execution plan
xec inspect tasks build --explain

# Resolve variables and show interpolated values
xec inspect vars --resolve

# Filter and resolve
xec inspect targets --filter "docker" --resolve
```

## Inspection Types

### Tasks

Displays configured tasks with their properties:

```bash
xec inspect tasks
```

**Output includes:**
- Task name and description
- Task type (command, script, pipeline)
- Parameters and their types
- Dependencies and execution order
- Target requirements

**With `--explain`:**
- Step-by-step execution plan
- Variable interpolation
- Target resolution
- Parameter validation

### Targets

Shows all configured execution targets:

```bash
xec inspect targets
```

**Output includes:**
- Target name and type (local, ssh, docker, k8s)
- Connection details (host, port, container, pod)
- Authentication configuration
- Default settings inheritance

**With `--validate`:**
- Connectivity testing
- Authentication verification
- Target availability

### Variables

Displays project variables and their values:

```bash
xec inspect vars
```

**Output includes:**
- Variable name and value
- Data type (string, number, boolean, object)
- Interpolation usage detection
- Secret references

**With `--resolve`:**
- Resolved interpolated values
- Secret value indication (masked)
- Environment variable expansion
- Expression evaluation

### Scripts

Lists JavaScript/TypeScript scripts in the project:

```bash
xec inspect scripts
```

**Output includes:**
- Script file path and name
- File size and modification time
- Detected description (from comments)
- Executable permissions

### Commands

Shows available CLI commands:

```bash
xec inspect commands
```

**Output includes:**
- Command name and type (built-in, custom)
- Description and usage
- File path (for custom commands)
- Load status and errors

### Configuration

Displays the complete project configuration:

```bash
xec inspect config
```

**Output includes:**
- Full configuration tree
- Profile-specific overrides
- Default value inheritance
- Validation status

### System

Provides system and environment information:

```bash
xec inspect system
```

**Categories:**
- **Version**: Xec CLI, Core, Node.js versions
- **OS**: Operating system, architecture, release
- **Hardware**: CPU, memory, disk information
- **Environment**: User, shell, environment variables
- **Network**: Network interfaces and addresses
- **Tools**: Installed development tools
- **Project**: Project-specific information

### Cache

Shows module cache statistics:

```bash
xec inspect cache
```

**Output includes:**
- Memory cache entries
- File cache entries
- Total cache size
- Cache directory location

## Output Formats

### Table Format (Default)

Structured tabular output with consistent columns:

```
┌─────────────┬──────────┬─────────────────────────┐
│ Name        │ Type     │ Description             │
├─────────────┼──────────┼─────────────────────────┤
│ build       │ Pipeline │ Build the application   │
│ deploy      │ Script   │ Deploy to production    │
│ test        │ Command  │ Run test suite          │
└─────────────┴──────────┴─────────────────────────┘
```

### JSON Format

Machine-readable JSON for automation:

```json
[
  {
    "type": "task",
    "name": "build",
    "data": {
      "description": "Build the application",
      "steps": [...]
    },
    "metadata": {
      "hasSteps": true,
      "isPrivate": false
    }
  }
]
```

### YAML Format

Human-readable YAML output:

```yaml
build:
  description: Build the application
  steps:
    - name: Install dependencies
      command: npm install
    - name: Build
      command: npm run build
  metadata:
    hasSteps: true
    isPrivate: false
```

### Tree Format

Hierarchical tree view:

```
📋 Tasks:
  ├─ build (Pipeline) - Build the application
  │  └─ hasSteps: true
  ├─ deploy (Script) - Deploy to production
  │  └─ hasScript: true
  └─ test (Command) - Run test suite

🎯 Targets:
  ├─ hosts.production (SSH) - prod.example.com:22
  └─ containers.app (Docker) - container: myapp
```

## Filtering

The `--filter` option accepts regular expressions:

```bash
# Filter by name pattern
xec inspect tasks --filter "^deploy"

# Filter by content
xec inspect vars --filter "database"

# Case-insensitive filtering
xec inspect targets --filter "(?i)production"

# Complex pattern matching
xec inspect scripts --filter "\.(ts|js)$"
```

## Variable Resolution

The `--resolve` option expands variables and expressions:

```bash
# Show resolved variable values
xec inspect vars DATABASE_URL --resolve
```

**Before resolution:**
```
DATABASE_URL: postgresql://user:${secret:DB_PASSWORD}@${vars.DB_HOST}/myapp
```

**After resolution:**
```
DATABASE_URL: postgresql://user:***@localhost/myapp
```

**Features:**
- Environment variable expansion
- Secret reference indication (masked for security)
- Variable interpolation
- Expression evaluation
- Error reporting for invalid references

## Validation Mode

The `--validate` option performs comprehensive validation:

```bash
xec inspect --validate
```

**Validation checks:**
- **Configuration syntax**: YAML/JSON validity
- **Target connectivity**: Connection testing
- **Variable resolution**: Reference validation
- **Task definitions**: Parameter and step validation
- **Script existence**: File availability
- **Command loading**: Custom command validation

**Sample output:**
```
🔍 Running Configuration Validation...

Configuration Syntax:
  ✓ Valid

Target Connectivity:
  ✓ hosts.production - SSH connection successful
  ✗ containers.app - Container not running

Variable Resolution:
  ✓ All variables resolve correctly

Task Definitions:
  ✓ All tasks are valid
```

## System Information Categories

### Version Information

```bash
xec inspect system version
```

- Xec CLI and Core versions
- Node.js, V8, OpenSSL versions
- Package information

### Operating System

```bash
xec inspect system os
```

- Platform, architecture, release
- Hostname, uptime, load average
- OS-specific details (macOS, Linux, Windows)

### Hardware

```bash
xec inspect system hardware
```

- CPU count and model information
- Memory total, used, available
- Memory breakdown (macOS: wired, active, inactive)

### Environment

```bash
xec inspect system environment
```

- User information (username, UID, GID)
- Shell and environment variables
- Path configuration
- Xec-specific environment variables

### Network

```bash
xec inspect system network
```

- Network interfaces
- IP addresses (IPv4, IPv6)
- MAC addresses

### Development Tools

```bash
xec inspect system tools
```

- Installed development tools and versions
- Node.js, Bun, Deno availability
- Git, Docker, kubectl status
- Package managers (npm, yarn, pnpm)

### Project Information

```bash
xec inspect system project
```

- Working directory and project root
- Configuration file presence
- Package.json information
- Git repository status

## Performance Considerations

- **Large configurations**: Use filtering for better performance
- **Remote targets**: Validation mode may be slower due to connectivity tests
- **System information**: Hardware detection adds overhead
- **Cache operations**: Memory inspection is lightweight

## Integration with Other Commands

### Pipeline Usage

```bash
# Export task list for processing
xec inspect tasks --format json | jq '.[] | select(.data.hasSteps) | .name'

# Get target list for automation
xec inspect targets --format json | jq -r '.[].name'

# Validate before deployment
xec inspect --validate && xec run deploy
```

### Scripting

```javascript
// Get configuration in scripts
const { exec } = require('child_process');
const config = JSON.parse(
  await exec('xec inspect config --format json').stdout
);

// Check if target exists
const targets = JSON.parse(
  await exec('xec inspect targets --format json').stdout
);
const hasProduction = targets.some(t => t.name === 'hosts.production');
```

## Error Handling

The command provides helpful error messages:

- **Invalid type**: Lists available types
- **Resource not found**: Suggests similar names
- **Validation errors**: Shows detailed error context
- **Permission issues**: Indicates access problems
- **Network errors**: Reports connectivity issues

## Related Commands

- [config](config.md) - Manage configuration
- [run](run.md) - Execute tasks and scripts
- [new](new.md) - Create new resources

## Configuration

Inspection behavior can be configured:

```yaml
commands:
  inspect:
    defaultFormat: table
    showMetadata: true
    resolveSecrets: false
    validateConnectivity: false
    systemInfo:
      includeTools: true
      includeNetwork: false
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Resource not found
- `4` - Validation failed
- `5` - Permission error