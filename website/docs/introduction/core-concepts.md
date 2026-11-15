---
title: Core Concepts
description: Understand commands, targets, outcomes and orchestration boundaries
keywords: [concepts, execution, adapters, targets, template literals]
---

# Core Concepts {#core-concepts}

Four concepts connect Xec's layers: an execution context chooses a target, a
command describes work, a result describes its observed outcome, and a workflow
decides what to do next.

## Execution contexts and commands {#execution-engine}

`$` from `@xec-sh/core` is the default execution context. Calling it as a tagged
template returns a `ProcessPromise`; awaiting it runs the command and produces
an execution result.

```typescript
import { $ } from '@xec-sh/core';

const file = 'report with spaces.txt';
const pending = $`git status --short -- ${file}`.timeout(5_000);
const result = await pending;
console.log(result.stdout, result.exitCode);
```

Interpolated values are escaped for the selected shell. Keep the literal command
trusted. Escaping cannot authorize an operation, validate a path or stop a value
from becoming a target program's option; use the program's `--` delimiter where
appropriate.

Methods such as `.cd()`, `.env()` and `.timeout()` configure execution. They do
not install tools or copy files to a remote machine.

## Targets and adapters {#targets}

An adapter implements execution for one environment:

| Target | Where the command runs | Prerequisites |
| --- | --- | --- |
| Local | The CLI/application host | Executable and suitable local permissions |
| SSH | A remote host | Connection, credentials and host-key verification |
| Docker | Inside an existing or explicitly requested ephemeral container | Docker daemon/CLI and container or image |
| Kubernetes | Inside a pod | `kubectl`, cluster context and pod permissions |

```typescript
import { $ } from '@xec-sh/core';

const server = $.ssh({ host: 'build.example.com', username: 'deploy' });
try {
  console.log(await server`node --version`.text());
} finally {
  await $.dispose();
}
```

SSH uses `username` in the programmatic API. YAML host definitions use `user`.
A Docker container name is not a Docker host, and a Kubernetes pod name is not a
cluster context. Commands and filesystem paths belong to the selected target.

## Project configuration {#configuration-system}

Configuration gives targets and tasks stable project names:

```yaml
version: "1.0"
name: example

targets:
  hosts:
    build:
      host: build.example.com
      user: deploy
      hostKeyChecking: strict

tasks:
  runtime-version:
    description: Inspect Node.js on the build host
    target: hosts.build
    command: node --version

profiles:
  staging:
    targets:
      hosts:
        build:
          host: staging-build.example.com
```

Run `xec run runtime-version`, or select the profile with
`XEC_PROFILE=staging xec run runtime-version` in a POSIX shell. Profiles merge
configuration; they are not separate permission scopes.

Execution defaults belong under `targets.defaults`, not a top-level `defaults`
key. Use the [configuration reference](../configuration/config-file.md) for
precedence and the [task reference](../configuration/tasks/overview.md) for
published executor limitations.

## Results and errors {#error-handling}

A successful command provides `stdout`, `stderr`, `exitCode` and `ok`. Commands
normally reject on failure. To inspect an expected nonzero command exit:

```typescript
import { $ } from '@xec-sh/core';

const result = await $`node -e "process.exit(3)"`.nothrow();
console.log({ ok: result.ok, exitCode: result.exitCode });
```

`.text()` returns trimmed stdout; `.json()` parses stdout as JSON. Use the full
result when whitespace or separate stderr matters.

A local timeout or closed network connection does not establish whether a
remote effect completed. Treat that uncertainty separately from a known command
failure. Retrying a read-only observation and retrying a database migration are
different policies.

The task API also reports an explicit success value:

```typescript
import { tasks } from '@xec-sh/ops';

const result = await tasks.run('check');
if (!result.success) {
  throw result.error ?? new Error('Project check failed');
}
```

Here `check` must be defined by the project. Awaiting `tasks.run()` alone does
not assert success: execution failures can be returned in the result.

## Sequences, streams and concurrency {#parallel-execution}

Separate `await` expressions establish order:

```typescript
import { $ } from '@xec-sh/core';

await $`npm run build`;
await $`npm test`;
```

A pipe connects output to another command's input; it is not a dependency edge
for unrelated build commands. Use bounded concurrency for independent work:

```typescript
import { $ } from '@xec-sh/core';

const results = await $.parallel.all([
  $`node --version`,
  $`git --version`,
], { maxConcurrency: 2 });
console.log(results.map(result => result.stdout.trim()));
```

For streaming, output limits and backpressure, use the
[execution-engine guide](../core/execution-engine/overview.md). Streaming output
does not imply that every buffering limit is disabled.

## Resource ownership {#connection-pooling}

Reuse a configured engine during the operation it owns. Close its connections
and resources in `finally` when the operation ends. Do not dispose a shared
engine from a helper while unrelated callers are still using it.

Cancellation needs to unwind the operation's own cleanup. Preserve a failure or
unknown outcome when cleanup cannot be confirmed; a cancelled client is not
proof that a remote command stopped.

## Choose the workflow layer {#architecture-overview}

- **Core** embeds command execution in an existing application.
- **Scripts** express data flow, validation and cleanup with TypeScript.
- **YAML tasks** name straightforward project commands and ordered/parallel steps.
- **Dynamic commands** expose a project CLI with arguments, options and help.
- **Ops pipelines/workflows/releases** own their respective orchestration contracts.
- **Kit** supplies the shared terminal interface.

The CLI's injected globals are conveniences for Xec-run scripts. They are not
ambient globals in a program that merely imports Core. YAML task interpolation
is also distinct from tagged-template argument escaping.

## See also {#see-also}

- [Architecture](./architecture.md): implementation and package responsibilities.
- [When to use Xec](./when-to-use.md): choosing an entry point.
- [Portable scripts](./portable-scripts.md): runtime and shell boundaries.
- [Tasks](../configuration/tasks/overview.md): supported behavior in 0.12.0.
