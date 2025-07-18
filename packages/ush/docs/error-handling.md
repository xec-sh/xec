# Error Handling

@xec-js/ush provides comprehensive error handling mechanisms that help you deal with command failures gracefully and predictably.

## Default Error Behavior

By default, @xec-js/ush throws a `CommandError` when a command exits with a non-zero exit code:

```javascript
try {
  await $`cat /etc/shadow`;       // Requires root - will throw CommandError
} catch (error) {
  console.error('Command failed!');
  console.error('Exit code:', error.exitCode);        // Non-zero exit code
  console.error('Stderr:', error.stderr);            // Error output
  console.error('Stdout:', error.stdout);            // Standard output
  console.error('Command:', error.command);          // Original command
  console.error('Duration:', error.duration);        // Execution time in ms
}
```

## Understanding Exit Codes

Exit codes are the standard way commands communicate their success or failure:

```javascript
// Common exit codes and their meanings:
// 0    = Success
// 1    = General failure
// 2    = Misuse of shell builtins
// 126  = Command not executable
// 127  = Command not found
// 128+ = Fatal error signal "n" (e.g., 130 = Ctrl+C)

// Examples:
await $`echo "hello"`;           // Exit code 0 - success
await $`grep "missing" file.txt`; // Exit code 1 - pattern not found
await $`command-not-found`;       // Exit code 127 - command not found
```

## Nothrow Mode - Handling Failures Gracefully

Use `.nothrow()` to prevent exceptions and handle exit codes manually:

```javascript
// Don't throw on non-zero exit codes
const result = await $`grep "pattern" file.txt`.nothrow();

if (result.exitCode === 0) {
  console.log('Pattern found:', result.stdout);
} else if (result.exitCode === 1) {
  console.log('Pattern not found - this is normal for grep');
} else {
  console.log('Actual error occurred:', result.stderr);
}
```

### Advanced Nothrow Usage

```javascript
// Check if a file exists without throwing
const fileExists = await $`test -f /path/to/file`.nothrow();
if (fileExists.exitCode === 0) {
  console.log('File exists');
} else {
  console.log('File does not exist');
}

// Try multiple commands with fallback
async function getConfig() {
  // Try primary config
  const primary = await $`cat /etc/app/config.json`.nothrow();
  if (primary.exitCode === 0) {
    return JSON.parse(primary.stdout);
  }
  
  // Try user config
  const user = await $`cat ~/.config/app/config.json`.nothrow();
  if (user.exitCode === 0) {
    return JSON.parse(user.stdout);
  }
  
  // Use defaults
  return { host: 'localhost', port: 3000 };
}
```

### Method Chaining with Nothrow

⚠️ **Important**: When using `.nothrow()` with other methods, always call `.nothrow()` first:

```javascript
// ✅ CORRECT - nothrow() first
const result = await $`command`.nothrow().timeout(5000);

// ✅ CORRECT - nothrow() first
const result = await $`command`.nothrow().quiet();

// ❌ INCORRECT - may not work as expected
const result = await $`command`.timeout(5000).nothrow();
```

## Global Error Handling Configuration

You can configure global error handling behavior:

```javascript
// Don't throw on non-zero exit codes globally
const engine = new ExecutionEngine({
  throwOnNonZeroExit: false
});

// Now ALL commands won't throw by default
const result1 = await engine.execute('exit 1');  // Won't throw
const result2 = await engine.execute('exit 0');  // Won't throw

// You can still check exit codes
if (result1.exitCode !== 0) {
  console.error('Command failed:', result1.stderr);
}
```

### Command-Level Nothrow Configuration

You can also set nothrow behavior when creating commands:

```javascript
const command = engine.createProcessPromise({
  command: 'grep pattern file.txt',
  nothrow: true,  // This command won't throw
  adapter: 'local'
});

const result = await command;
// No exception thrown, even if exit code is non-zero
```

## Error Types

@xec-js/ush provides specific error types for different scenarios:

```javascript
import { CommandError, TimeoutError, AdapterError } from '@xec-js/ush';

try {
  await $`slow-command`.timeout(1000);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Command timed out after', error.timeout, 'ms');
  } else if (error instanceof CommandError) {
    console.log('Command failed with exit code:', error.exitCode);
  } else if (error instanceof AdapterError) {
    console.log('Adapter error:', error.message);
  }
}
```

### CommandError

Thrown when a command exits with a non-zero exit code:

```javascript
class CommandError {
  command: string;      // The command that was executed
  exitCode: number;     // The exit code (non-zero)
  signal?: string;      // Signal that terminated the process
  stdout: string;       // Standard output
  stderr: string;       // Standard error
  duration: number;     // Execution time in milliseconds
}
```

### TimeoutError

Thrown when a command exceeds its timeout:

```javascript
class TimeoutError {
  command: string;      // The command that timed out
  timeout: number;      // The timeout value in milliseconds
}
```

### AdapterError

Thrown when there's an issue with the adapter:

```javascript
class AdapterError {
  adapter: string;      // Adapter type (ssh, docker, etc.)
  operation: string;    // Operation that failed
  originalError: Error; // The underlying error
}
```

## Best Practices for Error Handling

### 1. Use nothrow() for expected failures

```javascript
// Good - grep returning 1 is expected when pattern not found
const result = await $`grep "pattern" file.txt`.nothrow();

// Bad - throwing exception for normal grep behavior
try {
  await $`grep "pattern" file.txt`;
} catch (error) {
  // This runs even when pattern is simply not found
}
```

### 2. Always check exit codes with nothrow()

```javascript
const result = await $`command`.nothrow();
if (result.exitCode !== 0) {
  console.error('Command failed:', result.stderr);
}
```

### 3. Use try-catch for unexpected errors

```javascript
try {
  await $`critical-operation`;
} catch (error) {
  console.error('Critical operation failed:', error.message);
  // Handle or re-throw
  throw error;
}
```

### 4. Combine both approaches when needed

```javascript
async function safeOperation() {
  try {
    const result = await $`potentially-failing-command`.nothrow();
    
    if (result.exitCode === 0) {
      return result.stdout;
    } else {
      console.warn('Command failed, using fallback');
      return 'fallback-value';
    }
  } catch (error) {
    // Handle truly unexpected errors (adapter failures, etc.)
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

## Error Handling in Different Environments

Error handling works consistently across all adapters:

```javascript
// SSH - handle connection issues
try {
  const $remote = $.ssh('user@server.com');
  const result = await $remote`ls /nonexistent`.nothrow();
  
  if (result.exitCode !== 0) {
    console.log('Directory does not exist on remote server');
  }
} catch (error) {
  console.error('SSH connection failed:', error.message);
}

// Docker - handle container issues
try {
  const $container = $.docker('my-app');
  const result = await $container`ps aux`.nothrow();
  
  if (result.exitCode !== 0) {
    console.log('Process listing failed in container');
  }
} catch (error) {
  console.error('Docker command failed:', error.message);
}
```

## Error Recovery Patterns

### Fallback Commands

```javascript
async function getSystemInfo() {
  // Try modern command first
  const modern = await $`systemctl status`.nothrow();
  if (modern.exitCode === 0) {
    return modern.stdout;
  }
  
  // Fallback to older command
  const legacy = await $`service --status-all`.nothrow();
  if (legacy.exitCode === 0) {
    return legacy.stdout;
  }
  
  return 'Unable to get system info';
}
```

### Cleanup on Error

```javascript
async function deployWithCleanup() {
  let deployed = false;
  
  try {
    await $`npm run build`;
    await $`npm run deploy`;
    deployed = true;
    await $`npm run post-deploy`;
  } catch (error) {
    console.error('Deployment failed:', error.message);
    
    // Cleanup on error
    if (deployed) {
      await $`npm run rollback`.nothrow();
    }
    
    throw error;
  }
}
```

### Partial Success Handling

```javascript
async function processFiles(files) {
  const results = {
    successful: [],
    failed: []
  };
  
  for (const file of files) {
    const result = await $`process-file ${file}`.nothrow();
    
    if (result.exitCode === 0) {
      results.successful.push(file);
    } else {
      results.failed.push({
        file,
        error: result.stderr
      });
    }
  }
  
  return results;
}
```

## Next Steps

- Learn about [Retry Logic](./retry-logic.md)
- Explore [Advanced Features](./advanced-features.md)
- See [Troubleshooting Guide](./troubleshooting.md)