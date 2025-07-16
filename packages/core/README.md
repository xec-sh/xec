# Xec Core

> Orchestration and automation system

Xec Core is a powerful yet easy-to-use framework for infrastructure automation and application deployment. Built on top of [ush](https://github.com/xec/ush) and inspired by best practices from Ansible, Terraform, and other DevOps tools.

## Features

✨ **Simple and Powerful** - Declarative DSL for simple tasks, full control when needed  
🚀 **Universal** - Works locally, via SSH, in Docker containers  
📦 **Batteries Included** - Built-in patterns for Blue-Green, Canary, Rolling deployments  
🔧 **Extensible** - Easy to create your own modules and patterns  
🎯 **Type-Safe** - Full TypeScript support with autocompletion  
🧪 **Testable** - Built-in testing support with mocks  
📊 **Observable** - Built-in metrics, tracing, and logging

## Quick Start

### Installation

```bash
npm install @xec/core
# or
yarn add @xec/core
# or
pnpm add @xec/core
```

### First Recipe

```typescript
import { recipe } from '@xec/core'

// Create a simple deployment recipe
const deploy = recipe('deploy-app')
  .task('deploy', async ({ $ }) => {
    await $`
      cd /app
      git pull origin main
      npm install --production
      npm run build
      pm2 restart app
    `
  })

// Run it
await deploy.run()
```

### More Complex Example

```typescript
import { recipe, patterns, inventory } from '@xec/core'

// Configure host inventory
const hosts = inventory()
  .add('web1', { address: '10.0.1.1', tags: ['web', 'prod'] })
  .add('web2', { address: '10.0.1.2', tags: ['web', 'prod'] })
  .discover('aws', { region: 'us-east-1', tag: 'Environment:prod' })

// Create recipe with variables and validation
const deploy = recipe('production-deploy', {
  vars: {
    version: { type: 'string', required: true, pattern: /^\d+\.\d+\.\d+$/ },
    environment: { type: 'enum', values: ['staging', 'prod'], required: true }
  },
  hosts: hosts.tagged('web', 'prod')
})

// Add tasks
deploy
  .task('backup', async ({ $, host }) => {
    await $`tar -czf /backup/${host}-$(date +%s).tar.gz /app`
  })
  
  .task('deploy', { 
    depends: ['backup'],
    retry: { attempts: 3, delay: 5000 }
  }, async ({ $, vars }) => {
    await $`
      cd /app
      git fetch --tags
      git checkout v${vars.version}
      npm ci --production
      npm run build
    `
  })
  
  .task('health-check', async ({ http, host }) => {
    const response = await http.get(`http://${host}:3000/health`)
    if (response.status !== 200) {
      throw new Error(`Health check failed on ${host}`)
    }
  })

// Use Blue-Green deployment
await patterns.blueGreen({
  service: 'web-app',
  deploy: async ({ color }) => {
    await deploy.run({ 
      vars: { version: '2.0.0', environment: 'prod' },
      hosts: hosts.tagged(color)
    })
  },
  healthCheck: async ({ hosts }) => {
    // Check health of all hosts
    for (const host of hosts) {
      const response = await http.get(`http://${host}:3000/health`)
      if (response.status !== 200) return false
    }
    return true
  },
  switchTraffic: async ({ color }) => {
    // Switch traffic to new version
    await $`aws elb modify-target-group --target-group-arn $TG_ARN --targets ${color}`
  }
})
```

## Core Concepts

### Recipes

A recipe is a collection of tasks that execute in a specific order:

```typescript
const setup = recipe('server-setup', {
  description: 'Setup new server',
  hosts: ['server1', 'server2']
})
```

### Tasks

Tasks are atomic units of work:

```typescript
setup.task('install-deps', async ({ $ }) => {
  await $`apt-get update`
  await $`apt-get install -y nginx nodejs`
})
```

### Execution Context

Each task receives a rich context with utilities:

```typescript
setup.task('example', async (context) => {
  const { 
    $,           // ush execution engine
    host,        // current host
    vars,        // variables
    parallel,    // parallel execution
    http,        // HTTP client
    file,        // file operations
    template,    // templating
    notify,      // notifications
    state,       // state management
    log          // logging
  } = context
})
```

### Modules

Create reusable modules:

```typescript
import { module, task } from '@xec/core'

export const nginx = module('nginx', {
  tasks: {
    install: task(async ({ $ }) => {
      await $`apt-get install -y nginx`
    }),
    
    configure: task(async ({ file, template }) => {
      const config = await template.render('nginx.conf.j2')
      await file('/etc/nginx/nginx.conf').write(config)
    })
  }
})

// Usage
recipe('web-server')
  .use(nginx)
  .task('setup', async ({ modules }) => {
    await modules.nginx.install()
    await modules.nginx.configure()
  })
```

## CLI

### Global CLI Installation

```bash
npm install -g @xec/core
```

### Usage

```bash
# Run recipe
xec run deploy --vars version=2.0.0 --vars environment=prod

# List available recipes
xec list

# Dry-run mode
xec run deploy --dry-run

# Interactive mode
xec interactive

# Start web interface
xec ui
```

## Built-in Patterns

### Blue-Green Deployment

```typescript
await patterns.blueGreen({
  service: 'my-app',
  deploy: async ({ color }) => { /* ... */ },
  healthCheck: async ({ hosts }) => { /* ... */ },
  switchTraffic: async ({ color }) => { /* ... */ }
})
```

### Canary Deployment

```typescript
await patterns.canary({
  service: 'api',
  version: '2.0.0',
  stages: [
    { percentage: 10, duration: '5m' },
    { percentage: 50, duration: '10m' },
    { percentage: 100 }
  ]
})
```

### Rolling Update

```typescript
await patterns.rollingUpdate({
  hosts: inventory.tagged('worker'),
  batchSize: 2,
  pauseBetween: '30s',
  update: async (host) => { /* ... */ }
})
```

## Testing

```typescript
import { describe, it, expect } from 'vitest'

describe('deploy recipe', () => {
  it('should deploy successfully', async () => {
    const result = await deploy
      .mock({
        commands: {
          'git pull': { stdout: 'Already up to date.' }
        }
      })
      .run()
    
    expect(result.success).toBe(true)
  })
})
```

## Ecosystem

- **@xec/core** - Core package
- **@xec/ui** - Web interface for monitoring
- **@xec/modules-aws** - AWS modules
- **@xec/modules-k8s** - Kubernetes modules
- **@xec/modules-docker** - Docker modules

## Comparison with Other Tools

| Feature | Xec | Ansible | Terraform | Pulumi |
|---------|------|---------|-----------|--------|
| Language | TypeScript/JavaScript | YAML/Python | HCL | Multiple |
| Typing | ✅ Full | ❌ | ⚠️ Partial | ✅ |
| Testing | ✅ Built-in | ⚠️ | ⚠️ | ✅ |
| SSH/Docker/Local | ✅ | ✅ | ❌ | ⚠️ |
| Deployment Patterns | ✅ Built-in | ⚠️ | ❌ | ❌ |
| Speed | ⚡ Fast | 🐌 | ⚡ | ⚡ |

## Documentation

- [Specification](./docs/SPECIFICATION.md) - Complete system specification
- [Architecture](./docs/ARCHITECTURE.md) - Technical architecture
- [API Reference](./docs/API.md) - API reference
- [Examples](./examples) - Usage examples

## License

MIT © Xec Team