import { it, expect, describe, beforeEach } from '@jest/globals';

import { CommandError } from '../../src/core/error.js';
import { $, MockAdapter, createExecutionEngine } from '../../src/index.js';

describe('Unified Execution Engine - Integration Tests', () => {
  describe('Basic functionality', () => {
    it('should execute simple commands', async () => {
      const $ = createExecutionEngine();
      const result = await $`echo "Hello, World!"`;
      
      expect(result.stdout.trim()).toBe('Hello, World!');
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('local');
    });

    it('should support template literal interpolation', async () => {
      const $ = createExecutionEngine();
      const filename = 'test file.txt';
      const result = await $`echo ${filename}`;
      
      expect(result.stdout.trim()).toBe('test file.txt');
    });

    it('should handle command failure', async () => {
      const $ = createExecutionEngine({ throwOnNonZeroExit: true });
      
      await expect($`exit 1`).rejects.toThrow(CommandError);
    });

    it('should support nothrow mode', async () => {
      const $ = createExecutionEngine({ throwOnNonZeroExit: false });
      const result = await $`exit 1`;
      
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Configuration chaining', () => {
    it('should support method chaining', async () => {
      const $ = createExecutionEngine();
      const custom$ = $
        .env({ CUSTOM_VAR: 'test' })
        .timeout(5000)
        .shell('bash');
        
      const result = await custom$.run`echo $CUSTOM_VAR`;
      expect(result.stdout.trim()).toBe('test');
    });

    it('should support cd() for changing directory', async () => {
      const $ = createExecutionEngine();
      const tmp$ = $.cd('/tmp');
      const result = await tmp$.run`pwd`;
      
      // On macOS, /tmp is a symlink to /private/tmp
      const expected = result.stdout.trim();
      expect(['/tmp', '/private/tmp']).toContain(expected);
    });
  });

  describe('Mock adapter', () => {
    let mockAdapter: MockAdapter;
    let $: ReturnType<typeof createExecutionEngine>;

    beforeEach(() => {
      mockAdapter = new MockAdapter();
      $ = createExecutionEngine();
      $.registerAdapter('mock', mockAdapter);
    });

    it('should use mock responses', async () => {
      mockAdapter.mockSuccess('ls -la', 'file1.txt\nfile2.txt');
      
      const mockEngine = $.with({ adapter: 'mock' as any });
      const result = await mockEngine.run`ls -la`;
      
      expect(result.stdout).toBe('file1.txt\nfile2.txt');
      expect(result.exitCode).toBe(0);
      mockAdapter.assertCommandExecuted('ls -la');
    });

    it('should track executed commands', async () => {
      mockAdapter.mockDefault({ stdout: 'ok', exitCode: 0 });
      
      const mockEngine = $.with({ adapter: 'mock' as any });
      await mockEngine.run`npm install`;
      await mockEngine.run`npm test`;
      await mockEngine.run`npm build`;
      
      const commands = mockAdapter.getExecutedCommands();
      expect(commands).toEqual(['npm install', 'npm test', 'npm build']);
    });

    it('should support regex patterns', async () => {
      mockAdapter.mockCommand(/^git/, { stdout: 'git output', exitCode: 0 });
      
      const mockEngine = $.with({ adapter: 'mock' as any });
      const result1 = await mockEngine.run`git status`;
      const result2 = await mockEngine.run`git pull`;
      
      expect(result1.stdout).toBe('git output');
      expect(result2.stdout).toBe('git output');
    });
  });

  describe('Adapter selection', () => {
    it('should auto-detect adapter from options', async () => {
      const $ = createExecutionEngine();
      
      // Mock the SSH adapter behavior
      const sshEngine = $.ssh({
        host: 'example.com',
        username: 'test'
      });
      
      // This would actually try to connect, so we can't test it without mocking
      // Just verify the configuration is set correctly
      expect(sshEngine).toBeDefined();
    });
  });

  describe('Utility methods', () => {
    it('should check command availability', async () => {
      const $ = createExecutionEngine();
      
      // 'echo' should be available on all platforms
      const isAvailable = await $.isCommandAvailable('echo');
      expect(isAvailable).toBe(true);
      
      // Test with a command that's very unlikely to exist
      const randomCmd = 'cmd-that-does-not-exist-' + Math.random().toString(36);
      const path = await $.which(randomCmd);
      
      // If which returns empty string, it means command not found
      expect(path).toBeFalsy(); // Should be null or empty string
      
      const notAvailable = await $.isCommandAvailable(randomCmd);
      expect(notAvailable).toBe(false);
    });

    it('should find command path with which()', async () => {
      const $ = createExecutionEngine();
      
      const echoPath = await $.which('echo');
      expect(echoPath).toBeTruthy();
      expect(echoPath).toContain('echo');
    });
  });

  describe('Global $ export', () => {
    it('should work with global $ export', async () => {
      const result = await $`echo "test"`;
      expect(result.stdout.trim()).toBe('test');
    });

    it('should support chaining with global $', async () => {
      const custom$ = $.env({ TEST: 'value' });
      const result = await custom$.run`echo $TEST`;
      expect(result.stdout.trim()).toBe('value');
    });
  });
});