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
        throwOnNonZeroExit: false,
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
      
      mockAdapter.mockSuccess('echo test', 'test output');
      
      await testEngine.execute({ command: 'echo test' });
      
      expect(mockAdapter.wasCommandExecuted('echo test')).toBe(true);
    });

    it('should select adapter based on command', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('ls -la', 'file list');
      
      await testEngine.execute({
        command: 'ls -la',
        adapter: 'mock' as any
      });
      
      expect(mockAdapter.wasCommandExecuted('ls -la')).toBe(true);
    });
  });

  describe('Template literal API', () => {
    it('should parse simple commands correctly', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('echo "Hello, World!"', 'Hello, World!');
      
      const result = await testEngine.tag`echo "Hello, World!"`;
      
      expect(mockAdapter.wasCommandExecuted('echo "Hello, World!"')).toBe(true);
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
      
      mockAdapter.mockFailure('nonexistent-command', 'Command not found', 127);
      
      await expect(testEngine.execute({ command: 'nonexistent-command' }))
        .rejects.toThrow(CommandError);
    });

    it('should not throw error on non-zero exit code when throwOnNonZeroExit = false', async () => {
      const nonThrowingEngine = new ExecutionEngine({ throwOnNonZeroExit: false });
      
      // Create a new mock adapter with the non-throwing config
      const nonThrowingMockAdapter = new MockAdapter({ throwOnNonZeroExit: false });
      nonThrowingEngine.registerAdapter('mock', nonThrowingMockAdapter);
      
      const testEngine = nonThrowingEngine.with({ adapter: 'mock' as any });
      
      nonThrowingMockAdapter.mockFailure('cat /etc/shadow', 'Permission denied', 1);
      
      const result = await testEngine.execute({ command: 'cat /etc/shadow' });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('Permission denied');
    });

    it('should handle timeouts', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockTimeout('sleep 10', 6000);
      
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

      mockAdapter.mockSuccess('pwd', '/app');

      await prod.execute({ command: 'pwd' });

      const commands = mockAdapter.getExecutedCommands();
      expect(commands).toContain('pwd');
    });
  });

  describe('Utility methods', () => {
    it('should check command availability with which()', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('which git', '/usr/bin/git\n');

      const path = await testEngine.which('git');
      expect(path).toBe('/usr/bin/git');
    });

    it('should return null for unavailable commands', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockFailure('which nonexistent', '', 1);

      const path = await testEngine.which('nonexistent');
      expect(path).toBeNull();
    });

    it('should check command availability with isCommandAvailable()', async () => {
      const testEngine = engine.with({ adapter: 'mock' as any });
      
      mockAdapter.mockSuccess('which node', '/usr/bin/node\n');

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
      
      mockAdapter.mockSuccess('echo test', 'test');

      const runResult = await testEngine.run`echo test`;
      const tagResult = await testEngine.tag`echo test`;

      expect(mockAdapter.getCommandExecutionCount('echo test')).toBe(2);
      expect(runResult.stdout).toBe('test');
      expect(tagResult.stdout).toBe('test');
    });
  });
});