# @xec-sh/core Examples

This directory contains comprehensive examples demonstrating the capabilities of @xec-sh/core, organized by complexity and use case.

## 📁 Directory Structure

### 01-basics/ - Core Fundamentals
- **01-hello-world.ts** - Simplest command execution
- **02-command-execution.ts** - Various execution methods
- **03-template-literals.ts** - Safe interpolation and escaping
- **04-environment-variables.ts** - Environment variable management
- **05-working-directory.ts** - Directory navigation

### 02-adapters/ - Environment Adapters
- **01-local-adapter.ts** - Local command execution
- **02-ssh-adapter.ts** - SSH remote execution
- **03-docker-adapter.ts** - Docker container execution
- **04-kubernetes-adapter.ts** - Kubernetes pod execution
- **05-remote-docker-adapter.ts** - Docker over SSH

### 03-advanced-features/ - Advanced Capabilities
- **01-piping.ts** - Command piping and data flow
- **02-parallel-execution.ts** - Concurrent command execution
- **03-streaming.ts** - Real-time output streaming
- **04-error-handling.ts** - Comprehensive error management
- **05-retry-mechanisms.ts** - Automatic retry with backoff
- **06-events.ts** - Event system and monitoring
- **07-progress-tracking.ts** - Progress monitoring
- **08-result-caching.ts** - Command result caching
- **09-ssh-connection-pool.ts** - SSH connection pooling
- **10-ssh-tunnels.ts** - SSH port forwarding
- **11-docker-lifecycle.ts** - Container lifecycle management
- **12-docker-streaming.ts** - Docker log streaming
- **13-kubernetes-port-forwarding.ts** - K8s port forwarding and logs

### 04-event-system/ - Event Monitoring
- **01-enhanced-events.ts** - Comprehensive event handling

### 05-utilities/ - Helper Functions
- **01-temp-files.ts** - Temporary file management
- **02-file-transfer.ts** - Cross-environment file transfer
- **03-interactive-prompts.ts** - User interaction
- **04-secure-passwords.ts** - Secure credential handling
- **05-shell-escaping.ts** - Safe command construction

### 06-real-world/ - Production Scenarios
- **01-git-operations.ts** - Git automation
- **02-build-automation.ts** - Build pipeline automation
- **03-system-monitoring.ts** - System health monitoring
- **04-deployment-automation.ts** - Deployment workflows
- **05-database-operations.ts** - Database management
- **06-api-server-automation.ts** - API server control

## 🚀 Running Examples

### Prerequisites
```bash
# Install dependencies
cd packages/core
yarn install
```

### Execute Examples
```bash
# Using tsx (recommended)
tsx examples/01-basics/01-hello-world.ts

# Using ts-node
ts-node examples/01-basics/01-hello-world.ts

# Using Node.js with loader
node --loader tsx examples/01-basics/01-hello-world.ts
```

## 💡 Key Concepts

### Template Literal API
```typescript
import { $ } from '@xec-sh/core';

// Basic execution
await $`echo "Hello, World!"`;

// Safe interpolation
const file = "my file.txt";
await $`cat ${file}`; // Automatically escaped
```

### Environment Adapters
```typescript
// SSH execution
const ssh = $.ssh({ host: 'server.com', username: 'user' });
await ssh`uptime`;

// Docker execution
const container = await $.docker({ image: 'node:20' }).start();
await container.exec`npm test`;

// Kubernetes execution
const pod = $.k8s().pod('web-app');
await pod.exec`date`;
```

### Advanced Features
```typescript
// Parallel execution
import { parallel } from '@xec-sh/core';
await parallel([$`task1`, $`task2`, $`task3`]);

// Error handling
const result = await $`risky-command`.nothrow();
if (result.isSuccess()) {
  console.log(result.stdout);
}

// Event monitoring
$.on('command:start', (event) => {
  console.log(`Executing: ${event.command}`);
});
```

## 📚 Learning Path

1. **Start with Basics** - Understand core concepts in `01-basics/`
2. **Explore Adapters** - Learn different execution environments in `02-adapters/`
3. **Master Advanced Features** - Study advanced patterns in `03-advanced-features/`
4. **Understand Events** - Learn event-driven patterns in `04-event-system/`
5. **Use Utilities** - Leverage helper functions in `05-utilities/`
6. **Apply to Real World** - See production examples in `06-real-world/`

## 🔗 Additional Resources

- [API Documentation](../README.md)
- [TypeScript Types](../src/types/)
- [Test Examples](../test/)
- [Core Improvements](../docs/CORE_IMPROVEMENTS.md)

## 🤝 Contributing

Have an interesting use case? Feel free to contribute examples! Please ensure:
- Clear, descriptive comments
- Error handling demonstration
- Real-world applicability
- TypeScript best practices

## 📄 License

MIT © [Xec Team](https://github.com/xec-sh)