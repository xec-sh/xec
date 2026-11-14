---
title: Jenkins Integration Recipe
description: Run project-owned Xec scripts on explicit Jenkins agents
source_files:
  - apps/xec/src/commands/run.ts
  - packages/ops/src/pipeline/index.ts
---

# Jenkins Integration Recipe {#jenkins-integration-recipe}

## Implementation Reference {#implementation-reference}

`apps/xec/src/commands/run.ts` implements the script entry point; `packages/ops/src/pipeline/index.ts` provides shared steps and outcomes.

## Overview {#overview}

Jenkins selects agents, credentials and job boundaries. Xec executes the project’s checked scripts. Install the CLI from the committed project lockfile rather than globally selecting the newest package on each run.

## Declarative Pipeline {#declarative-pipeline}

### Basic Jenkins Pipeline {#basic-jenkins-pipeline}

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

## Advanced Pipeline with Docker {#advanced-pipeline-with-docker}

### Multi-Stage Docker Pipeline {#multi-stage-docker-pipeline}

Use a reviewed Docker-capable agent when the application actually builds or deploys images. Keep the image digest and artifact acceptance in the application’s Xec deployment script. Running Xec inside a container does not automatically grant safe access to the host Docker daemon.

## Scripted Pipeline {#scripted-pipeline}

### Dynamic Pipeline Generation {#dynamic-pipeline-generation}

```groovy
node('node24') {
  checkout scm
  stage('Install') { sh 'npm ci' }
  stage('Verify') { sh 'npx --no-install xec run scripts/ci.ts' }
}
```

Keep dynamically selected stages restricted to reviewed project data. Do not construct shell source from pull-request text.

## Jenkins Shared Library {#jenkins-shared-library}

### Xec Pipeline Library {#xec-pipeline-library}

A Jenkins shared library may wrap agent selection and credential binding while calling the same explicit Xec script. Do not copy the build graph into a second Groovy deployment manager; the application script remains the local and CI entry point.

## Blue Ocean Pipeline {#blue-ocean-pipeline}

### Visual Pipeline Configuration {#visual-pipeline-configuration}

Name Jenkins stages after meaningful boundaries such as installation, verification and activation. Xec’s structured pipeline events describe steps inside a stage. A viewer changes presentation, not the execution contract.

## Jenkins Configuration as Code {#jenkins-configuration-as-code}

### JCasC with Xec Jobs {#jcasc-with-xec-jobs}

Manage agent labels, credentials and job configuration through the installed Jenkins Configuration as Code and job plugins. Xec does not provide a separate JCasC schema. Validate the configuration against the exact plugin versions on that controller.

## Credentials Management {#credentials-management}

### Using Jenkins Credentials {#using-jenkins-credentials}

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

## Performance Monitoring {#performance-monitoring}

### Pipeline Metrics Collection {#pipeline-metrics-collection}

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

## Jenkins Agents with Xec {#jenkins-agents-with-xec}

### Docker Agent Configuration {#docker-agent-configuration}

Build the agent image from a reviewed Node 24 base and pin its digest in Jenkins. Install project dependencies with the lockfile in the job. Keep SSH, registry and cloud credentials outside the image.

### Kubernetes Agent {#kubernetes-agent}

The Jenkins Kubernetes plugin owns the agent pod. Its service account must match the job’s required access, and its resource limits should reflect the declared concurrency. A Kubernetes agent is not automatically a deployment target.

## Xec Configuration for Jenkins {#xec-configuration-for-jenkins}

```yaml
version: '1.0'
tasks:
  ci:
    command: xec run scripts/ci.ts
  deploy:
    command: xec run scripts/deploy.ts
```

The explicit `xec run` form works without these project task aliases.

## Performance Characteristics {#performance-characteristics}

### Pipeline Performance {#pipeline-performance}

Measure package installation, compilation, tests and transfer separately. Reuse verified artifacts and package-download caches without caching credentials or mutable installation state.

### Optimization Tips {#optimization-tips}

Parallelize independent verification jobs within agent capacity. Serialize mutations to one installation. Do not run both a Jenkins matrix and an unbounded inner worker pool over the same machine.

## Troubleshooting {#troubleshooting}

### Common Issues {#common-issues}

Verify agent Node version, lockfile installation, script path and provider credential scope. If a job is interrupted, wait for owned cleanup and inspect the target’s recorded state before restarting a deployment.

## Related Recipes {#related-recipes}

- [GitHub Actions](github-actions.md)
- [GitLab CI](gitlab-ci.md)
- [Docker Deployment](../deployment/docker-deploy.md)

## See Also {#see-also}

- [Pipeline API](../../ops/pipeline.md)
- [CLI Run Command](../../commands/built-in/run.md)
