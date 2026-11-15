---
title: SSH Authentication
description: Configure keys, agents, passwords and strict host trust through the shared Xec SSH connection contract.
keywords: [ssh, authentication, keys, passwords, security]
sidebar_position: 2
---

# SSH Authentication {#ssh-authentication}

## Overview {#overview}

Xec's developing 0.13.0 API uses one `SSHConnectionConfig` from `@xec-sh/ssh`.
Core accepts that connection policy in `$.ssh(...)`. Authentication can use
private-key content or a path, a password, an agent, or a keyboard-interactive
handler. Host authentication is a separate requirement and defaults to strict
known-host verification.

## Private Key Authentication {#private-key-authentication}

`privateKey` contains the key, while `privateKeyPath` names a file. Supply one
of those fields, not both. Filesystem APIs do not expand `~`; build an absolute
home-relative path:

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';
import { $ } from '@xec-sh/core';

try {
  await $.ssh({
    host: 'build.example.net',
    username: 'builder',
    privateKeyPath: join(homedir(), '.ssh', 'id_ed25519'),
    passphrase: process.env.SSH_KEY_PASSPHRASE,
    hostKeyChecking: 'strict',
  })`uname -s`;
} finally {
  await $.dispose();
}
```

OpenSSH and native PEM key formats are decoded with the same policy used by
authentication. The supported algorithms and size/work limits are documented in
[trust and cryptography](../../ssh/security.md#keys-and-signing). PuTTY PPK and
legacy DSA keys are rejected.

### Validating a Key Before Use {#validating-a-key-before-use}

Use the SSH package when a settings form or provisioning tool needs a check
before connecting. Validation does not authenticate a host or authorize use of
a key.

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SSHKeyValidator } from '@xec-sh/ssh';

const keyPath = join(homedir(), '.ssh', 'id_ed25519');
const result = await SSHKeyValidator.validateKeyFile(keyPath);
if (!result.isValid) throw new Error(result.issues.join('; '));

const access = await SSHKeyValidator.checkKeyFilePermissions(keyPath);
if (!access.isSecure) throw new Error(access.issues.join('; '));
```

`validatePrivateKey` and `validatePublicKey` are asynchronous and decode real
key material. `validateSSHOptions` checks connection inputs and the presence of
an explicit authentication method. Authentication parses a key once; the pool
does not separately parse it again before handing it to the transport.

Permission checking is independent of cryptographic validation. POSIX checks
reject group/other access and require an owner-readable regular file. Windows
ACL protection needs a platform-appropriate check and is reported as unsupported
by the POSIX helper.

## Password Authentication {#password-authentication}

Require the credential before constructing the target, and keep it out of
command arguments and diagnostics:

```typescript
import { $ } from '@xec-sh/core';

const password = process.env.SSH_PASSWORD;
if (!password) throw new Error('Provide SSH_PASSWORD through the credential provider');
try {
  await $.ssh({
    host: 'build.example.net',
    username: 'builder',
    password,
    hostKeyChecking: 'strict',
  })`uname -s`;
} finally {
  await $.dispose();
}
```

For an agent, supply its socket path or a typed `SSHAgent` implementation.
Forwarding an agent grants the remote side access to its signing capability;
enable `agentForward` only for an intended target. `authHandler` controls an
explicit authentication sequence; `tryKeyboard` and `onKeyboardInteractive`
handle interactive challenges.

## Host Key Verification {#host-key-verification}

| Configuration | Effect |
| --- | --- |
| `hostKeyChecking: 'strict'` | Default: refuse an unknown, changed or revoked key |
| `hostKeyChecking: 'accept-new'` | Explicitly record an unknown key; refuse changes and revocation |
| `hostKeyChecking: 'off'` | Explicitly disable host authentication |
| `expectedHostFingerprint` | Require an independently verified SHA256 fingerprint |
| `hostVerifier` | Apply an application-supplied raw-key boolean/Promise verifier |

Set `knownHostsPath` for an explicit trust file; otherwise the client uses
`~/.ssh/known_hosts`. Do not combine a pin and a custom verifier. The legacy
`hostHash` option is rejected. Algorithm constraints are supported but cannot
enable algorithms that the runtime or package policy does not support.

An authentication or host-key rejection is not automatically retried. A fresh
key observed through `probeHostKey` is still untrusted until independently
verified. For first-use write recovery and revocation behavior, see
[host trust](../../ssh/security.md#host-trust).

## Security Best Practices {#security-best-practices}

Provision host trust before production connections. Keep private keys and
passwords in an appropriate credential provider. Prefer an agent or key with
the minimum required authority. Avoid forwarding an agent when the remote
operation can use a dedicated credential.

Key rotation changes the pool's authentication identity. Host trust is rechecked
before a cached connection is lent again, but active sessions are not remotely
revoked by a file edit. Retire those sessions according to the application's
authorization policy.

SSH login and sudo are distinct boundaries: sudo credential delivery is described
in [sudo security](./sudo-security.md).

## Related Documentation {#related-documentation}

- [SSH library](../../ssh/overview.md)
- [Connection configuration](./connection-config.md)
- [Interactive shells and host pins](./interactive-shell.md)
- [Trust and cryptography](../../ssh/security.md)
