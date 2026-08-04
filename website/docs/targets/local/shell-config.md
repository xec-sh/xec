---
title: Shell Configuration
description: Shell selection, quoting, and cross-platform command escaping for local execution
keywords: [shell, bash, zsh, sh, powershell, cmd, quoting, escaping]
sidebar_position: 2
---

# Shell Configuration

The `shell` option controls whether a command runs through a shell, and which one. Every value interpolated into a `` $`...` `` template is quoted for that shell automatically.

## The `shell` option

`shell` is `boolean | string`:

- **`true` (default)** — delegates to Node's built-in shell handling: `/bin/sh -c "command"` on POSIX, `cmd.exe` on Windows. This is what runs when `shell` is left unset.
- **a string** — the path or bare name of a single executable, invoked as `<shell> -c "command"`. It must be just the executable: `'/bin/bash -i'` is not a valid path and spawning it fails with `ENOENT` — there is no separate field for extra flags.
- **`false`** — no shell. `command` is executed as `argv[0]` with `args` as its arguments; pipes, redirection and `$VAR` expansion are not available.

```typescript
await $`ls -la`; // shell: true (default)

await $.shell('/bin/bash')`echo $BASH_VERSION`;
await $.shell('/bin/zsh')`echo $ZSH_VERSION`;

// Skip the shell. This needs args as a separate array, which the template
// literal form can't produce — it always collapses to one command string.
await $.exec('node', { args: ['--version'], shell: false });
```

`.shell(...)` exists both on `$` (persists on the returned engine) and on a single pending command — `` $`cmd`.shell('/bin/zsh') ``, applied before it starts.

A string shell is always invoked with `-c`, which is why this works for shells that accept that flag for a command string — `bash`, `zsh`, `sh`, `dash` and `fish` all do. On Windows, leave `cmd.exe` as the default (`shell: true`): an explicit `shell: 'cmd.exe'` would still be invoked with `-c`, which `cmd.exe` doesn't understand — it needs `/c`, so it can't be selected as a string shell this way.

## Configuring a target's shell

```yaml
# .xec/config.yaml
targets:
  local:
    type: local
    shell: /bin/bash
```

There's no `shellArgs` field — `shell` is the whole story, and it takes exactly one executable path.

## Startup files

A string shell runs non-interactively via `-c`, so interactive/login startup files are not sourced automatically:

| Shell | Sourced by `-c` |
|-------|------------------|
| bash  | `$BASH_ENV`, if set — not `.bashrc` or `.bash_profile` |
| zsh   | `$ZDOTDIR/.zshenv` — not `.zshrc` |
| sh    | nothing |

Source what you need explicitly:

```typescript
await $.shell('/bin/bash')`source ~/.bashrc && my-alias`;
```

## Quoting and escaping

Values interpolated into a `` $`...` `` template are quoted for the shell that will run them. The dialect (`'posix'`, `'cmd'` or `'powershell'`) is resolved from whatever `.shell(...)` is currently set — not from the host OS:

```typescript
const userInput = "'; rm -rf /";
await $`echo ${userInput}`; // one literal argument, not executed

await $.shell('pwsh')`echo ${userInput}`; // quoted for PowerShell, even on Linux
```

Quoting only prevents *value* injection. It can't stop *option* injection — a value of `-rf` is a well-formed argument in any dialect. Use an explicit `--` separator at the call site if a value might be attacker-controlled and read as a flag.

To quote a value you're assembling into a command string yourself — for `$.exec()`, a generated script, a log line — rather than through the auto-escaping template:

```typescript
import { quoteForShell } from '@xec-sh/core';

const safe = quoteForShell(userInput, 'posix');
await $.exec('echo ' + safe);
```

## Portability

`sh` is POSIX-only — no arrays, no `[[ ]]`, no brace expansion:

```typescript
// Fails under /bin/sh
await $.shell('/bin/sh')`[[ -f file ]] && echo exists`;

// Works everywhere
await $`[ -f file ] && echo exists`;
await $.shell('/bin/bash')`[[ -f file ]] && echo exists`;
```

## Related Documentation

- [Local Overview](./overview.md) - local target fundamentals
- [Troubleshooting](./troubleshooting.md) - common shell issues
