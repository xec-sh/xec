import { test, expect, describe } from '@jest/globals';

import { $, ExecutionEngine } from '../../src/index';
import { ExecutionResultImpl } from '../../src/core/result';
import { MockAdapter } from '../../src/adapters/mock-adapter';

// Helper function to create ExecutionResult
function createResult(options: {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration?: number;
  adapter?: string;
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
    options.adapter || 'local'
  );
}

describe('Retry with Different Adapters', () => {
  describe('MockAdapter with retry', () => {
    test('should retry with MockAdapter', async () => {
      let attempts = 0;
      
      // Create custom mock adapter that tracks attempts
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          if (attempts < 3) {
            return createResult({
              command: cmd.command,
              exitCode: 1,
              stdout: '',
              stderr: 'Service temporarily unavailable',
              adapter: 'mock'
            });
          }
          return createResult({
            command: cmd.command,
            exitCode: 0,
            stdout: 'Service is up!',
            stderr: '',
            adapter: 'mock'
          });
        },
        async isAvailable() { return true; }
      };

      const engine = new ExecutionEngine();
      engine.registerAdapter('mock', mockAdapter as any);

      const result = await engine.execute({
        command: 'flaky-service',
        adapter: 'mock',
        retry: {
          maxRetries: 3,
          initialDelay: 10,
          isRetryable: (result) => result.stderr.includes('temporarily unavailable')
        }
      });

      expect(attempts).toBe(3);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Service is up!');
    });

    test('should respect MockAdapter error configuration', async () => {
      const mockAdapter = new MockAdapter();
      
      // Configure to always fail with specific error
      mockAdapter.mockFailure(/.*/, 'Mock network error', 1);

      const engine = new ExecutionEngine();
      engine.registerAdapter('mock', mockAdapter as any);

      const result = await engine.execute({
        command: 'test-command',
        adapter: 'mock',
        retry: {
          maxRetries: 2,
          initialDelay: 10
        },
        nothrow: true
      });

      // MockAdapter should have thrown, but nothrow catches it
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Adapter-specific retry patterns', () => {
    test('SSH adapter retry pattern', async () => {
      // Create a mock SSH adapter for testing
      const sshAdapter = {
        async execute(cmd: any) {
          // Simulate SSH-specific errors
          const sshErrors = [
            { stderr: 'ssh: connect to host server.com port 22: Connection refused', exitCode: 255 },
            { stderr: 'ssh: connect to host server.com port 22: Connection timed out', exitCode: 255 },
            { stderr: '', stdout: 'Connected successfully', exitCode: 0 }
          ];
          
          const attemptIndex = Math.min(this.attempts || 0, sshErrors.length - 1);
          this.attempts = (this.attempts || 0) + 1;
          
          const error = sshErrors[attemptIndex]!;
          return createResult({
            command: cmd.command,
            exitCode: error.exitCode,
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            adapter: 'ssh'
          });
        },
        async isAvailable() { return true; },
        attempts: 0
      };

      const engine = new ExecutionEngine();
      engine.registerAdapter('ssh', sshAdapter as any);

      const result = await engine.execute({
        command: 'echo "Hello from SSH"',
        adapter: 'ssh',
        retry: {
          maxRetries: 5,
          initialDelay: 1000,
          isRetryable: (result) => {
            // SSH-specific retry logic
            const sshRetryableErrors = [
              'connection refused',
              'connection timed out',
              'connection reset by peer',
              'no route to host',
              'host key verification failed' // Might want to retry with different key
            ];
            
            const stderr = result.stderr.toLowerCase();
            return result.exitCode === 255 && 
                   sshRetryableErrors.some(error => stderr.includes(error));
          }
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Connected successfully');
      expect(sshAdapter.attempts).toBe(3);
    });

    test('Docker adapter retry pattern', async () => {
      // Create a mock Docker adapter for testing
      const dockerAdapter = {
        async execute(cmd: any) {
          // Simulate Docker-specific errors
          const dockerErrors = [
            { stderr: 'docker: Error response from daemon: conflict: container name already in use', exitCode: 125 },
            { stderr: 'docker: Cannot connect to the Docker daemon. Is the docker daemon running?', exitCode: 1 },
            { stderr: '', stdout: 'Container started successfully', exitCode: 0 }
          ];
          
          const attemptIndex = Math.min(this.attempts || 0, dockerErrors.length - 1);
          this.attempts = (this.attempts || 0) + 1;
          
          const error = dockerErrors[attemptIndex]!;
          return createResult({
            command: cmd.command,
            exitCode: error.exitCode,
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            adapter: 'docker'
          });
        },
        async isAvailable() { return true; },
        attempts: 0
      };

      const engine = new ExecutionEngine();
      engine.registerAdapter('docker', dockerAdapter as any);

      const result = await engine.execute({
        command: 'docker run myapp',
        adapter: 'docker',
        retry: {
          maxRetries: 3,
          initialDelay: 2000,
          isRetryable: (result) => {
            // Docker-specific retry logic
            const stderr = result.stderr.toLowerCase();
            
            // Don't retry on image not found
            if (stderr.includes('image not found') || stderr.includes('no such image')) {
              return false;
            }
            
            // Retry on daemon connection issues
            if (stderr.includes('cannot connect to the docker daemon')) {
              return true;
            }
            
            // Retry on container name conflicts (maybe cleanup and retry)
            if (stderr.includes('container name already in use')) {
              return true;
            }
            
            // Retry on exit code 125 (docker daemon error)
            return result.exitCode === 125;
          }
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Container started successfully');
      expect(dockerAdapter.attempts).toBe(3);
    });
  });

  describe('Retry with adapter switching', () => {
    test('should retry with fallback adapter', async () => {
      let primaryAttempts = 0;
      let fallbackUsed = false;

      const primaryAdapter = {
        async execute(cmd: any) {
          primaryAttempts++;
          return createResult({
            command: cmd.command,
            exitCode: 1,
            stdout: '',
            stderr: 'Primary adapter failed',
            adapter: 'primary'
          });
        },
        async isAvailable() { return true; }
      };

      const fallbackAdapter = {
        async execute(cmd: any) {
          fallbackUsed = true;
          return createResult({
            command: cmd.command,
            exitCode: 0,
            stdout: 'Fallback succeeded',
            stderr: '',
            adapter: 'fallback'
          });
        },
        async isAvailable() { return true; }
      };

      const engine = new ExecutionEngine();
      engine.registerAdapter('local', primaryAdapter as any);
      engine.registerAdapter('mock', fallbackAdapter as any);

      // First try with primary adapter
      const result1 = await engine.execute({
        command: 'test-command',
        adapter: 'local',
        retry: {
          maxRetries: 2,
          initialDelay: 10
        },
        nothrow: true
      });

      expect(primaryAttempts).toBe(3); // 1 initial + 2 retries
      expect(result1.exitCode).toBe(1);

      // Now try with fallback
      const result2 = await engine.execute({
        command: 'test-command',
        adapter: 'mock'
      });

      expect(fallbackUsed).toBe(true);
      expect(result2.exitCode).toBe(0);
      expect(result2.stdout).toBe('Fallback succeeded');
    });
  });

  describe('Retry with template literals', () => {
    test('should work with template literal syntax', async () => {
      let attempts = 0;
      const mockAdapter = {
        async execute(cmd: any) {
          attempts++;
          if (attempts === 1) {
            return createResult({
              command: cmd.command,
              exitCode: 1,
              stdout: '',
              stderr: 'Temporary failure'
            });
          }
          return createResult({
            command: cmd.command,
            exitCode: 0,
            stdout: 'Hello, World!',
            stderr: ''
          });
        },
        async isAvailable() { return true; }
      };

      const $reliable = $.retry({
        maxRetries: 2,
        initialDelay: 10
      });

      ($reliable as any).registerAdapter('local', mockAdapter);

      const name = 'World';
      const result = await $reliable`echo "Hello, ${name}!"`;

      expect(attempts).toBe(2);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello, World!');
    });
  });

  describe('Performance and timing', () => {
    test('should respect delay timing', async () => {
      const attempts: number[] = [];
      let attemptCount = 0;

      const mockAdapter = {
        async execute(cmd: any) {
          attempts.push(Date.now());
          attemptCount++;

          // Always fail to test all retries
          return createResult({
            command: cmd.command,
            exitCode: 1,
            stdout: '',
            stderr: 'Error'
          });
        },
        async isAvailable() { return true; }
      };

      const engine = new ExecutionEngine();
      engine.registerAdapter('local', mockAdapter as any);

      await engine.execute({
        command: 'test',
        adapter: 'local',
        retry: {
          maxRetries: 2,
          initialDelay: 50,
          backoffMultiplier: 2,
          jitter: false // Disable jitter for predictable timing
        },
        nothrow: true
      });

      // Should have 3 attempts (initial + 2 retries)
      expect(attemptCount).toBe(3);
      expect(attempts).toHaveLength(3);

      // Calculate delays between attempts
      if (attempts.length >= 3) {
        const delay1 = attempts[1]! - attempts[0]!;
        const delay2 = attempts[2]! - attempts[1]!;

        // Allow some tolerance for timing
        expect(delay1).toBeGreaterThanOrEqual(45); // ~50ms
        expect(delay1).toBeLessThan(100);
        expect(delay2).toBeGreaterThanOrEqual(90); // ~100ms (50 * 2)
        expect(delay2).toBeLessThan(150);
      }
    });
  });
});