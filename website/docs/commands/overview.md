---
title: Command System Overview
description: Choose built-in commands, scripts, tasks or native project commands
---

# Command System Overview {#command-system-overview}

Xec gives a project one operator interface for local and remote execution.
Start with a built-in command for a single operation. Keep reusable orchestration
in TypeScript or configuration, and expose a native command when it needs its own
arguments, options and help.

## Choose an interface {#command-types}

| Need | Interface | Example |
| --- | --- | --- |
| Inspect a configured SSH host | Built-in command | `xec on hosts.staging node --version` |
| Reuse a named sequence | Configuration task | `xec run check` |
| Branch on typed results or implement recovery | TypeScript script | `xec run .xec/scripts/check.ts` |
| Offer a validated project operation | Native project command | `xec deploy --help`, after defining it |
| Embed execution in another application | Core/Ops library | Import the API in that application |

There is no built-in universal `deploy`, `build` or `test` command. Projects own
those definitions. For example, this repository's Xec tasks invoke Turbo to retain
its package graph and cache; Xec owns the surrounding workflow and operator CLI.

## Built-in commands {#1-built-in-commands}

| Command | Purpose |
| --- | --- |
| [run](built-in/run.md) | Run a script, task, inline program or REPL |
| [on](built-in/on.md) | Execute on SSH hosts |
| [in](built-in/in.md) | Execute in a container or Kubernetes pod |
| [copy](built-in/copy.md) | Transfer between source and destination paths |
| [forward](built-in/forward.md) | Forward a port |
| [logs](built-in/logs.md) | Read or follow target logs |
| [watch](built-in/watch.md) | Run a declared action after file changes |
| `docker` | Operate Docker resources through the shared Docker API |
| [config](built-in/config.md) | Inspect and edit configuration |
| [inspect](built-in/inspect.md) | Inspect targets, tasks and project metadata |
| [secrets](built-in/secrets.md) | Manage values through a secret provider |
| [new](built-in/new.md) | Scaffold a project, script, command, task or profile |
| [doctor](built-in/doctor.md) | Inspect the local execution environment |
| [completion](built-in/completion.md) | Generate shell completion |

Use the pinned installation, for example `pnpm exec xec`, so the local terminal,
CI and AI agents use the same version. The installed command's `--help` is the
option reference for that version.

## Command structure {#command-structure}

```bash
pnpm exec xec [global-options] <command> [command-options] [arguments]
pnpm exec xec --cwd ./project config validate
pnpm exec xec run .xec/scripts/check.ts -- --format json
```

Root flags go before the command. `--config`, `--profile` and `--dry-run` are
command-specific, not universal root controls. `--` separates a script's own
arguments from Xec's options.

### Command resolution {#command-resolution}

A task may also be invoked by its name (`xec check`) when no registered command
owns that name. `xec run check` makes task intent explicit. Built-in and dynamic
commands take precedence over the task shorthand.

## Native project commands {#command-development}

Put JavaScript or TypeScript files under `.xec/commands/`. Export
`command(program)`, `setup(program)` or a default registration function. Register
arguments, options, subcommands and actions with the supplied Commander program.
That schema supplies parsing and generated help; do not add a forwarding command
and a second parser behind it.

Project code can use Xec scripting globals and public Core/Ops APIs. Do not import
Xec's private CLI base classes. See [custom commands](custom/creating-commands.md)
for registration and discovery.

## Targets and concurrency {#target-selection}

```bash
pnpm exec xec on "hosts.*" node --version
pnpm exec xec on "hosts.*" node --version --parallel --max-concurrent 4
pnpm exec xec copy --recursive ./assets/ hosts.staging:/srv/example/assets/
```

### Parallel execution {#parallel-execution}

`on` is sequential by default; request bounded parallelism for independent
operations. Quote target patterns so the invoking shell does not expand them.
Qualified names such as `hosts.staging`, `containers.worker` and `pods.api` avoid
ambiguity. A copy command takes two endpoints, not a source, target and destination
as three separate arguments.

## Plans, output and failure {#error-handling}

### Preview {#dry-run-mode}

Use a command's supported `--dry-run` before an effect when useful. It is a
preview contract owned by that command, not a sandbox for arbitrary code.
Current source refuses load-time command evaluation during supported dry runs;
published 0.12.0 does not contain all of those protections.

### Output and exit status {#exit-codes}

Machine-readable output is also command-specific. For example,
`xec config --output json validate` returns one validation document. A generic
output flag cannot turn a script's arbitrary stdout into a structured receipt.

A lost SSH response or local timeout does not prove that a remote effect never
occurred. Inspect the same operation and its target state before retrying.
For handled failures and cancellation see [exit codes](cli-reference.md#exit-codes).

## See Also {#see-also}

- [CLI reference](./cli-reference.md)
- [Configuration](../configuration/overview.md)
- [Creating custom commands](./custom/creating-commands.md)
- [Portable scripts](../introduction/portable-scripts.md)
