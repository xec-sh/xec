---
sidebar_position: 2
---

# ProcessPromise API

Chainable promise-based API for executing commands with rich configuration and output handling.

## Overview

`ProcessPromise` extends the native `Promise` class and provides a fluent API specifically designed for command execution. It enables:

- **Chainable configuration** - Modify command behavior before execution
- **Multiple output formats** - text, JSON, lines, buffer
- **Stream processing** - Handle large outputs efficiently
- **Error control** - Timeouts, retries, non-throwing mode
- **Process management** - Kill, signal handling, stdin access
- **Result transformation** - Built-in parsers and converters

## Interface

```typescript
interface ProcessPromise extends Promise<ExecutionResult> {
  // Stream access
  stdin: NodeJS.WritableStream;
  
  // Configuration methods
  cwd(dir: string): ProcessPromise;
  env(env: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  timeout(ms: number, timeoutSignal?: string): ProcessPromise;
  signal(signal: AbortSignal): ProcessPromise;
  
  // Behavior modifiers
  quiet(): ProcessPromise;
  nothrow(): ProcessPromise;
  interactive(): ProcessPromise;
  retry(options?: RetryOptions): ProcessPromise;
  cache(options?: CacheOptions): ProcessPromise;
  
  // Stream configuration
  stdout(stream: StreamOption): ProcessPromise;
  stderr(stream: StreamOption): ProcessPromise;
  
  // Piping
  pipe(target: ProcessPromise | WritableStream | TemplateStringsArray, ...args: any[]): ProcessPromise;
  
  // Output formats
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  lines(): Promise<string[]>;
  buffer(): Promise<Buffer>;
  
  // Process control
  kill(signal?: string): void;
  
  // Process info
  child?: any;
  exitCode: Promise<number | null>;
}
```

## Configuration Methods

### Working Directory

```typescript
// Change working directory for command
const files = await $`ls -la`
  .cwd('/tmp')
  .lines();

// Relative paths are resolved
await $`npm install`
  .cwd('./packages/core');
```

### Environment Variables

```typescript
// Set environment variables
const result = await $`echo $NODE_ENV $DEBUG`
  .env({ 
    NODE_ENV: 'production',
    DEBUG: 'app:*' 
  })
  .text();

// Merge with existing environment
await $`npm test`
  .env({ ...process.env, CI: 'true' });
```

### Shell Configuration

```typescript
// Disable shell (direct execution)
await $`echo hello`.shell(false);

// Use specific shell
await $`echo $0`.shell('/bin/zsh');

// Force shell interpretation
await $`source ~/.profile && mycommand`.shell(true);
```

### Timeout Control

```typescript
// Set timeout in milliseconds
await $`long-running-task`
  .timeout(5000); // 5 seconds

// Custom signal on timeout
await $`server-process`
  .timeout(10000, 'SIGKILL'); // Force kill after 10s

// Handle timeout error
try {
  await $`sleep 60`.timeout(1000);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.log('Command timed out');
  }
}
```

### Signal Handling

```typescript
// Use AbortController for cancellation
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await $`long-process`
    .signal(controller.signal);
} catch (error) {
  if (error.code === 'ABORT_ERR') {
    console.log('Process was aborted');
  }
}

// Integrate with other async operations
async function fetchWithCommand(url: string, signal: AbortSignal) {
  const [apiData, commandData] = await Promise.all([
    fetch(url, { signal }),
    $`process-data`.signal(signal).json()
  ]);
  return { apiData, commandData };
}
```

## Behavior Modifiers

### Quiet Mode

```typescript
// Suppress stdout/stderr output to console
await $`noisy-command --verbose`
  .quiet();

// Still capture output in result
const result = await $`echo "hidden"`
  .quiet();
console.log(result.stdout); // "hidden\n"
```

### Non-Throwing Mode

```typescript
// Don't throw on non-zero exit codes
const result = await $`exit 42`
  .nothrow();

console.log(result.exitCode); // 42
console.log(result.stderr); // Error message if any

// Check success
if (result.exitCode === 0) {
  console.log('Success!');
} else {
  console.log(`Failed with code ${result.exitCode}`);
}
```

### Interactive Mode

```typescript
// Inherit stdio for interactive commands
await $`npm init`
  .interactive();

// User can interact with prompts
await $`ssh user@host`
  .interactive();

// Combine with other options
await $`docker run -it ubuntu bash`
  .interactive()
  .cwd('/workspace');
```

### Retry Logic

```typescript
// Retry failed commands
await $`flaky-network-call`
  .retry({
    maxRetries: 3,
    delay: 1000,
    backoff: 'exponential',
    factor: 2
  });

// Simple retry with defaults
await $`curl https://unstable-api.com`
  .retry(); // 3 retries with exponential backoff

// Conditional retry
await $`test-connection`
  .retry({
    maxRetries: 5,
    shouldRetry: (error, attempt) => {
      // Only retry on network errors
      return error.code === 'ENETUNREACH';
    }
  });
```

### Result Caching

```typescript
// Cache command results
const data = await $`expensive-computation`
  .cache(); // Default 60s TTL

// Custom cache configuration
const result = await $`curl https://api.example.com/data`
  .cache({
    ttl: 300000,        // 5 minutes
    key: 'api-data-v1', // Custom cache key
    invalidateOn: ['data-update'] // Event-based invalidation
  });

// Force cache refresh
const fresh = await $`get-latest-data`
  .cache({ refresh: true });
```

## Output Formats

### Text Output

```typescript
// Get stdout as trimmed string
const version = await $`node --version`.text();
// "v18.16.0" (no trailing newline)

// Handles encoding
const utf8Text = await $`cat unicode.txt`.text();
```

### JSON Output

```typescript
// Parse stdout as JSON
const pkg = await $`cat package.json`.json();
console.log(pkg.name, pkg.version);

// With TypeScript types
interface User {
  id: number;
  name: string;
  email: string;
}

const users = await $`curl https://api.example.com/users`
  .json<User[]>();

// Error handling for invalid JSON
try {
  await $`echo "not json"`.json();
} catch (error) {
  console.error('Invalid JSON:', error.message);
}
```

### Lines Output

```typescript
// Split stdout into array of lines
const files = await $`ls -1`.lines();
// ["file1.txt", "file2.txt", "folder"]

// Empty lines are filtered out
const nonEmpty = await $`cat file.txt`.lines();

// Process large files line by line
const logLines = await $`tail -1000 app.log | grep ERROR`.lines();
for (const line of logLines) {
  console.log('Error:', line);
}
```

### Buffer Output

```typescript
// Get raw stdout as Buffer
const imageData = await $`cat image.png`.buffer();

// Process binary data
const compressed = await $`gzip -c`
  .stdin(originalData)
  .buffer();

// Save to file
import { writeFile } from 'fs/promises';
const pdfContent = await $`generate-pdf`.buffer();
await writeFile('output.pdf', pdfContent);
```

## Stream Processing

### Stdout Streaming

```typescript
// Stream to file
import { createWriteStream } from 'fs';

const logFile = createWriteStream('output.log');
await $`npm test`
  .stdout(logFile);

// Stream to process.stdout
await $`docker logs -f container`
  .stdout(process.stdout);

// Custom stream processing
await $`tail -f /var/log/app.log`
  .stdout((chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach(line => {
      if (line.includes('ERROR')) {
        console.error('🚨', line);
      }
    });
  });
```

### Stderr Streaming

```typescript
// Separate error handling
const errors = [];
await $`npm test`
  .stderr((chunk) => {
    errors.push(chunk.toString());
  })
  .nothrow();

// Redirect stderr to file
const errorLog = createWriteStream('errors.log');
await $`command-with-warnings`
  .stderr(errorLog);
```

### Stdin Writing

```typescript
// Send data to stdin
const result = await $`wc -l`
  .stdin('line1\nline2\nline3\n');
console.log(result.text()); // "3"

// Stream data to stdin
const compress = $`gzip > output.gz`;
compress.stdin.write('First chunk\n');
compress.stdin.write('Second chunk\n');
compress.stdin.end();
await compress;

// Pipe from file
import { createReadStream } from 'fs';
const input = createReadStream('input.txt');
await $`sort | uniq`
  .stdin(input);
```

## Piping

### Command to Command

```typescript
// Basic pipe
await $`echo "hello world"`
  .pipe($`tr 'a-z' 'A-Z'`);
// Output: "HELLO WORLD"

// Multiple pipes
await $`cat data.txt`
  .pipe($`grep ERROR`)
  .pipe($`sort`)
  .pipe($`uniq -c`);

// Conditional piping
const result = await $`find . -name "*.js"`
  .pipe(includeTests ? $`cat` : $`grep -v test`);
```

### Command to Stream

```typescript
// Pipe to Node.js transform stream
import { Transform } from 'stream';

const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

await $`echo "hello"`
  .pipe(upperCase)
  .pipe(process.stdout);

// Pipe to file stream
const output = createWriteStream('sorted.txt');
await $`sort input.txt`
  .pipe(output);
```

### Template Literal Piping

```typescript
// Pipe using template literals
const count = await $`ls -la`
  .pipe`wc -l`
  .text();

// With interpolation
const pattern = '*.js';
await $`find . -name ${pattern}`
  .pipe`xargs grep TODO`;
```

## Error Handling

### Error Properties

```typescript
try {
  await $`false`;
} catch (error) {
  // CommandError includes:
  console.log(error.message);     // Human-readable error
  console.log(error.exitCode);    // Exit code (1)
  console.log(error.stdout);      // Standard output
  console.log(error.stderr);      // Standard error  
  console.log(error.command);     // Command that failed
  console.log(error.duration);    // Execution time in ms
  console.log(error.signal);      // Termination signal if any
}
```

### Error Recovery

```typescript
// Fallback on error
const config = await $`cat config.json`
  .json()
  .catch(() => ({ 
    default: true,
    retries: 3 
  }));

// Check file existence
const exists = await $`test -f important.txt`
  .nothrow()
  .then(r => r.exitCode === 0);

if (!exists) {
  await $`touch important.txt`;
}
```

### Detailed Error Context

```typescript
class CommandLogger {
  async run(cmd: ProcessPromise) {
    const start = Date.now();
    
    try {
      const result = await cmd;
      console.log({
        status: 'success',
        duration: Date.now() - start,
        command: result.command
      });
      return result;
    } catch (error) {
      console.error({
        status: 'failed',
        duration: Date.now() - start,
        command: error.command,
        exitCode: error.exitCode,
        stderr: error.stderr,
        stdout: error.stdout
      });
      throw error;
    }
  }
}
```

## Process Control

### Killing Processes

```typescript
// Start long-running process
const server = $`npm run dev`;

// Kill after 5 seconds
setTimeout(() => {
  server.kill(); // Default SIGTERM
}, 5000);

// Force kill
const stubborn = $`while true; do sleep 1; done`;
setTimeout(() => {
  stubborn.kill('SIGKILL');
}, 1000);

// Graceful shutdown
const app = $`node server.js`;
process.on('SIGINT', () => {
  app.kill('SIGINT');
  process.exit(0);
});
```

### Exit Code Access

```typescript
// Get exit code directly
const exitCode = await $`exit 42`
  .nothrow()
  .exitCode;
console.log(exitCode); // 42

// Check success without executing
const check = $`test -f config.json`.nothrow();
const exists = await check.exitCode === 0;
```

### Child Process Access

```typescript
// Access underlying child process
const proc = $`long-running-command`;

// Get process ID
console.log('PID:', proc.child?.pid);

// Monitor process
proc.child?.on('spawn', () => {
  console.log('Process started');
});

// Wait for result
await proc;
```

## Advanced Patterns

### Progress Tracking

```typescript
async function processFiles(files: string[]) {
  const total = files.length;
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Show progress
    process.stdout.write(`\rProcessing: ${i + 1}/${total}`);
    
    const result = await $`process-file ${file}`
      .quiet()
      .nothrow();
    
    results.push({
      file,
      success: result.exitCode === 0,
      output: result.stdout
    });
  }
  
  console.log('\nComplete!');
  return results;
}
```

### Parallel Execution

```typescript
// Run commands in parallel
async function runTests() {
  const suites = ['unit', 'integration', 'e2e'];
  
  const results = await Promise.all(
    suites.map(suite => 
      $`npm run test:${suite}`
        .nothrow()
        .then(r => ({ suite, ...r }))
    )
  );
  
  // Check results
  const failed = results.filter(r => r.exitCode !== 0);
  if (failed.length > 0) {
    console.error('Failed suites:', failed.map(f => f.suite));
    process.exit(1);
  }
}
```

### Stream Processing Pipeline

```typescript
// Process large log files efficiently
async function analyzeLogs(logFile: string) {
  const errorCounts = new Map<string, number>();
  
  await $`tail -f ${logFile}`
    .stdout((chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        const match = line.match(/ERROR \[(\w+)\]/);
        if (match) {
          const category = match[1];
          errorCounts.set(
            category, 
            (errorCounts.get(category) || 0) + 1
          );
        }
      }
    })
    .timeout(60000); // Run for 1 minute
  
  return errorCounts;
}
```

### Conditional Chains

```typescript
// Build command based on conditions
async function deploy(env: string, options: DeployOptions) {
  let cmd = $`deploy.sh ${env}`;
  
  if (options.migrate) {
    cmd = cmd.env({ RUN_MIGRATIONS: 'true' });
  }
  
  if (options.skipTests) {
    cmd = cmd.env({ SKIP_TESTS: 'true' });
  }
  
  if (options.verbose) {
    cmd = cmd.stdout(process.stdout);
  } else {
    cmd = cmd.quiet();
  }
  
  if (options.timeout) {
    cmd = cmd.timeout(options.timeout);
  }
  
  return await cmd;
}
```

## Integration Examples

### With SSH

```typescript
const $ssh = $.ssh({ 
  host: 'server.com', 
  username: 'deploy' 
});

// All ProcessPromise methods work
const logs = await $ssh`tail -100 /var/log/app.log`
  .timeout(5000)
  .lines();

const stats = await $ssh`df -h`
  .quiet()
  .text();
```

### With Docker

```typescript
const container = $.docker({ 
  container: 'database' 
});

// Execute with modifications
const backup = await container`pg_dump mydb`
  .env({ PGPASSWORD: 'secret' })
  .timeout(300000) // 5 minutes
  .buffer();

// Save backup
await writeFile('backup.sql', backup);
```

### With Kubernetes

```typescript
const pod = $.k8s()
  .pod('web-app');

// Stream logs with timeout
await pod.exec`tail -f /app/logs/access.log`
  .stdout((chunk) => {
    // Process access logs
  })
  .timeout(60000)
  .nothrow();
```

## Best Practices

1. **Chain before execution** - Configure everything before the promise resolves
   ```typescript
   // ✅ Good
   const result = await $`command`.quiet().timeout(5000);
   
   // ❌ Bad - already executing
   const promise = $`command`;
   await promise.quiet(); // Too late!
   ```

2. **Use appropriate output method**
   ```typescript
   // ✅ Text for simple strings
   const name = await $`hostname`.text();
   
   // ✅ JSON for structured data  
   const data = await $`curl api.example.com`.json();
   
   // ✅ Lines for lists
   const files = await $`ls -1`.lines();
   ```

3. **Handle errors explicitly**
   ```typescript
   // ✅ Good - explicit error handling
   const result = await $`risky-command`.nothrow();
   if (!result.exitCode === 0) {
     // Handle error
   }
   
   // ✅ Good - with fallback
   const data = await $`cat data.json`
     .json()
     .catch(() => defaultData);
   ```

4. **Set timeouts for network operations**
   ```typescript
   // ✅ Prevent hanging
   await $`curl https://slow-api.com`
     .timeout(10000);
   ```

5. **Use quiet mode in production**
   ```typescript
   // ✅ Reduce log noise
   await $`daily-backup.sh`
     .quiet()
     .nothrow();
   ```

## TypeScript Support

ProcessPromise is fully typed with TypeScript:

```typescript
import { ProcessPromise, ExecutionResult } from '@xec-sh/core';

// Return type inference
const text: string = await $`echo hello`.text();
const lines: string[] = await $`ls`.lines();
const buffer: Buffer = await $`cat binary`.buffer();

// Generic JSON parsing
interface Config {
  port: number;
  host: string;
}
const config = await $`cat config.json`.json<Config>();

// Error types
try {
  await $`false`;
} catch (error: CommandError) {
  const code: number = error.exitCode;
  const output: string = error.stdout;
}

// Method chaining preserves types
const promise: ProcessPromise = $`echo test`
  .quiet()
  .timeout(1000)
  .env({ FOO: 'bar' });
```

## Related APIs

- [ExecutionEngine](./execution-engine) - Core engine that creates ProcessPromise
- [Adapters](./adapters) - Different execution environments
- [Events](./events) - Monitor command execution lifecycle
- [Types](./types) - Complete TypeScript definitions