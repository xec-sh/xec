---
title: Jenkins Integration Recipe
description: Run project-owned Xec scripts on explicit Jenkins agents
source_files:
  - apps/xec/src/commands/run.ts
  - packages/ops/src/pipeline/index.ts
---

# Jenkins Integration Recipe

## Implementation Reference

`apps/xec/src/commands/run.ts` implements the script entry point; `packages/ops/src/pipeline/index.ts` provides shared steps and outcomes.

## Overview

Jenkins selects agents, credentials and job boundaries. Xec executes the project’s checked scripts. Install the CLI from the committed project lockfile rather than globally selecting the newest package on each run.

## Declarative Pipeline

### Basic Jenkins Pipeline

Provision an agent labelled `node24` with Node 24 and the job’s required tools. The project declares `@xec-sh/cli` and `scripts/ci.ts`:

```groovy
pipeline {
  agent { label 'node24' }
  options {
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
  }
  stages {
    stage('Install') { steps { sh 'npm ci' } }
    stage('Verify') { steps { sh 'npx --no-install xec run scripts/ci.ts' } }
  }
}
```

This example uses Unix agent steps. Use Jenkins’ `bat` or `powershell` step on a Windows agent. See the [Jenkins pipeline syntax](https://www.jenkins.io/doc/book/pipeline/syntax/) for installed directives and plugins.

## Advanced Pipeline with Docker

### Multi-Stage Docker Pipeline

Use a reviewed Docker-capable agent when the application actually builds or deploys images. Keep the image digest and artifact acceptance in the application’s Xec deployment script. Running Xec inside a container does not automatically grant safe access to the host Docker daemon.

## Scripted Pipeline

### Dynamic Pipeline Generation

```groovy
node('node24') {
  checkout scm
  stage('Install') { sh 'npm ci' }
  stage('Verify') { sh 'npx --no-install xec run scripts/ci.ts' }
}
```

Keep dynamically selected stages restricted to reviewed project data. Do not construct shell source from pull-request text.

## Jenkins Shared Library

### Xec Pipeline Library

A Jenkins shared library may wrap agent selection and credential binding while calling the same explicit Xec script. Do not copy the build graph into a second Groovy deployment manager; the application script remains the local and CI entry point.

## Blue Ocean Pipeline

### Visual Pipeline Configuration

Name Jenkins stages after meaningful boundaries such as installation, verification and activation. Xec’s structured pipeline events describe steps inside a stage. A viewer changes presentation, not the execution contract.

## Jenkins Configuration as Code

### JCasC with Xec Jobs

Manage agent labels, credentials and job configuration through the installed Jenkins Configuration as Code and job plugins. Xec does not provide a separate JCasC schema. Validate the configuration against the exact plugin versions on that controller.

## Credentials Management

### Using Jenkins Credentials

With Jenkins’ Credentials Binding plugin installed, expose only the credential needed by the application script:

```groovy
node('node24') {
  checkout scm
  sh 'npm ci'
  withCredentials([string(credentialsId: 'staging-deploy-token', variable: 'DEPLOY_TOKEN')]) {
    sh 'npx --no-install xec run scripts/deploy.ts'
  }
}
```

The script reads `process.env.DEPLOY_TOKEN`; it must not log it or interpolate it into an unauthenticated remote endpoint. Deployment permissions still belong to the configured provider.

## Performance Monitoring

### Pipeline Metrics Collection

```typescript
// scripts/ci.ts
import { Pipeline } from '@xec-sh/ops';
const result = await Pipeline.create('verify')
  .step('types', { run: 'npm run typecheck' })
  .step('test', { run: 'npm test' })
  .run({}, { concurrency: 2 });
console.log(JSON.stringify({ status: result.status, duration: result.duration, summary: result.summary }));
if (!result.success) throw new Error(`Verification ${result.status}`);
```

Retain the CI job’s actual outcome. A metrics upload should not turn a failed verification into a successful deployment.

## Jenkins Agents with Xec

### Docker Agent Configuration

Build the agent image from a reviewed Node 24 base and pin its digest in Jenkins. Install project dependencies with the lockfile in the job. Keep SSH, registry and cloud credentials outside the image.

### Kubernetes Agent

The Jenkins Kubernetes plugin owns the agent pod. Its service account must match the job’s required access, and its resource limits should reflect the declared concurrency. A Kubernetes agent is not automatically a deployment target.

## Xec Configuration for Jenkins

```yaml
version: '1.0'
tasks:
  ci:
    command: xec run scripts/ci.ts
  deploy:
    command: xec run scripts/deploy.ts
```

The explicit `xec run` form works without these project task aliases.

## Performance Characteristics

### Pipeline Performance

Measure package installation, compilation, tests and transfer separately. Reuse verified artifacts and package-download caches without caching credentials or mutable installation state.

### Optimization Tips

Parallelize independent verification jobs within agent capacity. Serialize mutations to one installation. Do not run both a Jenkins matrix and an unbounded inner worker pool over the same machine.

## Troubleshooting

### Common Issues

Verify agent Node version, lockfile installation, script path and provider credential scope. If a job is interrupted, wait for owned cleanup and inspect the target’s recorded state before restarting a deployment.

## Related Recipes

- [GitHub Actions](github-actions.md)
- [GitLab CI](gitlab-ci.md)
- [Docker Deployment](../deployment/docker-deploy.md)

## See Also

- [Pipeline API](../../ops/pipeline.md)
- [CLI Run Command](../../commands/built-in/run.md)
