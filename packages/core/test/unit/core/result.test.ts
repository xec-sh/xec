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
  
  describe('toString()', () => {
    it('should return trimmed stdout', () => {
      const result = createMockExecutionResult({
        stdout: '  hello world  \n',
        stderr: 'some error'
      });
      
      expect(result.toString()).toBe('hello world');
    });
    
    it('should handle empty stdout', () => {
      const result = createMockExecutionResult({
        stdout: '',
        stderr: 'error'
      });
      
      expect(result.toString()).toBe('');
    });
    
    it('should handle multiline stdout', () => {
      const result = createMockExecutionResult({
        stdout: 'line1\nline2\nline3\n'
      });
      
      expect(result.toString()).toBe('line1\nline2\nline3');
    });
  });
  
  describe('toJSON()', () => {
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
      
      const json = result.toJSON();
      
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
      
      // Test methods
      expect(typeof result.toString).toBe('function');
      expect(typeof result.toJSON).toBe('function');
      expect(typeof result.throwIfFailed).toBe('function');
    });
  });
});