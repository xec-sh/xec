---
sidebar_position: 1
---

# Installation

Get Xec up and running on your system in just a few minutes.

## Prerequisites

Before installing Xec, ensure you have the following:

- **Node.js** (version 18 or higher)
- **npm** or **yarn** package manager
- **Git** (for cloning repositories and version control)

### Optional Dependencies

Depending on which features you plan to use:

- **Docker** - For Docker adapter functionality
- **kubectl** - For Kubernetes adapter functionality
- **SSH client** - For SSH remote execution

## Installation Methods

### 1. Global Installation (Recommended)

Install Xec globally to use the CLI from anywhere:

```bash
# Using npm
npm install -g @xec-sh/cli

# Using yarn
yarn global add @xec-sh/cli
```

Verify the installation:

```bash
xec --version
```

### 2. Project-specific Installation

For project-specific automation, install Xec as a dependency:

```bash
# Create a new project
mkdir my-automation && cd my-automation
npm init -y

# Install Xec packages
npm install @xec-sh/core @xec-sh/cli

# Or with yarn
yarn add @xec-sh/core @xec-sh/cli
```

### 3. Development Installation

For contributing to Xec or using the latest features:

```bash
# Clone the repository
git clone https://github.com/xec-sh/xec.git
cd xec

# Install dependencies
yarn install

# Build all packages
yarn build

# Link the CLI globally
cd apps/xec
npm link
```

## Platform-specific Instructions

### macOS

```bash
# Install Node.js using Homebrew
brew install node

# Install Xec
npm install -g @xec-sh/cli

# Optional: Install Docker Desktop
brew install --cask docker

# Optional: Install kubectl
brew install kubectl
```

### Linux (Ubuntu/Debian)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Xec
sudo npm install -g @xec-sh/cli

# Optional: Install Docker
sudo apt-get update
sudo apt-get install docker.io
sudo usermod -aG docker $USER

# Optional: Install kubectl
sudo snap install kubectl --classic
```

### Windows

```powershell
# Install Node.js using Chocolatey
choco install nodejs

# Or download from https://nodejs.org

# Install Xec
npm install -g @xec-sh/cli

# Optional: Install Docker Desktop
# Download from https://www.docker.com/products/docker-desktop

# Optional: Install kubectl
choco install kubernetes-cli
```

### Using WSL (Windows Subsystem for Linux)

For the best experience on Windows, we recommend using WSL:

```bash
# In WSL terminal, follow Linux installation instructions
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g @xec-sh/cli
```

## Verifying Installation

After installation, verify everything is working:

```bash
# Check Xec CLI version
xec --version

# Check available commands
xec --help

# Run a simple test
xec eval 'console.log("Xec is working!")'
```

## Initial Configuration

Create a global configuration file:

```bash
# Create config directory
mkdir -p ~/.xec

# Initialize configuration
xec config init
```

This creates `~/.xec/config.json` with default settings:

```json
{
  "defaultShell": "/bin/bash",
  "timeout": 300000,
  "retries": 3,
  "paths": {
    "recipes": "~/.xec/recipes",
    "tasks": "~/.xec/tasks",
    "modules": "~/.xec/modules"
  }
}
```

## Setting up Environments

### Local Environment

No additional setup required - local execution works out of the box.

### SSH Environment

Ensure you have SSH access configured:

```bash
# Generate SSH key if needed
ssh-keygen -t ed25519 -C "your-email@example.com"

# Copy public key to remote server
ssh-copy-id user@remote-server

# Test SSH connection
ssh user@remote-server
```

### Docker Environment

Ensure Docker is running:

```bash
# Check Docker status
docker --version
docker ps

# Pull commonly used images
docker pull node:18
docker pull ubuntu:latest
```

### Kubernetes Environment

Configure kubectl access:

```bash
# Check kubectl configuration
kubectl config view

# Test cluster access
kubectl cluster-info
kubectl get nodes
```

## Troubleshooting Installation

### Common Issues

#### Permission Denied (npm)

If you get permission errors during global installation:

```bash
# Option 1: Use a Node version manager (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Option 2: Change npm's default directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### Command Not Found

If `xec` command is not found after installation:

```bash
# Check npm global bin directory
npm config get prefix

# Add to PATH (adjust path as needed)
export PATH="$(npm config get prefix)/bin:$PATH"

# Make permanent
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
```

#### Node Version Too Old

If you have an older Node.js version:

```bash
# Check current version
node --version

# Update Node.js
# macOS with Homebrew
brew upgrade node

# Linux with NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm
nvm install 18
nvm alias default 18
```

## Next Steps

Now that Xec is installed, you're ready to:

1. Follow the [Quick Start](./quick-start) guide
2. Explore [example scripts](../projects/core/examples)
3. Create your [first project](./first-project)

## Uninstalling

If you need to uninstall Xec:

```bash
# Global installation
npm uninstall -g @xec-sh/cli

# Project installation
npm uninstall @xec-sh/core @xec-sh/cli

# Remove configuration
rm -rf ~/.xec
```

## Getting Help

If you encounter any issues:

1. Search [GitHub Issues](https://github.com/xec-sh/xec/issues)
2. Check the [Documentation](../intro)

Welcome to the Xec community! 🎉