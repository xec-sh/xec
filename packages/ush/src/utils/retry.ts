import type { Command } from '../core/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

export interface RetryOptions {
  attempts?: number;
  delay?: number | Generator<number>;
  onRetry?: (error: Error, attempt: number) => void | Promise<void>;
  shouldRetry?: (error: Error) => boolean;
  retryOn?: number[];
}

export function* expBackoff(
  max = Number.MAX_SAFE_INTEGER,
  jitter = 0,
  factor = 2,
  delay = 100
): Generator<number> {
  let attempt = 0;
  while (attempt < max) {
    const backoff = delay * Math.pow(factor, attempt);
    const jitterValue = jitter * backoff * (Math.random() * 2 - 1);
    yield Math.floor(backoff + jitterValue);
    attempt++;
  }
}

export async function retry<T>(
  fn: () => T | Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    delay = 100,
    onRetry,
    shouldRetry = () => true,
    retryOn = []
  } = options;

  const delayGenerator = typeof delay === 'number'
    ? (function* () { while (true) yield delay; })()
    : delay;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      const isRetryableCode = retryOn.length === 0 ||
        (error as any).exitCode !== undefined && retryOn.includes((error as any).exitCode);

      if (attempt >= attempts || !shouldRetry(lastError) || !isRetryableCode) {
        throw lastError;
      }

      if (onRetry) {
        await onRetry(lastError, attempt);
      }

      const delayMs = delayGenerator.next().value ?? 0;
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

export function withRetry(engine: ExecutionEngine, options: RetryOptions = {}): ExecutionEngine {
  const originalExecute = engine.execute.bind(engine);

  return Object.create(engine, {
    execute: {
      async value(cmd: Command): Promise<ExecutionResult> {
        return retry(() => originalExecute(cmd), options);
      }
    }
  });
}