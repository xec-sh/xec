---
title: Docker Networking
description: Container networking configuration and management with Xec
keywords: [docker, networking, ports, networks, connectivity]
sidebar_position: 3
---

# Docker Networking

Port publishing and network membership are both `docker run`-time concerns, so they live on the ephemeral container builder, not on the plain `$.docker({...})` exec/run shorthand. Network administration itself (`create`/`connect`/`disconnect`/`inspect`) is its own handle off `$.docker()`.

```typescript
import { $ } from '@xec-sh/core';

await $.docker().network('app-network').create({ driver: 'bridge' });

await $.docker()
  .ephemeral('nginx:alpine')
  .name('web')
  .network('app-network')
  .ports(['80:80'])
  .start();
```

## Ports

Only the ephemeral builder publishes ports:

```typescript
const web = $.docker().ephemeral('nginx:alpine').name('web');

web.ports(['80:80']);                        // host:container, raw -p syntax
web.ports(['127.0.0.1:8080:8080']);          // bind to one interface
web.ports(['9229:9229/udp']);                // protocol suffix
web.port(3000, 3000);                        // single mapping, same effect as ports(['3000:3000'])
web.port(5000, 5000, 'udp');
```

`.ports()` appends raw strings straight to `-p`, so anything the `docker run -p` flag accepts works, including port ranges (`'8000-8010:8000-8010'`). `.port(host, container, protocol?)` is a typed convenience for the common single-mapping case.

The plain object shorthand has no equivalent — `$.docker({ image: 'nginx', ports: [...] })` accepts `ports` at the type level (`DockerEphemeralOptions`) but the engine method never forwards it to `docker run`. Use the ephemeral builder for anything beyond `image`/`volumes`/`workdir`/`user`.

## Creating and Managing Networks

```typescript
const network = $.docker().network('app-network');

await network.create({
  driver: 'bridge',        // 'bridge' | 'host' | 'overlay' | 'macvlan' | 'none'
  subnet: '172.20.0.0/16',
  gateway: '172.20.0.1',
  ipRange: '172.20.1.0/24',
  attachable: true,
  internal: false,
  labels: { app: 'myapp' },
});

await network.connect('my-app', { alias: ['app', 'web'] });  // note: `alias`, singular field, array value
await network.connect('my-app', { ip: '172.20.0.5' });
await network.disconnect('my-app');
await network.disconnect('my-app', true);  // force

console.log(await network.inspect());      // raw `docker network inspect` JSON
console.log(await network.exists());
await network.remove();
```

The lower-level adapter has the same create/remove/list operations, minus `labels`:

```typescript
const docker = $.getAdapter('docker') as import('@xec-sh/core').DockerAdapter;

await docker.createNetwork('backend', { driver: 'bridge', internal: true });
const names = await docker.listNetworks();
await docker.removeNetwork('backend');
```

`createNetwork` is idempotent — it checks `listNetworks()` first and returns quietly if the name already exists, and also swallows the daemon's own "already exists" error if one slips through a race.

## Connecting an Existing Container to Another Network

An ephemeral or persistent container only joins the network(s) given at `docker run` time (or none, beyond the default bridge, for `docker exec` on something already running). To add a running container to another network afterward, use `network.connect()`:

```typescript
await $.docker().network('app-network').create();
await $.docker().network('app-network').connect('db', { alias: ['database'] });
await $.docker().network('app-network').connect('app');

// Containers sharing a network resolve each other by name or alias
await $.docker('app')`ping -c 1 database`;
```

## Inspecting a Container's Network State

`.info()` on either lifecycle builder returns `ip` (the default network's address) and `networks` (names of every network the container is on):

```typescript
const info = await $.docker().container('app').info();
console.log(info?.ip, info?.networks);
```

## Related Topics

- [Docker Overview](./overview.md) - Docker basics
- [Container Lifecycle](./container-lifecycle.md) - Container management
- [Compose Integration](./compose-integration.md) - Multi-container networking
- [Volume Management](./volume-management.md) - Data persistence
