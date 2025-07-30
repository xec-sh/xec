import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { sanitizeCommandForError } from '../../../src/core/error.js';

describe('sanitizeCommandForError', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('when XEC_SANITIZE_COMMANDS is not set (default)', () => {
    beforeEach(() => {
      delete process.env['XEC_SANITIZE_COMMANDS'];
      delete process.env['NODE_ENV'];
      delete process.env['JEST_WORKER_ID'];
    });

    it('should not sanitize commands by default', () => {
      const command = 'cat /secret/path/to/file.txt';
      expect(sanitizeCommandForError(command)).toBe(command);
    });

    it('should not sanitize long commands', () => {
      const command = 'docker run --rm -v /Users/user/projects:/app -e SECRET=value image command arg1 arg2 arg3';
      expect(sanitizeCommandForError(command)).toBe(command);
    });

    it('should not sanitize sensitive commands', () => {
      const command = 'rm -rf /important/directory/*';
      expect(sanitizeCommandForError(command)).toBe(command);
    });
  });

  describe('when XEC_SANITIZE_COMMANDS is true', () => {
    beforeEach(() => {
      process.env['XEC_SANITIZE_COMMANDS'] = 'true';
      delete process.env['NODE_ENV'];
      delete process.env['JEST_WORKER_ID'];
    });

    it('should sanitize sensitive commands with arguments', () => {
      const sensitiveCommands = [
        { cmd: 'cat /secret/file', expected: 'cat [arguments hidden]' },
        { cmd: 'ls /private/dir', expected: 'ls [arguments hidden]' },
        { cmd: 'rm -rf /important/path', expected: 'rm [arguments hidden]' },
        { cmd: 'cp /src/file /dst/file', expected: 'cp [arguments hidden]' },
        { cmd: 'mv /old/path /new/path', expected: 'mv [arguments hidden]' },
        { cmd: 'chmod 755 /some/file', expected: 'chmod [arguments hidden]' },
        { cmd: 'chown user:group /file', expected: 'chown [arguments hidden]' },
        { cmd: 'find / -name secret', expected: 'find [arguments hidden]' },
        { cmd: 'grep password /etc/passwd', expected: 'grep [arguments hidden]' }
      ];

      for (const { cmd, expected } of sensitiveCommands) {
        expect(sanitizeCommandForError(cmd)).toBe(expected);
      }
    });

    it('should truncate long commands', () => {
      const command = 'docker run --rm -v /path:/app -e VAR=value image arg1 arg2 arg3 arg4 arg5';
      expect(sanitizeCommandForError(command)).toBe('docker ... (12 arguments)');
    });

    it('should not sanitize short commands', () => {
      const command = 'echo hello world';
      expect(sanitizeCommandForError(command)).toBe(command);
    });

    it('should handle commands with full paths', () => {
      const command = '/usr/bin/cat /secret/file';
      expect(sanitizeCommandForError(command)).toBe('cat [arguments hidden]');
    });

    it('should handle empty commands', () => {
      expect(sanitizeCommandForError('')).toBe('');
      expect(sanitizeCommandForError('   ')).toBe('   ');
    });
  });

  describe('when in test environment', () => {
    it('should not sanitize when NODE_ENV is test', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['XEC_SANITIZE_COMMANDS'] = 'true';
      
      const command = 'cat /secret/file';
      expect(sanitizeCommandForError(command)).toBe(command);
    });

    it('should not sanitize when JEST_WORKER_ID is set', () => {
      delete process.env['NODE_ENV'];
      process.env['JEST_WORKER_ID'] = '1';
      process.env['XEC_SANITIZE_COMMANDS'] = 'true';
      
      const command = 'rm -rf /important/path';
      expect(sanitizeCommandForError(command)).toBe(command);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      process.env['XEC_SANITIZE_COMMANDS'] = 'true';
      delete process.env['NODE_ENV'];
      delete process.env['JEST_WORKER_ID'];
    });

    it('should handle commands with no arguments', () => {
      expect(sanitizeCommandForError('ls')).toBe('ls');
      expect(sanitizeCommandForError('cat')).toBe('cat');
    });

    it('should handle commands with special characters', () => {
      const command = 'echo "hello world" > file.txt';
      expect(sanitizeCommandForError(command)).toBe('echo ... (4 arguments)');
    });

    it('should handle commands with multiple spaces', () => {
      const command = 'ls    -la    /home';
      expect(sanitizeCommandForError(command)).toBe('ls [arguments hidden]');
    });
  });
});