# @xec/core - Core Orchestration Engine

## Package Overview
The core package provides the infrastructure orchestration engine with declarative DSL, state management, and extensible module system.

## Directory Structure
```
packages/core/
├── src/
│   ├── context/          # Global context management
│   ├── core/             # Core types and validation
│   ├── dsl/              # Domain Specific Language
│   ├── engine/           # Execution engine
│   ├── integrations/     # External system adapters (including real Ush integration)
│   ├── modules/          # Module system and registries
│   ├── monitoring/       # Real-time monitoring & progress tracking
│   ├── patterns/         # Deployment patterns
│   ├── resources/        # Resource management & quotas
│   ├── security/         # Security features
│   ├── state/            # State management (with optimized event store)
│   ├── stdlib/           # Standard library
│   └── utils/            # Utilities
├── docs/                 # Comprehensive documentation
├── examples/             # Usage examples
└── test/                 # Test suites
```

## Key Concepts

### 1. DSL (Domain Specific Language)
- **Task**: Basic unit of work
- **Recipe**: Collection of tasks with lifecycle management
- Location: `src/dsl/`

### 2. State Management
- **Event Sourcing**: Track all state changes
- **State Ledger**: Immutable state history
- **Lock Manager**: Prevent concurrent modifications
- Location: `src/state/`

### 3. Module System
- **Task Registry**: Custom task types
- **Helper Registry**: Utility functions
- **Pattern Registry**: Reusable deployment patterns
- **Integration Registry**: External system adapters
- Location: `src/modules/`

### 4. Integration Adapters
- AWS, Kubernetes, Terraform, Ush (now with real @xec/ush integration)
- Location: `src/integrations/`

### 5. Deployment Patterns
- Blue-Green, Canary, Rolling Update, A/B Testing
- Location: `src/patterns/`

### 6. Monitoring & Progress Tracking
- **Progress Tracker**: Hierarchical progress tracking with events
- **Real-Time Monitor**: Task execution monitoring with metrics
- Location: `src/monitoring/`

### 7. Resource Management
- **Resource Manager**: Pool-based resource allocation
- **Quota Manager**: Usage limits with soft/hard enforcement
- Location: `src/resources/`

### 8. Optimized Event Store
- **Batching**: Reduce I/O with batch writes
- **Caching**: LRU cache for frequently accessed events
- **Indexing**: Bucketed indexes for efficient queries
- **Partitioning**: Events partitioned by sequence number
- Location: `src/state/optimized-event-store.ts`

## Development Guide

### Adding a New Task Type
1. Create task implementation in `src/stdlib/`
2. Register in appropriate module registry
3. Add tests in `test/unit/`
4. Update documentation

### Adding a New Integration
1. Implement BaseAdapter interface in `src/integrations/`
2. Register in IntegrationRegistry
3. Add integration tests
4. Document usage

### Adding a New Pattern
1. Implement pattern in `src/patterns/`
2. Register in PatternRegistry
3. Add example in `examples/`
4. Add tests

### Using Real-Time Monitoring
```typescript
import { getProgressTracker, getRealTimeMonitor } from '@xec/core';

const tracker = getProgressTracker();
const monitor = getRealTimeMonitor();

// Track async operation
await tracker.trackAsync('task-1', 'Processing data', async (progress) => {
  for (let i = 0; i < 100; i++) {
    await processItem(i);
    progress(i + 1, `Processed item ${i + 1}`);
  }
}, { total: 100 });

// Monitor will emit events for real-time updates
```

### Managing Resources
```typescript
import { getResourceManager } from '@xec/core';

const manager = getResourceManager();

// Create resource pool
manager.createPool('compute', 'Compute Resources', {
  cpu: 16,
  memory: 32768,
  tasks: 10
});

// Request resources
const allocation = await manager.requestResources('compute', {
  consumerId: 'task-123',
  resources: { cpu: 4, memory: 8192 }
});

// Release when done
await manager.releaseResources(allocation.id);
```

### Setting Quotas
```typescript
import { getQuotaManager } from '@xec/core';

const quotas = getQuotaManager();

// Define quota for a user
quotas.defineQuota(
  { type: 'user', id: 'user-123' },
  {
    name: 'Basic Plan',
    limits: {
      'api.requests': {
        max: 1000,
        unit: 'requests',
        enforcementMode: 'hard',
        resetInterval: 'daily'
      }
    }
  }
);

// Check and consume quota
const result = await quotas.checkQuota(
  { type: 'user', id: 'user-123' },
  'api.requests',
  1
);

if (result.allowed) {
  await quotas.consumeQuota({ type: 'user', id: 'user-123' }, 'api.requests', 1);
}
```

## Testing

### Run All Tests
```bash
yarn test
```

### Run Specific Test
```bash
yarn test -- test/unit/dsl/task.test.ts
```

### Test Coverage
```bash
yarn test:coverage
```

## Common Issues

### Import Errors
- Check `src/index.ts` exports all public APIs
- Verify circular dependencies
- Use proper import paths

### Required Exports in index.ts
The following exports must be available for full CLI functionality:
```typescript
// Monitoring
export * from './monitoring/progress-tracker.js';
export * from './monitoring/real-time-monitor.js';
export { getProgressTracker, getRealTimeMonitor } from './monitoring/index.js';

// Resources
export * from './resources/resource-manager.js';
export * from './resources/quota-manager.js';
export { getResourceManager, getQuotaManager } from './resources/index.js';

// State (including optimized store)
export { OptimizedEventStore } from './state/optimized-event-store.js';
```

### State Management Issues
- Ensure proper event ordering
- Check lock acquisition/release
- Verify state persistence

### Module Loading Issues
- Check module registration
- Verify module dependencies
- Ensure proper initialization order

## Architecture Decisions

### Why Event Sourcing?
- Complete audit trail
- Time-travel debugging
- State reconstruction
- Distributed system coordination

### Why Module System?
- Extensibility without core changes
- Plugin architecture
- Clear separation of concerns
- Easy testing

### Why TypeScript Strict Mode?
- Catch errors at compile time
- Better IDE support
- Self-documenting code
- Easier refactoring

## Performance Considerations
- State operations are async for scalability
- Module loading is lazy
- Pattern matching is optimized
- Integration calls are batched when possible
- Event store optimizations:
  - Batch writes reduce I/O by up to 100x
  - LRU cache provides <1ms reads for hot data
  - Bucketed indexes prevent unbounded growth
  - Partitioning enables efficient range queries

## Security Features
- Encryption for sensitive data
- Secrets management
- Audit logging
- Input validation

## Debugging Tips
1. Enable debug logging: `DEBUG=xec:*`
2. Use state snapshots for debugging
3. Check event log for state changes
4. Use test helpers for isolated testing

## Recent Enhancements (v0.3.2)
- ✅ Real Ush integration (replaced mock implementation)
- ✅ Real-time monitoring and progress tracking
- ✅ Optimized event sourcing with batching and caching
- ✅ Resource management with pool allocation
- ✅ Quota management with flexible enforcement
- ✅ 100% of core functionality now exposed via CLI

## Future Enhancements
- Distributed state management
- More integration adapters
- Advanced scheduling algorithms
- Event store compression
- Materialized views for complex queries