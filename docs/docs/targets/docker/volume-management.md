---
title: Docker Volume Management
description: Managing Docker volumes and file operations with Xec
keywords: [docker, volumes, mounts, storage, file transfer]
source_files:
  - packages/core/src/docker/volume.ts
  - packages/core/src/docker/docker-client.ts
  - packages/core/src/operations/file.ts
  - apps/xec/src/commands/copy.ts
key_functions:
  - VolumeManager.create()
  - VolumeManager.remove()
  - VolumeManager.list()
  - DockerClient.copyToContainer()
  - DockerClient.copyFromContainer()
verification_date: 2025-08-03
---

# Docker Volume Management

## Implementation Reference

**Source Files:**
- `packages/core/src/docker/volume.ts` - Volume management operations
- `packages/core/src/docker/docker-client.ts` - Docker client implementation
- `packages/core/src/operations/file.ts` - File operations
- `apps/xec/src/commands/copy.ts` - Copy command implementation

**Key Functions:**
- `VolumeManager.create()` - Create volumes
- `VolumeManager.remove()` - Remove volumes
- `VolumeManager.list()` - List volumes
- `VolumeManager.inspect()` - Get volume details
- `DockerClient.copyToContainer()` - Copy files to container
- `DockerClient.copyFromContainer()` - Copy files from container

## Overview

Xec provides comprehensive Docker volume management capabilities, enabling persistent data storage, file sharing between containers, and efficient data transfer between host and containers.

## Volume Types

### Named Volumes

Docker-managed volumes with persistent storage:

```typescript
import { $ } from '@xec-sh/core';

// Create named volume
const volume = await $.docker.volume.create('app-data');

// Create with options
const volume = await $.docker.volume.create('db-data', {
  driver: 'local',
  driverOpts: {
    type: 'nfs',
    o: 'addr=10.0.0.1,rw',
    device: ':/data'
  },
  labels: {
    app: 'myapp',
    env: 'production'
  }
});

// Use in container
await $.docker.run('postgres', {
  volumes: ['db-data:/var/lib/postgresql/data']
});
```

### Bind Mounts

Host directory mounts for development:

```typescript
// Mount host directory
await $.docker.run('node:18', {
  volumes: [
    './src:/app/src:ro',           // Read-only
    './config:/app/config:rw',     // Read-write (default)
    './logs:/app/logs:delegated'   // Performance mode
  ]
});

// Absolute paths
await $.docker.run('nginx', {
  volumes: [
    '/etc/ssl/certs:/etc/nginx/certs:ro',
    '/var/www/html:/usr/share/nginx/html'
  ]
});
```

### Tmpfs Mounts

In-memory temporary storage:

```typescript
// Create tmpfs mount
await $.docker.run('alpine', {
  tmpfs: {
    '/tmp': 'size=100m',
    '/run': 'size=10m,mode=0755'
  }
});

// Or using mount syntax
await $.docker.run('alpine', {
  mounts: [{
    type: 'tmpfs',
    target: '/app/cache',
    tmpfsOptions: {
      size: 104857600,  // 100MB in bytes
      mode: 0755
    }
  }]
});
```

## Volume Operations

### Creating Volumes

Create and configure volumes:

```typescript
// Create simple volume
await $.docker.volume.create('my-volume');

// Create with configuration
const volume = await $.docker.volume.create('backup-volume', {
  driver: 'local',
  driverOpts: {
    type: 'btrfs',
    device: '/dev/sdb1'
  }
});

// Create from another volume (clone)
await $.docker.volume.clone('source-volume', 'dest-volume');
```

### Listing Volumes

List and filter volumes:

```typescript
// List all volumes
const volumes = await $.docker.volume.list();

// Filter volumes
const appVolumes = await $.docker.volume.list({
  filters: {
    label: ['app=myapp'],
    name: ['app-*']
  }
});

// Get volume details
volumes.forEach(vol => {
  console.log({
    name: vol.Name,
    driver: vol.Driver,
    mountpoint: vol.Mountpoint,
    size: vol.UsageData?.Size,
    refCount: vol.UsageData?.RefCount
  });
});
```

### Inspecting Volumes

Get detailed volume information:

```typescript
// Inspect volume
const info = await $.docker.volume.inspect('my-volume');

console.log({
  name: info.Name,
  driver: info.Driver,
  mountpoint: info.Mountpoint,
  createdAt: info.CreatedAt,
  options: info.Options,
  labels: info.Labels,
  scope: info.Scope
});

// Check if volume exists
const exists = await $.docker.volume.exists('my-volume');
```

### Removing Volumes

Remove unused volumes:

```typescript
// Remove specific volume
await $.docker.volume.remove('old-volume');

// Force remove (even if in use)
await $.docker.volume.remove('data-volume', { force: true });

// Remove multiple volumes
const volumes = ['vol1', 'vol2', 'vol3'];
await Promise.all(
  volumes.map(v => $.docker.volume.remove(v))
);

// Prune unused volumes
const pruned = await $.docker.volume.prune();
console.log(`Removed ${pruned.SpaceReclaimed} bytes`);
```

## File Operations

### Copying to Containers

Transfer files from host to container:

```typescript
// Copy file to container
await $.docker.copy('./app.js', 'my-container:/app/');

// Copy directory
await $.docker.copy('./src/', 'my-container:/app/src/');

// Copy with options
await $.docker.copyToContainer('my-container', {
  source: './config.json',
  destination: '/app/config.json',
  owner: '1000:1000',  // uid:gid
  mode: 0644
});

// Using CLI
```

```bash
# Copy file to container
xec copy config.json my-container:/app/

# Copy directory
xec copy ./src/ my-container:/app/src/

# Copy to multiple containers
xec copy config.json "containers.*:/app/"
```

### Copying from Containers

Extract files from container to host:

```typescript
// Copy file from container
await $.docker.copy('my-container:/app/output.log', './');

// Copy directory
await $.docker.copy('my-container:/app/dist/', './build/');

// Copy with archiving
await $.docker.copyFromContainer('my-container', {
  source: '/app/data/',
  destination: './backup.tar',
  compress: true
});
```

### Bulk File Operations

Copy files between multiple containers:

```typescript
// Copy between containers
await $.docker.copyBetween(
  'source-container:/app/data',
  'dest-container:/backup/'
);

// Sync directories
await $.docker.sync('container1:/data', 'container2:/data');

// Backup container volumes
async function backupVolumes(container: string) {
  const mounts = await $.docker.inspect(container)
    .then(info => info.Mounts);
    
  for (const mount of mounts) {
    if (mount.Type === 'volume') {
      await $.docker.copy(
        `${container}:${mount.Destination}`,
        `./backups/${mount.Name}/`
      );
    }
  }
}
```

## Volume Sharing

### Between Containers

Share volumes between containers:

```typescript
// Create data container
await $.docker.run('busybox', {
  name: 'data-container',
  volumes: ['/data'],
  command: ['true']
});

// Use volumes from data container
await $.docker.run('ubuntu', {
  volumesFrom: ['data-container'],
  command: ['ls', '/data']
});

// Share specific volumes
await $.docker.run('app', {
  volumesFrom: ['data-container:ro'],  // Read-only
  volumes: ['shared-data:/app/shared']
});
```

### Volume Drivers

Use different volume drivers:

```typescript
// Local driver (default)
await $.docker.volume.create('local-vol', {
  driver: 'local'
});

// NFS volume
await $.docker.volume.create('nfs-vol', {
  driver: 'local',
  driverOpts: {
    type: 'nfs',
    o: 'addr=192.168.1.1,rw,nfsvers=4',
    device: ':/exports/data'
  }
});

// CIFS/SMB volume
await $.docker.volume.create('smb-vol', {
  driver: 'local',
  driverOpts: {
    type: 'cifs',
    o: 'username=user,password=pass,domain=DOMAIN',
    device: '//server/share'
  }
});
```

## Backup and Restore

### Volume Backup

Backup volume data:

```typescript
// Backup volume to tar
async function backupVolume(volumeName: string) {
  const backupContainer = await $.docker.run('alpine', {
    volumes: [`${volumeName}:/source:ro`],
    command: ['tar', 'czf', '/backup.tar.gz', '/source'],
    detach: true
  });
  
  await $.docker.wait(backupContainer);
  await $.docker.copy(
    `${backupContainer}:/backup.tar.gz`,
    `./backups/${volumeName}-${Date.now()}.tar.gz`
  );
  await $.docker.remove(backupContainer);
}

// Backup with timestamp
await backupVolume('important-data');
```

### Volume Restore

Restore volume from backup:

```typescript
// Restore volume from tar
async function restoreVolume(volumeName: string, backupFile: string) {
  // Create new volume
  await $.docker.volume.create(volumeName);
  
  // Restore data
  const restoreContainer = await $.docker.run('alpine', {
    volumes: [`${volumeName}:/target`],
    command: ['tar', 'xzf', '/backup.tar.gz', '-C', '/target'],
    detach: true
  });
  
  await $.docker.copy(backupFile, `${restoreContainer}:/backup.tar.gz`);
  await $.docker.start(restoreContainer);
  await $.docker.wait(restoreContainer);
  await $.docker.remove(restoreContainer);
}

await restoreVolume('restored-data', './backup.tar.gz');
```

## Performance Optimization

### Mount Options

Optimize volume performance:

```typescript
// macOS performance optimization
await $.docker.run('node', {
  volumes: [
    './src:/app/src:cached',       // Better read performance
    './node_modules:/app/node_modules:delegated',  // Better write performance
    './dist:/app/dist:consistent'  // Default consistency
  ]
});

// Linux optimizations
await $.docker.run('database', {
  volumes: ['db-data:/var/lib/mysql'],
  volumeDriver: 'local',
  storageOpt: {
    size: '10G'
  }
});
```

### Volume Caching

Implement volume caching strategies:

```typescript
// Use volume for dependencies
await $.docker.run('node', {
  volumes: [
    'npm-cache:/root/.npm',      // NPM cache
    'yarn-cache:/usr/local/share/.cache/yarn',  // Yarn cache
    './:/app'
  ]
});

// Build cache volume
await $.docker.volume.create('build-cache');
await $.docker.run('builder', {
  volumes: ['build-cache:/cache']
});
```

## Configuration in Xec

### Volume Configuration

Define volumes in `.xec/config.yaml`:

```yaml
volumes:
  app-data:
    driver: local
    options:
      type: none
      o: bind
      device: /data/app
      
  db-backup:
    driver: local
    labels:
      backup: daily
      retention: 30d
      
  shared-cache:
    driver: local
    
targets:
  containers:
    app:
      type: docker
      container: my-app
      volumes:
        - app-data:/data
        - shared-cache:/cache
        - ./config:/app/config:ro
```

### Volume Tasks

Define volume management tasks:

```yaml
tasks:
  backup:
    description: Backup all volumes
    steps:
      - command: |
          for vol in $(docker volume ls -q); do
            docker run --rm -v ${vol}:/source:ro \
              -v ./backups:/backup alpine \
              tar czf /backup/${vol}-$(date +%Y%m%d).tar.gz /source
          done
          
  cleanup:
    description: Clean unused volumes
    steps:
      - command: docker volume prune -f
      
  migrate-volume:
    params:
      - name: source
      - name: destination
    steps:
      - command: |
          docker volume create ${params.destination}
          docker run --rm \
            -v ${params.source}:/source:ro \
            -v ${params.destination}:/dest \
            alpine cp -av /source/. /dest/
```

## Performance Characteristics

**Based on Implementation:**

### Operation Timings
- **Volume Create**: 10-50ms
- **Volume Remove**: 10-30ms
- **Volume List**: 5-20ms
- **File Copy (small)**: 50-200ms
- **File Copy (large)**: Depends on size and I/O
- **Volume Backup**: Depends on data size

### Storage Performance
- **Named Volumes**: Native filesystem performance
- **Bind Mounts**: Host filesystem performance
- **Tmpfs**: Memory speed (fastest)
- **NFS Volumes**: Network dependent

## Error Handling

### Common Errors

| Error | Code | Solution |
|-------|------|----------|
| Volume in use | 8 | Stop containers using volume |
| Permission denied | 11 | Check file permissions |
| No space left | 7 | Free up disk space |
| Volume not found | 3 | Verify volume name |
| Mount failed | 8 | Check mount source exists |

### Error Recovery

```typescript
// Safe volume operations
async function safeVolumeCreate(name: string) {
  try {
    return await $.docker.volume.create(name);
  } catch (error) {
    if (error.message.includes('already exists')) {
      return await $.docker.volume.inspect(name);
    }
    throw error;
  }
}

// Cleanup on error
async function withVolume(name: string, fn: Function) {
  const volume = await $.docker.volume.create(name);
  try {
    return await fn(volume);
  } finally {
    await $.docker.volume.remove(name, { force: true });
  }
}
```

## Best Practices

### Volume Management

1. **Use named volumes** for persistent data
2. **Bind mounts** only for development
3. **Set appropriate permissions** on mounted files
4. **Regular backups** of important volumes
5. **Clean up unused volumes** periodically
6. **Use labels** for organization

### Data Safety

```typescript
// Always backup before operations
async function safeVolumeOperation(volume: string, operation: Function) {
  // Backup
  await backupVolume(volume);
  
  try {
    // Perform operation
    await operation();
  } catch (error) {
    // Restore on failure
    await restoreVolume(volume, `./backups/${volume}-latest.tar.gz`);
    throw error;
  }
}

// Verify data integrity
async function verifyVolume(volume: string) {
  const container = await $.docker.run('alpine', {
    volumes: [`${volume}:/data:ro`],
    command: ['find', '/data', '-type', 'f', '-exec', 'md5sum', '{}', '+']
  });
  
  return await $.docker.logs(container);
}
```

## Related Topics

- [Docker Overview](./overview.md) - Docker basics
- [Container Lifecycle](./container-lifecycle.md) - Container management
- [Compose Integration](./compose-integration.md) - Multi-container apps
- [Networking](./networking.md) - Network configuration
- [copy Command](../../commands/built-in/copy.md) - File copy operations