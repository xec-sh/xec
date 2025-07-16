import { test, jest, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionEngine } from '../../../src/index';
import { CommandError } from '../../../src/core/error';
import { ExecutionResultImpl } from '../../../src/core/result';
import { LocalAdapter } from '../../../src/adapters/local-adapter';
import { RetryError, createRetryableAdapter, withRetry as withRetryFunction } from '../../../src/utils/retry-adapter';

describe('Retry Mechanism', () => {
  let engine: ExecutionEngine;
  
  beforeEach(() => {
    engine = new ExecutionEngine({
      throwOnNonZeroExit: true
    });
  });

  describe('withRetry function', () => {
    test('should retry on failure with default options', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      const result = await withRetryFunction(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should respect maxAttempts', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        throw new Error('ECONNREFUSED');
      });

      await expect(
        withRetryFunction(fn, { maxAttempts: 2 })
      ).rejects.toThrow(RetryError);
      
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    test('should apply exponential backoff', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Mock setTimeout to capture delays
      global.setTimeout = jest.fn((fn: any, delay?: number) => {
        delays.push(delay || 0);
        return originalSetTimeout(fn, 0); // Execute immediately in tests
      }) as any;

      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 4) {
          throw new Error('ETIMEDOUT');
        }
        return 'success';
      });

      await withRetryFunction(fn, {
        maxAttempts: 3,
        initialDelay: 100,
        backoffMultiplier: 2,
        jitter: false
      });

      global.setTimeout = originalSetTimeout;

      // Check exponential backoff delays
      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(100);  // First retry: 100ms
      expect(delays[1]).toBe(200);  // Second retry: 100 * 2^1
      expect(delays[2]).toBe(400);  // Third retry: 100 * 2^2
    });

    test('should check isRetryable function', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('ECONNREFUSED'); // Retryable
        } else {
          throw new Error('INVALID_INPUT'); // Not retryable
        }
      });

      const isRetryable = (error: Error) => error.message.includes('ECONNREFUSED');

      await expect(
        withRetryFunction(fn, { maxAttempts: 3, isRetryable })
      ).rejects.toThrow('INVALID_INPUT');
      
      expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    test('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      let attempts = 0;
      
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      await withRetryFunction(fn, {
        maxAttempts: 2,
        onRetry,
        initialDelay: 0
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
    });
  });

  describe('Command-level retry', () => {
    test('should retry command execution with retry options', async () => {
      let attempts = 0;
      
      // Create a mock adapter that fails first 2 times
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          if (attempts < 3 && cmd.command === 'flaky-command') {
            throw new CommandError('flaky-command', 1, undefined, '', 'Connection timeout', 100);
          }
          const startedAt = new Date();
          const finishedAt = new Date();
          return new ExecutionResultImpl(
            'success',
            '',
            0,
            undefined,
            cmd.command,
            10,
            startedAt,
            finishedAt,
            'local'
          );
        },
        async isAvailable() { return true; }
      };

      // Register the mock adapter as 'local' to bypass type issues
      (engine as any).registerAdapter('local', mockAdapter);

      const result = await engine.execute({
        command: 'flaky-command',
        adapter: 'local',
        retry: {
          maxAttempts: 2,
          initialDelay: 10,
          isRetryable: (error) => {
            // For CommandError, check the stderr field
            if (error instanceof CommandError) {
              return error.stderr.includes('timeout');
            }
            return error.message.includes('timeout');
          }
        }
      });

      expect(attempts).toBe(3);
      expect(result.stdout).toBe('success');
    });

    test('should not retry when retry is disabled', async () => {
      let attempts = 0;
      
      const originalExecute = engine.execute.bind(engine);
      engine.execute = jest.fn(async (cmd: any) => {
        attempts++;
        if (cmd.command === 'fail-command') {
          throw new CommandError('fail-command', 1, undefined, '', 'Error', 100);
        }
        return originalExecute(cmd);
      });

      await expect(
        engine.execute({
          command: 'fail-command',
          retry: {
            maxAttempts: 0
          }
        })
      ).rejects.toThrow(CommandError);

      expect(attempts).toBe(1);
    });
  });

  describe('createRetryableAdapter', () => {
    test('should create a retryable adapter proxy', async () => {
      let attempts = 0;
      const mockAdapter = new LocalAdapter();
      
      // Mock execute to fail first time
      mockAdapter.execute = jest.fn(async (cmd: any) => {
        attempts++;
        if (attempts === 1) {
          throw new Error('ECONNREFUSED');
        }
        const startedAt = new Date();
        const finishedAt = new Date();
        return new ExecutionResultImpl(
          'success',
          '',
          0,
          undefined,
          cmd.command,
          10,
          startedAt,
          finishedAt,
          'local'
        );
      });

      const retryableAdapter = createRetryableAdapter(mockAdapter, {
        maxAttempts: 2,
        initialDelay: 10
      });

      const result = await retryableAdapter.execute({
        command: 'test'
      });

      expect(result.stdout).toBe('success');
      expect(mockAdapter.execute).toHaveBeenCalledTimes(2);
    });

    test('should use command retry options over default', async () => {
      let attempts = 0;
      const mockAdapter = new LocalAdapter();
      
      mockAdapter.execute = jest.fn(async (cmd: any) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        const startedAt = new Date();
        const finishedAt = new Date();
        return new ExecutionResultImpl(
          'success',
          '',
          0,
          undefined,
          cmd.command,
          10,
          startedAt,
          finishedAt,
          'local'
        );
      });

      const retryableAdapter = createRetryableAdapter(mockAdapter, {
        maxAttempts: 1 // Default is 1 retry
      });

      // Command specifies 2 retries, should override default
      const result = await retryableAdapter.execute({
        command: 'test',
        retry: {
          maxAttempts: 2,
          initialDelay: 10
        }
      });

      expect(result.stdout).toBe('success');
      expect(mockAdapter.execute).toHaveBeenCalledTimes(3);
    });
  });

  describe('RetryError', () => {
    test('should contain all error information', async () => {
      const errors: Error[] = [];
      let attempts = 0;
      
      const fn = jest.fn(async () => {
        attempts++;
        const error = new Error(`Attempt ${attempts} failed`);
        errors.push(error);
        throw error;
      });

      try {
        await withRetryFunction(fn, { 
          maxAttempts: 2, 
          initialDelay: 0,
          isRetryable: () => true // Force all errors to be retryable
        });
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        const retryError = error as RetryError;
        expect(retryError.attempts).toBe(3);
        expect(retryError.lastError.message).toBe('Attempt 3 failed');
        expect(retryError.errors).toHaveLength(3);
        expect(retryError.message).toContain('Failed after 3 attempts');
      }
    });
  });

  describe('Default retryable errors', () => {
    test('should retry on network errors by default', async () => {
      const networkErrors = [
        'ECONNREFUSED',
        'ECONNRESET', 
        'ETIMEDOUT',
        'EPIPE',
        'ENOTFOUND',
        'Connection timeout',
        'Request timed out',
        'Connection reset by peer',
        'Connection refused',
        'socket hang up'
      ];

      for (const errorMsg of networkErrors) {
        let attempts = 0;
        const fn = jest.fn(async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error(errorMsg);
          }
          return 'success';
        });

        const result = await withRetryFunction(fn, { maxAttempts: 1, initialDelay: 0 });
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      }
    });

    test('should not retry on non-network errors by default', async () => {
      const nonNetworkErrors = [
        'Invalid input',
        'Permission denied',
        'File not found',
        'Syntax error'
      ];

      for (const errorMsg of nonNetworkErrors) {
        const fn = jest.fn(async () => {
          throw new Error(errorMsg);
        });

        await expect(
          withRetryFunction(fn, { maxAttempts: 2, initialDelay: 0 })
        ).rejects.toThrow(errorMsg);
        
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });
  });
});