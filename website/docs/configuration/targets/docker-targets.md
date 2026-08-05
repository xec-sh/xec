---
title: Docker Targets
description: Configuring Docker container targets for containerized execution
---

# Docker Targets

Docker targets run commands inside containers. Declare them under `targets.containers` in `.xec/config.yaml`; reference them as `containers.<name>`.

A target names either an existing container (`container:`) or an image (`image:`). The two behave differently.

## Existing Container

With `container:`, every command is a `docker exec` in that running container:

```yaml
targets:
  containers:
    app:
      container: my-app-container
      user: node
      workdir: /app
      env:
        NODE_ENV: production
```

```bash
xec in containers.app "ps aux"
```

The container must already be running; Xec does not start it.

## Ephemeral Container

With `image:`, every command runs in a fresh container from that image, removed after the command exits:

```yaml
targets:
  containers:
    build:
      image: node:22-alpine
      workdir: /src
      volumes:
        - ./src:/src
      env:
        CI: "true"
```

```bash
xec in containers.build "npm test"
```

Two consecutive commands run in two different containers — state does not persist between them. Use `container:` when it must.

## Reference

Fields the CLI forwards to the Docker adapter:

```yaml
targets:
  containers:
    example:
      # Identification (exactly one)
      container: existing-container  # exec in a running container
      image: ubuntu:24.04            # or: fresh container per command

      # Both modes
      user: "1000:1000"              # user ID or name
      workdir: /workspace            # working directory inside the container
      env:                           # environment for every command
        DEBUG: "1"

      # Ephemeral mode only
      volumes:
        - ./src:/app                 # host:container
        - ./config:/config:ro        # read-only mount
```

If both `container` and `image` are set, `image` wins and commands run in fresh containers.

Other keys under a container entry (`ports`, `network`, `restart`, `privileged`, `labels`, `healthcheck`, `tty`, `runMode`, resource limits) are accepted by the parser but are not forwarded to the connection. Container lifecycle — creating, starting, networking, publishing ports — belongs to the [Docker fluent API](../../targets/docker/overview.md) in scripts or to the [docker command](../../commands/built-in/docker.md), not to target YAML.

## Environment Variables

`env` is applied to every command executed on the target:

```yaml
targets:
  containers:
    ci:
      image: node:22
      env:
        CI: "true"
        NODE_ENV: test
```

## Examples

### Tests Against a Database Container

```yaml
targets:
  containers:
    postgres:
      container: dev-postgres
      user: postgres
```

```bash
xec in containers.postgres "psql -c 'select 1'"
```

### Reproducible Build Environment

```yaml
targets:
  containers:
    builder:
      image: golang:1.23
      workdir: /build
      volumes:
        - .:/build
```

```bash
xec in containers.builder "go build ./..."
```

## Troubleshooting

```bash
# Test the target
xec in containers.app "echo ok"

# Verbose output
xec --verbose in containers.app "echo ok"

# Show the resolved target configuration
xec config get targets.containers.app
```

Common failures:

- **No such container** — the `container:` name does not match a running container. Check `docker ps`.
- **Image pull failures** — the `image:` is not available locally and cannot be pulled. Pull it first.
- **Permission denied on mounted files** — the container user does not own the mounted path. Set `user:` to match the host UID.

## Next Steps

- [Kubernetes Targets](./kubernetes-targets.md) - Pod configuration
- [SSH Targets](./ssh-targets.md) - Remote host configuration

## See Also

- [Docker Execution](../../targets/docker/overview.md) - The Docker adapter and fluent API
- [in Command](../../commands/built-in/in.md) - Running commands in containers
- [docker Command](../../commands/built-in/docker.md) - Managing containers, images, networks
