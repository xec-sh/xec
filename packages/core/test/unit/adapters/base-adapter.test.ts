import { test, expect, describe } from '@jest/globals';

import { Command } from '../../../src/core/command';
import { ExecutionResult } from '../../../src/core/result';
import { BaseAdapter } from '../../../src/adapters/base-adapter';

// Create a concrete implementation for testing
class TestAdapter extends BaseAdapter {
  protected readonly adapterName = 'test';
  
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
      const expected = 'Authorization: [REDACTED]';
      
      expect(adapter.testMaskSensitiveData(input)).toBe(expected);
    });

    test('should mask Basic auth', () => {
      const adapter = new TestAdapter();
      
      const input = 'Authorization: Basic dXNlcjpwYXNzd29yZA==';
      const expected = 'Authorization: [REDACTED]';
      
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
      expect(result).toContain('Authorization: [REDACTED]');
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
      expect(config.sensitiveDataMasking.patterns).toHaveLength(8); // Number of default patterns
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
      expect(config.sensitiveDataMasking.patterns).toHaveLength(8); // Still has default patterns
      expect(config.sensitiveDataMasking.replacement).toBe('***');
    });
  });
});