# File Operations

The Xec execution engine provides file operations across local, SSH, and Docker environments, plus pod-scoped file copy for Kubernetes, all built on the same shell-command foundation as everything else in the engine.

## Overview

File operations (`packages/core/src/utils/transfer.ts`) provide:

- **Cross-environment file transfer** between local, SSH and Docker (any combination, including remote-to-remote)
- **Recursive directory transfer**
- **SSH-specific upload/download** helpers
- **Pod-scoped copy** for Kubernetes, via a specific pod handle
- **Plain read/write/delete** for simple local file access, without shelling out yourself

## Local File Operations

### Basic File Operations

```typescript
import { $ } from '@xec-sh/core';

// Read a file — either the dedicated method or a shell command
const content = await $.readFile('config.yaml');
const catOutput = await $`cat config.yaml`;

// Write a file — again, either form
await $.writeFile('backup.yaml', content);
await $`cp config.yaml backup.yaml`;

// Copy file
await $`cp source.txt dest.txt`;

// Move file
await $`mv old.txt new.txt`;

// Delete file
await $.deleteFile('unnecessary.txt');
await $`rm unnecessary.txt`;
```

`$.readFile`, `$.writeFile` and `$.deleteFile` are engine methods, not a
filesystem library — they shell out (`cat`, and `rm -f` for delete) rather
than using `node:fs` directly, so they run against whatever `$` is currently
targeting. For anything beyond read/write/delete (checking existence,
creating directories, stat), there is no Xec wrapper; use plain
`node:fs/promises` for local paths, or a shell command through `$` for a
remote target.

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

// Upload a single file
await remote.uploadFile('/local/file.txt', '/remote/file.txt');

// Upload a directory (always recursive — there is no filter option)
await remote.uploadDirectory('/local/project', '/remote/project');
```

`uploadFile` and `uploadDirectory` each take exactly the local and remote
path — there is no third options argument, so there is no built-in progress
callback or path filtering on these two calls. For filtering out something
like `node_modules`, stage a filtered copy locally first (or use `rsync`
through `$`, see [File Synchronization](#file-synchronization) below).

### Download Files

```typescript
// Download a single file
await remote.downloadFile('/remote/data.csv', '/local/data.csv');
```

There is no `downloadDirectory` — to pull down a whole remote directory, use
[`$.transfer`](#cross-environment-transfer):

```typescript
await $.transfer.copy('ssh://user@server.com/remote/logs', '/local/logs', {
  recursive: true,
});
```

SFTP itself is used internally to implement these calls, but no SFTP client
(directory listing, stat, mkdir, unlink) is exposed publicly — use a shell
command through the SSH context for anything beyond upload/download:

```typescript
const files = await remote`ls -la /remote/path`;
const exists = (await remote`test -f /remote/file.txt`.nothrow()).ok;
```

## Docker File Operations

Docker file transfer goes through [`$.transfer`](#cross-environment-transfer),
the same as SSH:

```typescript
// Copy a file to a container
await $.transfer.copy('/local/config.json', 'docker://my-app:/app/config.json');

// Copy a directory to a container
await $.transfer.copy('/local/assets', 'docker://my-app:/app/public/assets', {
  recursive: true,
});

// Copy a file out of a container
await $.transfer.copy('docker://my-app:/app/output.log', '/local/logs/output.log');
```

### Volume Operations

```typescript
// Mount a volume for file sharing with an ephemeral container
const withVolume = $.docker({
  image: 'processor:latest',
  volumes: [
    '/local/input:/data/input:ro',    // Read-only
    '/local/output:/data/output:rw'   // Read-write
  ]
});

// Process files through the volume
await withVolume`process-files.sh`;
```

There is no dedicated volume backup/restore call — a plain container run
does the same thing a purpose-built helper would:

```typescript
await $`docker run --rm -v data-volume:/data -v /local/volume-backup:/backup busybox \
  tar czf /backup/volume-backup.tar.gz -C /data .`;
```

## Kubernetes File Operations

### Pod File Transfer

File copy is a method on a specific pod handle, reached through `.pod(name)`:

```typescript
const pod = $.k8s('production').pod('app-pod');

// Copy to the pod
await pod.copyTo('/local/config.yaml', '/app/config.yaml');

// Copy from the pod
await pod.copyFrom('/app/logs', '/local/pod-logs');

// Copy into a specific container in a multi-container pod
await pod.copyTo('/local/nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
```

Both methods only move files between the local machine and the pod — there
is no direct pod-to-pod or pod-to-`$.transfer` path; go through a local
intermediate if you need one.

Creating ConfigMaps or PersistentVolumeClaims from local files is not a Xec
feature — run `kubectl` directly for that:

```typescript
await $`kubectl create configmap app-config -n production \
  --from-file=config.yaml=/local/config.yaml \
  --from-file=settings.json=/local/settings.json`;
```

## Cross-Environment Transfer

`$.transfer` is a getter, not a method — access it as a property, then call
`.copy()`, `.move()` or `.sync()` (sync is copy with extra files at the
destination removed). Source and destination are plain paths for local
files, or use a small URL grammar for a remote endpoint:
`ssh://[user@]host/path` or `docker://container:/path`. Every combination of
local, SSH and Docker is supported, including host-to-host and
container-to-container — there is no Kubernetes leg.

### Local to Remote

```typescript
// Local to SSH
await $.transfer.copy('/local/files', 'ssh://user@server.com/remote/files');

// Local to Docker
await $.transfer.copy('/local/data', 'docker://app:/app/data');
```

### Remote to Remote

```typescript
// SSH to SSH — routed through a local temp file when the hosts differ
await $.transfer.copy(
  'ssh://user@source.com/remote/data',
  'ssh://user@dest.com/backup/data'
);

// Docker to Docker — routed through a local temp file when the containers differ
await $.transfer.copy('docker://exporter:/export', 'docker://importer:/import');
```

`.move()` has the same shape as `.copy()`, and additionally deletes the
source once the transfer succeeds. Both resolve to a `TransferResult`:

```typescript
interface TransferResult {
  success: boolean;
  filesTransferred: number;
  bytesTransferred: number;
  errors?: Error[];
  duration: number;
}
```

The `recursive` and `overwrite` options apply everywhere. `onProgress`,
`compress`, `include`/`exclude` and `chunkSize`/`concurrent` are declared on
`TransferOptions` but are not currently wired up for any transfer direction
— passing them has no effect, so don't rely on them yet.

## Advanced Operations

### Atomic File Operations

```typescript
// Atomic file replacement
async function atomicReplace(file: string, content: string) {
  const temp = `${file}.tmp.${Date.now()}`;
  
  try {
    // Write to temporary file
    await $.writeFile(temp, content);
    
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

// Preserve permissions after an upload — uploadFile() itself takes no
// options, so apply them as a follow-up command
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote.uploadFile('/local/script.sh', '/remote/script.sh');
await remote`chmod 755 /remote/script.sh`;
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
import { retry } from '@xec-sh/core';

await retry(() => $`cp large-file.dat /network/mount/`, {
  maxRetries: 3,
  isRetryable: (result) => result.stderr.includes('Input/output error'),
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
    const content = await $.readFile(file);
    const modified = modifier(content);
    await $.writeFile(file, modified);
    
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
await remote.uploadFile(source, dest);                         // For SSH
await $.transfer.copy(source, `docker://${container}:${dest}`); // For Docker

// ✅ Handle large files with streaming
await $`cat large.txt`.pipe($`gzip`).stdout(output);

// ✅ Validate transfers
const checksum = await $`md5sum file.txt`;
const remoteChecksum = await remote`md5sum file.txt`;
if (remoteChecksum.stdout !== checksum.stdout) {
  throw new Error('Transfer verification failed');
}

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

// ❌ Don't hand-quote a value that's already being interpolated
const content = 'some text';
await $`echo "${content}" > ${file}`;  // Xec already quotes ${content} —
                                        // wrapping it in manual quotes too
                                        // corrupts the command instead of
                                        // being redundant
await $`echo ${content} > ${file}`;    // Correct
```

## Implementation Details

File operations are implemented in:
- `packages/core/src/utils/transfer.ts` - `$.transfer` (copy/move/sync across local, SSH and Docker)
- `packages/core/src/adapters/ssh/index.ts` - SSH `uploadFile`/`downloadFile`/`uploadDirectory`
- `packages/core/src/adapters/kubernetes/kubernetes-api.ts` - Kubernetes `K8sPod.copyTo`/`copyFrom`
- `packages/core/src/core/execution-engine.ts` - `$.readFile`/`$.writeFile`/`$.deleteFile`

## See Also

- [SSH Adapter](/docs/core/execution-engine/adapters/ssh-adapter)
- [Docker Adapter](/docs/core/execution-engine/adapters/docker-adapter)
- [Kubernetes Adapter](/docs/core/execution-engine/adapters/k8s-adapter)
- [Streaming](/docs/core/execution-engine/features/streaming)
