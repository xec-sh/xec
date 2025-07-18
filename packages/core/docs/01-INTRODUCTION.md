# 01. Introduction to Xec Core

## What is Xec Core?

Xec Core is a modern infrastructure orchestration and automation system built on TypeScript and @xec-js/ush. It provides a powerful yet easy-to-use framework for automating DevOps tasks, managing configuration, and deploying applications.

## Key Features

### 🎯 Simplicity and Power
- Declarative DSL for simple tasks
- Full imperative control when needed
- Intuitive API that's easy to learn

### 🔧 Versatility
- Works locally, via SSH, in Docker containers
- Support for multiple hosts and environments
- Integration with existing tools (Terraform, Ansible, K8s)

### 📦 Batteries Included
- Built-in deployment patterns (Blue-Green, Canary, Rolling)
- Rich standard library
- Ready-made modules for popular services

### 🚀 Modern Stack
- Full TypeScript support with autocomplete
- Promise-based asynchronous execution
- Streaming and real-time monitoring

### 🧪 Code Quality
- Built-in testing support
- Mocks for all external dependencies
- Dry-run mode for safe testing

### 📊 Observability
- Detailed logging of all operations
- Metrics and tracing out of the box
- Event sourcing for complete audit trail

## Who is Xec Core for?

### DevOps Engineers
- Automating routine tasks
- Managing infrastructure as code
- Orchestrating complex deployments

### Developers
- Local environment automation
- CI/CD pipelines
- Integration with development process

### SRE Teams
- Configuration management
- Disaster recovery procedures
- Monitoring and alerting

### Architects
- Process standardization
- Creating reusable components
- Ensuring compliance

## Comparison with Alternatives

| Feature | Xec Core | Ansible | Terraform | Pulumi |
|---------|-----------|---------|-----------|--------|
| Language | TypeScript | YAML/Python | HCL | Multiple |
| Typing | ✅ Full | ❌ | ⚠️ Partial | ✅ |
| SSH/Local/Docker | ✅ All | ✅ | ❌ | ⚠️ |
| Deployment Patterns | ✅ Built-in | ⚠️ Playbooks | ❌ | ❌ |
| Testing | ✅ Native | ⚠️ Molecule | ⚠️ | ✅ |
| Speed | ⚡ Fast | 🐌 | ⚡ | ⚡ |
| Learning Curve | 📈 Gentle | 📈 Medium | 📈 Steep | 📈 Medium |

## Key Advantages

### 1. Single Language
Use TypeScript/JavaScript for everything:
- Infrastructure
- Configuration
- Deployment logic
- Tests

### 2. Composition over Inheritance
- Small, reusable components
- Easy to combine functionality
- No complex hierarchies

### 3. Progressive Complexity Disclosure
- Start with a simple shell script
- Add abstractions as needed
- Always able to "look under the hood"

### 4. Real Modularity
- npm packages as modules
- Versioning through package.json
- Standard JavaScript ecosystem

## Design Philosophy

### Principle of Least Surprise
The API is designed to work intuitively. If you know JavaScript, you already know the basics of Xec Core.

### Transparency
No "magic" - you can always see what any operation does and override its behavior if needed.

### Extensibility
The system is designed as a platform. The core is minimal, all functionality is added through modules.

### Performance
Optimized for execution speed. Parallel execution, connection pooling, smart caching.

## Quick Example

```typescript
import { recipe, task } from '@xec-js/core';

// Create a simple deployment recipe
const deploy = recipe('deploy-app')
  .description('Deploy web application')
  .vars({
    version: { required: true, type: 'string' }
  })
  .task('backup', task()
    .description('Backup current version')
    .run(async ({ $ }) => {
      await $`tar -czf /backups/app-$(date +%s).tar.gz /opt/app`;
    })
  )
  .task('deploy', task()
    .description('Deploy new version')
    .dependsOn('backup')
    .run(async ({ $, vars }) => {
      await $`
        cd /opt/app
        git fetch --tags
        git checkout v${vars.version}
        npm ci --production
        npm run build
        pm2 restart app
      `;
    })
  )
  .build();

// Execute
await deploy.execute({ vars: { version: '2.0.0' } });
```

## What's Next?

1. Study the [Design Philosophy](02-PHILOSOPHY.md)
2. Get familiar with [Core Concepts](04-CORE-CONCEPTS.md)
3. Start with [Quick Start](15-GETTING-STARTED.md)
4. Explore the [API Reference](06-API-REFERENCE.md)

## Support and Community

- **GitHub**: https://github.com/xec-sh/xec
- **Documentation**: https://docs.xec.dev

## License

MIT © DevGrid