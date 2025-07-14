# @xec/ush

Universal Execution Engine - A powerful and flexible command execution library for Node.js, inspired by Google's `zx` but designed to work seamlessly across all environments: local, SSH, and Docker containers.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [Basic Execution](#basic-execution)
  - [Configuration](#configuration)
  - [Adapters](#adapters)
  - [Enhanced Features](#enhanced-features)
- [Examples](#examples)
- [Migration from zx](#migration-from-zx)
- [FAQ](#faq)
- [License](#license)

## Features

- 🚀 **Unified API** - Single API for all execution environments
- 📝 **Template Literals** - Native support for template literals like zx
- 🔌 **Multiple Adapters** - Execute locally, via SSH, or in Docker containers
- 🧪 **Mock Adapter** - Built-in testing support
- ⚡ **Bun Support** - Native support for Bun.spawn execution
- 🔄 **SSH Connection Pooling** - Efficient SSH connection management
- 📊 **Stream Handling** - Real-time output streaming
- 🔒 **TypeScript Support** - Full TypeScript support with type safety
- 🔁 **Retry Logic** - Built-in retry with exponential backoff
- ⏸️ **Parallel Execution** - Run commands concurrently
- 📋 **Command Templates** - Reusable command patterns
- 🌊 **Pipe Operations** - Unix-style command piping
- 📁 **Temporary Files** - Safe temporary file/directory handling
- 💬 **Interactive Mode** - User prompts and confirmations
- 🎯 **Context Management** - Scoped execution environments

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
  defaultTimeout: 60000,
  defaultCwd: '/app',
  defaultEnv: { NODE_ENV: 'production' },
  throwOnNonZeroExit: true
});
```

### 2. Adapters

Adapters handle the actual command execution in different environments:

- **LocalAdapter** - Executes commands on the local machine
- **SSHAdapter** - Executes commands on remote servers via SSH
- **DockerAdapter** - Executes commands inside Docker containers
- **MockAdapter** - For testing, returns predefined responses

### 3. Command Object

Every command execution is defined by a Command object:

```typescript
interface Command {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean | string;
  adapter?: string;
  // ... more options
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
const commands = mock.getExecutedCommands();
mock.clear(); // Clear history
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

## License

MIT © DevGrid

---

Built with ❤️ by the Xec team. Inspired by [Google's zx](https://github.com/google/zx).