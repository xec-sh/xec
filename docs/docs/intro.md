---
sidebar_position: 1
---

# Introduction to Xec: The Universal Shell for TypeScript

Welcome to **Xec** - the universal shell that lets you write once and execute anywhere. Xec provides a single, elegant TypeScript interface to run commands on your local machine, remote servers via SSH, in Docker containers, or Kubernetes pods.

## One Interface. Any Environment.

Xec is not just another process execution library - it's a fundamental rethink of how we interact with command execution in the TypeScript ecosystem:

- **Fluent & Familiar API** - Enjoy a `zx`-like syntax with template literals. No more awkward `spawn` or `exec` calls
- **Seamless Context Switching** - Jump from your local machine into an SSH session or a Docker container with a single method call
- **Robust and Type-Safe** - Built with TypeScript and a `Result`-based error handling model for reliable, maintainable execution logic
- **Batteries-Included** - Ready to use with adapters for Local, SSH, Docker, and Kubernetes environments out of the box
- **Designed for Complex Scripting** - Full TypeScript power with immutable configuration and interactive prompts

## Core Features

### Template Literal Command Execution
```typescript
import { $ } from '@xec-sh/core';

// Execute commands using template literals
await $`echo "Hello, World!"`;

// Variables are automatically escaped for safety
const filename = "file with spaces.txt";
await $`touch ${filename}`;  // Safe execution
```

### Execution Adapters

Xec provides adapters that allow command execution in different environments using the same API:

- **Local Adapter** - Execute commands on the local machine
- **SSH Adapter** - Execute commands on remote servers via SSH
- **Docker Adapter** - Execute commands inside Docker containers  
- **Kubernetes Adapter** - Execute commands in Kubernetes pods
- **Remote Docker Adapter** - Execute Docker commands on remote hosts

### Command Result Handling
```typescript
// Every command returns detailed execution results
const result = await $`ls -la`;
console.log(result.stdout);      // Standard output
console.log(result.stderr);      // Standard error
console.log(result.exitCode);    // Exit code
console.log(result.isSuccess()); // Success check
```

### Environment Control
```typescript
// Change working directory
const $tmp = $.cd('/tmp');

// Set environment variables
const $env = $.env({ NODE_ENV: 'production' });

// Configure shell
const $bash = $.shell('/bin/bash');

// Set command timeout
const $timeout = $.timeout(5000);
```

### Advanced Features

#### Parallel Execution
```typescript
import { parallel } from '@xec-sh/core';

// Execute multiple commands concurrently
const results = await parallel([
  $`npm install`,
  $`npm run build`,
  $`npm test`
], { maxConcurrent: 2 });
```

#### Error Handling
```typescript
// Don't throw on non-zero exit codes
const result = await $`grep pattern file.txt`.nothrow();
if (!result.isSuccess()) {
  console.log('Pattern not found');
}

// Automatic retries
await $`curl http://api.example.com`.retry(3);
```

#### Streaming
```typescript
// Stream command output in real-time
await $`tail -f /var/log/app.log`.stream();

// Process output line by line
await $`find . -name "*.js"`.pipe(async (line) => {
  console.log('Found:', line);
});
```

#### SSH Tunnels and Port Forwarding
```typescript
// Create SSH tunnel
const ssh = $.ssh({ host: 'server.com', username: 'user' });
const tunnel = await ssh.tunnel({
  localPort: 3306,
  remoteHost: 'database.internal',
  remotePort: 3306
});

// Kubernetes port forwarding
const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('web-app');
const forward = await pod.portForward(8080, 80);
```

#### File Operations
```typescript
// Transfer files over SSH
await ssh.uploadFile('./local.txt', '/remote/path.txt');
await ssh.downloadFile('/remote/file.txt', './local-copy.txt');

// Copy files to/from Kubernetes pods
await pod.copyTo('./config.json', '/app/config.json');
await pod.copyFrom('/app/logs/app.log', './app.log');
```

## Package Components

### @xec-sh/cli
Command-line interface that provides:
- Direct command execution: `xec "echo Hello"`
- Script execution: `xec script.ts`
- REPL mode for interactive use
- Project management utilities

### @xec-sh/core
The core library providing:
- The `$` function for command execution
- Execution adapters for different environments
- Utility functions for parallel execution, retries, and more
- Event system for monitoring execution
- Connection pooling and resource management

## Who Should Use Xec?

Xec is ideal for:
- **Developers** who want to write shell scripts in TypeScript/JavaScript
- **DevOps engineers** who need type-safe automation scripts
- **System administrators** who want better error handling and debugging
- **Anyone** who prefers JavaScript/TypeScript over traditional shell scripting

## Next Steps

- Follow the [Quick Start Guide](/docs/getting-started/quick-start) to install and start using Xec
- Explore the [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) to see Xec in action
- Read the [Core Documentation](/docs/projects/core) for detailed API reference

Xec brings the power and flexibility of modern programming languages to shell scripting while maintaining the simplicity and directness of command execution.