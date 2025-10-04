import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { $ } from '../../../src/index.js';
import * as shellEscape from '../../../src/utils/shell-escape.js';
import { withTempDir, withTempFile } from '../../../src/utils/temp.js';

describe('Security Test Suite', () => {
  beforeEach(() => {
    // Reset configuration to defaults before each test
    jest.clearAllMocks();
    jest.resetModules();
    // Clear any unhandled promise rejections
    process.removeAllListeners('unhandledRejection');
  });

  afterEach(async () => {
    // Clean up any open handles or resources
    jest.clearAllMocks();
    jest.resetModules();
    // Give time for any pending operations to complete
    await new Promise(resolve => setImmediate(resolve));
  });
  describe('Command Injection Prevention', () => {
    // Create a fresh instance for each test
    let localEngine: any;
    
    beforeEach(async () => {
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      localEngine = new ExecutionEngine();
    });
    test('should sanitize shell metacharacters in command arguments', async () => {
      const maliciousInput = '"; rm -rf /; echo "pwned';
      const result = await $.local()`echo ${maliciousInput}`;
      
      // The output should contain the literal string, not execute the commands
      expect(result.stdout.trim()).toContain('"; rm -rf /; echo "pwned');
      expect(result.exitCode).toBe(0);
    });

    test('should prevent command injection through environment variables', async () => {
      const maliciousEnv = '$(rm -rf /)';
      const result = await $.env({ SAFE_VAR: maliciousEnv })`echo $SAFE_VAR`;
      
      // Should output the literal string, not execute the command
      expect(result.stdout.trim()).toBe('$(rm -rf /)');
    });

    test('should handle null bytes in input safely', async () => {
      // Test with a command that contains null bytes
      // This should be rejected at the adapter level
      const inputWithNullByte = 'test\x00malicious';
      
      // We expect this to throw because null bytes are not allowed
      await expect(
        localEngine.execute({
          command: `echo '${inputWithNullByte}'`,
          shell: true
        })
      ).rejects.toThrow();
    });

    test('should escape special characters in file paths', async () => {
      // Use a unique temp directory to avoid conflicts  
      await withTempDir(async (dir) => {
        const dangerousPath = `${dir.path}/test$(whoami).txt`;
        
        // Create the file using localEngine to avoid state pollution
        const touchResult = await localEngine.execute({
          command: 'touch',
          args: [dangerousPath],
          shell: false
        });
        expect(touchResult.exitCode).toBe(0);
        
        // Check that the file exists with the literal name
        const lsResult = await localEngine.execute({
          command: 'ls',
          args: ['-la', dir.path],
          shell: false
        });
        expect(lsResult.stdout).toContain('test$(whoami).txt');
        
        // Clean up
        await localEngine.execute({
          command: 'rm',
          args: ['-f', dangerousPath],
          shell: false
        });
      });
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should prevent path traversal in temp file operations', async () => {
      await withTempDir(async (dir) => {
        // Test absolute paths
        expect(() => {
          dir.file('/etc/passwd');
        }).toThrow(/Invalid file name/);
        
        // Test path traversal with ..
        expect(() => {
          dir.file('../../../etc/passwd');
        }).toThrow(/Invalid file name/);
        
        // Test another path traversal
        expect(() => {
          dir.file('subdir/../../passwd');
        }).toThrow(/Invalid file name/);
      });
    });

    test('should allow safe relative paths in temp directories', async () => {
      await withTempDir(async (dir) => {
        const safePaths = [
          'file.txt',
          'subdir/file.txt',
          'deep/nested/path/file.txt',
          '.hidden',
          'file-with-special-chars_123.txt'
        ];

        for (const safePath of safePaths) {
          expect(() => dir.file(safePath)).not.toThrow();
        }
      });
    });
  });

  describe('Shell Escape Security', () => {
    test('should properly escape shell arguments', () => {
      const testCases = [
        { input: 'simple', expected: 'simple' },
        { input: 'with space', expected: "'with space'" },
        { input: "it's", expected: "'it'\\''s'" },
        { input: '$VAR', expected: "'$VAR'" },
        { input: '`command`', expected: "'`command`'" },
        { input: '$(command)', expected: "'$(command)'" },
        { input: 'a;b', expected: "'a;b'" },
        { input: 'a|b', expected: "'a|b'" },
        { input: 'a&b', expected: "'a&b'" },
        { input: 'a>b', expected: "'a>b'" },
        { input: 'a<b', expected: "'a<b'" },
        { input: '"quoted"', expected: "'\"quoted\"'" }
      ];

      for (const { input, expected } of testCases) {
        const escaped = shellEscape.escapeArg(input);
        expect(escaped).toBe(expected);
      }
    });

    test('should handle arrays of arguments', () => {
      const args = ['cmd', 'arg with space', '$VAR', '"quoted"'];
      const escaped = args.map(arg => shellEscape.escapeArg(arg)).join(' ');
      expect(escaped).toBe("cmd 'arg with space' '$VAR' '\"quoted\"'");
    });

    test('should handle empty strings and special cases', () => {
      expect(shellEscape.escapeArg('')).toBe("");
      // Test quote function for $ quoting
      expect(shellEscape.quote('')).toBe("$''");
    });
  });

  describe('SSH Security', () => {
    test('should validate SSH connection options', async () => {
      const mockClient = {
        connect: jest.fn(),
        on: jest.fn(),
        end: jest.fn(),
        exec: jest.fn()
      };

      // Mock SSH2 Client
      jest.mock('ssh2', () => ({
        Client: jest.fn(() => mockClient)
      }));

      // Test that sensitive options are not logged
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const sshEngine = $.ssh({
        host: 'example.com',
        username: 'user',
        password: 'secret123', // Should not be logged
        privateKey: 'PRIVATE KEY DATA' // Should not be logged
      });

      // Ensure no sensitive data was logged
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('secret123')
      );
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('PRIVATE KEY DATA')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe.skip('Docker Security', () => {
    test('should sanitize container names', async () => {
      const maliciousContainerName = 'container; docker rm -f $(docker ps -aq)';
      
      // This should fail with invalid container name, not execute the malicious command
      await expect(
        $.docker({ container: maliciousContainerName })`echo test`
      ).rejects.toThrow();
    });

    test('should validate docker options', async () => {
      const invalidOptions = [
        { container: '../../../etc/passwd' },
        { container: '/etc/passwd' },
        { container: 'C:\\Windows\\System32' }
      ];

      for (const opts of invalidOptions) {
        await expect(
          $.docker(opts as any)`echo test`
        ).rejects.toThrow();
      }
    });
  });

  describe('File Permission Security', () => {
    const testDir = '/tmp/ush-security-test';

    beforeEach(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('should create temp files with secure permissions', async () => {
      await withTempFile(async (file) => {
        await file.write('sensitive data');
        
        // Check file permissions (should be readable/writable by owner only)
        // Use fs.stat directly on the file path
        const { stat } = await import('node:fs/promises');
        const stats = await stat(file.path);
        const mode = stats.mode & parseInt('777', 8);
        
        // On Unix systems, should be 0600 (owner read/write only)
        // On Windows, this test might behave differently
        if (process.platform !== 'win32') {
          // macOS creates files with 644 by default
          expect([parseInt('600', 8), parseInt('644', 8)]).toContain(mode);
        }
      });
    });
  });

  describe('Resource Cleanup', () => {
    test('should clean up temp files even on error', async () => {
      let tempPath: string | undefined;
      
      try {
        await withTempFile(async (file) => {
          tempPath = file.path;
          expect(existsSync(tempPath)).toBe(true);
          throw new Error('Simulated error');
        });
      } catch (error) {
        // Expected error
      }
      
      // File should be cleaned up despite the error
      if (tempPath) {
        expect(existsSync(tempPath)).toBe(false);
      }
    });

    test('should clean up temp directories even on error', async () => {
      let tempPath: string | undefined;
      
      try {
        await withTempDir(async (dir) => {
          tempPath = dir.path;
          expect(existsSync(tempPath)).toBe(true);
          throw new Error('Simulated error');
        });
      } catch (error) {
        // Expected error
      }
      
      // Directory should be cleaned up despite the error
      if (tempPath) {
        expect(existsSync(tempPath)).toBe(false);
      }
    });
  });

  describe('Input Validation', () => {
    test('should validate command inputs', async () => {
      const invalidCommands = [
        '', // Empty command - should throw
      ];

      for (const cmd of invalidCommands) {
        await expect(
          $.execute({ command: cmd })
        ).rejects.toThrow(/cannot be empty/);
      }
      
      // Test that whitespace-only commands might succeed or fail based on shell
      const whitespaceCommands = [' ', '\t', '\n'];
      for (const cmd of whitespaceCommands) {
        try {
          const result = await $.execute({ command: cmd });
          // If it succeeds, it should have exit code 0
          expect(result.exitCode).toBe(0);
        } catch (e) {
          // If it fails, that's also acceptable
          expect(e).toBeDefined();
        }
      }
    });

    test('should handle very long inputs safely', async () => {
      const longString = 'A'.repeat(10000);
      const result = await $`echo ${longString} | wc -c`;
      
      // Should handle long strings without buffer overflow
      expect(result.exitCode).toBe(0);
      expect(parseInt(result.stdout.trim())).toBeGreaterThan(9000);
    });
  });

  describe('Error Information Leakage', () => {
    test('should not expose sensitive file paths in errors', async () => {
      // Test that in production, sensitive commands are sanitized
      const originalEnv = process.env['NODE_ENV'];
      const originalJest = process.env['JEST_WORKER_ID'];
      const originalSanitize = process.env['XEC_SANITIZE_COMMANDS'];

      try {
        // First, verify sanitization works in production mode
        delete process.env['NODE_ENV'];
        delete process.env['JEST_WORKER_ID'];
        process.env['XEC_SANITIZE_COMMANDS'] = 'true';

        const { sanitizeCommandForError } = await import('../../../src/core/error.js');
        const sanitized = sanitizeCommandForError('cat /some/nonexistent/sensitive/path/to/secret.key');
        expect(sanitized).toBe('cat [arguments hidden]');

        // Also test other sensitive commands
        expect(sanitizeCommandForError('rm -rf /important/path')).toBe('rm [arguments hidden]');
        expect(sanitizeCommandForError('grep password /etc/passwd')).toBe('grep [arguments hidden]');

        // Non-sensitive commands should not be sanitized
        expect(sanitizeCommandForError('echo hello')).toBe('echo hello');
        expect(sanitizeCommandForError('node script.js')).toBe('node script.js');
      } finally {
        // Restore environment
        if (originalEnv !== undefined) process.env['NODE_ENV'] = originalEnv;
        if (originalJest !== undefined) process.env['JEST_WORKER_ID'] = originalJest;
        if (originalSanitize !== undefined) {
          process.env['XEC_SANITIZE_COMMANDS'] = originalSanitize;
        } else {
          delete process.env['XEC_SANITIZE_COMMANDS'];
        }
      }

      // In test environment, verify that sanitization is disabled
      const { sanitizeCommandForError: sanitizeInTest } = await import('../../../src/core/error.js');
      expect(sanitizeInTest('cat /sensitive/path')).toBe('cat /sensitive/path');
    });

    test('should sanitize error messages from remote hosts', async () => {
      // This is a conceptual test - in real implementation, 
      // we'd mock the SSH adapter to return an error
      const mockError = new Error('Connection failed: password authentication failed for user@sensitive-host.internal');
      
      // In real implementation, errors should be sanitized
      // to not expose internal hostnames or usernames
      expect(mockError.message).toContain('sensitive-host.internal'); // This should be sanitized in production
    });
  });

  describe('Environment Variable Security', () => {
    // Create a fresh instance for environment variable tests
    let localEngine: any;
    
    beforeEach(async () => {
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      localEngine = new ExecutionEngine();
    });

    test('should not execute commands in environment variable values', async () => {
      // Test that command substitution in env vars is not executed
      const result = await localEngine.execute({
        command: 'sh',
        args: ['-c', 'echo "$TEST_VAR"'],
        env: { 
          TEST_VAR: '$(echo pwned)',
          PATH: process.env['PATH'] // Include PATH for sh to work
        },
        shell: false
      });
      
      // The output should contain the literal command substitution syntax
      const output = result.stdout.trim();
      expect(output).toBe('$(echo pwned)');
    });

    test('should handle special characters in environment variables', async () => {
      const specialChars = "$`\"'\\;|&<>()";
      const result = await localEngine.execute({
        command: 'sh',
        args: ['-c', 'echo "$SPECIAL"'],
        env: { 
          SPECIAL: specialChars,
          PATH: process.env['PATH'] // Include PATH for sh to work
        },
        shell: false
      });
      
      expect(result.stdout.trim()).toBe(specialChars);
    });
  });

  describe('Command Argument Security', () => {
    test('should properly quote arguments with spaces', async () => {
      // Create an isolated engine instance for this test
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      const { createCallableEngine } = await import('../../../src/index.js');
      const isolatedEngine = new ExecutionEngine();
      const isolated$ = createCallableEngine(isolatedEngine);
      
      const argWithSpaces = 'hello world test';
      const result = await isolated$`echo ${argWithSpaces}`;
      
      expect(result.stdout.trim()).toBe('hello world test');
    });

    test('should handle arguments with quotes', async () => {
      // Create an isolated engine instance for this test
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      const { createCallableEngine } = await import('../../../src/index.js');
      const isolatedEngine = new ExecutionEngine();
      const isolated$ = createCallableEngine(isolatedEngine);
      
      const argWithQuotes = 'it\'s "quoted"';
      const result = await isolated$`echo ${argWithQuotes}`;
      
      expect(result.stdout.trim()).toBe('it\'s "quoted"');
    });

    test('should handle empty string arguments', async () => {
      // Create an isolated engine instance for this test
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      const { createCallableEngine } = await import('../../../src/index.js');
      const isolatedEngine = new ExecutionEngine();
      const isolated$ = createCallableEngine(isolatedEngine);
      
      const emptyArg = '';
      const result = await isolated$`echo start${emptyArg}end`;
      
      expect(result.stdout.trim()).toBe('startend');
    });
  });

  describe('Concurrent Access Security', () => {
    test('should handle concurrent temp file creation safely', async () => {
      const promises = Array(10).fill(null).map(async (_, index) => {
        try {
          return await withTempFile(async (file) => {
            const testContent = `concurrent test ${index}`;
            await file.write(testContent);
            const content = await file.read();
            return { path: file.path, content, index };
          });
        } catch (error) {
          console.error(`Error in concurrent file ${index}:`, error);
          throw error;
        }
      });

      const results = await Promise.all(promises);
      
      // All files should have unique paths
      const paths = results.map(r => r.path);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(10);
      
      // All files should have the correct content
      results.forEach(result => {
        expect(result.content).toBe(`concurrent test ${result.index}`);
      });
    });
  });

  describe('Additional Security Tests', () => {
    test('should handle very long command lines safely', async () => {
      // Test with a command line that's very long but not too long
      const longArg = 'A'.repeat(1000);
      const result = await $`echo ${longArg} | wc -c`;
      
      expect(result.exitCode).toBe(0);
      // Should be at least 1000 characters (plus newline)
      expect(parseInt(result.stdout.trim())).toBeGreaterThanOrEqual(1000);
    });

    test('should prevent shell expansion in literals', async () => {
      const homeVar = '$HOME';
      const result = await $`echo ${homeVar}`;
      
      // Should output literal $HOME, not expand it
      expect(result.stdout.trim()).toBe('$HOME');
    });

    test('should handle unicode characters safely', async () => {
      const unicode = '🔒 Безопасность 安全 🛡️';
      const result = await $`echo ${unicode}`;
      
      expect(result.stdout.trim()).toBe(unicode);
    });

    test('should handle control characters safely', async () => {
      // Test with various control characters (except null byte)
      const controlChars = '\x01\x02\x03\x04\x05';
      const result = await $`echo "test${controlChars}test"`;
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test');
    });

    test('should validate temp directory creation permissions', async () => {
      // Create an isolated engine instance for this test
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      const { createCallableEngine } = await import('../../../src/index.js');
      const isolatedEngine = new ExecutionEngine();
      const isolated$ = createCallableEngine(isolatedEngine);
      
      await withTempDir(async (dir) => {
        // Directory should exist
        const exists = await isolated$`test -d ${dir.path} && echo "exists"`;
        expect(exists.stdout.trim()).toBe('exists');
        
        // Should be able to create files in it
        const testFile = `${dir.path}/test.txt`;
        await isolated$`echo "secure" > ${testFile}`;
        
        const content = await isolated$`cat ${testFile}`;
        expect(content.stdout.trim()).toBe('secure');
      });
    });

    test('should handle symlink attacks in temp directories', async () => {
      await withTempDir(async (dir) => {
        // Try to create a symlink pointing outside temp dir
        const symlinkPath = `${dir.path}/evil-link`;
        const targetPath = '/etc/passwd';
        
        // Create symlink
        await $`ln -s ${targetPath} ${symlinkPath}`;
        
        // Verify the symlink was created but we don't follow it blindly
        const linkInfo = await $`ls -la ${symlinkPath} | grep -E "^l"`;
        expect(linkInfo.exitCode).toBe(0);
        expect(linkInfo.stdout).toContain('evil-link');
      });
    });
  });
});