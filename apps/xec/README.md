# @xec-sh/cli - Xec Command Line Interface

> Universal command execution and multi-environment automation CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

## 🎯 Overview

The Xec CLI provides a powerful command-line interface for multi-environment command execution and automation, combining the execution capabilities of @xec-sh/core with a rich scripting environment and extensible command system.

## ✨ Features

- **Script Execution** - Run JavaScript/TypeScript files with enhanced utilities
- **Direct Evaluation** - Execute code snippets directly from command line
- **Dynamic Commands** - Extensible command system
- **Rich Utilities** - Built-in helpers for common tasks
- **Interactive Prompts** - User-friendly CLI interactions
- **TypeScript Support** - Automatic transpilation

## 📦 Installation

### From Source

```bash
# Clone and build
git clone https://github.com/xec-sh/xec.git
cd xec
yarn install
yarn build

# Link globally
cd apps/xec
npm link
```

### From npm (when published)

```bash
npm install -g @xec-sh/cli
```

## 🚀 Quick Start

### Direct Command Execution

```bash
# Execute locally
xec ls -la
xec "echo Hello World"

# Execute on SSH host
xec on server1 "uptime"
xec on prod "systemctl status nginx"

# Execute in container/pod
xec in myapp "npm test"
xec in pod:webapp "date"

# Execute on multiple hosts
xec on server1,server2 "uptime" --parallel
```

### Running Scripts

```bash
# Execute JavaScript file
xec deploy.js

# Execute TypeScript file
xec setup.ts

# With arguments
xec script.js arg1 arg2

# Evaluate code directly
xec -e "console.log('Hello, Xec!')"

# Watch mode for development
xec dev.js --watch
```

### Using Commands

#### New Simplified Commands (Recommended)

```bash
# SSH operations - use 'on' command
xec on server1 "uptime"                    # Single host
xec on prod "systemctl status nginx"       # Using configured alias
xec on web-1,web-2 "npm restart" --parallel # Multiple hosts
xec on staging -e NODE_ENV=production "npm test" # With environment

# Container/Pod operations - use 'in' command  
xec in myapp "npm test"                    # Docker container
xec in pod:webapp "date"                   # Kubernetes pod
xec in pod:webapp -n production "ls"       # With namespace
xec in webapp -c nginx "nginx -t"          # Specific container
xec in myapp                                # Interactive shell

# Direct local execution
xec ls -la                                  # Direct passthrough
xec "find . -name '*.js' | wc -l"          # Complex commands

# Smart execution (auto-detects target)
xec prod uptime                             # Runs on 'prod' SSH host
xec myapp npm test                          # Runs in 'myapp' container
```

#### Classic Commands (Legacy)

```bash
# Show help
xec --help

# Initialize project
xec init

# Run configuration commands
xec config set
xec config get

# File operations
xec copy local.txt user@host:/remote/path   # Copy to SSH host
xec copy container:app.log ./local.log      # Copy from container
xec copy pod:data.json ./data.json          # Copy from pod

# Port forwarding
xec forward server:8080 3000                 # SSH tunnel
xec forward pod:webapp:80 8080               # K8s port forward

# View logs
xec logs myapp                               # Container logs
xec logs pod:webapp -f                       # Follow pod logs
xec logs server:/var/log/app.log             # Remote file logs

# Copy files
xec copy local.txt user@host:/remote/path

# Watch for changes
xec watch "*.js" --exec "npm test"
```

## 📝 Script API

When running scripts, Xec provides a rich set of global utilities:

### Command Execution

```javascript
// Using @xec-sh/core's $ API
await $`ls -la`;

// SSH execution
const ssh = $.ssh({ host: 'server.com', username: 'user' });
await ssh`uptime`;

// Docker execution
const container = await $.docker({ image: 'node:20' }).start();
await container.exec`npm test`;
```

### File System

```javascript
// Change directory
cd('/path/to/project');

// Current directory
console.log(pwd());

// File operations
const content = await fs.readFile('config.json', 'utf-8');
await fs.writeFile('output.txt', content);

// Glob patterns
const files = await glob('**/*.js');
```

### Interactive Prompts

```javascript
// Text input
const name = await question('What is your name?');

// Confirmation
if (await confirm('Continue?')) {
  // proceed
}

// Selection
const env = await select({
  message: 'Choose environment',
  options: [
    { value: 'dev', label: 'Development' },
    { value: 'prod', label: 'Production' }
  ]
});
```

### Utilities

```javascript
// Delay execution
await sleep(1000); // 1 second

// Environment variables
const apiKey = env('API_KEY');
setEnv('NODE_ENV', 'production');

// Retry with backoff
await retry(async () => {
  await fetch('https://api.example.com');
}, { retries: 3 });

// Colored output
echo(chalk.green('Success!'));

// Logging
log.info('Processing...');
log.success('Complete!');
log.error('Failed!');

// Load environment files
await loadEnv('.env.local');
```

### HTTP & Data

```javascript
// HTTP requests
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// YAML parsing
const { parse, stringify } = await yaml();
const config = parse(yamlContent);

// CSV parsing
const { parse: parseCSV } = await csv();
const records = parseCSV(csvContent, { columns: true });
```

## 📚 Example Scripts

### Deployment Script

```javascript
// deploy.js
const env = argv[0] || 'staging';

log.info(`Deploying to ${env}...`);

// Build
await $`npm run build`;

// Test if production
if (env === 'production') {
  await $`npm test`;
}

// Deploy with retry
await retry(async () => {
  await $`deploy-cli push --env ${env}`;
}, { retries: 3 });

log.success('Deployment complete!');
```

### Interactive Setup

```javascript
// setup.ts
interface ProjectConfig {
  name: string;
  type: 'web' | 'api' | 'cli';
  features: string[];
}

const config: ProjectConfig = {
  name: await question('Project name?'),
  type: await select({
    message: 'Project type?',
    options: [
      { value: 'web', label: 'Web Application' },
      { value: 'api', label: 'API Server' },
      { value: 'cli', label: 'CLI Tool' }
    ]
  }),
  features: await multiselect({
    message: 'Select features',
    options: [
      { value: 'typescript', label: 'TypeScript' },
      { value: 'docker', label: 'Docker' },
      { value: 'ci', label: 'CI/CD' }
    ]
  })
};

// Initialize project
await $`npm init -y`;

if (config.features.includes('typescript')) {
  await $`npm install -D typescript @types/node`;
}

log.success(`Project ${config.name} initialized!`);
```

### Server Management

```javascript
// manage-servers.js
const servers = ['web1.example.com', 'web2.example.com'];

// Check all servers
for (const host of servers) {
  const ssh = $.ssh({ host, username: 'deploy' });
  
  echo(`\nChecking ${host}...`);
  const uptime = await ssh`uptime`;
  const disk = await ssh`df -h | grep "/$"`;
  
  echo(`Uptime: ${uptime.stdout.trim()}`);
  echo(`Disk: ${disk.stdout.trim()}`);
}

// Deploy to all
if (await confirm('Deploy to all servers?')) {
  await parallel(
    servers.map(host => {
      const ssh = $.ssh({ host, username: 'deploy' });
      return ssh`cd /app && git pull && npm install --production`;
    }),
    { maxConcurrent: 2 }
  );
  
  log.success('Deployment complete!');
}
```

## 🔧 Configuration

Xec uses YAML configuration files for defining hosts, containers, pods, and aliases. Configuration can be stored in:
- `~/.xec/config.yaml` - Global configuration
- `./.xec/config.yaml` - Project-specific configuration

### Configuration Structure

```yaml
# ~/.xec/config.yaml
defaults:
  timeout: 30s
  shell: /bin/bash

# SSH hosts
hosts:
  prod:
    host: production.example.com
    username: deploy
    privateKey: ~/.ssh/id_rsa_prod
    
  staging:
    host: staging.example.com
    username: ubuntu

# Docker containers  
containers:
  app:
    name: myapp-production
    
  db:
    name: postgres-main

# Kubernetes pods
pods:
  web:
    name: web-deployment-*
    namespace: production
    
# Command aliases
aliases:
  deploy: "xec on prod ./deploy.sh"
  logs: "xec in app tail -f /var/log/app.log"
  status: "xec on prod,staging uptime --parallel"
```

See [examples/config.yaml](examples/config.yaml) for a complete example.

### Legacy Directory Structure

The CLI also supports legacy directory structure in `.xec/`:

```bash
.xec/
├── config.json     # Legacy JSON configuration (deprecated)
├── commands/       # Custom commands
└── scripts/        # Shared scripts
```

### Custom Commands

Add custom commands by creating files in `.xec/commands/`:

```javascript
// .xec/commands/deploy.js
export default {
  name: 'deploy',
  description: 'Deploy application',
  options: [
    { flag: '-e, --env <env>', description: 'Environment' }
  ],
  async action(options) {
    const env = options.env || 'staging';
    await $`npm run deploy:${env}`;
  }
};
```

## 🛠 Troubleshooting

### Enhanced Error Messages

Xec provides context-aware error messages with helpful suggestions:

```bash
# Typo in command name
$ xec shs server1 uptime
✖ Unknown command 'shs'

Did you mean:
  ssh - Execute commands on remote hosts via SSH
    Usage: xec ssh <hosts...>

# Connection errors with context
$ xec on unknown-host "date"
✖ SSH connection failed: ENOTFOUND

Error Details:
  Host: unknown-host
  Port: 22
  
Suggestions:
  • Check if the hostname is correct
  • Verify DNS resolution: nslookup unknown-host
  • Try using IP address instead of hostname
  • Check SSH configuration: ~/.ssh/config

# Permission errors with solutions
$ xec in protected-container "ls"
✖ Docker permission denied

Error Details:
  Container: protected-container
  Operation: exec
  
Suggestions:
  • Add your user to docker group: sudo usermod -aG docker $USER
  • Run with sudo (not recommended)
  • Check container status: docker ps -a
```

### Command Not Found

If a command is not recognized, Xec will suggest similar commands:

```bash
$ xec kube get pods
✖ Unknown command 'kube'

Did you mean:
  k8s - Kubernetes operations
    Usage: xec k8s

$ xec foward pod:web:8080
✖ Unknown command 'foward'

Did you mean:
  forward - Set up port forwarding
    Usage: xec forward <source> [to] <destination>
```

### Smart Error Recovery

Xec automatically suggests fixes for common issues:

```bash
# Missing configuration
$ xec on prod uptime
✖ Host 'prod' not found in configuration

Suggestions:
  • Add host to ~/.xec/config.yaml:
    hosts:
      prod:
        host: production.example.com
        username: deploy
  • Use full hostname: xec on production.example.com uptime

# Container not running
$ xec in myapp "npm test"
✖ Container 'myapp' is not running

Suggestions:
  • Start the container: docker start myapp
  • List all containers: docker ps -a
  • Use container ID instead of name
```

## 🤝 Contributing

See our [Contributing Guide](../../CONTRIBUTING.md) for details.

## 📄 License

MIT © [Xec Team](https://github.com/xec-sh)