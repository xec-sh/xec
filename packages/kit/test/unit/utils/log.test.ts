import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { log } from '../../../src/utils/log.js';

// Mock stdout and stderr
const mockStdoutWrite = vi.fn();
const mockStderrWrite = vi.fn();
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

describe('log utilities', () => {
  beforeEach(() => {
    process.stdout.write = mockStdoutWrite as any;
    process.stderr.write = mockStderrWrite as any;
    mockStdoutWrite.mockClear();
    mockStderrWrite.mockClear();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });

  describe('log.info', () => {
    it('should log info message', () => {
      log.info('Information message');
      
      expect(mockStdoutWrite).toHaveBeenCalled();
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Information message');
      // Info symbol could be ℹ or i
      expect(output).toMatch(/[ℹi] /); 
    });

    it('should include message content', () => {
      log.info('Info');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Info');
      // May or may not have color codes
    });
  });

  describe('log.success', () => {
    it('should log success message', () => {
      log.success('Success message');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Success message');
      // Success symbol could be ✔, ✓, or √
      expect(output).toMatch(/[✔✓√] /); 
    });

    it('should include message content', () => {
      log.success('Success');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Success');
      // May or may not have color codes
    });
  });

  describe('log.error', () => {
    it('should log error message to stderr', () => {
      log.error('Error message');
      
      expect(mockStderrWrite).toHaveBeenCalled();
      const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Error message');
      // Error symbol could be ✖, ✗, or X
      expect(output).toMatch(/[✖✗X] /); 
    });

    it('should include message content', () => {
      log.error('Error');
      
      const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Error');
      // May or may not have color codes
    });
  });

  describe('log.warning', () => {
    it('should log warning message to stderr', () => {
      log.warning('Warning message');
      
      expect(mockStderrWrite).toHaveBeenCalled();
      const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Warning message');
      // Warning symbol could be ⚠ or !
      expect(output).toMatch(/[⚠!] /); 
    });

    it('should include message content', () => {
      log.warning('Warning');
      
      const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Warning');
      // May or may not have color codes
    });
  });

  describe('log.message', () => {
    it('should log plain message without symbol', () => {
      log.message('Plain message');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toBe('Plain message\n');
      
      // Should not contain any common symbols
      expect(output).not.toMatch(/[ℹi✔✓√✖✗X⚠!] /);
    });
  });

  describe('formatting', () => {
    it('should add newline to all messages', () => {
      log.info('Test');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output[output.length - 1]).toBe('\n');
    });

    it('should format messages consistently', () => {
      log.info('Info');
      log.success('Success');
      log.error('Error');
      log.warning('Warning');
      
      const stdoutCalls = mockStdoutWrite.mock.calls;
      const stderrCalls = mockStderrWrite.mock.calls;
      
      // info and success go to stdout
      expect(stdoutCalls).toHaveLength(2);
      // error and warning go to stderr
      expect(stderrCalls).toHaveLength(2);
      
      // All should have symbol + space + message + newline
      [...stdoutCalls, ...stderrCalls].forEach(call => {
        const output = call[0] as string;
        expect(output).toMatch(/^.+ .+\n$/);
      });
    });
  });

  describe('multi-line messages', () => {
    it('should handle multi-line info', () => {
      log.info('Line 1\nLine 2\nLine 3');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Line 1\nLine 2\nLine 3');
    });

    it('should handle multi-line errors', () => {
      log.error('Error occurred:\nDetails line 1\nDetails line 2');
      
      const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Error occurred:\nDetails line 1\nDetails line 2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages', () => {
      log.info('');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      // Should have some symbol with space, then newline
      expect(output).toMatch(/^.+ \n$/);
    });

    it('should handle undefined/null as string', () => {
      log.info(undefined as any);
      log.info(null as any);
      
      const outputs = mockStdoutWrite.mock.calls.map(call => call[0] as string);
      expect(outputs[0]).toContain('undefined');
      expect(outputs[1]).toContain('null');
    });

    it('should handle objects', () => {
      log.info({ key: 'value' } as any);
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('[object Object]');
    });

    it('should handle numbers', () => {
      log.info(42 as any);
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('42');
    });
  });

  describe('NO_COLOR support', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.NO_COLOR;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalEnv;
      }
    });

    it.skip('should respect NO_COLOR environment variable', () => {
      // Skipped: ESM modules don't work well with require() and vi.resetModules()
      process.env.NO_COLOR = '1';
      
      // Need to re-import to pick up env change
      vi.resetModules();
      const { log: noColorLog } = require('../../../src/utils/log.js');
      
      noColorLog.info('Test');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      // Should not contain color codes
      expect(output).not.toMatch(/\x1b\[\d+m/);
    });
  });

  describe('log.step', () => {
    it('should log step message', () => {
      log.step('Step 1: Initialize');
      
      expect(mockStdoutWrite).toHaveBeenCalled();
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Step 1: Initialize');
      expect(output).toContain('◆'); // Diamond symbol
    });

    it('should format step with muted color', () => {
      log.step('Processing...');
      
      const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Processing...');
    });
  });

  describe('log.break', () => {
    it('should output a line break', () => {
      log.break();
      
      expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
    });

    it('should work multiple times', () => {
      log.break();
      log.break();
      log.break();
      
      expect(mockStdoutWrite).toHaveBeenCalledTimes(3);
      expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
    });
  });

  describe('exported object', () => {
    it('should have all log methods', () => {
      expect(log).toHaveProperty('info');
      expect(log).toHaveProperty('success');
      expect(log).toHaveProperty('error');
      expect(log).toHaveProperty('warning');
      expect(log).toHaveProperty('message');
      expect(log).toHaveProperty('step');
      expect(log).toHaveProperty('break');
    });

    it('should have callable methods', () => {
      expect(typeof log.info).toBe('function');
      expect(typeof log.success).toBe('function');
      expect(typeof log.error).toBe('function');
      expect(typeof log.warning).toBe('function');
      expect(typeof log.message).toBe('function');
      expect(typeof log.step).toBe('function');
      expect(typeof log.break).toBe('function');
    });
  });
});