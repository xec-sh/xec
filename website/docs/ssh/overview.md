---
title: SSH library
description: Use @xec-sh/ssh for typed connections, channels, SFTP and forwarding, independently of Xec command execution.
---

# SSH library {#ssh-library}

`@xec-sh/ssh` is the connection and protocol layer used by Xec Core. Use it when
building a terminal, file manager, transfer service or another application that
needs to own SSH channels directly. Use [SSH targets](../targets/ssh/overview.md)
for command automation: Core adds argument escaping, working directories,
environment variables, sudo policy and common execution results.

**Availability:** `@xec-sh/ssh` is published from Xec 0.13.0. Pin that version or
later when using this guide. Xec 0.12.0 does not contain the SSH package.

## Start with one connection {#start-with-one-connection}

The following example uses an agent whose socket is already configured. Provision
an independently verified server key in `~/.ssh/known_hosts` first.

```typescript
import { SSHClient } from '@xec-sh/ssh';

const agent = process.env.SSH_AUTH_SOCK;
if (!agent) throw new Error('An SSH agent socket is required');

const ssh = await new SSHClient().connect({
  host: 'build.example.net',
  username: 'builder',
  agent,
  hostKeyChecking: 'strict',
  readyTimeout: 10_000,
});

try {
  const result = await ssh.exec('uname -s', {
    signal: AbortSignal.timeout(10_000),
    maxBuffer: 64 * 1024,
  });
  if (result.code !== 0) throw new Error('The remote command did not exit successfully');
  process.stdout.write(result.stdout);
} finally {
  ssh.dispose();
}
```

`exec` accepts a complete command string interpreted by the remote server. It
does not escape arbitrary text inserted into that string. Prefer Core's tagged
templates for dynamic arguments. Returned output preserves whitespace. A remote
nonzero exit is a result; loss of the completion acknowledgement rejects with
an explicit unknown-outcome error.

## Choose the owning API {#choose-the-owning-api}

| Need | Public entry point |
| --- | --- |
| Run commands with quoted arguments and common results | `$` from `@xec-sh/core` |
| Own a connection and its channels | `SSHClient` from `@xec-sh/ssh` |
| Share authenticated connections with bounded capacity | `SSHConnectionPool` |
| Check keys without connecting | `SSHKeyValidator` |
| Inspect or maintain explicit host trust | `KnownHostsVerifier` and `sshHostFingerprint` |
| Implement application-controlled signing | `SSHAgent` |
| Orchestrate deployment and recoverable workflows | `@xec-sh/ops` |

The package owns authentication, host trust, multiplexing, channel limits, SFTP,
forwarding and transport cleanup. Core consumes this implementation rather than
keeping a second pool or protocol wrapper. Protocol internals have no public
package export.

## Runtime contract {#runtime-contract}

The Node.js floor is 20.19.0. The implementation uses ESM and standard
`node:crypto`, `node:net`, `node:fs` and `node:stream` APIs. It contains no C++
addon, NAN dependency, WASM crypto or install-time compilation.

Bun and Deno use their Node compatibility APIs and require interoperability
qualification for the release being consumed. Algorithm availability is detected from actual runtime capabilities, not inferred
from a version number. A missing capability removes that algorithm from
negotiation; it does not select a weaker substitute.

This is a client library. It does not expose an SSH server, reproduce OpenSSH's
configuration-file interpreter, or implement a browser SSH transport. Private
implementation tests are not certification of every operating system or server.

## See also {#see-also}

- [Connections and failures](./connections.md)
- [Channels and files](./channels-and-files.md)
- [Trust and cryptography](./security.md)
- [Comparison and migration from ssh2](./comparison.md)
