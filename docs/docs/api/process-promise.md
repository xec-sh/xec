---
title: ProcessPromise API
description: Chainable promise interface for command execution
keywords: [process, promise, execution, chain, pipe]
source_files:
  - packages/core/src/core/process-promise.ts
  - packages/core/src/core/process-output.ts
key_functions:
  - ProcessPromise.then()
  - ProcessPromise.pipe()
  - ProcessPromise.nothrow()
  - ProcessPromise.quiet()
  - ProcessPromise.timeout()
verification_date: 2025-08-03
---

# ProcessPromise API

## Implementation Reference

**Source Files:**
- `packages/core/src/core/process-promise.ts` - Main ProcessPromise implementation
- `packages/core/src/core/process-output.ts` - Output handling
- `packages/core/src/core/process-stream.ts` - Stream processing
- `packages/core/src/types/result.ts` - Result types

## Class: ProcessPromise

A chainable promise that represents a running or completed process. Extends native Promise with additional methods for process control.

### Constructor

```typescript
class ProcessPromise<T = ProcessOutput> extends Promise<T> {
  constructor(executor: ProcessExecutor)
}
```

### Properties

```typescript
interface ProcessPromise {
  readonly stdin: Writable;      // Process stdin stream
  readonly stdout: Readable;     // Process stdout stream  
  readonly stderr: Readable;     // Process stderr stream
  readonly exitCode: Promise<number>; // Exit code promise
  readonly pid?: number;         // Process ID (if available)
  readonly killed: boolean;      // Whether process was killed
}
```

## Chaining Methods

### pipe()

Pipe output to another command.

```typescript
pipe(command: string | TemplateStringsArray, ...values: any[]): ProcessPromise
```

**Parameters:**
- `command` - Command to pipe to
- `values` - Template literal values

**Returns:** New ProcessPromise for piped command

**Example:**
```typescript
// Simple pipe
await $`cat file.txt`.pipe('grep pattern');

// Multiple pipes
await $`cat file.txt`
  .pipe('grep pattern')
  .pipe('sort')
  .pipe('uniq');

// With template literals
const pattern = 'error';
await $`journalctl -u app`.pipe`grep ${pattern}`;
```

### nothrow()

Prevent throwing on non-zero exit codes.

```typescript
nothrow(): ProcessPromise
```

**Returns:** ProcessPromise that won't throw on error

**Example:**
```typescript
// Check if file exists without throwing
const result = await $`test -f file.txt`.nothrow();
if (result.exitCode === 0) {
  console.log('File exists');
} else {
  console.log('File does not exist');
}

// Try command and handle failure
const output = await $`risky-command`.nothrow();
if (!output.ok) {
  console.log('Command failed:', output.stderr);
}
```

### quiet()

Suppress stdout/stderr output.

```typescript
quiet(): ProcessPromise
```

**Returns:** ProcessPromise with suppressed output

**Example:**
```typescript
// Suppress output during execution
await $`npm install`.quiet();

// Only suppress stdout
await $`command 2>&1`.quiet();
```

### verbose()

Enable verbose output (opposite of quiet).

```typescript
verbose(): ProcessPromise
```

**Returns:** ProcessPromise with verbose output

**Example:**
```typescript
// Show detailed output
await $`deploy.sh`.verbose();
```

### timeout()

Set execution timeout.

```typescript
timeout(ms: number, signal?: string): ProcessPromise
```

**Parameters:**
- `ms` - Timeout in milliseconds
- `signal` - Signal to send on timeout (default: 'SIGTERM')

**Returns:** ProcessPromise with timeout

**Throws:** `TimeoutError` if timeout exceeded

**Example:**
```typescript
// Timeout after 5 seconds
await $`slow-command`.timeout(5000);

// Custom signal on timeout
await $`server`.timeout(10000, 'SIGKILL');

// Handle timeout error
try {
  await $`infinite-loop`.timeout(1000);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Command timed out');
  }
}
```

## Environment Methods

### cwd()

Set working directory.

```typescript
cwd(path: string): ProcessPromise
```

**Parameters:**
- `path` - Working directory path

**Returns:** ProcessPromise with working directory

**Example:**
```typescript
// Run in specific directory
await $`npm build`.cwd('/project');

// Chain with other methods
await $`git pull`
  .cwd('/repo')
  .quiet()
  .timeout(30000);
```

### env()

Set environment variables.

```typescript
env(variables: Record<string, string | undefined>): ProcessPromise
```

**Parameters:**
- `variables` - Environment variables object

**Returns:** ProcessPromise with environment

**Example:**
```typescript
// Set environment variables
await $`npm start`.env({
  NODE_ENV: 'production',
  PORT: '3000'
});

// Merge with existing environment
await $`deploy`.env({
  ...process.env,
  API_KEY: 'secret'
});
```

### shell()

Set shell for execution.

```typescript
shell(shell: string | boolean): ProcessPromise
```

**Parameters:**
- `shell` - Shell path or boolean

**Returns:** ProcessPromise with shell configuration

**Example:**
```typescript
// Use specific shell
await $`echo $SHELL`.shell('/bin/zsh');

// Disable shell (direct execution)
await $`node script.js`.shell(false);
```

## Input/Output Methods

### stdin()

Provide stdin input.

```typescript
stdin(input: string | Buffer | Readable): ProcessPromise
```

**Parameters:**
- `input` - Input data or stream

**Returns:** ProcessPromise with stdin

**Example:**
```typescript
// String input
await $`cat`.stdin('Hello, World!');

// Buffer input
await $`gzip`.stdin(Buffer.from('data'));

// Stream input
const stream = fs.createReadStream('input.txt');
await $`sort`.stdin(stream);

// Pipe from another process
const data = $`generate-data`;
await $`process-data`.stdin(data.stdout);
```

### kill()

Kill the process.

```typescript
kill(signal?: string): void
```

**Parameters:**
- `signal` - Signal to send (default: 'SIGTERM')

**Example:**
```typescript
const proc = $`long-running-task`;

// Kill after delay
setTimeout(() => proc.kill(), 5000);

// Kill with specific signal
proc.kill('SIGKILL');
```

## Output Methods

### lines()

Get output as array of lines.

```typescript
lines(): AsyncIterable<string>
```

**Returns:** Async iterable of output lines

**Example:**
```typescript
// Process line by line
for await (const line of $`tail -f log.txt`.lines()) {
  console.log('Log:', line);
}

// Collect all lines
const allLines = [];
for await (const line of $`ls -la`.lines()) {
  allLines.push(line);
}
```

### json()

Parse output as JSON.

```typescript
json<T = any>(): Promise<T>
```

**Type Parameters:**
- `T` - Expected JSON type

**Returns:** Promise resolving to parsed JSON

**Throws:** `SyntaxError` if not valid JSON

**Example:**
```typescript
// Parse JSON output
const data = await $`cat package.json`.json();
console.log(data.name, data.version);

// With type
interface Config {
  host: string;
  port: number;
}
const config = await $`cat config.json`.json<Config>();
```

### text()

Get output as text string.

```typescript
text(): Promise<string>
```

**Returns:** Promise resolving to output text

**Example:**
```typescript
const content = await $`cat README.md`.text();
console.log(content);
```

### buffer()

Get output as Buffer.

```typescript
buffer(): Promise<Buffer>
```

**Returns:** Promise resolving to output buffer

**Example:**
```typescript
const data = await $`cat image.png`.buffer();
fs.writeFileSync('copy.png', data);
```

## Advanced Methods

### retry()

Retry on failure.

```typescript
retry(options?: RetryOptions): ProcessPromise

interface RetryOptions {
  times?: number;      // Number of retries (default: 3)
  delay?: number;      // Delay between retries in ms
  backoff?: number;    // Backoff multiplier
  condition?: (error: any) => boolean; // Retry condition
}
```

**Example:**
```typescript
// Simple retry
await $`flaky-command`.retry();

// Custom retry options
await $`network-request`.retry({
  times: 5,
  delay: 1000,
  backoff: 2
});

// Conditional retry
await $`api-call`.retry({
  condition: (error) => error.code === 'ECONNRESET'
});
```

### signal()

Provide abort signal.

```typescript
signal(signal: AbortSignal): ProcessPromise
```

**Parameters:**
- `signal` - AbortSignal for cancellation

**Example:**
```typescript
const controller = new AbortController();

// Cancel after timeout
setTimeout(() => controller.abort(), 5000);

try {
  await $`long-task`.signal(controller.signal);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Cancelled');
  }
}
```

## Stream Methods

### tee()

Tee output to file while preserving stream.

```typescript
tee(file: string): ProcessPromise
```

**Parameters:**
- `file` - File path to write output

**Example:**
```typescript
// Save output to file while displaying
await $`build.sh`.tee('build.log');

// Multiple tees
await $`test.sh`
  .tee('test.log')
  .tee('latest.log');
```

### pipeStdout()

Pipe only stdout (not stderr).

```typescript
pipeStdout(command: string): ProcessPromise
```

**Example:**
```typescript
// Pipe only stdout
await $`command 2>/dev/null`.pipeStdout('grep pattern');
```

### pipeStderr()

Pipe only stderr (not stdout).

```typescript
pipeStderr(command: string): ProcessPromise
```

**Example:**
```typescript
// Process only errors
await $`build.sh`.pipeStderr('grep ERROR');
```

## Result Properties

### ProcessOutput

The result object returned when promise resolves:

```typescript
interface ProcessOutput {
  stdout: string;        // Standard output
  stderr: string;        // Standard error  
  exitCode: number;      // Exit code
  signal?: string;       // Termination signal
  ok: boolean;          // exitCode === 0
  duration: number;      // Execution time in ms
  command: string;       // Executed command
}
```

**Example:**
```typescript
const result = await $`echo hello`.nothrow();

console.log(result.stdout);    // "hello\n"
console.log(result.stderr);    // ""
console.log(result.exitCode);  // 0
console.log(result.ok);        // true
console.log(result.duration);  // 15
```

## Error Handling

### ProcessError

Thrown when process fails (unless using `nothrow()`):

```typescript
class ProcessError extends Error {
  readonly exitCode: number;
  readonly signal?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly command: string;
  readonly duration: number;
}
```

**Example:**
```typescript
try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof ProcessError) {
    console.log('Exit code:', error.exitCode);
    console.log('Error output:', error.stderr);
    console.log('Duration:', error.duration, 'ms');
  }
}
```

## Performance Characteristics

**Based on Implementation Analysis:**

### Method Overhead
- `.pipe()`: &lt;1ms per pipe
- `.nothrow()`: No overhead
- `.quiet()`: No overhead
- `.timeout()`: Timer overhead ~1ms
- `.retry()`: Depends on retry count

### Memory Usage
- Base ProcessPromise: ~5KB
- Output buffer: Grows with output
- Stream mode: Constant memory
- Default max buffer: 10MB

## Usage Patterns

### Sequential Execution

```typescript
// Chain commands sequentially
await $`npm install`;
await $`npm test`;
await $`npm build`;
```

### Parallel Execution

```typescript
// Run commands in parallel
const [install, lint, test] = await Promise.all([
  $`npm install`.quiet(),
  $`npm run lint`.nothrow(),
  $`npm test`.timeout(60000)
]);
```

### Error Recovery

```typescript
// Try primary, fallback to secondary
const result = await $`primary-command`.nothrow();
if (!result.ok) {
  await $`fallback-command`;
}
```

### Stream Processing

```typescript
// Process large files efficiently
const proc = $`find . -name "*.log"`;

for await (const file of proc.lines()) {
  const size = await $`stat -f%z ${file}`.text();
  console.log(`${file}: ${size} bytes`);
}
```

## Related Documentation

- [Execution Engine](./execution-engine.md) - Engine that creates ProcessPromise
- [Types](./types.md) - TypeScript type definitions
- [Error Handling](../guides/advanced/error-handling.md) - Error handling patterns
- [Stream Processing](../scripting/patterns/streaming.md) - Stream patterns