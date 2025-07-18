# @xec/ush

Universal shell execution engine - A powerful and flexible command execution library for Node.js, inspired by Google's `zx` but designed to work seamlessly across all environments: local, SSH, and Docker containers.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [Basic Execution](#basic-execution)
  - [Configuration](#configuration)
  - [Adapters](#adapters)
    - [Local Execution](#local-execution-default)
    - [SSH Execution](#ssh-execution)
    - [Docker Execution](#docker-execution)
    - [Kubernetes Execution](#kubernetes-execution)
    - [Remote Docker Execution](#remote-docker-execution)
    - [Mock Adapter](#mock-adapter-testing)
  - [Enhanced Features](#enhanced-features)
    - [Retry with Exponential Backoff](#retry-with-exponential-backoff)
    - [Context Management](#context-management-within)
    - [Pipe Operations](#pipe-operations)
    - [Parallel Execution](#parallel-execution)
    - [Command Templates](#command-templates)
    - [Streaming Execution](#streaming-execution)
    - [Temporary Files & Directories](#temporary-files--directories)
    - [Interactive Input](#interactive-input)
    - [Command Pipelines](#command-pipelines)
    - [Audit Logging](#audit-logging)
    - [Secure Password Handling](#secure-password-handling)
    - [Progress Tracking](#progress-tracking)
    - [Retry Adapter](#retry-adapter)
- [Examples](#examples)
  - [Basic Script](#basic-script)
  - [Multi-Environment Deployment](#multi-environment-deployment)
  - [CI/CD Pipeline](#cicd-pipeline)
  - [Docker Compose Operations](#docker-compose-operations)
  - [Advanced SSH with Tunneling](#advanced-ssh-with-tunneling)
  - [File Transfer Between Environments](#file-transfer-between-environments)
  - [Testing with Mocks](#testing-with-mocks)
  - [Kubernetes Operations](#kubernetes-operations)
  - [Pipeline with Error Handling](#pipeline-with-error-handling)
  - [Secure Remote Operations](#secure-remote-operations)
  - [Audited Operations](#audited-operations)
  - [Remote Docker Pipeline](#remote-docker-pipeline)
- [Migration from zx](#migration-from-zx)
- [FAQ](#faq)
- [Advanced Types & Interfaces](#advanced-types--interfaces)
  - [Execution Engine Types](#execution-engine-types)
  - [Audit Types](#audit-types)
  - [Progress Types](#progress-types)
  - [Global Functions](#global-functions)
  - [Error Types](#error-types)
- [Development & Documentation](#development--documentation)
- [Best Practices](#best-practices)
  - [Performance Tips](#performance-tips)
  - [Security Recommendations](#security-recommendations)
  - [Error Handling](#error-handling)
  - [Testing](#testing)
- [License](#license)

## Features

- 🚀 **Unified API** - Single API for all execution environments
- 📝 **Template Literals** - Native support for template literals like zx
- 🔌 **Multiple Adapters** - Local, SSH, Docker, Kubernetes, and Remote Docker
- 🧪 **Mock Adapter** - Built-in testing support with advanced mocking
- ⚡ **Bun Support** - Native support for Bun.spawn execution
- 🔄 **SSH Connection Pooling** - Efficient SSH connection management
- 📊 **Stream Handling** - Real-time output streaming with line mode
- 🔒 **TypeScript Support** - Full TypeScript support with type safety
- 🔁 **Retry Logic** - Built-in retry with exponential backoff
- ⏸️ **Parallel Execution** - Run commands concurrently with control
- 📋 **Command Templates** - Reusable command patterns with validation
- 🌊 **Pipe Operations** - Unix-style command piping
- 📁 **Temporary Files** - Safe temporary file/directory handling
- 💬 **Interactive Mode** - User prompts, confirmations, and selections
- 🎯 **Context Management** - Scoped execution environments
- 🚧 **Command Pipelines** - Complex multi-stage command workflows
- 📝 **Audit Logging** - Track and query all command executions
- 🔐 **Secure Passwords** - Safe password handling and masking
- 📈 **Progress Tracking** - Monitor long-running operations
- 🔧 **Retry Adapter** - Add retry capability to any adapter
- 🚢 **Kubernetes Support** - Execute commands in K8s pods
- 🌐 **Remote Docker** - Docker commands through SSH connections

## Installation

```bash
npm install @xec/ush
# or
yarn add @xec/ush
# or
pnpm add @xec/ush
```

## Quick Start

```typescript
import { $ } from '@xec/ush';

// Basic command execution
const result = await $`echo "Hello, World!"`;
console.log(result.stdout); // "Hello, World!"

// Template literals with variables
const filename = "my file.txt";
await $`touch ${filename}`;

// Configure and chain
const $prod = $.env({ NODE_ENV: 'production' }).cd('/app');
await $prod`npm start`;

// Execute on remote server
const $remote = $.ssh({ host: 'server.com', username: 'deploy' });
await $remote`docker restart myapp`;

// Execute in Docker container
const $docker = $.docker({ container: 'webapp' });
await $docker`npm run migrate`;
```

## Core Concepts

### 1. Execution Engine

The heart of ush is the `ExecutionEngine`, which provides a unified interface for command execution:

```typescript
import { createExecutionEngine } from '@xec/ush';

// Create with custom configuration
const $ = createExecutionEngine({
  // Default execution options
  defaultTimeout: 60000,
  defaultCwd: '/app',
  defaultEnv: { NODE_ENV: 'production' },
  throwOnNonZeroExit: true,
  defaultShell: '/bin/bash',
  defaultEncoding: 'utf8',
  
  // Adapter configuration
  defaultAdapter: 'local',
  adapters: {
    local: new LocalAdapter(),
    ssh: new SSHAdapter({ /* config */ }),
    docker: new DockerAdapter({ /* config */ })
  },
  
  // Global hooks
  onBeforeExecute: async (cmd) => {
    console.log(`Executing: ${cmd.command}`);
  },
  onAfterExecute: async (cmd, result) => {
    console.log(`Completed: ${cmd.command} (${result.exitCode})`);
  },
  
  // Stream configuration
  streamOptions: {
    lineMode: true,
    encoding: 'utf8'
  },
  
  // Retry defaults
  defaultRetry: {
    attempts: 3,
    delay: 1000,
    backoff: 'exponential'
  }
});
```

### 2. Adapters

Adapters handle the actual command execution in different environments:

- **LocalAdapter** - Executes commands on the local machine
- **SSHAdapter** - Executes commands on remote servers via SSH
- **DockerAdapter** - Executes commands inside Docker containers
- **KubernetesAdapter** - Executes commands inside Kubernetes pods
- **RemoteDockerAdapter** - Executes Docker commands through SSH
- **MockAdapter** - For testing, returns predefined responses
- **RetryAdapter** - Wrapper that adds retry logic to any adapter

### 3. Command Object

Every command execution is defined by a Command object:

```typescript
interface Command {
  // Basic command properties
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  
  // Execution options
  timeout?: number;
  timeoutSignal?: string; // Signal to send on timeout (default: SIGTERM)
  shell?: boolean | string;
  encoding?: BufferEncoding;
  uid?: number; // User ID (Unix)
  gid?: number; // Group ID (Unix)
  
  // Adapter selection
  adapter?: string;
  
  // Advanced features
  retry?: RetryOptions;
  progress?: ProgressOptions;
  
  // Stream handling
  stdin?: string | Buffer | Readable;
  stdout?: 'pipe' | 'inherit' | 'ignore';
  stderr?: 'pipe' | 'inherit' | 'ignore';
  
  // Execution hooks
  onBeforeExecute?: (cmd: Command) => Promise<void>;
  onAfterExecute?: (cmd: Command, result: ExecutionResult) => Promise<void>;
  
  // Error handling
  throwOnNonZeroExit?: boolean;
  ignoreErrors?: boolean;
}
```

## API Reference

### Basic Execution

#### Template Literal Syntax

```typescript
// Simple command
await $`echo "Hello"`;

// With variables (automatically escaped)
const name = "John Doe";
await $`echo "Hello, ${name}"`;

// Multi-line commands
await $`
  cd /tmp
  echo "Current directory: $(pwd)"
  ls -la
`;
```

#### Direct Execution Methods

```typescript
// Execute with command object
await $.execute({
  command: 'npm',
  args: ['install', '--production'],
  cwd: '/app',
  env: { NODE_ENV: 'production' }
});

// Shell command string
await exec('npm install --production');

// Spawn without shell
await spawn('npm', ['install', '--production']);
```

### Configuration

#### Method Chaining

All configuration methods return a new engine instance, allowing for safe chaining:

```typescript
const $custom = $
  .cd('/app')                           // Change working directory
  .env({ API_KEY: 'secret' })          // Set environment variables
  .timeout(30000)                       // Set timeout (30 seconds)
  .shell('/bin/bash')                   // Use specific shell
  .with({ encoding: 'utf8' });          // Additional options
```

#### Environment Variables

```typescript
// Add to existing environment
const $withEnv = $.env({ API_KEY: 'secret' });

// Replace entire environment
const $cleanEnv = $.with({ 
  env: { PATH: '/usr/bin', HOME: '/home/user' } 
});

// Access current environment
const result = await $`echo $HOME`;
```

#### Working Directory

```typescript
// Change directory
const $inApp = $.cd('/app');

// Relative paths are resolved
const $inSrc = $inApp.cd('src'); // Now in /app/src

// Get current directory
const pwd = await $`pwd`;
```

### Adapters

#### Local Execution (Default)

```typescript
const $ = createExecutionEngine();
// or explicitly
const $local = $.local();

await $local`ls -la`;
```

#### SSH Execution

```typescript
// Basic SSH connection
const $ssh = $.ssh({
  host: 'example.com',
  username: 'deploy',
  password: 'secret' // or use privateKey
});

// With SSH key
const $sshKey = $.ssh({
  host: 'example.com',
  username: 'deploy',
  privateKey: '/path/to/key',
  passphrase: 'key-passphrase'
});

// Advanced SSH options
const $sshAdvanced = $.ssh({
  host: 'example.com',
  port: 2222,
  username: 'deploy',
  privateKey: '/path/to/key',
  keepaliveInterval: 30000,
  readyTimeout: 20000,
  strictHostKeyChecking: false
});

// Execute commands
await $ssh`cd /app && git pull`;
await $ssh`systemctl restart nginx`;
```

#### Docker Execution

```typescript
// Execute in running container
const $docker = $.docker({
  container: 'webapp',
  workdir: '/app'
});

// Execute in new container from image
const $dockerImage = $.docker({
  image: 'node:18-alpine',
  workdir: '/app',
  rm: true, // Remove container after execution
  volumes: ['/local/path:/container/path']
});

// With environment variables
const $dockerEnv = $.docker({
  container: 'webapp',
  env: { NODE_ENV: 'production' }
});

await $docker`npm run migrate`;
await $dockerImage`npm install && npm test`;
```

#### Kubernetes Execution

```typescript
// Execute in Kubernetes pod
const $k8s = $.kubernetes({
  pod: 'webapp-abc123',
  namespace: 'production',
  container: 'main' // Optional, defaults to first container
});

// Execute in new pod from image
const $k8sJob = $.kubernetes({
  image: 'busybox:latest',
  namespace: 'default',
  name: 'job-runner',
  command: ['/bin/sh', '-c']
});

// With kubeconfig
const $k8sCustom = $.kubernetes({
  pod: 'webapp',
  kubeconfig: '/path/to/kubeconfig',
  context: 'production-cluster'
});

await $k8s`npm run migrate`;
await $k8sJob`echo "Running in Kubernetes"`;
```

#### Remote Docker Execution

Execute Docker commands on remote hosts via SSH:

```typescript
// Docker through SSH
const $remoteDocker = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'deploy',
    privateKey: '~/.ssh/id_rsa'
  },
  docker: {
    container: 'webapp',
    workdir: '/app'
  }
});

// Execute in remote container
await $remoteDocker`npm run build`;

// Run new container on remote host
const $remoteNew = $.remoteDocker({
  ssh: { host: 'remote.example.com', username: 'admin' },
  docker: {
    image: 'node:18',
    rm: true,
    volumes: ['/remote/data:/data']
  }
});

await $remoteNew`node process-data.js`;
```

#### Mock Adapter (Testing)

```typescript
import { createExecutionEngine, MockAdapter } from '@xec/ush';

const $ = createExecutionEngine();
const mock = new MockAdapter();
$.registerAdapter('mock', mock);

// Setup mocks
mock.mockSuccess('git status', 'On branch main');
mock.mockFailure('npm test', 'Tests failed!', 1);
mock.mockCommand(/docker.*/, { 
  stdout: 'Container running', 
  exitCode: 0 
});

// Use mock adapter
const $mock = $.with({ adapter: 'mock' });
const result = await $mock`git status`;

// Assertions
mock.assertCommandExecuted('git status');
mock.assertCommandExecutedTimes('git status', 1);
mock.assertCommandsExecutedInOrder(['git pull', 'npm install']);
const commands = mock.getExecutedCommands();
const count = mock.getCommandExecutionCount('git status');

// Mock default response for unmatched commands
mock.mockDefault({ stdout: 'default output', exitCode: 0 });

// Mock timeout
mock.mockTimeout('slow-command', 5000);

// Clear history
mock.clear();
```

### Enhanced Features

#### Retry with Exponential Backoff

```typescript
import { retry, expBackoff } from '@xec/ush';

// Simple retry
const result = await retry(
  () => $`flaky-command`,
  { attempts: 3, delay: 1000 }
);

// With exponential backoff
const $withRetry = $.withRetry({
  attempts: 5,
  delay: expBackoff(5, 0.1, 2, 100), // max, jitter, factor, initial
  onRetry: (error, attempt) => {
    console.log(`Retry ${attempt}: ${error.message}`);
  },
  shouldRetry: (error) => error.exitCode !== 2,
  retryOn: [1, 124] // Only retry on specific exit codes
});

await $withRetry`unstable-service --start`;
```

#### Context Management (within)

Execute commands within a specific context:

```typescript
import { within, withinSync } from '@xec/ush';

// Async context
await within({ env: { API_KEY: 'secret' } }, async () => {
  await $`deploy-app`; // API_KEY available here
});

// Multiple context options
await within({
  cwd: '/tmp/build',
  env: { NODE_ENV: 'production' },
  timeout: 60000
}, async () => {
  await $`npm install`;
  await $`npm run build`;
});

// Sync context (for sync operations)
const result = withinSync({ cwd: '/tmp' }, () => {
  return 'executed in /tmp';
});
```

#### Pipe Operations

Chain commands with Unix-style pipes:

```typescript
import { pipe } from '@xec/ush';

// Simple pipe
const result = await pipe(
  ['cat data.json', 'jq .users', 'grep admin'],
  $
);

// Pipe with ProcessPromise
const users = await $`cat users.csv`
  .pipe('cut -d, -f2')  // Extract second column
  .pipe('sort')         // Sort names
  .pipe('uniq -c');     // Count occurrences

// Get output in different formats
const text = await users.text();
const lines = await users.lines();
const json = await $`cat data.json`.json();
const buffer = await $`cat image.png`.buffer();
```

#### Parallel Execution

Execute multiple commands concurrently:

```typescript
import { parallel } from '@xec/ush';

// Execute all in parallel
const results = await $.parallel.all([
  'npm test',
  'npm run lint',
  'npm run type-check'
]);

// With options
const results = await parallel(
  servers.map(s => `deploy --server ${s}`),
  $,
  { 
    maxConcurrency: 3, 
    stopOnError: false,
    timeout: 30000
  }
);

// Parallel methods
await $.parallel.map(files, f => `process ${f}`, { maxConcurrency: 2 });
await $.parallel.filter(urls, url => `curl -f ${url}`);
await $.parallel.race(['server1', 'server2'].map(s => `ping ${s}`));
await $.parallel.some(tests, test => `${test} --quick`);
await $.parallel.every(services, s => `systemctl is-active ${s}`);
```

#### Command Templates

Create reusable command patterns:

```typescript
import { CommandTemplate } from '@xec/ush';

// Create template
const deployTemplate = $.templates.create(
  'kubectl apply -f {{file}} -n {{namespace}}',
  {
    defaults: { namespace: 'default' },
    validate: (params) => {
      if (!params.file.endsWith('.yaml')) {
        throw new Error('File must be YAML');
      }
    },
    transform: (result) => {
      // Parse deployment name from output
      const match = result.stdout.match(/(\w+) created/);
      return match ? match[1] : null;
    }
  }
);

// Use template
const deploymentName = await deployTemplate.execute($, {
  file: 'app.yaml',
  namespace: 'production'
});

// Register global template
$.templates.register('build', 'docker build -t {{tag}} {{context}}', {
  defaults: { context: '.' }
});

// Use registered template
await $.templates.get('build').execute($, { tag: 'myapp:latest' });

// List all templates
const templates = $.templates.list();

// Remove template
$.templates.unregister('build');
```

#### Additional Execution Methods

```typescript
// Execute with direct ProcessPromise
const promise = $`long-running-command`;
promise.stdin.write('input data\n');
promise.stdin.end();
const result = await promise;

// Execute and get specific output format
const text = await $`cat file.txt`.text(); // Trimmed string
const lines = await $`ls -la`.lines(); // Array of lines
const json = await $`cat data.json`.json(); // Parsed JSON
const buffer = await $`cat binary.dat`.buffer(); // Raw Buffer

// Check command existence
const hasGit = await $.which('git'); // Returns path or null
const hasTools = await $.which(['git', 'npm', 'node']); // Check multiple

// Execute with ProcessPromise methods
const proc = $`tail -f /var/log/app.log`;
proc.quiet(); // Suppress output
proc.verbose(); // Enable verbose output
proc.kill('SIGTERM'); // Send signal
proc.stdin.write('data'); // Write to stdin

// Nohup execution (continues after parent exits)
await $.nohup('long-running-service');
```

#### Streaming Execution

Handle long-running commands with real-time output:

```typescript
import { stream } from '@xec/ush';

// Create stream
const logStream = stream($, 'tail -f /var/log/app.log', {
  lineMode: true,
  timeout: 0 // No timeout for continuous streams
});

// Handle events
logStream.on('line', (line, type) => {
  console.log(`[${type}] ${line}`);
});

logStream.on('error', (error) => {
  console.error('Stream error:', error);
});

logStream.on('exit', (code) => {
  console.log(`Process exited with code ${code}`);
});

// Start streaming
await logStream.start();

// Stop after some time
setTimeout(() => logStream.kill(), 10000);

// Wait for completion
await logStream.wait();

// Use async iterator
const logs = stream($, 'docker logs -f container', { lineMode: true });
await logs.start();

for await (const { line, stream } of logs.lines()) {
  if (line.includes('ERROR')) {
    logs.kill();
    break;
  }
}

// Stream utilities
import { StreamCollector, LineTransform, ProgressTracker } from '@xec/ush';

// Collect stream data with size limit
const collector = new StreamCollector({ maxSize: 1024 * 1024 }); // 1MB limit
process.stdout.pipe(collector);
const collected = await collector.collect();

// Transform stream to lines
const lineTransform = new LineTransform();
readStream
  .pipe(lineTransform)
  .on('line', (line) => console.log(`Line: ${line}`));

// Track stream progress
const tracker = new ProgressTracker(fileSize);
readStream
  .pipe(tracker)
  .on('progress', (bytes) => console.log(`${bytes} bytes processed`));
```

#### Temporary Files & Directories

Safely work with temporary files:

```typescript
import { withTempFile, withTempDir, TempFile, TempDir } from '@xec/ush';

// Temporary file (auto-cleanup)
await withTempFile(async (filepath) => {
  await $`echo "temp data" > ${filepath}`;
  const content = await $`cat ${filepath}`;
  // File deleted after this block
});

// With options
await withTempFile(async (filepath) => {
  // Custom prefix/suffix
}, { prefix: 'data-', suffix: '.json' });

// Temporary directory
await withTempDir(async (dirpath) => {
  await $`cd ${dirpath} && git clone repo.git`;
  // Directory and contents deleted after this block
});

// Manual control
const temp = new TempFile({ prefix: 'upload-' });
await temp.create();
await temp.write('content');
await temp.append('\nmore content');
const content = await temp.read();
await temp.cleanup(); // Manual cleanup
```

#### Interactive Input

Build interactive CLI tools:

```typescript
import { question, confirm, select, Spinner } from '@xec/ush';

// Text input
const name = await question('What is your name?');
const age = await question('Your age?', { 
  defaultValue: '18',
  validate: (input) => {
    const num = parseInt(input);
    if (isNaN(num) || num < 0) {
      return 'Please enter a valid age';
    }
    return true;
  }
});

// Confirmation
const proceed = await confirm('Deploy to production?', false);

// Selection
const env = await select('Choose environment:', [
  'development',
  'staging', 
  'production'
]);

// Password input (hidden)
const password = await question('Password:', { hidden: true });

// Progress spinner
const spinner = new Spinner('Building application...');
spinner.start();
await $`npm run build`;
spinner.stop('Build completed!');

// Or use withSpinner helper
await withSpinner('Deploying...', async () => {
  await $`deploy-app`;
});
```

#### Command Pipelines

Build complex command pipelines with operators:

```typescript
import { Pipeline } from '@xec/ush';

// Create pipeline
const pipeline = new Pipeline($);

// Add stages
pipeline
  .add('git pull')
  .add('npm install')
  .add('npm test', { continueOnError: true })
  .add('npm run build');

// Execute pipeline
const results = await pipeline.execute();

// Use operators
const dataProcessing = new Pipeline($)
  .add('cat data.json')
  .pipe(async (result) => {
    const data = JSON.parse(result.stdout);
    return data.filter(item => item.active);
  })
  .tee(async (data) => {
    console.log(`Processing ${data.length} items`);
  })
  .conditional(
    (data) => data.length > 0,
    new Pipeline($).add('process-data'),
    new Pipeline($).add('echo "No data to process"')
  );

// Parallel stages
const deployment = new Pipeline($)
  .add('npm run build')
  .parallel([
    'deploy-to-server1',
    'deploy-to-server2',
    'deploy-to-server3'
  ])
  .add('notify-completion');

await deployment.execute();
```

#### Audit Logging

Track and audit all command executions:

```typescript
import { getAuditLogger, AuditLogger } from '@xec/ush';

// Get global audit logger
const audit = getAuditLogger();

// Configure audit logging
audit.configure({
  enabled: true,
  logFile: '/var/log/commands.audit',
  includeEnv: true,
  includeOutput: true,
  maxEntries: 10000,
  rotateOnSize: '10MB'
});

// Create custom audit logger
const customAudit = new AuditLogger({
  logFile: './deployment.audit',
  format: 'json', // or 'text'
  filter: (entry) => entry.command.includes('deploy')
});

// Query audit log
const entries = await audit.query({
  startTime: new Date('2024-01-01'),
  endTime: new Date(),
  command: /git.*/,
  exitCode: 0,
  adapter: 'ssh'
});

// Export audit log
await audit.export('./audit-export.json', {
  format: 'json',
  compress: true
});

// Clear old entries
await audit.rotate({ maxAge: '30d' });
```

#### Secure Password Handling

Safely handle passwords and sensitive data:

```typescript
import { SecurePasswordHandler } from '@xec/ush';

// Create secure handler
const handler = new SecurePasswordHandler();

// Generate secure password
const password = handler.generatePassword({
  length: 16,
  includeUppercase: true,
  includeLowercase: true,
  includeNumbers: true,
  includeSymbols: true,
  excludeSimilar: true // Exclude similar chars like 0/O, 1/l
});

// Validate password strength
const validation = handler.validatePassword(password, {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  maxRepeating: 2,
  commonPasswords: ['password', '123456'] // Check against common passwords
});

// Create askpass script for sudo
const askpass = await handler.createAskpass('mypassword');
const $sudo = $.env({ SUDO_ASKPASS: askpass.path });

try {
  await $sudo`sudo -A apt-get update`;
} finally {
  // Cleanup askpass script
  await askpass.cleanup();
}

// Mask passwords in logs
const maskedCommand = handler.maskCommand(
  'mysql -u root -pSecretPass123 mydb',
  ['SecretPass123']
);
console.log(maskedCommand); // "mysql -u root -p**** mydb"

// Secure environment variables
const secureEnv = handler.secureEnv({
  API_KEY: 'secret-key',
  PASSWORD: 'secret-pass'
}, ['PASSWORD']); // Returns env with PASSWORD value masked
```

#### Progress Tracking

Advanced progress tracking for long operations:

```typescript
import { ProgressTracker } from '@xec/ush';

// Create progress tracker
const tracker = new ProgressTracker({
  total: 100,
  format: 'bar', // 'bar', 'percentage', 'custom'
  width: 40,
  onProgress: (progress) => {
    console.log(`${progress.percent}% complete`);
  }
});

// Track command with progress
const $withProgress = $.with({
  progress: {
    enabled: true,
    onProgress: (event) => {
      tracker.update(event.current);
    }
  }
});

// Use with file operations
await $.transfer.copy('./large-file', '/backup/large-file', {
  onProgress: (progress) => {
    tracker.update(progress.transferredBytes, progress.totalBytes);
  }
});

// Manual progress updates
tracker.start('Processing files...');
for (const file of files) {
  await processFile(file);
  tracker.increment();
}
tracker.complete('All files processed!');
```

#### Retry Adapter

Wrap any adapter with retry capabilities:

```typescript
import { createRetryableAdapter, RetryAdapter } from '@xec/ush';

// Create retryable SSH adapter
const sshAdapter = new SSHAdapter({ host: 'server.com', username: 'user' });
const retryableSSH = createRetryableAdapter(sshAdapter, {
  attempts: 3,
  delay: 1000,
  backoff: 'exponential',
  maxDelay: 30000,
  shouldRetry: (error) => {
    // Retry on network errors
    return error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
  }
});

// Register and use
$.registerAdapter('retry-ssh', retryableSSH);
const $retrySsh = $.with({ adapter: 'retry-ssh' });

// Or use RetryAdapter directly
const retryAdapter = new RetryAdapter(sshAdapter, {
  attempts: 5,
  onRetry: (error, attempt) => {
    console.log(`Retry attempt ${attempt}: ${error.message}`);
  }
});
```

## Examples

### Basic Script

```typescript
#!/usr/bin/env node
import { $ } from '@xec/ush';

// Simple deployment script
await $`git pull`;
await $`npm install`;
await $`npm run build`;
await $`pm2 restart app`;
```

### Multi-Environment Deployment

```typescript
import { $, createExecutionEngine } from '@xec/ush';

// Deploy to multiple servers
const servers = [
  { host: 'web1.example.com', role: 'web' },
  { host: 'web2.example.com', role: 'web' },
  { host: 'db1.example.com', role: 'db' }
];

// Deploy in parallel with max 2 concurrent
await $.parallel.map(
  servers,
  async (server) => {
    const $remote = $.ssh({
      host: server.host,
      username: 'deploy'
    });
    
    if (server.role === 'web') {
      await $remote`cd /app && git pull && npm install && pm2 restart web`;
    } else {
      await $remote`cd /db && ./migrate.sh`;
    }
  },
  { maxConcurrency: 2 }
);
```

### CI/CD Pipeline

```typescript
import { $, withSpinner, confirm } from '@xec/ush';

// Configure for CI
const $ci = $.env({ CI: 'true' }).withRetry({ attempts: 2 });

try {
  // Run tests
  await withSpinner('Running tests...', async () => {
    const results = await $ci.parallel.all([
      'npm run test:unit',
      'npm run test:integration',
      'npm run lint'
    ]);
    
    if (results.failed.length > 0) {
      throw new Error('Tests failed');
    }
  });
  
  // Build
  await withSpinner('Building application...', () => 
    $ci`npm run build`
  );
  
  // Deploy
  if (await confirm('Deploy to production?')) {
    await $ci`npm run deploy`;
  }
} catch (error) {
  console.error('Pipeline failed:', error);
  process.exit(1);
}
```

### Docker Compose Operations

```typescript
import { $ } from '@xec/ush';

// Docker compose helper
const compose = $.templates.create(
  'docker-compose -f {{file}} {{command}}',
  { defaults: { file: 'docker-compose.yml' } }
);

// Start services
await compose.execute($, { command: 'up -d' });

// Check status
const status = await $`docker-compose ps`;
console.log(status.stdout);

// Run migrations in container
const $app = $.docker({ container: 'myapp_web_1' });
await $app`python manage.py migrate`;

// Cleanup
await compose.execute($, { command: 'down -v' });
```

### Advanced SSH with Tunneling

```typescript
import { $ } from '@xec/ush';

// Jump through bastion host
const $prod = $.ssh({
  host: 'prod-server',
  username: 'admin',
  privateKey: '~/.ssh/id_rsa',
  // SSH ProxyCommand equivalent
  proxy: {
    host: 'bastion.example.com',
    username: 'jump'
  }
});

// Execute on production through bastion
await $prod`systemctl status myapp`;

// Copy files through SSH
await $`scp -r ./dist/ ${$prod.config.username}@${$prod.config.host}:/app/`;
```

### File Transfer Between Environments

The transfer engine provides a unified API for copying and moving files between different environments (local, SSH, Docker).

```typescript
// Local to local
await $.transfer.copy('./source.txt', './dest.txt');
await $.transfer.move('./old.txt', './new.txt');

// Local to SSH
await $.transfer.copy('./deploy.zip', 'ssh://user@host/app/deploy.zip', {
  compress: true,
  onProgress: (p) => console.log(`${p.completedFiles}/${p.totalFiles}`)
});

// SSH to local
await $.transfer.copy('ssh://user@host/logs/app.log', './logs/app.log');

// Docker transfers
await $.transfer.copy('docker://mycontainer:/app/config.json', './config.json');
await $.transfer.copy('./data.csv', 'docker://mycontainer:/data/input.csv');

// Cross-environment transfers
await $.transfer.copy('ssh://user1@host1/file', 'ssh://user2@host2/file');
await $.transfer.copy('docker://container1:/data', 'ssh://user@host/backup', {
  recursive: true
});

// Directory sync (like rsync)
await $.transfer.sync('./src', 'ssh://user@host/app/src', {
  recursive: true,
  exclude: ['*.tmp', 'node_modules'],
  deleteExtra: true,
  compress: true
});

// Advanced options
await $.transfer.copy('./large-dir', '/backup/large-dir', {
  recursive: true,
  preserveMode: true,
  preserveTimestamps: true,
  exclude: ['*.log', '*.tmp'],
  concurrent: 4,
  onProgress: (progress) => {
    console.log(`Progress: ${progress.transferredBytes}/${progress.totalBytes} bytes`);
    console.log(`Speed: ${progress.speed} bytes/sec`);
  }
});
```

### Testing with Mocks

```typescript
import { createExecutionEngine, MockAdapter } from '@xec/ush';
import { test, expect } from '@jest/globals';

test('deployment script', async () => {
  const $ = createExecutionEngine();
  const mock = new MockAdapter();
  $.registerAdapter('mock', mock);
  
  // Setup mocks
  mock.mockSuccess('git pull', 'Already up to date.');
  mock.mockSuccess('npm install', 'added 150 packages');
  mock.mockSuccess('npm run build', 'Build successful');
  mock.mockSuccess('pm2 restart app', 'Process restarted');
  
  // Run deployment with mock
  const $mock = $.with({ adapter: 'mock' });
  
  await $mock`git pull`;
  await $mock`npm install`;
  await $mock`npm run build`;
  await $mock`pm2 restart app`;
  
  // Verify all commands were executed
  expect(mock.getExecutedCommands()).toEqual([
    'git pull',
    'npm install', 
    'npm run build',
    'pm2 restart app'
  ]);
});
```

### Kubernetes Operations

```typescript
import { $ } from '@xec/ush';

// Deploy to Kubernetes
const $k8s = $.kubernetes({
  namespace: 'production',
  kubeconfig: process.env.KUBECONFIG
});

// Scale deployment
await $k8s`kubectl scale deployment webapp --replicas=3`;

// Execute database migration in pod
const migrationPod = await $k8s`kubectl get pods -l app=webapp -o jsonpath='{.items[0].metadata.name}'`;
const $pod = $.kubernetes({
  pod: migrationPod.stdout.trim(),
  namespace: 'production',
  container: 'webapp'
});

await $pod`python manage.py migrate`;

// Run job
const $job = $.kubernetes({
  image: 'myapp:latest',
  name: 'data-processor',
  namespace: 'jobs',
  env: { PROCESS_DATE: new Date().toISOString() }
});

await $job`python process_daily_data.py`;
```

### Pipeline with Error Handling

```typescript
import { Pipeline } from '@xec/ush';

// Complex deployment pipeline
const deployPipeline = new Pipeline($)
  .add('git pull', { 
    name: 'update-code',
    onError: async (error) => {
      console.error('Failed to pull:', error);
      // Try to reset and pull again
      await $`git reset --hard && git pull`;
    }
  })
  .add('npm ci', { name: 'install-deps' })
  .conditional(
    async () => {
      const tests = await $`npm test -- --listTests`;
      return tests.stdout.includes('.test.');
    },
    new Pipeline($).add('npm test', { name: 'run-tests' }),
    new Pipeline($).add('echo "No tests found"')
  )
  .add('npm run build', { name: 'build' })
  .parallel([
    { command: 'npm run lint', name: 'lint' },
    { command: 'npm run type-check', name: 'type-check' }
  ], { maxConcurrency: 2 })
  .add(async (prevResults) => {
    // Custom stage with access to previous results
    const buildOutput = prevResults.get('build');
    if (buildOutput?.stdout.includes('warning')) {
      console.warn('Build completed with warnings');
    }
    return $`npm run deploy`;
  }, { name: 'deploy' });

// Execute with progress tracking
const results = await deployPipeline.execute({
  onProgress: (stage) => {
    console.log(`Executing: ${stage.name}`);
  }
});

// Check results
if (results.failed.length > 0) {
  console.error('Pipeline failed:', results.failed);
  process.exit(1);
}
```

### Secure Remote Operations

```typescript
import { $, SecurePasswordHandler } from '@xec/ush';

// Setup secure password handling
const passwordHandler = new SecurePasswordHandler();
const sudoPassword = process.env.SUDO_PASS;

// Create askpass for sudo operations
const askpass = await passwordHandler.createAskpass(sudoPassword);

// Configure SSH with sudo
const $remote = $.ssh({
  host: 'secure-server.com',
  username: 'admin',
  privateKey: '~/.ssh/id_rsa'
}).env({ SUDO_ASKPASS: askpass.path });

try {
  // Secure system update
  await $remote`sudo -A apt-get update`;
  await $remote`sudo -A apt-get upgrade -y`;
  
  // Deploy with masked passwords
  const dbPassword = 'SuperSecret123!';
  const maskedCmd = passwordHandler.maskCommand(
    `docker run -e DB_PASS=${dbPassword} myapp`,
    [dbPassword]
  );
  
  console.log('Executing:', maskedCmd); // Password will be masked
  await $remote`docker run -e DB_PASS=${dbPassword} myapp`;
  
} finally {
  // Always cleanup askpass
  await askpass.cleanup();
}
```

### Audited Operations

```typescript
import { $, getAuditLogger } from '@xec/ush';

// Configure audit logging
const audit = getAuditLogger();
audit.configure({
  enabled: true,
  logFile: './deployment.audit',
  includeOutput: true
});

// Create audited execution engine
const $audited = $.with({
  onBeforeExecute: async (cmd) => {
    console.log(`Executing: ${cmd.command}`);
  },
  onAfterExecute: async (cmd, result) => {
    if (result.exitCode !== 0) {
      console.error(`Command failed: ${cmd.command}`);
    }
  }
});

// Perform deployment
const deployment = new Date().toISOString();
await $audited.env({ DEPLOYMENT_ID: deployment })`git tag -a v${deployment} -m "Deployment ${deployment}"`;
await $audited`git push --tags`;
await $audited`docker build -t myapp:${deployment} .`;
await $audited`docker push myapp:${deployment}`;

// Query audit log
const deploymentAudit = await audit.query({
  env: { DEPLOYMENT_ID: deployment }
});

console.log(`Deployment ${deployment} executed ${deploymentAudit.length} commands`);
```

### Remote Docker Pipeline

```typescript
import { $ } from '@xec/ush';

// Setup remote Docker hosts
const dockerHosts = [
  { name: 'docker1', host: 'docker1.example.com' },
  { name: 'docker2', host: 'docker2.example.com' },
  { name: 'docker3', host: 'docker3.example.com' }
];

// Deploy to all Docker hosts
await $.parallel.map(
  dockerHosts,
  async (dockerHost) => {
    const $remote = $.remoteDocker({
      ssh: {
        host: dockerHost.host,
        username: 'deploy',
        privateKey: '~/.ssh/deploy_key'
      },
      docker: { rm: true }
    });
    
    // Pull latest image
    await $remote`docker pull myapp:latest`;
    
    // Stop old container
    await $remote`docker stop myapp || true`;
    await $remote`docker rm myapp || true`;
    
    // Start new container
    await $remote`docker run -d --name myapp -p 80:80 myapp:latest`;
    
    // Health check
    const $health = $.ssh({
      host: dockerHost.host,
      username: 'deploy',
      privateKey: '~/.ssh/deploy_key'
    });
    
    await retry(
      () => $health`curl -f http://localhost/health`,
      { attempts: 5, delay: 2000 }
    );
    
    console.log(`✓ ${dockerHost.name} deployed successfully`);
  },
  { maxConcurrency: 2 }
);
```

## Migration from zx

If you're migrating from Google's zx, here's what you need to know:

### Similarities

- Template literal syntax works the same
- Basic commands work identically
- Environment and directory methods similar

### Differences

```typescript
// zx
import { $ } from 'zx';
$.verbose = false;
$.shell = '/bin/bash';

// ush - configuration is immutable
import { $ } from '@xec/ush';
const $quiet = $.with({ verbose: false }).shell('/bin/bash');
```

### New Features in ush

1. **Multiple Adapters** - Execute anywhere (SSH, Docker)
2. **Retry Logic** - Built-in retry with backoff
3. **Better Testing** - MockAdapter for unit tests
4. **Parallel Execution** - First-class parallel support
5. **Templates** - Reusable command patterns
6. **Connection Pooling** - Efficient SSH connections

### Migration Example

```typescript
// zx
import { $, cd, question } from 'zx';

cd('/app');
const name = await question('Name? ');
await $`echo "Hello, ${name}"`;

// ush
import { $, question } from '@xec/ush';

const $app = $.cd('/app');
const name = await question('Name? ');
await $app`echo "Hello, ${name}"`;
```

## FAQ

### How do I handle errors?

```typescript
// Option 1: Try-catch (default behavior)
try {
  await $`exit 1`;
} catch (error) {
  console.error('Command failed:', error.exitCode);
}

// Option 2: Disable throwing
const $noThrow = $.with({ throwOnNonZeroExit: false });
const result = await $noThrow`exit 1`;
if (result.exitCode !== 0) {
  console.error('Failed with code:', result.exitCode);
}
```

### How do I capture output?

```typescript
// Get stdout as string
const output = await $`echo "hello"`;
console.log(output.stdout); // "hello\n"

// Get specific formats
const text = await $`cat file.txt`.text(); // trimmed string
const lines = await $`ls`.lines(); // array of lines
const json = await $`cat data.json`.json(); // parsed JSON
const buffer = await $`cat binary`.buffer(); // Buffer
```

### How do I pass environment variables?

```typescript
// To child process
const $withEnv = $.env({ API_KEY: 'secret' });
await $withEnv`echo $API_KEY`;

// From parent process
await $`echo $HOME`; // inherits from parent

// Clean environment
const $clean = $.with({ env: { PATH: '/usr/bin' } });
```

### How do I run commands in parallel?

```typescript
// Simple parallel
const results = await Promise.all([
  $`test1`,
  $`test2`,
  $`test3`
]);

// With concurrency control
await $.parallel.map(items, item => `process ${item}`, {
  maxConcurrency: 5
});
```

### How do I test my scripts?

```typescript
// Use MockAdapter
const mock = new MockAdapter();
mock.mockSuccess('deploy', 'Deployed successfully');

// Your tests verify commands were called correctly
mock.assertCommandExecuted('deploy');
```

### Can I use with TypeScript?

Yes! ush is written in TypeScript and provides full type definitions:

```typescript
import { $, ExecutionResult, CallableExecutionEngine } from '@xec/ush';

const result: ExecutionResult = await $`echo "typed"`;
const engine: CallableExecutionEngine = $.cd('/app');
```

### How do I stream output in real-time?

```typescript
// For simple cases, output is streamed by default to stdout/stderr

// For custom handling
const stream = $.stream('long-running-command');
stream.on('line', (line) => console.log(line));
await stream.start();
```

### Does it work with Bun?

Yes! ush automatically detects and uses Bun.spawn when available:

```bash
bun run script.ts
```

### How do I execute commands in Kubernetes?

Use the kubernetes adapter:

```typescript
const $k8s = $.kubernetes({
  pod: 'webapp-123',
  namespace: 'production',
  container: 'main'
});

await $k8s`npm run migrate`;
```

### How do I audit command executions?

Enable audit logging:

```typescript
import { getAuditLogger } from '@xec/ush';

const audit = getAuditLogger();
audit.configure({
  enabled: true,
  logFile: './commands.audit'
});
```

### How do I handle passwords securely?

Use SecurePasswordHandler:

```typescript
import { SecurePasswordHandler } from '@xec/ush';

const handler = new SecurePasswordHandler();
const askpass = await handler.createAskpass(password);
// Use askpass.path with sudo -A
```

### How do I create complex pipelines?

Use the Pipeline class:

```typescript
import { Pipeline } from '@xec/ush';

const pipeline = new Pipeline($)
  .add('build')
  .parallel(['test', 'lint'])
  .add('deploy');

await pipeline.execute();
```

### Can I use Docker through SSH?

Yes, use remoteDocker:

```typescript
const $remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: { container: 'app' }
});
```

## Advanced Types & Interfaces

### Execution Engine Types

```typescript
import { 
  CallableExecutionEngine,
  ExecutionResult,
  Command,
  RetryOptions,
  ProgressOptions
} from '@xec/ush';

// Main execution engine interface
const engine: CallableExecutionEngine = $;

// Command configuration
const command: Command = {
  command: 'npm install',
  args: ['--production'],
  cwd: '/app',
  env: { NODE_ENV: 'production' },
  timeout: 60000,
  shell: true,
  adapter: 'ssh',
  retry: {
    attempts: 3,
    delay: 1000,
    backoff: 'exponential',
    retryOn: [1, 124] // Retry on specific exit codes
  },
  progress: {
    enabled: true,
    interval: 100,
    onProgress: (event) => console.log(event)
  }
};

// Execution result
const result: ExecutionResult = {
  stdout: 'output',
  stderr: '',
  exitCode: 0,
  signal: null,
  timedOut: false,
  killed: false,
  command: 'npm install',
  duration: 1234
};
```

### Audit Types

```typescript
import { AuditEntry, AuditLoggerConfig } from '@xec/ush';

// Audit entry structure
const entry: AuditEntry = {
  timestamp: new Date(),
  command: 'git pull',
  adapter: 'ssh',
  cwd: '/app',
  env: { USER: 'deploy' },
  exitCode: 0,
  stdout: 'Already up to date',
  stderr: '',
  duration: 500,
  user: process.env.USER,
  host: os.hostname()
};

// Audit logger configuration
const config: AuditLoggerConfig = {
  enabled: true,
  logFile: '/var/log/commands.audit',
  format: 'json',
  includeEnv: true,
  includeOutput: true,
  maxEntries: 10000,
  rotateOnSize: '10MB',
  filter: (entry) => !entry.command.includes('password')
};
```

### Progress Types

```typescript
import { ProgressEvent, ProgressOptions } from '@xec/ush';

// Progress event
const event: ProgressEvent = {
  type: 'transfer',
  current: 1024,
  total: 10240,
  percent: 10,
  speed: 1024, // bytes per second
  eta: 9, // seconds
  message: 'Transferring file...'
};

// Progress options
const options: ProgressOptions = {
  enabled: true,
  interval: 100, // ms
  format: 'bar',
  width: 40,
  onProgress: (event) => {
    console.log(`${event.percent}% - ${event.message}`);
  }
};
```

### Global Functions

```typescript
import { 
  getLocalContext, 
  withinSync,
  expBackoff,
  shellEscape,
  parseCommand
} from '@xec/ush';

// Get current execution context
const context = getLocalContext();
console.log(context.cwd, context.env);

// Synchronous context execution
const result = withinSync({ cwd: '/tmp' }, () => {
  // Executes with modified context
  return fs.readdirSync('.');
});

// Exponential backoff generator
const backoff = expBackoff(
  5,    // max attempts
  0.1,  // jitter factor
  2,    // backoff factor
  100   // initial delay ms
);

// Shell escape utilities
const escaped = shellEscape(['rm', '-rf', 'my file.txt']);
console.log(escaped); // "rm -rf 'my file.txt'"

// Parse command string into parts
const parsed = parseCommand('git commit -m "Initial commit"');
console.log(parsed); // { command: 'git', args: ['commit', '-m', 'Initial commit'] }
```

### Process Information

```typescript
import { ProcessInfo } from '@xec/ush';

// Process information interface
interface ProcessInfo {
  pid: number;
  ppid?: number;
  name: string;
  cmd: string;
  cpu?: number;
  memory?: number;
  startTime?: Date;
  user?: string;
  status?: 'running' | 'sleeping' | 'stopped' | 'zombie';
}

// Get process info (platform specific implementation)
const processes: ProcessInfo[] = await getProcessList();
const nodeProcesses = processes.filter(p => p.name.includes('node'));
```

### Error Types

```typescript
import { 
  ExecutionError, 
  RetryError,
  AdapterError,
  TimeoutError 
} from '@xec/ush';

// Execution error
try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof ExecutionError) {
    console.log(error.exitCode);
    console.log(error.stdout);
    console.log(error.stderr);
    console.log(error.command);
  }
}

// Retry error
try {
  await $withRetry`flaky-command`;
} catch (error) {
  if (error instanceof RetryError) {
    console.log(error.attempts);
    console.log(error.lastError);
    console.log(error.errors); // All errors from attempts
  }
}
```

## Development & Documentation

### Architecture & Design
- [CLAUDE.md](./CLAUDE.md) - Architectural decisions and design rationale
- [USH_IMPROVEMENT_PLAN.md](./USH_IMPROVEMENT_PLAN.md) - Comprehensive improvement roadmap
- [API_SIMPLIFICATION.md](./API_SIMPLIFICATION.md) - API simplification proposal
- [SECURITY_FIXES.md](./SECURITY_FIXES.md) - Critical security fixes needed
- [AUDIT_EXECUTIVE_SUMMARY.md](./AUDIT_EXECUTIVE_SUMMARY.md) - Executive summary of code audit

### Contributing
We welcome contributions! Please see our improvement plan for areas where help is needed.

### Security
If you discover a security vulnerability, please see [SECURITY_FIXES.md](./SECURITY_FIXES.md) for details on reporting.

## Best Practices

### Performance Tips

1. **Use connection pooling for SSH**: Reuse SSH connections when executing multiple commands
2. **Batch operations**: Use parallel execution for independent tasks
3. **Stream large outputs**: Use streaming API for commands with large outputs
4. **Cache compiled templates**: Reuse template instances for better performance

### Security Recommendations

1. **Never hardcode passwords**: Use environment variables or secure password handlers
2. **Validate inputs**: Always validate user inputs before using in commands
3. **Use shell escaping**: Use `shellEscape()` for dynamic command arguments
4. **Audit sensitive operations**: Enable audit logging for production environments
5. **Limit command timeout**: Set reasonable timeouts to prevent hanging processes

### Error Handling

1. **Use typed errors**: Check error types for specific handling
2. **Implement retry logic**: Use retry adapters for unreliable operations
3. **Log failures**: Combine with audit logging for debugging
4. **Graceful degradation**: Have fallback strategies for critical operations

### Testing

1. **Use MockAdapter**: Test scripts without executing real commands
2. **Test error scenarios**: Mock failures to test error handling
3. **Verify command order**: Use mock assertions for complex workflows
4. **Isolate adapters**: Test each adapter configuration separately

## License

MIT © DevGrid

---

Inspired by [Google's zx](https://github.com/google/zx).