import { it, expect, describe } from '@jest/globals';

import { ProcessOutput } from '../../../src/core/process-output.js';

describe('ProcessOutput', () => {
  describe('Constructor and basic properties', () => {
    it('should create ProcessOutput with all properties', () => {
      const output = new ProcessOutput({
        stdout: 'output text',
        stderr: 'error text',
        exitCode: 0,
        signal: null,
        duration: 1000,
        command: 'echo test',
        cwd: '/home/user'
      });

      expect(output.stdout).toBe('output text');
      expect(output.stderr).toBe('error text');
      expect(output.exitCode).toBe(0);
      expect(output.signal).toBeNull();
      expect(output.duration).toBe(1000);
      expect(output.command).toBe('echo test');
      expect(output.cwd).toBe('/home/user');
    });

    it('should handle buffer inputs', () => {
      const output = new ProcessOutput({
        stdout: Buffer.from('buffer output'),
        stderr: Buffer.from('buffer error'),
        exitCode: 0
      });

      expect(output.stdout).toBe('buffer output');
      expect(output.stderr).toBe('buffer error');
    });

    it('should compute stdall correctly', () => {
      const output = new ProcessOutput({
        stdout: 'out',
        stderr: 'err',
        exitCode: 0
      });

      expect(output.stdall).toBe('outerr');
    });

    it('should use provided stdall if given', () => {
      const output = new ProcessOutput({
        stdout: 'out',
        stderr: 'err',
        stdall: 'custom',
        exitCode: 0
      });

      expect(output.stdall).toBe('custom');
    });
  });

  describe('Success checks', () => {
    it('should be ok for exit code 0', () => {
      const output = new ProcessOutput({
        stdout: 'success',
        stderr: '',
        exitCode: 0
      });

      expect(output.ok).toBe(true);
    });

    it('should not be ok for non-zero exit code', () => {
      const output = new ProcessOutput({
        stdout: '',
        stderr: 'error',
        exitCode: 1
      });

      expect(output.ok).toBe(false);
    });

    it('should not be ok when signal is present', () => {
      const output = new ProcessOutput({
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: 'SIGTERM'
      });

      expect(output.ok).toBe(false);
    });
  });

  describe('String conversion', () => {
    it('should return trimmed stdout for toString()', () => {
      const output = new ProcessOutput({
        stdout: '  result with spaces  \n',
        stderr: '',
        exitCode: 0
      });

      expect(output.toString()).toBe('result with spaces');
    });

    it('should return trimmed stdout for valueOf()', () => {
      const output = new ProcessOutput({
        stdout: '  value  \n',
        stderr: '',
        exitCode: 0
      });

      expect(output.valueOf()).toBe('value');
    });

    it('should return trimmed text with text() method', () => {
      const output = new ProcessOutput({
        stdout: '  text output  \n',
        stderr: '',
        exitCode: 0
      });

      expect(output.text()).toBe('text output');
    });
  });

  describe('JSON parsing', () => {
    it('should parse valid JSON', () => {
      const output = new ProcessOutput({
        stdout: '{"key": "value", "num": 42}',
        stderr: '',
        exitCode: 0
      });

      const json = output.json();
      expect(json).toEqual({ key: 'value', num: 42 });
    });

    it('should throw on invalid JSON', () => {
      const output = new ProcessOutput({
        stdout: 'not json',
        stderr: '',
        exitCode: 0
      });

      expect(() => output.json()).toThrow('Failed to parse JSON');
    });

    it('should throw on empty stdout', () => {
      const output = new ProcessOutput({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      expect(() => output.json()).toThrow('Empty stdout');
    });
  });

  describe('Lines processing', () => {
    it('should split stdout into lines', () => {
      const output = new ProcessOutput({
        stdout: 'line1\nline2\nline3\n',
        stderr: '',
        exitCode: 0
      });

      expect(output.lines()).toEqual(['line1', 'line2', 'line3']);
    });

    it('should filter empty lines', () => {
      const output = new ProcessOutput({
        stdout: 'line1\n\nline2\n\n',
        stderr: '',
        exitCode: 0
      });

      expect(output.lines()).toEqual(['line1', 'line2']);
    });

    it('should handle custom delimiter', () => {
      const output = new ProcessOutput({
        stdout: 'part1,part2,part3',
        stderr: '',
        exitCode: 0
      });

      expect(output.lines(',')).toEqual(['part1', 'part2', 'part3']);
    });
  });

  describe('Buffer operations', () => {
    it('should return stdout as Buffer', () => {
      const output = new ProcessOutput({
        stdout: 'buffer content',
        stderr: '',
        exitCode: 0
      });

      const buf = output.buffer();
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.toString()).toBe('buffer content');
    });
  });

  describe('Iteration support', () => {
    it('should support synchronous iteration', () => {
      const output = new ProcessOutput({
        stdout: 'line1\nline2\nline3',
        stderr: '',
        exitCode: 0
      });

      const lines: string[] = [];
      for (const line of output) {
        lines.push(line);
      }

      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('should support async iteration', async () => {
      const output = new ProcessOutput({
        stdout: 'async1\nasync2',
        stderr: '',
        exitCode: 0
      });

      const lines: string[] = [];
      for await (const line of output) {
        lines.push(line);
      }

      expect(lines).toEqual(['async1', 'async2']);
    });
  });

  describe('Error formatting', () => {
    it('should format error message for non-zero exit', () => {
      const output = new ProcessOutput({
        stdout: '',
        stderr: 'command failed',
        exitCode: 127,
        command: 'unknown-cmd'
      });

      expect(output.message).toContain('Command failed: unknown-cmd');
      expect(output.message).toContain('Exit code: 127');
      expect(output.message).toContain('(Command not found)');
      expect(output.message).toContain('stderr:\ncommand failed');
    });

    it('should format error with signal', () => {
      const output = new ProcessOutput({
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: 'SIGKILL'
      });

      expect(output.message).toContain('Signal: SIGKILL');
    });

    it('should include working directory if provided', () => {
      const output = new ProcessOutput({
        stdout: '',
        stderr: '',
        exitCode: 1,
        cwd: '/project/dir'
      });

      expect(output.message).toContain('Working directory: /project/dir');
    });

    it('should have empty message for successful commands', () => {
      const output = new ProcessOutput({
        stdout: 'success',
        stderr: '',
        exitCode: 0
      });

      expect(output.message).toBe('');
    });
  });

  describe('Factory methods', () => {
    it('should create from result object', () => {
      const output = ProcessOutput.fromResult({
        stdout: 'from result',
        stderr: '',
        exitCode: 0,
        duration: 500
      });

      expect(output.stdout).toBe('from result');
      expect(output.duration).toBe(500);
    });

    it('should create successful output', () => {
      const output = ProcessOutput.success('success output');
      
      expect(output.stdout).toBe('success output');
      expect(output.stderr).toBe('');
      expect(output.exitCode).toBe(0);
      expect(output.ok).toBe(true);
    });

    it('should create successful output with default empty stdout', () => {
      const output = ProcessOutput.success();
      
      expect(output.stdout).toBe('');
      expect(output.ok).toBe(true);
    });
  });

  describe('Blob support', () => {
    it('should return Blob if available', () => {
      const output = new ProcessOutput({
        stdout: 'blob content',
        stderr: '',
        exitCode: 0
      });

      // Check if Blob is available (Node.js 18+)
      if (typeof Blob !== 'undefined') {
        const blob = output.blob();
        expect(blob).toBeInstanceOf(Blob);
      } else {
        expect(() => output.blob()).toThrow('Blob is not available');
      }
    });
  });
});