# Xec - Universal Command Execution System

Universal TypeScript interface for executing commands across local, SSH, Docker, and Kubernetes environments.

## Features

- **Universal API** - Single interface for all execution environments
- **Type-Safe** - Full TypeScript support with comprehensive type definitions
- **Template Literals** - Natural command syntax with automatic escaping
- **Multi-Environment** - Local, SSH, Docker, Kubernetes adapters included
- **Performance** - Connection pooling, parallel execution, streaming support

## Quick Start

```bash
# Install CLI globally
npm install -g @xec-sh/cli

# Install core library
npm install @xec-sh/core
```

```typescript
import { $ } from '@xec-sh/core';

// Local execution
await $`echo "Hello, World!"`;

// SSH execution
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`uname -a`;

// Docker execution
const container = $.docker({ image: 'node:18' });
await container.exec`npm --version`;

// Kubernetes execution
const k8s = $.k8s({ namespace: 'default' });
await k8s.pod('my-app').exec`date`;
```

## Packages

| Package | Description |
|---------|-------------|
| [@xec-sh/core](./packages/core) | Core execution engine with adapters |
| [@xec-sh/cli](./apps/xec) | Command-line interface |
| [@xec-sh/test-utils](./packages/test-utils) | Testing utilities |

## Documentation

- [Getting Started](https://xec.sh/docs/getting-started/quick-start)
- [Core Documentation](https://xec.sh/docs/projects/core)
- [CLI Documentation](https://xec.sh/docs/projects/cli)
- [Examples](./packages/core/examples)

## Development

```bash
# Setup
corepack enable
yarn install

# Build
yarn build

# Test
yarn test

# Development mode
yarn dev
```

## License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)