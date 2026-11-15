---
title: Creating Custom Commands
description: Adding project-specific commands under .xec/commands
---

# Creating Custom Commands {#creating-custom-commands}

Use a project command when an operation needs its own arguments, validation and
help. Put it in `.xec/commands/` and invoke it as `xec <name>`. Use a task for a
configured sequence, or a TypeScript script for a reusable program; a custom
command does not require a second CLI runner.

## Command Structure {#command-structure}

A command file exports a function that receives the CLI's
[Commander](https://github.com/tj/commander.js) program and registers itself:

```typescript
// .xec/commands/greet.ts
import type { Command } from 'commander';

export function command(program: Command) {
  program
    .command('greet [name]')
    .description('Print a greeting')
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .option('-u, --uppercase', 'Shout it')
    .action(async (name = 'World', options: { uppercase?: boolean }) => {
      const greeting = `Hello, ${name}!`;
      log.success(options.uppercase ? greeting.toUpperCase() : greeting);
    });
}
```

```bash
xec greet Alice --uppercase
# HELLO, ALICE!
```

The export may be named `command`, `setup`, or be the default export — the
loader accepts all three. The registered name must match the discovered filename
(or its nested name). TypeScript is transformed on demand; importing a command
must only register its schema. Put effects inside its action, so help and
discovery remain safe. Install `commander` as a development dependency for the
`Command` type used in these examples.

The current development loader preserves the original directory for nested
TypeScript imports, including imports made later by an action. It requires
Node's synchronous module hooks (Node 22.15 or later with that API; the CLI
requires Node 22.18). npm 0.12.0 instead relocates a transformed entry to
`.xec/.tmp/`, so relative imports and `import.meta.url` can refer to the wrong
location. This correction belongs to the next release, not to npm 0.12.0.

## What a Command Can Use {#what-a-command-can-use}

### Script globals — no imports {#script-globals--no-imports}

Every global available to `xec run` scripts is available inside a command:
`$`, `kit`, `log`, `prism`, `glob`, `fs`, `retry`, `sleep`, `within`, `yaml`,
and the rest. See [Execution Context](../../scripting/basics/execution-context.md)
for the full list.

```typescript
import type { Command } from 'commander';

export function command(program: Command) {
  program.command('source-count')
    .description('Count project TypeScript source files')
    .allowExcessArguments(false)
    .action(async () => {
      const files = await glob(['src/**/*.ts']);
      log.info(`${files.length} TypeScript files`);
    });
}
```

### Typed imports — even in a bare project {#typed-imports--even-in-a-bare-project}

For IntelliSense and explicit dependencies, import the packages statically.
On the supported Node CLI, `@xec-sh/core`, `@xec-sh/ops`, `@xec-sh/kit` and
`@xec-sh/loader` are carried dependencies and are supplied to your command
when the project has not installed them. A project that *has* installed one —
to pin a version — keeps its own copy: ordinary resolution always wins. Install the packages in
the project when you need editor types or a pinned runtime version. Other
third-party imports must be declared and installed by the project.

```typescript
import type { Command } from 'commander';
import { $ } from '@xec-sh/core';
import type { ExecutionResult } from '@xec-sh/core';

export function command(program: Command) {
  program
    .command('status')
    .description('Show git status, typed')
    .action(async () => {
      const result: ExecutionResult = await $`git status --short`;
      log.info(`${result.lines().length} changed files`);
    });
}
```

### Targets {#targets}

The engine owns remote execution and its transport policy. Preview before
creating the engine or running any command; a flag alone does not make an
action safe to preview. This read-only example requires an independently
verified host-key fingerprint and an SSH agent:

```typescript
import type { Command } from 'commander';
import { $ } from '@xec-sh/core';

export function command(program: Command) {
  program.command('check-host <host>')
    .description('Read uptime from a verified SSH host')
    .requiredOption('--host-key <fingerprint>', 'Verified SHA256 host fingerprint')
    .option('--username <name>', 'Remote account', 'deploy')
    .option('--dry-run', 'Print the target without connecting')
    .allowExcessArguments(false)
    .action(async (host: string, options: { hostKey: string; username: string; dryRun?: boolean }) => {
      if (options.dryRun) {
        log.info(`Would read uptime from ${options.username}@${host}`);
        return;
      }
      const remote = $.ssh({ host, username: options.username,
        expectedHostFingerprint: options.hostKey, agent: process.env.SSH_AUTH_SOCK });
      const result = await remote`uptime`.timeout(10_000);
      log.info(result.stdout.trim());
    });
}
```

A deployment additionally needs the application's artifact, ownership and
recovery contract. Uploading a directory and restarting a process is not a
transactional deployment. Reuse the owning deployment API instead of embedding
a separate release protocol in a CLI action.

### Project configuration {#project-configuration}

The configuration the rest of the CLI uses is one import away:

```typescript
import type { Command } from 'commander';
import { ConfigurationManager } from '@xec-sh/ops';

export function command(program: Command) {
  program
    .command('hosts')
    .description('List configured SSH targets')
    .action(async () => {
      const config = await new ConfigurationManager().load();
      const hosts = config.targets?.hosts ?? {};
      for (const name of Object.keys(hosts)) {
        log.info(name);
      }
    });
}
```

## Discovery {#discovery}

Xec looks for command files in:

1. `.xec/commands/` and `.xec/cli/` in the current directory
2. `.xec/commands/` in parent directories, up to three levels
3. Directories in `XEC_COMMANDS_PATH`, separated by the platform path delimiter
   (`:` on Unix, `;` on Windows in the current source; npm 0.12.0 splits on `:`)

Files with `.js`, `.mjs`, `.ts`, `.tsx` extensions register; `.test.*`,
`.spec.*` and dot-files are skipped. A dynamic command with the same name as
a built-in replaces it.

### Nested commands {#nested-commands}

Subdirectories become colon-separated names:

:::filetree{title=".xec/commands/"}
- `db/`
  - `migrate.ts` — xec db:migrate
  - `backup.ts` — xec db:backup
- `cache/`
  - `clear.ts` — xec cache:clear
:::
## Descriptions and Aliases Without Execution {#descriptions-and-aliases-without-execution}

`xec --help` must print one line per command without executing every command
file — loading them all would run a TypeScript transform and whatever each
file imports, to print a sentence. So discovery *reads* the file and takes:

1. The first literal `.description('...')` argument, or a literal
   `description: '...'` property
2. Failing that, the first line of a `/** ... */` comment that opens the file
3. Failing that, a `// Description: ...` line comment

Aliases work the same way: literal `.alias('...')` and `.aliases([...])`
strings are honoured before the file ever loads, so `xec dep` finds your
`deploy` command. A description or alias *computed* at run time is invisible
until the command is actually invoked — keep them literal.

```typescript
import type { Command } from 'commander';

export function command(program: Command) {
  program
    .command('deploy')
    .alias('dep')                       // found without executing the file
    .description('Deploy the app')      // ditto
    .action(async () => { /* ... */ });
}
```

The command actually invoked is always loaded in full, so its own options
and `--help` are real.

## Errors and Exit Codes {#errors-and-exit-codes}

Throwing from an action is reported and exits non-zero — in CI that is the
observable result. A command that failed may already have applied changes;
retain its cause and inspect the destination before retrying:

```typescript
import type { Command } from 'commander';

export function command(program: Command) {
  program
    .command('migrate')
    .description('Run database migrations')
    .action(async () => {
      // The normal execution error retains status, bounded output and cause.
      // Do not retry a migration until its effects have been inspected.
      await $`./bin/migrate`;
    });
}
```

## Testing Commands {#testing-commands}

A command file is a module; test it like one:

Import the exported `command` function from your actual command file in a Vitest
suite, then register it on a fresh Commander `Command`. Assert the registered name,
options and description, and invoke the real CLI for its observable execution
behavior. The [command testing guide](./command-testing.md#output-capture) contains
a complete test against the installed CLI.

End to end, the CLI itself is the harness:

```bash
xec greet Alice --uppercase
xec --help | grep greet
```

## Troubleshooting {#troubleshooting}

```bash
# See discovery: which directories were scanned, what was found, load errors
XEC_DEBUG=1 xec --help

# A command that fails to load reports its real error here too —
# a syntax error is a syntax error, not "command not found"
XEC_DEBUG=1 xec your-command
```

In the current development loader, no relocated TypeScript source is written.
`import.meta.url` keeps the authored file URL with a private graph query; use
`fileURLToPath(import.meta.url)` for its path or `new URL('./asset', import.meta.url)`
for relative data. Each load gets independent local ESM state; bare packages and
CommonJS keep Node's normal cache. The CLI retains the graph through action and
cleanup, then deregisters its hooks. This is trusted local code, not a sandbox.

Library owners can use `ModuleGraph` from `@xec-sh/loader` in the next release.
Keep it alive through deferred callbacks and dispose it after they settle.
Disposal does not undo side effects or evict Node's ESM registry; use a fresh
process for unbounded watch/reload cycles. npm 0.12.0 still writes the temporary
entry and retains it when `XEC_DEBUG` is enabled.

## Sharing Commands {#sharing-commands}

- `XEC_COMMANDS_PATH=/path/to/shared/commands` adds a directory to discovery
- A parent directory's `.xec/commands/` serves every project beneath it —
  a monorepo root is the natural home for shared commands
