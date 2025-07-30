---
sidebar_position: 6
---

# Troubleshooting Guide

Common issues and solutions when using Xec CLI.

## Installation Issues

### Command Not Found

**Problem**: `xec: command not found` after installation

**Solutions**:

1. **Check installation**:
```bash
# Verify global installation
npm list -g @xec-sh/cli

# Check local installation
npm list @xec-sh/cli
```

2. **Update PATH**:
```bash
# Add npm global bin to PATH
export PATH="$(npm config get prefix)/bin:$PATH"

# Make permanent (add to ~/.bashrc or ~/.zshrc)
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
```

3. **Reinstall globally**:
```bash
# Uninstall if exists
npm uninstall -g @xec-sh/cli

# Reinstall
npm install -g @xec-sh/cli
```

### Permission Denied During Installation

**Problem**: `EACCES` error when installing globally

**Solutions**:

1. **Use a Node Version Manager** (Recommended):
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js
nvm install 18
nvm use 18

# Install Xec
npm install -g @xec-sh/cli
```

2. **Change npm's default directory**:
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm install -g @xec-sh/cli
```

3. **Use npx** (No installation needed):
```bash
npx @xec-sh/cli script.js
```

## Script Execution Issues

### Module Not Found

**Problem**: `Cannot find module '@xec-sh/core'`

**Solution**: Install core package in your project:
```bash
npm install @xec-sh/core
# or
yarn add @xec-sh/core
```

### TypeScript Errors

**Problem**: TypeScript syntax errors when running `.ts` files

**Solutions**:

1. **Enable TypeScript support**:
```bash
# Install TypeScript dependencies
npm install -D typescript @types/node

# Create tsconfig.json
xec init --typescript
```

2. **Use explicit loader**:
```bash
xec --loader=ts-node/esm script.ts
```

### Import/Export Errors

**Problem**: `SyntaxError: Cannot use import statement outside a module`

**Solutions**:

1. **Add type to package.json**:
```json
{
  "type": "module"
}
```

2. **Use `.mjs` extension**:
```bash
mv script.js script.mjs
xec script.mjs
```

3. **Use require syntax** (CommonJS):
```javascript
const { $ } = require('@xec-sh/core');
```

## SSH Connection Issues

### Authentication Failed

**Problem**: `Permission denied (publickey)`

**Solutions**:

1. **Check SSH key**:
```bash
# Test SSH connection directly
ssh -v user@host

# Check key permissions
chmod 600 ~/.ssh/id_rsa
chmod 700 ~/.ssh
```

2. **Specify key explicitly**:
```javascript
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  privateKey: '/path/to/key'
});
```

3. **Use SSH agent**:
```bash
# Add key to agent
ssh-add ~/.ssh/id_rsa

# Verify key is loaded
ssh-add -l
```

### Connection Timeout

**Problem**: SSH connections timing out

**Solutions**:

1. **Increase timeout**:
```javascript
const ssh = $.ssh({
  host: 'server.com',
  readyTimeout: 30000,  // 30 seconds
  timeout: 60000        // 60 seconds
});
```

2. **Check network**:
```bash
# Test connectivity
ping server.com
telnet server.com 22
```

3. **Use keep-alive**:
```javascript
const ssh = $.ssh({
  host: 'server.com',
  keepaliveInterval: 5000,
  keepaliveCountMax: 3
});
```

### Host Key Verification Failed

**Problem**: `Host key verification failed`

**Solutions**:

1. **Add host to known_hosts**:
```bash
ssh-keyscan -H server.com >> ~/.ssh/known_hosts
```

2. **Disable strict checking** (Development only!):
```javascript
const ssh = $.ssh({
  host: 'server.com',
  strictHostKeyChecking: false
});
```

## Docker Issues

### Cannot Connect to Docker Daemon

**Problem**: `Cannot connect to the Docker daemon`

**Solutions**:

1. **Start Docker**:
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker

# Check status
docker ps
```

2. **Add user to docker group** (Linux):
```bash
sudo usermod -aG docker $USER
newgrp docker
```

3. **Check Docker socket**:
```bash
# Check permissions
ls -la /var/run/docker.sock

# Fix permissions (temporary)
sudo chmod 666 /var/run/docker.sock
```

### Container Not Found

**Problem**: `No such container` errors

**Solution**: Check container status:
```javascript
// List all containers
await $`docker ps -a`;

// Use correct container name/ID
const container = $.docker({ container: 'actual-name' });
```

## Kubernetes Issues

### kubectl Not Found

**Problem**: `kubectl: command not found`

**Solutions**:

1. **Install kubectl**:
```bash
# macOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

2. **Specify kubectl path**:
```javascript
$.config.set({
  kubernetes: {
    kubectlPath: '/usr/local/bin/kubectl'
  }
});
```

### No Context Found

**Problem**: `The connection to the server was refused`

**Solutions**:

1. **Check kubeconfig**:
```bash
# List contexts
kubectl config get-contexts

# Use specific context
kubectl config use-context my-context
```

2. **Specify in Xec**:
```javascript
const k8s = $.k8s({
  context: 'my-context',
  kubeconfig: '~/.kube/config'
});
```

### Pod Not Ready

**Problem**: Commands fail because pod is not ready

**Solution**: Wait for pod readiness:
```javascript
// Wait for pod to be ready
await $`kubectl wait --for=condition=ready pod/my-pod --timeout=60s`;

// Then execute commands
const pod = $.k8s().pod('my-pod');
await pod.exec`ls -la`;
```

## Performance Issues

### Slow SSH Commands

**Problem**: SSH commands taking too long

**Solutions**:

1. **Enable connection pooling** (automatic in Xec):
```javascript
// Reuse connections
const ssh = $.ssh({ host: 'server.com' });
await ssh`command1`;  // New connection
await ssh`command2`;  // Reuses connection
await ssh`command3`;  // Reuses connection
```

2. **Use multiplexing**:
```bash
# ~/.ssh/config
Host *
  ControlMaster auto
  ControlPath ~/.ssh/sockets/%r@%h-%p
  ControlPersist 600
```

3. **Batch commands**:
```javascript
// Instead of multiple calls
await ssh`cd /app && git pull`;
await ssh`cd /app && npm install`;
await ssh`cd /app && npm run build`;

// Use single call
await ssh`cd /app && git pull && npm install && npm run build`;
```

### Memory Issues

**Problem**: `JavaScript heap out of memory`

**Solutions**:

1. **Increase memory limit**:
```bash
xec --node-options="--max-old-space-size=4096" script.js
```

2. **Stream large outputs**:
```javascript
// Instead of buffering
const result = await $`cat large-file.txt`;

// Stream it
await $`cat large-file.txt`.pipe(process.stdout);
```

3. **Process in chunks**:
```javascript
// Process files in batches
const files = await $`find . -name "*.log"`.lines();
const chunks = chunk(files, 100);

for (const batch of chunks) {
  await processFiles(batch);
}
```

## Debugging Techniques

### Enable Debug Mode

```bash
# Debug output
xec --debug script.js

# Verbose output
xec --verbose script.js

# Environment variable
XEC_DEBUG=true xec script.js
```

### Log All Commands

```javascript
// Add command logging
$.on('command:start', (event) => {
  console.log(`[CMD] ${event.command}`);
});

$.on('command:end', (event) => {
  console.log(`[DONE] Exit code: ${event.exitCode}`);
});
```

### Inspect SSH Traffic

```javascript
// Enable SSH debug
const ssh = $.ssh({
  host: 'server.com',
  debug: true
});

// Or use verbose SSH
await $`ssh -v user@server.com command`;
```

### Test Commands Locally First

```javascript
// Dry run mode
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  $.on('command:start', (event) => {
    console.log(`[DRY RUN] Would execute: ${event.command}`);
    event.preventDefault();
  });
}
```

## Error Recovery

### Automatic Retry

```javascript
// Retry failed commands
async function retryCommand(cmd, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await cmd();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Usage
const result = await retryCommand(() => 
  $`curl https://flaky-api.com/data`
);
```

### Graceful Cleanup

```javascript
// Ensure cleanup on exit
let cleanup = [];

process.on('SIGINT', async () => {
  console.log('\nCleaning up...');
  for (const fn of cleanup) {
    await fn();
  }
  process.exit(0);
});

// Register cleanup
const container = await $.docker({ image: 'test' }).start();
cleanup.push(() => container.remove());
```

### Error Context

```javascript
// Add context to errors
try {
  await riskyOperation();
} catch (error) {
  throw new Error(`Failed during deployment to ${environment}: ${error.message}`);
}
```

## Getting More Help

### Built-in Help

```bash
# General help
xec --help

# Command help
xec ssh --help

# Show all available commands
xec help commands
```

### Debug Information

```javascript
// Print system information
console.log('Xec version:', await $`xec --version`);
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
console.log('Working directory:', process.cwd());
```

### Community Support

- **GitHub Issues**: [github.com/xec-sh/xec/issues](https://github.com/xec-sh/xec/issues)
- **Discussions**: [github.com/xec-sh/xec/discussions](https://github.com/xec-sh/xec/discussions)
- **Stack Overflow**: Tag questions with `xec-cli`

### Reporting Bugs

When reporting issues, include:

1. **Environment details**:
```bash
xec --version
node --version
npm --version
echo $SHELL
uname -a
```

2. **Minimal reproduction**:
```javascript
// Simplest code that reproduces the issue
import { $ } from '@xec-sh/core';
await $`problematic command`;
```

3. **Full error message** including stack trace

4. **What you expected** vs what happened

## Common Patterns

### Safe Command Execution

```javascript
// Always handle errors
const result = await $`risky-command`.nothrow();
if (!result.isSuccess()) {
  console.error('Command failed:', result.stderr);
  // Handle failure gracefully
}
```

### Resource Management

```javascript
// Use try/finally for cleanup
const resources = [];

try {
  const ssh = $.ssh({ host: 'server.com' });
  resources.push(ssh);
  
  const tunnel = await ssh.tunnel({ localPort: 3306, remotePort: 3306 });
  resources.push(tunnel);
  
  // Use resources
  await doWork();
} finally {
  // Always cleanup
  for (const resource of resources.reverse()) {
    await resource.dispose?.();
  }
}
```

### Timeout Handling

```javascript
// Set reasonable timeouts
const result = await $`long-running-command`.timeout(30000);

// Or with custom handling
try {
  await $`very-long-command`.timeout(60000);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.error('Command timed out after 60 seconds');
    // Kill any related processes
  }
}
```