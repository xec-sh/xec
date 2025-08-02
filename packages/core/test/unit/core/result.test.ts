import { it, expect, describe } from '@jest/globals';

import { CommandError } from '../../../src/core/error.js';
import { ExecutionResultImpl } from '../../../src/core/result.js';
import { createMockExecutionResult } from '../../helpers/mock-factories.js';

describe('ExecutionResult', () => {
  describe('ExecutionResultImpl', () => {
    it('should create with all properties', () => {
      const startedAt = new Date('2024-01-01T00:00:00Z');
      const finishedAt = new Date('2024-01-01T00:00:01Z');

      const result = new ExecutionResultImpl(
        'output text',
        'error text',
        0,
        'SIGTERM',
        'echo test',
        1000,
        startedAt,
        finishedAt,
        'local',
        'example.com',
        'my-container'
      );

      expect(result.stdout).toBe('output text');
      expect(result.stderr).toBe('error text');
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBe('SIGTERM');
      expect(result.command).toBe('echo test');
      expect(result.duration).toBe(1000);
      expect(result.startedAt).toEqual(startedAt);
      expect(result.finishedAt).toEqual(finishedAt);
      expect(result.adapter).toBe('local');
      expect(result.host).toBe('example.com');
      expect(result.container).toBe('my-container');
    });

    it('should work with minimal properties', () => {
      const result = new ExecutionResultImpl(
        'output',
        '',
        0,
        undefined,
        'ls',
        100,
        new Date(),
        new Date(),
        'local'
      );

      expect(result.stdout).toBe('output');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeUndefined();
      expect(result.command).toBe('ls');
      expect(result.duration).toBe(100);
      expect(result.adapter).toBe('local');
      expect(result.host).toBeUndefined();
      expect(result.container).toBeUndefined();
    });
  });


  describe('toMetadata()', () => {
    it('should serialize all properties', () => {
      const startedAt = new Date('2024-01-01T00:00:00Z');
      const finishedAt = new Date('2024-01-01T00:00:01Z');

      const result = new ExecutionResultImpl(
        'output',
        'error',
        1,
        'SIGKILL',
        'test command',
        1000,
        startedAt,
        finishedAt,
        'ssh',
        'server.com',
        undefined
      );

      const json = result.toMetadata();

      expect(json).toEqual({
        stdout: 'output',
        stderr: 'error',
        exitCode: 1,
        signal: 'SIGKILL',
        command: 'test command',
        duration: 1000,
        startedAt: '2024-01-01T00:00:00.000Z',
        finishedAt: '2024-01-01T00:00:01.000Z',
        adapter: 'ssh',
        host: 'server.com',
        container: undefined
      });
    });

    it('should be JSON.stringify compatible', () => {
      const result = createMockExecutionResult({
        stdout: 'test output',
        exitCode: 0
      });

      const jsonString = JSON.stringify(result);
      const parsed = JSON.parse(jsonString);

      expect(parsed.stdout).toBe('test output');
      expect(parsed.exitCode).toBe(0);
      expect(parsed.adapter).toBe('mock');
    });
  });

  describe('throwIfFailed()', () => {
    it('should not throw for exit code 0', () => {
      const result = createMockExecutionResult({
        exitCode: 0,
        stdout: 'success'
      });

      expect(() => result.throwIfFailed()).not.toThrow();
    });

    it('should throw CommandError for non-zero exit code', () => {
      const result = createMockExecutionResult({
        command: 'failing-command',
        exitCode: 1,
        stderr: 'Command failed',
        stdout: '',
        duration: 500
      });

      expect(() => result.throwIfFailed()).toThrow(CommandError);

      try {
        result.throwIfFailed();
      } catch (error: any) {
        expect(error).toBeInstanceOf(CommandError);
        expect(error.command).toBe('failing-command');
        expect(error.exitCode).toBe(1);
        expect(error.stderr).toBe('Command failed');
        expect(error.duration).toBe(500);
      }
    });

    it('should include signal in error when present', () => {
      const result = createMockExecutionResult({
        command: 'killed-command',
        exitCode: null as any,
        signal: 'SIGKILL',
        stderr: 'Killed'
      });

      try {
        result.throwIfFailed();
      } catch (error: any) {
        expect(error.signal).toBe('SIGKILL');
      }
    });

    it('should not throw when exit code is 0 even with signal', () => {
      const result = createMockExecutionResult({
        exitCode: 0,
        signal: 'SIGTERM',
        stdout: 'Process terminated gracefully'
      });

      expect(() => result.throwIfFailed()).not.toThrow();
    });

    it('should throw with detailed error information', () => {
      const result = createMockExecutionResult({
        command: 'complex-command --with-args',
        exitCode: 127,
        stdout: 'Some output before failure',
        stderr: 'Command not found',
        duration: 1500
      });

      try {
        result.throwIfFailed();
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(CommandError);
        expect(error.command).toBe('complex-command --with-args');
        expect(error.exitCode).toBe(127);
        expect(error.stdout).toBe('Some output before failure');
        expect(error.stderr).toBe('Command not found');
        expect(error.duration).toBe(1500);
        expect(error.message).toContain('exit code 127');
      }
    });
  });

  describe('Factory function', () => {
    it('should create valid results with defaults', () => {
      const result = createMockExecutionResult();

      expect(result.stdout).toBe('mock output');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.command).toBe('echo test');
      expect(result.adapter).toBe('mock');
    });

    it('should override specific properties', () => {
      const result = createMockExecutionResult({
        stdout: 'custom output',
        exitCode: 42,
        adapter: 'ssh',
        host: 'remote.server'
      });

      expect(result.stdout).toBe('custom output');
      expect(result.exitCode).toBe(42);
      expect(result.adapter).toBe('ssh');
      expect(result.host).toBe('remote.server');
    });
  });

  describe('ExecutionResult interface', () => {
    it('should match the expected interface', () => {
      const result = createMockExecutionResult({
        stdout: 'output',
        stderr: 'error',
        exitCode: 0,
        signal: 'SIGTERM',
        command: 'test',
        adapter: 'local',
        host: 'server',
        container: 'container'
      });

      // This test ensures the interface is correctly defined
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('finishedAt');
      expect(result).toHaveProperty('adapter');
      expect(result).toHaveProperty('host');
      expect(result).toHaveProperty('container');
      expect(result).toHaveProperty('ok');
      // cause is undefined for successful execution (exitCode 0)
      expect(result.cause).toBeUndefined();

      // Test methods
      expect(typeof result.toMetadata).toBe('function');
      expect(typeof result.throwIfFailed).toBe('function');
      expect(typeof result.text).toBe('function');
      expect(typeof result.json).toBe('function');
      expect(typeof result.lines).toBe('function');
      expect(typeof result.buffer).toBe('function');
    });
  });

  describe('ok property', () => {
    it('should be true for exit code 0', () => {
      const result = createMockExecutionResult({
        exitCode: 0
      });

      expect(result.ok).toBe(true);
    });

    it('should be false for non-zero exit code', () => {
      const result = createMockExecutionResult({
        exitCode: 1
      });

      expect(result.ok).toBe(false);
    });

    it('should be false for negative exit code', () => {
      const result = createMockExecutionResult({
        exitCode: -1
      });

      expect(result.ok).toBe(false);
    });

    it('should be false for large exit code', () => {
      const result = createMockExecutionResult({
        exitCode: 255
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('cause property', () => {
    it('should be undefined for successful execution', () => {
      const result = createMockExecutionResult({
        exitCode: 0
      });

      expect(result.cause).toBeUndefined();
    });

    it('should contain exit code for failed execution', () => {
      const result = createMockExecutionResult({
        exitCode: 1
      });

      expect(result.cause).toBe('exitCode: 1');
    });

    it('should contain signal when present and failed', () => {
      const result = createMockExecutionResult({
        exitCode: 143,
        signal: 'SIGTERM'
      });

      expect(result.cause).toBe('signal: SIGTERM');
    });

    it('should prefer signal over exitCode in cause', () => {
      const result = createMockExecutionResult({
        exitCode: 130,
        signal: 'SIGINT'
      });

      expect(result.cause).toBe('signal: SIGINT');
    });

    it('should handle various exit codes', () => {
      expect(createMockExecutionResult({ exitCode: 127 }).cause).toBe('exitCode: 127');
      expect(createMockExecutionResult({ exitCode: 255 }).cause).toBe('exitCode: 255');
      expect(createMockExecutionResult({ exitCode: -1 }).cause).toBe('exitCode: -1');
    });
  });

  describe('text()', () => {
    it('should return trimmed stdout', () => {
      const result = createMockExecutionResult({
        stdout: '  hello world  \n'
      });

      expect(result.text()).toBe('hello world');
    });

    it('should handle empty stdout', () => {
      const result = createMockExecutionResult({
        stdout: ''
      });

      expect(result.text()).toBe('');
    });

    it('should handle multiline stdout', () => {
      const result = createMockExecutionResult({
        stdout: 'line1\nline2\nline3\n'
      });

      expect(result.text()).toBe('line1\nline2\nline3');
    });

    it('should handle stdout with only whitespace', () => {
      const result = createMockExecutionResult({
        stdout: '   \n\t\n   '
      });

      expect(result.text()).toBe('');
    });

    it('should handle stdout with leading/trailing whitespace and content', () => {
      const result = createMockExecutionResult({
        stdout: '\n\n   content with spaces   \n\n'
      });

      expect(result.text()).toBe('content with spaces');
    });

    it('should trim mixed whitespace correctly', () => {
      const result = createMockExecutionResult({
        stdout: '\t  \n  data  \n  \t'
      });

      expect(result.text()).toBe('data');
    });
  });

  describe('json<T>()', () => {
    it('should parse valid JSON object', () => {
      const result = createMockExecutionResult({
        stdout: '{"name": "test", "value": 42}'
      });

      const data = result.json<{name: string, value: number}>();
      expect(data.name).toBe('test');
      expect(data.value).toBe(42);
    });

    it('should parse valid JSON array', () => {
      const result = createMockExecutionResult({
        stdout: '[1, 2, 3, "test"]'
      });

      const data = result.json<(number | string)[]>();
      expect(data).toEqual([1, 2, 3, 'test']);
    });

    it('should parse null', () => {
      const result = createMockExecutionResult({
        stdout: 'null'
      });

      expect(result.json()).toBeNull();
    });

    it('should parse boolean', () => {
      const result = createMockExecutionResult({
        stdout: 'true'
      });

      expect(result.json<boolean>()).toBe(true);
    });

    it('should parse number', () => {
      const result = createMockExecutionResult({
        stdout: '123.45'
      });

      expect(result.json<number>()).toBe(123.45);
    });

    it('should parse string', () => {
      const result = createMockExecutionResult({
        stdout: '"hello world"'
      });

      expect(result.json<string>()).toBe('hello world');
    });

    it('should handle JSON with whitespace', () => {
      const result = createMockExecutionResult({
        stdout: '\n\n  {"test": true}  \n\n'
      });

      expect(result.json<{test: boolean}>()).toEqual({test: true});
    });

    it('should throw error for invalid JSON', () => {
      const result = createMockExecutionResult({
        stdout: 'invalid json'
      });

      expect(() => result.json()).toThrow('Failed to parse JSON');
    });

    it('should throw error with output context for invalid JSON', () => {
      const result = createMockExecutionResult({
        stdout: 'not json at all'
      });

      try {
        result.json();
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to parse JSON');
        expect(error.message).toContain('Output: not json at all');
      }
    });

    it('should throw error for incomplete JSON', () => {
      const result = createMockExecutionResult({
        stdout: '{"incomplete":'
      });

      expect(() => result.json()).toThrow('Failed to parse JSON');
    });

    it('should handle empty string as invalid JSON', () => {
      const result = createMockExecutionResult({
        stdout: ''
      });

      expect(() => result.json()).toThrow('Failed to parse JSON');
    });

    it('should handle complex nested objects', () => {
      const result = createMockExecutionResult({
        stdout: JSON.stringify({
          user: {
            name: 'John',
            age: 30,
            preferences: {
              theme: 'dark',
              notifications: true
            }
          },
          items: [1, 2, 3]
        })
      });

      const data = result.json<{
        user: {
          name: string;
          age: number;
          preferences: {
            theme: string;
            notifications: boolean;
          };
        };
        items: number[];
      }>();

      expect(data.user.name).toBe('John');
      expect(data.user.age).toBe(30);
      expect(data.user.preferences.theme).toBe('dark');
      expect(data.user.preferences.notifications).toBe(true);
      expect(data.items).toEqual([1, 2, 3]);
    });
  });

  describe('lines()', () => {
    it('should split stdout by newlines', () => {
      const result = createMockExecutionResult({
        stdout: 'line1\nline2\nline3'
      });

      expect(result.lines()).toEqual(['line1', 'line2', 'line3']);
    });

    it('should filter out empty lines', () => {
      const result = createMockExecutionResult({
        stdout: 'line1\n\nline2\n\n\nline3\n'
      });

      expect(result.lines()).toEqual(['line1', 'line2', 'line3']);
    });

    it('should handle single line without newline', () => {
      const result = createMockExecutionResult({
        stdout: 'single line'
      });

      expect(result.lines()).toEqual(['single line']);
    });

    it('should handle single line with trailing newline', () => {
      const result = createMockExecutionResult({
        stdout: 'single line\n'
      });

      expect(result.lines()).toEqual(['single line']);
    });

    it('should handle empty stdout', () => {
      const result = createMockExecutionResult({
        stdout: ''
      });

      expect(result.lines()).toEqual([]);
    });

    it('should handle stdout with only newlines', () => {
      const result = createMockExecutionResult({
        stdout: '\n\n\n'
      });

      expect(result.lines()).toEqual([]);
    });

    it('should handle lines with whitespace', () => {
      const result = createMockExecutionResult({
        stdout: '  line1  \n\n  line2  \n  line3  '
      });

      expect(result.lines()).toEqual(['  line1  ', '  line2  ', '  line3  ']);
    });

    it('should handle mixed line endings', () => {
      const result = createMockExecutionResult({
        stdout: 'line1\nline2\nline3\nline4'
      });

      expect(result.lines()).toEqual(['line1', 'line2', 'line3', 'line4']);
    });

    it('should handle lines with special characters', () => {
      const result = createMockExecutionResult({
        stdout: 'line with "quotes"\nline with \'apostrophes\'\nline with \ttabs\nline with spaces'
      });

      expect(result.lines()).toEqual([
        'line with "quotes"',
        'line with \'apostrophes\'',
        'line with \ttabs',
        'line with spaces'
      ]);
    });

    it('should handle very long output', () => {
      const longLines = Array.from({length: 1000}, (_, i) => `line${i}`);
      const result = createMockExecutionResult({
        stdout: longLines.join('\n')
      });

      expect(result.lines()).toEqual(longLines);
      expect(result.lines()).toHaveLength(1000);
    });
  });

  describe('buffer()', () => {
    it('should convert stdout to Buffer', () => {
      const result = createMockExecutionResult({
        stdout: 'hello world'
      });

      const buffer = result.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe('hello world');
    });

    it('should handle empty stdout', () => {
      const result = createMockExecutionResult({
        stdout: ''
      });

      const buffer = result.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(0);
      expect(buffer.toString()).toBe('');
    });

    it('should handle binary-like data', () => {
      const result = createMockExecutionResult({
        stdout: 'binary data \x00\x01\x02'
      });

      const buffer = result.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe('binary data \x00\x01\x02');
    });

    it('should handle UTF-8 characters', () => {
      const result = createMockExecutionResult({
        stdout: 'Hello 世界 🌍'
      });

      const buffer = result.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf8')).toBe('Hello 世界 🌍');
    });

    it('should handle multiline content', () => {
      const result = createMockExecutionResult({
        stdout: 'line1\nline2\nline3'
      });

      const buffer = result.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe('line1\nline2\nline3');
    });

    it('should handle large content', () => {
      const largeContent = 'x'.repeat(10000);
      const result = createMockExecutionResult({
        stdout: largeContent
      });

      const buffer = result.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(10000);
      expect(buffer.toString()).toBe(largeContent);
    });

    it('should preserve exact byte content', () => {
      const content = 'test\r\n\t spaces  ';
      const result = createMockExecutionResult({
        stdout: content
      });

      const buffer = result.buffer();
      expect(buffer.toString()).toBe(content);
      expect(Array.from(buffer)).toEqual(Array.from(Buffer.from(content)));
    });

    it('should handle special characters and control codes', () => {
      const content = 'test\x1b[31mred\x1b[0m\x07\x08';
      const result = createMockExecutionResult({
        stdout: content
      });

      const buffer = result.buffer();
      expect(buffer.toString()).toBe(content);
    });
  });

  describe('zx-compatible methods interface', () => {
    it('should have all expected methods', () => {
      const result = createMockExecutionResult();

      expect(typeof result.text).toBe('function');
      expect(typeof result.json).toBe('function');
      expect(typeof result.lines).toBe('function');
      expect(typeof result.buffer).toBe('function');
    });

    it('should work together in a chain-like pattern', () => {
      const result = createMockExecutionResult({
        stdout: '{"items": ["a", "b", "c"]}\n'  
      });

      // Test chaining behavior (though not actual method chaining)
      const text = result.text();
      expect(text).toBe('{"items": ["a", "b", "c"]}');

      const data = result.json<{items: string[]}>();
      expect(data.items).toEqual(['a', 'b', 'c']);

      const buffer = result.buffer();
      expect(buffer.toString().trim()).toBe('{"items": ["a", "b", "c"]}');
    });

  });
});