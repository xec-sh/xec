---
title: Backup and Restore
description: Implement backup and restore strategies using Xec
keywords: [backup, restore, disaster recovery, data protection, snapshots]
source_files:
  - packages/core/src/operations/file.ts
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/adapters/docker-adapter.ts
key_functions:
  - FileOperations.copy()
  - SSHAdapter.execute()
  - DockerAdapter.exec()
verification_date: 2025-01-03
---

# Backup and Restore

## Problem

Implementing reliable backup and restore procedures for databases, files, configurations, and application state across different environments while ensuring data integrity and minimal downtime.

## Solution

Xec provides comprehensive backup automation through its execution engine, enabling scheduled backups, incremental strategies, and tested restore procedures across all target environments.

## Quick Example

```typescript
// backup.ts
import { $ } from '@xec-sh/core';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// Backup database
await $`
  pg_dump -h localhost -U postgres mydb | \
  gzip > backup-${timestamp}.sql.gz
`;

// Upload to S3
await $`
  aws s3 cp backup-${timestamp}.sql.gz \
  s3://backups/database/${timestamp}/
`;
```

## Complete Backup and Restore Recipes

### Configuration

```yaml
# .xec/config.yaml
backup:
  schedule: "0 2 * * *"  # 2 AM daily
  retention:
    daily: 7
    weekly: 4
    monthly: 12
  destinations:
    - type: s3
      bucket: company-backups
      region: us-east-1
    - type: rsync
      host: backup.example.com
      path: /backups
      
targets:
  databases:
    - postgres-primary
    - mysql-primary
    - mongodb-primary
  servers:
    - web-1
    - web-2
    - app-1
    
tasks:
  backup:
    description: Run full backup
    command: xec run scripts/backup.ts
  restore:
    description: Restore from backup
    params:
      - name: timestamp
        required: true
      - name: target
        required: true
    command: xec run scripts/restore.ts ${params.timestamp} ${params.target}
```

### Comprehensive Backup Script

```typescript
// scripts/backup.ts
import { $, $$ } from '@xec-sh/core';
import chalk from 'chalk';
import { createHash } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';

const backupType = process.argv[2] || 'full';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = `/backup/${timestamp}`;

console.log(chalk.blue(`🔐 Starting ${backupType} backup at ${timestamp}...`));

// Backup manifest to track all backups
const manifest = {
  timestamp,
  type: backupType,
  components: [],
  checksums: {},
  status: 'in_progress'
};

// Database backup strategies
async function backupPostgreSQL() {
  console.log(chalk.gray('Backing up PostgreSQL...'));
  
  const databases = await $`
    psql -h postgres-primary -U postgres -t -c \
    "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1')"
  `.text();
  
  for (const db of databases.split('\n').filter(Boolean)) {
    const dbName = db.trim();
    const backupFile = `${backupDir}/postgres-${dbName}-${timestamp}.sql.gz`;
    
    // Full backup with compression
    await $`
      pg_dump -h postgres-primary -U postgres \
        --clean --if-exists --create \
        --exclude-table-data='*.logs' \
        --exclude-table-data='*.sessions' \
        ${dbName} | gzip -9 > ${backupFile}
    `;
    
    // Calculate checksum
    const checksum = await calculateChecksum(backupFile);
    manifest.checksums[`postgres-${dbName}`] = checksum;
    
    // Verify backup
    const verified = await $`
      gunzip -c ${backupFile} | head -n 100 | grep -q "PostgreSQL database dump"
    `.nothrow();
    
    if (verified.ok) {
      console.log(chalk.green(`  ✓ PostgreSQL ${dbName} backed up`));
      manifest.components.push({
        type: 'postgresql',
        database: dbName,
        file: backupFile,
        size: await getFileSize(backupFile)
      });
    } else {
      throw new Error(`PostgreSQL backup verification failed for ${dbName}`);
    }
  }
  
  // Backup WAL archives for point-in-time recovery
  if (backupType === 'full') {
    await $`
      rsync -avz postgres-primary:/var/lib/postgresql/wal_archive/ \
        ${backupDir}/postgres-wal/
    `;
  }
}

async function backupMySQL() {
  console.log(chalk.gray('Backing up MySQL...'));
  
  const backupFile = `${backupDir}/mysql-all-${timestamp}.sql.gz`;
  
  // Full backup with binary log position
  await $`
    mysqldump -h mysql-primary -u root \
      --all-databases \
      --single-transaction \
      --routines \
      --triggers \
      --events \
      --master-data=2 \
      --flush-logs | gzip -9 > ${backupFile}
  `;
  
  // Backup binary logs for incremental restore
  if (backupType === 'incremental') {
    await $`
      mysqlbinlog -h mysql-primary -u root \
        --read-from-remote-server \
        --raw \
        --stop-never \
        --result-file=${backupDir}/mysql-binlog- \
        binlog.000001
    `;
  }
  
  const checksum = await calculateChecksum(backupFile);
  manifest.checksums['mysql-all'] = checksum;
  
  console.log(chalk.green('  ✓ MySQL backed up'));
  manifest.components.push({
    type: 'mysql',
    database: 'all',
    file: backupFile,
    size: await getFileSize(backupFile)
  });
}

async function backupMongoDB() {
  console.log(chalk.gray('Backing up MongoDB...'));
  
  const backupPath = `${backupDir}/mongodb`;
  
  // Full backup with oplog
  await $`
    mongodump --host mongodb-primary \
      --out ${backupPath} \
      --oplog \
      --gzip
  `;
  
  // Create archive
  await $`
    tar -czf ${backupPath}.tar.gz -C ${backupDir} mongodb
  `;
  
  const checksum = await calculateChecksum(`${backupPath}.tar.gz`);
  manifest.checksums['mongodb'] = checksum;
  
  console.log(chalk.green('  ✓ MongoDB backed up'));
  manifest.components.push({
    type: 'mongodb',
    database: 'all',
    file: `${backupPath}.tar.gz`,
    size: await getFileSize(`${backupPath}.tar.gz`)
  });
}

// File system backup
async function backupFileSystem() {
  console.log(chalk.gray('Backing up file systems...'));
  
  const targets = [
    { name: 'web-content', path: '/var/www', exclude: ['cache', 'tmp'] },
    { name: 'app-data', path: '/app/data', exclude: ['logs', 'temp'] },
    { name: 'configs', path: '/etc', exclude: [] },
    { name: 'user-uploads', path: '/uploads', exclude: ['thumbnails'] }
  ];
  
  for (const target of targets) {
    const backupFile = `${backupDir}/${target.name}-${timestamp}.tar.gz`;
    
    // Create incremental backup if previous exists
    let incrementalFlag = '';
    if (backupType === 'incremental') {
      const snapshotFile = `/backup/snapshots/${target.name}.snar`;
      incrementalFlag = `--listed-incremental=${snapshotFile}`;
    }
    
    // Create backup with exclusions
    const excludeFlags = target.exclude.map(e => `--exclude='${e}'`).join(' ');
    
    await $`
      tar ${incrementalFlag} ${excludeFlags} \
        -czf ${backupFile} \
        -C / \
        ${target.path}
    `;
    
    const checksum = await calculateChecksum(backupFile);
    manifest.checksums[target.name] = checksum;
    
    console.log(chalk.green(`  ✓ ${target.name} backed up`));
    manifest.components.push({
      type: 'filesystem',
      name: target.name,
      path: target.path,
      file: backupFile,
      size: await getFileSize(backupFile)
    });
  }
}

// Docker volumes backup
async function backupDockerVolumes() {
  console.log(chalk.gray('Backing up Docker volumes...'));
  
  const volumes = await $`
    docker volume ls --format "{{.Name}}"
  `.text();
  
  for (const volume of volumes.split('\n').filter(Boolean)) {
    const backupFile = `${backupDir}/docker-volume-${volume}-${timestamp}.tar.gz`;
    
    // Backup volume using temporary container
    await $`
      docker run --rm \
        -v ${volume}:/backup-source:ro \
        -v ${backupDir}:/backup-dest \
        alpine \
        tar -czf /backup-dest/docker-volume-${volume}-${timestamp}.tar.gz \
        -C /backup-source .
    `;
    
    const checksum = await calculateChecksum(backupFile);
    manifest.checksums[`docker-${volume}`] = checksum;
    
    console.log(chalk.green(`  ✓ Docker volume ${volume} backed up`));
    manifest.components.push({
      type: 'docker-volume',
      volume,
      file: backupFile,
      size: await getFileSize(backupFile)
    });
  }
}

// Upload backups to remote storage
async function uploadBackups() {
  console.log(chalk.gray('Uploading backups to remote storage...'));
  
  // Upload to S3
  await $`
    aws s3 sync ${backupDir} \
      s3://company-backups/${timestamp}/ \
      --storage-class GLACIER_IR \
      --metadata backup-type=${backupType}
  `;
  
  // Upload to remote backup server
  await $`
    rsync -avz --progress \
      ${backupDir}/ \
      backup@backup.example.com:/backups/${timestamp}/
  `;
  
  // Upload to Google Cloud Storage
  await $`
    gsutil -m rsync -r ${backupDir} \
      gs://company-backups/${timestamp}/
  `.nothrow();
  
  console.log(chalk.green('  ✓ Backups uploaded to remote storage'));
}

// Cleanup old backups
async function cleanupOldBackups() {
  console.log(chalk.gray('Cleaning up old backups...'));
  
  const retention = {
    daily: 7,
    weekly: 4,
    monthly: 12
  };
  
  // Clean local backups
  await $`
    find /backup -type d -name "20*" -mtime +${retention.daily} \
      -exec rm -rf {} + 2>/dev/null || true
  `;
  
  // Clean S3 backups
  await $`
    aws s3 ls s3://company-backups/ | \
    awk '{print $2}' | \
    while read dir; do
      age=$(date -d "$dir" +%s 2>/dev/null || echo 0)
      now=$(date +%s)
      days=$(( (now - age) / 86400 ))
      if [ $days -gt ${retention.daily} ]; then
        aws s3 rm --recursive s3://company-backups/$dir
      fi
    done
  `.nothrow();
  
  console.log(chalk.green('  ✓ Old backups cleaned up'));
}

// Helper functions
async function calculateChecksum(file: string): Promise<string> {
  const content = await readFile(file);
  return createHash('sha256').update(content).digest('hex');
}

async function getFileSize(file: string): Promise<string> {
  const result = await $`du -h ${file} | cut -f1`.text();
  return result.trim();
}

// Execute backup workflow
async function runBackup() {
  try {
    // Create backup directory
    await $`mkdir -p ${backupDir}`;
    
    // Run backups in parallel where possible
    await Promise.all([
      backupPostgreSQL(),
      backupMySQL(),
      backupMongoDB()
    ]);
    
    await backupFileSystem();
    await backupDockerVolumes();
    
    // Save manifest
    manifest.status = 'completed';
    manifest.completedAt = new Date().toISOString();
    await writeFile(
      `${backupDir}/manifest.json`,
      JSON.stringify(manifest, null, 2)
    );
    
    // Upload to remote storage
    await uploadBackups();
    
    // Cleanup old backups
    await cleanupOldBackups();
    
    // Send notification
    await $`
      curl -X POST ${process.env.SLACK_WEBHOOK} \
        -H 'Content-Type: application/json' \
        -d '{
          "text": "✅ Backup completed successfully",
          "attachments": [{
            "color": "good",
            "fields": [
              {"title": "Type", "value": "'${backupType}'", "short": true},
              {"title": "Components", "value": "'${manifest.components.length}'", "short": true},
              {"title": "Timestamp", "value": "'${timestamp}'", "short": false}
            ]
          }]
        }'
    `.nothrow();
    
    console.log(chalk.green(`\n✅ Backup completed successfully!`));
    console.log(chalk.gray(`   Backup ID: ${timestamp}`));
    console.log(chalk.gray(`   Components: ${manifest.components.length}`));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Backup failed: ${error.message}`));
    
    // Send alert
    await $`
      curl -X POST ${process.env.SLACK_WEBHOOK} \
        -H 'Content-Type: application/json' \
        -d '{
          "text": "❌ Backup failed!",
          "attachments": [{
            "color": "danger",
            "text": "'${error.message}'"
          }]
        }'
    `.nothrow();
    
    process.exit(1);
  }
}

// Run backup
await runBackup();
```

### Restore Script

```typescript
// scripts/restore.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';
import { readFile } from 'fs/promises';

const backupId = process.argv[2];
const targetComponent = process.argv[3] || 'all';

console.log(chalk.blue(`🔄 Starting restore from backup ${backupId}...`));

// Load backup manifest
const manifestPath = `/backup/${backupId}/manifest.json`;
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

// Restore functions
async function restorePostgreSQL(component: any) {
  console.log(chalk.gray(`Restoring PostgreSQL ${component.database}...`));
  
  // Drop existing database
  await $`
    psql -h postgres-primary -U postgres -c \
    "DROP DATABASE IF EXISTS ${component.database}"
  `.nothrow();
  
  // Restore from backup
  await $`
    gunzip -c ${component.file} | \
    psql -h postgres-primary -U postgres
  `;
  
  // Verify checksum
  const checksum = await calculateChecksum(component.file);
  if (checksum !== manifest.checksums[`postgres-${component.database}`]) {
    throw new Error('Checksum verification failed');
  }
  
  console.log(chalk.green(`  ✓ PostgreSQL ${component.database} restored`));
}

async function restoreMySQL(component: any) {
  console.log(chalk.gray('Restoring MySQL...'));
  
  // Restore from backup
  await $`
    gunzip -c ${component.file} | \
    mysql -h mysql-primary -u root
  `;
  
  console.log(chalk.green('  ✓ MySQL restored'));
}

async function restoreMongoDB(component: any) {
  console.log(chalk.gray('Restoring MongoDB...'));
  
  // Extract archive
  await $`tar -xzf ${component.file} -C /tmp`;
  
  // Restore with mongorestore
  await $`
    mongorestore --host mongodb-primary \
      --drop \
      --oplogReplay \
      /tmp/mongodb
  `;
  
  console.log(chalk.green('  ✓ MongoDB restored'));
}

async function restoreFileSystem(component: any) {
  console.log(chalk.gray(`Restoring ${component.name}...`));
  
  // Restore files
  await $`
    tar -xzf ${component.file} -C /
  `;
  
  console.log(chalk.green(`  ✓ ${component.name} restored`));
}

// Restore workflow
async function runRestore() {
  try {
    // Download from remote if not local
    if (!await $`test -d /backup/${backupId}`.nothrow().ok) {
      console.log(chalk.gray('Downloading backup from remote storage...'));
      await $`
        aws s3 sync s3://company-backups/${backupId}/ /backup/${backupId}/
      `;
    }
    
    // Restore components
    for (const component of manifest.components) {
      if (targetComponent === 'all' || component.type === targetComponent) {
        switch (component.type) {
          case 'postgresql':
            await restorePostgreSQL(component);
            break;
          case 'mysql':
            await restoreMySQL(component);
            break;
          case 'mongodb':
            await restoreMongoDB(component);
            break;
          case 'filesystem':
            await restoreFileSystem(component);
            break;
        }
      }
    }
    
    console.log(chalk.green(`\n✅ Restore completed successfully!`));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Restore failed: ${error.message}`));
    process.exit(1);
  }
}

await runRestore();
```

## Usage Examples

```bash
# Run full backup
xec backup

# Run incremental backup
xec run scripts/backup.ts incremental

# Restore from specific backup
xec restore --timestamp=2024-01-15T02-00-00 --target=postgresql

# Test restore procedure
xec run scripts/test-restore.ts

# Schedule automated backups
xec run scripts/schedule-backups.ts
```

## Best Practices

1. **Test restore procedures** regularly
2. **Use 3-2-1 backup rule** (3 copies, 2 different media, 1 offsite)
3. **Encrypt sensitive backups** before storage
4. **Monitor backup success/failure**
5. **Document restore procedures**
6. **Implement backup rotation** policies
7. **Verify backup integrity** with checksums

## Related Topics

- [Health Checks](health-checks.md)
- [Certificate Renewal](certificate-renewal.md)
- [Log Aggregation](log-aggregation.md)
- [Health Checks](health-checks.md)