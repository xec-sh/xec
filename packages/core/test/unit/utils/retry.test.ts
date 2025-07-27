import { test, jest, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionEngine } from '../../../src/index';
import { ExecutionResultImpl } from '../../../src/core/result';
import { LocalAdapter } from '../../../src/adapters/local-adapter';
import { RetryError, withExecutionRetry, createRetryableAdapter } from '../../../src/utils/retry-adapter';

// Helper function to create ExecutionResult
function createResult(options: {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration?: number;
}): ExecutionResultImpl {
  return new ExecutionResultImpl(
    options.stdout,
    options.stderr,
    options.exitCode,
    undefined, // signal
    options.command,
    options.duration || 100,
    new Date(),
    new Date(),
    'local'
  );
}

describe('Retry Mechanism', () => {
  let engine: ExecutionEngine;
  
  beforeEach(() => {
    engine = new ExecutionEngine({
      throwOnNonZeroExit: true
    });
  });

  describe('withExecutionRetry function', () => {
    test('should retry on failure with default options', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          return createResult({
            command: 'test',
            exitCode: 1,
            stdout: '',
            stderr: 'ECONNREFUSED',
            duration: 100
          });
        }
        return createResult({
          command: 'test',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          duration: 100
        });
      });

      const result = await withExecutionRetry(fn);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should respect maxRetries', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        return createResult({
          command: 'test',
          exitCode: 1,
          stdout: '',
          stderr: 'ECONNREFUSED',
          duration: 100
        });
      });

      await expect(
        withExecutionRetry(fn, { maxRetries: 2 })
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
          return createResult({
            command: 'test',
            exitCode: 1,
            stdout: '',
            stderr: 'ETIMEDOUT',
            duration: 100
          });
        }
        return createResult({
          command: 'test',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          duration: 100
        });
      });

      await withExecutionRetry(fn, {
        maxRetries: 3,
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
          return createResult({
            command: 'test',
            exitCode: 1,
            stdout: '',
            stderr: 'ECONNREFUSED', // Retryable
            duration: 100
          });
        } else {
          return createResult({
            command: 'test',
            exitCode: 1,
            stdout: '',
            stderr: 'INVALID_INPUT', // Not retryable
            duration: 100
          });
        }
      });

      const isRetryable = (result: any) => result.stderr.includes('ECONNREFUSED');

      await expect(
        withExecutionRetry(fn, { maxRetries: 3, isRetryable })
      ).rejects.toThrow(RetryError);
      
      expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    test('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      let attempts = 0;
      
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          return createResult({
            command: 'test',
            exitCode: 1,
            stdout: '',
            stderr: 'ECONNREFUSED',
            duration: 100
          });
        }
        return createResult({
          command: 'test',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          duration: 100
        });
      });

      await withExecutionRetry(fn, {
        maxRetries: 2,
        onRetry,
        initialDelay: 0
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(ExecutionResultImpl), expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(ExecutionResultImpl), expect.any(Number));
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
            return createResult({
              command: 'flaky-command',
              exitCode: 1,
              stdout: '',
              stderr: 'Connection timeout',
              duration: 100
            });
          }
          return createResult({
            command: cmd.command,
            exitCode: 0,
            stdout: 'success',
            stderr: '',
            duration: 100
          });
        },
        async isAvailable() { return true; }
      };

      // Register the mock adapter as 'local' to bypass type issues
      (engine as any).registerAdapter('local', mockAdapter);

      const result = await engine.execute({
        command: 'flaky-command',
        adapter: 'local',
        retry: {
          maxRetries: 2,
          initialDelay: 10,
          isRetryable: (result) => result.stderr.includes('timeout')
        }
      });

      expect(attempts).toBe(3);
      expect(result.stdout).toBe('success');
    });

    test('should not retry when retry is disabled', async () => {
      let attempts = 0;
      
      // Create a mock adapter that always fails
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          return createResult({
            command: cmd.command,
            exitCode: 1,
            stdout: '',
            stderr: 'Error',
            duration: 100
          });
        },
        async isAvailable() { return true; }
      };

      // Register the mock adapter
      (engine as any).registerAdapter('local', mockAdapter);

      const result = await engine.execute({
        command: 'fail-command',
        adapter: 'local',
        retry: {
          maxRetries: 0
        },
        nothrow: true // Add nothrow to prevent error
      });

      expect(result.exitCode).toBe(1);
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
          return createResult({
            command: cmd.command,
            exitCode: 1,
            stdout: '',
            stderr: 'ECONNREFUSED',
            duration: 100
          });
        }
        return createResult({
          command: cmd.command,
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          duration: 100
        });
      });

      const retryableAdapter = createRetryableAdapter(mockAdapter, {
        maxRetries: 2,
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
          return createResult({
            command: cmd.command,
            exitCode: 1,
            stdout: '',
            stderr: 'ECONNREFUSED',
            duration: 100
          });
        }
        return createResult({
          command: cmd.command,
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          duration: 100
        });
      });

      const retryableAdapter = createRetryableAdapter(mockAdapter, {
        maxRetries: 1 // Default is 1 retry
      });

      // Command specifies 2 retries, should override default
      const result = await retryableAdapter.execute({
        command: 'test',
        retry: {
          maxRetries: 2,
          initialDelay: 10
        }
      });

      expect(result.stdout).toBe('success');
      expect(mockAdapter.execute).toHaveBeenCalledTimes(3);
    });
  });

  describe('RetryError', () => {
    test('should contain all error information', async () => {
      let attempts = 0;
      
      const fn = jest.fn(async () => {
        attempts++;
        return createResult({
          command: `test-attempt-${attempts}`,
          exitCode: 1,
          stdout: '',
          stderr: `Attempt ${attempts} failed`,
          duration: 100
        });
      });

      try {
        await withExecutionRetry(fn, { 
          maxRetries: 2, 
          initialDelay: 0,
          isRetryable: () => true // Force all errors to be retryable
        });
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        const retryError = error as RetryError;
        expect(retryError.attempts).toBe(3);
        expect(retryError.lastResult.exitCode).toBe(1);
        expect(retryError.lastResult.stderr).toBe('Attempt 3 failed');
        expect(retryError.results).toHaveLength(3);
        expect(retryError.message).toContain('Failed after 3 attempts');
      }
    });
  });

  describe('Default retry behavior', () => {
    test('should retry on non-zero exit codes by default', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts === 1) {
          return createResult({
            command: 'test',
            exitCode: 1,
            stdout: '',
            stderr: 'Command failed',
            duration: 100
          });
        }
        return createResult({
          command: 'test',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          duration: 100
        });
      });

      const result = await withExecutionRetry(fn, { maxRetries: 1, initialDelay: 0 });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('should not retry on success (exit code 0)', async () => {
      const fn = jest.fn(async () => createResult({
          command: 'test',
          exitCode: 0,
          stdout: 'success immediately',
          stderr: '',
          duration: 100
        }));

      const result = await withExecutionRetry(fn, { maxRetries: 3, initialDelay: 0 });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('success immediately');
      expect(fn).toHaveBeenCalledTimes(1); // No retries needed
    });
  });

  describe('$.retry() method', () => {
    test('should create a retry-enabled engine', async () => {
      const $retry = engine.retry({
        maxRetries: 2,
        initialDelay: 10,
        isRetryable: (result) => result.stderr.includes('ECONNREFUSED')
      });

      // Test that the retry engine is different from the original
      expect($retry).not.toBe(engine);
      expect($retry).toBeInstanceOf(ExecutionEngine);
    });

    test('should apply retry logic to commands', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          if (attempts < 3) {
            return createResult({
              command: 'test-command',
              exitCode: 1,
              stdout: '',
              stderr: 'ECONNREFUSED connection failed',
              duration: 100
            });
          }
          return createResult({
            command: cmd.command,
            exitCode: 0,
            stdout: 'success after retry',
            stderr: '',
            duration: 100
          });
        },
        async isAvailable() { return true; }
      };

      // Create a retry-enabled engine with our mock adapter
      const $retry = engine.retry({
        maxRetries: 2,
        initialDelay: 10,
        isRetryable: (result) => result.stderr.includes('ECONNREFUSED')
      });

      // Register the mock adapter
      ($retry as any).registerAdapter('local', mockAdapter);

      const result = await $retry.execute({
        command: 'test-command',
        adapter: 'local'
      });

      expect(attempts).toBe(3);
      expect(result.stdout).toBe('success after retry');
    });


    test('should work with the README example syntax', async () => {
      // This tests the specific syntax shown in the README
      const $reliable = engine.retry({
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 10000
      });

      expect($reliable).toBeInstanceOf(ExecutionEngine);
      expect($reliable).not.toBe(engine);
    });
  });
});