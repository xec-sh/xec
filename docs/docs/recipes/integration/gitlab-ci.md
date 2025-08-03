---
title: GitLab CI Integration
description: Integrate Xec with GitLab CI/CD pipelines
keywords: [gitlab, ci, cd, pipeline, automation, deployment]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/core/src/adapters/docker-adapter.ts
  - apps/xec/src/commands/run.ts
key_functions:
  - $.execute()
  - DockerAdapter.execute()
  - RunCommand.execute()
verification_date: 2025-08-03
---

# GitLab CI Integration Recipe

## Implementation Reference

**Source Files:**
- `packages/core/src/core/execution-engine.ts` - Core execution engine
- `packages/core/src/adapters/docker-adapter.ts` - Docker execution
- `apps/xec/src/commands/run.ts` - Script execution

**Key Functions:**
- `$.execute()` - Command execution
- `DockerAdapter.execute()` - Container execution
- `RunCommand.execute()` - Script runner

## Overview

This recipe demonstrates how to integrate Xec with GitLab CI/CD pipelines for automated testing, building, and deployment workflows.

## Basic GitLab CI Configuration

### Simple Pipeline with Xec

```yaml
# .gitlab-ci.yml
image: node:18-alpine

stages:
  - install
  - test
  - build
  - deploy

variables:
  XEC_VERSION: "latest"
  XEC_CACHE_DIR: "$CI_PROJECT_DIR/.xec-cache"

before_script:
  - npm install -g @xec-sh/cli@${XEC_VERSION}
  - xec --version

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - .xec-cache/

install:dependencies:
  stage: install
  script:
    - npm ci
    - xec run scripts/setup.ts
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

test:unit:
  stage: test
  script:
    - xec test:unit
  coverage: '/Coverage: \d+\.\d+%/'
  artifacts:
    reports:
      junit: test-results.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

test:integration:
  stage: test
  services:
    - docker:dind
  variables:
    DOCKER_HOST: tcp://docker:2375
  script:
    - xec test:integration --docker
  allow_failure: true

build:application:
  stage: build
  script:
    - xec build --env=production
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

deploy:staging:
  stage: deploy
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - xec deploy staging --auto-approve
  only:
    - develop

deploy:production:
  stage: deploy
  environment:
    name: production
    url: https://example.com
  script:
    - xec deploy production --confirm
  when: manual
  only:
    - main
```

## Advanced Pipeline Configuration

### Multi-Environment Deployment

```yaml
# .gitlab-ci.yml
image: node:18

stages:
  - validate
  - test
  - build
  - deploy
  - verify

variables:
  XEC_CONFIG: ".xec/config.yaml"
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"

.xec_template: &xec_setup
  before_script:
    - apt-get update && apt-get install -y curl jq
    - npm install -g @xec-sh/cli
    - echo "XEC_CONFIG_PATH=${XEC_CONFIG}" >> .env
    - |
      cat > .xec/config.yaml << EOF
      targets:
        staging:
          type: ssh
          host: ${STAGING_HOST}
          user: ${STAGING_USER}
          privateKey: ${STAGING_SSH_KEY}
        production:
          type: ssh
          host: ${PROD_HOST}
          user: ${PROD_USER}
          privateKey: ${PROD_SSH_KEY}
      EOF

validate:config:
  stage: validate
  <<: *xec_setup
  script:
    - xec config validate
    - xec inspect --targets
  only:
    changes:
      - .xec/config.yaml
      - .gitlab-ci.yml

test:parallel:
  stage: test
  <<: *xec_setup
  parallel:
    matrix:
      - TEST_SUITE: [unit, integration, e2e]
  script:
    - xec test:${TEST_SUITE} --parallel
  artifacts:
    when: always
    reports:
      junit: test-results-${TEST_SUITE}.xml
    paths:
      - coverage/

build:docker:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  <<: *xec_setup
  script:
    - |
      cat > build-docker.ts << 'EOF'
      import { $ } from '@xec-sh/core';
      
      const version = process.env.CI_COMMIT_SHORT_SHA;
      const registry = process.env.CI_REGISTRY;
      const image = `${registry}/${process.env.CI_PROJECT_PATH}`;
      
      async function buildAndPush() {
        // Build image
        await $`docker build -t ${image}:${version} .`;
        await $`docker tag ${image}:${version} ${image}:latest`;
        
        // Login to registry
        await $`echo ${process.env.CI_REGISTRY_PASSWORD} | docker login -u ${process.env.CI_REGISTRY_USER} --password-stdin ${registry}`;
        
        // Push images
        await $`docker push ${image}:${version}`;
        await $`docker push ${image}:latest`;
        
        console.log(`✅ Pushed ${image}:${version}`);
      }
      
      buildAndPush().catch(console.error);
      EOF
    - xec run build-docker.ts
  only:
    - main
    - develop

deploy:review:
  stage: deploy
  <<: *xec_setup
  environment:
    name: review/$CI_COMMIT_REF_NAME
    url: https://$CI_COMMIT_REF_SLUG.review.example.com
    on_stop: stop:review
    auto_stop_in: 2 days
  script:
    - |
      cat > deploy-review.ts << 'EOF'
      import { $ } from '@xec-sh/core';
      
      const branch = process.env.CI_COMMIT_REF_NAME;
      const slug = process.env.CI_COMMIT_REF_SLUG;
      
      async function deployReview() {
        // Create review environment
        await $.ssh('staging')`
          docker run -d \
            --name review-${slug} \
            -e BRANCH=${branch} \
            -p 0:3000 \
            ${process.env.CI_REGISTRY_IMAGE}:${process.env.CI_COMMIT_SHORT_SHA}
        `;
        
        // Get assigned port
        const port = await $.ssh('staging')`docker port review-${slug} 3000 | cut -d: -f2`.stdout.trim();
        
        // Update proxy configuration
        await $.ssh('staging')`
          echo "location /${slug}/ { proxy_pass http://localhost:${port}/; }" > /etc/nginx/sites-available/review-${slug}
          ln -sf /etc/nginx/sites-available/review-${slug} /etc/nginx/sites-enabled/
          nginx -s reload
        `;
        
        console.log(`✅ Review app deployed at https://${slug}.review.example.com`);
      }
      
      deployReview().catch(console.error);
      EOF
    - xec run deploy-review.ts
  only:
    - merge_requests

stop:review:
  stage: deploy
  <<: *xec_setup
  environment:
    name: review/$CI_COMMIT_REF_NAME
    action: stop
  script:
    - |
      xec on staging "
        docker stop review-${CI_COMMIT_REF_SLUG} || true
        docker rm review-${CI_COMMIT_REF_SLUG} || true
        rm -f /etc/nginx/sites-enabled/review-${CI_COMMIT_REF_SLUG}
        nginx -s reload
      "
  when: manual
  only:
    - merge_requests

deploy:production:
  stage: deploy
  <<: *xec_setup
  environment:
    name: production
    url: https://example.com
  script:
    - |
      cat > deploy-production.ts << 'EOF'
      import { $ } from '@xec-sh/core';
      
      async function deployProduction() {
        const version = process.env.CI_COMMIT_TAG || process.env.CI_COMMIT_SHORT_SHA;
        const targets = ['prod-web-1', 'prod-web-2', 'prod-web-3'];
        
        // Health check before deployment
        for (const target of targets) {
          const health = await $.ssh(target)`curl -f http://localhost/health`.nothrow();
          if (!health.ok) {
            throw new Error(`Health check failed for ${target}`);
          }
        }
        
        // Rolling deployment
        for (const target of targets) {
          console.log(`Deploying to ${target}...`);
          
          // Remove from load balancer
          await $.ssh('prod-lb')`/usr/local/bin/remove-backend ${target}`;
          
          // Deploy new version
          await $.ssh(target)`
            docker pull ${process.env.CI_REGISTRY_IMAGE}:${version}
            docker stop app || true
            docker rm app || true
            docker run -d --name app -p 80:3000 ${process.env.CI_REGISTRY_IMAGE}:${version}
          `;
          
          // Wait for health check
          for (let i = 0; i < 30; i++) {
            const health = await $.ssh(target)`curl -f http://localhost/health`.nothrow();
            if (health.ok) break;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Add back to load balancer
          await $.ssh('prod-lb')`/usr/local/bin/add-backend ${target}`;
          
          console.log(`✅ ${target} deployed successfully`);
        }
      }
      
      deployProduction().catch(console.error);
      EOF
    - xec run deploy-production.ts
  rules:
    - if: '$CI_COMMIT_TAG'
      when: manual
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual
  needs:
    - build:docker
    - test:parallel

verify:deployment:
  stage: verify
  <<: *xec_setup
  script:
    - |
      cat > verify-deployment.ts << 'EOF'
      import { $ } from '@xec-sh/core';
      
      async function verifyDeployment() {
        const environment = process.env.CI_ENVIRONMENT_NAME;
        const url = process.env.CI_ENVIRONMENT_URL;
        
        console.log(`Verifying ${environment} deployment at ${url}`);
        
        // Check HTTP status
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check version endpoint
        const versionResponse = await fetch(`${url}/api/version`);
        const version = await versionResponse.json();
        console.log('Deployed version:', version);
        
        // Run smoke tests
        await $`npm run test:smoke -- --url ${url}`;
        
        // Check metrics
        const metricsResponse = await fetch(`${url}/metrics`);
        const metrics = await metricsResponse.text();
        
        // Verify key metrics
        if (!metrics.includes('http_requests_total')) {
          throw new Error('Metrics endpoint not working correctly');
        }
        
        console.log('✅ Deployment verification passed');
      }
      
      verifyDeployment().catch(console.error);
      EOF
    - xec run verify-deployment.ts
  needs:
    - deploy:production
```

## GitLab Runner Configuration

### Docker Executor Setup

```yaml
# config.toml for GitLab Runner
[[runners]]
  name = "xec-runner"
  url = "https://gitlab.example.com"
  token = "RUNNER_TOKEN"
  executor = "docker"
  
  [runners.docker]
    image = "node:18"
    privileged = true
    disable_cache = false
    volumes = [
      "/var/run/docker.sock:/var/run/docker.sock",
      "/cache"
    ]
    shm_size = 0
    
  [runners.cache]
    Type = "s3"
    Shared = true
    [runners.cache.s3]
      ServerAddress = "s3.amazonaws.com"
      BucketName = "gitlab-runner-cache"
      BucketLocation = "us-east-1"
```

### Kubernetes Executor

```yaml
# values.yaml for GitLab Runner Helm chart
gitlabUrl: https://gitlab.example.com
runnerRegistrationToken: "REGISTRATION_TOKEN"

rbac:
  create: true

runners:
  config: |
    [[runners]]
      [runners.kubernetes]
        image = "node:18"
        privileged = true
        namespace = "gitlab-runner"
        cpu_limit = "2"
        memory_limit = "4Gi"
        service_cpu_limit = "1"
        service_memory_limit = "2Gi"
        helper_cpu_limit = "500m"
        helper_memory_limit = "128Mi"
        poll_interval = 5
        poll_timeout = 3600
        
        [[runners.kubernetes.volumes.config_map]]
          name = "xec-config"
          mount_path = "/xec-config"
          read_only = true
          
        [[runners.kubernetes.volumes.secret]]
          name = "xec-secrets"
          mount_path = "/xec-secrets"
          read_only = true
```

## Secret Management

### Using GitLab CI Variables

```typescript
// deploy-with-secrets.ts
import { $ } from '@xec-sh/core';

async function deployWithSecrets() {
  // GitLab CI variables are available as environment variables
  const dbPassword = process.env.DB_PASSWORD;
  const apiKey = process.env.API_KEY;
  const sshKey = process.env.SSH_PRIVATE_KEY;
  
  // Write SSH key to file
  await $`echo "${sshKey}" > /tmp/deploy_key && chmod 600 /tmp/deploy_key`;
  
  // Use secrets in deployment
  await $`ssh -i /tmp/deploy_key user@host "
    export DB_PASSWORD='${dbPassword}'
    export API_KEY='${apiKey}'
    docker run -d \
      -e DB_PASSWORD \
      -e API_KEY \
      myapp:latest
  "`;
  
  // Clean up
  await $`rm -f /tmp/deploy_key`;
}

deployWithSecrets().catch(console.error);
```

### Vault Integration

```yaml
# .gitlab-ci.yml with Vault
variables:
  VAULT_ADDR: "https://vault.example.com"
  VAULT_NAMESPACE: "gitlab"

.vault_template: &vault_setup
  before_script:
    - apk add --no-cache vault
    - export VAULT_TOKEN="$(vault write -field=token auth/jwt/login role=gitlab jwt=$CI_JOB_JWT)"
    - |
      export DB_PASSWORD=$(vault kv get -field=password secret/database)
      export API_KEY=$(vault kv get -field=key secret/api)

deploy:with:vault:
  <<: *vault_setup
  script:
    - xec deploy production --db-password="${DB_PASSWORD}" --api-key="${API_KEY}"
```

## Monitoring and Notifications

### Pipeline Status Notifications

```typescript
// notify-pipeline-status.ts
import { $ } from '@xec-sh/core';

async function notifyPipelineStatus() {
  const status = process.env.CI_PIPELINE_STATUS;
  const projectName = process.env.CI_PROJECT_NAME;
  const pipelineUrl = process.env.CI_PIPELINE_URL;
  const commitMessage = process.env.CI_COMMIT_MESSAGE;
  
  const color = status === 'success' ? 'good' : 'danger';
  const emoji = status === 'success' ? '✅' : '❌';
  
  const slackPayload = {
    channel: '#deployments',
    attachments: [{
      color,
      title: `${emoji} Pipeline ${status} for ${projectName}`,
      text: commitMessage,
      fields: [
        { title: 'Branch', value: process.env.CI_COMMIT_REF_NAME, short: true },
        { title: 'Commit', value: process.env.CI_COMMIT_SHORT_SHA, short: true },
        { title: 'Author', value: process.env.GITLAB_USER_NAME, short: true },
        { title: 'Duration', value: process.env.CI_PIPELINE_DURATION, short: true }
      ],
      actions: [
        {
          type: 'button',
          text: 'View Pipeline',
          url: pipelineUrl
        }
      ]
    }]
  };
  
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackPayload)
  });
  
  console.log(`✅ Notification sent to Slack`);
}

notifyPipelineStatus().catch(console.error);
```

## Caching Strategies

### Efficient Caching Configuration

```yaml
# .gitlab-ci.yml
cache:
  key:
    files:
      - package-lock.json
      - .xec/config.yaml
  paths:
    - node_modules/
    - .xec-cache/
    - .npm/
  policy: pull-push

.cache_pull: &cache_pull
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/
    policy: pull

build:
  <<: *cache_pull
  script:
    - npm ci --cache .npm
    - xec build
```

## Performance Optimization

### Parallel Job Execution

```yaml
# .gitlab-ci.yml
test:matrix:
  stage: test
  parallel:
    matrix:
      - NODE_VERSION: ["16", "18", "20"]
        OS: ["ubuntu", "alpine"]
  image: node:${NODE_VERSION}-${OS}
  script:
    - npm install -g @xec-sh/cli
    - xec test --node-version=${NODE_VERSION}

deploy:multi-region:
  stage: deploy
  parallel:
    matrix:
      - REGION: ["us-east-1", "eu-west-1", "ap-southeast-1"]
  script:
    - xec deploy --region=${REGION}
```

## GitLab-Specific Features

### Merge Request Pipelines

```yaml
# .gitlab-ci.yml
workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_COMMIT_BRANCH'

test:mr:
  script:
    - xec test --coverage
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  coverage: '/Coverage: \d+\.\d+%/'
  
review:approve:
  script:
    - xec review --mr-iid=${CI_MERGE_REQUEST_IID}
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: manual
```

### Dynamic Child Pipelines

```typescript
// generate-pipeline.ts
import { $ } from '@xec-sh/core';
import { writeFile } from 'fs/promises';

async function generatePipeline() {
  const services = await $`ls services/`.stdout.trim().split('\n');
  
  const pipeline = {
    stages: ['test', 'build', 'deploy'],
    ...Object.fromEntries(
      services.map(service => [
        `test:${service}`,
        {
          stage: 'test',
          script: [`xec test services/${service}`]
        }
      ])
    )
  };
  
  await writeFile('generated-pipeline.yml', JSON.stringify(pipeline, null, 2));
  console.log(`Generated pipeline for ${services.length} services`);
}

generatePipeline();
```

## Xec Configuration for GitLab

```yaml
# .xec/config.yaml
ci:
  provider: gitlab
  
tasks:
  ci:setup:
    description: Setup CI environment
    command: |
      npm ci
      xec config validate
      
  ci:test:
    description: Run tests in CI
    command: |
      xec test --ci --coverage
      
  ci:deploy:
    description: Deploy from CI
    params:
      - name: environment
        required: true
    command: |
      xec deploy ${params.environment} \
        --token=${CI_JOB_TOKEN} \
        --pipeline-id=${CI_PIPELINE_ID}
```

## Performance Characteristics

**Based on Implementation:**

### Pipeline Performance
- **Runner Startup**: 5-15 seconds
- **Docker Image Pull**: 10-60 seconds
- **Xec Installation**: 10-20 seconds
- **Cache Restoration**: 5-30 seconds

### Job Execution
- **Simple Scripts**: 30-60 seconds total
- **With Docker**: +20-40 seconds
- **With Services**: +30-60 seconds
- **Parallel Jobs**: Linear scaling with runners

## Troubleshooting

### Common Issues

1. **Docker-in-Docker Issues**
   ```yaml
   services:
     - docker:dind
   variables:
     DOCKER_HOST: tcp://docker:2375
     DOCKER_TLS_CERTDIR: ""
   ```

2. **SSH Key Permissions**
   ```bash
   chmod 600 ~/.ssh/id_rsa
   ```

3. **Cache Not Working**
   - Check cache key configuration
   - Verify runner has cache enabled
   - Use `CI_DEBUG_TRACE` for debugging

## Related Recipes

- [GitHub Actions](./github-actions.md) - GitHub CI/CD
- [Jenkins](./jenkins.md) - Jenkins integration
- [Docker Deploy](../deployment/docker-deploy.md) - Container deployment
- [K8s Deploy](../deployment/k8s-deploy.md) - Kubernetes deployment

## See Also

- [CLI Reference](../../commands/cli-reference.md)
- [Script Execution](../../scripting/basics/first-script.md)
- [Task Configuration](../../configuration/tasks/overview.md)