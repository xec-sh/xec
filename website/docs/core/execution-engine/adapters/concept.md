---
title: Adapter Concept
sidebar_label: Concept
description: Architecture of the adapter system for executing commands in various environments
---

# Adapter Concept

Adapters are a key component of the Xec architecture, providing command execution in various environments through a unified API. Each adapter encapsulates the specifics of a particular environment while providing a universal interface.

## Adapter System Architecture

```
┌─────────────────────────────────────────────┐
│              ExecutionEngine                │
│                                             │
│  • Adapter management                       │
│  • Command routing                          │
│  • Configuration and context                │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│              BaseAdapter                    │
│                                             │
│  • Base functionality                       │
│  • Stream processing                        │
│  • Data masking                             │
│  • Error handling                           │
└──────┬──────┬──────┬───────┬───────┬────────┘
       │      │      │       │       │
       ▼      ▼      ▼       ▼       ▼
   ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐
   │Local ││ SSH  ││Docker││ K8s  ││Remote│
   └──────┘└──────┘└──────┘└──────┘└──────┘
```

## Base Adapter Class

All adapters inherit from `BaseAdapter`:

```typescript
export abstract class BaseAdapter extends EnhancedEventEmitter {
  protected config: BaseAdapterConfig;
  protected abstract readonly adapterName: string;
  
  // Main execution method
  abstract execute(command: Command): Promise<ExecutionResult>;
  
  // Availability check
  abstract isAvailable(): Promise<boolean>;
  
  // Resource cleanup
  abstract dispose(): Promise<void>;
  
  // Optional synchronous version
  executeSync?(command: Command): ExecutionResult;
}
```

### Adapter Configuration

```typescript
interface BaseAdapterConfig {
  defaultTimeout?: number;        // Default timeout
  defaultCwd?: string;            // Working directory
  defaultEnv?: Record<string, string>; // Environment variables
  defaultShell?: string | boolean;    // Shell for execution
  encoding?: BufferEncoding;      // Output encoding
  maxBuffer?: number;             // Maximum buffer size
  throwOnNonZeroExit?: boolean;  // Throw exception on error
  sensitiveDataMasking?: {        // Data masking
    enabled: boolean;
    patterns: RegExp[];
    replacement: string;
  };
}
```

## Execution Lifecycle

### 1. Adapter Selection

```typescript
// Explicit selection
await $.ssh({ host: 'server' })`ls`;

// Through configuration
await $.with({ 
  adapter: 'docker',
  adapterOptions: { container: 'app' }
})`ls`;

// Automatic selection
await $`ls`;  // Uses LocalAdapter
```

### 2. Command Preparation

```typescript
// Adapter merges settings
protected mergeCommand(command: Command): Command {
  return {
    ...command,
    cwd: command.cwd ?? this.config.defaultCwd,
    env: { ...this.config.defaultEnv, ...command.env },
    timeout: command.timeout ?? this.config.defaultTimeout,
    shell: command.shell ?? this.config.defaultShell
  };
}
```

### 3. Execution

```typescript
// Each adapter implements its own logic
async execute(command: Command): Promise<ExecutionResult> {
  const merged = this.mergeCommand(command);
  
  // Adapter-specific implementation
  const result = await this.runInEnvironment(merged);
  
  // Creating unified result
  return this.createResult(
    result.stdout,
    result.stderr,
    result.exitCode,
    result.signal,
    merged
  );
}
```

### 4. Result Processing

```typescript
interface ExecutionResult {
  stdout: string;         // Standard output
  stderr: string;         // Error output
  exitCode: number;       // Exit code
  signal?: string;        // Termination signal
  duration: number;       // Execution time
  startTime: Date;        // Start time
  endTime: Date;          // End time
  adapter: string;        // Used adapter
  host?: string;          // Host (for SSH)
  container?: string;     // Container (for Docker)
}
```

## Adapter Types

### LocalAdapter

Command execution in the local system:

```typescript
const local = $.local();
await local`ls -la`;
```

**Features:**
- Direct execution via child_process
- Bun runtime support
- Synchronous execution
- Minimal overhead

### SSHAdapter

Command execution on remote servers:

```typescript
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  privateKey: '/path/to/key'
});
await ssh`ls -la`;
```

**Features:**
- SSH connection pool
- SSH tunnels
- File transfer (SCP/SFTP)
- Sudo support

### DockerAdapter

Command execution in Docker containers:

```typescript
const docker = $.docker({
  container: 'my-app'
});
await docker`ls -la`;
```

**Features:**
- Container lifecycle management
- Log streaming
- Volume mounting
- Docker Compose integration

### KubernetesAdapter

Command execution in Kubernetes pods:

```typescript
const k8s = $.k8s().pod('my-pod');
await k8s`ls -la`;
```

**Features:**
- Port forwarding
- Container logs
- File copying
- Namespace support

### RemoteDockerAdapter

Docker via SSH connection:

```typescript
const remote = $.remoteDocker({
  ssh: { host: 'server', username: 'user' },
  docker: { container: 'app' }
});
await remote`ls -la`;
```

**Features:**
- SSH and Docker combination
- Remote container management
- Docker API tunneling

## Common Adapter Capabilities

### Stream Processing

```typescript
// StreamHandler for all adapters
protected createStreamHandler(options?: {
  onData?: (chunk: string) => void
}): StreamHandler {
  return new StreamHandler({
    encoding: this.config.encoding,
    maxBuffer: this.config.maxBuffer,
    onData: options?.onData
  });
}
```

### Sensitive Data Masking

```typescript
// Automatic password and key hiding
protected maskSensitiveData(text: string): string {
  if (!this.config.sensitiveDataMasking.enabled) {
    return text;
  }
  
  for (const pattern of this.config.sensitiveDataMasking.patterns) {
    text = text.replace(pattern, this.config.sensitiveDataMasking.replacement);
  }
  
  return text;
}
```

**Masking Examples:**

```typescript
// Passwords
"password=secret123" → "password=[REDACTED]"

// API keys
"api_key: abc123" → "api_key: [REDACTED]"

// Bearer tokens
"Authorization: Bearer xyz789" → "Authorization: Bearer [REDACTED]"

// SSH keys
"-----BEGIN RSA PRIVATE KEY-----..." → "[REDACTED]"
```

### Timeout Handling

```typescript
protected async handleTimeout(
  promise: Promise<any>,
  timeout: number,
  command: string,
  cleanup?: () => void
): Promise<any> {
  if (timeout <= 0) return promise;
  
  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      if (cleanup) cleanup();
      reject(new TimeoutError(command, timeout));
    }, timeout);
    
    promise.finally(() => clearTimeout(timer));
  });
  
  return Promise.race([promise, timeoutPromise]);
}
```

### Adapter Events

```typescript
// Each adapter can generate events
adapter.on('connection:established', ({ host }) => {
  console.log(`Connected to ${host}`);
});

adapter.on('transfer:progress', ({ bytes, total }) => {
  console.log(`Transfer: ${bytes}/${total}`);
});

adapter.on('container:created', ({ id, name }) => {
  console.log(`Container ${name} created: ${id}`);
});
```

## Creating Your Own Adapter

### Step 1: Inherit from BaseAdapter

```typescript
import { BaseAdapter, BaseAdapterConfig } from '@xec-sh/core';

interface CustomAdapterConfig extends BaseAdapterConfig {
  customOption?: string;
}

export class CustomAdapter extends BaseAdapter {
  protected readonly adapterName = 'custom';
  private customConfig: CustomAdapterConfig;
  
  constructor(config: CustomAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.customConfig = config;
  }
}
```

### Step 2: Implement execute

```typescript
async execute(command: Command): Promise<ExecutionResult> {
  const merged = this.mergeCommand(command);
  const startTime = Date.now();
  
  try {
    // Your execution logic
    const result = await this.runCustomCommand(merged);
    
    return this.createResult(
      result.stdout,
      result.stderr,
      result.exitCode,
      result.signal,
      this.buildCommandString(merged),
      startTime,
      Date.now()
    );
  } catch (error) {
    throw new AdapterError(
      this.adapterName,
      'execute',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
```

### Step 3: Availability Check

```typescript
async isAvailable(): Promise<boolean> {
  try {
    // Check that environment is available
    await this.checkEnvironment();
    return true;
  } catch {
    return false;
  }
}
```

### Step 4: Resource Cleanup

```typescript
async dispose(): Promise<void> {
  // Close connections
  await this.closeConnections();
  
  // Clean up temporary files
  await this.cleanupTemp();
  
  // Remove event listeners
  this.removeAllListeners();
}
```

### Step 5: Register the Adapter

```typescript
import { ExecutionEngine } from '@xec-sh/core';
import { CustomAdapter } from './custom-adapter';

const $ = new ExecutionEngine();
$.registerAdapter('custom', new CustomAdapter({
  customOption: 'value'
}));

// Usage
await $.with({ adapter: 'custom' })`custom-command`;
```

## Resource Management

### Connection Pools

SSH and other network adapters use pools:

```typescript
class ConnectionPool {
  private connections = new Map<string, Connection>();
  private maxConnections = 10;
  private ttl = 300000; // 5 minutes
  
  async getConnection(key: string): Promise<Connection> {
    // Reuse existing
    if (this.connections.has(key)) {
      return this.connections.get(key)!;
    }
    
    // Create new
    const conn = await this.createConnection();
    this.connections.set(key, conn);
    
    // Auto-cleanup by TTL
    setTimeout(() => {
      this.closeConnection(key);
    }, this.ttl);
    
    return conn;
  }
}
```

### Lazy Initialization

Adapters are created only when needed:

```typescript
class ExecutionEngine {
  private adapters = new Map<string, BaseAdapter>();
  
  private async selectAdapter(command: Command): Promise<BaseAdapter> {
    const type = command.adapter || 'local';
    
    // Create on first use
    if (!this.adapters.has(type)) {
      this.adapters.set(type, this.createAdapter(type));
    }
    
    return this.adapters.get(type)!;
  }
}
```

## Error Handling

### Error Types

```typescript
// Adapter error
class AdapterError extends Error {
  constructor(
    public adapter: string,
    public operation: string,
    public cause: Error
  ) {
    super(`${adapter} adapter failed during ${operation}: ${cause.message}`);
  }
}

// Command error
class CommandError extends Error {
  constructor(
    public command: string,
    public exitCode: number,
    public stderr: string
  ) {
    super(`Command failed with exit code ${exitCode}: ${stderr}`);
  }
}

// Timeout error
class TimeoutError extends Error {
  constructor(
    public command: string,
    public timeout: number
  ) {
    super(`Command timed out after ${timeout}ms: ${command}`);
  }
}
```

### Handling Strategies

```typescript
// Automatic retry
async executeWithRetry(command: Command): Promise<ExecutionResult> {
  let lastError;
  
  for (let i = 0; i < 3; i++) {
    try {
      return await this.execute(command);
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  
  throw lastError;
}

// Fallback to another adapter
async executeWithFallback(command: Command): Promise<ExecutionResult> {
  try {
    return await this.primaryAdapter.execute(command);
  } catch {
    return await this.fallbackAdapter.execute(command);
  }
}
```

## Performance

### Adapter Metrics

```typescript
interface AdapterMetrics {
  totalExecutions: number;
  averageDuration: number;
  errorRate: number;
  activeConnections: number;
  cacheHitRate: number;
}

// Metric collection
adapter.on('command:complete', ({ duration }) => {
  metrics.totalExecutions++;
  metrics.averageDuration = 
    (metrics.averageDuration * (metrics.totalExecutions - 1) + duration) / 
    metrics.totalExecutions;
});
```

### Optimizations

1. **Result caching** - for idempotent commands
2. **Connection pools** - connection reuse
3. **Stream processing** - for large outputs
4. **Parallel execution** - for independent commands
5. **Lazy loading** - creation on demand

## Conclusion

The adapter system in Xec provides:

- **Universality**: unified API for all environments
- **Extensibility**: easy addition of new adapters
- **Security**: sensitive data masking
- **Performance**: optimizations for each environment
- **Reliability**: error handling and recovery

Adapters are the foundation for creating powerful automation tools that work in any environment.