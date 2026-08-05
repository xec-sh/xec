---
title: Targets Overview
description: Understanding execution targets in Xec
---

# Targets Overview

Targets define where commands execute. A target is declared once in `.xec/config.yaml` and then referenced by name from the command line, tasks, and scripts.

## Target Types

Xec supports four target types:

### 1. Local

The machine Xec runs on. Always available as `local` without any configuration:

```bash
xec in local "make build"
```

### 2. SSH Hosts

Remote servers, declared under `targets.hosts`:

```yaml
targets:
  hosts:
    production:
      host: prod.example.com
      user: deploy
      privateKey: ~/.ssh/prod_key
```

### 3. Docker Containers

Containers, declared under `targets.containers` — an existing container or a fresh one per command:

```yaml
targets:
  containers:
    app:
      container: my-app-container   # exec in a running container
    build:
      image: node:22                # fresh container per command
      volumes:
        - .:/src
```

### 4. Kubernetes Pods

Pods, declared under `targets.pods`:

```yaml
targets:
  pods:
    api:
      namespace: production
      pod: "-l app=api"
      container: app
```

## Target Resolution

Targets are referenced with dot notation:

```bash
xec in hosts.production "ls -la"
xec in containers.app "ps aux"
xec in pods.api "env"
```

Patterns select several targets at once — wildcards and brace expansion both work:

```bash
# All hosts matching a wildcard, in parallel
xec on "hosts.web-*" "uptime" --parallel

# Brace expansion
xec on "hosts.web-{1,2,3}" "systemctl status nginx"
```

## Defaults

`targets.defaults` sets values inherited by every target; type-specific blocks apply per type. An individual target overrides both:

```yaml
targets:
  defaults:
    ssh:
      user: deploy        # every SSH host logs in as deploy
      port: 22

  hosts:
    web:
      host: web.example.com          # inherits user and port
    special:
      host: special.example.com
      port: 2222                     # overrides only the port
```

## Environment Variables

Every target type accepts `env`, applied to each command executed on it:

```yaml
targets:
  hosts:
    app:
      host: app.example.com
      user: deploy
      env:
        NODE_ENV: production
```

## Multiple Targets in Tasks

A task step can run across several targets:

```yaml
targets:
  hosts:
    web-1:
      host: web1.example.com
      user: deploy
    web-2:
      host: web2.example.com
      user: deploy

tasks:
  restart-web:
    targets:
      - hosts.web-1
      - hosts.web-2
    command: systemctl restart nginx
```

See [Multi-Step Tasks](../tasks/multi-step-tasks.md).

## Connection Behaviour

SSH connections are pooled and reused automatically; Docker and Kubernetes commands go through `docker` and `kubectl`. Pool sizes, sudo, and SFTP limits are process-wide adapter configuration in `@xec-sh/core`, not per-target YAML — see [Connection Configuration](../../targets/ssh/connection-config.md).

## Best Practices

### Use Meaningful Names

```yaml
# Good - the name says what it is
targets:
  hosts:
    web-production:
      host: web1.prod.example.com
      user: deploy

# Bad - unclear
targets:
  hosts:
    srv2:
      host: 10.0.0.2
      user: root
```

### Keep Credentials in Secrets

```yaml
targets:
  hosts:
    secure:
      host: secure.example.com
      user: deploy
      passphrase: ${secrets.ssh_passphrase}
```

### Vary Environments with Profiles

```yaml
profiles:
  dev:
    targets:
      hosts:
        app:
          host: localhost
          port: 2222
  prod:
    targets:
      hosts:
        app:
          host: app.example.com
```

See [Profiles](../profiles/overview.md).

## Troubleshooting

```bash
# Test a target
xec in hosts.production "echo ok"

# Verbose output
xec --verbose in hosts.production "echo ok"

# Show the resolved configuration
xec config get targets.hosts.production

# Validate the whole config file
xec config validate
```

## Next Steps

- [SSH Targets](./ssh-targets.md) - Remote server configuration
- [Docker Targets](./docker-targets.md) - Container configuration
- [Kubernetes Targets](./kubernetes-targets.md) - Pod configuration

## See Also

- [in Command](../../commands/built-in/in.md) - Running commands on targets
- [on Command](../../commands/built-in/on.md) - Running commands on SSH hosts
