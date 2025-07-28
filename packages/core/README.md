# @xec-sh/core

> Universal command execution engine with support for local, SSH, Docker, and Kubernetes environments.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)

## 🎯 Overview

@xec-sh/core provides a unified API for executing commands across different environments with a syntax inspired by Google's zx. Write your automation scripts once and run them anywhere - locally, over SSH, in Docker containers, or Kubernetes pods.

## ✨ Features

### Core Capabilities
- **Universal Execution** - Single API for all environments
- **Template Literals** - Natural command syntax with automatic escaping
- **Process Promises** - Async/await with streaming output
- **Type Safety** - Full TypeScript support with detailed types
- **Error Handling** - Comprehensive error types with context

### Advanced Features
- **SSH Tunnels** - Port forwarding with dynamic allocation
- **Connection Pooling** - Reuse SSH connections efficiently
- **Docker Compose** - Full compose support
- **Kubernetes Port Forwarding** - Forward ports from pods
- **Log Streaming** - Real-time logs from containers and pods
- **File Transfer** - Copy files across environments
- **Parallel Execution** - Run commands concurrently
- **Retry Logic** - Automatic retry with backoff
- **Command Suggestions** - Smart typo detection and suggestions
- **Enhanced Errors** - Context-aware error messages with solutions

## 📦 Installation

```bash
npm install @xec-sh/core
# or
yarn add @xec-sh/core
# or
pnpm add @xec-sh/core
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Local execution
const result = await $`echo "Hello, World!"`;
console.log(result.stdout); // Hello, World!

// With error handling
const files = await $`ls -la`.catch(err => {
  console.error('Command failed:', err.message);
});
```

### SSH Execution

```typescript
// Simple SSH
const ssh = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/key'
});

await ssh`uptime`;
await ssh`df -h`;

// SSH with tunnels
const tunnel = await ssh.tunnel({
  remoteHost: 'localhost',
  remotePort: 5432,
  localPort: 5433
});

// Use tunnel for database connection
await $`psql -h localhost -p ${tunnel.localPort} -U postgres`;
await tunnel.close();
```

### Docker Execution

```typescript
// Execute in existing container
const docker = $.docker({ container: 'my-app' });
await docker`npm test`;

// Create and manage container
const container = await $.docker({
  image: 'node:20-alpine',
  name: 'test-app',
  volumes: { '/app': './src' },
  env: { NODE_ENV: 'test' }
}).start();

// Execute commands
await container.exec`npm install`;
await container.exec`npm test`;

// Stream logs
await container.follow(line => console.log(line));

// Clean up
await container.stop();
await container.remove();
```

### Kubernetes Execution

```typescript
// Get pod instance
const pod = $.k8s({ namespace: 'production' }).pod('web-app');

// Execute commands
await pod.exec`cat /etc/hostname`;
await pod.exec`ps aux`;

// Port forwarding
const forward = await pod.portForward(8080, 80);
console.log(`Access app at http://localhost:${forward.localPort}`);

// Stream logs
const logStream = await pod.follow(
  line => console.log(`[LOG] ${line}`),
  { tail: 50, timestamps: true }
);

// Copy files
await pod.copyTo('./config.yaml', '/app/config.yaml');
await pod.copyFrom('/var/log/app.log', './app.log');

// Clean up
logStream.stop();
await forward.close();
```

## 🔧 Configuration

### Global Configuration

```typescript
import { configure } from '@xec-sh/core';

configure({
  shell: '/bin/bash',
  timeout: 30000,
  env: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
});
```

### Per-Command Configuration

```typescript
// Chain configuration methods
await $`npm test`
  .cwd('/app')
  .env({ NODE_ENV: 'test' })
  .timeout(60000)
  .shell('/bin/sh')
  .quiet();

// Retry with exponential backoff
await $`curl https://api.example.com`
  .retry({
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000
  });
```

## 📚 Advanced Usage

### Parallel Execution

```typescript
import { parallel } from '@xec-sh/core';

// Execute multiple commands in parallel
const results = await parallel([
  $`npm install`,
  $`pip install -r requirements.txt`,
  $`bundle install`
], {
  maxConcurrent: 3,
  stopOnError: false
});

// With progress tracking
await parallel(commands, {
  onProgress: (completed, total) => {
    console.log(`Progress: ${completed}/${total}`);
  }
});
```

### Error Handling

#### Basic Error Handling

```typescript
import { CommandError, TimeoutError } from '@xec-sh/core';

try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  } else if (error instanceof TimeoutError) {
    console.log('Command timed out');
  }
}

// Non-throwing mode
const result = await $`might-fail`.nothrow();
if (result.isSuccess()) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed:', result.stderr);
}
```

#### Enhanced Error System

Xec provides an enhanced error system with context-aware messages and suggestions:

```typescript
import { enhanceError, EnhancedExecutionError } from '@xec-sh/core';

try {
  await $.ssh({ host: 'unknown-host' })`date`;
} catch (error) {
  const enhanced = enhanceError(error, {
    cwd: process.cwd(),
    timestamp: new Date()
  }) as EnhancedExecutionError;
  
  console.error(enhanced.message);
  console.error('Details:', enhanced.details);
  console.error('Suggestions:', enhanced.suggestions);
  
  // Output:
  // SSH connection failed: ENOTFOUND
  // Details: { host: 'unknown-host', port: 22, code: 'ENOTFOUND' }
  // Suggestions: [
  //   'Check if the hostname is correct',
  //   'Verify DNS resolution: nslookup unknown-host',
  //   'Try using IP address instead of hostname'
  // ]
}
```

The enhanced error system provides:
- **Contextual Information**: Relevant details about the error
- **Actionable Suggestions**: Steps to resolve the issue
- **Error Classification**: Different error types with specific handling

### Event System

```typescript
// Monitor execution events
$.on('command:start', (event) => {
  console.log(`Starting: ${event.command}`);
});

$.on('command:output', (event) => {
  if (event.stream === 'stderr') {
    console.error(`Error output: ${event.data}`);
  }
});

$.on('ssh:connection:open', (event) => {
  console.log(`Connected to ${event.host}`);
});
```

### Command Suggestions

The command registry system provides intelligent typo detection and suggestions:

```typescript
import { CommandRegistry, checkForCommandTypo } from '@xec-sh/core';

// Create and populate registry
const registry = new CommandRegistry();
registry.registerAll([
  {
    command: 'deploy',
    description: 'Deploy application',
    usage: 'xec deploy [options]'
  },
  {
    command: 'test',
    description: 'Run tests',
    aliases: ['t', 'check']
  }
]);

// Check for typos
const suggestion = checkForCommandTypo('deply', registry);
if (suggestion) {
  console.log(suggestion);
  // Output:
  // Did you mean:
  //   deploy - Deploy application
  //     Usage: xec deploy [options]
}

// Find similar commands
const similar = registry.findSimilarCommands('dep', 3);
// Returns array of matching commands
```

The system uses Levenshtein distance algorithm to find the closest matches and supports:
- Command aliases
- Usage examples
- Formatted suggestions with color support

## 🧪 Testing

Use the mock adapter for unit testing:

```typescript
import { $, MockAdapter } from '@xec-sh/core';

const mock = new MockAdapter();
mock.addResponse('echo test', {
  stdout: 'test',
  stderr: '',
  exitCode: 0
});

const engine = $.with({ adapter: mock });
const result = await engine`echo test`;
expect(result.stdout).toBe('test');
```

## 📖 Examples

Explore the [examples directory](./examples/) for more use cases:

- [Basic Operations](./examples/01-basics/)
- [Adapter Usage](./examples/02-adapters/)
- [Advanced Features](./examples/03-advanced-features/)
- [Event System](./examples/04-event-system/)
- [Utilities](./examples/05-utilities/)
- [Real-World Scenarios](./examples/06-real-world/)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## 📄 License

MIT © [Xec Team](https://github.com/xec-sh)