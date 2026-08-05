---
title: docker
description: Manage Docker containers, images, networks and volumes from the Xec CLI
---

# docker

Manage Docker containers, images, networks and volumes.

## Synopsis

```bash
xec docker [options] <subcommand>
xec d <subcommand>              # alias
```

## Description

The `docker` command wraps common Docker operations: container lifecycle, image builds, networks, volumes, Compose, Swarm, and a set of pre-configured development services (Redis, PostgreSQL, Kafka, and others) that start with one line.

Docker must be installed and the daemon running.

## Global Options

- `-o, --output <format>` - Output format: `text` (default), `json`, `yaml`, `csv`
- `-c, --config <path>` - Path to configuration file
- `--dry-run` - Preview operations without executing them

## Subcommands

### Containers

```bash
xec docker container <cmd>      # alias: c
```

- `run [options] <image>` - Run a new container
  - `-n, --name <name>`, `-p, --ports <ports...>`, `-v, --volumes <volumes...>`, `-e, --env <env...>`
  - `--network <network>`, `--workdir <dir>`, `--user <user>`, `--entrypoint <cmd>`
  - `-d, --detached`, `--rm`, `-i, --interactive`, `-t, --tty`
  - `--restart <policy>`, `--label <labels...>`, `--privileged`
- `exec [options] <container> <command...>` - Execute a command in a running container
  - `-i, --interactive`, `-t, --tty`, `--user <user>`, `--workdir <dir>`
- `stop [options] <containers...>` - Stop containers (`-t, --time <seconds>`, default 10)
- `remove [options] <containers...>` - Remove containers (`-f, --force`); alias `rm`
- `logs [options] <container>` - View logs (`-f, --follow`, `--tail <lines>`, `--since <time>`, `--timestamps`)

### Images

```bash
xec docker image <cmd>          # alias: i
```

- `build [options] <context>` - Build from a Dockerfile
  - `-t, --tag <tag>`, `-f, --file <dockerfile>`, `--no-cache`, `--pull`
  - `--platform <platform>`, `--build-arg <args...>`, `--target <stage>`, `--quiet`
- `pull <image>` - Pull an image from a registry
- `remove [options] <images...>` - Remove images (`-f, --force`); alias `rmi`
- `list` - List images; alias `ls`

### Pre-configured Services

```bash
xec docker service <cmd>        # alias: s
```

One-line development services. Each takes `-p, --port`, `-n, --name`, `--version <tag>`, `--persistent` and `--data-path <path>`; service-specific flags below:

- `redis` - Redis (`--password`, `--config-path`)
- `postgres` - PostgreSQL (`--password`, `--user`, `--database`)
- `mysql` - MySQL (`--password`, `--database`)
- `mongodb` - MongoDB (`--root-user`, `--root-password`, `--database`, `--replica-set`)
- `redis-cluster` - Redis cluster (`-m, --masters`, `-r, --replicas`, `-p, --base-port`, `--password`, `--network`)
- `kafka` - Kafka with Zookeeper (`--zookeeper <connection>`, `--broker-id <id>`, `--network`)
- `rabbitmq` - RabbitMQ (`-m, --management-port`, `--user`, `--password`, `--vhost`)
- `elasticsearch` - Elasticsearch (`--single-node`)
- `ssh` - SSH server container for testing (`--user`, `--password`, `--pubkey <path>`, `--authorized-keys <path>`)
- `list` - List available services; alias `ls`

### Compose

```bash
xec docker compose <cmd>        # alias: dc
```

- `up [options]` - Create and start services (`-f, --file`, `-p, --project`, `-d, --detached`, `--build`, `--profile <profiles...>`)
- `down [options]` - Stop and remove services (`-f, --file`, `-p, --project`, `-v, --volumes`, `--rmi`)

### Networks

```bash
xec docker network <cmd>        # alias: n
```

- `create [options] <name>` - Create a network (`-d, --driver`, `--subnet`, `--gateway`, `--ip-range`, `--attachable`, `--internal`, `--label <labels...>`)
- `remove <name>` - Remove a network; alias `rm`

### Volumes

```bash
xec docker volume <cmd>         # alias: v
```

- `create [options] <name>` - Create a volume (`-d, --driver`, `--label <labels...>`, `--opt <options...>`)
- `remove [options] <name>` - Remove a volume (`-f, --force`); alias `rm`

### Swarm

- `swarm init [options]` - Initialize a swarm (`--advertise-addr`, `--listen-addr`, `--data-path-addr`)
- `swarm leave [options]` - Leave the swarm (`-f, --force`)

### Shortcuts

- `ps [options]` - List containers (`-a, --all`)
- `images` - List images
- `prune [options]` - Remove unused data (`-a, --all` images too, `-v, --volumes`)
- `quick-start` - Interactive service starter

## Examples

### Containers and Images

```bash
# Run a container with ports and a mounted volume
xec docker container run nginx:alpine -n web -p 8080:80 -v ./html:/usr/share/nginx/html -d

# Execute a command inside it
xec docker container exec web "nginx -t"

# Follow its logs
xec docker container logs web -f

# Build and tag an image
xec docker image build . -t my-app:latest

# Clean up
xec docker container stop web
xec docker container rm web
```

### Development Services

```bash
# Redis on the default port
xec docker service redis

# PostgreSQL with a persistent data directory
xec docker service postgres --password secret --persistent --data-path ./pgdata

# A three-master Redis cluster
xec docker service redis-cluster --masters 3 --replicas 1

# See what is available
xec docker service list
```

### Compose

```bash
xec docker compose up --build
xec docker compose down -v
```

### Housekeeping

```bash
xec docker ps -a
xec docker prune --all --volumes
```

## Related Commands

- [in](./in.md) - Execute commands in containers declared as targets
- [logs](./logs.md) - Stream logs from any target
- [copy](./copy.md) - Copy files to and from containers

## See Also

- [Docker Targets](../../configuration/targets/docker-targets.md) - Declaring containers in `.xec/config.yaml`
- [Docker Execution](../../targets/docker/overview.md) - The Docker adapter and fluent API
