# 11. State Management

## Overview

State management in Xec Core provides a mechanism for storing, transferring, and synchronizing data between tasks, recipes, and runs. The system is built on principles of immutability and event sourcing.

## State Management Concepts

### 1. State Levels

```
┌─────────────────────────────────────┐
│         Global State                │  ← Persistent, between runs
├─────────────────────────────────────┤
│         Run State                   │  ← Within a single run
├─────────────────────────────────────┤
│         Recipe State                │  ← Within a recipe
├─────────────────────────────────────┤
│         Task State                  │  ← Locally in a task
└─────────────────────────────────────┘
```

### 2. Data Types in State

- **Variables** - mutable values
- **Secrets** - encrypted data
- **Facts** - collected system information
- **Artifacts** - file paths and results
- **Metrics** - numerical execution metrics

## State API

### Basic Operations

```typescript
import { setState, getState, hasState, deleteState, clearState } from '@xec/core';

// Saving values
setState('deployment_id', 'deploy-12345');
setState('deployment_config', {
  version: '2.0.0',
  environment: 'production',
  timestamp: Date.now()
});

// Getting values
const deploymentId = getState('deployment_id');
const config = getState<DeploymentConfig>('deployment_config');

// Checking existence
if (hasState('previous_version')) {
  const previous = getState('previous_version');
  console.log(`Upgrading from ${previous}`);
}

// Deleting values
deleteState('temp_data');

// Clearing entire state
clearState();
```

### Namespace Operations

```typescript
// Working with namespaces
setState('app.version', '2.0.0');
setState('app.config.port', 3000);
setState('app.config.host', 'localhost');

// Getting nested values
const port = getState('app.config.port'); // 3000

// Getting entire namespace
const appConfig = getState('app.config'); // { port: 3000, host: 'localhost' }

// Deleting namespace
deleteState('app.config'); // Removes entire subtree
```

### Arrays and Collections

```typescript
// Working with arrays
setState('servers', ['web1', 'web2']);

// Adding elements
const servers = getState<string[]>('servers') || [];
setState('servers', [...servers, 'web3']);

// Map-like operations
setState('hosts.web1', { ip: '10.0.1.1', status: 'active' });
setState('hosts.web2', { ip: '10.0.1.2', status: 'active' });

// Iteration
const hosts = getState('hosts');
for (const [name, info] of Object.entries(hosts)) {
  console.log(`${name}: ${info.ip}`);
}
```

## Context and State

### Usage in Tasks

```typescript
task('collect-info')
  .run(async ({ $ }) => {
    // Collecting information
    const hostname = await $`hostname`.text();
    const kernel = await $`uname -r`.text();
    const uptime = await $`uptime -p`.text();
    
    // Saving to state
    setState('system.hostname', hostname);
    setState('system.kernel', kernel);
    setState('system.uptime', uptime);
    
    // Saving collection time
    setState('system.collected_at', Date.now());
  })
  .build();

task('use-info')
  .run(async ({ logger }) => {
    // Using saved information
    const system = getState('system');
    
    logger.info('System Information:');
    logger.info(`Hostname: ${system.hostname}`);
    logger.info(`Kernel: ${system.kernel}`);
    logger.info(`Uptime: ${system.uptime}`);
  })
  .build();
```

### Passing Data Between Phases

```typescript
recipe('deployment')
  .phase('prepare', phase()
    .task('backup', task()
      .run(async ({ $ }) => {
        const backupPath = `/backup/${Date.now()}.tar.gz`;
        await $`tar -czf ${backupPath} /app`;
        
        // Save path for next phases
        setState('backup_path', backupPath);
        setState('backup_timestamp', Date.now());
      })
    )
  )
  
  .phase('deploy', phase()
    .task('deploy', task()
      .run(async ({ $ }) => {
        try {
          await $`deploy-app`;
          setState('deployment_status', 'success');
        } catch (error) {
          setState('deployment_status', 'failed');
          setState('deployment_error', error.message);
          throw error;
        }
      })
    )
  )
  
  .phase('cleanup', phase()
    .task('cleanup', task()
      .run(async ({ $ }) => {
        const status = getState('deployment_status');
        
        if (status === 'success') {
          // Remove old backup
          const backupPath = getState('backup_path');
          await $`rm -f ${backupPath}`;
        } else {
          // Keep backup for recovery
          console.log('Keeping backup due to failed deployment');
        }
      })
    )
  )
  .build();
```

## State Persistence

### File Backend

```typescript
import { StateManager } from '@xec/core';

const state = new StateManager({
  backend: 'file',
  options: {
    path: './xec-state.json',
    pretty: true,
    compression: false
  }
});

// Automatic persistence
state.enableAutoPersist({
  interval: 5000, // Every 5 seconds
  debounce: 1000  // Debounce changes
});
```

### SQLite Backend

```typescript
const state = new StateManager({
  backend: 'sqlite',
  options: {
    database: './xec-state.db',
    table: 'state',
    vacuum: true // Periodic optimization
  }
});

// Transaction support
await state.transaction(async (tx) => {
  await tx.set('counter', 0);
  await tx.increment('counter');
  await tx.set('last_update', Date.now());
});
```

### PostgreSQL Backend

```typescript
const state = new StateManager({
  backend: 'postgres',
  options: {
    connectionString: 'postgresql://user:pass@localhost/xec',
    schema: 'xec_state',
    pool: {
      min: 2,
      max: 10
    }
  }
});

// JSON query support
const results = await state.query({
  where: {
    'data.environment': 'production',
    'data.status': 'active'
  },
  orderBy: 'updated_at DESC',
  limit: 10
});
```

### Redis Backend

```typescript
const state = new StateManager({
  backend: 'redis',
  options: {
    url: 'redis://localhost:6379',
    prefix: 'xec:state:',
    ttl: 86400, // 24 hours default
    serialize: 'json' // or 'msgpack'
  }
});

// TTL support
await state.set('temp_data', value, { ttl: 3600 }); // 1 hour

// Pub/Sub for synchronization
state.on('change', (key, value) => {
  console.log(`State changed: ${key}`);
});
```

## Secrets Management

### Storing Secrets

```typescript
import { setSecret, getSecret, hasSecret } from '@xec/core';

// Saving secrets (automatically encrypted)
setSecret('database_password', 'super-secret-password');
setSecret('api_keys', {
  github: 'ghp_xxxxxxxxxxxx',
  aws: 'AKIAXXXXXXXXXXXXXXXX'
});

// Getting secrets (automatically decrypted)
const dbPassword = getSecret('database_password');
const apiKeys = getSecret<APIKeys>('api_keys');

// Usage in tasks
task('connect-db')
  .run(async ({ $ }) => {
    const password = getSecret('database_password');
    await $`psql -U admin -p ${password} -c "SELECT 1"`;
  })
  .build();
```

### Encryption Providers

```typescript
// Encryption configuration
const state = new StateManager({
  encryption: {
    provider: 'aes-256-gcm',
    key: process.env.XEC_ENCRYPTION_KEY,
    // or
    keyDerivation: {
      password: process.env.XEC_MASTER_PASSWORD,
      salt: 'xec-state-encryption',
      iterations: 100000
    }
  }
});

// Using external KMS
const state = new StateManager({
  encryption: {
    provider: 'aws-kms',
    keyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
  }
});

// HashiCorp Vault
const state = new StateManager({
  encryption: {
    provider: 'vault',
    address: 'https://vault.example.com',
    token: process.env.VAULT_TOKEN,
    path: 'secret/data/xec'
  }
});
```

## Facts Collection

### System Facts

```typescript
import { collectFacts, getFact } from '@xec/core';

// Automatic fact collection
await collectFacts({
  categories: ['system', 'network', 'storage']
});

// Accessing facts
const facts = {
  hostname: getFact('system.hostname'),
  os: getFact('system.os'),
  arch: getFact('system.arch'),
  memory: getFact('system.memory'),
  cpu: getFact('system.cpu'),
  interfaces: getFact('network.interfaces'),
  disks: getFact('storage.disks')
};

// Custom fact collectors
registerFactCollector('docker', async () => {
  const info = await $`docker info --format json`.json();
  return {
    version: info.ServerVersion,
    containers: info.Containers,
    images: info.Images,
    driver: info.Driver
  };
});
```

### Using Facts

```typescript
task('configure-app')
  .run(async ({ template }) => {
    const config = await template.render('app.conf.j2', {
      // Facts available in templates
      hostname: getFact('system.hostname'),
      ip_address: getFact('network.interfaces.eth0.ipv4.address'),
      total_memory: getFact('system.memory.total'),
      cpu_count: getFact('system.cpu.count')
    });
    
    await file('/etc/app.conf').write(config);
  })
  .build();
```

## State Transactions

### Atomic Operations

```typescript
// Transactional changes
await state.transaction(async (tx) => {
  const current = await tx.get('deployment_count') || 0;
  await tx.set('deployment_count', current + 1);
  await tx.set('last_deployment', {
    id: generateId(),
    timestamp: Date.now(),
    version: '2.0.0'
  });
  
  // If an error occurs, all changes will be rolled back
  if (current >= 100) {
    throw new Error('Too many deployments');
  }
});
```

### Optimistic Locking

```typescript
// Versioning to prevent conflicts
const deployment = await state.getWithVersion('current_deployment');

// Change with version check
try {
  await state.setWithVersion('current_deployment', 
    { ...deployment.value, status: 'completed' },
    deployment.version
  );
} catch (error) {
  if (error.code === 'VERSION_MISMATCH') {
    console.log('Deployment was modified by another process');
  }
}
```

## State Synchronization

### Multi-node Synchronization

```typescript
// Setting up synchronization between nodes
const state = new StateManager({
  backend: 'distributed',
  options: {
    nodes: ['node1:7000', 'node2:7000', 'node3:7000'],
    consistency: 'eventual', // or 'strong'
    replication: 2
  }
});

// Subscribing to changes
state.watch('deployment.*', (key, value, metadata) => {
  console.log(`State changed on ${metadata.node}: ${key}`);
});

// Conflicts and their resolution
state.onConflict((key, localValue, remoteValue) => {
  // Last-write-wins strategy
  return localValue.timestamp > remoteValue.timestamp 
    ? localValue 
    : remoteValue;
});
```

### Event Streaming

```typescript
// Streaming state changes
const stream = state.stream({
  from: 'beginning', // or timestamp
  filter: (event) => event.key.startsWith('deployment.')
});

stream.on('data', (event) => {
  console.log(`Event: ${event.type} ${event.key} = ${event.value}`);
});

// Event replay
await state.replay({
  from: Date.now() - 3600000, // Last hour
  to: Date.now(),
  handler: async (event) => {
    // Processing historical events
  }
});
```

## State Queries

### Advanced Queries

```typescript
// Searching state
const results = await state.find({
  where: {
    'deployment.status': 'active',
    'deployment.environment': { $in: ['staging', 'production'] },
    'deployment.timestamp': { $gte: Date.now() - 86400000 }
  },
  select: ['deployment.id', 'deployment.version'],
  orderBy: 'deployment.timestamp DESC',
  limit: 10
});

// Aggregation
const stats = await state.aggregate({
  match: { 'deployment.status': 'completed' },
  group: {
    _id: '$deployment.environment',
    count: { $sum: 1 },
    avgDuration: { $avg: '$deployment.duration' }
  }
});
```

### State Export/Import

```typescript
// Exporting state
await state.export({
  format: 'json', // or 'yaml', 'csv'
  file: './state-backup.json',
  filter: (key) => !key.startsWith('temp.'),
  pretty: true
});

// Importing state
await state.import({
  file: './state-backup.json',
  merge: true, // or false for complete replacement
  transform: (key, value) => {
    // Transformation during import
    if (key.startsWith('old.')) {
      return { key: key.replace('old.', 'legacy.'), value };
    }
    return { key, value };
  }
});
```

## Performance Optimization

### Caching Strategy

```typescript
const state = new StateManager({
  cache: {
    enabled: true,
    size: 1000, // Maximum records
    ttl: 60000, // 1 minute
    strategy: 'lru' // Least Recently Used
  }
});

// Preloading frequently used data
await state.preload([
  'config.*',
  'deployment.current',
  'system.facts'
]);

// Batch operations
await state.batch([
  { op: 'set', key: 'a', value: 1 },
  { op: 'set', key: 'b', value: 2 },
  { op: 'delete', key: 'c' }
]);
```

### Compression

```typescript
const state = new StateManager({
  compression: {
    enabled: true,
    algorithm: 'gzip', // or 'brotli', 'lz4'
    threshold: 1024, // Compress values larger than 1KB
    level: 6 // Compression level (1-9)
  }
});
```

## Best Practices

### 1. Data Structuring

```typescript
// Good: hierarchical structure
setState('deployment.production.current', { version: '2.0.0' });
setState('deployment.production.previous', { version: '1.9.0' });
setState('deployment.staging.current', { version: '2.1.0-beta' });

// Bad: flat structure
setState('deployment_production_current', { version: '2.0.0' });
setState('deployment_production_previous', { version: '1.9.0' });
```

### 2. Cleaning Temporary Data

```typescript
task('cleanup')
  .finally(async () => {
    // Cleaning temporary data
    const keys = await state.keys('temp.*');
    for (const key of keys) {
      await deleteState(key);
    }
    
    // Or with TTL
    setState('temp.data', value, { ttl: 3600 }); // Auto-delete after hour
  })
  .build();
```

### 3. State Versioning

```typescript
// State migration during updates
const STATE_VERSION = 2;

async function migrateState() {
  const version = getState('_version') || 1;
  
  if (version < 2) {
    // Migration from v1 to v2
    const oldData = getState('data');
    setState('data.v2', transformData(oldData));
    deleteState('data');
    setState('_version', 2);
  }
}
```

### 4. Monitoring State

```typescript
// Monitoring state size
const monitor = state.monitor({
  interval: 60000, // Every minute
  metrics: ['size', 'keys', 'operations']
});

monitor.on('metrics', (metrics) => {
  if (metrics.size > 100 * 1024 * 1024) { // 100MB
    console.warn('State size is getting large:', metrics.size);
  }
});
```

## Conclusion

The state management system in Xec Core provides powerful capabilities for storing and synchronizing data. Proper use of state allows creating complex workflows with data transfer between tasks, progress saving, and recovery after failures.