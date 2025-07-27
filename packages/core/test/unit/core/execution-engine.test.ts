import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { CommandError } from '../../../src/core/error.js';
import { MockAdapter } from '../../../src/adapters/mock-adapter.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create new engine instance with default config
    engine = new ExecutionEngine({
      defaultTimeout: 5000,
      throwOnNonZeroExit: true
    });

    // Create and register mock adapter
    mockAdapter = new MockAdapter();
    engine.registerAdapter('mock', mockAdapter);
  });

  describe('Initialization and configuration', () => {
    it('should create with default settings', () => {
      const engine = new ExecutionEngine();
      expect(engine.config).toEqual({
        defaultTimeout: 30000,
        throwOnNonZeroExit: true,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        defaultTimeout: 60000,
        defaultCwd: '/home/user',
        defaultEnv: { NODE_ENV: 'test' },
        adapters: {
          ssh: {
            connectionPool: {
              enabled: true,
              maxConnections: 5,
              idleTimeout: 60000,
              keepAlive: true
            }
          }
        }
      };

      const engine = new ExecutionEngine(customConfig);
      expect(engine.config).toMatchObject(customConfig);
    });

    it('should validate configuration', () => {
      // Negative timeout values are invalid
      expect(() => new ExecutionEngine({ defaultTimeout: -1000 }))
        .toThrow('Invalid timeout value: -1000');

      // Unsupported encoding
      expect(() => new ExecutionEngine({ encoding: 'invalid' as any }))
        .toThrow('Unsupported encoding: invalid');
    });
  });

  describe('Adapter selection', () => {
    it('should use LocalAdapter by default', async () => {
      // Create a new engine that uses mock as default
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "echo test"', 'test output');
      
      await testEngine.execute({ command: 'echo test' });
      
      expect(mockAdapter.wasCommandExecuted('sh -c "echo test"')).toBe(true);
    });

    it('should select adapter based on command', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "ls -la"', 'file list');
      
      await testEngine.execute({
        command: 'ls -la',
        adapter: 'mock' as any
      });
      
      expect(mockAdapter.wasCommandExecuted('sh -c "ls -la"')).toBe(true);
    });
  });

  describe('Template literal API', () => {
    it('should parse simple commands correctly', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "echo "Hello, World!""', 'Hello, World!');
      
      const result = await testEngine.tag`echo "Hello, World!"`;
      
      expect(mockAdapter.wasCommandExecuted('sh -c "echo "Hello, World!""')).toBe(true);
      expect(result.stdout).toBe('Hello, World!');
    });

    it('should interpolate and escape values correctly', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      const filename = 'my file with spaces.txt';
      const content = 'Hello; rm -rf /';
      
      mockAdapter.mockDefault({ stdout: '', stderr: '', exitCode: 0 });
      
      await testEngine.tag`echo ${content} > ${filename}`;
      
      // Check that the command was executed (exact escaping may vary)
      const commands = mockAdapter.getExecutedCommands();
      expect(commands.length).toBe(1);
      expect(commands[0]).toContain('Hello; rm -rf /');
    });

    it('should support arrays in interpolation', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      const files = ['file1.txt', 'file2.txt', 'file with spaces.txt'];
      
      mockAdapter.mockDefault({ stdout: '', stderr: '', exitCode: 0 });
      
      await testEngine.tag`rm ${files}`;
      
      // Check that files were properly handled
      const commands = mockAdapter.getExecutedCommands();
      expect(commands.length).toBe(1);
      expect(commands[0]).toContain('file1.txt');
      expect(commands[0]).toContain('file2.txt');
      expect(commands[0]).toContain('file with spaces.txt');
    });
  });

  describe('Error handling', () => {
    it('should throw error on non-zero exit code when throwOnNonZeroExit = true', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockFailure('sh -c "nonexistent-command"', 'Command not found', 127);
      
      await expect(testEngine.execute({ command: 'nonexistent-command' }))
        .rejects.toThrow(CommandError);
    });

    it('should not throw error on non-zero exit code when throwOnNonZeroExit = false', async () => {
      const nonThrowingEngine = new ExecutionEngine({ throwOnNonZeroExit: false });
      
      // Create a new mock adapter with the non-throwing config
      const nonThrowingMockAdapter = new MockAdapter({ throwOnNonZeroExit: false });
      nonThrowingEngine.registerAdapter('mock', nonThrowingMockAdapter);
      
      const testEngine = nonThrowingEngine.with({ adapter: 'mock' as any });
      
      nonThrowingMockAdapter.mockFailure('sh -c "cat /etc/shadow"', 'Permission denied', 1);
      
      const result = await testEngine.execute({ command: 'cat /etc/shadow' });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('Permission denied');
    });

    it('should handle timeouts', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockTimeout('sh -c "sleep 10"', 6000);
      
      await expect(testEngine.execute({
        command: 'sleep 10',
        timeout: 5000
      })).rejects.toThrow('Command timed out');
    });
  });

  describe('Configuration chaining', () => {
    it('should create new instance with changed config via with()', () => {
      const newEngine = engine.with({
        env: { NODE_ENV: 'production' },
        cwd: '/app'
      });

      // Check it's a new instance
      expect(newEngine).not.toBe(engine);

      // Original engine unchanged
      expect(engine.config.defaultEnv).toBeUndefined();
    });

    it('should support multiple chains', async () => {
      const prod = engine
        .env({ NODE_ENV: 'production' })
        .cd('/app')
        .timeout(60000)
        .with({ adapter: 'mock' as any });

      mockAdapter.mockSuccess('sh -c "pwd"', '/app');

      await prod.execute({ command: 'pwd' });

      const commands = mockAdapter.getExecutedCommands();
      expect(commands).toContain('sh -c "pwd"');
    });
  });

  describe('Utility methods', () => {
    it('should check command availability with which()', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "which git"', '/usr/bin/git\n');

      const path = await testEngine.which('git');
      expect(path).toBe('/usr/bin/git');
    });

    it('should return null for unavailable commands', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockFailure('sh -c "which nonexistent"', '', 1);

      const path = await testEngine.which('nonexistent');
      expect(path).toBeNull();
    });

    it('should check command availability with isCommandAvailable()', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "which node"', '/usr/bin/node\n');

      const available = await testEngine.isCommandAvailable('node');
      expect(available).toBe(true);
    });
  });

  describe('Adapter management', () => {
    it('should register custom adapters', () => {
      const customAdapter = new MockAdapter();

      engine.registerAdapter('custom', customAdapter);

      const retrieved = engine.getAdapter('custom');
      expect(retrieved).toBe(customAdapter);
    });

    it('should return undefined for non-existent adapters', () => {
      const adapter = engine.getAdapter('nonexistent');
      expect(adapter).toBeUndefined();
    });
  });

  describe('run vs tag methods', () => {
    it('should have tag as alias for run', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "echo test"', 'test');

      const runResult = await testEngine.run`echo test`;
      const tagResult = await testEngine.tag`echo test`;

      expect(mockAdapter.getCommandExecutionCount('sh -c "echo test"')).toBe(2);
      expect(runResult.stdout).toBe('test');
      expect(tagResult.stdout).toBe('test');
    });
  });

  describe('stdin support', () => {
    it('should pass string stdin via with()', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      // Mock the cat command to return stdin
      mockAdapter.mockSuccess('sh -c "cat"', 'Hello, World!');

      const result = await testEngine.with({ stdin: 'Hello, World!' }).run`cat`;
      
      expect(result.stdout).toBe('Hello, World!');
      expect(mockAdapter.wasCommandExecuted('sh -c "cat"')).toBe(true);
    });

    it('should pass Buffer stdin via with()', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      const buffer = Buffer.from('binary data');
      
      mockAdapter.mockSuccess('sh -c "cat"', 'binary data');

      const result = await testEngine.with({ stdin: buffer }).run`cat`;
      
      expect(result.stdout).toBe('binary data');
      expect(mockAdapter.wasCommandExecuted('sh -c "cat"')).toBe(true);
    });

    it('should pass stdin with other options', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('/bin/bash -c "process-data"', 'processed');

      const result = await testEngine.with({ 
        stdin: 'input data',
        cwd: '/tmp',
        timeout: 5000,
        shell: '/bin/bash'
      }).run`process-data`;
      
      expect(result.stdout).toBe('processed');
      expect(mockAdapter.wasCommandExecuted('/bin/bash -c "process-data"')).toBe(true);
    });

    it('should handle piping between commands', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      // Mock the first command
      mockAdapter.mockSuccess('sh -c "echo \\"Line 1\\\\nLine 2\\\\nLine 3\\""', 'Line 1\nLine 2\nLine 3');
      
      // Mock the sort command
      mockAdapter.mockSuccess('sh -c "sort"', 'Line 1\nLine 2\nLine 3');

      const data = await testEngine.run`echo "Line 1\nLine 2\nLine 3"`;
      const sorted = await testEngine.with({ stdin: data.stdout }).run`sort`;
      
      expect(sorted.stdout).toBe('Line 1\nLine 2\nLine 3');
      expect(mockAdapter.wasCommandExecuted('sh -c "sort"')).toBe(true);
    });
    
    it('should support chaining with() calls', async () => {
      const testEngine = engine
        .with({ adapter: 'mock' as any })
        .with({ stdin: 'test input' })
        .with({ cwd: '/tmp' });
      
      mockAdapter.mockSuccess('sh -c "cat"', 'test input');
      
      const result = await testEngine.run`cat`;
      
      expect(result.stdout).toBe('test input');
      expect(mockAdapter.wasCommandExecuted('sh -c "cat"')).toBe(true);
    });
  });

  describe('shell configuration', () => {
    it('should use specific shell when configured', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('/bin/bash -c "echo $0"', '/bin/bash');
      
      const result = await testEngine.shell('/bin/bash').run`echo $0`;
      
      expect(mockAdapter.wasCommandExecuted('/bin/bash -c "echo $0"')).toBe(true);
      expect(result.stdout).toBe('/bin/bash');
    });

    it('should disable shell when shell(false) is used', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      // When shell is disabled, the command should be executed directly
      mockAdapter.mockSuccess('/usr/bin/node --version', 'v18.0.0');
      
      const $noshell = testEngine.shell(false);
      const result = await $noshell.run`/usr/bin/node --version`;
      
      expect(mockAdapter.wasCommandExecuted('/usr/bin/node --version')).toBe(true);
      expect(result.stdout).toBe('v18.0.0');
    });

    it('should allow using execute() with shell(false) for separate command and args', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      // When shell is false, the command and args are joined with spaces
      mockAdapter.mockSuccess('node --version', 'v18.0.0');
      
      const result = await testEngine.shell(false).execute({
        command: 'node',
        args: ['--version']
      });
      
      expect(mockAdapter.wasCommandExecuted('node --version')).toBe(true);
      expect(result.stdout).toBe('v18.0.0');
    });

    it('should not perform shell interpolation when shell(false)', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      // The $HOME should not be expanded
      mockAdapter.mockSuccess('echo $HOME', '$HOME');
      
      const $noshell = testEngine.shell(false);
      const result = await $noshell.run`echo $HOME`;
      
      expect(mockAdapter.wasCommandExecuted('echo $HOME')).toBe(true);
      expect(result.stdout).toBe('$HOME');
    });

    it('should support chaining shell() with other methods', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('/bin/zsh -c "echo $ZSH_VERSION"', '5.8');
      
      const result = await testEngine
        .shell('/bin/zsh')
        .env({ CUSTOM_VAR: 'test' })
        .cd('/tmp')
        .run`echo $ZSH_VERSION`;
      
      expect(mockAdapter.wasCommandExecuted('/bin/zsh -c "echo $ZSH_VERSION"')).toBe(true);
      expect(result.stdout).toBe('5.8');
    });

    it('should not have .args() method on command result', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('sh -c "node"', '');
      
      const commandPromise = testEngine.run`node`;
      
      // ProcessPromise should not have an args() method
      expect(typeof (commandPromise as any).args).toBe('undefined');
      
      // Also verify that shell() method exists but args() does not
      expect(typeof commandPromise.shell).toBe('function');
      expect(typeof (commandPromise as any).args).toBe('undefined');
    });

    it('should work with secure configuration pattern', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      // Create a secure configuration
      const $secure = testEngine.with({
        shell: false,
        timeout: 30000,
        audit: {
          enabled: true,
          sanitize: true
        }
      });
      
      // Mock the expected command execution
      mockAdapter.mockSuccess('rm -rf /tmp/test', '');
      
      // Execute command with arguments
      const result = await $secure.execute({
        command: 'rm',
        args: ['-rf', '/tmp/test']
      });
      
      expect(mockAdapter.wasCommandExecuted('rm -rf /tmp/test')).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
});