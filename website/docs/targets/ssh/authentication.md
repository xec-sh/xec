---
title: SSH Authentication
description: SSH password and private-key authentication, key validation, and host verification
keywords: [ssh, authentication, keys, passwords, security]
sidebar_position: 2
---

# SSH Authentication {#ssh-authentication}

## Overview {#overview}

Xec exposes SSH authentication through its own `SSHConnectionConfig` contract. It supports private-key content or paths, passwords, agent authentication, agent forwarding, custom authentication order and keyboard-interactive callbacks. Applications import the client and types from `@xec-sh/core`.

```typescript
import { $ } from '@xec-sh/core';
import { readFile } from 'node:fs/promises';

// Password
await $.ssh({ host: 'example.com', username: 'deploy', password: process.env['SSH_PASSWORD'] })`ls`;

// Private key — content as a string, not a path
await $.ssh({
  host: 'example.com',
  username: 'deploy',
  privateKey: await readFile('/home/user/.ssh/id_ed25519', 'utf8'),
})`ls`;
```

## Private Key Authentication {#private-key-authentication}

`privateKey` accepts key contents as a string or Buffer. `privateKeyPath` reads a file. Use `path.join(os.homedir(), ...)` for home-relative paths passed to Node filesystem APIs.

```typescript
import { readFile } from 'node:fs/promises';

await $.ssh({
  host: 'example.com',
  username: 'deploy',
  privateKey: await readFile(path.join(os.homedir(), '.ssh/id_ed25519'), 'utf8'),
  passphrase: process.env['SSH_KEY_PASSPHRASE'], // only if the key is encrypted
})`command`;
```

Key format is whatever `ssh2` (the underlying client library) accepts — OpenSSH and PEM formats. There is no PuTTY (`.ppk`) conversion anywhere in the codebase.

### Validating a Key Before Use {#validating-a-key-before-use}

`SSHKeyValidator` (`packages/core/src/adapters/ssh/ssh-key-validator.ts`) is a set of static methods, not an instantiable client:

```typescript
import { readFile } from 'node:fs/promises';

import { SSHKeyValidator } from '@xec-sh/core';

const key = await readFile(path.join(os.homedir(), '.ssh/id_ed25519'), 'utf8');
const result = await SSHKeyValidator.validatePrivateKey(key);
// { isValid: boolean, keyType?: string, issues: string[] }

if (!result.isValid) {
  console.error('Invalid key:', result.issues.join(', '));
}

const perms = await SSHKeyValidator.checkKeyFilePermissions('/home/user/.ssh/id_ed25519');
// { isSecure: boolean, issues: string[] } — flags anything but mode 600/400
```

Also available: `validatePublicKey(key)`, `validateKeyFile(path, passphrase?)`, and `validateSSHOptions({ host, username, port, privateKey, password })`, which checks that exactly one of `privateKey`/`password` is set. The adapter runs `validatePrivateKey` and `validateSSHOptions` itself before every new connection and throws `ConnectionError` if they fail — calling them yourself is only useful to fail earlier, e.g. before prompting a user for a passphrase.

## Password Authentication {#password-authentication}

```typescript
await $.ssh({
  host: 'example.com',
  username: 'admin',
  password: process.env['SSH_PASSWORD'],
})`command`;
```

Set `hostKeyChecking` and `knownHostsPath` alongside the selected authentication method. Use an explicit `authHandler` when authentication must follow a particular sequence.

## Host Key Verification {#host-key-verification}

Every connection is verified against `known_hosts` (`packages/core/src/adapters/ssh/known-hosts.ts`); `ssh2` itself performs no verification unless told to, so this is not optional.

```typescript
await $.ssh({
  host: 'example.com',
  username: 'deploy',
  hostKeyChecking: 'strict',            // 'accept-new' (default) | 'strict' | 'off'
  knownHostsPath: '~/.ssh/known_hosts', // defaults to ~/.ssh/known_hosts
})`command`;
```

- `accept-new` (default) — trust and record a host's key the first time it's seen; refuse a later connection if the key has changed.
- `strict` — the host must already be in `known_hosts`; an unknown host is refused. Use this in CI and production.
- `off` — no verification. Only for disposable hosts whose keys are regenerated on every rebuild.

A key that changed is reported as an `EHOSTKEY`-classified `ConnectionError` and is never retried automatically, since a changed key can mean the host was rebuilt or that the connection is being intercepted.

There is no custom `hostVerifier` callback, no `hostHash`/`hostFingerprint` option, and no cipher/KEX/MAC algorithm selection in the public API.

## Security Best Practices {#security-best-practices}

1. Prefer a private key over a password.
2. `chmod 600` private key files; check with `SSHKeyValidator.checkKeyFilePermissions`.
3. Read credentials from environment variables or a secrets manager, never hardcode them.
4. Leave `hostKeyChecking` at `accept-new` or set it to `strict` in production; only use `off` for throwaway environments.
5. For sudo passwords specifically, see [Secure Sudo Password Handling](./sudo-security.md) — the concerns and the API are different from connection authentication.

## Related Documentation {#related-documentation}

- [SSH Overview](./overview.md) - fundamentals and command execution
- [Connection Configuration](./connection-config.md) - pooling and adapter-wide settings
- [Secure Sudo Password Handling](./sudo-security.md) - sudo password delivery methods
