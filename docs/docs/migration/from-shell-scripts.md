---
title: Migrating from Shell Scripts
description: Complete guide for migrating bash/sh scripts to Xec
keywords: [migration, bash, shell, scripts, automation]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/core/src/adapters/local-adapter.ts
  - apps/xec/src/script-runner.ts
verification_date: 2025-08-03
---

# Migrating from Shell Scripts to Xec

## Overview

This guide helps you migrate from traditional bash/sh scripts to Xec's TypeScript-based scripting system. Xec provides the power and familiarity of shell scripting with the safety of TypeScript, cross-platform compatibility, and enhanced error handling.

## Why Migrate from Shell Scripts?

### Shell Script Limitations

```bash
#!/bin/bash
# deploy.sh - Traditional deployment script

set -euo pipefail

ENV=${1:-staging}
VERSION=$(git describe --tags --always)

# Platform-specific commands
if [[ "$OSTYPE" == "darwin"* ]]; then
    SED_CMD="sed -i ''"
else
    SED_CMD="sed -i"
fi

# Error-prone string manipulation
for server in $(cat servers.txt | grep "^$ENV"); do
    echo "Deploying to $server..."
    
    # No proper error handling
    ssh $server "mkdir -p /app" || exit 1
    scp -r dist/* $server:/app/ || exit 1
    
    # Complex command construction
    ssh $server "cd /app && \
        $SED_CMD 's/VERSION_PLACEHOLDER/$VERSION/g' config.json && \
        systemctl restart app"
done

echo "Deployment complete"
```

**Problems:**
- Platform-specific syntax
- String manipulation is error-prone
- Limited error handling
- No type safety
- Difficult debugging
- Poor IDE support

### Xec Advantages

```typescript
// scripts/deploy.ts
import { $, on } from '@xec-sh/core';
import { readFile } from 'fs/promises';

const env = process.argv[2] || 'staging';
const version = await $`git describe --tags --always`.text();

// Type-safe server configuration
interface Server {
  name: string;
  host: string;
  env: string;
}

const servers: Server[] = JSON.parse(
  await readFile('servers.json', 'utf-8')
);

const targetServers = servers.filter(s => s.env === env);

// Deploy with proper error handling
for (const server of targetServers) {
  console.log(`Deploying to ${server.name}...`);
  
  try {
    await on(server.host, 'mkdir -p /app');
    await $`xec copy dist/ ${server.host}:/app/`;
    
    await on(server.host, `
      cd /app &&
      sed -i 's/VERSION_PLACEHOLDER/${version}/g' config.json &&
      systemctl restart app
    `);
  } catch (error) {
    console.error(`Failed to deploy to ${server.name}:`, error);
    throw error; // Or continue with next server
  }
}

console.log('✅ Deployment complete');
```

**Benefits:**
- Cross-platform by default
- Type safety with TypeScript
- Structured error handling
- Better debugging with source maps
- Full IDE support
- NPM ecosystem access

## Core Concepts Mapping

### Shell → Xec

| Shell Concept | Xec Equivalent | Example |
|---------------|----------------|---------|
| `#!/bin/bash` | TypeScript file | `scripts/task.ts` |
| `$VAR` | Template literal | `${variable}` |
| `$(command)` | await $\`command\` | `await $\`ls\`.text()` |
| `command1 \| command2` | Pipe or chain | `$\`cmd1\`.pipe(cmd2)` |
| `&&`, `\|\|` | JavaScript operators | `&&`, `\|\|` |
| `if [ ... ]` | JavaScript if | `if (condition)` |
| `for/while` | JavaScript loops | `for/while` |
| `function` | JavaScript function | `function/async function` |
| `exit 1` | `process.exit(1)` | Or throw error |

## Common Pattern Migrations

### 1. Variables and Environment

**Bash:**
```bash
#!/bin/bash

# Variables
NAME="MyApp"
VERSION="1.0.0"
BUILD_DIR="${BUILD_DIR:-dist}"

# Environment variables
export NODE_ENV=production
export API_URL="https://api.example.com"

# Command substitution
CURRENT_BRANCH=$(git branch --show-current)
FILE_COUNT=$(ls -1 | wc -l)

# Parameter expansion
echo "Building ${NAME} v${VERSION}"
echo "Files: ${FILE_COUNT:-0}"
```

**Xec:**
```typescript
// scripts/build.ts
import { $ } from '@xec-sh/core';

// Variables with types
const NAME = "MyApp";
const VERSION = "1.0.0";
const BUILD_DIR = process.env.BUILD_DIR || 'dist';

// Environment variables
process.env.NODE_ENV = 'production';
process.env.API_URL = 'https://api.example.com';

// Command substitution
const currentBranch = await $`git branch --show-current`.text();
const fileCount = (await $`ls -1`.lines()).length;

// String interpolation
console.log(`Building ${NAME} v${VERSION}`);
console.log(`Files: ${fileCount || 0}`);
```

### 2. Conditionals

**Bash:**
```bash
# File checks
if [ -f "config.json" ]; then
    echo "Config exists"
fi

if [ ! -d "dist" ]; then
    mkdir dist
fi

# String comparison
if [ "$ENV" = "production" ]; then
    MINIFY=true
else
    MINIFY=false
fi

# Numeric comparison
if [ $COUNT -gt 10 ]; then
    echo "Too many files"
fi

# Command success check
if command -v node >/dev/null 2>&1; then
    echo "Node.js is installed"
fi
```

**Xec:**
```typescript
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { $ } from '@xec-sh/core';

// File checks
if (existsSync('config.json')) {
    console.log('Config exists');
}

if (!existsSync('dist')) {
    await mkdir('dist');
}

// String comparison
const MINIFY = process.env.ENV === 'production';

// Numeric comparison
if (count > 10) {
    console.log('Too many files');
}

// Command existence check
const nodeExists = await $`command -v node`.quiet().nothrow();
if (nodeExists.ok) {
    console.log('Node.js is installed');
}
```

### 3. Loops

**Bash:**
```bash
# For loop over files
for file in *.txt; do
    echo "Processing $file"
    gzip "$file"
done

# For loop with array
servers=("web1" "web2" "web3")
for server in "${servers[@]}"; do
    ssh "$server" "uptime"
done

# While loop
counter=0
while [ $counter -lt 10 ]; do
    echo "Count: $counter"
    ((counter++))
done

# Read file line by line
while IFS= read -r line; do
    echo "Line: $line"
done < input.txt
```

**Xec:**
```typescript
import { $, glob } from '@xec-sh/core';
import { readFile } from 'fs/promises';

// For loop over files
const txtFiles = await glob('*.txt');
for (const file of txtFiles) {
    console.log(`Processing ${file}`);
    await $`gzip ${file}`;
}

// For loop with array
const servers = ['web1', 'web2', 'web3'];
for (const server of servers) {
    await $`ssh ${server} uptime`;
}

// While loop
let counter = 0;
while (counter < 10) {
    console.log(`Count: ${counter}`);
    counter++;
}

// Read file line by line
const content = await readFile('input.txt', 'utf-8');
const lines = content.split('\n');
for (const line of lines) {
    console.log(`Line: ${line}`);
}
```

### 4. Functions

**Bash:**
```bash
# Function definition
log_message() {
    local level=$1
    local message=$2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message"
}

# Function with return value
check_service() {
    local service=$1
    if systemctl is-active "$service" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Using functions
log_message "INFO" "Starting deployment"

if check_service "nginx"; then
    log_message "INFO" "Nginx is running"
else
    log_message "ERROR" "Nginx is not running"
    exit 1
fi
```

**Xec:**
```typescript
import { $ } from '@xec-sh/core';

// Function definition
function logMessage(level: string, message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// Function with return value
async function checkService(service: string): Promise<boolean> {
    const result = await $`systemctl is-active ${service}`.quiet().nothrow();
    return result.exitCode === 0;
}

// Using functions
logMessage('INFO', 'Starting deployment');

if (await checkService('nginx')) {
    logMessage('INFO', 'Nginx is running');
} else {
    logMessage('ERROR', 'Nginx is not running');
    process.exit(1);
}
```

### 5. Error Handling

**Bash:**
```bash
#!/bin/bash
set -euo pipefail

# Trap errors
trap 'echo "Error on line $LINENO"' ERR

# Manual error checking
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed"
    exit 1
fi

# Try-catch equivalent
{
    risky_command
} || {
    echo "Command failed, attempting recovery"
    recovery_command
}

# Cleanup on exit
cleanup() {
    rm -f /tmp/tempfile
    echo "Cleanup complete"
}
trap cleanup EXIT
```

**Xec:**
```typescript
import { $ } from '@xec-sh/core';
import { rm } from 'fs/promises';

// Check command availability
const dockerCheck = await $`command -v docker`.quiet().nothrow();
if (!dockerCheck.ok) {
    throw new Error('Docker is not installed');
}

// Try-catch
try {
    await $`risky_command`;
} catch (error) {
    console.error('Command failed, attempting recovery');
    await $`recovery_command`;
}

// Cleanup on exit
process.on('exit', async () => {
    await rm('/tmp/tempfile', { force: true });
    console.log('Cleanup complete');
});

// Or use finally
try {
    // Main logic
} finally {
    // Cleanup
    await rm('/tmp/tempfile', { force: true });
}
```

### 6. Pipes and Redirection

**Bash:**
```bash
# Pipes
cat file.txt | grep "pattern" | sort | uniq > output.txt

# Redirection
command > output.txt 2>&1
command >> append.txt
command 2> errors.txt

# Here documents
cat <<EOF > config.yaml
server:
  host: localhost
  port: 3000
EOF

# Process substitution
diff <(sort file1.txt) <(sort file2.txt)
```

**Xec:**
```typescript
import { $ } from '@xec-sh/core';
import { writeFile, appendFile } from 'fs/promises';

// Pipes (using shell)
await $`cat file.txt | grep "pattern" | sort | uniq > output.txt`;

// Or programmatic
const content = await $`cat file.txt`.text();
const lines = content.split('\n')
    .filter(line => line.includes('pattern'))
    .sort()
    .filter((line, i, arr) => i === 0 || line !== arr[i - 1]);

await writeFile('output.txt', lines.join('\n'));

// Redirection
const result = await $`command`;
await writeFile('output.txt', result.stdout + result.stderr);
await appendFile('append.txt', result.stdout);
await writeFile('errors.txt', result.stderr);

// Here documents (multiline strings)
const config = `server:
  host: localhost
  port: 3000`;

await writeFile('config.yaml', config);

// Process substitution equivalent
const [file1Sorted, file2Sorted] = await Promise.all([
    $`sort file1.txt`.text(),
    $`sort file2.txt`.text()
]);

// Compare programmatically
```

## Complex Script Migration

### Original Bash Script

```bash
#!/bin/bash
# backup.sh - System backup script

set -euo pipefail

# Configuration
BACKUP_DIR="/backup"
RETENTION_DAYS=30
DATABASES=("app_db" "user_db")
SERVICES=("nginx" "app")
REMOTE_HOST="backup.example.com"
LOG_FILE="/var/log/backup.log"

# Functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_disk_space() {
    local required=$1
    local available=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    
    if [ "$available" -lt "$required" ]; then
        log "ERROR: Insufficient disk space"
        return 1
    fi
    return 0
}

backup_database() {
    local db=$1
    local backup_file="$BACKUP_DIR/db_${db}_$(date +%Y%m%d).sql.gz"
    
    log "Backing up database: $db"
    
    if mysqldump --single-transaction "$db" | gzip > "$backup_file"; then
        log "Database backup successful: $db"
        return 0
    else
        log "ERROR: Database backup failed: $db"
        return 1
    fi
}

backup_files() {
    local backup_file="$BACKUP_DIR/files_$(date +%Y%m%d).tar.gz"
    
    log "Backing up files"
    
    tar czf "$backup_file" \
        --exclude='*.log' \
        --exclude='node_modules' \
        /var/www /etc/nginx
}

stop_services() {
    for service in "${SERVICES[@]}"; do
        log "Stopping $service"
        systemctl stop "$service"
    done
}

start_services() {
    for service in "${SERVICES[@]}"; do
        log "Starting $service"
        systemctl start "$service"
    done
}

sync_to_remote() {
    log "Syncing to remote host"
    
    rsync -avz --delete \
        "$BACKUP_DIR/" \
        "$REMOTE_HOST:/backups/" || {
        log "ERROR: Remote sync failed"
        return 1
    }
}

cleanup_old_backups() {
    log "Cleaning up old backups"
    
    find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete
}

# Main execution
main() {
    log "Starting backup process"
    
    # Check prerequisites
    if ! check_disk_space 1000000; then
        exit 1
    fi
    
    # Stop services for consistency
    stop_services
    
    # Perform backups
    local exit_code=0
    
    for db in "${DATABASES[@]}"; do
        if ! backup_database "$db"; then
            exit_code=1
        fi
    done
    
    if ! backup_files; then
        exit_code=1
    fi
    
    # Restart services
    start_services
    
    # Sync to remote if backups succeeded
    if [ $exit_code -eq 0 ]; then
        sync_to_remote
        cleanup_old_backups
    fi
    
    log "Backup process complete (exit code: $exit_code)"
    exit $exit_code
}

# Run main function
main "$@"
```

### Migrated to Xec

```typescript
// scripts/backup.ts
import { $, on } from '@xec-sh/core';
import { statfs } from 'fs';
import { promisify } from 'util';
import { appendFile } from 'fs/promises';
import path from 'path';

// Configuration (type-safe)
interface BackupConfig {
    backupDir: string;
    retentionDays: number;
    databases: string[];
    services: string[];
    remoteHost: string;
    logFile: string;
}

const config: BackupConfig = {
    backupDir: '/backup',
    retentionDays: 30,
    databases: ['app_db', 'user_db'],
    services: ['nginx', 'app'],
    remoteHost: 'backup.example.com',
    logFile: '/var/log/backup.log'
};

// Logging with proper error handling
async function log(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(logEntry.trim());
    await appendFile(config.logFile, logEntry);
}

// Check disk space with proper types
async function checkDiskSpace(requiredKB: number): Promise<boolean> {
    const stats = await promisify(statfs)(config.backupDir);
    const availableKB = stats.bavail * stats.bsize / 1024;
    
    if (availableKB < requiredKB) {
        await log('ERROR: Insufficient disk space');
        return false;
    }
    return true;
}

// Backup database with error handling
async function backupDatabase(db: string): Promise<boolean> {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const backupFile = path.join(
        config.backupDir,
        `db_${db}_${date}.sql.gz`
    );
    
    await log(`Backing up database: ${db}`);
    
    try {
        await $`mysqldump --single-transaction ${db} | gzip > ${backupFile}`;
        await log(`Database backup successful: ${db}`);
        return true;
    } catch (error) {
        await log(`ERROR: Database backup failed: ${db} - ${error}`);
        return false;
    }
}

// Backup files with exclusions
async function backupFiles(): Promise<boolean> {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const backupFile = path.join(
        config.backupDir,
        `files_${date}.tar.gz`
    );
    
    await log('Backing up files');
    
    try {
        await $`tar czf ${backupFile} \
            --exclude='*.log' \
            --exclude='node_modules' \
            /var/www /etc/nginx`;
        
        await log('File backup successful');
        return true;
    } catch (error) {
        await log(`ERROR: File backup failed: ${error}`);
        return false;
    }
}

// Service management with proper error handling
async function stopServices(): Promise<void> {
    for (const service of config.services) {
        await log(`Stopping ${service}`);
        try {
            await $`systemctl stop ${service}`;
        } catch (error) {
            await log(`Warning: Failed to stop ${service}: ${error}`);
        }
    }
}

async function startServices(): Promise<void> {
    for (const service of config.services) {
        await log(`Starting ${service}`);
        try {
            await $`systemctl start ${service}`;
        } catch (error) {
            await log(`ERROR: Failed to start ${service}: ${error}`);
            // Critical service - throw to notify
            throw error;
        }
    }
}

// Remote sync with retry logic
async function syncToRemote(retries = 3): Promise<boolean> {
    await log('Syncing to remote host');
    
    for (let i = 0; i < retries; i++) {
        try {
            await $`rsync -avz --delete \
                ${config.backupDir}/ \
                ${config.remoteHost}:/backups/`;
            
            await log('Remote sync successful');
            return true;
        } catch (error) {
            await log(`Remote sync attempt ${i + 1} failed: ${error}`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    
    await log('ERROR: Remote sync failed after all retries');
    return false;
}

// Cleanup with safety checks
async function cleanupOldBackups(): Promise<void> {
    await log('Cleaning up old backups');
    
    try {
        // Safer cleanup with explicit file matching
        const files = await $`find ${config.backupDir} \
            -name "*.gz" \
            -mtime +${config.retentionDays} \
            -type f`.lines();
        
        for (const file of files) {
            if (file) {
                await log(`Deleting old backup: ${file}`);
                await $`rm ${file}`;
            }
        }
        
        await log(`Cleaned up ${files.length} old backups`);
    } catch (error) {
        await log(`ERROR: Cleanup failed: ${error}`);
    }
}

// Main execution with proper error handling
async function main(): Promise<void> {
    await log('Starting backup process');
    
    // Check prerequisites
    if (!await checkDiskSpace(1000000)) {
        process.exit(1);
    }
    
    // Stop services for consistency
    await stopServices();
    
    let exitCode = 0;
    
    try {
        // Perform backups in parallel where possible
        const dbBackups = await Promise.all(
            config.databases.map(db => backupDatabase(db))
        );
        
        const filesBackup = await backupFiles();
        
        // Check results
        if (dbBackups.some(result => !result) || !filesBackup) {
            exitCode = 1;
        }
        
        // Sync to remote if backups succeeded
        if (exitCode === 0) {
            const syncSuccess = await syncToRemote();
            if (!syncSuccess) {
                exitCode = 2; // Different code for sync failure
            }
            
            await cleanupOldBackups();
        }
    } finally {
        // Always restart services
        await startServices();
    }
    
    await log(`Backup process complete (exit code: ${exitCode})`);
    process.exit(exitCode);
}

// Error handling
process.on('unhandledRejection', async (error) => {
    await log(`FATAL: Unhandled error: ${error}`);
    process.exit(1);
});

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(async (error) => {
        await log(`FATAL: ${error}`);
        process.exit(1);
    });
}
```

## Shell-Specific Features

### 1. Signal Handling

**Bash:**
```bash
trap 'echo "Interrupted"' INT TERM
trap 'cleanup' EXIT
```

**Xec:**
```typescript
process.on('SIGINT', () => {
    console.log('Interrupted');
    process.exit(130); // Standard SIGINT exit code
});

process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
});

process.on('exit', () => {
    cleanup();
});
```

### 2. Background Jobs

**Bash:**
```bash
long_command &
PID=$!
wait $PID
```

**Xec:**
```typescript
// Start without waiting
const process = $`long_command`.nothrow();

// Do other work...

// Wait for completion
const result = await process;
```

### 3. File Descriptors

**Bash:**
```bash
exec 3< input.txt
exec 4> output.txt
```

**Xec:**
```typescript
import { createReadStream, createWriteStream } from 'fs';

const input = createReadStream('input.txt');
const output = createWriteStream('output.txt');
```

## Migration Tools and Helpers

### Shell Command Wrapper

For gradual migration, wrap shell scripts:

```typescript
// utils/shell-wrapper.ts
import { $ } from '@xec-sh/core';

export async function runShellScript(scriptPath: string, ...args: string[]) {
    return await $`bash ${scriptPath} ${args}`;
}

// Use existing scripts during migration
await runShellScript('./legacy/deploy.sh', 'production');
```

### Common Shell Utilities

```typescript
// utils/shell-utils.ts
import { $ } from '@xec-sh/core';

// which command equivalent
export async function which(command: string): Promise<string | null> {
    const result = await $`which ${command}`.nothrow();
    return result.ok ? result.stdout.trim() : null;
}

// grep equivalent
export async function grep(pattern: string, file: string): Promise<string[]> {
    const content = await readFile(file, 'utf-8');
    return content.split('\n').filter(line => line.includes(pattern));
}

// sed equivalent
export async function sed(pattern: string, replacement: string, file: string) {
    const content = await readFile(file, 'utf-8');
    const updated = content.replace(new RegExp(pattern, 'g'), replacement);
    await writeFile(file, updated);
}
```

## Best Practices

### 1. Use TypeScript Features

```typescript
// Define interfaces for configuration
interface DeployConfig {
    servers: string[];
    version: string;
    environment: 'dev' | 'staging' | 'prod';
}

// Use enums for constants
enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

// Type-safe functions
async function deploy(config: DeployConfig): Promise<void> {
    // Implementation
}
```

### 2. Error Handling Strategy

```typescript
// Create custom error types
class DeploymentError extends Error {
    constructor(message: string, public server: string) {
        super(message);
        this.name = 'DeploymentError';
    }
}

// Structured error handling
try {
    await riskyOperation();
} catch (error) {
    if (error instanceof DeploymentError) {
        // Handle specific error
    } else {
        // Handle generic error
    }
}
```

### 3. Configuration Management

```typescript
// Load configuration from multiple sources
import { config } from 'dotenv';

config(); // Load .env file

const configuration = {
    ...defaultConfig,
    ...JSON.parse(await readFile('config.json', 'utf-8')),
    ...process.env
};
```

## Summary

Migrating from shell scripts to Xec provides:
- ✅ Cross-platform compatibility
- ✅ Type safety with TypeScript
- ✅ Better error handling
- ✅ Modern async/await patterns
- ✅ Full IDE support
- ✅ NPM ecosystem access
- ✅ Easier testing and debugging

Start with simple utility scripts and gradually migrate complex workflows to leverage Xec's full capabilities!