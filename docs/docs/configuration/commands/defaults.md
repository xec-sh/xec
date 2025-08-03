---
title: Command Defaults
description: Configuring default options for Xec built-in commands
---

# Command Defaults

Xec allows you to configure default options for built-in commands through the `commands` section of your configuration. This enables consistent behavior across your project without repeatedly specifying the same options.

## Overview

Command defaults apply to Xec's built-in commands:
- `xec in` - Execute in single target
- `xec on` - Execute on multiple targets
- `xec copy` - Copy files to/from targets
- `xec forward` - Port forwarding
- `xec watch` - Watch and execute
- `xec logs` - View logs
- `xec run` - Run tasks

## Configuration Structure

```yaml
commands:
  # Command name
  in:
    # Default options
    timeout: 30000
    shell: /bin/bash
  
  on:
    parallel: true
    failFast: false
  
  copy:
    compress: true
    progress: true
  
  # Add any command
  logs:
    tail: 100
    follow: true
```

## Command-Specific Defaults

### `in` Command Defaults

Execute commands in a single target:

```yaml
commands:
  in:
    # Execution timeout in milliseconds
    defaultTimeout: 30000
    
    # Shell to use
    shell: /bin/bash
    
    # Output encoding
    encoding: utf8
    
    # Working directory
    workdir: /app
    
    # Environment variables
    env:
      NODE_ENV: production
    
    # Throw on non-zero exit
    throwOnNonZeroExit: true
    
    # Max output buffer size
    maxBuffer: 10485760
```

Usage:
```bash
# Uses configured defaults
xec in hosts.production "npm run build"

# Override specific default
xec in hosts.production --timeout 60000 "long-task"
```

### `on` Command Defaults

Execute on multiple targets:

```yaml
commands:
  on:
    # Run in parallel
    parallel: true
    
    # Maximum concurrent executions
    maxConcurrent: 5
    
    # Stop on first failure
    failFast: false
    
    # Default timeout per target
    timeout: 30000
    
    # Output format
    output: prefixed  # prefixed, grouped, raw
    
    # Show progress
    progress: true
```

Usage:
```bash
# Uses parallel execution by default
xec on "hosts.*" "uptime"

# Override to sequential
xec on --no-parallel "hosts.*" "deploy"
```

### `copy` Command Defaults

File transfer settings:

```yaml
commands:
  copy:
    # Enable compression
    compress: true
    
    # Show progress bar
    progress: true
    
    # Preserve file modes
    preserveMode: true
    
    # Preserve timestamps
    preserveTimes: true
    
    # Follow symlinks
    followSymlinks: false
    
    # Recursive copy
    recursive: true
    
    # Exclude patterns
    exclude:
      - "*.log"
      - "node_modules"
      - ".git"
    
    # Chunk size for transfers
    chunkSize: 65536
    
    # Concurrent transfers
    concurrency: 3
```

Usage:
```bash
# Uses compression and progress by default
xec copy ./dist hosts.production:/var/www

# Override compression
xec copy --no-compress large-file.zip hosts.backup:/backup/
```

### `forward` Command Defaults

Port forwarding configuration:

```yaml
commands:
  forward:
    # Dynamic port allocation
    dynamic: true
    
    # Privileged port binding (requires root)
    privileged: false
    
    # Bind address
    bindAddress: "127.0.0.1"
    
    # Keep alive interval
    keepAlive: 30000
    
    # Auto-reconnect
    autoReconnect: true
    
    # Reconnect delay
    reconnectDelay: 5000
    
    # Maximum reconnect attempts
    maxReconnectAttempts: 10
```

Usage:
```bash
# Uses dynamic port allocation
xec forward hosts.database 5432

# Override bind address
xec forward --bind 0.0.0.0 hosts.web 8080
```

### `watch` Command Defaults

File watching settings:

```yaml
commands:
  watch:
    # Poll interval in seconds
    interval: 2
    
    # Clear screen before each run
    clear: true
    
    # Run command initially
    initialRun: true
    
    # Debounce delay in milliseconds
    debounce: 500
    
    # File patterns to watch
    patterns:
      - "**/*.js"
      - "**/*.ts"
      - "**/*.json"
    
    # Ignore patterns
    ignore:
      - "**/node_modules/**"
      - "**/.git/**"
      - "**/dist/**"
    
    # Use polling (for network drives)
    usePolling: false
```

Usage:
```bash
# Uses configured watch settings
xec watch "src/**/*.js" "npm test"

# Override interval
xec watch --interval 5 "**/*.py" "python test.py"
```

### `logs` Command Defaults

Log viewing configuration:

```yaml
commands:
  logs:
    # Number of lines to show
    tail: 100
    
    # Follow log output
    follow: false
    
    # Show timestamps
    timestamps: true
    
    # Add target prefix
    prefix: true
    
    # Colorize output
    color: true
    
    # Log level filter
    level: info  # debug, info, warn, error
    
    # Pattern matching
    grep: null
    
    # Output format
    format: text  # text, json, csv
```

Usage:
```bash
# Shows last 100 lines with timestamps
xec logs hosts.production

# Override to follow logs
xec logs --follow containers.app
```

### `run` Command Defaults

Task execution defaults:

```yaml
commands:
  run:
    # Dry run mode
    dryRun: false
    
    # Continue on error
    continueOnError: false
    
    # Show task output
    verbose: false
    
    # Task timeout
    timeout: 3600000  # 1 hour
    
    # Parallel task execution
    parallel: false
    
    # Environment
    env:
      TASK_ENV: production
```

Usage:
```bash
# Uses configured defaults
xec run deploy

# Override timeout
xec run --timeout 7200000 long-task
```

## Global Command Options

Some options apply to all commands:

```yaml
commands:
  # Global defaults
  $defaults:
    # Output format
    output: auto  # auto, json, yaml, table
    
    # Quiet mode
    quiet: false
    
    # Verbose mode
    verbose: false
    
    # No color output
    noColor: false
    
    # Debug mode
    debug: false
```

## Profile-Specific Defaults

Override command defaults per profile:

```yaml
profiles:
  development:
    commands:
      in:
        defaultTimeout: 60000  # Longer timeout for dev
      logs:
        follow: true  # Always follow in dev
        tail: 500
  
  production:
    commands:
      in:
        defaultTimeout: 30000
        throwOnNonZeroExit: true
      copy:
        compress: true
        progress: false  # No progress in CI
```

## Environment-Specific Defaults

```yaml
commands:
  in:
    # Use environment variable
    defaultTimeout: ${env.COMMAND_TIMEOUT:-30000}
    shell: ${env.SHELL:-/bin/bash}
  
  logs:
    tail: ${env.LOG_LINES:-100}
    follow: ${env.LOG_FOLLOW:-false}
```

## Command Aliases

Create command shortcuts:

```yaml
commands:
  # Define aliases
  $aliases:
    deploy: "run deploy --profile production"
    test: "run test --verbose"
    sync: "copy --compress --progress"
    tunnel: "forward --dynamic"
    monitor: "logs --follow --tail 200"
```

Usage:
```bash
# Use alias
xec deploy  # Expands to: xec run deploy --profile production
```

## Conditional Defaults

Set defaults based on conditions:

```yaml
commands:
  copy:
    # Conditional compression
    compress: ${vars.environment === 'production'}
    
    # Dynamic concurrency
    concurrency: ${vars.environment === 'production' ? 10 : 3}
```

## Command Hooks

Execute commands before/after built-in commands:

```yaml
commands:
  in:
    hooks:
      before:
        - command: echo "Executing on ${target}"
      after:
        - command: echo "Completed with exit code $?"
  
  copy:
    hooks:
      before:
        - command: check-disk-space
      after:
        - command: verify-transfer
```

## Validation

Xec validates command configurations:

```yaml
commands:
  in:
    defaultTimeout: 30000  # Valid: number
    # defaultTimeout: "30s"  # Invalid: must be number
    
  logs:
    tail: 100  # Valid: positive number
    # tail: -1  # Invalid: must be positive
```

## Best Practices

### 1. Set Sensible Defaults

```yaml
commands:
  in:
    defaultTimeout: 30000  # 30 seconds is reasonable
    throwOnNonZeroExit: true  # Fail fast
  
  copy:
    compress: true  # Save bandwidth
    progress: true  # User feedback
```

### 2. Environment-Aware Defaults

```yaml
profiles:
  ci:
    commands:
      # CI-specific settings
      on:
        progress: false  # No interactive output
        output: raw      # Machine-readable
      logs:
        color: false     # No ANSI colors
```

### 3. Document Custom Defaults

```yaml
commands:
  in:
    # Extended timeout for slow network
    defaultTimeout: 60000  # Note: Increased due to VPN latency
    
  copy:
    # Large chunk size for fast network
    chunkSize: 131072  # 128KB chunks
```

### 4. Use Profiles for Variations

```yaml
# Base defaults
commands:
  logs:
    tail: 100

# Profile overrides
profiles:
  debug:
    commands:
      logs:
        tail: 1000  # More context when debugging
        level: debug
```

### 5. Keep Defaults Minimal

```yaml
# Good - only essential defaults
commands:
  in:
    defaultTimeout: 30000

# Avoid - too many defaults
commands:
  in:
    defaultTimeout: 30000
    shell: /bin/bash
    encoding: utf8
    maxBuffer: 10485760
    # ... many more
```

## Examples

### Development Configuration

```yaml
commands:
  in:
    defaultTimeout: 60000  # More time for debugging
    shell: /bin/bash
  
  logs:
    follow: true  # Always follow logs
    tail: 500     # More context
    timestamps: true
    color: true
  
  watch:
    interval: 1   # Faster feedback
    clear: true
    initialRun: true
```

### Production Configuration

```yaml
commands:
  in:
    defaultTimeout: 30000
    throwOnNonZeroExit: true
  
  on:
    parallel: true
    maxConcurrent: 10
    failFast: true
  
  copy:
    compress: true
    preserveMode: true
    preserveTimes: true
  
  logs:
    tail: 100
    format: json  # Structured logging
```

### CI/CD Configuration

```yaml
commands:
  # CI-optimized defaults
  in:
    defaultTimeout: 120000  # Longer for builds
    throwOnNonZeroExit: true
  
  on:
    output: raw
    progress: false
  
  logs:
    color: false
    format: text
    timestamps: true
  
  run:
    verbose: true  # Full output in CI
```

## Troubleshooting

### Defaults Not Applied

```bash
# Check loaded configuration
xec config show --commands

# Verify specific command defaults
xec config get commands.in

# Test with debug output
xec --debug in hosts.production "echo test"
```

### Override Not Working

```bash
# Command-line overrides always win
xec in --timeout 5000 hosts.production "echo test"

# Check precedence
# 1. Command-line flags
# 2. Environment variables
# 3. Profile commands
# 4. Global commands
# 5. Built-in defaults
```

### Invalid Configuration

```yaml
# Check for type errors
commands:
  in:
    defaultTimeout: "30s"  # Error: must be number
    # Fix:
    defaultTimeout: 30000
```

## Next Steps

- [Command Reference](../../commands/overview.md) - Individual command docs
- [Configuration Overview](../overview.md) - Configuration basics
- [Best Practices](../advanced/best-practices.md) - Configuration patterns

## See Also

- [in Command](../../commands/built-in/in.md) - Single target execution
- [on Command](../../commands/built-in/on.md) - Multiple target execution
- [copy Command](../../commands/built-in/copy.md) - File transfers
- [logs Command](../../commands/built-in/logs.md) - Log viewing