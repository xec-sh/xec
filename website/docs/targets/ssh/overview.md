---
title: SSH Target Overview
description: Remote command execution over SSH with connection pooling, sudo, and tunneling
keywords: [ssh, remote, execution, pooling, tunneling]
sidebar_position: 1
---

# SSH Target Overview

## Overview

SSH targets run commands on remote hosts. The adapter (`packages/core/src/adapters/ssh/`) pools connections per host, retries a command once on a fresh connection if the transport dies mid-flight, and layers sudo, SFTP transfer, and port forwarding on top of a single `ssh2` connection.

```typescript
import { $ } from '@xec-sh/core';

// Shorthand: user@host[:port] — omitted user defaults to the local OS user
await $.ssh('deploy@web-1')`systemctl status nginx`;

// Object form — username is required here
await $.ssh({ host: 'web-1', username: 'deploy', privateKey: await readKey() })`uptime`;
```

## Target Configuration

Targets defined in `.xec/config.yaml` are resolved by the CLI (`xec on`, `xec in`, `$target` in scripts) into exactly these fields — anything else in a target's YAML is not forwarded to the connection:

```yaml
# .xec/config.yaml
targets:
  hosts:
    production:
      host: prod.example.com
      user: deploy
      port: 22                    # optional, default 22
      privateKey: ~/.ssh/id_ed25519
      passphrase: ${SSH_KEY_PASSPHRASE}
      hostKeyChecking: strict     # accept-new (default) | strict | off
      knownHostsPath: ~/.ssh/known_hosts
      env:
        NODE_ENV: production
```

```bash
xec on hosts.production "systemctl status nginx"
xec on "hosts.web-*" "uptime" --parallel
```

Connection pooling, sudo, and SFTP concurrency are not per-target YAML settings — they are process-wide adapter configuration. See [Connection Configuration](./connection-config.md).

## Command Execution

`$.ssh(target)` returns a callable context. Calling it with a template literal executes over SSH; chain methods before calling to configure the command:

```typescript
const web = $.ssh('deploy@web-1');

await web`ls -la`;
await web.env({ NODE_ENV: 'production' })`npm run build`;
await web.cd('/app')`git pull`;
await web.timeout(60_000)`./long-script.sh`;

// sudo prepends `sudo` to the command — do not write `sudo` yourself
await web`sudo systemctl restart nginx`.nothrow(); // fails without NOPASSWD; see sudo-security.md
```

Each of these returns a new context, so they compose: `$.ssh(target).cd('/app').timeout('30s')`. A timeout takes milliseconds or a duration string.

An SSH target carries the same surface as every other target, so anything you can do with `$` you can do with `$.ssh(host)` — `.with()`, `.which()`, `.readFile()`, `.batch()`, the event methods, and the rest. That is what lets a step written as a function of an engine run anywhere:

```typescript
const restart = (target, service) => target`systemctl restart ${service}`;

await restart($.ssh('deploy@web-1'), 'api');
await restart($.docker('api'), 'nginx');
```

On top of that, an SSH context adds what only SSH can offer: `.tunnel()`, `.reverseTunnel()`, `.uploadFile()`, `.downloadFile()` and `.uploadDirectory()`. Those survive `.with()`, so configuring a target does not cost you the reason you chose it.

### Streaming

The object returned by calling the context is a normal `ProcessPromise`:

```typescript
await $.ssh('deploy@web-1')`tail -f /var/log/app.log`.pipe(process.stdout);

for await (const line of $.ssh('deploy@web-1')`cat large-file.txt`) {
  console.log(line);
}

// Pipe between two hosts
await $.ssh('deploy@host1')`cat data.csv`
  .pipe($.ssh('deploy@host2')`import-data`);
```

## File Transfer

SFTP operations are methods on the SSH context, not a separate client:

```typescript
const web = $.ssh('deploy@web-1');

await web.uploadFile('./dist/app.js', '/var/www/app.js');
await web.downloadFile('/var/log/app.log', './app.log');
await web.uploadDirectory('./dist', '/var/www/html');
```

There is no `downloadDirectory` — only single-file download and directory upload are exposed. SFTP can be disabled adapter-wide (`sftp: { enabled: false }`); see [Connection Configuration](./connection-config.md).

## Sudo

```typescript
await $.ssh({
  host: 'web-1',
  username: 'deploy',
  sudo: { enabled: true, password: process.env['SUDO_PASSWORD'], passwordMethod: 'secure' }
})`apt-get update`;
```

Setting `sudo.enabled` wraps the whole command in `sudo` (or `sudo -u <user>`) — the command you write should not itself start with `sudo`. See [Secure Sudo Password Handling](./sudo-security.md) for the password methods and their real security properties.

## Port Forwarding

```typescript
const tunnel = await $.ssh('deploy@bastion').tunnel({
  localPort: 5432,
  remoteHost: 'db.internal',
  remotePort: 5432,
});
// localhost:5432 now reaches db.internal:5432 through bastion
await tunnel.close();
```

There is no dynamic (SOCKS) forwarding and no jump-host chaining — see [Tunneling](./tunneling.md) for what the two supported tunnel types actually do.

## Error Handling

```typescript
import { ConnectionError, TimeoutError, CommandError } from '@xec-sh/core';

try {
  await $.ssh('deploy@web-1')`command`;
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error(`Could not reach ${error.host}:`, error.originalError.message);
  } else if (error instanceof TimeoutError) {
    console.error(`Timed out after ${error.timeout}ms`);
  } else if (error instanceof CommandError) {
    console.error(`Exit ${error.exitCode}:`, error.stderr);
  }
}
```

Every error thrown by the adapter extends `ExecutionError`, which carries a stable `.kind` (`'connection-lost' | 'connection-refused' | 'timeout' | 'authentication' | 'host-key-mismatch' | 'command-failed' | ...`) and a `.recoverable` getter — branch on `.kind`, not on `.message`, which changes between versions. `error.code` is a fixed string like `'CONNECTION_FAILED'`, not an OS errno; the errno (`ECONNREFUSED`, etc.) is on `error.originalError` for `ConnectionError`.

A command that fails because a pooled connection died mid-flight is retried automatically, once, on a fresh connection — you only see the final failure.

## Events

```typescript
$.on('ssh:connect', ({ host, port }) => console.log(`connected to ${host}:${port}`));
$.on('ssh:reconnect', ({ host, attempts }) => console.log(`reconnecting to ${host}, attempt ${attempts}`));
$.on('ssh:pool-metrics', ({ metrics }) => console.log(metrics));
```

Other real events: `ssh:disconnect`, `ssh:execute`, `ssh:key-validated`, `ssh:pool-cleanup`, `ssh:tunnel-created`, `ssh:tunnel-closed`, plus the adapter-agnostic `connection:open` / `connection:close`.

## Related Documentation

- [Authentication](./authentication.md) - password and private-key auth, host key verification
- [Connection Configuration](./connection-config.md) - pooling, timeouts, and adapter-wide settings
- [Tunneling](./tunneling.md) - local and reverse port forwarding
- [Batch Operations](./batch-operations.md) - running commands across multiple hosts
- [Secure Sudo Password Handling](./sudo-security.md) - sudo password delivery methods
- [SSH Adapter API](../../core/execution-engine/adapters/ssh-adapter.md) - API reference
