---
sidebar_position: 1
---

# Xec CLI - Universal Command Orchestration

Xec CLI is a powerful command-line tool that revolutionizes how you execute commands and manage automation across multiple environments. With seamless support for local execution, SSH, Docker, and Kubernetes, Xec enables you to orchestrate complex workflows with simple JavaScript.

## 🚀 Key Features

### Universal Execution
- **One API, Multiple Environments**: Execute commands locally, via SSH, in Docker containers, or Kubernetes pods using the same intuitive API
- **JavaScript-Powered**: Write automation scripts in JavaScript/TypeScript with full async/await support
- **Template Literals**: Use familiar JavaScript template literals for command execution

### Advanced Capabilities
- **SSH Tunnels**: Create secure tunnels for database access and service forwarding
- **Container Lifecycle**: Full Docker container management with streaming logs and health checks
- **Kubernetes Integration**: Port forwarding, log streaming, and file operations for pods
- **Connection Pooling**: Automatic SSH connection reuse for optimal performance
- **Parallel Execution**: Run commands concurrently with built-in concurrency control

### Developer Experience
- **Interactive Prompts**: Built-in prompts for user interaction
- **Progress Indicators**: Spinners and progress bars for long-running operations
- **Error Handling**: Comprehensive error handling with detailed messages
- **Event System**: Subscribe to command lifecycle events for monitoring

## Installation

```bash
# Global installation (recommended)
npm install -g @xec-sh/cli

# Or with yarn
yarn global add @xec-sh/cli

# Verify installation
xec --version
```

## 🎯 Quick Examples

### Execute JavaScript Files
```bash
# Run automation scripts directly
xec deploy.js --env=production

# TypeScript is supported out of the box
xec build-and-test.ts
```

### Multi-Environment Commands
```javascript
// deploy.js - Deploy to multiple environments
import { $ } from '@xec-sh/core';

// Local build
await $`npm run build`;

// Deploy to server via SSH
const server = $.ssh({ host: 'prod.example.com', username: 'deploy' });
await server`docker pull myapp:latest`;
await server`docker-compose up -d`;

// Update Kubernetes
const k8s = $.k8s({ namespace: 'production' });
await $`kubectl set image deployment/myapp app=myapp:latest`;
```

### Advanced Features in Action
```javascript
// database-backup.js - Secure database backup with SSH tunnel
const ssh = $.ssh({ host: 'db.example.com' });

// Create secure tunnel to database
const tunnel = await ssh.tunnel({
  localPort: 0,  // Dynamic port allocation
  remoteHost: 'localhost',
  remotePort: 5432
});

// Backup through tunnel
await $`pg_dump -h localhost -p ${tunnel.localPort} mydb > backup.sql`;
await tunnel.close();

// Upload to S3
await $`aws s3 cp backup.sql s3://backups/$(date +%Y%m%d)-backup.sql`;
```

## 📚 Documentation

### Getting Started
- [**Installation Guide**](../../getting-started/installation) - Get Xec up and running
- [**Quick Start Tutorial**](../../getting-started/quick-start) - Your first Xec script
- [**Basic Concepts**](../core/getting-started/basic-concepts) - Understanding Xec fundamentals

### Command Reference
- [**Complete Command List**](./commands) - All CLI commands with examples
- [**Custom Commands**](./custom-commands) - Extend Xec with your own commands

### Advanced Topics
- [**Advanced Features**](./advanced-features) - SSH tunnels, Docker lifecycle, K8s operations
- [**Real-World Examples**](./real-world-examples) - Production-ready scripts and patterns
- [**Performance Optimization**](./performance-optimization) - Tips for large-scale operations

## 💡 Why Xec?

### Unified Interface
Stop switching between `ssh`, `docker exec`, `kubectl exec`, and local commands. Xec provides one consistent API for all environments.

### Type Safety
Full TypeScript support means autocomplete, type checking, and better developer experience.

### Production Ready
- Automatic connection pooling
- Built-in retry logic
- Comprehensive error handling
- Resource cleanup

### Extensible
Create custom commands, add plugins, and extend functionality to match your workflow.

## ⚙️ Configuration

### Project Structure
```
my-project/
├── .xec/
│   ├── config.yaml        # Project configuration
│   ├── scripts/           # Automation scripts
│   │   ├── deploy.js
│   │   ├── backup.js
│   │   └── monitor.js
│   └── commands/          # Custom CLI commands
│       └── release.js
├── package.json
└── README.md
```

### Configuration File
```yaml
# .xec/config.yaml
defaultShell: /bin/bash
timeout: 300000

environments:
  production:
    ssh:
      host: prod.example.com
      username: deploy
      privateKey: ~/.ssh/id_rsa_prod
    kubernetes:
      context: production-cluster
      namespace: default
  
  staging:
    ssh:
      host: staging.example.com
    docker:
      registry: staging-registry.example.com

docker:
  defaultImage: node:18-alpine
  
kubernetes:
  defaultNamespace: default
```

## 🎮 Interactive Development

### Create New Projects
```bash
# Initialize a new Xec project
xec init my-automation

# Create new scripts from templates
xec new script deploy --advanced
xec new command release --description "Release automation"
```

### Development Workflow
```bash
# Watch files and run tests
xec watch '**/*.js' --exec 'npm test'

# Interactive command execution
xec ssh user@server --interactive

# Port forwarding for development
xec k8s port-forward my-service 3000:3000
```

## Configuration File

Example `.xec/config.json`:

```json
{
  "defaultShell": "/bin/bash",
  "timeout": 300000,
  "retries": 3,
  "environments": {
    "local": {
      "shell": "/bin/zsh",
      "env": {
        "NODE_ENV": "development"
      }
    },
    "production": {
      "ssh": {
        "host": "prod.example.com",
        "username": "deploy",
        "privateKey": "~/.ssh/id_rsa_prod"
      },
      "env": {
        "NODE_ENV": "production"
      }
    }
  },
  "docker": {
    "defaultImage": "node:18",
    "registry": "docker.io"
  },
  "kubernetes": {
    "defaultNamespace": "default",
    "context": "production"
  }
}
```

## 🔥 Powerful Use Cases

### DevOps Automation
```javascript
// Blue-green deployment with zero downtime
// Health checks and automatic rollback
// SSH tunnels for secure database access
```

### Microservices Management
```javascript
// Start entire development environment
// Stream logs from multiple services
// Coordinate deployments across services
```

### Data Processing
```javascript
// ETL pipelines across environments
// Parallel processing with progress tracking
// Automatic retry and error handling
```

### Infrastructure Monitoring
```javascript
// Real-time health dashboards
// Log aggregation from multiple sources
// Automated incident response
```

See [Real-World Examples](./real-world-examples) for complete implementations.

## 🛠️ Command Overview

### Core Commands
| Command | Description | Example |
|---------|-------------|---------|  
| `xec script.js` | Execute JavaScript/TypeScript files | `xec deploy.js --prod` |
| `exec` | Run shell commands | `xec exec 'docker ps'` |
| `run` | Execute named scripts | `xec run backup` |
| `config` | Manage configuration | `xec config set timeout 60000` |

### Environment Commands
| Command | Description | Example |
|---------|-------------|---------|
| `ssh` | SSH operations | `xec ssh user@host 'uptime'` |
| `docker` | Docker management | `xec docker exec app-1 npm test` |
| `k8s` | Kubernetes operations | `xec k8s logs my-pod -f` |

### Development Commands  
| Command | Description | Example |
|---------|-------------|---------|
| `init` | Create new project | `xec init my-automation` |
| `new` | Generate templates | `xec new script deploy` |
| `watch` | Monitor file changes | `xec watch '*.js' -x 'npm test'` |

See [Complete Command Reference](./commands) for detailed documentation.

## 🚦 Getting Started

### Installation
```bash
# Install globally
npm install -g @xec-sh/cli

# Or with yarn
yarn global add @xec-sh/cli

# Verify installation
xec --version
```

### Your First Script
```javascript
// hello-xec.js
import { $ } from '@xec-sh/core';

// Local execution
const hostname = await $`hostname`;
console.log(`Local: ${hostname.stdout}`);

// Remote execution
const server = $.ssh({ host: 'example.com' });
const remoteHost = await server`hostname`;
console.log(`Remote: ${remoteHost.stdout}`);

// Docker execution
const container = await $.docker({ image: 'alpine' }).start();
const containerHost = await container.exec`hostname`;
console.log(`Container: ${containerHost.stdout}`);
await container.remove();
```

Run it:
```bash
xec hello-xec.js
```

## 🏆 Best Practices

### Script Organization
```javascript
// Modular script structure
import { $ } from '@xec-sh/core';
import { spinner, confirm } from '@xec-sh/cli';

// Configuration at the top
const config = {
  production: { host: 'prod.example.com' },
  staging: { host: 'staging.example.com' }
};

// Helper functions
async function deployToServer(server, version) {
  const spin = spinner(`Deploying ${version}...`);
  try {
    await server`docker pull myapp:${version}`;
    await server`docker-compose up -d`;
    spin.succeed('Deployment complete');
  } catch (error) {
    spin.fail('Deployment failed');
    throw error;
  }
}

// Main logic with error handling
try {
  const env = process.argv[2] || 'staging';
  const server = $.ssh(config[env]);
  await deployToServer(server, 'latest');
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
```

### Security
- Store credentials in environment variables
- Use SSH keys instead of passwords  
- Enable audit logging for production scripts
- Validate all user inputs

### Performance
- Leverage connection pooling (automatic)
- Use parallel execution for independent tasks
- Stream large outputs instead of buffering
- Cache expensive operations

See [Advanced Features](./advanced-features) for more patterns.

## 🤝 Community & Support

### Resources
- [GitHub Repository](https://github.com/xec-sh/xec) - Source code and issues
- [API Documentation](../core/api-reference) - Complete API reference
- [Examples Collection](./real-world-examples) - Production-ready scripts

### Getting Help
```bash
# Built-in help
xec --help
xec ssh --help

# Interactive documentation
xec help --web
```

## 🚀 Start Building

Ready to revolutionize your command-line automation? 

1. [Install Xec CLI](#installation)
2. [Create your first script](#your-first-script)
3. [Explore advanced features](./advanced-features)
4. [Learn from real examples](./real-world-examples)

Join thousands of developers using Xec to automate their infrastructure and streamline their workflows!

