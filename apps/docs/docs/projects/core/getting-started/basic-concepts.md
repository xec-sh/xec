---
sidebar_position: 1
---

# Basic Concepts

Understanding the fundamental concepts of `@xec-sh/core` will help you leverage its full potential.

## The Universal Execution Model

Xec provides a single, consistent API for executing commands across different environments:

```typescript
// Same syntax everywhere
await $`echo "Hello"`;              // Local
await remote`echo "Hello"`;         // SSH
await container`echo "Hello"`;      // Docker
await pod.exec`echo "Hello"`;       // Kubernetes
```

This consistency means you can write your automation code once and run it anywhere.

## Template Literals

Xec uses JavaScript template literals (backticks) for command execution:

```typescript
// Basic execution
await $`ls -la`;

// With variables (automatically escaped)
const filename = "my file.txt";
await $`cat ${filename}`;  // Executes: cat 'my file.txt'

// Raw execution (no escaping)
await $.raw`echo $HOME`;   // Shell interprets $HOME
```

### Why Template Literals?

1. **Natural Syntax**: Looks like shell commands
2. **Auto-escaping**: Variables are safely escaped
3. **IDE Support**: Syntax highlighting and completion
4. **Type Safety**: TypeScript knows it's a command

## Execution Flow

Understanding how commands are executed:

```mermaid
graph LR
    A[Template Literal] --> B[Command Parser]
    B --> C[Adapter Selection]
    C --> D[Command Execution]
    D --> E[Result Processing]
    E --> F[ExecutionResult]
```

### 1. Command Creation

```typescript
const command = $`npm install`;
// Creates a ProcessPromise with command configuration
```

### 2. Adapter Selection

```typescript
// Local adapter (default)
$`ls`;

// SSH adapter
$.ssh({ host: 'server' })`ls`;

// Docker adapter
$.docker({ container: 'app' })`ls`;
```

### 3. Execution

The selected adapter executes the command in its environment:
- **Local**: Uses child_process
- **SSH**: Uses SSH protocol
- **Docker**: Uses Docker CLI/API
- **Kubernetes**: Uses kubectl

### 4. Result Handling

Every command returns an `ExecutionResult`:

```typescript
const result = await $`echo "test"`;

result.stdout    // "test\n"
result.stderr    // ""
result.exitCode  // 0
result.isSuccess() // true
```

## Async/Await Model

All Xec commands are asynchronous and return Promises:

```typescript
// Sequential execution
await $`npm install`;
await $`npm test`;
await $`npm build`;

// Parallel execution
await Promise.all([
  $`npm install`,
  $`pip install -r requirements.txt`,
  $`bundle install`
]);
```

## Process Promise

The `ProcessPromise` extends JavaScript's Promise with additional methods:

```typescript
const promise = $`long-running-command`;

// Stream output in real-time
await promise.stream();

// Don't throw on non-zero exit
const result = await promise.nothrow();

// Set timeout
await promise.timeout(5000);

// Access process streams
promise.stdout.pipe(process.stdout);
```

## Error Handling

By default, non-zero exit codes throw errors:

```typescript
try {
  await $`exit 1`;
} catch (error) {
  console.log(error.exitCode); // 1
  console.log(error.stderr);   // Error output
}

// Suppress errors
const result = await $`exit 1`.nothrow();
if (!result.isSuccess()) {
  console.log('Command failed');
}
```

## Environment Context

Commands inherit and can modify their execution environment:

```typescript
// Global environment
$.env({ NODE_ENV: 'production' });

// Per-command environment
await $.env({ DEBUG: 'true' })`npm start`;

// Working directory
await $.cd('/app')`npm install`;

// Shell selection
await $.shell('/bin/zsh')`source ~/.zshrc && echo $PATH`;
```

## Connection Management

Xec automatically manages connections for optimal performance:

### SSH Connection Pooling

```typescript
const remote = $.ssh({ host: 'server' });

// These commands reuse the same SSH connection
await remote`command1`;
await remote`command2`;
await remote`command3`;
```

### Docker Container Lifecycle

```typescript
const container = await $.docker({
  image: 'node:18'
}).start();

// Container is running
await container.exec`npm test`;

// Cleanup
await container.stop();
await container.remove();
```

## Streaming and Pipes

Handle large outputs efficiently:

```typescript
// Stream to console
await $`tail -f /var/log/app.log`.stream();

// Custom stream handling
await $`find . -name "*.js"`.stream({
  stdout: (chunk) => process.stdout.write(`> ${chunk}`),
  stderr: (chunk) => process.stderr.write(`! ${chunk}`)
});

// Pipe between commands
await pipe(
  $`cat large-file.json`,
  $`jq '.items[]'`,
  $`grep pattern`
);
```

## Event System

Monitor execution lifecycle:

```typescript
// Listen to events
$.on('command:start', ({ command }) => {
  console.log(`Executing: ${command}`);
});

$.on('command:success', ({ duration }) => {
  console.log(`Completed in ${duration}ms`);
});

// Events flow
// command:start -> (command:success | command:error | command:timeout)
```

## Resource Management

Xec handles resource cleanup automatically:

```typescript
// Automatic cleanup on process exit
process.on('exit', () => $.dispose());

// Manual cleanup
await $.dispose();

// Temporary resources
await withTempFile(async (tmpFile) => {
  await $`echo "data" > ${tmpFile}`;
  // File is deleted when function exits
});
```

## Type Safety

Full TypeScript support ensures type safety:

```typescript
import type { ExecutionResult, ProcessPromise } from '@xec-sh/core';

// Type-safe results
const result: ExecutionResult = await $`echo "test"`;
const output: string = result.stdout;

// Type-safe promises
const promise: ProcessPromise = $`sleep 1`;
await promise.timeout(500); // TypeScript knows about .timeout()
```

## Composition Patterns

Build complex operations from simple ones:

### Sequential Operations

```typescript
async function deploy() {
  await $`npm test`;
  await $`npm run build`;
  await $`npm run deploy`;
}
```

### Conditional Execution

```typescript
const hasDocker = await $`which docker`.nothrow();
if (hasDocker.isSuccess()) {
  await $`docker build -t app .`;
}
```

### Error Recovery

```typescript
const backup = await $`pg_dump mydb > backup.sql`.nothrow();
if (!backup.isSuccess()) {
  // Try alternative method
  await $`mysqldump mydb > backup.sql`;
}
```

## Best Practices

### 1. Use Template Literals

```typescript
// ✅ Good - Variables are escaped
const file = "my file.txt";
await $`cat ${file}`;

// ❌ Bad - Vulnerable to injection
await $.raw`cat ${file}`;
```

### 2. Handle Errors Appropriately

```typescript
// ✅ Good - Explicit error handling
const result = await $`risky-command`.nothrow();
if (!result.isSuccess()) {
  console.error('Command failed:', result.stderr);
}

// ❌ Bad - Ignoring errors
await $`risky-command`.nothrow();
```

### 3. Use Connection Pooling

```typescript
// ✅ Good - Reuse connection
const remote = $.ssh({ host: 'server' });
for (const file of files) {
  await remote`process ${file}`;
}

// ❌ Bad - New connection each time
for (const file of files) {
  await $.ssh({ host: 'server' })`process ${file}`;
}
```

### 4. Clean Up Resources

```typescript
// ✅ Good - Ensure cleanup
const container = await $.docker({ image: 'test' }).start();
try {
  await container.exec`npm test`;
} finally {
  await container.stop();
  await container.remove();
}
```

## Common Patterns

### Retry Logic

```typescript
// Simple retry
await $`flaky-command`.retry(3);

// Advanced retry
await $`network-call`.retry({
  maxAttempts: 5,
  backoff: 'exponential',
  initialDelay: 1000
});
```

### Parallel Execution

```typescript
// Run tests in parallel
const results = await parallel([
  () => $`npm test`,
  () => $`pytest`,
  () => $`go test ./...`
], { maxConcurrent: 2 });
```

### Progress Tracking

```typescript
const files = await $`find . -name "*.js"`;
const total = files.stdout.trim().split('\n').length;

let processed = 0;
for (const file of files.stdout.trim().split('\n')) {
  await $`eslint ${file}`;
  processed++;
  console.log(`Progress: ${processed}/${total}`);
}
```

## Next Steps

Now that you understand the basic concepts:

1. Explore the [Core documentation](../) for execution adapters
2. Check out [examples](../examples) for practical use cases
3. Read the [API reference](../api-reference) for detailed documentation

Remember: Xec's power comes from its simplicity and consistency. Master these basic concepts, and you'll be able to automate anything!