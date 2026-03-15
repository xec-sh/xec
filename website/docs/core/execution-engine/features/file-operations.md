# File Operations

The Xec execution engine provides unified file operations across all environments - local, SSH, Docker, and Kubernetes - with consistent APIs for copying, transferring, and managing files.

## Overview

File operations (`packages/core/src/operations/file.ts`) provide:

- **Cross-environment file transfer** between any adapters
- **Recursive directory operations** with filtering
- **Progress tracking** for large transfers
- **Compression support** for efficient transfers
- **Permission preservation** across systems
- **Atomic operations** with rollback support

## Local File Operations

### Basic File Operations

```typescript
import { $ } from '@xec-sh/core';

// Read file
const content = await $`cat config.yaml`;

// Write file
await $`echo "${content}" > backup.yaml`;

// Copy file
await $`cp source.txt dest.txt`;

// Move file
await $`mv old.txt new.txt`;

// Delete file
await $`rm unnecessary.txt`;
```

### Directory Operations

```typescript
// Create directory
await $`mkdir -p /path/to/directory`;

// Copy directory
await $`cp -r source-dir dest-dir`;

// List directory contents
const files = await $`ls -la /path/to/dir`;

// Find files
const found = await $`find . -name "*.js" -type f`;

// Archive directory
await $`tar czf archive.tar.gz directory/`;
```

## SSH File Transfer

### Upload Files

```typescript
const remote = $.ssh({ host: 'server.com', username: 'user' });

// Upload single file
await remote.uploadFile('/local/file.txt', '/remote/file.txt');

// Upload with progress
await remote.uploadFile('/local/large.zip', '/remote/large.zip', {
  onProgress: (progress) => {
    const percent = (progress.transferred / progress.total * 100).toFixed(2);
    console.log(`Uploading: ${percent}%`);
  }
});

// Upload directory
await remote.uploadDirectory('/local/project', '/remote/project', {
  recursive: true,
  filter: (file) => !file.includes('node_modules')
});
```

### Download Files

```typescript
// Download single file
await remote.downloadFile('/remote/data.csv', '/local/data.csv');

// Download directory
await remote.downloadDirectory('/remote/logs', '/local/logs', {
  recursive: true,
  compress: true  // Compress during transfer
});

// Download with filtering
await remote.downloadDirectory('/remote/app', '/local/backup', {
  filter: (file) => file.endsWith('.log') || file.endsWith('.txt')
});
```

### SFTP Operations

```typescript
// Use SFTP client directly
const sftp = await remote.sftp();

// List remote directory
const files = await sftp.list('/remote/path');
files.forEach(file => {
  console.log(`${file.name} - ${file.size} bytes`);
});

// Check file existence
const exists = await sftp.exists('/remote/file.txt');

// Get file stats
const stats = await sftp.stat('/remote/file.txt');
console.log('Size:', stats.size);
console.log('Modified:', stats.modifyTime);

// Create remote directory
await sftp.mkdir('/remote/new-dir', true);  // recursive

// Remove remote file
await sftp.unlink('/remote/old-file.txt');
```

## Docker File Operations

### Copy to Container

```typescript
const container = $.docker({ container: 'my-app' });

// Copy file to container
await container.copyTo('/local/config.json', '/app/config.json');

// Copy directory to container
await container.copyToDir('/local/assets', '/app/public/assets');

// Copy with tar archive
await container.copyArchive('/local/build.tar', '/app');
```

### Copy from Container

```typescript
// Copy file from container
await container.copyFrom('/app/output.log', '/local/logs/output.log');

// Copy directory from container
await container.copyFromDir('/app/data', '/local/backup/data');

// Export container filesystem
await container.export('/local/container-backup.tar');
```

### Volume Operations

```typescript
// Mount volume for file sharing
const withVolume = $.docker({
  image: 'processor:latest',
  volumes: [
    '/local/input:/data/input:ro',    // Read-only
    '/local/output:/data/output:rw'   // Read-write
  ]
});

// Process files through volume
await withVolume`process-files.sh`;

// Backup volume
await $.docker.backupVolume('data-volume', '/local/volume-backup.tar');

// Restore volume
await $.docker.restoreVolume('data-volume', '/local/volume-backup.tar');
```

## Kubernetes File Operations

### Pod File Transfer

```typescript
const pod = $.k8s({ pod: 'app-pod', namespace: 'production' });

// Copy to pod
await pod.copyTo('/local/config.yaml', '/app/config.yaml');

// Copy from pod
await pod.copyFrom('/app/logs', '/local/pod-logs');

// Copy to specific container
await pod.copyTo('/local/nginx.conf', '/etc/nginx/nginx.conf', {
  container: 'nginx'
});
```

### ConfigMap as Files

```typescript
// Create ConfigMap from files
await $.k8s.createConfigMapFromFiles('app-config', {
  namespace: 'production',
  files: {
    'config.yaml': '/local/config.yaml',
    'settings.json': '/local/settings.json'
  }
});

// Mount ConfigMap as files
const podWithConfig = $.k8s({
  image: 'app:latest',
  volumes: [{
    name: 'config',
    configMap: 'app-config',
    mountPath: '/etc/config'
  }]
});
```

### PersistentVolume Operations

```typescript
// Create PersistentVolumeClaim
await $.k8s.createPVC('data-storage', {
  namespace: 'production',
  size: '10Gi',
  accessMode: 'ReadWriteOnce'
});

// Mount PersistentVolume
const podWithPV = $.k8s({
  image: 'database:latest',
  volumes: [{
    name: 'data',
    persistentVolumeClaim: 'data-storage',
    mountPath: '/var/lib/data'
  }]
});
```

## Cross-Environment Transfer

### Local to Remote

```typescript
// Local to SSH
const remote = $.ssh({ host: 'server.com', username: 'user' });
await $.copyFiles('/local/files', remote, '/remote/files');

// Local to Docker
const container = $.docker({ container: 'app' });
await $.copyFiles('/local/data', container, '/app/data');

// Local to Kubernetes
const pod = $.k8s({ pod: 'worker', namespace: 'batch' });
await $.copyFiles('/local/input', pod, '/data/input');
```

### Remote to Remote

```typescript
// SSH to SSH
const source = $.ssh({ host: 'source.com', username: 'user' });
const dest = $.ssh({ host: 'dest.com', username: 'user' });
await $.copyFiles(source, '/remote/data', dest, '/backup/data');

// Docker to Kubernetes
const docker = $.docker({ container: 'exporter' });
const k8s = $.k8s({ pod: 'importer', namespace: 'data' });
await $.copyFiles(docker, '/export', k8s, '/import');

// Kubernetes to SSH
const pod = $.k8s({ pod: 'app', namespace: 'prod' });
const backup = $.ssh({ host: 'backup.com', username: 'backup' });
await $.copyFiles(pod, '/app/data', backup, '/backups/daily');
```

## Advanced Operations

### Atomic File Operations

```typescript
// Atomic file replacement
async function atomicReplace(file: string, content: string) {
  const temp = `${file}.tmp.${Date.now()}`;
  
  try {
    // Write to temporary file
    await $`echo "${content}" > ${temp}`;
    
    // Validate temporary file
    await $`test -f ${temp}`;
    
    // Atomic rename
    await $`mv ${temp} ${file}`;
  } catch (error) {
    // Clean up on failure
    await $`rm -f ${temp}`.nothrow();
    throw error;
  }
}
```

### File Synchronization

```typescript
// Sync directories with rsync
async function syncDirectories(source: string, dest: string) {
  await $`rsync -avz --delete ${source}/ ${dest}/`;
}

// Sync to remote
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`rsync -avz --delete /local/src/ user@server.com:/remote/dest/`;

// Bidirectional sync
await $`unison /local/path ssh://server.com//remote/path`;
```

### File Watching

```typescript
// Watch for file changes
await $`inotifywait -m -r -e modify,create,delete /path/to/watch`
  .stdout((line) => {
    const [path, events, file] = line.split(' ');
    console.log(`File ${file} ${events} in ${path}`);
  });

// Watch and sync
await $`fswatch -r /local/src | while read f; do rsync -av /local/src/ /remote/dest/; done`;
```

### Compression and Archives

```typescript
// Create compressed archives
await $`tar czf archive.tar.gz --exclude=node_modules project/`;
await $`zip -r archive.zip project/ -x "*/node_modules/*"`;

// Extract archives
await $`tar xzf archive.tar.gz -C /destination`;
await $`unzip archive.zip -d /destination`;

// Stream compression
await $`cat large-file.txt | gzip > large-file.txt.gz`;
await $`gunzip -c large-file.txt.gz | process-command`;
```

## Permission Management

### File Permissions

```typescript
// Set permissions
await $`chmod 755 script.sh`;
await $`chmod -R 644 /path/to/files`;

// Set ownership
await $`chown user:group file.txt`;
await $`chown -R www-data:www-data /var/www`;

// Preserve permissions during copy
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote.uploadFile('/local/script.sh', '/remote/script.sh', {
  preservePermissions: true,
  preserveOwnership: true
});
```

### ACL Management

```typescript
// Set ACLs
await $`setfacl -m u:username:rwx file.txt`;
await $`setfacl -R -m g:groupname:rx directory/`;

// Get ACLs
const acls = await $`getfacl file.txt`;
console.log('ACLs:', acls.stdout);
```

## Error Handling

### File Operation Errors

```typescript
// Handle file not found
const result = await $`cat nonexistent.txt`.nothrow();
if (!result.ok && result.stderr.includes('No such file')) {
  console.error('File not found');
}

// Check before operations
if (await $`test -f file.txt`.nothrow().then(r => r.ok)) {
  await $`rm file.txt`;
}

// Retry file operations
await $`cp large-file.dat /network/mount/`
  .retry({
    attempts: 3,
    delay: 1000,
    shouldRetry: (error) => error.message.includes('Input/output error')
  });
```

### Recovery Strategies

```typescript
// Backup before modification
async function safeModify(file: string, modifier: (content: string) => string) {
  const backup = `${file}.backup`;
  
  try {
    // Create backup
    await $`cp ${file} ${backup}`;
    
    // Read, modify, write
    const content = await $`cat ${file}`;
    const modified = modifier(content.stdout);
    await $`echo "${modified}" > ${file}`;
    
    // Remove backup on success
    await $`rm ${backup}`;
  } catch (error) {
    // Restore from backup
    await $`mv ${backup} ${file}`;
    throw error;
  }
}
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use appropriate transfer methods
await remote.uploadFile(source, dest);  // For SSH
await container.copyTo(source, dest);   // For Docker

// ✅ Handle large files with streaming
await $`cat large.txt`.pipe($`gzip`).stdout(output);

// ✅ Validate transfers
const checksum = await $`md5sum file.txt`;
await remote`md5sum file.txt`.then(r => {
  assert(r.stdout === checksum.stdout);
});

// ✅ Clean up temporary files
const temp = await $`mktemp`;
try {
  // Use temp file
} finally {
  await $`rm -f ${temp}`;
}
```

### Don'ts ❌

```typescript
// ❌ Don't use shell expansion unsafely
const files = '*.txt';
await $`rm ${files}`;  // Dangerous

// ❌ Don't ignore permission errors
await $`chmod 777 /etc/passwd`;  // No error handling

// ❌ Don't transfer large files in memory
const content = await $`cat huge-file.bin`;  // May OOM

// ❌ Don't skip validation
await remote.uploadFile(source, dest);
// Should verify the transfer succeeded
```

## Implementation Details

File operations are implemented in:
- `packages/core/src/operations/file.ts` - File operation utilities
- `packages/core/src/ssh/sftp-client.ts` - SSH file transfer
- `packages/core/src/docker/file-ops.ts` - Docker file operations
- `packages/core/src/k8s/file-transfer.ts` - Kubernetes file transfer

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Docker Adapter](/docs/core/execution-engine/adapters/docker-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Streaming](/docs/core/execution-engine/features/streaming)