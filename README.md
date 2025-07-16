# Xec - Infrastructure Orchestration System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Turborepo](https://img.shields.io/badge/maintained%20with-turborepo-cc00ff.svg)](https://turbo.build/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)

Xec is a modern infrastructure orchestration system built with TypeScript, inspired by Ansible and Terraform. It provides a declarative approach to infrastructure management with powerful scripting capabilities.

## 🏗️ Architecture

Xec follows a monorepo architecture with three main packages:

- **Execution Engine** (`@xec/ush`) - Universal shell execution engine for local, SSH, and Docker commands
- **Core Engine** (`@xec/core`) - Orchestration engine with state management and deployment patterns
- **CLI Application** (`@xec/cli`) - Command-line interface with dynamic commands and scripting

## 📦 Packages

### Execution Engine (`@xec/ush`)

Universal shell execution engine inspired by Google's zx:

- **Multi-environment execution** - Local, SSH, Docker adapters
- **Template literal API** - Intuitive command syntax with automatic escaping
- **Stream handling** - Real-time output processing
- **File transfer** - Cross-environment file operations
- **Connection pooling** - Efficient SSH connection management
- **Bun support** - Automatic runtime detection and optimization

### Core Engine (`@xec/core`)

Infrastructure orchestration framework:

- **DSL** - Declarative tasks and recipes
- **State Management** - Event sourcing with immutable history
- **Module System** - Extensible task, helper, and pattern registries
- **Deployment Patterns** - Blue-Green, Canary, Rolling Update, A/B Testing
- **Integration Adapters** - AWS, Kubernetes, Terraform, Docker
- **Security** - Secrets management, encryption, audit logging

### CLI Application (`@xec/cli`)

Feature-rich command-line interface:

- **Dynamic Commands** - Add custom commands without modifying core
- **Xec Scripts** - Enhanced JavaScript/TypeScript execution
- **Interactive Mode** - REPL and prompts via @clack/prompts
- **Project Isolation** - All data in `.xec/` directory
- **Watch Mode** - Auto-reload for development

## 🚀 Getting Started

### Prerequisites

- Node.js >= 22
- Yarn 4.9.2

### Installation

```bash
# Clone the repository
git clone https://github.com/xec-sh/xec.git
cd xec

# Install dependencies
yarn install

# Build all packages
yarn build
```

### Development

```bash
# Run development mode
yarn dev

# Run tests
yarn test

# Lint code
yarn lint

# Type checking
yarn typecheck

# Fix linting and formatting issues
yarn fix:all
```

### Using the CLI

```bash
# Build the CLI
cd apps/xec
yarn build

# Run the CLI
./bin/xec --help

# Initialize a new project
./bin/xec init

# Run a recipe
./bin/xec run <recipe-name>

# Run an Xec script
./bin/xec script <script-file>

# List available recipes
./bin/xec list

# Run a specific task
./bin/xec task <task-name>
```

## 🛠️ Tech Stack

- **Language**: TypeScript 5.8.3
- **Runtime**: Node.js 22+
- **Package Manager**: Yarn 4.9.2 (with workspaces)
- **Build System**: Turborepo
- **Testing**: Jest 30 / Vitest 1.0
- **Linting**: ESLint 9 with TypeScript support
- **Formatting**: Prettier 3.6.2
- **SSH**: ssh2 library for secure remote execution
- **CLI**: Commander.js 14.0, @clack/prompts
- **Validation**: Zod, AJV
- **Templating**: Handlebars

## 📚 Documentation

Comprehensive documentation for each package:

- [Monorepo Overview](CLAUDE.md) - Architecture and development guidelines
- [Core Package](packages/core/CLAUDE.md) - Orchestration engine details
- [Execution Engine](packages/ush/CLAUDE.md) - Universal execution details
- [CLI Application](apps/xec/CLAUDE.md) - Command-line interface guide

Additional resources:
- [Core API Documentation](packages/core/docs/) - Detailed technical specifications
- [Xec Scripts Guide](apps/xec/docs/XEC_SCRIPTS.md) - Scripting with Xec
- [Dynamic CLI Guide](apps/xec/docs/DYNAMIC_CLI.md) - Extending the CLI

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

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