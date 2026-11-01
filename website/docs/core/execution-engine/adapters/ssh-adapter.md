---
title: SSH Adapter
description: The Xec SSH API, its ownership rules and links to complete usage guides.
---

# SSH Adapter

Use an SSH target for commands, file transfer and tunnels. The adapter owns host verification, pooled connections, bounded channel scheduling, cancellation and cleanup. Application code imports Xec only; transport libraries stay inside the adapter.

```typescript
import { $ } from '@xec-sh/core';

const remote = $.ssh({ host: 'app.example.com', username: 'deploy', hostKeyChecking: 'strict' });
await remote.cd('/srv/app').timeout('30s')`./check-health`;
await remote.uploadDirectory('./dist', '/srv/app/candidate', { concurrency: 4 });
await remote.downloadDirectory('/srv/app/reports', './reports', { operationTimeoutMs: 30_000 });
```

| API | Ownership and result |
| --- | --- |
| `$.ssh(target)` | Callable target context; configuration methods preserve the target and SSH helpers. |
| `uploadFile`, `downloadFile` | SFTP transfer with cancellation, inactivity limits and a retained pool lease. |
| `uploadDirectory`, `downloadDirectory` | Bounded concurrent copies, including hidden files and empty directories; reject incomplete transfers. |
| `tunnel`, `reverseTunnel` | Explicit target, close acknowledgement, `closed` promise and retained connection lease. |
| `NodeSSH` from `@xec-sh/core/ssh` | Advanced client for channels, SFTP, custom authentication, subsystems and forwarding. |
| `SSHAgent`, `SSHChannel`, `SFTPClient` | Public Xec contracts; no additional transport type dependency. |

An interrupted command can have an unknown outcome. Xec reports that condition and does not automatically replay it. A transfer can leave a partial destination. See [Reliability and ownership](../../../targets/ssh/reliability.md) before designing recovery.

- [Target overview](../../../targets/ssh/overview.md): commands, file operations and events.
- [Connection configuration](../../../targets/ssh/connection-config.md): pool lifetime and timeouts.
- [Authentication](../../../targets/ssh/authentication.md): keys, agents and host verification.
- [Interactive shells](../../../targets/ssh/interactive-shell.md): PTY, resize and cancellation.
- [Tunnels](../../../targets/ssh/tunneling.md): local and reverse forwarding.
- [Batch operations](../../../targets/ssh/batch-operations.md): multiple targets and concurrency.
- [Sudo security](../../../targets/ssh/sudo-security.md): privilege escalation and credential delivery.
