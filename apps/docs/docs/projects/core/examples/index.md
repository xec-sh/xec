---
sidebar_position: 1
---

# Core Examples Overview

Learn by example! This section contains practical examples demonstrating all features of `@xec-sh/core`.

## Example Categories

The examples are organized into categories to help you find what you need. You can find the complete example source code on [GitHub](https://github.com/xec-sh/xec/tree/main/packages/core/examples).

### 📚 Basic Examples
Start here if you're new to Xec:
- Hello World
- Command execution
- Template literals
- Environment variables
- Working directories

### 🔌 Adapter Examples
Learn how to work with different environments:
- Local execution
- SSH remote execution
- Docker containers
- Kubernetes pods
- Remote Docker

### 🚀 Advanced Features
Explore powerful capabilities:
- Command piping
- Parallel execution
- Output streaming
- Error handling
- Retry mechanisms
- Event handling
- Progress tracking
- Result caching
- SSH tunnels and connection pooling
- Docker lifecycle management
- Kubernetes port forwarding

### 🛠️ Utilities
Helper functions and utilities:
- Temporary files and directories
- File transfers
- Interactive prompts
- Secure password handling
- Shell escaping

### 🌍 Real-World Scenarios
Complete automation examples:
- Git operations
- Build automation
- System monitoring
- Deployment automation
- Database operations
- API server management

## Quick Examples

### Basic Command Execution

```typescript
import { $ } from '@xec-sh/core';

// Simple command
await $`echo "Hello, Xec!"`;

// Capture output
const result = await $`date`;
console.log('Current date:', result.stdout);

// Use variables
const name = "World";
await $`echo "Hello, ${name}!"`;
```

### Working with SSH

```typescript
// Connect to remote server
const remote = $.ssh({
  host: 'example.com',
  username: 'user'
});

// Execute commands
await remote`uname -a`;
await remote`df -h`;

// Transfer files
await remote.uploadFile('./local.txt', '/remote/path.txt');
```

### Docker Operations

```typescript
// Run in existing container
const container = $.docker({ container: 'myapp' });
await container`npm test`;

// Create new container
const test = await $.docker({
  image: 'node:18',
  name: 'test-env'
}).start();

await test.exec`npm install`;
await test.exec`npm test`;
await test.remove();
```

### Kubernetes Management

```typescript
// Work with pods
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('app-server');

// Execute commands
await pod.exec`ps aux`;

// Stream logs
await pod.follow(line => console.log(line));

// Port forwarding
const forward = await pod.portForward(8080, 80);
```

### Error Handling

```typescript
// Don't throw on error
const result = await $`test -f missing.txt`.nothrow();
if (!result.isSuccess()) {
  console.log('File not found');
}

// Retry on failure
await $`curl https://api.example.com/health`.retry({
  maxAttempts: 3,
  backoff: 'exponential'
});
```

### Parallel Execution

```typescript
import { parallel } from '@xec-sh/core';

// Run multiple commands concurrently
const results = await parallel([
  () => $`npm install`,
  () => $`npm run lint`,
  () => $`npm test`
], { maxConcurrent: 2 });
```

## Running the Examples

### Clone the Repository

```bash
git clone https://github.com/xec-sh/xec.git
cd xec/packages/core/examples
```

### Install Dependencies

```bash
npm install
```

### Run Individual Examples

```bash
# Run with ts-node
npx ts-node 01-basics/01-hello-world.ts

# Or compile and run
npx tsc 01-basics/01-hello-world.ts
node 01-basics/01-hello-world.js
```

### Environment Setup

Some examples require specific environments:

#### SSH Examples
- Requires SSH access to a remote server
- Set environment variables:
  ```bash
  export SSH_HOST=example.com
  export SSH_USER=username
  export SSH_KEY_PATH=~/.ssh/id_rsa
  ```

#### Docker Examples
- Requires Docker installed and running
- Pull required images:
  ```bash
  docker pull node:18
  docker pull alpine:latest
  ```

#### Kubernetes Examples
- Requires kubectl configured
- Ensure you have access to a cluster:
  ```bash
  kubectl cluster-info
  ```

## Example Structure

Each example follows this pattern:

```typescript
/**
 * Example Name - Brief Description
 * 
 * This example demonstrates:
 * - Feature 1
 * - Feature 2
 * 
 * Prerequisites:
 * - Requirement 1
 * - Requirement 2
 */

import { $ } from '@xec-sh/core';

async function main() {
  // Example implementation
}

// Run the example
main().catch(console.error);
```

## Learning Path

### Beginners
1. Start with Hello World
2. Learn Command Execution
3. Understand Template Literals
4. Explore Environment Variables

### Intermediate
1. Try different Adapters
2. Learn Error Handling
3. Use Parallel Execution
4. Implement Retry Logic

### Advanced
1. Master SSH Tunnels
2. Manage Docker Lifecycles
3. Use Kubernetes Port Forwarding
4. Build Complete Automations

## Contributing Examples

We welcome new examples! To contribute:

1. Create a new example file in the appropriate category
2. Follow the example structure pattern
3. Include clear comments and documentation
4. Test the example thoroughly
5. Submit a pull request

## Tips for Learning

1. **Start Simple**: Begin with basic examples before moving to advanced ones
2. **Run the Code**: Don't just read - execute the examples
3. **Modify Examples**: Change the examples to understand how they work
4. **Check Errors**: Intentionally break things to understand error handling
5. **Combine Features**: Try combining different features in new ways

## Common Patterns

### Sequential Operations
```typescript
await $`npm install`;
await $`npm test`;
await $`npm build`;
```

### Conditional Execution
```typescript
const hasGit = await $`which git`.nothrow();
if (hasGit.isSuccess()) {
  await $`git pull`;
}
```

### Resource Cleanup
```typescript
const container = await $.docker({ image: 'test' }).start();
try {
  await container.exec`run-tests`;
} finally {
  await container.remove();
}
```

### Progress Reporting
```typescript
const files = ['file1', 'file2', 'file3'];
for (const [index, file] of files.entries()) {
  console.log(`Processing ${index + 1}/${files.length}`);
  await $`process ${file}`;
}
```

## Troubleshooting Examples

### Command Not Found
```typescript
// Check if command exists
const hasCommand = await $`which mycommand`.nothrow();
if (!hasCommand.isSuccess()) {
  console.error('mycommand is not installed');
}
```

### SSH Connection Issues
```typescript
try {
  const remote = $.ssh({ host: 'server', username: 'user' });
  await remote`echo "Connected"`;
} catch (error) {
  console.error('SSH connection failed:', error.message);
}
```

### Docker Container Issues
```typescript
// Check if Docker is running
const dockerCheck = await $`docker info`.nothrow();
if (!dockerCheck.isSuccess()) {
  console.error('Docker is not running');
}
```

## Next Steps

- Browse the [complete example collection](https://github.com/xec-sh/xec/tree/main/packages/core/examples)
- Read the [API Reference](../api-reference) for detailed documentation
- Join our [community](https://github.com/xec-sh/xec/discussions) to share your examples
- Create your own automation projects using these patterns

Happy coding with Xec! 🚀