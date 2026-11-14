---
title: Backup and Restore
description: Implement backup and restore strategies using Xec
keywords: [backup, restore, disaster recovery, data protection, snapshots]
source_files:
  - packages/core/src/core/execution-engine.ts
  - apps/xec/src/commands/run.ts
---

# Backup and Restore {#backup-and-restore}

## Problem {#problem}

Implementing reliable backup and restore procedures for databases, files, configurations, and application state across different environments while ensuring data integrity and minimal downtime.

## Solution {#solution}

Xec orchestrates the database tools and application acceptance checks. This recipe creates a PostgreSQL archive, records its digest after successful completion, and verifies it before restoration to a separate empty database. It does not claim automatic cross-database consistency or provide a retention scheduler.

## Quick Example {#quick-example}

```typescript
const source = process.env.PGSERVICE;
if (!source) throw new Error('Select a PostgreSQL connection service with PGSERVICE');
const file = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
await $`pg_dump --dbname ${`service=${source}`} --format=custom --file ${file}`;
await $`pg_restore --list ${file}`;
// Listing confirms archive readability, not application-level restore acceptance.
```

## Complete Backup and Restore Recipes {#complete-backup-and-restore-recipes}

### Configuration {#configuration}

```yaml
version: '1.0'
tasks:
  backup:
    description: Create and verify a PostgreSQL archive
    command: xec run scripts/backup.ts
  restore:
    description: Restore a verified archive into a separate empty test database
    params:
      - name: directory
        required: true
    command: xec run scripts/restore.ts ${params.directory}
```

### Comprehensive Backup Script {#comprehensive-backup-script}

```typescript
// scripts/backup.ts — pg_service.conf and credentials are provisioned separately.
import { mkdir, mkdtemp, writeFile, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const source = process.env.PGSERVICE;
if (!source) throw new Error('PGSERVICE is required');
const root = path.resolve('backups');
await mkdir(root, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(path.join(root, 'postgres-'));
const pending = path.join(directory, 'postgres.dump.pending');
await $`pg_dump --dbname ${`service=${source}`} --format=custom --file ${pending}`.timeout(3_600_000);
await $`pg_restore --list ${pending}`.quiet();
const hash = createHash('sha256');
for await (const chunk of createReadStream(pending)) hash.update(chunk);
await rename(pending, path.join(directory, 'postgres.dump'));
const manifest = {
  protocol: 1,
  source,
  file: 'postgres.dump',
  sha256: hash.digest('hex'),
  createdAt: new Date().toISOString()
};
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
console.log(`Verified archive: ${directory}`);
// An interrupted backup has no manifest. Retention/deletion is a separate policy.
const destination = process.env.BACKUP_S3_URI;
if (destination) await $`aws s3 cp ${directory} ${destination} --recursive`;
```

### Restore Script {#restore-script}

```typescript
// scripts/restore.ts — the operator provisions a separate empty destination.
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const directory = args[0];
const target = process.env.RESTORE_SERVICE;
if (!directory || !target) throw new Error('Pass a backup directory and RESTORE_SERVICE');
const manifest: unknown = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
if (!manifest || typeof manifest !== 'object' || !('protocol' in manifest) || manifest.protocol !== 1 ||
    !('file' in manifest) || manifest.file !== 'postgres.dump' ||
    !('source' in manifest) || typeof manifest.source !== 'string' ||
    !('sha256' in manifest) || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
  throw new Error('Invalid backup manifest');
}
if (target === manifest.source) throw new Error('Restore acceptance must use a separate destination');
const file = path.join(directory, manifest.file);
const hash = createHash('sha256');
for await (const chunk of createReadStream(file)) hash.update(chunk);
if (hash.digest('hex') !== manifest.sha256) throw new Error('Archive checksum mismatch');
// Verify before touching the destination. No DROP, --clean or blanket extraction.
await $`pg_restore --list ${file}`.quiet();
await $`pg_restore --exit-on-error --single-transaction --no-owner --dbname ${`service=${target}`} ${file}`.timeout(3_600_000);
// This application-owned script verifies rows, invariants and compatibility.
await $`npm run verify:restored-db`.env({ PGSERVICE: target });
console.log('Restore and application verification completed');
```

## Usage Examples {#usage-examples}

```bash
PGSERVICE=source-readonly xec run scripts/backup.ts
RESTORE_SERVICE=isolated-restore xec run scripts/restore.ts backups/postgres-example
```

Configure the PostgreSQL service names and the application's `verify:restored-db` command first. Schedule the backup command through an existing service scheduler. Store an independently authenticated manifest or trusted digest when detecting malicious archive replacement matters; a colocated checksum alone is not a signature.

## Best Practices {#best-practices}

1. **Test restore procedures** regularly
2. **Use 3-2-1 backup rule** (3 copies, 2 different media, 1 offsite)
3. **Encrypt sensitive backups** before storage
4. **Monitor backup success/failure**
5. **Document restore procedures**
6. **Implement backup rotation** policies
7. **Verify backup integrity** with checksums

## Related Topics {#related-topics}

- [Health Checks](health-checks.md)
- [Certificate Renewal](certificate-renewal.md)
- [Log Aggregation](log-aggregation.md)
- [Health Checks](health-checks.md)