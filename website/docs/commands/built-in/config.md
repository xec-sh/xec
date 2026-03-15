---
title: config
description: Manage Xec configuration with interactive and command-line interfaces
keywords: [config, configuration, settings, targets, variables, tasks]
source_files:
  - apps/xec/src/commands/config.ts
  - apps/xec/src/config/loader.ts
  - apps/xec/src/config/schema.ts
  - apps/xec/src/config/types.ts
key_functions:
  - ConfigCommand.execute()
  - ConfigManager.get()
  - ConfigManager.set()
  - validateConfig()
  - loadConfig()
verification_date: 2025-08-03
---

# config

## Implementation Reference

**Source Files:**
- `apps/xec/src/commands/config.ts` - Main config command implementation
- `apps/xec/src/config/loader.ts` - Configuration loading logic
- `apps/xec/src/config/schema.ts` - Configuration validation schemas
- `apps/xec/src/config/types.ts` - Configuration type definitions
- `apps/xec/src/config/defaults.ts` - Default configuration values

**Key Functions:**
- `ConfigCommand.execute()` - Main command entry point
- `ConfigManager.get()` - Get configuration value by path
- `ConfigManager.set()` - Set configuration value
- `ConfigManager.unset()` - Remove configuration value
- `validateConfig()` - Validate configuration against schema
- `loadConfig()` - Load configuration from file

## Overview

Manage Xec configuration with interactive and command-line interfaces.

## Synopsis

```bash
xec config [subcommand] [args...] [options]
xec conf [subcommand] [args...] [options]  # Alias
xec cfg [subcommand] [args...] [options]   # Short alias
```

## Description

The `config` command provides comprehensive configuration management for Xec projects. It supports interactive configuration editing, command-line operations, and specialized management for targets, variables, tasks, and defaults.

## Subcommands

### Basic Configuration

#### get

Get configuration value by key.

```bash
xec config get <key>
```

**Examples:**
```bash
# Get top-level value
xec config get name

# Get nested value using dot notation
xec config get targets.hosts.production.host

# Get array or object values
xec config get tasks.deploy.steps
```

#### set

Set configuration value.

```bash
xec config set <key> <value> [options]
```

**Options:**
- `--json` - Parse value as JSON

**Examples:**
```bash
# Set simple value
xec config set name "my-project"

# Set nested value
xec config set targets.hosts.production.port 2222

# Set JSON value
xec config set tasks.build.env '{"NODE_ENV":"production"}' --json

# Set boolean value
xec config set defaults.docker.tty true

# Set numeric value
xec config set targets.defaults.ssh.port 22
```

#### unset

Remove configuration value.

```bash
xec config unset <key>
```

**Examples:**
```bash
# Remove simple value
xec config unset description

# Remove nested value
xec config unset targets.hosts.old-server

# Remove entire section
xec config unset targets.containers
```

#### list

List all configuration values.

```bash
xec config list [options]
```

**Options:**
- `--json` - Output as JSON
- `--path <path>` - List values under specific path

**Examples:**
```bash
# List all configuration
xec config list

# List as JSON
xec config list --json

# List specific section
xec config list --path targets.hosts
```

#### view

View current configuration with default value highlighting.

```bash
xec config view [options]
```

**Options:**
- `--defaults` - Show default values in dimmer color

**Examples:**
```bash
# View configuration with defaults highlighted
xec config view --defaults

# View current configuration only
xec config view
```

### Configuration Management

#### doctor

Check and fix configuration issues.

```bash
xec config doctor [options]
```

**Options:**
- `--defaults` - Show all possible configuration options with default values

**Examples:**
```bash
# Run configuration doctor
xec config doctor

# Add all default values to configuration
xec config doctor --defaults
```

#### validate

Validate configuration syntax and structure.

```bash
xec config validate
```

**Examples:**
```bash
# Validate current configuration
xec config validate
```

### Target Management

#### targets list

List all configured targets.

```bash
xec config targets list
```

#### targets add

Add a new target interactively.

```bash
xec config targets add
```

#### targets edit

Edit an existing target.

```bash
xec config targets edit <name>
```

#### targets delete

Delete a target.

```bash
xec config targets delete <name>
```

#### targets test

Test target connectivity.

```bash
xec config targets test <name>
```

### Variable Management

#### vars list

List all configured variables.

```bash
xec config vars list
```

#### vars set

Set a variable value.

```bash
xec config vars set <key> [value]
```

#### vars delete

Delete a variable.

```bash
xec config vars delete <key>
```

#### vars import

Import variables from a .env file.

```bash
xec config vars import <file>
```

#### vars export

Export variables to a .env file.

```bash
xec config vars export <file>
```

### Task Management

#### tasks list

List all configured tasks.

```bash
xec config tasks list
```

#### tasks view

View task details.

```bash
xec config tasks view <name>
```

#### tasks create

Create a new task interactively.

```bash
xec config tasks create
```

#### tasks delete

Delete a task.

```bash
xec config tasks delete <name>
```

#### tasks validate

Validate all task definitions.

```bash
xec config tasks validate
```

### Defaults Management

#### defaults view

View current default configurations.

```bash
xec config defaults view
```

#### defaults ssh

Configure SSH defaults.

```bash
xec config defaults ssh
```

#### defaults docker

Configure Docker defaults.

```bash
xec config defaults docker
```

#### defaults k8s

Configure Kubernetes defaults.

```bash
xec config defaults k8s
```

#### defaults commands

Configure command defaults.

```bash
xec config defaults commands
```

#### defaults reset

Reset all defaults to system values.

```bash
xec config defaults reset
```

## Interactive Mode

When called without arguments, the config command enters interactive mode:

```bash
xec config
```

Interactive mode provides a menu-driven interface for all configuration operations:

```
🔧 Xec Configuration Manager

What would you like to do?
  📖 View configuration
  🎯 Manage targets  
  📝 Manage variables
  ⚡ Manage tasks
  ⚙️  Manage defaults
  🔧 Manage custom parameters
  🏥 Run doctor (add all defaults)
  ✅ Validate configuration
  ❌ Exit
```

## Configuration Structure

Xec configuration follows a hierarchical structure:

```yaml
# Project information
name: my-project
description: My automation project
version: 1.0.0

# Variables
vars:
  DATABASE_URL: postgresql://localhost/myapp
  API_ENDPOINT: https://api.example.com
  DEBUG: false

# Execution targets
targets:
  # Default settings inherited by all targets
  defaults:
    ssh:
      port: 22
      keepAlive: true
      keepAliveInterval: 30000
    docker:
      workdir: /app
      tty: true
    kubernetes:
      namespace: default

  # SSH hosts
  hosts:
    production:
      type: ssh
      host: prod.example.com
      username: deployer
      privateKey: ~/.ssh/id_rsa
      
  # Docker containers  
  containers:
    app:
      type: docker
      image: myapp:latest
      workdir: /app
      
  # Kubernetes pods
  pods:
    frontend:
      type: k8s
      pod: frontend-pod
      namespace: production
      container: app

# Reusable tasks
tasks:
  build:
    description: Build the application
    steps:
      - name: Install dependencies
        command: npm install
      - name: Build
        command: npm run build
        
  deploy:
    description: Deploy to production
    target: hosts.production
    steps:
      - task: build
      - name: Deploy
        command: ./deploy.sh
        
# Command defaults
commands:
  exec:
    shell: /bin/sh
    tty: true
  logs:
    tail: 50
    timestamps: false
  cp:
    recursive: true
    preserveMode: true
```

## Target Configuration

### SSH Hosts

```yaml
targets:
  hosts:
    server:
      type: ssh
      host: example.com
      port: 22
      username: user
      privateKey: ~/.ssh/id_rsa
      passphrase: "${secret:SSH_PASSPHRASE}"  # Reference to secret
```

**Interactive prompts guide through:**
- Host connection details
- Authentication method (key vs password)
- Advanced SSH options

### Docker Containers

```yaml
targets:
  containers:
    app:
      type: docker
      # Use existing container
      container: myapp-container
      
    webapp:
      type: docker  
      # Create new container from image
      image: nginx:latest
      workdir: /usr/share/nginx/html
```

**Interactive setup offers:**
- Existing container vs new from image
- Working directory configuration
- Environment variables

### Kubernetes Pods

```yaml
targets:
  pods:
    frontend:
      type: k8s
      pod: frontend-deployment-abc123
      namespace: production
      container: app  # For multi-container pods
      context: production-cluster
```

**Interactive configuration covers:**
- Pod and namespace selection
- Container specification
- Kubernetes context

## Variable Management

### Simple Variables

```yaml
vars:
  PROJECT_NAME: myapp
  VERSION: 1.2.3
  DEBUG: true
  PORT: 3000
```

### Secret References

```yaml
vars:
  DATABASE_PASSWORD: "${secret:DB_PASSWORD}"
  API_KEY: "${secret:API_KEY}"
```

### Variable Interpolation

```yaml
vars:
  BASE_URL: https://api.example.com
  API_ENDPOINT: "${vars.BASE_URL}/v1"
  FULL_DATABASE_URL: "postgresql://user:${secret:DB_PASSWORD}@localhost/${vars.PROJECT_NAME}"
```

### Environment File Import/Export

**Import from .env:**
```bash
# Create .env file
cat > .env << EOF
PROJECT_NAME=myapp
DEBUG=true
PORT=3000
EOF

# Import variables
xec config vars import .env
```

**Export to .env:**
```bash
# Export all variables
xec config vars export .env

# Generated .env content:
# Exported from Xec configuration
PROJECT_NAME="myapp"
DEBUG="true"
PORT="3000"
```

## Task Configuration

### Simple Tasks

```yaml
tasks:
  test:
    description: Run tests
    command: npm test
    
  build:
    description: Build application  
    command: npm run build
```

### Multi-step Tasks

```yaml
tasks:
  deploy:
    description: Deploy to production
    target: hosts.production
    params:
      - name: version
        required: true
    steps:
      - name: Build
        command: npm run build
      - name: Test
        command: npm test
      - name: Deploy
        command: ./deploy.sh ${params.version}
```

### Task Dependencies

```yaml
tasks:
  full-deploy:
    description: Complete deployment process
    steps:
      - task: build
      - task: test  
      - task: deploy
```

## Default Configuration

### SSH Defaults

```yaml
targets:
  defaults:
    ssh:
      port: 22
      keepAlive: true
      keepAliveInterval: 30000
      connectTimeout: 10000
```

### Docker Defaults

```yaml
targets:
  defaults:
    docker:
      workdir: /app
      tty: true
      user: root
      env: {}
```

### Kubernetes Defaults

```yaml
targets:
  defaults:
    kubernetes:
      namespace: default
      timeout: 30000
```

### Command Defaults

```yaml
commands:
  exec:
    shell: /bin/sh
    tty: true
    
  logs:
    tail: 50
    timestamps: false
    follow: false
    prefix: false
    
  cp:
    recursive: true
    preserveMode: true
    preserveTimestamps: false
```

## Custom Parameters

Beyond managed configuration sections, you can add custom parameters:

```yaml
# Custom application configuration
myapp:
  database:
    pool_size: 10
    timeout: 30000
  cache:
    enabled: true
    ttl: 3600
    
# Custom deployment settings
deployment:
  environments:
    - staging
    - production
  rollback_limit: 5
```

### Managing Custom Parameters

```bash
# List custom parameters
xec config custom list

# Set custom parameter
xec config custom set myapp.database.pool_size 20

# Get custom parameter  
xec config custom get myapp.cache.ttl

# Delete custom parameter
xec config custom delete deployment.rollback_limit

# Export custom parameters
xec config custom export custom-config.yaml
```

## Configuration Doctor

The doctor command performs health checks and improvements:

```bash
xec config doctor
```

**Doctor operations:**
- Ensures basic project information (name, description)
- Adds default configurations for all target types
- Creates standard command defaults
- Validates configuration structure
- Reports recommendations

**With `--defaults` flag:**
- Writes all possible default values to configuration
- Shows complete configuration schema
- Useful for understanding all available options

**Sample doctor output:**
```
🏥 Running configuration doctor...

Doctor made the following improvements:
  ✅ Set project name
  ✅ Added SSH defaults
  ✅ Added Docker defaults  
  ✅ Added Kubernetes defaults
  ✅ Added exec command defaults
  ✅ Added logs command defaults

✅ Configuration is healthy! No changes needed.
```

## Configuration Validation

The validate command checks configuration integrity:

```bash
xec config validate
```

**Validation checks:**
- **Syntax**: YAML parsing and structure
- **Required fields**: Essential configuration elements
- **References**: Variable and secret references
- **Target configuration**: Connection parameters
- **Task definitions**: Step and parameter validation
- **Type constraints**: Data type validation

**Sample validation output:**
```
Validating configuration...

Configuration has errors:
  ❌ SSH host 'production': missing 'host' field
  ❌ Task 'deploy', step 2: must have either 'command', 'script', or 'task'

Configuration warnings:
  ⚠️  SSH host 'production': no authentication method specified
  ⚠️  Variable 'OLD_API_URL': unused variable
  
✅ Configuration is valid
```

## File Operations

### Configuration File Location

Configuration is stored in `.xec/config.yaml` in the project root:

```
my-project/
├── .xec/
│   ├── config.yaml      # Main configuration file
│   ├── scripts/         # Custom scripts
│   └── commands/        # Custom commands
└── ...
```

### Configuration Format

Xec uses YAML for human-readable configuration:

```yaml
# Comments are preserved
name: my-project  # Project name

# Hierarchical structure
targets:
  hosts:
    production:
      host: prod.example.com
      port: 22
```

### Backup and Recovery

```bash
# Manual backup
cp .xec/config.yaml .xec/config.yaml.backup

# Export configuration
xec config list --json > config-backup.json

# Restore from backup
cp .xec/config.yaml.backup .xec/config.yaml
```

## Integration with Other Commands

### Scripts and Tasks

Configuration values are available in scripts:

```javascript
// Access configuration in scripts
const config = xec.config;
console.log(`Project: ${config.name}`);
console.log(`Database: ${config.vars.DATABASE_URL}`);

// Access resolved variables
const dbUrl = await vars.get('DATABASE_URL');
const apiKey = await secrets.get('API_KEY');
```

### Command Execution

Configuration affects command behavior:

```bash
# SSH command uses host configuration
xec on production "ls -la"

# Docker command uses container configuration  
xec in app "npm install"

# Logs command uses configured defaults
xec logs app  # Uses defaults.logs.tail setting
```

## Profile Support

Configuration can vary by profile:

```bash
# Set configuration for specific profile
xec config set vars.API_URL "https://staging-api.example.com" -p staging

# View configuration with profile
xec config view -p production

# Validate profile-specific configuration
xec config validate -p staging
```

## Security Considerations

### Secret Management

- **Never store secrets in configuration**
- **Use secret references**: `${secret:KEY_NAME}`
- **Manage secrets separately**: Use `xec secrets` command

```yaml
# Good: Secret reference
vars:
  DATABASE_PASSWORD: "${secret:DB_PASSWORD}"
  
# Bad: Plain text secret
vars:
  DATABASE_PASSWORD: "secret123"
```

### Permission Management

```bash
# Secure configuration directory
chmod 700 .xec/
chmod 600 .xec/config.yaml
```

### Access Control

- Configuration files should not be world-readable
- Use `.gitignore` to exclude sensitive configurations
- Consider separate configuration for different environments

## Troubleshooting

### Common Issues

**"Configuration file not found":**
```bash
# Initialize new configuration
xec config doctor
```

**"Invalid YAML syntax":**
```bash
# Validate and fix syntax
xec config validate

# View problematic lines
cat -n .xec/config.yaml
```

**"Target connection failed":**
```bash
# Test target connectivity
xec config targets test production

# Validate target configuration
xec config validate
```

### Debug Mode

```bash
# Enable debug logging
export XEC_DEBUG=config
xec config list
```

## Related Commands

- [secrets](secrets.md) - Manage secrets referenced in configuration
- [inspect](inspect.md) - Analyze and validate configuration
- [run](run.md) - Execute tasks defined in configuration
- [new](new.md) - Create new configuration elements

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Configuration not found
- `4` - Validation failed
- `5` - Permission error