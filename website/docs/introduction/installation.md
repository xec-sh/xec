---
title: Installation
description: How to install Xec on your system
keywords: [install, setup, npm, pnpm, global, local]
---

# Installation

## System Requirements

Before installing Xec, ensure your system meets these requirements:

- **Node.js**: Version 22.18.0 or higher — the CLI runs TypeScript files
  through Node's own type stripping, on by default since 22.18. The
  libraries (`@xec-sh/core` and friends) used programmatically need only
  Node 20.
- **Operating System**: macOS, Linux, or Windows — all three run the unit suite in CI
- **Package Manager**: npm (included with Node.js) or pnpm

### Optional Dependencies

For full functionality, you may also want:

- **Docker**: For container execution features
- **kubectl**: For Kubernetes pod execution
- **SSH Client**: For remote execution (OpenSSH recommended)

## Installation Methods

### Global Installation (Recommended)

Install Xec globally to use it from anywhere on your system:

```bash
# Using npm
npm install -g @xec-sh/cli

# Using pnpm
pnpm add -g @xec-sh/cli
```

Verify the installation:

```bash
xec --version
```

### Project Installation

Add Xec to your project for scripting and automation:

```bash
# Install the CLI as a dev dependency
npm install --save-dev @xec-sh/cli

# Install the core library for programmatic use
npm install @xec-sh/core
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "deploy": "xec deploy.ts",
    "build": "xec run build",
    "test": "xec test --coverage"
  }
}
```

### Development Installation

For contributing to Xec or using the latest development version:

```bash
# Clone the repository
git clone https://github.com/xec-sh/xec.git
cd xec

# Enable Corepack for pnpm
corepack enable

# Install dependencies
pnpm install

# Build the project
pnpm build

# Link for global usage
pnpm link --global
```

## Package Overview

Xec consists of multiple packages:

### @xec-sh/cli
The command-line interface for Xec.

```bash
npm install -g @xec-sh/cli
```

Features:
- Command execution across environments
- Task automation
- Script running
- Configuration management

### @xec-sh/core
The core execution engine for programmatic use.

```bash
npm install @xec-sh/core
```

Features:
- Template literal execution API
- Multi-environment adapters
- Connection pooling
- Error handling

### @xec-sh/testing
Testing utilities for Xec scripts and commands.

```bash
npm install --save-dev @xec-sh/testing
```

Features:
- Test containers
- Mock targets
- Test helpers

## Platform-Specific Setup

### macOS

```bash
npm install -g @xec-sh/cli
```

### Linux

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g @xec-sh/cli

# Fedora/RHEL
sudo dnf install nodejs
npm install -g @xec-sh/cli

# Arch Linux
sudo pacman -S nodejs npm
npm install -g @xec-sh/cli
```

### Windows

Native Windows is supported and tested:

```powershell
# Install Node.js from nodejs.org first
npm install -g @xec-sh/cli
```

Commands there run through `cmd.exe` by default, and Xec's own behaviour —
escaping, paths, globs, line endings, timeouts — is identical to the other
platforms. What differs is what the shell itself understands: `cmd` has no
`&&`, no `$VAR` expansion and none of the POSIX tools. See
[Windows and cross-platform scripts](../targets/local/cross-platform.md).

WSL2 is worth having if your scripts are written in POSIX shell syntax and
you would rather not change them:

```bash
# In WSL2 terminal
npm install -g @xec-sh/cli
```

## Docker Installation

Run Xec in a container:

```dockerfile
FROM node:22-alpine
RUN npm install -g @xec-sh/cli
WORKDIR /app
COPY . .
CMD ["xec", "run", "script.ts"]
```


## Verifying Installation

After installation, verify everything is working:

```bash
# Check version
xec --version

# Show help
xec --help

# Test execution
xec -e "console.log('Hello from Xec!')"
```

## Configuration Setup

Initialize Xec in your project:

```bash
# Scaffold .xec/ in the current project (config, commands, scripts)
xec new project

# Or create individual artifacts
xec new script deploy
xec new command greet
```

## Environment Variables

Configure Xec behavior with environment variables:

```bash
# Load an additional config file
export XEC_CONFIG=/custom/path/config.yaml

# Enable debug output
export XEC_DEBUG=true

# Disable colors
export NO_COLOR=1
```

## Troubleshooting Installation

### Common Issues

**Permission Denied**
```bash
# Fix npm global permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

**Module Not Found**
```bash
# Clear npm cache
npm cache clean --force

# Reinstall
npm install -g @xec-sh/cli
```

**Version Conflicts**
```bash
# Check Node.js version
node --version  # Should be >= 22.18.0

# Update Node.js if needed
nvm install 22
nvm use 22
```

**TypeScript Issues**
```bash
# Install TypeScript support
npm install -g typescript tsx
```

## Updating Xec

Keep Xec up to date:

```bash
# Update global installation
npm update -g @xec-sh/cli

# Update project installation
npm update @xec-sh/core @xec-sh/cli

# Check for updates
npm outdated -g @xec-sh/cli
```

## Uninstalling

To remove Xec from your system:

```bash
# Global uninstall
npm uninstall -g @xec-sh/cli

# Project uninstall
npm uninstall @xec-sh/core @xec-sh/cli

# Remove configuration (optional)
rm -rf ~/.xec
rm -rf .xec/
```

## Next Steps

- [Quick Start Guide](./quick-start.md) - Get started with your first script
- [Core Concepts](./core-concepts.md) - Understand Xec's architecture
- [Configuration](../configuration/overview.md) - Set up your environment
- [Examples](../recipes/index.md) - Learn from real-world examples

## Getting Help

If you encounter issues:

- Check the [Troubleshooting Guide](../configuration/advanced/troubleshooting.md)
- Visit our [GitHub Issues](https://github.com/xec-sh/xec/issues)