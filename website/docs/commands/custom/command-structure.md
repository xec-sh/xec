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
verification_date: 2026-08-05
---

# Command Structure

How the CLI's built-in commands are put together and how an invocation
reaches them. This is internals documentation — nothing here is required to
write your own commands; for that, see
[Creating Commands](./creating-commands.md).

## Source Layout

- `apps/xec/src/main.ts` — program setup and invocation routing
- `apps/xec/src/utils/command-manifest.ts` — names, descriptions and aliases
  of the built-in commands
- `apps/xec/src/utils/command-base.ts` — `BaseCommand`, `SubcommandBase`,
  option plumbing
- `apps/xec/src/commands/*.ts` — one module per built-in command
- `apps/xec/src/utils/cli-command-manager.ts` — discovery and loading of
  dynamic commands from `.xec/commands/`

## The Command Manifest

`xec --help` needs a name and one line of description per command — not the
implementations. Every command module statically imports `@xec-sh/ops`, so
importing all of them just to list their names cost ~140 ms on every
invocation. Instead, a manifest carries what help needs, and a command's
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
  // ... twelve entries in total
];
```

Drift between the manifest and the real modules is caught by
`apps/xec/test/command-manifest.test.ts`, which loads every module and fails
if the two disagree.

At startup, `registerBuiltInCommands()` (in `main.ts`) imports the one
module the first non-flag argument refers to (`findCommand()` resolves
names and aliases — `xec cfg` loads the `config` module). Every other
command is registered as a stub with just the manifest's name, description
and aliases. If a stub is nevertheless invoked — the requested command
wasn't recognisable up front, for instance `xec --cwd /x config get` where
the first non-flag token is `/x` — its action imports the real module into
a fresh program and re-parses `argv`.

Dynamic commands get the same treatment: their name, description and
literal `.alias()` strings are read out of the source text without
importing the file, and the module is imported only on invocation. That is
why a dynamic command's description and aliases appear in `--help` without
the file ever executing.

## BaseCommand

Every built-in command is a class extending `BaseCommand`
(`apps/xec/src/utils/command-base.ts`). The constructor takes a declarative
config; `create()` turns it into a commander `Command`:

```typescript
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
  create(): Command { /* build the commander command */ }
  abstract execute(args: any[]): Promise<void>;
}
```

`create()` adds three options to every command — `-o, --output <format>`
(`text|json|yaml|csv`), `-c, --config <path>` and `--dry-run` — plus the
declared arguments, aliases and custom options. `-v/--verbose` and
`-q/--quiet` are root-program options inherited by all commands, not
re-declared per command. Declared examples are appended to `--help` output.

### From argv to execute()

The action handler `create()` installs unpacks commander's
`(...positionals, options, command)` call shape, merges command options
with the root program's `verbose`/`quiet`, runs the `validateOptions` hook
if declared, configures the output formatter, and finally calls:

```typescript
await this.execute([...positionalArgs, this.options]);
```

So inside `execute()` the merged options object is the **last** element and
positionals come before it — the pattern every command follows:

```typescript
// apps/xec/src/commands/run.ts
public async execute(args: any[]): Promise<void> {
  const fileOrTask = args[0];
  const options = args[args.length - 1] as RunOptions;
  // ...
}
```

Anything thrown out of `execute()` is caught by the action handler and
routed to `handleError()` from `@xec-sh/ops`, which prints the enhanced
error and exits with the code from its `getExitCode()` mapping — the table
is in the [CLI reference](../cli-reference.md#exit-codes).

### Registration

A command module default-exports a function that registers it:

```typescript
// apps/xec/src/commands/run.ts
export default function registerCommand(program: Command): void {
  const cmd = new RunCommand();
  program.addCommand(cmd.create());
}
```

### Configuration-aware helpers

`BaseCommand` carries the machinery a command needs to work with the
project configuration; all of it is initialized on demand by
`initializeConfig()`:

- `initializeConfig(options)` — builds a `ConfigurationManager` (honouring
  `--config` and profile), a `TargetResolver` and a `TaskManager`.
- `getCommandDefaults()` — the command's own defaults from the
  `commands.<name>` section of the configuration; `applyDefaults()` merges
  them under explicitly passed options.
- `resolveTarget(spec)` / `findTargets(pattern)` — configured-target lookup
  (`hosts.web-1`, `containers.*`).
- `createTargetEngine(target)` — maps a resolved target to an execution
  engine: `local` returns the global `$`, `ssh`/`docker`/`kubernetes`
  return `$.ssh(...)`, `$.docker(...)`, `$.k8s(...)` built from the
  target's config (including SSH host-key policy and per-target `env`).

### Output and interaction helpers

Uniform UX comes from the base class rather than each command:
`output()`/`table()` go through the `OutputFormatter` and respect
`-o text|json|yaml|csv`; `startSpinner()`/`stopSpinner()` and `log()` are
quiet-aware; `confirm()`/`prompt()`/`select()`/`multiselect()` wrap
`@xec-sh/kit` prompts and short-circuit to their defaults under `--quiet`
(a cancelled prompt also falls back instead of throwing);
`isDryRun()`/`isVerbose()`/`isQuiet()` read the merged options.

### SubcommandBase

Commands that are groups of subcommands (`docker` is one) extend
`SubcommandBase`, implement `setupSubcommands(command)`, and inherit an
`execute()` that prints help when no subcommand is given.

`ConfigAwareCommand` is a backward-compatibility alias for `BaseCommand` —
some modules still import it under that name.

## Invocation Routing

`run()` in `main.ts` routes an invocation in this order — the first match
wins, and only the last step involves commander dispatch:

1. A lone `--version`/`-V` prints the version and exits — no command
   loading, no config read.
2. `-e <code>` / `--eval <code>` anywhere in argv evaluates the code.
3. `--repl` anywhere in argv starts the REPL.
4. A first argument that is a file (by `.js`/`.ts`/`.mjs` extension, or an
   existing file path) runs as a script.
5. A first argument matching a configured task (and not a command name)
   runs that task, with `--key=value` / `--key value` parsed as task
   parameters.
6. A first argument that `isDirectCommand()` accepts executes as a direct
   command (`xec echo hi`, target-prefixed forms).
7. Everything else goes to commander: built-in and dynamic commands,
   resolved by name or alias. An unknown command prints a
   did-you-mean suggestion (`checkForCommandTypo` from `@xec-sh/core`) and
   exits `1`.
8. No arguments at all shows help.

## Related Topics

- [Creating Commands](./creating-commands.md) — writing dynamic commands in
  `.xec/commands/`
- [Command Testing](./command-testing.md) — testing strategies
- [CLI Reference](../cli-reference.md) — flags, environment variables, exit
  codes
