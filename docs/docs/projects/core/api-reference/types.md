---
sidebar_position: 5
---

# TypeScript Types Reference

Complete TypeScript type definitions for @xec-sh/core, providing full type safety and excellent developer experience.

## Overview

@xec-sh/core is written in TypeScript and provides comprehensive type definitions for:
- **Core APIs** - Execution engine, process promises, results
- **Adapter Types** - SSH, Docker, Kubernetes configurations
- **Event System** - Type-safe event handling
- **Error Types** - Structured error hierarchy
- **Utility Types** - Helpers and type guards

## Core Interfaces

### CallableExecutionEngine

The main callable interface combining function and object patterns.

```typescript
interface CallableExecutionEngine {
  // Callable function interface
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Raw execution (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Configuration methods (return CallableExecutionEngine)
  with(config: Partial<Command>): CallableExecutionEngine;
  cd(dir: string): CallableExecutionEngine;
  env(env: Record<string, string>): CallableExecutionEngine;
  timeout(ms: number): CallableExecutionEngine;
  shell(shell: string | boolean): CallableExecutionEngine;
  retry(options: RetryOptions): CallableExecutionEngine;
  local(): CallableExecutionEngine;
  
  // Adapter methods (return specialized contexts)
  ssh(options: Omit<SSHAdapterOptions, 'type'>): SSHExecutionContext;
  docker(options: DockerContainerConfig): DockerContext;
  docker(options: Omit<DockerAdapterOptions, 'type'>): CallableExecutionEngine;
  k8s(options?: Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext;
  remoteDocker(options: Omit<RemoteDockerAdapterOptions, 'type'>): CallableExecutionEngine;
  
  // Global configuration
  defaults(config: Partial<Command> & {
    defaultEnv?: Record<string, string>;
    defaultCwd?: string;
  }): CallableExecutionEngine;
  
  // Configuration property
  readonly config: {
    set(updates: Partial<ExecutionEngineConfig>): void;
    get(): Readonly<ExecutionEngineConfig>;
  };
  
  // Utilities
  pwd(): string;
  which(command: string): Promise<string | null>;
  dispose(): Promise<void>;
  
  // Event handling
  on<K extends keyof UshEventMap>(
    event: K, 
    listener: (data: UshEventMap[K]) => void
  ): this;
  off<K extends keyof UshEventMap>(
    event: K, 
    listener: (data: UshEventMap[K]) => void
  ): this;
  emit<K extends keyof UshEventMap>(
    event: K, 
    data: UshEventMap[K]
  ): boolean;
}
```

### ProcessPromise

Chainable promise interface for command execution.

```typescript
interface ProcessPromise extends Promise<ExecutionResult> {
  // Stream access
  stdin: NodeJS.WritableStream;
  
  // Configuration methods (chainable)
  cwd(dir: string): ProcessPromise;
  env(vars: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  timeout(ms: number, timeoutSignal?: string): ProcessPromise;
  signal(signal: AbortSignal): ProcessPromise;
  
  // Behavior modifiers
  quiet(): ProcessPromise;
  nothrow(): ProcessPromise;
  interactive(): ProcessPromise;
  retry(options?: RetryOptions): ProcessPromise;
  cache(options?: CacheOptions): ProcessPromise;
  
  // Stream configuration
  stdout(stream: StreamOption | ((chunk: any) => void)): ProcessPromise;
  stderr(stream: StreamOption | ((chunk: any) => void)): ProcessPromise;
  
  // Piping
  pipe(target: ProcessPromise | NodeJS.WritableStream): ProcessPromise;
  pipe(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Output formats
  text(): Promise<string>;      // Trimmed string output
  json<T = any>(): Promise<T>;  // JSON parsed output
  lines(): Promise<string[]>;   // Split by newlines
  buffer(): Promise<Buffer>;    // Raw buffer output
  
  // Process control
  kill(signal?: NodeJS.Signals): void;
  
  // Process info
  child?: any; // Underlying child process
  exitCode: Promise<number | null>;
}
```

### ExecutionResult

Comprehensive result object with metadata and methods.

```typescript
interface ExecutionResult {
  // Output data
  stdout: string;           // Standard output
  stderr: string;           // Standard error  
  exitCode: number;         // Process exit code
  signal?: string;          // Termination signal if any
  
  // Status
  ok: boolean;              // Success status (exitCode === 0)
  cause?: string;           // Error cause (exitCode or signal) when not ok
  
  // Metadata
  command: string;          // Executed command
  duration: number;         // Execution time in ms
  startedAt: Date;          // Start timestamp
  finishedAt: Date;         // End timestamp
  
  // Context
  adapter: string;          // Adapter used (local, ssh, docker, etc)
  host?: string;            // Remote host (SSH)
  container?: string;       // Container name (Docker)
  
  // Methods
  toString(): string;       // Returns trimmed stdout
  toJSON(): object;         // JSON representation
  throwIfFailed(): void;    // Throws CommandError if failed
  
  /**
   * @deprecated Use `result.ok` instead
   */
  isSuccess(): boolean;     // Returns true if exitCode === 0
}
```

### Command

Complete command configuration interface.

```typescript
interface Command {
  // Basic execution
  command: string;                      // Command to execute
  args?: string[];                      // Command arguments
  
  // Execution context
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  shell?: string | boolean;             // Shell to use
  timeout?: number;                     // Timeout in milliseconds
  timeoutSignal?: string;               // Signal to send on timeout
  
  // Stream management
  stdin?: string | Buffer | Readable;   // Input data/stream
  stdout?: StreamOption;                // Output handling
  stderr?: StreamOption;                // Error handling
  
  // Process options
  detached?: boolean;                   // Run detached
  signal?: AbortSignal;                 // Abort signal
  nothrow?: boolean;                    // Don't throw on non-zero exit
  
  // Advanced features
  retry?: RetryOptions;                 // Retry configuration
  progress?: {                          // Progress reporting
    enabled?: boolean;
    onProgress?: (event: any) => void;
    updateInterval?: number;
    reportLines?: boolean;
  };
  
  // Adapter selection
  adapter?: AdapterType;
  adapterOptions?: AdapterSpecificOptions;
}

// Stream handling options
type StreamOption = 'pipe' | 'ignore' | 'inherit' | NodeJS.WritableStream;

// Available adapter types
type AdapterType = 'local' | 'ssh' | 'docker' | 'kubernetes' | 
                   'remote-docker' | 'auto' | 'mock';
```

## Adapter Configuration Types

### SSHAdapterOptions

Comprehensive SSH connection configuration.

```typescript
interface SSHAdapterOptions {
  type: 'ssh';
  
  // Connection
  host: string;                     // Hostname or IP address
  username: string;                 // SSH username
  port?: number;                    // SSH port (default: 22)
  
  // Authentication
  privateKey?: string | Buffer;     // Private key path or content
  passphrase?: string;              // Private key passphrase
  password?: string;                // Password (less secure)
  
  // Sudo support
  sudo?: {
    enabled: boolean;               // Enable sudo
    password?: string;              // Sudo password
    user?: string;                  // Target user (default: root)
    passwordMethod?: 'stdin' |      // Password input method
                     'askpass' | 
                     'echo' | 
                     'secure';
    secureHandler?: any;            // SecurePasswordHandler instance
  };
}
```

### DockerAdapterOptions

Docker execution configuration.

```typescript
interface DockerAdapterOptions {
  type: 'docker';
  container: string;        // Container name or ID
  user?: string;            // User to run commands as
  workdir?: string;         // Working directory in container
  tty?: boolean;            // Allocate TTY
}

// For creating new containers
interface DockerContainerConfig {
  // Required
  image: string;            // Docker image to use
  
  // Container settings
  name?: string;            // Container name
  command?: string | string[]; // Override default command
  entrypoint?: string | string[]; // Override entrypoint
  workdir?: string;         // Working directory
  user?: string;            // User to run as
  
  // Environment
  env?: Record<string, string>; // Environment variables
  envFile?: string;         // Path to env file
  
  // Volumes
  volumes?: string[] |      // Array format: ['/host:/container:ro']
            Record<string, string>; // Object: {'/host': '/container'}
  
  // Networking
  ports?: string[] |        // Array format: ['8080:80']
          Record<string, string>; // Object: {'8080': '80'}
  network?: string;         // Network to join
  hostname?: string;        // Container hostname
  
  // Resources
  memory?: string;          // Memory limit (e.g., '512m')
  cpus?: string;            // CPU limit (e.g., '0.5')
  
  // Security
  privileged?: boolean;     // Run in privileged mode
  capAdd?: string[];        // Add Linux capabilities
  capDrop?: string[];       // Drop Linux capabilities
  
  // Behavior
  rm?: boolean;             // Remove container after stop
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  pull?: boolean;           // Pull image before starting
  
  // Health check
  healthcheck?: {
    test: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    startPeriod?: string;
  };
}
```

### KubernetesAdapterOptions

Kubernetes pod execution configuration.

```typescript
interface KubernetesAdapterOptions {
  type: 'kubernetes';
  
  // Pod selection
  pod: string;              // Pod name or label selector
  namespace?: string;       // Kubernetes namespace
  container?: string;       // Container name in pod
  
  // Kubectl configuration
  kubeconfig?: string;      // Path to kubeconfig file
  context?: string;         // Kubernetes context to use
  execFlags?: string[];     // Additional kubectl exec flags
  
  // Execution options
  tty?: boolean;            // Allocate TTY
  stdin?: boolean;          // Attach stdin
}
```

### RemoteDockerAdapterOptions

Combined SSH + Docker configuration.

```typescript
interface RemoteDockerAdapterOptions {
  type: 'remote-docker';
  ssh: Omit<SSHAdapterOptions, 'type'>;     // SSH connection config
  docker: Omit<DockerAdapterOptions, 'type'>; // Docker config
}
```

## Execution Context Types

### SSHExecutionContext

SSH-specific execution context with file transfer and tunneling.

```typescript
interface SSHExecutionContext extends CallableExecutionEngine {
  // SSH-specific methods
  tunnel(options: SSHTunnelOptions): Promise<SSHTunnel>;
  reverseTunnel(options: SSHReverseTunnelOptions): Promise<SSHTunnel>;
  
  // File operations
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  uploadDirectory(localPath: string, remotePath: string, 
    options?: TransferOptions): Promise<void>;
  downloadDirectory(remotePath: string, localPath: string,
    options?: TransferOptions): Promise<void>;
  uploadStream(stream: Readable, remotePath: string): Promise<void>;
  
  // SFTP access
  sftp(): Promise<SFTPClient>;
  
  // Connection management
  keepAlive(): SSHExecutionContext;
  close(): Promise<void>;
}

interface SSHTunnelOptions {
  localPort?: number;       // Local port (0 for dynamic)
  localHost?: string;       // Local bind address
  remoteHost: string;       // Remote destination host
  remotePort: number;       // Remote destination port
  autoClose?: boolean;      // Auto-close on process exit
}

interface SSHReverseTunnelOptions {
  remotePort: number;       // Remote bind port
  remoteHost?: string;      // Remote bind address
  localHost: string;        // Local destination host
  localPort: number;        // Local destination port
}

interface SSHTunnel {
  localPort: number;        // Actual local port
  remotePort: number;       // Remote port
  isOpen: boolean;          // Tunnel status
  open(): Promise<void>;    // Open tunnel
  close(): Promise<void>;   // Close tunnel
}

interface TransferOptions {
  recursive?: boolean;      // Recursive transfer
  filter?: (path: string) => boolean; // Path filter
  concurrency?: number;     // Parallel transfers
}
```

### DockerContext

Docker container creation and execution context.

```typescript
interface DockerContext {
  // Start new container
  start(): Promise<DockerContainer>;
  
  // Execute in existing container (if container specified)
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
}

interface DockerContainer extends CallableExecutionEngine {
  // Properties
  name: string;             // Container name
  id: string;               // Container ID
  started: boolean;         // Start status
  removed: boolean;         // Removal status
  
  // Lifecycle management
  start(): Promise<DockerContainer>;
  stop(options?: { timeout?: number }): Promise<void>;
  restart(): Promise<void>;
  pause(): Promise<void>;
  unpause(): Promise<void>;
  kill(signal?: string): Promise<void>;
  remove(options?: { force?: boolean; volumes?: boolean }): Promise<void>;
  
  // Execution
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  exec(command: string): ProcessPromise;
  execRaw(command: string, args?: string[]): Promise<ExecutionResult>;
  
  // Status and monitoring
  isRunning(): Promise<boolean>;
  stats(): Promise<DockerStats>;
  inspect(): Promise<DockerInspectInfo>;
  health(): Promise<DockerHealthStatus>;
  waitForPort(port: number, timeout?: number): Promise<void>;
  waitForLog(pattern: string | RegExp, timeout?: number): Promise<void>;
  waitForHealthy(timeout?: number): Promise<void>;
  
  // Logs
  logs(options?: DockerLogsOptions): Promise<string>;
  streamLogs(options?: DockerStreamLogsOptions): Promise<LogStream>;
  follow(options?: Omit<DockerStreamLogsOptions, 'follow'>): Promise<LogStream>;
  
  // File operations
  copyTo(localPath: string, containerPath: string): Promise<void>;
  copyFrom(containerPath: string, localPath: string): Promise<void>;
  
  // Network
  getIpAddress(network?: string): Promise<string | null>;
  
  // Container operations
  commit(options?: DockerCommitOptions): Promise<string>;
}

interface DockerLogsOptions {
  stdout?: boolean;         // Include stdout (default: true)
  stderr?: boolean;         // Include stderr (default: true)
  follow?: boolean;         // Follow log output
  tail?: number | 'all';    // Number of lines from end
  since?: string;           // Show logs since timestamp
  until?: string;           // Show logs before timestamp
  timestamps?: boolean;     // Add timestamps to lines
}

interface DockerStreamLogsOptions extends DockerLogsOptions {
  stdout?: (line: string) => void;  // stdout callback
  stderr?: (line: string) => void;  // stderr callback
}

interface LogStream {
  stop(): void;             // Stop streaming
  on(event: 'data', listener: (line: string) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'end', listener: () => void): void;
}

interface DockerCommitOptions {
  repo?: string;            // Repository name
  tag?: string;             // Tag name
  message?: string;         // Commit message
  author?: string;          // Author
}
```

### K8sExecutionContext

Kubernetes pod execution context.

```typescript
interface K8sExecutionContext extends CallableExecutionEngine {
  // Get pod instance by name or selector
  pod(nameOrSelector: string): K8sPod;
  
  // List pods matching selector
  listPods(selector?: string): Promise<K8sPodInfo[]>;
}

interface K8sPod extends CallableExecutionEngine {
  // Properties
  name: string;             // Pod name
  namespace: string;        // Namespace
  
  // Execution with container selection
  container(name: string): K8sPod;
  
  // Port forwarding
  portForward(localPort: number, remotePort: number): Promise<K8sPortForward>;
  portForward(ports: Array<{local: number; remote: number}>): Promise<K8sPortForward[]>;
  portForwardDynamic(remotePort: number): Promise<K8sPortForward>;
  
  // Logs
  logs(options?: K8sLogOptions): Promise<string>;
  streamLogs(options?: K8sStreamLogOptions): Promise<K8sLogStream>;
  follow(options?: Omit<K8sStreamLogOptions, 'follow'>): Promise<K8sLogStream>;
  
  // File operations
  copyTo(localPath: string, remotePath: string, container?: string): Promise<void>;
  copyFrom(remotePath: string, localPath: string, container?: string): Promise<void>;
  
  // Pod information
  describe(): Promise<K8sPodDetails>;
  metrics(): Promise<K8sPodMetrics>;
  
  // Debugging
  debug(options?: K8sDebugOptions): Promise<void>;
  
  // Events
  watch(): K8sWatcher;
}

interface K8sPortForward {
  localPort: number;        // Local port
  remotePort: number;       // Remote port
  isOpen: boolean;          // Connection status
  
  // Lifecycle
  open(): Promise<void>;
  close(): Promise<void>;
  
  // Events
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: () => void): void;
}

interface K8sLogOptions {
  container?: string;       // Container name
  tail?: number;            // Lines from end
  since?: string;           // Since timestamp (RFC3339)
  sinceTime?: Date;         // Since time
  previous?: boolean;       // Previous container logs
  timestamps?: boolean;     // Include timestamps
  grep?: string;            // Filter pattern
}

interface K8sStreamLogOptions extends K8sLogOptions {
  follow?: boolean;         // Follow logs
  onData?: (line: string) => void; // Line callback
}

interface K8sLogStream {
  stop(): void;             // Stop streaming
  pause(): void;            // Pause streaming
  resume(): void;           // Resume streaming
  
  // Events
  on(event: 'data', listener: (line: string) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'end', listener: () => void): void;
}

interface K8sDebugOptions {
  image?: string;           // Debug container image
  command?: string[];       // Debug command
  stdin?: boolean;          // Attach stdin
  tty?: boolean;            // Allocate TTY
}

interface K8sWatcher {
  on(event: 'ADDED', listener: (pod: K8sPodInfo) => void): void;
  on(event: 'MODIFIED', listener: (pod: K8sPodInfo) => void): void;
  on(event: 'DELETED', listener: (pod: K8sPodInfo) => void): void;
  stop(): void;
}
```

## Error Hierarchy

### Base Error Class

```typescript
class ExecutionError extends Error {
  readonly name: string = 'ExecutionError';
  readonly code: string;              // Error code for programmatic handling
  readonly details?: Record<string, any>; // Additional error context
  
  constructor(
    message: string,
    code: string,
    details?: Record<string, any>
  );
}
```

### Command Errors

```typescript
class CommandError extends ExecutionError {
  readonly name: string = 'CommandError';
  readonly command: string;           // Command that failed
  readonly exitCode: number;          // Process exit code
  readonly signal: string | undefined; // Termination signal
  readonly stdout: string;            // Captured stdout
  readonly stderr: string;            // Captured stderr
  readonly duration: number;          // Execution duration in ms
  
  constructor(
    command: string,
    exitCode: number,
    signal: string | undefined,
    stdout: string,
    stderr: string,
    duration: number
  );
}
```

### Connection Errors

```typescript
class ConnectionError extends ExecutionError {
  readonly name: string = 'ConnectionError';
  readonly host: string;              // Target host
  readonly originalError: Error;      // Underlying error
  
  constructor(host: string, originalError: Error);
}
```

### Timeout Errors

```typescript
class TimeoutError extends ExecutionError {
  readonly name: string = 'TimeoutError';
  readonly command: string;           // Command that timed out
  readonly timeout: number;           // Timeout value in ms
  
  constructor(command: string, timeout: number);
}
```

### Adapter Errors

```typescript
class AdapterError extends ExecutionError {
  readonly name: string = 'AdapterError';
  readonly adapter: string;           // Adapter name
  readonly operation: string;         // Failed operation
  readonly originalError?: Error;     // Underlying error
  
  constructor(
    adapter: string,
    operation: string,
    originalError?: Error
  );
}

class DockerError extends ExecutionError {
  readonly name: string = 'DockerError';
  readonly container: string;         // Container name/ID
  readonly operation: string;         // Docker operation
  readonly originalError: Error;      // Underlying error
  
  constructor(
    container: string,
    operation: string,
    originalError: Error
  );
}

class KubernetesError extends ExecutionError {
  readonly name: string = 'KubernetesError';
  readonly pod: string;               // Pod name
  readonly namespace?: string;        // Namespace
  readonly container?: string;        // Container name
  
  constructor(
    message: string,
    pod: string,
    namespace?: string,
    container?: string,
    details?: Record<string, any>
  );
}
```

## Event System Types

### Base Event Structure

```typescript
interface BaseUshEvent {
  timestamp: Date;          // When event occurred
  adapter: string;          // Which adapter emitted
}
```

### Event Map

Complete type-safe event mapping:

```typescript
interface UshEventMap {
  // Command events
  'command:start': CommandStartEvent;
  'command:complete': CommandCompleteEvent;
  'command:error': CommandErrorEvent;
  
  // Connection events
  'connection:open': ConnectionOpenEvent;
  'connection:close': ConnectionCloseEvent;
  
  // SSH events
  'ssh:connect': SSHConnectEvent;
  'ssh:disconnect': SSHDisconnectEvent;
  'ssh:execute': SSHExecuteEvent;
  'ssh:key-validated': SSHKeyValidatedEvent;
  'ssh:pool-metrics': SSHPoolMetricsEvent;
  'ssh:pool-cleanup': SSHPoolCleanupEvent;
  'ssh:reconnect': SSHReconnectEvent;
  'ssh:tunnel-created': SSHTunnelCreatedEvent;
  'ssh:tunnel-closed': SSHTunnelClosedEvent;
  
  // Docker events
  'docker:run': DockerRunEvent;
  'docker:exec': DockerExecEvent;
  
  // Kubernetes events
  'k8s:exec': K8sExecEvent;
  
  // File events
  'file:read': FileReadEvent;
  'file:write': FileWriteEvent;
  'file:delete': FileDeleteEvent;
  
  // Transfer events
  'transfer:start': TransferStartEvent;
  'transfer:complete': TransferCompleteEvent;
  'transfer:error': TransferErrorEvent;
  
  // Temp file events
  'temp:create': TempCreateEvent;
  'temp:cleanup': TempCleanupEvent;
  
  // Cache events
  'cache:hit': CacheHitEvent;
  'cache:miss': CacheMissEvent;
  'cache:set': CacheSetEvent;
  'cache:evict': CacheEvictEvent;
  
  // Retry events
  'retry:attempt': RetryAttemptEvent;
  'retry:success': RetrySuccessEvent;
  'retry:failed': RetryFailedEvent;
  
  // Tunnel events (generic)
  'tunnel:created': TunnelCreatedEvent;
}

// Union types for convenience
type UshEventType = keyof UshEventMap;
type UshEvent = UshEventMap[UshEventType];
```

### Event Handler Types

```typescript
// Type-safe event emitter
interface TypedEventEmitter<TEvents extends Record<string, any>> {
  on<K extends keyof TEvents>(
    event: K, 
    listener: (data: TEvents[K]) => void
  ): this;
  
  once<K extends keyof TEvents>(
    event: K, 
    listener: (data: TEvents[K]) => void
  ): this;
  
  emit<K extends keyof TEvents>(
    event: K, 
    data: TEvents[K]
  ): boolean;
  
  off<K extends keyof TEvents>(
    event: K, 
    listener: (data: TEvents[K]) => void
  ): this;
  
  removeAllListeners<K extends keyof TEvents>(event?: K): this;
  listenerCount(event: keyof TEvents): number;
  eventNames(): Array<keyof TEvents>;
}

// Event filtering
interface EventFilter {
  adapter?: string | string[];
  host?: string;
  [key: string]: any;
}
```

## Configuration Types

### Engine Configuration

```typescript
interface ExecutionEngineConfig {
  // Default execution settings
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  shell?: string | boolean;             // Shell configuration
  timeout?: number;                     // Default timeout
  throwOnNonZeroExit?: boolean;         // Error handling
  
  // Adapter settings
  defaultAdapter?: string;              // Default adapter type
  adapters?: Record<string, AdapterConfig>;
  
  // Event configuration
  enableEvents?: boolean;               // Enable event system
  maxEventListeners?: number;           // Max listeners per event
  
  // Hooks
  hooks?: {
    preExecution?: (command: Command) => Command | Promise<Command>;
    postExecution?: (result: ExecutionResult) => ExecutionResult | Promise<ExecutionResult>;
  };
}
```

### Feature Options

```typescript
interface CacheOptions {
  ttl?: number;                         // Time to live in ms
  key?: string;                         // Custom cache key  
  refresh?: boolean;                    // Force refresh
  condition?: (result: ExecutionResult) => boolean; // Cache condition
  serialize?: (result: ExecutionResult) => string;  // Custom serializer
  deserialize?: (data: string) => ExecutionResult;  // Custom deserializer
  
  // Events
  onHit?: (key: string) => void;        // Cache hit callback
  onMiss?: (key: string) => void;       // Cache miss callback
  onSet?: (key: string) => void;        // Cache set callback
  onEvict?: (key: string, reason: string) => void; // Eviction callback
}

interface RetryOptions {
  maxRetries?: number;                  // Max attempts (default: 3)
  delay?: number;                       // Initial delay in ms
  maxDelay?: number;                    // Maximum delay
  factor?: number;                      // Backoff factor
  backoff?: 'fixed' | 'linear' | 'exponential'; // Strategy
  
  // Conditional retry
  shouldRetry?: (error: Error, attempt: number) => boolean;
  
  // Events
  onRetry?: (attempt: number, error: Error) => void;
}

interface ParallelOptions {
  concurrency?: number;                 // Max parallel executions
  ordered?: boolean;                    // Preserve order
  stopOnError?: boolean;                // Fail fast
  timeout?: number;                     // Overall timeout
  
  // Progress tracking
  onProgress?: (progress: {
    completed: number;
    total: number;
    succeeded: number;
    failed: number;
  }) => void;
}
```

## Utility Types

### Type Helpers

```typescript
// Template literal values
type TemplateValue = string | number | boolean | null | undefined | 
                     ProcessPromise | Promise<any>;

// Platform detection
type Platform = 'darwin' | 'linux' | 'win32' | 'freebsd' | 'openbsd' | 'sunos';

// Process signals
type Signal = NodeJS.Signals;

// Stream encoding
type StreamEncoding = BufferEncoding;

// JSON types
type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
```

### Pattern Types

```typescript
// Disposable resources
interface Disposable {
  dispose(): Promise<void>;
}

interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}

// Result pattern for error handling
type Result<T, E = Error> = 
  | { ok: true; value: T; error?: never }
  | { ok: false; value?: never; error: E };

// Awaitable type
type Awaitable<T> = T | PromiseLike<T>;

// Deep partial for configuration
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Omit with multiple keys
type OmitMultiple<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Mutable version of readonly type
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};
```

## Type Guards and Assertions

### Error Type Guards

```typescript
// Check error types
function isExecutionError(error: unknown): error is ExecutionError {
  return error instanceof ExecutionError;
}

function isCommandError(error: unknown): error is CommandError {
  return error instanceof CommandError;
}

function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError;
}

function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

// Check specific error codes
function isNotFoundError(error: unknown): boolean {
  return isExecutionError(error) && error.code === 'ENOENT';
}

function isPermissionError(error: unknown): boolean {
  return isExecutionError(error) && 
    (error.code === 'EACCES' || error.code === 'EPERM');
}
```

### Result Type Guards

```typescript
// Check execution success
function isSuccess(result: ExecutionResult): result is ExecutionResult & { exitCode: 0 } {
  return result.ok;
}

function hasOutput(result: ExecutionResult): result is ExecutionResult & { stdout: string } {
  return result.stdout.length > 0;
}

function hasError(result: ExecutionResult): result is ExecutionResult & { stderr: string } {
  return result.stderr.length > 0;
}

// Check for failure with cause
function hasFailed(result: ExecutionResult): result is ExecutionResult & { ok: false; cause: string } {
  return !result.ok;
}

// Check result pattern
function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
```

### Adapter Type Guards

```typescript
// Check adapter capabilities
function supportsFeature<K extends keyof BaseAdapter>(
  adapter: BaseAdapter,
  feature: K
): adapter is BaseAdapter & Required<Pick<BaseAdapter, K>> {
  return feature in adapter && adapter[feature] !== undefined;
}

function isSSHAdapter(adapter: BaseAdapter): adapter is SSHAdapter {
  return adapter.name === 'ssh';
}

function isDockerAdapter(adapter: BaseAdapter): adapter is DockerAdapter {
  return adapter.name === 'docker';
}

function isLocalAdapter(adapter: BaseAdapter): adapter is LocalAdapter {
  return adapter.name === 'local';
}
```

### Event Type Guards

```typescript
// Check event categories
function isCommandEvent(event: UshEvent): event is CommandStartEvent | CommandCompleteEvent | CommandErrorEvent {
  return 'command' in event;
}

function isSSHEvent(event: UshEvent): event is SSHConnectEvent | SSHDisconnectEvent | SSHExecuteEvent {
  return event.adapter === 'ssh';
}

function isTransferEvent(event: UshEvent): event is TransferStartEvent | TransferCompleteEvent | TransferErrorEvent {
  return 'direction' in event && ('source' in event || 'destination' in event);
}

// Type predicate for specific events
function isEventType<K extends keyof UshEventMap>(
  event: UshEvent,
  type: K
): event is UshEventMap[K] {
  return (event as any).type === type;
}
```

### Utility Type Guards

```typescript
// Check if value is Promise-like
function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return value !== null && 
         typeof value === 'object' && 
         'then' in value && 
         typeof value.then === 'function';
}

// Check if value is Disposable
function isDisposable(value: unknown): value is Disposable {
  return value !== null &&
         typeof value === 'object' &&
         'dispose' in value &&
         typeof value.dispose === 'function';
}

// Check if value is AsyncDisposable
function isAsyncDisposable(value: unknown): value is AsyncDisposable {
  return value !== null &&
         typeof value === 'object' &&
         Symbol.asyncDispose in value &&
         typeof value[Symbol.asyncDispose] === 'function';
}
```

## Advanced TypeScript Patterns

### Branded Types

```typescript
// Type-safe IDs
type Brand<K, T> = K & { __brand: T };

type ConnectionId = Brand<string, 'ConnectionId'>;
type ExecutionId = Brand<string, 'ExecutionId'>;
type ContainerId = Brand<string, 'ContainerId'>;
type PodName = Brand<string, 'PodName'>;

// Usage
function trackExecution(id: ExecutionId) {
  // Only accepts ExecutionId, not regular string
}
```

### Template Literal Types

```typescript
// Event type patterns
type EventCategory = 'command' | 'ssh' | 'docker' | 'k8s' | 'cache';
type EventAction = 'start' | 'complete' | 'error' | 'connect' | 'disconnect';
type EventPattern = `${EventCategory}:${EventAction}`;

// Port range
type PortNumber = `${number}` | number;
type PortMapping = `${PortNumber}:${PortNumber}`;

// Time units
type TimeUnit = 'ms' | 's' | 'm' | 'h';
type Duration = `${number}${TimeUnit}`;
```

### Conditional Types

```typescript
// Extract promise type
type Unpromise<T> = T extends Promise<infer U> ? U : T;

// Extract array element type
type ElementType<T> = T extends (infer E)[] ? E : never;

// Function parameter extraction
type Parameters<T> = T extends (...args: infer P) => any ? P : never;
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Adapter options without type field
type AdapterOptionsWithoutType<T extends { type: string }> = Omit<T, 'type'>;
```

### Mapped Types

```typescript
// Make all properties optional recursively
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Make specific properties required
type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Readonly except specific fields
type ReadonlyExcept<T, K extends keyof T> = 
  Readonly<Omit<T, K>> & Pick<T, K>;

// Async versions of methods
type Asyncify<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K]
};
```

## Module Augmentation

### Extending Core Types

```typescript
// Add custom methods to ExecutionEngine
declare module '@xec-sh/core' {
  interface CallableExecutionEngine {
    // Add custom adapter
    myAdapter(options: MyAdapterOptions): CallableExecutionEngine;
    
    // Add utility method
    parallel<T>(
      commands: Array<() => ProcessPromise<T>>
    ): Promise<T[]>;
  }
  
  interface ProcessPromise {
    // Add custom output format
    csv<T = any>(): Promise<T[]>;
    
    // Add custom modifier
    withMetrics(): ProcessPromise;
  }
}
```

### Adding Custom Events

```typescript
declare module '@xec-sh/core' {
  interface UshEventMap {
    // Add custom events
    'app:deploy:start': {
      environment: string;
      version: string;
      timestamp: Date;
      adapter: string;
    };
    
    'app:deploy:complete': {
      environment: string;
      version: string;
      duration: number;
      timestamp: Date;
      adapter: string;
    };
  }
}
```

### Custom Adapter Types

```typescript
// Define custom adapter options
interface CloudRunAdapterOptions {
  type: 'cloud-run';
  project: string;
  region: string;
  service: string;
  credentials?: string;
}

// Extend adapter types
declare module '@xec-sh/core' {
  interface AdapterSpecificOptions {
    'cloud-run'?: CloudRunAdapterOptions;
  }
  
  type AdapterType = AdapterType | 'cloud-run';
}
```

### Plugin System Types

```typescript
// Define plugin interface
interface XecPlugin {
  name: string;
  version: string;
  
  // Lifecycle hooks
  install?(engine: ExecutionEngine): void | Promise<void>;
  uninstall?(engine: ExecutionEngine): void | Promise<void>;
  
  // Command extensions
  commands?: Record<string, CommandHandler>;
  
  // Event handlers
  events?: Partial<{
    [K in keyof UshEventMap]: (event: UshEventMap[K]) => void;
  }>;
}

type CommandHandler = (args: string[], options: any) => ProcessPromise | Promise<any>;

// Usage
const myPlugin: XecPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  install(engine) {
    engine.myCommand = () => { /* ... */ };
  },
  
  commands: {
    deploy: async (args, options) => {
      return $`deploy ${args.join(' ')}`;
    }
  }
};
```

## Practical Examples

### Type-Safe Command Building

```typescript
import { CallableExecutionEngine, ProcessPromise, ExecutionResult } from '@xec-sh/core';

// Create typed command builder
class CommandBuilder {
  constructor(private $: CallableExecutionEngine) {}
  
  git(subcommand: 'status' | 'add' | 'commit' | 'push'): ProcessPromise {
    return this.$`git ${subcommand}`;
  }
  
  npm(script: string, args?: string[]): ProcessPromise {
    const argsStr = args?.join(' ') || '';
    return this.$`npm run ${script} ${argsStr}`;
  }
  
  docker(
    action: 'build' | 'run' | 'stop',
    options: Record<string, string>
  ): ProcessPromise {
    const flags = Object.entries(options)
      .map(([key, value]) => `--${key}=${value}`)
      .join(' ');
    return this.$`docker ${action} ${flags}`;
  }
}

// Usage with full type safety
const cmd = new CommandBuilder($);
await cmd.git('status');
await cmd.npm('test', ['--coverage']);
await cmd.docker('build', { tag: 'myapp:latest', file: 'Dockerfile' });
```

### Type-Safe Error Handling

```typescript
import { 
  CommandError, 
  ConnectionError, 
  TimeoutError,
  isCommandError,
  isConnectionError,
  isTimeoutError 
} from '@xec-sh/core';

// Comprehensive error handler
async function executeWithRetry(
  command: () => ProcessPromise,
  maxRetries = 3
): Promise<ExecutionResult> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await command();
    } catch (error) {
      lastError = error as Error;
      
      if (isTimeoutError(error)) {
        console.log(`Timeout on attempt ${attempt}, retrying...`);
        continue;
      }
      
      if (isConnectionError(error)) {
        console.log(`Connection failed to ${error.host}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      if (isCommandError(error)) {
        // Don't retry command errors
        console.error(`Command failed: ${error.command}`);
        console.error(`Exit code: ${error.exitCode}`);
        console.error(`Error output: ${error.stderr}`);
        throw error;
      }
      
      // Unknown error, don't retry
      throw error;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}
```

### Type-Safe Configuration

```typescript
import { 
  ExecutionEngineConfig, 
  SSHAdapterOptions,
  DockerContainerConfig,
  DeepPartial 
} from '@xec-sh/core';

// Type-safe configuration builder
class ConfigBuilder {
  private config: DeepPartial<ExecutionEngineConfig> = {};
  
  setDefaults(defaults: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): this {
    Object.assign(this.config, defaults);
    return this;
  }
  
  addSSHHost(
    name: string, 
    options: Omit<SSHAdapterOptions, 'type'>
  ): this {
    this.config.adapters = this.config.adapters || {};
    this.config.adapters[name] = { type: 'ssh', ...options };
    return this;
  }
  
  addDockerContainer(
    name: string,
    config: DockerContainerConfig
  ): this {
    this.config.adapters = this.config.adapters || {};
    this.config.adapters[name] = { type: 'docker', ...config };
    return this;
  }
  
  build(): ExecutionEngineConfig {
    return this.config as ExecutionEngineConfig;
  }
}

// Usage
const config = new ConfigBuilder()
  .setDefaults({
    timeout: 30000,
    env: { NODE_ENV: 'production' }
  })
  .addSSHHost('prod', {
    host: 'prod.example.com',
    username: 'deploy',
    privateKey: '/home/user/.ssh/id_rsa'
  })
  .addDockerContainer('db', {
    image: 'postgres:14',
    env: { POSTGRES_PASSWORD: 'secret' }
  })
  .build();
```

### Type-Safe Event System

```typescript
import { 
  UshEventMap, 
  TypedEventEmitter,
  CommandCompleteEvent 
} from '@xec-sh/core';

// Create typed event aggregator
class EventAggregator {
  private metrics = new Map<string, {
    count: number;
    totalDuration: number;
    lastSeen: Date;
  }>();
  
  constructor(private emitter: TypedEventEmitter<UshEventMap>) {
    this.setupListeners();
  }
  
  private setupListeners(): void {
    // Type-safe event handlers
    this.emitter.on('command:complete', this.handleCommandComplete.bind(this));
    this.emitter.on('ssh:connect', (event) => {
      console.log(`SSH connected to ${event.host}:${event.port || 22}`);
    });
  }
  
  private handleCommandComplete(event: CommandCompleteEvent): void {
    const key = `${event.adapter}:${event.command.split(' ')[0]}`;
    const metric = this.metrics.get(key) || {
      count: 0,
      totalDuration: 0,
      lastSeen: new Date()
    };
    
    metric.count++;
    metric.totalDuration += event.duration;
    metric.lastSeen = event.timestamp;
    
    this.metrics.set(key, metric);
  }
  
  getReport(): Array<{
    command: string;
    executions: number;
    avgDuration: number;
    lastSeen: Date;
  }> {
    return Array.from(this.metrics.entries()).map(([command, stats]) => ({
      command,
      executions: stats.count,
      avgDuration: stats.totalDuration / stats.count,
      lastSeen: stats.lastSeen
    }));
  }
}
```

## Best Practices

### 1. Enable Strict TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### 2. Avoid `any` Type

```typescript
// ❌ Bad - loses type safety
function processResult(result: any) {
  console.log(result.stdout);
}

// ✅ Good - maintains type safety
function processResult(result: ExecutionResult) {
  console.log(result.stdout);
}

// ✅ Good - use unknown for truly dynamic
function handleUnknown(value: unknown) {
  if (isExecutionResult(value)) {
    console.log(value.stdout);
  }
}
```

### 3. Use Type Guards

```typescript
// ✅ Good - runtime type checking
async function safeExecute(cmd: string): Promise<string | null> {
  try {
    const result = await $`${cmd}`;
    return result.stdout;
  } catch (error) {
    if (isCommandError(error)) {
      console.error(`Command failed: ${error.exitCode}`);
      return null;
    }
    throw error; // Re-throw unexpected errors
  }
}
```

### 4. Leverage Type Inference

```typescript
// ❌ Bad - unnecessary type annotations
const result: ExecutionResult = await $`echo test`;
const text: string = await $`echo test`.text();

// ✅ Good - let TypeScript infer
const result = await $`echo test`; // ExecutionResult
const text = await $`echo test`.text(); // string
```

### 5. Use Discriminated Unions

```typescript
// ✅ Good - type-safe state handling
type DeploymentState = 
  | { status: 'idle' }
  | { status: 'deploying'; progress: number }
  | { status: 'success'; version: string }
  | { status: 'failed'; error: Error };

function handleState(state: DeploymentState) {
  switch (state.status) {
    case 'idle':
      console.log('Ready to deploy');
      break;
    case 'deploying':
      console.log(`Progress: ${state.progress}%`);
      break;
    case 'success':
      console.log(`Deployed version: ${state.version}`);
      break;
    case 'failed':
      console.log(`Failed: ${state.error.message}`);
      break;
  }
}
```

### 6. Generic Constraints

```typescript
// ✅ Good - constrained generics
function parseOutput<T extends Record<string, unknown>>(
  result: ExecutionResult
): T {
  return JSON.parse(result.stdout) as T;
}

// Usage with type safety
interface Config {
  port: number;
  host: string;
}
const config = parseOutput<Config>(await $`cat config.json`);
```

### 7. Const Assertions

```typescript
// ✅ Good - precise types with const
const ADAPTERS = ['local', 'ssh', 'docker', 'kubernetes'] as const;
type AdapterName = typeof ADAPTERS[number]; // Union type

const ENV = {
  PROD: 'production',
  DEV: 'development',
  TEST: 'test'
} as const;
type Environment = typeof ENV[keyof typeof ENV];
```

### 8. Template Literal Types

```typescript
// ✅ Good - type-safe string patterns
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogPrefix = `[${Uppercase<LogLevel>}]`;

function log(level: LogLevel, message: string) {
  const prefix: LogPrefix = `[${level.toUpperCase() as Uppercase<LogLevel>}]`;
  console.log(`${prefix} ${message}`);
}
```

### 9. Utility Types

```typescript
// ✅ Good - leverage built-in utility types
type PartialConfig = Partial<ExecutionEngineConfig>;
type RequiredSSH = Required<SSHAdapterOptions>;
type ReadonlyResult = Readonly<ExecutionResult>;
type ConfigKeys = keyof ExecutionEngineConfig;
type ConfigValues = ExecutionEngineConfig[ConfigKeys];
```

### 10. Type Testing

```typescript
// ✅ Good - test types at compile time
type AssertEqual<T, U> = T extends U ? U extends T ? true : false : false;

// Type tests
type Test1 = AssertEqual<ExecutionResult['exitCode'], number>; // true
type Test2 = AssertEqual<ProcessPromise, Promise<ExecutionResult>>; // false (extends but not equal)

// Ensure type compatibility
type _TestSSHOptions = SSHAdapterOptions extends AdapterSpecificOptions ? true : false;
```

## Migration Guide

### From JavaScript to TypeScript

```typescript
// Before (JavaScript)
const $ = require('@xec-sh/core');

async function deploy(server) {
  const result = await $`ssh ${server} deploy.sh`;
  return result.stdout;
}

// After (TypeScript)
import { $, ExecutionResult } from '@xec-sh/core';

async function deploy(server: string): Promise<string> {
  const result = await $`ssh ${server} deploy.sh`;
  return result.stdout;
}
```

### From Loose to Strict Types

```typescript
// Before - loose types
function runCommand(cmd: any, options?: any): Promise<any> {
  return $(cmd, options);
}

// After - strict types
import { ProcessPromise, Command } from '@xec-sh/core';

function runCommand(
  cmd: string,
  options?: Partial<Command>
): ProcessPromise {
  return $.with(options || {})`${cmd}`;
}
```

## Related Documentation

- [Execution Engine](./execution-engine) - Core engine implementation
- [Process Promise](./process-promise) - Promise chain API
- [Adapters](./adapters) - Environment adapters
- [Events](./events) - Event system types