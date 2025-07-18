import {
  $,
  LocalAdapter,
  type RetryOptions,
  withExecutionRetry,
  type ExecutionResult
} from '@xec-js/ush';

// Example 1: Complex retry logic based on specific error patterns
const complexRetryLogic = {
  isRetryable: (result: ExecutionResult): boolean => {
    // Retry on specific exit codes
    const retryableExitCodes = [1, 2, 124, 137]; // Common timeout and kill signal codes
    if (retryableExitCodes.includes(result.exitCode)) {
      return true;
    }

    // Retry on specific error patterns in stderr
    const errorPatterns = [
      /connection refused/i,
      /timeout/i,
      /temporary failure/i,
      /resource temporarily unavailable/i,
      /cannot allocate memory/i,
      /no route to host/i
    ];

    const hasRetryableError = errorPatterns.some(pattern =>
      pattern.test(result.stderr) || pattern.test(result.stdout)
    );

    // Don't retry if we see specific permanent failures
    const permanentFailurePatterns = [
      /permission denied/i,
      /no such file or directory/i,
      /command not found/i,
      /invalid argument/i
    ];

    const hasPermanentFailure = permanentFailurePatterns.some(pattern =>
      pattern.test(result.stderr)
    );

    return hasRetryableError && !hasPermanentFailure;
  },
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  jitter: true
};

// Example 2: Retry with exponential backoff for API calls
const apiRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) => {
    // Parse HTTP status code from curl output
    const statusMatch = result.stdout.match(/HTTP\/\d\.\d (\d{3})/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      // Retry on 5xx errors and specific 4xx errors
      return statusCode >= 500 || statusCode === 429 || statusCode === 408;
    }
    // Retry on network errors
    return result.exitCode !== 0 && !result.stderr.includes('404');
  },
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 10000
};

// Example 3: Database operation retry with connection pooling awareness
const databaseRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) => {
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
  maxRetries: 3,
  initialDelay: 500,
  onRetry: (attempt, result, nextDelay) => {
    console.log(`Database retry attempt ${attempt}, waiting ${nextDelay}ms for connections to free up...`);
    console.log(`Last error: ${result.stderr}`);
  }
};

// Example 4: File system operations with resource contention handling
const fileSystemRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) => {
    const resourceErrors = [
      'resource busy',
      'file is locked',
      'text file busy',
      'device or resource busy'
    ];

    // Only retry on resource contention, not on permanent errors
    return result.exitCode !== 0 &&
      resourceErrors.some(err => result.stderr.toLowerCase().includes(err));
  },
  maxRetries: 10,
  initialDelay: 100,
  maxDelay: 1000,
  jitter: true // Adds randomness to avoid thundering herd
};

// Example 5: CI/CD pipeline retry with progressive delay
const ciPipelineRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) => {
    // Retry on infrastructure issues
    if (result.stderr.includes('runner is offline') ||
      result.stderr.includes('no space left on device') ||
      result.stderr.includes('docker daemon is not running')) {
      return true;
    }

    // Don't retry on test failures or linting errors
    if (result.stderr.includes('tests failed') ||
      result.stderr.includes('lint errors found')) {
      return false;
    }

    // Retry on non-zero exit codes by default
    return result.exitCode !== 0;
  },
  maxRetries: 3,
  initialDelay: 5000,
  maxDelay: 60000,
  backoffMultiplier: 3 // More aggressive backoff for CI pipelines
};

// Example 6: Network service health check with custom timing
const healthCheckRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) =>
    // Always retry health checks unless we get a definitive healthy response
    !result.stdout.includes('"status":"healthy"')
  ,
  maxRetries: 20,
  initialDelay: 3000,
  maxDelay: 3000, // Constant delay for health checks
  backoffMultiplier: 1, // No exponential backoff
  jitter: false // No jitter for predictable health check intervals
};

// Usage examples
async function examples() {
  const adapter = new LocalAdapter();

  // Example: Database migration with retry
  const dbAdapter = withExecutionRetry(adapter, databaseRetryOptions);
  await dbAdapter.execute({
    command: 'psql -c "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY)"',
    env: { PGHOST: 'localhost', PGUSER: 'myapp' }
  });

  // Example: API call with retry
  const apiAdapter = withExecutionRetry(adapter, apiRetryOptions);
  await apiAdapter.execute({
    command: 'curl -f https://api.example.com/data'
  });

  // Example: File processing with retry
  const fileAdapter = withExecutionRetry(adapter, fileSystemRetryOptions);
  await fileAdapter.execute({
    command: 'mv large_file.dat /mnt/storage/'
  });

  // Example: Complex deployment with custom retry logic
  const deployAdapter = withExecutionRetry(adapter, complexRetryLogic);
  await deployAdapter.execute({
    command: 'kubectl apply -f deployment.yaml'
  });
}

// Example 7: Custom retry logic for specific tools
function createGitRetryOptions(): RetryOptions {
  return {
    isRetryable: (result: ExecutionResult) => {
      const gitRetryableErrors = [
        'unable to access',
        'could not read from remote repository',
        'connection timed out',
        'early eof',
        'rpc failed',
        'the remote end hung up unexpectedly'
      ];

      const gitPermanentErrors = [
        'authentication failed',
        'repository not found',
        'pathspec .* did not match'
      ];

      const hasRetryable = gitRetryableErrors.some(err =>
        result.stderr.toLowerCase().includes(err)
      );

      const hasPermanent = gitPermanentErrors.some(err =>
        result.stderr.toLowerCase().includes(err)
      );

      return hasRetryable && !hasPermanent;
    },
    maxRetries: 3,
    initialDelay: 2000
  };
}

// Example 8: State-aware retry with cleanup
function createStatefulRetryOptions(): RetryOptions {
  const previousAttemptState: Record<string, any> = {};

  return {
    isRetryable: (result: ExecutionResult) => {
      // Track state between attempts
      if (result.stdout.includes('partial success')) {
        previousAttemptState.partial = true;
        return true;
      }
      return result.exitCode !== 0;
    },
    onRetry: (attempt, result, nextDelay) => {
      if (previousAttemptState.partial) {
        console.log('Cleaning up partial state before retry...');
        // Note: Actual cleanup would need to be done before the next attempt
      }
    },
    maxRetries: 3
  };
}

// Example 9: Default simple retry (just checks exit code)
const simpleRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  // isRetryable defaults to: (result) => result.exitCode !== 0
};

// Example 10: Memory pressure aware retry
const memoryAwareRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) => {
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
  },
  maxRetries: 2, // Fewer retries for memory issues
  initialDelay: 5000, // Longer delay to let system recover
  backoffMultiplier: 3,
  onRetry: (attempt, result, nextDelay) => {
    console.log(`Memory pressure detected, waiting ${nextDelay}ms for system to recover...`);
  }
};

// Example 11: Circuit breaker pattern
function createCircuitBreakerRetryOptions(threshold = 5): RetryOptions {
  let consecutiveFailures = 0;
  let circuitOpen = false;
  let lastFailureTime = 0;

  return {
    isRetryable: (result: ExecutionResult) => {
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
    },
    maxRetries: 3
  };
}

// Example 12: Time-based retry (only retry during business hours)
const businessHoursRetryOptions: RetryOptions = {
  isRetryable: (result: ExecutionResult) => {
    if (result.exitCode === 0) return false;

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Only retry during business hours (Mon-Fri, 9 AM - 5 PM)
    const isBusinessHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 17;

    if (!isBusinessHours) {
      console.log('Outside business hours - not retrying');
      return false;
    }

    return true;
  },
  maxRetries: 5,
  initialDelay: 60000 // 1 minute delays during business hours
};

// Example 13: Usage with $ helper
async function examplesWithDollar() {
  // Simple retry with default behavior
  const result1 = await $.retry({ maxRetries: 3 })`curl https://api.example.com`;

  // Complex retry with custom logic
  const $api = $.retry({
    maxRetries: 5,
    isRetryable: (result) =>
      // Only retry on network errors, not on 4xx client errors
      result.exitCode !== 0 &&
      !result.stderr.includes('404') &&
      !result.stderr.includes('401') &&
      !result.stderr.includes('403')

  });

  const result2 = await $api`curl -f https://flaky-api.com/data`;

  // Combining retry with other modifiers
  const $resilient = $.env({ API_KEY: 'secret' })
    .timeout(5000)
    .retry({
      maxRetries: 3,
      isRetryable: (result) =>
        // Timeout exit code is usually 124
        result.exitCode === 124 || result.stderr.includes('timeout')

    });

  const result3 = await $resilient`curl -H "Authorization: Bearer $API_KEY" https://slow-api.com`;

  // Retry with nothrow for ultimate control
  const $safe = $.retry(memoryAwareRetryOptions);
  const result4 = await $safe`memory-intensive-command`.nothrow();

  if (result4.exitCode !== 0) {
    console.log('Command failed even after retries:', result4.stderr);
  }
}

export {
  apiRetryOptions,
  complexRetryLogic,
  simpleRetryOptions,
  examplesWithDollar,
  databaseRetryOptions,
  createGitRetryOptions,
  fileSystemRetryOptions,
  ciPipelineRetryOptions,
  healthCheckRetryOptions,
  memoryAwareRetryOptions,
  businessHoursRetryOptions,
  createStatefulRetryOptions,
  createCircuitBreakerRetryOptions
};