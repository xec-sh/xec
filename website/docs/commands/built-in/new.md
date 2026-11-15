---
title: new
description: Create runnable project, script, command, task and profile starters
---

# new {#new}

`new` scaffolds a small starting point that you own and review. It does not deploy
an application or register an extension runtime.

:::note Upcoming scaffold corrections
The behavior below describes current source. Published 0.12.0 has older project,
task and profile templates, an ineffective extension generator and options that
do not implement their advertised behavior. The current source fixes those
starters, rejects unsupported previews and removes `--from` and the ineffective
`new --profile` option. Use explicit reviewed configuration on 0.12.0.
:::

## Synopsis {#synopsis}

```bash
pnpm exec xec new [type] [name] [options]
pnpm exec xec n [type] [name] [options]
pnpm exec xec init [type] [name] [options]
```

## Arguments {#arguments}

Supported types are `project`, `script`, `command`, `task` and `profile`.
With an interactive terminal, omitted choices prompt. In a pipe or CI, provide
the type and name explicitly; `new project` can initialize the current directory.

## Options {#options}

| Option | Scope |
| --- | --- |
| `-d, --desc <text>` | Artifact description |
| `-f, --force` | Explicitly replace the named existing artifact |
| `-m, --minimal` | Project without the sample script and documentation |
| `--skip-git` | Do not initialize Git for a project |
| `--advanced` | Extended script/command or multi-step task/local-target profile |
| `--js` | Generate JavaScript instead of TypeScript for a script/command |
| `-c, --config <path>` | Explicit file edited by `new task` or `new profile` |

There is no template download or profile-activation operation. Current source
refuses `--dry-run` and nontext `--output` before writing anything: it cannot
produce a faithful general scaffold preview or structured receipt. Generate in
an isolated directory to inspect a starter before adoption.

## Initialize a project {#project-creation}

```bash
pnpm exec xec new project automation --skip-git --desc 'Project operations'
cd automation
pnpm add -D -E @xec-sh/cli
pnpm exec xec run check
```

In an existing Node project, the command uses the current project directory and
its metadata. Review the detected directory; passing a name does not force a
nested project when `package.json` is already present. `--force` authorizes
replacing that project's Xec configuration.

The standard scaffold includes a runnable `hello` task and a `check` sequence
that inspects Node and calls `hello`. Minimal mode keeps the small configuration.
The command does not install dependencies for you.

:::filetree{title="Standard project"}
- `.xec/`
  - `config.yaml` — Runnable task definitions
  - `.gitignore` — Generated local-artifact exclusions
  - `scripts/`
    - `example.ts` — Local script example
  - `commands/` — Native project commands
- `package.json` — New project metadata and command types
- `README.md` — Usage; existing README content is preserved
:::

### Git initialization {#git-integration}

In an interactive terminal, Git initialization is offered unless `--skip-git` is
supplied. Noninteractive scaffolding does not initialize Git. Current source
only runs `git init` after confirmation; it does not stage the working tree or
create a commit. Review generated content and commit it yourself.

## Scripts {#script-creation}

```bash
pnpm exec xec new script inspect-runtime --desc 'Inspect the local runtime'
pnpm exec xec run .xec/scripts/inspect-runtime.ts
pnpm exec xec new script inspect-target --advanced --js
pnpm exec xec run .xec/scripts/inspect-target.js -- --dry-run
```

### Script files {#file-permissions}

Scripts are written under `.xec/scripts/` and marked executable. The basic
starter performs local observations. The advanced starter parses its own
`--env`, `--dry-run` and `--verbose` arguments. Development selects local;
staging/production require the corresponding configured SSH target and never
fall back to local execution. Retry covers only the idempotent runtime check.

In current source, its preview disallows configuration command evaluation and
does not execute the runtime check. It is still an ordinary program you must
review before adding effects or more retry behavior.

## Native commands {#command-creation}

```bash
pnpm exec xec new command inspect-app
pnpm exec xec inspect-app --help
pnpm exec xec new command inventory --advanced --js
pnpm exec xec inventory list
```

Commands are written under `.xec/commands/` and register through Commander.
The advanced example demonstrates subcommands and explicit confirmation. Its
sample create/delete actions are demonstrations; they do not persist an
inventory. Replace them with the real owning operation before presenting the
command as an application API.

No extension manifest, private CLI base class or second forwarding parser is
required. See [native command development](../custom/creating-commands.md).

## Tasks and profiles {#task-creation}

```bash
pnpm exec xec new task inspect --advanced --desc 'Check runtime and print a message'
pnpm exec xec run inspect --message 'Reviewed input'
pnpm exec xec new profile staging --advanced
XEC_PROFILE=staging pnpm exec xec run inspect
```

Tasks and profiles are added to the project file, or the explicitly selected
`--config` file. Existing named entries require `--force` to replace. Generated
configuration is validated before saving, and descriptions remain literal YAML
data even when they contain punctuation or newlines.

The advanced task has a declared string parameter, a task environment mapping
and two local command steps. It does not invent scheduling, event hooks,
automatic deployment or rollback.

### Profiles {#profile-creation}

The advanced profile adds local-target `NODE_ENV`; it does not reference a
nonexistent base profile or remote server. The last example uses POSIX
environment assignment syntax.

## Unsupported extensions {#extension-creation}

`new extension` now fails before creating files, because Xec has no extension
loader. An old `extensions` configuration key is also rejected before provider
initialization or command substitution. Use native commands, explicit tasks or
normal imported packages instead.

## Validation and failures {#validation}

Names cannot contain path separators. Project names use letters, digits,
hyphens and underscores; script names additionally allow dots; command/task/profile
names additionally allow colons. The current directory is an explicit project
initialization case, not an arbitrary path escape.

### Failures {#error-handling}

No prompt is assumed to be accepted in a noninteractive process. Invalid input,
unsupported features and refused overwrites produce a failing status. See the
[shared exit-code contract](../cli-reference.md#exit-codes); artifact-specific
numeric codes are not promised.

## See Also {#see-also}

- [Run](./run.md)
- [Configuration editing](./config.md)
- [Native command development](../custom/creating-commands.md)
- [Installation](../../introduction/installation.md)
