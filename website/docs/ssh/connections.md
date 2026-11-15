---
title: Connections and failures
description: Own SSH connection leases, cancellation and remote outcomes without replaying uncertain operations.
---

# Connections and failures {#connections-and-failures}

A successful connection establishes an authenticated transport. It does not make
later commands transactional. Distinguish connection failure, explicit remote
failure and a response that was never received.

## Connection ownership {#connection-ownership}

Each `SSHClient` owns one transport. Concurrent `connect` calls and replacing a
live connection are rejected. Call `dispose()` when finished; it starts graceful
local closure with bounded forced cleanup. Disposal is not proof that a remote
process stopped.

Use a pool when independent operations should reuse authenticated connections:

```typescript
import { SSHConnectionPool } from '@xec-sh/ssh';

const agent = process.env.SSH_AUTH_SOCK;
if (!agent) throw new Error('An SSH agent socket is required');

const pool = new SSHConnectionPool({ maxConnections: 4 });
try {
  const lease = await pool.acquire({
    host: 'build.example.net',
    username: 'builder',
    agent,
    hostKeyChecking: 'strict',
  }, { signal: AbortSignal.timeout(10_000) });
  try {
    const result = await lease.client.exec('uname -s');
    if (result.code !== 0) throw new Error('Remote inspection failed');
    process.stdout.write(result.stdout);
  } catch (error) {
    lease.markFailed();
    throw error;
  } finally {
    lease.release();
  }
} finally {
  await pool.dispose();
}
```

A lease has an idempotent `release()`: calling it twice cannot release another
borrower's ownership. Capacity includes connections being established. Retirement
waits for active borrowers; idle cleanup does not interrupt their work. When
all capacity is active or reserved and no matching connection can be reused,
`acquire` rejects with `ENOBUFS`; it does not evict active leases or wait in an
unbounded global queue. Explicit `pool.dispose()` ends the pool's remaining
connections and tunnels, so join active operations before disposing it.

Pool identity covers authentication and trust policy, including callback identity,
algorithms and private-key bytes. Rotating a key file therefore cannot borrow a
connection authenticated with its old contents. Supplied sockets are exclusive.
Before a cached connection is lent again, the pool rechecks the current host
trust policy. Existing active operations are not retroactively revoked.

## Deadlines and cancellation {#deadlines-and-cancellation}

| Boundary | Control | Meaning |
| --- | --- | --- |
| Connection and host verification | `readyTimeout`, connection `signal` | Bound establishment and waiting for a verifier |
| Queued or running command | `exec(..., { signal })` | Cancel admission or the owned channel |
| Command request acknowledgement | `channelOpenTimeoutMs` | Bound the server's acceptance of the request |
| Shell, subsystem or forwarding request | `timeoutMs`, `signal` | Bound opening and settle late replies safely |
| SFTP activity | `operationTimeoutMs` | Bound inactivity; progress renews the deadline |
| SFTP admission | `maxPendingRequests` | Bound outstanding requests and streams |

An acknowledgement deadline is not a command-duration timeout. Use an
`AbortSignal` with the desired command deadline. Cancellation before command
dispatch reports `ABORT_ERR`. After dispatch, losing completion evidence reports
`SSHOutcomeUnknownError`. Closing the local channel cannot establish that a
remote write or process was undone.

## Handle outcomes explicitly {#handle-outcomes-explicitly}

```typescript
import { SSHClient, SSHOutcomeUnknownError, SSHOutputLimitError } from '@xec-sh/ssh';

async function inspectHost(ssh: SSHClient): Promise<string> {
  try {
    const result = await ssh.exec('uname -s', {
      signal: AbortSignal.timeout(10_000),
      maxBuffer: 64 * 1024,
    });
    if (result.code !== 0) throw new Error('Remote inspection failed');
    return result.stdout;
  } catch (error) {
    if (error instanceof SSHOutcomeUnknownError || error instanceof SSHOutputLimitError) {
      // Reconcile the operation with its application before deciding to retry.
      console.error('Remote completion is unconfirmed', { code: error.code });
    }
    throw error;
  }
}
```

`SSHError.code` is machine-readable. `SSHOutcomeUnknownError` carries
`outcome: 'unknown'` and preserves its cause. `SSHOutputLimitError` also carries
an unknown outcome, the stream and byte limit, and bounded partial stdout/stderr.
Treat partial output as application data: it may contain secrets and does not
belong in unrestricted diagnostics.

The pool can retry connection-establishment `ECONNRESET` and `EPIPE` failures.
Its default is three additional attempts with a one-second delay; use
`autoReconnect`, `maxReconnectAttempts` and `reconnectDelay` to configure them.
It never replays a dispatched command. Authentication rejection, host-key rejection and
cancellation are not transient authority failures to retry automatically.

## Resource limits {#resource-limits}

By default a client admits eight concurrent command channels and at most 256
waiting requests. These command admission limits are fixed in this version;
other channel kinds also consume the server's session capacity. Command output
retention defaults to 10 MiB per stream. The request-opening deadline defaults
to 15 seconds; SFTP inactivity defaults to 30 seconds, with at most 256 pending
requests and streams per subsystem.
Use streaming with retention disabled for large output, and keep downstream
backpressure intact.

Pool defaults are ten connections, five minutes of idle lifetime and one hour of
maximum lifetime. These are admission and reuse policies, not remote process
deadlines. Zero lifetime disables that specific expiration; it does not disable
capacity limits.

## See also {#see-also}

- [Trust and cryptography](./security.md)
- [Channels and files](./channels-and-files.md)
- [Core error handling](../core/execution-engine/features/error-handling.md)
- [SSH target reliability](../targets/ssh/reliability.md)
