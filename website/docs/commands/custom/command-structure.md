---
title: Command Structure
description: How built-in CLI commands are structured and dispatched
keywords: [commands, structure, architecture, BaseCommand, manifest, commander]
source_files:
  - apps/xec/src/main.ts
  - apps/xec/src/utils/command-base.ts
  - apps/xec/src/utils/command-manifest.ts
  - apps/xec/src/utils/cli-command-manager.ts
key_functions:
  - BaseCommand.create()
  - BaseCommand.execute()
  - findCommand()
  - loadDynamicCommands()
verification_date: 2026-11-15
---

# Command Structure {#command-structure}

How the CLI's built-in commands are put together and how an invocation
reaches them. This is internals documentation — nothing here is required to
write your own commands; for that, see
[Creating Commands](./creating-commands.md).

## Source Layout {#source-layout}

- `apps/xec/src/main.ts` — program setup and invocation routing
- `apps/xec/src/utils/command-manifest.ts` — names, descriptions and aliases
  of the built-in commands
- `apps/xec/src/utils/command-base.ts` — `BaseCommand`, `SubcommandBase`,
  option plumbing
- `apps/xec/src/commands/*.ts` — one module per built-in command
- `apps/xec/src/utils/cli-command-manager.ts` — discovery and loading of
  dynamic commands from `.xec/commands/`

## The Command Manifest {#the-command-manifest}

`xec --help` needs a name and one line of description per command — not the
implementations. A manifest carries the metadata help needs without eagerly importing every
implementation and its dependencies. A command's
module is imported only when that command is actually invoked:

```typescript
// apps/xec/src/utils/command-manifest.ts
export interface CommandManifestEntry {
  name: string;         // as typed
  description: string;  // as shown in `xec --help`
  aliases: string[];    // alternative names
  module: string;       // module under ./commands/ that registers it
}

export const COMMAND_MANIFEST: readonly CommandManifestEntry[] = [
  { name: 'config', description: 'Manage Xec configuration', aliases: ['conf', 'cfg'], module: 'config' },
  { name: 'copy',   description: 'Copy files between targets', aliases: ['cp'], module: 'copy' },
  // Other built-in commands are declared by the same manifest.
];
```

Drift between the manifest and the real modules is caught by
`apps/xec/test/command-manifest.test.ts`, which loads every module and fails
if the two disagree.

At startup, `registerBuiltInCommands()` (in `main.ts`) imports the one
module the resolved command word refers to (`findCommand()` resolves
names and aliases — `xec cfg` loads the `config` module). Every other
command is registered as a stub with just the manifest's name, description
and aliases. The root parser distinguishes option values from the command word:
`xec --cwd /x config get` selects `config`, not `/x`. If a described stub is
invoked, its action registers the actual native schema and parses the invocation.

Dynamic commands get the same treatment: their name, description and
literal `.alias()` strings are read out of the source text without
importing the file, and the module is imported only on invocation. That is
why a dynamic command's description and aliases appear in `--help` without
the file ever executing.

## BaseCommand {#basecommand}

Every built-in command is a class extending `BaseCommand`
(`apps/xec/src/utils/command-base.ts`). The constructor takes a declarative
config; `create()` turns it into a commander `Command`:

```typescript
import type { Command } from 'commander';

export interface CommandConfig {
  name: string;
  description: string;
  aliases?: string[];
  arguments?: string;              // commander argument spec, e.g. '[fileOrTask]'
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: any;
  }>;
  examples?: Array<{ command: string; description: string }>;
  validateOptions?: (options: any) => void;
}

export abstract class BaseCommand {
  constructor(protected config: CommandConfig) { /* ... */ }
  abstract create(): Command; // Implemented by the internal CLI base class
  abstract execute(args: any[]): Promise<void>;
}
```

`create()` adds three options to every command — `-o, --output <format>`
(`text|json|yaml|csv`), `-c, --config <path>` and `--dry-run` — plus the
declared arguments, aliases and custom options. Short `-v` and `-q` belong to the root; long `--verbose` and `--quiet` are
also registered on the command. A declared flag is not evidence that every
command supports every output format or preview: the owning action validates
those combinations before effects. Declared examples are appended to `--help` output.

### From argv to execute() {#from-argv-to-execute}

The action handler `create()` installs unpacks commander's
`(...positionals, options, command)` call shape, merges command options
with the root program's `verbose`/`quiet`, retains Commander option provenance,
runs the `validateOptions` hook
if declared, configures the output formatter, and finally calls:

`this.execute([...positionalArgs, this.options])`. This is an internal call shape, not a standalone script.

So inside `execute()` the merged options object is the **last** element and
positionals come before it — the pattern every command follows:

```typescript
// A standalone illustration of the argument shape, not a public RunCommand class.
function readArguments(args: unknown[]) {
  const fileOrTask = args[0];
  const options = args[args.length - 1];
  return { fileOrTask, options };
}
```

Anything thrown out of `execute()` is caught by the action handler and
routed to `handleError()` from `@xec-sh/ops`, which prints the enhanced
error and exits with the code from its `getExitCode()` mapping — the table
is in the [CLI reference](../cli-reference.md#exit-codes).

### Registration {#registration}

A command module default-exports a function that registers it:

The built-in registration function constructs the command class and passes
`cmd.create()` to `program.addCommand(...)`. Project commands use the public
`command(program)` registration shown in [Creating Commands](./creating-commands.md)
and do not import the internal `RunCommand` or `BaseCommand`.

### Configuration-aware helpers {#configuration-aware-helpers}

`BaseCommand` carries the machinery a command needs to work with the
project configuration; all of it is initialized on demand by
`initializeConfig()`:

- `initializeConfig(options)` — builds a `ConfigurationManager` (honouring
  `--config` and profile), a `TargetResolver` and a `TaskManager`.
- `getCommandDefaults()` — the command's own defaults from the
  `commands.<name>` section of the configuration; `applyDefaults()` merges
  only after validating against the actual native schema. Explicit values win
  over configured values, and configuration overrides parser defaults. Only
  commands declaring configuration-default support participate.
- `resolveTarget(spec)` / `findTargets(pattern)` — configured-target lookup
  (`hosts.web-1`, `containers.*`).
- `createTargetEngine(target)` — maps a resolved target to an execution
  engine: `local` returns the global `$`, `ssh`/`docker`/`kubernetes`
  return `$.ssh(...)`, `$.docker(...)`, `$.k8s(...)` built from the
  target's config (including SSH host-key policy and per-target `env`).

### Output and interaction helpers {#output-and-interaction-helpers}

Uniform UX comes from the base class rather than each command:
`output()`/`table()` go through the `OutputFormatter` and respect
`-o text|json|yaml|csv`; `startSpinner()`/`stopSpinner()` and `log()` are
quiet-aware; interactive actions use `@xec-sh/kit` and must handle cancellation explicitly;
`isDryRun()`/`isVerbose()`/`isQuiet()` read the merged options.

### SubcommandBase {#subcommandbase}

Commands that are groups of subcommands (`docker` is one) extend
`SubcommandBase`, implement `setupSubcommands(command)`, and inherit an
`execute()` that prints help when no subcommand is given.

`ConfigAwareCommand` is a backward-compatibility alias for `BaseCommand` —
some modules still import it under that name.

## Invocation Routing {#invocation-routing}

`run()` in `main.ts` routes the current source in this order. The explicit local
argv boundary and corrected option scope are newer than npm 0.12.0:

1. A lone `--version`/`-V` prints the version and exits — no command
   loading, no config read.
2. Resolve root options and apply `--cwd`. Explicit `-- <executable> [args]`
   runs local argv without loading project commands, configuration or targets.
3. Discover the selected native command. Root `-e` / `--eval` and `--repl`
   route through the run command; the same spellings after a command word belong
   to that command or script.
4. A command word that is a script path runs through the script runtime.
5. A configured task name not owned by a command runs through TaskManager, with
   the same named-parameter grammar as `xec run <task>`.
6. Other executable names run locally with literal argv. There are no
   target-prefixed direct forms; `on`, `in` and task definitions own target
   selection. A probable typo of a built-in that is not on PATH receives a
   suggestion and exits `127`.
7. Native Commander dispatch handles built-in and project commands by name or
   alias. No arguments shows help; invalid options/arguments are parser errors.

## Related Topics {#related-topics}

- [Creating Commands](./creating-commands.md) — writing dynamic commands in
  `.xec/commands/`
- [Command Testing](./command-testing.md) — testing strategies
- [CLI Reference](../cli-reference.md) — flags, environment variables, exit
  codes
