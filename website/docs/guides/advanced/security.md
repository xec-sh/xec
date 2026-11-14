---
sidebar_position: 3
title: Security Best Practices
description: Use Xec credentials, command boundaries and verified remote targets
---

# Security Best Practices {#security-best-practices}

## Problem {#problem}

Automation carries the authority of the account running it. Bind each command
to an intended target, validate application inputs and limit credentials to the
operation that needs them.

## Prerequisites {#prerequisites}

- Xec CLI and its public packages
- An account with the permissions required by the operation
- Independently verified SSH host identities for remote targets
- A credential provider configured for the environment

## Solution {#solution}

### Command diagnostics {#command-diagnostics}

Xec masks recognized credential forms in command errors, captured output and
events. Register runtime secrets before they could appear in a command or its
output. Use the existing secret manager to retrieve the value.

```typescript
import { registerSecret } from '@xec-sh/core';
import { SecretManager } from '@xec-sh/ops';

const secrets = new SecretManager({ type: 'env' });
const password = await secrets.getRequired('service-password');
if (!registerSecret(password)) throw new Error('Secret is too short to register');
```

The default environment provider reads `SECRET_SERVICE_PASSWORD` for this key.
Diagnostic redaction covers the registered value. Restrict access to process
memory, environment variables and external programs separately.

### Step 1: Secure Credential Management {#step-1-secure-credential-management}

`SecretManager` supplies the shared provider contract. The implemented provider
types are `env`, `local` and `git`. Configure one explicitly and let a missing
credential fail before starting an operation. The environment provider stores
values for the current process. Its source can be a CI secret store or the
operator's approved credential environment.

```typescript
import { $, registerSecret } from '@xec-sh/core';
import { SecretManager } from '@xec-sh/ops';

const secrets = new SecretManager({ type: 'env' });
const token = await secrets.getRequired('registry-token');
if (!registerSecret(token)) throw new Error('Registry token is too short to register');

await $.exec('docker', {
  args: ['login', 'registry.example.com', '--username', 'automation', '--password-stdin'],
  shell: false,
  stdin: token,
  timeout: '30s',
});
```

Here the token reaches Docker through standard input. Limit the registry account
to the repositories and operations it needs. Local and Git provider storage has
its own key and access requirements. [Secret provider configuration](../../ops/secrets.md)

### Step 2: Input Validation and Sanitization {#step-2-input-validation-and-sanitization}

Select commands from application-owned operations. Pass input as arguments and
use the executable's option terminator where supported. `shell: false` preserves
the local argument vector.

```typescript
import { $ } from '@xec-sh/core';

const branch = process.argv[2];
if (!branch || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) {
  throw new Error('Provide a branch name');
}
await $.exec('git', { args: ['check-ref-format', '--branch', branch], shell: false });
await $.exec('git', { args: ['show', '--stat', '--end-of-options', branch], shell: false });
```

For shell commands, tagged interpolation escapes values for the target shell.
The script owns the shell syntax and executable name.

```typescript
import { $ } from '@xec-sh/core';

const fileName = process.argv[2];
if (!fileName) throw new Error('Provide a file name');
await $`ls -ld -- ${fileName}`;
```

For file access bounded to a directory, resolve the real path and verify
containment. The following read requires the directory and its parents to be
owned by a trusted account so another actor cannot replace paths after the
check.

```typescript
import { realpath, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const root = await realpath('./reports');
const requested = process.argv[2];
if (!requested) throw new Error('Provide a report path');
const file = await realpath(resolve(root, requested));
const inside = relative(root, file);
if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) {
  throw new Error('Report must be inside the configured directory');
}
const content = await readFile(file, 'utf8');
console.log(content);
```

Command timeouts and output limits bound resource use. They operate within the
permissions of the process. Use an OS sandbox, container policy or dedicated
account when executing untrusted programs.

### Step 3: Secure SSH and Remote Connections {#step-3-secure-ssh-and-remote-connections}

Use a known-hosts file populated from an independently verified identity. Xec's
strict mode rejects unknown or changed keys.

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';
import { $, dispose } from '@xec-sh/core';

const server = $.ssh({
  host: 'deploy.example.com',
  username: 'deploy',
  privateKeyPath: join(homedir(), '.ssh', 'deploy_ed25519'),
  knownHostsPath: join(homedir(), '.ssh', 'known_hosts'),
  hostKeyChecking: 'strict',
});

try {
  console.log(await server`id -un`.timeout('10s').text());
} finally {
  await dispose();
}
```

A host-key change requires verification through the server's trusted management
channel. `ssh-keyscan` can collect a candidate key, but accepting its output
without independent verification would trust the network path being tested.
Use a dedicated deployment key and restrict the remote account's privileges.

### Step 4: Secure File Operations {#step-4-secure-file-operations}

Create temporary credentials inside a private directory, use exclusive creation
and await cleanup. This example writes a synthetic credential only to its own
new directory.

```typescript
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'xec-private-'));
try {
  await chmod(directory, 0o700);
  const file = await open(join(directory, 'credential.txt'), 'wx', 0o600);
  try {
    await file.writeFile('synthetic-example-credential', 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
} finally {
  await rm(directory, { recursive: true });
}
```

The permissions shown apply to POSIX filesystems. Configure equivalent ACLs on
Windows. Deleting a file releases its directory entry. Encryption at rest and
key lifecycle policies provide protection for copies retained by snapshots,
backups and storage devices.

### Step 5: Audit Logging and Monitoring {#step-5-audit-logging-and-monitoring}

Subscribe to engine events and record a small explicit schema. The core masks
command events. Application-added context should contain identifiers and
outcomes rather than credentials or whole environments.

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine({ defaultTimeout: '10s' });
engine.on('command:start', event => {
  console.log(JSON.stringify({
    event: 'command:start',
    at: event.timestamp,
    adapter: event.adapter,
    command: event.command,
  }));
});
engine.on('command:complete', event => {
  console.log(JSON.stringify({
    event: 'command:complete',
    at: event.timestamp,
    duration: event.duration,
    exitCode: event.exitCode,
  }));
});
engine.on('command:error', event => {
  console.error(JSON.stringify({ event: 'command:error', at: event.timestamp, error: event.error }));
});

try {
  await engine.execute({ command: process.execPath, args: ['--version'], shell: false });
} finally {
  await engine.dispose();
}
```

Forward these records to the environment's logging service and configure its
retention, access controls and delivery monitoring.

## Best Practices {#best-practices}

- Pin the remote target, host identity and deployment artifact.
- Keep secret values in the shared provider and redaction flow.
- Give automation dedicated credentials with the required scope.
- Use standard input for credentials when the target program supports it.
- Validate paths and operation names before a command can mutate state.
- Await process termination and verify the application's resulting state.

## Common Pitfalls {#common-pitfalls}

A command blocklist leaves alternative syntax and executables available.
Define the permitted operation and validate its arguments. For arbitrary code,
enforce isolation at the OS or container boundary.

A transport timeout can leave a remote mutation's outcome unknown. Inspect the
application's durable state before deciding on a retry. [Error handling](./error-handling.md)

## Troubleshooting {#troubleshooting}

### Issue: Permission Denied Errors {#issue-permission-denied-errors}

Inspect the intended account and file permissions before changing them.

```bash
id
ls -ld ~/.ssh
ls -l ~/.ssh/deploy_ed25519
```

For an owned POSIX deployment key, the usual permissions are `0700` on `.ssh`
and `0600` on the private key. Adjust only the intended files.

### Issue: SSH Key Authentication Failing {#issue-ssh-key-authentication-failing}

Check the key path, remote username and verified host entry. Use the same
account and key in the server's access policy.

```bash
ssh-keygen -F deploy.example.com -f ~/.ssh/known_hosts
ssh -o StrictHostKeyChecking=yes -i ~/.ssh/deploy_ed25519 deploy@deploy.example.com id -un
```

### Issue: Secret Not Found {#issue-secret-not-found}

Test presence without printing the value.

```typescript
import { SecretManager } from '@xec-sh/ops';

const secrets = new SecretManager({ type: 'env' });
console.log(await secrets.has('registry-token') ? 'Credential configured' : 'Credential missing');
```

This provider uses `SECRET_REGISTRY_TOKEN`. Inspect provider configuration when
the credential was stored under another prefix or provider.

### Issue: Audit Log Growing Too Large {#issue-audit-log-growing-too-large}

Configure rotation and retention in the log collector. Verify delivery before
retiring local records and preserve records required for deployment recovery.

## Related Guides {#related-guides}

- [Secret providers](../../ops/secrets.md)
- [Error handling](./error-handling.md)
- [Server management](../infrastructure/server-management.md)
