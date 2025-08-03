# Execution API

The core execution API provides the fundamental interface for executing commands across all environments with a consistent, powerful syntax.

## Overview

The Execution API (`packages/core/src/core/execution-engine.ts`) provides:

- **Template literal syntax** for natural command execution
- **Method chaining** for composable operations
- **Environment switching** between adapters
- **Configuration merging** with defaults
- **Event emission** for monitoring
- **Result handling** with type safety

## Core API

### Template Literal Execution

```typescript
import { $ } from '@xec-sh/core';

// Basic execution
const result = await $`ls -la`;
console.log(result.stdout);

// With variables
const file = 'document.txt';
await $`cat ${file}`;

// Multi-line commands
await $`
  cd /app
  npm install
  npm run build
`;
```

### ExecutionEngine Class

```typescript
import { ExecutionEngine } from '@xec-sh/core';

// Create custom instance
const engine = new ExecutionEngine({
  shell: '/bin/zsh',
  cwd: '/home/user',
  env: {
    NODE_ENV: 'production'
  }
});

// Use instance
await engine`command`;
```

### Adapter Selection

```typescript
// Local execution (default)
await $`local-command`;
await $.local`explicit-local`;

// SSH execution
await $.ssh({ host: 'server', username: 'user' })`remote-command`;

// Docker execution
await $.docker({ container: 'app' })`container-command`;

// Kubernetes execution
await $.k8s({ pod: 'worker', namespace: 'default' })`pod-command`;
```

## Command Building

### String Interpolation

```typescript
// Safe interpolation
const userInput = "'; rm -rf /";
await $`echo ${userInput}`;  // Automatically escaped

// Array expansion
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`cat ${files}`;  // Expands to: cat file1.txt file2.txt file3.txt

// Object interpolation
const options = { verbose: true, recursive: true };
await $`rsync ${options} source/ dest/`;  // Converts to flags
```

### Command Options

```typescript
// Configure execution options
const result = await $`command`.options({
  timeout: 5000,
  maxBuffer: 10 * 1024 * 1024,  // 10MB
  encoding: 'utf8',
  shell: '/bin/bash',
  env: { CUSTOM_VAR: 'value' }
});
```

## Environment Configuration

### Working Directory

```typescript
// Change working directory
await $`pwd`.cwd('/tmp');  // Outputs: /tmp

// Chain with cd()
const project = $.cd('/project');
await project`npm install`;
await project`npm test`;

// Temporary directory change
await $.within('/tmp', async () => {
  await $`create-temp-files`;
});  // Returns to original directory
```

### Environment Variables

```typescript
// Set environment variables
await $`node script.js`.env({
  NODE_ENV: 'production',
  API_KEY: 'secret'
});

// Merge with existing
const production = $.env({ NODE_ENV: 'production' });
await production`npm start`;

// Clear environment
await $`printenv`.env({}, { replace: true });  // Empty environment
```

### Shell Configuration

```typescript
// Use specific shell
await $`echo $0`.shell('/bin/zsh');

// Disable shell (direct execution)
await $`ls`.shell(false);

// Custom shell with options
await $`complex-script`.shell({
  path: '/bin/bash',
  args: ['-e', '-o', 'pipefail']
});
```

## Process Control

### Signals and Termination

```typescript
// Handle signals
const longRunning = $`sleep 100`;

// Send signal
setTimeout(() => longRunning.kill('SIGTERM'), 5000);

// Graceful shutdown
const server = $`node server.js`;
process.on('SIGINT', async () => {
  await server.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 5000));
  await server.kill('SIGKILL');
});
```

### Abort Controller

```typescript
// Use AbortController
const controller = new AbortController();

const task = $`long-task`.signal(controller.signal);

// Cancel after timeout
setTimeout(() => controller.abort(), 10000);

try {
  await task;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Task cancelled');
  }
}
```

### Process Priority

```typescript
// Set process priority
await $`cpu-intensive-task`.nice(10);  // Lower priority

// Set I/O priority
await $`disk-intensive-task`.ionice({
  class: 'idle',
  level: 7
});
```

## Input/Output Control

### Standard Input

```typescript
// String input
await $`cat`.stdin('Hello, World!');

// Buffer input
const data = Buffer.from([0x00, 0x01, 0x02]);
await $`process-binary`.stdin(data);

// Stream input
import { createReadStream } from 'fs';
const input = createReadStream('input.txt');
await $`sort`.stdin(input);

// Pipe from another command
await $`generate-data`.pipe($`process-data`);
```

### Standard Output

```typescript
// Capture output
const result = await $`echo "test"`;
console.log(result.stdout);  // "test\n"

// Stream to file
import { createWriteStream } from 'fs';
const output = createWriteStream('output.txt');
await $`ls -la`.stdout(output);

// Inherit parent process streams
await $`interactive-command`
  .stdout('inherit')
  .stderr('inherit')
  .stdin('inherit');

// Ignore output
await $`noisy-command`
  .stdout('ignore')
  .stderr('ignore');
```

### Standard Error

```typescript
// Capture stderr
const result = await $`command 2>&1`;
console.log('Errors:', result.stderr);

// Redirect stderr to stdout
await $`command 2>&1`.stdout(process.stdout);

// Separate handling
await $`test-command`
  .stdout((line) => console.log('OUT:', line))
  .stderr((line) => console.error('ERR:', line));
```

## Result Handling

### Result Object

```typescript
// Result structure
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  command: string;
  duration: number;
  killed: boolean;
}

const result = await $`echo "test"`;
console.log({
  output: result.stdout,
  errors: result.stderr,
  success: result.exitCode === 0,
  time: result.duration
});
```

### Error Handling

```typescript
// Default behavior - throws on non-zero exit
try {
  await $`exit 1`;
} catch (error) {
  console.error('Command failed:', error.exitCode);
}

// Use nothrow() to prevent throwing
const result = await $`might-fail`.nothrow();
if (!result.ok) {
  console.error('Failed but continued');
}

// Check specific exit codes
const result = await $`special-command`.nothrow();
switch (result.exitCode) {
  case 0: console.log('Success'); break;
  case 1: console.log('General error'); break;
  case 2: console.log('Misuse'); break;
  default: console.log('Unknown error');
}
```

## Event System

### Command Events

```typescript
const $ = new ExecutionEngine();

// Listen for execution events
$.on('command:start', ({ command, adapter, id }) => {
  console.log(`[${id}] Starting: ${command} (${adapter})`);
});

$.on('command:complete', ({ command, exitCode, duration }) => {
  console.log(`Completed in ${duration}ms with code ${exitCode}`);
});

$.on('command:error', ({ command, error }) => {
  console.error(`Failed: ${command}`, error);
});

$.on('command:output', ({ stream, data }) => {
  if (stream === 'stdout') {
    process.stdout.write(data);
  }
});
```

### Custom Events

```typescript
// Emit custom events
$.emit('custom:event', { data: 'value' });

// Listen for custom events
$.on('custom:event', (payload) => {
  console.log('Custom event:', payload);
});

// One-time listeners
$.once('initialization:complete', () => {
  console.log('Initialized');
});

// Remove listeners
const handler = () => console.log('Handler');
$.on('event', handler);
$.off('event', handler);
```

## Utility Methods

### Text Processing

```typescript
// Get output as text (trimmed)
const text = await $`echo "  text  "`.text();
console.log(text);  // "text" (no whitespace)

// Get output lines
const lines = await $`ls -1`.lines();
lines.forEach(line => console.log(`File: ${line}`));

// Get as JSON
const json = await $`echo '{"key": "value"}'`.json();
console.log(json.key);  // "value"
```

### Boolean Checks

```typescript
// Check if command succeeds
if (await $`test -f file.txt`.succeeds()) {
  console.log('File exists');
}

// Check if command fails
if (await $`test -f missing.txt`.fails()) {
  console.log('File does not exist');
}

// Silent check (no output)
const exists = await $`which node`.quiet().succeeds();
```

### Command Inspection

```typescript
// Dry run (show command without executing)
const command = $`rm -rf /`.dryRun();
console.log('Would execute:', command.toString());

// Get command string
const cmd = $`echo ${variable}`;
console.log('Command:', cmd.command());

// Get full configuration
const config = cmd.inspect();
console.log('Configuration:', config);
```

## Performance Options

### Timeout Management

```typescript
// Simple timeout
await $`slow-command`.timeout(5000);  // 5 seconds

// Timeout with custom signal
await $`server`.timeout(10000, 'SIGTERM');

// Timeout with kill delay
await $`graceful-shutdown`.timeout({
  timeout: 10000,
  killSignal: 'SIGTERM',
  killDelay: 5000  // Wait 5s before SIGKILL
});
```

### Buffer Limits

```typescript
// Set max buffer size
await $`generate-output`.maxBuffer(100 * 1024 * 1024);  // 100MB

// Streaming for unlimited output
await $`infinite-output`
  .stdout(process.stdout)  // Stream instead of buffer
  .maxBuffer(Infinity);
```

### Parallel Execution

```typescript
// Execute commands in parallel
const results = await Promise.all([
  $`command1`,
  $`command2`,
  $`command3`
]);

// With concurrency limit
import pLimit from 'p-limit';
const limit = pLimit(2);

const commands = ['cmd1', 'cmd2', 'cmd3', 'cmd4'];
const results = await Promise.all(
  commands.map(cmd => limit(() => $`${cmd}`))
);
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use template literals for safety
const userInput = "dangerous';rm -rf /";
await $`echo ${userInput}`;  // Safe

// ✅ Handle errors appropriately
const result = await $`risky-command`.nothrow();
if (!result.ok) {
  // Handle failure
}

// ✅ Set timeouts for network operations
await $`curl https://api.example.com`.timeout(10000);

// ✅ Use events for monitoring
$.on('command:error', (e) => logger.error(e));
```

### Don'ts ❌

```typescript
// ❌ Don't use string concatenation
const cmd = 'echo ' + userInput;  // Dangerous
await $.raw(cmd);

// ❌ Don't ignore errors
await $`failing-command`;  // Will throw

// ❌ Don't buffer large outputs
const huge = await $`cat 10gb-file.dat`;  // OOM

// ❌ Don't leak resources
const proc = $`long-running`;
// Should await or kill
```

## Implementation Details

The Execution API is implemented in:
- `packages/core/src/core/execution-engine.ts` - Main engine
- `packages/core/src/core/command-builder.ts` - Command construction
- `packages/core/src/core/execution-context.ts` - Context management
- `packages/core/src/core/template-tag.ts` - Template literal processing

## See Also

- [Template Literals](/docs/core/execution-engine/template-literals)
- [Chaining](/docs/core/execution-engine/api/chaining)
- [Composition](/docs/core/execution-engine/api/composition)
- [Error Handling](/docs/core/execution-engine/features/error-handling)