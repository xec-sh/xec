# @xec-js/ush

Universal Shell Execution Engine - A powerful, flexible, and beginner-friendly command execution library for Node.js and TypeScript. Execute commands seamlessly across different environments (local, SSH, Docker, Kubernetes) with a unified, intuitive API inspired by Google's `zx`.

## 🎯 Why @xec-js/ush?

- **Write Once, Run Anywhere**: Same code works locally, over SSH, in Docker containers, or Kubernetes pods
- **Type-Safe**: Full TypeScript support with excellent IDE integration
- **Beginner-Friendly**: Intuitive API that feels like writing shell scripts
- **Production-Ready**: Built-in error handling, retry logic, and connection pooling
- **Testing-First**: Mock adapter for easy unit testing

## 📦 Installation

```bash
npm install @xec-js/ush
# or
yarn add @xec-js/ush
```

## 🚀 Quick Start

```javascript
import { $ } from '@xec-js/ush';

// Execute local commands
await $`echo "Hello, World!"`;

// Work with different environments
const $remote = $.ssh('user@server.com');
await $remote`npm install && npm test`;

// Chain configurations
await $`npm test`
  .cwd('/projects/app')
  .env({ NODE_ENV: 'test' })
  .timeout(30000)
  .retry({ maxRetries: 3 });
```

## 📚 Documentation

### Getting Started
- [Installation & Quick Start](./docs/getting-started.md) - Setup and first steps
- [Core Concepts](./docs/core-concepts.md) - Fundamental concepts and architecture

### Core Features
- [Command Execution](./docs/command-execution.md) - Executing commands and handling results
- [Configuration](./docs/configuration.md) - Configuring execution options
- [Error Handling](./docs/error-handling.md) - Managing errors and exceptions
- [Retry Logic](./docs/retry-logic.md) - Implementing retry patterns

### Environments
- [Working with Environments](./docs/environments.md) - SSH, Docker, Kubernetes, and more

### Advanced Topics
- [Advanced Features](./docs/advanced-features.md) - Streaming, parallel execution, templates
- [Real-World Examples](./docs/examples.md) - Complete examples and patterns

### Reference
- [API Reference](./docs/api-reference.md) - Complete API documentation
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## 📄 License

MIT © [Xec Team](https://github.com/xec-sh)