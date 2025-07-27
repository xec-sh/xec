---
sidebar_position: 5
---

# Event System

Monitor and react to execution lifecycle events in @xec-sh/core.

## Overview

The event system provides detailed insights into command execution, allowing you to:

- **Monitor Execution** - Track command start, success, and failure
- **Debug Issues** - See detailed execution information
- **Build Tooling** - Create progress bars, loggers, and monitors
- **Audit Activity** - Log all commands and results
- **Handle Errors** - React to specific error conditions

## Basic Event Handling

### Listening to Events

```typescript
import { $ } from '@xec-sh/core';

// Listen to command start
$.on('command:start', (event) => {
  console.log(`Executing: ${event.command}`);
  console.log(`Adapter: ${event.adapter}`);
});

// Listen to command completion
$.on('command:success', (event) => {
  console.log(`Completed in ${event.duration}ms`);
  console.log(`Exit code: ${event.exitCode}`);
});

// Listen to errors
$.on('command:error', (event) => {
  console.error(`Failed: ${event.error.message}`);
  console.error(`Exit code: ${event.exitCode}`);
});
```

### Removing Listeners

```typescript
// Create named handler
const startHandler = (event) => {
  console.log(`Starting: ${event.command}`);
};

// Add listener
$.on('command:start', startHandler);

// Remove specific listener
$.off('command:start', startHandler);

// Remove all listeners for an event
$.off('command:start');

// Remove all listeners
$.removeAllListeners();
```

## Event Types

### Command Events

```typescript
// Before command execution
$.on('command:start', (event) => {
  console.log({
    command: event.command,      // Full command string
    adapter: event.adapter,      // 'local', 'ssh', 'docker', etc.
    timestamp: event.timestamp,  // Start time
    config: event.config        // Command configuration
  });
});

// After successful execution
$.on('command:success', (event) => {
  console.log({
    command: event.command,
    adapter: event.adapter,
    duration: event.duration,    // Execution time in ms
    exitCode: event.exitCode,    // 0 for success
    stdout: event.stdout,        // Standard output
    stderr: event.stderr,        // Standard error
    timestamp: event.timestamp
  });
});

// After failed execution
$.on('command:error', (event) => {
  console.log({
    command: event.command,
    adapter: event.adapter,
    duration: event.duration,
    exitCode: event.exitCode,    // Non-zero
    error: event.error,          // Error object
    stdout: event.stdout,
    stderr: event.stderr,
    timestamp: event.timestamp
  });
});

// After any completion
$.on('command:end', (event) => {
  // Fired for both success and error
  console.log(`Command ended: ${event.command}`);
});
```

### Connection Events

```typescript
// Generic connection events (all adapters)
$.on('connection:open', (event) => {
  console.log(`Connection opened: ${event.adapter}`);
  console.log(`Target: ${event.target}`);
});

$.on('connection:close', (event) => {
  console.log(`Connection closed: ${event.adapter}`);
  console.log(`Reason: ${event.reason}`);
});

// SSH-specific events
$.on('ssh:connect', (event) => {
  console.log(`SSH connected to ${event.host}:${event.port}`);
  console.log(`User: ${event.username}`);
});

$.on('ssh:disconnect', (event) => {
  console.log(`SSH disconnected from ${event.host}`);
});

$.on('ssh:error', (event) => {
  console.error(`SSH error on ${event.host}: ${event.error.message}`);
});

// Docker-specific events
$.on('docker:pull', (event) => {
  console.log(`Pulling image: ${event.image}`);
});

$.on('docker:create', (event) => {
  console.log(`Created container: ${event.container}`);
});

$.on('docker:start', (event) => {
  console.log(`Started container: ${event.container}`);
});
```

### File Operation Events

```typescript
// File read
$.on('file:read', (event) => {
  console.log(`Reading file: ${event.path}`);
  console.log(`Size: ${event.size} bytes`);
});

// File write
$.on('file:write', (event) => {
  console.log(`Writing file: ${event.path}`);
  console.log(`Size: ${event.size} bytes`);
});

// File transfer
$.on('file:upload', (event) => {
  console.log(`Uploading: ${event.source} -> ${event.destination}`);
  console.log(`Progress: ${event.progress}%`);
});

$.on('file:download', (event) => {
  console.log(`Downloading: ${event.source} -> ${event.destination}`);
  console.log(`Progress: ${event.progress}%`);
});
```

### Retry Events

```typescript
// Retry attempt
$.on('retry:attempt', (event) => {
  console.log(`Retry attempt ${event.attempt} of ${event.maxAttempts}`);
  console.log(`Delay: ${event.delay}ms`);
  console.log(`Error: ${event.error.message}`);
});

// Retry success
$.on('retry:success', (event) => {
  console.log(`Succeeded after ${event.attempts} attempts`);
  console.log(`Total duration: ${event.totalDuration}ms`);
});

// Retry failure
$.on('retry:failed', (event) => {
  console.log(`Failed after ${event.attempts} attempts`);
  console.log(`Errors: ${event.errors.map(e => e.message).join(', ')}`);
});
```

### Cache Events

```typescript
// Cache hit
$.on('cache:hit', (event) => {
  console.log(`Cache hit for: ${event.key}`);
  console.log(`Age: ${event.age}ms`);
});

// Cache miss
$.on('cache:miss', (event) => {
  console.log(`Cache miss for: ${event.key}`);
});

// Cache set
$.on('cache:set', (event) => {
  console.log(`Cached: ${event.key}`);
  console.log(`TTL: ${event.ttl}ms`);
});

// Cache expire
$.on('cache:expire', (event) => {
  console.log(`Cache expired: ${event.key}`);
});
```

### Temporary File Events

```typescript
// Temp file/directory creation
$.on('temp:create', (event) => {
  console.log(`Created temp ${event.type}: ${event.path}`);
});

// Temp file/directory cleanup
$.on('temp:cleanup', (event) => {
  console.log(`Cleaned up temp ${event.type}: ${event.path}`);
});
```

### Tunnel Events

```typescript
// SSH tunnel events
$.on('tunnel:created', (event) => {
  console.log(`Tunnel created: localhost:${event.localPort} -> ${event.remoteHost}:${event.remotePort}`);
});

$.on('tunnel:closed', (event) => {
  console.log(`Tunnel closed: localhost:${event.localPort}`);
});

$.on('tunnel:error', (event) => {
  console.error(`Tunnel error: ${event.error.message}`);
});
```

## Advanced Event Handling

### Wildcard Events

Listen to multiple events with wildcards:

```typescript
// All command events
$.on('command:*', (event) => {
  console.log(`Command event: ${event.type}`);
});

// All SSH events
$.on('ssh:*', (event) => {
  console.log(`SSH event: ${event.type}`);
});

// All error events
$.on('*:error', (event) => {
  console.error(`Error in ${event.category}: ${event.error.message}`);
});

// All events
$.on('*', (event) => {
  console.log(`Event: ${event.type}`);
});
```

### Event Filtering

Filter events by properties:

```typescript
// Filter by adapter
$.onFiltered('command:start', { adapter: 'ssh' }, (event) => {
  console.log(`SSH command: ${event.command}`);
});

// Filter by multiple properties
$.onFiltered('command:error', { 
  adapter: 'docker',
  exitCode: 125 
}, (event) => {
  console.log('Docker daemon error');
});

// Complex filtering
$.onFiltered('command:end', (event) => {
  return event.duration > 5000 && event.adapter === 'local';
}, (event) => {
  console.log(`Slow local command: ${event.command} (${event.duration}ms)`);
});

// Remove filtered listener
$.offFiltered('command:start', { adapter: 'ssh' }, handler);
```

### Engine Instance Events

Create isolated event handlers:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

// Create engine with event handlers
const engine = new ExecutionEngine();

engine.on('command:start', (event) => {
  console.log('Engine command:', event.command);
});

// Convert to callable
const $custom = engine.asCallable();

// Events are isolated to this engine
await $custom`echo "test"`; // Triggers engine event
await $`echo "test"`;        // Does not trigger engine event
```

## Event Patterns

### Command Logging

```typescript
// Comprehensive command logger
class CommandLogger {
  private logFile: string;
  
  constructor(logFile: string) {
    this.logFile = logFile;
    this.setupListeners();
  }
  
  private setupListeners() {
    $.on('command:start', (event) => {
      this.log({
        type: 'start',
        command: event.command,
        adapter: event.adapter,
        timestamp: event.timestamp
      });
    });
    
    $.on('command:end', (event) => {
      this.log({
        type: 'end',
        command: event.command,
        duration: event.duration,
        exitCode: event.exitCode,
        success: event.exitCode === 0,
        timestamp: new Date()
      });
    });
    
    $.on('command:error', (event) => {
      this.log({
        type: 'error',
        command: event.command,
        error: event.error.message,
        stderr: event.stderr,
        timestamp: new Date()
      });
    });
  }
  
  private log(entry: any) {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logFile, line);
  }
}

const logger = new CommandLogger('./commands.log');
```

### Progress Tracking

```typescript
// Track command progress
class ProgressTracker {
  private active = new Map<string, any>();
  
  constructor() {
    $.on('command:start', (event) => {
      const id = this.generateId(event);
      this.active.set(id, {
        command: event.command,
        start: Date.now(),
        adapter: event.adapter
      });
      this.updateDisplay();
    });
    
    $.on('command:end', (event) => {
      const id = this.generateId(event);
      this.active.delete(id);
      this.updateDisplay();
    });
  }
  
  private generateId(event: any): string {
    return `${event.adapter}-${event.timestamp}`;
  }
  
  private updateDisplay() {
    console.clear();
    console.log('Active Commands:');
    for (const [id, info] of this.active) {
      const elapsed = Date.now() - info.start;
      console.log(`  [${info.adapter}] ${info.command} (${elapsed}ms)`);
    }
  }
}

const tracker = new ProgressTracker();
```

### Error Monitoring

```typescript
// Monitor and alert on errors
class ErrorMonitor {
  private errorCounts = new Map<string, number>();
  private errorThreshold = 5;
  
  constructor() {
    $.on('command:error', (event) => {
      this.recordError(event);
    });
    
    $.on('ssh:error', (event) => {
      this.recordError({
        adapter: 'ssh',
        error: event.error,
        host: event.host
      });
    });
    
    $.on('docker:error', (event) => {
      this.recordError({
        adapter: 'docker',
        error: event.error,
        container: event.container
      });
    });
  }
  
  private recordError(event: any) {
    const key = `${event.adapter}-${event.error.code || 'unknown'}`;
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);
    
    if (count >= this.errorThreshold) {
      this.alert({
        message: `High error rate: ${key}`,
        count,
        lastError: event.error.message
      });
    }
  }
  
  private alert(details: any) {
    console.error('🚨 ERROR ALERT:', details);
    // Send to monitoring service, email, etc.
  }
}

const monitor = new ErrorMonitor();
```

### Performance Monitoring

```typescript
// Track command performance
class PerformanceMonitor {
  private stats = new Map<string, any>();
  
  constructor() {
    $.on('command:end', (event) => {
      this.recordMetric(event);
    });
    
    // Report stats periodically
    setInterval(() => this.report(), 60000);
  }
  
  private recordMetric(event: any) {
    const key = `${event.adapter}:${event.command.split(' ')[0]}`;
    
    if (!this.stats.has(key)) {
      this.stats.set(key, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errors: 0
      });
    }
    
    const stat = this.stats.get(key);
    stat.count++;
    stat.totalDuration += event.duration;
    stat.minDuration = Math.min(stat.minDuration, event.duration);
    stat.maxDuration = Math.max(stat.maxDuration, event.duration);
    if (event.exitCode !== 0) stat.errors++;
  }
  
  private report() {
    console.log('\n=== Performance Report ===');
    for (const [key, stat] of this.stats) {
      const avg = stat.totalDuration / stat.count;
      console.log(`${key}:`);
      console.log(`  Calls: ${stat.count}`);
      console.log(`  Avg: ${avg.toFixed(2)}ms`);
      console.log(`  Min: ${stat.minDuration}ms`);
      console.log(`  Max: ${stat.maxDuration}ms`);
      console.log(`  Errors: ${stat.errors}`);
    }
  }
}

const perfMon = new PerformanceMonitor();
```

### Audit Trail

```typescript
// Create detailed audit trail
class AuditTrail {
  private auditLog: any[] = [];
  
  constructor() {
    // Capture all events
    $.on('*', (event) => {
      this.auditLog.push({
        timestamp: new Date(),
        type: event.type,
        event: this.sanitizeEvent(event)
      });
    });
  }
  
  private sanitizeEvent(event: any): any {
    // Remove sensitive data
    const sanitized = { ...event };
    
    if (sanitized.password) {
      sanitized.password = '***';
    }
    
    if (sanitized.privateKey) {
      sanitized.privateKey = '***';
    }
    
    if (sanitized.env) {
      sanitized.env = this.sanitizeEnv(sanitized.env);
    }
    
    return sanitized;
  }
  
  private sanitizeEnv(env: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD')) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  
  async save(filename: string) {
    await fs.writeFile(filename, JSON.stringify(this.auditLog, null, 2));
  }
}

const audit = new AuditTrail();
// ... execute commands ...
await audit.save('./audit-trail.json');
```

## Best Practices

### 1. Clean Up Listeners

```typescript
// ✅ Remove listeners when done
const handler = (event) => console.log(event);
$.on('command:start', handler);

// Later...
$.off('command:start', handler);

// ❌ Memory leak - never removed
$.on('command:start', (event) => console.log(event));
```

### 2. Use Specific Events

```typescript
// ✅ Listen to specific events
$.on('ssh:connect', (event) => {
  console.log(`SSH connected to ${event.host}`);
});

// ❌ Too broad - lots of noise
$.on('*', (event) => {
  console.log(event);
});
```

### 3. Handle Errors in Listeners

```typescript
// ✅ Handle errors in event handlers
$.on('command:end', (event) => {
  try {
    processCommandResult(event);
  } catch (error) {
    console.error('Error in event handler:', error);
  }
});

// ❌ Unhandled errors
$.on('command:end', (event) => {
  processCommandResult(event); // Might throw
});
```

### 4. Filter Efficiently

```typescript
// ✅ Filter at event level
$.onFiltered('command:start', { adapter: 'ssh' }, handler);

// ❌ Filter in handler - less efficient
$.on('command:start', (event) => {
  if (event.adapter === 'ssh') {
    handler(event);
  }
});
```

### 5. Use Event Types

```typescript
// ✅ Type-safe event handling
import type { CommandStartEvent } from '@xec-sh/core';

$.on('command:start', (event: CommandStartEvent) => {
  console.log(event.command); // TypeScript knows the properties
});
```

## Debugging with Events

### Event Logger

```typescript
// Debug mode - log all events
if (process.env.DEBUG) {
  $.on('*', (event) => {
    console.log(`[${new Date().toISOString()}] ${event.type}:`, event);
  });
}
```

### Command Replay

```typescript
// Record commands for replay
const recording: any[] = [];

$.on('command:start', (event) => {
  recording.push({
    type: 'command',
    command: event.command,
    adapter: event.adapter,
    config: event.config
  });
});

// Save for replay
fs.writeFileSync('commands.json', JSON.stringify(recording, null, 2));
```

### Performance Profiling

```typescript
// Profile command execution
const timings = new Map();

$.on('command:start', (event) => {
  timings.set(event.timestamp, {
    command: event.command,
    start: process.hrtime.bigint()
  });
});

$.on('command:end', (event) => {
  const timing = timings.get(event.timestamp);
  if (timing) {
    const end = process.hrtime.bigint();
    const duration = Number(end - timing.start) / 1_000_000; // Convert to ms
    console.log(`[PROFILE] ${timing.command}: ${duration.toFixed(2)}ms`);
    timings.delete(event.timestamp);
  }
});
```