---
sidebar_position: 5
sidebar_label: Ecosystem
title: The Xec Ecosystem
description: Overview of the Xec ecosystem, packages, and integrations
---

# The Xec Ecosystem

Xec is more than a single tool—it's an ecosystem of packages, integrations, and community resources designed to provide comprehensive command execution capabilities.

## Core Packages

### @xec-sh/core
The heart of the Xec ecosystem—the universal execution engine.

**Features**:
- Template literal command execution
- Multi-adapter architecture
- Connection pooling and caching
- Event system and streaming
- TypeScript-first design

**Installation**:
```bash
npm install @xec-sh/core
```

**Usage**:
```typescript
import { $ } from '@xec-sh/core';
await $`echo "Hello from core"`;
```

### @xec-sh/cli
Command-line interface for Xec, providing interactive and script execution capabilities.

**Features**:
- Interactive REPL mode
- Script execution
- Dynamic command loading
- Configuration management
- Built-in command library

**Installation**:
```bash
npm install -g @xec-sh/cli
```

**Usage**:
```bash
xec run script.js
xec --help
```

### @xec-sh/test-utils
Testing utilities for projects using Xec.

**Features**:
- Test container management
- Mock adapters for testing
- SSH test helpers
- Kubernetes test clusters
- Assertion utilities

**Installation**:
```bash
npm install --save-dev @xec-sh/test-utils
```

**Usage**:
```typescript
import { createTestContainer } from '@xec-sh/test-utils';

const container = await createTestContainer({
  image: 'postgres:14',
  env: { POSTGRES_PASSWORD: 'test' }
});
```

## Execution Adapters

### Local Adapter
Built into @xec-sh/core, executes commands on the local machine.

**Features**:
- Direct process spawning
- Shell selection
- Environment management
- Working directory control

### SSH Adapter
Remote command execution via SSH protocol.

**Features**:
- Connection pooling
- Key-based authentication
- SSH tunneling
- File transfer (SCP/SFTP)
- Proxy jump support

### Docker Adapter
Container command execution and management.

**Features**:
- Container lifecycle management
- Ephemeral container support
- Volume and network management
- Docker Compose integration
- Build and push operations

### Kubernetes Adapter
Pod execution and cluster operations.

**Features**:
- Pod exec and logs
- Port forwarding
- File copy to/from pods
- Multi-container support
- Namespace management

### Remote Docker Adapter
Docker operations over SSH connections.

**Features**:
- Remote Docker daemon access
- SSH tunnel for Docker socket
- Full Docker API over SSH
- Secure remote container management

## Configuration System

### Project Configuration
`.xec/config.yaml` provides project-specific settings.

```yaml
# .xec/config.yaml
defaults:
  shell: /bin/bash
  timeout: 30000

targets:
  production:
    type: ssh
    host: prod.example.com
    username: deploy

  staging:
    type: docker
    container: staging-app

tasks:
  deploy:
    target: production
    commands:
      - git pull
      - npm install
      - npm run build
```

### Global Configuration
User-level configuration in `~/.xec/config.yaml`.

### Environment Variables
Configuration through environment variables:

```bash
XEC_DEFAULT_SHELL=/bin/zsh
XEC_SSH_TIMEOUT=10000
XEC_CACHE_DIR=/tmp/xec-cache
```

## Plugin System

### Dynamic Commands
Extend Xec with custom commands in `.xec/commands/`.

```typescript
// .xec/commands/deploy.ts
export function command(program) {
  program
    .command('deploy <env>')
    .description('Deploy to environment')
    .action(async (env) => {
      const { $ } = await import('@xec-sh/core');
      // Implementation
    });
}
```

### Custom Adapters
Create adapters for new execution environments.

```typescript
import { BaseAdapter } from '@xec-sh/core';

class CustomAdapter extends BaseAdapter {
  async execute(command: Command): Promise<ExecutionResult> {
    // Custom execution logic
    return this.createResult({
      stdout: 'output',
      stderr: '',
      exitCode: 0
    });
  }
}
```

## Integrations

### CI/CD Platforms

#### GitHub Actions
```yaml
- name: Execute with Xec
  run: |
    npx @xec-sh/cli run ./scripts/deploy.js
```

#### GitLab CI
```yaml
deploy:
  script:
    - npm install @xec-sh/core
    - node deploy-script.js
```

#### Jenkins
```groovy
sh 'npx @xec-sh/cli run build.js'
```

### Container Platforms

#### Docker Compose
```yaml
services:
  xec-runner:
    image: node:18
    volumes:
      - ./scripts:/scripts
    command: npx @xec-sh/cli run /scripts/task.js
```

#### Kubernetes Jobs
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: xec-job
spec:
  template:
    spec:
      containers:
      - name: xec
        image: node:18
        command: ["npx", "@xec-sh/cli", "run", "job.js"]
```

### Development Tools

#### VS Code Extension
(Planned) Xec command palette and IntelliSense support.

#### JetBrains Plugin
(Planned) Xec integration for IntelliJ-based IDEs.

## Community Resources

### Official Resources

- **Documentation**: [docs.xec.sh](https://docs.xec.sh)
- **GitHub**: [github.com/xec-sh/xec](https://github.com/xec-sh/xec)
- **npm Registry**: [@xec-sh](https://www.npmjs.com/org/xec-sh)
- **Discord**: [discord.gg/xec](https://discord.gg/xec)

### Community Projects

#### Xec Scripts Collection
Community-contributed scripts and examples.

#### Xec Docker Images
Pre-built Docker images with Xec installed.

#### Xec GitHub Actions
Reusable GitHub Actions for Xec operations.

## Ecosystem Architecture

```
┌─────────────────────────────────────────┐
│           User Applications             │
├─────────────────────────────────────────┤
│     @xec-sh/cli    │   Custom Scripts   │
├────────────────────┴────────────────────┤
│            @xec-sh/core                 │
├──────────────────────────────────────────┤
│            Adapter Layer                 │
├────┬────┬────┬────┬────┬──────────────┤
│Local│SSH │Docker│ K8s │Remote│ Custom  │
└────┴────┴────┴────┴────┴──────────────┘
```

## Version Compatibility

| Package | Version | Node.js | TypeScript |
|---------|---------|---------|------------|
| @xec-sh/core | 0.7.x | ≥20.0.0 | ≥5.0.0 |
| @xec-sh/cli | 0.7.x | ≥20.0.0 | ≥5.0.0 |
| @xec-sh/test-utils | 0.7.x | ≥20.0.0 | ≥5.0.0 |

## Roadmap

### Near Term (Q1 2025)
- Plugin marketplace
- Enhanced Kubernetes features
- Performance optimizations
- Additional authentication methods

### Medium Term (Q2-Q3 2025)
- Cloud provider adapters (AWS, GCP, Azure)
- Workflow orchestration engine
- Visual debugging tools
- Enhanced security features

### Long Term (Q4 2025+)
- Distributed execution
- AI-powered command suggestions
- Cross-platform GUI
- Enterprise features

## Contributing to the Ecosystem

### Package Development
Create packages that extend Xec:

```typescript
// xec-plugin-aws/index.ts
import { $ } from '@xec-sh/core';

export class AWSAdapter {
  async executeOnEC2(instanceId: string, command: string) {
    // Implementation using AWS SSM
  }
}
```

### Adapter Creation
Implement adapters for new environments:

```typescript
import { BaseAdapter } from '@xec-sh/core';

class CloudRunAdapter extends BaseAdapter {
  async execute(command: Command): Promise<ExecutionResult> {
    // Cloud Run execution logic
    return this.createResult({
      stdout: '',
      stderr: '',
      exitCode: 0
    });
  }
}
```

### Tool Integration
Integrate Xec into existing tools:

```javascript
// webpack.config.js
const { $ } = require('@xec-sh/core');

module.exports = {
  plugins: [
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tapAsync('XecPlugin', async (compilation, callback) => {
          await $`npm run post-build`;
          callback();
        });
      }
    }
  ]
};
```

## Best Practices

### Package Selection
- Use `@xec-sh/core` for library integration
- Use `@xec-sh/cli` for command-line tools
- Use `@xec-sh/test-utils` for testing

### Version Management
- Pin major versions in production
- Use latest minor versions for features
- Test thoroughly before major upgrades

### Security
- Audit dependencies regularly
- Use environment variables for secrets
- Implement least-privilege access
- Enable audit logging in production

## Support and Resources

### Getting Help
- **Documentation**: Comprehensive guides and API references
- **Discord Community**: Real-time help and discussions
- **GitHub Issues**: Bug reports and feature requests
- **Stack Overflow**: Tagged questions with `xec`

### Training and Certification
(Planned) Official training courses and certification programs.

### Commercial Support
(Planned) Enterprise support packages with SLAs.

## Conclusion

The Xec ecosystem provides a comprehensive solution for command execution across diverse environments. Whether you're building simple automation scripts or complex orchestration systems, the ecosystem offers the tools, integrations, and community support needed for success.

As the ecosystem grows, it maintains its core philosophy: making command execution simple, safe, and consistent everywhere. Join the community and help shape the future of universal command execution.