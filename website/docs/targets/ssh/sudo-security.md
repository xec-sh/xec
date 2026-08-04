---
title: Secure Sudo Password Handling
description: How the SSH adapter delivers sudo passwords, and the real security properties of each method
keywords: [ssh, sudo, security, password]
sidebar_position: 6
---

# Secure Sudo Password Handling

## Overview

Setting `sudo` on an SSH command wraps the *entire* command in `sudo` (or `sudo -u <user>`) — do not write `sudo` in the command string yourself, and do not pass the command as a separate argument to `$.ssh()`: the target is the only argument `$.ssh()` takes, and the command comes from the tagged template.

```typescript
await $.ssh({
  host: 'server.example.com',
  username: 'user',
  sudo: {
    enabled: true,
    password: process.env['SUDO_PASSWORD'],
    passwordMethod: 'secure',
  },
})`apt-get update`;
```

`sudo` can only be set on the initial `$.ssh({...})` call (the object form) — there is no `.sudo(...)` chain method to add it afterward the way `.env()` or `.timeout()` work, and the string shorthand (`$.ssh('user@host')`) has nowhere to put it.

## Password Methods

`sudo.passwordMethod` selects how the password reaches `sudo` on the remote host. Real behavior, verified against `packages/core/src/adapters/ssh/index.ts`:

### `'secure'` (recommended)

Writes a one-time askpass script to `/tmp/.xec-askpass-<random>` on the **remote** host via a heredoc, `chmod 700`s it, runs the command through `SUDO_ASKPASS=<path> sudo -A`, then removes the script and preserves the command's real exit code — all in one round trip. The password never appears in `ps`/process-list output on the remote host.

```typescript
await $.ssh({ host, username, sudo: { enabled: true, password, passwordMethod: 'secure' } })`systemctl restart nginx`;
```

### `'stdin'` (default when a password is set)

Pipes the password to `sudo -S` with `printf`: `printf '%s\n' <password> | sudo -S sh -c '<command>'`. The adapter logs a `console.warn` recommending `'secure'` instead. The password is not on the command line, but it is briefly present in the piped process's argument/environment on some systems.

### `'echo'`

In the current implementation this executes the exact same `printf ... | sudo -S` path as `'stdin'` — there is no behavioral difference between them. It exists only as an accepted value for backward compatibility; prefer `'stdin'` or, better, `'secure'`.

### `'askpass'`

Sets `SUDO_ASKPASS=/tmp/askpass_$$` and runs `sudo -A`, but **nothing ever creates that script** — the source comments acknowledge this ("would require additional setup"). As implemented, this method does not work: `sudo` will report it has no usable askpass program. Use `'secure'` instead; do not use `'askpass'`.

### No `password` set

If `sudo.enabled` is `true` but no `password` is given, the command runs as plain `sudo sh -c '<command>'` with no password delivery at all. This only succeeds if the account has `NOPASSWD` sudo rights on the target, since there is no interactive terminal on an SSH exec channel for `sudo` to prompt on.

## Running as a Specific User

```typescript
sudo: { enabled: true, user: 'postgres', password, passwordMethod: 'secure' }
```

produces `sudo -u postgres sh -c '<command>'`. The user name is validated against `[A-Za-z0-9._][A-Za-z0-9._-]*` (max 32 characters) before it reaches the remote command line — a value like `root; rm -rf /` is rejected outright rather than being quoted and silently failing.

## Setting a Default for Every Command

To avoid repeating `sudo` on every call, configure it once on the adapter instead of per command:

```typescript
import { configure } from '@xec-sh/core';

configure({
  adapters: {
    ssh: {
      sudo: { enabled: false, method: 'secure-askpass' }, // per-command sudo.enabled still overrides this
    },
  },
});
```

At this adapter-config level the field is `method` (not `passwordMethod`), and it additionally accepts `'secure-askpass'` as an alias for `'secure'` — both take the same code path described above. The per-command `sudo.passwordMethod` type only exposes `'secure'`.

## `SecurePasswordHandler`

`SecurePasswordHandler` (`packages/core/src/adapters/ssh/secure-password.ts`) is a general-purpose, in-memory credential holder: it AES-256-GCM–encrypts values you give it, can write a *local* askpass script, and zeroes its buffers on `dispose()`. It is **not** what builds the remote askpass script for the `'secure'` SSH sudo method described above — that method constructs its script directly on the remote host via shell heredoc. `sudo.secureHandler` accepts a `SecurePasswordHandler` instance for forward compatibility, but supplying one currently has no effect on SSH sudo behavior.

Its real, working API:

```typescript
import { SecurePasswordHandler } from '@xec-sh/core';

const handler = new SecurePasswordHandler();
handler.storePassword('id', 'secret');
const value = handler.retrievePassword('id'); // 'secret'
await handler.cleanup(); // wipes memory and any local temp files it created
```

Also available: static `SecurePasswordHandler.maskPassword(command, password)` for scrubbing a password out of a string before logging it, and static `generatePassword(length?)` / `validatePassword(password)` helpers. There is no `getPassword(service)`, `promptPassword()`, or keychain integration — it does not read from or prompt an interactive session.

## Security Considerations

1. Process-list exposure: `'stdin'`/`'echo'` briefly expose the password to anything that can read the remote process table during the pipe; `'secure'` does not.
2. Shell history: none of these methods write the password to the remote shell's history file, since it is piped or read from a script rather than typed as a command argument.
3. Cleanup: `'secure'` removes its temporary script unconditionally, including when the wrapped command fails.
4. Prefer SSH keys plus `NOPASSWD` sudoers entries for fully automated scenarios over passing a sudo password at all.

## Troubleshooting

- **"sudo: no askpass program specified" / "sudo: a password is required"** — you are using `passwordMethod: 'askpass'`, which does not create the script it points at. Switch to `'secure'`.
- **Command appears to succeed but did nothing** — check that the command doesn't itself start with `sudo`; wrapping an already-`sudo`-prefixed command runs `sudo sh -c 'sudo …'`, which typically still works but is not what was intended and doubles the password prompt path.
- **Works interactively over `ssh` but fails via Xec** — sudo commands here run over a non-interactive exec channel; anything that relies on a TTY (an interactive password prompt, `sudo` policies requiring one) needs `passwordMethod: 'secure'` or a `NOPASSWD` entry, not a plain password.

## See Also

- [SSH Overview](./overview.md) - the `sudo` field in context
- [Authentication](./authentication.md) - connection-level credentials (a different concern from the sudo password)
- [Connection Configuration](./connection-config.md) - adapter-wide configuration via `configure()`
