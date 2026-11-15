---
title: CLI Reference
description: Installed command syntax, option scope, environment and failure contracts
---

# CLI Reference {#cli-reference}

Use the project-pinned CLI, for example `pnpm exec xec`. The examples below assume
that installation. Built-in command names and aliases are declared in
`apps/xec/src/utils/command-manifest.ts`; each command owns its native option schema.

## Synopsis {#synopsis}

```bash
xec [root-options] <command> [command-options] [arguments]
xec [root-options] run <script-file> -- [script-arguments]
xec [root-options] run <task-name> [task-parameters]
xec [root-options] -- <executable> [arguments]
```

A task shorthand (`xec check`) is available only when no registered command owns
that name. `deploy`, `build` and `test` are project definitions, not built-in
workflows. Check their help or task definition in the project before using them.

## Global options {#global-options}

| Option | Meaning |
| --- | --- |
| `-h, --help` | Show root or selected command help |
| `-V, --version` | Show the installed CLI version |
| `--cwd <path>` | Set the working directory before discovery and execution |
| `-v, --verbose` | Enable detailed diagnostics |
| `-q, --quiet` | Suppress Xec's nonessential presentation |
| `--no-color` | Disable colored presentation |
| `-e, --eval <code>` | Evaluate code in Xec's script runtime |
| `--repl` | Open the interactive script runtime |

### Option scope {#output-control}

Place root options before the command word. Short flags can have a different
meaning within a command: root `-v` means verbose; `logs -v` means invert its
filter. Quiet mode cannot suppress arbitrary output emitted by project code.

```bash
xec --version
xec --cwd ./project config validate
xec -e 'console.log(process.version)'
xec -- node --version
```

For explicit local execution, `xec -- <executable> [arguments]` preserves each
argument as data. Spaces, quotes, dollar signs and shell operators are not
reinterpreted. Request a shell explicitly when that is the intended operation,
for example `xec -- sh -c 'printf "%s\\n" hello | wc -l'` on POSIX.
Current source bypasses project command/configuration discovery for this form and
never guesses a host, container or pod. Use `on` or `in` for remote execution.
These argv and discovery corrections are newer than npm 0.12.0.

## Command options {#command-options}

Use `xec <command> --help` and subcommand help for the installed schema. `--config`,
`--profile`, `--dry-run` and `--output` are not root flags. Their support and scope
belong to the selected operation.

```bash
xec config --config .xec/preview.yaml validate
xec config --output json validate
xec on hosts.staging node --version --timeout 30s
xec copy --recursive ./assets/ hosts.staging:/srv/example/assets/
```

### Concurrency {#parallel-execution}

`copy` takes exactly two endpoints and does not have a `--timeout` option.
`on` is sequential unless `--parallel` is supplied; its concurrency bound defaults
to 10. `copy` uses a bound of 4 when parallel copying is requested. Limits describe
concurrent work, not a promise of linear speedup.

### Scripts {#2-script-file-execution}

```bash
xec run .xec/scripts/report.ts -- --format json
xec run hello --message 'Hello from a task'
xec run hello -p message=Hello
```

### Task parameters {#3-task-execution}

The task examples require a declared `hello` task with a `message` parameter.
Unknown script arguments are forwarded; task parameters must be named and are
validated against the task definition. A task parameter called `profile` is not
a profile selector. Select the task configuration with `XEC_PROFILE`.

A `.ts`, `.js` or `.mjs` file can also be invoked directly. The script executes
locally with `args`, `argv`, `$` and the documented scripting utilities. Its
execution engine selects where shell commands run. TypeScript transformation
uses Xec's loader; a separate `tsx` or `ts-node` bootstrap is unnecessary.

### Dynamic commands {#5-dynamic-commands}

The project owns commands in `.xec/commands/`. Their exported registration
function receives the native Commander program. Put validation and help in that
schema, and call public Core/Ops APIs in the action. A dynamic command is trusted
program code and may have effects even during module loading; `--help` or a
custom `--dry-run` flag is not a general sandbox.

## Configuration precedence {#configuration-precedence}

Configuration layers, low to high, are: built-in baseline, global file, project
file, additional `XEC_CONFIG` file, `XEC_*` values, active profile. Explicit
command options are then applied by the owning CLI command. Task parameters are
a separate invocation namespace.

### CLI and command defaults {#1-command-line-options}

Current source resolves command defaults from that command's actual schema:
explicit CLI values win over configuration, which wins over parser defaults.
It retains explicit `false`, `0` and empty strings and rejects unknown keys.
These corrections are not in npm 0.12.0; pass critical values explicitly on that
release. See [configuration fields](../configuration/config-file.md#commands-section).

## Environment variables {#environment-variables}

| Variable | Meaning |
| --- | --- |
| `XEC_HOME_DIR` | Global configuration directory instead of `~/.xec` |
| `XEC_CONFIG` | Additional configuration file, above the project file |
| `XEC_PROFILE` | Active configuration profile |
| `XEC_COMMANDS_PATH` | Additional dynamic-command directories |
| `XEC_DEBUG` | Additional diagnostics in the relevant subsystem |
| `XEC_NO_INTERACTIVE` | Disable scaffold prompts; nonterminal runs also cannot prompt |
| `NO_COLOR`, `FORCE_COLOR=0` | Standard color controls |

Path overrides use lowercasing and replace every underscore with a dot:
`XEC_VARS_APP_NAME=web` means `vars.app.name = 'web'`. Values remain strings.
There are no universal execution controls named `XEC_TIMEOUT`, `XEC_PARALLEL`,
`XEC_SHELL` or `XEC_VERBOSE`. Use the command's real options or target/task settings.

```bash
XEC_PROFILE=staging xec run check
XEC_VARS_APP_NAME=example xec config get vars.app.name
XEC_CONFIG=.xec/override.yaml xec config validate
```

These assignments use POSIX shell syntax. On Windows set process environment
variables using the calling shell's syntax; Xec does not rewrite the host shell.

## Preview and machine output {#preview-and-machine-output}

A supported dry run must identify what is known without executing the effect.
Current source refuses configuration command substitution during a dry run;
script/eval previews do not evaluate the program and therefore cannot enumerate
its effects. `new` explicitly refuses unsupported previews instead of writing
files behind a `--dry-run` flag. These protections are newer than npm 0.12.0.

Use structured output only where the command defines a structured result.
`xec config --output json validate` returns `valid`, `errors` and `warnings`.
Do not parse colored text as a deployment receipt or assume a generic output
flag serializes everything a project script prints.

## Exit codes {#exit-codes}

The shared error handler maps recognized errors as follows. Native parser errors,
plain thrown errors and explicit project exit codes can have other provenance;
code `1` alone does not classify an operation's remote outcome.

| Code | Meaning |
| --- | --- |
| 0 | Command completed successfully |
| 1 | Generic or unclassified failure |
| 2 | `ValidationError` |
| 3 | `ConfigurationError` |
| 4 | `ModuleError` |
| 5 | `TaskError` |
| 6 | `RecipeError` |
| 7 | `NetworkError` |
| 8 | `FileSystemError` |
| 9 | `TimeoutError` |
| 10 | `ENOENT` |
| 11 | `EACCES` |
| 12 / 13 | `ENOTDIR` / `EISDIR` |
| 130 / 143 | `SIGINT` / `SIGTERM` cancellation |

A completed child command retains its nonzero exit code, including in quiet mode.
For a successful direct command, stdout and stderr retain their stream and
whitespace; quiet mode suppresses both captured streams. Failed commands use
stderr for diagnostics. Current source includes a redacted preview of each
captured stream, bounded to 16 KiB, and explicitly marks truncation. JSON/YAML
errors retain `exitCode`, `signal`, `stdout`, `stderr` and `outputTruncated` when
available; debug mode does not add text around that document. Nested command
causes use the same preview. This fixes missing output/status in npm 0.12.0.
The limit applies to diagnostic display, not the Core result capture contract.

### Cancellation {#cancellation}

Current source aborts the owning execution scope on the first termination signal
and awaits its cleanup. The operation's own deadlines still apply. A second
signal forces exit and reports incomplete cleanup. This coordinated cancellation
path is newer than published 0.12.0.

Prefer returning or throwing from a script to `process.exit()`, which bypasses
awaited cleanup. Local cancellation or transport loss does not establish that a
remote mutation was rolled back. Reconcile target state before retrying it.

## Troubleshooting {#debugging-and-troubleshooting}

```bash
xec --version
xec <command> --help
xec config validate
xec inspect tasks
XEC_DEBUG=true xec <command> --help
```

Replace `<command>` with the command you are diagnosing. Compare the installed
version and its help with the project lockfile. Do not delete a shared cache or
restart services just to diagnose command parsing.

### Measuring performance {#performance-profiling}

For a latency report, record the command, installed version, runtime, platform,
cold/warm cache state and repeated timings. There is no universal millisecond or
memory guarantee for SSH handshakes, module compilation or project discovery.

## See Also {#see-also}

- [Choosing a command interface](./overview.md)
- [Configuration files](../configuration/config-file.md)
- [Run](./built-in/run.md)
- [Custom commands](./custom/creating-commands.md)
- [Portable scripts](../introduction/portable-scripts.md)
