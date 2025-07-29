# @xec-sh/cli

Command-line interface for universal command orchestration across local, SSH, Docker, and Kubernetes environments.

## Installation

```bash
npm install -g @xec-sh/cli
```

## Documentation

- 🌐 [Official Documentation](https://xec.sh/docs/projects/cli)
- 📚 [API Reference](https://xec.sh/docs/projects/cli/commands)
- 🚀 [Getting Started](https://xec.sh/docs/getting-started/quick-start)
- 💡 [Examples](https://xec.sh/docs/projects/cli/real-world-examples)

## Features

- **JavaScript/TypeScript Execution** - Run scripts with full async/await support
- **Multi-Environment Commands** - Execute across local, SSH, Docker, Kubernetes
- **Dynamic Commands** - Extensible command system
- **Interactive Prompts** - Built-in UI components
- **Template Literals** - Natural command syntax
- **Configuration Management** - YAML-based project settings

## Quick Start

### Execute Scripts

```bash
# Run JavaScript/TypeScript files
xec deploy.js
xec build.ts --env production

# Evaluate inline code
xec eval 'await $`echo "Hello, World!"`'

# Interactive REPL
xec repl
```

### Multi-Environment Execution

```bash
# Local commands
xec exec 'ls -la'

# SSH commands
xec ssh user@server 'uptime'
xec on prod 'systemctl status nginx'

# Docker commands
xec docker exec myapp 'npm test'
xec in myapp 'ps aux'

# Kubernetes commands
xec k8s exec my-pod 'date'
xec in pod:webapp -n production 'hostname'
```

## Script API

Scripts have access to enhanced global utilities:

```javascript
#!/usr/bin/env xec

// Command execution
await $`npm install`;
await $`npm test`;

// SSH operations
const server = $.ssh({ host: 'prod.example.com' });
await server`git pull && npm install`;

// Interactive prompts
const env = await select({
  message: 'Choose environment',
  options: ['development', 'staging', 'production']
});

// File operations
const files = await glob('**/*.js');
await fs.writeFile('output.json', JSON.stringify(data));

// Utilities
await sleep(1000);
log.info('Processing...');
log.success('Complete!');
```

## Configuration

Create `.xec/config.yaml` in your project:

```yaml
defaults:
  shell: /bin/bash
  timeout: 30000

hosts:
  prod:
    host: production.example.com
    username: deploy
    privateKey: ~/.ssh/id_rsa

containers:
  app:
    name: myapp-production

pods:
  web:
    name: web-deployment-*
    namespace: production
```

## Commands

| Command | Description |
|---------|-------------|
| `xec <script>` | Execute JavaScript/TypeScript file |
| `xec eval <code>` | Evaluate code string |
| `xec ssh <host> <command>` | Execute via SSH |
| `xec docker <container> <command>` | Execute in Docker |
| `xec k8s <pod> <command>` | Execute in Kubernetes |
| `xec init` | Initialize project |
| `xec config` | Manage configuration |

## Global Utilities

| Utility | Description |
|---------|-------------|
| `$` | Command execution from @xec-sh/core |
| `fs` | File system operations |
| `glob` | File pattern matching |
| `fetch` | HTTP requests |
| `chalk` | Colored output |
| `log` | Structured logging |
| `sleep` | Delay execution |
| `question` | Text prompt |
| `confirm` | Yes/no prompt |
| `select` | Single selection |

## Examples

### Deployment Script

```javascript
// deploy.js
const env = argv[0] || 'staging';

log.info(`Deploying to ${env}...`);

// Build and test
await $`npm run build`;
if (env === 'production') {
  await $`npm test`;
}

// Deploy to server
const server = $.ssh({ host: `${env}.example.com` });
await server`cd /app && git pull && npm install --production`;
await server`pm2 restart app`;

log.success('Deployment complete!');
```

### Multi-Server Management

```javascript
// check-servers.js
const servers = ['web1', 'web2', 'web3'];

for (const host of servers) {
  const ssh = $.ssh({ host: `${host}.example.com` });
  const uptime = await ssh`uptime`;
  console.log(`${host}: ${uptime.stdout.trim()}`);
}
```

## Custom Commands

Create custom commands in `.xec/commands/`:

```javascript
// .xec/commands/deploy.js
export function command(program) {
  program
    .command('deploy <env>')
    .description('Deploy to environment')
    .action(async (env) => {
      const { $ } = await import('@xec-sh/core');
      await $`npm run build`;
      await $`npm run deploy:${env}`;
    });
}
```

## Contributing

See [Contributing Guide](https://github.com/xec-sh/xec/blob/main/CONTRIBUTING.md)

## Links

- 🌐 [Website](https://xec.sh)
- 📖 [Documentation](https://xec.sh/docs)
- 💬 [GitHub Discussions](https://github.com/xec-sh/xec/discussions)
- 🐛 [Issue Tracker](https://github.com/xec-sh/xec/issues)

## License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)