---
title: inspect
description: Inspect tasks, targets, variables, scripts, commands, and the local runtime
---

# inspect {#inspect}

`xec inspect` reads project definitions through the normal configuration and task managers. It displays the selected resources, resolved values, and execution plans.

```bash
xec inspect [type] [name] [options]
xec i [type] [name] [options]
```

## Resource types {#resource-types}

| Type | Content | Optional name |
| --- | --- | --- |
| `tasks` | Task definitions and metadata | Task name |
| `targets` | Configured hosts, containers, pods, and local targets | Qualified or bare target name |
| `vars` | Configuration variables | Variable name |
| `scripts` | Files under `.xec/scripts` | Script name |
| `commands` | Built-in and discovered custom commands | Command name |
| `system` | Local runtime and environment observations | System category |
| `cache` | Module cache statistics | `stats` or `clear` |
| `all` | Project resources and system observations | Resource name filter |

Running `xec inspect` without arguments opens a Kit menu. It requires an interactive terminal. Cancellation closes the current inspection. For pipes and CI, select a resource type explicitly.

## Tasks and execution plans {#tasks-and-execution-plans}

```bash
xec inspect tasks
xec inspect tasks deploy --explain
xec inspect tasks deploy --explain --output json
xec inspect tasks deploy --resolve
```

`--explain` asks the task manager for the named task's execution plan and includes it in the result metadata. `--resolve` includes interpolated values or a resolution error alongside the original definition.

## Targets {#targets}

```bash
xec inspect targets
xec inspect targets hosts.staging
xec inspect targets hosts.staging --validate
```

A qualified identifier selects its configured scope. A bare name can display entries from several target groups. For the named target, `--validate` resolves its definition and reports any resolution error. Use an execution or health command to measure remote connectivity.

## Variables {#variables}

```bash
xec inspect vars
xec inspect vars REGION
xec inspect vars --resolve --output json
```

Variable results include the stored value, its type, and whether it contains interpolation. `--resolve` adds the resolved value or its error to the metadata.

## Scripts and commands {#scripts-and-commands}

```bash
xec inspect scripts
xec inspect commands
xec inspect commands deploy
```

Script inspection reports paths and metadata from `.xec/scripts`. Command inspection uses the CLI's command discovery and reports both built-in and custom definitions, including discovery errors.

## Local system {#local-system}

```bash
xec inspect system
xec inspect system runtime --output json
xec inspect system hardware --explain
xec inspect system tools
```

The system categories are `runtime`, `os`, `hardware`, `environment`, `network`, `tools`, and `project`. Tool versions come from their actual local version commands. Missing tools are reported as unavailable. The same inspection path runs under development, test, and production environment settings.

`--explain` renders detailed system information in text mode. Machine output retains the structured result.

## Module cache {#module-cache}

```bash
xec inspect cache
xec inspect cache stats --output json
xec inspect cache clear
```

`stats` reports memory entries, filesystem entries, size, and the cache directory. `clear` explicitly removes cached modules through the module loader.

## Filtering and output {#filtering-and-output}

```bash
xec inspect targets --filter 'staging|worker'
xec inspect tasks --format tree
xec inspect tasks --output json
xec inspect vars --output yaml
xec inspect targets --output csv
```

`--filter` applies a case-insensitive JavaScript regular expression to each resource name and its data. `--format` selects `table`, `tree`, `json`, or `yaml`. The shared `--output` flag selects `text`, `json`, `yaml`, or `csv` for automation. JSON and YAML output contain the complete resource records, including metadata.

| Option | Effect |
| --- | --- |
| `-c, --config <path>` | Load the specified configuration file |
| `-p, --profile <name>` | Select a configuration profile |
| `-f, --filter <pattern>` | Filter names and data |
| `-r, --resolve` | Include interpolation results |
| `-e, --explain` | Include a named task plan or detailed system view |
| `--validate` | Validate named target definitions |
| `-v, --verbose` | Include additional text diagnostics |

## Related guides {#related-guides}

- [Config](./config.md)
- [Task configuration](../../configuration/tasks/overview.md)
- [Custom commands](../custom/creating-commands.md)
