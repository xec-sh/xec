---
title: SSH Targets
description: Configuring SSH host targets for remote execution
---

# SSH Targets

SSH targets run commands on remote hosts. Declare them under `targets.hosts` in `.xec/config.yaml`; reference them as `hosts.<name>`.

## Basic Configuration

```yaml
targets:
  hosts:
    web-server:
      host: web.example.com
      user: deploy
      privateKey: ~/.ssh/id_rsa
```

```bash
xec on hosts.web-server "uptime"
```

## Reference

Fields the CLI forwards to the SSH connection:

```yaml
targets:
  hosts:
    server:
      # Required
      host: server.example.com       # Hostname or IP address

      # Authentication (key or password)
      user: deploy                   # SSH username
      privateKey: ~/.ssh/id_rsa      # Path to private key
      password: ${secrets.password}  # Password (store as a secret)
      passphrase: ${secrets.phrase}  # Key passphrase

      # Connection
      port: 22                       # SSH port (default: 22)
      hostKeyChecking: accept-new    # accept-new | strict | off
      knownHostsPath: ~/.ssh/known_hosts

      # Environment for every command on this target
      env:
        NODE_ENV: production
```

Other keys under a host entry are accepted by the parser but do not change the connection. Connection pooling, sudo, SFTP concurrency, and keep-alive are process-wide adapter configuration in `@xec-sh/core`, not per-target YAML — see [Connection Configuration](../../targets/ssh/connection-config.md) and [Sudo & Security](../../targets/ssh/sudo-security.md).

## Authentication

### Private Key

```yaml
targets:
  hosts:
    secure:
      host: secure.example.com
      user: deploy
      privateKey: ~/.ssh/deploy_key
      passphrase: ${secrets.key_passphrase}  # only if the key is encrypted
```

`privateKey` is a single path. There is no SSH agent integration: a target needs either a key or a password.

### Password

```yaml
targets:
  hosts:
    legacy:
      host: old-server.example.com
      user: admin
      password: ${secrets.legacy_password}  # never hardcode
```

## Host Key Checking

`hostKeyChecking` defaults to `accept-new`: the host's key is recorded on first connection and a later mismatch is refused.

```yaml
targets:
  hosts:
    production:
      host: prod.example.com
      user: deploy
      hostKeyChecking: strict        # refuse hosts not already in known_hosts

    test-fixture:
      host: localhost
      port: 2222
      user: test
      hostKeyChecking: off           # disposable hosts whose keys change on rebuild
      knownHostsPath: ./test/known_hosts
```

Use `off` only for disposable hosts such as test containers.

## Environment Variables

`env` is applied to every command executed on the target:

```yaml
targets:
  hosts:
    app-server:
      host: app.example.com
      user: deploy
      env:
        NODE_ENV: production
        API_URL: https://api.example.com
```

## Organizing Hosts

Related hosts are separate entries; a naming convention keeps them addressable:

```yaml
targets:
  hosts:
    web-1:
      host: web1.example.com
      user: deploy
    web-2:
      host: web2.example.com
      user: deploy
    db-primary:
      host: db1.example.com
      user: dba
```

Tasks can run one step across several hosts — see [Multi-Step Tasks](../tasks/multi-step-tasks.md).

## Examples

### Production Web Server

```yaml
targets:
  hosts:
    production-web:
      host: prod-web.example.com
      user: deploy
      privateKey: ~/.ssh/prod_deploy_key
      hostKeyChecking: strict
      env:
        NODE_ENV: production
        PORT: "3000"
```

### Development Server

```yaml
targets:
  hosts:
    dev-server:
      host: dev.example.com
      user: developer
      privateKey: ~/.ssh/id_rsa
      env:
        NODE_ENV: development
        DEBUG: "*"
```

## Troubleshooting

```bash
# Test the connection
xec on hosts.production-web "echo ok"

# Verbose output
xec --verbose on hosts.production-web "echo ok"

# Show the resolved target configuration
xec config get targets.hosts.production-web
```

Common failures:

- **Permission denied** — wrong `user`, wrong key path, or key permissions. Keys must be `chmod 600`.
- **Host key verification failed** — the host's key changed since it was recorded. Remove the stale entry from `known_hosts`, or point `knownHostsPath` at the right file.
- **Connection refused** — wrong `port`, or sshd not running on the target.

## Security Practices

- Prefer key authentication over passwords.
- Keep passwords and passphrases in [secrets](../../commands/built-in/secrets.md) (`${secrets.name}`), never in the YAML.
- Use `hostKeyChecking: strict` for production targets.
- Put only necessary variables in `env`; secrets do not belong there.

## Next Steps

- [Docker Targets](./docker-targets.md) - Container configuration
- [Kubernetes Targets](./kubernetes-targets.md) - Pod configuration

## See Also

- [SSH Execution](../../targets/ssh/overview.md) - The SSH adapter itself: sudo, SFTP, tunnels
- [on Command](../../commands/built-in/on.md) - Running commands on SSH hosts
- [copy Command](../../commands/built-in/copy.md) - Copying files via SSH
- [forward Command](../../commands/built-in/forward.md) - SSH tunneling
