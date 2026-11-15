---
title: Multi-Step Tasks
description: Compose tasks with predictable ordering, bounded parallelism, explicit cleanup and failure results
---

# Multi-Step Tasks {#multi-step-tasks}

A pipeline coordinates commands that belong to one operation. It can stop queued
work after a failure and run explicit cleanup. It does not provide a durable
transaction, automatic service rollback, or exactly-once delivery.

The corrected execution contract below is in **unreleased `main`**. Published
0.12.0 loses some inherited defaults and can skip `alwaysRun` after fail-fast;
see the [version boundary](./overview.md#version-boundary).

## Basic Multi-Step Structure {#basic-multi-step-structure}

```yaml
version: "1.0"
tasks:
  check:
    description: Validate this package
    timeout: 2m
    steps:
      - name: Type-check
        command: pnpm typecheck
      - name: Test
        command: pnpm test
```

Steps run sequentially by default. The next command starts only after the previous
command finishes. `timeout` applies to each command, not to the total pipeline.

## Step Types {#step-types}

A step chooses exactly one of `command`, `task`, or `script`:

```yaml
version: "1.0"
tasks:
  types:
    command: pnpm typecheck
  check:
    steps:
      - name: Reuse the type check
        task: types
      - name: Test
        command: pnpm test
      - name: Write the report
        script: .xec/scripts/report.ts
        args: [--format, json]
```

The report file is a project-owned script. Nested tasks inherit parameters, then
apply their own defaults for missing values. Missing required parameters, cycles,
and nesting beyond ten tasks fail explicitly. Script arguments are strings passed
through Xec's script context; a nested task receives parameters, not `args`.

## Execution scope {#execution-scope}

The containing task's target, environment, working directory and command timeout
flow into steps and nested tasks. `step.target` selects a different target for
that step; `step.env` overrides the task environment, and caller environment has
highest priority. A step does not define its own `workdir` or `timeout`. Inherited
caller options also take precedence over a nested task's defaults. Use a separate
top-level task or an explicit TypeScript execution handle when a distinct scope
is needed.

`step.targets` supports bounded command fan-out. It cannot be combined with a
single target, a script/nested-task step, or object recovery handlers. Compose
separate per-target tasks when recovery depends on the machine that failed.

## Conditional Execution {#conditional-execution}

```yaml
version: "1.0"
tasks:
  check:
    params:
      - name: tests
        type: boolean
        default: true
    steps:
      - command: pnpm typecheck
      - command: pnpm test
        when: '${params.tests} == true'
```

A condition may be a boolean, number, or expression string; numeric zero is false.
A false condition records a skipped step. A malformed expression or unresolved
value is an error, not a successful skip. Conditions use the configuration
expression evaluator; they do not execute arbitrary JavaScript or shell commands.

## Registered output {#registered-output}

```yaml
version: "1.0"
tasks:
  revision:
    steps:
      - command: git rev-parse --short HEAD
        register: revision
      - command: printf 'Revision: %s\n' ${vars.revision}
```

`register` stores trimmed stdout in `vars` for later sequential steps. It is not a
JSON parser or a persistent artifact. Empty output can be registered. Failed or
skipped steps do not provide a new value. The stored text remains data, even when
it contains `${cmd:...}`. Parallel steps cannot register dependent outputs.

## Failure and cleanup {#failure-and-cleanup}

```yaml
version: "1.0"
tasks:
  check:
    failFast: true
    steps:
      - name: Run checks
        command: pnpm test
      - name: Summarize
        command: pnpm report
      - name: Release the test fixture
        command: pnpm fixture:release
        alwaysRun: true
```

The project must supply `report` and `fixture:release`. Cleanup must address only
resources owned by this operation and be safe when setup did not finish.

| Setting | Effect |
| --- | --- |
| `failFast: true` (default) | Stop starting ordinary steps after an unhandled failure |
| `failFast: false` | Continue ordinary steps while retaining failure |
| `onFailure: continue` or `ignore` | Explicitly accept this failed step for pipeline continuation and aggregate success; the step remains failed in results |
| `onFailure: abort` | Stop queued ordinary steps even when fail-fast is disabled |
| `onSuccess: abort` | End ordinary work after this successful step |
| `alwaysRun: true` | Run this step even when ordinary work has stopped |

A condition-evaluation error cannot be accepted as a successful condition by an
error handler. Cleanup failure also fails the pipeline. Results stay in source
order with stable indices and skipped reasons, so duplicate display names do not
change failure classification.

## Retry and recovery {#retry-and-recovery}

An object `onFailure` may specify `retry` and `delay` for a **single command on one
target**. Only a confirmed nonzero command exit is retried. A timeout, cancelled
transport or unknown result is not blindly repeated. The task author must still
ensure that repeating a completed failed command is safe.

After retries are exhausted, `onFailure.command` or `onFailure.task` can run an
explicit recovery action. Choose one. Its result is recorded separately as
`recovery`; even successful cleanup does not convert the original failed action
into success. If recovery fails too, both errors remain available.

For a deployment, inspect the actual operation state before deciding to retry.
Use the [Pipeline API](../../ops/pipeline.md) or the system's native deployment
owner when its state/rollback contract is required; YAML scheduling alone does not
supply that contract.

## Parallel Execution {#parallel-execution}

```yaml
version: "1.0"
tasks:
  independent-checks:
    parallel: true
    maxConcurrent: 2
    steps:
      - name: Package A
        command: pnpm --filter package-a test
      - name: Package B
        command: pnpm --filter package-b test
```

Only use this for independent operations. The default parallel limit is 8.
Fail-fast stops queued steps but awaits those already started. `alwaysRun` steps
form an ordered cleanup phase after all started ordinary work settles, preventing
cleanup from racing with a still-running worker.

In-process scripts cannot run in a parallel pipeline, including through a nested
task. Their process/global effects cannot be isolated by a Promise. Use command
steps for isolated program processes, or let a TypeScript program explicitly own
its concurrency.

## See Also {#see-also}

- [Task contract and release boundary](./overview.md)
- [Command and script tasks](./simple-tasks.md)
- [Parameters and configuration](../variables/overview.md)
- [Pipeline API](../../ops/pipeline.md)
