import { ExecutionResult } from '../core/result.js';

import type { EnhancedEventEmitter } from './event-emitter.js';

export interface RetryOptions {
  /**
   * Maximum number of retry attempts (not including the initial attempt)
   */
  maxRetries?: number;
  
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
   * Function to determine if a command result is retryable
   * Gets the full ExecutionResult for analysis
   */
  isRetryable?: (result: ExecutionResult) => boolean;
  
  /**
   * Callback for retry events
   */
  onRetry?: (attempt: number, result: ExecutionResult, nextDelay: number) => void;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastResult: ExecutionResult,
    public readonly results: ExecutionResult[]
  ) {
    super(message);
    this.name = 'RetryError';
  }
}


/**
 * Retry function specifically for ExecutionResult
 */
export async function withExecutionRetry(
  fn: () => Promise<ExecutionResult>,
  options: RetryOptions = {},
  eventEmitter?: EnhancedEventEmitter
): Promise<ExecutionResult> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;
  
  const results: ExecutionResult[] = [];
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    results.push(result);
    
    // If command succeeded, return result
    if (result.exitCode === 0) {
      if (attempt > 0 && eventEmitter) {
        // Emit retry success event
        eventEmitter.emitEnhanced('retry:success', {
          attempts: attempt + 1,
          totalDuration: Date.now() - startTime,
          command: result.command
        }, 'retry');
      }
      return result;
    }
    
    // If this is the last attempt, throw
    if (attempt === maxRetries) {
      if (eventEmitter) {
        // Emit retry failed event
        eventEmitter.emitEnhanced('retry:failed', {
          attempts: maxRetries + 1,
          totalDuration: Date.now() - startTime,
          command: result.command,
          lastError: result.stderr || `Exit code ${result.exitCode}`
        }, 'retry');
      }
      throw new RetryError(
        `Failed after ${maxRetries + 1} attempts: ${result.command}`,
        maxRetries + 1,
        result,
        results
      );
    }
    
    // Check if result is retryable
    if (!isRetryable(result)) {
      if (eventEmitter) {
        // Emit retry failed event
        eventEmitter.emitEnhanced('retry:failed', {
          attempts: attempt + 1,
          totalDuration: Date.now() - startTime,
          command: result.command,
          lastError: 'Not retryable'
        }, 'retry');
      }
      throw new RetryError(
        `Command failed and is not retryable: ${result.command}`,
        attempt + 1,
        result,
        results
      );
    }
    
    // Calculate next delay
    const baseDelay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
    const delay = jitter ? addJitter(baseDelay) : baseDelay;
    
    // Call retry callback if provided
    if (onRetry) {
      onRetry(attempt + 1, result, delay);
    }
    
    // Emit retry attempt event
    if (eventEmitter) {
      eventEmitter.emitEnhanced('retry:attempt', {
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        delay,
        command: result.command,
        error: result.stderr || `Exit code ${result.exitCode}`
      }, 'retry');
    }
    
    // Wait before next attempt
    await sleep(delay);
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected retry state');
}

function defaultIsRetryable(result: ExecutionResult): boolean {
  // Simple default: retry on non-zero exit codes
  return result.exitCode !== 0;
}

function addJitter(delay: number): number {
  // Add random jitter of ±25%
  const jitterRange = delay * 0.25;
  return delay + (Math.random() * 2 - 1) * jitterRange;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createRetryableAdapter<T extends { execute: (cmd: any) => Promise<ExecutionResult> }>(
  adapter: T,
  defaultRetryOptions?: RetryOptions
): T {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === 'execute') {
        return async (command: any) => {
          // Extract retry options from command or use defaults
          const retryOptions = command.retry || defaultRetryOptions;
          
          // Check if retry is configured
          const maxRetries = retryOptions?.maxRetries ?? 0;
          if (!retryOptions || maxRetries <= 0) {
            // No retry configured, execute normally
            return target.execute(command);
          }
          
          return withExecutionRetry(
            () => target.execute(command),
            retryOptions
          );
        };
      }
      
      return Reflect.get(target, prop, receiver);
    }
  });
}