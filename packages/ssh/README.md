# @xec-sh/ssh

Typed SSH clients, connection leases, channels, SFTP and forwarding. One package owns
the protocol and resource lifetimes; Xec Core supplies command execution and target policy.

**Development:** this package is being introduced for Xec 0.13.0. It is not part of
the published 0.12.0 distribution.

```ts
import { SSHClient } from '@xec-sh/ssh';

const agent = process.env.SSH_AUTH_SOCK;
if (!agent) throw new Error('An SSH agent socket is required');

const ssh = await new SSHClient().connect({
  host: 'build.example.net',
  username: 'builder',
  agent,
  hostKeyChecking: 'strict',
});

try {
  const result = await ssh.exec('uname -s', { signal: AbortSignal.timeout(10_000) });
  if (result.code !== 0) throw new Error('Remote inspection failed');
  process.stdout.write(result.stdout);
} finally {
  ssh.dispose();
}
```

Provision the server key in `known_hosts` before connecting. The client preserves
stdout, stderr and remote exit information; a lost acknowledgement is an unknown
outcome, not permission to replay a command. Use Core's `$.ssh` tagged templates
when interpolating command arguments.

- Native runtime cryptography; no compiled addon, installation build or bundled `ssh2`.
- Strict host trust, bounded operations and explicit connection leases.
- Streams, PTYs, SFTP and tunnels share one lifecycle implementation.
- ESM and exported TypeScript contracts; the wire engine remains private.

[Guide](../../website/docs/ssh/overview.md) ·
[Trust and cryptography](../../website/docs/ssh/security.md) ·
[Channels and files](../../website/docs/ssh/channels-and-files.md) ·
[Comparison with ssh2](../../website/docs/ssh/comparison.md)

The private protocol derives from ssh2 1.17.0. See [LICENSE](LICENSE),
[SSH-TYPES-LICENSE](SSH-TYPES-LICENSE), [NODE-SSH-LICENSE](NODE-SSH-LICENSE)
and [PROVENANCE.json](PROVENANCE.json).
