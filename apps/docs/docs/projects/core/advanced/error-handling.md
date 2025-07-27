---
sidebar_position: 5
---

# Error Handling

Comprehensive error handling strategies for robust command execution across all adapters and scenarios.

## Overview

@xec-sh/core provides a rich error handling system that includes:
- Typed error classes for different failure scenarios
- Detailed error context with stdout, stderr, and exit codes
- Non-throwing execution modes
- Automatic retries with backoff
- Custom error handlers
- Adapter-specific error information

## Error Types

### CommandError

The most common error type, thrown when a command exits with a non-zero code:

```typescript
import { $, CommandError } from '@xec-sh/core';

try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof CommandError) {
    console.error('Command failed');
    console.error('Exit code:', error.exitCode);      // 1
    console.error('Stderr:', error.stderr);           // Error output
    console.error('Stdout:', error.stdout);           // Standard output
    console.error('Command:', error.command);         // The command that failed
  }
}
```

### TimeoutError

Thrown when a command exceeds its timeout:

```typescript
import { TimeoutError } from '@xec-sh/core';

try {
  await $.timeout(1000)`sleep 5`;
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Command timed out after', error.timeout, 'ms');
    console.error('Partial output:', error.stdout);
  }
}
```

### ConnectionError

SSH and remote connection failures:

```typescript
import { ConnectionError } from '@xec-sh/core';

try {
  const ssh = $.ssh({ host: 'unreachable.com', username: 'user' });
  await ssh`echo test`;
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Failed to connect to:', error.host);
    console.error('Original error:', error.originalError);
  }
}
```

### DockerError

Docker-specific errors:

```typescript
import { DockerError } from '@xec-sh/core';

try {
  await $.docker({ image: 'nonexistent:tag' }).start();
} catch (error) {
  if (error instanceof DockerError) {
    console.error('Docker operation failed:', error.operation);
    console.error('Container:', error.container);
  }
}
```

### ExecutionError

Base class for all execution errors:

```typescript
import { ExecutionError } from '@xec-sh/core';

try {
  await $`some-command`;
} catch (error) {
  if (error instanceof ExecutionError) {
    console.error('Execution failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Details:', error.details);
  }
}
```

## Non-Throwing Mode

### Using nothrow()

Prevent errors from being thrown and handle them manually:

```typescript
// Won't throw on non-zero exit
const result = await $`grep "pattern" file.txt`.nothrow();

if (result.isSuccess()) {
  console.log('Found matches:', result.stdout);
} else {
  console.log('No matches found (exit code:', result.exitCode, ')');
}
```

### Checking Success

```typescript
// Multiple ways to check success
const result = await $`test -f /etc/passwd`.nothrow();

// Method 1: isSuccess()
if (result.isSuccess()) {
  console.log('File exists');
}

// Method 2: Check exit code
if (result.exitCode === 0) {
  console.log('Success');
}

// Method 3: Convert to boolean
const exists = (await $`test -f config.json`.nothrow()).isSuccess();
```

## Error Recovery Patterns

### Fallback Commands

```typescript
// Try primary command, fall back to alternative
async function getSystemInfo() {
  // Try lsb_release first
  let result = await $`lsb_release -a`.nothrow();
  if (result.isSuccess()) {
    return result.stdout;
  }
  
  // Fall back to /etc/os-release
  result = await $`cat /etc/os-release`.nothrow();
  if (result.isSuccess()) {
    return result.stdout;
  }
  
  // Final fallback
  return await $`uname -a`.text();
}
```

### Default Values

```typescript
// Get value or default
async function getEnvVar(name: string, defaultValue: string): Promise<string> {
  const result = await $`echo $${name}`.nothrow();
  return result.isSuccess() && result.stdout.trim() 
    ? result.stdout.trim() 
    : defaultValue;
}

// Usage
const port = await getEnvVar('PORT', '3000');
```

### Graceful Degradation

```typescript
async function optimizedBuild() {
  // Try parallel build first
  const parallel = await $`make -j8`.nothrow();
  if (parallel.isSuccess()) {
    return;
  }
  
  console.warn('Parallel build failed, trying sequential...');
  
  // Fall back to sequential
  const sequential = await $`make`.nothrow();
  if (sequential.isSuccess()) {
    return;
  }
  
  // Last resort - verbose mode for debugging
  await $`make VERBOSE=1`;
}
```

## Retry Strategies

### Built-in Retry

```typescript
// Simple retry with defaults
await $`curl https://flaky-api.com`.retry(3);

// Retry with configuration
await $`npm install`.retry({
  maxAttempts: 5,
  delay: 1000,
  backoff: 'exponential',
  onRetry: (attempt, error) => {
    console.log(`Attempt ${attempt} failed:`, error.message);
  }
});
```

### Custom Retry Logic

```typescript
async function retryWithCondition<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: any) => boolean,
  maxAttempts = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error('Unreachable');
}

// Usage
const result = await retryWithCondition(
  () => $`curl https://api.example.com/data`,
  (error) => error.exitCode === 7, // Connection refused
  5,
  500
);
```

### Adapter-Specific Retries

```typescript
// SSH with retry
const ssh = $.ssh({ host: 'server.com', username: 'user' });

await retryWithCondition(
  () => ssh`systemctl status app`,
  (error) => error.code === 'ECONNRESET',
  3
);

// Docker with retry
async function ensureContainerRunning(name: string) {
  const maxAttempts = 5;
  
  for (let i = 0; i < maxAttempts; i++) {
    const result = await $`docker ps --filter name=${name} --format "{{.Status}}"`.nothrow();
    
    if (result.isSuccess() && result.stdout.includes('Up')) {
      return true;
    }
    
    // Try to start container
    await $`docker start ${name}`.nothrow();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Failed to start container ${name}`);
}
```

## Error Context Enhancement

### Adding Context

```typescript
class DeploymentError extends Error {
  constructor(
    message: string,
    public readonly environment: string,
    public readonly service: string,
    public readonly originalError: Error
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}

async function deployService(env: string, service: string) {
  try {
    await $`kubectl apply -f ${service}.yaml -n ${env}`;
  } catch (error) {
    throw new DeploymentError(
      `Failed to deploy ${service} to ${env}`,
      env,
      service,
      error as Error
    );
  }
}
```

### Error Wrapping

```typescript
async function executeWithContext<T>(
  operation: () => Promise<T>,
  context: Record<string, any>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ExecutionError) {
      error.details = { ...error.details, ...context };
    }
    throw error;
  }
}

// Usage
await executeWithContext(
  () => $`npm run build`,
  { 
    project: 'my-app',
    environment: 'production',
    timestamp: new Date().toISOString()
  }
);
```

## Error Aggregation

### Multiple Operations

```typescript
interface OperationResult {
  name: string;
  success: boolean;
  error?: Error;
  output?: string;
}

async function runHealthChecks(services: string[]): Promise<OperationResult[]> {
  const results = await Promise.all(
    services.map(async (service): Promise<OperationResult> => {
      try {
        const output = await $`curl -f http://${service}/health`.text();
        return { name: service, success: true, output };
      } catch (error) {
        return { name: service, success: false, error: error as Error };
      }
    })
  );
  
  // Summary
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.error(`Health checks failed for: ${failed.map(r => r.name).join(', ')}`);
  }
  
  return results;
}
```

### Partial Success Handling

```typescript
async function deployToServers(servers: string[], artifact: string) {
  const results = new Map<string, { success: boolean; error?: Error }>();
  
  for (const server of servers) {
    try {
      const ssh = $.ssh({ host: server, username: 'deploy' });
      await ssh`mkdir -p /app`;
      await ssh.uploadFile(artifact, '/app/app.tar.gz');
      await ssh`cd /app && tar -xzf app.tar.gz && ./deploy.sh`;
      
      results.set(server, { success: true });
    } catch (error) {
      results.set(server, { success: false, error: error as Error });
      console.error(`Deploy to ${server} failed:`, error.message);
    }
  }
  
  // Check if we have minimum successful deploys
  const successful = Array.from(results.values()).filter(r => r.success).length;
  const minRequired = Math.ceil(servers.length * 0.6); // 60% must succeed
  
  if (successful < minRequired) {
    throw new Error(
      `Deployment failed: only ${successful}/${servers.length} servers updated (minimum: ${minRequired})`
    );
  }
  
  return results;
}
```

## Global Error Handling

### Process-Level Handlers

```typescript
// Global unhandled rejection handler
process.on('unhandledRejection', (error: any) => {
  if (error instanceof CommandError) {
    console.error('Unhandled command failure:');
    console.error('  Command:', error.command);
    console.error('  Exit code:', error.exitCode);
    console.error('  Error:', error.stderr || error.message);
  } else {
    console.error('Unhandled error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, cleaning up...');
  
  try {
    // Clean up any running commands
    await $.dispose();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
  
  process.exit(0);
});
```

### Error Reporting

```typescript
async function reportError(error: Error, context?: any) {
  const errorReport = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    system: {
      platform: process.platform,
      node: process.version,
      memory: process.memoryUsage()
    }
  };
  
  if (error instanceof CommandError) {
    errorReport.error = {
      ...errorReport.error,
      command: error.command,
      exitCode: error.exitCode,
      stdout: error.stdout?.slice(0, 1000), // Limit size
      stderr: error.stderr?.slice(0, 1000)
    };
  }
  
  // Send to monitoring service
  await sendToMonitoring(errorReport);
  
  // Log locally
  await $`echo ${JSON.stringify(errorReport)} >> /var/log/app-errors.log`.nothrow();
}
```

## Testing Error Scenarios

### Unit Testing Errors

```typescript
import { jest } from '@jest/globals';

describe('Error handling', () => {
  it('should handle command failures', async () => {
    await expect($`exit 1`).rejects.toThrow(CommandError);
  });
  
  it('should handle timeouts', async () => {
    await expect($.timeout(100)`sleep 1`).rejects.toThrow(TimeoutError);
  });
  
  it('should not throw with nothrow', async () => {
    const result = await $`exit 1`.nothrow();
    expect(result.isSuccess()).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});
```

### Integration Testing

```typescript
describe('SSH error handling', () => {
  it('should handle connection failures', async () => {
    const ssh = $.ssh({ 
      host: 'nonexistent.example.com',
      username: 'user',
      connectTimeout: 1000
    });
    
    await expect(ssh`echo test`).rejects.toThrow(ConnectionError);
  });
  
  it('should retry on transient failures', async () => {
    let attempts = 0;
    const ssh = $.ssh({ host: 'server.com', username: 'user' });
    
    const result = await ssh`test ${++attempts} -eq 3 && echo success || exit 1`
      .retry(3)
      .nothrow();
    
    expect(result.isSuccess()).toBe(true);
    expect(attempts).toBe(3);
  });
});
```

## Best Practices

1. **Always handle errors explicitly** - Don't rely on global handlers
2. **Use appropriate error types** - Check instanceof for specific handling
3. **Preserve error context** - Include relevant information for debugging
4. **Log before rethrowing** - Capture error details at the source
5. **Set reasonable timeouts** - Prevent hanging operations
6. **Use nothrow() for expected failures** - Like checking file existence
7. **Implement retry for transient failures** - Network issues, race conditions
8. **Clean up on errors** - Close connections, remove temp files
9. **Test error paths** - Unit test error scenarios
10. **Monitor errors in production** - Track patterns and frequencies

## Next Steps

- Learn about [Retry Logic](./retry-logic) for automatic recovery
- Explore [Event System](./event-system) for error monitoring
- See [Connection Pooling](./connection-pooling) for connection resilience
- Check [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) for error handling patterns