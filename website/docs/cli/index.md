---
title: CLI Overview
description: Xec command-line interface documentation
keywords: [cli, command-line, interface, terminal, shell]
source_files:
  - apps/xec/src/main.ts
  - apps/xec/src/cli.ts
verification_date: 2025-08-03
---

# CLI Overview

## Implementation Reference

**Source Files:**
- `apps/xec/src/main.ts` - Main CLI entry point
- `apps/xec/src/cli.ts` - CLI initialization
- `apps/xec/src/utils/args-parser.ts` - Argument parsing
- `apps/xec/src/utils/error-handler.ts` - Error handling

## Overview

The Xec CLI provides a powerful command-line interface for executing commands across multiple environments, running scripts, and managing automation tasks.

## Installation

### Global Installation

```bash
# Using npm
npm install -g @xec-sh/cli

# Using pnpm
pnpm add -g @xec-sh/cli
```

### Local Installation

```bash
# Add to project
npm install --save-dev @xec-sh/cli

# Run with npx
npx xec --help
```

### Verify Installation

```bash
xec --version
xec --help
```

## CLI Architecture

### Command Resolution Flow

1. **Parse Arguments** - Extract command, options, and arguments
2. **Load Configuration** - Read `.xec/config.yaml` if present
3. **Resolve Command** - Check built-in → dynamic → script → task
4. **Execute** - Run the resolved command with context
5. **Handle Results** - Output results and handle errors

### Execution Modes

The CLI supports multiple execution modes:

- **Command Mode** - Execute built-in or custom commands
- **Script Mode** - Run JavaScript/TypeScript files
- **Task Mode** - Execute configured tasks
- **Eval Mode** - Evaluate inline code
- **REPL Mode** - Interactive shell

## Basic Usage

### Command Syntax

```bash
xec [global-options] <command> [command-options] [arguments]
```

### Global Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help |
| `--version` | `-V` | Show version |
| `--verbose` | `-v` | Enable verbose output |
| `--quiet` | `-q` | Suppress output |
| `--config <path>` | | Custom config file |
| `--cwd <path>` | | Set working directory |
| `--no-color` | | Disable colored output |
| `--dry-run` | | Preview without executing |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `XEC_CONFIG_PATH` | Config file path | `.xec/config.yaml` |
| `XEC_COMMANDS_PATH` | Command directories | `.xec/commands` |
| `XEC_DEBUG` | Debug mode | `false` |
| `XEC_NO_COLOR` | Disable colors | `false` |
| `XEC_TIMEOUT` | Default timeout | `30000` |

## Command Types

### Built-in Commands

Core commands included with Xec:

```bash
# Configuration management
xec config get <key>
xec config set <key> <value>

# File operations  
xec copy <source> <target>

# Remote execution
xec on <host> <command>
xec in <container> <command>

# Development
xec watch <pattern> <command>
xec run <script>
```

### Dynamic Commands

Commands loaded from `.xec/commands/`:

```bash
# Custom command
xec deploy production

# Namespaced command
xec db:migrate

# With options
xec custom --option value
```

### Script Execution

Direct script file execution:

```bash
# JavaScript
xec script.js

# TypeScript
xec script.ts

# With arguments
xec build.js --production --minify
```

### Task Execution

Run configured tasks:

```bash
# Simple task
xec build

# With parameters
xec deploy -p env=prod -p version=1.2.3

# Task chaining
xec test && xec deploy
```

## Interactive Features

### REPL Mode

Start an interactive session:

```bash
xec --repl
```

Features:
- Tab completion
- Command history
- Multi-line input
- Persistent context
- Pre-loaded modules

### Eval Mode

Execute inline code:

```bash
xec -e "console.log('Hello')"

xec --eval "
  const result = await $\`ls\`;
  console.log(result.stdout);
"
```

### Interactive Prompts

Commands can prompt for missing information:

```bash
xec new
# ? What would you like to create? (script/task/command)
# ? Name: my-script
# ? Language: TypeScript
```

## Output Formatting

### Standard Output

Normal command output:

```bash
xec echo "Hello"
# Hello
```

### Verbose Mode

Detailed execution information:

```bash
xec --verbose on server "uptime"
# [DEBUG] Loading configuration from .xec/config.yaml
# [DEBUG] Resolving target: server
# [DEBUG] Connecting to server.example.com:22
# [INFO] Executing: uptime
# 10:42:33 up 5 days, 3:21, 2 users
```

### Quiet Mode

Suppress non-essential output:

```bash
xec --quiet copy file.txt server:/tmp/
# (no output unless error)
```

### JSON Output

Some commands support JSON output:

```bash
xec config get --json
xec inspect target --json
```

## Error Handling

### Exit Codes

The CLI uses standardized exit codes:

| Code | Error Type | Description |
|------|------------|-------------|
| 0 | Success | Command completed |
| 1 | ValidationError | Invalid arguments |
| 2 | ConfigurationError | Config issues |
| 3 | TargetNotFoundError | Target not found |
| 4 | ConnectionError | Connection failed |
| 5 | ExecutionError | Command failed |

### Error Messages

Helpful error messages with context:

```bash
xec nonexistent
# Error: Command 'nonexistent' not found
# 
# Did you mean:
#   - new
#   - on
# 
# Run 'xec --help' to see available commands
```

### Debug Mode

Enable debug output for troubleshooting:

```bash
XEC_DEBUG=true xec command
# Shows detailed error stack traces
```

## Shell Integration

### Aliases

Create shell aliases for common commands:

```bash
# .bashrc or .zshrc
alias x='xec'
alias xr='xec run'
alias xo='xec on'
alias xi='xec in'
```

### Completions

Install shell completions:

```bash
# Bash
xec completion bash > ~/.xec-completion.bash
echo "source ~/.xec-completion.bash" >> ~/.bashrc

# Zsh
xec completion zsh > ~/.xec-completion.zsh
echo "source ~/.xec-completion.zsh" >> ~/.zshrc

# Fish
xec completion fish > ~/.config/fish/completions/xec.fish
```

### Path Setup

Add Xec to PATH:

```bash
# Add local node_modules/.bin
export PATH="./node_modules/.bin:$PATH"

# Add global npm bin
export PATH="$(npm bin -g):$PATH"
```

## Configuration

### Config File

The CLI reads configuration from `.xec/config.yaml`:

```yaml
# CLI-specific settings
cli:
  defaultCommand: help
  colorOutput: true
  verboseErrors: false
  
# Command defaults
commands:
  copy:
    parallel: true
  on:
    timeout: 30s
  run:
    typescript: true
```

### Command Aliases

Define command aliases:

```yaml
aliases:
  d: deploy
  t: test
  b: build
  dc: "docker compose"
```

### Custom Commands Path

Specify additional command directories:

```yaml
commandPaths:
  - .xec/commands
  - shared/commands
  - ~/.xec/global-commands
```

## Performance

### Startup Time

- **Cold start**: ~100ms
- **With cache**: ~50ms
- **Command resolution**: &lt;5ms
- **Config loading**: ~20ms

### Optimization Tips

1. **Use specific commands** instead of help
2. **Cache TypeScript compilation**
3. **Avoid large config files**
4. **Use connection pooling for SSH**

## Troubleshooting

### Common Issues

**Command not found:**
```bash
xec --help  # List available commands
which xec   # Check installation
```

**Permission denied:**
```bash
chmod +x script.js  # Make script executable
sudo xec command    # Run with elevated privileges
```

**Slow startup:**
```bash
# Clear cache
rm -rf ~/.xec/cache

# Check for large configs
xec config validate --verbose
```

### Debug Commands

```bash
# Check version and environment
xec version --verbose

# Validate configuration
xec config validate

# Test connectivity
xec on server "echo test"

# Check module loading
XEC_DEBUG=true xec run script.ts
```

## Best Practices

### Command Design

1. **Use descriptive names** for commands
2. **Provide helpful descriptions** in --help
3. **Validate arguments early**
4. **Use consistent option names**
5. **Provide examples in documentation**

### Script Organization

```
project/
├── .xec/
│   ├── config.yaml      # Configuration
│   ├── commands/        # Custom commands
│   └── scripts/         # Utility scripts
├── scripts/
│   ├── build.ts        # Build script
│   ├── deploy.ts       # Deploy script
│   └── test.ts         # Test script
└── package.json
```

### Security

1. **Never commit secrets** in config files
2. **Use environment variables** for sensitive data
3. **Validate input** in custom commands
4. **Use SSH keys** instead of passwords
5. **Limit command execution** scope

## Related Documentation

- [Commands Reference](../commands/overview.md) - All available commands
- [Configuration Guide](../configuration/overview.md) - Configuration details
- [Scripting Guide](../scripting/basics/first-script.md) - Writing scripts
- [API Reference](../api/index.md) - Programmatic usage