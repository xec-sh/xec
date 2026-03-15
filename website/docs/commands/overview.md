---
title: Command System Overview
description: Comprehensive overview of Xec's command system architecture and capabilities
keywords: [commands, cli, architecture, built-in, custom, dynamic]
source_files:
  - apps/xec/src/main.ts
  - apps/xec/src/commands/index.ts
  - apps/xec/src/commands/base-command.ts
  - apps/xec/src/utils/dynamic-commands.ts
key_functions:
  - main()
  - getCommands()
  - BaseCommand.execute()
  - loadDynamicCommands()
  - resolveCommand()
verification_date: 2025-08-03
---

# Command System Overview

## Implementation Reference

**Source Files:**
- `apps/xec/src/main.ts` - Main CLI entry point and command resolution
- `apps/xec/src/commands/index.ts` - Command registry and exports
- `apps/xec/src/commands/base-command.ts` - Base command class
- `apps/xec/src/utils/dynamic-commands.ts` - Dynamic command loading
- `apps/xec/src/utils/error-handler.ts` - Error handling and exit codes

**Key Functions:**
- `main()` - CLI entry point (lines 45-312)
- `getCommands()` - Returns command registry
- `BaseCommand.execute()` - Command execution interface
- `loadDynamicCommands()` - Loads commands from .xec/commands
- `handleError()` - Maps errors to exit codes

## Overview

Xec provides a powerful and extensible command system that supports both built-in commands and custom user-defined commands. This section covers the complete command reference for the Xec CLI.

## Command Types

Xec supports three types of commands:

### 1. Built-in Commands

Core commands that are included with Xec:

- **[copy](built-in/copy.md)** - Copy files between targets
- **[forward](built-in/forward.md)** - Forward ports between local and remote systems
- **[in](built-in/in.md)** - Execute commands inside Docker containers or Kubernetes pods
- **[on](built-in/on.md)** - Execute commands on SSH hosts
- **[logs](built-in/logs.md)** - View and stream logs from various sources
- **[new](built-in/new.md)** - Create new Xec artifacts (scripts, configs, tasks)
- **[watch](built-in/watch.md)** - Watch files for changes and execute commands
- **[run](built-in/run.md)** - Run Xec scripts or tasks
- **[secrets](built-in/secrets.md)** - Manage secrets and credentials
- **[inspect](built-in/inspect.md)** - Inspect configuration and targets
- **[config](built-in/config.md)** - Manage Xec configuration

### 2. Dynamic Commands

Commands loaded from `.xec/commands/` directory that extend Xec's functionality.

### 3. Script Execution

Direct execution of JavaScript/TypeScript files as Xec scripts.

## Command Structure

All Xec commands follow a consistent structure:

```bash
xec [global-options] <command> [command-options] [arguments]
```

### Global Options

Options that apply to all commands (defined in `apps/xec/src/main.ts:71-97`):

- `-v, --verbose` - Enable verbose output (increases log level)
- `-q, --quiet` - Suppress non-error output
- `--cwd <path>` - Set current working directory (changes process.cwd())
- `--no-color` - Disable colored output (sets NO_COLOR env var)
- `-e, --eval <code>` - Evaluate code directly (ScriptRunner.evalCode())
- `--repl` - Start interactive REPL (ScriptRunner.startRepl())
- `--dry-run` - Preview actions without executing
- `--config <path>` - Custom config file path (default: .xec/config.yaml)

## Command Resolution

When you run a command, Xec resolves it in the following order (implemented in `apps/xec/src/main.ts:175-240`):

1. **Built-in commands** - Core commands from registry (`getCommands()`)
2. **Command aliases** - Mapped in command registry (e.g., 'cp' → 'copy')
3. **Dynamic commands** - Loaded from `.xec/commands/` directory
4. **Script files** - JavaScript/TypeScript files with `.js`, `.ts`, `.mjs`, `.mts` extensions
5. **Task execution** - Tasks defined in configuration (`config.tasks`)
6. **Default to 'run' command** - If no match found

## Target Selection

Many commands operate on targets (local, SSH, Docker, Kubernetes). The target selection pattern is:

```bash
xec <command> <target-pattern> [options]
```

Target patterns can be:
- `local` - Local machine
- `hosts.<name>` - SSH host
- `containers.<name>` - Docker container
- `pods.<name>` - Kubernetes pod
- `hosts.*` - All SSH hosts (wildcard)
- `{hosts.web1,hosts.web2}` - Multiple targets (brace expansion)

## Configuration Integration

Commands respect configuration from:

1. `.xec/config.yaml` - Project configuration
2. Command-specific defaults in configuration
3. Environment variables
4. Command-line options (highest priority)

## Error Handling

All commands use standardized error handling (`apps/xec/src/utils/error-handler.ts`):

### Exit Codes

| Code | Error Type | Description |
|------|------------|-------------|
| 0 | Success | Command completed successfully |
| 1 | ValidationError | Invalid arguments or options |
| 2 | ConfigurationError | Configuration file issues |
| 3 | TargetNotFoundError | Target doesn't exist |
| 4 | ConnectionError | Connection failures |
| 5 | ExecutionError | Command execution failed |
| 6 | AuthenticationError | Authentication failed |
| 7 | FileSystemError | File operation failed |
| 8 | DockerError | Docker-specific errors |
| 9 | KubernetesError | Kubernetes-specific errors |
| 10 | TimeoutError | Operation timed out |
| 11 | PermissionError | Permission denied |
| 12 | DependencyError | Missing dependencies |
| 13 | NetworkError | Network-related errors |
| 1 | Unknown | Unhandled errors |

### Error Features
- Clear error messages with context
- Stack traces with `--verbose` flag
- Suggestions for common issues
- Colored output for error types

## Command Development

You can create custom commands by:

1. Creating a `.xec/commands/` directory
2. Adding JavaScript/TypeScript files that extend `BaseCommand`
3. Commands are automatically loaded via `loadDynamicCommands()`

**Implementation Details:**
- Commands must extend `BaseCommand` class
- Must implement `execute(args: string[], flags: Record<string, any>): Promise<void>`
- Access configuration via `this.config`
- Use `this.parseTargets()` for target resolution
- Throw specific error types for proper exit codes

See [Creating Custom Commands](custom/creating-commands.md) for detailed guide.

## Common Patterns

### Dry Run Mode

Most commands support `--dry-run` to preview actions:

```bash
xec copy --dry-run source.txt hosts.* /tmp/
```

### Parallel Execution

Commands that operate on multiple targets use parallel execution (via `Promise.all()` in command implementations):

```bash
xec on "hosts.*" "uptime"  # Runs on all hosts in parallel
```

**Performance Characteristics:**
- Default parallelism: Unlimited (all targets simultaneously)
- Connection pooling: SSH connections reused via pool
- Stream multiplexing: Output streams merged in real-time

### Streaming Output

Commands that produce continuous output support streaming:

```bash
xec logs containers.app --follow
```

### Interactive Mode

Some commands provide interactive prompts when options are missing:

```bash
xec new  # Prompts for artifact type
```

## Next Steps

- [Built-in Commands Reference](built-in/run.md) - Detailed documentation for each command
- [Custom Commands](custom/creating-commands.md) - Create your own commands
- [CLI Reference](cli-reference.md) - Complete CLI reference