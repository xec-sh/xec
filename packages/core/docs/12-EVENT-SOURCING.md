# 12. Event Sourcing and State Ledger

## Overview

Event Sourcing in Xec Core provides a complete history of system state changes through an immutable event log. This allows restoring state at any point in time, ensures auditability, and enables time-based debugging.

## Event Sourcing Concepts

### Event Store

Event Store is an append-only storage of all events that occurred in the system.

```typescript
interface Event {
  id: string;                    // Unique event ID
  type: string;                  // Event type
  timestamp: number;             // Event time
  aggregateId: string;          // Aggregate ID
  aggregateType: string;        // Aggregate type
  version: number;              // Aggregate version
  payload: any;                 // Event data
  metadata: EventMetadata;      // Metadata
}

interface EventMetadata {
  correlationId?: string;       // Correlation ID
  causationId?: string;         // Causation ID
  userId?: string;              // User ID
  source?: string;              // Event source
  tags?: string[];              // Tags for filtering
}
```

### Event Types

```typescript
// System events
export enum SystemEvents {
  // Lifecycle
  XEC_STARTED = 'xec.started',
  XEC_STOPPED = 'xec.stopped',
  
  // Recipe execution
  RECIPE_STARTED = 'recipe.started',
  RECIPE_COMPLETED = 'recipe.completed',
  RECIPE_FAILED = 'recipe.failed',
  
  // Task execution
  TASK_STARTED = 'task.started',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_SKIPPED = 'task.skipped',
  
  // State changes
  STATE_CHANGED = 'state.changed',
  STATE_DELETED = 'state.deleted',
  
  // Module events
  MODULE_LOADED = 'module.loaded',
  MODULE_UNLOADED = 'module.unloaded'
}

// Custom events
interface CustomEvent extends Event {
  type: string; // Any string for custom events
}
```

## Event Store API

### Writing Events

```typescript
import { EventStore } from '@xec/core';

const eventStore = new EventStore();

// Writing a single event
await eventStore.append({
  type: 'deployment.started',
  aggregateId: 'deploy-123',
  aggregateType: 'deployment',
  payload: {
    version: '2.0.0',
    environment: 'production',
    timestamp: Date.now()
  }
});

// Writing multiple events atomically
await eventStore.appendMany([
  {
    type: 'deployment.validated',
    aggregateId: 'deploy-123',
    payload: { validationPassed: true }
  },
  {
    type: 'deployment.executed',
    aggregateId: 'deploy-123',
    payload: { servers: ['web1', 'web2'] }
  }
]);

// With metadata
await eventStore.append({
  type: 'user.action',
  aggregateId: 'user-456',
  payload: { action: 'delete_resource' },
  metadata: {
    userId: 'admin',
    correlationId: 'req-789',
    tags: ['audit', 'critical']
  }
});
```

### Reading Events

```typescript
// Getting all events for an aggregate
const events = await eventStore.getEvents('deploy-123');

// With type filtering
const deploymentEvents = await eventStore.getEvents('deploy-123', {
  types: ['deployment.started', 'deployment.completed']
});

// Getting events by time
const recentEvents = await eventStore.query({
  fromTimestamp: Date.now() - 3600000, // Last hour
  toTimestamp: Date.now()
});

// Complex queries
const criticalEvents = await eventStore.query({
  aggregateType: 'deployment',
  types: ['deployment.failed', 'deployment.rollback'],
  metadata: {
    tags: { $contains: 'critical' }
  },
  limit: 100,
  orderBy: 'timestamp DESC'
});
```

### Event Streaming

```typescript
// Subscribing to events in real-time
const subscription = eventStore.subscribe({
  types: ['deployment.*'],
  handler: async (event) => {
    console.log(`Event: ${event.type}`, event.payload);
  }
});

// With filtering
const filtered = eventStore.subscribe({
  filter: (event) => event.aggregateType === 'deployment',
  handler: async (event) => {
    // Processing deployment events
  }
});

// Unsubscribing
subscription.unsubscribe();

// Event replay
await eventStore.replay({
  fromVersion: 0,
  toVersion: 100,
  aggregateId: 'deploy-123',
  handler: async (event) => {
    // State restoration
  }
});
```

## Event Sourcing in Task Context

### Automatic Event Recording

```typescript
task('deploy')
  .eventSourcing(true) // Enable event sourcing
  .run(async ({ $ }) => {
    // All actions are automatically recorded as events
    await $`git pull`;
    await $`npm install`;
    await $`npm run build`;
  })
  .build();

// Events will be recorded:
// - task.started { taskName: 'deploy' }
// - command.executed { command: 'git pull', exitCode: 0 }
// - command.executed { command: 'npm install', exitCode: 0 }
// - command.executed { command: 'npm run build', exitCode: 0 }
// - task.completed { taskName: 'deploy', duration: 45000 }
```

### Custom Events in Tasks

```typescript
task('complex-deploy')
  .run(async ({ emit }) => {
    // Emit custom events
    await emit('deployment.preparing', {
      servers: ['web1', 'web2'],
      version: '2.0.0'
    });
    
    // Execute actions
    const result = await deployToServers();
    
    await emit('deployment.validated', {
      validationResult: result.validation,
      healthChecks: result.health
    });
    
    if (result.success) {
      await emit('deployment.succeeded', {
        deploymentId: result.id,
        duration: result.duration
      });
    } else {
      await emit('deployment.failed', {
        error: result.error,
        rollbackInitiated: true
      });
    }
  })
  .build();
```

## State Ledger

State Ledger is an immutable log of all state changes with cryptographic protection.

### Ledger Structure

```typescript
interface LedgerEntry {
  id: string;                   // Unique entry ID
  timestamp: number;            // Entry time
  operation: 'set' | 'delete';  // Operation type
  key: string;                  // State key
  value?: any;                  // New value
  previousValue?: any;          // Previous value
  hash: string;                 // Entry hash
  previousHash: string;         // Previous entry hash
  signature?: string;           // Digital signature
}
```

### Using Ledger

```typescript
import { StateLedger } from '@xec/core';

const ledger = new StateLedger({
  storage: 'postgresql',
  encryption: true,
  signing: {
    algorithm: 'ed25519',
    privateKey: process.env.LEDGER_PRIVATE_KEY
  }
});

// All state changes are automatically recorded
setState('deployment.version', '2.0.0');
// Creates a ledger entry with hash and signature

// Verifying integrity
const isValid = await ledger.verify();
if (!isValid) {
  throw new Error('Ledger integrity compromised!');
}

// Getting change history for a key
const history = await ledger.getHistory('deployment.version');
console.log(history);
// [
//   { timestamp: 1234567890, value: '1.0.0', operation: 'set' },
//   { timestamp: 1234567900, value: '1.5.0', operation: 'set' },
//   { timestamp: 1234567910, value: '2.0.0', operation: 'set' }
// ]
```

## Event Projections

Projections allow creating materialized views from events.

### Creating Projections

```typescript
class DeploymentProjection {
  private state = new Map<string, DeploymentState>();
  
  async handle(event: Event): Promise<void> {
    switch (event.type) {
      case 'deployment.started':
        this.state.set(event.aggregateId, {
          id: event.aggregateId,
          status: 'in_progress',
          startedAt: event.timestamp,
          ...event.payload
        });
        break;
        
      case 'deployment.completed':
        const deployment = this.state.get(event.aggregateId);
        if (deployment) {
          deployment.status = 'completed';
          deployment.completedAt = event.timestamp;
        }
        break;
        
      case 'deployment.failed':
        const failed = this.state.get(event.aggregateId);
        if (failed) {
          failed.status = 'failed';
          failed.error = event.payload.error;
        }
        break;
    }
  }
  
  getDeployment(id: string): DeploymentState | undefined {
    return this.state.get(id);
  }
  
  getActiveDeployments(): DeploymentState[] {
    return Array.from(this.state.values())
      .filter(d => d.status === 'in_progress');
  }
}

// Registering projection
const projection = new DeploymentProjection();
eventStore.registerProjection(projection);
```

### Read Models

```typescript
// Read model for dashboard
class DashboardReadModel {
  private stats = {
    totalDeployments: 0,
    successfulDeployments: 0,
    failedDeployments: 0,
    averageDuration: 0
  };
  
  async handle(event: Event): Promise<void> {
    if (event.type === 'deployment.started') {
      this.stats.totalDeployments++;
    } else if (event.type === 'deployment.completed') {
      this.stats.successfulDeployments++;
      this.updateAverageDuration(event.payload.duration);
    } else if (event.type === 'deployment.failed') {
      this.stats.failedDeployments++;
    }
  }
  
  getStats(): DashboardStats {
    return { ...this.stats };
  }
}
```

## Event Handlers and Sagas

### Event Handlers

```typescript
// Simple event handler
eventStore.on('deployment.failed', async (event) => {
  // Send notification
  await notificationService.send({
    type: 'deployment_failed',
    deployment: event.aggregateId,
    error: event.payload.error
  });
});

// Handler with retry
eventStore.on('resource.created', async (event) => {
  await retry(async () => {
    await externalService.notifyResourceCreated(event.payload);
  }, {
    attempts: 3,
    delay: 1000
  });
});
```

### Sagas (Long-running processes)

```typescript
class DeploymentSaga {
  private state = new Map<string, SagaState>();
  
  async handle(event: Event): Promise<void> {
    const sagaId = event.correlationId || event.aggregateId;
    
    switch (event.type) {
      case 'deployment.requested':
        // Start saga
        this.state.set(sagaId, { step: 'validating' });
        await this.emit('deployment.validate', {
          deploymentId: event.aggregateId
        });
        break;
        
      case 'deployment.validated':
        // Move to next step
        if (event.payload.valid) {
          await this.emit('deployment.execute', {
            deploymentId: event.aggregateId
          });
        } else {
          await this.emit('deployment.rejected', {
            reason: event.payload.errors
          });
        }
        break;
        
      case 'deployment.executed':
        // Final step
        await this.emit('deployment.finalize', {
          deploymentId: event.aggregateId
        });
        this.state.delete(sagaId);
        break;
    }
  }
  
  private async emit(type: string, payload: any): Promise<void> {
    await eventStore.append({ type, payload });
  }
}
```

## Time Travel and Debugging

### Restoring State at a Point in Time

```typescript
// Time travel API
const timeMachine = new TimeMachine(eventStore);

// Get state at a specific moment
const stateAt = await timeMachine.getStateAt('2024-01-01T12:00:00Z');
console.log(stateAt);

// Restore aggregate state
const deploymentHistory = await timeMachine.getAggregateAt(
  'deploy-123',
  '2024-01-01T12:00:00Z'
);

// Replay events in a specific range
await timeMachine.replay({
  from: '2024-01-01T10:00:00Z',
  to: '2024-01-01T12:00:00Z',
  speed: 2.0, // 2x speed
  handler: (event, state) => {
    console.log(`[${event.timestamp}] ${event.type}`, state);
  }
});
```

### Debugging with Events

```typescript
// Debug mode for tasks
task('debug-deploy')
  .debug(true) // Enable detailed event logging
  .run(async ({ $ }) => {
    await $`deploy.sh`;
  })
  .build();

// Event inspector
const inspector = new EventInspector(eventStore);

// Event analysis
const analysis = await inspector.analyze({
  aggregateId: 'deploy-123',
  metrics: ['duration', 'error_rate', 'retry_count']
});

// Finding anomalies
const anomalies = await inspector.findAnomalies({
  type: 'deployment.*',
  threshold: {
    duration: { p95: 300000 } // 5 minutes
  }
});
```

## Persistence Backends

### PostgreSQL Backend

```typescript
const eventStore = new EventStore({
  backend: 'postgresql',
  connection: {
    host: 'localhost',
    database: 'xec_events',
    user: 'xec',
    password: 'secret'
  },
  options: {
    tableName: 'events',
    createIndexes: true,
    partitioning: {
      by: 'month',
      retention: 12 // months
    }
  }
});
```

### MongoDB Backend

```typescript
const eventStore = new EventStore({
  backend: 'mongodb',
  connection: 'mongodb://localhost:27017/xec',
  options: {
    collection: 'events',
    indexes: [
      { aggregateId: 1, version: 1 },
      { type: 1, timestamp: -1 },
      { 'metadata.tags': 1 }
    ],
    capped: false
  }
});
```

### Kafka Backend

```typescript
const eventStore = new EventStore({
  backend: 'kafka',
  connection: {
    brokers: ['localhost:9092'],
    clientId: 'xec-event-store'
  },
  options: {
    topic: 'xec-events',
    partitions: 10,
    replication: 3,
    compression: 'gzip'
  }
});
```

## Event Store Management

### Snapshots

```typescript
// Creating snapshots for optimization
const snapshotStore = new SnapshotStore();

// Create snapshot
await snapshotStore.save({
  aggregateId: 'deploy-123',
  version: 100,
  state: currentState
});

// Restore from snapshot
const snapshot = await snapshotStore.get('deploy-123');
const events = await eventStore.getEvents('deploy-123', {
  fromVersion: snapshot.version + 1
});

// Apply events after snapshot
const state = events.reduce((state, event) => 
  applyEvent(state, event), snapshot.state
);
```

### Archiving and Cleanup

```typescript
// Archiving old events
await eventStore.archive({
  olderThan: '90d',
  destination: 's3://archive/events',
  compress: true,
  delete: true
});

// Exporting events
await eventStore.export({
  format: 'jsonl', // or 'parquet'
  filter: {
    types: ['deployment.*'],
    from: '2024-01-01',
    to: '2024-01-31'
  },
  output: './exports/january-deployments.jsonl'
});
```

## Performance Optimization

### Indexing

```typescript
// Creating indexes for fast queries
await eventStore.createIndex({
  name: 'idx_aggregate_type_timestamp',
  fields: ['aggregateType', 'timestamp'],
  unique: false
});

await eventStore.createIndex({
  name: 'idx_metadata_tags',
  fields: ['metadata.tags'],
  sparse: true
});
```

### Batching and Buffering

```typescript
// Batching events for performance
const batchedStore = new BatchedEventStore(eventStore, {
  batchSize: 100,
  flushInterval: 1000, // ms
  maxRetries: 3
});

// Events are buffered and sent in batches
await batchedStore.append(event1);
await batchedStore.append(event2);
// ...automatically flush when batchSize or interval is reached
```

## Best Practices

1. **Immutability** - Events never change
2. **Event Naming** - Use past tense (deployment.completed)
3. **Event Granularity** - Not too fine, not too coarse
4. **Correlation IDs** - For linking events in workflows
5. **Versioning** - Version event schemas
6. **Idempotency** - Event handlers should be idempotent
7. **Eventual Consistency** - Design with eventual consistency in mind

## Conclusion

Event Sourcing in Xec Core provides a powerful mechanism for creating reliable, auditable, and recoverable systems. Complete change history allows not only state restoration but also system behavior analysis, problem identification, and process optimization.