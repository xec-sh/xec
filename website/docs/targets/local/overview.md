---
title: Local Target Overview
description: Local command execution and shell environment management
keywords: [local, shell, execution, bash, zsh, sh]
sidebar_position: 1
---

# Local Target Overview

Local targets run commands directly on the machine executing the script, through Node's `child_process` (or `Bun.spawn`, when the adapter is configured to prefer it). It is the default target — no configuration is required to use it.

```typescript
import { $ } from '@xec-sh/core';

const result = await $`echo "Hello, World!"`;
console.log(result.stdout); // "Hello, World!\n"
```

## Target configuration

```yaml
# .xec/config.yaml
targets:
  local:
    type: local
    shell: /bin/bash   # optional: path to a shell binary, or false to skip the shell
    env:
      NODE_ENV: development
    cwd: /project
```

All fields are optional; `local` also accepts `timeout`, `encoding`, `maxBuffer` and `throwOnNonZeroExit`. `shell` takes a boolean or the path to a single executable — it cannot carry extra arguments (see [Shell Configuration](./shell-config.md)).

## Execution model

`LocalAdapter` (`packages/core/src/adapters/local/index.ts`) picks `Bun.spawn` or Node's `child_process.spawn` per command. The choice, and a few OS-level settings, are constructor-only — set them once when the engine is created, not per command:

```typescript
import { configure, RuntimeDetector } from '@xec-sh/core';

configure({
  adapters: {
    local: {
      preferBun: true,             // use Bun.spawn when the process is running under Bun
      forceImplementation: 'bun',  // or 'node' — skip detection entirely
      uid: 1000,                   // Unix only
      gid: 1000,                   // Unix only
      killSignal: 'SIGKILL',       // used for timeouts, buffer overflow and tree-kill (default SIGTERM)
    },
  },
});

RuntimeDetector.isBun(); // true when the current process is Bun
```

`configure()` replaces the default `$`. To run specific commands through an independently configured engine instead:

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

const bunOnly = createCallableEngine(
  new ExecutionEngine({ adapters: { local: { forceImplementation: 'bun' } } }),
);
await bunOnly`echo hello`;
```

## Environment variables

Commands inherit `process.env`; anything passed as `env` is layered on top, per key — there is no way to run a command with a fully empty environment.

```typescript
await $`echo $HOME`; // current HOME

await $.env({ NODE_ENV: 'production' })`npm run build`; // persists on the returned engine

await $.with({ env: { DEBUG: 'app:*' } })`node app.js`; // this command only
```

## Working directory

```typescript
$.pwd();                       // directory the engine currently uses
const proj = $.cd('/project'); // returns a new engine rooted there
await proj`npm install`;

await $`pwd`.cwd('/tmp'); // override for a single command -> /tmp

import { within } from '@xec-sh/core';
await within('/project', async () => {
  await $`npm install`;
  await $`npm test`;
}); // reverts afterward
```

## Reading output

```typescript
const result = await $`ls -la`;
result.stdout;  // string
result.stderr;  // string
result.stdall;  // stdout and stderr merged in the order they arrived
result.exitCode;
result.ok;      // exitCode === 0 && no signal
```

Convenience readers, available directly on the pending command:

```typescript
await $`echo hi`.text();          // trimmed stdout
await $`echo '{"a":1}'`.json();
await $`printf 'a\nb\n'`.lines(); // ['a', 'b']
```

Binary output needs the awaited result's `.buffer()`, which returns the exact bytes written rather than a re-encoded string:

```typescript
const image = await $`cat photo.png`;
const bytes = image.buffer();
```

Stream a long-running command line by line as it runs:

```typescript
for await (const line of $`tail -f app.log`) {
  console.log(line);
}
```

Pipe to another command or to a stream:

```typescript
await $`cat file.txt`.pipe($`grep pattern`).pipe($`wc -l`);
await $`npm install`.pipe(process.stdout);

import { createWriteStream } from 'node:fs';
await $`echo content`.pipe(createWriteStream('output.txt'));
```

Provide input:

```typescript
await $.with({ stdin: 'hello\n' })`cat`;

import { createReadStream } from 'node:fs';
await $.with({ stdin: createReadStream('input.txt') })`wc -l`;
```

## Live process access

`` $`cmd` `` is lazy — nothing runs until it is awaited, started, or one of the live accessors below is read.

```typescript
const p = $`sleep 100`;
p.start(); // begins running, without awaiting

const handle = await p.spawned; // resolves once the process exists
p.pid;     // process id (starts the command if it hasn't already)
p.child;   // ProcessHandle: pid, stdin, stdout, stderr, kill()

p.stdin.write('input\n'); // writable immediately; buffered until the process exists
p.stdin.end();

p.kill('SIGTERM'); // signals the whole process tree, not just the direct child
await p.nothrow();
```

On POSIX, a command runs in its own process group by default (`detached: true` unless overridden), and `.kill()` signals that group plus any descendant that escaped it — a shell wrapper like `sh -c 'node server.js'` cannot orphan what it started.

## Timeouts

```typescript
await $`npm install`.timeout(60000);
await $`npm install`.timeout('60s');
```

Commands time out after 30 seconds by default. A timeout rejects with `TimeoutError` and kills the process tree, using the adapter's `killSignal` (default `SIGTERM`, set at construction as shown above).

## Errors

A non-zero exit code throws `CommandError` (`exitCode`, `signal`, `stdout`, `stderr`, `command`, `duration`) by default. Opt out per command with `.nothrow()`:

```typescript
const result = await $`test -f file.txt`.nothrow();
if (!result.ok) {
  console.error(result.stderr);
}
```

See [Troubleshooting](./troubleshooting.md) for exit-code meanings and common failures.

## Related Documentation

- [Shell Configuration](./shell-config.md) - shell selection, quoting, dialects
- [Local Troubleshooting](./troubleshooting.md) - common issues and solutions
- [Execution Engine](../../core/execution-engine/overview.md) - core execution architecture
- [Local Adapter API](../../core/execution-engine/adapters/local-adapter.md) - API reference
