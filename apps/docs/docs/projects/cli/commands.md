---
sidebar_position: 2
---

# CLI Commands Reference

Comprehensive reference for all Xec CLI commands.

## Command Overview

| Command | Description | Example |
|---------|-------------|---------|
| [`config`](#config) | Manage Xec configuration | `xec config set timeout 60000` |
| [`copy`](#copy) | Copy files between environments | `xec copy local.txt server:/tmp/` |
| [`docker`](#docker) | Docker container operations | `xec docker exec my-app ls` |
| [`env`](#env) | Environment variable management | `xec env set NODE_ENV production` |
| [`exec`](#exec) | Execute shell commands | `xec exec 'ls -la'` |
| [`init`](#init) | Initialize new Xec project | `xec init my-project` |
| [`k8s`](#k8s) | Kubernetes operations | `xec k8s exec my-pod date` |
| [`list`](#list) | List files and directories | `xec list /var/log` |
| [`run`](#run) | Run scripts or recipes | `xec run deploy.js` |
| [`ssh`](#ssh) | SSH remote operations | `xec ssh user@host 'uptime'` |
| [`version`](#version) | Show version information | `xec version` |
| [`watch`](#watch) | Watch files and execute | `xec watch '*.js' --exec 'npm test'` |

---

## config

Manage Xec configuration settings.

### Syntax
```bash
xec config <subcommand> [options]
```

### Subcommands

#### `config init`
Initialize configuration file:
```bash
# Create default config in current directory
xec config init

# Create global config
xec config init --global
```

#### `config get`
Get configuration values:
```bash
# Get all settings
xec config get

# Get specific setting
xec config get timeout

# Get nested setting
xec config get environments.production.host

# Output as JSON
xec config get --json
```

#### `config set`
Set configuration values:
```bash
# Set simple value
xec config set timeout 60000

# Set nested value
xec config set environments.staging.host staging.example.com

# Set from JSON
xec config set --json '{"timeout": 60000, "retries": 3}'
```

#### `config unset`
Remove configuration values:
```bash
# Remove setting
xec config unset timeout

# Remove nested setting
xec config unset environments.staging
```

#### `config validate`
Validate configuration:
```bash
# Validate current config
xec config validate

# Validate specific file
xec config validate ./config.json
```

### Options
| Option | Description |
|--------|-------------|
| `--global, -g` | Use global config |
| `--local, -l` | Use local config |
| `--json` | Output/input as JSON |
| `--file, -f` | Config file path |

### Examples
```bash
# Set up production environment
xec config set environments.production.host prod.example.com
xec config set environments.production.username deploy
xec config set environments.production.privateKey ~/.ssh/id_rsa_prod

# Configure Docker defaults
xec config set docker.registry registry.company.com
xec config set docker.defaultImage node:18-alpine
```

---

## copy

Copy files and directories between local and remote environments.

### Syntax
```bash
xec copy <source> <destination> [options]
```

### Source/Destination Formats
- Local path: `./file.txt`, `/absolute/path`
- SSH: `user@host:/path/to/file`
- Docker: `container:/path/to/file`
- Kubernetes: `pod:/path/to/file [-n namespace]`

### Options
| Option | Description |
|--------|-------------|
| `--recursive, -r` | Copy directories recursively |
| `--preserve, -p` | Preserve permissions and timestamps |
| `--compress, -z` | Compress during transfer |
| `--exclude` | Exclude patterns (can be used multiple times) |
| `--dry-run` | Show what would be copied |
| `--progress` | Show progress bar |
| `--force, -f` | Overwrite existing files |

### Examples
```bash
# Copy file to remote server
xec copy ./app.tar.gz user@server:/tmp/

# Copy from remote to local
xec copy user@server:/var/log/app.log ./logs/

# Copy directory recursively
xec copy -r ./build/ user@server:/var/www/

# Copy from Docker container
xec copy myapp:/app/logs ./container-logs/

# Copy to Kubernetes pod
xec copy ./config.json mypod:/app/config.json -n production

# Copy with exclusions
xec copy -r ./src server:/app/ --exclude='*.test.js' --exclude='node_modules'

# Dry run to see what would be copied
xec copy -r ./dist server:/var/www/ --dry-run
```

---

## docker

Execute commands and manage Docker containers.

### Syntax
```bash
xec docker <subcommand> [options]
```

### Subcommands

#### `docker exec`
Execute command in running container:
```bash
# Simple command
xec docker exec myapp ls -la

# With working directory
xec docker exec myapp -w /app npm test

# As specific user
xec docker exec myapp -u node npm install

# Interactive mode
xec docker exec -it myapp bash
```

#### `docker run`
Run command in new container:
```bash
# Run and remove
xec docker run --rm alpine echo "Hello"

# With environment variables
xec docker run -e NODE_ENV=test node:18 npm test

# Mount volumes
xec docker run -v ./src:/app node:18 npm install

# With port mapping
xec docker run -p 3000:3000 myapp
```

#### `docker logs`
View container logs:
```bash
# Recent logs
xec docker logs myapp

# Follow logs
xec docker logs -f myapp

# Last 100 lines
xec docker logs myapp --tail 100

# With timestamps
xec docker logs -t myapp
```

#### `docker ps`
List containers:
```bash
# Running containers
xec docker ps

# All containers
xec docker ps -a

# Format output
xec docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Options
| Option | Description |
|--------|-------------|
| `--container, -c` | Container name or ID |
| `--interactive, -i` | Keep STDIN open |
| `--tty, -t` | Allocate pseudo-TTY |
| `--user, -u` | Username or UID |
| `--workdir, -w` | Working directory |
| `--env, -e` | Environment variable |
| `--volume, -v` | Volume mount |

### Examples
```bash
# Run tests in container
xec docker exec myapp npm test

# Debug container
xec docker exec -it myapp sh

# Check container health
xec docker exec healthcheck curl -f http://localhost/health

# Run database backup
xec docker exec postgres pg_dump -U user dbname > backup.sql

# One-off task in new container
xec docker run --rm -v $(pwd):/app node:18 npm audit
```

---

## env

Manage environment variables for execution.

### Syntax
```bash
xec env <subcommand> [options]
```

### Subcommands

#### `env list`
List environment variables:
```bash
# List all
xec env list

# Filter by pattern
xec env list NODE_*

# From specific environment
xec env list --env=production
```

#### `env set`
Set environment variables:
```bash
# Set single variable
xec env set NODE_ENV production

# Set multiple
xec env set NODE_ENV=production DEBUG=app:*

# From file
xec env set --file .env.production
```

#### `env unset`
Remove environment variables:
```bash
# Remove single
xec env unset DEBUG

# Remove multiple
xec env unset DEBUG NODE_ENV
```

#### `env export`
Export environment to file:
```bash
# Export current env
xec env export > .env.backup

# Export specific environment
xec env export --env=production > .env.prod
```

### Options
| Option | Description |
|--------|-------------|
| `--env, -e` | Environment name |
| `--file, -f` | Environment file |
| `--override` | Override existing values |
| `--merge` | Merge with existing |

### Examples
```bash
# Set up development environment
xec env set NODE_ENV=development DEBUG=* --env=dev

# Load production environment
xec env set --file .env.production --env=prod

# Execute with specific env
xec --env=production run deploy.js

# Export for backup
xec env export --env=production > prod.env.backup
```

---

## exec

Execute shell commands directly.

### Syntax
```bash
xec exec <command> [options]
```

### Options
| Option | Description |
|--------|-------------|
| `--shell, -s` | Shell to use |
| `--cwd, -c` | Working directory |
| `--env, -e` | Environment variables |
| `--timeout, -t` | Timeout in ms |
| `--no-throw` | Don't throw on non-zero exit |
| `--quiet, -q` | Suppress output |
| `--raw` | Don't escape command |

### Examples
```bash
# Simple command
xec exec 'echo "Hello World"'

# With custom shell
xec exec -s /bin/zsh 'echo $SHELL'

# Change directory
xec exec -c /tmp 'pwd'

# With environment
xec exec -e NODE_ENV=test 'npm test'

# With timeout
xec exec -t 5000 'sleep 10' # Will timeout

# Pipeline
xec exec 'ps aux | grep node | wc -l'

# Multi-line command
xec exec '
  echo "Starting backup"
  tar -czf backup.tar.gz /data
  echo "Backup complete"
'
```

---

## init

Initialize a new Xec project.

### Syntax
```bash
xec init [project-name] [options]
```

### Options
| Option | Description |
|--------|-------------|
| `--minimal, -m` | Create minimal project structure |
| `--force, -f` | Overwrite existing |
| `--skip-git` | Skip git initialization |
| `--name` | Project name |
| `--description` | Project description |

### Examples
```bash
# Create basic project
xec init my-automation

# Create minimal project
xec init my-project --minimal

# Create in current directory
xec init . --force

# With project details
xec init my-project --name="My Project" --description="Automation project"

# Skip git initialization
xec init my-project --skip-git
```

### Created Structure
```
my-project/
└── .xec/
    ├── config.yaml      # Project configuration
    ├── scripts/         # Xec scripts
    │   ├── example.js
    │   └── deploy.js
    ├── commands/        # Custom CLI commands
    │   └── hello.js
    ├── cache/           # Cache directory
    ├── logs/            # Log files
    ├── .gitignore
    └── README.md
```

---

## k8s

Kubernetes operations and pod management.

### Syntax
```bash
xec k8s <subcommand> [options]
```

### Subcommands

#### `k8s exec`
Execute in pod:
```bash
# Simple command
xec k8s exec mypod date

# Specific container
xec k8s exec mypod -c app ls

# Different namespace
xec k8s exec mypod -n production pwd

# Interactive
xec k8s exec -it mypod bash
```

#### `k8s logs`
Get pod logs:
```bash
# Recent logs
xec k8s logs mypod

# Follow logs
xec k8s logs -f mypod

# Specific container
xec k8s logs mypod -c nginx

# Previous container
xec k8s logs mypod --previous
```

#### `k8s port-forward`
Port forwarding:
```bash
# Forward port
xec k8s port-forward mypod 8080:80

# Random local port
xec k8s port-forward mypod :80

# Multiple ports
xec k8s port-forward mypod 8080:80 8443:443
```

#### `k8s cp`
Copy files:
```bash
# Copy to pod
xec k8s cp ./file.txt mypod:/tmp/

# Copy from pod
xec k8s cp mypod:/app/logs ./logs/

# Specific container
xec k8s cp -c app mypod:/data ./backup/
```

### Options
| Option | Description |
|--------|-------------|
| `--namespace, -n` | Kubernetes namespace |
| `--container, -c` | Container name |
| `--context` | Kubernetes context |
| `--kubeconfig` | Path to kubeconfig |
| `--selector, -l` | Label selector |

### Examples
```bash
# Execute in all pods matching label
xec k8s exec -l app=web date

# Stream logs from deployment
xec k8s logs -f deployment/myapp

# Debug pod
xec k8s exec -it troubled-pod -- /bin/sh

# Port forward for debugging
xec k8s port-forward service/myapp 3000:3000

# Backup data from pod
xec k8s cp mongodb-0:/data/db ./mongo-backup/ -n databases
```

---

## list

List files and directories.

### Syntax
```bash
xec list [path] [options]
```

### Options
| Option | Description |
|--------|-------------|
| `--all, -a` | Show hidden files |
| `--long, -l` | Long format |
| `--human, -h` | Human readable sizes |
| `--sort, -s` | Sort by (name/size/time) |
| `--reverse, -r` | Reverse order |
| `--tree` | Tree view |
| `--max-depth` | Maximum depth for tree |

### Examples
```bash
# List current directory
xec list

# List with details
xec list -la

# List remote directory
xec list user@server:/var/log

# List container directory
xec list mycontainer:/app

# Tree view
xec list --tree --max-depth=3

# Sort by size
xec list -lh --sort=size

# List Kubernetes pod
xec list mypod:/data -n production
```

---

## run

Run scripts or recipes.

### Syntax
```bash
xec run <script-or-recipe> [options]
```

### Options
| Option | Description |
|--------|-------------|
| `--file, -f` | Script file path |
| `--env, -e` | Environment name |
| `--args` | Arguments to pass |
| `--parallel, -p` | Run in parallel |
| `--bail` | Stop on first error |
| `--dry-run` | Show what would run |

### Recipe Locations
1. `.xec/recipes/` in current directory
2. `~/.xec/recipes/` global recipes
3. Explicit path with `--file`

### Examples
```bash
# Run local script
xec run ./deploy.js

# Run recipe
xec run deploy

# With environment
xec run deploy --env=production

# Pass arguments
xec run backup.js --args="--database=mydb --compress"

# Run multiple in parallel
xec run test lint build --parallel

# Dry run
xec run deploy --env=production --dry-run

# Custom recipe file
xec run --file=./automation/deploy-v2.js
```

### Recipe Example
```javascript
// .xec/recipes/deploy.js
export default async function deploy({ env = 'staging' }) {
  console.log(`Deploying to ${env}`);
  
  await $`npm test`;
  await $`npm run build`;
  
  const server = $.ssh({
    host: `${env}.example.com`,
    username: 'deploy'
  });
  
  await server`cd /app && git pull`;
  await server`cd /app && npm install`;
  await server`sudo systemctl restart app`;
}
```

---

## ssh

SSH remote operations.

### Syntax
```bash
xec ssh <host> [command] [options]
```

### Host Formats
- `user@hostname`
- `user@ip-address`
- `ssh://user@hostname:port`
- Config alias from SSH config

### Options
| Option | Description |
|--------|-------------|
| `--port, -p` | SSH port |
| `--key, -i` | Private key path |
| `--password` | Use password auth |
| `--interactive` | Interactive session |
| `--tunnel, -L` | Local port forward |
| `--config, -F` | SSH config file |

### Examples
```bash
# Execute command
xec ssh user@server 'uname -a'

# Interactive session
xec ssh user@server --interactive

# With specific key
xec ssh user@server -i ~/.ssh/custom_key 'whoami'

# Port forwarding
xec ssh user@server -L 3306:localhost:3306

# Multiple commands
xec ssh user@server '
  cd /app
  git pull
  npm install
  npm restart
'

# Using SSH config
xec ssh myserver 'df -h'

# With custom port
xec ssh user@server -p 2222 'date'
```

### SSH Config Support
```
# ~/.ssh/config
Host myserver
    HostName server.example.com
    User deploy
    Port 22
    IdentityFile ~/.ssh/id_rsa_deploy
```

---

## version

Display version information.

### Syntax
```bash
xec version [options]
```

### Options
| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--check` | Check for updates |
| `--detailed` | Show all packages |

### Examples
```bash
# Basic version
xec version
# Output: Xec CLI v2.0.0

# Detailed versions
xec version --detailed
# Output:
# Xec CLI: v2.0.0
# @xec-sh/core: v2.0.0
# Node.js: v18.0.0
# Platform: darwin x64

# JSON format
xec version --json
# Output: {"cli":"2.0.0","core":"2.0.0","node":"18.0.0"}

# Check for updates
xec version --check
# Output: Update available: v2.0.1
```

---

## watch

Watch files and execute commands on changes.

### Syntax
```bash
xec watch <pattern> [options]
```

### Options
| Option | Description |
|--------|-------------|
| `--exec, -x` | Command to execute |
| `--initial, -i` | Run on start |
| `--debounce, -d` | Debounce delay (ms) |
| `--ignore` | Ignore patterns |
| `--poll` | Use polling |
| `--quiet, -q` | Suppress output |

### Patterns
- Glob patterns: `*.js`, `**/*.ts`
- Multiple patterns: `'*.js' '*.json'`
- Exclude patterns: `--ignore 'node_modules/**'`

### Examples
```bash
# Watch and test
xec watch '**/*.js' --exec 'npm test'

# Watch with initial run
xec watch 'src/**/*.ts' -x 'npm run build' --initial

# Multiple patterns
xec watch '*.js' '*.json' -x 'npm run validate'

# With debounce
xec watch '**/*.scss' -x 'npm run build:css' -d 1000

# Ignore directories
xec watch '**/*.js' -x 'npm test' --ignore 'node_modules/**' --ignore 'dist/**'

# Use polling (for network drives)
xec watch 'shared/**/*' -x './deploy.sh' --poll

# Complex command
xec watch 'src/**/*.go' --exec '
  echo "Running tests..."
  go test ./...
  echo "Building..."
  go build
'
```

### Watch Configuration
```javascript
// .xec/watch.config.js
export default {
  tasks: [
    {
      patterns: ['src/**/*.js'],
      exec: 'npm test',
      ignore: ['**/*.test.js'],
      debounce: 500
    },
    {
      patterns: ['styles/**/*.scss'],
      exec: 'npm run build:css',
      initial: true
    }
  ]
};
```

---

## Command Composition

Commands can be combined for powerful workflows:

```bash
# Deploy when tests pass
xec watch 'src/**/*.js' --exec 'xec exec "npm test" && xec run deploy'

# Copy files after building
xec exec 'npm run build' && xec copy ./dist server:/var/www/

# SSH and Docker combination
xec ssh server 'xec docker exec myapp npm run migrate'

# Environment-specific execution
xec --env=production run 'xec k8s exec -n prod mypod -- ./health-check.sh'
```

## Error Handling

All commands support error handling options:

```bash
# Continue on error
xec exec 'false' --no-throw && echo "Continued"

# Bail on first error
xec run test lint build --bail

# Retry on failure
xec ssh flaky-server 'uptime' --retry=3 --retry-delay=1000

# Timeout handling
xec exec 'sleep 100' --timeout=5000 || echo "Timed out"
```

## Getting Help

```bash
# General help
xec --help

# Command help
xec ssh --help

# Subcommand help
xec docker exec --help

# List all commands
xec help

# Online documentation
xec help --web
```