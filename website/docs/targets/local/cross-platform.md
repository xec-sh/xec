---
title: Windows and cross-platform scripts
description: What behaves identically on every operating system, what cannot, and how to write commands that survive both
keywords: [windows, cmd, powershell, cross-platform, portability, quoting]
---

# Windows and cross-platform scripts

Xec runs on Linux, macOS and Windows, and its unit suite runs on Windows in
CI. This page is the line between what that guarantees and what it cannot.

The short version: **everything Xec does is the same everywhere; what the
shell does is not.** A script that treats commands as programs with
arguments is portable. One that writes shell syntax is as portable as that
syntax.

## What is identical on every platform

These are Xec's own behaviour, and they do not vary:

| | |
|---|---|
| **Escaping** | An interpolated value reaches the command as exactly one argument, whatever it contains — quoted for the shell that will parse it, whichever that is. |
| **Paths** | `cd`, `cwd` and every path option compose through `path.resolve`, so a drive letter appears where the platform has one. |
| **`glob`** | Answers `/`-separated paths everywhere, so results can be compared and fed back into patterns. A single `*` never crosses a directory. |
| **`lines()` and line iteration** | A line ends with `\n` or `\r\n`; the terminator is never part of the line. |
| **Timeouts and `.kill()`** | Terminate the process and everything it started — a process group on POSIX, `taskkill /t` on Windows. |
| **Streams** | `stdout`, `stderr`, `buffer()` and async iteration deliver the same bytes. |
| **Exit codes and `ok`** | A killed or failed process is never reported as a success. |

## What the platform decides

### The shell

With `shell: true` — the default — commands run through `/bin/sh` on POSIX
and `cmd.exe` on Windows. Escaping follows: values are quoted in that
shell's dialect, so the protection always matches the parser.

Name a different one and both follow it:

```javascript
// bash on Windows (Git Bash, WSL), with POSIX quoting to match
await $.with({ shell: 'bash' })`grep ${pattern} ${file}`;
```

Xec does not go looking for bash on Windows. Choosing a shell based on what
happens to be installed would mean the same machine behaves differently
before and after somebody installs Git — so the default is the platform's
own, and switching is explicit.

### What the shell does with your command

This is where portability ends, and no amount of escaping changes it:

```javascript
// cmd.exe prints the quotes; its echo does not strip them
await $`echo ${'hello world'}`;   // POSIX: hello world   cmd: "hello world"

// Variable references are spelled differently
await $`echo $HOME`;              // POSIX: expands        cmd: literal $HOME

// Separators, subshells, redirection to a file descriptor
await $`a && b`;                  // POSIX only
await $`( a; b ) & c`;            // POSIX only

// And the tools themselves
await $`sleep 1`;                 // absent from Windows unless Git Bash is installed
await $`cat f | grep x | tr a-z A-Z`;
```

Mode bits (`chmod`) and POSIX signals are in the same category. Windows has
neither: `.kill('SIGKILL')` terminates the process and reports an ordinary
non-zero exit, with no `signal` field, because there is no signal to report.

## Writing commands that work on both

### Pass values as arguments, not as shell text

This is the whole technique. A program and its arguments are portable; a
shell expression is not.

```javascript
// Portable — the value is an argument, escaped for whichever shell runs it
await $`node scripts/report.js ${outputPath}`;

// Not portable — `>` and `$HOME` are the shell's
await $`node scripts/report.js > $HOME/report.txt`;
```

### Reach for the runtime instead of shell built-ins

Anything you would write with `echo`, `cat`, `printf` or `test` has an
equivalent that behaves identically everywhere, because it is the same
program:

```javascript
// Instead of `echo "$SOME_VAR"`
const value = (await $`node -e ${'process.stdout.write(process.env.SOME_VAR ?? "")'}`).stdout;

// Instead of `test -d path && echo yes`
import { existsSync } from 'node:fs';
if (existsSync(path)) { /* ... */ }
```

Most of the time the answer is simply not to shell out: `node:fs`,
`node:path` and the [script globals](../../scripting/basics/execution-context.md)
already cover what these commands were for.

### Or name a shell and mean it

When a script genuinely needs POSIX syntax, say so once:

```javascript
const sh = $.with({ shell: 'bash' });

await sh`for f in *.log; do gzip "$f"; done`;
```

On Windows this requires bash to be present — Git for Windows or WSL — and
fails clearly if it is not, which is better than differing silently.

## Remote targets are not local ones

An SSH, Docker or Kubernetes target runs commands on the *remote* host, so
the remote's shell is what matters, not yours. Running Xec from Windows
against a Linux server gives POSIX semantics, because that is what is at
the other end.

## See also

- [Shell configuration](./shell-config.md) — selecting and disabling the shell
- [Template literals](../../core/execution-engine/template-literals.md) — how interpolation and escaping work
- [Portable scripts](../../introduction/portable-scripts.md) — `$target` and portability across environments rather than operating systems
