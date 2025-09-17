import { test, jest, expect, describe } from '@jest/globals';

import { Command } from '../../../src/types/command.js';
import { ExecutionResult } from '../../../src/types/result.js';
import { BaseAdapter } from '../../../src/adapters/base-adapter.js';

// Create a concrete implementation for testing
class TestAdapter extends BaseAdapter {
  protected readonly adapterName = 'test';

  constructor(config?: any) {
    super(config);
    this.name = 'test-adapter';
  }

  async execute(command: Command): Promise<ExecutionResult> {
    // Simple implementation that returns the command as stdout
    return this.createResult(
      command.command,
      '',
      0,
      undefined,
      command.command,
      Date.now(),
      Date.now()
    );
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async dispose(): Promise<void> {
    // Simple no-op implementation for testing
  }

  // Expose protected methods for testing
  public testMaskSensitiveData(text: string): string {
    return this.maskSensitiveData(text);
  }

  public async testCreateResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string }
  ): Promise<ExecutionResult> {
    return this.createResult(stdout, stderr, exitCode, signal, command, startTime, endTime, context);
  }

  public testShouldThrowOnNonZeroExit(command: Command | string, exitCode: number): boolean {
    return this.shouldThrowOnNonZeroExit(command, exitCode);
  }

  public testBuildCommandString(command: Command): string {
    return this.buildCommandString(command);
  }

  public testCreateCombinedEnv(baseEnv: Record<string, string>, commandEnv?: Record<string, string>): Record<string, string> {
    return this.createCombinedEnv(baseEnv, commandEnv);
  }

  public testMergeCommand(command: Command): Command {
    return this.mergeCommand(command);
  }

  public async testHandleAbortSignal(signal: AbortSignal | undefined, cleanup: () => void): Promise<void> {
    return this.handleAbortSignal(signal, cleanup);
  }

  public testCreateStreamHandler(options?: { onData?: (chunk: string) => void; maxBuffer?: number; encoding?: BufferEncoding }): any {
    return this.createStreamHandler(options);
  }

  public testEmitAdapterEvent(event: any, data: any): void {
    return this.emitAdapterEvent(event, data);
  }

  public testCreateProgressReporter(command: Command): any {
    return this.createProgressReporter(command);
  }

  public async testHandleTimeout(promise: Promise<any>, timeout: number, command: string, cleanup?: () => void): Promise<any> {
    return this.handleTimeout(promise, timeout, command, cleanup);
  }

  public testCreateResultSync(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command }
  ): ExecutionResult {
    return this.createResultSync(stdout, stderr, exitCode, signal, command, startTime, endTime, context);
  }
}

describe('BaseAdapter', () => {
  describe('Sensitive Data Masking', () => {
    test('should mask API keys', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'api_key=sk-1234567890abcdef', expected: 'api_key=[REDACTED]' },
        { input: 'apikey: "test123456"', expected: 'apikey: [REDACTED]' },
        { input: 'API_KEY="my-secret-key"', expected: 'API_KEY=[REDACTED]' },
        { input: 'access_token=ghp_1234567890abcdef', expected: 'access_token=[REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should mask Bearer tokens', () => {
      const adapter = new TestAdapter();

      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const expected = 'Authorization: Bearer [REDACTED]';

      expect(adapter.testMaskSensitiveData(input)).toBe(expected);
    });

    test('should mask Basic auth', () => {
      const adapter = new TestAdapter();

      const input = 'Authorization: Basic dXNlcjpwYXNzd29yZA==';
      const expected = 'Authorization: Basic [REDACTED]';

      expect(adapter.testMaskSensitiveData(input)).toBe(expected);
    });

    test('should mask AWS credentials', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', expected: 'AWS_ACCESS_KEY_ID=[REDACTED]' },
        { input: 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expected: 'aws_secret_access_key=[REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should mask GitHub tokens', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'github_token=ghp_0123456789abcdefghijklmnopqrstuvwxyzAB', expected: 'github_token=[REDACTED]' },
        { input: 'token: ghs_0123456789abcdefghijklmnopqrstuvwxyzAB', expected: 'token: [REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should mask passwords', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'password=mysecretpassword', expected: 'password=[REDACTED]' },
        { input: 'passwd: "p@ssw0rd!"', expected: 'passwd: [REDACTED]' },
        { input: 'pwd="123456"', expected: 'pwd=[REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should mask SSH private keys', () => {
      const adapter = new TestAdapter();

      const sshKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdef
-----END RSA PRIVATE KEY-----`;

      const expected = '[REDACTED]';

      expect(adapter.testMaskSensitiveData(sshKey)).toBe(expected);
    });

    test('should mask environment variables with secrets', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'SECRET_KEY=my-secret-value', expected: 'SECRET_KEY=[REDACTED]' },
        { input: 'DATABASE_PASSWORD="p@ssw0rd"', expected: 'DATABASE_PASSWORD=[REDACTED]' },
        { input: 'GITHUB_TOKEN=ghp_123456', expected: 'GITHUB_TOKEN=[REDACTED]' },
        { input: 'API_KEY_PROD=sk-prod-12345', expected: 'API_KEY_PROD=[REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should handle multiple secrets in one text', () => {
      const adapter = new TestAdapter();

      const input = `
        Setting up environment:
        API_KEY=sk-1234567890abcdef
        DATABASE_PASSWORD=mysecretpassword
        AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
        Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
      `;

      const result = adapter.testMaskSensitiveData(input);

      expect(result).toContain('API_KEY=[REDACTED]');
      expect(result).toContain('DATABASE_PASSWORD=[REDACTED]');
      expect(result).toContain('AWS_ACCESS_KEY_ID=[REDACTED]');
      expect(result).toContain('Authorization: Bearer [REDACTED]');
      expect(result).not.toContain('sk-1234567890abcdef');
      expect(result).not.toContain('mysecretpassword');
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    test('should not mask when disabled', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          enabled: false
        }
      });

      const input = 'password=mysecretpassword';
      expect(adapter.testMaskSensitiveData(input)).toBe(input);
    });

    test('should use custom replacement', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          enabled: true,
          replacement: '***HIDDEN***'
        }
      });

      const input = 'password=mysecretpassword';
      expect(adapter.testMaskSensitiveData(input)).toBe('password=***HIDDEN***');
    });

    test('should use custom patterns', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          enabled: true,
          patterns: [
            /(custom_secret=)([^\s]+)/gi
          ]
        }
      });

      const input = 'custom_secret=my-custom-value password=should-not-be-masked';
      const result = adapter.testMaskSensitiveData(input);

      expect(result).toBe('custom_secret=[REDACTED] password=should-not-be-masked');
    });

    test('should mask stdout and stderr in execution results', async () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: false });

      const result = await adapter.testCreateResult(
        'Command output with api_key=secret123',
        'Error: password=mypassword failed',
        1,
        undefined,
        'echo $API_KEY',
        Date.now(),
        Date.now()
      );

      expect(result.stdout).toBe('Command output with api_key=[REDACTED]');
      expect(result.stderr).toBe('Error: password=[REDACTED] failed');
      expect(result.command).toBe('echo $API_KEY');
    });

    test('should handle empty and null inputs gracefully', () => {
      const adapter = new TestAdapter();

      expect(adapter.testMaskSensitiveData('')).toBe('');
      expect(adapter.testMaskSensitiveData(null as any)).toBe(null);
      expect(adapter.testMaskSensitiveData(undefined as any)).toBe(undefined);
    });

    test('should mask data in streaming handler', () => {
      const adapter = new TestAdapter();
      let capturedData = '';

      const handler = (adapter as any).createStreamHandler({
        onData: (chunk: string) => {
          capturedData += chunk;
        }
      });

      // Simulate streaming data with sensitive info
      const transform = handler.createTransform();
      transform.write(Buffer.from('Starting process...\n'));
      transform.write(Buffer.from('api_key=secret123\n'));
      transform.write(Buffer.from('Process complete.\n'));

      // Wait for async processing
      setTimeout(() => {
        expect(capturedData).toContain('Starting process...');
        expect(capturedData).toContain('api_key=[REDACTED]');
        expect(capturedData).toContain('Process complete.');
        expect(capturedData).not.toContain('secret123');
      }, 100);
    });
  });

  describe('Configuration', () => {
    test('should have sensible defaults', () => {
      const adapter = new TestAdapter();
      const config = (adapter as any).config;

      expect(config.sensitiveDataMasking.enabled).toBe(true);
      expect(config.sensitiveDataMasking.replacement).toBe('[REDACTED]');
      expect(config.sensitiveDataMasking.patterns).toHaveLength(14); // Number of default patterns
    });

    test('should allow disabling masking', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          enabled: false
        }
      });

      const config = (adapter as any).config;
      expect(config.sensitiveDataMasking.enabled).toBe(false);
    });

    test('should merge custom patterns with defaults when not specified', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          replacement: '***'
        }
      });

      const config = (adapter as any).config;
      expect(config.sensitiveDataMasking.patterns).toHaveLength(14); // Still has default patterns
      expect(config.sensitiveDataMasking.replacement).toBe('***');
    });

    test('should allow updating configuration', () => {
      const adapter = new TestAdapter();

      adapter.updateConfig({
        defaultTimeout: 60000,
        defaultCwd: '/tmp',
        defaultEnv: { TEST: 'value' },
        throwOnNonZeroExit: false
      });

      const config = adapter.getConfig();
      expect(config.defaultTimeout).toBe(60000);
      expect(config.defaultCwd).toBe('/tmp');
      expect(config.defaultEnv).toEqual({ TEST: 'value' });
      expect(config.throwOnNonZeroExit).toBe(false);
    });

    test('should merge sensitive data masking config correctly', () => {
      const adapter = new TestAdapter();

      adapter.updateConfig({
        sensitiveDataMasking: {
          replacement: '***MASKED***'
        }
      });

      const config = adapter.getConfig();
      expect(config.sensitiveDataMasking.replacement).toBe('***MASKED***');
      expect(config.sensitiveDataMasking.enabled).toBe(true); // Should keep original value
      expect(config.sensitiveDataMasking.patterns).toHaveLength(14); // Should keep original patterns
    });
  });

  describe('shouldThrowOnNonZeroExit', () => {
    test('should not throw for exit code 0', () => {
      const adapter = new TestAdapter();
      expect(adapter.testShouldThrowOnNonZeroExit('test', 0)).toBe(false);
    });

    test('should follow global config for string commands', () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: true });
      expect(adapter.testShouldThrowOnNonZeroExit('test', 1)).toBe(true);

      const noThrowAdapter = new TestAdapter({ throwOnNonZeroExit: false });
      expect(noThrowAdapter.testShouldThrowOnNonZeroExit('test', 1)).toBe(false);
    });

    test('should respect command.nothrow when set', () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: true });

      const nothrowCommand: Command = { command: 'test', nothrow: true };
      expect(adapter.testShouldThrowOnNonZeroExit(nothrowCommand, 1)).toBe(false);

      const throwCommand: Command = { command: 'test', nothrow: false };
      expect(adapter.testShouldThrowOnNonZeroExit(throwCommand, 1)).toBe(true);
    });

    test('should use global config when nothrow is undefined', () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: true });
      const command: Command = { command: 'test' };
      expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(true);
    });
  });

  describe('buildCommandString', () => {
    test('should build command without args', () => {
      const adapter = new TestAdapter();
      const command: Command = { command: 'echo' };
      expect(adapter.testBuildCommandString(command)).toBe('echo');
    });

    test('should build command with args', () => {
      const adapter = new TestAdapter();
      const command: Command = { command: 'echo', args: ['hello', 'world'] };
      expect(adapter.testBuildCommandString(command)).toBe('echo hello world');
    });

    test('should handle empty args array', () => {
      const adapter = new TestAdapter();
      const command: Command = { command: 'echo', args: [] };
      expect(adapter.testBuildCommandString(command)).toBe('echo');
    });
  });

  describe('createCombinedEnv', () => {
    test('should combine base and command env', () => {
      const adapter = new TestAdapter();
      const baseEnv = { BASE: 'base', COMMON: 'base' };
      const commandEnv = { COMMAND: 'command', COMMON: 'command' };

      const combined = adapter.testCreateCombinedEnv(baseEnv, commandEnv);
      expect(combined['BASE']).toBe('base');
      expect(combined['COMMAND']).toBe('command');
      expect(combined['COMMON']).toBe('command'); // Command env should override
    });

    test('should include process.env', () => {
      const adapter = new TestAdapter();
      const baseEnv = { TEST: 'value' };

      const combined = adapter.testCreateCombinedEnv(baseEnv);
      expect(combined['TEST']).toBe('value');
      // Should also include process.env variables
      if (process.env['PATH']) {
        expect(combined['PATH']).toBeDefined();
      }
    });

    test('should filter undefined values from process.env', () => {
      const adapter = new TestAdapter();
      const baseEnv = {};

      const combined = adapter.testCreateCombinedEnv(baseEnv);
      // All values should be defined strings
      Object.values(combined).forEach(value => {
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('mergeCommand', () => {
    test('should merge command with adapter defaults', () => {
      const adapter = new TestAdapter({
        defaultCwd: '/base',
        defaultEnv: { BASE: 'base' },
        defaultTimeout: 5000
      });
      const command: Command = {
        command: 'test',
        cwd: '/command',
        env: { COMMAND: 'command' }
      };

      const merged = adapter.testMergeCommand(command);
      expect(merged.command).toBe('test');
      expect(merged.cwd).toBe('/command'); // Command should override
      expect(merged.env).toEqual({ BASE: 'base', COMMAND: 'command' }); // Should merge envs
      expect(merged.timeout).toBe(5000); // Should inherit from adapter default
    });

    test('should use defaults when not specified', () => {
      const adapter = new TestAdapter();
      const command: Command = { command: 'test' };

      const merged = adapter.testMergeCommand(command);
      expect(merged.command).toBe('test');
      expect(merged.cwd).toBe(adapter.getConfig().defaultCwd);
      expect(merged.env).toEqual(adapter.getConfig().defaultEnv);
      expect(merged.timeout).toBe(adapter.getConfig().defaultTimeout);
      expect(merged.shell).toBe(adapter.getConfig().defaultShell);
    });
  });

  describe('handleAbortSignal', () => {
    test('should handle already aborted signal', async () => {
      const adapter = new TestAdapter();
      const controller = new AbortController();
      controller.abort();

      const cleanup = jest.fn();

      await expect(adapter.testHandleAbortSignal(controller.signal, cleanup))
        .rejects.toThrow('Operation aborted');
      expect(cleanup).toHaveBeenCalled();
    });

    test('should handle abort during operation', async () => {
      const adapter = new TestAdapter();
      const controller = new AbortController();
      const cleanup = jest.fn();

      // Start handling
      const promise = adapter.testHandleAbortSignal(controller.signal, cleanup);

      // Abort after a delay
      setTimeout(() => controller.abort(), 10);

      // Should complete without error if not aborted immediately
      await expect(promise).resolves.toBeUndefined();
    });

    test('should handle undefined signal', async () => {
      const adapter = new TestAdapter();
      const cleanup = jest.fn();

      await expect(adapter.testHandleAbortSignal(undefined, cleanup))
        .resolves.toBeUndefined();
      expect(cleanup).not.toHaveBeenCalled();
    });
  });

  describe('Additional maskSensitiveData edge cases', () => {
    test('should handle multiple GitHub token formats', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'token: ghp_1234567890123456', expected: 'token: [REDACTED]' },
        { input: 'ghs_1234567890123456', expected: '[REDACTED]' },
        { input: 'GITHUB_TOKEN=ghp_abcdefghijklmnop', expected: 'GITHUB_TOKEN=[REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should handle command line arguments with secrets', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: '--password mysecret', expected: '--password [REDACTED]' },
        { input: '--client-secret "my secret"', expected: '--client-secret [REDACTED]' },
        { input: "--secret 'secret123'", expected: '--secret [REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should handle generic secret patterns', () => {
      const adapter = new TestAdapter();

      const testCases = [
        { input: 'secret=mysecret', expected: 'secret=[REDACTED]' },
        { input: 'client_secret: "secret123"', expected: 'client_secret: [REDACTED]' }
      ];

      for (const { input, expected } of testCases) {
        expect(adapter.testMaskSensitiveData(input)).toBe(expected);
      }
    });

    test('should handle SSH keys with different types', () => {
      const adapter = new TestAdapter();

      const sshKeys = [
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
        '-----BEGIN DSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END DSA PRIVATE KEY-----',
        '-----BEGIN EC PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END EC PRIVATE KEY-----',
        '-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END OPENSSH PRIVATE KEY-----'
      ];

      for (const key of sshKeys) {
        expect(adapter.testMaskSensitiveData(key)).toBe('[REDACTED]');
      }
    });

    test('should handle edge cases in replacement logic', () => {
      const adapter = new TestAdapter();

      // Test fallback logic for patterns that don't have capture groups
      const input = 'some text with no sensitive data';
      expect(adapter.testMaskSensitiveData(input)).toBe(input);

      // Test with equals sign but no sensitive pattern
      const inputWithEquals = 'key=value';
      expect(adapter.testMaskSensitiveData(inputWithEquals)).toBe(inputWithEquals);

      // Test with colon but no sensitive pattern
      const inputWithColon = 'key: value';
      expect(adapter.testMaskSensitiveData(inputWithColon)).toBe(inputWithColon);
    });
  });

  describe('StreamHandler creation', () => {
    test('should create stream handler with options', () => {
      const adapter = new TestAdapter();
      const onData = jest.fn();

      const handler = adapter.testCreateStreamHandler({
        onData,
        maxBuffer: 1024,
        encoding: 'utf8'
      });

      expect(handler).toBeDefined();
      expect(handler.createTransform).toBeDefined();
    });

    test('should mask data in stream handler callback', (done) => {
      const adapter = new TestAdapter();
      let capturedData = '';

      const handler = adapter.testCreateStreamHandler({
        onData: (chunk: string) => {
          capturedData += chunk;
        }
      });

      const transform = handler.createTransform();

      // Write sensitive data
      transform.write(Buffer.from('password=secret123\n'));

      // Give it time to process
      setTimeout(() => {
        expect(capturedData).toContain('password=[REDACTED]');
        expect(capturedData).not.toContain('secret123');
        done();
      }, 50);
    });
  });

  describe('Event Emission', () => {
    test('should skip event emission when no listeners', () => {
      const adapter = new TestAdapter();

      // Ensure no listeners are attached
      expect(adapter.listenerCount('command:start')).toBe(0);

      // This should return early without emitting
      adapter.testEmitAdapterEvent('command:start', {
        command: 'test'
      });

      // No error should occur
      expect(true).toBe(true);
    });

    test('should emit event when listeners exist', () => {
      const adapter = new TestAdapter();
      const listener = jest.fn();

      adapter.on('command:start', listener);

      adapter.testEmitAdapterEvent('command:start', {
        command: 'test'
      });

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        command: 'test',
        adapter: 'test',
        timestamp: expect.any(Date)
      }));
    });
  });

  describe('Progress Reporter', () => {
    test('should return null when progress is not enabled', () => {
      const adapter = new TestAdapter();
      const command: Command = { command: 'test' };

      const reporter = adapter.testCreateProgressReporter(command);
      expect(reporter).toBeNull();
    });

    test('should create progress reporter when enabled', () => {
      const adapter = new TestAdapter();
      const onProgress = jest.fn();
      const command: Command = {
        command: 'test',
        progress: {
          enabled: true,
          onProgress,
          updateInterval: 1000,
          reportLines: true
        }
      };

      const reporter = adapter.testCreateProgressReporter(command);
      expect(reporter).toBeDefined();
      expect(reporter).not.toBeNull();
    });
  });

  describe('Timeout Handling', () => {
    test('should return promise directly when timeout is 0', async () => {
      const adapter = new TestAdapter();
      const promise = Promise.resolve('test');

      const result = await adapter.testHandleTimeout(promise, 0, 'test');
      expect(result).toBe('test');
    });

    test('should return promise directly when timeout is negative', async () => {
      const adapter = new TestAdapter();
      const promise = Promise.resolve('test');

      const result = await adapter.testHandleTimeout(promise, -1, 'test');
      expect(result).toBe('test');
    });

    test('should timeout when promise takes too long', async () => {
      const adapter = new TestAdapter();
      const cleanup = jest.fn();

      // Create a promise that never resolves
      const promise = new Promise(() => { });

      await expect(
        adapter.testHandleTimeout(promise, 100, 'test command', cleanup)
      ).rejects.toThrow('Command timed out');

      expect(cleanup).toHaveBeenCalled();
    });

    test('should resolve normally when promise completes before timeout', async () => {
      const adapter = new TestAdapter();
      const promise = new Promise(resolve => {
        setTimeout(() => resolve('success'), 50);
      });

      const result = await adapter.testHandleTimeout(promise, 200, 'test');
      expect(result).toBe('success');
    });
  });

  describe('createResultSync', () => {
    test('should create result with masking', () => {
      const adapter = new TestAdapter();
      const startTime = Date.now();
      const endTime = startTime + 1000;

      const result = adapter.testCreateResultSync(
        'Output with password=secret123',
        'Error with api_key=abc123',
        0,
        undefined,
        'echo password=secret123',
        startTime,
        endTime
      );

      expect(result.stdout).toBe('Output with password=[REDACTED]');
      expect(result.stderr).toBe('Error with api_key=[REDACTED]');
      expect(result.command).toBe('echo password=[REDACTED]');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBe(1000);
    });

    test('should throw on non-zero exit when configured', () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: true });
      const startTime = Date.now();
      const endTime = startTime + 1000;

      expect(() => {
        adapter.testCreateResultSync(
          'stdout',
          'stderr',
          1,
          undefined,
          'failing command',
          startTime,
          endTime
        );
      }).toThrow();
    });

    test('should not throw with nothrow command', () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: true });
      const startTime = Date.now();
      const endTime = startTime + 1000;

      const result = adapter.testCreateResultSync(
        'stdout',
        'stderr',
        1,
        undefined,
        'failing command',
        startTime,
        endTime,
        { originalCommand: { command: 'test', nothrow: true } }
      );

      expect(result.exitCode).toBe(1);
    });

    test('should handle signal in result', () => {
      const adapter = new TestAdapter({ throwOnNonZeroExit: false });
      const startTime = Date.now();
      const endTime = startTime + 1000;

      const result = adapter.testCreateResultSync(
        'stdout',
        'stderr',
        130,
        'SIGINT',
        'command',
        startTime,
        endTime
      );

      expect(result.signal).toBe('SIGINT');
      expect(result.exitCode).toBe(130);
    });

    test('should include context in result', () => {
      const adapter = new TestAdapter();
      const startTime = Date.now();
      const endTime = startTime + 1000;

      const result = adapter.testCreateResultSync(
        'stdout',
        'stderr',
        0,
        undefined,
        'command',
        startTime,
        endTime,
        { host: 'remote-host', container: 'my-container' }
      );

      expect(result.host).toBe('remote-host');
      expect(result.container).toBe('my-container');
    });
  });

  describe('maskSensitiveData edge cases', () => {
    test('should handle JSON pattern with sensitive keys', () => {
      const adapter = new TestAdapter();
      const input = '"api_key": "sk-1234567890"';
      const expected = '"api_key": [REDACTED]';
      expect(adapter.testMaskSensitiveData(input)).toBe(expected);
    });

    test('should handle patterns with no capture groups', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/test-pattern-no-groups/gi]
        }
      });

      const input = 'This contains test-pattern-no-groups here';
      const result = adapter.testMaskSensitiveData(input);
      expect(result).toBe('This contains [REDACTED] here');
    });

    test('should handle patterns with undefined capture groups', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/(undefined-group)?test/gi]
        }
      });

      const input = 'This contains test here';
      const result = adapter.testMaskSensitiveData(input);
      expect(result).toBe('This contains [REDACTED] here');
    });

    test('should handle patterns with 5 groups for command line args', () => {
      const adapter = new TestAdapter();
      const input = '--client_secret "my-secret-value"';
      const expected = '--client_secret [REDACTED]';
      expect(adapter.testMaskSensitiveData(input)).toBe(expected);
    });

    test('should handle fallback masking for equals sign', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/fallback-test/gi]
        }
      });

      const input = 'key=fallback-test';
      const result = adapter.testMaskSensitiveData(input);
      expect(result).toBe('key=[REDACTED]');
    });

    test('should handle fallback masking for colon', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/fallback-test/gi]
        }
      });

      const input = 'key: fallback-test';
      const result = adapter.testMaskSensitiveData(input);
      expect(result).toBe('key: [REDACTED]');
    });

    test('should handle pattern with flags not including g', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/password=\w+/i] // No 'g' flag
        }
      });

      const input = 'password=secret1 password=secret2';
      const result = adapter.testMaskSensitiveData(input);
      // Should mask all occurrences even without g flag
      expect(result).toBe('[REDACTED] [REDACTED]');
    });

    test('should handle single group patterns', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/(single-group-test)/gi]
        }
      });

      const input = 'This has single-group-test in it';
      const result = adapter.testMaskSensitiveData(input);
      expect(result).toBe('This has [REDACTED] in it');
    });

    test('should handle two group patterns', () => {
      const adapter = new TestAdapter({
        sensitiveDataMasking: {
          patterns: [/(prefix-)(\w+)/gi]
        }
      });

      const input = 'This has prefix-secret in it';
      const result = adapter.testMaskSensitiveData(input);
      expect(result).toBe('This has prefix-[REDACTED] in it');
    });
  });

  describe('createStreamHandler edge cases', () => {
    test('should create handler without onData callback', () => {
      const adapter = new TestAdapter();

      const handler = adapter.testCreateStreamHandler();
      expect(handler).toBeDefined();
      expect(handler.createTransform).toBeDefined();
    });

    test('should handle maxBuffer option', () => {
      const adapter = new TestAdapter();

      const handler = adapter.testCreateStreamHandler({
        maxBuffer: 1024
      });

      expect(handler).toBeDefined();
    });
  });

  describe('mergeCommand edge cases', () => {
    test('should handle stdout and stderr options', () => {
      const adapter = new TestAdapter();
      const command: Command = {
        command: 'test',
        stdout: 'inherit',
        stderr: 'ignore'
      };

      const merged = adapter.testMergeCommand(command);
      expect(merged.stdout).toBe('inherit');
      expect(merged.stderr).toBe('ignore');
    });

    test('should use default stdout/stderr when not specified', () => {
      const adapter = new TestAdapter();
      const command: Command = { command: 'test' };

      const merged = adapter.testMergeCommand(command);
      expect(merged.stdout).toBe('pipe');
      expect(merged.stderr).toBe('pipe');
    });
  });
});