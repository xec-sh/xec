---
title: GitHub Actions Integration
description: Integrate Xec with GitHub Actions for CI/CD automation
keywords: [github, actions, ci, cd, automation, workflow]
source_files:
  - packages/core/src/index.ts
  - apps/xec/src/main.ts
  - packages/core/src/adapters/local-adapter.ts
key_functions:
  - $.execute()
  - main()
  - LocalAdapter.execute()
verification_date: 2025-01-03
---

# GitHub Actions Integration

## Problem

Integrating Xec into GitHub Actions workflows for automated testing, building, deployment, and other CI/CD tasks while leveraging Xec's multi-environment execution capabilities.

## Solution

Xec can be seamlessly integrated into GitHub Actions workflows, providing powerful command execution, parallel processing, and environment management capabilities within CI/CD pipelines.

## Quick Example

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
      - uses: actions/setup-node@v3
      - run: npm install -g @xec-sh/cli
      - run: xec deploy production
```

## Complete GitHub Actions Recipes

### Xec Action Setup

```yaml
# .github/actions/setup-xec/action.yml
name: 'Setup Xec'
description: 'Install and configure Xec CLI'
inputs:
  version:
    description: 'Xec version to install'
    required: false
    default: 'latest'
  config-path:
    description: 'Path to Xec config file'
    required: false
    default: '.xec/config.yaml'

runs:
  using: 'composite'
  steps:
    - name: Cache Xec
      uses: actions/cache@v3
      with:
        path: ~/.xec
        key: xec-${{ inputs.version }}-${{ runner.os }}
        
    - name: Install Xec
      shell: bash
      run: |
        if [ "${{ inputs.version }}" = "latest" ]; then
          npm install -g @xec-sh/cli
        else
          npm install -g @xec-sh/cli@${{ inputs.version }}
        fi
        
    - name: Verify Installation
      shell: bash
      run: |
        xec --version
        xec config validate --config ${{ inputs.config-path }}
```

### Complete CI/CD Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  release:
    types: [published]

env:
  NODE_VERSION: '18'
  XEC_VERSION: 'latest'

jobs:
  # Lint and Type Check
  quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        with:
          version: ${{ env.XEC_VERSION }}
          
      - name: Install Dependencies
        run: xec run scripts/ci/install.ts
        
      - name: Lint
        run: xec lint --reporter=github
        
      - name: Type Check
        run: xec typecheck --strict
        
      - name: Security Audit
        run: xec audit --level=moderate

  # Unit Tests
  test:
    name: Test (${{ matrix.os }}, Node ${{ matrix.node }})
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [16, 18, 20]
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
          
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Install Dependencies
        run: xec run scripts/ci/install.ts
        
      - name: Run Tests
        run: xec test --coverage --reporter=junit
        env:
          CI: true
          
      - name: Upload Coverage
        if: matrix.os == 'ubuntu-latest' && matrix.node == '18'
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests
          
      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.os }}-${{ matrix.node }}
          path: test-results.xml

  # Integration Tests
  integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
          
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
          
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Install Dependencies
        run: xec run scripts/ci/install.ts
        
      - name: Setup Test Environment
        run: xec run scripts/ci/setup-integration.ts
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          
      - name: Run Integration Tests
        run: xec test:integration --parallel
        
      - name: E2E Tests
        run: xec test:e2e --headless

  # Build
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [quality, test]
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Install Dependencies
        run: xec run scripts/ci/install.ts
        
      - name: Build Application
        run: xec build --env=production
        
      - name: Build Docker Image
        run: |
          xec run scripts/ci/docker-build.ts \
            --tag=${{ github.sha }} \
            --tag=latest
            
      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-artifacts
          path: |
            dist/
            docker-image.tar
            
  # Deploy to Staging
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/develop'
    environment:
      name: staging
      url: https://staging.example.com
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Download Build Artifacts
        uses: actions/download-artifact@v3
        with:
          name: build-artifacts
          
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy to Staging
        run: |
          xec deploy staging \
            --version=${{ github.sha }} \
            --strategy=blue-green
        env:
          DEPLOY_KEY: ${{ secrets.STAGING_DEPLOY_KEY }}
          
      - name: Run Smoke Tests
        run: xec test:smoke --target=staging
        
      - name: Notify Slack
        if: always()
        run: |
          xec notify slack \
            --webhook=${{ secrets.SLACK_WEBHOOK }} \
            --status=${{ job.status }} \
            --environment=staging

  # Deploy to Production
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [build, deploy-staging]
    if: github.event_name == 'release'
    environment:
      name: production
      url: https://example.com
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Download Build Artifacts
        uses: actions/download-artifact@v3
        with:
          name: build-artifacts
          
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy to Production
        run: |
          xec deploy production \
            --version=${{ github.event.release.tag_name }} \
            --strategy=canary \
            --canary-percentage=10
        env:
          DEPLOY_KEY: ${{ secrets.PRODUCTION_DEPLOY_KEY }}
          
      - name: Monitor Deployment
        run: |
          xec run scripts/ci/monitor-deployment.ts \
            --environment=production \
            --duration=5m
            
      - name: Rollback on Failure
        if: failure()
        run: |
          xec rollback production \
            --auto-confirm
            
      - name: Create Release Notes
        run: |
          xec run scripts/ci/generate-release-notes.ts \
            --from=${{ github.event.release.target_commitish }} \
            --to=${{ github.event.release.tag_name }} \
            > release-notes.md
            
      - name: Update Release
        uses: softprops/action-gh-release@v1
        with:
          files: release-notes.md
          body_path: release-notes.md
```

### Xec Scripts for CI/CD

```typescript
// scripts/ci/install.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const ci = process.env.CI === 'true';

console.log(chalk.blue('📦 Installing dependencies...'));

// Use CI-appropriate install command
if (ci) {
  await $`npm ci --prefer-offline --no-audit`;
} else {
  await $`npm install`;
}

// Install additional CI tools
if (ci) {
  await $`npm install -g codecov @sentry/cli`;
}

// Verify installation
await $`npm ls --depth=0`;

console.log(chalk.green('✅ Dependencies installed'));
```

```typescript
// scripts/ci/docker-build.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const tags = process.argv.slice(2).filter(arg => arg.startsWith('--tag=')).map(arg => arg.slice(6));
const registry = process.env.DOCKER_REGISTRY || 'ghcr.io';
const repo = process.env.GITHUB_REPOSITORY || 'org/repo';

console.log(chalk.blue('🐳 Building Docker image...'));

// Build image with cache
const buildArgs = [
  `--cache-from=${registry}/${repo}:latest`,
  `--build-arg=BUILD_DATE=${new Date().toISOString()}`,
  `--build-arg=VCS_REF=${process.env.GITHUB_SHA}`,
  `--build-arg=VERSION=${process.env.GITHUB_REF_NAME}`
];

for (const tag of tags) {
  buildArgs.push(`--tag=${registry}/${repo}:${tag}`);
}

await $`docker buildx build ${buildArgs.join(' ')} --push .`;

// Save image for artifact upload
if (process.env.CI) {
  await $`docker save ${registry}/${repo}:${tags[0]} > docker-image.tar`;
}

console.log(chalk.green('✅ Docker image built and pushed'));
```

```typescript
// scripts/ci/monitor-deployment.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const environment = process.argv.find(arg => arg.startsWith('--environment='))?.slice(14);
const duration = process.argv.find(arg => arg.startsWith('--duration='))?.slice(11) || '5m';

console.log(chalk.blue(`📊 Monitoring ${environment} deployment for ${duration}...`));

const startTime = Date.now();
const durationMs = parseDuration(duration);
const metrics = {
  errors: 0,
  responseTime: [],
  availability: 0
};

// Monitor loop
while (Date.now() - startTime < durationMs) {
  // Check health endpoint
  const healthStart = Date.now();
  const health = await $`curl -f https://${environment}.example.com/health`.nothrow();
  const healthDuration = Date.now() - healthStart;
  
  if (health.ok) {
    metrics.responseTime.push(healthDuration);
    metrics.availability++;
  } else {
    metrics.errors++;
  }
  
  // Check error rate
  const errorRate = await $`
    curl -s https://api.datadoghq.com/api/v1/query \
      -H "DD-API-KEY: ${process.env.DATADOG_API_KEY}" \
      -d "query=sum:app.errors{env:${environment}}.as_rate()"
  `.json();
  
  if (errorRate.series?.[0]?.pointlist?.slice(-1)?.[0]?.[1] > 10) {
    console.error(chalk.red('❌ High error rate detected'));
    process.exit(1);
  }
  
  await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10s
}

// Calculate results
const avgResponseTime = metrics.responseTime.reduce((a, b) => a + b, 0) / metrics.responseTime.length;
const availabilityPercent = (metrics.availability / (metrics.availability + metrics.errors)) * 100;

console.log(chalk.green('📈 Monitoring Results:'));
console.log(`  Average Response Time: ${avgResponseTime}ms`);
console.log(`  Availability: ${availabilityPercent.toFixed(2)}%`);
console.log(`  Errors: ${metrics.errors}`);

if (availabilityPercent < 99.9) {
  console.error(chalk.red('❌ Availability below threshold'));
  process.exit(1);
}

function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)([smh])/);
  if (!match) return 300000; // Default 5 minutes
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return 300000;
  }
}
```

### Matrix Testing

```yaml
# .github/workflows/matrix-test.yml
name: Matrix Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        target: [local, ssh, docker, kubernetes]
        test-suite: [unit, integration, e2e]
        include:
          - target: ssh
            setup: |
              docker run -d --name ssh-test \
                -p 2222:22 \
                xec/ssh-test-server
          - target: docker
            setup: |
              docker run -d --name test-container \
                nginx:alpine
          - target: kubernetes
            setup: |
              kind create cluster --name test
              
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Test Environment
        if: matrix.setup
        run: ${{ matrix.setup }}
        
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Run Tests
        run: |
          xec test:${{ matrix.test-suite }} \
            --target=${{ matrix.target }} \
            --parallel
```

### Reusable Workflows

```yaml
# .github/workflows/reusable-deploy.yml
name: Reusable Deploy Workflow

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      version:
        required: true
        type: string
    secrets:
      deploy_key:
        required: true
      aws_access_key:
        required: true
      aws_secret_key:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Xec
        uses: ./.github/actions/setup-xec
        
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.aws_access_key }}
          aws-secret-access-key: ${{ secrets.aws_secret_key }}
          aws-region: us-east-1
          
      - name: Deploy
        run: |
          xec deploy ${{ inputs.environment }} \
            --version=${{ inputs.version }}
        env:
          DEPLOY_KEY: ${{ secrets.deploy_key }}
```

## Usage Examples

```yaml
# Simple Xec command
- run: xec test

# With environment variables
- run: xec deploy production
  env:
    API_KEY: ${{ secrets.API_KEY }}

# Conditional execution
- run: xec deploy staging
  if: github.ref == 'refs/heads/develop'

# Matrix execution
- run: xec test --target=${{ matrix.target }}

# Artifact handling
- run: xec build --output=dist
- uses: actions/upload-artifact@v3
  with:
    path: dist/
```

## Best Practices

1. **Cache dependencies** to speed up workflows
2. **Use matrix builds** for comprehensive testing
3. **Implement parallel jobs** where possible
4. **Store secrets securely** in GitHub Secrets
5. **Use environments** for deployment protection
6. **Create reusable workflows** for common tasks
7. **Monitor workflow performance** and optimize

## Troubleshooting

### Workflow Debugging

```yaml
# Enable debug logging
- name: Debug
  run: |
    echo "Event: ${{ github.event_name }}"
    echo "Ref: ${{ github.ref }}"
    echo "SHA: ${{ github.sha }}"
  env:
    ACTIONS_STEP_DEBUG: true
    ACTIONS_RUNNER_DEBUG: true
```

### Permission Issues

```yaml
# Grant necessary permissions
permissions:
  contents: read
  packages: write
  deployments: write
  id-token: write
```

## Related Topics

- [GitLab CI Integration](gitlab-ci.md)
- [Jenkins Integration](jenkins.md)
- [AWS Integration](aws-integration.md)
- [Docker Deployment](../deployment/docker-deploy.md)