import { describe, it, expect, vi } from 'vitest';
import { retry, RetryPolicy } from '../../src/retry/index.js';

describe('retry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');
    const result = await retry(fn, { maxAttempts: 3, initialDelay: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(retry(fn, { maxAttempts: 2, initialDelay: 10 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect retryOn predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    await expect(
      retry(fn, { maxAttempts: 3, initialDelay: 10, retryOn: () => false })
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    await retry(fn, { maxAttempts: 2, initialDelay: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });
});

describe('RetryPolicy', () => {
  it('should build and execute', async () => {
    const policy = RetryPolicy.create()
      .maxAttempts(3)
      .backoff('fixed', { initial: 10 })
      .build();

    const fn = vi.fn().mockResolvedValue(42);
    const result = await policy.execute(fn);
    expect(result).toBe(42);
  });

  it('should expose config', () => {
    const policy = RetryPolicy.create()
      .maxAttempts(5)
      .backoff('exponential', { initial: 100, max: 5000, multiplier: 3 })
      .jitter(0.2)
      .build();

    expect(policy.config.maxAttempts).toBe(5);
    expect(policy.config.backoff).toBe('exponential');
    expect(policy.config.initialDelay).toBe(100);
    expect(policy.config.maxDelay).toBe(5000);
    expect(policy.config.multiplier).toBe(3);
    expect(policy.config.jitter).toBe(0.2);
  });
});
