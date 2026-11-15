---
title: Command and Script Tasks
sidebar_label: Simple Tasks
description: Configure one command or script with explicit parameters, targets and execution defaults
---

# Simple Tasks {#simple-tasks}

A simple task names one shell command or one script file. Start with a command
when the tool already has the behavior you need; use a script when the operation
needs typed data, branching, or explicit recovery.

The safety and inheritance fixes described here are in **unreleased `main`**.
Read the [published 0.12.0 boundary](./overview.md#version-boundary) before using
parameters or dry-run on an installed release.

## Command Tasks {#command-tasks}

```yaml
version: "1.0"
tasks:
  version: node --version
  types:
    description: Type-check the current project
    command: pnpm typecheck
```

```bash
pnpm exec xec run types
```

`command` is trusted shell source. Operators such as pipes and redirections belong
to that source; a parameter containing `|`, `;` or `$()` does not acquire the same
authority in the hardened executor. For arbitrary program arguments, scripts can
use Core's `shell: false` API.

## Task Properties {#task-properties}

| Property | Contract |
| --- | --- |
| `description` | Help text shown by task inspection |
| `command` or `script` | Exactly one executable form |
| `target` | One configured or resolvable target reference |
| `targets` | Distinct target references for a command task only |
| `maxConcurrent` | Positive integer limiting command fan-out; default 8 |
| `workdir` | Working directory of commands on their execution target |
| `env` | Explicit environment forwarded to that target |
| `timeout` | Per-command milliseconds or `ms`/`s`/`m`/`h` string; zero disables the deadline |
| `params` | Named parameter definitions and validation |
| `private` | Hide from normal listing; does not restrict execution |

The fallback command timeout is 60 seconds unless a caller, task, target, or
executor default supplies one. A unitless numeric string is milliseconds in a
task definition; explicit units make configuration easier to review.

## Target Specification {#target-specification}

```yaml
version: "1.0"
targets:
  hosts:
    staging:
      host: staging.example.net
      user: deploy
tasks:
  status:
    target: hosts.staging
    workdir: /srv/project
    timeout: 10s
    command: git status --short
```

The reference selects where the command runs. It does not copy the local checkout
to that machine, install dependencies, or grant access. SSH uses its declared
host-key and authentication policy.

For multiple machines, `targets` is a list of explicit references, not a wildcard
string:

```yaml
version: "1.0"
tasks:
  versions:
    targets: [hosts.staging, hosts.test]
    maxConcurrent: 2
    command: node --version
```

Both referenced hosts must exist in the project configuration. All targets resolve
before execution starts. Started operations are awaited even if one fails; a
partial fan-out is reported as failure. Use separate tasks for per-target recovery.

## Environment Variables {#environment-variables}

```yaml
version: "1.0"
tasks:
  check:
    command: node --version
    env:
      NODE_ENV: test
    workdir: .
    timeout: 30s
```

The precedence is target, task, step, then explicit caller environment. Local
`process.env` is available to `${env.NAME}` resolution, but is not automatically
copied to an SSH host, container, or pod. Supply only the values that the remote
operation needs. Credentials should not appear in command arguments or examples.

## Parameters {#parameters}

```yaml
version: "1.0"
tasks:
  report:
    params:
      - name: format
        type: enum
        values: [text, json]
        default: text
      - name: limit
        type: number
        min: 1
        max: 100
        default: 20
    command: node tools/report.js --format ${params.format} --limit ${params.limit}
```

`tools/report.js` is the project's report program; Xec does not supply it.

```bash
pnpm exec xec run report --format json --limit 10
pnpm exec xec run report -p format=json -p limit=10
```

Validation supports `string`, `number`, `boolean`, `array` and `enum`, with string
patterns, number bounds, array item/count bounds, required parameters and defaults.
Task parameters are named. Dotted CLI names are literal keys, not an object builder;
pass a JSON value when the program needs structured input.

## Script Tasks {#script-tasks}

A `script` value points to a file. It does not contain inline JavaScript:

```yaml
version: "1.0"
tasks:
  report:
    description: Collect a project report
    script: .xec/scripts/report.ts
```

The file runs in the local Xec process through the script loader. In a task script,
`$target` supplies the selected target and command defaults. Plain `$` remains the
normal Core engine. JavaScript filesystem calls and HTTP requests still run locally.

`workdir`, `env` and `timeout` configure commands through `$target`; they are not
process-wide mutations or a timeout for the script's own CPU, timers or network
calls. Put a program that needs a hard process deadline behind a command task.

## Error Handling {#error-handling}

A nonzero command exit fails the task and preserves its exit code. Task-level
`onError.command` can run an explicit cleanup command; `onError.emit` emits a local
executor event for API subscribers. It is not an external event broker. The same
fields under `onSuccess` run after success in hardened `main`.

The original failure remains visible. If its error handler also fails, both causes
are retained. Configuration errors do not run error handlers. Do not use a generic
cleanup command as proof that a partially completed deployment was rolled back.

## See Also {#see-also}

- [Task contract and release boundary](./overview.md)
- [Multi-step tasks](./multi-step-tasks.md)
- [Configuration interpolation](../variables/overview.md)
- [Core template literals](../../core/execution-engine/template-literals.md)
