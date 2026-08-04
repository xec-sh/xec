---
title: Local Target Troubleshooting
description: Common issues and solutions for local command execution
keywords: [troubleshooting, local, debugging, errors, solutions]
sidebar_position: 3
---

# Local Target Troubleshooting

## Command not found

With the default shell (`shell: true`), a missing command is not a JavaScript exception — the shell runs, doesn't find the command, and exits 127:

```typescript
import { CommandError } from '@xec-sh/core';

try {
  await $`does-not-exist`;
} catch (error) {
  if (error instanceof CommandError) {
    error.exitCode; // 127
    error.stderr;   // "...: does-not-exist: command not found" (wording varies by shell)
    error.message;  // already includes "127 (command not found)"
  }
}
```

`CommandError` looks up common exit codes and appends their meaning to the message, so you don't need your own lookup table for the frequent ones (127, 126, 137, 139, ...; the full list is [below](#exit-codes)).

```typescript
const path = await $.which('command-name');       // null if not found
await $.env({ PATH: `/usr/local/bin:${process.env.PATH}` })`command-name`;
await $`/usr/local/bin/command-name`;              // full path
```

On macOS, Homebrew binaries under `/opt/homebrew/bin` are a common case of the same issue if that directory isn't already on `PATH`. A downloaded script may also need its quarantine attribute removed before it will execute: `` await $`xattr -d com.apple.quarantine ./script.sh` ``.

## Permission denied

Exit code 126 means the file exists but isn't executable:

```typescript
await $`chmod +x ./script.sh`;
await $`./script.sh`;

// Or invoke the interpreter directly, which doesn't need +x
await $`bash script.sh`;
```

## Working directory does not exist

```typescript
import { existsSync, mkdirSync } from 'node:fs';

if (!existsSync('/project')) mkdirSync('/project', { recursive: true });
await $.cd('/project')`npm install`;
```

A `cwd` that doesn't exist fails when the process is spawned, not before — the error surfaces as a failed spawn rather than a dedicated "bad directory" error.

## Shell syntax errors

Bash-only syntax (`[[ ]]`, arrays) fails under `/bin/sh`. See [Portability](./shell-config.md#portability) for the POSIX-safe equivalents.

## Environment variables

Commands always inherit `process.env`; `env` layers additional keys on top of it — there's no way to start a command with a fully empty environment.

```typescript
await $`echo $HOME`;                            // inherited
await $.env({ MY_VAR: 'value' })`echo $MY_VAR`;  // added
```

If a variable you expect isn't set, check that it survives shell startup — see [Startup files](./shell-config.md#startup-files).

## Buffer and encoding

`maxBuffer` and `encoding` are engine-level settings, not per-command options — there's no `.with({ maxBuffer })` or `.encoding()` chain method. Set them once:

```typescript
import { configure } from '@xec-sh/core';

configure({ maxBuffer: 100 * 1024 * 1024, encoding: 'utf8' }); // every command after this
```

Exceeding `maxBuffer` (default 10MB) kills the process and rejects with `MaxBufferExceededError`, carrying whatever was collected before the cut-off:

```typescript
import { MaxBufferExceededError } from '@xec-sh/core';

try {
  await $`cat huge-file`;
} catch (error) {
  if (error instanceof MaxBufferExceededError) {
    error.limit;          // bytes
    error.partialStdout;  // output collected before the kill
  }
}
```

`result.stdout` is always decoded text, which is lossy for arbitrary bytes. For binary output, read `.buffer()` on the awaited result instead — it returns the exact bytes written:

```typescript
const image = await $`cat photo.png`;
const bytes = image.buffer();
```

## Timeouts

Commands time out after 30 seconds by default:

```typescript
await $`slow-command`.timeout(0);      // disable
await $`slow-command`.timeout('5m');   // duration string
await $`slow-command`.timeout(300000); // same, in milliseconds

import { TimeoutError } from '@xec-sh/core';

try {
  await $`potentially-slow-command`.timeout(5000);
} catch (error) {
  if (error instanceof TimeoutError) { /* ... */ }
}
```

A timeout kills the whole process tree (see below), using the adapter's `killSignal` — configured once when the engine is created (default `SIGTERM`), not the second argument to `.timeout(duration, signal)`, which local execution doesn't consult.

## Killing a command and its children

Local commands run in their own process group by default. `.kill()` — whether called directly, via a timeout, or via a `maxBuffer` overflow — signals that whole group plus any descendant that escaped it, so a shell wrapper (`sh -c 'node server.js'`) can't orphan what it started:

```typescript
const p = $`long-running-build`;
process.on('SIGINT', () => p.kill('SIGTERM'));
```

## Exit codes

`CommandError.exitCode` is the raw exit code; the error message already explains the common ones:

| Code | Meaning |
|------|---------|
| 2 | misuse of shell builtins |
| 126 | found but not executable |
| 127 | command not found |
| 130 | SIGINT (Ctrl-C) |
| 134 | SIGABRT |
| 137 | SIGKILL, often an OOM kill |
| 139 | segmentation fault |
| 141 | SIGPIPE, reader closed early |
| 143 | SIGTERM |

## Error types

| Class | Thrown when |
|-------|-------------|
| `CommandError` | non-zero exit code — has `.exitCode`, `.signal`, `.stdout`, `.stderr`, `.command`, `.duration` |
| `TimeoutError` | `.timeout()` elapsed |
| `MaxBufferExceededError` | stdout/stderr exceeded `maxBuffer` |
| `AdapterError` | the process couldn't be spawned at all (bad `cwd`, bad shell path, ...) |

All of them extend `ExecutionError`, which carries a stable `.kind` (e.g. `'command-failed'`, `'timeout'`) for branching that doesn't depend on message wording, and a `.recoverable` flag.

```typescript
import { CommandError, TimeoutError } from '@xec-sh/core';

try {
  await $`deploy.sh`;
} catch (error) {
  if (error instanceof TimeoutError) { /* ... */ }
  else if (error instanceof CommandError) { /* ... */ }
  else throw error;
}
```

Skip exceptions entirely with `.nothrow()`:

```typescript
const result = await $`deploy.sh`.nothrow();
if (!result.ok) {
  console.error(result.exitCode, result.stderr);
}
```

## Debugging a command

Echo every command as it runs:

```typescript
$.verbose = true; // writes "$ <command>" to stderr, credentials masked
```

`result.stdall` gives stdout and stderr merged in the order they actually arrived — useful when what matters is which step logged a given line, which separate `stdout`/`stderr` strings lose:

```typescript
const result = await $`build.sh`.nothrow();
console.log(result.stdall);
```

Listen for command lifecycle events, e.g. to log everything a script runs:

```typescript
$.on('command:start', ({ command, cwd }) => console.log('>', command, cwd));
$.on('command:complete', ({ command, exitCode, duration }) =>
  console.log('<', command, exitCode, `${duration}ms`));
$.on('command:error', ({ command, error }) => console.error('!', command, error));
```

A failing command's error message already names where it was called from (`at file.ts:42`), so there's no need to build your own call-stack tracking.

For a command you need to watch while it runs rather than after it finishes, see [live process access](./overview.md#live-process-access) — `.spawned`, `.child` and `.pid` give real stdout/stderr streams and a pid without waiting for completion.

## Related Documentation

- [Local Overview](./overview.md) - local execution fundamentals
- [Shell Configuration](./shell-config.md) - shell setup and quoting
- [Error Handling](../../scripting/patterns/error-handling.md) - error handling patterns
- [Debugging Guide](../../guides/development/debugging.md) - advanced debugging
