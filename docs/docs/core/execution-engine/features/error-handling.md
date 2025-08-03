# Error Handling

The Xec execution engine provides comprehensive error handling with a Result pattern, automatic retries, and detailed error context for robust command execution.

## Overview

Error handling (`packages/core/src/types/result.ts`) provides:

- **Result pattern** for explicit error handling
- **Typed error codes** for specific conditions
- **Automatic retry logic** with backoff
- **Error context preservation** across adapters
- **Graceful degradation** strategies
- **Custom error handlers** and recovery

## Result Pattern

### Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Using nothrow() to get Result instead of throwing
const result = await $`command-that-might-fail`.nothrow();

if (result.ok) {
  console.log('Success:', result.stdout);
} else {
  console.error('Failed:', result.error.message);
  console.error('Exit code:', result.exitCode);
  console.error('Stderr:', result.stderr);
}
```

### Result Type Definition

```typescript
// Result type structure
interface ExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  error?: ExecutionError;
  duration: number;
  command: string;
}

// Error type structure
interface ExecutionError {
  code: ErrorCode;
  message: string;
  cause?: Error;
  context?: Record<string, any>;
}
```

## Error Codes

### Standard Error Codes

```typescript
enum ErrorCode {
  // Execution errors
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',
  SIGNAL_TERMINATED = 'SIGNAL_TERMINATED',
  
  // Connection errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  HOST_UNREACHABLE = 'HOST_UNREACHABLE',
  
  // Container/K8s errors
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  POD_NOT_READY = 'POD_NOT_READY',
  IMAGE_PULL_FAILED = 'IMAGE_PULL_FAILED',
  
  // File operation errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  INSUFFICIENT_SPACE = 'INSUFFICIENT_SPACE'
}
```

### Handling Specific Errors

```typescript
const result = await $`risky-command`.nothrow();

if (!result.ok) {
  switch (result.error.code) {
    case 'TIMEOUT':
      console.log('Command timed out, retrying...');
      await $`risky-command`.timeout(30000);
      break;
      
    case 'PERMISSION_DENIED':
      console.log('Trying with sudo...');
      await $`sudo risky-command`;
      break;
      
    case 'CONNECTION_FAILED':
      console.log('Connection failed, using fallback...');
      await $.local`fallback-command`;
      break;
      
    default:
      throw new Error(`Unexpected error: ${result.error.message}`);
  }
}
```

## Retry Logic

### Automatic Retries

```typescript
// Simple retry with count
const result = await $`flaky-command`.retry(3);

// Retry with configuration
const retried = await $`unstable-service`.retry({
  attempts: 5,
  delay: 1000,      // Initial delay in ms
  backoff: 2,       // Exponential backoff factor
  maxDelay: 10000,  // Maximum delay between retries
  onRetry: (attempt, error) => {
    console.log(`Retry ${attempt} after error:`, error.message);
  }
});
```

### Conditional Retries

```typescript
// Retry only on specific errors
const selective = await $`network-command`.retry({
  attempts: 3,
  shouldRetry: (error) => {
    return error.code === 'CONNECTION_FAILED' ||
           error.code === 'TIMEOUT';
  }
});

// Retry with jitter to prevent thundering herd
const jittered = await $`api-call`.retry({
  attempts: 5,
  delay: 1000,
  jitter: true,  // Add random jitter to delay
  jitterFactor: 0.3  // ±30% randomization
});
```

### Retry Strategies

```typescript
// Linear backoff
await $`command`.retry({
  strategy: 'linear',
  attempts: 5,
  delay: 1000  // 1s, 2s, 3s, 4s, 5s
});

// Exponential backoff
await $`command`.retry({
  strategy: 'exponential',
  attempts: 5,
  delay: 1000,
  backoff: 2  // 1s, 2s, 4s, 8s, 16s
});

// Fibonacci backoff
await $`command`.retry({
  strategy: 'fibonacci',
  attempts: 5,
  delay: 1000  // 1s, 1s, 2s, 3s, 5s
});

// Custom strategy
await $`command`.retry({
  strategy: (attempt) => attempt * 500 + Math.random() * 500
});
```

## Error Context

### Preserving Context

```typescript
// Error context is preserved across operations
const remote = $.ssh({ host: 'server.com', username: 'user' });

const result = await remote`failing-command`.nothrow();
if (!result.ok) {
  console.log('Error context:', {
    host: result.error.context.host,
    adapter: result.error.context.adapter,
    command: result.error.context.command,
    workingDirectory: result.error.context.cwd,
    environment: result.error.context.env
  });
}
```

### Adding Custom Context

```typescript
// Add context to errors
const contextual = $`command`.withContext({
  operation: 'deployment',
  service: 'web-api',
  version: '1.2.3'
});

const result = await contextual.nothrow();
if (!result.ok) {
  // Custom context is included in error
  console.log('Failed during:', result.error.context.operation);
  console.log('Service:', result.error.context.service);
}
```

## Error Recovery

### Fallback Chains

```typescript
// Try multiple approaches
async function executeWithFallback(command: string) {
  // Try SSH first
  const ssh = await $.ssh('prod-server')`${command}`.nothrow();
  if (ssh.ok) return ssh;
  
  // Fallback to Docker
  const docker = await $.docker('backup-container')`${command}`.nothrow();
  if (docker.ok) return docker;
  
  // Final fallback to local
  return await $`${command}`;
}
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeout = 60000,
    private halfOpenRequests = 3
  ) {}
  
  async execute(command: () => Promise<any>) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await command();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      throw error;
    }
  }
}

// Usage
const breaker = new CircuitBreaker();
await breaker.execute(() => $`risky-command`);
```

## Timeout Handling

### Command Timeouts

```typescript
// Simple timeout
try {
  await $`long-running-command`.timeout(5000);  // 5 seconds
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.log('Command timed out after 5 seconds');
  }
}

// Timeout with custom signal
await $`server-process`.timeout(10000, 'SIGTERM');

// Timeout with grace period
await $`graceful-shutdown`.timeout({
  timeout: 10000,
  killSignal: 'SIGTERM',
  killTimeout: 5000  // Force kill after 5s if still running
});
```

### Cascading Timeouts

```typescript
// Different timeouts for different stages
async function deployWithTimeouts() {
  const remote = $.ssh({ host: 'server.com', username: 'deploy' });
  
  // Quick commands with short timeout
  await remote`git pull`.timeout(10000);
  
  // Build with longer timeout
  await remote`npm run build`.timeout(60000);
  
  // Deployment with very long timeout
  await remote`npm run deploy`.timeout(300000);
}
```

## Validation and Assertions

### Input Validation

```typescript
// Validate before execution
function validateAndExecute(command: string) {
  // Check for dangerous patterns
  if (command.includes('rm -rf /')) {
    throw new Error('Dangerous command detected');
  }
  
  // Check for required variables
  if (!process.env.API_KEY) {
    throw new Error('API_KEY environment variable required');
  }
  
  return $`${command}`;
}
```

### Output Assertions

```typescript
// Assert expected output
const result = await $`echo "test"`.assert({
  stdout: /test/,
  exitCode: 0
});

// Custom assertions
await $`health-check`.assert((result) => {
  const json = JSON.parse(result.stdout);
  return json.status === 'healthy';
}, 'Health check failed');
```

## Error Aggregation

### Parallel Error Handling

```typescript
// Collect errors from parallel execution
async function deployToAllServers(servers: string[]) {
  const results = await Promise.allSettled(
    servers.map(server => 
      $.ssh(server)`deploy.sh`.nothrow()
    )
  );
  
  const failures = results
    .filter(r => r.status === 'rejected' || !r.value.ok)
    .map((r, i) => ({
      server: servers[i],
      error: r.status === 'rejected' ? r.reason : r.value.error
    }));
  
  if (failures.length > 0) {
    console.error('Deployment failures:', failures);
    throw new AggregateError(
      failures.map(f => f.error),
      `${failures.length} servers failed`
    );
  }
}
```

### Error Summaries

```typescript
// Summarize multiple errors
class ErrorSummary {
  private errors: ExecutionError[] = [];
  
  add(error: ExecutionError) {
    this.errors.push(error);
  }
  
  getSummary() {
    const byCode = this.errors.reduce((acc, err) => {
      acc[err.code] = (acc[err.code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: this.errors.length,
      byCode,
      mostCommon: Object.entries(byCode)
        .sort(([,a], [,b]) => b - a)[0],
      samples: this.errors.slice(0, 3)
    };
  }
}
```

## Logging and Debugging

### Error Logging

```typescript
// Structured error logging
$.on('command:error', ({ command, error, context }) => {
  console.error({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    command,
    error: {
      code: error.code,
      message: error.message,
      stack: error.stack
    },
    context
  });
});

// Debug mode for verbose errors
const debug = $.debug(true);
await debug`failing-command`;  // Prints full error details
```

### Error Telemetry

```typescript
// Send errors to monitoring service
$.on('command:error', async ({ error, context }) => {
  await fetch('https://telemetry.example.com/errors', {
    method: 'POST',
    body: JSON.stringify({
      service: 'xec-automation',
      error: {
        code: error.code,
        message: error.message,
        context
      },
      timestamp: Date.now()
    })
  });
});
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use nothrow() for explicit error handling
const result = await $`command`.nothrow();
if (!result.ok) {
  // Handle error explicitly
}

// ✅ Add retry logic for network operations
await $.ssh('server')`api-call`.retry(3);

// ✅ Set appropriate timeouts
await $`build`.timeout(60000);

// ✅ Log errors with context
$.on('command:error', ({ error, context }) => {
  logger.error('Command failed', { error, context });
});

// ✅ Use specific error codes
if (error.code === 'AUTHENTICATION_FAILED') {
  // Handle auth failure specifically
}
```

### Don'ts ❌

```typescript
// ❌ Ignore errors silently
try {
  await $`command`;
} catch {
  // Don't swallow errors
}

// ❌ Retry indefinitely
await $`command`.retry(Infinity);  // Bad idea

// ❌ Use generic error messages
throw new Error('Something went wrong');  // Too vague

// ❌ Mix error handling patterns
// Pick either Result pattern or try/catch, not both randomly
```

## Implementation Details

Error handling is implemented in:
- `packages/core/src/types/result.ts` - Result type definitions
- `packages/core/src/utils/error.ts` - Error utilities and codes
- `packages/core/src/utils/retry.ts` - Retry logic implementation
- `packages/core/src/core/error-handler.ts` - Global error handling

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
- [Debugging Guide](/docs/guides/development/debugging)