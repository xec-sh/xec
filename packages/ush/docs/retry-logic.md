# Retry Logic

@xec-js/ush provides flexible retry mechanisms to handle transient failures gracefully. By default, commands are retried on any non-zero exit code.

## Basic Retry Configuration

```javascript
// Retry failed commands automatically
const $reliable = $.retry({
  maxRetries: 3,
  initialDelay: 1000,    // Start with 1 second
  backoffMultiplier: 2,  // Double delay each time
  maxDelay: 10000,       // Max 10 seconds
  jitter: true           // Add randomness to delays
});

// Will retry up to 3 times if it fails
await $reliable`curl https://flaky-api.com/data`;
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | 3 | Maximum number of retry attempts |
| `initialDelay` | number | 100 | Initial delay before first retry (ms) |
| `backoffMultiplier` | number | 2 | Multiplier for exponential backoff |
| `maxDelay` | number | 30000 | Maximum delay between retries (ms) |
| `jitter` | boolean | true | Add randomness to retry delays |
| `isRetryable` | function | `(result) => result.exitCode !== 0` | Function to determine if retry should occur |
| `onRetry` | function | undefined | Callback called on each retry attempt |

## Custom Retry Logic

The `isRetryable` function receives the full `ExecutionResult` object, allowing you to make retry decisions based on exit codes, stdout, stderr, or any combination:

### Simple: Retry on Specific Exit Codes

```javascript
const $retryOnTimeout = $.retry({
  maxRetries: 3,
  isRetryable: (result) => {
    // Exit code 124 = timeout
    return result.exitCode === 124;
  }
});
```

### Advanced: Analyze Error Output

```javascript
const $smartRetry = $.retry({
  maxRetries: 5,
  isRetryable: (result) => {
    // Don't retry on success
    if (result.exitCode === 0) return false;
    
    // Check for transient errors
    const transientErrors = [
      'network unreachable',
      'connection refused',
      'timeout',
      'resource temporarily unavailable'
    ];
    
    const errorOutput = result.stderr.toLowerCase();
    return transientErrors.some(error => errorOutput.includes(error));
  }
});
```

### Pattern-based Retry with Permanent Failure Detection

```javascript
const $intelligentRetry = $.retry({
  maxRetries: 3,
  isRetryable: (result) => {
    // Never retry these permanent failures
    const permanentFailures = [
      'permission denied',
      'no such file',
      'command not found',
      'invalid argument'
    ];
    
    const error = result.stderr.toLowerCase();
    
    // Don't retry if we see permanent failures
    if (permanentFailures.some(fail => error.includes(fail))) {
      return false;
    }
    
    // Retry on non-zero exit codes
    return result.exitCode !== 0;
  }
});
```

## Retry Callbacks

Monitor retry attempts with the `onRetry` callback:

```javascript
const $verbose = $.retry({
  maxRetries: 3,
  onRetry: (attempt, result, nextDelay) => {
    console.log(`Retry attempt ${attempt} after ${result.duration}ms`);
    console.log(`Exit code: ${result.exitCode}`);
    console.log(`Next retry in ${nextDelay}ms`);
  }
});
```

## Combining with Nothrow

Use retry with nothrow for maximum control:

```javascript
const $resilient = $.retry({
  maxRetries: 3,
  isRetryable: (result) => result.exitCode !== 0
});

// Won't throw but will retry on failure
const result = await $resilient`flaky-command`.nothrow();

if (result.exitCode === 0) {
  console.log('Success after retries:', result.stdout);
} else {
  console.log('Failed after all retries');
}
```

## Advanced Retry Patterns

### HTTP-Specific Retry Logic

```javascript
const $http = $.retry({
  maxRetries: 3,
  isRetryable: (result) => {
    // Parse HTTP status code from curl output
    const statusMatch = result.stdout.match(/HTTP\/\d\.\d (\d{3})/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      // Retry on 5xx errors and specific 4xx errors
      return statusCode >= 500 || statusCode === 429 || statusCode === 408;
    }
    // Retry on network errors
    return result.exitCode !== 0 && !result.stderr.includes('404');
  }
});

await $http`curl -i https://api.example.com/data`;
```

### Database Connection Retry

```javascript
const $db = $.retry({
  maxRetries: 5,
  initialDelay: 2000,
  isRetryable: (result) => {
    const retryableErrors = [
      'deadlock detected',
      'connection pool exhausted',
      'too many connections',
      'connection reset by peer',
      'could not connect to server'
    ];

    return retryableErrors.some(error => 
      result.stderr.toLowerCase().includes(error) ||
      result.stdout.toLowerCase().includes(error)
    );
  },
  onRetry: (attempt, result, nextDelay) => {
    console.log(`Database connection failed, retrying in ${nextDelay}ms...`);
  }
});

await $db`psql -c "SELECT * FROM users"`;
```

### Memory-Aware Retry

```javascript
const $memoryAware = $.retry({
  maxRetries: 2,
  initialDelay: 5000,
  isRetryable: (result) => {
    // Check for OOM killer or memory allocation failures
    const memoryErrors = [
      'cannot allocate memory',
      'out of memory',
      'killed',
      'memory exhausted'
    ];
    
    const hasMemoryError = memoryErrors.some(err =>
      result.stderr.toLowerCase().includes(err) ||
      result.stdout.toLowerCase().includes(err)
    );
    
    // Exit code 137 typically means killed by SIGKILL (often OOM)
    return hasMemoryError || result.exitCode === 137;
  }
});
```

### Circuit Breaker Pattern

```javascript
function createCircuitBreakerRetry(threshold = 5) {
  let consecutiveFailures = 0;
  let circuitOpen = false;
  let lastFailureTime = 0;
  
  return $.retry({
    maxRetries: 3,
    isRetryable: (result) => {
      // Check if circuit should be closed (reset after 30 seconds)
      if (circuitOpen && Date.now() - lastFailureTime > 30000) {
        circuitOpen = false;
        consecutiveFailures = 0;
        console.log('Circuit breaker reset');
      }
      
      // Don't retry if circuit is open
      if (circuitOpen) {
        console.log('Circuit breaker is OPEN - failing fast');
        return false;
      }
      
      // Track failures
      if (result.exitCode !== 0) {
        consecutiveFailures++;
        lastFailureTime = Date.now();
        
        if (consecutiveFailures >= threshold) {
          circuitOpen = true;
          console.log(`Circuit breaker OPENED after ${threshold} consecutive failures`);
          return false;
        }
      } else {
        consecutiveFailures = 0;
      }
      
      return result.exitCode !== 0;
    }
  });
}

const $protected = createCircuitBreakerRetry();
```

## Retry with Different Adapters

Retry logic works consistently across all adapters:

```javascript
// SSH with retry
const $ssh = $.ssh('server.com').retry({
  maxRetries: 3,
  isRetryable: (result) => {
    // Retry on SSH connection issues
    return result.stderr.includes('Connection refused') ||
           result.stderr.includes('Connection timeout');
  }
});

// Docker with retry
const $docker = $.docker('container').retry({
  maxRetries: 2,
  isRetryable: (result) => {
    // Retry on container not ready
    return result.stderr.includes('is not running');
  }
});

// Kubernetes with retry
const $k8s = $.k8s('pod', 'namespace').retry({
  maxRetries: 5,
  isRetryable: (result) => {
    // Retry on pod not ready
    return result.stderr.includes('container is not ready');
  }
});
```

## Best Practices

1. **Choose appropriate retry counts** - Too many retries can mask real issues
2. **Use exponential backoff** - Prevents overwhelming failing services
3. **Add jitter** - Prevents thundering herd problems
4. **Detect permanent failures** - Don't retry on errors that won't resolve
5. **Log retry attempts** - Use `onRetry` for visibility
6. **Set reasonable max delays** - Don't wait too long between retries
7. **Consider circuit breakers** - For protecting downstream services

## Testing Retry Logic

```javascript
// Mock adapter for testing retries
const mockAdapter = new MockAdapter();
let attempts = 0;

mockAdapter.setMockBehavior(() => {
  attempts++;
  if (attempts < 3) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Connection timeout',
      duration: 100
    };
  }
  return {
    exitCode: 0,
    stdout: 'Success',
    stderr: '',
    duration: 100
  };
});

const $test = $.adapter(mockAdapter).retry({
  maxRetries: 3,
  initialDelay: 0 // No delay in tests
});

const result = await $test`test-command`;
console.log(`Succeeded after ${attempts} attempts`);
```

## Next Steps

- See [examples/retry-patterns.ts](../examples/retry-patterns.ts) for more patterns
- Learn about [Error Handling](./error-handling.md) integration
- Explore [Advanced Features](./advanced-features.md)