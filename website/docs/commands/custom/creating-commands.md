---
title: Creating Custom Commands
description: Adding project-specific commands under .xec/commands
---

# Creating Custom Commands

A file in `.xec/commands/` becomes a command of your CLI. `xec deploy` can be
yours — with its own options, `--help`, and everything a script can reach:
targets, prompts, the full execution engine.

## Command Structure

A command file exports a function that receives the CLI's
[Commander](https://github.com/tj/commander.js) program and registers itself:

```typescript
// .xec/commands/greet.ts
export function command(program: any) {
  program
    .command('greet [name]')
    .description('Greet someone properly')
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
loader accepts all three. TypeScript needs no build step: the file is
transformed on load.

## What a Command Can Use

### Script globals — no imports

Every global available to `xec run` scripts is available inside a command:
`$`, `kit`, `log`, `prism`, `glob`, `fs`, `retry`, `sleep`, `within`, `yaml`,
and the rest. See [Execution Context](../../scripting/basics/execution-context.md)
for the full list.

```typescript
export function command(program: any) {
  program
    .command('clean')
    .description('Remove build artifacts')
    .action(async () => {
      const files = await glob(['dist/**', '**/*.tsbuildinfo']);
      if (files.length === 0) {
        log.info('Nothing to clean');
        return;
      }

      const yes = await kit.confirm({ message: `Delete ${files.length} paths?` });
      if (yes !== true) return; // Ctrl+C yields a cancel symbol, not false

      await $`rm -rf ${files}`;
      log.success(`Removed ${files.length} paths`);
    });
}
```

### Typed imports — even in a bare project

For IntelliSense and explicit dependencies, import the packages statically.
The CLI carries `@xec-sh/core`, `@xec-sh/ops`, `@xec-sh/kit` and
`@xec-sh/loader` as its own dependencies and supplies them to your command
when the project has not installed them. A project that *has* installed one —
to pin a version — keeps its own copy: ordinary resolution always wins.

```typescript
import { $ } from '@xec-sh/core';
import type { ExecutionResult } from '@xec-sh/core';

export function command(program: any) {
  program
    .command('status')
    .description('Show git status, typed')
    .action(async () => {
      const result: ExecutionResult = await $`git status --short`;
      log.info(`${result.lines().length} changed files`);
    });
}
```

### Targets

The engine reaches every environment from anywhere:

```typescript
export function command(program: any) {
  program
    .command('deploy <host>')
    .description('Deploy the current build to a host')
    .option('--dry-run', 'Print what would happen')
    .action(async (host: string, options: { dryRun?: boolean }) => {
      await $`npm run build`;

      if (options.dryRun) {
        log.info(`Would sync dist/ to ${host} and restart`);
        return;
      }

      const remote = $.ssh(host);
      const s = kit.spinner();
      s.start(`Deploying to ${host}`);

      // `upload` sends a local path to the engine's own target — no URL to
      // restate the host in.
      await remote.transfer.upload('dist/', '/srv/app/', { recursive: true });
      await remote`systemctl restart myapp`;

      s.stop(`Deployed to ${host}`);
    });
}
```

### Project configuration

The configuration the rest of the CLI uses is one import away:

```typescript
import { config } from '@xec-sh/ops';

export function command(program: any) {
  program
    .command('hosts')
    .description('List configured SSH targets')
    .action(async () => {
      await config.load();
      const hosts = config.get('targets.hosts') ?? {};
      for (const name of Object.keys(hosts)) {
        log.info(name);
      }
    });
}
```

## Discovery

Xec looks for command files in:

1. `.xec/commands/` and `.xec/cli/` in the current directory
2. `.xec/commands/` in parent directories, up to three levels
3. Any directories in `XEC_COMMANDS_PATH` (colon-separated)

Files with `.js`, `.mjs`, `.ts`, `.tsx` extensions register; `.test.*`,
`.spec.*` and dot-files are skipped. A dynamic command with the same name as
a built-in replaces it.

### Nested commands

Subdirectories become colon-separated names:

```
.xec/commands/
├── db/
│   ├── migrate.ts     # xec db:migrate
│   └── backup.ts      # xec db:backup
└── cache/
    └── clear.ts       # xec cache:clear
```

## Descriptions and Aliases Without Execution

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
export function command(program: any) {
  program
    .command('deploy')
    .alias('dep')                       // found without executing the file
    .description('Deploy the app')      // ditto
    .action(async () => { /* ... */ });
}
```

The command actually invoked is always loaded in full, so its own options
and `--help` are real.

## Errors and Exit Codes

Throwing from an action is reported and exits non-zero — in CI that is the
whole contract. Handle only what you can improve:

```typescript
export function command(program: any) {
  program
    .command('migrate')
    .description('Run database migrations')
    .action(async () => {
      const result = await $`./bin/migrate`.nothrow();

      if (!result.ok) {
        log.error(`Migration failed: ${result.stderr.trim()}`);
        log.info('The database is unchanged; fix the migration and rerun.');
        process.exitCode = 1;
      }
    });
}
```

## Testing Commands

A command file is a module; test it like one:

```typescript
// .xec/commands/greet.test.ts — skipped by discovery, run by your test runner
import { Command } from 'commander';
import { command } from './greet.js';

it('registers with its description', () => {
  const program = new Command();
  command(program);

  const greet = program.commands.find(c => c.name() === 'greet');
  expect(greet?.description()).toBe('Greet someone properly');
});
```

End to end, the CLI itself is the harness:

```bash
xec greet Alice --uppercase
xec --help | grep greet
```

## Troubleshooting

```bash
# See discovery: which directories were scanned, what was found, load errors
XEC_DEBUG=1 xec --help

# A command that fails to load reports its real error here too —
# a syntax error is a syntax error, not "command not found"
XEC_DEBUG=1 xec your-command
```

Transformed TypeScript commands run from `.xec/.tmp/`; with `XEC_DEBUG` set
the transformed files are kept there for inspection.

## Sharing Commands

- `XEC_COMMANDS_PATH=/path/to/shared/commands` adds a directory to discovery
- A parent directory's `.xec/commands/` serves every project beneath it —
  a monorepo root is the natural home for shared commands
