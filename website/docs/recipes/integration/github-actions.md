---
title: GitHub Actions Integration
description: Run the same locked Xec scripts locally and on GitHub Actions
source_files:
  - apps/xec/src/commands/run.ts
  - packages/ops/src/pipeline/index.ts
---

# GitHub Actions Integration {#github-actions-integration}

## Problem {#problem}

CI must execute the project’s declared build and deployment path without creating a different set of shell commands for each provider.

## Solution {#solution}

Install the committed project lockfile, then invoke its locally installed Xec CLI. GitHub owns job scheduling, credentials and artifacts; Xec owns the scripts and their execution lifecycle.

## Quick Example {#quick-example}

Declare `@xec-sh/cli` in the project and commit `package-lock.json` before using this workflow:

```yaml
name: Verify
on: [push, pull_request]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npx --no-install xec run scripts/ci.ts
```

The [checkout](https://github.com/actions/checkout) and [Node setup](https://github.com/actions/setup-node) actions document their runner requirements. Pin reviewed action commits where immutable workflow inputs are required.

## Complete GitHub Actions Recipes {#complete-github-actions-recipes}

### Xec Action Setup {#xec-action-setup}

No custom installation action is required. `npm ci` installs the exact CLI from the project lockfile. Avoid a global `@latest` install or caching `~/.xec`, which can contain configuration rather than reproducible dependency content. For pnpm projects, use the declared package-manager version, `pnpm install --frozen-lockfile` and `pnpm exec xec` instead.

### Complete CI/CD Workflow {#complete-cicd-workflow}

Keep verification and production activation as separate jobs. This deployment job is added to the workflow above; it runs only on the main branch after verification:

```yaml
# Additional job under jobs:
deploy:
  needs: verify
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: production
  concurrency:
    group: deploy-production
    cancel-in-progress: false
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v7
      with:
        node-version: '24'
        package-manager-cache: false
    - run: npm ci
    - run: npx --no-install xec run scripts/deploy.ts
      env:
        RELEASE_COMMIT: ${{ github.sha }}
        DEPLOY_TARGET: production
```

The project’s `deploy.ts` consumes `RELEASE_COMMIT` and `DEPLOY_TARGET`, as in the [Node deployment recipe](../deployment/node-app-deploy.md), and deploys a verified artifact. Configure its credentials and artifact delivery explicitly. [Workflow permissions and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) apply independently of Xec.

### Xec Scripts for CI/CD {#xec-scripts-for-cicd}

```typescript
// scripts/ci.ts
import { Pipeline } from '@xec-sh/ops';
const result = await Pipeline.create('ci')
  .step('lint', { run: 'npm run lint' })
  .step('types', { run: 'npm run typecheck' })
  .step('test', { run: 'npm test' })
  .step('build', { run: 'npm run build', dependsOn: ['lint', 'types', 'test'] })
  .run({}, { concurrency: 3, onEvent: event => { console.log(event); } });
if (!result.success) throw new Error(`CI ${result.status}`);
```

Declare these package scripts in the application. If its build tool already owns the dependency graph and cache, call that tool once from the pipeline instead of duplicating the graph. `xec lint`, `xec test` and `xec deploy` are not universal built-in commands.

### Matrix Testing {#matrix-testing}

Use a provider matrix for independent OS/runtime jobs. The CLI requires Node 22.18 or newer; library-only Node 20 validation runs without the CLI.

```yaml
# Job fragment; reuse the verification steps above.
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: ['22.18.0', '24']
runs-on: ${{ matrix.os }}
```

Set `actions/setup-node`’s `node-version` to `${{ matrix.node }}` in that job. Confirm all project dependencies support the selected Node version.

### Reusable Workflows {#reusable-workflows}

A reusable workflow can expose a `workflow_call` interface while calling the same `scripts/ci.ts`. Keep permissions and secret forwarding explicit. Do not download and execute unreviewed pull-request code in a privileged deployment context.

## Usage Examples {#usage-examples}

```bash
npm ci
npx --no-install xec run scripts/ci.ts
```

This is the same entry point used by the workflow. Deployment is a separate command with its own prepared artifact and credentials.

## Best Practices {#best-practices}

Keep the CLI in the lockfile, retain build artifacts by commit, preserve a nonzero verification exit code and avoid retries around ambiguous deployment mutations. Use repository-scoped concurrency for the same environment while allowing independent projects to run concurrently.

## Troubleshooting {#troubleshooting}

### Workflow Debugging {#workflow-debugging}

Check the installed Node/CLI versions, current directory and package script name. A missing dynamic command means the project did not define it; switch to the explicit `xec run scripts/name.ts` entry point rather than assuming a built-in exists.

### Permission Issues {#permission-issues}

Review the failing provider operation and the job’s credentials. Xec does not grant GitHub, registry, SSH or cloud permissions. Do not widen unrelated job permissions to hide an installation or target-resolution error.

## Related Topics {#related-topics}

- [CI Integration](../../integrations/index.md)
- [Pipeline API](../../ops/pipeline.md)
- [Node.js Deployment](../deployment/node-app-deploy.md)
