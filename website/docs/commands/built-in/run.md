---
title: run
description: Execute a project task, a local JavaScript or TypeScript program, or an interactive evaluation
keywords: [run, task, script, eval, repl]
source_files:
  - apps/xec/src/commands/run.ts
  - apps/xec/src/utils/task-params.ts
  - packages/ops/src/config/task-manager.ts
  - packages/ops/src/config/task-executor.ts
  - packages/ops/src/adapters/loader-adapter.ts
---

# run {#run}

`xec run` selects a named task or loads a local JavaScript/TypeScript file. Use a
[project command](../custom/creating-commands.md) when an operation needs its own options,
help and reusable CLI interface.

## Synopsis {#synopsis}

```bash
xec run [fileOrTask] [args...] [options]
xec r [fileOrTask] [args...] [options]
xec run -e 'console.log("hello")'
xec run --repl
```

Use `pnpm exec xec` for a CLI pinned to the current project. `run` executes under
the runtime that started Xec; it does not select Node, Bun or Deno through a
per-command runtime flag.

## Choosing a file or task {#choosing-a-file-or-task}

A name containing `.`, `/` or `\` is treated as a file path. Otherwise Xec looks
for a configured task, then an existing extensionless file. Use `./script` to
select a file explicitly. JavaScript and TypeScript files go through the script
loader; this is not a general-purpose shebang or arbitrary-binary executor.

```bash
pnpm exec xec run .xec/scripts/report.ts
pnpm exec xec run check
```

A `script:` field in task configuration is also a file path, not inline source.

## Options {#options}

| Option | Behavior |
| --- | --- |
| `-e, --eval <code>` | Evaluate local JavaScript with Xec's script context |
| `--typescript` | Enable TypeScript transformation for inline evaluation/REPL; `.ts` files are handled by the loader |
| `--repl` | Start the interactive evaluator |
| `--watch` | Watch a script file and rerun in a fresh process on change |
| `-p, --param <key=value>` | Named task parameter; repeat for multiple parameters |
| `-c, --config <path>` | Select an explicit task configuration file instead of project-file discovery |
| `--dry-run` | Hardened `main`: preview without loading/evaluating programs or executable configuration values |
| `--verbose`, `--quiet` | Control command diagnostics |

Watch mode applies to file execution, not named tasks or `--eval`. It reruns the
program; it does not provide application ownership, health checks or a rollback.
Use the application's runtime owner when those guarantees matter.

Generic output-format flags do not convert arbitrary script `console.log` output
into structured JSON. A program intended for automation should emit its own
stable machine-readable result and use a nonzero exit or thrown error for failure.

## Script arguments {#script-arguments}

```bash
pnpm exec xec run .xec/scripts/report.ts -- --format json --limit 20
```

The `--` separator keeps script-specific flags from being consumed by Xec. The
script receives the remaining strings through `args` and its script context;
Xec does not infer an application argument schema.

```typescript
// .xec/scripts/report.ts — run through xec, which supplies args.
console.log(JSON.stringify({ arguments: args }));
```

Scripts run locally even when they select an SSH/container/pod command target.
Only commands invoked through that target run there. Arbitrary filesystem and
HTTP operations remain in the local JavaScript process.

## Task parameters {#task-parameters}

```bash
pnpm exec xec run report --format json --limit 20
pnpm exec xec run report -p format=json -p limit=20
pnpm exec xec run report -p 'tags=["api","worker"]'
```

Values recognize booleans, numbers and valid JSON. Shell quoting still applies;
JSON strings need double quotes inside the shell-quoted argument. Dotted names
remain literal keys rather than creating nested objects. Explicit `-p` pairs take
precedence over parameters parsed from trailing task tokens. Unnamed task
arguments are rejected.

The task's parameter definition controls required values, defaults, types and
bounds. A passed parameter is not permission to treat its contents as shell source.
See [task parameters](../../configuration/tasks/simple-tasks.md#parameters).

## Preview and release boundary {#preview-and-release-boundary}

Published **0.12.0** does not honor dry-run for script/eval execution and has unsafe
raw YAML command interpolation. Do not use that release's dry-run as a no-effect
guarantee or pass untrusted input to its YAML commands.

In **Xec 0.13.0**, `--dry-run` does not load scripts, evaluate inline code,
start REPL, resolve task targets, run conditions or initialize secret providers.
If configuration needs `${cmd:...}` or a secret-provider value, preview fails with
an explicit unknown-value reason, even when that configuration was trusted before.
Task previews show authored operations with values unevaluated. They are not
execution receipts, target readiness checks, or a simulated rollback.

```bash
pnpm exec xec run check --dry-run
pnpm exec xec run .xec/scripts/report.ts --dry-run
```

Confirm that the release containing those corrections is installed before relying
on the new behavior.

## Errors and results {#errors-and-results}

A failed task makes the CLI fail. A completed command's nonzero exit code is
preserved. Cancellation or lost acknowledgement can leave an unknown outcome;
inspect the underlying operation before retrying a side effect.

Library callers use `TaskManager.run()` and inspect `TaskResult.success`. Task
failure may be returned as a result rather than rejected as a Promise. A script
that catches a failure and exits normally has declared success to its caller.

`run` is implemented by `RunCommand`, `TaskManager`, `TaskExecutor` and the shared
`ScriptLoader` adapter. Configuration and tasks live in `@xec-sh/ops`; there is no
separate `ScriptRunner` or CLI-specific duplicate configuration engine.

## See Also {#see-also}

- [Tasks](../../configuration/tasks/overview.md)
- [CLI, scripts and library APIs](../../introduction/when-to-use.md)
- [Project commands](../custom/creating-commands.md)
- [Command reference](../cli-reference.md)
