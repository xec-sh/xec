---
sidebar_position: 2
---

# File Transfer

Comprehensive file transfer capabilities across local, SSH, Docker, and Kubernetes environments.

## Overview

@xec-sh/core provides multiple approaches to file transfer:
- **Shell Commands**: Using standard tools like `cp`, `scp`, `rsync`, `docker cp`
- **SSH SFTP**: Built-in methods for SSH file transfer
- **Docker/Kubernetes**: Native adapter support for container file operations
- **TransferEngine**: Advanced transfer orchestration (internal API)

## Basic Usage

### Local File Operations

```typescript
import { $ } from '@xec-sh/core';

// Simple copy
await $`cp source.txt dest.txt`;

// Copy with progress (using rsync)
await $`rsync -avh --progress source.txt dest.txt`;

// Copy directory
await $`cp -r source-dir/ dest-dir/`;

// Move files
await $`mv old-name.txt new-name.txt`;
```

### SSH File Transfer

#### Using SSH Adapter Methods

```typescript
const $ssh = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/key'
});

// Upload single file
await $ssh.uploadFile('/local/file.txt', '/remote/file.txt');

// Download single file
await $ssh.downloadFile('/remote/data.csv', '/local/data.csv');

// Upload entire directory
await $ssh.uploadDirectory('/local/project/', '/remote/project/');
```

#### Using Standard Commands

```typescript
// Using scp
await $`scp -i ${keyPath} local.txt user@host:/remote/path/`;

// Using rsync with progress
await $`rsync -avz --progress -e "ssh -i ${keyPath}" local/ user@host:/remote/`;

// Download with scp
await $`scp -i ${keyPath} user@host:/remote/file.txt ./local/`;
```

### Docker File Transfer

```typescript
const containerName = 'my-app';

// Copy to container
await $`docker cp ./config.json ${containerName}:/app/config.json`;

// Copy from container
await $`docker cp ${containerName}:/app/logs/app.log ./logs/`;

// Using Docker adapter
const container = await $.docker({
  image: 'node:18',
  name: 'temp-container'
}).start();

// Use the container
await container.exec`echo "test" > /data/test.txt`;

// Copy out results
await $`docker cp ${container.name}:/data/test.txt ./results/`;
await container.remove();
```

### Kubernetes File Transfer

```typescript
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('app-pod');

// Copy file to pod
await pod.copyTo('./config.yaml', '/app/config.yaml');

// Copy from specific container
await pod.copyFrom('/var/log/app.log', './app.log', 'app-container');

// Using kubectl directly
await $`kubectl cp ./data.csv default/my-pod:/tmp/data.csv`;
await $`kubectl cp default/my-pod:/results/output.json ./output.json`;
```

## Advanced Transfers

### Transfer with Progress

```typescript
async function transferWithProgress(source: string, dest: string) {
  // Get file size
  const stats = await fs.stat(source);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log(`Transferring ${path.basename(source)} (${sizeMB} MB)`);
  
  // Use rsync for progress
  const result = await $`rsync --progress -avh ${source} ${dest}`;
  
  // Parse progress from output
  result.stdout.split('\n').forEach(line => {
    if (line.includes('%')) {
      console.log(`Progress: ${line.trim()}`);
    }
  });
}
```

### Batch Transfer

```typescript
async function batchTransfer(files: string[], destination: string) {
  const results = [];
  
  // Transfer files with concurrency control
  const chunks = chunk(files, 5); // Process 5 at a time
  
  for (const batch of chunks) {
    const transfers = batch.map(async (file) => {
      try {
        await $`cp ${file} ${destination}/`;
        return { file, status: 'success' };
      } catch (error) {
        return { file, status: 'failed', error };
      }
    });
    
    const batchResults = await Promise.all(transfers);
    results.push(...batchResults);
  }
  
  return results;
}
```

### Secure Transfer with Verification

```typescript
async function secureTransfer(source: string, dest: string, remote = false) {
  // Calculate source checksum
  const sourceHash = await $`sha256sum ${source} | cut -d' ' -f1`;
  const expectedHash = sourceHash.stdout.trim();
  
  // Transfer file
  if (remote) {
    const $ssh = $.ssh({ host, username, privateKey });
    await $ssh.uploadFile(source, dest);
    
    // Verify on remote
    const remoteHash = await $ssh`sha256sum ${dest} | cut -d' ' -f1`;
    const actualHash = remoteHash.stdout.trim();
    
    if (expectedHash !== actualHash) {
      await $ssh`rm ${dest}`; // Clean up
      throw new Error('Transfer verification failed');
    }
  } else {
    await $`cp ${source} ${dest}`;
    
    // Verify locally
    const destHash = await $`sha256sum ${dest} | cut -d' ' -f1`;
    if (expectedHash !== destHash.stdout.trim()) {
      await $`rm ${dest}`;
      throw new Error('Transfer verification failed');
    }
  }
  
  console.log('✓ Transfer verified');
}
```

### Compressed Transfer

```typescript
import { withTempFile } from '@xec-sh/core';

async function compressedTransfer(source: string, dest: string, $remote?: any) {
  await withTempFile(async (temp) => {
    // Compress
    await $`tar -czf ${temp.path} -C ${path.dirname(source)} ${path.basename(source)}`;
    
    if ($remote) {
      // Upload compressed
      await $remote.uploadFile(temp.path, '/tmp/transfer.tar.gz');
      
      // Extract on remote
      await $remote`tar -xzf /tmp/transfer.tar.gz -C ${path.dirname(dest)}`;
      await $remote`rm /tmp/transfer.tar.gz`;
    } else {
      // Local compressed copy
      await $`tar -xzf ${temp.path} -C ${path.dirname(dest)}`;
    }
  });
}
```

## Transfer Patterns

### Mirror Directory

```typescript
async function mirrorDirectory(source: string, dest: string, $ssh?: any) {
  const rsyncArgs = [
    '-avz',           // archive, verbose, compress
    '--delete',       // remove deleted files
    '--exclude=.git', // exclude git
    '--exclude=node_modules'
  ];
  
  if ($ssh) {
    // Remote mirror
    const { host, username, privateKey } = $ssh.config;
    await $`rsync ${rsyncArgs} -e "ssh -i ${privateKey}" ${source}/ ${username}@${host}:${dest}/`;
  } else {
    // Local mirror
    await $`rsync ${rsyncArgs} ${source}/ ${dest}/`;
  }
}
```

### Incremental Backup

```typescript
async function incrementalBackup(source: string, backupDir: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup-${timestamp}`);
  const latestLink = path.join(backupDir, 'latest');
  
  // Create incremental backup using hard links
  const rsyncArgs = [
    '-avh',
    '--link-dest=' + latestLink,
    source + '/',
    backupPath + '/'
  ];
  
  await $`rsync ${rsyncArgs}`;
  
  // Update latest symlink
  await $`ln -sfn ${backupPath} ${latestLink}`;
  
  console.log(`Backup created: ${backupPath}`);
}
```

### Container to Container

```typescript
async function containerToContainer(
  sourceContainer: string,
  sourcePath: string,
  destContainer: string,
  destPath: string
) {
  await withTempFile(async (temp) => {
    // Copy from source container
    await $`docker cp ${sourceContainer}:${sourcePath} ${temp.path}`;
    
    // Copy to destination container
    await $`docker cp ${temp.path} ${destContainer}:${destPath}`;
  });
}
```

### Multi-Environment Transfer

```typescript
async function multiEnvTransfer(sourcePath: string, destinations: Array<{
  type: 'local' | 'ssh' | 'docker' | 'k8s';
  config: any;
  path: string;
}>) {
  const results = [];
  
  for (const dest of destinations) {
    try {
      switch (dest.type) {
        case 'local':
          await $`cp -r ${sourcePath} ${dest.path}`;
          break;
          
        case 'ssh':
          const $ssh = $.ssh(dest.config);
          await $ssh.uploadFile(sourcePath, dest.path);
          break;
          
        case 'docker':
          await $`docker cp ${sourcePath} ${dest.config.container}:${dest.path}`;
          break;
          
        case 'k8s':
          const k8s = $.k8s(dest.config);
          const pod = k8s.pod(dest.config.pod);
          await pod.copyTo(sourcePath, dest.path);
          break;
      }
      
      results.push({ destination: dest, status: 'success' });
    } catch (error) {
      results.push({ destination: dest, status: 'failed', error });
    }
  }
  
  return results;
}
```

## Performance Optimization

### Parallel Transfers

```typescript
import { parallel } from '@xec-sh/core';

async function parallelTransfer(files: string[], destination: string) {
  // Transfer multiple files in parallel
  const transfers = files.map(file => 
    $`cp ${file} ${destination}/`.nothrow()
  );
  
  const results = await parallel(transfers, {
    maxConcurrent: 5,
    onProgress: (completed, total) => {
      console.log(`Progress: ${completed}/${total}`);
    }
  });
  
  return results;
}
```

### Chunked Transfer

```typescript
async function chunkedTransfer(largeFile: string, dest: string, chunkSize = '100M') {
  const filename = path.basename(largeFile);
  
  await withTempDir(async (tempDir) => {
    // Split file
    await $`split -b ${chunkSize} ${largeFile} ${tempDir.path}/chunk-`;
    
    // Transfer chunks
    const chunks = await tempDir.list();
    for (const chunk of chunks) {
      await $`cp ${tempDir.path}/${chunk} ${dest}/`;
    }
    
    // Reassemble
    await $.cd(dest)`cat chunk-* > ${filename} && rm chunk-*`;
  });
}
```

### Delta Sync

```typescript
async function deltaSync(source: string, dest: string, $ssh?: any) {
  // Use rsync's delta-transfer algorithm
  const args = [
    '--archive',      // preserve attributes
    '--compress',     // compress during transfer
    '--partial',      // keep partial files
    '--progress',     // show progress
    '--inplace',      // update destination files in-place
    '--bwlimit=1000'  // limit bandwidth to 1MB/s
  ];
  
  if ($ssh) {
    const { host, username, privateKey } = $ssh.config;
    await $`rsync ${args} -e "ssh -i ${privateKey}" ${source} ${username}@${host}:${dest}`;
  } else {
    await $`rsync ${args} ${source} ${dest}`;
  }
}
```

## Error Handling

### Retry Failed Transfers

```typescript
async function reliableTransfer(source: string, dest: string, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Attempt transfer
      await $`cp ${source} ${dest}`;
      
      // Verify
      const sourceSize = (await $`stat -f%z ${source}`).stdout.trim();
      const destSize = (await $`stat -f%z ${dest}`).stdout.trim();
      
      if (sourceSize === destSize) {
        return { success: true, attempts: attempt };
      }
      
      throw new Error('Size mismatch after transfer');
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Clean up failed transfer
        await $`rm -f ${dest}`.nothrow();
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw new Error(`Transfer failed after ${maxRetries} attempts: ${lastError.message}`);
}
```

### Cleanup on Failure

```typescript
async function safeTransfer(operations: Array<() => Promise<void>>) {
  const completed = [];
  
  try {
    for (const [index, operation] of operations.entries()) {
      await operation();
      completed.push(index);
    }
  } catch (error) {
    // Rollback completed operations
    console.error('Transfer failed, rolling back...');
    
    for (const index of completed.reverse()) {
      try {
        // Implement rollback logic based on operation type
        console.log(`Rolling back operation ${index}`);
      } catch (rollbackError) {
        console.error(`Rollback failed for operation ${index}:`, rollbackError);
      }
    }
    
    throw error;
  }
}
```

## Best Practices

### 1. Choose the Right Tool

```typescript
// Small files - use cp/scp
await $`cp small.txt /dest/`;

// Large files - use rsync with compression
await $`rsync -avz large.iso /dest/`;

// Many files - use tar
await $`tar -cf - /source | tar -xf - -C /dest`;

// Incremental - use rsync
await $`rsync -avh --progress /source/ /dest/`;
```

### 2. Validate Transfers

```typescript
async function validateTransfer(source: string, dest: string) {
  // Check existence
  if (!(await $`test -f ${dest}`.nothrow()).ok) {
    throw new Error('Destination file not found');
  }
  
  // Check size
  const sourceSize = await $`stat -f%z ${source}`.then(r => r.stdout.trim());
  const destSize = await $`stat -f%z ${dest}`.then(r => r.stdout.trim());
  
  if (sourceSize !== destSize) {
    throw new Error(`Size mismatch: ${sourceSize} vs ${destSize}`);
  }
  
  // Check checksum for critical files
  const sourceHash = await $`md5 -q ${source}`.then(r => r.stdout.trim());
  const destHash = await $`md5 -q ${dest}`.then(r => r.stdout.trim());
  
  if (sourceHash !== destHash) {
    throw new Error('Checksum mismatch');
  }
}
```

### 3. Handle Interruptions

```typescript
let transferInProgress = false;

process.on('SIGINT', async () => {
  if (transferInProgress) {
    console.log('\nTransfer interrupted, cleaning up...');
    // Cleanup partial transfers
    process.exit(1);
  }
});

async function interruptibleTransfer(source: string, dest: string) {
  transferInProgress = true;
  try {
    await $`rsync -avh --partial --progress ${source} ${dest}`;
  } finally {
    transferInProgress = false;
  }
}
```

### 4. Monitor Bandwidth

```typescript
async function bandwidthLimitedTransfer(source: string, dest: string, mbps: number) {
  // Use rsync with bandwidth limit
  await $`rsync -avh --bwlimit=${mbps * 1024} ${source} ${dest}`;
  
  // Or use pv for monitoring
  const size = await $`stat -f%z ${source}`.then(r => r.stdout.trim());
  await $`pv -L ${mbps}M ${source} > ${dest}`;
}
```

## Platform Notes

- **Windows**: Use `robocopy` instead of `cp`/`rsync`
- **macOS**: `stat` uses `-f%z` for size (Linux uses `-c%s`)
- **Permissions**: May need `sudo` for system directories
- **SSH**: Ensure key permissions are `600`