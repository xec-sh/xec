---
title: Configuration File Structure
description: Configuration fields, source precedence and implemented runtime boundaries
---

# Configuration File Structure {#configuration-file-structure}

The project file describes reusable values, execution targets and tasks. The
format version is `version: '1.0'`; it is independent of the installed Xec package
version. `name` and `description` are optional metadata.

## File location {#file-location}

From the working directory, discovery prefers the nearest ancestor containing
`.xec/config.yaml` or `.xec/config.yml`, then the nearest `package.json` with
`workspaces`, then the nearest `.git` root. It falls back to the working directory.

Within the chosen root, `.xec/config.yaml` and `.xec/config.yml` precede the
root-level `xec.yaml` and `xec.yml`. If the working directory differs, its
`.xec` candidates are also checked before the root-level files. The first found
project file is used; these candidates are not all merged.

```bash
pnpm exec xec config validate
pnpm exec xec config --config .xec/preview.yaml validate
```

An explicit `--config` replaces project discovery for a command that supports
that option. `XEC_CONFIG` instead adds a higher-priority file to the discovered
configuration. Neither removes the global, environment or profile layers.

## Root structure {#root-structure}

```yaml
version: '1.0'
name: example
vars:
  app:
    name: example
targets:
  local:
    type: local
tasks:
  runtime:
    command: node --version
profiles:
  staging:
    vars:
      app:
        name: example-staging
```

### File format {#file-format}

Use UTF-8 YAML and quote values that must remain strings. Two-space indentation
keeps mappings readable. Avoid duplicate mapping keys: they cannot represent
separate configuration layers.

## Variables {#variables-section}

Variables are reusable configuration data: strings, numbers, booleans, arrays
and nested objects.

### Interpolation {#variable-interpolation}

| Reference | Meaning |
| --- | --- |
| `${vars.app.name}` or `${app.name}` | A configuration variable |
| `${env.HOME}` | A process environment variable |
| `${env.DEPLOY_ENV:staging}` | Environment variable with a literal fallback |
| `${params.message}` | A task parameter, resolved for that invocation |
| `${secrets.api_key}` or `${secret:api_key}` | A value from the selected secret provider |
| `${cmd:git rev-parse --short HEAD}` | Trimmed stdout from a load-time shell command |

The fallback separator is `:`, not Bash's `:-`. An unresolved reference fails;
it is not silently replaced with an empty value. Do not name a configuration
variable `env`, `params`, `cmd` or `secret`, which are reserved namespaces.

### Command substitution {#command-substitution}

A command reference is executable configuration. Review and approve the exact
file before loading it with [configuration trust](../commands/built-in/config.md#configuration-trust).
A failing command fails loading. Saving through `ConfigurationManager` retains
the original template rather than writing resolved secrets or stdout to disk.

Current source treats parameters, environment overrides, secrets and command
stdout as terminal data; it does not recursively evaluate them as new templates.
This security correction is newer than published 0.12.0. Until upgrading, do not
feed untrusted values into interpolated shell command definitions.

## Targets {#targets-section}

```yaml
targets:
  defaults:
    timeout: 30000
  local:
    type: local
  hosts:
    staging:
      host: staging.example.com
      user: deploy
      privateKey: ~/.ssh/id_ed25519
      hostKeyChecking: strict
  containers:
    worker:
      container: existing-worker
  pods:
    api:
      namespace: staging
      selector: app=api
```

These are declarations; this example does not create the host, container or pod.
Use qualified references such as `hosts.staging` when another target could have
the same short name. For SSH configuration the field is `user`; the programmatic
Core API uses `username`. Review the verified host key before connecting.

Put an execution deadline in `targets.defaults.timeout` or the specific task.
There is no root-level `timeout` or `XEC_TIMEOUT` execution setting. Adapter-specific
defaults belong under `targets.defaults.ssh`, `.docker` or `.kubernetes`; see the
[target reference](./targets/overview.md) for their supported fields.

## Tasks {#tasks-section}

```yaml
tasks:
  runtime:
    command: node --version
  message:
    params:
      - name: text
        type: string
        default: Ready
    env:
      MESSAGE: ${params.text}
    command: node -e "console.log(process.env.MESSAGE)"
  check:
    steps:
      - task: runtime
      - task: message
        args:
          text: Checks completed
```

A task uses one command, one script, or a step list. Steps may run commands,
scripts or another named task. An unsupported capability must not be inferred
from an arbitrary YAML key: scheduling, task caching, event hooks and automatic
rollback are not implemented by the configuration task executor. Current source
explicitly rejects these previously accepted declarations.

Task and step defaults, fan-out, cancellation and failure policies are detailed
in the [task guide](./tasks/simple-tasks.md). A script can implement a richer
workflow through Ops. A recovery command is not proof that recovery succeeded;
verify the postcondition before reporting success.

## Profiles {#profiles-section}

```yaml
profiles:
  base:
    vars:
      environment: development
  staging:
    extends: base
    vars:
      environment: staging
    targets:
      local:
        type: local
        env:
          NODE_ENV: ${vars.environment}
```

A profile overrides `vars` and `targets`. Select one with `XEC_PROFILE=staging`,
with the library's `profile` option, or with a CLI command's declared `--profile`
option. It is not a universal root flag; `xec run` uses `XEC_PROFILE`.
A separate `.xec/profiles/staging.yaml` contains the profile body, without a
`profiles:` wrapper. Inherited profiles must exist; keep their relationship
explicit.

## Command defaults {#commands-section}

```yaml
commands:
  on:
    parallel: true
    maxConcurrent: 4
  logs:
    tail: 100
  docker:
    service:
      redis:
        port: '16379'
```

Current source validates these against the same Commander option tree that
parses the CLI. Use canonical command names (`copy`, not `cp`), camel-cased option
names and real nested subcommand names. Configured values override parser
defaults; explicit CLI values, including `false`, `0` and an empty string, win.
Unknown keys fail before the owning operation starts.

The commands consuming this section are `on`, `in`, `copy`, `forward`, `watch`,
`logs` and `docker`. Invocation controls such as `config`, `profile`, `dryRun` and
`output` must be selected on the command line. There is no `commands.defaults`
catch-all. These precedence and validation fixes are not in npm 0.12.0; with that
version, pass critical options explicitly and verify the effective behavior.

## Scripts {#scripts-section}

The existing schema contains `scripts.env`, `scripts.globals` and
`scripts.sandbox`, but the script loader does not implement those controls.
`profile.env` also feeds `scripts.env` and is not a reliable way to configure
processes. Do not use any of them as a security boundary.

Set process values explicitly in the script or in a task/target `env` mapping.
Import modules explicitly. For isolation, use an actual container or other
execution boundary and verify its restrictions.

## Secrets {#secrets-section}

```yaml
secrets:
  provider: env
```

Implemented providers are `local`, `env` and `git`. The environment provider reads
`SECRET_*` variables by default. The local provider stores encrypted secrets;
configure its storage through the [secrets command](../commands/built-in/secrets.md).
Declared names such as `vault`, `aws-secrets`, `1password` and `dotenv` have no
implementation and are rejected.

Provider configuration is selected before general variable interpolation; do not
assume a `${...}` expression inside provider setup has already been resolved.
Pass the provider the concrete configuration required by its API.

## Unsupported extensions {#extensions-section}

Published 0.12.0 accepted an `extensions` array but did not load anything from it.
Current source removes that schema and refuses the key before initialization or
command substitution. Put a native command in `.xec/commands/`, import a normal
package from a script, or declare the tasks directly. There is no extension
manifest or extension installation lifecycle.

## Configuration precedence {#configuration-precedence}

| Priority, low to high | Source |
| --- | --- |
| 1 | Built-in baseline |
| 2 | Global configuration |
| 3 | Project file or explicit `--config` file |
| 4 | Additional `XEC_CONFIG` file |
| 5 | `XEC_*` path-based overrides |
| 6 | Active profile |

For example, `XEC_VARS_APP_NAME=web` writes the string `web` at `vars.app.name`.
All underscores separate path components; this mechanism cannot spell a literal
underscore in a key. Task parameters are separate invocation data. Current source
also refuses executable task/profile definitions supplied through environment
paths rather than reviewed configuration files.

## Validation {#schema-validation}

```bash
pnpm exec xec config --output json validate
pnpm exec xec config doctor --dry-run
```

The CLI checks configuration and the native command-default schema. It does not
prove remote access, script correctness or deployment health. `doctor` is an
explicit edit: review its proposed changes before applying them. There is no
promised automatic migration from an invented older configuration format.

## See Also {#see-also}

- [Configuration overview](./overview.md)
- [Configuration CLI](../commands/built-in/config.md)
- [Variables](./variables/overview.md)
- [Tasks](./tasks/simple-tasks.md)
- [Targets](./targets/overview.md)
