---
title: Universal Execution Engine
sidebar_label: Overview
description: Architecture and principles of Xec's universal command execution engine
---

# Universal Execution Engine

The Execution Engine (`ExecutionEngine`) is the core of the Xec system, providing unified command execution across diverse environments. It offers a universal API for working with local processes, SSH connections, Docker containers, and Kubernetes pods.

## Core Concepts

### Universal Execution

The engine abstracts environment-specific details, allowing the same code to work across different target systems:

```typescript
import { $ } from '@xec-sh/core';

// Local execution
await $`ls -la`;

// SSH execution
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`ls -la`;

// Docker execution
const container = $.docker({ container: 'my-app' });
await container`ls -la`;

// Kubernetes execution
const pod = $.k8s().pod('my-pod');
await pod`ls -la`;
```

### Engine Architecture

```
┌─────────────────────────────────────────┐
│           ExecutionEngine               │
├─────────────────────────────────────────┤
│  • Template literal API                 │
│  • Command building & escaping          │
│  • Configuration management             │
│  • Event emission                       │
└──────────────┬──────────────────────────┘
               │
        ┌──────▼──────┐
        │  Adapters   │
        └──────┬──────┘
               │
    ┌──────────┼──────────┬──────────┬──────────┐
    ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Local  │ │  SSH   │ │ Docker │ │  K8s   │ │ Remote │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

## Command Lifecycle

### 1. Command Building

Commands are built through template literals with automatic escaping:

```typescript
const file = "file with spaces.txt";
const dangerous = "'; rm -rf /";

// Safe escaping
await $`cat ${file}`;        // cat "file with spaces.txt"
await $`echo ${dangerous}`;  // echo "'; rm -rf /"
```

### 2. Context Configuration

Commands are enriched with execution context:

```typescript
// Global configuration
const $ = new ExecutionEngine({
  defaultTimeout: 30000,
  defaultCwd: '/app',
  defaultEnv: { NODE_ENV: 'production' }
});

// Local configuration
await $`npm start`
  .cwd('/projects/app')
  .env({ DEBUG: 'true' })
  .timeout(60000);
```

### 3. Adapter Selection

The engine automatically selects the appropriate adapter:

```typescript
// Explicit selection via method
const ssh = $.ssh({ host: 'server' });

// Automatic selection via options
await $.execute({
  command: 'ls',
  adapter: 'docker',
  adapterOptions: { container: 'app' }
});
```

### 4. Execution and Result Processing

```typescript
const result = await $`ls -la`;

// Result contains:
result.stdout;      // Standard output
result.stderr;      // Error output
result.exitCode;    // Exit code
result.duration;    // Execution time
result.startTime;   // Start time
result.endTime;     // End time
```

## ProcessPromise API

`ProcessPromise` is an extended Promise with additional methods for execution control:

### Stream Management

```typescript
// Output redirection
await $`ls -la`
  .stdout(process.stdout)
  .stderr(process.stderr);

// Interactive mode
await $`npm init`.interactive();

// Quiet mode (no output)
await $`npm install`.quiet();
```

### Error Handling

```typescript
// Don't throw on error
const result = await $`may-fail`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed:', result.stderr);
}

// Retry on failure
await $`flaky-command`.retry({
  maxRetries: 3,
  delay: 1000,
  exponentialBackoff: true
});
```

### Execution Control

```typescript
// Timeout
await $`long-running`.timeout(5000);

// Cancellation via AbortSignal
const controller = new AbortController();
const promise = $`sleep 100`.signal(controller.signal);
setTimeout(() => controller.abort(), 1000);

// Force termination
const proc = $`server`;
setTimeout(() => proc.kill(), 5000);
```

### Result Transformation

```typescript
// Get trimmed text
const text = await $`cat file.txt`.text();

// Parse JSON
const data = await $`cat config.json`.json();

// Array of lines
const lines = await $`ls`.lines();

// Buffer
const buffer = await $`cat binary.dat`.buffer();
```

## Piping

The engine supports Unix-like pipes:

```typescript
// Simple pipe
await $`cat file.txt`.pipe($`grep pattern`).pipe($`wc -l`);

// Pipe with processing
await $`ls -la`.pipe(async (output) => {
  const files = output.split('\n');
  return files.filter(f => f.includes('.txt'));
});

// Pipe to file
await $`generate-report`.pipe('report.txt');
```

## Parallel Execution

```typescript
// Execute multiple commands in parallel
const results = await $.parallel.all([
  $`test-unit`,
  $`test-integration`,
  $`test-e2e`
]);

// With concurrency limit
await $.batch(commands, {
  concurrency: 5,
  onProgress: (completed, total) => {
    console.log(`Progress: ${completed}/${total}`);
  }
});
```

## Events and Monitoring

The engine provides an event system for monitoring:

```typescript
const $ = new ExecutionEngine();

$.on('command:start', ({ command, cwd }) => {
  console.log(`Starting: ${command} in ${cwd}`);
});

$.on('command:complete', ({ command, exitCode, duration }) => {
  console.log(`Completed: ${command} (${exitCode}) in ${duration}ms`);
});

$.on('command:error', ({ command, error }) => {
  console.error(`Failed: ${command}`, error);
});
```

## Result Caching

```typescript
// Cache command results
const data = await $`expensive-operation`.cache({
  ttl: 60000,  // 1 minute
  key: 'operation-result'
});

// Subsequent calls return cached result
const cached = await $`expensive-operation`.cache({
  key: 'operation-result'
});
```

## Contextual Execution

```typescript
// Create context with settings
const context = $.with({
  cwd: '/app',
  env: { NODE_ENV: 'production' },
  timeout: 30000
});

// All commands in context inherit settings
await context`npm install`;
await context`npm build`;
await context`npm test`;

// Nested contexts
await $.within(async () => {
  $.cd('/project');
  await $`npm install`;
  await $`npm test`;
});
```

## Command Templates

```typescript
// Create a template
const gitClone = $.template('git clone {{repo}} {{dir}}', {
  defaults: { dir: '.' },
  validate: (params) => {
    if (!params.repo?.startsWith('http')) {
      throw new Error('Invalid repo URL');
    }
  }
});

// Use the template
await gitClone.execute($, {
  repo: 'https://github.com/user/repo.git',
  dir: '/projects/repo'
});
```

## Utilities and Helpers

### Temporary Files

```typescript
// Create temporary file
const temp = await $.tempFile({ prefix: 'data-' });
await $`echo "test" > ${temp.path}`;
await temp.cleanup();

// Automatic cleanup
await $.withTempFile(async (path) => {
  await $`process-data > ${path}`;
  return $`upload ${path}`;
});
```

### File Transfer

```typescript
// Between adapters
await $.transfer.copy(
  '/local/file.txt',
  'remote:/server/file.txt'
);

// With progress
await $.transfer.sync('/source', '/dest', {
  onProgress: (transferred, total) => {
    console.log(`${transferred}/${total} bytes`);
  }
});
```

### Interactive Prompts

```typescript
// Text input
const name = await $.question('Enter name: ');

// Confirmation
const proceed = await $.confirm('Continue?');

// Selection
const option = await $.select('Choose:', {
  choices: ['dev', 'staging', 'prod']
});

// Password input
const password = await $.password('Password: ');
```

## Error Handling

```typescript
try {
  await $`risky-command`;
} catch (error) {
  if (error.code === 'COMMAND_FAILED') {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}

// Or with nothrow
const result = await $`risky-command`.nothrow();
if (!result.ok) {
  console.log('Failed with:', result.stderr);
}
```

## Performance and Optimizations

### Connection Pooling

SSH and other adapters automatically manage connection pools:

```typescript
const ssh = $.ssh({ host: 'server' });

// Uses single connection
for (const file of files) {
  await ssh`process ${file}`;
}
```

### Lazy Initialization

Adapters are created only on first use:

```typescript
// Docker adapter created only here
await $.docker({ container: 'app' })`ls`;
```

### Stream Processing

```typescript
// Process large outputs
await $`generate-huge-output`
  .stdout(async (chunk) => {
    await processChunk(chunk);
  });
```

## Security

### Automatic Escaping

All template literal values are automatically escaped:

```typescript
const userInput = "'; DROP TABLE users; --";
await $`mysql -e "SELECT * FROM data WHERE name = ${userInput}"`;
// Safe! Injection is impossible
```

### Sensitive Data Masking

```typescript
const $ = new ExecutionEngine({
  sensitiveDataMasking: {
    enabled: true,
    patterns: [/password=\w+/gi],
    replacement: '[REDACTED]'
  }
});

// Passwords are hidden in logs
await $`curl -u admin:secret123 https://api.example.com`;
// Output: curl -u admin:[REDACTED] https://api.example.com
```

### Secure Password Handling

```typescript
import { SecureString } from '@xec-sh/core';

const password = new SecureString('secret123');
await $`mysql -p${password} -e "SHOW DATABASES"`;
// Password won't appear in logs
```

## Integration with async/await

The engine is fully compatible with async/await and Promise APIs:

```typescript
// Promise chaining
$`npm test`
  .then(result => console.log('Tests passed'))
  .catch(error => console.error('Tests failed'));

// Promise.all
const [test, lint, build] = await Promise.all([
  $`npm test`,
  $`npm run lint`,
  $`npm run build`
]);

// Promise.race
const fastest = await Promise.race([
  $`fetch-from-cache`,
  $`fetch-from-api`
]);
```

## Extensibility

### Registering Adapters

```typescript
import { CustomAdapter } from './custom-adapter';

const $ = new ExecutionEngine();
$.registerAdapter('custom', new CustomAdapter());

await $.with({ adapter: 'custom' })`custom-command`;
```

### Plugins and Middleware

```typescript
// Add logging middleware
$.on('command:start', async (event) => {
  await logger.log('Command started', event);
});

// Modify results
$.on('command:complete', (event) => {
  event.stdout = sanitize(event.stdout);
});
```

## Usage Examples

### CI/CD Pipeline

```typescript
async function deploy(environment: string) {
  const $ = new ExecutionEngine();
  
  // Build
  await $`npm ci`;
  await $`npm run build`;
  
  // Tests
  await $`npm test`.nothrow() || 
    throw new Error('Tests failed');
  
  // Deploy
  const server = $.ssh({
    host: `${environment}.example.com`,
    username: 'deploy'
  });
  
  await server`cd /app && git pull`;
  await server`npm ci --production`;
  await server`pm2 restart app`;
}
```

### Data Processing

```typescript
async function processLogs() {
  // Get logs from different sources
  const [app1, app2, db] = await $.parallel.all([
    $.docker({ container: 'app1' })`tail -n 1000 /logs/app.log`,
    $.docker({ container: 'app2' })`tail -n 1000 /logs/app.log`,
    $.ssh({ host: 'db-server' })`tail -n 1000 /var/log/mysql/error.log`
  ]);
  
  // Process and aggregate
  const errors = [...app1.stdout, ...app2.stdout, ...db.stdout]
    .split('\n')
    .filter(line => line.includes('ERROR'));
  
  // Save results
  await $`echo ${errors.join('\n')} > errors-report.txt`;
}
```

### System Monitoring

```typescript
async function monitorSystem() {
  const servers = ['web1', 'web2', 'db1'];
  
  while (true) {
    const metrics = await $.parallel.map(servers, async (server) => {
      const ssh = $.ssh({ host: `${server}.local` });
      
      const cpu = await ssh`top -bn1 | grep "Cpu(s)"`.text();
      const memory = await ssh`free -m | grep "Mem:"`.text();
      const disk = await ssh`df -h | grep "/dev/sda1"`.text();
      
      return { server, cpu, memory, disk };
    });
    
    console.table(metrics);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

## Conclusion

The ExecutionEngine provides a powerful and flexible API for command execution across various environments. Its key advantages:

- **Universality**: Single API for all environments
- **Security**: Automatic escaping and data masking
- **Performance**: Connection pooling and caching
- **Convenience**: Intuitive API with modern JavaScript support
- **Extensibility**: Adapter and event systems

The engine serves as a foundation for building complex automation systems, CI/CD pipelines, and infrastructure management tools.