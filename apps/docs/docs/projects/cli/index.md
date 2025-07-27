---
sidebar_position: 1
---

# Xec CLI Reference

The Xec Command Line Interface (CLI) is your primary tool for interacting with the Xec platform. It provides commands for executing scripts, managing configurations, and automating multi-environment operations.

## Overview

The Xec CLI (`@xec-sh/cli`) offers:
- Script execution across multiple environments
- Configuration management
- Built-in commands for common operations
- Integration with Docker and Kubernetes
- File operations and transfers
- SSH connection management
- Real-time monitoring and watching

## Installation

```bash
# Global installation (recommended)
npm install -g @xec-sh/cli

# Or with yarn
yarn global add @xec-sh/cli

# Verify installation
xec --version
```

## Basic Usage

```bash
# Execute a script
xec script.js

# Execute inline code
xec eval 'await $`echo "Hello from Xec!"`'

# Run a specific command
xec exec 'ls -la'

# Get help
xec --help
```

## Core Concepts

### Script Execution

Xec can execute JavaScript/TypeScript files with full access to the Xec API:

```bash
# Execute a local script
xec ./deploy.js

# Execute with arguments
xec ./script.js --env=production --dry-run

# Execute with Node.js options
xec --node-options="--max-old-space-size=4096" ./heavy-script.js
```

### Environment Detection

Xec automatically detects and configures the execution environment:
- Local machine execution
- SSH remote execution
- Docker container execution
- Kubernetes pod execution

### Configuration Management

Xec uses a hierarchical configuration system:
1. Default configuration
2. Global configuration (`~/.xec/config.json`)
3. Project configuration (`.xec/config.json`)
4. Environment variables
5. Command-line arguments

## Global Options

Options available for all commands:

| Option | Description | Default |
|--------|-------------|---------|
| `--help, -h` | Show help | - |
| `--version, -v` | Show version | - |
| `--config, -c` | Path to config file | Auto-detected |
| `--verbose` | Enable verbose output | false |
| `--debug` | Enable debug output | false |
| `--quiet, -q` | Suppress output | false |
| `--no-color` | Disable colored output | false |
| `--node-options` | Node.js runtime options | - |

## Environment Variables

Xec recognizes these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `XEC_CONFIG` | Path to config file | `/path/to/config.json` |
| `XEC_SHELL` | Default shell | `/bin/bash` |
| `XEC_TIMEOUT` | Default timeout (ms) | `60000` |
| `XEC_DEBUG` | Enable debug mode | `true` |
| `XEC_NO_COLOR` | Disable colors | `true` |
| `XEC_SSH_KEY` | Default SSH key path | `~/.ssh/id_rsa` |

## Configuration File

Example `.xec/config.json`:

```json
{
  "defaultShell": "/bin/bash",
  "timeout": 300000,
  "retries": 3,
  "environments": {
    "local": {
      "shell": "/bin/zsh",
      "env": {
        "NODE_ENV": "development"
      }
    },
    "production": {
      "ssh": {
        "host": "prod.example.com",
        "username": "deploy",
        "privateKey": "~/.ssh/id_rsa_prod"
      },
      "env": {
        "NODE_ENV": "production"
      }
    }
  },
  "docker": {
    "defaultImage": "node:18",
    "registry": "docker.io"
  },
  "kubernetes": {
    "defaultNamespace": "default",
    "context": "production"
  }
}
```

## Command Categories

### Execution Commands
- `exec` - Execute shell commands
- `run` - Run scripts or recipes
- `eval` - Evaluate JavaScript code
- `watch` - Watch and execute on changes

### Environment Commands
- `ssh` - SSH operations
- `docker` - Docker operations
- `k8s` - Kubernetes operations
- `env` - Environment management

### File Operations
- `copy` - Copy files between environments
- `list` - List files and directories

### Configuration Commands
- `config` - Manage configuration
- `init` - Initialize new project

### Utility Commands
- `version` - Show version information
- `help` - Get help on commands

## Common Workflows

### 1. Remote Server Management

```bash
# Execute command on remote server
xec ssh user@server.com 'systemctl status nginx'

# Copy files to remote
xec copy ./app.tar.gz user@server.com:/tmp/

# Interactive SSH session
xec ssh user@server.com --interactive
```

### 2. Container Operations

```bash
# Execute in running container
xec docker exec my-container 'npm test'

# Start new container and execute
xec docker run node:18 'node --version'

# Copy files from container
xec copy my-container:/app/logs ./logs
```

### 3. Kubernetes Management

```bash
# Execute in pod
xec k8s exec my-pod -n production 'ps aux'

# Get pod logs
xec k8s logs my-pod -n production --tail=100

# Port forwarding
xec k8s port-forward my-pod 8080:80
```

### 4. Development Workflow

```bash
# Watch files and run tests
xec watch '**/*.js' --exec 'npm test'

# Run deployment recipe
xec run deploy --env=staging

# Initialize new project
xec init my-project --template=basic
```

## Extending the CLI

### Custom Commands

Create custom commands by placing scripts in `.xec/commands/`:

```javascript
// .xec/commands/deploy.js
export default {
  name: 'deploy',
  description: 'Deploy application',
  options: [
    { name: 'env', type: 'string', required: true },
    { name: 'dry-run', type: 'boolean', default: false }
  ],
  async execute(options) {
    console.log(`Deploying to ${options.env}`);
    // Your deployment logic
  }
};
```

### Plugins

Install and use CLI plugins:

```bash
# Install a plugin
npm install xec-plugin-aws

# Use plugin command
xec aws s3 ls

# List installed plugins
xec plugins list
```

## Error Handling

Xec provides detailed error messages:

```bash
# Verbose error output
xec --verbose failing-script.js

# Debug mode for maximum detail
xec --debug complex-script.js

# Quiet mode for CI/CD
xec --quiet script.js || echo "Failed"
```

## Performance Tips

1. **Use Connection Pooling**: Xec automatically pools SSH connections
2. **Parallel Execution**: Use `parallel` for concurrent operations
3. **Caching**: Enable result caching for expensive operations
4. **Streaming**: Use streaming for large outputs

## Security Considerations

1. **Credentials**: Never hardcode credentials in scripts
2. **SSH Keys**: Use SSH key authentication over passwords
3. **Environment Variables**: Use env vars for sensitive data
4. **Audit Logging**: Enable audit logs for production

## Troubleshooting

Common issues and solutions:

### Command Not Found
```bash
# Check installation
npm list -g @xec-sh/cli

# Ensure PATH includes npm global bin
export PATH="$(npm config get prefix)/bin:$PATH"
```

### Permission Denied
```bash
# For global installation issues
sudo npm install -g @xec-sh/cli

# Or use a Node version manager
nvm use 18
npm install -g @xec-sh/cli
```

### SSH Connection Issues
```bash
# Test SSH connection directly
ssh -v user@server.com

# Check SSH key permissions
chmod 600 ~/.ssh/id_rsa
```

## Best Practices

1. **Version Control**: Keep your Xec scripts in Git
2. **Environment Separation**: Use different configs for dev/staging/prod
3. **Error Handling**: Always handle command failures
4. **Logging**: Use appropriate log levels
5. **Testing**: Test scripts in development before production

## Next Steps

- Explore [individual commands](./commands) in detail
- Review the configuration examples above

## Getting Help

```bash
# General help
xec --help

# Command-specific help
xec ssh --help

# List all commands
xec help commands

# Online documentation
xec help --online
```

Join the Xec community for support:
- GitHub: [github.com/xec-sh/xec](https://github.com/xec-sh/xec)
- Discord: [discord.gg/xec](https://discord.gg/xec)
- Stack Overflow: [stackoverflow.com/questions/tagged/xec](https://stackoverflow.com/questions/tagged/xec)