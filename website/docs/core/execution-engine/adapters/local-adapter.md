---
title: LocalAdapter
sidebar_label: Local Adapter
description: Command execution in local system through child_process
---

# LocalAdapter - Local Execution

LocalAdapter provides command execution in the local system through Node.js child_process API. This is the basic and most performant adapter.

## Core Features

- ✅ Direct execution through spawn/spawnSync
- ✅ Bun runtime support
- ✅ Synchronous and asynchronous execution
- ✅ Stream output processing
- ✅ Full process control
- ✅ Minimal overhead

## Usage

### Basic Execution

```typescript
import { $ } from '@xec-sh/core';

// LocalAdapter is used by default
await $`ls -la`;

// Explicit specification
const local = $.local();
await local`pwd`;
```

### Configuration

```typescript
const $ = new ExecutionEngine({
  adapters: {
    local: {
      preferBun: true,          // Prefer Bun runtime
      uid: 1000,                // Unix user ID
      gid: 1000,                // Unix group ID
      killSignal: 'SIGTERM',    // Signal for termination
      defaultShell: '/bin/bash' // Default shell
    }
  }
});
```

## Execution Modes

### Shell Mode

```typescript
// Automatic shell (true)
await $`echo $HOME && ls *.txt`;

// Specific shell
await $`echo $0`.shell('/bin/zsh');

// Without shell (false) - safer
await $`ls`.shell(false);
```

### Synchronous Execution

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const $ = new ExecutionEngine();
const adapter = $.getAdapter('local');

// Synchronous execution (blocks event loop)
const result = adapter.executeSync({
  command: 'ls',
  args: ['-la'],
  shell: false
});

console.log(result.stdout);
```

## Process Management

### Signals and Termination

```typescript
// Graceful shutdown with timeout
const server = $`node server.js`;

setTimeout(() => {
  server.kill('SIGTERM');  // Graceful termination
  
  setTimeout(() => {
    server.kill('SIGKILL'); // Force termination
  }, 5000);
}, 30000);

await server;
```

### AbortController

```typescript
const controller = new AbortController();

const longTask = $`sleep 100`.signal(controller.signal);

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await longTask;
} catch (error) {
  console.log('Task aborted');
}
```

## Stream Handling

### Stdin

```typescript
// String
await $`cat`.stdin('Hello, World!');

// Buffer
const data = Buffer.from('binary data');
await $`process`.stdin(data);

// Stream
import { createReadStream } from 'fs';
const stream = createReadStream('input.txt');
await $`sort`.stdin(stream);
```

### Stdout/Stderr

```typescript
// Redirect to file
import { createWriteStream } from 'fs';
const output = createWriteStream('output.txt');
await $`ls -la`.stdout(output);

// Inherit - output to console
await $`npm install`.stdout('inherit').stderr('inherit');

// Ignore - ignore output
await $`noisy-command`.stdout('ignore');

// Pipe - default, collects output
const result = await $`echo test`.stdout('pipe');
console.log(result.stdout); // 'test\n'
```

## Environment and Context

### Working Directory

```typescript
// Change directory
await $`pwd`.cwd('/tmp');  // Output: /tmp

// Chain with cd
const project = $.cd('/projects/my-app');
await project`npm install`;
await project`npm test`;
```

### Environment Variables

```typescript
// Add variables
await $`node app.js`.env({
  NODE_ENV: 'production',
  PORT: '3000'
});

// Merge with existing
const withEnv = $.env({ API_KEY: 'secret' });
await withEnv`curl $API_URL`;

// Clear environment
await $`printenv`.env({});  // Empty environment
```

## Error Handling

### Exit Codes

```typescript
// By default throws exception when exitCode !== 0
try {
  await $`exit 1`;
} catch (error) {
  console.log('Exit code:', error.exitCode);  // 1
  console.log('Stderr:', error.stderr);
}

// Disable exceptions
const result = await $`exit 1`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed');
}
```

### Timeouts

```typescript
// Execution timeout
try {
  await $`sleep 100`.timeout(1000);  // 1 second
} catch (error) {
  console.log('Command timed out');
}

// With custom signal
await $`server`.timeout(5000, 'SIGINT');
```

## Interactive Mode

```typescript
// Fully interactive
await $`npm init`.interactive();

// Partially interactive
await $`ssh user@host`
  .stdin(process.stdin)
  .stdout('inherit')
  .stderr('inherit');
```

## Bun Runtime Support

```typescript
const $ = new ExecutionEngine({
  adapters: {
    local: {
      preferBun: true,  // Use Bun if available
      forceImplementation: 'bun' // Force Bun
    }
  }
});

// Auto-detection
if (RuntimeDetector.isBun()) {
  console.log('Running with Bun!');
}
```

## Performance

### Mode Comparison

| Mode | Speed | Security | Usage |
|------|-------|----------|-------|
| shell: false | Fast | High | Simple commands |
| shell: true | Medium | Medium | Complex pipelines |
| shell: '/bin/sh' | Fast | Medium | POSIX compatibility |
| sync | Very fast | High | Scripts, CLI |

### Optimizations

```typescript
// Process reuse
const node = $`node`.interactive();
for (const script of scripts) {
  await node.stdin.write(`require('${script}')\n`);
}

// Batch processing
const files = ['file1', 'file2', 'file3'];
await $`process ${files}`;  // One process

// Instead of:
for (const file of files) {
  await $`process ${file}`;  // N processes
}
```

## Platform-Specific Commands

```typescript
import { platform } from 'os';

// Cross-platform commands
const isWindows = platform() === 'win32';
const listCmd = isWindows ? 'dir' : 'ls -la';
await $`${listCmd}`;

// Or through shell
if (isWindows) {
  await $`dir`.shell('cmd.exe');
} else {
  await $`ls -la`.shell('/bin/bash');
}
```

## Debugging

### Command Logging

```typescript
const $ = new ExecutionEngine();

$.on('command:start', ({ command, cwd }) => {
  console.log(`[LOCAL] Executing: ${command} in ${cwd}`);
});

$.on('command:complete', ({ exitCode, duration }) => {
  console.log(`[LOCAL] Completed: exit=${exitCode}, time=${duration}ms`);
});
```

### Detailed Output

```typescript
// Verbose mode
const verbose = $.with({
  stdout: 'inherit',
  stderr: 'inherit'
});

await verbose`npm install`;  // Real-time output
```

## Security

### Injection Prevention

```typescript
// Dangerous - shell injection
const userInput = "'; rm -rf /";
await $.raw`echo ${userInput}`;  // DON'T DO THIS!

// Safe - automatic escaping
await $`echo ${userInput}`;  // Output: '; rm -rf /

// Even safer - without shell
await $.local().execute({
  command: 'echo',
  args: [userInput],
  shell: false
});
```

### Resource Limitation

```typescript
// Limit output size
const $ = new ExecutionEngine({
  maxBuffer: 1024 * 1024  // 1MB maximum
});

// Limit execution time
await $`untrusted-script`
  .timeout(5000)  // 5 seconds maximum
  .nothrow();     // Don't fail on error
```

## Usage Examples

### Git Operations

```typescript
async function gitStatus() {
  const status = await $`git status --porcelain`.text();
  if (status) {
    const files = status.split('\n').filter(Boolean);
    console.log(`Changed files: ${files.length}`);
    
    for (const file of files) {
      const [status, path] = file.split(/\s+/);
      console.log(`  ${status}: ${path}`);
    }
  }
}
```

### System Monitoring

```typescript
async function systemInfo() {
  const [cpu, memory, disk] = await Promise.all([
    $`top -bn1 | head -5`.text(),
    $`free -h`.text(),
    $`df -h`.text()
  ]);
  
  return { cpu, memory, disk };
}
```

### Build Pipeline

```typescript
async function build() {
  // Clean
  await $`rm -rf dist`;
  
  // Install dependencies
  await $`npm ci`.stdout('inherit');
  
  // Linting
  const lintResult = await $`npm run lint`.nothrow();
  if (lintResult.exitCode !== 0) {
    console.warn('Lint warnings:', lintResult.stderr);
  }
  
  // Build
  await $`npm run build`;
  
  // Tests
  await $`npm test`;
}
```

## Troubleshooting

### PATH Issues

```typescript
// Explicit path specification
await $`/usr/local/bin/node script.js`;

// Or through env
await $`node script.js`.env({
  PATH: '/usr/local/bin:/usr/bin:/bin'
});
```

### Encoding Issues

```typescript
// Specify encoding
const $ = new ExecutionEngine({
  encoding: 'latin1'  // or 'utf16le', 'base64', etc.
});

// Or for specific command
const result = await $.execute({
  command: 'cat file.txt',
  encoding: 'utf8'
});
```

### Zombie Processes

```typescript
// Always clean up resources
const engine = new ExecutionEngine();

try {
  await engine`long-running-task`;
} finally {
  await engine.dispose();  // Clean up all processes
}
```

## Conclusion

LocalAdapter is the foundation for fast and secure command execution in the local system. Its advantages:

- **Performance**: minimal overhead
- **Flexibility**: full process control
- **Security**: automatic escaping
- **Compatibility**: works everywhere Node.js is available
- **Simplicity**: intuitive API