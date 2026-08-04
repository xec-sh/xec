---
title: Command System Overview
description: Comprehensive overview of Xec's command system architecture and capabilities
keywords: [commands, cli, architecture, built-in, custom, dynamic]
---

# Command System Overview

## Overview

Xec provides a powerful and extensible command system that supports both built-in commands and custom user-defined commands. This section covers the complete command reference for the Xec CLI.

The CLI entry point lives in `apps/xec/src/main.ts`. Built-in commands are the modules in `apps/xec/src/commands/`, each registering itself with the commander program. Dynamic commands are loaded by `loadDynamicCommands()` from `apps/xec/src/utils/cli-command-manager.ts`, and the `BaseCommand` class custom commands extend is defined in `apps/xec/src/utils/command-base.ts`.

## Command Types

Xec supports three types of commands:

### 1. Built-in Commands

Core commands that are included with Xec:

- **[config](built-in/config.md)** - Manage Xec configuration (aliases: `conf`, `cfg`)
- **[copy](built-in/copy.md)** - Copy files between targets (alias: `cp`)
- **docker** - Manage Docker containers, images, networks, and Compose via the fluent API (alias: `d`)
- **[forward](built-in/forward.md)** - Forward ports between local and remote systems (alias: `fwd`)
- **[in](built-in/in.md)** - Execute commands inside Docker containers or Kubernetes pods
- **[inspect](built-in/inspect.md)** - Inspect configuration and targets
- **[logs](built-in/logs.md)** - View and stream logs from various sources
- **[new](built-in/new.md)** - Create new Xec artifacts (scripts, configs, tasks)
- **[on](built-in/on.md)** - Execute commands on SSH hosts
- **[run](built-in/run.md)** - Run Xec scripts or tasks
- **[secrets](built-in/secrets.md)** - Manage secrets and credentials
- **[watch](built-in/watch.md)** - Watch files for changes and execute commands

### 2. Dynamic Commands

Commands loaded from `.xec/commands/` directory that extend Xec's functionality.

### 3. Script and Task Execution

Direct execution of JavaScript/TypeScript files as Xec scripts (`xec ./script.ts`), and execution of tasks defined in configuration by name (`xec deploy`).

## Command Structure

All Xec commands follow a consistent structure:

```bash
xec [global-options] <command> [command-options] [arguments]
```

### Global Options

Options that apply to all commands:

- `-v, --verbose` - Enable verbose output
- `-q, --quiet` - Suppress non-error output
- `--cwd <path>` - Set current working directory
- `--no-color` - Disable colored output (sets `NO_COLOR`)
- `-e, --eval <code>` - Evaluate code directly
- `--repl` - Start interactive REPL

Options such as `--dry-run`, `--profile`, or config-file selection are **per-subcommand**, not global — check `xec <command> --help` for what each command supports. The configuration file location is controlled by the `XEC_CONFIG` environment variable rather than a global flag.

## Command Resolution

When you run `xec <something>`, the CLI resolves it in the following order:

1. **`-e`/`--eval` and `--repl`** - Handled first, before any command lookup
2. **Script files** - If the first argument ends in `.js`, `.ts`, or `.mjs`, or is an existing file, it runs as a script
3. **Tasks** - If the argument is not a registered command but matches a task in configuration, the task runs (task parameters are passed as `--param=value` or `--param value`)
4. **Direct command execution** - Target-prefixed direct execution (e.g. running a command on a configured target)
5. **Built-in and dynamic commands** - Resolved by commander, including aliases
6. **Unknown command** - Prints an error with "did you mean" typo suggestions

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
3. Environment variables (`XEC_*`)
4. Command-line options (highest priority)

## Error Handling

Errors are handled by `handleError()` from `@xec-sh/ops`, which prints an actionable message and exits with a code based on the error type:

### Exit Codes

| Code | Error Type |
|------|------------|
| 0 | Success |
| 1 | Generic / unhandled error |
| 2 | ValidationError |
| 3 | ConfigurationError |
| 4 | ModuleError |
| 5 | TaskError |
| 6 | RecipeError |
| 7 | NetworkError |
| 8 | FileSystemError |
| 9 | TimeoutError |
| 10 | File not found (`ENOENT`) |
| 11 | Permission denied (`EACCES`) |
| 12 | Not a directory (`ENOTDIR`) |
| 13 | Is a directory (`EISDIR`) |

### Error Features
- Clear error messages with context
- Stack traces with `--verbose` flag
- Suggestions for common issues
- Colored output for error types

## Command Development

You can create custom commands by:

1. Creating a `.xec/commands/` directory
2. Adding JavaScript/TypeScript files that extend `BaseCommand` (from `apps/xec/src/utils/command-base.ts`)
3. Commands are automatically loaded via `loadDynamicCommands()`

**Implementation Details:**
- Commands must extend the `BaseCommand` class
- Must implement `execute(args: any[]): Promise<void>`
- Command metadata (name, description, options, aliases, examples) is passed to the `BaseCommand` constructor
- Throw specific error types for proper exit codes

See [Creating Custom Commands](custom/creating-commands.md) for detailed guide.

## Common Patterns

### Dry Run Mode

Several commands support `--dry-run` to preview actions:

```bash
xec copy --dry-run source.txt hosts.* /tmp/
```

### Parallel Execution

Commands that operate on multiple targets execute in parallel:

```bash
xec on "hosts.*" "uptime"  # Runs on all hosts in parallel
```

SSH connections are reused via the connection pool, and output streams are merged in real time.

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
