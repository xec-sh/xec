---
sidebar_position: 6
---

# Retry Logic

Implement automatic retry mechanisms for transient failures with configurable backoff strategies.

## Overview

The retry functionality in @xec-sh/core provides:
- Automatic retry for failed commands
- Multiple backoff strategies (linear, exponential, custom)
- Configurable retry conditions
- Retry hooks for logging and monitoring
- Per-command and global retry settings
- Adapter-specific retry behavior

## Basic Retry Usage

### Simple Retry

```typescript
import { $ } from '@xec-sh/core';

// Retry up to 3 times on failure
await $`curl https://flaky-api.com/data`.retry(3);

// Retry with default configuration
await $`npm install`.retry();  // Uses default retry count
```

### Retry Configuration

```typescript
// Detailed retry configuration
await $`curl https://api.example.com`.retry({
  maxAttempts: 5,
  delay: 1000,              // Initial delay in ms
  maxDelay: 30000,          // Maximum delay between retries
  backoff: 'exponential',   // Backoff strategy
  factor: 2,                // Backoff multiplier
  jitter: true,             // Add randomness to delays
  onRetry: (attempt, error, delay) => {
    console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
    console.log(`Error: ${error.message}`);
  }
});
```

## Backoff Strategies

### Linear Backoff

```typescript
// Fixed delay between retries
await $`wget https://download.example.com/large-file.zip`.retry({
  maxAttempts: 10,
  delay: 5000,              // 5 seconds between each retry
  backoff: 'linear'
});
```

### Exponential Backoff

```typescript
// Exponentially increasing delays
await $`docker pull heavy-image:latest`.retry({
  maxAttempts: 6,
  delay: 1000,              // Start with 1 second
  backoff: 'exponential',
  factor: 2,                // Double each time: 1s, 2s, 4s, 8s, 16s
  maxDelay: 60000          // Cap at 60 seconds
});
```

### Custom Backoff

```typescript
// Custom backoff function
await $`database-migration`.retry({
  maxAttempts: 5,
  backoff: (attempt) => {
    // Fibonacci sequence delays
    const fib = [1000, 1000, 2000, 3000, 5000];
    return fib[attempt - 1] || 8000;
  }
});

// With jitter for distributed systems
await $`distributed-task`.retry({
  maxAttempts: 4,
  backoff: (attempt) => {
    const baseDelay = Math.pow(2, attempt - 1) * 1000;
    const jitter = Math.random() * 1000; // 0-1 second jitter
    return baseDelay + jitter;
  }
});
```

## Conditional Retry

### Retry on Specific Errors

```typescript
// Retry only on certain exit codes
await $`network-operation`.retry({
  maxAttempts: 5,
  shouldRetry: (error) => {
    // Retry on network-related exit codes
    const networkErrors = [6, 7, 28, 35, 52, 56];
    return networkErrors.includes(error.exitCode);
  }
});

// Retry based on error message
await $`api-call`.retry({
  maxAttempts: 3,
  shouldRetry: (error) => {
    const retryableErrors = [
      'Connection refused',
      'Timeout',
      'Service temporarily unavailable'
    ];
    return retryableErrors.some(msg => 
      error.message.includes(msg) || error.stderr?.includes(msg)
    );
  }
});
```

### Retry with Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeout = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      
      throw error;
    }
  }
}

// Usage
const breaker = new CircuitBreaker();

await $`curl https://api.example.com`.retry({
  maxAttempts: 3,
  shouldRetry: (error) => {
    try {
      return breaker.execute(async () => true);
    } catch {
      return false; // Circuit is open, don't retry
    }
  }
});
```

## Retry with Different Adapters

### SSH Retry

```typescript
const ssh = $.ssh({ host: 'server.com', username: 'user' });

// Retry SSH commands
await ssh`systemctl restart app`.retry({
  maxAttempts: 3,
  delay: 2000,
  onRetry: (attempt) => {
    console.log(`SSH command retry attempt ${attempt}`);
  }
});

// Retry with connection recreation
async function sshWithReconnect(command: string, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Create fresh connection for each attempt
      const ssh = $.ssh({ 
        host: 'server.com', 
        username: 'user',
        readyTimeout: 10000
      });
      
      return await ssh`${command}`;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`Reconnecting SSH (attempt ${attempt})...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
```

### Docker Retry

```typescript
// Retry Docker operations
async function ensureContainerRunning(name: string) {
  await $`docker start ${name}`.retry({
    maxAttempts: 5,
    delay: 3000,
    shouldRetry: async (error) => {
      // Check if container exists
      const exists = await $`docker ps -a --filter name=${name} -q`.nothrow();
      return exists.ok && exists.stdout.trim() !== '';
    }
  });
}

// Retry with health checks
async function waitForHealthy(container: string) {
  await $`docker inspect ${container} --format='{{.State.Health.Status}}'`.retry({
    maxAttempts: 30,
    delay: 2000,
    shouldRetry: (error, result) => {
      // Keep retrying until healthy
      return !result || result.stdout.trim() !== 'healthy';
    }
  });
}
```

### Kubernetes Retry

```typescript
const k8s = $.k8s({ namespace: 'production' });

// Retry pod operations
async function waitForPodReady(podName: string) {
  const pod = k8s.pod(podName);
  
  await pod.exec`test -f /tmp/ready`.retry({
    maxAttempts: 60,
    delay: 1000,
    shouldRetry: (error) => {
      // Retry if pod is not ready
      return error.exitCode !== 0;
    },
    onRetry: (attempt) => {
      if (attempt % 10 === 0) {
        console.log(`Still waiting for pod ${podName} (${attempt}s)...`);
      }
    }
  });
}
```

## Advanced Retry Patterns

### Retry with Fallback

```typescript
async function fetchDataWithFallback() {
  // Try primary source
  try {
    return await $`curl https://primary-api.com/data`.retry(3);
  } catch (primaryError) {
    console.warn('Primary source failed, trying secondary...');
    
    // Try secondary source
    try {
      return await $`curl https://secondary-api.com/data`.retry(3);
    } catch (secondaryError) {
      console.warn('Secondary source failed, using cache...');
      
      // Fall back to cache
      return await $`cat /var/cache/data.json`;
    }
  }
}
```

### Retry with State Reset

```typescript
async function deployWithRetry(service: string) {
  return await $`kubectl apply -f ${service}.yaml`.retry({
    maxAttempts: 3,
    delay: 5000,
    onRetry: async (attempt, error) => {
      console.log(`Deploy attempt ${attempt} failed: ${error.message}`);
      
      // Reset state before retry
      console.log('Cleaning up failed deployment...');
      await $`kubectl delete -f ${service}.yaml --ignore-not-found`.nothrow();
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  });
}
```

### Batch Retry

```typescript
async function processBatchWithRetry<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  options = { maxAttempts: 3, batchSize: 10 }
) {
  const results = new Map<T, { success: boolean; attempts: number; error?: Error }>();
  
  // Process in batches
  for (let i = 0; i < items.length; i += options.batchSize) {
    const batch = items.slice(i, i + options.batchSize);
    
    await Promise.all(
      batch.map(async (item) => {
        for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
          try {
            await processor(item);
            results.set(item, { success: true, attempts: attempt });
            break;
          } catch (error) {
            if (attempt === options.maxAttempts) {
              results.set(item, { 
                success: false, 
                attempts: attempt, 
                error: error as Error 
              });
            } else {
              await new Promise(resolve => 
                setTimeout(resolve, Math.pow(2, attempt) * 1000)
              );
            }
          }
        }
      })
    );
  }
  
  return results;
}

// Usage
const files = await $`find . -name "*.log"`.lines();
const results = await processBatchWithRetry(
  files,
  async (file) => {
    await $`gzip ${file}`;
    await $`aws s3 cp ${file}.gz s3://backup/logs/`;
  }
);
```

## Monitoring and Logging

### Retry Metrics

```typescript
class RetryMetrics {
  private attempts = new Map<string, number[]>();
  
  record(operation: string, attempts: number) {
    if (!this.attempts.has(operation)) {
      this.attempts.set(operation, []);
    }
    this.attempts.get(operation)!.push(attempts);
  }
  
  getStats(operation: string) {
    const data = this.attempts.get(operation) || [];
    if (data.length === 0) return null;
    
    const total = data.reduce((a, b) => a + b, 0);
    const successful = data.filter(a => a > 0).length;
    
    return {
      totalCalls: data.length,
      successfulCalls: successful,
      failureRate: (data.length - successful) / data.length,
      averageAttempts: total / data.length,
      maxAttempts: Math.max(...data)
    };
  }
}

const metrics = new RetryMetrics();

// Wrap commands with metrics
async function executeWithMetrics(name: string, command: () => Promise<any>) {
  let attempts = 0;
  
  try {
    const result = await command.retry({
      maxAttempts: 5,
      onRetry: () => { attempts++; }
    });
    
    metrics.record(name, attempts + 1);
    return result;
  } catch (error) {
    metrics.record(name, -1); // Failed after all retries
    throw error;
  }
}
```

### Detailed Logging

```typescript
interface RetryLogger {
  logAttempt(operation: string, attempt: number, error: Error): void;
  logSuccess(operation: string, attempts: number): void;
  logFailure(operation: string, attempts: number, error: Error): void;
}

class ConsoleRetryLogger implements RetryLogger {
  logAttempt(operation: string, attempt: number, error: Error) {
    console.log(`[RETRY] ${operation} - Attempt ${attempt} failed:`, error.message);
  }
  
  logSuccess(operation: string, attempts: number) {
    console.log(`[SUCCESS] ${operation} completed after ${attempts} attempt(s)`);
  }
  
  logFailure(operation: string, attempts: number, error: Error) {
    console.error(`[FAILURE] ${operation} failed after ${attempts} attempts:`, error);
  }
}

// Use with retry
const logger = new ConsoleRetryLogger();

await $`flaky-operation`.retry({
  maxAttempts: 3,
  onRetry: (attempt, error) => {
    logger.logAttempt('flaky-operation', attempt, error);
  }
});
```

## Global Retry Configuration

### Set Default Retry

```typescript
// Configure global defaults
$.defaults({
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential'
  }
});

// All commands will now retry by default
await $`curl https://api.example.com`;  // Will retry up to 3 times
```

### Environment-Based Configuration

```typescript
// Different retry strategies for different environments
const retryConfig = process.env.NODE_ENV === 'production'
  ? {
      maxAttempts: 5,
      delay: 2000,
      maxDelay: 30000,
      backoff: 'exponential' as const
    }
  : {
      maxAttempts: 2,
      delay: 500,
      backoff: 'linear' as const
    };

$.defaults({ retry: retryConfig });
```

## Testing Retry Logic

### Unit Tests

```typescript
describe('Retry functionality', () => {
  it('should retry failed commands', async () => {
    let attempts = 0;
    
    const result = await $`test ${++attempts} -eq 3 && echo success || exit 1`
      .retry(3)
      .nothrow();
    
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });
  
  it('should respect backoff delays', async () => {
    const start = Date.now();
    
    await $`exit 1`.retry({
      maxAttempts: 3,
      delay: 100,
      backoff: 'linear'
    }).nothrow();
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(200); // At least 2 delays
  });
});
```

### Integration Tests

```typescript
describe('Retry with adapters', () => {
  it('should retry SSH connections', async () => {
    const mockServer = createMockSSHServer();
    let connections = 0;
    
    mockServer.on('connection', () => {
      connections++;
      if (connections < 3) {
        mockServer.close(); // Simulate failure
      }
    });
    
    const ssh = $.ssh({ host: 'localhost', port: mockServer.port });
    await ssh`echo test`.retry(3);
    
    expect(connections).toBe(3);
  });
});
```

## Best Practices

1. **Choose appropriate backoff strategies** - Exponential for network, linear for resources
2. **Set reasonable max attempts** - Avoid infinite retry loops
3. **Implement jitter for distributed systems** - Prevent thundering herd
4. **Log retry attempts** - Essential for debugging production issues
5. **Use circuit breakers for external services** - Fail fast when services are down
6. **Clean up state between retries** - Ensure clean retry attempts
7. **Set maximum delay caps** - Prevent excessive wait times
8. **Consider retry budgets** - Limit total retry time
9. **Test retry scenarios** - Include failure paths in tests
10. **Monitor retry metrics** - Track success rates and patterns

## Next Steps

- Explore [Error Handling](./error-handling) for comprehensive error management
- Learn about [Connection Pooling](./connection-pooling) for connection resilience
- See [Parallel Execution](./parallel-execution) for concurrent retries
- Check [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples) for retry patterns