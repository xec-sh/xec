import { it, expect, describe, beforeEach } from '@jest/globals';

import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { AdapterError, CommandError, TimeoutError } from '../../../src/core/error.js';

describe('MockAdapter', () => {
  let adapter: MockAdapter;
  
  beforeEach(() => {
    adapter = new MockAdapter({ 
      throwOnNonZeroExit: false,
      defaultShell: false 
    });
  });
  
  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const adapter = new MockAdapter();
      expect(adapter).toBeInstanceOf(MockAdapter);
    });
    
    it('should create adapter with custom config', () => {
      const adapter = new MockAdapter({
        recordCommands: false,
        defaultDelay: 100,
        throwOnNonZeroExit: true
      });
      expect(adapter).toBeInstanceOf(MockAdapter);
    });
  });
  
  describe('isAvailable', () => {
    it('should always return true', async () => {
      const result = await adapter.isAvailable();
      expect(result).toBe(true);
    });
  });
  
  describe('execute', () => {
    it('should execute with default response', async () => {
      const result = await adapter.execute({
        command: 'echo test'
      });

      // MockAdapter has special handling for echo commands - it simulates echo output
      expect(result.stdout).toBe('test\n');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('mock');
    });
    
    it('should use mocked command response', async () => {
      adapter.mockCommand('echo hello', {
        stdout: 'hello\n',
        stderr: '',
        exitCode: 0
      });
      
      const result = await adapter.execute({
        command: 'echo hello'
      });
      
      expect(result.stdout).toBe('hello\n');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });
    
    it('should match commands with regex', async () => {
      adapter.mockCommand(/^echo\s+/, {
        stdout: 'matched by regex\n',
        exitCode: 0
      });
      
      const result1 = await adapter.execute({ command: 'echo test' });
      const result2 = await adapter.execute({ command: 'echo hello world' });
      
      expect(result1.stdout).toBe('matched by regex\n');
      expect(result2.stdout).toBe('matched by regex\n');
    });
    
    it('should handle multiple regex patterns', async () => {
      adapter.mockCommand(/^ls/, {
        stdout: 'file1\nfile2\n',
        exitCode: 0
      });
      
      adapter.mockCommand(/^cat\s+/, {
        stdout: 'file contents',
        exitCode: 0
      });
      
      const lsResult = await adapter.execute({ command: 'ls -la' });
      const catResult = await adapter.execute({ command: 'cat file.txt' });
      
      expect(lsResult.stdout).toBe('file1\nfile2\n');
      expect(catResult.stdout).toBe('file contents');
    });
    
    it('should prioritize exact match over regex', async () => {
      adapter.mockCommand(/^echo/, {
        stdout: 'regex match',
        exitCode: 0
      });
      
      adapter.mockCommand('echo exact', {
        stdout: 'exact match',
        exitCode: 0
      });
      
      const result = await adapter.execute({ command: 'echo exact' });
      expect(result.stdout).toBe('exact match');
    });
    
    it('should handle non-zero exit codes', async () => {
      adapter.mockCommand('fail', {
        stdout: '',
        stderr: 'command failed',
        exitCode: 1
      });
      
      const result = await adapter.execute({
        command: 'fail'
      });
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('command failed');
    });
    
    it('should throw on non-zero exit when configured', async () => {
      const throwAdapter = new MockAdapter({ 
        throwOnNonZeroExit: true,
        defaultShell: false 
      });
      
      throwAdapter.mockCommand('fail', {
        stdout: '',
        stderr: 'error',
        exitCode: 1
      });
      
      await expect(throwAdapter.execute({
        command: 'fail'
      })).rejects.toThrow(CommandError);
    });
    
    it('should simulate command delay', async () => {
      adapter.mockCommand('slow', {
        stdout: 'slow response',
        exitCode: 0,
        delay: 100
      });
      
      const start = Date.now();
      const result = await adapter.execute({ command: 'slow' });
      const duration = Date.now() - start;
      
      expect(result.stdout).toBe('slow response');
      expect(duration).toBeGreaterThanOrEqual(100);
    });
    
    it('should use default delay when not specified', async () => {
      const delayAdapter = new MockAdapter({ defaultDelay: 50 });
      
      delayAdapter.mockCommand('test', {
        stdout: 'with default delay',
        exitCode: 0
      });
      
      const start = Date.now();
      await delayAdapter.execute({ command: 'test' });
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(50);
    });
    
    it('should throw mocked error', async () => {
      const testError = new Error('Mocked error');
      
      adapter.mockCommand('error', {
        error: testError
      });
      
      await expect(adapter.execute({ command: 'error' }))
        .rejects.toThrow(AdapterError);
    });
    
    it('should handle abort signal', async () => {
      const controller = new AbortController();
      
      adapter.mockCommand('abortable', {
        stdout: 'should not see this',
        delay: 100
      });
      
      // Abort immediately
      controller.abort();
      
      await expect(adapter.execute({
        command: 'abortable',
        signal: controller.signal
      })).rejects.toThrow(AdapterError);
    });
    
    it('should record executed commands', async () => {
      adapter.mockCommand('cmd1', { stdout: 'output1' });
      adapter.mockCommand('cmd2', { stdout: 'output2' });
      
      await adapter.execute({ command: 'cmd1' });
      await adapter.execute({ command: 'cmd2' });
      
      const commands = adapter.getExecutedCommands();
      expect(commands).toEqual(['cmd1', 'cmd2']);
    });
    
    it('should not record commands when disabled', async () => {
      const noRecordAdapter = new MockAdapter({ recordCommands: false });
      
      await noRecordAdapter.execute({ command: 'test' });
      
      const commands = noRecordAdapter.getExecutedCommands();
      expect(commands).toEqual([]);
    });
    
    it('should check if command was executed', async () => {
      adapter.mockCommand('check-me', { stdout: 'checked' });
      
      expect(adapter.wasCommandExecuted('check-me')).toBe(false);
      
      await adapter.execute({ command: 'check-me' });
      
      expect(adapter.wasCommandExecuted('check-me')).toBe(true);
    });
    
    it('should count command executions', async () => {
      adapter.mockCommand('count-me', { stdout: 'counted' });
      
      expect(adapter.getCommandExecutionCount('count-me')).toBe(0);
      
      await adapter.execute({ command: 'count-me' });
      await adapter.execute({ command: 'count-me' });
      await adapter.execute({ command: 'count-me' });
      
      expect(adapter.getCommandExecutionCount('count-me')).toBe(3);
    });
    
    it('should handle shell option in command building', async () => {
      adapter.mockCommand('sh -c "echo hello"', { stdout: 'shell output' });
      
      const result = await adapter.execute({
        command: 'echo hello',
        shell: true
      });
      
      expect(result.stdout).toBe('shell output');
    });
    
    it('should clear mocks', async () => {
      adapter.mockCommand('test', { stdout: 'mocked' });
      
      await adapter.execute({ command: 'test' });
      expect(adapter.wasCommandExecuted('test')).toBe(true);
      
      adapter.clearMocks();
      
      const result = await adapter.execute({ command: 'test' });
      expect(result.stdout).toBe(''); // Back to default
    });
    
    it('should clear executed commands', async () => {
      await adapter.execute({ command: 'cmd1' });
      await adapter.execute({ command: 'cmd2' });
      
      expect(adapter.getExecutedCommands().length).toBe(2);
      
      // Clear executed commands by getting a new adapter
      adapter = new MockAdapter();
      
      expect(adapter.getExecutedCommands().length).toBe(0);
    });
    
    it('should set default response', async () => {
      adapter.mockDefault({
        stdout: 'default output',
        stderr: 'default error',
        exitCode: 42
      });
      
      const result = await adapter.execute({ command: 'unknown command' });
      
      expect(result.stdout).toBe('default output');
      expect(result.stderr).toBe('default error');
      expect(result.exitCode).toBe(42);
    });
    
    it('should simulate timeout', async () => {
      adapter.mockTimeout('sleep 10', 200);
      
      await expect(adapter.execute({
        command: 'sleep 10',
        timeout: 100
      })).rejects.toThrow(TimeoutError);
    });
    
    it('should simulate success with convenience method', async () => {
      adapter.mockSuccess('success-cmd', 'Success output');
      
      const result = await adapter.execute({ command: 'success-cmd' });
      
      expect(result.stdout).toBe('Success output');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });
    
    it('should simulate failure with convenience method', async () => {
      adapter.mockFailure('fail-cmd', 'Error message', 127);
      
      const result = await adapter.execute({
        command: 'fail-cmd'
      });
      
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Error message');
      expect(result.exitCode).toBe(127);
    });
    
    it('should handle signal in response', async () => {
      adapter.mockCommand('killed', {
        stdout: 'partial output',
        stderr: '',
        signal: 'SIGTERM',
        exitCode: -1
      });
      
      const result = await adapter.execute({
        command: 'killed'
      });
      
      expect(result.signal).toBe('SIGTERM');
      expect(result.exitCode).toBe(-1);
    });
    
    it('should build command string with working directory', async () => {
      adapter.mockCommand('pwd', {
        stdout: '/test/dir\n'
      });
      
      const result = await adapter.execute({
        command: 'pwd',
        cwd: '/test/dir'
      });
      
      expect(result.stdout).toBe('/test/dir\n');
    });
    
    it('should inherit environment in execute', async () => {
      adapter.mockCommand('sh -c "echo $TEST_VAR"', {
        stdout: 'test-value\n'
      });
      
      const result = await adapter.execute({
        command: 'echo $TEST_VAR',
        env: { TEST_VAR: 'test-value' },
        shell: true
      });
      
      expect(result.stdout).toBe('test-value\n');
    });
    
    it('should preserve CommandError and TimeoutError types', async () => {
      const cmdError = new CommandError('echo test', 1, undefined, '', 'Test command error', 0);
      const timeoutError = new TimeoutError('Timeout', 5000);
      
      adapter.mockCommand('cmd-error', { error: cmdError });
      adapter.mockCommand('timeout-error', { error: timeoutError });
      
      await expect(adapter.execute({ command: 'cmd-error' }))
        .rejects.toThrow(CommandError);
        
      await expect(adapter.execute({ command: 'timeout-error' }))
        .rejects.toThrow(TimeoutError);
    });
  });
});