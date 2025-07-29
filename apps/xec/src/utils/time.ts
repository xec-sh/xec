import { errorMessages } from './error-handler.js';

/**
 * Parse a timeout string into milliseconds
 * @param timeout - Timeout string (e.g., '30s', '5m', '1h', '500ms')
 * @returns Timeout in milliseconds
 */
export function parseTimeout(timeout: string | number): number {
  if (typeof timeout === 'number') {
    return timeout;
  }

  const match = timeout.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) {
    throw errorMessages.configurationInvalid('timeout', `Invalid timeout format: ${timeout}`);
  }

  const value = parseFloat(match[1] || '0');
  const unit = match[2] || 's';

  switch (unit) {
    case 'ms':
      return Math.floor(value);
    case 's':
      return Math.floor(value * 1000);
    case 'm':
      return Math.floor(value * 60 * 1000);
    case 'h':
      return Math.floor(value * 60 * 60 * 1000);
    default:
      return Math.floor(value * 1000);
  }
}

/**
 * Format milliseconds into a human-readable duration
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  const isNegative = ms < 0;
  const absMs = Math.abs(ms);
  
  if (absMs < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(absMs / 1000);
  if (seconds < 60) {
    return isNegative ? `-${seconds}s` : `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    const result = remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
    return isNegative ? `-${result}` : result;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes > 0) {
    const result = `${hours}h ${remainingMinutes}m`;
    return isNegative ? `-${result}` : result;
  }
  
  return isNegative ? `-${hours}h` : `${hours}h`;
}

/**
 * Parse a cron expression or interval string
 * @param interval - Interval string (e.g., '*\/5 * * * *', 'every 5m', '@hourly')
 * @returns Parsed interval object
 */
export function parseInterval(interval: string): {
  type: 'cron' | 'interval' | 'named';
  value: string | number;
} {
  // Named intervals
  const namedIntervals: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  if (namedIntervals[interval]) {
    return {
      type: 'named',
      value: namedIntervals[interval],
    };
  }

  // Cron expression
  if (interval.includes('*') || interval.split(' ').length === 5) {
    return {
      type: 'cron',
      value: interval,
    };
  }

  // Simple interval
  const everyMatch = interval.match(/^every\s+(.+)$/i);
  if (everyMatch && everyMatch[1]) {
    return {
      type: 'interval',
      value: parseTimeout(everyMatch[1]),
    };
  }

  throw errorMessages.configurationInvalid('interval', `Invalid interval format: ${interval}`);
}

/**
 * Calculate the next run time based on an interval
 * @param interval - Parsed interval object
 * @param from - Base time (defaults to now)
 * @returns Next run time
 */
export function getNextRunTime(
  interval: ReturnType<typeof parseInterval>,
  from: Date = new Date()
): Date {
  if (interval.type === 'interval') {
    return new Date(from.getTime() + (interval.value as number));
  }

  // For cron expressions, we would need a cron parser library
  // For now, throw an error
  throw new Error('Cron expression parsing not implemented');
}

/**
 * Sleep for a specified duration
 * @param duration - Duration to sleep (string or milliseconds)
 * @returns Promise that resolves after the duration
 */
export async function sleep(duration: string | number): Promise<void> {
  const ms = typeof duration === 'string' ? parseTimeout(duration) : duration;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after a specified duration
 * @param duration - Timeout duration (string or milliseconds)
 * @param message - Error message
 * @returns Promise that rejects after timeout
 */
export function createTimeoutPromise(
  duration: string | number,
  message: string = 'Operation timed out'
): Promise<never> {
  const ms = typeof duration === 'string' ? parseTimeout(duration) : duration;
  
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
}

/**
 * Execute a function with a timeout
 * @param fn - Function to execute
 * @param timeout - Timeout duration
 * @param timeoutMessage - Custom timeout message
 * @returns Result of the function or timeout error
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeout: string | number,
  timeoutMessage?: string
): Promise<T> {
  const timeoutPromise = createTimeoutPromise(timeout, timeoutMessage);
  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: string | number;
    maxDelay?: string | number;
    factor?: number;
    timeout?: string | number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = '1s',
    maxDelay = '30s',
    factor = 2,
    timeout,
  } = options;

  const initialDelayMs = typeof initialDelay === 'string' ? parseTimeout(initialDelay) : initialDelay;
  const maxDelayMs = typeof maxDelay === 'string' ? parseTimeout(maxDelay) : maxDelay;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (timeout) {
        return await withTimeout(fn, timeout);
      } else {
        return await fn();
      }
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * factor, maxDelayMs);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}