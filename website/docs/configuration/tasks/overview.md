---
title: Tasks Overview
description: Named commands and bounded pipelines, with explicit execution and failure contracts
---

# Tasks Overview {#tasks-overview}

Use a task when an operation should have a stable project command: `xec run check`,
`xec run build`, or `xec run report --format json`. A task names existing tools and
coordinates their execution. It does not replace their build graph, cache, schema
migration rules, or service lifecycle.

For example, Xec manages this repository through `.xec` commands and tasks;
Turbo still owns the package build/test graph and cache. Omnitron owns the
applications it manages. Keep that division when writing your own automation.

## Version boundary {#version-boundary}

The published **0.12.0** CLI supports tasks, but its executor has important defects:
YAML command values are inserted as raw shell text, script tasks ignore dry-run,
fail-fast can skip `alwaysRun`, and pipeline defaults can be lost. Do not use that
version to accept untrusted task parameters or to preview an operation with side
effects. A TypeScript program with explicit Core argument arrays is the appropriate
boundary for untrusted input on that release.

The hardened contract below is implemented in **unreleased `main`**. It is not a
claim that installing `@xec-sh/cli@0.12.0` receives these fixes. Confirm the release
containing them before relying on the changed behavior.

## Basic Task Structure {#basic-task-structure}

Place tasks in `.xec/config.yaml`:

```yaml
version: "1.0"
tasks:
  version: node --version
  check:
    description: Check types, then run the package tests
    steps:
      - name: Types
        command: pnpm typecheck
      - name: Tests
        command: pnpm test
```

```bash
pnpm exec xec inspect tasks
pnpm exec xec run version
pnpm exec xec run check
```

These commands assume the CLI is pinned in the project's dependencies and the
package supplies `typecheck` and `test` scripts. A bare task name is also available
through the CLI dispatcher; `xec run <name>` is unambiguous when a task name could
collide with a built-in or project command.

## Task Types {#task-types}

A task defines exactly one execution form:

| Form | Meaning |
| --- | --- |
| `command: string` | Trusted shell program, with configured values passed through Core's escaping boundary |
| `script: path` | Local JavaScript/TypeScript file loaded through Xec; the value is a file path, not inline code |
| `steps: [...]` | An ordered or bounded parallel pipeline of commands, nested tasks and script files |

Use a TypeScript script for branching, typed data processing, external APIs, or
an operation whose state must be reconciled after interruption. Use a dynamic
[project command](../../commands/custom/creating-commands.md) for a dedicated CLI with
its own options and help. YAML tasks are intentionally smaller than those APIs.

## Parameters and data {#parameters-and-data}

```yaml
version: "1.0"
tasks:
  greet:
    params:
      - name: name
        type: string
        default: World
    command: printf 'Hello, %s\n' ${params.name}
```

```bash
pnpm exec xec run greet --name Engineer
pnpm exec xec run greet -p name=Engineer
```

In the hardened executor, parameters, environment values, secrets, command output
and registered step output remain data. A value containing `${cmd:...}` is not
executed again. Only variable templates authored in configuration may recursively
refer to other declared variables. This does not make an untrusted configuration
safe: its literal commands and scripts are executable code.

Environment overrides such as `XEC_VARS_NAME` remain literal data even through
variable references and save/reload. They cannot introduce task, profile or
extension definitions. A separate profile YAML file is subject to the same
command-substitution trust gate as the main configuration. These protections are
also part of the unreleased fixes.

Arrays expand to separate arguments and must appear outside literal quotes.
Normal POSIX/PowerShell quoted scalar values are supported. Complex shell
expansions, here-documents, and escaped interpolation positions fail explicitly;
move that logic into a script and use an explicit argument array.

## Execution scope {#execution-scope}

A pipeline carries its `target`, `workdir`, `env` and command `timeout` into its
steps and nested tasks. An explicit step target overrides the inherited target;
caller options override task defaults. Environment forwarding includes only
explicit target/task/step/caller configuration. Local commands still inherit the
local process environment in the local adapter.

A command task can provide distinct `targets` for fan-out. Every target resolves
before commands start; the default concurrency limit is 8. Set `maxConcurrent`
when a smaller or larger bounded fan-out is appropriate. `target` and `targets`
are mutually exclusive. Multiple targets on script or pipeline definitions are
rejected; call explicit per-target tasks instead.

A script runs locally. Inherited command defaults configure its `$target` handle;
they do not change `process.cwd()`, mutate `process.env`, move JavaScript to the
remote host, or impose a deadline on arbitrary JavaScript. In-process script
steps, including nested script tasks, cannot run in a parallel pipeline.

## Completion and failure {#completion-and-failure}

The CLI exits nonzero for a failed task. The `TaskManager` API returns a
`TaskResult`; callers must inspect `success` rather than assume that a resolved
promise proves success.

```typescript
import { ConfigurationManager, TaskManager } from '@xec-sh/ops';

const manager = new TaskManager({ configManager: new ConfigurationManager() });
const result = await manager.run('check');
if (!result.success) {
  throw result.error ?? new Error('Project checks failed');
}
```

Pipeline results retain source order and indices, even when names repeat or steps
finish concurrently. Skipped steps include a reason. `alwaysRun` performs cleanup
after a failure; in a parallel pipeline it waits for every already-started step.
A successful cleanup does not turn the failed operation into a success.

`failFast` stops queued work; it does not cancel work already running. Automatic
retry is restricted to a single command with a confirmed nonzero exit. A timeout
or lost response is not proof that an effect did not occur. Recovery for critical
operations needs an operation-specific state/ownership contract; a generic task
pipeline does not supply durable transactions or automatic rollback.

## Preview {#preview}

In hardened `main`, `xec run <task> --dry-run` validates the task shape and shows
authored operations without loading scripts, resolving targets, evaluating
conditions, or running executable value providers. Values that require command or
secret-provider evaluation during configuration load cause an explicit refusal.
They are unknown, not replaced with invented values.

Preview success means that a preview completed. It is not an execution receipt or
proof that a target is reachable. The published 0.12.0 dry-run limitations above
still apply until the corrected release is installed.

## Deliberate limits {#deliberate-limits}

The task executor does not implement `hooks`, `emits`, event subscriptions through
`on`, `cache`, `schedule`, `template`, or `dependsOn`. Hardened `main` rejects these
keys instead of silently ignoring them. Use explicit steps, the owning operation
API, an external scheduler, and the build tool's cache where applicable.

`private` hides a task from the ordinary listing. It is not authorization: a caller
who knows the name can still execute it.

## See Also {#see-also}

- [Command and script tasks](./simple-tasks.md)
- [Pipeline execution and recovery](./multi-step-tasks.md)
- [`run` command](../../commands/built-in/run.md)
- [Choosing CLI, scripts, tasks or library APIs](../../introduction/when-to-use.md)
