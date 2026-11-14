---
title: config
description: Inspect and edit project configuration, targets, variables, and tasks
---

# config

`xec config` edits the project configuration through the same loader, schema, and target definitions used by execution. Changes preserve comments and unrelated settings in the project file.

```bash
xec config [command]
xec conf [command]
xec cfg [command]
```

## Read configuration

```bash
xec config list
xec config list --path targets
xec config list --output json
xec config get targets.hosts.staging.host
xec config view --defaults
```

`list` reads the resolved configuration. `--path` selects a nested subtree. `--json` is also accepted by `list`. `get` selects one value with dot notation. `view --defaults` distinguishes inherited defaults in the human-readable view.

## Edit values

```bash
xec config set name example
xec config set vars.REGION eu-west-1
xec config set targets.hosts.staging.port 2222 --json
xec config set vars.FEATURES '["search","reports"]' --json
xec config unset vars.OLD_REGION
```

Values remain strings unless `--json` parses a JSON value. `set` and `unset` accept `--dry-run` to show the proposed change while preserving the file. An edit changes the project document and keeps inherited configuration in its original source.

```bash
xec config set vars.REGION eu-central-1 --dry-run
xec config --dry-run unset vars.OLD_REGION
```

## Interactive editing

Run `xec config` in a terminal to browse targets, variables, tasks, defaults, and custom settings. The interactive editor uses Kit prompts. Cancellation ends the current edit before it is committed.

Interactive commands require both terminal input and output. CI, redirected input, `--quiet`, and machine-output modes require explicit arguments for operations that support them.

## Targets

```bash
xec config targets list
xec config targets add
xec config targets edit hosts.staging
xec config targets delete hosts.staging
xec config targets delete hosts.staging --force
```

`add` prompts for an SSH host, Docker container, or Kubernetes pod and its connection settings. `edit` opens the named definition. A qualified identifier selects its exact entry, such as `hosts.staging` or `containers.worker`. A bare name is accepted when it identifies one definition.

`delete` asks for confirmation. `--force` explicitly confirms deletion of the named definition for automation. `add`, `edit`, and `delete` support `--dry-run`.

## Variables

```bash
xec config vars list
xec config vars set REGION eu-west-1
xec config vars set EMPTY ''
xec config vars set REGION
xec config vars delete REGION --force
xec config vars import .env.local
xec config vars export .env.export
```

Supplying a value to `vars set` writes that value directly, including an empty string. Omitting the value opens a prompt. Variable names use uppercase letters, digits, and underscores, starting with a letter or underscore.

`import` reads assignments from the named `.env` file. `export` writes the current variables to the named file. Stored `$secret:` references are emitted as comments directing the reader to `xec secrets get`.

`vars delete` confirms in a terminal unless `--force` is present. `set`, `delete`, and `import` accept `--dry-run`.

## Tasks

```bash
xec config tasks list
xec config tasks view build
xec config tasks create
xec config tasks validate
xec config tasks delete build --force
```

`view` shows the named task. `create` opens an interactive definition editor. `validate` checks task forms supported by the executor. `delete` confirms the exact named task, with `--force` for automation. `create` and `delete` accept `--dry-run`.

## Defaults

```bash
xec config defaults view
xec config defaults ssh
xec config defaults docker
xec config defaults k8s
xec config defaults commands
```

The four editors write target or command defaults after the complete prompt flow succeeds. Each accepts `--dry-run`. Ordinary configuration files can keep defaults implicit. Use `config set` for an explicit unattended change.

## Validation and doctor

```bash
xec config validate
xec config doctor --dry-run
xec config doctor
xec config doctor --defaults
```

`validate` loads configuration and reports schema, target, and task-definition problems. Validation errors produce a failing exit status. `validate --output json` returns one document with `valid`, `errors`, and `warnings`. `doctor --output json` includes its changes and validation result in one document. SSH authentication warnings describe incomplete explicit settings and can also apply to environments using an agent.

`doctor` normalizes the configuration version and proposes missing project metadata. It persists diagnosed changes. `--dry-run` previews those changes. `--defaults` additionally writes the complete default configuration into the project document.

## Configuration trust

A configuration containing command substitution can execute code during loading. Approval is associated with the reviewed file contents.

```bash
xec config trust
xec config trust --list
xec config trust --revoke
```

`trust` finds the nearest `.xec/config.yaml` or `.xec/config.yml` without loading its commands, then requests approval. `--list` shows existing approvals. `--revoke` removes approval for the selected project configuration.

## Related guides

- [Configuration files](../../configuration/config-file.md)
- [Configuration validation](../../configuration/advanced/validation.md)
- [Inspect](./inspect.md)
- [Secrets](./secrets.md)
