---
title: Comparison with Other Tools
description: How Xec compares to similar tools and when to use each
keywords: [comparison, alternatives, ansible, terraform, fabric, zx, shelljs]
---

# Comparison with Other Tools

Understanding how Xec compares to other tools helps you choose the right solution for your needs.

## Quick Comparison Matrix

| Feature | Xec | SSH/Shell | Ansible | Terraform | Docker/K8s CLI | zx/shelljs | Fabric |
|---------|-----|-----------|---------|-----------|----------------|------------|---------|
| **Multi-environment execution** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **TypeScript native** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Template literal syntax** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Connection pooling** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Declarative config** | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Imperative scripting** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Built-in parallelism** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Type safety** | ✅ | ❌ | ❌ | Partial | ❌ | ✅ | ❌ |
| **No agent required** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Learning curve** | Low | Low | High | High | Medium | Low | Medium |

## Detailed Comparisons

## Xec vs SSH/Shell Scripts

### Traditional Shell Scripts
```bash
# Shell script
ssh user@server1 "cd /app && git pull && npm install"
ssh user@server2 "cd /app && git pull && npm install"
docker exec container1 "python manage.py migrate"
```

### Xec Approach
```typescript
// Xec script
const servers = ['server1', 'server2'];
await $.all(servers.map(s => $.ssh(s)`
  cd /app
  git pull
  npm install
`));
await $.docker('container1')`python manage.py migrate`;
```

**When to use Shell Scripts:**
- Simple, one-off tasks
- Systems without Node.js
- Minimal dependencies required

**When to use Xec:**
- Complex multi-environment workflows
- Need for error handling and retries
- Type safety and IDE support desired
- Connection pooling needed

## Xec vs Ansible

### Ansible Playbook
```yaml
# ansible-playbook.yml
- hosts: webservers
  tasks:
    - name: Update code
      git:
        repo: https://github.com/example/app
        dest: /app
    - name: Install dependencies
      npm:
        path: /app
```

### Xec Equivalent
```typescript
// Xec script
const webservers = config.targets.webservers;
await $.all(webservers)`
  cd /app
  git pull
  npm install
`;
```

**When to use Ansible:**
- Large-scale configuration management
- Idempotent operations required
- Complex inventory management
- Team prefers YAML/declarative approach

**When to use Xec:**
- Developer-centric automation
- TypeScript/JavaScript teams
- Simpler deployment workflows
- Faster execution without agent overhead

## Xec vs Terraform

### Terraform Configuration
```hcl
# main.tf
resource "null_resource" "deploy" {
  provisioner "remote-exec" {
    inline = [
      "cd /app",
      "git pull",
      "docker-compose up -d"
    ]
  }
}
```

### Xec Approach
```typescript
// Xec script
await $.ssh('server')`
  cd /app
  git pull
  docker-compose up -d
`;
```

**When to use Terraform:**
- Infrastructure provisioning
- Managing cloud resources
- Declarative infrastructure state
- Multi-cloud deployments

**When to use Xec:**
- Application deployment and automation
- Command execution workflows
- Post-provisioning configuration
- Imperative task automation

## Xec vs Docker/Kubernetes CLI

### Traditional CLI Commands
```bash
# Docker commands
docker exec app-container npm run migrate
docker logs -f app-container

# Kubernetes commands
kubectl exec -it app-pod -- npm run migrate
kubectl logs -f app-pod
```

### Xec Unified Approach
```typescript
// Xec - same API for both
await $.docker('app-container')`npm run migrate`;
await $.k8s('app-pod')`npm run migrate`;

// Stream logs from both
const dockerLogs = $.docker('app-container').logs();
const k8sLogs = $.k8s('app-pod').logs();
```

**When to use native CLIs:**
- Simple, one-off commands
- Interactive debugging sessions
- Direct cluster management

**When to use Xec:**
- Multi-container/pod operations
- Automated workflows
- Cross-environment consistency
- Programmatic log processing

## Xec vs zx/shelljs

### zx Script
```javascript
// zx script
import 'zx/globals';

await $`npm install`;
await $`npm run build`;
// No built-in remote execution
```

### Xec Script
```typescript
// Xec script
import { $ } from '@xec-sh/core';

await $`npm install`;
await $`npm run build`;
// Plus remote execution
await $.ssh('server')`npm run deploy`;
await $.docker('container')`npm run migrate`;
```

**When to use zx/shelljs:**
- Local-only automation
- Simple shell scripting in JS
- Minimal setup required

**When to use Xec:**
- Multi-environment execution needed
- SSH/Docker/K8s integration required
- Connection pooling and advanced features
- Enterprise deployment workflows

## Xec vs Fabric (Python)

### Fabric Script
```python
# fabfile.py
from fabric import Connection

def deploy(c):
    c.run('cd /app && git pull')
    c.run('npm install')
    c.run('pm2 restart app')

# Run with: fab -H server1,server2 deploy
```

### Xec Script
```typescript
// deploy.ts
import { $ } from '@xec-sh/core';

async function deploy(servers: string[]) {
  await $.all(servers)`
    cd /app
    git pull
    npm install
    pm2 restart app
  `;
}

// Run with: xec deploy.ts
```

**When to use Fabric:**
- Python-based teams
- Existing Fabric infrastructure
- Python-specific automation

**When to use Xec:**
- JavaScript/TypeScript teams
- Modern async/await patterns
- Type safety requirements
- Cross-environment execution

## Xec vs GitHub Actions / CI/CD

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run build
      - run: ssh user@server 'deploy.sh'
```

### Xec in CI/CD
```yaml
# Using Xec in GitHub Actions
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install -g @xec-sh/cli
      - run: xec deploy.ts production
```

**When to use native CI/CD:**
- Simple CI/CD pipelines
- Platform-specific features needed
- No local execution required

**When to use Xec:**
- Complex deployment logic
- Reusable scripts across CI/CD platforms
- Local and CI/CD execution
- Multi-environment deployments

## Xec vs Make

### Makefile
```makefile
deploy:
	ssh server1 'cd /app && git pull && npm install'
	ssh server2 'cd /app && git pull && npm install'
	docker exec container 'npm run migrate'
```

### Xec Task
```yaml
# .xec/config.yaml
tasks:
  deploy:
    targets: [server1, server2]
    steps:
      - command: cd /app && git pull && npm install
      - target: container
        command: npm run migrate
```

**When to use Make:**
- C/C++ projects
- Simple command orchestration
- POSIX-only environments

**When to use Xec:**
- JavaScript/TypeScript projects
- Complex multi-environment tasks
- Need for programming logic
- Modern async execution

## Decision Matrix

### Choose Xec when you need:

✅ **Multi-environment execution** - Local, SSH, Docker, Kubernetes
✅ **TypeScript/JavaScript** - Native language support
✅ **Type safety** - Full IntelliSense and type checking
✅ **Connection pooling** - Efficient SSH connection reuse
✅ **Modern async patterns** - Promises, async/await, streaming
✅ **Unified API** - Same code for all environments
✅ **Developer experience** - Great IDE support and debugging

### Consider alternatives when:

❌ **Infrastructure provisioning** - Use Terraform/Pulumi
❌ **Configuration management** - Use Ansible/Puppet/Chef
❌ **Python ecosystem** - Use Fabric/Invoke
❌ **Simple local scripts** - Use shell scripts or zx
❌ **Kubernetes-only** - Use Helm/Kustomize
❌ **CI/CD only** - Use native CI/CD features

## Migration Paths

### From Shell Scripts to Xec
```bash
# Before: shell script
ssh user@server "deploy.sh"

# After: Xec
await $.ssh('server')`deploy.sh`;
```

### From Ansible to Xec
```yaml
# Before: Ansible
- command: deploy.sh
  delegate_to: "{{ item }}"
  with_items: "{{ servers }}"

# After: Xec
await $.all(servers)`deploy.sh`;
```

### From zx to Xec
```javascript
// Before: zx (local only)
await $`deploy.sh`;

// After: Xec (anywhere)
await $[target]`deploy.sh`;
```

## Performance Comparison

| Tool | Connection Overhead | Execution Speed | Memory Usage |
|------|-------------------|-----------------|--------------|
| **Xec** | Low (pooled) | Fast | ~30MB base |
| **SSH** | High (per command) | Fast | Minimal |
| **Ansible** | Medium | Slow (Python) | ~100MB |
| **Terraform** | Low | Medium | ~50MB |
| **Docker CLI** | Low | Fast | ~20MB |
| **zx** | N/A (local) | Fast | ~30MB |

## Summary

Xec fills a unique niche in the automation tool ecosystem:

- **For Developers**: Natural TypeScript/JavaScript syntax
- **For DevOps**: Unified multi-environment execution
- **For Teams**: Type safety and maintainability
- **For Scale**: Connection pooling and parallelism

Choose Xec when you need a modern, type-safe approach to multi-environment command execution with the flexibility of imperative programming and the convenience of declarative configuration.

## Related Documentation

- [When to Use Xec](./when-to-use.md) - Detailed use cases
- [Migration Guides](../migration/from-shell-scripts.md) - Migrating from other tools
- [Quick Start](./quick-start.md) - Get started with Xec
- [Examples](../recipes/index.md) - Real-world examples