---
title: Integrations
description: Integration guides for CI/CD, cloud providers, and third-party tools
keywords: [integrations, ci/cd, cloud, github, gitlab, aws, docker, kubernetes]
---

# Integrations {#integrations}

## Overview {#overview}

Xec integrates seamlessly with popular CI/CD platforms, cloud providers, and development tools. This section provides comprehensive guides for integrating Xec into your existing infrastructure and workflows.

## CI/CD Platforms {#cicd-platforms}

### Available Integrations {#available-integrations}
- [GitHub Actions](../recipes/integration/github-actions.md) - GitHub Actions workflows with Xec
- [GitLab CI](../recipes/integration/gitlab-ci.md) - GitLab CI/CD pipelines
- [Jenkins](../recipes/integration/jenkins.md) - Jenkins pipeline integration
- [AWS Integration](../recipes/integration/aws-integration.md) - AWS services integration

For general CI/CD guidance:
- [CI/CD Pipelines Guide](../guides/automation/ci-cd-pipelines.md) - Building CI/CD pipelines with Xec

## Container & Orchestration Platforms {#container--orchestration-platforms}

### Docker {#docker}
- [Docker Targets](../targets/docker/overview.md) - Docker target setup
- [Docker Compose](../targets/docker/compose-integration.md) - Docker Compose integration
- [Container Lifecycle](../targets/docker/container-lifecycle.md) - Container management
- [Docker Networking](../targets/docker/networking.md) - Network configuration
- [Docker Volumes](../targets/docker/volume-management.md) - Volume management

### Kubernetes {#kubernetes}
- [Kubernetes Targets](../targets/kubernetes/overview.md) - K8s target configuration
- [Pod Execution](../targets/kubernetes/pod-execution.md) - Executing in pods
- [Port Forwarding](../targets/kubernetes/port-forwarding.md) - Service forwarding
- [Log Streaming](../targets/kubernetes/log-streaming.md) - Real-time logs
- [Multi-Container Pods](../targets/kubernetes/multi-container.md) - Complex pod setups

## Development Workflows {#development-workflows}

### Deployment Recipes {#deployment-recipes}
- [Node.js Deployment](../recipes/deployment/node-app-deploy.md) - Node.js application deployment
- [Static Site Deployment](../recipes/deployment/static-site-deploy.md) - Static website deployment
- [Docker Deployment](../recipes/deployment/docker-deploy.md) - Container deployment
- [Kubernetes Deployment](../recipes/deployment/k8s-deploy.md) - K8s deployment automation

### Infrastructure Management {#infrastructure-management}
- [Server Management](../guides/infrastructure/server-management.md) - Managing multiple servers
- [Container Orchestration](../guides/infrastructure/container-orchestration.md) - Docker/K8s workflows

## Quick Integration Examples {#quick-integration-examples}

### GitHub Actions {#github-actions}

```yaml
name: Validate
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      # package.json declares @xec-sh/cli; scripts/ci.ts is versioned with the project.
      - run: npx --no-install xec run scripts/ci.ts
```

### Docker Integration {#docker-integration}

```typescript
import { $ } from '@xec-sh/core';

// The remote compose.yaml owns ports, volumes and service configuration.
async function deployDocker(tag: string) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(tag)) throw new Error('Invalid image tag');
  const image = `registry.example.com/myapp:${tag}`;
  await $`docker build -t ${image} .`;
  await $`docker push ${image}`;
  const remote = $.ssh({ host: 'prod.example.com', username: 'deploy' })
    .cd('/srv/myapp').env({ APP_IMAGE: image });
  // compose.yaml reads APP_IMAGE. up replaces the container; restart would not.
  await remote`docker compose pull`;
  await remote`docker compose up -d --wait`;
}
```

### AWS Integration {#aws-integration}

```typescript
async function deployToECS(cluster: string, service: string) {
  const registry = process.env.ECR_REGISTRY;
  if (!registry) throw new Error('ECR_REGISTRY is required');
  await $`aws ecr get-login-password --region us-east-1`
    .pipe($`docker login --username AWS --password-stdin ${registry}`);
  const image = `${registry}/${service}:latest`;
  await $`docker build -t ${image} .`;
  await $`docker push ${image}`;
  // The service task definition must reference this image tag.
  await $`aws ecs update-service --cluster ${cluster} --service ${service} --force-new-deployment`;
  await $`aws ecs wait services-stable --cluster ${cluster} --services ${service}`.timeout(600_000);
}
```

### Kubernetes Deployment {#kubernetes-deployment}

```typescript
async function deployToK8s(context: string, namespace: string, deployment: string, image: string) {
  // Use the same explicit context and namespace for change and acceptance.
  const kubeArgs = ['--context', context, '--namespace', namespace];
  await $`kubectl ${kubeArgs} set image ${`deployment/${deployment}`} ${`app=${image}`}`;
  await $`kubectl ${kubeArgs} rollout status ${`deployment/${deployment}`} --timeout=10m`.timeout(610_000);
}
```

### GitLab CI Integration {#gitlab-ci-integration}

```yaml
image: node:24
stages: [validate, deploy]
validate:
  stage: validate
  script:
    - npm ci
    - npx --no-install xec run scripts/ci.ts
deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual
  script:
    - npm ci
    - npx --no-install xec run scripts/deploy.ts
```

### Jenkins Pipeline {#jenkins-pipeline}

```groovy
// Jenkinsfile
pipeline {
    agent any

    environment {
        XEC_CONFIG = '.xec/config.yaml'
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npx --no-install xec run scripts/test.ts'
            }
        }

        stage('Build') {
            steps {
                sh 'npx --no-install xec run scripts/build.ts'
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'deploy-key',
                    keyFileVariable: 'SSH_KEY'
                )]) {
                    sh 'npx --no-install xec run scripts/deploy.ts'
                }
            }
        }
    }
}
```

## Integration Patterns {#integration-patterns}

### Webhook Handlers {#webhook-handlers}

```typescript
// Invoke only after the HTTP boundary authenticates the sender, verifies the
// signature on raw bytes and authorizes this repository. Do not expose this as
// an unauthenticated endpoint. The checkout is an isolated, unprivileged CI workspace.
async function validateVerifiedCommit(commit: string) {
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Expected a full Git object ID');
  const checkedOut = await $`git rev-parse HEAD`.text();
  if (checkedOut.trim() !== commit) throw new Error('Checkout does not match the verified event');
  await $`npm ci`;
  await $`npm test`;
}
```

### API Integrations {#api-integrations}

```typescript
async function createJiraIssue(title: string, description: string) {
  const { JIRA_URL, JIRA_USER, JIRA_TOKEN } = process.env;
  if (!JIRA_URL || !JIRA_USER || !JIRA_TOKEN) throw new Error('Jira credentials and URL are required');
  const response = await fetch(new URL('/rest/api/2/issue', JIRA_URL), {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${JIRA_USER}:${JIRA_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: {
      project: { key: 'PROJ' }, summary: title, description, issuetype: { name: 'Task' }
    } })
  });
  if (!response.ok) throw new Error(`Jira returned HTTP ${response.status}`);
  return response.json();
}
```

### Slack Notifications {#slack-notifications}

```typescript
async function notifySlack(webhook: string, message: string) {
  const response = await fetch(webhook, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  });
  if (!response.ok) throw new Error(`Notification failed with HTTP ${response.status}`);
}
```

### Event-Driven Automation {#event-driven-automation}

```typescript
import { Pipeline } from '@xec-sh/ops';

// The trusted event handler selects this versioned pipeline.
const result = await Pipeline.create('delivery')
  .step('tests', { run: 'npm test' })
  .step('build', { run: 'npm run build', dependsOn: ['tests'] })
  .step('deploy', { run: 'npm run deploy', dependsOn: ['build'] })
  .run({}, { onEvent: event => { console.log(event.type); } });
if (!result.success) throw new Error('Delivery failed');
```

## Security Considerations {#security-considerations}

### Secret Management {#secret-management}

1. **Never commit secrets** to version control
2. **Use environment variables** or secret management services
3. **Rotate credentials** regularly
4. **Limit secret scope** to minimum required permissions
5. **Audit secret access** through logging

For secure credential handling, see:
- [Secrets Command](../commands/built-in/secrets.md) - Managing secrets with Xec

### Network Security {#network-security}

1. **Use SSH keys** instead of passwords
2. **Implement IP whitelisting** where possible
3. **Use VPN or bastion hosts** for production access
4. **Enable audit logging** for all operations
5. **Use TLS/SSL** for all communications

## Performance Optimization {#performance-optimization}

### Connection Pooling {#connection-pooling}

```typescript
// Engines derived from $ share its adapter pool. The CLI disposes it at exit.
const server = $.ssh({ host: 'prod.example.com', username: 'deploy' });
await server`node --version`;
await server`df -h`;
```

For more on connection pooling:
- [Connection Pooling](../core/execution-engine/features/connection-pooling.md) - SSH connection management

### Caching Strategies {#caching-strategies}

```typescript
// Cache only observations whose staleness is acceptable; refresh before mutation.
const cache = new Map<string, { checkedAt: number; healthy: boolean }>();
async function getHealth(url: string) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.checkedAt < 5_000) return cached.healthy;
  const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
  const healthy = response.ok;
  cache.set(url, { checkedAt: Date.now(), healthy });
  return healthy;
}
```

## Troubleshooting {#troubleshooting}

### Common Issues {#common-issues}

1. **Authentication failures** - Check credentials and permissions
2. **Network timeouts** - Adjust timeout values and check connectivity
3. **Rate limiting** - Implement backoff and retry logic
4. **API changes** - Keep SDKs and integrations updated
5. **Resource limits** - Monitor and scale appropriately

### Debug Techniques {#debug-techniques}

```bash
# Enable debug output
xec --verbose run scripts/deploy.ts

# Test connectivity
xec on hosts.production echo test

# Verify credentials
xec inspect --validate

# Check API access
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/status
```

## Related Documentation {#related-documentation}

- [CI/CD Pipelines](../guides/automation/ci-cd-pipelines.md) - CI/CD best practices
- [API Reference](../api/index.md) - Core API documentation
- [Configuration](../configuration/overview.md) - Configuration guide
- [Recipes](../recipes/index.md) - Integration examples
- [Patterns](../patterns/index.md) - Common patterns and best practices