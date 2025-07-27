---
sidebar_position: 1
---

# ExecutionEngine API

Core execution engine that powers @xec-sh/core command execution across multiple environments.

## Overview

The ExecutionEngine is the central orchestrator that:
- Executes commands across different adapters (local, SSH, Docker, Kubernetes)
- Manages configuration and environment settings
- Handles events and lifecycle management
- Provides template literal API (`$\`command\``)
- Supports advanced features like retry, caching, and streaming

## Class: ExecutionEngine

```typescript
class ExecutionEngine extends EnhancedEventEmitter implements Disposable {
  constructor(config?: ExecutionEngineConfig)
  
  // Command execution
  execute(command: Command): Promise<ExecutionResult>
  run(strings: TemplateStringsArray, ...values: any[]): ProcessPromise
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise
  
  // Configuration
  with(config: Partial<Command>): ExecutionEngine
  cd(dir: string): ExecutionEngine
  env(vars: Record<string, string>): ExecutionEngine
  timeout(ms: number): ExecutionEngine
  shell(shell: string | boolean): ExecutionEngine
  quiet(): ExecutionEngine
  nothrow(): ExecutionEngine
  retry(options: RetryOptions): ExecutionEngine
  
  // Adapters
  local(): ExecutionEngine
  ssh(options: SSHAdapterOptions): SSHExecutionContext
  docker(options: DockerContainerConfig): DockerContext
  docker(options: DockerAdapterOptions): ExecutionEngine
  k8s(options?: KubernetesAdapterOptions): K8sExecutionContext
  remoteDocker(options: RemoteDockerAdapterOptions): ExecutionEngine
  
  // Utilities
  pipe: typeof pipe
  stream: typeof stream
  parallel: ParallelEngine
  transfer: TransferEngine
  
  // Interactive
  question(prompt: string, options?: QuestionOptions): Promise<string>
  confirm(prompt: string, defaultValue?: boolean): Promise<boolean>
  select(prompt: string, choices: string[]): Promise<string>
  password(prompt: string): Promise<string>
  spinner(text?: string): Spinner
  withSpinner<T>(text: string, fn: () => T | Promise<T>): Promise<T>
  
  // Context management
  within<T>(config: Partial<Command>, fn: () => T | Promise<T>): T | Promise<T>
  withinSync<T>(config: Partial<Command>, fn: () => T): T
  
  // Temporary files
  tempFile(options?: TempOptions): Promise<TempFile>
  tempDir(options?: TempOptions): Promise<TempDir>
  withTempFile<T>(fn: (path: string) => T | Promise<T>, options?: TempOptions): Promise<T>
  withTempDir<T>(fn: (path: string) => T | Promise<T>, options?: TempOptions): Promise<T>
  
  // File operations
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  
  // Templates
  template(templateStr: string, options?: TemplateOptions): CommandTemplate
  templates: {
    render(templateStr: string, data: Record<string, any>, options?: TemplateOptions): string
    create(templateStr: string, options?: TemplateOptions): CommandTemplate
    parse(templateStr: string): { template: string; params: string[] }
    register(name: string, templateStr: string, options?: TemplateOptions): void
    get(name: string): CommandTemplate
  }
  
  // Resource management
  dispose(): Promise<void>
}
```

## Configuration

### ExecutionEngineConfig

```typescript
interface ExecutionEngineConfig extends EventConfig {
  // Global settings
  defaultTimeout?: number;          // Default command timeout (ms)
  defaultCwd?: string;             // Default working directory
  defaultEnv?: Record<string, string>; // Default environment variables
  defaultShell?: string | boolean; // Default shell setting
  
  // Adapter settings
  adapters?: {
    local?: LocalAdapterConfig;
    ssh?: SSHAdapterConfig;
    docker?: DockerAdapterConfig;
    kubernetes?: KubernetesAdapterConfig;
    remoteDocker?: RemoteDockerAdapterConfig;
  };
  
  // Behavior
  throwOnNonZeroExit?: boolean;    // Throw on non-zero exit codes
  encoding?: BufferEncoding;       // Output encoding (default: 'utf8')
  maxBuffer?: number;              // Max buffer size (default: 10MB)
  
  // Runtime settings
  runtime?: {
    preferBun?: boolean;           // Prefer Bun runtime
    bunPath?: string;              // Path to Bun executable
  };
}
```

## Template Literal API

The primary way to execute commands is through template literals:

```typescript
import { $ } from '@xec-sh/core';

// Basic execution
const result = await $`ls -la`;
console.log(result.stdout);

// With interpolation (automatically escaped)
const filename = "file with spaces.txt";
await $`cat ${filename}`;

// Raw interpolation (no escaping)
const cmd = "ls -la | grep .js";
await $.raw`${cmd}`;

// Chaining modifiers
await $`npm test`
  .cwd('/project')
  .env({ NODE_ENV: 'test' })
  .timeout(60000)
  .nothrow();
```

## ProcessPromise

The template literal API returns a ProcessPromise with chainable methods:

```typescript
interface ProcessPromise extends Promise<ExecutionResult> {
  // Stream access
  stdin: NodeJS.WritableStream;
  
  // Configuration
  cwd(dir: string): ProcessPromise;
  env(env: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  timeout(ms: number, timeoutSignal?: string): ProcessPromise;
  
  // Behavior modifiers
  quiet(): ProcessPromise;      // Suppress output
  nothrow(): ProcessPromise;    // Don't throw on error
  interactive(): ProcessPromise; // Inherit stdio
  
  // Stream configuration
  stdout(stream: StreamOption): ProcessPromise;
  stderr(stream: StreamOption): ProcessPromise;
  
  // Piping
  pipe(target: ProcessPromise | WritableStream | TemplateStringsArray): ProcessPromise;
  
  // Output formats
  text(): Promise<string>;      // Trimmed stdout
  json<T>(): Promise<T>;        // Parse stdout as JSON
  lines(): Promise<string[]>;   // Split stdout by lines
  buffer(): Promise<Buffer>;    // Raw stdout buffer
  
  // Caching
  cache(options?: CacheOptions): ProcessPromise;
  
  // Process control
  signal(signal: AbortSignal): ProcessPromise;
  kill(signal?: string): void;
  
  // Process info
  child?: any;                  // Underlying child process
  exitCode: Promise<number | null>;
}
```

## Command Execution

### Direct Execution

```typescript
// Using execute() method directly
const result = await $.execute({
  command: 'git',
  args: ['status', '--porcelain'],
  cwd: '/repo',
  env: { GIT_PAGER: 'cat' }
});

// Using ProcessPromise
const promise = $.createProcessPromise({
  command: 'npm test',
  shell: true,
  timeout: 30000
});

const result = await promise;
```

### Environment Configuration

```typescript
// Change working directory
const $project = $.cd('/path/to/project');
await $project`npm install`;

// Set environment variables
const $prod = $.env({ NODE_ENV: 'production' });
await $prod`npm run build`;

// Combine configurations
const $build = $.cd('/app').env({ NODE_ENV: 'production' });
await $build`npm run build`;

// Temporary configuration with within()
await $.within({ cwd: '/tmp' }, async () => {
  await $`pwd`; // Executes in /tmp
});
```

### Shell Configuration

```typescript
// Disable shell (direct execution)
await $`echo hello`.shell(false);

// Use specific shell
await $`echo $SHELL`.shell('/bin/zsh');

// Global shell configuration
const $bash = $.shell('/bin/bash');
await $bash`source ~/.bashrc && my-alias`;
```

## Adapter Selection

### Local Execution

```typescript
// Explicit local adapter
const $local = $.local();
await $local`ls -la`;

// Default is local
await $`ls -la`;
```

### SSH Execution

```typescript
// Create SSH context
const $ssh = $.ssh({
  host: 'server.example.com',
  username: 'user',
  privateKey: '/path/to/key'
});

// Execute commands
await $ssh`uname -a`;
await $ssh`cd /app && npm test`;

// With connection options
const $prod = $.ssh({
  host: 'prod.example.com',
  port: 2222,
  username: 'deploy',
  privateKey: process.env.SSH_KEY,
  passphrase: 'key-passphrase',
  readyTimeout: 10000
});
```

### Docker Execution

```typescript
// Execute in existing container
const $container = $.docker({
  container: 'my-app'
});
await $container`npm test`;

// Create and manage container
const container = await $.docker({
  image: 'node:18',
  name: 'test-container',
  volumes: ['/app:/app'],
  env: { NODE_ENV: 'test' }
}).start();

await container.exec`npm install`;
await container.exec`npm test`;
await container.stop();
await container.remove();
```

### Kubernetes Execution

```typescript
// Create Kubernetes context
const k8s = $.k8s({
  namespace: 'production',
  kubeconfig: '/path/to/config'
});

// Execute in pod
const pod = k8s.pod('app-pod');
await pod.exec`ps aux`;

// With specific container
await pod.exec`npm test`.container('app');

// Port forwarding
const forward = await pod.portForward(8080, 80);
// Access service at localhost:8080
await forward.close();
```

### Remote Docker

```typescript
// Docker over SSH
const $remote = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'docker'
  },
  docker: {
    container: 'my-app'
  }
});

await $remote`docker ps`;
```

## Error Handling

### Non-Throwing Mode

```typescript
// Don't throw on non-zero exit
const result = await $`exit 1`.nothrow();
console.log(result.exitCode); // 1

// Check success
if (result.exitCode === 0) {
  console.log('Success!');
} else {
  console.log('Failed:', result.stderr);
}
```

### Retry Logic

```typescript
// Configure retry
const $retry = $.retry({
  maxRetries: 3,
  delay: 1000,
  backoff: 'exponential',
  factor: 2
});

await $retry`flaky-command`;

// Per-command retry
await $`network-request`
  .retry({ maxRetries: 5, delay: 2000 });
```

### Timeouts

```typescript
// Set timeout
await $`long-running-command`.timeout(5000);

// With custom signal
await $`server-process`.timeout(10000, 'SIGKILL');

// Global timeout
const $quick = $.timeout(1000);
await $quick`fast-command`;
```

## Streaming and Piping

### Output Streaming

```typescript
// Stream to file
import { createWriteStream } from 'fs';

const file = createWriteStream('output.log');
await $`npm test`.stdout(file);

// Stream to process.stdout
await $`docker logs my-app`.stdout(process.stdout);

// Custom processing
await $`tail -f app.log`.stdout((chunk) => {
  console.log('LOG:', chunk.toString());
});
```

### Piping Between Commands

```typescript
// Pipe between processes
await $`cat data.json`.pipe($`jq .users`);

// Multiple pipes
await $`find . -name "*.js"`
  .pipe($`grep -v node_modules`)
  .pipe($`xargs wc -l`);

// Pipe to Node.js stream
const transform = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

await $`echo hello`.pipe(transform).pipe(process.stdout);
```

## Parallel Execution

```typescript
// Execute commands in parallel
const results = await $.parallel([
  $`npm test`,
  $`npm run lint`,
  $`npm run type-check`
]);

// With options
const results = await $.parallel([
  $`test-1`,
  $`test-2`,
  $`test-3`
], {
  maxConcurrent: 2,
  stopOnError: true,
  timeout: 30000
});

// Using parallel engine
const results = await $.parallel
  .maxConcurrent(3)
  .stopOnError(false)
  .run([
    $`slow-task-1`,
    $`slow-task-2`,
    $`slow-task-3`
  ]);
```

## Caching

```typescript
// Cache command results
const data = await $`expensive-computation`.cache();

// With options
const result = await $`curl https://api.example.com/data`
  .cache({
    ttl: 60000,        // Cache for 1 minute
    key: 'api-data',   // Custom cache key
    invalidateOn: ['data-update'] // Invalidation events
  });

// Manual cache invalidation
import { globalCache } from '@xec-sh/core';
globalCache.invalidate('api-data');
globalCache.clear(); // Clear all
```

## Event System

```typescript
// Listen to events
$.on('command:start', (event) => {
  console.log(`Executing: ${event.command}`);
});

$.on('command:complete', (event) => {
  console.log(`Completed in ${event.duration}ms`);
});

$.on('command:error', (event) => {
  console.error(`Failed: ${event.error}`);
});

// File operation events
$.on('file:read', (event) => {
  console.log(`Read file: ${event.path}`);
});

// SSH events
$.on('ssh:connect', (event) => {
  console.log(`Connected to ${event.host}`);
});

// Remove listeners
$.off('command:start', handler);
$.removeAllListeners();
```

## Templates

### Basic Templates

```typescript
// Create template
const deploy = $.template('git pull && npm install && npm run {{env}}');

// Render with data
await deploy.render({ env: 'production' });

// With defaults
const build = $.template('npm run build:{{target}}', {
  defaults: { target: 'prod' }
});
```

### Template Registry

```typescript
// Register templates
$.templates.register('deploy', 'cd {{dir}} && git pull && npm install');
$.templates.register('test', 'npm test -- {{args}}');

// Use registered templates
const deploy = $.templates.get('deploy');
await deploy.render({ dir: '/app' });

// Parse template
const { params } = $.templates.parse('echo {{name}} {{version}}');
console.log(params); // ['name', 'version']
```

## Resource Management

### Temporary Files

```typescript
// Create temp file
const file = await $.tempFile({ prefix: 'data-' });
await $.writeFile(file.path, 'content');
// Auto-cleaned on dispose

// With callback
await $.withTempFile(async (path) => {
  await $`echo "test" > ${path}`;
  const content = await $.readFile(path);
  return content;
}); // File deleted after callback

// Temp directory
await $.withTempDir(async (dir) => {
  await $`cd ${dir} && npm init -y`;
  await $`cd ${dir} && npm install lodash`;
});
```

### Disposal

```typescript
// Dispose of all resources
const $ = new ExecutionEngine();

try {
  // Use engine
  await $`command`;
} finally {
  // Clean up adapters, temp files, connections
  await $.dispose();
}

// Automatic disposal in tests
beforeEach(() => {
  global.$ = new ExecutionEngine();
});

afterEach(async () => {
  await global.$.dispose();
});
```

## Advanced Usage

### Custom Adapters

```typescript
// Configure adapters
const $ = new ExecutionEngine({
  adapters: {
    ssh: {
      connection: existingSSHConnection,
      keepAlive: true
    },
    docker: {
      socketPath: '/var/run/docker.sock'
    }
  }
});
```

### Interactive Mode

```typescript
// Interactive commands
await $`npm init`.interactive();

// Collect user input
const name = await $.question('Project name:');
const useTS = await $.confirm('Use TypeScript?', true);
const license = await $.select('Choose license:', ['MIT', 'Apache', 'GPL']);

// With spinner
await $.withSpinner('Installing dependencies...', async () => {
  await $`npm install`;
});
```

### File Operations

```typescript
// Built-in file operations
const content = await $.readFile('/path/to/file');
await $.writeFile('/path/to/file', 'new content');
await $.deleteFile('/path/to/old-file');

// File transfers
await $.transfer.upload('/local/file', '/remote/file', $ssh);
await $.transfer.download('/remote/file', '/local/file', $ssh);
```

## Best Practices

### 1. Use Template Literals

```typescript
// ✅ Good - automatic escaping
const file = "file with spaces.txt";
await $`cat ${file}`;

// ❌ Bad - manual concatenation
await $`cat ${file}`;
```

### 2. Dispose Resources

```typescript
// ✅ Good - proper cleanup
const $ = new ExecutionEngine();
try {
  await $`command`;
} finally {
  await $.dispose();
}

// ❌ Bad - resource leak
const $ = new ExecutionEngine();
await $`command`;
// No cleanup!
```

### 3. Handle Errors

```typescript
// ✅ Good - explicit error handling
const result = await $`risky-command`.nothrow();
if (result.exitCode !== 0) {
  console.error('Command failed:', result.stderr);
}

// ✅ Good - with retry
await $`flaky-network-call`.retry({ maxRetries: 3 });
```

### 4. Use Context Methods

```typescript
// ✅ Good - scoped configuration
await $.within({ cwd: '/tmp' }, async () => {
  await $`create-temp-files`;
});

// ✅ Good - persistent configuration
const $project = $.cd('/project').env({ NODE_ENV: 'test' });
```

### 5. Optimize Parallel Work

```typescript
// ✅ Good - parallel execution
const [test, lint, build] = await Promise.all([
  $`npm test`,
  $`npm run lint`,
  $`npm run build`
]);

// ❌ Bad - sequential when parallel would work
await $`npm test`;
await $`npm run lint`;
await $`npm run build`;
```