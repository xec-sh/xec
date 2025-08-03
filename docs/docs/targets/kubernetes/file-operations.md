---
title: File Operations  
description: File transfer and manipulation in Kubernetes pods using kubectl cp
keywords: [kubernetes, k8s, file-transfer, kubectl-cp, copy, upload, download]
source_files:
  - packages/core/src/adapters/kubernetes-adapter.ts
  - packages/core/src/utils/kubernetes-api.ts
key_functions:
  - KubernetesAdapter.copyFiles()
  - K8sPod.copyTo()
  - K8sPod.copyFrom()
verification_date: 2025-08-03
---

# File Operations

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/kubernetes-adapter.ts` - File copy implementation
- `packages/core/src/utils/kubernetes-api.ts` - Pod-level file operations

**Key Functions:**
- `KubernetesAdapter.copyFiles()` - Core file transfer implementation
- `K8sPod.copyTo()` - Copy files from local to pod
- `K8sPod.copyFrom()` - Copy files from pod to local

## Overview

Xec provides seamless file transfer capabilities for Kubernetes pods through `kubectl cp`, enabling bidirectional file operations between local filesystem and pod containers. This is essential for configuration updates, log collection, backup operations, and deployment workflows.

## Basic File Operations

### Copy Files to Pod

Upload files from local filesystem to pod:

```typescript
import { $ } from '@xec-sh/core';

const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('web-server');

// Copy single file to pod
await pod.copyTo('./config.json', '/app/config.json');
console.log('Configuration uploaded to pod');

// Copy with specific container
await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
console.log('Nginx configuration uploaded');
```

### Copy Files from Pod

Download files from pod to local filesystem:

```typescript
// Copy single file from pod
await pod.copyFrom('/app/logs/application.log', './app-logs.log');
console.log('Application logs downloaded');

// Copy from specific container
await pod.copyFrom('/var/log/nginx/access.log', './nginx-access.log', 'nginx');
console.log('Nginx access logs downloaded');
```

## Directory Operations

### Copy Directories

Transfer entire directories between local and pod:

```typescript
const pod = k8s.pod('application-server');

// Copy entire directory to pod
await pod.copyTo('./assets/', '/app/assets/');
console.log('Assets directory uploaded');

// Copy directory from pod
await pod.copyFrom('/app/generated-reports/', './reports/');
console.log('Reports directory downloaded');
```

### Selective File Copy

Copy specific files based on patterns:

```typescript
// Copy multiple configuration files
const configFiles = [
  { local: './config/app.json', remote: '/app/config/app.json' },
  { local: './config/database.json', remote: '/app/config/database.json' },
  { local: './config/redis.json', remote: '/app/config/redis.json' }
];

for (const { local, remote } of configFiles) {
  await pod.copyTo(local, remote);
  console.log(`Uploaded ${local} -> ${remote}`);
}
```

## Container-Specific Operations

### Multi-Container File Operations

Handle file operations in multi-container pods:

```typescript
const multiPod = k8s.pod('multi-container-application');

// Copy to different containers
await multiPod.copyTo('./app-config.json', '/app/config.json', 'app');
await multiPod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
await multiPod.copyTo('./redis.conf', '/etc/redis/redis.conf', 'redis');

console.log('Configuration files deployed to all containers');

// Copy logs from different containers
await multiPod.copyFrom('/app/logs/app.log', './logs/app.log', 'app');
await multiPod.copyFrom('/var/log/nginx/error.log', './logs/nginx-error.log', 'nginx');
await multiPod.copyFrom('/var/log/redis/redis.log', './logs/redis.log', 'redis');

console.log('Logs collected from all containers');
```

### Container Discovery

Identify containers before file operations:

```typescript
// Get container information (through exec)
const containers = await pod.exec`echo $HOSTNAME && ps aux | head -5`;
console.log('Container info:', containers.stdout);

// Copy based on container purpose
const isNginxContainer = await pod.exec`which nginx`.nothrow();
if (isNginxContainer.ok) {
  await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf');
  console.log('Nginx configuration updated');
}
```

## Configuration Management

### Application Configuration

Deploy application configurations:

```typescript
async function deployConfiguration(podName: string, configDir: string) {
  const pod = k8s.pod(podName);
  
  // Backup existing configuration
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await pod.copyFrom('/app/config/', `./backup/config-${timestamp}/`);
  console.log('Existing configuration backed up');
  
  // Deploy new configuration
  await pod.copyTo(`${configDir}/`, '/app/config/');
  console.log('New configuration deployed');
  
  // Validate configuration
  const validation = await pod.exec`/app/bin/validate-config`.nothrow();
  if (!validation.ok) {
    // Rollback on validation failure
    await pod.copyTo(`./backup/config-${timestamp}/`, '/app/config/');
    throw new Error(`Configuration validation failed: ${validation.stderr}`);
  }
  
  console.log('Configuration deployed and validated successfully');
}
```

### Environment-Specific Deployments

Deploy configuration based on environment:

```typescript
async function deployEnvironmentConfig(environment: string, podName: string) {
  const pod = k8s.pod(podName);
  const configPath = `./configs/${environment}`;
  
  // Verify environment-specific configuration exists
  const configExists = await $`test -d ${configPath}`.nothrow();
  if (!configExists.ok) {
    throw new Error(`Configuration for environment '${environment}' not found`);
  }
  
  console.log(`Deploying ${environment} configuration to ${podName}...`);
  
  // Copy environment-specific files
  await pod.copyTo(`${configPath}/app.json`, '/app/config/app.json');
  await pod.copyTo(`${configPath}/database.json`, '/app/config/database.json');
  
  // Copy common configuration
  await pod.copyTo('./configs/common/logging.json', '/app/config/logging.json');
  
  console.log(`${environment} configuration deployed successfully`);
}

// Usage
await deployEnvironmentConfig('production', 'web-server-prod');
await deployEnvironmentConfig('staging', 'web-server-staging');
```

## Log and Data Collection

### Log Aggregation

Collect logs from multiple sources:

```typescript
async function collectApplicationLogs(podName: string) {
  const pod = k8s.pod(podName);
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logDir = `./collected-logs/${podName}-${timestamp}`;
  
  // Create local log directory
  await $`mkdir -p ${logDir}`;
  
  // Collect various log files
  const logFiles = [
    { remote: '/app/logs/application.log', local: `${logDir}/application.log` },
    { remote: '/app/logs/error.log', local: `${logDir}/error.log` },
    { remote: '/app/logs/access.log', local: `${logDir}/access.log` }
  ];
  
  console.log(`Collecting logs from ${podName}...`);
  
  for (const { remote, local } of logFiles) {
    try {
      await pod.copyFrom(remote, local);
      console.log(`  ✓ ${remote} -> ${local}`);
    } catch (error) {
      console.log(`  ✗ Failed to copy ${remote}: ${error.message}`);
    }
  }
  
  // Compress collected logs
  await $`tar -czf ${logDir}.tar.gz -C ./collected-logs ${podName}-${timestamp}`;
  console.log(`Logs archived to ${logDir}.tar.gz`);
}
```

### Database Backups

Collect database dumps and backups:

```typescript
async function collectDatabaseBackup(dbPod: string) {
  const pod = k8s.pod(dbPod);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  console.log('Creating database backup...');
  
  // Create backup inside pod
  await pod.exec`pg_dump myapp > /tmp/backup-${timestamp}.sql`;
  
  // Copy backup to local
  await pod.copyFrom(`/tmp/backup-${timestamp}.sql`, `./backups/db-backup-${timestamp}.sql`);
  
  // Clean up temporary file in pod
  await pod.exec`rm /tmp/backup-${timestamp}.sql`;
  
  console.log(`Database backup saved to ./backups/db-backup-${timestamp}.sql`);
}
```

## Development Workflows

### Code Deployment

Deploy application code to development pods:

```typescript
async function deployCode(podName: string, sourceDir: string) {
  const pod = k8s.pod(podName);
  
  console.log(`Deploying code from ${sourceDir} to ${podName}...`);
  
  // Stop application
  await pod.exec`supervisorctl stop app`.nothrow();
  
  // Backup current code
  const timestamp = Date.now();
  await pod.exec`cp -r /app /app-backup-${timestamp}`;
  
  try {
    // Deploy new code
    await pod.copyTo(`${sourceDir}/`, '/app/');
    console.log('Code deployed');
    
    // Install dependencies
    await pod.exec`cd /app && npm install`;
    console.log('Dependencies installed');
    
    // Start application
    await pod.exec`supervisorctl start app`;
    console.log('Application started');
    
    // Verify deployment
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for startup
    const health = await pod.exec`curl -f http://localhost:8080/health`.nothrow();
    
    if (!health.ok) {
      throw new Error('Health check failed after deployment');
    }
    
    console.log('Deployment successful and verified');
    
    // Clean up backup
    await pod.exec`rm -rf /app-backup-${timestamp}`;
    
  } catch (error) {
    console.error('Deployment failed, rolling back...');
    
    // Rollback
    await pod.exec`rm -rf /app && mv /app-backup-${timestamp} /app`;
    await pod.exec`supervisorctl start app`;
    
    throw error;
  }
}
```

### Asset Synchronization

Synchronize static assets with pods:

```typescript
async function syncAssets(podName: string, assetDir: string) {
  const pod = k8s.pod(podName);
  
  // Get checksums of current assets in pod
  const remoteChecksums = await pod.exec`find /app/public -type f -exec md5sum {} \\;`.nothrow();
  
  // Get local checksums
  const localChecksums = await $`find ${assetDir} -type f -exec md5sum {} \\;`;
  
  // Simple sync logic (in practice, you'd want more sophisticated comparison)
  console.log('Synchronizing assets...');
  
  // For this example, just copy all assets
  await pod.copyTo(`${assetDir}/`, '/app/public/');
  
  // Invalidate cache (application-specific)
  await pod.exec`curl -X POST http://localhost:8080/admin/clear-cache`.nothrow();
  
  console.log('Assets synchronized and cache cleared');
}
```

## Error Handling

### Robust File Operations

Handle file operation failures gracefully:

```typescript
async function robustFileCopy(
  pod: string,
  localPath: string,
  remotePath: string,
  direction: 'to' | 'from',
  retries = 3
) {
  const k8sPod = k8s.pod(pod);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (direction === 'to') {
        await k8sPod.copyTo(localPath, remotePath);
      } else {
        await k8sPod.copyFrom(remotePath, localPath);
      }
      
      console.log(`File copy successful on attempt ${attempt}`);
      return;
      
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === retries) {
        throw new Error(`File copy failed after ${retries} attempts: ${error.message}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}
```

### Verification and Integrity

Verify file integrity after operations:

```typescript
async function verifiedFileCopy(
  pod: string,
  localPath: string,
  remotePath: string
) {
  const k8sPod = k8s.pod(pod);
  
  // Get local file checksum
  const localChecksum = await $`md5sum ${localPath}`;
  const localHash = localChecksum.stdout.split(' ')[0];
  
  // Copy file to pod
  await k8sPod.copyTo(localPath, remotePath);
  
  // Verify checksum in pod
  const remoteChecksum = await k8sPod.exec`md5sum ${remotePath}`;
  const remoteHash = remoteChecksum.stdout.split(' ')[0];
  
  if (localHash !== remoteHash) {
    throw new Error(`File integrity check failed: ${localHash} != ${remoteHash}`);
  }
  
  console.log(`File copied and verified: ${localPath} -> ${remotePath}`);
}
```

## Batch Operations

### Multiple File Operations

Perform multiple file operations efficiently:

```typescript
async function batchFileOperations(podName: string, operations: Array<{
  type: 'upload' | 'download';
  local: string;
  remote: string;
  container?: string;
}>) {
  const pod = k8s.pod(podName);
  const results = [];
  
  console.log(`Performing ${operations.length} file operations...`);
  
  for (const [index, operation] of operations.entries()) {
    try {
      console.log(`[${index + 1}/${operations.length}] ${operation.type}: ${operation.local} <-> ${operation.remote}`);
      
      if (operation.type === 'upload') {
        await pod.copyTo(operation.local, operation.remote, operation.container);
      } else {
        await pod.copyFrom(operation.remote, operation.local, operation.container);
      }
      
      results.push({ ...operation, success: true });
      
    } catch (error) {
      console.error(`  Failed: ${error.message}`);
      results.push({ ...operation, success: false, error: error.message });
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  
  console.log(`Batch complete: ${successful} successful, ${failed} failed`);
  
  return results;
}

// Usage
const operations = [
  { type: 'upload', local: './config.json', remote: '/app/config.json' },
  { type: 'upload', local: './assets/', remote: '/app/public/' },
  { type: 'download', local: './logs/app.log', remote: '/app/logs/app.log' }
] as const;

await batchFileOperations('web-server', operations);
```

## Security Considerations

### Permission Handling

Handle file permissions appropriately:

```typescript
async function secureFileDeployment(podName: string, configFile: string) {
  const pod = k8s.pod(podName);
  
  // Copy configuration file
  await pod.copyTo(configFile, '/tmp/new-config.json');
  
  // Set appropriate permissions
  await pod.exec`chown app:app /tmp/new-config.json`;
  await pod.exec`chmod 600 /tmp/new-config.json`;
  
  // Move to final location
  await pod.exec`mv /tmp/new-config.json /app/config/secure-config.json`;
  
  console.log('Secure configuration deployed');
}
```

### Sensitive Data Handling

Handle sensitive files securely:

```typescript
async function deploySensitiveConfig(podName: string, secretFile: string) {
  const pod = k8s.pod(podName);
  
  try {
    // Copy sensitive file
    await pod.copyTo(secretFile, '/tmp/secret-config');
    
    // Process in pod (encrypt, move to secure location, etc.)
    await pod.exec`chmod 600 /tmp/secret-config`;
    await pod.exec`mv /tmp/secret-config /app/secrets/config.json`;
    
    // Verify deployment
    const verification = await pod.exec`test -f /app/secrets/config.json && echo "deployed"`;
    if (!verification.stdout.includes('deployed')) {
      throw new Error('Secret configuration deployment verification failed');
    }
    
  } finally {
    // Clean up any temporary files
    await pod.exec`rm -f /tmp/secret-config`.nothrow();
  }
  
  console.log('Sensitive configuration deployed securely');
}
```

## Performance Optimization

### Efficient Transfer Strategies

```typescript
// Good: Use tar for multiple files
async function efficientDirectoryCopy(pod: string, localDir: string, remoteDir: string) {
  const k8sPod = k8s.pod(pod);
  
  // Create tar archive locally
  await $`tar -czf /tmp/transfer.tar.gz -C ${localDir} .`;
  
  // Copy single archive
  await k8sPod.copyTo('/tmp/transfer.tar.gz', '/tmp/transfer.tar.gz');
  
  // Extract in pod
  await k8sPod.exec`mkdir -p ${remoteDir} && tar -xzf /tmp/transfer.tar.gz -C ${remoteDir}`;
  
  // Cleanup
  await $`rm /tmp/transfer.tar.gz`;
  await k8sPod.exec`rm /tmp/transfer.tar.gz`;
}

// Avoid: Individual file copies for many files
// for (const file of manyFiles) {
//   await pod.copyTo(file.local, file.remote); // Inefficient
// }
```

### Best Practices

```typescript
// Good: Check if copy is needed
const localHash = await $`md5sum ${localFile}`;
const remoteHash = await pod.exec`md5sum ${remoteFile}`.nothrow();

if (remoteHash.ok && localHash.stdout.split(' ')[0] === remoteHash.stdout.split(' ')[0]) {
  console.log('File already up to date, skipping copy');
} else {
  await pod.copyTo(localFile, remoteFile);
}

// Good: Use appropriate file paths
await pod.copyTo('./config.json', '/app/config.json'); // Absolute paths
await pod.copyFrom('/var/log/app.log', './logs/app.log');

// Good: Handle large files appropriately
// For very large files, consider using volume mounts or object storage instead
```