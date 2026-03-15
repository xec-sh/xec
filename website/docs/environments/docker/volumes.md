# Volume Management and File Operations

The Docker adapter provides comprehensive volume management and file operations, enabling persistent data storage, file transfers, and efficient data sharing between containers and the host system.

## Volume Creation and Management

### Creating Docker Volumes
Create and manage Docker volumes programmatically:

```javascript
import { DockerAdapter } from '@xec-sh/core';

const docker = new DockerAdapter();

// Create a basic volume
await docker.createVolume('app-data');

// Create volume with specific driver
await docker.createVolume('database-data', {
  driver: 'local'
});

// Create volume with driver options
await docker.createVolume('shared-storage', {
  driver: 'local',
  driverOpts: {
    type: 'tmpfs',
    device: 'tmpfs',
    'o': 'size=100m,uid=1000'
  }
});

// Create volume with labels
await docker.createVolume('backup-volume', {
  driver: 'local',
  labels: {
    'backup.frequency': 'daily',
    'backup.retention': '30d',
    'environment': 'production'
  }
});
```

### Volume Listing and Inspection
Query and inspect existing volumes:

```javascript
// List all volumes
const volumes = await docker.listVolumes();
console.log('Available volumes:', volumes);

// Inspect specific volume
const inspectVolume = async (volumeName) => {
  try {
    const result = await docker.executeDockerCommand([
      'volume', 'inspect', volumeName
    ], {});
    
    const volumeInfo = JSON.parse(result.stdout)[0];
    console.log(`Volume: ${volumeName}`);
    console.log(`- Driver: ${volumeInfo.Driver}`);
    console.log(`- Mountpoint: ${volumeInfo.Mountpoint}`);
    console.log(`- Created: ${volumeInfo.CreatedAt}`);
    console.log(`- Labels:`, volumeInfo.Labels || {});
    
    return volumeInfo;
  } catch (error) {
    console.error(`Failed to inspect volume ${volumeName}:`, error.message);
  }
};

await inspectVolume('app-data');

// Find volumes by label
const findVolumesByLabel = async (labelKey, labelValue = null) => {
  const allVolumes = await docker.listVolumes();
  const matchingVolumes = [];
  
  for (const volume of allVolumes) {
    try {
      const info = await inspectVolume(volume);
      const labels = info.Labels || {};
      
      if (labelValue ? labels[labelKey] === labelValue : labelKey in labels) {
        matchingVolumes.push(volume);
      }
    } catch (error) {
      // Skip volumes that can't be inspected
    }
  }
  
  return matchingVolumes;
};

const backupVolumes = await findVolumesByLabel('backup.frequency');
console.log('Backup volumes:', backupVolumes);
```

## Volume Mounting

### Bind Mounts
Mount host directories into containers:

```javascript
// Mount host directory as read-write
await $({
  adapterOptions: {
    type: 'docker',
    image: 'alpine:latest',
    volumes: ['./app:/workspace'],
    workdir: '/workspace'
  }
})`ls -la`;

// Mount host directory as read-only
await $({
  adapterOptions: {
    type: 'docker',
    image: 'nginx:alpine',
    volumes: ['./config/nginx.conf:/etc/nginx/nginx.conf:ro']
  }
})`nginx -t`;

// Mount multiple host directories
await $({
  adapterOptions: {
    type: 'docker',
    image: 'node:18-alpine',
    volumes: [
      './src:/app/src:ro',           // Source code (read-only)
      './dist:/app/dist',            // Build output (read-write)
      './node_modules:/app/node_modules', // Dependencies
      './logs:/var/log/app'          // Log files
    ],
    workdir: '/app'
  }
})`npm run build`;

// Mount with specific user ownership
await $({
  adapterOptions: {
    type: 'docker',
    image: 'ubuntu:22.04',
    volumes: ['./data:/data'],
    user: '1000:1000'  // Set ownership
  }
})`
  chown -R 1000:1000 /data
  touch /data/test-file.txt
  ls -la /data/
`;
```

### Named Volume Mounts
Use Docker volumes for persistent storage:

```javascript
// Create and use named volume
await docker.createVolume('postgres-data');

await docker.runContainer({
  name: 'database',
  image: 'postgres:15-alpine',
  volumes: ['postgres-data:/var/lib/postgresql/data'],
  env: {
    POSTGRES_DB: 'myapp',
    POSTGRES_USER: 'user',
    POSTGRES_PASSWORD: 'password'
  }
});

// Use volume across multiple containers
await docker.runContainer({
  name: 'backup-tool',
  image: 'alpine:latest',
  volumes: ['postgres-data:/backup-source:ro'],
  command: ['tar', '-czf', '/backup/db-backup.tar.gz', '/backup-source']
});

// Shared volume between containers
await docker.createVolume('shared-workspace');

// Container 1: Producer
await docker.runContainer({
  name: 'producer',
  image: 'alpine:latest',
  volumes: ['shared-workspace:/workspace'],
  command: ['sh', '-c', 'echo "Hello from producer" > /workspace/message.txt']
});

// Container 2: Consumer
await $({
  adapterOptions: {
    type: 'docker',
    image: 'alpine:latest',
    volumes: ['shared-workspace:/workspace']
  }
})`cat /workspace/message.txt`;
```

## File Transfer Operations

### Copy Files to Container
Transfer files from host to container:

```javascript
// Copy file to running container
await docker.copyToContainer(
  './config.json',           // Source file on host
  'web-app',                 // Target container
  '/app/config.json'         // Destination path in container
);

// Copy directory to container
await docker.copyToContainer(
  './static-assets/',        // Source directory
  'web-server',              // Target container
  '/var/www/html/'           // Destination directory
);

// Verify file copy
const verification = await $({
  adapterOptions: {
    type: 'docker',
    container: 'web-app'
  }
})`ls -la /app/config.json`;

console.log('File copied successfully:', verification.stdout);

// Copy with ownership change
await docker.copyToContainer('./app.jar', 'java-app', '/app/');
await $({
  adapterOptions: {
    type: 'docker',
    container: 'java-app',
    user: 'root'
  }
})`chown appuser:appuser /app/app.jar`;
```

### Copy Files from Container
Extract files from container to host:

```javascript
// Copy file from container to host
await docker.copyFromContainer(
  'web-app',                 // Source container
  '/app/logs/application.log', // Source path in container
  './logs/'                  // Destination directory on host
);

// Copy entire directory
await docker.copyFromContainer(
  'build-container',         // Source container
  '/app/dist/',              // Source directory
  './build-output/'          // Destination directory
);

// Backup container data
const backupContainer = async (containerName, volumePath, backupPath) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `${backupPath}/${containerName}-${timestamp}.tar.gz`;
  
  // Create compressed backup
  await $({
    adapterOptions: {
      type: 'docker',
      container: containerName
    }
  })`tar -czf /tmp/backup.tar.gz -C ${volumePath} .`;
  
  // Copy backup to host
  await docker.copyFromContainer(
    containerName,
    '/tmp/backup.tar.gz',
    backupFile
  );
  
  // Clean up temporary file
  await $({
    adapterOptions: {
      type: 'docker',
      container: containerName
    }
  })`rm /tmp/backup.tar.gz`;
  
  console.log(`Backup created: ${backupFile}`);
  return backupFile;
};

await backupContainer('database', '/var/lib/postgresql/data', './backups');
```

### Streaming File Operations
Stream files between containers and host:

```javascript
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Stream file from host to container
const streamToContainer = async (hostFile, container, containerPath) => {
  const readStream = createReadStream(hostFile);
  
  const dockerProcess = await $({
    stdin: readStream,
    adapterOptions: {
      type: 'docker',
      container: container
    }
  })`cat > ${containerPath}`;
  
  console.log(`Streamed ${hostFile} to ${container}:${containerPath}`);
};

await streamToContainer('./large-file.dat', 'processor', '/tmp/input.dat');

// Stream file from container to host
const streamFromContainer = async (container, containerPath, hostFile) => {
  const writeStream = createWriteStream(hostFile);
  
  const result = await $({
    adapterOptions: {
      type: 'docker',
      container: container
    }
  })`cat ${containerPath}`;
  
  writeStream.write(result.stdout);
  writeStream.end();
  
  console.log(`Streamed ${container}:${containerPath} to ${hostFile}`);
};

await streamFromContainer('processor', '/tmp/output.dat', './result.dat');

// Stream processing pipeline
const processFileInContainer = async (inputFile, outputFile) => {
  const inputStream = createReadStream(inputFile);
  const outputStream = createWriteStream(outputFile);
  
  // Process file through container
  const dockerProcess = spawn('docker', [
    'run', '--rm', '-i',
    'alpine:latest',
    'sh', '-c', 'gzip | base64'
  ]);
  
  await pipeline(
    inputStream,
    dockerProcess.stdin
  );
  
  await pipeline(
    dockerProcess.stdout,
    outputStream
  );
  
  console.log(`Processed ${inputFile} -> ${outputFile}`);
};

await processFileInContainer('./input.txt', './output.gz.b64');
```

## Volume Backup and Restore

### Volume Backup Strategies
Implement comprehensive volume backup solutions:

```javascript
class VolumeBackupManager {
  constructor() {
    this.docker = new DockerAdapter();
  }

  async backupVolume(volumeName, backupPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${backupPath}/${volumeName}-${timestamp}.tar.gz`;
    
    console.log(`Backing up volume ${volumeName}...`);
    
    try {
      // Create backup container
      await this.docker.runContainer({
        name: `backup-${timestamp}`,
        image: 'alpine:latest',
        volumes: [
          `${volumeName}:/backup-source:ro`,
          `${backupPath}:/backup-dest`
        ],
        command: [
          'tar', '-czf', 
          `/backup-dest/${volumeName}-${timestamp}.tar.gz`,
          '-C', '/backup-source', '.'
        ]
      });
      
      console.log(`Backup completed: ${backupFile}`);
      return backupFile;
    } catch (error) {
      console.error(`Backup failed: ${error.message}`);
      throw error;
    }
  }

  async restoreVolume(volumeName, backupFile) {
    console.log(`Restoring volume ${volumeName} from ${backupFile}...`);
    
    try {
      // Create volume if it doesn't exist
      try {
        await this.docker.createVolume(volumeName);
      } catch (error) {
        // Volume might already exist
      }
      
      // Extract backup to volume
      const timestamp = Date.now();
      await this.docker.runContainer({
        name: `restore-${timestamp}`,
        image: 'alpine:latest',
        volumes: [
          `${volumeName}:/restore-dest`,
          `${path.dirname(backupFile)}:/backup-source:ro`
        ],
        command: [
          'tar', '-xzf', 
          `/backup-source/${path.basename(backupFile)}`,
          '-C', '/restore-dest'
        ]
      });
      
      console.log(`Restore completed for volume ${volumeName}`);
    } catch (error) {
      console.error(`Restore failed: ${error.message}`);
      throw error;
    }
  }

  async listBackups(backupPath) {
    const backupFiles = await fs.readdir(backupPath);
    return backupFiles.filter(file => file.endsWith('.tar.gz'));
  }

  async migrateVolume(sourceVolume, targetVolume) {
    console.log(`Migrating volume ${sourceVolume} to ${targetVolume}...`);
    
    try {
      // Create target volume
      await this.docker.createVolume(targetVolume);
      
      // Copy data between volumes
      const timestamp = Date.now();
      await this.docker.runContainer({
        name: `migrate-${timestamp}`,
        image: 'alpine:latest',
        volumes: [
          `${sourceVolume}:/source:ro`,
          `${targetVolume}:/target`
        ],
        command: ['sh', '-c', 'cp -a /source/. /target/']
      });
      
      console.log(`Migration completed: ${sourceVolume} -> ${targetVolume}`);
    } catch (error) {
      console.error(`Migration failed: ${error.message}`);
      throw error;
    }
  }

  async syncVolumes(sourceVolume, targetVolume, options = {}) {
    const { deleteExtra = false, excludePatterns = [] } = options;
    
    console.log(`Syncing volume ${sourceVolume} to ${targetVolume}...`);
    
    try {
      // Build rsync command
      let rsyncCmd = 'rsync -av';
      if (deleteExtra) rsyncCmd += ' --delete';
      
      for (const pattern of excludePatterns) {
        rsyncCmd += ` --exclude='${pattern}'`;
      }
      
      rsyncCmd += ' /source/ /target/';
      
      // Sync volumes using rsync
      const timestamp = Date.now();
      await this.docker.runContainer({
        name: `sync-${timestamp}`,
        image: 'alpine:latest',
        volumes: [
          `${sourceVolume}:/source:ro`,
          `${targetVolume}:/target`
        ],
        command: ['sh', '-c', `apk add --no-cache rsync && ${rsyncCmd}`]
      });
      
      console.log(`Sync completed: ${sourceVolume} -> ${targetVolume}`);
    } catch (error) {
      console.error(`Sync failed: ${error.message}`);
      throw error;
    }
  }
}

// Usage
const backupManager = new VolumeBackupManager();

// Backup volume
const backupFile = await backupManager.backupVolume('app-data', './backups');

// Restore volume
await backupManager.restoreVolume('app-data-restored', backupFile);

// Migrate volume
await backupManager.migrateVolume('old-data', 'new-data');

// Sync volumes with exclusions
await backupManager.syncVolumes('source-data', 'target-data', {
  deleteExtra: true,
  excludePatterns: ['*.log', 'tmp/*', '.cache']
});
```

### Automated Backup Scheduling
Schedule regular volume backups:

```javascript
class ScheduledBackup {
  constructor(schedule = '0 2 * * *') { // Daily at 2 AM
    this.docker = new DockerAdapter();
    this.backupManager = new VolumeBackupManager();
    this.schedule = schedule;
    this.running = false;
  }

  async start() {
    if (this.running) return;
    
    this.running = true;
    console.log(`Starting scheduled backup with cron: ${this.schedule}`);
    
    // Use node-cron or similar for scheduling
    const cron = require('node-cron');
    
    this.task = cron.schedule(this.schedule, async () => {
      await this.performScheduledBackup();
    });
  }

  async performScheduledBackup() {
    console.log('Starting scheduled backup...');
    
    try {
      // Get all volumes with backup label
      const volumes = await this.docker.listVolumes();
      const backupVolumes = [];
      
      for (const volume of volumes) {
        try {
          const result = await this.docker.executeDockerCommand([
            'volume', 'inspect', volume
          ], {});
          
          const volumeInfo = JSON.parse(result.stdout)[0];
          const labels = volumeInfo.Labels || {};
          
          if (labels['backup.enabled'] === 'true') {
            backupVolumes.push({
              name: volume,
              retention: labels['backup.retention'] || '30d',
              path: labels['backup.path'] || './backups'
            });
          }
        } catch (error) {
          console.warn(`Failed to inspect volume ${volume}:`, error.message);
        }
      }
      
      // Backup each volume
      for (const volume of backupVolumes) {
        try {
          const backupFile = await this.backupManager.backupVolume(
            volume.name, 
            volume.path
          );
          
          console.log(`Backed up ${volume.name}: ${backupFile}`);
          
          // Clean up old backups based on retention
          await this.cleanupOldBackups(volume.name, volume.path, volume.retention);
        } catch (error) {
          console.error(`Failed to backup ${volume.name}:`, error.message);
        }
      }
      
      console.log('Scheduled backup completed');
    } catch (error) {
      console.error('Scheduled backup failed:', error.message);
    }
  }

  async cleanupOldBackups(volumeName, backupPath, retention) {
    // Parse retention (e.g., "30d", "7d", "24h")
    const retentionMs = this.parseRetention(retention);
    const cutoff = Date.now() - retentionMs;
    
    try {
      const files = await fs.readdir(backupPath);
      const backupFiles = files.filter(file => 
        file.startsWith(`${volumeName}-`) && file.endsWith('.tar.gz')
      );
      
      for (const file of backupFiles) {
        const filePath = path.join(backupPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoff) {
          await fs.unlink(filePath);
          console.log(`Removed old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error(`Failed to cleanup old backups for ${volumeName}:`, error.message);
    }
  }

  parseRetention(retention) {
    const match = retention.match(/^(\d+)([hdw])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000; // Default 30 days
    
    const [, amount, unit] = match;
    const multipliers = {
      'h': 60 * 60 * 1000,        // hours
      'd': 24 * 60 * 60 * 1000,   // days
      'w': 7 * 24 * 60 * 60 * 1000 // weeks
    };
    
    return parseInt(amount) * multipliers[unit];
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.running = false;
      console.log('Scheduled backup stopped');
    }
  }
}

// Usage
const scheduler = new ScheduledBackup('0 2 * * *'); // Daily at 2 AM
await scheduler.start();

// Stop on exit
process.on('SIGINT', () => {
  scheduler.stop();
  process.exit(0);
});
```

## Volume Cleanup

### Remove Unused Volumes
Clean up orphaned and unused volumes:

```javascript
// Remove specific volume
await docker.removeVolume('temp-volume');

// Force remove volume even if in use
await docker.removeVolume('stuck-volume', true);

// Clean up unused volumes
const cleanupUnusedVolumes = async () => {
  console.log('Cleaning up unused volumes...');
  
  try {
    // Docker's built-in cleanup
    const result = await docker.executeDockerCommand([
      'volume', 'prune', '-f'
    ], {});
    
    console.log('Cleanup result:', result.stdout);
  } catch (error) {
    console.error('Volume cleanup failed:', error.message);
  }
};

await cleanupUnusedVolumes();

// Selective volume cleanup
const cleanupVolumesByAge = async (maxAge = 30) => {
  const volumes = await docker.listVolumes();
  const cutoff = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
  
  for (const volume of volumes) {
    try {
      const result = await docker.executeDockerCommand([
        'volume', 'inspect', volume
      ], {});
      
      const volumeInfo = JSON.parse(result.stdout)[0];
      const created = new Date(volumeInfo.CreatedAt).getTime();
      
      if (created < cutoff) {
        // Check if volume is in use
        const containersResult = await docker.executeDockerCommand([
          'ps', '-a', '--filter', `volume=${volume}`, '--format', '{{.Names}}'
        ], {});
        
        if (!containersResult.stdout.trim()) {
          console.log(`Removing old unused volume: ${volume}`);
          await docker.removeVolume(volume);
        }
      }
    } catch (error) {
      console.warn(`Failed to cleanup volume ${volume}:`, error.message);
    }
  }
};

await cleanupVolumesByAge(7); // Remove volumes older than 7 days
```

This comprehensive volume management system provides all the tools needed for persistent data storage, efficient file operations, and robust backup strategies in Docker environments.