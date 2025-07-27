---
sidebar_position: 2
---

# Quick Start

Get up and running with Xec in 5 minutes! This guide will walk you through your first commands and show you the power of Xec.

## Your First Xec Command

Let's start with something simple:

```bash
# Execute a command using Xec
xec eval 'await $`echo "Hello from Xec!"`'
```

This command demonstrates Xec's template literal syntax for executing shell commands.

## Creating Your First Script

Create a file called `hello.js`:

```javascript
#!/usr/bin/env xec

// Import the global $ function
import { $ } from '@xec-sh/core';

// Execute commands with template literals
await $`echo "Starting automation..."`;

// Get system information
const hostname = await $`hostname`;
const user = await $`whoami`;
const date = await $`date`;

console.log(`
System Information:
- Hostname: ${hostname.stdout.trim()}
- User: ${user.stdout.trim()}
- Date: ${date.stdout.trim()}
`);

// Check if a command exists
const hasDocker = await $`which docker`.nothrow();
if (hasDocker.exitCode === 0) {
  console.log('✓ Docker is installed');
} else {
  console.log('✗ Docker is not installed');
}
```

Run your script:

```bash
# Make it executable
chmod +x hello.js

# Run it
./hello.js

# Or use xec directly
xec hello.js
```

## Working with Different Environments

### Local Execution

```javascript
// Simple command execution
await $`ls -la`;

// Capture output
const files = await $`ls`;
console.log('Files:', files.stdout);

// Change directory
const projectDir = await $`pwd`;
console.log('Current directory:', projectDir.stdout.trim());

// Environment variables
await $.env({ NODE_ENV: 'production' })`echo $NODE_ENV`;
```

### SSH Execution

```javascript
// Connect to a remote server
const remote = $.ssh({
  host: 'example.com',
  username: 'user'
});

// Execute commands remotely
await remote`uname -a`;
await remote`df -h`;
await remote`docker ps`;

// Transfer files
await remote.uploadFile('./local-file.txt', '/tmp/remote-file.txt');
await remote.downloadFile('/etc/hostname', './hostname.txt');
```

### Docker Execution

```javascript
// Execute in an existing container
const docker = $.docker({ container: 'my-app' });
await docker`ps aux`;

// Or create a new container
const container = await $.docker({ 
  image: 'node:18',
  name: 'test-container'
}).start();

await container.exec`node --version`;
await container.exec`npm --version`;

// Clean up
await container.stop();
await container.remove();
```

### Kubernetes Execution

```javascript
// Work with Kubernetes pods
const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('my-app-pod');

// Execute commands in pod
await pod.exec`hostname`;
await pod.exec`ps aux`;

// Get logs
const logs = await pod.logs({ tail: 50 });
console.log('Recent logs:', logs);

// Stream logs in real-time
await pod.follow(line => console.log(line));
```

## Common Patterns

### Error Handling

```javascript
// Use .nothrow() to prevent exceptions
const result = await $`false`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed with exit code:', result.exitCode);
}

// Or use try-catch
try {
  await $`exit 1`;
} catch (error) {
  console.log('Command failed:', error.message);
}
```

### Parallel Execution

```javascript
// Run commands in parallel
const results = await Promise.all([
  $`sleep 1 && echo "Task 1"`,
  $`sleep 1 && echo "Task 2"`,
  $`sleep 1 && echo "Task 3"`
]);

// Or use the parallel helper
import { parallel } from '@xec-sh/core';

await parallel([
  () => $`npm install`,
  () => $`npm run build`,
  () => $`npm test`
], { maxConcurrent: 2 });
```

### Piping and Streams

```javascript
// Pipe command output
await $`cat package.json | grep version`;

// Or use the pipe helper
import { pipe } from '@xec-sh/core';

await pipe(
  $`cat package.json`,
  $`grep version`,
  $`cut -d'"' -f4`
);

// Stream output in real-time
await $`npm install`.stream();
```

### Working with Files

```javascript
// Read file content
const content = await $`cat package.json`;
const pkg = JSON.parse(content.stdout);
console.log('Package name:', pkg.name);

// Write files
await $`echo "Hello World" > output.txt`;

// Use temporary files
import { withTempFile } from '@xec-sh/core';

await withTempFile(async (tmpFile) => {
  await $`echo "temporary data" > ${tmpFile}`;
  await $`cat ${tmpFile}`;
  // File is automatically cleaned up
});
```

## Creating a Simple Automation

Let's create a deployment script that combines multiple concepts:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

console.log('🚀 Starting deployment...');

// 1. Run tests locally
console.log('📋 Running tests...');
const tests = await $`npm test`.nothrow();
if (tests.exitCode !== 0) {
  console.error('❌ Tests failed!');
  process.exit(1);
}
console.log('✅ Tests passed!');

// 2. Build the application
console.log('🔨 Building application...');
await $`npm run build`;

// 3. Connect to production server
const prod = $.ssh({
  host: 'prod.example.com',
  username: 'deploy'
});

// 4. Deploy to production
console.log('📦 Deploying to production...');
await prod`cd /app && git pull`;
await prod`cd /app && npm install --production`;
await prod`cd /app && npm run migrate`;

// 5. Restart services
console.log('🔄 Restarting services...');
await prod`sudo systemctl restart app.service`;

// 6. Health check
console.log('❤️  Running health check...');
const health = await prod`curl -f http://localhost:3000/health`.nothrow();

if (health.exitCode === 0) {
  console.log('✅ Deployment successful!');
} else {
  console.log('❌ Health check failed!');
  // Rollback if needed
  await prod`cd /app && git checkout HEAD~1`;
  await prod`sudo systemctl restart app.service`;
}
```

## CLI Quick Reference

### Basic Commands

```bash
# Execute a script
xec script.js

# Evaluate inline code
xec eval 'await $`date`'

# Run with specific Node flags
xec --node-options="--max-old-space-size=4096" script.js
```

### Working with Recipes

```bash
# List available recipes
xec list

# Run a recipe
xec run deploy

# Run a specific recipe file
xec run --file ./recipes/custom-deploy.js
```

### Working with Tasks

```bash
# List available tasks
xec task --list

# Run a task
xec task docker:cleanup

# Get task help
xec task docker:cleanup --help
```

## Environment Variables

Xec recognizes several environment variables:

```bash
# Set default shell
export XEC_SHELL=/bin/zsh

# Set default timeout (ms)
export XEC_TIMEOUT=60000

# Enable debug output
export XEC_DEBUG=true

# Run with environment variables
XEC_DEBUG=true xec script.js
```

## Next Steps

Now that you've seen the basics, explore:

1. **[First Project](./first-project)** - Build a complete automation project
2. **[Examples](../projects/core/examples)** - Learn from practical examples
3. **[API Reference](../projects/core/api-reference)** - Explore all available functions

## Tips for Success

1. **Start Simple**: Begin with basic local commands before moving to remote execution
2. **Use TypeScript**: Get full type safety and autocompletion
3. **Handle Errors**: Always consider what happens when commands fail
4. **Test Locally**: Test scripts locally before running on production
5. **Version Control**: Keep your automation scripts in Git

## Common Questions

**Q: How do I pass variables to commands?**
```javascript
const name = "world";
await $`echo "Hello ${name}"`;
```

**Q: How do I use sudo?**
```javascript
// Local
await $`sudo systemctl restart nginx`;

// Remote (with password)
const remote = $.ssh({ 
  host: 'server',
  username: 'user',
  password: 'secret'
});
await remote`echo 'secret' | sudo -S systemctl restart nginx`;
```

**Q: How do I handle interactive prompts?**
```javascript
// Provide input via stdin
await $`npm init`.stdin('my-package\n1.0.0\nMy description\n');
```

Ready to build something amazing? Let's go! 🚀