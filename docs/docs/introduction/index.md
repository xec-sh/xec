---
sidebar_position: 1
title: Introduction
description: Universal Command Execution for the Modern Stack
keywords: [xec, universal execution, typescript, ssh, docker, kubernetes]
---

# Universal Command Execution for the Modern Stack

**One execution API for local, SSH, Docker, and Kubernetes environments**

Xec is a universal command execution system that provides a unified API for running commands across diverse environments - local machines, SSH servers, Docker containers, and Kubernetes pods - all through a single, elegant TypeScript interface.

## 🚀 Execute Anywhere with the Same API

```typescript
// Execute anywhere with the same API
import { $ } from '@xec-sh/core';

// Local execution
await $`npm run build`;

// SSH execution with connection pooling
await $.ssh('prod-server')`systemctl restart app`;

// Docker container execution
await $.docker('my-container')`python manage.py migrate`;

// Kubernetes pod execution
await $.k8s('app-pod')`kubectl rollout status deployment/app`;
```

## 🎯 Or Use Declarative Configuration

```yaml
# .xec/config.yaml
version: "1.0"

targets:
  hosts:
    prod:
      host: prod.example.com
      user: deploy
  containers:
    staging:
      container: staging-app
  pods:
    dev:
      namespace: development
      pod: app-pod

tasks:
  deploy:
    description: Deploy to all environments
    parallel: true
    steps:
      - name: Deploy to production
        target: hosts.prod
        command: ./deploy.sh
      - name: Deploy to staging
        target: containers.staging
        command: ./deploy.sh
      - name: Deploy to development
        target: pods.dev
        command: ./deploy.sh
```

## ✨ Key Features

### 1. **Universal Execution Engine**
Single API for all environments via @xec-sh/core - write once, execute anywhere.

### 2. **Multi-Environment Native**
Seamless execution across local, SSH, Docker, and Kubernetes with zero code changes.

### 3. **TypeScript Template Literals**
Intuitive  $\`command\` syntax with full type safety and IntelliSense support.

### 4. **Enterprise Features**
Built-in connection pooling, retry logic, error handling, and streaming output.

### 5. **Parallel Execution**
Execute commands across multiple targets simultaneously with automatic orchestration.

### 6. **Flexible Approach**
Use imperative TypeScript scripts or declarative YAML configuration - your choice.

## 📋 Real-World Use Cases

### **Multi-Environment Deployment**
> "Same code runs everywhere - local to cloud"

Deploy to development, staging, and production with a single command:
```typescript
await Promise.all([
  $.ssh('dev')`./deploy.sh`,
  $.docker('staging')`./deploy.sh`,
  $.k8s('prod')`./deploy.sh`
]);
```

### **Infrastructure Management**
> "Control servers, containers, and clusters"

Manage your entire infrastructure stack from one place:
```typescript
// Health check across all environments
const results = await $.all(targets)`health-check.sh`;
console.log('Health Status:', results);
```

### **CI/CD Pipelines**
> "Build sophisticated deployment workflows"

Create powerful pipelines with error handling and rollback:
```typescript
try {
  await $`npm test`;
  await $`npm run build`;
  await $.ssh('prod')`deploy.sh`;
} catch (error) {
  await $.ssh('prod')`rollback.sh`;
  throw error;
}
```

### **DevOps Automation**
> "Automate operations with TypeScript safety"

Type-safe automation with full IDE support:
```typescript
interface DeployConfig {
  version: string;
  environment: 'dev' | 'staging' | 'prod';
  services: string[];
}

async function deploy(config: DeployConfig) {
  const target = getTarget(config.environment);
  await $[target]`deploy ${config.version} ${config.services.join(' ')}`;
}
```

### **Cross-Platform Testing**
> "Test on multiple environments simultaneously"

Run tests across different platforms in parallel:
```typescript
const testResults = await Promise.all([
  $`npm test`,
  $.docker('node:18')`npm test`,
  $.docker('node:20')`npm test`,
]);
```

### **Hybrid Cloud Operations**
> "Manage mixed infrastructure seamlessly"

Coordinate operations across cloud providers and on-premise:
```typescript
await $.ssh('aws-server')`backup.sh`;
await $.k8s('gcp-cluster')`backup.sh`;
await $.docker('on-premise')`backup.sh`;
```

## 🔄 How Xec Compares

| Feature | SSH Clients | Ansible | Terraform | kubectl/docker | zx/shelljs | **Xec** |
|---------|------------|---------|-----------|----------------|------------|---------|
| **Multi-environment** | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **TypeScript native** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Connection pooling** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Unified API** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Template literals** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Imperative model** | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Declarative option** | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |

## 💡 Why Xec?

### Problems Xec Solves

| Problem | Xec Solution |
|---------|--------------|
| **"Different APIs for local/remote execution"** | Single unified execution API |
| **"SSH connection management is complex"** | Built-in connection pooling |
| **"Docker commands are verbose"** | Simple $.docker() interface |
| **"Kubernetes kubectl is cumbersome"** | Intuitive $.k8s() execution |
| **"Can't execute across environments"** | Multi-target parallel execution |
| **"Error handling across systems is hard"** | Consistent Result pattern |
| **"No type safety in shell scripts"** | Full TypeScript with IntelliSense |

## 🎯 Who Uses Xec?

- **DevOps Engineers** seeking unified command execution across environments
- **Backend Developers** executing commands in containers and remote servers
- **Platform Engineers** building internal developer platforms
- **SRE Teams** automating operations and incident response
- **System Administrators** managing distributed systems
- **JavaScript/TypeScript Developers** wanting type-safe shell scripting
- **CI/CD Pipeline Authors** building deployment scripts
- **Teams managing hybrid infrastructure** (local + cloud + containers)

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g @xec-sh/cli

# Or add to your project
npm install @xec-sh/core
```

### Your First Script

Create `deploy.ts`:
```typescript
import { $ } from '@xec-sh/core';

// Build locally
await $`npm run build`;

// Test in Docker (ephemeral container)
await $.docker({ image: 'node:20' })
  .volumes([`${process.cwd()}:/app`])
  .workdir('/app')
  `npm test`;

// Deploy to production
const prod = $.ssh({ host: 'prod.example.com', username: 'deploy' });
await prod`docker pull myapp:latest`;
await prod`docker stop myapp || true`;
await prod`docker run -d --name myapp myapp:latest`;

// Verify deployment
const result = await prod`curl -s http://localhost/health`;
console.log('Health check:', result.stdout);
```

Run it:
```bash
xec deploy.ts
```

### Using Configuration

Create `.xec/config.yaml`:
```yaml
version: "1.0"
name: my-project

targets:
  hosts:
    staging:
      host: staging.example.com
      user: deploy
      port: 22
    
tasks:
  deploy:
    description: Deploy to staging
    target: hosts.staging
    steps:
      - name: Pull latest code
        command: git pull origin main
      - name: Install dependencies
        command: npm ci
      - name: Restart application
        command: pm2 restart app
```

Run it:
```bash
xec deploy
```

## 📚 Core Concepts

### Execution Engine
The heart of Xec - a unified API that abstracts away environment differences while preserving full control.

### Adapters
Environment-specific implementations that handle the details of execution while maintaining a consistent interface.

### Targets
Named execution contexts (local, SSH hosts, Docker containers, K8s pods) that can be referenced in scripts and tasks.

### Template Literals
Natural command syntax using JavaScript's template literal feature for intuitive command composition.

## 🛠 Architecture

```
┌─────────────────┐
│  Your Scripts   │
└────────┬────────┘
         │
┌────────▼────────┐
│  @xec-sh/core   │  Universal Execution API
└────────┬────────┘
         │
┌────────▼───────────────────────────┐
│         Adapter Layer              │
├──────┬──────┬──────┬──────┬────────┤
│Local │ SSH  │Docker│ K8s  │ Remote │
└──────┴──────┴──────┴──────┴────────┘
```

## 🔗 Next Steps

- **[Quick Start Guide](./quick-start.md)** - Get up and running in 5 minutes
- **[Core Concepts](./core-concepts.md)** - Understand Xec's architecture
- **[Command Reference](../commands/overview.md)** - Explore all available commands
- **[Examples & Recipes](../recipes/index.md)** - Real-world usage patterns
- **[API Documentation](../core/execution-engine/overview.md)** - Deep dive into the execution engine

## 🤝 Join the Community

- **GitHub**: [github.com/xec-sh/xec](https://github.com/xec-sh/xec)

---

**Xec** - Execute Everywhere, Write Once in TypeScript