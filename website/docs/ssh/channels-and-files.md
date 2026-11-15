---
title: Channels and files
description: Use typed PTYs, SFTP streams and forwarding with explicit ownership and bounded cleanup.
---

# Channels and files {#channels-and-files}

Commands, interactive terminals, file transfers and forwarding share one SSH
connection implementation. Keep the resource's lifetime inside the callback that
owns it, or explicitly dispose the returned handle.

## Interactive channels {#interactive-channels}

`withShell` owns a PTY for the callback's lifetime. Wait for the remote channel to
close before returning. The request timeout bounds opening; the application
separately bounds its use of the returned channel:

```typescript
import { once } from 'node:events';
import { SSHClient } from '@xec-sh/ssh';

async function terminalProbe(ssh: SSHClient): Promise<void> {
  const signal = AbortSignal.timeout(10_000);
  await ssh.withShell(async channel => {
    channel.setWindow(40, 120, 0, 0);
    const closed = once(channel, 'close', { signal });
    channel.end('exit\n');
    await closed;
  }, { term: 'xterm-256color' }, { timeoutMs: 5_000, signal });
}
```

Use `requestShell` when another owner needs the channel beyond a callback.
The channel is a typed duplex stream with stdout, stderr, resize and signal
operations. Sending a signal requests remote action; it does not prove delivery
or termination. Attach error and terminal listeners before writing. A request signal stops
opening; after handoff, the channel owner must handle its ongoing lifetime. In
the example, the same signal bounds waiting for closure, and `withShell` destroys
the channel when the callback settles.

For a terminal application's complete connection and pinned-key example, see
[interactive SSH](../targets/ssh/interactive-shell.md).

## SFTP streams {#sftp-streams}

Use Node stream composition so read errors, write errors and backpressure reach
the same owner:

```typescript
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { SSHClient } from '@xec-sh/ssh';

async function download(ssh: SSHClient, destination: string): Promise<void> {
  await ssh.withSFTP(async sftp => {
    await pipeline(
      sftp.createReadStream('/srv/export/data.csv'),
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    );
  }, {
    signal: AbortSignal.timeout(60_000),
    operationTimeoutMs: 15_000,
    maxPendingRequests: 32,
  });
}
```

The deadline bounds total time; the SFTP inactivity limit bounds stalled
requests. Normal downstream backpressure does not count as a network stall.
An interrupted download can leave a partial local file. For publication, write
an application-owned temporary file, verify it, and then perform the
application's intended commit operation.

`requestSFTP` exposes the typed callback/stream interface when callback ownership
is inconvenient. The caller must end or destroy that subsystem. Session closure
settles pending operations; late callbacks cannot resurrect ownership.

For small files, `sftp.readFile(path, options, callback)` collects up to 64 MiB
by default. Its `maxBytes` option accepts integers from 0 to 1 GiB and is checked
before opening the file; a limit breach fails the read and closes the owned
handle. The limit applies to bytes received, not the server's claimed file size.
Use streams for larger files. Transfer worker counts and chunk sizes are bounded;
a failed handle operation is not silently retried against the path.

## Convenience transfers {#convenience-transfers}

```typescript
import { SSHClient } from '@xec-sh/ssh';

async function transferAssets(ssh: SSHClient): Promise<void> {
  await ssh.putFile('./dist/app.js', '/srv/assets/app.js');
  await ssh.getFile('./downloaded.log', '/srv/log/app.log');
  await ssh.putFiles([
    { local: './dist/index.html', remote: '/srv/assets/index.html' },
    { local: './dist/app.css', remote: '/srv/assets/app.css' },
  ], { concurrency: 2 });
}
```

Both `putFile` and `getFile` take the **local path first**. To control an
individual transfer's deadline or SFTP admission limits, call it inside
`withSFTP` and pass that subsystem as its third argument. The fourth argument
contains transfer options, not the subsystem lifecycle options. Transfers do not
provide deployment transactions, content verification or rollback. A successful
write acknowledgement is not a durability guarantee for the remote filesystem.
Use the supported SFTP fsync extension when the server and application require
it, and inspect its actual result.

Directory transfer methods preserve empty directories, do not traverse symlinks
or special files, and reject unsafe remote entry names before joining paths.
Traversal defaults to a maximum depth of 64 and 10,000 entries, counting filtered
entries too; configure these through the directory options. Downloads stage each
file privately before replacement, reject existing symlink destinations and
check observed directory identities. The destination must be owned exclusively
by the caller during the operation. Portable filesystem APIs do not make this
safe against arbitrary concurrent ancestor replacement by another local writer;
the whole directory is not an atomic transaction.
`mkdir` uses SFTP; it does not construct a shell command as a fallback.

## Forwarding {#forwarding}

| API | Ownership |
| --- | --- |
| `forwardOut` | An outgoing TCP channel, owned by its caller |
| `forwardOutStreamLocal` | An outgoing Unix-socket channel |
| `forwardIn` / `forwardInStreamLocal` | An acknowledged remote listener with `dispose()` and `closed` |
| `SSHConnectionPool.tunnel` | A local listener and its connection lease |
| `SSHConnectionPool.reverseTunnel` | A dedicated connection and remote-listener ownership |

Prefer [Core's target-bound tunnelling API](../targets/ssh/tunneling.md) for
command automation. A pool's direct forwarding methods require an explicit
connection configuration.

Remote listener requests have no application request ID in the SSH response
FIFO. Losing an allocation acknowledgement invalidates that connection and
reports an unknown outcome; it must not silently issue a second allocation.
Closing a remote listener waits for unbind acknowledgement. A refused or timed-out
unbind retains ownership for reconciliation or a deliberate retry.

## See also {#see-also}

- [Connections and failures](./connections.md)
- [Trust and cryptography](./security.md)
- [File operations in Core](../core/execution-engine/features/file-operations.md)
