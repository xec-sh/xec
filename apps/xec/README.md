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

```bash
# Show help
xec --help

# Initialize project
xec init

# Run configuration commands
xec config set
xec config get

# SSH operations
xec ssh connect user@host
xec ssh tunnel user@host 8080:80

# Docker operations
xec docker ps
xec docker exec container-name "ls -la"

# Kubernetes operations
xec k8s pods
xec k8s exec pod-name "date"

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

The CLI stores configuration in `.xec/` directory:

```bash
.xec/
├── config.json     # CLI configuration
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

## 🤝 Contributing

See our [Contributing Guide](../../CONTRIBUTING.md) for details.

## 📄 License

MIT © [Xec Team](https://github.com/xec-sh)