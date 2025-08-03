---
sidebar_position: 2
sidebar_label: Quick Start
title: Quick Start
description: Get started with Xec in 5 minutes
---

# Quick Start

Get up and running with Xec in just 5 minutes. This guide covers installation, basic usage, and your first multi-environment command.

## Installation

### Install the CLI

```bash
npm install -g @xec-sh/cli
```

Or use npx without installation:

```bash
npx @xec-sh/cli --help
```

### Install the Core Library

For use in Node.js projects:

```bash
npm install @xec-sh/core
```

## Your First Command

### Using the CLI

Xec provides powerful built-in commands for multi-environment execution:

```bash
# Execute locally
xec run -e "console.log('Hello, Xec!')"

# Execute on SSH host
xec on user@server.com "uptime"

# Execute in Docker container  
xec in my-container "npm test"

# Copy files between environments
xec copy local.txt server.com:/remote/path/
```

### Execute a Script

```bash
echo "await $\`echo 'Hello from script'\`" > hello.js
xec run hello.js
```

### Using the Library

Create a file `example.js`:

```javascript
import { $ } from '@xec-sh/core';

// Execute locally
const result = await $`echo "Hello, Xec!"`;
console.log(result.stdout);  // "Hello, Xec!"

// Get system information
const info = await $`uname -a`;
console.log(info.stdout);
```

Run it:

```bash
node example.js
```

## Working with Different Environments

### SSH Execution

Connect to a remote server:

```javascript
import { $ } from '@xec-sh/core';

const server = $.ssh({
  host: 'example.com',
  user: 'user',  // Note: 'user' not 'username'
  privateKey: '~/.ssh/id_rsa'
});

const uptime = await server`uptime`;
console.log(`Server uptime: ${uptime.stdout.trim()}`);
```

### Docker Execution

Run commands in containers:

```javascript
import { $ } from '@xec-sh/core';

// Use existing container
await $.docker({ container: 'my-app' })`npm test`;

// Create ephemeral container with configuration
await $.docker({ 
  image: 'node:20',
  autoRemove: true,
  volumes: ['./src:/app'],
  workdir: '/app'
})`npm install && npm run build`;

// Or use fluent API
await $.docker()
  .ephemeral('node:20')
  .volumes(['./src:/app'])
  .workdir('/app')
  .run('npm install && npm run build');
```

### Kubernetes Execution

Execute in pods:

```javascript
import { $ } from '@xec-sh/core';

// Execute command in pod
const result = await $.k8s({ 
  pod: 'web-server', 
  namespace: 'default' 
})`hostname`;
console.log(`Pod hostname: ${result.stdout.trim()}`);

// Get logs from pod
const logs = await $.k8s({ 
  pod: 'web-server', 
  namespace: 'default' 
})`kubectl logs --tail=100`;
console.log(logs.stdout);
```

## Common Patterns

### Error Handling

```javascript
// Continue on error
const result = await $`exit 1`.nothrow();
if (!result.ok) {
  console.log(`Failed with: ${result.cause}`);
}

// With timeout
try {
  await $`sleep 60`.timeout(5000);
} catch (error) {
  console.log('Command timed out');
}
```

### Working with Output

```javascript
// Get text output
const result = await $`cat file.txt`;
const text = result.stdout;

// Parse JSON
const jsonResult = await $`cat config.json`;
const data = JSON.parse(jsonResult.stdout);

// Process lines
const lsResult = await $`ls -1`;
const lines = lsResult.stdout.split('\n').filter(Boolean);
lines.forEach(file => console.log(file));
```

### Method Chaining

```javascript
await $`npm test`
  .cd('/app')                      // Set working directory
  .env({ NODE_ENV: 'test' })       // Set environment
  .timeout(30000)                  // Set timeout
  .quiet()                         // Suppress output
  .nothrow();                      // Don't throw on error
```

### Parallel Execution

```javascript
// Run commands in parallel
const results = await $.parallel.all([
  $`npm test`,
  $`npm run lint`,
  $`npm run type-check`
]);

// Run with concurrency limit
const serverCommands = servers.map(s => 
  $.ssh({ host: s })`apt update`
);
const results2 = await $.parallel.all(serverCommands, { 
  concurrency: 3 
});
```

## Interactive REPL Mode

Start an interactive REPL with Xec pre-loaded:

```bash
xec run --repl

# Now in REPL with $ available
> await $`ls -la`
> const result = await $`find . -name "*.js"`
> const files = result.stdout.split('\n').filter(Boolean)
> files.length
```

### Interactive Command Mode

Many commands support interactive mode for guided execution:

```bash
# Interactive file copy
xec copy --interactive

# Interactive port forwarding
xec forward --interactive

# Interactive command execution
xec on --interactive
```

## Project Configuration

Create `.xec/config.yaml` for project-specific settings:

```yaml
defaults:
  timeout: 30000
  shell: /bin/bash

targets:
  hosts:
    prod:
      type: ssh
      host: prod.example.com
      user: deploy  # Note: 'user' not 'username'
      privateKey: ~/.ssh/deploy_key
  
  containers:
    staging:
      type: docker
      container: staging-app

tasks:
  deploy:
    description: Deploy to production
    command: |
      git pull &&
      npm install &&
      npm run build &&
      pm2 restart app
    targets: [hosts.prod]
```

Run configured tasks:

```bash
xec run deploy
```

## Creating Custom Commands

Create `.xec/commands/greet.js`:

```javascript
export function command(program) {
  program
    .command('greet <name>')
    .description('Greet someone')
    .action(async (name) => {
      const { $ } = await import('@xec-sh/core');
      await $`echo "Hello, ${name}!"`;
      await $`date`;
    });
}
```

Use your custom command:

```bash
xec greet World
```

## What's Next?

Now that you've seen the basics:

1. **Explore the Philosophy** - Understand the [design principles](./philosophy.md) behind Xec
2. **Learn When to Use Xec** - See [real-world use cases](./when-to-use.md)
3. **Dive into Examples** - Check out [comprehensive examples](../recipes/index.md)
4. **Read the Configuration Guide** - Explore [configuration options](../configuration/overview.md)

## Getting Help

- **Documentation**: [docs.xec.sh](https://docs.xec.sh)
- **GitHub**: [github.com/xec-sh/xec](https://github.com/xec-sh/xec)
- **Discord**: [discord.gg/xec](https://discord.gg/xec)

## Tips for Success

1. **Start simple** - Begin with local execution before moving to remote environments
2. **Use TypeScript** - Get full IntelliSense and type checking
3. **Handle errors** - Always consider failure cases with `.nothrow()` or try/catch
4. **Monitor execution** - Use the event system for debugging
5. **Use parallel execution** - Leverage `$.parallel.all()` for concurrent operations