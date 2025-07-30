---
sidebar_position: 3
---

# Process Promise

Understanding the ProcessPromise API - the object returned by command execution.

## What is ProcessPromise?

ProcessPromise is a special Promise-like object returned when you execute a command. It extends a standard Promise with additional methods and properties for working with command output.

```typescript
import { $ } from '@xec-sh/core';

// This returns a ProcessPromise
const proc = $`echo "Hello"`;

// It's a Promise, so you can await it
const result = await proc;

// But it also has extra methods
const text = await proc.text();
```

## Core Properties

### Process Information

```typescript
const proc = $`long-running-command`;

// Process ID
console.log('PID:', proc.pid);

// Child process instance
console.log('Process:', proc.child);

// Kill the process
proc.kill('SIGTERM');

// Check if killed
console.log('Killed:', proc.killed);
```

### Streams

Access stdin, stdout, and stderr streams:

```typescript
const proc = $`cat`;

// Write to stdin
proc.stdin.write('Hello, World!\n');
proc.stdin.end();

// Read from stdout
proc.stdout.on('data', (chunk) => {
  console.log('Output:', chunk.toString());
});

// Monitor stderr
proc.stderr.on('data', (chunk) => {
  console.error('Error:', chunk.toString());
});

// Wait for completion
await proc;
```

## Output Methods

### .text() - Clean String Output

Removes trailing newline for clean output:

```typescript
// Without .text() - includes newline
const result1 = await $`echo "Hello"`;
console.log(result1.stdout); // "Hello\n"

// With .text() - clean output
const result2 = await $`echo "Hello"`.text();
console.log(result2); // "Hello"

// Useful for version checks
const version = await $`node --version`.text();
console.log(`Node.js ${version}`);
```

### .json() - Parse JSON Output

Automatically parse JSON output:

```typescript
// Parse package.json
const pkg = await $`cat package.json`.json();
console.log('Name:', pkg.name);
console.log('Version:', pkg.version);

// Handle parse errors
try {
  const data = await $`cat invalid.json`.json();
} catch (error) {
  if (error.message.includes('JSON')) {
    console.error('Invalid JSON output');
  }
}

// Works with APIs
const weather = await $`curl -s api.weather.com/data`.json();
```

### .lines() - Array of Lines

Split output into array of lines:

```typescript
// Get list of files
const files = await $`ls`.lines();
console.log('Files:', files);
// ['file1.txt', 'file2.txt', 'file3.txt']

// Process each line
const processes = await $`ps aux | grep node`.lines();
processes.forEach(proc => {
  console.log('Process:', proc);
});

// Filter empty lines automatically
const nonEmpty = await $`cat file.txt`.lines();
// Empty lines are removed
```

### .buffer() - Raw Buffer

Get output as Buffer for binary data:

```typescript
// Read binary file
const imageData = await $`cat image.jpg`.buffer();
console.log('Size:', imageData.length, 'bytes');

// Process binary data
const compressed = await $`gzip -c file.txt`.buffer();
await fs.writeFile('file.txt.gz', compressed);

// Check magic bytes
const magic = await $`cat file`.buffer();
if (magic[0] === 0x50 && magic[1] === 0x4B) {
  console.log('This is a ZIP file');
}
```

## Execution Control

### .nothrow() - Suppress Errors

Prevent non-zero exit codes from throwing:

```typescript
// Normal behavior - throws on error
try {
  await $`exit 1`;
} catch (error) {
  console.log('Threw error');
}

// With nothrow - returns result
const result = await $`exit 1`.nothrow();
console.log('Exit code:', result.exitCode); // 1
console.log('Success:', result.ok); // false

// Useful for checking existence
const exists = await $`which docker`.nothrow();
if (exists.ok) {
  console.log('Docker is installed');
}
```

### .quiet() - Suppress Logging

Run commands without console output:

```typescript
// Normal - logs command
await $`echo "This will be logged"`;
// > $ echo "This will be logged"

// Quiet - no logging
await $`echo "Silent execution"`.quiet();
// No output to console

// Combine with other methods
const result = await $`noisy-command`.quiet().text();

// Useful for:
// - Background tasks
// - Sensitive commands
// - Reducing log noise
```

### .stream() - Real-time Streaming

Stream output in real-time:

```typescript
// Stream to console
await $`npm install`.stream();

// Custom stream handlers
await $`long-running-command`.stream({
  stdout: (chunk) => {
    process.stdout.write(`[OUT] ${chunk}`);
  },
  stderr: (chunk) => {
    process.stderr.write(`[ERR] ${chunk}`);
  }
});

// Stream with transformation
await $`tail -f app.log`.stream({
  stdout: (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach(line => {
      if (line.includes('ERROR')) {
        console.error('🚨', line);
      } else {
        console.log('📝', line);
      }
    });
  }
});
```

### .pipe() - Pipe to Another Command

Chain commands together:

```typescript
// Simple pipe
await $`cat large-file.txt`.pipe($`grep pattern`);

// Multiple pipes
await $`cat data.json`
  .pipe($`jq '.items[]'`)
  .pipe($`grep active`)
  .pipe($`wc -l`);

// Pipe to Node.js stream
const output = fs.createWriteStream('output.txt');
await $`generate-data`.pipe(output);
```

## Method Chaining

### Combining Methods

Chain multiple methods for complex operations:

```typescript
// Quiet execution with JSON parsing
const config = await $`cat config.json`
  .quiet()
  .json();

// No throw with text output
const version = await $`node --version`
  .nothrow()
  .text();

// Stream quietly
await $`download-large-file`
  .quiet()
  .stream();
```

### Order Matters

Some methods must be called before execution:

```typescript
// ✅ Correct - quiet before execution
await $`echo "test"`.quiet();

// ❌ Wrong - quiet after execution
const result = await $`echo "test"`;
result.quiet(); // Too late!

// ✅ Correct order
const data = await $`cat data.json`
  .quiet()      // Before execution
  .nothrow()    // Before execution
  .json();      // After execution
```

## Working with Execution Results

### ExecutionResult Interface

```typescript
interface ExecutionResult {
  stdout: string;        // Standard output
  stderr: string;        // Standard error
  exitCode: number;      // Exit code (0 = success)
  signal?: string;       // Termination signal (if any)
  
  // Methods
  ok: boolean;           // True if exitCode === 0
  toString(): string;    // Returns stdout
}
```

### Using Results

```typescript
const result = await $`ls -la`;

// Check success
if (result.ok) {
  console.log('Files:', result.stdout);
} else {
  console.error('Failed:', result.stderr);
}

// String conversion
console.log(String(result)); // Same as result.stdout

// Destructuring
const { stdout, stderr, exitCode } = await $`command`;
```

## Advanced Patterns

### Conditional Execution

```typescript
// Execute based on previous result
const checkResult = await $`which docker`.nothrow();
if (checkResult.ok) {
  const version = await $`docker --version`.text();
  console.log('Docker version:', version);
} else {
  console.log('Docker not installed');
}
```

### Retrying with ProcessPromise

```typescript
async function retryCommand(times: number) {
  for (let i = 0; i < times; i++) {
    const result = await $`flaky-command`.nothrow();
    if (result.ok) {
      return result;
    }
    console.log(`Attempt ${i + 1} failed, retrying...`);
  }
  throw new Error('All attempts failed');
}
```

### Progress Tracking

```typescript
// Track download progress
const download = $`curl -L https://example.com/large-file -o file.zip`;

download.stderr.on('data', (chunk) => {
  const progress = chunk.toString();
  if (progress.includes('%')) {
    process.stdout.write(`\rDownloading: ${progress.trim()}`);
  }
});

await download;
console.log('\nDownload complete!');
```

### Timeout with ProcessPromise

```typescript
async function withTimeout(proc: ProcessPromise, ms: number) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
  
  try {
    return await Promise.race([proc, timeout]);
  } catch (error) {
    proc.kill();
    throw error;
  }
}

// Usage
const result = await withTimeout($`slow-command`, 5000);
```

## Error Handling Patterns

### Graceful Degradation

```typescript
// Try primary command, fall back to alternative
async function getSystemInfo() {
  // Try systemctl first
  let result = await $`systemctl status`.nothrow();
  if (result.ok) {
    return result.stdout;
  }
  
  // Fall back to service
  result = await $`service --status-all`.nothrow();
  if (result.ok) {
    return result.stdout;
  }
  
  // Last resort
  return 'Unable to get system info';
}
```

### Error Context

```typescript
try {
  await $`complex-command`;
} catch (error) {
  console.error('Command failed:', {
    command: error.command,
    exitCode: error.exitCode,
    stderr: error.stderr,
    stdout: error.stdout, // Sometimes contains error info
    signal: error.signal
  });
}
```

### Validation

```typescript
async function validateJSON(file: string) {
  try {
    await $`cat ${file}`.json();
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error.message 
    };
  }
}
```

## Performance Tips

### Avoid Repeated Execution

```typescript
// ❌ Bad - executes twice
const proc = $`expensive-command`;
const text = await proc.text();
const lines = await proc.lines(); // Executes again!

// ✅ Good - execute once
const result = await $`expensive-command`;
const text = result.stdout.trim();
const lines = result.stdout.trim().split('\n');
```

### Stream Large Outputs

```typescript
// ❌ Bad - buffers everything
const huge = await $`cat 10gb-file.txt`;

// ✅ Good - stream it
await $`cat 10gb-file.txt`.stream({
  stdout: (chunk) => processChunk(chunk)
});
```

### Use Appropriate Methods

```typescript
// ❌ Inefficient
const json = JSON.parse((await $`cat config.json`).stdout);

// ✅ Efficient
const json = await $`cat config.json`.json();
```

## Common Patterns

### Command Exists Check

```typescript
async function commandExists(cmd: string): Promise<boolean> {
  return (await $`which ${cmd}`.nothrow()).ok;
}
```

### Safe File Read

```typescript
async function readFileSafe(path: string): Promise<string | null> {
  const result = await $`cat ${path}`.nothrow();
  return result.ok ? result.text() : null;
}
```

### Parse or Default

```typescript
async function getConfig(file: string, defaults = {}) {
  try {
    return await $`cat ${file}`.json();
  } catch {
    return defaults;
  }
}
```

### Output Capture

```typescript
class OutputCapture {
  stdout: string[] = [];
  stderr: string[] = [];
  
  async capture(proc: ProcessPromise) {
    proc.stdout.on('data', chunk => 
      this.stdout.push(chunk.toString())
    );
    proc.stderr.on('data', chunk => 
      this.stderr.push(chunk.toString())
    );
    return await proc;
  }
}
```