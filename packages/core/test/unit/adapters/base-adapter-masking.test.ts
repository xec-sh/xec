import { it, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionResultImpl } from '../../../src/core/result.js';
import { BaseAdapter } from '../../../src/adapters/base-adapter.js';

import type { Command } from '../../../src/types/command.js';
import type { ExecutionResult } from '../../../src/types/result.js';

// Test implementation of BaseAdapter to test masking functionality
class TestAdapter extends BaseAdapter {
  protected readonly adapterName = 'test';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(command: Command): Promise<ExecutionResult> {
    // Use ExecutionResultImpl to create a proper ExecutionResult
    const startedAt = new Date();
    const finishedAt = new Date(startedAt.getTime() + 10);

    return new ExecutionResultImpl(
      'test output',
      '',
      0,
      undefined,
      command.command || '',
      10,
      startedAt,
      finishedAt,
      this.adapterName
    );
  }

  async dispose(): Promise<void> {
    // No-op for testing
  }

  // Expose protected method for testing
  public testMaskSensitiveData(text: string): string {
    return this.maskSensitiveData(text);
  }

  // Test output with masking by creating a result
  public testMaskedOutput(
    stdout: string,
    stderr: string
  ): { stdout: string; stderr: string } {
    return {
      stdout: this.maskSensitiveData(stdout),
      stderr: this.maskSensitiveData(stderr)
    };
  }
}

describe('BaseAdapter Data Masking', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter({
      sensitiveDataMasking: {
        enabled: true,
        replacement: '***REDACTED***'
      }
    });
  });

  describe('API Key masking', () => {
    it('should mask API keys in various formats', () => {
      const testCases = [
        {
          input: 'API_KEY=sk_test_4eC39HqLyjWDarjtT1zdp7dc',
          expected: 'API_KEY=***REDACTED***'
        },
        {
          input: 'OPENAI_API_KEY=sk-proj-abcdef123456',
          expected: 'OPENAI_API_KEY=***REDACTED***'
        },
        {
          input: 'export API_KEY="my-secret-key-123"',
          expected: 'export API_KEY=***REDACTED***'
        },
        {
          input: 'apiKey: "abc123def456"',
          expected: 'apiKey: ***REDACTED***'
        },
        {
          input: '--api-key=secret123',
          expected: '--api-key=***REDACTED***'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const masked = adapter.testMaskSensitiveData(input);
        expect(masked).toBe(expected);
      });
    });

    it('should mask multiple API keys in same text', () => {
      const input = 'API_KEY=key1 OTHER_API_KEY=key2 THIRD_KEY=key3';
      const masked = adapter.testMaskSensitiveData(input);

      expect(masked).toBe('API_KEY=***REDACTED*** OTHER_API_KEY=***REDACTED*** THIRD_KEY=***REDACTED***');
      expect(masked.match(/\*\*\*REDACTED\*\*\*/g)).toHaveLength(3);
    });
  });

  describe('Bearer token masking', () => {
    it('should mask Bearer tokens', () => {
      const testCases = [
        {
          input: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          expected: 'Authorization: Bearer ***REDACTED***'
        },
        {
          input: 'Bearer abcdef123456789',
          expected: 'Bearer ***REDACTED***'
        },
        {
          input: 'BEARER TOKEN1234567890',
          expected: 'BEARER ***REDACTED***'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const masked = adapter.testMaskSensitiveData(input);
        expect(masked).toBe(expected);
      });
    });
  });

  describe('Password masking', () => {
    it('should mask passwords in various formats', () => {
      const testCases = [
        {
          input: 'password: mysecretpassword',
          expected: 'password: ***REDACTED***'
        },
        {
          input: 'Password=SuperSecret123!',
          expected: 'Password=***REDACTED***'
        },
        {
          input: '--password "my password with spaces"',
          expected: '--password ***REDACTED***'
        },
        {
          input: 'DB_PASSWORD: ${SECRET_PASS}',
          expected: 'DB_PASSWORD: ***REDACTED***'
        },
        {
          input: 'pwd=admin123',
          expected: 'pwd=***REDACTED***'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const masked = adapter.testMaskSensitiveData(input);
        expect(masked).toBe(expected);
      });
    });
  });

  describe('Token masking', () => {
    it('should mask various token formats', () => {
      const testCases = [
        {
          input: 'token=ghp_1234567890abcdef',
          expected: 'token=***REDACTED***'
        },
        {
          input: 'ACCESS_TOKEN: "abc-123-def-456"',
          expected: 'ACCESS_TOKEN: ***REDACTED***'
        },
        {
          input: 'auth-token=xoxb-123456789',
          expected: 'auth-token=***REDACTED***'
        },
        {
          input: 'github_token: ghs_16C7e42F292c69',
          expected: 'github_token: ***REDACTED***'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const masked = adapter.testMaskSensitiveData(input);
        expect(masked).toBe(expected);
      });
    });
  });

  describe('Secret masking', () => {
    it('should mask secrets in various formats', () => {
      const testCases = [
        {
          input: 'secret: my-super-secret',
          expected: 'secret: ***REDACTED***'
        },
        {
          input: 'CLIENT_SECRET=1234567890abcdef',
          expected: 'CLIENT_SECRET=***REDACTED***'
        },
        {
          input: '--client-secret "confidential"',
          expected: '--client-secret ***REDACTED***'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const masked = adapter.testMaskSensitiveData(input);
        expect(masked).toBe(expected);
      });
    });
  });

  describe('Complex masking scenarios', () => {
    it('should mask multiple sensitive values in JSON', () => {
      const input = JSON.stringify({
        api_key: 'sk_test_123',
        password: 'secret123',
        token: 'bearer_abc',
        data: 'non-sensitive'
      }, null, 2);

      const masked = adapter.testMaskSensitiveData(input);

      expect(masked).toContain('"api_key": ***REDACTED***');
      expect(masked).toContain('"password": ***REDACTED***');
      expect(masked).toContain('"token": ***REDACTED***');
      expect(masked).toContain('"data": "non-sensitive"');
    });

    it('should mask values in environment variable exports', () => {
      const input = `
export API_KEY=sk_test_123
export DATABASE_PASSWORD=postgres123
export JWT_SECRET=my-jwt-secret
export NODE_ENV=production
      `.trim();

      const masked = adapter.testMaskSensitiveData(input);

      expect(masked).toContain('API_KEY=***REDACTED***');
      expect(masked).toContain('DATABASE_PASSWORD=***REDACTED***');
      expect(masked).toContain('JWT_SECRET=***REDACTED***');
      expect(masked).toContain('NODE_ENV=production');
    });

    it('should mask values in command line arguments', () => {
      const input = 'mysql -u root --password=admin123 -h localhost';
      const masked = adapter.testMaskSensitiveData(input);

      expect(masked).toBe('mysql -u root --password=***REDACTED*** -h localhost');
    });

    it('should handle multiline logs with sensitive data', () => {
      const input = `
[INFO] Starting application...
[DEBUG] Loading config with API_KEY=sk_test_123
[DEBUG] Connecting to database with password: dbpass123
[INFO] Server started on port 3000
[ERROR] Authentication failed for token=invalid_token_456
      `.trim();

      const masked = adapter.testMaskSensitiveData(input);

      expect(masked).toContain('API_KEY=***REDACTED***');
      expect(masked).toContain('password: ***REDACTED***');
      expect(masked).toContain('token=***REDACTED***');
      expect(masked).toContain('[INFO] Starting application...');
      expect(masked).toContain('[INFO] Server started on port 3000');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings', () => {
      expect(adapter.testMaskSensitiveData('')).toBe('');
    });

    it('should handle strings without sensitive data', () => {
      const input = 'This is a normal log message without any secrets';
      expect(adapter.testMaskSensitiveData(input)).toBe(input);
    });

    it('should not mask partial matches', () => {
      const input = 'mypassword_field is not a password: value';
      const masked = adapter.testMaskSensitiveData(input);

      // Should only mask after "password:"
      expect(masked).toContain('mypassword_field');
      expect(masked).toContain('password: ***REDACTED***');
    });

    it('should handle case variations', () => {
      const testCases = [
        'PASSWORD: secret',
        'Password: secret',
        'password: secret',
        'PaSsWoRd: secret'
      ];

      testCases.forEach(input => {
        const masked = adapter.testMaskSensitiveData(input);
        expect(masked).toMatch(/\*\*\*REDACTED\*\*\*/);
      });
    });

    it('should mask values with special characters', () => {
      const input = 'api_key="sk$test%123&special*chars"';
      const masked = adapter.testMaskSensitiveData(input);

      expect(masked).toBe('api_key=***REDACTED***');
    });
  });

  describe('Output handling with masking', () => {
    it('should mask sensitive data in stdout', () => {
      const stdout = 'Connected with API_KEY=secret123';
      const stderr = '';

      const { stdout: maskedOut } = adapter.testMaskedOutput(stdout, stderr);

      expect(maskedOut).toBe('Connected with API_KEY=***REDACTED***');
    });

    it('should mask sensitive data in stderr', () => {
      const stdout = '';
      const stderr = 'Error: Invalid password: admin123';

      const { stderr: maskedErr } = adapter.testMaskedOutput(stdout, stderr);

      expect(maskedErr).toBe('Error: Invalid password: ***REDACTED***');
    });

    it('should mask data passed directly', () => {
      const data = 'Streaming API_KEY=secret123 data';

      const masked = adapter.testMaskSensitiveData(data);

      expect(masked).toBe('Streaming API_KEY=***REDACTED*** data');
    });
  });

  describe('Performance', () => {
    it('should handle large texts efficiently', () => {
      // Generate large text with multiple sensitive values
      const lines = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`Line ${i}: API_KEY=key${i} password: pass${i}`);
      }
      const largeText = lines.join('\n');

      const start = Date.now();
      const masked = adapter.testMaskSensitiveData(largeText);
      const duration = Date.now() - start;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(100); // 100ms for 1000 lines

      // Should mask all occurrences
      expect(masked).not.toContain('API_KEY=key');
      expect(masked).not.toContain('password: pass');
      expect(masked.match(/\*\*\*REDACTED\*\*\*/g)).toHaveLength(2000);
    });

    it('should cache regex patterns', () => {
      // Run multiple times to test caching
      const input = 'API_KEY=test123';

      for (let i = 0; i < 100; i++) {
        adapter.testMaskSensitiveData(input);
      }

      // No direct way to test caching, but this ensures
      // multiple calls work correctly
      expect(adapter.testMaskSensitiveData(input)).toBe('API_KEY=***REDACTED***');
    });
  });
});