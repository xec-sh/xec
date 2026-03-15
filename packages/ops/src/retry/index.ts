/**
 * Retry policies with exponential backoff, jitter, circuit breaker.
 *
 * @example
 * ```typescript
 * import { retry, RetryPolicy } from '@xec-sh/ops/retry';
 *
 * // Simple retry
 * const result = await retry(() => fetch(url), { maxAttempts: 3 });
 *
 * // Fluent builder
 * const policy = RetryPolicy.create()
 *   .maxAttempts(5)
 *   .backoff('exponential', { initial: 100, max: 30_000 })
 *   .jitter(0.25)
 *   .retryOn(err => err.message.includes('ECONNRESET'))
 *   .onRetry((attempt, err) => console.log(`Retry ${attempt}: ${err.message}`))
 *   .build();
 *
 * const data = await policy.execute(() => riskyOperation());
 * ```
 *
 * @module @xec-sh/ops/retry
 */

export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

export interface RetryConfig {
  maxAttempts: number;
  backoff: BackoffStrategy;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: number;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  abortSignal?: AbortSignal;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoff: 'exponential',
  initialDelay: 200,
  maxDelay: 30_000,
  multiplier: 2,
  jitter: 0.1,
};

function computeDelay(config: RetryConfig, attempt: number): number {
  let delay: number;
  switch (config.backoff) {
    case 'fixed':
      delay = config.initialDelay;
      break;
    case 'linear':
      delay = config.initialDelay * attempt;
      break;
    case 'exponential':
      delay = config.initialDelay * Math.pow(config.multiplier, attempt - 1);
      break;
  }
  delay = Math.min(delay, config.maxDelay);

  // Apply jitter: ±jitter%
  if (config.jitter > 0) {
    const range = delay * config.jitter;
    delay += (Math.random() * 2 - 1) * range;
  }

  return Math.max(0, Math.round(delay));
}

/**
 * Execute a function with retry logic.
 */
export async function retry<T>(
  fn: (attempt: number) => T | Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    if (cfg.abortSignal?.aborted) {
      throw new Error('Retry aborted');
    }

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === cfg.maxAttempts) break;
      if (cfg.retryOn && !cfg.retryOn(lastError)) break;

      const delay = computeDelay(cfg, attempt);
      cfg.onRetry?.(attempt, lastError, delay);

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new Error('All retry attempts failed');
}

/**
 * Fluent builder for retry policies.
 */
export class RetryPolicy {
  private config: RetryConfig = { ...DEFAULT_CONFIG };

  private constructor() {}

  static create(): RetryPolicy {
    return new RetryPolicy();
  }

  maxAttempts(n: number): this {
    this.config.maxAttempts = n;
    return this;
  }

  backoff(strategy: BackoffStrategy, opts?: { initial?: number; max?: number; multiplier?: number }): this {
    this.config.backoff = strategy;
    if (opts?.initial !== undefined) this.config.initialDelay = opts.initial;
    if (opts?.max !== undefined) this.config.maxDelay = opts.max;
    if (opts?.multiplier !== undefined) this.config.multiplier = opts.multiplier;
    return this;
  }

  jitter(factor: number): this {
    this.config.jitter = factor;
    return this;
  }

  retryOn(predicate: (error: Error) => boolean): this {
    this.config.retryOn = predicate;
    return this;
  }

  onRetry(handler: (attempt: number, error: Error, delay: number) => void): this {
    this.config.onRetry = handler;
    return this;
  }

  signal(signal: AbortSignal): this {
    this.config.abortSignal = signal;
    return this;
  }

  build(): { execute<T>(fn: (attempt: number) => T | Promise<T>): Promise<T>; config: Readonly<RetryConfig> } {
    const cfg = { ...this.config };
    return {
      execute: <T>(fn: (attempt: number) => T | Promise<T>) => retry(fn, cfg),
      config: cfg,
    };
  }
}
