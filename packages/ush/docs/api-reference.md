# API Reference

## Core API

### `$` - Main execution function

```typescript
// Template literal syntax
await $`command arg1 arg2`;

// With options
await $`command`.cwd('/path').env({ KEY: 'value' });

// Raw mode (no escaping)
await $.raw`command ${variable}`;
```

## Configuration Methods

All configuration methods return a new `$` instance with the configuration applied:

### Working Directory

```typescript
$.cd(path: string): $
$.cwd(path: string): $  // Alias for cd
```

### Environment Variables

```typescript
$.env(vars: Record<string, string>): $
```

### Timeout

```typescript
$.timeout(ms: number): $  // milliseconds, 0 = no timeout
```

### Shell Selection

```typescript
$.shell(shell: string | false): $
```

### Error Handling

```typescript
$.nothrow(): $  // Don't throw on non-zero exit codes
```

### Output Control

```typescript
$.quiet(): $    // No output to console
$.verbose(): $  // Extra logging
```

### Retry Configuration

```typescript
$.retry(options: RetryOptions): $
```

## Adapter Methods

### SSH Adapter

```typescript
$.ssh(connection: string): $  // user@host format
$.ssh(options: SSHOptions): $
```

### Docker Adapter

```typescript
$.docker(container: string): $  // Container name/ID
$.docker(options: DockerOptions): $
```

### Kubernetes Adapter

```typescript
$.k8s(pod: string, namespace?: string): $
$.k8s(options: K8sOptions): $
```

### Remote Docker

```typescript
$.remoteDocker(options: RemoteDockerOptions): $
```

### Mock Adapter (Testing)

```typescript
$.mock(responses: MockResponses): MockAdapter
```

## Execution Methods

### Parallel Execution

```typescript
$.parallel(
  commands: Command[], 
  options?: { concurrency?: number }
): Promise<Result[]>
```

### Pipeline Execution

```typescript
$.pipe(...commands: Command[]): Promise<Result>
```

### Streaming Execution

```typescript
$.stream(command: Command): StreamBuilder
```

### Context Execution

```typescript
$.within(
  options: Options,
  callback: ($: Engine) => Promise<T>
): Promise<T>
```

## Utility Methods

### Command Utilities

```typescript
// Check if command exists
$.commandExists(command: string): Promise<boolean>

// Find command path
$.which(command: string): Promise<string | null>
```

### Template Creation

```typescript
$.template`command ${0} ${1}`: Template
```

### Global Configuration

```typescript
$.configure(options: GlobalOptions): void
```

### Connection Management

```typescript
// Disconnect all SSH connections
$.cleanup(): Promise<void>

// Disconnect specific connection
connection.disconnect(): Promise<void>
```

## Types and Interfaces

### Command Options

```typescript
interface CommandOptions {
  cwd?: string;                 // Working directory
  env?: Record<string, string>; // Environment variables
  shell?: string | false;       // Shell to use
  timeout?: number;             // Timeout in ms
  nothrow?: boolean;            // Don't throw on non-zero exit codes
  quiet?: boolean;              // Suppress output
  verbose?: boolean;            // Extra logging
  stdin?: string | Buffer;      // Input data
  encoding?: BufferEncoding;    // Output encoding
  retry?: RetryOptions;         // Retry configuration
}
```

### Execution Result

```typescript
interface ExecutionResult {
  stdout: string;         // Standard output
  stderr: string;         // Standard error
  exitCode: number;       // Exit code (0 = success)
  signal?: string;        // Termination signal
  command: string;        // Executed command
  duration: number;       // Execution time (ms)
  killed?: boolean;       // Was process killed
  adapter: string;        // Adapter used
  startedAt: Date;        // Start time
  finishedAt: Date;       // End time
}
```

### SSH Options

```typescript
interface SSHOptions {
  host: string;                    // Hostname or IP
  username?: string;               // SSH username
  password?: string;               // SSH password
  privateKey?: string | Buffer;    // Private key
  passphrase?: string;             // Key passphrase
  port?: number;                   // SSH port (default: 22)
  connectTimeout?: number;         // Connection timeout
  readyTimeout?: number;           // Ready timeout
  keepaliveInterval?: number;      // Keep-alive interval
  keepaliveCountMax?: number;      // Keep-alive count
  retries?: number;                // Connection retries
  retry_interval?: number;         // Retry interval
  proxy?: {                        // Jump host
    host: string;
    username?: string;
    // ... same options
  };
  agent?: string;                  // SSH agent socket
  agentForward?: boolean;          // Enable agent forwarding
}
```

### Docker Options

```typescript
interface DockerOptions {
  container?: string;              // Container name/ID
  image?: string;                  // Image to use
  rm?: boolean;                    // Remove after execution
  volumes?: Record<string, string>; // Volume mounts
  env?: Record<string, string>;    // Environment variables
  workdir?: string;                // Working directory
  user?: string;                   // User to run as
  network?: string;                // Network to use
  ports?: Record<string, string>;  // Port mappings
  privileged?: boolean;            // Run privileged
  interactive?: boolean;           // Interactive mode
  tty?: boolean;                   // Allocate TTY
}
```

### Kubernetes Options

```typescript
interface K8sOptions {
  pod: string;                     // Pod name
  namespace?: string;              // Namespace (default: "default")
  container?: string;              // Container name
  context?: string;                // kubectl context
  kubeconfig?: string;             // Path to kubeconfig
  execFlags?: string[];            // Additional kubectl exec flags
}
```

### Retry Options

```typescript
interface RetryOptions {
  maxRetries?: number;             // Max retry attempts
  initialDelay?: number;           // Initial delay (ms)
  maxDelay?: number;               // Maximum delay (ms)
  backoffMultiplier?: number;      // Backoff multiplier
  jitter?: boolean;                // Add randomness to delays
  isRetryable?: (result: ExecutionResult) => boolean;
  onRetry?: (attempt: number, result: ExecutionResult, nextDelay: number) => void;
}
```

## Error Types

### CommandError

Base error class for command failures:

```typescript
class CommandError extends Error {
  command: string;      // Command that failed
  exitCode: number;     // Exit code
  stdout: string;       // Standard output
  stderr: string;       // Standard error
  duration: number;     // Execution time (ms)
  signal?: string;      // Termination signal
}
```

### TimeoutError

Thrown when command exceeds timeout:

```typescript
class TimeoutError extends CommandError {
  timeout: number;      // Timeout value (ms)
}
```

### ConnectionError

SSH/Remote connection errors:

```typescript
class ConnectionError extends Error {
  host: string;         // Target host
  port: number;         // Port number
  cause?: Error;        // Underlying error
}
```

### AdapterError

Adapter-specific errors:

```typescript
class AdapterError extends Error {
  adapter: string;      // Adapter type
  operation: string;    // Failed operation
  cause?: Error;        // Underlying error
}
```

### RetryError

Thrown when all retry attempts fail:

```typescript
class RetryError extends Error {
  attempts: number;              // Total attempts made
  lastResult: ExecutionResult;   // Last execution result
  results: ExecutionResult[];    // All execution results
}
```

## Process Promise API

The `ProcessPromise` returned by command execution has additional methods:

```typescript
interface ProcessPromise extends Promise<ExecutionResult> {
  // Pipe output to stream
  pipe(stream: Writable): ProcessPromise;
  
  // Don't throw on non-zero exit
  nothrow(): ProcessPromise;
  
  // Set timeout
  timeout(ms: number): ProcessPromise;
  
  // Set working directory
  cwd(path: string): ProcessPromise;
  
  // Set environment
  env(vars: Record<string, string>): ProcessPromise;
  
  // Quiet mode
  quiet(): ProcessPromise;
  
  // Kill the process
  kill(signal?: string): void;
  
  // Get process stdin
  stdin: Writable;
}
```

## Stream Builder API

For streaming command execution:

```typescript
interface StreamBuilder {
  // Handle each line of output
  onLine(handler: (line: string) => void): StreamBuilder;
  
  // Handle stderr lines
  onStderr(handler: (line: string) => void): StreamBuilder;
  
  // Handle completion
  onComplete(handler: () => void): StreamBuilder;
  
  // Handle errors
  onError(handler: (error: Error) => void): StreamBuilder;
  
  // Set abort signal
  signal(signal: AbortSignal): StreamBuilder;
  
  // Start execution
  start(): Promise<void>;
}
```

## Template API

For creating reusable command templates:

```typescript
interface Template {
  // Execute template with arguments
  (...args: any[]): ProcessPromise;
  
  // Add validation
  validate(fn: (args: any[]) => any[]): Template;
  
  // Set default arguments
  defaults(...args: any[]): Template;
}
```

## Global Configuration

Configure global defaults:

```typescript
interface GlobalOptions {
  shell?: string | false;          // Default shell
  env?: Record<string, string>;    // Default environment
  cwd?: string;                    // Default working directory
  timeout?: number;                // Default timeout
  throwOnNonZeroExit?: boolean;    // Default error behavior
  verbose?: boolean;               // Default verbosity
  quiet?: boolean;                 // Default quiet mode
  encoding?: BufferEncoding;       // Default encoding
  auditLog?: AuditOptions;         // Audit logging config
}

interface AuditOptions {
  enabled: boolean;                // Enable audit logging
  file?: string;                   // Log file path
  includeEnv?: boolean;            // Log environment variables
  includeCwd?: boolean;            // Log working directory
  includeTimestamp?: boolean;      // Include timestamps
  logger?: AuditLogger;            // Custom logger implementation
}
```

## Interactive Methods

For building interactive CLI tools:

```typescript
// Confirmation prompt
$.confirm(message: string, defaultValue?: boolean): Promise<boolean>

// Text input
$.prompt(message: string, defaultValue?: string): Promise<string>

// Password input (hidden)
$.password(message: string): Promise<string>

// Selection menu
$.select<T>(message: string, choices: T[]): Promise<T>

// Multi-select menu
$.multiselect<T>(message: string, choices: T[]): Promise<T[]>

// Spinner/progress indicator
$.spinner(message: string): Spinner

interface Spinner {
  start(): void;
  stop(): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  update(message: string): void;
}
```

## Temporary File Management

Work with temporary files and directories:

```typescript
// Create temp file
$.tempFile(options?: TempOptions): Promise<TempFile>

// Create temp directory
$.tempDir(options?: TempOptions): Promise<TempDir>

// With auto-cleanup
$.withTempFile<T>(
  fn: (path: string) => T | Promise<T>,
  options?: TempOptions
): Promise<T>

$.withTempDir<T>(
  fn: (path: string) => T | Promise<T>,
  options?: TempOptions
): Promise<T>

interface TempOptions {
  prefix?: string;      // Filename prefix
  suffix?: string;      // Filename suffix
  dir?: string;         // Parent directory
  cleanup?: boolean;    // Auto-cleanup (default: true)
}
```

## Next Steps

- See [Examples](./examples.md) for usage patterns
- Read [Configuration Guide](./configuration.md) for detailed options
- Check [Error Handling](./error-handling.md) for error management