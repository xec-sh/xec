import { task } from '../dsl/task.js';
import { Task, Recipe } from '../core/types.js';
import { setState, getState } from '../context/globals.js';
import {
  TimeoutOptions,
  BulkheadOptions,
  FallbackOptions,
  ResiliencePattern,
  CircuitBreakerOptions
} from './types.js';

// Circuit Breaker Pattern
export class CircuitBreaker implements ResiliencePattern {
  name = 'circuit-breaker';
  description = 'Circuit breaker pattern to prevent cascading failures';
  category = 'resilience' as const;
  tags = ['fault-tolerance', 'stability', 'failure-handling'];

  constructor(private options: CircuitBreakerOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    
    const circuitBreakerTask = task(`circuit-breaker-${this.options.task.name}`)
      .description(`Circuit breaker wrapper for ${this.options.task.name}`)
      .handler(async (context) => {
        const stateKey = `circuit-breaker:${this.options.task.name}`;
        const circuitState = await getState(stateKey) || {
          state: 'closed',
          failures: 0,
          lastFailureTime: null,
          successCount: 0
        };

        // Check if circuit should be opened
        if (circuitState.state === 'open') {
          const timeSinceLastFailure = Date.now() - circuitState.lastFailureTime;
          if (timeSinceLastFailure < this.options.resetTimeout) {
            context.logger.warn(`Circuit breaker is OPEN for ${this.options.task.name}`);
            if (this.options.onOpen) {
              await this.options.onOpen();
            }
            throw new Error('Circuit breaker is open');
          }
          
          // Move to half-open state
          circuitState.state = 'half-open';
          circuitState.successCount = 0;
          await setState(stateKey, circuitState);
          
          if (this.options.onHalfOpen) {
            await this.options.onHalfOpen();
          }
        }

        try {
          // Execute the wrapped task
          const result = await this.options.task.handler(context);
          
          // Handle success
          if (circuitState.state === 'half-open') {
            circuitState.successCount++;
            
            // Check if we can close the circuit
            if (circuitState.successCount >= (this.options.halfOpenRequests || 1)) {
              circuitState.state = 'closed';
              circuitState.failures = 0;
              context.logger.info(`Circuit breaker is now CLOSED for ${this.options.task.name}`);
              
              if (this.options.onClose) {
                await this.options.onClose();
              }
            }
          }
          
          if (circuitState.state === 'closed') {
            circuitState.failures = 0;
          }
          
          await setState(stateKey, circuitState);
          return result;
          
        } catch (error) {
          // Handle failure
          circuitState.failures++;
          circuitState.lastFailureTime = Date.now();
          
          if (circuitState.failures >= this.options.failureThreshold) {
            circuitState.state = 'open';
            context.logger.error(`Circuit breaker is now OPEN for ${this.options.task.name} after ${circuitState.failures} failures`);
          }
          
          await setState(stateKey, circuitState);
          throw error;
        }
      })
      .build();
    
    tasksMap.set(circuitBreakerTask.name, circuitBreakerTask);
    
    return {
      id: `circuit-breaker-${this.options.task.name}`,
      name: `Circuit Breaker - ${this.options.task.name}`,
      description: this.description,
      tasks: tasksMap
    };
  }
}

// Bulkhead Pattern
export class Bulkhead implements ResiliencePattern {
  name = 'bulkhead';
  description = 'Bulkhead pattern to isolate resources and prevent resource exhaustion';
  category = 'resilience' as const;
  tags = ['isolation', 'resource-management', 'concurrency-control'];

  constructor(private options: BulkheadOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    
    const bulkheadTask = task('bulkhead-controller')
      .description('Bulkhead pattern controller')
      .handler(async (context) => {
        const stateKey = 'bulkhead:active';
        const queueKey = 'bulkhead:queue';
        
        // Initialize state
        let activeCount = await getState(stateKey) || 0;
        const queue = await getState(queueKey) || [];
        
        const results = [];
        const errors = [];
        
        for (const task of this.options.tasks) {
          // Check if we can execute immediately
          if (activeCount < this.options.maxConcurrency) {
            activeCount++;
            await setState(stateKey, activeCount);
            
            try {
              const result = await task.handler(context);
              results.push({ task: task.name, result });
            } catch (error) {
              errors.push({ task: task.name, error });
            } finally {
              activeCount--;
              await setState(stateKey, activeCount);
              
              // Process queue if any
              if (queue.length > 0) {
                const nextTask = queue.shift();
                await setState(queueKey, queue);
                // Execute next queued task
              }
            }
          } else {
            // Add to queue if space available
            if (!this.options.queueSize || queue.length < this.options.queueSize) {
              queue.push(task);
              await setState(queueKey, queue);
              context.logger.info(`Task ${task.name} added to queue (queue size: ${queue.length})`);
            } else {
              // Reject task
              context.logger.warn(`Task ${task.name} rejected - queue is full`);
              if (this.options.onReject) {
                await this.options.onReject(task);
              }
              errors.push({ task: task.name, error: new Error('Bulkhead queue is full') });
            }
          }
        }
        
        return { results, errors };
      })
      .build();
    
    tasksMap.set(bulkheadTask.name, bulkheadTask);
    
    return {
      id: 'bulkhead-pattern',
      name: 'Bulkhead Pattern',
      description: this.description,
      tasks: tasksMap
    };
  }
}

// Timeout Pattern
export class Timeout implements ResiliencePattern {
  name = 'timeout';
  description = 'Timeout pattern to prevent indefinite waits';
  category = 'resilience' as const;
  tags = ['performance', 'reliability', 'timeout-handling'];

  constructor(private options: TimeoutOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    
    const timeoutTask = task(`timeout-${this.options.task.name}`)
      .description(`Timeout wrapper for ${this.options.task.name}`)
      .handler(async (context) => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Task ${this.options.task.name} timed out after ${this.options.timeout}ms`));
          }, this.options.timeout);
        });
        
        try {
          const result = await Promise.race([
            this.options.task.handler(context),
            timeoutPromise
          ]);
          return result;
        } catch (error) {
          if ((error as Error).message.includes('timed out')) {
            context.logger.error(`Task ${this.options.task.name} timed out`);
            
            if (this.options.onTimeout) {
              await this.options.onTimeout();
            }
            
            if (this.options.fallback) {
              context.logger.info('Executing fallback task');
              return await this.options.fallback.handler(context);
            }
          }
          throw error;
        }
      })
      .build();
    
    tasksMap.set(timeoutTask.name, timeoutTask);
    
    return {
      id: `timeout-${this.options.task.name}`,
      name: `Timeout - ${this.options.task.name}`,
      description: this.description,
      tasks: tasksMap
    };
  }
}

// Fallback Pattern
export class Fallback implements ResiliencePattern {
  name = 'fallback';
  description = 'Fallback pattern to provide alternative behavior on failure';
  category = 'resilience' as const;
  tags = ['fault-tolerance', 'graceful-degradation', 'error-recovery'];

  constructor(private options: FallbackOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    
    const fallbackTask = task(`fallback-${this.options.primary.name}`)
      .description(`Fallback wrapper for ${this.options.primary.name}`)
      .handler(async (context) => {
        try {
          return await this.options.primary.handler(context);
        } catch (error) {
          context.logger.warn(`Primary task ${this.options.primary.name} failed: ${(error as Error).message}`);
          
          // Check if we should use fallback
          const shouldFallback = this.options.fallbackOn 
            ? this.options.fallbackOn(error as Error)
            : true;
          
          if (shouldFallback) {
            context.logger.info('Executing fallback task');
            
            const fallbackTask = typeof this.options.fallback === 'function'
              ? this.options.fallback(error as Error)
              : this.options.fallback;
            
            return await fallbackTask.handler(context);
          }
          
          throw error;
        }
      })
      .build();
    
    tasksMap.set(fallbackTask.name, fallbackTask);
    
    return {
      id: `fallback-${this.options.primary.name}`,
      name: `Fallback - ${this.options.primary.name}`,
      description: this.description,
      tasks: tasksMap
    };
  }
}

// Factory functions
export function circuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreaker(options);
}

export function bulkhead(options: BulkheadOptions): Bulkhead {
  return new Bulkhead(options);
}

export function timeout(options: TimeoutOptions): Timeout {
  return new Timeout(options);
}

export function fallback(options: FallbackOptions): Fallback {
  return new Fallback(options);
}

// Retry Pattern with exponential backoff
export interface RetryOptions {
  task: Task;
  maxAttempts: number;
  delay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  jitter?: boolean;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void | Promise<void>;
}

export class Retry implements ResiliencePattern {
  name = 'retry';
  description = 'Retry pattern with configurable backoff strategies';
  category = 'resilience' as const;
  tags = ['retry', 'exponential-backoff', 'error-recovery'];

  constructor(private options: RetryOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    
    const retryTask = task(`retry-${this.options.task.name}`)
      .description(`Retry wrapper for ${this.options.task.name}`)
      .handler(async (context) => {
        let lastError: Error = new Error('No attempts made');
        const delay = this.options.delay || 1000;
        const multiplier = this.options.backoffMultiplier || 2;
        const maxDelay = this.options.maxDelay || 30000;
        
        for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
          try {
            return await this.options.task.handler(context);
          } catch (error) {
            lastError = error as Error;
            
            // Check if we should retry this error
            if (this.options.retryOn && !this.options.retryOn(error as Error)) {
              throw error;
            }
            
            if (attempt < this.options.maxAttempts) {
              // Calculate delay with exponential backoff
              let waitTime = Math.min(delay * Math.pow(multiplier, attempt - 1), maxDelay);
              
              // Add jitter if enabled
              if (this.options.jitter) {
                waitTime = waitTime * (0.5 + Math.random() * 0.5);
              }
              
              context.logger.info(`Retry attempt ${attempt}/${this.options.maxAttempts} for ${this.options.task.name} after ${waitTime}ms`);
              
              if (this.options.onRetry) {
                await this.options.onRetry(attempt, error as Error);
              }
              
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
        
        throw new Error(`Task ${this.options.task.name} failed after ${this.options.maxAttempts} attempts: ${lastError.message}`);
      })
      .build();
    
    tasksMap.set(retryTask.name, retryTask);
    
    return {
      id: `retry-${this.options.task.name}`,
      name: `Retry - ${this.options.task.name}`,
      description: this.description,
      tasks: tasksMap
    };
  }
}

export function retry(options: RetryOptions): Retry {
  return new Retry(options);
}