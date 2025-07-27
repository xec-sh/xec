---
sidebar_position: 4
---

# Events API

Comprehensive event system for monitoring command execution, adapter operations, and system state in @xec-sh/core.

## Overview

The event system provides a type-safe, enhanced EventEmitter architecture that enables:
- **Real-time monitoring** - Track command execution lifecycle
- **Adapter events** - Monitor connection states and operations
- **Performance tracking** - Measure execution times and cache hits
- **Error handling** - Capture and respond to failures
- **Event filtering** - Subscribe to specific event patterns
- **Wildcard support** - Listen to event groups with patterns
- **TypeScript support** - Fully typed event handlers

## Core Concepts

### Event Structure

All events extend from `BaseUshEvent`:

```typescript
interface BaseUshEvent {
  timestamp: Date;    // When the event occurred
  adapter: string;    // Which adapter emitted it
}
```

### Enhanced EventEmitter

The `EnhancedEventEmitter` extends Node.js EventEmitter with:
- Type-safe event handling
- Event filtering by properties
- Wildcard pattern matching
- Automatic metadata injection

## Event Types

### Command Events

#### `command:start`
Emitted when command execution begins.

```typescript
$.on('command:start', (event) => {
  console.log(`Executing: ${event.command}`);
  console.log(`Directory: ${event.cwd || 'default'}`);
  console.log(`Adapter: ${event.adapter}`);
});
```

Event structure:
```typescript
interface CommandStartEvent extends BaseUshEvent {
  command: string;
  args?: string[];
  cwd?: string;
  shell?: boolean;
  env?: Record<string, string>;
}
```

#### `command:complete`
Emitted when command finishes successfully.

```typescript
$.on('command:complete', (event) => {
  console.log(`✓ Completed in ${event.duration}ms`);
  console.log(`Exit code: ${event.exitCode}`);
  if (event.stdout) console.log('Output:', event.stdout);
});
```

Event structure:
```typescript
interface CommandCompleteEvent extends BaseUshEvent {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  duration: number;
}
```

#### `command:error`
Emitted when command execution fails.

```typescript
$.on('command:error', (event) => {
  console.error(`✗ Command failed: ${event.command}`);
  console.error(`Error: ${event.error}`);
  console.error(`Duration: ${event.duration}ms`);
});
```

Event structure:
```typescript
interface CommandErrorEvent extends BaseUshEvent {
  command: string;
  error: string;
  duration: number;
}

### Connection Events

#### `connection:open`
Emitted when adapter establishes a connection.

```typescript
$.on('connection:open', (event) => {
  console.log(`${event.type} connection opened`);
  if (event.host) console.log(`Host: ${event.host}:${event.port || 'default'}`);
  console.log('Metadata:', event.metadata);
});
```

Event structure:
```typescript
interface ConnectionOpenEvent extends BaseUshEvent {
  host?: string;
  port?: number;
  type: 'ssh' | 'docker' | 'kubernetes' | 'local';
  metadata?: Record<string, any>;
}
```

#### `connection:close`
Emitted when connection is terminated.

```typescript
$.on('connection:close', (event) => {
  console.log(`${event.type} connection closed`);
  if (event.reason) console.log(`Reason: ${event.reason}`);
});
```

Event structure:
```typescript
interface ConnectionCloseEvent extends BaseUshEvent {
  host?: string;
  port?: number;
  type: 'ssh' | 'docker' | 'kubernetes' | 'local';
  reason?: string;
  metadata?: Record<string, any>;
}

### SSH Events

#### `ssh:connect`
Emitted when SSH connection is established.

```typescript
$.on('ssh:connect', (event) => {
  console.log(`Connected to ${event.host}:${event.port || 22}`);
  if (event.username) console.log(`User: ${event.username}`);
});
```

#### `ssh:disconnect`
Emitted when SSH connection is closed.

```typescript
$.on('ssh:disconnect', (event) => {
  console.log(`Disconnected from ${event.host}`);
  if (event.reason) console.log(`Reason: ${event.reason}`);
});
```

#### `ssh:execute`
Emitted when executing command via SSH.

```typescript
$.on('ssh:execute', (event) => {
  console.log(`[${event.host}] ${event.command}`);
});
```

#### `ssh:key-validated`
Emitted when SSH key is successfully validated.

```typescript
$.on('ssh:key-validated', (event) => {
  console.log(`Key validated for ${event.username}@${event.host}`);
  console.log(`Key type: ${event.keyType}`);
});
```

#### `ssh:tunnel-created`
Emitted when SSH tunnel is established.

```typescript
$.on('ssh:tunnel-created', (event) => {
  console.log(`Tunnel: localhost:${event.localPort} -> ${event.remoteHost}:${event.remotePort}`);
});
```

#### `ssh:tunnel-closed`
Emitted when SSH tunnel is closed.

```typescript
$.on('ssh:tunnel-closed', (event) => {
  console.log(`Tunnel closed: localhost:${event.localPort}`);
});
```

#### SSH Connection Pool Events

##### `ssh:pool-metrics`
Emitted periodically with connection pool statistics.

```typescript
$.on('ssh:pool-metrics', (event) => {
  const m = event.metrics;
  console.log(`Active: ${m.activeConnections}/${m.totalConnections}`);
  console.log(`Reuse rate: ${m.reuseCount} connections`);
  console.log(`Avg idle time: ${m.averageIdleTime}ms`);
});
```

##### `ssh:pool-cleanup`
Emitted when pool performs cleanup.

```typescript
$.on('ssh:pool-cleanup', (event) => {
  console.log(`Cleaned ${event.cleaned} idle connections`);
  console.log(`Remaining: ${event.remaining}`);
  if (event.reason) console.log(`Reason: ${event.reason}`);
});
```

##### `ssh:reconnect`
Emitted during reconnection attempts.

```typescript
$.on('ssh:reconnect', (event) => {
  console.log(`Reconnecting to ${event.host} (attempt ${event.attempts})`);
  if (event.success !== undefined) {
    console.log(event.success ? '✓ Reconnected' : '✗ Failed');
  }
});
```

### Docker Events

#### `docker:run`
Emitted when running a Docker container.

```typescript
$.on('docker:run', (event) => {
  console.log(`Running container from image: ${event.image}`);
  if (event.container) console.log(`Name: ${event.container}`);
  if (event.command) console.log(`Command: ${event.command}`);
});
```

#### `docker:exec`
Emitted when executing command in container.

```typescript
$.on('docker:exec', (event) => {
  console.log(`[${event.container}] ${event.command}`);
});
```

### Kubernetes Events

#### `k8s:exec`
Emitted when executing command in pod.

```typescript
$.on('k8s:exec', (event) => {
  const location = event.namespace ? `${event.namespace}/${event.pod}` : event.pod;
  console.log(`[${location}] ${event.command}`);
  if (event.container) console.log(`Container: ${event.container}`);
});
```

### Cache Events

#### `cache:hit`
Emitted when retrieving from cache.

```typescript
$.on('cache:hit', (event) => {
  console.log(`Cache hit: ${event.key}`);
  if (event.ttl) console.log(`TTL: ${event.ttl}ms remaining`);
  if (event.size) console.log(`Size: ${event.size} bytes`);
});
```

#### `cache:miss`
Emitted when cache lookup fails.

```typescript
$.on('cache:miss', (event) => {
  console.log(`Cache miss: ${event.key}`);
});
```

#### `cache:set`
Emitted when storing in cache.

```typescript
$.on('cache:set', (event) => {
  console.log(`Cached: ${event.key}`);
  if (event.ttl) console.log(`TTL: ${event.ttl}ms`);
});
```

#### `cache:evict`
Emitted when removing from cache.

```typescript
$.on('cache:evict', (event) => {
  console.log(`Evicted: ${event.key} (${event.reason})`);
});
```

### Retry Events

#### `retry:attempt`
Emitted on each retry attempt.

```typescript
$.on('retry:attempt', (event) => {
  console.log(`Retry ${event.attempt}/${event.maxAttempts}`);
  console.log(`Delay: ${event.delay}ms`);
  if (event.error) console.log(`Previous error: ${event.error}`);
});
```

#### `retry:success`
Emitted when retry succeeds.

```typescript
$.on('retry:success', (event) => {
  console.log(`Succeeded after ${event.attempts} attempts`);
  console.log(`Total time: ${event.totalDuration}ms`);
});
```

#### `retry:failed`
Emitted when all retries exhausted.

```typescript
$.on('retry:failed', (event) => {
  console.log(`Failed after ${event.attempts} attempts`);
  if (event.lastError) console.log(`Last error: ${event.lastError}`);
});
```

### File Operation Events

#### `file:read`
Emitted when reading a file.

```typescript
$.on('file:read', (event) => {
  console.log(`Reading: ${event.path}`);
  if (event.size) console.log(`Size: ${event.size} bytes`);
});
```

#### `file:write`
Emitted when writing a file.

```typescript
$.on('file:write', (event) => {
  console.log(`Writing: ${event.path}`);
  if (event.size) console.log(`Size: ${event.size} bytes`);
});
```

#### `file:delete`
Emitted when deleting a file.

```typescript
$.on('file:delete', (event) => {
  console.log(`Deleting: ${event.path}`);
});
```

### Transfer Events

#### `transfer:start`
Emitted when file transfer begins.

```typescript
$.on('transfer:start', (event) => {
  console.log(`${event.direction}: ${event.source} -> ${event.destination}`);
});
```

#### `transfer:complete`
Emitted when transfer completes.

```typescript
$.on('transfer:complete', (event) => {
  console.log(`✓ Transferred ${event.bytesTransferred} bytes in ${event.duration}ms`);
  const speed = (event.bytesTransferred / 1024) / (event.duration / 1000);
  console.log(`Speed: ${speed.toFixed(2)} KB/s`);
});
```

#### `transfer:error`
Emitted when transfer fails.

```typescript
$.on('transfer:error', (event) => {
  console.error(`✗ Transfer failed: ${event.error}`);
  console.error(`${event.source} -> ${event.destination}`);
});
```

### Temporary File Events

#### `temp:create`
Emitted when creating temp file/directory.

```typescript
$.on('temp:create', (event) => {
  console.log(`Created temp ${event.type}: ${event.path}`);
});
```

#### `temp:cleanup`
Emitted when cleaning up temp resources.

```typescript
$.on('temp:cleanup', (event) => {
  console.log(`Cleaned up ${event.type}: ${event.path}`);
});
```

## Enhanced Event Handling

### Basic Usage

```typescript
// Type-safe event handling
import { ExecutionEngine, CommandStartEvent } from '@xec-sh/core';

const $ = new ExecutionEngine();

// Add listener
const handler = (event: CommandStartEvent) => {
  console.log(`Starting: ${event.command}`);
  console.log(`Adapter: ${event.adapter}`);
};
$.on('command:start', handler);

// Remove listener
$.off('command:start', handler);

// One-time listener
$.once('command:complete', (event) => {
  console.log('First command completed!');
});

// Remove all listeners for an event
$.removeAllListeners('command:start');
```

### Event Filtering

The enhanced event system supports filtering events by properties:

```typescript
// Filter by adapter
$.onFiltered('command:start', { adapter: 'ssh' }, (event) => {
  console.log('SSH command:', event.command);
});

// Filter by multiple adapters
$.onFiltered('command:complete', { adapter: ['ssh', 'docker'] }, (event) => {
  console.log(`Remote command completed: ${event.command}`);
});

// Filter by host (SSH events)
$.onFiltered('ssh:connect', { host: 'production.server.com' }, (event) => {
  console.log('Connected to production!');
});

// Multiple filters
$.onFiltered('command:error', {
  adapter: 'docker',
  command: 'build'
}, (event) => {
  console.log('Docker build failed:', event.error);
});

// Remove filtered listener
const filteredHandler = (event) => console.log(event);
$.onFiltered('command:start', { adapter: 'ssh' }, filteredHandler);
$.offFiltered('command:start', filteredHandler);
```

### Wildcard Patterns

Use wildcards to listen to groups of events:

```typescript
// Listen to all command events
$.onFiltered('command:*', (event) => {
  console.log(`Command event:`, event);
});

// Listen to all SSH events
$.onFiltered('ssh:*', (event) => {
  console.log(`SSH event:`, event);
});

// Listen to all transfer events
$.onFiltered('transfer:*', (event) => {
  console.log(`Transfer ${event.direction}:`, event);
});

// Listen to all events
$.onFiltered('*', (event) => {
  console.log(`[${event.adapter}] Event:`, event);
});

// Combine wildcards with filters
$.onFiltered('ssh:*', { host: 'prod.example.com' }, (event) => {
  console.log('Production SSH event:', event);
});
```

## Advanced Event Patterns

### Event Aggregation

```typescript
class CommandMetrics {
  private metrics = new Map<string, {
    count: number;
    totalDuration: number;
    errors: number;
  }>();

  constructor(private $: ExecutionEngine) {
    this.$.on('command:complete', this.recordSuccess.bind(this));
    this.$.on('command:error', this.recordError.bind(this));
  }

  private recordSuccess(event: CommandCompleteEvent) {
    const key = `${event.adapter}:${event.command.split(' ')[0]}`;
    const stats = this.metrics.get(key) || { count: 0, totalDuration: 0, errors: 0 };
    
    stats.count++;
    stats.totalDuration += event.duration;
    this.metrics.set(key, stats);
  }

  private recordError(event: CommandErrorEvent) {
    const key = `${event.adapter}:${event.command.split(' ')[0]}`;
    const stats = this.metrics.get(key) || { count: 0, totalDuration: 0, errors: 0 };
    
    stats.errors++;
    stats.totalDuration += event.duration;
    this.metrics.set(key, stats);
  }

  getReport() {
    return Array.from(this.metrics.entries()).map(([key, stats]) => ({
      command: key,
      executions: stats.count + stats.errors,
      successRate: (stats.count / (stats.count + stats.errors)) * 100,
      avgDuration: stats.totalDuration / (stats.count + stats.errors)
    }));
  }
}
```

### Event Correlation

```typescript
class ExecutionTracker {
  private executions = new Map<string, {
    startTime: Date;
    command: string;
    adapter: string;
  }>();

  constructor(private $: ExecutionEngine) {
    // Generate unique ID for each command
    let commandId = 0;

    this.$.on('command:start', (event) => {
      const id = `cmd-${++commandId}`;
      this.executions.set(id, {
        startTime: event.timestamp,
        command: event.command,
        adapter: event.adapter
      });
      
      // Attach ID to event for correlation
      (event as any).__id = id;
    });

    this.$.on('command:complete', (event) => {
      const id = (event as any).__id;
      const execution = this.executions.get(id);
      
      if (execution) {
        console.log(`Command completed:`);
        console.log(`  Command: ${execution.command}`);
        console.log(`  Duration: ${event.duration}ms`);
        console.log(`  Adapter: ${execution.adapter}`);
        
        this.executions.delete(id);
      }
    });
  }
}
```

### Event Replay

```typescript
class EventRecorder {
  private events: Array<{ type: string; data: any; timestamp: Date }> = [];
  private recording = false;

  constructor(private $: ExecutionEngine) {
    this.$.onFiltered('*', (event) => {
      if (this.recording) {
        this.events.push({
          type: (event as any).type || 'unknown',
          data: event,
          timestamp: new Date()
        });
      }
    });
  }

  start() {
    this.recording = true;
    this.events = [];
  }

  stop() {
    this.recording = false;
  }

  replay(speed = 1) {
    const startTime = this.events[0]?.timestamp.getTime() || Date.now();
    
    for (const event of this.events) {
      const delay = (event.timestamp.getTime() - startTime) / speed;
      
      setTimeout(() => {
        console.log(`[REPLAY] ${event.type}:`, event.data);
      }, delay);
    }
  }

  save(filename: string) {
    require('fs').writeFileSync(
      filename,
      JSON.stringify(this.events, null, 2)
    );
  }
}
```

## Emitting Events

### Enhanced Event Emission

The `EnhancedEventEmitter` provides automatic metadata injection:

```typescript
// Using emitEnhanced for automatic timestamp and adapter
$.emitEnhanced('command:start', {
  command: 'ls -la',
  cwd: '/home/user'
}, 'local');

// Regular emit with full event data
$.emit('command:complete', {
  command: 'ls -la',
  exitCode: 0,
  stdout: 'file1.txt\nfile2.txt',
  stderr: '',
  duration: 45,
  timestamp: new Date(),
  adapter: 'local'
});
```

### Custom Event Types

Extend the event system with your own events:

```typescript
// Define custom event types
interface CustomEventMap {
  'app:user:login': {
    userId: string;
    timestamp: Date;
    source: string;
  };
  'app:task:complete': {
    taskId: string;
    result: any;
    duration: number;
    timestamp: Date;
  };
}

// Create typed emitter
class AppEventEmitter extends EventEmitter {
  emit<K extends keyof CustomEventMap>(
    event: K,
    data: CustomEventMap[K]
  ): boolean {
    return super.emit(event, data);
  }

  on<K extends keyof CustomEventMap>(
    event: K,
    listener: (data: CustomEventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }
}

// Usage
const appEvents = new AppEventEmitter();

appEvents.on('app:user:login', (event) => {
  console.log(`User ${event.userId} logged in from ${event.source}`);
});

appEvents.emit('app:user:login', {
  userId: 'user123',
  timestamp: new Date(),
  source: 'web'
});
```

## Real-World Examples

### SSH Connection Monitoring

```typescript
class SSHMonitor {
  private connections = new Map<string, {
    connected: boolean;
    lastSeen: Date;
    commandCount: number;
  }>();

  constructor(private $: ExecutionEngine) {
    // Track connections
    this.$.on('ssh:connect', (event) => {
      this.connections.set(event.host, {
        connected: true,
        lastSeen: event.timestamp,
        commandCount: 0
      });
      console.log(`✓ SSH connected to ${event.host}`);
    });

    // Track disconnections
    this.$.on('ssh:disconnect', (event) => {
      const conn = this.connections.get(event.host);
      if (conn) {
        conn.connected = false;
        console.log(`✗ SSH disconnected from ${event.host}`);
      }
    });

    // Count commands
    this.$.on('ssh:execute', (event) => {
      const conn = this.connections.get(event.host);
      if (conn) {
        conn.commandCount++;
        conn.lastSeen = event.timestamp;
      }
    });

    // Monitor pool health
    this.$.on('ssh:pool-metrics', (event) => {
      const m = event.metrics;
      if (m.activeConnections > m.totalConnections * 0.8) {
        console.warn('SSH pool near capacity!');
      }
    });
  }

  getStatus() {
    return Array.from(this.connections.entries()).map(([host, stats]) => ({
      host,
      ...stats,
      idle: Date.now() - stats.lastSeen.getTime()
    }));
  }
}
```

### Deployment Pipeline

```typescript
class DeploymentPipeline {
  private stages = ['build', 'test', 'deploy'];
  private currentStage = 0;

  constructor(private $: ExecutionEngine) {
    this.setupHandlers();
  }

  private setupHandlers() {
    // Success advances to next stage
    this.$.on('command:complete', (event) => {
      if (event.command.includes(this.stages[this.currentStage])) {
        console.log(`✓ Stage ${this.stages[this.currentStage]} completed`);
        this.currentStage++;
        
        if (this.currentStage < this.stages.length) {
          this.runStage(this.stages[this.currentStage]);
        } else {
          console.log('🎉 Deployment complete!');
        }
      }
    });

    // Failure stops pipeline
    this.$.on('command:error', (event) => {
      console.error(`✗ Stage ${this.stages[this.currentStage]} failed`);
      console.error(`Error: ${event.error}`);
      this.$.emit('deploy:failed', {
        stage: this.stages[this.currentStage],
        error: event.error,
        timestamp: event.timestamp,
        adapter: event.adapter
      });
    });
  }

  async start() {
    this.currentStage = 0;
    await this.runStage(this.stages[0]);
  }

  private async runStage(stage: string) {
    console.log(`Starting stage: ${stage}`);
    await this.$`./scripts/${stage}.sh`;
  }
}
```

### Transfer Progress Tracker

```typescript
class TransferMonitor {
  private activeTransfers = new Map<string, {
    source: string;
    destination: string;
    startTime: Date;
    bytesTransferred: number;
  }>();

  constructor(private $: ExecutionEngine) {
    // Track transfer starts
    this.$.on('transfer:start', (event) => {
      const key = `${event.source}->${event.destination}`;
      this.activeTransfers.set(key, {
        source: event.source,
        destination: event.destination,
        startTime: event.timestamp,
        bytesTransferred: 0
      });
      
      console.log(`📤 ${event.direction}: ${event.source}`);
    });

    // Track completions
    this.$.on('transfer:complete', (event) => {
      const key = `${event.source}->${event.destination}`;
      const transfer = this.activeTransfers.get(key);
      
      if (transfer) {
        const speed = event.bytesTransferred / (event.duration / 1000);
        console.log(`✓ Transferred ${this.formatBytes(event.bytesTransferred)}`);
        console.log(`  Speed: ${this.formatBytes(speed)}/s`);
        console.log(`  Time: ${event.duration}ms`);
        
        this.activeTransfers.delete(key);
      }
    });

    // Handle errors
    this.$.on('transfer:error', (event) => {
      const key = `${event.source}->${event.destination}`;
      console.error(`✗ Transfer failed: ${event.error}`);
      this.activeTransfers.delete(key);
    });
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    
    return `${size.toFixed(2)} ${units[unit]}`;
  }
}
```

## Testing with Events

### Mock Event Testing

```typescript
import { ExecutionEngine } from '@xec-sh/core';

describe('Event handling', () => {
  let $: ExecutionEngine;
  let events: any[] = [];

  beforeEach(() => {
    $ = new ExecutionEngine();
    
    // Capture all events
    $.onFiltered('*', (event) => {
      events.push(event);
    });
  });

  afterEach(() => {
    events = [];
    $.removeAllListeners();
  });

  it('should emit command events', async () => {
    await $`echo test`;

    const startEvents = events.filter(e => 
      e.command === 'echo test' && e.timestamp
    );
    expect(startEvents.length).toBeGreaterThan(0);

    const completeEvents = events.filter(e => 
      e.exitCode === 0 && e.command === 'echo test'
    );
    expect(completeEvents.length).toBe(1);
  });

  it('should filter events by adapter', async () => {
    const sshEvents: any[] = [];
    
    $.onFiltered('*', { adapter: 'ssh' }, (event) => {
      sshEvents.push(event);
    });

    // Simulate SSH event
    $.emit('ssh:connect', {
      host: 'test.server.com',
      port: 22,
      timestamp: new Date(),
      adapter: 'ssh'
    });

    expect(sshEvents).toHaveLength(1);
    expect(sshEvents[0].host).toBe('test.server.com');
  });
});
```

### Event Order Verification

```typescript
class EventSequenceValidator {
  private sequence: string[] = [];
  private expectations: string[] = [];

  constructor(private $: ExecutionEngine) {
    this.$.onFiltered('*', (event) => {
      // Track event types in order
      const eventType = this.getEventType(event);
      if (eventType) {
        this.sequence.push(eventType);
      }
    });
  }

  private getEventType(event: any): string | null {
    // Identify event type from structure
    if ('command' in event && 'exitCode' in event) {
      return event.exitCode === 0 ? 'command:complete' : 'command:error';
    }
    if ('command' in event && !('exitCode' in event)) {
      return 'command:start';
    }
    return null;
  }

  expect(...events: string[]) {
    this.expectations = events;
    return this;
  }

  async verify() {
    // Wait for events to settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(this.sequence).toEqual(this.expectations);
  }

  reset() {
    this.sequence = [];
    this.expectations = [];
  }
}

// Usage
const validator = new EventSequenceValidator($);

validator.expect(
  'command:start',
  'command:complete'
);

await $`echo test`;
await validator.verify();
```

## Best Practices

### 1. Use Type-Safe Events

```typescript
// ✅ Good - Type-safe event handling
import { CommandCompleteEvent } from '@xec-sh/core';

$.on('command:complete', (event: CommandCompleteEvent) => {
  console.log(`Duration: ${event.duration}ms`);
});

// ❌ Bad - Untyped event handling
$.on('command:complete', (event: any) => {
  console.log(event.duration); // No type checking
});
```

### 2. Clean Up Event Listeners

```typescript
// ✅ Good - Clean up listeners
class Component {
  private handlers: Array<() => void> = [];

  constructor(private $: ExecutionEngine) {
    const handler = (event) => console.log(event);
    this.$.on('command:start', handler);
    
    // Store cleanup function
    this.handlers.push(() => {
      this.$.off('command:start', handler);
    });
  }

  dispose() {
    // Clean up all handlers
    this.handlers.forEach(cleanup => cleanup());
    this.handlers = [];
  }
}

// ❌ Bad - Memory leak
class BadComponent {
  constructor(private $: ExecutionEngine) {
    this.$.on('command:start', (event) => {
      console.log(event); // Never removed!
    });
  }
}
```

### 3. Handle Errors in Event Listeners

```typescript
// ✅ Good - Error handling
$.on('command:complete', async (event) => {
  try {
    await processResult(event);
  } catch (error) {
    console.error('Event handler error:', error);
    // Don't let errors bubble up and crash the app
  }
});

// ❌ Bad - Unhandled errors
$.on('command:complete', async (event) => {
  await processResult(event); // Could crash if throws
});
```

### 4. Use Event Filtering

```typescript
// ✅ Good - Specific filtering
$.onFiltered('command:error', { adapter: 'ssh' }, (event) => {
  handleSSHError(event);
});

// ❌ Bad - Manual filtering
$.on('command:error', (event) => {
  if (event.adapter === 'ssh') { // Manual check
    handleSSHError(event);
  }
});
```

### 5. Avoid Blocking Operations

```typescript
// ✅ Good - Non-blocking
$.on('command:complete', (event) => {
  // Queue for processing
  setImmediate(() => {
    performExpensiveOperation(event);
  });
});

// ❌ Bad - Blocks event loop
$.on('command:complete', (event) => {
  performExpensiveOperation(event); // Blocks other events
});
```

### 6. Document Custom Events

```typescript
// ✅ Good - Well-documented custom events

/**
 * Emitted when user authentication succeeds
 * @event auth:success
 * @param {string} userId - The authenticated user's ID
 * @param {string} method - Authentication method used
 * @param {Date} timestamp - When authentication occurred
 */
class AuthService {
  login(credentials: Credentials) {
    // ... authentication logic ...
    
    this.emit('auth:success', {
      userId: user.id,
      method: 'password',
      timestamp: new Date()
    });
  }
}
```

### 7. Use Meaningful Event Names

```typescript
// ✅ Good - Clear, hierarchical naming
'user:login:success'
'user:login:failed'
'order:created'
'order:shipped'
'payment:processed'

// ❌ Bad - Ambiguous names
'success'
'error'
'update'
'done'
```

### 8. Consider Event Order

```typescript
// ✅ Good - Handle async event order
class OrderService {
  private pendingOrders = new Map();

  constructor(private $: ExecutionEngine) {
    // Order might not exist yet when payment processes
    this.$.on('payment:processed', async (event) => {
      // Wait for order to be created if needed
      const order = await this.waitForOrder(event.orderId);
      await this.fulfillOrder(order);
    });
  }

  private async waitForOrder(orderId: string, timeout = 5000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (this.pendingOrders.has(orderId)) {
        return this.pendingOrders.get(orderId);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Order ${orderId} not found`);
  }
}
```

## TypeScript Support

The event system is fully typed for excellent developer experience:

```typescript
import { 
  ExecutionEngine,
  UshEventMap,
  CommandStartEvent,
  SSHConnectEvent,
  TypedEventEmitter
} from '@xec-sh/core';

// All events are typed
const $: ExecutionEngine = new ExecutionEngine();

// Auto-completion for event names
$.on('command:start', (event) => {
  // event is typed as CommandStartEvent
  console.log(event.command); // ✓ OK
  console.log(event.invalid); // ✗ Error: Property 'invalid' does not exist
});

// Type-safe filtering
$.onFiltered('ssh:connect', { host: 'prod.example.com' }, 
  (event: SSHConnectEvent) => {
    console.log(`Connected to ${event.host}`);
  }
);

// Extend with custom events
interface MyEvents extends UshEventMap {
  'custom:event': {
    id: string;
    value: number;
    timestamp: Date;
    adapter: string;
  };
}

// Create extended emitter
const emitter = new ExecutionEngine() as TypedEventEmitter<MyEvents>;

emitter.on('custom:event', (event) => {
  console.log(event.id); // Fully typed!
});
```

## Performance Considerations

1. **Event listener count** - Monitor listener counts to detect leaks
   ```typescript
   console.log($.listenerCount('command:start'));
   ```

2. **Wildcard performance** - Wildcard listeners have overhead
   ```typescript
   // More efficient
   $.on('command:start', handler);
   $.on('command:complete', handler);
   
   // Less efficient but more convenient
   $.onFiltered('command:*', handler);
   ```

3. **Event data size** - Keep event payloads small
   ```typescript
   // ✅ Good - Reference to data
   $.emit('data:ready', { dataId: 'abc123' });
   
   // ❌ Bad - Large payload
   $.emit('data:ready', { data: hugeBinaryBlob });
   ```

## Related Documentation

- [Execution Engine](./execution-engine) - Core event emitter
- [Process Promise](./process-promise) - Command execution events
- [Adapters](./adapters) - Adapter-specific events
- [Types](./types) - Complete event type definitions