---
sidebar_position: 1
---

# Local Adapter

The Local Adapter executes commands on the local machine where your script is running. It's the default adapter and provides the foundation for all command execution in @xec-sh/core.

## Overview

The Local Adapter:
- Executes commands using the system's default shell
- Supports all standard shell features
- Provides streaming output and full control over execution
- Handles environment variables and working directory changes
- Manages process lifecycle and signal handling

## Basic Usage

The global `$` function uses the Local Adapter by default:

```typescript
import { $ } from '@xec-sh/core';

// These all use the Local Adapter
await $`echo "Hello, World!"`;
await $`ls -la`;
await $`npm install`;
```

## Explicit Local Adapter

You can explicitly create a local execution context:

```typescript
// Create explicit local context
const local = $.local();

// All commands use local execution
await local`pwd`;
await local`whoami`;
```

## Configuration

### Shell Selection

```typescript
// Use specific shell
const bash = $.shell('/bin/bash');
await bash`echo $BASH_VERSION`;

const zsh = $.shell('/bin/zsh');
await zsh`echo $ZSH_VERSION`;

// Disable shell (direct execution)
const direct = $.shell(false);
await direct`echo "No shell interpolation"`;
```

### Working Directory

```typescript
// Change directory for commands
const tmp = $.cd('/tmp');
await tmp`pwd`; // Output: /tmp

// Chain directory changes
const deep = $.cd('/tmp').cd('subfolder');
await deep`pwd`; // Output: /tmp/subfolder
```

### Environment Variables

```typescript
// Set environment variables
const prod = $.env({ NODE_ENV: 'production' });
await prod`node -e "console.log(process.env.NODE_ENV)"`; // Output: production

// Multiple variables
const configured = $.env({
  NODE_ENV: 'test',
  DEBUG: 'app:*',
  PORT: '3000'
});
await configured`npm test`;
```

### Timeouts

```typescript
// Set command timeout
const quick = $.timeout(5000); // 5 seconds
await quick`sleep 2`; // OK

try {
  await quick`sleep 10`; // Will timeout
} catch (error) {
  console.error('Command timed out');
}
```

## Advanced Features

### Signal Handling

```typescript
// Handle SIGTERM gracefully
const proc = $`node long-running-server.js`;

// Send signal after delay
setTimeout(() => {
  proc.kill('SIGTERM');
}, 5000);

try {
  await proc;
} catch (error) {
  console.log('Process terminated');
}
```

### Process Control

```typescript
// Get process details
const sleep = $`sleep 30`;

// Access process ID
console.log('PID:', sleep.pid);

// Kill process
sleep.kill();

// Check if running
console.log('Killed:', sleep.killed);
```

### Input/Output Control

```typescript
// Provide stdin input
const result = await $`cat`.stdin('Hello from stdin\n');
console.log(result.stdout); // Output: Hello from stdin

// Pipe commands
const piped = await $`echo "hello world"`.pipe($`tr 'a-z' 'A-Z'`);
console.log(piped.stdout); // Output: HELLO WORLD
```

### Streaming Output

```typescript
// Stream to console
await $`npm install`.stream();

// Custom stream handlers
await $`tail -f /var/log/app.log`.stream({
  stdout: (chunk) => console.log('[LOG]', chunk),
  stderr: (chunk) => console.error('[ERR]', chunk)
});

// Process line by line
await $`find . -name "*.js"`.pipe(async (line) => {
  console.log('Found:', line);
  // Can be async
  await processFile(line);
});
```

## Platform Differences

### Windows Support

The Local Adapter automatically handles platform differences:

```typescript
// Works on all platforms
await $`echo "Hello"`;

// Platform-specific commands
if (process.platform === 'win32') {
  await $`dir`;
} else {
  await $`ls`;
}
```

### Shell Differences

```typescript
// Detect available shells
const shells = ['/bin/bash', '/bin/zsh', '/bin/sh'];

for (const shell of shells) {
  const result = await $`which ${shell}`.nothrow();
  if (result.isSuccess()) {
    console.log(`${shell} is available`);
  }
}
```

## Error Handling

### Exit Codes

```typescript
// Default: throws on non-zero exit
try {
  await $`exit 1`;
} catch (error) {
  console.error('Exit code:', error.exitCode);
  console.error('Stderr:', error.stderr);
}

// Suppress errors
const result = await $`exit 1`.nothrow();
if (!result.isSuccess()) {
  console.log('Failed with code:', result.exitCode);
}
```

### Command Not Found

```typescript
try {
  await $`nonexistentcommand`;
} catch (error) {
  if (error.message.includes('command not found')) {
    console.error('Command not available');
  }
}
```

## Security Considerations

### Command Injection Protection

```typescript
// User input is automatically escaped
const userInput = "'; rm -rf /; echo '";
await $`echo ${userInput}`; // Safe - prints the string

// For complex shell features, use raw mode
const pattern = "*.{js,ts}";
await $.raw`ls ${pattern}`; // Shell expansion works
```

### Path Security

```typescript
// Always use absolute paths in production
const scriptPath = path.resolve('./script.sh');
await $`bash ${scriptPath}`;

// Validate paths
if (!scriptPath.startsWith('/allowed/path/')) {
  throw new Error('Invalid script path');
}
```

## Performance Tips

### Reuse Configurations

```typescript
// Create reusable configurations
const nodeEnv = $.env({ NODE_ENV: 'production' })
                .timeout(30000)
                .cd('/app');

// Use multiple times
await nodeEnv`npm start`;
await nodeEnv`npm test`;
```

### Avoid Shell Overhead

```typescript
// When shell features aren't needed
const fast = $.shell(false);
await fast`echo "Direct execution"`;
```

### Batch Operations

```typescript
// Combine commands when possible
await $`mkdir -p output && cd output && touch file.txt`;

// Instead of
await $`mkdir -p output`;
await $.cd('output')`touch file.txt`;
```

## Common Patterns

### Check Command Availability

```typescript
async function hasCommand(cmd: string): Promise<boolean> {
  const result = await $`which ${cmd}`.nothrow();
  return result.isSuccess();
}

// Usage
if (await hasCommand('docker')) {
  await $`docker ps`;
}
```

### Retry on Failure

```typescript
async function runWithRetry(cmd: () => Promise<any>, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await cmd();
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      console.log(`Attempt ${i + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Usage
await runWithRetry(() => $`curl https://api.example.com`);
```

### Background Processes

```typescript
// Start background process
const server = $`node server.js`.nothrow();

// Do other work
await $`curl http://localhost:3000/health`;

// Stop server
server.kill();
await server;
```

## Integration with CI/CD

### GitHub Actions

```typescript
// Detect CI environment
const isCI = process.env.CI === 'true';

if (isCI) {
  // Use CI-specific commands
  await $`echo "::group::Build Output"`;
  await $`npm run build`;
  await $`echo "::endgroup::"`;
} else {
  // Local development
  await $`npm run build`.stream();
}
```

### Error Reporting

```typescript
try {
  await $`npm test`;
} catch (error) {
  // Enhanced error reporting in CI
  if (process.env.GITHUB_ACTIONS) {
    await $`echo "::error title=Test Failed::${error.message}"`;
  }
  throw error;
}
```

## Best Practices

1. **Always handle errors** - Use try-catch or `.nothrow()`
2. **Validate user input** - Even though escaping is automatic
3. **Use absolute paths** - Especially in production
4. **Set timeouts** - Prevent hanging processes
5. **Stream large outputs** - Don't buffer everything in memory
6. **Clean up resources** - Kill long-running processes when done

## Next Steps

- Learn about [SSH Adapter](./ssh) for remote execution
- Explore [Docker Adapter](./docker) for container execution
- See [Parallel Execution](../advanced/parallel-execution) for concurrent commands
- Check [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) for real-world usage