---
title: Xec Recipes Cookbook
description: Practical recipes and real-world examples for common Xec use cases
keywords: [recipes, cookbook, examples, patterns, deployment, maintenance]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/pipeline/index.ts
---

# Xec Recipes Cookbook

Welcome to the Xec Recipes Cookbook - a collection of adaptable recipes for common automation tasks using Xec's universal command execution system.

## 📚 Recipe Categories

### 🚀 [Deployment](deployment/node-app-deploy.md)
Deployment strategies and explicit acceptance checks

- **[Node.js Application Deployment](deployment/node-app-deploy.md)** - Deploy Node.js applications with a reviewed transition
- **[Static Site Deployment](deployment/static-site-deploy.md)** - Deploy to CDNs, S3, Nginx, and more
- **[Docker Container Deployment](deployment/docker-deploy.md)** - Container orchestration and management
- **[Kubernetes Deployment](deployment/k8s-deploy.md)** - Deploy to Kubernetes clusters with Helm

### 🔧 [Maintenance](maintenance/backup-restore.md)
System maintenance and operational excellence

- **[Log Aggregation](maintenance/log-aggregation.md)** - Inspect sources and verify centralized delivery
- **[Backup and Restore](maintenance/backup-restore.md)** - Comprehensive backup strategies
- **[Health Checks](maintenance/health-checks.md)** - Service monitoring and alerting
- **[Certificate Renewal](maintenance/certificate-renewal.md)** - SSL/TLS certificate management

### 💻 [Development](development/database-setup.md)
Development workflows and environment setup

- **[Database Setup](development/database-setup.md)** - Local database configuration
- **[API Mocking](development/api-mocking.md)** - Mock servers for development
- **[Test Data Generation](development/test-data.md)** - Generate deterministic test fixtures
- **[Hot Reload Workflows](development/hot-reload.md)** - Live development with hot reload

### 🔌 [Integration](integration/github-actions.md)
Third-party service and tool integrations

- **[GitHub Actions](integration/github-actions.md)** - CI/CD with GitHub Actions
- **[GitLab CI](integration/gitlab-ci.md)** - GitLab CI/CD pipelines
- **[Jenkins](integration/jenkins.md)** - Jenkins automation
- **[AWS Services](integration/aws-integration.md)** - AWS service integration

## 🎯 How to Use This Cookbook

### Recipe Structure

Each recipe follows a consistent structure:

1. **Problem** - The challenge being addressed
2. **Solution** - How Xec solves it
3. **Quick Example** - Minimal working example
4. **Complete Recipe** - Full implementation with all details
5. **Usage Examples** - Common usage patterns
6. **Best Practices** - Recommended approaches
7. **Troubleshooting** - Common issues and solutions
8. **Related Topics** - Links to related recipes

### Code Verification

JavaScript and TypeScript examples are checked against Xec's public types. Commands that use remote services, databases or cloud providers also require the named tools, credentials and application-owned scripts. Type checking does not establish a production deployment or restore guarantee: run each recipe's acceptance checks in the intended environment.

### Getting Started

1. **Choose a recipe** that matches your use case
2. **Copy the configuration** to your `.xec/config.yaml`
3. **Adapt the scripts** to your specific needs
4. **Run the commands** as shown in the usage examples

## 🔍 Finding the Right Recipe

### By Use Case

**Deploying Applications:**
- Web applications → [Node.js Deployment](deployment/node-app-deploy.md)
- Static websites → [Static Site Deployment](deployment/static-site-deploy.md)
- Containerized apps → [Docker Deployment](deployment/docker-deploy.md)
- Microservices → [Kubernetes Deployment](deployment/k8s-deploy.md)

**Managing Infrastructure:**
- Log management → [Log Aggregation](maintenance/log-aggregation.md)
- Data protection → [Backup and Restore](maintenance/backup-restore.md)
- Monitoring → [Health Checks](maintenance/health-checks.md)
- SSL certificates → [Certificate Renewal](maintenance/certificate-renewal.md)

**Development Workflows:**
- Local development → [Hot Reload](development/hot-reload.md)
- Database setup → [Database Setup](development/database-setup.md)
- API development → [API Mocking](development/api-mocking.md)
- Testing → [Test Data Generation](development/test-data.md)

**CI/CD Automation:**
- GitHub → [GitHub Actions](integration/github-actions.md)
- GitLab → [GitLab CI](integration/gitlab-ci.md)
- Jenkins → [Jenkins Integration](integration/jenkins.md)
- AWS → [AWS Integration](integration/aws-integration.md)

### By Technology

**Container Technologies:**
- Docker → [Docker Deployment](deployment/docker-deploy.md)
- Kubernetes → [Kubernetes Deployment](deployment/k8s-deploy.md)
- Docker Compose → See Docker Deployment recipes

**Cloud Platforms:**
- AWS → [AWS Integration](integration/aws-integration.md), [Static Site Deployment](deployment/static-site-deploy.md)
- Google Cloud → See Kubernetes and Docker recipes
- Azure → Adaptable from AWS patterns

**Databases:**
- PostgreSQL → [Backup and Restore](maintenance/backup-restore.md)
- MySQL → [Database Setup](development/database-setup.md)
- MongoDB → [Database Setup](development/database-setup.md)
- Redis → [Database Setup](development/database-setup.md)

## 💡 Common Patterns

### Parallel Execution
```typescript
const hosts = ['web-1.example.com', 'web-2.example.com'];
const results = await $.parallel.map(hosts,
  host => $.ssh({ host, username: 'observer' })`hostname`,
  { maxConcurrency: 2 });
for (const result of results.results) {
  if (result instanceof Error) throw result;
  console.log(result.stdout.trim());
}
```

### Error Handling
```typescript
const result = await $`node --version`.nothrow();
if (!result.ok) throw new Error(`Runtime probe failed: ${result.cause}`);
console.log(result.stdout.trim());
```

### Progress Tracking
```typescript
import { Pipeline } from '@xec-sh/ops';
const result = await Pipeline.create('validate')
  .step('runtime', { run: 'node --version' })
  .step('package-manager', { run: 'npm --version', dependsOn: ['runtime'] })
  .run({}, { onEvent: event => { console.log(event); } });
if (result.status !== 'success') throw new Error(`Validation ${result.status}`);
```

### Connection Reuse
```typescript
const server = $.ssh({ host: 'staging.example.com', username: 'observer' });
await server`hostname`;
await server`uptime`;
```

## 📝 Contributing Recipes

We welcome contributions! To add a new recipe:

1. **Follow the structure** - Use existing recipes as templates
2. **Test your code** - Ensure all examples work
3. **Document thoroughly** - Include all necessary details
4. **Reference implementations** - Link to actual Xec source files
5. **Submit a PR** - Include a description of the use case

## 🔗 Quick Links

- [Xec Core Documentation](../core/execution-engine/overview.md)
- [Command Reference](../commands/overview.md)
- [Configuration Guide](../configuration/overview.md)
- [Core Concepts](../introduction/core-concepts.md)

## 📊 Recipe Statistics

The cookbook groups recipes into deployment, maintenance, development and integration. The examples use shared Xec execution, configuration and lifecycle APIs; application-specific schemas and service policies remain explicit inputs.

## 🚦 Recipe Maturity

Choose acceptance criteria for the actual target: a successful process exit, healthy container, reachable HTTP endpoint and validated application data are separate guarantees. Adapt and test the selected recipe before enabling automated production changes. Preserve a recovery path appropriate to the data and service being changed.

## 🎓 Learning Path

### Beginner
1. Start with [Hot Reload](development/hot-reload.md) for local development
2. Learn [Static Site Deployment](deployment/static-site-deploy.md)
3. Explore [GitHub Actions](integration/github-actions.md) integration

### Intermediate
1. Master [Node.js Deployment](deployment/node-app-deploy.md)
2. Implement [Log Aggregation](maintenance/log-aggregation.md)
3. Setup [Backup and Restore](maintenance/backup-restore.md)

### Advanced
1. Deploy with [Docker](deployment/docker-deploy.md)
2. Orchestrate with [Kubernetes](deployment/k8s-deploy.md)
3. Build complete CI/CD pipelines

## 🆘 Getting Help

- **Documentation**: Check the detailed documentation for each recipe
- **Examples**: Look at the complete examples in each recipe
- **Troubleshooting**: Each recipe includes a troubleshooting section
- **Support**: Open an issue for recipe-specific problems

---

*This cookbook is continuously updated with new recipes and improvements. All recipes are tested against the current Xec implementation and follow the surgical precision requirement for documentation accuracy.*