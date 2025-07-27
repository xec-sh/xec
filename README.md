# Xec - Universal Command Execution System

> **Xec** [zek] - from "execute" (exec), representing the core purpose of the system: reliable command execution across diverse environments.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)

Xec is a modern universal command execution system built with TypeScript, inspired by Ansible, Terraform, and Google's zx. It provides powerful command execution capabilities across local, SSH, Docker, and Kubernetes environments.

## 🏗️ Architecture

```
xec/
├── apps/
│   ├── xec/           # CLI application (@xec-sh/cli)
│   └── docs/          # Documentation site
├── packages/
│   ├── core/          # Core execution engine (@xec-sh/core)
│   └── test-utils/    # Shared testing utilities
├── docker/            # Test containers for different environments
└── turbo.json         # Build configuration
```

## ✨ Key Features

### Universal Command Execution
- **Multi-environment support** - Local, SSH, Docker, and Kubernetes
- **Template literal API** - Intuitive command syntax with automatic escaping
- **Streaming output** - Real-time command output processing
- **Parallel execution** - Efficient concurrent command execution

### SSH Features
- **Connection pooling** - Reuse SSH connections for better performance
- **SSH tunnels** - Port forwarding with dynamic port allocation
- **File transfer** - SFTP support for uploading/downloading files
- **Multiple authentication** - Password, key-based, and agent authentication

### Docker Features
- **Container lifecycle** - Create, start, stop, remove containers
- **Docker Compose** - Full compose support for multi-container apps
- **Log streaming** - Real-time container log streaming
- **Health checks** - Wait for containers to be healthy

### Kubernetes Features
- **Pod execution** - Run commands in pods with container selection
- **Port forwarding** - Forward local ports to pods
- **Log streaming** - Stream logs from pods in real-time
- **File operations** - Copy files to/from pods

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/xec-sh/xec.git
cd xec

# Enable Corepack (for Yarn 4.9.2)
corepack enable

# Install dependencies
yarn install

# Build all packages
yarn build
```

### Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Local execution
await $`echo "Hello, World!"`;

// SSH execution
const ssh = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/key'
});
await ssh`ls -la /var/log`;

// Docker execution
const container = await $.docker({
  image: 'node:20',
  name: 'my-app'
}).start();
await container.exec`npm install`;
await container.stop();

// Kubernetes execution
const pod = $.k8s({ namespace: 'default' }).pod('my-pod');
await pod.exec`cat /etc/hostname`;
const logs = await pod.follow(line => console.log(line));
```

## 📦 Core Package (@xec-sh/core)

The core package provides:

- **Execution Engine** - Unified API for all environments
- **Adapters** - Local, SSH, Docker, Kubernetes
- **Process Management** - Process promises with streaming
- **Error Handling** - Typed errors with detailed context
- **Event System** - Comprehensive event monitoring
- **Utilities** - Parallel execution, retries, templating

[Learn more →](packages/core/README.md)

## 🛠️ CLI Application (@xec-sh/cli)

The CLI provides:

- **Command Interface** - Rich command-line experience
- **Dynamic Commands** - Extensible command system
- **Configuration** - Project and environment management
- **Scripting** - Enhanced JavaScript/TypeScript execution

[Learn more →](apps/xec/README.md)

## 📚 Documentation

- [Core API Reference](packages/core/docs/API.md)
- [CLI Commands](apps/xec/docs/COMMANDS.md)
- [Examples](packages/core/examples/)
- [Architecture Decisions](docs/architecture/)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [GitHub Repository](https://github.com/xec-sh/xec)
- [Issue Tracker](https://github.com/xec-sh/xec/issues)
- [Discussions](https://github.com/xec-sh/xec/discussions)