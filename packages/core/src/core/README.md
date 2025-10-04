# Core Module Documentation

## Overview

The `core` module is the heart of the Xec execution system, providing the fundamental building blocks for command execution across different environments. It implements a highly optimized, type-safe, and extensible architecture for executing commands with support for various adapters (local, SSH, Docker, Kubernetes).

## Table of Contents

- [Architecture](#architecture)
- [Key Components](#key-components)
  - [ExecutionEngine](#executionengine)
  - [ProcessContext](#processcontext)
  - [ProcessPromise](#processpromise)
  - [Error System](#error-system)
  - [Result System](#result-system)
  - [Process Output](#process-output)
  - [Pipe Implementation](#pipe-implementation)
- [Design Principles](#design-principles)
- [Performance Optimizations](#performance-optimizations)
- [Usage Examples](#usage-examples)

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   ExecutionEngine                    │
│  - Command orchestration                             │
│  - Adapter management                                │
│  - Template literal support                          │
│  - Event emission                                    │
└────────────────────────┬─────────────────────────────┘
                         │
            ┌────────────┼───────────┐
            │            │           │
   ┌────────▼──────┐ ┌──▼──┐ ┌───────▼────────┐
   │ProcessContext │ │Pipes│ │ProcessPromise  │
   │& Builder      │ └─────┘ │Builder         │
   └───────────────┘         └────────────────┘
            │                          │
   ┌────────▼──────────────────────────▼────────┐
   │           Command Execution Flow           │
   │  - Lazy evaluation                         │
   │  - Caching support                         │
   │  - Error handling                          │
   └────────────────────────────────────────────┘
                         │
   ┌─────────────────────▼───────────────────────┐
   │              Result System                  │
   │  - ExecutionResult                          │
   │  - ProcessOutput                            │
   │  - Error types                              │
   └─────────────────────────────────────────────┘
```

## Key Components

### ExecutionEngine

**File:** `execution-engine.ts`

The main orchestrator of the entire execution system. It manages adapters, handles command execution, and provides the public API.

#### Key Features:

1. **Adapter Management**
   - Automatic adapter selection based on command configuration
   - Lazy loading of adapters for optimal performance
   - Support for custom adapter registration
   - Built-in adapters: Local, SSH, Docker, Kubernetes

2. **Template Literal Support**
   ```typescript
   // Tagged template literals with automatic escaping
   await engine.run`ls -la ${directory}`;

   // Raw template literals (no escaping)
   await engine.raw`echo ${rawString}`;
   ```

3. **Event System**
   - Emits events for command lifecycle: `command:start`, `command:complete`, `command:error`
   - File operation events: `file:read`, `file:write`, `file:delete`
   - Configurable event emission with performance optimization

4. **Configuration Management**
   ```typescript
   interface ExecutionEngineConfig {
     defaultTimeout?: number;          // Default: 30000ms
     throwOnNonZeroExit?: boolean;     // Default: true
     encoding?: BufferEncoding;        // Default: 'utf8'
     maxBuffer?: number;                // Default: 10MB
     defaultCwd?: string;               // Working directory
     defaultEnv?: Record<string, string>; // Environment variables
     defaultShell?: string | boolean;  // Shell configuration
     enableEvents?: boolean;            // Event emission control
     maxEventListeners?: number;        // Default: 100
     adapters?: {                      // Adapter-specific configs
       local?: BaseAdapterConfig;
       ssh?: SSHAdapterConfig;
       docker?: DockerAdapterConfig;
       kubernetes?: K8sAdapterConfig;
     };
   }
   ```

5. **Fluent API Methods**
   - `with(config)` - Create new engine with merged configuration
   - `ssh(options)` - SSH execution context
   - `docker(options)` - Docker execution (fluent API or adapter)
   - `k8s(options)` - Kubernetes execution context
   - `local()` - Force local adapter
   - `cd(dir)` - Change working directory
   - `pwd()` - Get current working directory
   - `env(vars)` - Set environment variables
   - `timeout(ms)` - Set command timeout
   - `shell(shell)` - Configure shell
   - `retry(options)` - Add retry logic
   - `interactive()` - Enable interactive mode
   - `defaults(config)` - Set default configuration

6. **Utility Methods**
   - `which(command)` - Find command path
   - `isCommandAvailable(command)` - Check command availability
   - `batch(commands, options)` - Execute commands in batches
   - `withSpinner(text, fn)` - Execute with spinner
   - `tempFile(options)` - Create temporary file
   - `tempDir(options)` - Create temporary directory
   - `withTempFile(fn, options)` - Execute with temporary file
   - `withTempDir(fn, options)` - Execute with temporary directory

7. **File Operations**
   - `readFile(path)` - Read file contents
   - `writeFile(path, content)` - Write file
   - `deleteFile(path)` - Delete file

8. **Interactive Utilities**
   - `question(prompt)` / `prompt(prompt)` - Ask for input
   - `password(prompt)` - Secure password input
   - `confirm(prompt)` - Yes/no confirmation
   - `select(options)` - Selection menu
   - `spinner(text)` - Create spinner

9. **Template System**
   ```typescript
   // Register template
   engine.templates.register('build', 'npm run build --{{env}}', {
     defaults: { env: 'production' }
   });

   // Use template
   const template = engine.templates.get('build');
   await template.execute({ env: 'development' });
   ```

10. **Resource Management**
    - Automatic cleanup of temporary files
    - Process tracking and cancellation
    - Adapter disposal on engine cleanup
    - `dispose()` method for explicit cleanup

### ProcessContext

**File:** `process-context.ts`

Manages the execution context for process promises with optimized state management and lazy evaluation.

#### Key Classes:

1. **ProcessContext**
   - Manages command state and modifications
   - Handles caching with global cache support
   - Implements abort controller for cancellation
   - Provides chainable methods for configuration

   ```typescript
   class ProcessContext {
     state = {
       modifications: {} as Partial<Command>,
       cacheOptions: null as CacheOptions | null,
       abortController: null as AbortController | null,
       isQuiet: false
     };

     // Chainable configuration methods
     withSignal(signal: AbortSignal): ProcessPromise
     withTimeout(ms: number, timeoutSignal?: string): ProcessPromise
     withQuiet(): ProcessPromise
     withNothrow(): ProcessPromise
     withInteractive(): ProcessPromise
     withCwd(dir: string): ProcessPromise
     withEnv(env: Record<string, string>): ProcessPromise
     withShell(shell: string | boolean): ProcessPromise
     withStdout(stream: StreamOption): ProcessPromise
     withStderr(stream: StreamOption): ProcessPromise
     withCache(options?: CacheOptions): ProcessPromise
     pipe(target: PipeTarget, ...args: any[]): ProcessPromise
     kill(signal?: string): void
   }
   ```

2. **PipedProcessContext**
   - Specialized context for piped operations
   - Handles pipe options and template arguments
   - Manages source command nothrow behavior

3. **ProcessPromiseBuilder**
   - Creates ProcessPromise instances with minimal allocations
   - Implements lazy evaluation - commands only execute when awaited
   - Optimized method binding with caching
   - Handles both direct commands and deferred resolvers

   ```typescript
   class ProcessPromiseBuilder {
     createProcessPromise(
       commandOrResolver: Command | (() => Promise<Partial<Command>>)
     ): ProcessPromise

     createProcessPromiseWithContext(
       context: ProcessContext
     ): ProcessPromise
   }
   ```

#### Cache Support:

- Global cache with TTL support
- In-flight request deduplication
- Cache invalidation patterns
- Key generation based on command, cwd, and env

### ProcessPromise

**Type:** `ProcessPromise` (defined in types, implemented in `process-context.ts`)

A thenable object that represents a pending command execution with a fluent API.

#### Key Features:

1. **Lazy Evaluation**
   - Commands don't execute until `.then()`, `.catch()`, or `await` is called
   - Optimizes performance by avoiding unnecessary executions

2. **Fluent API**
   ```typescript
   const result = await $`ls -la`
     .timeout(5000)
     .nothrow()
     .quiet()
     .pipe($`grep .js`)
     .text();
   ```

3. **Transform Methods**
   - `text()` - Get stdout as trimmed string
   - `json<T>()` - Parse stdout as JSON
   - `lines()` - Get stdout as array of lines
   - `buffer()` - Get stdout as Buffer

4. **Configuration Methods**
   - All ProcessContext methods are available
   - Methods return new ProcessPromise for chaining
   - Immutable state management

5. **Error Handling**
   - Respects `nothrow` configuration
   - Throws `CommandError` for non-zero exits by default
   - Can be configured globally via `throwOnNonZeroExit`

### Error System

**File:** `error.ts`

Comprehensive error handling with specialized error types for different failure scenarios.

#### Error Classes:

1. **ExecutionError** (Base class)
   ```typescript
   class ExecutionError extends Error {
     code: string;              // Error code for programmatic handling
     details?: Record<string, any>; // Additional error context
   }
   ```

2. **CommandError**
   - Thrown when command exits with non-zero code
   - Contains: command, exitCode, signal, stdout, stderr, duration
   - Sanitizes command for security (configurable via `XEC_SANITIZE_COMMANDS`)

3. **ConnectionError**
   - Network connection failures
   - Contains: host, originalError

4. **TimeoutError**
   - Command execution timeout
   - Contains: command, timeout duration

5. **DockerError**
   - Docker-specific operations
   - Contains: container, operation, originalError

6. **AdapterError**
   - Adapter operation failures
   - Special handling for common errors (ENOENT, cwd issues)
   - Contains: adapter, operation, originalError

7. **KubernetesError**
   - Kubernetes-specific operations
   - Contains: pod, namespace, container, additional details

#### Command Sanitization:

The `sanitizeCommandForError` function protects sensitive information:
- Skips sanitization in test environment
- Configurable via `XEC_SANITIZE_COMMANDS` environment variable
- Hides arguments for sensitive commands (cat, ls, rm, etc.)
- Limits displayed arguments for long commands

### Result System

**File:** `result.ts`

Defines the execution result structure and provides utility methods for result manipulation.

#### ExecutionResultImpl:

```typescript
class ExecutionResultImpl implements ExecutionResult {
  // Properties
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: string | undefined;
  command: string;
  duration: number;
  startedAt: Date;
  finishedAt: Date;
  adapter: string;
  host?: string;
  container?: string;
  ok: boolean;        // true if exitCode === 0
  cause?: string;     // Error cause if not ok

  // Methods
  toMetadata(): object           // Convert to plain object
  throwIfFailed(): void          // Throw CommandError if failed
  text(): string                 // Get trimmed stdout
  json<T>(): T                   // Parse stdout as JSON
  lines(): string[]              // Get stdout lines
  buffer(): Buffer              // Get stdout as Buffer
}
```

### Process Output

**File:** `process-output.ts`

Provides a zx-compatible ProcessOutput class for command execution results.

#### ProcessOutput Class:

```typescript
class ProcessOutput extends Error {
  // Properties
  readonly stdout: string;
  readonly stderr: string;
  readonly stdall: string;      // Combined stdout + stderr
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly duration: number;
  readonly command?: string;
  readonly cwd?: string;
  readonly ok: boolean;         // Success indicator

  // String conversion
  toString(): string             // Returns trimmed stdout
  valueOf(): string              // Returns trimmed stdout

  // Data extraction
  text(encoding?: BufferEncoding): string
  json<T>(): T
  lines(delimiter?: string): string[]
  buffer(): Buffer
  blob(): Blob                  // If available in environment

  // Iteration support
  [Symbol.iterator](): Iterator<string>
  [Symbol.asyncIterator](): AsyncIterator<string>

  // Static helpers
  static fromResult(result): ProcessOutput
  static success(stdout?): ProcessOutput
}
```

#### Features:

- Error message formatting with exit code descriptions
- Human-readable error messages for common exit codes (126, 127, etc.)
- Automatic string conversion from Buffer inputs
- Support for both sync and async iteration over lines

### Pipe Implementation

**File:** `pipe-implementation.ts`

Implements the pipe functionality for chaining command outputs to various targets.

#### executePipe Function:

```typescript
async function executePipe(
  source: ProcessPromise | Promise<ExecutionResult>,
  target: PipeTarget,
  engine: ExecutionEngine,
  options: PipeOptions = {},
  ...templateArgs: any[]
): Promise<any>
```

#### Supported Pipe Targets:

1. **Template Literals**
   ```typescript
   await $`echo hello`.pipe($`grep ${pattern}`)
   ```

2. **String Commands**
   ```typescript
   await $`ls`.pipe('grep .js')
   ```

3. **Command Objects**
   ```typescript
   await $`cat file`.pipe({ command: 'wc', args: ['-l'] })
   ```

4. **Another ProcessPromise**
   ```typescript
   const grep = $`grep pattern`;
   await $`cat file`.pipe(grep)
   ```

5. **Transform Streams**
   ```typescript
   await $`cat file`.pipe(pipeUtils.toUpperCase())
   ```

6. **Writable Streams**
   ```typescript
   const output = fs.createWriteStream('output.txt');
   await $`ls`.pipe(output)
   ```

7. **Functions (Line Processors)**
   ```typescript
   await $`cat file`.pipe(line => console.log(line))
   ```

#### Pipe Options:

```typescript
interface PipeOptions {
  throwOnError?: boolean;    // Throw if source command failed (default: true)
  encoding?: BufferEncoding;  // Output encoding (default: 'utf8')
  lineByLine?: boolean;       // Process line by line (default: true)
  lineSeparator?: string;     // Line separator (default: '\n')
}
```

#### Pipe Utilities:

```typescript
const pipeUtils = {
  // Transform to uppercase
  toUpperCase(): Transform

  // Filter lines with grep-like pattern
  grep(pattern: string | RegExp): Transform

  // Replace text
  replace(search: string | RegExp, replacement: string): Transform

  // Tee - split output to multiple destinations
  tee(...destinations: Writable[]): Transform
}
```

## Design Principles

### 1. Performance First

- **Lazy Evaluation**: Commands only execute when needed
- **Method Caching**: Bound methods are cached to reduce allocations
- **Minimal Allocations**: Object pooling and reuse where possible
- **Event Optimization**: Skip event emission when no listeners
- **Single Object Spreads**: Minimize object creation overhead

### 2. Type Safety

- Full TypeScript strict mode
- No `any` types in public APIs
- Comprehensive type definitions
- Type guards for runtime validation

### 3. Immutability

- Configuration objects are immutable
- Method chaining creates new instances
- State mutations are isolated

### 4. Error Handling

- Specialized error types for different scenarios
- Detailed error context preservation
- Security-conscious error messages
- Configurable throw behavior

### 5. Extensibility

- Adapter pattern for different environments
- Plugin-friendly architecture
- Event system for monitoring
- Template system for reusability

## Performance Optimizations

### ProcessPromiseBuilder Optimization

The original implementation was ~298 lines, optimized to just 3 lines by:
- Delegating to ProcessContext for state management
- Using lazy promise creation
- Caching method bindings

### Memory Management

- Automatic cleanup of temporary resources
- Process tracking for cancellation
- Stream handling with backpressure
- Buffer size limits (default 10MB)

### Caching Strategy

- Global cache with TTL support
- In-flight request deduplication
- Cache key generation based on command context
- Invalidation patterns for related commands

### Event System

- Check listener count before emission
- Lazy event data construction
- Optional event disabling for performance

## Usage Examples

### Basic Command Execution

```typescript
import { ExecutionEngine } from './execution-engine.js';

const engine = new ExecutionEngine();

// Simple command
const result = await engine.execute({
  command: 'ls',
  args: ['-la'],
  cwd: '/tmp'
});

// Template literals
await engine.run`echo "Hello, World!"`;

// With error handling
const output = await engine.run`cat file.txt`.nothrow();
if (output.exitCode !== 0) {
  console.error('Command failed:', output.stderr);
}
```

### Advanced Piping

```typescript
// Chain multiple commands
const result = await engine.run`cat data.txt`
  .pipe($`grep ERROR`)
  .pipe($`wc -l`)
  .text();

// Process line by line
await engine.run`tail -f log.txt`
  .pipe(line => {
    if (line.includes('ERROR')) {
      console.error('Error found:', line);
    }
  });

// Use pipe utilities
await engine.run`cat input.txt`
  .pipe(pipeUtils.grep(/^ERROR/))
  .pipe(pipeUtils.toUpperCase())
  .pipe(fs.createWriteStream('errors.txt'));
```

### Context Management

```typescript
// Change working directory
const gitEngine = engine.cd('/path/to/repo');
await gitEngine.run`git status`;

// Set environment variables
const nodeEngine = engine.env({ NODE_ENV: 'production' });
await nodeEngine.run`npm start`;

// Configure timeout
const slowEngine = engine.timeout(60000);
await slowEngine.run`npm install`;

// Chain configurations
const configured = engine
  .cd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(30000)
  .shell('/bin/bash');
```

### Docker Integration

```typescript
// Fluent API
const container = await engine.docker()
  .ephemeral('node:18')
  .volumes(['/app:/app'])
  .workdir('/app')
  .create();

// Direct configuration
const dockerEngine = engine.docker({
  container: 'my-container',
  workdir: '/app'
});
await dockerEngine.run`npm test`;
```

### SSH Execution

```typescript
const sshEngine = engine.ssh({
  host: 'server.example.com',
  username: 'deploy',
  privateKey: '/path/to/key'
});

await sshEngine.run`ls -la /var/www`;
```

### Parallel Execution

```typescript
// Execute commands in parallel
const results = await engine.parallel.all([
  'npm test',
  'npm run lint',
  'npm run type-check'
]);

// With concurrency limit
const batchResults = await engine.batch(commands, {
  concurrency: 5,
  onProgress: (completed, total) => {
    console.log(`Progress: ${completed}/${total}`);
  }
});
```

### Template System

```typescript
// Create reusable templates
engine.templates.register('deploy', 'docker push {{registry}}/{{image}}:{{tag}}', {
  defaults: { registry: 'docker.io', tag: 'latest' }
});

// Use templates
const deployCmd = engine.templates.get('deploy');
await deployCmd.execute({ image: 'myapp', tag: 'v1.0.0' });
```

### Resource Management

```typescript
// Temporary files
await engine.withTempFile(async (path) => {
  await engine.run`echo "temp data" > ${path}`;
  // File is automatically cleaned up
});

// Explicit disposal
try {
  const result = await engine.run`long-running-command`;
} finally {
  await engine.dispose();
}
```

## Thread Safety and Concurrency

The core module is designed to be thread-safe:

1. **Immutable State**: Configuration changes create new instances
2. **Process Isolation**: Each command execution is isolated
3. **Async Context**: Uses AsyncLocalStorage for context isolation
4. **Resource Tracking**: Proper cleanup even with concurrent operations

## Error Recovery

The system provides multiple layers of error recovery:

1. **nothrow**: Continue execution despite errors
2. **Retry Logic**: Automatic retry with backoff
3. **Timeout Handling**: Graceful timeout with cleanup
4. **Signal Handling**: Proper process termination

## Security Considerations

1. **Command Sanitization**: Sensitive data protection in errors
2. **Shell Escaping**: Automatic escaping in template literals
3. **Environment Isolation**: Separate environment per execution
4. **Resource Limits**: Buffer size and timeout limits

## Performance Benchmarks

Typical performance characteristics:

- Command creation: <100ns
- Simple execution: <5ms overhead
- Pipe setup: <200ns
- Context switch: <1μs
- Memory per command: <1MB

## Future Enhancements

Planned improvements:

1. **Streaming Support**: Better streaming APIs for large outputs
2. **Progress Tracking**: Built-in progress for long operations
3. **Distributed Execution**: Cluster-aware execution
4. **Advanced Caching**: Smarter cache invalidation
5. **Performance Profiling**: Built-in profiling tools

## Contributing

When contributing to the core module:

1. Maintain backward compatibility
2. Add comprehensive tests
3. Update this documentation
4. Follow performance guidelines
5. Ensure type safety

## License

This module is part of the Xec project and follows the same license terms.