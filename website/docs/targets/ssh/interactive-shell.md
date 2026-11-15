---
title: Interactive SSH shells
description: Use the existing Xec SSHClient connection for pinned interactive PTYs with cancellation and bounded shell requests.
sidebar_position: 8
---

# Interactive SSH shells {#interactive-ssh-shells}

Import the existing SSH implementation directly when building an interactive terminal:

```typescript
import { SSHClient, sshHostFingerprint } from '@xec-sh/ssh';
```

This published 0.13.0 package owns the same client and pool used by Core's SSH adapter. See [the library guide](../../ssh/overview.md) for its public boundary.

## Pin the host before sending credentials {#pin-the-host-before-sending-credentials}

`SSHClient.probeHostKey({ host, port?, timeoutMs?, signal? })` observes a SHA256 host fingerprint without authenticating. The observed value is untrusted until compared with an independent source. `sshHostFingerprint(rawPublicKey)` computes the same OpenSSH-format fingerprint from a binary public key; an authorized key text line must first be decoded from base64.

Supply a previously verified fingerprint to `connect`:

```typescript
import { SSHClient } from '@xec-sh/ssh';

const privateKey = process.env.SSH_PRIVATE_KEY;
const fingerprint = process.env.SSH_HOST_FINGERPRINT;
if (!privateKey || !fingerprint) throw new Error('Provide a private key and independently verified fingerprint');
const ssh = new SSHClient();
try {
  await ssh.connect({
    host: 'edge-1.example.com',
    username: 'operator',
    privateKey,
    expectedHostFingerprint: fingerprint,
    readyTimeout: 20_000,
    signal: AbortSignal.timeout(20_000),
  });
  const shell = await ssh.requestShell(
    { term: 'xterm-256color', cols: 100, rows: 30 },
    { timeoutMs: 15_000 },
  );
  shell.on('data', (bytes: Buffer) => process.stdout.write(bytes));
  shell.stderr.on('data', (bytes: Buffer) => process.stderr.write(bytes));
  shell.setWindow(40, 120, 0, 0); // rows, columns, pixel height, pixel width
  shell.write("printf 'connected\\n'\n");
  await new Promise<void>((resolve, reject) => {
    shell.once('close', () => resolve());
    shell.once('error', reject);
    shell.end('exit\n');
  });
} finally {
  ssh.dispose(true);
}
```

Require both configuration values before using this example. Without a pin, the client defaults to strict known-host verification. Do not assign the result of `probeHostKey()` directly to a trusted pin without independent verification.

A mismatched pin fails before authentication with `EHOSTKEY`. `expectedHostFingerprint` cannot be combined with a custom `hostVerifier`; it hashes the raw key. The legacy `hostHash` option is rejected. Existing adapter users can retain `hostKeyChecking` and `knownHostsPath`: trust policy participates in the pool key and is preserved on reconnect.

## Lifecycle and byte handling {#lifecycle-and-byte-handling}

`connect` accepts an abort signal for connection setup. `requestShell` accepts its own `{ timeoutMs, signal }`; its default timeout is 15 seconds. A timeout, abort or closed connection rejects the request, removes its listeners and destroys a channel that arrives late. These options bound setup; the caller owns the lifetime of an already established shell.

`dispose()` requests graceful disconnect and has a one-second fallback. `dispose(true)` immediately destroys the connection. Always dispose when the owner leaves or loses authorization. Interactive commands must not be automatically replayed after connection failure.

Keep terminal output as bytes until it reaches a streaming decoder or terminal emulator. Use the channel's backpressure when accepting input. Applications exposing this API remotely must also implement authorization, host trust storage, per-owner session limits, output limits, disconnect timeouts and audit. Omnitron's terminal service is one such consumer; these control-plane concerns do not belong in Xec's transport implementation.
