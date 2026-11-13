---
title: GitLab CI Integration Recipe
description: Use locked Xec scripts in GitLab CI jobs and protected deployment environments
source_files:
  - apps/xec/src/commands/run.ts
  - packages/ops/src/pipeline/index.ts
---

# GitLab CI Integration Recipe

## Implementation Reference

The CLI script entry point is `apps/xec/src/commands/run.ts`; shared asynchronous pipelines are implemented in `packages/ops/src/pipeline/index.ts`.

## Overview

Install the project’s locked CLI and run the same checked scripts as local development. GitLab owns runners, job artifacts, protected variables and environment scheduling.

## Basic GitLab CI Configuration

### Simple Pipeline with Xec

```yaml
image: node:24-bookworm-slim
stages: [verify, deploy]
variables:
  npm_config_cache: $CI_PROJECT_DIR/.npm
default:
  before_script:
    - npm ci
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/]
verify:
  stage: verify
  script:
    - npx --no-install xec run scripts/ci.ts
```

The project declares Xec and the script in its repository. Pin the selected runner image digest for immutable CI inputs. Validate workflow changes with [GitLab’s CI configuration tools](https://docs.gitlab.com/ci/yaml/).

## Advanced Pipeline Configuration

### Multi-Environment Deployment

```yaml
# Additional job in the pipeline above.
deploy-production:
  stage: deploy
  needs: [verify]
  environment: production
  resource_group: production
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      when: manual
  script:
    - npx --no-install xec run scripts/deploy.ts
  variables:
    RELEASE_COMMIT: $CI_COMMIT_SHA
    DEPLOY_TARGET: production
```

The application script verifies and deploys that exact artifact. Configure protected credentials and the deployment environment before enabling the job. The resource group serializes this project’s production installation, not other repositories.

## GitLab Runner Configuration

### Docker Executor Setup

Select a maintained Node 24 runner image with the tools required by the job. A Node image does not automatically include Docker, kubectl, Helm or cloud CLIs. Provision those through the runner’s reviewed image rather than installing mutable tools inside every script.

### Kubernetes Executor

The runner owns its pod identity and resource limits. Grant the job only the namespace access its deployment requires. Do not mount an unrestricted host Docker socket or cluster-admin kubeconfig simply to run Xec.

## Secret Management

### Using GitLab CI Variables

```typescript
// scripts/check-deploy-inputs.ts
const commit = process.env.RELEASE_COMMIT;
const target = process.env.DEPLOY_TARGET;
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full release commit is required');
if (target !== 'staging' && target !== 'production') throw new Error('Select a declared deployment target');
console.log(`Prepared inputs for ${target} at ${commit}`);
```

Use protected, masked or file variables for credentials as appropriate; do not print their values or dump the process environment.

### Vault Integration

Use the runner’s configured external-secret integration to materialize a limited credential. Xec consumes the resulting file or environment variable. Token exchange, audience and trust policy belong to that integration; a script must not invent an unauthenticated Vault read path.

## Monitoring and Notifications

### Pipeline Status Notifications

Prefer the provider’s notification integration. A custom webhook must check its response and keep the URL out of logs:

```typescript
const webhook = process.env.STATUS_WEBHOOK;
if (!webhook) throw new Error('STATUS_WEBHOOK is required');
const response = await fetch(webhook, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ project: process.env.CI_PROJECT_PATH, pipeline: process.env.CI_PIPELINE_ID, status: process.env.CI_JOB_STATUS }),
  signal: AbortSignal.timeout(5000)
});
if (!response.ok) throw new Error(`Notification failed (${response.status})`);
```

Run this in the provider’s finalization phase; do not let a successful notification replace the original job failure.

## Caching Strategies

### Efficient Caching Configuration

Cache package-manager downloads using the lockfile key, as above. Keep credentials and mutable deployment state out of the cache. A restored cache does not replace the lockfile installation or artifact verification.

## Performance Optimization

### Parallel Job Execution

Use GitLab jobs for independent OS/runtime or test shards, and the shared Xec `Pipeline` for steps within a job. Avoid multiplying both levels of concurrency beyond runner capacity.

## GitLab-Specific Features

### Merge Request Pipelines

Run verification on merge requests without exposing production credentials. A merge request pipeline is not authorization to deploy its source to a protected environment.

### Dynamic Child Pipelines

Generate child configuration only from reviewed repository data and validate it with GitLab’s parser. Keep Xec task execution in the child job’s explicit script entry point; do not evaluate arbitrary configuration as JavaScript.

## Xec Configuration for GitLab

```yaml
version: '1.0'
tasks:
  ci:
    command: xec run scripts/ci.ts
  deploy:
    command: xec run scripts/deploy.ts
```

These are project-defined tasks, not extra built-in subcommands. The explicit script form remains valid without this task declaration.

## Performance Characteristics

### Pipeline Performance

Measure install, build, test and delivery durations separately. Reuse an accepted artifact after verification instead of repeating the build during publication.

### Job Execution

Set provider job deadlines and operation timeouts based on measured work. Cancellation must await owned process cleanup before another job reuses the same installation.

## Troubleshooting

### Common Issues

A missing CLI indicates an incomplete lockfile installation. A target-resolution failure indicates missing project configuration. A cloud authorization failure belongs to the job’s credential contract. Diagnose the failed layer rather than retrying the entire deployment.

## Related Recipes

- [GitHub Actions](github-actions.md)
- [Jenkins](jenkins.md)
- [Node.js Deployment](../deployment/node-app-deploy.md)

## See Also

- [Pipeline API](../../ops/pipeline.md)
- [Configuration](../../configuration/overview.md)
