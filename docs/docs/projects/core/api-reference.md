---
sidebar_position: 10
---

# Core API Reference

Complete API reference for the `@xec-sh/core` package.

## Global API

### $

The main execution function.

```typescript
const $: CallableExecutionEngine
```

#### Signature

```typescript
interface CallableExecutionEngine {
  // Execute command with template literal
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Execute raw command (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Configuration
  config: {
    set(updates: Partial<ExecutionEngineConfig>): void;
    get(): Readonly<ExecutionEngineConfig>;
  };
  
  // Directory operations
  pwd(): string;
  
  // Event handling
  on(event: string, handler: Function): void;
  off(event: string, handler?: Function): void;
  once(event: string, handler: Function): void;
  onFiltered(event: string, filter: any, handler: Function): void;
  offFiltered(event: string, filter: any, handler: Function): void;
  removeAllListeners(event?: string): void;
  
  // Resource cleanup
  dispose(): Promise<void>;
}
```

#### Methods

##### Execution Methods

```typescript
// Template literal execution
await $`echo "Hello, world!"`;

// Raw execution (no escaping)
await $.raw`echo $HOME`;

// Get current directory
const cwd = $.pwd(); // Returns current working directory
```

##### Configuration Methods

```typescript
// Change directory
$.cd(path: string): CallableExecutionEngine

// Set environment variables
$.env(vars: Record<string, string>): CallableExecutionEngine

// Set timeout
$.timeout(ms: number): CallableExecutionEngine

// Set shell
$.shell(shell: string | boolean): CallableExecutionEngine

// Set retry options
$.retry(options: RetryOptions | number): CallableExecutionEngine

// Set defaults
$.defaults(config: Partial<Command>): CallableExecutionEngine
```

##### Adapter Methods

```typescript
// Local execution
$.local(): CallableExecutionEngine

// SSH execution
$.ssh(options: SSHOptions): SSHExecutionContext

// Docker execution
$.docker(options: DockerOptions): CallableExecutionEngine
$.docker(config: DockerContainerConfig): DockerContext

// Kubernetes execution  
$.k8s(options?: K8sOptions): K8sExecutionContext

// Remote Docker
$.remoteDocker(options: RemoteDockerOptions): CallableExecutionEngine

// Generic adapter
$.with(config: Partial<Command>): CallableExecutionEngine
```

##### Batch Processing

```typescript
// Execute commands in batches with limited concurrency
$.batch(commands: Array<string | Command>, options?: BatchOptions): Promise<ParallelResult>

interface BatchOptions extends ParallelOptions {
  concurrency?: number; // Alias for maxConcurrency
}
```

Example:

```typescript
// Process files in batches with progress tracking
const results = await $.batch([
  'process file1.txt',
  'process file2.txt',
  'process file3.txt',
  'process file4.txt',
  'process file5.txt'
], {
  concurrency: 2,
  onProgress: (completed, total, succeeded, failed) => {
    console.log(`Progress: ${completed}/${total} (${succeeded} succeeded, ${failed} failed)`);
  }
});

console.log(`Processed ${results.succeeded.length} files successfully`);
```

## ProcessPromise

Extended Promise returned by command execution.

```typescript
interface ProcessPromise extends Promise<ExecutionResult> {
  // Output methods
  text(): Promise<string>;      // Get stdout as clean string (no trailing newline)
  json<T = any>(): Promise<T>;  // Parse stdout as JSON
  lines(): Promise<string[]>;   // Get stdout as array of lines
  buffer(): Promise<Buffer>;    // Get stdout as Buffer
  
  // Stream output
  stream(options?: StreamOptions): ProcessPromise;
  
  // Don't throw on non-zero exit
  nothrow(): ProcessPromise;
  
  // Suppress output
  quiet(): ProcessPromise;
  
  // Set timeout
  timeout(ms: number): ProcessPromise;
  
  // Retry on failure
  retry(options: RetryOptions | number): ProcessPromise;
  
  // Cache result
  cache(options: CacheOptions): ProcessPromise;
  
  // Pipe to another command
  pipe(target: ProcessPromise | WritableStream): ProcessPromise;
  
  // Process properties
  pid?: number;
  child?: ChildProcess;
  killed?: boolean;
  
  // Access streams
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  
  // Process control
  kill(signal?: string): void;
}
```

### Output Methods

#### .text()

Get stdout as clean string with trailing newline removed:

```typescript
const version = await $`node --version`.text();
// "v18.16.0" instead of "v18.16.0\n"

const name = await $`git config user.name`.text();
// Clean string without newline
```

#### .json()

Parse stdout as JSON:

```typescript
const pkg = await $`cat package.json`.json();
console.log(pkg.name, pkg.version);

// With type safety
interface Config {
  port: number;
  host: string;
}
const config = await $`cat config.json`.json<Config>();
```

#### .lines()

Get stdout as array of lines (empty lines removed):

```typescript
const files = await $`ls -la`.lines();
// ["total 64", "drwxr-xr-x  10 user  staff   320 Jan  1 12:00 .", ...]

const todos = await $`grep TODO *.js`.lines();
// Each matching line as array element
```

#### .buffer()

Get stdout as Buffer for binary data:

```typescript
const imageData = await $`cat image.jpg`.buffer();
console.log('Image size:', imageData.length);

// Process binary data
const compressed = await $`gzip -c data.txt`.buffer();
await fs.writeFile('data.txt.gz', compressed);
```

### Execution Control

#### $.raw`command`

Execute commands without shell escaping. Useful when you need to preserve special characters or when working with complex shell constructs:

```typescript
// Regular execution escapes special characters
const name = "John's file";
await $`echo ${name}`;  // Executes: echo 'John'"'"'s file'

// Raw execution preserves the exact string
await $.raw`echo ${name}`;  // Executes: echo John's file

// Useful for shell expansions
await $.raw`echo ~/Documents/*.txt`;  // Shell expands the glob pattern

// Complex shell constructs
const script = 'if [ -f "$1" ]; then echo "exists"; fi';
await $.raw`bash -c '${script}' -- myfile.txt`;
```

**Note:** Use raw execution carefully as it bypasses safety escaping and can be vulnerable to command injection if used with untrusted input.

#### .nothrow()

Don't throw on non-zero exit code:

```typescript
const result = await $`test -f missing.txt`.nothrow();
if (!result.ok) {
  console.log('File does not exist');
}

// Check command availability
const hasDocker = await $`which docker`.nothrow();
if (hasDocker.ok) {
  console.log('Docker is installed');
}
```

#### .quiet()

Suppress command logging:

```typescript
// Normal - logs: $ echo "secret"
await $`echo "secret"`;

// Quiet - no logging
await $`echo "secret"`.quiet();

// Chain with other methods
const data = await $`cat sensitive.txt`.quiet().text();
```

#### .stream()

Stream output in real-time:

```typescript
// Default streaming to console
await $`npm install`.stream();

// Custom stream handlers
await $`long-running-command`.stream({
  stdout: (chunk) => process.stdout.write(`[OUT] ${chunk}`),
  stderr: (chunk) => process.stderr.write(`[ERR] ${chunk}`)
});
```

### Other Methods

```typescript
// With timeout
await $`slow-command`.timeout(5000);

// With retry
await $`flaky-network-call`.retry(3);

// Pipe commands
await $`cat file.txt`.pipe($`grep pattern`);

// Kill process
const proc = $`infinite-loop`;
setTimeout(() => proc.kill(), 5000);
await proc;
```

## ExecutionResult

Result of command execution.

```typescript
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  
  // Check if successful (exitCode === 0)
  ok: boolean;
  
  // Get stdout as string
  toString(): string;
}
```

## Configuration

### ExecutionEngineConfig

```typescript
interface ExecutionEngineConfig {
  shell?: string | boolean;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  throwOnNonZeroExit?: boolean;
  stdin?: 'inherit' | 'pipe' | 'ignore' | string | Buffer | Readable;
  stdout?: 'inherit' | 'pipe' | 'ignore';
  stderr?: 'inherit' | 'pipe' | 'ignore';
  encoding?: BufferEncoding;
  maxBuffer?: number;
  verbose?: boolean;
}
```

### configure()

Configure global execution engine.

```typescript
function configure(config: ExecutionEngineConfig): void
```

Example:

```typescript
import { configure } from '@xec-sh/core';

configure({
  shell: '/bin/zsh',
  timeout: 30000,
  env: {
    NODE_ENV: 'production'
  }
});
```

## ExecutionEngine

Create custom execution engine instances:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine({
  shell: '/bin/bash',
  timeout: 60000
});

// Convert to callable
const $custom = engine.asCallable();
await $custom`echo "Custom engine"`;

// Direct usage
await engine.execute({ command: 'ls', args: ['-la'] });

// Cleanup
await engine.dispose();
```

## SSH API

### SSHExecutionContext

```typescript
interface SSHExecutionContext {
  // Execute command
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Execute raw command
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Create SSH tunnel
  tunnel(options: SSHTunnelOptions): Promise<SSHTunnel>;
  
  // File operations
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  uploadDirectory(localPath: string, remotePath: string): Promise<void>;
  
  // Configuration (returns new context)
  env(vars: Record<string, string>): SSHExecutionContext;
  cd(path: string): SSHExecutionContext;
  timeout(ms: number): SSHExecutionContext;
  shell(shell: string | boolean): SSHExecutionContext;
  retry(options: RetryOptions | number): SSHExecutionContext;
}
```

### SSHTunnel

```typescript
interface SSHTunnel {
  localPort: number;
  localHost: string;
  remoteHost: string;
  remotePort: number;
  isOpen: boolean;
  
  open(): Promise<void>;
  close(): Promise<void>;
}
```

### SSHOptions

```typescript
interface SSHOptions {
  host: string;
  port?: number;
  username: string;
  password?: string | SecurePasswordHandler;
  privateKey?: string | Buffer;
  passphrase?: string;
  agent?: string;
  agentForward?: boolean;
  keepaliveInterval?: number;
  readyTimeout?: number;
  strictHostKeyChecking?: boolean;
  tryKeyboard?: boolean;
  hostVerifier?: (key: string) => boolean;
  algorithms?: {
    kex?: string[];
    cipher?: string[];
    serverHostKey?: string[];
  };
}
```

## Docker API

### DockerContext

```typescript
interface DockerContext {
  // Start new container
  start(): Promise<DockerContainer>;
  
  // Execute in existing container (backwards compatibility)
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
}
```

### DockerContainer

```typescript
interface DockerContainer {
  name: string;
  started: boolean;
  removed: boolean;
  
  // Lifecycle
  start(): Promise<DockerContainer>;
  stop(timeout?: number): Promise<void>;
  remove(force?: boolean): Promise<void>;
  restart(): Promise<void>;
  
  // Execution
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  execRaw(command: string, args?: string[]): Promise<ExecutionResult>;
  
  // Logs
  logs(options?: DockerLogsOptions): Promise<string>;
  streamLogs(onData: (data: string) => void, options?: DockerLogsOptions): Promise<{ stop: () => void }>;
  follow(onData: (data: string) => void, options?: Omit<DockerLogsOptions, 'follow'>): Promise<{ stop: () => void }>;
  
  // Health
  waitForHealthy(timeout?: number): Promise<void>;
  
  // Stats
  stats(): Promise<any>;
  inspect(): Promise<any>;
  
  // Files
  copyTo(localPath: string, containerPath: string): Promise<void>;
  copyFrom(containerPath: string, localPath: string): Promise<void>;
  
  // Network
  getIpAddress(network?: string): Promise<string | null>;
}
```

### DockerContainerConfig

```typescript
interface DockerContainerConfig {
  image: string;
  name?: string;
  hostname?: string;
  volumes?: Record<string, string> | string[];
  env?: Record<string, string>;
  ports?: Record<string, string> | string[];
  network?: string;
  healthcheck?: DockerHealthCheckOptions;
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  command?: string | string[];
  workdir?: string;
  user?: string;
  labels?: Record<string, string>;
  privileged?: boolean;
}
```

### Docker Compose Methods

```typescript
// Static methods on adapter
$.docker.composeUp(options?: DockerComposeOptions): Promise<void>;
$.docker.composeDown(options?: DockerComposeOptions): Promise<void>;
$.docker.composePs(options?: DockerComposeOptions): Promise<string>;
$.docker.composeLogs(service?: string, options?: DockerComposeOptions): Promise<string>;

interface DockerComposeOptions {
  file?: string | string[];
  projectName?: string;
}
```

## Kubernetes API

### K8sExecutionContext

```typescript
interface K8sExecutionContext {
  // Execute command (backwards compatibility)
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Get pod instance
  pod(name: string): K8sPod;
  
  // Direct execution
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
}
```

### K8sPod

```typescript
interface K8sPod {
  name: string;
  namespace: string;
  
  // Execution
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Port forwarding
  portForward(localPort: number, remotePort: number): Promise<K8sPortForward>;
  portForwardDynamic(remotePort: number): Promise<K8sPortForward>;
  
  // Logs
  logs(options?: K8sLogOptions): Promise<string>;
  streamLogs(onData: (data: string) => void, options?: K8sStreamLogOptions): Promise<K8sLogStream>;
  follow(onData: (data: string) => void, options?: K8sLogOptions): Promise<K8sLogStream>;
  
  // Files
  copyTo(localPath: string, remotePath: string, container?: string): Promise<void>;
  copyFrom(remotePath: string, localPath: string, container?: string): Promise<void>;
}
```

### K8sPortForward

```typescript
interface K8sPortForward {
  localPort: number;
  remotePort: number;
  isOpen: boolean;
  
  open(): Promise<void>;
  close(): Promise<void>;
}
```

### K8sLogStream

```typescript
interface K8sLogStream {
  stop(): void;
}
```

### K8sOptions

```typescript
interface K8sOptions {
  pod?: string;
  namespace?: string;
  container?: string;
  context?: string;
  kubeconfig?: string;
  tty?: boolean;
  stdin?: boolean;
  execFlags?: string[];
}
```

## Event System

### Event Types

```typescript
// Command events
'command:start': { 
  command: string; 
  adapter: string;
  timestamp: Date;
  config: Command;
}

'command:success': { 
  command: string;
  adapter: string;
  duration: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  timestamp: Date;
}

'command:error': { 
  command: string;
  adapter: string;
  duration: number;
  exitCode: number;
  error: Error;
  stdout: string;
  stderr: string;
  timestamp: Date;
}

'command:end': {
  command: string;
  adapter: string;
  duration: number;
  exitCode: number;
  timestamp: Date;
}

// Connection events
'connection:open': { adapter: string; target: string; timestamp: Date }
'connection:close': { adapter: string; reason: string; timestamp: Date }

// SSH events
'ssh:connect': { host: string; port: number; username: string; timestamp: Date }
'ssh:disconnect': { host: string; reason: string; timestamp: Date }
'ssh:error': { host: string; error: Error; timestamp: Date }

// Docker events
'docker:create': { container: string; image: string; timestamp: Date }
'docker:start': { container: string; timestamp: Date }
'docker:stop': { container: string; timestamp: Date }
'docker:remove': { container: string; timestamp: Date }
'docker:error': { container: string; error: Error; timestamp: Date }

// Kubernetes events
'k8s:exec': { pod: string; namespace: string; timestamp: Date }
'k8s:error': { pod: string; error: Error; timestamp: Date }

// File events
'file:read': { path: string; size: number; timestamp: Date }
'file:write': { path: string; size: number; timestamp: Date }
'file:upload': { source: string; destination: string; progress: number; timestamp: Date }
'file:download': { source: string; destination: string; progress: number; timestamp: Date }

// Retry events
'retry:attempt': { attempt: number; maxAttempts: number; delay: number; error: Error; timestamp: Date }
'retry:success': { attempts: number; totalDuration: number; timestamp: Date }
'retry:failed': { attempts: number; errors: Error[]; timestamp: Date }

// Cache events
'cache:hit': { key: string; age: number; timestamp: Date }
'cache:miss': { key: string; timestamp: Date }
'cache:set': { key: string; ttl: number; timestamp: Date }
'cache:expire': { key: string; timestamp: Date }

// Temporary file events
'temp:create': { type: 'file' | 'directory'; path: string; timestamp: Date }
'temp:cleanup': { type: 'file' | 'directory'; path: string; timestamp: Date }

// Tunnel events
'tunnel:created': { localPort: number; remoteHost: string; remotePort: number; timestamp: Date }
'tunnel:closed': { localPort: number; timestamp: Date }
'tunnel:error': { error: Error; timestamp: Date }
```

### Event Methods

```typescript
// Add listener
$.on('command:start', (event) => {
  console.log(`Executing: ${event.command}`);
});

// Remove listener
$.off('command:start', handler);
$.off('command:start'); // Remove all

// One-time listener
$.once('ssh:connect', (event) => {
  console.log(`Connected to ${event.host}`);
});

// Wildcard events
$.on('command:*', handler);    // All command events
$.on('*:error', handler);      // All error events
$.on('*', handler);            // All events

// Filtered events
$.onFiltered('command:start', { adapter: 'ssh' }, handler);
$.onFiltered('command:error', { exitCode: 1 }, handler);
$.onFiltered('command:end', (event) => event.duration > 5000, handler);

// Remove filtered
$.offFiltered('command:start', { adapter: 'ssh' }, handler);
```

## Utility Functions

### parallel()

Execute commands in parallel with concurrency control.

```typescript
function parallel(
  commands: Array<string | Command>,
  engine: ExecutionEngine | CallableExecutionEngine,
  options?: ParallelOptions
): Promise<ParallelResult>

interface ParallelResult {
  results: (ExecutionResult | Error)[];
  succeeded: ExecutionResult[];
  failed: Error[];
  duration: number;
}

interface ParallelOptions {
  maxConcurrent?: number;
  stopOnError?: boolean;
  onProgress?: (completed: number, total: number, succeeded: number, failed: number) => void;
  onTaskComplete?: (index: number, result: T | Error) => void;
}
```

Example:

```typescript
import { parallel } from '@xec-sh/core';

// Execute commands in parallel
const results = await parallel([
  'npm install',
  'npm run build',
  'npm test'
], $, { 
  maxConcurrency: 2,
  stopOnError: false,
  onProgress: (completed, total, succeeded, failed) => {
    console.log(`Progress: ${completed}/${total}`);
  }
});

// With custom commands
const commands = [
  { command: 'git pull', cwd: '/repo1' },
  { command: 'git pull', cwd: '/repo2' },
  { command: 'git pull', cwd: '/repo3' }
];

const results2 = await parallel(commands, $, {
  maxConcurrency: 3
});
```

### ParallelEngine

Advanced parallel execution with additional methods.

```typescript
class ParallelEngine {
  constructor(engine: ExecutionEngine | CallableExecutionEngine)
  
  // Execute all commands, throw on first error
  all(commands: Array<string | Command>, options?: ParallelOptions): Promise<ExecutionResult[]>
  
  // Execute all commands, return all results
  settled(commands: Array<string | Command>, options?: ParallelOptions): Promise<ParallelResult>
  
  // Execute commands and return first to complete
  race(commands: Array<string | Command>): Promise<ExecutionResult>
  
  // Map over items and execute commands
  map<T>(
    items: T[],
    fn: (item: T, index: number) => string | Command,
    options?: ParallelOptions
  ): Promise<ParallelResult>
  
  // Filter items based on command success
  filter<T>(
    items: T[],
    fn: (item: T, index: number) => string | Command,
    options?: ParallelOptions
  ): Promise<T[]>
  
  // Check if any command succeeds
  some(commands: Array<string | Command>, options?: ParallelOptions): Promise<boolean>
  
  // Check if all commands succeed
  every(commands: Array<string | Command>, options?: ParallelOptions): Promise<boolean>
}
```

Example:

```typescript
import { ParallelEngine } from '@xec-sh/core';

const parallel = new ParallelEngine($);

// Map over files and process them
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
const results = await parallel.map(
  files,
  (file) => `process ${file}`,
  {
    maxConcurrency: 2,
    onProgress: (completed, total) => {
      console.log(`Processed ${completed}/${total} files`);
    }
  }
);

// Filter items based on test results
const validItems = await parallel.filter(
  items,
  (item) => `test -f ${item}` // Check if file exists
);

// Run tests and throw on first failure
try {
  await parallel.all([
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:e2e'
  ]);
  console.log('All tests passed!');
} catch (error) {
  console.error('Test failed:', error);
}
```

### Pipeline

Advanced pipeline builder for complex command sequences.

```typescript
class Pipeline {
  constructor(engine: ExecutionEngine, options?: PipelineOptions)
  
  // Add command stage
  add(command: Command | string): Pipeline
  
  // Add conditional stage
  addConditional(fn: (result: ExecutionResult) => Command | null): Pipeline
  
  // Transform stage result
  transform(stageIndex: number, fn: (result: ExecutionResult) => any): Pipeline
  
  // Execute pipeline
  execute(): Promise<ExecutionResult | ExecutionResult[]>
  
  // Execute stages in parallel where possible
  executeParallel(): Promise<ExecutionResult[]>
}

interface PipelineOptions {
  stopOnError?: boolean;
  collectResults?: boolean;
  progress?: {
    enabled?: boolean;
    onStageStart?: (stage: number, total: number, description?: string) => void;
    onStageComplete?: (stage: number, total: number, result: ExecutionResult) => void;
    onPipelineComplete?: (results: ExecutionResult[]) => void;
  };
  concurrency?: number;
}
```

Example:

```typescript
import { Pipeline, ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine();
const pipeline = new Pipeline(engine, {
  stopOnError: false,
  collectResults: true
});

// Build pipeline
pipeline
  .add('git status')
  .addConditional(result => 
    result.stdout.includes('modified') ? 
      { command: 'git add -A' } : 
      null
  )
  .add('git commit -m "Auto commit"')
  .transform(2, result => {
    console.log('Commit result:', result.stdout);
  });

// Execute
const results = await pipeline.execute();
```

### Pipeline Operators

#### pipeOperator()

Chains commands passing stdout to stdin.

```typescript
function pipeOperator(...commands: (Command | string)[]): Pipeline
```

Example:

```typescript
const pipeline = pipeOperator(
  'cat data.txt',
  'grep pattern',
  'sort',
  'uniq -c'
);
const result = await pipeline.execute();
```

#### teeOperator()

Splits output to multiple destinations.

```typescript
function teeOperator(
  command: Command | string,
  ...destinations: ((data: string) => void)[]
): Promise<ExecutionResult>
```

Example:

```typescript
await teeOperator(
  'tail -f app.log',
  data => console.log('[LOG]', data),
  data => fs.appendFileSync('output.log', data),
  data => websocket.send(data)
);
```

#### conditionalOperator()

Executes command based on condition.

```typescript
function conditionalOperator(
  condition: boolean | (() => boolean | Promise<boolean>),
  trueCommand: Command | string,
  falseCommand?: Command | string
): Promise<ExecutionResult | null>
```

Example:

```typescript
const result = await conditionalOperator(
  () => fs.existsSync('./package.json'),
  'npm install',
  'echo "No package.json found"'
);
```

#### mapOperator()

Applies command to each line of input.

```typescript
function mapOperator(
  input: string | string[],
  command: (line: string) => Command | string,
  options?: { concurrency?: number }
): Promise<ExecutionResult[]>
```

Example:

```typescript
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
const results = await mapOperator(
  files,
  file => `cat ${file} | wc -l`,
  { concurrency: 2 }
);
```

#### filterOperator()

Filters lines based on command exit code.

```typescript
function filterOperator(
  input: string | string[],
  filterCommand: (line: string) => Command | string
): Promise<string[]>
```

Example:

```typescript
const files = await $`ls`.lines();
const executables = await filterOperator(
  files,
  file => `test -x ${file}`
);
```

#### reduceOperator()

Reduces input lines to single value.

```typescript
function reduceOperator<T>(
  input: string | string[],
  initialValue: T,
  reducer: (acc: T, line: string, index: number) => T | Promise<T>
): Promise<T>
```

Example:

```typescript
const lines = await $`cat numbers.txt`.lines();
const sum = await reduceOperator(
  lines,
  0,
  async (total, line) => total + parseInt(line)
);
```

### within() / withinSync()

Execute code within a temporary configuration context.

```typescript
function within<T>(
  config: Partial<ExecutionConfig>,
  fn: () => T | Promise<T>
): Promise<T>

function withinSync<T>(
  config: Partial<ExecutionConfig>,
  fn: () => T
): T
```

Example:

```typescript
// Execute with temporary configuration
await within({ cwd: '/tmp', env: { NODE_ENV: 'test' } }, async () => {
  // These commands run with the temporary config
  await $`npm install`;
  await $`npm test`;
});

// Synchronous version
const result = withinSync({ cwd: '/app' }, () => {
  // Synchronous operations with temporary config
  return fs.readFileSync('config.json', 'utf8');
});
```

### withTempFile()

Execute with temporary file.

```typescript
function withTempFile<T>(
  fn: (filepath: string) => Promise<T>,
  options?: TempOptions
): Promise<T>

interface TempOptions {
  prefix?: string;
  suffix?: string;
  dir?: string;
  keep?: boolean;
}
```

### withTempDir()

Execute with temporary directory.

```typescript
function withTempDir<T>(
  fn: (dirpath: string) => Promise<T>,
  options?: TempOptions
): Promise<T>
```

## Error Types

### CommandError

Thrown when command exits with non-zero code.

```typescript
class CommandError extends ExecutionError {
  readonly exitCode: number;
  readonly signal?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly command: string;
}
```

### TimeoutError

Thrown when command exceeds timeout.

```typescript
class TimeoutError extends ExecutionError {
  readonly timeout: number;
  readonly command: string;
}
```

### ConnectionError

Thrown when connection fails.

```typescript
class ConnectionError extends ExecutionError {
  readonly host: string;
  readonly port?: number;
  readonly code: string;
  readonly originalError: Error;
}
```

### AdapterError

Thrown when adapter operation fails.

```typescript
class AdapterError extends ExecutionError {
  readonly adapter: string;
  readonly operation: string;
  readonly originalError?: Error;
}
```

### DockerError

Docker-specific errors.

```typescript
class DockerError extends ExecutionError {
  readonly container: string;
  readonly operation: string;
  readonly originalError: Error;
}
```

### KubernetesError

Kubernetes-specific errors.

```typescript
class KubernetesError extends ExecutionError {
  readonly pod: string;
  readonly namespace?: string;
  readonly container?: string;
}
```

## Security Classes

### SSHKeyValidator

Validate SSH keys.

```typescript
class SSHKeyValidator {
  async validate(keyPath: string): Promise<ValidationResult>;
  async isValid(keyPath: string): Promise<boolean>;
  async getKeyInfo(keyPath: string): Promise<KeyInfo>;
  async checkPermissions(keyPath: string): Promise<PermissionResult>;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  keyType?: string;
  bits?: number;
}
```

### SecurePasswordHandler

Handle passwords securely.

```typescript
class SecurePasswordHandler implements Disposable {
  setPassword(password: string): void;
  getPassword(): string;
  dispose(): void;
  
  static fromEnv(varName: string): SecurePasswordHandler;
  static fromFile(filepath: string): SecurePasswordHandler;
}
```

## Type Definitions

### Command

```typescript
interface Command {
  command: string | string[];
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | boolean;
  timeout?: number;
  stdin?: string | Buffer | Readable;
  stdout?: 'inherit' | 'pipe' | 'ignore' | Writable;
  stderr?: 'inherit' | 'pipe' | 'ignore' | Writable;
  throwOnNonZeroExit?: boolean;
  adapter?: string;
  adapterOptions?: any;
}
```

### RetryOptions

```typescript
interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoff?: 'linear' | 'exponential';
  shouldRetry?: (error: Error, attempt: number) => boolean;
}
```

### CacheOptions

```typescript
interface CacheOptions {
  key: string | ((command: Command) => string);
  ttl?: number;
  storage?: 'memory' | 'disk';
}
```

### StreamOptions

```typescript
interface StreamOptions {
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
  encoding?: BufferEncoding;
}
```

### TempOptions

```typescript
interface TempOptions {
  prefix?: string;
  suffix?: string;
  dir?: string;
  keep?: boolean;
}
```

### createCallableEngine()

Creates a callable wrapper around an ExecutionEngine instance.

```typescript
function createCallableEngine(engine: ExecutionEngine): CallableExecutionEngine
```

This function converts a regular ExecutionEngine into a callable function that supports the template literal syntax.

Example:

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

// Create a custom engine
const engine = new ExecutionEngine({
  shell: '/bin/zsh',
  env: { CUSTOM: 'true' }
});

// Make it callable
const $custom = createCallableEngine(engine);

// Now use with template literals
await $custom`echo "Custom engine with $CUSTOM"`;

// Still access methods
await $custom.cd('/tmp')`pwd`;
```

### isDisposable()

Checks if an object implements the Disposable interface.

```typescript
function isDisposable(obj: any): obj is Disposable

interface Disposable {
  dispose(): Promise<void> | void;
}
```

Example:

```typescript
import { isDisposable, SSHAdapter } from '@xec-sh/core';

const adapter = new SSHAdapter({ host: 'example.com' });

if (isDisposable(adapter)) {
  // Safely dispose when done
  await adapter.dispose();
}

// Useful for generic cleanup
async function cleanup(resources: any[]) {
  for (const resource of resources) {
    if (isDisposable(resource)) {
      await resource.dispose();
    }
  }
}
```

### dispose()

Disposes the global execution engine and cleans up resources.

```typescript
function dispose(): Promise<void>
```

This function is useful for explicitly cleaning up the global `$` instance, especially in test environments or when you need to ensure all connections are closed.

Example:

```typescript
import { $, dispose } from '@xec-sh/core';

// Use the global engine
await $`echo "Hello"`;
await $.ssh({ host: 'server' })`date`;

// Clean up everything
await dispose();

// Note: The global engine will be recreated on next use
await $`echo "New engine instance"`;
```

## Script Context and Module Loading

When using `@xec-sh/core` in Xec scripts or custom commands, additional utilities and module loading capabilities are automatically available through the global context.

### Global Module Context

The `__xecModuleContext` provides dynamic module loading with CDN fallback support:

```typescript
interface XecModuleContext {
  // Import any module with intelligent resolution
  import(spec: string): Promise<any>;
  
  // Import from NPM via CDN (doesn't require local installation)
  importNPM(pkg: string): Promise<any>;
  
  // Import from JSR (JavaScript Registry)
  importJSR(pkg: string): Promise<any>;
  
  // Resolve module URL
  resolveModule(spec: string): Promise<string>;
}
```

Usage in scripts:

```typescript
// The module context is globally available in Xec scripts
const dayjs = await __xecModuleContext.importNPM('dayjs@1.11.10');
const lodash = await __xecModuleContext.importNPM('lodash-es');

// Import from JSR
const encoding = await __xecModuleContext.importJSR('@std/encoding@0.224.0');

// Local packages work seamlessly
const { $ } = await __xecModuleContext.import('@xec-sh/core');
```

### Script Utilities Integration

When running scripts with Xec CLI, all script utilities are available globally. This includes file system operations, prompts, HTTP requests, and more. See the [Script API Reference](/docs/projects/cli/script-api) for complete documentation of available utilities.

Example script using global utilities:

```typescript
#!/usr/bin/env xec

// All utilities are globally available
const files = await glob('src/**/*.ts');
log.info(`Found ${files.length} TypeScript files`);

const spinner = spinner();
spinner.start('Building project...');

try {
  await $`npm run build`;
  spinner.stop('Build complete');
} catch (error) {
  spinner.stop('Build failed');
  log.error(error.message);
  exit(1);
}

// Use module context for dynamic imports
const semver = await __xecModuleContext.importNPM('semver');
const version = semver.default.inc('1.0.0', 'minor');
log.success(`Next version: ${version}`);
```

## Advanced Usage

### Custom Adapters

```typescript
import { BaseAdapter, ExecutionResult, Command } from '@xec-sh/core';

class MyAdapter extends BaseAdapter {
  async execute(command: Command): Promise<ExecutionResult> {
    // Your implementation
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      ok: true,
      toString: () => ''
    };
  }
  
  async isAvailable(): Promise<boolean> {
    return true;
  }
  
  async dispose(): Promise<void> {
    // Cleanup
  }
}

// Register adapter
const adapter = new MyAdapter();
engine.registerAdapter('myadapter', adapter);

// Use adapter
const my = $.with({ adapter: 'myadapter' });
await my`custom command`;
```

### Engine Management

```typescript
// Create multiple engines
const devEngine = new ExecutionEngine({
  env: { NODE_ENV: 'development' }
});

const prodEngine = new ExecutionEngine({
  env: { NODE_ENV: 'production' }
});

// Use as callable
const $dev = devEngine.asCallable();
const $prod = prodEngine.asCallable();

// Cleanup
await devEngine.dispose();
await prodEngine.dispose();
```

## Progress Tracking

### ProgressReporter

Tracks and reports progress of long-running operations.

```typescript
class ProgressReporter {
  constructor(options?: ProgressOptions)
  
  start(message?: string): void
  progress(message: string, current?: number, total?: number): void
  complete(message?: string): void
  error(error: Error, message?: string): void
  reportOutput(data: string | Buffer): void
}

interface ProgressOptions {
  enabled?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  updateInterval?: number;
  reportLines?: boolean;
  prefix?: string;
}

interface ProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  current?: number;
  total?: number;
  percentage?: number;
  duration?: number;
  rate?: number;
  eta?: number;
  data?: any;
}
```

Example:

```typescript
import { ProgressReporter } from '@xec-sh/core';

const reporter = new ProgressReporter({
  onProgress: (event) => {
    if (event.type === 'progress' && event.percentage) {
      console.log(`Progress: ${event.percentage.toFixed(1)}%`);
    }
  }
});

reporter.start('Processing files...');
for (let i = 0; i < 100; i++) {
  await $`process-file file${i}.txt`;
  reporter.progress('Processing', i + 1, 100);
}
reporter.complete('All files processed');
```

### ProgressBar

Display progress bars for operations.

```typescript
class ProgressBar {
  constructor(options?: ProgressBarOptions)
  
  update(value: number): void
  increment(delta?: number): void
  complete(): void
}

interface ProgressBarOptions {
  total?: number;
  width?: number;
  complete?: string;
  incomplete?: string;
  head?: string;
  format?: string;
  tokens?: Record<string, string>;
  renderThrottle?: number;
}
```

Example:

```typescript
import { createProgressBar } from '@xec-sh/core';

const bar = createProgressBar({
  total: 100,
  width: 40,
  format: ':bar :percent :etas'
});

for (let i = 0; i <= 100; i++) {
  bar.update(i);
  await new Promise(resolve => setTimeout(resolve, 50));
}
bar.complete();
```

### Spinner

Display animated spinners for indeterminate operations.

```typescript
class Spinner {
  constructor(options?: { text?: string; interval?: number })
  
  start(text?: string): void
  stop(): void
  succeed(text?: string): void
  fail(text?: string): void
  info(text?: string): void
  warn(text?: string): void
}
```

Example:

```typescript
import { createSpinner } from '@xec-sh/core';

const spinner = createSpinner({ text: 'Loading...' });
spinner.start();

try {
  await $`long-running-command`;
  spinner.succeed('Done!');
} catch (error) {
  spinner.fail('Failed!');
}
```

### MultiProgress

Manage multiple progress indicators simultaneously.

```typescript
class MultiProgress {
  create(id: string, options?: ProgressBarOptions): ProgressBar
  createSpinner(id: string, options?: { text?: string }): Spinner
  remove(id: string): void
  clear(): void
}
```

Example:

```typescript
import { MultiProgress } from '@xec-sh/core';

const multi = new MultiProgress();

// Create multiple progress bars
const downloadBar = multi.create('download', { total: 100 });
const processBar = multi.create('process', { total: 50 });

// Update them independently
downloadBar.update(30);
processBar.update(10);

// Clean up when done
multi.clear();
```

## Environment Variables

Recognized environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `XEC_SHELL` | Default shell | `/bin/sh` |
| `XEC_TIMEOUT` | Default timeout (ms) | `0` (no timeout) |
| `XEC_CWD` | Working directory | `process.cwd()` |
| `XEC_THROW_ON_ERROR` | Throw on non-zero exit | `true` |
| `SSH_AUTH_SOCK` | SSH agent socket | System default |
| `PATH` | Command search path | System default |

## Debugging

Enable debug output:

```typescript
// Via event listeners
$.on('command:start', (e) => console.log('[START]', e.command));
$.on('command:end', (e) => console.log('[END]', e.duration + 'ms'));
$.on('command:error', (e) => console.error('[ERROR]', e.error));

// Log all events
$.on('*', (event) => {
  console.log(`[${event.type}]`, event);
});

// Performance profiling
const timings = new Map();
$.on('command:start', (e) => {
  timings.set(e.command, Date.now());
});
$.on('command:end', (e) => {
  const start = timings.get(e.command);
  if (start) {
    console.log(`${e.command}: ${Date.now() - start}ms`);
    timings.delete(e.command);
  }
});
```