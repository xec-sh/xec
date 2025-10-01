# Xec - Universal Command Execution System

[![Version](https://img.shields.io/npm/v/@xec-sh/core.svg)](https://npmjs.org/package/@xec-sh/core)
[![License](https://img.shields.io/npm/l/@xec-sh/core.svg)](https://github.com/xec-sh/xec/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**Universal command execution for the modern stack** - A unified TypeScript API for seamless command execution across local, SSH, Docker, and Kubernetes environments.

## 🎯 The Problem

Modern infrastructure spans multiple environments, each requiring different tools and APIs. This fragmentation leads to duplicated code, context switching, inconsistent error handling, and complex deployment scripts.

## ✨ The Solution

Xec provides **one API to rule them all** - the same intuitive template literal syntax works everywhere:

```typescript
import { $ } from '@xec-sh/core';

// Same API, different environments
await $`npm test`;                                    // Local execution
await $.ssh('server.com')`npm test`;                 // SSH execution
await $.docker({ container: 'app' })`npm test`;      // Docker execution
await $.k8s({ pod: 'app-pod' })`npm test`;          // Kubernetes execution
```

## 🚀 Features

### Core Capabilities
- **🌍 Universal Execution Engine** - Single API for all environments
- **📝 Template Literal Magic** - Natural command syntax with `$\`command\``
- **🔄 Multi-Environment Native** - Local, SSH, Docker, Kubernetes adapters
- **⚡ Enterprise Performance** - Connection pooling, parallel execution, streaming
- **🔒 Type-Safe Everything** - Full TypeScript with IntelliSense
- **🛡️ Production Ready** - Automatic retries, proper error handling, secure by default

### v0.8.0 Highlights
- **Enhanced Configuration System** - Interactive config management with custom parameters
- **Script Context Revolution** - Automatic `$target` injection for write-once, run-anywhere scripts
- **Module Loading 2.0** - CDN module support (npm, jsr, esm.sh, unpkg)
- **Documentation Precision** - Every feature verified against implementation

## 📦 Installation

```bash
# Install CLI globally
npm install -g @xec-sh/cli

# Or add to your project
npm install @xec-sh/core
```

## 🎮 Quick Start

### Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Simple command execution
const result = await $`ls -la`;
console.log(result.stdout);

// With error handling
if (result.ok) {
  console.log('Success!');
} else {
  console.error(`Failed: ${result.cause}`);
}
```

### Method Chaining

```typescript
await $`npm test`
  .cwd('/project')
  .env({ NODE_ENV: 'test' })
  .timeout(30000)
  .retry(3);
```

### Multi-Environment Execution

```typescript
// SSH with connection pooling
const server = $.ssh({ 
  host: 'prod.example.com',
  username: 'deploy'
});
await server`docker restart app`;

// Docker with auto-cleanup
await $.docker({ image: 'node:20' })`npm test`;

// Kubernetes with namespace
const k8s = $.k8s({ namespace: 'production' });
await k8s.pod('api-server')`date`;
```

### Write Once, Run Anywhere

New in v0.8.0 - Scripts automatically adapt to their execution context:

```typescript
// script.ts - works in ANY environment
await $target`npm install`;
await $target`npm test`;
await $target`npm run build`;
```

Execute the same script everywhere:
```bash
xec run script.ts                    # Local execution
xec on server.com script.ts          # SSH execution
xec in container-name script.ts      # Docker execution
xec in pod:app-pod script.ts        # Kubernetes execution
```

## 📚 Documentation

- 🏠 [Homepage](https://xec.sh)
- 📖 [Getting Started](https://xec.sh/docs/introduction/quick-start)
- 🔧 [API Reference](https://xec.sh/docs/api)
- 💡 [Examples](./packages/core/examples)
- 📝 [Changelog](https://xec.sh/docs/changelog)

## 🏗️ Project Structure

| Package | Version | Description |
|---------|---------|-------------|
| [@xec-sh/core](./packages/kit) | ![npm](https://img.shields.io/npm/v/@xec-sh/kit) | Terminal prompts and utils |
| [@xec-sh/core](./packages/core) | ![npm](https://img.shields.io/npm/v/@xec-sh/core) | Core execution engine |
| [@xec-sh/cli](./apps/xec) | ![npm](https://img.shields.io/npm/v/@xec-sh/cli) | Command-line interface |
| [@xec-sh/testing](./packages/test-utils) | - | Testing utilities |

## 🛠️ Development

```bash
# Prerequisites
corepack enable          # Enable Yarn 4.9.2
yarn install            # Install dependencies

# Development
yarn dev                # Watch mode
yarn test              # Run tests
yarn build             # Build all packages

# Quality
yarn lint              # Lint code
yarn type-check        # Type checking
yarn test:coverage     # Coverage report
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)

---

<div align="center">
  <strong>Built with ❤️ by developers, for developers</strong>
  <br>
  <sub>Making command execution universal, type-safe, and delightful</sub>
</div>