export interface RetryOptions {
  /**
   * Maximum number of retry attempts (not including the initial attempt)
   */
  maxAttempts?: number;
  
  /**
   * Initial delay in milliseconds before the first retry
   */
  initialDelay?: number;
  
  /**
   * Maximum delay in milliseconds between retries
   */
  maxDelay?: number;
  
  /**
   * Backoff multiplier (e.g., 2 for exponential backoff)
   */
  backoffMultiplier?: number;
  
  /**
   * Whether to add jitter to retry delays
   */
  jitter?: boolean;
  
  /**
   * Function to determine if an error is retryable
   */
  isRetryable?: (error: Error) => boolean;
  
  /**
   * Callback for retry events
   */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  error: Error;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly errors: Error[]
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 100,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;
  
  const errors: Error[] = [];
  
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      
      // If this is the last attempt, throw
      if (attempt === maxAttempts) {
        throw new RetryError(
          `Failed after ${maxAttempts + 1} attempts: ${err.message}`,
          maxAttempts + 1,
          err,
          errors
        );
      }
      
      // Check if error is retryable
      if (!isRetryable(err)) {
        throw err;
      }
      
      // Calculate next delay
      const baseDelay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
      const delay = jitter ? addJitter(baseDelay) : baseDelay;
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, err, delay);
      }
      
      // Wait before next attempt
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected retry state');
}

function defaultIsRetryable(error: Error): boolean {
  // Default retry logic - retry on network errors, timeouts, and transient failures
  const retryableMessages = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
    'timeout',
    'timed out',
    'connection reset',
    'connection refused',
    'socket hang up',
  ];
  
  const message = error.message.toLowerCase();
  return retryableMessages.some(msg => message.includes(msg.toLowerCase()));
}

function addJitter(delay: number): number {
  // Add random jitter of ±25%
  const jitterRange = delay * 0.25;
  return delay + (Math.random() * 2 - 1) * jitterRange;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createRetryableAdapter<T extends { execute: (cmd: any) => Promise<any> }>(
  adapter: T,
  defaultRetryOptions?: RetryOptions
): T {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === 'execute') {
        return async (command: any) => {
          // Extract retry options from command or use defaults
          const retryOptions = command.retry || defaultRetryOptions;
          
          if (!retryOptions || (retryOptions.maxAttempts ?? 0) <= 0) {
            // No retry configured, execute normally
            return target.execute(command);
          }
          
          return withRetry(
            () => target.execute(command),
            retryOptions
          );
        };
      }
      
      return Reflect.get(target, prop, receiver);
    }
  });
}