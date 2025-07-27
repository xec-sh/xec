import { test, jest, expect, describe, beforeEach } from '@jest/globals';

import { $ } from '../../src/index';
import { ExecutionEngine } from '../../src/core/execution-engine';

describe('Retry Mechanism with Exit Codes', () => {
  let engine: ExecutionEngine;
  
  beforeEach(() => {
    engine = new ExecutionEngine({
      throwOnNonZeroExit: false // Test explicitly with false setting
    });
  });

  describe('Exit code retry behavior', () => {
    test('should retry on exit code 6 (DNS resolution failure)', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          // Always fail with exit code 6
          return {
            stdout: '',
            stderr: `curl: (6) Could not resolve host: ${cmd.command.split(' ')[1]}`,
            exitCode: 6,
            signal: undefined,
            command: cmd.command,
            duration: 10,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'local'
          };
        },
        async isAvailable() { return true; }
      };

      // Create retry-enabled engine
      const $reliable = engine.retry({
        maxRetries: 2,
        initialDelay: 10,
        jitter: false
      });

      // Register mock adapter
      ($reliable as any).registerAdapter('local', mockAdapter);

      try {
        await $reliable.execute({
          command: 'curl https://non-existent-domain.com',
          adapter: 'local'
        });
        fail('Should have thrown RetryError');
      } catch (error: any) {
        expect(error.name).toBe('RetryError');
        expect(error.attempts).toBe(3); // 1 initial + 2 retries
        expect(error.lastResult.exitCode).toBe(6);
        expect(attempts).toBe(3);
      }
    });

    test('should retry on exit code 7 (connection failed)', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          return {
            stdout: '',
            stderr: 'curl: (7) Failed to connect to host',
            exitCode: 7,
            signal: undefined,
            command: cmd.command,
            duration: 10,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'local'
          };
        },
        async isAvailable() { return true; }
      };

      const $reliable = engine.retry({
        maxRetries: 1,
        initialDelay: 10,
        jitter: false
      });

      ($reliable as any).registerAdapter('local', mockAdapter);

      try {
        await $reliable.execute({
          command: 'curl https://unreachable-host.com',
          adapter: 'local'
        });
        fail('Should have thrown RetryError');
      } catch (error: any) {
        expect(error.name).toBe('RetryError');
        expect(error.attempts).toBe(2); // 1 initial + 1 retry
        expect(attempts).toBe(2);
      }
    });

    test('should not retry on exit code 22 (HTTP error) with custom isRetryable', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          return {
            stdout: '',
            stderr: 'curl: (22) The requested URL returned error: 404',
            exitCode: 22,
            signal: undefined,
            command: cmd.command,
            duration: 10,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'local'
          };
        },
        async isAvailable() { return true; }
      };

      const $reliable = engine.retry({
        maxRetries: 2,
        initialDelay: 10,
        jitter: false,
        // Custom isRetryable that excludes HTTP client errors
        isRetryable: (result) => 
          // Don't retry on HTTP client errors (exit code 22)
           result.exitCode !== 0 && result.exitCode !== 22
        
      });

      ($reliable as any).registerAdapter('local', mockAdapter);

      const result = await $reliable.execute({
        command: 'curl https://httpbin.org/status/404',
        adapter: 'local',
        nothrow: true
      });
      
      expect(attempts).toBe(1); // Only 1 attempt, no retries
      expect(result.exitCode).toBe(22);
    });

    test('should retry even when nothrow is used', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          return {
            stdout: '',
            stderr: 'curl: (6) Could not resolve host: test.com',
            exitCode: 6,
            signal: undefined,
            command: cmd.command,
            duration: 10,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'local'
          };
        },
        async isAvailable() { return true; }
      };

      const $reliable = engine.retry({
        maxRetries: 2,
        initialDelay: 10,
        jitter: false
      });

      ($reliable as any).registerAdapter('local', mockAdapter);

      // With nothrow, should still retry but not throw on final failure
      const result = await $reliable.execute({
        command: 'curl https://test.com',
        adapter: 'local',
        nothrow: true
      });

      expect(attempts).toBe(3); // 1 initial + 2 retries
      expect(result.exitCode).toBe(6);
      expect(result.stderr).toContain('Could not resolve host');
    });
  });

  describe('Global $ retry method', () => {
    test('should work with global $ object', async () => {
      // Test that $.retry creates a retry-enabled engine
      const $reliable = $.retry({
        maxRetries: 1,
        initialDelay: 50,
        jitter: false
      });

      expect($reliable).toBeDefined();
      expect(typeof $reliable).toBe('function');
    });
  });

  describe('Command-level retry integration', () => {
    test('should work with command-level retry options', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          return {
            stdout: '',
            stderr: 'curl: (6) Could not resolve host: test.com',
            exitCode: 6,
            signal: undefined,
            command: cmd.command,
            duration: 10,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'local'
          };
        },
        async isAvailable() { return true; }
      };

      (engine as any).registerAdapter('local', mockAdapter);

      try {
        await engine.execute({
          command: 'curl https://test.com',
          adapter: 'local',
          retry: {
            maxRetries: 1,
            initialDelay: 10,
            jitter: false
          }
        });
        fail('Should have thrown RetryError');
      } catch (error: any) {
        expect(error.name).toBe('RetryError');
        expect(error.attempts).toBe(2);
        expect(attempts).toBe(2);
      }
    });
  });

  describe('Retry options inheritance', () => {
    test('should use command-level retry options', async () => {
      const onRetryCallback = jest.fn();

      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          return {
            stdout: '',
            stderr: 'curl: (6) Could not resolve host: test.com',
            exitCode: 6,
            signal: undefined,
            command: cmd.command,
            duration: 10,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'local'
          };
        },
        async isAvailable() { return true; }
      };

      (engine as any).registerAdapter('local', mockAdapter);

      try {
        await engine.execute({
          command: 'curl https://test.com',
          adapter: 'local',
          retry: {
            maxRetries: 2,
            initialDelay: 10,
            jitter: false,
            onRetry: onRetryCallback
          }
        });
        fail('Should have thrown RetryError');
      } catch (error: any) {
        expect(error.attempts).toBe(3); // 1 initial + 2 retries
        expect(onRetryCallback).toHaveBeenCalledTimes(2);
        expect(attempts).toBe(3); // Verify adapter was called 3 times
      }
    });
  });
});