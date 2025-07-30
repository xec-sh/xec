---
sidebar_position: 1
---

# Installation

Learn how to install and set up @xec-sh/core in your project.

## Requirements

- **Node.js**: Version 16.x or higher
- **TypeScript**: Version 4.5 or higher (for TypeScript projects)
- **Operating System**: Linux, macOS, or Windows (with WSL)

## Package Installation

### Using npm

```bash
npm install @xec-sh/core
```

### Using yarn

```bash
yarn add @xec-sh/core
```

### Using pnpm

```bash
pnpm add @xec-sh/core
```

## TypeScript Configuration

For TypeScript projects, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true
  }
}
```

## ESM vs CommonJS

@xec-sh/core is published as both ESM and CommonJS. The correct version is automatically selected based on your project configuration.

### ESM (Recommended)

```javascript
// package.json
{
  "type": "module"
}

// Usage
import { $ } from '@xec-sh/core';
```

### CommonJS

```javascript
// Usage
const { $ } = require('@xec-sh/core');
```

## Basic Setup

### 1. Create a new file

```typescript
// hello-xec.ts
import { $ } from '@xec-sh/core';

async function main() {
  const result = await $`echo "Hello from Xec!"`;
  console.log(result.stdout);
}

main().catch(console.error);
```

### 2. Run the script

```bash
# With TypeScript (tsx)
npx tsx hello-xec.ts

# Or compile and run
npx tsc hello-xec.ts
node hello-xec.js
```

## Optional Dependencies

Some features require additional dependencies:

### SSH Functionality

SSH features work out of the box, but for advanced features:

```bash
# For SSH key validation
npm install ssh2-streams
```

### Docker Features

Ensure Docker is installed:

```bash
# Check Docker installation
docker --version
```

### Kubernetes Features

Ensure kubectl is installed:

```bash
# Check kubectl installation
kubectl version --client
```

## Environment Setup

### SSH Configuration

For SSH features, ensure your SSH keys are properly configured:

```bash
# Generate SSH key if needed
ssh-keygen -t rsa -b 4096

# Add to SSH agent
ssh-add ~/.ssh/id_rsa
```

### Docker Configuration

For Docker features, ensure Docker daemon is running:

```bash
# Check Docker status
docker info
```

### Kubernetes Configuration

For Kubernetes features, ensure kubectl is configured:

```bash
# Check kubectl config
kubectl config current-context
```

## Verification

Verify your installation:

```typescript
import { $ } from '@xec-sh/core';

async function verify() {
  // Test local execution
  console.log('Testing local execution...');
  const local = await $`echo "Local execution works!"`;
  console.log('✓', local.stdout.trim());
  
  // Test available adapters
  console.log('\nChecking available adapters...');
  console.log('✓ Local adapter: Always available');
  
  // Check SSH
  try {
    await $`which ssh`;
    console.log('✓ SSH: Available');
  } catch {
    console.log('✗ SSH: Not available');
  }
  
  // Check Docker
  try {
    await $`docker --version`;
    console.log('✓ Docker: Available');
  } catch {
    console.log('✗ Docker: Not available');
  }
  
  // Check Kubernetes
  try {
    await $`kubectl version --client`;
    console.log('✓ Kubernetes: Available');
  } catch {
    console.log('✗ Kubernetes: Not available');
  }
}

verify().catch(console.error);
```

## Troubleshooting

### Command not found

If you get "command not found" errors:

```typescript
// Specify full paths if needed
import { configure } from '@xec-sh/core';

configure({
  env: {
    PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`
  }
});
```

### Permission denied

For permission issues:

```bash
# Ensure script has execute permissions
chmod +x your-script.js

# Or run with proper permissions
sudo node your-script.js
```

### Module resolution issues

For ESM issues in Node.js:

```json
// package.json
{
  "type": "module",
  "engines": {
    "node": ">=16.0.0"
  }
}
```

## Next Steps

- Continue to [Basic Concepts](./basic-concepts) to understand core principles
- Try the [First Steps](./first-steps) tutorial
- Explore [examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples)