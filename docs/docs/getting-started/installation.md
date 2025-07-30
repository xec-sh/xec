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

## Next Steps

Now that Xec is installed, you're ready to:

1. Follow the [Quick Start](./quick-start) guide
2. Explore [example scripts](../projects/core/examples)
3. Create your [first project](./first-project)