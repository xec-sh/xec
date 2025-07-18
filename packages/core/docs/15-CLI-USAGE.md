# 15. CLI Usage Guide

## Overview

Xec CLI provides a powerful command-line interface for executing tasks, managing recipes, and interacting with infrastructure. The CLI supports interactive mode, autocompletion, and advanced debugging capabilities.

## Installation

### Global Installation

```bash
npm install -g @xec-js/cli
```

### Local Installation in Project

```bash
npm install --save-dev @xec-js/cli
```

### Verify Installation

```bash
xec --version
# Output: Xec CLI v2.0.0

xec --help
# Shows list of all available commands
```

## Basic Commands

### Project Initialization

```bash
# Create new Xec project
xec init

# With template
xec init --template kubernetes

# Interactive mode
xec init --interactive
```

### Task Execution

```bash
# Execute single task
xec run deploy

# Execute multiple tasks
xec run build test deploy

# With parameters
xec run deploy --version=2.0.0 --environment=production

# From specific file
xec run deploy --file=./tasks/deployment.ts
```

### Recipe Execution

```bash
# Execute recipe
xec recipe execute full-deployment

# With variables
xec recipe execute full-deployment \
  --var version=2.0.0 \
  --var environment=staging

# Dry run
xec recipe execute full-deployment --dry-run

# Only specific phases
xec recipe execute full-deployment --phases=prepare,deploy
```

## Variable and Secret Management

### Environment Variables

```bash
# Set variables
xec var set API_URL https://api.example.com
xec var set ENVIRONMENT production

# Get variable
xec var get API_URL

# List all variables
xec var list

# Delete variable
xec var delete OLD_VAR

# Import from file
xec var import --file=.env.production
```

### Secret Management

```bash
# Add secret (interactively)
xec secret add DATABASE_PASSWORD

# Add from file
xec secret add SSL_CERT --file=./cert.pem

# List secrets (without values)
xec secret list

# Update secret
xec secret update DATABASE_PASSWORD

# Delete secret
xec secret delete OLD_SECRET

# Export to encrypted file
xec secret export --output=secrets.enc --key=$ENCRYPTION_KEY
```

## Module Management

### Installing Modules

```bash
# Install module from npm
xec module install @xec-js/stdlib-nginx

# Install specific version
xec module install @xec-js/stdlib-nginx@1.2.0

# Install from git
xec module install git+https://github.com/user/xec-module.git

# Install local module
xec module install ./modules/custom-module
```

### Module Management

```bash
# List installed modules
xec module list

# Module information
xec module info @xec-js/stdlib-nginx

# Update module
xec module update @xec-js/stdlib-nginx

# Uninstall module
xec module uninstall @xec-js/stdlib-nginx

# Check for updates
xec module outdated
```

## Interactive Mode

### Launching Interactive Shell

```bash
# Start REPL
xec repl

# With preloaded context
xec repl --context=production
```

### REPL Commands

```javascript
// In interactive mode
> await sh`ls -la`
total 64
drwxr-xr-x  10 user  staff   320 Jan 15 10:00 .
drwxr-xr-x  20 user  staff   640 Jan 15 09:00 ..

> const result = await task('deploy').run()
Task 'deploy' completed successfully

> setState('version', '2.0.0')
State updated: version = 2.0.0

> getState('version')
'2.0.0'

> .help
Available commands:
  .help     Show help
  .exit     Exit REPL
  .save     Save session
  .load     Load session
  .clear    Clear screen
  .history  Show command history
```

## Debugging and Logging

### Log Levels

```bash
# Set log level
xec run deploy --log-level=debug

# Available levels: error, warn, info, debug, trace
xec run deploy --log-level=trace

# Quiet mode (errors only)
xec run deploy --quiet

# Verbose mode
xec run deploy --verbose
xec run deploy -vvv  # Maximum detail
```

### Execution Debugging

```bash
# Enable debug mode
xec run deploy --debug

# With breakpoints
xec debug deploy --breakpoint=prepare-phase

# Step-by-step execution
xec debug deploy --step

# Performance profiling
xec run deploy --profile
```

### Output Formats

```bash
# JSON output
xec run deploy --output=json

# YAML output
xec run deploy --output=yaml

# Table (default)
xec run deploy --output=table

# Raw output
xec run deploy --output=raw

# Save output to file
xec run deploy --output=json > result.json
```

## State Management

### Viewing State

```bash
# Show all state
xec state show

# Specific key
xec state get deployment.version

# With filter
xec state show --filter="deployment.*"

# JSON format
xec state show --format=json
```

### State Manipulation

```bash
# Set value
xec state set deployment.version 2.0.0

# Delete key
xec state delete temp.data

# Clear all state
xec state clear --confirm

# Export state
xec state export --file=state-backup.json

# Import state
xec state import --file=state-backup.json
```

## History and Audit

### Viewing History

```bash
# Execution history
xec history

# Last N records
xec history --limit=10

# For specific period
xec history --since="2024-01-01" --until="2024-01-31"

# Filter by type
xec history --type=recipe

# Details of specific execution
xec history show abc123def456
```

### Event Log

```bash
# View events
xec events

# Follow events in real-time
xec events --follow

# Filter by event type
xec events --type=deployment.*

# Export events
xec events export --format=jsonl --output=events.jsonl
```

## CLI Configuration

### Configuration File

```bash
# Show current configuration
xec config show

# Set parameter
xec config set defaultEnvironment production
xec config set cli.colors true
xec config set cli.interactive true

# Get parameter
xec config get defaultEnvironment

# Reset configuration
xec config reset
```

### Profiles

```bash
# Create profile
xec profile create staging \
  --var environment=staging \
  --var region=us-west-2

# Use profile
xec run deploy --profile=staging

# List profiles
xec profile list

# Delete profile
xec profile delete old-profile
```

## Advanced Features

### Parallel Execution

```bash
# Execute tasks in parallel
xec run build,test,lint --parallel

# With concurrency limit
xec run task1,task2,task3,task4 --parallel --max-parallel=2

# Fail-fast mode
xec run build,test,deploy --parallel --fail-fast
```

### Watch Mode

```bash
# Watch for changes and restart
xec watch deploy --paths="src/**/*.ts"

# With debounce
xec watch test --debounce=1000

# Ignore paths
xec watch build --ignore="node_modules,dist"
```

### Scheduling

```bash
# Schedule execution
xec schedule add daily-backup \
  --task=backup \
  --cron="0 2 * * *" \
  --timezone="UTC"

# List scheduled tasks
xec schedule list

# Remove scheduled task
xec schedule remove daily-backup

# Execute immediately
xec schedule run daily-backup
```

## External System Integration

### Docker

```bash
# Execute in Docker container
xec run deploy --docker --image=node:18

# With volume mounting
xec run build \
  --docker \
  --volume="$(pwd):/app" \
  --workdir=/app
```

### SSH Execution

```bash
# Execute on remote server
xec run deploy --ssh=user@server.com

# With key
xec run deploy \
  --ssh=user@server.com \
  --ssh-key=~/.ssh/id_rsa

# On multiple servers
xec run update \
  --ssh=user@server1.com,user@server2.com \
  --parallel
```

### Kubernetes

```bash
# Execute in Kubernetes pod
xec run migrate \
  --k8s \
  --namespace=production \
  --pod=api-pod

# Create Job
xec run batch-process \
  --k8s-job \
  --namespace=default \
  --image=myapp:latest
```

## CLI Plugins

### Installing Plugins

```bash
# Install plugin
xec plugin install @xec-js/cli-plugin-aws

# From npm with specific version
xec plugin install @xec-js/cli-plugin-terraform@2.0.0

# Local plugin
xec plugin install ./plugins/my-plugin
```

### Plugin Management

```bash
# List plugins
xec plugin list

# Plugin information
xec plugin info @xec-js/cli-plugin-aws

# Update plugin
xec plugin update @xec-js/cli-plugin-aws

# Uninstall plugin
xec plugin uninstall @xec-js/cli-plugin-aws
```

## Shell Completion

### Bash

```bash
# Generate autocompletion script
xec completion bash > /etc/bash_completion.d/xec

# Or for current session
source <(xec completion bash)
```

### Zsh

```bash
# Generate for zsh
xec completion zsh > "${fpath[1]}/_xec"

# Reload shell
exec zsh
```

### Fish

```bash
# Generate for fish
xec completion fish > ~/.config/fish/completions/xec.fish
```

## Troubleshooting

### Diagnostics

```bash
# Environment check
xec doctor

# Verbose diagnostics
xec doctor --verbose

# Check specific component
xec doctor --check=node,npm,permissions
```

### Logs

```bash
# Show CLI logs
xec logs

# Follow logs
xec logs --follow

# Clear logs
xec logs clear
```

### Reset

```bash
# Clear cache
xec cache clear

# Full reset (careful!)
xec reset --all --confirm
```

## Usage Examples

### Typical Deployment Workflow

```bash
# 1. Environment check
xec doctor

# 2. Set variables
xec var set VERSION 2.0.0
xec secret add DEPLOY_KEY

# 3. Dry run
xec recipe execute production-deploy --dry-run

# 4. Real execution with logging
xec recipe execute production-deploy \
  --log-level=info \
  --output=json \
  > deploy-$(date +%Y%m%d-%H%M%S).json

# 5. Check result
xec state get deployment.status
```

### CI/CD Integration

```bash
#!/bin/bash
# deploy.sh

set -e

# Environment setup
export XEC_PROFILE=production
export XEC_LOG_LEVEL=info

# Execute deployment
xec recipe execute deploy \
  --var version=$CI_COMMIT_SHA \
  --var branch=$CI_COMMIT_BRANCH \
  --fail-fast \
  --output=json

# Check status
if [ $(xec state get deployment.status) != "success" ]; then
  echo "Deployment failed"
  exit 1
fi
```

## Best Practices

1. **Use profiles** for different environments
2. **Version recipes** together with code
3. **Log execution** in production
4. **Use dry-run** before critical operations
5. **Automate through scripts** for repeatability
6. **Configure autocompletion** for productivity
7. **Regularly update** CLI and modules

## Conclusion

Xec CLI provides a powerful and flexible interface for infrastructure management. Proper CLI usage enables efficient automation of operations, debugging of issues, and integration with existing tools and processes.