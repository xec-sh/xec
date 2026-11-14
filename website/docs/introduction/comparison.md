---
title: Comparison with Other Tools
description: How Xec compares to similar tools and when to use each
keywords: [comparison, alternatives, ansible, terraform, fabric, zx, shelljs]
---

# Comparison with Other Tools {#comparison-with-other-tools}

Understanding how Xec compares to other tools helps you choose the right solution for your needs.

## Quick Comparison Matrix {#quick-comparison-matrix}

Choose by responsibility rather than counting checkmarks. Xec provides typed execution and orchestration; it can call an existing tool without taking ownership of that tool's state model.

| Responsibility | Xec's role | Complementary tool |
| --- | --- | --- |
| Scripts and project commands | TypeScript execution, targets, dynamic CLI and Kit prompts | Native shell for small local commands |
| Package build graph and artifact reuse | Coordinate checks and invoke the repository's build command | [Turbo](https://turborepo.com/docs/crafting-your-repository/caching) fingerprints inputs and restores cached task outputs |
| Host configuration | Run typed operational workflows and explicit verification | [Ansible](https://docs.ansible.com/ansible/latest/getting_started/index.html) manages desired state through inventories and modules |
| Infrastructure provisioning | Invoke planning/apply steps and application-specific checks | [Terraform](https://developer.hashicorp.com/terraform/intro) owns resource state and provisioning plans |
| Containers and pods | Provide consistent execution/results, transfer and forwarding APIs | Docker and Kubernetes still own container/cluster state |
| Application lifecycle | Run deployment hooks and inspect their outcome | A process supervisor or platform owns long-running services |

Xec's `Pipeline` matrix expands parameters on the current executor. It does not provision operating systems or install Node versions. Its `cache` field is reserved; use the build tool's artifact cache. Command result caching is available separately in Core and requires an appropriate invalidation policy.

## Detailed Comparisons {#detailed-comparisons}

## Xec vs SSH/Shell Scripts {#xec-vs-sshshell-scripts}

### Traditional Shell Scripts {#traditional-shell-scripts}
```bash
# Shell script
ssh user@server1 "cd /app && git pull && npm install"
ssh user@server2 "cd /app && git pull && npm install"
docker exec container1 "python manage.py migrate"
```

### Xec Approach {#xec-approach}
```typescript
// Xec script
import { $, parallel } from '@xec-sh/core';

const servers = ['server1', 'server2'];
await parallel(servers.map(s => $.ssh(s)`
  cd /app
  git pull
  npm install
`));
await $.docker({ container: 'container1' })`python manage.py migrate`;
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

## Xec vs Ansible {#xec-vs-ansible}

### Ansible Playbook {#ansible-playbook}
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

### Xec Equivalent {#xec-equivalent}
```typescript
// Xec script
import { $, parallel } from '@xec-sh/core';

const webservers = ['deploy@web-1', 'deploy@web-2'];
await parallel(webservers.map(host => $.ssh(host)`
  cd /app
  git pull
  npm install
`));
```

Ansible normally controls managed hosts from its control node; it does not require a permanently installed Ansible agent.

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

## Xec vs Terraform {#xec-vs-terraform}

### Terraform Configuration {#terraform-configuration}
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

### Xec Approach {#xec-approach-1}
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

## Xec vs Docker/Kubernetes CLI {#xec-vs-dockerkubernetes-cli}

### Traditional CLI Commands {#traditional-cli-commands}
```bash
# Docker commands
docker exec app-container npm run migrate
docker logs -f app-container

# Kubernetes commands
kubectl exec -it app-pod -- npm run migrate
kubectl logs -f app-pod
```

### Xec Unified Approach {#xec-unified-approach}
```typescript
// Xec - same API for both
await $.docker({ container: 'app-container' })`npm run migrate`;
await $.k8s('app-pod')`npm run migrate`;

// Fetch logs from both
const dockerLogs = await $.docker().container('app-container').logs();
const k8sLogs = await $.k8s().pod('app-pod').logs();
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

## Xec vs zx/shelljs {#xec-vs-zxshelljs}

### zx Script {#zx-script}

<!-- doc-check: skip — comparison uses zx, which is not an Xec workspace dependency -->
```javascript
// zx script
import 'zx/globals';

await $`npm install`;
await $`npm run build`;
// No built-in remote execution
```

### Xec Script {#xec-script}
```typescript
// Xec script
import { $ } from '@xec-sh/core';

await $`npm install`;
await $`npm run build`;
// Plus remote execution
await $.ssh('server')`npm run deploy`;
await $.docker({ container: 'container' })`npm run migrate`;
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

## Xec vs Fabric (Python) {#xec-vs-fabric-python}

### Fabric Script {#fabric-script}
```python
# fabfile.py
from fabric import Connection

def deploy(c):
    c.run('cd /app && git pull')
    c.run('npm install')
    c.run('pm2 restart app')

# Run with: fab -H server1,server2 deploy
```

### Xec Script {#xec-script-1}
```typescript
// deploy.ts
import { $, parallel } from '@xec-sh/core';

async function deploy(servers: string[]) {
  await parallel(servers.map(host => $.ssh(host)`
    cd /app
    git pull
    npm install
    pm2 restart app
  `));
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

## Xec vs GitHub Actions / CI/CD {#xec-vs-github-actions--cicd}

### GitHub Actions {#github-actions}
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

### Xec in CI/CD {#xec-in-cicd}
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

## Xec vs Make {#xec-vs-make}

### Makefile {#makefile}
```makefile
deploy:
	ssh server1 'cd /app && git pull && npm install'
	ssh server2 'cd /app && git pull && npm install'
	docker exec container 'npm run migrate'
```

### Xec Task {#xec-task}
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

## Decision Matrix {#decision-matrix}

### Choose Xec when you need: {#choose-xec-when-you-need}

✅ **Multi-environment execution** - Local, SSH, Docker, Kubernetes
✅ **TypeScript/JavaScript** - Native language support
✅ **Type safety** - Full IntelliSense and type checking
✅ **Connection pooling** - Efficient SSH connection reuse
✅ **Modern async patterns** - Promises, async/await, streaming
✅ **Unified API** - Same code for all environments
✅ **Developer experience** - Great IDE support and debugging

### Consider alternatives when: {#consider-alternatives-when}

❌ **Infrastructure provisioning** - Use Terraform/Pulumi
❌ **Configuration management** - Use Ansible/Puppet/Chef
❌ **Python ecosystem** - Use Fabric/Invoke
❌ **Simple local scripts** - Use shell scripts or zx
❌ **Kubernetes-only** - Use Helm/Kustomize
❌ **CI/CD only** - Use native CI/CD features

## Migration Paths {#migration-paths}

### From Shell Scripts to Xec {#from-shell-scripts-to-xec}
```bash
# Before: shell script
ssh user@server "deploy.sh"

# After: Xec
await $.ssh('server')`deploy.sh`;
```

### From Ansible to Xec {#from-ansible-to-xec}
```yaml
# Before: Ansible
- command: deploy.sh
  delegate_to: "{{ item }}"
  with_items: "{{ servers }}"
```
```typescript
// After: Xec
import { $, parallel } from '@xec-sh/core';

const servers = ['deploy@web-1', 'deploy@web-2'];
await parallel(servers.map(host => $.ssh(host)`deploy.sh`));
```

### From zx to Xec {#from-zx-to-xec}
```javascript
// Before: zx (local only)
await $`deploy.sh`;

// After: Xec (anywhere) — target local, SSH, Docker or Kubernetes with the
// same chain, e.g. an SSH host:
await $.ssh('deploy@web-1')`deploy.sh`;
```

## Performance Comparison {#performance-comparison}

Measure tools against the same command, target, connection reuse policy and output
volume. This project does not publish a reproducible cross-tool memory or latency
benchmark here. Connection pooling can reduce repeated SSH setup cost; it does not
make arbitrary commands faster, and deployment tools have different semantics.

## Summary {#summary}

Xec fills a unique niche in the automation tool ecosystem:

- **For Developers**: Natural TypeScript/JavaScript syntax
- **For DevOps**: Unified multi-environment execution
- **For Teams**: Type safety and maintainability
- **For Scale**: Connection pooling and parallelism

Choose Xec when you need a modern, type-safe approach to multi-environment command execution with the flexibility of imperative programming and the convenience of declarative configuration.

## Related Documentation {#related-documentation}

- [When to Use Xec](./when-to-use.md) - Detailed use cases
- [Migration Guides](../migration/from-shell-scripts.md) - Migrating from other tools
- [Quick Start](./quick-start.md) - Get started with Xec
- [Examples](../recipes/index.md) - Real-world examples