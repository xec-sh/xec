---
sidebar_position: 1
---

# Command Execution

The heart of @xec-sh/core - understanding the $ function and execution modes.

## The $ Function

The `$` function is your gateway to command execution across all environments:

```typescript
import { $ } from '@xec-sh/core';

// Basic execution
await $`echo "Hello, World!"`;

// The $ is actually a Proxy that provides a rich API
console.log(typeof $); // 'function'
```

## Execution Modes

### Standard Mode (Default)

Uses your default shell with proper escaping:

```typescript
// Standard execution with escaping
const file = "my file.txt";
await $`touch ${file}`; // Creates "my file.txt"
```

### Raw Mode

Bypasses escaping for complex shell features:

```typescript
// Raw mode - no escaping
await $.raw`echo $HOME > ~/output.txt`;
await $.raw`for i in {1..5}; do echo $i; done`;

// Useful for shell expansions
await $.raw`cp *.js backup/`;
```

### Direct ExecutionEngine Usage

For advanced use cases, create your own engine:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine({
  shell: '/bin/zsh',
  timeout: 30000
});

// Convert to callable
const $custom = engine.asCallable();
await $custom`echo "Custom engine"`;
```

## Command Building

### Template Literals

The preferred way to build commands:

```typescript
const name = "John's File.txt";
const count = 42;

// Safe interpolation
await $`echo "Processing ${name} - Count: ${count}"`;
```

### Array Arguments

Arrays are expanded as separate arguments:

```typescript
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`rm ${files}`; // Executes: rm file1.txt file2.txt file3.txt

const flags = ['-l', '-a', '-h'];
await $`ls ${flags}`; // Executes: ls -l -a -h
```

### Object Interpolation

Objects are JSON stringified and escaped:

```typescript
const config = { 
  port: 3000, 
  host: 'localhost' 
};

await $`echo ${config}`; // Outputs: {"port":3000,"host":"localhost"}
```

## Shell Configuration

### Default Shell

By default, commands use `/bin/sh`. Change it globally or per-command:

```typescript
// Global change
import { configure } from '@xec-sh/core';

configure({
  shell: '/bin/bash'
});

// Per-command
await $.shell('/bin/zsh')`echo $ZSH_VERSION`;
await $.shell('/bin/bash')`echo $BASH_VERSION`;
```

### Shell Features

Different shells provide different features:

```typescript
// Bash-specific features
await $.shell('/bin/bash')`
  echo "Arrays: ${array[@]}"
  echo "Associative: ${assoc[key]}"
`;

// Zsh-specific features
await $.shell('/bin/zsh')`
  echo "Glob: **/*.js"
  echo "History: !!"
`;
```

### No Shell Mode

Execute commands directly without shell:

```typescript
// Direct execution (no shell)
await $.shell(false)`node --version`;

// Useful for:
// - Avoiding shell overhead
// - Precise argument control
// - Security when shell features aren't needed
```

## Execution Options

### Timeout

Set command timeout:

```typescript
// 5 second timeout
await $.timeout(5000)`long-running-command`;

// Different timeouts for different commands
await $.timeout(1000)`quick-check`;
await $.timeout(60000)`slow-build`;

// Handle timeout errors
try {
  await $.timeout(1000)`sleep 5`;
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Command timed out');
  }
}
```

### Working Directory

Change working directory:

```typescript
// Temporary directory change
await $.cd('/tmp')`pwd`; // Outputs: /tmp

// Back to original
await $`pwd`; // Original directory

// Chain directory changes
await $.cd('/home').cd('user').cd('projects')`pwd`;
// Outputs: /home/user/projects
```

### Environment Variables

Set environment variables:

```typescript
// Single variable
await $.env({ NODE_ENV: 'production' })`node app.js`;

// Multiple variables
await $.env({
  NODE_ENV: 'test',
  PORT: '3000',
  DEBUG: 'app:*'
})`npm start`;

// Extend existing environment
const customEnv = {
  ...process.env,
  MY_VAR: 'value'
};
await $.env(customEnv)`echo $MY_VAR`;
```

## Command Chaining

### Fluent API

Chain multiple options:

```typescript
await $.timeout(30000)
       .env({ NODE_ENV: 'production' })
       .cd('/app')
       .shell('/bin/bash')`npm run build`;
```

### Shell Operators

Use shell operators for complex commands:

```typescript
// AND operator
await $`mkdir -p /tmp/test && cd /tmp/test && pwd`;

// OR operator
await $`command-that-might-fail || echo "Failed but continuing"`;

// Pipes
await $`cat large-file.txt | grep pattern | head -10`;

// Redirects
await $`echo "content" > file.txt`;
await $`echo "append" >> file.txt`;
await $`command 2>&1`; // Redirect stderr to stdout
```

## Process Control

### Access to Child Process

Get the underlying child process:

```typescript
const proc = $`long-running-command`;

// Access process properties
console.log('PID:', proc.pid);

// Kill if needed
proc.kill('SIGTERM');

// Wait for completion
const result = await proc;
```

### Streaming

Access stdout/stderr streams:

```typescript
const proc = $`tail -f /var/log/app.log`;

// Pipe to another process
proc.stdout.pipe(process.stdout);
proc.stderr.pipe(process.stderr);

// Or transform
proc.stdout
  .pipe(new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk.toString().toUpperCase());
    }
  }))
  .pipe(process.stdout);
```

### Signal Handling

Handle process signals:

```typescript
const proc = $`long-running-server`;

// Graceful shutdown
process.on('SIGTERM', () => {
  proc.kill('SIGTERM');
});

// Handle process exit
proc.on('exit', (code, signal) => {
  console.log(`Process exited: code=${code}, signal=${signal}`);
});
```

## Advanced Execution

### Conditional Execution

Execute based on conditions:

```typescript
// Simple conditional
const isDev = process.env.NODE_ENV === 'development';
const command = isDev ? 'npm run dev' : 'npm start';
await $`${command}`;

// Conditional chaining
const $ prod = isDev 
  ? $.env({ NODE_ENV: 'development' })
  : $.env({ NODE_ENV: 'production' });

await $prod`node app.js`;
```

### Dynamic Command Building

Build commands programmatically:

```typescript
function buildCommand(action: string, files: string[]) {
  return $`git ${action} ${files}`;
}

await buildCommand('add', ['file1.js', 'file2.js']);
```

### Command Templates

Create reusable command templates:

```typescript
// Define templates
const templates = {
  deploy: (env: string) => 
    $.env({ DEPLOY_ENV: env })`./deploy.sh`,
  
  backup: (source: string) => 
    $`tar -czf backup-$(date +%Y%m%d).tar.gz ${source}`,
  
  test: (suite?: string) => 
    suite ? $`npm test -- ${suite}` : $`npm test`
};

// Use templates
await templates.deploy('production');
await templates.backup('/var/data');
await templates.test('unit');
```

## Error Handling

### Default Behavior

Non-zero exit codes throw by default:

```typescript
try {
  await $`exit 1`;
} catch (error) {
  console.log('Exit code:', error.exitCode);
  console.log('Stderr:', error.stderr);
  console.log('Command:', error.command);
}
```

### Suppress Errors

Use `.nothrow()` for manual handling:

```typescript
const result = await $`potentially-failing-command`.nothrow();

if (result.isSuccess()) {
  console.log('Success:', result.stdout);
} else {
  console.log('Failed:', result.exitCode);
  console.log('Error:', result.stderr);
}
```

### Custom Error Handling

Configure error behavior:

```typescript
// Never throw
configure({ throwOnNonZeroExit: false });

// Or per-command basis
const engine = new ExecutionEngine({
  throwOnNonZeroExit: false
});
```

## Performance Considerations

### Command Overhead

Each command spawns a new process:

```typescript
// Inefficient - multiple processes
for (const file of files) {
  await $`process-file ${file}`;
}

// Better - single process
await $`process-files ${files}`;
```

### Shell vs No-Shell

Direct execution is faster:

```typescript
// With shell overhead
await $`node --version`;

// Without shell overhead
await $.shell(false)`node --version`;
```

### Reusing Engines

For many commands, reuse engines:

```typescript
const engine = new ExecutionEngine();
const $ custom = engine.asCallable();

// Reuse for multiple commands
for (let i = 0; i < 100; i++) {
  await $custom`echo ${i}`;
}
```

## Best Practices

### 1. Use Template Literals

```typescript
// ✅ Good - safe escaping
const file = "user's file.txt";
await $`cat ${file}`;

// ❌ Bad - potential injection
await $`cat ${file}`.raw;
```

### 2. Handle Errors

```typescript
// ✅ Good - handle errors
const result = await $`risky-command`.nothrow();
if (!result.isSuccess()) {
  // Handle error
}

// ❌ Bad - unhandled rejection
await $`risky-command`; // Might crash
```

### 3. Use Appropriate Output Method

```typescript
// ✅ Good - use appropriate method
const version = await $`node --version`.text();
const config = await $`cat config.json`.json();
const files = await $`ls`.lines();

// ❌ Bad - manual parsing
const output = (await $`ls`).stdout.trim().split('\n');
```

### 4. Set Timeouts

```typescript
// ✅ Good - set reasonable timeout
await $.timeout(30000)`npm install`;

// ❌ Bad - no timeout for long operations
await $`npm install`; // Might hang forever
```

### 5. Use Quiet Mode

```typescript
// ✅ Good - quiet for non-interactive
await $`download-large-file`.quiet();

// ❌ Bad - verbose in production
await $`download-large-file`; // Logs everything
```

## Debugging

### Enable Verbose Logging

```typescript
// See what commands are executed
$.on('command:start', (event) => {
  console.log('Executing:', event.command);
});

$.on('command:end', (event) => {
  console.log('Completed:', event.duration + 'ms');
});
```

### Dry Run Mode

Implement dry run for testing:

```typescript
const dryRun = process.env.DRY_RUN === 'true';

if (dryRun) {
  $.on('command:start', (event) => {
    console.log('[DRY RUN]', event.command);
    event.preventDefault(); // If supported
  });
}
```

### Command Inspection

Inspect commands before execution:

```typescript
const cmd = $`complex ${command} with ${args}`;
console.log('Will execute:', cmd.toString());
// Then execute
await cmd;
```