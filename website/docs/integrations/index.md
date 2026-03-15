---
title: Integrations
description: Integration guides for CI/CD, cloud providers, and third-party tools
keywords: [integrations, ci/cd, cloud, github, gitlab, aws, docker, kubernetes]
verification_date: 2025-08-03
---

# Integrations

## Overview

Xec integrates seamlessly with popular CI/CD platforms, cloud providers, and development tools. This section provides comprehensive guides for integrating Xec into your existing infrastructure and workflows.

## CI/CD Platforms

### Available Integrations
- [GitHub Actions](../recipes/integration/github-actions.md) - GitHub Actions workflows with Xec
- [GitLab CI](../recipes/integration/gitlab-ci.md) - GitLab CI/CD pipelines
- [Jenkins](../recipes/integration/jenkins.md) - Jenkins pipeline integration
- [AWS Integration](../recipes/integration/aws-integration.md) - AWS services integration

For general CI/CD guidance:
- [CI/CD Pipelines Guide](../guides/automation/ci-cd-pipelines.md) - Building CI/CD pipelines with Xec

## Container & Orchestration Platforms

### Docker
- [Docker Environments](../environments/docker/setup.md) - Docker environment setup
- [Docker Compose](../environments/docker/compose.md) - Docker Compose integration
- [Container Lifecycle](../environments/docker/lifecycle.md) - Container management
- [Docker Networking](../environments/docker/networking.md) - Network configuration
- [Docker Volumes](../environments/docker/volumes.md) - Volume management

### Kubernetes
- [Kubernetes Setup](../environments/kubernetes/setup.md) - K8s environment configuration
- [Pod Execution](../environments/kubernetes/pod-execution.md) - Executing in pods
- [Port Forwarding](../environments/kubernetes/port-forwarding.md) - Service forwarding
- [Log Streaming](../environments/kubernetes/log-streaming.md) - Real-time logs
- [Multi-Container Pods](../environments/kubernetes/multi-container.md) - Complex pod setups

## Development Workflows

### Deployment Recipes
- [Node.js Deployment](../recipes/deployment/node-app-deploy.md) - Node.js application deployment
- [Static Site Deployment](../recipes/deployment/static-site-deploy.md) - Static website deployment
- [Docker Deployment](../recipes/deployment/docker-deploy.md) - Container deployment
- [Kubernetes Deployment](../recipes/deployment/k8s-deploy.md) - K8s deployment automation

### Infrastructure Management
- [Server Management](../guides/infrastructure/server-management.md) - Managing multiple servers
- [Container Orchestration](../guides/infrastructure/container-orchestration.md) - Docker/K8s workflows

## Quick Integration Examples

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy with Xec

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install Xec
      run: npm install -g @xec-sh/cli
    
    - name: Configure Xec
      run: |
        cat > .xec/config.yaml << EOF
        targets:
          production:
            type: ssh
            host: ${{ secrets.PROD_HOST }}
            user: deploy
            privateKey: ${{ secrets.SSH_KEY }}
        EOF
    
    - name: Deploy Application
      run: |
        xec on production "
          cd /app &&
          git pull &&
          npm install &&
          npm run build &&
          pm2 restart app
        "
```

### Docker Integration

```typescript
// Build and deploy Docker image
import { $ } from '@xec-sh/core';

async function deployDocker(tag: string) {
  // Build image
  await $`docker build -t myapp:${tag} .`;
  
  // Tag for registry
  await $`docker tag myapp:${tag} registry.example.com/myapp:${tag}`;
  
  // Push to registry
  await $`docker push registry.example.com/myapp:${tag}`;
  
  // Deploy to production
  await $.ssh('prod-server')`
    docker pull registry.example.com/myapp:${tag} &&
    docker stop myapp || true &&
    docker run -d --name myapp -p 80:3000 registry.example.com/myapp:${tag}
  `;
}
```

### AWS Integration

```typescript
// Deploy to AWS ECS
async function deployToECS(cluster: string, service: string) {
  // Build and push image
  await $`
    aws ecr get-login-password --region us-east-1 |
    docker login --username AWS --password-stdin ${ECR_REGISTRY}
  `;
  
  await $`docker build -t ${service} .`;
  await $`docker tag ${service}:latest ${ECR_REGISTRY}/${service}:latest`;
  await $`docker push ${ECR_REGISTRY}/${service}:latest`;
  
  // Update ECS service
  await $`
    aws ecs update-service \
      --cluster ${cluster} \
      --service ${service} \
      --force-new-deployment
  `;
  
  // Wait for deployment
  await $`
    aws ecs wait services-stable \
      --cluster ${cluster} \
      --services ${service}
  `;
}
```

### Kubernetes Deployment

```typescript
// Rolling deployment to Kubernetes
async function deployToK8s(namespace: string, deployment: string) {
  // Update image
  await $`
    kubectl set image deployment/${deployment} \
      app=myapp:${VERSION} \
      -n ${namespace}
  `;
  
  // Wait for rollout
  await $`
    kubectl rollout status deployment/${deployment} \
      -n ${namespace} \
      --timeout=10m
  `;
  
  // Verify deployment
  const pods = await $`
    kubectl get pods -n ${namespace} \
      -l app=${deployment} \
      -o json
  `.json();
  
  console.log(`Deployed ${pods.items.length} pods`);
}
```

### GitLab CI Integration

```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

before_script:
  - npm install -g @xec-sh/cli

test:
  stage: test
  script:
    - xec run test

build:
  stage: build
  script:
    - xec run build
  artifacts:
    paths:
      - dist/

deploy:
  stage: deploy
  only:
    - main
  script:
    - |
      xec on production "
        cd /app &&
        git pull &&
        npm ci --production &&
        pm2 restart app
      "
```

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        XEC_CONFIG_PATH = '.xec/config.yaml'
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g @xec-sh/cli'
            }
        }
        
        stage('Test') {
            steps {
                sh 'xec run test'
            }
        }
        
        stage('Build') {
            steps {
                sh 'xec run build'
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
                    sh '''
                        xec on production "
                            cd /app &&
                            git pull &&
                            npm install &&
                            pm2 restart app
                        "
                    '''
                }
            }
        }
    }
}
```

## Integration Patterns

### Webhook Handlers

```typescript
// Handle GitHub webhooks
async function handleGitHubWebhook(payload: any) {
  if (payload.action === 'opened' && payload.pull_request) {
    // Run tests on new PR
    await $`
      git fetch origin pull/${payload.pull_request.number}/head:pr-${payload.pull_request.number} &&
      git checkout pr-${payload.pull_request.number} &&
      npm test
    `;
  }
}
```

### API Integrations

```typescript
// Integrate with external APIs
class JiraIntegration {
  async createIssue(title: string, description: string) {
    const response = await fetch(`${JIRA_URL}/rest/api/2/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USER}:${JIRA_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          project: { key: 'PROJ' },
          summary: title,
          description,
          issuetype: { name: 'Task' }
        }
      })
    });
    
    return response.json();
  }
}
```

### Slack Notifications

```typescript
// Send deployment notifications to Slack
async function notifySlack(webhook: string, message: any) {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message.text,
      attachments: [{
        color: message.success ? 'good' : 'danger',
        fields: [
          { title: 'Environment', value: message.environment },
          { title: 'Version', value: message.version },
          { title: 'Deployed by', value: message.user },
          { title: 'Duration', value: `${message.duration}s` }
        ]
      }]
    })
  });
}
```

### Event-Driven Automation

```typescript
// React to system events
import { EventEmitter } from 'events';

class DeploymentAutomation extends EventEmitter {
  async onPushToMain(commit: string) {
    this.emit('deployment:start', { commit });
    
    try {
      // Run tests
      await $`npm test`;
      this.emit('tests:passed');
      
      // Build application
      await $`npm run build`;
      this.emit('build:completed');
      
      // Deploy
      await this.deploy();
      this.emit('deployment:success');
      
    } catch (error) {
      this.emit('deployment:failed', error);
      throw error;
    }
  }
}
```

## Security Considerations

### Secret Management

1. **Never commit secrets** to version control
2. **Use environment variables** or secret management services
3. **Rotate credentials** regularly
4. **Limit secret scope** to minimum required permissions
5. **Audit secret access** through logging

For secure credential handling, see:
- [Secrets Command](../commands/built-in/secrets.md) - Managing secrets with Xec

### Network Security

1. **Use SSH keys** instead of passwords
2. **Implement IP whitelisting** where possible
3. **Use VPN or bastion hosts** for production access
4. **Enable audit logging** for all operations
5. **Use TLS/SSL** for all communications

## Performance Optimization

### Connection Pooling

```typescript
// Reuse connections for better performance
const pool = new ConnectionPool({
  max: 10,
  idleTimeout: 30000
});

// Connections are reused automatically
for (const server of servers) {
  await pool.execute(server, 'command');
}
```

For more on connection pooling:
- [Connection Pooling](../core/execution-engine/features/connection-pooling.md) - SSH connection management

### Caching Strategies

```typescript
// Cache expensive operations
const cache = new Map();

async function getDeploymentStatus(env: string) {
  const key = `status:${env}`;
  
  if (cache.has(key)) {
    const cached = cache.get(key);
    if (Date.now() - cached.time < 60000) { // 1 minute
      return cached.data;
    }
  }
  
  const status = await fetchStatus(env);
  cache.set(key, { data: status, time: Date.now() });
  
  return status;
}
```

## Troubleshooting

### Common Issues

1. **Authentication failures** - Check credentials and permissions
2. **Network timeouts** - Adjust timeout values and check connectivity
3. **Rate limiting** - Implement backoff and retry logic
4. **API changes** - Keep SDKs and integrations updated
5. **Resource limits** - Monitor and scale appropriately

### Debug Techniques

```bash
# Enable debug output
XEC_DEBUG=true xec deploy

# Test connectivity
xec on production "echo test"

# Verify credentials
xec config validate

# Check API access
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/status
```

## Related Documentation

- [CI/CD Pipelines](../guides/automation/ci-cd-pipelines.md) - CI/CD best practices
- [API Reference](../api/index.md) - Core API documentation
- [Configuration](../configuration/overview.md) - Configuration guide
- [Recipes](../recipes/index.md) - Integration examples
- [Patterns](../patterns/index.md) - Common patterns and best practices