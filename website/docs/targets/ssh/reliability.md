---
title: SSH reliability and ownership
description: Xec owns connection policy, bounded operations and unambiguous failure reporting.
sidebar_position: 8
---

# SSH reliability and ownership {#ssh-reliability-and-ownership}

Use `@xec-sh/core` for target-oriented operations and `@xec-sh/ssh` when an application needs interactive channels or the complete SFTP client. Public types, authentication adapters and operation lifecycles belong to Xec. Applications import the owned SSH package and its contracts; its private protocol derives from ssh2. No system SSH executable or separate transport types are required. This page describes the developing 0.13.0 API.

## Commands and uncertain outcomes {#commands-and-uncertain-outcomes}

A successful command requires an exit status or signal and completed channel delivery. A channel that closes without either fails with `EXECUTION_OUTCOME_UNKNOWN`, `kind: 'outcome-unknown'`, and `recoverable: false`. The same applies when the connection or acknowledgement is lost after command dispatch. Neither the adapter nor `.retry()` replays that operation. This avoids executing a deployment or database change twice merely because its reply was lost.

Connection establishment can retry before dispatch. An explicit channel-open refusal can be retried within a bounded budget because the command has not started. Once execution might have begun, recovery requires inspecting its effects or using an application-level operation ID and durable receipt.

`SSHClient.exec` bounds retained output to 10 MiB per stream by default. Configure `maxBuffer`, or use `collectStdout: false` / `collectStderr: false` with streaming consumers. UTF-8 output is decoded after packet assembly; `Buffer` input retains its bytes. `AbortSignal` cancels both queued and running work. It does not certify that a remote process or its descendants have terminated.

## Managed file transfers {#managed-file-transfers}

```typescript
import { $ } from '@xec-sh/core';

const remote = $.ssh({ host: 'storage.example.com', username: 'deploy', hostKeyChecking: 'strict' });
const controller = new AbortController();
await remote.downloadDirectory('/srv/assets', './assets', {
  signal: controller.signal,
  timeoutMs: 15_000,
  operationTimeoutMs: 30_000,
  maxPendingRequests: 64,
  concurrency: 4,
  validate: path => !path.endsWith('.tmp'),
});
```

The same request options apply to `uploadFile`, `downloadFile` and `uploadDirectory`. `timeoutMs` bounds subsystem opening; `operationTimeoutMs` measures request inactivity. Transfer progress renews the inactivity deadline. Cancellation or a stalled request closes that SFTP subsystem and settles all its outstanding operations, without closing unrelated SSH channels. Streams respect consumer backpressure; an opened idle writer does not time out simply because the caller has not supplied more data.

Defaults are 15 seconds to open a subsystem, 30 seconds without request progress, and 256 outstanding requests/streams per subsystem. A file operation retains the pooled connection until cleanup; idle-pool eviction cannot interrupt it. A failed batch stops dispatching new work and drains already dispatched work before releasing its subsystem. High-level directory transfers reject on incomplete transfers instead of silently treating a partial copy as success.

Interrupted writes report an unknown outcome: bytes may already exist at the destination. Transfers are not atomic replacements, snapshots, resumable transactions, or automatic cross-server replication. Verify or remove partial destinations according to the application's policy before retrying. Hidden files and empty directories are included; symbolic links and special files are not copied. Downloaded directory names containing path separators are rejected. The caller must still choose a trusted local destination: these helpers are not a filesystem sandbox and do not protect a concurrently modified local directory from symlink substitution.

## Connections and reverse listeners {#connections-and-reverse-listeners}

`connectionPool.maxConnections` bounds ready connections **and handshakes in progress** (default 10). Commands, transfers and local tunnels acquire a lease before the connection can be evicted. At capacity, Xec can replace an idle connection; if all slots are busy, the new operation fails with `ENOBUFS`. Cancel or finish work, or explicitly increase the budget. Disabling reuse still tracks connections, applies the budget and closes them after their last operation. `dispose()` is terminal and cancels pending handshakes; create a new adapter for a new lifecycle.

Pool diagnostics count connections with active leases as active and unleased connections as idle. SSH protocol keepalives check liveness without running commands on the target. Expired idle connections and their per-target locking state are reclaimed; cleanup cannot detach an active lock queue.

A reverse tunnel owns a **dedicated connection**, using the same target, credentials, host verification and connection budget as other operations. This isolates uncertain global SSH requests from commands and transfers. `reverseTunnel({ remotePort: 0, localPort: 3000, timeoutMs: 15_000, signal })` waits for a server-confirmed port. `timeoutMs` bounds allocation acknowledgement after authentication; the connection's `readyTimeout` bounds authentication. Cancellation applies to connection establishment and allocation, not an already returned tunnel; close that tunnel explicitly.

`SSHClient.forwardIn(address, port, onConnection, request)` and `forwardInStreamLocal(path, onConnection, request)` use the same 15-second default acknowledgement deadline. An explicit server refusal leaves the low-level connection reusable. A timeout, disconnect or cancellation after dispatch reports `SSH_OUTCOME_UNKNOWN` (mapped to `EXECUTION_OUTCOME_UNKNOWN` by Core) and invalidates that connection, because the listener may already exist remotely and SSH global replies have no request IDs. A late reply cannot revive the listener. Low-level callers sharing a client must account for this connection-wide failure; use a dedicated client for reverse listeners.

A successful `close()` waits for unbind acknowledgement. If unbind is refused or times out, the handle remains owned and closure can be retried. `closed` also resolves when the transport disappears; that releases **local ownership**, not proof of immediate remote cleanup during a network partition. Do not blindly repeat an allocation with an unknown outcome.

## Interactive and advanced clients {#interactive-and-advanced-clients}

```typescript
import { SSHClient, type SFTPClient, type SSHChannel } from '@xec-sh/ssh';

const ssh = await new SSHClient().connect({
  host: 'storage.example.com', username: 'deploy',
  agent: process.env['SSH_AUTH_SOCK'], hostKeyChecking: 'strict',
});
try {
  ssh.connection?.once('close', () => console.error('SSH connection closed'));
  await ssh.withSFTP(async (sftp: SFTPClient) => {
    await new Promise<void>((resolve, reject) => sftp.stat('/srv/assets', error => error ? reject(error) : resolve()));
  }, { operationTimeoutMs: 10_000 });
  await ssh.withShell(async (channel: SSHChannel) => {
    channel.setWindow(40, 120, 0, 0);
    await new Promise<void>((resolve, reject) => {
      channel.once('close', () => resolve()); channel.once('error', reject);
      channel.end('exit\n');
    });
  }, { term: 'xterm-256color' });
} finally { ssh.dispose(); }
```

The client provides shell, exec, subsystem, TCP and Unix-socket forwarding, reverse forwarding, SFTP streams/handles/metadata/extensions, keyboard-interactive authentication, host-key pins, and custom agents. Import `SSHAgent` to implement a hardware-backed or application-controlled signer; Xec adapts it to its transport. `connection` exposes lifecycle events only. Replace direct transport calls with `requestSubsystem`, `setNoDelay`, `denyNewSessions`, `requestSFTP`, forwarding or command methods. Dispose an existing client before connecting it to another host. Direct `SSHAdapter.tunnel` and `reverseTunnel` calls require an explicit target argument; use `$.ssh(target).tunnel(...)` for automatic target binding. Executing a command beforehand no longer selects a forwarding destination.

Use `stat` to distinguish a missing file from a connection error. The compatibility `exists` callback also provides an optional error as its second argument. A negative boolean alone cannot establish that a file is absent.

## One connection contract {#one-connection-contract}

`$.ssh(...)`, `SSHAdapter` targets and `SSHClient.connect(...)` share Xec's `SSHConnectionConfig`. Agent sockets and plain `SSHAgent` objects, keyboard-interactive handlers, explicit host fingerprints, algorithms and handshake cancellation do not require transport-library imports. Adapter defaults provide a common policy; defined target options override it.

```typescript
import { $ } from '@xec-sh/core';

const agent = process.env.SSH_AUTH_SOCK;
if (!agent) throw new Error('An SSH agent socket is required');

const host = $.ssh({
  host: 'build.example.net',
  username: 'builder',
  agent,
  expectedHostFingerprint: 'SHA256:replace-with-an-independently-verified-pin',
  readyTimeout: 10_000,
});
await host`uname -s`;
```

Pool identities cover the effective connection policy, including agent/callback identity and algorithm constraints. Key files are read before acquisition, so rotated key bytes cannot borrow the previous connection. Supplied sockets stay exclusive. A cancelled borrow cannot acquire an existing authenticated socket. Command timeouts cancel their channel; repeated failures retire a connection after its remaining users finish. Current host trust is revalidated before each reuse; revoking an agent or authority does not retroactively stop active operations. Dispose those sessions according to application policy.

## Owned transport and release artifacts {#transport-patches-and-release-artifacts}

The protocol and low-level lifecycle belong to @xec-sh/ssh. Core delegates to
that package; root-only dependency patches, transport bundling and special
prepack copies are removed. See [the comparison](../../ssh/comparison.md) for
source provenance, specific fixes and intentional compatibility changes.

The SSH release gate installs the exact Core and SSH archives accepted for
publication and checks their public API, strict declarations and hostile-peer
behavior. In a development checkout, the same command can pack the existing
builds once. Release preparation supplies its already packed files; acceptance
does not rebuild or repack them. Synthetic network checks use loopback and
external deadlines, without Docker or working application credentials.

## Verification and limits {#verification-and-limits}

Native protocol tests exercise cryptography, keys, agent framing, rekeying,
channel credit and SFTP acknowledgements. Lifecycle tests cover missing
callbacks, cancellation, lost replies, bounded queues and filesystem paths.
OpenSSH interoperability fixtures are a separate suite; an unavailable required
fixture is a setup failure, not a passing test.

These are scenario-specific checks, not a claim that all possible protocol
defects are eliminated. Publication and fleet activation have separate evidence
and authorization boundaries.

## See also {#see-also}

- [SSH library](../../ssh/overview.md)
- [Trust and cryptography](../../ssh/security.md)
- [Comparison with ssh2](../../ssh/comparison.md)
