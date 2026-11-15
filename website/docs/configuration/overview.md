---
title: Configuration Overview
description: Choose what belongs in configuration, scripts and native project commands
---

# Configuration Overview {#configuration-overview}

Use `.xec/config.yaml` to name execution targets, compose repeatable tasks and
select environment-specific values. Keep branching application logic in
TypeScript scripts. Give an operation its own native project command when it
needs validated options, generated help and a clear operator interface.

Configuration describes commands to execute. It does not continuously reconcile
infrastructure, discover a rollback procedure or prove that a remote deployment
completed. A deployment workflow must define those operations and verify their
outcomes. Omnitron owns the lifecycle of applications managed by Omnitron.

## Start with one runnable task {#quick-start-example}

Create `.xec/config.yaml` in a project with the [pinned CLI](../introduction/installation.md):

```yaml
version: '1.0'
name: example
vars:
  app:
    name: example

tasks:
  runtime:
    description: Inspect the local Node runtime
    command: node --version
  hello:
    params:
      - name: message
        type: string
        default: Hello from Xec
    env:
      MESSAGE: ${params.message}
    command: node -e "console.log(process.env.MESSAGE)"
  check:
    steps:
      - task: runtime
      - task: hello
```

```bash
pnpm exec xec config validate
pnpm exec xec run check
pnpm exec xec run hello --message 'A message with spaces'
```

The first two tasks are independent operations. `check` composes them in order;
a failure stops the sequence unless the task explicitly declares another policy.
The message is process data, not a fragment of shell program text.

## Choose the owner of each concern {#key-concepts}

| Concern | Configuration or API |
| --- | --- |
| Where a command executes | `targets` and a task's `target` |
| Repeated command or ordered steps | `tasks` |
| Values shared by tasks | `vars` |
| Named environment overrides | `profiles` |
| Credentials | Implemented secret provider and secret references |
| Defaults for an existing CLI command | `commands.<canonical-name>` |
| Branching, typed data, custom recovery | `.xec/scripts/*.ts` and Core/Ops APIs |
| A project-specific operator interface | `.xec/commands/*.ts` or `.js` |

A script runs locally; its `$` calls select local or remote execution engines.
Loading a script is not equivalent to uploading its entire JavaScript runtime to
a target. Xec can invoke Turbo to use an existing package dependency graph and
build cache; YAML tasks do not replace Turbo's package graph.

## Configuration hierarchy {#configuration-hierarchy}

The manager merges these sources, from lowest to highest priority:

1. Shared built-in baseline.
2. Global `~/.xec/config.yaml`, or `$XEC_HOME_DIR/config.yaml`.
3. The discovered project file, or a file explicitly selected by a supported `--config` option.
4. An additional file named by `XEC_CONFIG`.
5. Path-based `XEC_*` environment overrides.
6. The selected profile, including its inherited values.

Objects merge recursively; arrays are replaced. Task parameters are supplied for
one invocation and have their own `${params.name}` namespace. They are not a
seventh configuration layer.

Every underscore in an environment override separates a path segment:
`XEC_VARS_APP_NAME=service` sets `vars.app.name`, not `vars.app_name`. Values from
this source are strings. A profile has higher precedence than this environment
layer, so it can replace the value again.

## Organize a project {#file-structure}

:::filetree{title="Project automation"}
- `.xec/`
  - `config.yaml` — Targets, tasks and reusable values
  - `profiles/`
    - `staging.yaml` — An optional separate profile
  - `scripts/`
    - `check.ts` — Typed orchestration
  - `commands/`
    - `deploy.ts` — Native command registration and implementation
- `package.json` — Pinned Xec dependency and familiar task aliases
- `pnpm-lock.yaml` — Exact dependency resolution
:::

Commit the configuration and lockfile. Keep credentials in the secret provider
or the process environment, not in examples, task arguments or source control.

## Validate before execution {#configuration-validation}

```bash
pnpm exec xec config validate
pnpm exec xec config tasks validate
pnpm exec xec inspect tasks
```

Validation detects configuration and task-definition errors. It does not connect
to every declared host, verify remote permissions or execute every script. A
successful schema check is preparation evidence, not a deployment receipt.

`${cmd:...}` runs code while loading configuration and therefore requires trust
in the exact reviewed file. Prefer literal configuration plus an explicit task
when an observation may be slow, fail or have an effect.

:::note Published version and upcoming corrections
The examples above use the published 0.12.0 CLI. Current source also fixes native
command-default precedence and validates `doctor` changes before writing them.
It rejects the old, nonfunctional `extensions` contract and generates runnable
project/task/profile starters. Those corrections are not in npm 0.12.0; see the
[config command](../commands/built-in/config.md) and [new command](../commands/built-in/new.md).
:::

## See Also {#see-also}

- [Configuration file reference](./config-file.md)
- [Targets](./targets/overview.md)
- [Tasks](./tasks/simple-tasks.md)
- [Profiles](./profiles/overview.md)
- [Native project commands](../commands/custom/creating-commands.md)
