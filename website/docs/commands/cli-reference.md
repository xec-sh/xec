---
title: CLI Reference
description: Complete reference for the Xec command-line interface
keywords: [cli, reference, options, commands, execution]
---

# CLI Reference {#cli-reference}

The command dispatcher is `apps/xec/src/main.ts`; built-in names and aliases are
in `apps/xec/src/utils/command-manifest.ts`. Project commands are loaded through
`apps/xec/src/utils/cli-command-manager.ts`, and the shared error mapping lives in
`packages/ops/src/utils/error-handler.ts`.

## Overview {#overview}

Complete reference for the Xec command-line interface, including global options, execution flow, and configuration.

## Synopsis {#synopsis}

```bash
xec [global-options] <command> [command-options] [arguments]
xec [global-options] <script-file> [script-arguments]
xec [global-options] <task-name> [task-parameters]
```

## Global Options {#global-options}

Place root options before the command word. Flags after that word belong to the
selected command; for example `xec -v secrets set KEY -v VALUE` uses the first
`-v` for verbosity and the second for the secret value.

### Output Control {#output-control}

- `-v, --verbose` - Enable verbose output with detailed logging
  - Sets log level to DEBUG
  - Shows stack traces for errors
  - Displays connection details
- `-q, --quiet` - Suppress all non-essential output
  - Only shows errors
  - Suppresses progress indicators
- `--no-color` - Disable colored output
  - Sets `process.env.NO_COLOR = '1'`
  - Useful for logs and CI environments

### Execution Control {#execution-control}

- `--cwd <path>` - Set current working directory before execution
  - Changes `process.cwd()` to specified path
  - Affects all relative path resolution
- `-e, --eval <code>` - Evaluate JavaScript/TypeScript code directly
  - Uses the same script runtime as `xec run --eval`
  - Has access to Xec core modules
- `--repl` - Start interactive REPL (Read-Eval-Print Loop)
  - Uses the same REPL as `xec run --repl`
  - Pre-imports Xec core modules

### Command Options {#command-options}

`--dry-run`, `-c/--config <path>` and `-o/--output <format>` belong to commands
that expose them, not the root parser. Put them after the command word and check
that command's `--help`. A dry run is command-specific; it is not a sandbox for
arbitrary project code.

```bash
xec on hosts.dev uptime --dry-run
xec config get targets --config .xec/preview.yaml
```

### Help and Information {#help-and-information}

- `-h, --help` - Display help information
  - Shows command-specific help when used with command
- `-V, --version` - Display version information
  - Shows package version from `package.json`

## Command Execution Flow {#command-execution-flow}

Xec loads the requested built-in and project command registry, then dispatches
special modes, scripts, explicit shell commands, configured tasks and registered
commands. A task shorthand cannot shadow a registered command.

### 1. Special Modes {#1-special-modes}

**Direct Code Evaluation:**
```bash
xec -e "console.log('Hello, World!')"
xec --eval 'await $`echo test`'
```

**Interactive REPL:**
```bash
xec --repl
# Starts interactive session with Xec core imported
```

### 2. Script File Execution {#2-script-file-execution}

If the first argument is a file path with recognized extensions:

```bash
xec script.js [args...]
xec script.ts [args...]
xec script.mjs [args...]
xec ./path/to/script [args...]
```

**Script Files:**
- `.js` - JavaScript files
- `.ts` - TypeScript files (compiled on-the-fly)
- `.mjs` - ES modules
Other filenames are dispatched as scripts when they resolve to an existing
file. Use `xec run <file>` to select script execution explicitly.

**Execution Environment:**
- `$` and the scripting utilities injected as globals
- Script arguments injected as `args` (and `argv`, shell convention)
- Current working directory preserved
- TypeScript compiled by the built-in loader — no `tsx`/`ts-node` needed

### 3. Task Execution {#3-task-execution}

If the first argument matches a configured task name:

```bash
xec deploy --env=production
xec build --parallel --output=dist
xec test --coverage
```

**Task Parameter Parsing:**
- `--param=value` format supported
- `--param value` format supported
- `-p key=value` and boolean switches are supported
- Unexpected positional arguments are rejected; task parameters are named

### 4. Built-in Commands {#4-built-in-commands}

Core commands shipped with Xec:

```bash
xec config get targets.hosts
xec copy src/ hosts.web:/app/
xec on "hosts.*" "uptime"
xec logs containers.app --follow
```

### 5. Dynamic Commands {#5-dynamic-commands}

Commands loaded from `.xec/commands/` directories:

```bash
xec deploy production
xec database:migrate
xec custom-command --option value
```

### 6. Direct Command Execution {#6-direct-command-execution}

For an executable or shell command, use the explicit `--` separator to avoid
collisions with task and command names:

```bash
xec -- echo "Hello from shell"
xec -- ls -la
xec -- npm install
```

## Configuration Precedence {#configuration-precedence}

Configuration values are resolved in this order (highest to lowest priority):

### 1. Command-line Options {#1-command-line-options}

Options passed directly to commands:

```bash
xec copy --timeout 30s --parallel src/ hosts.web:/app/
```

### 2. Environment Variables {#2-environment-variables}

Any variable with the `XEC_` prefix overrides configuration by path — the
rest of the name is lowercased and underscores become dots:

```bash
export XEC_VARS_APP_NAME=web   # sets vars.app_name
export XEC_COMMANDS_DEFAULTS_TIMEOUT=30s   # sets commands.defaults.timeout
```

A few names additionally have dedicated meaning:
- `XEC_CONFIG` - Path to an additional configuration file to load
- `XEC_PROFILE` - Configuration profile to activate
- `XEC_COMMANDS_PATH` - Additional command directories (colon-separated)
- `XEC_DEBUG` - Enable debug output (`true`/`1`)
- `NO_COLOR` / `FORCE_COLOR=0` - Disable colored output (standard variables)

### 3. Configuration File {#3-configuration-file}

Values from `.xec/config.yaml`:

```yaml
# Global defaults
timeout: 30s
parallel: true
verbose: false

# Command-specific defaults
commands:
  copy:
    parallel: true
    timeout: 60s
  on:
    timeout: 30s
    shell: /bin/bash
```

### 4. Built-in Defaults {#4-built-in-defaults}

Default values defined in Xec source code.

## Exit Codes {#exit-codes}

Xec uses standardized exit codes (`getExitCode` in
`packages/ops/src/utils/error-handler.ts`):

### Success {#success}
- `0` - Success, no errors

### Error Codes (mapped from error classes) {#error-codes-mapped-from-error-classes}
- `2` - `ValidationError` - Invalid arguments, options, or input
- `3` - `ConfigurationError` - Configuration file issues
- `4` - `ModuleError` - Module loading failures
- `5` - `TaskError` - Task execution failed
- `6` - `RecipeError` - Recipe execution failed
- `7` - `NetworkError` - Network-related errors
- `8` - `FileSystemError` - File operation errors
- `9` - `TimeoutError` - Operation timeout
- `10` - System `ENOENT` - File or command not found
- `11` - System `EACCES` - Permission denied
- `12` - System `ENOTDIR` / `13` - `EISDIR` - Path type mismatch
- `1` - Everything else, including a script that threw

A script that calls `process.exit(n)` keeps its own `n`, but bypasses awaited
cleanup. Prefer returning or throwing from the owning command.

### Cancellation {#cancellation}

The first `SIGINT` or `SIGTERM` aborts the command's execution scope and waits for
its `finally` blocks and owned resource disposal. Operations keep their own
deadlines; there is no extra global cleanup cutoff. Xec reports elapsed cleanup
time. A second termination signal forces exit and reports incomplete cleanup.
The final exit code preserves the first signal: `130` for `SIGINT`, `143` for
`SIGTERM`. Embedders can pass an `AbortSignal`; Xec scripts can read their owner
with `getExecutionSignal()` from `@xec-sh/core`.



### Usage Examples {#usage-examples}

```bash
# Check exit code in scripts
xec deploy production
if [ $? -eq 0 ]; then
  echo "Deployment successful"
else
  echo "Deployment failed with code $?"
fi

# Use with conditional execution
xec test && xec deploy production
xec build || exit 1
```

## Environment Variables {#environment-variables}

### Core Variables {#core-variables}

**XEC_CONFIG**
```bash
export XEC_CONFIG=/custom/path/to/config.yaml
xec config get targets  # Also loads the config file at that path
```

**XEC_PROFILE**
```bash
export XEC_PROFILE=production
xec inspect  # Runs with the production profile active
```

**XEC_COMMANDS_PATH**
```bash
export XEC_COMMANDS_PATH="/shared/commands:/team/commands"
xec --help  # Shows commands from additional directories
```

**XEC_DEBUG**
```bash
export XEC_DEBUG=true
xec any-command  # Shows detailed debug information
```

### Output Control {#output-control-1}

**NO_COLOR**
```bash
export NO_COLOR=1
xec inspect  # Outputs without colors (FORCE_COLOR=0 works too)
```

### Execution Environment {#execution-environment}

**XEC_TIMEOUT**
```bash
export XEC_TIMEOUT=5m
xec on hosts.slow "long-running-command"  # Uses 5-minute timeout
```

**XEC_PARALLEL**
```bash
export XEC_PARALLEL=false
xec on "hosts.*" "command"  # Executes sequentially
```

**XEC_SHELL**
```bash
export XEC_SHELL=/bin/zsh
xec on hosts.server "echo $SHELL"  # Uses zsh instead of default
```

## Advanced Usage {#advanced-usage}

### Combining Options {#combining-options}

```bash
# Multiple global options
xec --verbose --no-color --cwd /project deploy

# Mixed with environment variables
XEC_DEBUG=true xec --quiet copy src/ dest/

# Script with arguments
xec --cwd /project script.ts --input data.json --output results/
```

### Complex Command Lines {#complex-command-lines}

```bash
# Task with parameters and environment
XEC_VERBOSE=true xec deploy \
  --env=production \
  --targets=web1,web2 \
  --parallel \
  --timeout=10m

# Script evaluation with imports
xec -e "
import { $ } from '@xec-sh/core';
console.log(await $\`uptime\`.text());
"

# REPL with pre-loaded modules
XEC_DEBUG=true xec --repl
> const date = await $\`date\`.text()
> console.log(date)
```

### Pipeline Integration {#pipeline-integration}

**CI/CD Integration:**
```bash
#!/bin/bash
set -e

# Build and test
xec build --env=production
xec test --coverage --reporter=junit

# Deploy if tests pass
if [ $? -eq 0 ]; then
  xec deploy production --timeout=15m
else
  echo "Tests failed, skipping deployment"
  exit 1
fi
```

**Make Integration:**
```makefile
.PHONY: deploy test build

build:
	xec build --parallel

test: build
	xec test --coverage

deploy: test
	xec deploy production --confirm

clean:
	xec clean --force
```

**Docker Integration:**
```dockerfile
FROM node:18-alpine
COPY . /app
WORKDIR /app

# Install Xec globally
RUN npm install -g @xec-sh/cli

# Use Xec for build process
RUN xec build --env=production

CMD ["xec", "start", "--port=3000"]
```

## Performance Considerations {#performance-considerations}

### Command Loading {#command-loading}

Commands are loaded lazily for better startup performance:

```bash
# Fast - only loads required command
xec config get targets

# Slower - discovers all dynamic commands
xec --help
```

### Parallel Execution {#parallel-execution}

Many commands support parallel execution:

```bash
# Sequential (default for safety)
xec on "hosts.*" "command"

# Parallel (faster for independent operations)
xec on "hosts.*" "command" --parallel

# Control parallelism
export XEC_PARALLEL=true
xec copy files/ "hosts.*:/dest/"
```

### Caching {#caching}

Xec caches compiled scripts and module resolution:

```bash
# Clear cache if needed
rm -rf ~/.xec/cache/

# Custom cache location
export XEC_CACHE_DIR=/tmp/xec-cache
xec run script.ts
```

## Debugging and Troubleshooting {#debugging-and-troubleshooting}

### Debug Mode {#debug-mode}

Enable comprehensive debug output:

```bash
XEC_DEBUG=true xec command
```

**Debug Information Includes:**
- Command resolution process
- Configuration loading details
- Module import and compilation
- Network requests and responses
- Execution timing

### Verbose Output {#verbose-output}

Get detailed execution information:

```bash
xec --verbose command
# or
export XEC_VERBOSE=true
xec command
```

### Common Issues {#common-issues}

**Command Not Found:**
```bash
# Check command discovery
XEC_DEBUG=true xec --help

# Verify command file syntax
node -c .xec/commands/my-command.js

# Test command loading
XEC_DEBUG=true xec my-command --help
```

**Configuration Problems:**
```bash
# Validate configuration file
xec config validate

# Show effective configuration
xec config show --resolved

# Check configuration precedence
XEC_DEBUG=true xec config get key
```

**Script Execution Issues:**
```bash
# Test script syntax
node -c script.ts

# Run with debug output
XEC_DEBUG=true xec script.ts

# Check module resolution
XEC_DEBUG=true xec -e "import('missing-module')"
```

### Performance Profiling {#performance-profiling}

```bash
# Time command execution
time xec command

# Profile with debug output
XEC_DEBUG=true time xec command 2>&1 | grep -E "(timing|duration)"

# Memory usage (Linux/macOS)
/usr/bin/time -l xec command
```

## Performance Characteristics {#performance-characteristics}

**Based on Implementation Analysis:**

### Startup Performance {#startup-performance}
- **Command Resolution**: &lt;5ms (direct lookup in registry)
- **Config Loading**: 50-100ms (YAML parsing + schema validation)
- **Dynamic Command Discovery**: 10-50ms (filesystem scanning)
- **TypeScript Compilation**: 200-500ms (first run, cached after)

### Execution Performance {#execution-performance}
- **SSH Connection**: 100-500ms (new), &lt;10ms (pooled)
- **Docker Exec**: 50-100ms per command
- **Kubernetes Exec**: 200-500ms per pod
- **Parallel Execution**: Linear scaling with connection pooling

### Memory Usage {#memory-usage}
- **Base Process**: ~30MB (Node.js + Xec core)
- **Per Connection**: ~2MB (SSH), ~1MB (Docker)
- **Config Object**: 10-100KB depending on size
- **Script Compilation Cache**: ~5MB per script

## Integration Examples {#integration-examples}

### Shell Scripts {#shell-scripts}

```bash
#!/bin/bash
# deployment.sh

set -euo pipefail

# Configuration
ENVIRONMENT=${1:-staging}
TIMEOUT=${XEC_TIMEOUT:-10m}

# Pre-deployment checks
echo "Running pre-deployment checks..."
xec validate --env="$ENVIRONMENT" || {
  echo "Validation failed"
  exit 1
}

# Deploy
echo "Deploying to $ENVIRONMENT..."
xec deploy "$ENVIRONMENT" \
  --timeout="$TIMEOUT" \
  --parallel \
  --confirm || {
  echo "Deployment failed"
  exit 1
}

echo "Deployment completed successfully"
```

### Make Targets {#make-targets}

```makefile
# Makefile
.DEFAULT_GOAL := help

ENVIRONMENT ?= development
XEC_OPTS ?= --verbose

.PHONY: help build test deploy clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

build:  ## Build the application
	xec build $(XEC_OPTS) --env=$(ENVIRONMENT)

test: build  ## Run tests
	xec test $(XEC_OPTS) --coverage

deploy: test  ## Deploy to environment
	xec deploy $(ENVIRONMENT) $(XEC_OPTS) --confirm

clean:  ## Clean build artifacts
	xec clean $(XEC_OPTS) --force

watch:  ## Watch files and rebuild
	xec watch $(XEC_OPTS) --pattern="src/**/*.ts"
```

### GitHub Actions {#github-actions}

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Install Xec
      run: npm install -g @xec-sh/cli
      
    - name: Build application
      run: xec build --env=production
      env:
        XEC_VERBOSE: true
        
    - name: Run tests
      run: xec test --coverage --reporter=junit
      
    - name: Deploy to production
      run: xec deploy production --timeout=15m
      env:
        XEC_SSH_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
        XEC_TIMEOUT: 15m
```

The Xec CLI provides a powerful and flexible interface for command execution across multiple environments. Understanding the execution flow, configuration precedence, and available options enables you to build efficient automation workflows and integrate Xec effectively with your existing tools and processes.