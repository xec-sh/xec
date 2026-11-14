# @xec-sh/core

A TypeScript execution engine for local processes, SSH hosts, Docker containers, and Kubernetes pods.

```sh
npm install @xec-sh/core
```

## Execute

```typescript
import { $ } from '@xec-sh/core';

try {
  const ref = 'main';
  const revision = await $`git rev-parse ${ref}`.text();
  const result = await $.exec(process.execPath, {
    args: ['--version'],
    shell: false,
  });
  console.log(revision, result.stdout);
} finally {
  await $.dispose();
}
```

Interpolated values are quoted for the target shell. Use `.exec(executable, { args, shell: false })` for explicit argument boundaries, and `$.raw` only for intentional shell syntax.

## Select a target

```typescript
const host = $.ssh({ host: 'staging.example.com', username: 'deploy' });
const container = $.docker('app');
const pod = $.k8s('staging/api');

await host`uptime`;
await container.cd('/app')`node --version`;
await pod.env({ LOG_LEVEL: 'debug' })`node healthcheck.js`;
```

Target contexts provide transfers, SFTP, tunnels, shell sessions, container operations, and pod operations where applicable. SSH host verification and connection management remain inside Xec.

## Results and lifetime

- `await command` returns an `ExecutionResult`; nonzero exits throw unless `.nothrow()` is selected.
- Results expose `stdout`, `stderr`, `stdall`, `exitCode`, `signal`, `ok`, and `cause`. A confirmed local cancellation also carries `aborted`.
- `.text()`, `.json<T>()`, and `.lines()` return parsed output. Use `(await command).buffer()` for exact captured bytes.
- `for await (const line of command)` streams output with backpressure. Breaking the loop waits for owned process cleanup.
- `.timeout(...)`, `.signal(...)`, and `within({ signal }, callback)` bound execution. `parallel` bounds concurrent work; `withoutCancellation` provides an explicit cleanup scope.
- Output limits fail visibly. Diagnostic masking applies to command echoes, events, and errors; exact API payload capture is available through `redactOutput: false`.

Cancellation of a remote request does not by itself prove that a remote effect was reversed. Preserve and inspect an unknown outcome before retrying an operation with side effects.

## Requirements

Node.js 20 or later; Core also has Bun and Deno runtime checks. Shell syntax depends on the target OS. Docker and Kubernetes use the installed `docker` and `kubectl` CLIs. SSH loads its bundled `ssh2` dependency when first needed.

[API reference](https://xec.sh/docs/api/execution-engine) · [Examples](examples) · [MIT license](../../LICENSE)
