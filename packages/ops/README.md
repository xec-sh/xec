# @xec-sh/ops

Workflow and operations tooling built on Xec Core: pipelines, deployment strategies, configuration, secrets, target discovery, and resumable package releases.

```sh
npm install @xec-sh/ops
```

Requires Node.js 20 or later. Operations reuse Core execution and cancellation, Loader scripting, and Kit presentation.

## Orchestrate a workspace

```typescript
import { Pipeline } from '@xec-sh/ops/pipeline';

const result = await Pipeline.create('workspace-checks')
  .step('workspace', {
    run: {
      command: 'pnpm',
      args: ['exec', 'turbo', 'run', 'build', 'test', 'typecheck'],
      shell: false,
    },
    timeout: 30 * 60_000,
  })
  .run();

if (!result.success) {
  throw new Error(result.steps.filter(step => !step.success)
    .map(step => `${step.name}: ${step.error ?? step.exitCode}`).join('\n'));
}
```

The workspace runner owns package dependencies and build caching. Xec owns preparation, execution, progress, and cleanup around it. An infrastructure controller owns deployed state and recovery. Keep each responsibility in one place.

## Capabilities

| API | Responsibility |
| --- | --- |
| `Pipeline` / `Workflow` | Dependencies, conditions, parallel work, and task results |
| `Deployer` | Rolling, blue-green, canary, and all-at-once strategies with project hooks |
| `HealthChecker` / `Discovery` | Health observations and target discovery |
| `ConfigurationManager` / `TargetResolver` | Project configuration, profiles, and named targets |
| `SecretManager` | Secret storage with pluggable providers |
| `TaskManager` / `TaskExecutor` | Configured task execution |
| `OutputFormatter` | Shared CLI presentation through Kit |
| `@xec-sh/ops/release` | Immutable archives, publication journals, registry confirmation, and resume |

Pipeline matrix values expand environment variables; they do not install runtimes. The reserved pipeline `cache` field does not implement artifact caching.

## Releases

Release preparation builds a clean checkout and seals package archives. Resume verifies and publishes those archives without rebuilding or rerunning the test suite. Accepted or reserved npm uploads are reconciled from the saved journal before any further upload.

Use the [release API and CLI workflow](https://xec.sh/docs/ops/release) for preparation, authentication, registry visibility, and recovery. An explicit verified ancestor can define the release-notes range; tags alone are not publication evidence.

## Cancellation

The CLI passes a Core cancellation scope through commands and cooperative callbacks. Awaited actions release their owned resources before exit, within a bounded grace period. Cleanup commands use `withoutCancellation` with their own budget; unrelated work is not cancelled.

[Documentation](https://xec.sh/docs/ops) · [Pipelines](https://xec.sh/docs/ops/pipeline) · [Release workflow](https://xec.sh/docs/ops/release) · [MIT license](../../LICENSE)
