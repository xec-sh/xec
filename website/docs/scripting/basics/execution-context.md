---
title: Script Execution Context
description: Choose where commands run, read script arguments, and keep local and remote effects explicit.
---

# Script Execution Context {#script-execution-context}

A script runs in the local Xec process. Its commands can run locally or on the
SSH host, Docker container, or Kubernetes pod selected by the CLI. This distinction
matters: reading a local file and running a command on a server are separate effects.

## Understanding `$target` and `$` {#understanding-target-and-}

| Engine | Where its commands run |
| --- | --- |
| `$` | The local machine running Xec |
| `$target` | The target selected by `xec run`, `xec on`, or `xec in` |

`xec run inspect.ts`, `xec inspect.ts`, and `xec -e` bind both engines to the local
machine. `xec on hosts.staging inspect.ts` binds `$target` to the configured SSH
host; `$` remains local. Selecting a remote target does not move the script itself.

```typescript
// inspect.ts — Node must be installed on the selected target.
const local = await $`${process.execPath} --version`;
const selected = await $target`node --version`;
console.log({ local: local.stdout.trim(), target: selected.stdout.trim() });
```

A failed remote command must not fall back to `$`: that would change which
machine receives the operation. Handle the failure or stop the workflow.

## Global Context Variables {#global-context-variables}

Xec supplies these values when it loads a script:

| Global | Meaning |
| --- | --- |
| `$` | Local callable execution engine |
| `$target` | Callable execution engine bound to the selected target |
| `$targetInfo` | Target identity and configuration |
| `args` | Arguments passed to the script, without the executable or script path |
| `argv` | Interpreter, script path, then script arguments |
| `__filename`, `__dirname` | The script's local file and directory |

These globals belong to the Xec runner. Plain `node inspect.ts` does not provide
them. Libraries intended for both environments should accept an engine as an
argument instead of depending on ambient globals.

### Target Information {#target-information}

`$targetInfo.type` is `local`, `ssh`, `docker`, or `kubernetes`. `name` identifies
the selected target; `host`, `container`, `pod`, and `namespace` are optional
metadata for the corresponding target type.

```typescript
import type { TargetInfo } from '@xec-sh/loader';

const target: TargetInfo = $targetInfo;
console.log(`Inspecting ${target.type}: ${target.name}`);
if (target.type === 'ssh') console.log(target.host);
```

Use the identity to validate a script's preconditions. Do not log the full
`config` object: it can contain authentication settings.

## Utility Functions {#utility-functions}

The runner also supplies utilities from `@xec-sh/ops`, including `fs`, `path`,
`os`, `glob`, `which`, `sleep`, `retry`, `within`, `parseArgs`, `yaml`, and `csv`.
Terminal helpers include `log`, `echo`, `prism`, `kit`, and `spinner`.

```typescript
const files = await glob('src/**/*.ts');
console.log(`${files.length} local source files`);
```

Filesystem utilities operate on the local machine, even when `$target` is remote.
`glob` returns paths relative to its working directory with `/` separators on every
platform; `{ absolute: true }` returns native absolute paths. `*` matches within a
directory and `**` can cross directories. See [TypeScript setup](./typescript-setup.md#type-definitions-for-global-context)
for the complete global declarations and editor configuration.

## Working with Multiple Targets {#working-with-multiple-targets}

Run the same script against a declared target:

```bash
xec run inspect.ts
xec on hosts.staging inspect.ts
xec in containers.app inspect.ts
xec in pods.app inspect.ts
```

Inside the script, use `$target` for commands intended for that selection. If a
script requires one target type, reject an incompatible selection before making
changes:

```typescript
if ($targetInfo.type !== 'ssh') {
  throw new Error('Select an SSH target with xec on hosts.<name> inspect.ts');
}
const version = await $target`node --version`;
console.log(version.stdout.trim());
```

For several independently configured targets in one workflow, use the
[Core adapters](../../core/execution-engine/adapters/concept.md) or a
[pipeline](../../ops/pipeline.md). Reuse their connection and cancellation
contracts rather than invoking another CLI process to reconstruct a target.

## Parameter Parsing {#parameter-parsing}

A script receives raw `args`. The supplied `parseArgs` handles simple flags,
`--key=value` pairs, and positional arguments:

```typescript
// xec inspect.ts --label=staging --verbose
const options = parseArgs(args);
console.log(options.label);   // 'staging'
console.log(options.verbose); // true
console.log(options._);       // positional arguments
```

Values remain strings or booleans. Validate required values before effects.
When a workflow needs typed options, help text, or completion, define a
[project command](../../commands/custom/creating-commands.md) with Xec's command
schema instead of building another argument parser.

CLI-owned flags such as `--watch` and `--dry-run` are consumed by the runner.
Place them after `--` to pass them to the script: `xec run inspect.ts -- --dry-run`.
A script receiving that argument must implement its own dry-run behavior.

## Context Isolation {#context-isolation}

A CLI invocation has its own process. Xec restores the globals it injected when
the script finishes. It does not sandbox the script or track arbitrary values
assigned to `globalThis`.

Watch mode reruns code in the same process. Module-scoped helpers and explicit
cleanup avoid leaking state, timers, or resources between executions. Only run
scripts and imports you trust.

## REPL Context {#repl-context}

Start the interactive runner with `xec run --repl`. It provides the same local
engines and utility globals. Node REPL commands such as `.help` and `.clear` are
dot-commands, not JavaScript functions.

```text
> await $`node --version`
> .help
> .clear
```

## Custom Context Extension {#custom-context-extension}

Prefer a normal function with an explicit engine argument. It can be imported,
tested, and used locally or remotely without changing globals:

```typescript
import type { CallableExecutionEngine } from '@xec-sh/core';

async function nodeVersion(engine: CallableExecutionEngine): Promise<string> {
  const result = await engine`node --version`;
  return result.stdout.trim();
}

console.log(await nodeVersion($target));
```

## Environment Variables {#environment-variables}

Local commands inherit the local process environment. Declare remote command
environment explicitly with `.env()`; do not assume the target has your local
variables or tools.

```typescript
const version = await $target`node --version`.env({ NODE_ENV: 'production' });
console.log(version.stdout.trim());
```

Xec reads `XEC_CONFIG` to select a configuration file, `XEC_PROFILE` to select a
profile, and `XEC_DEBUG` for debug output. Configuration overrides are limited to
supported data paths such as `XEC_VARS_APP_NAME`; an environment variable cannot
replace a task command. See [environment variables](../../configuration/variables/environment.md)
for the exact configuration contract. Pass secrets through the intended environment
or secret provider, and keep their values out of command strings and logs.

## Best Practices {#best-practices}

- Validate the target and arguments before making changes.
- Keep local preparation on `$` and selected-target operations on `$target`.
- Use tagged-template interpolation for data; use `exec` with `args` and
  `shell: false` when no shell is needed.
- Preserve failures and cancellation. `.nothrow()` permits inspecting a completed
  command's exit code; it does not prove a lost remote operation had no effect.
- Own the resources you create and await their cleanup in `finally`.

## Complete Example {#complete-example}

This read-only inspection requires Node on the selected target. A target failure
terminates the script; it never retries the command locally.

```typescript
// inspect.ts
if (typeof $target === 'undefined' || typeof $targetInfo === 'undefined') {
  throw new Error('Run with xec run, xec on, or xec in');
}
const options = parseArgs(args);
const label = typeof options.label === 'string' ? options.label : $targetInfo.name;
const result = await $target`node --version`;
console.log(`${label}: ${result.stdout.trim()}`);
```

```bash
xec on hosts.staging inspect.ts --label=staging
```

## Related guides {#related-guides}

- [Portable scripts](../../introduction/portable-scripts.md)
- [TypeScript setup](./typescript-setup.md)
- [Project commands](../../commands/custom/creating-commands.md)
- [Error handling](../../core/execution-engine/features/error-handling.md)
