# @xec-sh/cli

**Command-line interface for the Xec Universal Command Execution System** - Execute commands, scripts, and tasks across local, SSH, Docker, and Kubernetes environments with a unified TypeScript API.

[![npm version](https://img.shields.io/npm/v/@xec-sh/cli.svg)](https://www.npmjs.com/package/@xec-sh/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🚀 Installation

```bash
# Install globally
npm install -g @xec-sh/cli

# Or use directly with npx
npx @xec-sh/cli
```

## 📚 Documentation

- 🌐 [Official Documentation](https://xec.sh/docs/projects/cli)
- 📖 [Getting Started](https://xec.sh/docs/introduction/quick-start)
- 🔧 [Command Reference](https://xec.sh/docs/commands)
- 💡 [Examples](https://xec.sh/docs/projects/cli/real-world-examples)
- 📝 [v0.8.0 Changelog](https://xec.sh/docs/changelog)

## ✨ v0.8.0 Features

### Core Capabilities
- **🌍 Universal Script Execution** - Write once, run anywhere with automatic `$target` injection
- **📝 Enhanced Configuration** - Interactive config management with custom parameters
- **🔄 Module Loading 2.0** - CDN module support (npm, jsr, esm.sh, unpkg)
- **⚡ TypeScript Native** - Full TypeScript support with transpilation
- **🎯 Target Context** - Automatic environment adaptation for scripts
- **🛠️ Task Automation** - YAML-based task definitions with parameter support

### Built-in Commands

| Command | Description |
|---------|-------------|
| `xec run <script>` | Execute JavaScript/TypeScript files or tasks |
| `xec on <host> <cmd>` | Execute commands on SSH hosts |
| `xec in <container> <cmd>` | Execute in Docker containers or K8s pods |
| `xec copy <src> <dest>` | Transfer files between targets |
| `xec forward <port>` | Port forwarding for any target |
| `xec watch <cmd>` | Watch files and auto-execute |
| `xec config` | Interactive configuration management |
| `xec new` | Create new scripts, configs, or tasks |
| `xec logs` | View logs from any target |
| `xec secrets` | Manage secrets securely |

## 🎮 Quick Start

### Basic Execution

```bash
# Run local commands
xec run 'echo "Hello, World!"'

# Execute TypeScript/JavaScript files
xec run deploy.ts --env production

# Interactive REPL with Xec context
xec run --repl

# Evaluate inline code
xec run -e 'await $`date`'
```

### Multi-Environment Commands

```bash
# SSH execution
xec on prod-server 'docker ps'
xec on user@host.com 'uptime'

# Docker execution
xec in my-container 'npm test'
xec in docker:alpine 'cat /etc/os-release'

# Kubernetes execution
xec in pod:webapp 'date'
xec in pod:api -n production 'env'
```

### Write Once, Run Anywhere (v0.8.0)

Create universal scripts that work in any environment:

```typescript
// deploy.ts - Universal deployment script
console.log('Starting deployment...');

// $target is automatically injected based on execution context
await $target`git pull origin main`;
await $target`npm install --production`;
await $target`npm run build`;
await $target`pm2 restart app`;

console.log('Deployment complete!');
```

Execute the same script everywhere:
```bash
xec run deploy.ts                    # Local execution
xec on prod-server deploy.ts        # SSH execution
xec in app-container deploy.ts      # Docker execution
xec in pod:app deploy.ts           # Kubernetes execution
```

## 📋 Configuration

### Project Configuration

Create `.xec/config.yaml`:

```yaml
# Define your infrastructure
targets:
  hosts:
    prod:
      type: ssh
      host: prod.example.com
      user: deploy
      privateKey: ~/.ssh/deploy_key
    
  containers:
    app:
      type: docker
      image: node:20-alpine
      volumes: 
        - ./src:/app/src
    
  pods:
    api:
      type: k8s
      namespace: production
      selector: app=api

# Define reusable tasks
tasks:
  test:
    command: npm test
    
  deploy:
    targets: [hosts.prod]
    steps:
      - command: git pull
      - command: npm install
      - command: pm2 restart app
      
  backup:
    schedule: "0 2 * * *"  # 2 AM daily
    target: hosts.prod
    command: |
      tar -czf backup-$(date +%Y%m%d).tar.gz /data
      aws s3 cp backup-*.tar.gz s3://backups/
```

### Enhanced Config Command (v0.8.0)

Interactive configuration management:

```bash
# Interactive mode with continuous menu
xec config

# Manage custom parameters
xec config set api.endpoint "https://api.example.com"
xec config set features.debug true
xec config get api.endpoint

# Export custom configuration
xec config export --format json > custom-config.json
```

## 🔧 Script API

Scripts have access to enhanced global context:

```typescript
#!/usr/bin/env xec

// Universal execution (v0.8.0)
// $target adapts to execution environment automatically
await $target`npm install`;
await $target`npm test`;

// Access target information
if ($targetInfo?.type === 'ssh') {
  console.log(`Running on SSH host: ${$targetInfo.host}`);
}

// Local execution (always available)
const branch = await $`git branch --show-current`;

// Configuration access
const apiUrl = config.get('api.endpoint');

// Interactive prompts
const env = await select({
  message: 'Choose environment',
  options: ['dev', 'staging', 'prod']
});

// File operations
const files = await glob('**/*.ts');
await fs.writeFile('report.json', JSON.stringify(data));

// Logging utilities
log.info('Processing...');
log.success('Complete!');

// HTTP requests
const response = await fetch('https://api.example.com');
const data = await response.json();
```

## 🧩 Dynamic Commands

Create custom commands in `.xec/commands/`:

```typescript
// .xec/commands/database.ts
export function command(program) {
  const db = program
    .command('database')
    .alias('db')
    .description('Database operations');
  
  db.command('backup')
    .description('Backup database')
    .option('--output <file>', 'Output file')
    .action(async (options) => {
      const { $ } = await import('@xec-sh/core');
      
      // Command has access to global context
      const host = config.get('database.host');
      await $.ssh(host)`pg_dump myapp > ${options.output}`;
      
      log.success('Backup complete!');
    });
}
```

## 💡 Examples

### CI/CD Pipeline Script

```typescript
// ci-deploy.ts
const environment = process.argv[2] || 'staging';

// Run tests
log.info('Running tests...');
await $target`npm test`;

// Build application
log.info('Building application...');
await $target`npm run build`;

// Deploy based on environment
if (environment === 'production') {
  // Production deployment
  await $target`npm run deploy:prod`;
  
  // Notify team
  await fetch('https://hooks.slack.com/...', {
    method: 'POST',
    body: JSON.stringify({ text: 'Production deployed!' })
  });
} else {
  // Staging deployment
  await $target`npm run deploy:staging`;
}

log.success(`Deployed to ${environment}!`);
```

### Multi-Server Health Check

```typescript
// health-check.ts
const servers = ['web1', 'web2', 'db1'];

for (const server of servers) {
  const ssh = $.ssh({ host: `${server}.example.com` });
  
  try {
    const health = await ssh`systemctl is-active nginx`;
    log.success(`${server}: ${health.stdout.trim()}`);
  } catch (error) {
    log.error(`${server}: Failed - ${error.message}`);
  }
}
```

## 🔌 Module Loading (v0.8.0)

Enhanced CDN module support:

```typescript
// Import from various CDN sources
const { z } = await import('npm:zod');
const { serve } = await import('jsr:@std/http');
const _ = await import('https://esm.sh/lodash');

// Modules are cached in ~/.xec/module-cache
// TypeScript transformation is automatic
```

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/xec-sh/xec.git
cd xec/apps/xec

# Install dependencies
yarn install

# Development mode
yarn dev

# Run tests
yarn test

# Build for production
yarn build
```

## 📊 Performance

- **Startup Time**: <100ms for command resolution
- **Script Loading**: 200-500ms with TypeScript (cached after first run)
- **Connection Pooling**: Reuse SSH connections for <10ms subsequent commands
- **Module Cache**: CDN modules cached locally for instant loading

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](https://github.com/xec-sh/xec/blob/main/CONTRIBUTING.md).

## 🔗 Links

- 🌐 [Website](https://xec.sh)
- 📖 [Getting Started](https://xec.sh/docs/introduction/quick-start)
- 💬 [GitHub Discussions](https://github.com/xec-sh/xec/discussions)
- 🐛 [Issue Tracker](https://github.com/xec-sh/xec/issues)
- 📦 [npm Package](https://www.npmjs.com/package/@xec-sh/cli)

## 📄 License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)

---

<div align="center">
  <strong>Universal command execution for the modern stack</strong>
  <br>
  <sub>Part of the Xec Universal Command Execution System</sub>
</div>