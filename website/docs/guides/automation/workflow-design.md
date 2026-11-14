---
title: Design a project workflow
description: Choose the right Xec entry point and keep compilation, execution, caching and deployment ownership explicit.
---

# Design a project workflow

Start with the smallest entry point that expresses the job. Reuse the same execution library as the workflow grows; keep infrastructure policy and application lifecycle in the systems that own them.

## Choose an entry point

| Scenario | Entry point | Contract and boundary |
| --- | --- | --- |
| A command in an application or test | [`@xec-sh/core`](../../core/execution-engine/overview.md) | Typed process results, streams, explicit errors and cancellation |
| A TypeScript script | [`xec run`](../../commands/built-in/run.md) | The orchestration executes locally; `$target` selects command destination |
| Named environments and common tasks | [`.xec/config.yaml`](../../configuration/overview.md) | Project-owned targets, tasks, profiles and variables |
| A discoverable project CLI | [`.xec/commands/*.ts`](../../commands/custom/creating-commands.md) | Commands register options, help and actions on the existing CLI |
| Dependent operational steps | [`Pipeline`](../../ops/pipeline.md) or [`Workflow`](../../ops/workflow.md) | Explicit dependencies, bounded execution, failure and cancellation contracts |
| Prompts and terminal output | [`@xec-sh/kit`](../../kit/index.md) | Shared input, cancellation, accessible output, tables and themes |
| Immutable npm publication | [Release recipe](../../ops/release.md) | Prepare and verify first; publication resumes the same archives |

## Separate execution from destination

The CLI uses Node.js 22.18 or newer. The Core libraries provide runtime adapters for Node, Bun and Deno; those adapters do not turn the Node CLI into a browser or Deno application. Kit supports Node 20+ and Bun 1.2+. Package engines and the [installation guide](../../introduction/installation.md) describe the exact requirements.

| Target | Required environment | What remains your responsibility |
| --- | --- | --- |
| Local | A supported JavaScript runtime and the selected shell/tools | OS-specific command syntax, permissions and filesystem paths |
| SSH | A reachable server, credentials and trusted host-key policy | Remote permissions and verification of detached processes |
| Docker | A reachable Docker daemon | Image contents, volumes, networks and container lifecycle policy |
| Kubernetes | `kubectl`, an authorized context and a selected pod/container | Cluster RBAC, workload state and tools available in the container |

SSH uses Xec's private `ssh2` transport. Consumers call Xec APIs and do not import `ssh2`. An external OpenSSH client is not required for normal SSH execution; integrations with an SSH agent or external administration tools are separate choices.

A tagged command escapes interpolated values. It does not make arbitrary shell source safe or guarantee that two operating systems provide the same programs. Prefer direct arguments for untrusted values that do not need shell syntax.

## Keep the build graph where it belongs

Xec can orchestrate Turbo without replacing it. Turbo owns package dependency ordering, declared build inputs/outputs and reusable build artifacts. Xec owns the surrounding process: setup, target selection, checks, release preparation and deployment hooks.

```typescript
import { Pipeline } from '@xec-sh/ops';

const result = await Pipeline.create('verify')
  .step('install', { run: 'pnpm install --frozen-lockfile' })
  .step('build', { run: 'pnpm exec turbo build', dependsOn: ['install'] })
  .step('test', { run: 'pnpm exec turbo test', dependsOn: ['build'] })
  .run({}, { concurrency: 2 });

if (!result.success) throw new Error('Verification failed');
```

This assumes the repository already declares its `build` and `test` tasks in `turbo.json`. A CI provider can call the same script; it still owns runner provisioning, credentials and scheduling.

## Matrices and caches have different jobs

A pipeline matrix expands combinations of environment parameters. A `node: ['22', '24']` axis alone does **not** install Node 22 or 24 or create two machines. Select the runtime, image or target explicitly when a variant needs a different environment.

Core's opt-in result cache stores command results. Use it only when the command is safe to cache and its inputs/invalidation policy are known. `Pipeline.cache` is currently reserved and does not restore build artifacts. Use the build tool's artifact cache for that purpose.

## Design failure before deployment

- A dependency prevents a step from starting until its prerequisites settle.
- Concurrency limits control admission; they cannot recall a process started outside that scope.
- A function step must pass its cancellation signal to its own asynchronous work and finish cleanup.
- A timeout on an SSH channel does not prove that a detached remote process stopped.
- Retry only operations that are safe to repeat. Recovery and rollback are explicit application contracts.

The [pipeline reference](../../ops/pipeline.md) and [workflow reference](../../ops/workflow.md) describe the differences in their retry, observation and output contracts. Start with ordinary local commands and move a step to a remote target only when the workflow needs it.
