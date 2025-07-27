---
sidebar_position: 1
---

# @xec-sh/core - Universal Execution Engine

The `@xec-sh/core` package is a powerful, type-safe command execution engine that provides a unified API for running commands across multiple environments - local, SSH, Docker, Kubernetes, and more.

## 🎯 Why @xec-sh/core?

- **Universal API**: Same elegant syntax works everywhere - local machine, remote servers, containers, pods
- **Type Safety**: Full TypeScript support with comprehensive type definitions and IntelliSense
- **Security First**: Automatic command escaping, SSH key validation, secure credential handling
- **Performance**: Connection pooling, result caching, parallel execution with concurrency control
- **Developer Experience**: Template literals, streaming output, detailed events, retry logic
- **Extensible**: Create custom adapters for any execution environment

## 🚀 Quick Start

### Installation

```bash
# npm
npm install @xec-sh/core

# yarn
yarn add @xec-sh/core

# pnpm
pnpm add @xec-sh/core
```

### Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Local execution with template literals
const name = "world";
await $`echo "Hello, ${name}!"`;

// SSH execution
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`uname -a`;

// Docker execution
const container = await $.docker({ 
  image: 'node:18',
  name: 'my-app' 
}).start();
await container.exec`npm test`;

// Kubernetes execution
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('app-server');
await pod.exec`date`;
```

## 📚 Documentation Structure

### Getting Started
- [**Installation**](./getting-started/installation) - Setup and requirements
- [**Basic Concepts**](./getting-started/basic-concepts) - Core concepts and philosophy
- [**First Steps**](./getting-started/first-steps) - Your first commands

### Core Features
- [**Command Execution**](./core-features/command-execution) - The $ function and execution modes
- [**Template Literals**](./core-features/template-literals) - Safe interpolation and escaping
- [**Process Promise**](./core-features/process-promise) - Working with command results
- [**Configuration**](./core-features/configuration) - Global and per-command settings

### Execution Adapters
- [**Local Adapter**](./adapters/local) - Execute on local machine
- [**SSH Adapter**](./adapters/ssh) - Remote execution via SSH
- [**Docker Adapter**](./adapters/docker) - Container execution and lifecycle
- [**Kubernetes Adapter**](./adapters/kubernetes) - Pod operations and port forwarding
- [**Remote Docker**](./adapters/remote-docker) - Docker over SSH

### Advanced Features
- [**Parallel Execution**](./advanced/parallel-execution) - Run multiple commands concurrently
- [**Streaming**](./advanced/streaming) - Real-time output and log streaming
- [**Error Handling**](./advanced/error-handling) - Comprehensive error management
- [**Retry Logic**](./advanced/retry-logic) - Automatic retry with backoff strategies
- [**Event System**](./advanced/event-system) - Monitor and react to execution events
- [**Result Caching**](./advanced/caching) - Cache expensive command results
- [**Connection Pooling**](./advanced/connection-pooling) - Efficient SSH connection reuse
- [**Progress Tracking**](./advanced/progress-tracking) - Build custom progress indicators

### Utilities
- [**Temporary Files**](./utilities/temp-files) - Safe temporary file management
- [**File Transfer**](./utilities/file-transfer) - Copy files between systems
- [**Shell Escaping**](./utilities/shell-escaping) - Command safety utilities
- [**Secure Passwords**](./utilities/secure-passwords) - Credential management
- [**Interactive Prompts**](./utilities/interactive-prompts) - User interaction patterns

### API Reference
- [**Execution Engine**](./api-reference/execution-engine) - Core engine API
- [**Process Promise**](./api-reference/process-promise) - Command result API
- [**Adapters**](./api-reference/adapters) - Adapter interfaces
- [**Events**](./api-reference/events) - Event types and handling
- [**Types**](./api-reference/types) - TypeScript type definitions

## 💡 Key Features Overview

### 🔐 Security Features
- **Automatic Escaping**: All interpolated values are safely escaped
- **SSH Key Validation**: Validate SSH keys before use
- **Secure Credentials**: Memory-safe password handling
- **Sanitized Logging**: Sensitive data masked in logs

### ⚡ Performance Features
- **Connection Pooling**: Reuse SSH connections automatically
- **Result Caching**: Cache expensive command results
- **Parallel Execution**: Run commands concurrently with limits
- **Streaming**: Process output without buffering

### 🛠 Developer Experience
- **Template Literals**: Natural command syntax with safety
- **Type Safety**: Full TypeScript support
- **Rich Results**: Multiple output formats (.text(), .json(), .lines())
- **Event System**: Monitor execution lifecycle
- **Error Context**: Detailed error information

### 🔌 Extensibility
- **Custom Adapters**: Create adapters for any environment
- **Event Hooks**: React to any execution event
- **Middleware**: Transform commands and results
- **Plugin System**: Extend with custom functionality

## 📝 Common Use Cases

### DevOps Automation
```typescript
// Deploy application
const server = $.ssh({ host: 'prod.example.com' });
await server`cd /app && git pull && npm install && npm run build`;
```

### CI/CD Pipelines
```typescript
// Run tests in Docker
const test = await $.docker({ image: 'node:18' }).start();
await test.exec`npm ci && npm test`;
```

### System Administration
```typescript
// Monitor multiple servers
const servers = ['web1', 'web2', 'web3'].map(host => 
  $.ssh({ host: `${host}.example.com` })
);
await Promise.all(servers.map(s => s`df -h`));
```

### Container Management
```typescript
// Manage Docker containers
const app = await $.docker({ 
  image: 'myapp:latest',
  ports: { '3000': '3000' }
}).start();

// Stream logs
await app.follow(line => console.log(`[APP] ${line}`));
```

### Kubernetes Operations
```typescript
// Port forwarding and debugging
const k8s = $.k8s({ namespace: 'staging' });
const pod = k8s.pod('debug-pod');
const forward = await pod.portForward(9229, 9229);
console.log(`Debug at localhost:${forward.localPort}`);
```

## 🎓 Learning Path

1. **Start Here**: Read [Basic Concepts](./getting-started/basic-concepts) to understand the philosophy
2. **Try Examples**: Follow [First Steps](./getting-started/first-steps) for hands-on learning
3. **Master Basics**: Learn about [Command Execution](./core-features/command-execution) and [Template Literals](./core-features/template-literals)
4. **Explore Adapters**: Try different execution environments with our [adapter guides](./adapters/local)
5. **Go Advanced**: Dive into [parallel execution](./advanced/parallel-execution), [streaming](./advanced/streaming), and [events](./advanced/event-system)
6. **Build Something**: Check our [real-world examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples/06-real-world)

## 🤝 Getting Help

- **Examples**: Browse our [comprehensive examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples)
- **API Reference**: Check the detailed [API documentation](./api-reference/execution-engine)
- **GitHub Issues**: Report bugs or request features at [github.com/xec-sh/xec/issues](https://github.com/xec-sh/xec/issues)
- **Discussions**: Join the community at [github.com/xec-sh/xec/discussions](https://github.com/xec-sh/xec/discussions)

## 📄 License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)