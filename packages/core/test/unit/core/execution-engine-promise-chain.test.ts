import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { $ } from '../../../src/index.js';
import { CommandError } from '../../../src/core/error.js';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';

describe('ExecutionEngine - Promise Chain Handling', () => {
  let mockAdapter: MockAdapter;
  let $mock: typeof $;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create engine with mock adapter
    const engine = new ExecutionEngine({
      defaultTimeout: 5000,
      throwOnNonZeroExit: true
    });

    mockAdapter = new MockAdapter();
    mockAdapter.clearMocks();
    // Set a better default response for unmocked commands
    mockAdapter.mockDefault({ stdout: '', stderr: '', exitCode: 0 });
    engine.registerAdapter('mock', mockAdapter);

    // Create $ function with mock adapter
    const mockEngine = engine.with({ adapter: 'mock' as any });
    $mock = mockEngine.tag.bind(mockEngine);
  });

  // This second beforeEach was redundant and causing issues by clearing mocks after setup
  // Removed to avoid double-clearing

  describe('.text() method', () => {
    it('should handle command failures without unhandled rejections', async () => {
      mockAdapter.mockFailure(/sh -c "echo test"/, 'Command not found', 127);

      const promise = $mock`echo test`;

      // This should not cause an unhandled rejection
      await expect(promise.text()).rejects.toThrow(CommandError);
    });

    it('should properly chain promises when command succeeds', async () => {
      // Mock the shell-wrapped command
      mockAdapter.mockSuccess(/sh -c "echo test"/, 'test output\n');

      const promise = $mock`echo test`;
      const text = await promise.text();

      expect(text).toBe('test output');
    });

    it('should handle errors in promise chain without detaching', async () => {
      mockAdapter.mockFailure(/sh -c "failing-command"/, 'Command failed', 1);

      const promise = $mock`failing-command`;
      
      // Create the .text() promise but don't await immediately
      const textPromise = promise.text();
      
      // Should reject with CommandError
      await expect(textPromise).rejects.toThrow(CommandError);
      await expect(textPromise).rejects.toThrow('Command failed');
    });

    it('should handle .text() called multiple times', async () => {
      mockAdapter.mockSuccess(/sh -c "echo multi"/, 'multi output\n');

      const promise = $mock`echo multi`;
      
      // Call .text() multiple times
      const text1Promise = promise.text();
      const text2Promise = promise.text();
      
      const [text1, text2] = await Promise.all([text1Promise, text2Promise]);
      
      expect(text1).toBe('multi output');
      expect(text2).toBe('multi output');
    });
  });

  describe('.json() method', () => {
    it('should handle command failures without unhandled rejections', async () => {
      mockAdapter.mockFailure(/echo json/, 'Command not found', 127);

      const promise = $mock`echo json`;
      
      // This should not cause an unhandled rejection
      await expect(promise.json()).rejects.toThrow(CommandError);
    });

    it('should properly parse JSON when command succeeds', async () => {
      // Use regex to match echo with JSON content
      mockAdapter.mockSuccess(/echo.*key.*value/, '{"key": "value"}\n');
      
      const promise = $mock`echo '{"key": "value"}'`;
      const json = await promise.json();
      
      expect(json).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON without unhandled rejections', async () => {
      mockAdapter.mockSuccess(/sh -c "echo invalid"/, 'not json\n');

      const promise = $mock`echo invalid`;
      
      // Should reject with parse error, not unhandled rejection
      await expect(promise.json()).rejects.toThrow('Failed to parse JSON');
    });

    it('should handle errors in promise chain without detaching', async () => {
      mockAdapter.mockFailure(/sh -c "failing-json"/, 'Command failed', 1);

      const promise = $mock`failing-json`;
      
      // Create the .json() promise but don't await immediately
      const jsonPromise = promise.json();
      
      // Should reject with CommandError
      await expect(jsonPromise).rejects.toThrow(CommandError);
      await expect(jsonPromise).rejects.toThrow('Command failed');
    });

    it('should handle .json() called multiple times', async () => {
      // Use regex to match echo with JSON content
      mockAdapter.mockSuccess(/sh -c "echo.*count.*42.*"/, '{"count": 42}\n');

      const promise = $mock`echo '{"count": 42}'`;
      
      // Call .json() multiple times
      const json1Promise = promise.json();
      const json2Promise = promise.json();
      
      const [json1, json2] = await Promise.all([json1Promise, json2Promise]);
      
      expect(json1).toEqual({ count: 42 });
      expect(json2).toEqual({ count: 42 });
    });

    it('should handle JSON parse errors in chained promises', async () => {
      mockAdapter.mockSuccess(/sh -c "echo bad"/, 'invalid { json\n');

      const promise = $mock`echo bad`;
      
      // Create multiple .json() promises
      const json1Promise = promise.json();
      const json2Promise = promise.json();
      
      // Both should reject with parse error
      await expect(json1Promise).rejects.toThrow('Failed to parse JSON');
      await expect(json2Promise).rejects.toThrow('Failed to parse JSON');
    });
  });

  describe('Promise chain isolation', () => {
    it('should not affect base promise when .text() fails', async () => {
      mockAdapter.mockFailure(/sh -c "test"/, 'Failed', 1);

      const promise = $mock`test`;
      
      // Create .text() promise that will reject
      const textPromise = promise.text();
      
      // Base promise should also reject
      await expect(promise).rejects.toThrow(CommandError);
      await expect(textPromise).rejects.toThrow(CommandError);
    });

    it('should not affect base promise when .json() fails', async () => {
      mockAdapter.mockFailure(/sh -c "test"/, 'Failed', 1);

      const promise = $mock`test`;
      
      // Create .json() promise that will reject
      const jsonPromise = promise.json();
      
      // Base promise should also reject
      await expect(promise).rejects.toThrow(CommandError);
      await expect(jsonPromise).rejects.toThrow(CommandError);
    });

    it('should handle mixed .text() and .json() calls', async () => {
      mockAdapter.mockSuccess(/sh -c "echo data"/, '{"valid": "json"}\n');

      const promise = $mock`echo data`;
      
      // Call both methods
      const textPromise = promise.text();
      const jsonPromise = promise.json();
      
      const text = await textPromise;
      const json = await jsonPromise;
      
      expect(text).toBe('{"valid": "json"}');
      expect(json).toEqual({ valid: 'json' });
    });
  });

  describe('Error handling with try/catch', () => {
    it('should catch errors from .text() in try/catch blocks', async () => {
      mockAdapter.mockFailure(/sh -c "fail"/, 'Command failed', 127);

      let caught = false;
      try {
        const promise = $mock`fail`;
        await promise.text();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(CommandError);
      }
      
      expect(caught).toBe(true);
    });

    it('should catch errors from .json() in try/catch blocks', async () => {
      mockAdapter.mockFailure(/sh -c "fail"/, 'Command failed', 127);

      let caught = false;
      try {
        const promise = $mock`fail`;
        await promise.json();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(CommandError);
      }
      
      expect(caught).toBe(true);
    });

    it('should catch JSON parse errors in try/catch blocks', async () => {
      mockAdapter.mockSuccess(/sh -c "echo bad"/, 'not json\n');

      let caught = false;
      try {
        const promise = $mock`echo bad`;
        await promise.json();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to parse JSON');
      }
      
      expect(caught).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle tool version check pattern safely', async () => {
      // Simulate tools that exist and don't exist
      mockAdapter.mockSuccess(/sh -c "git --version"/, 'git version 2.40.0\n');
      mockAdapter.mockFailure(/sh -c "go version"/, 'go: command not found', 127);
      mockAdapter.mockSuccess(/sh -c "node --version"/, 'v20.11.0\n');
      
      const tools = [
        { name: 'git', cmd: 'git --version' },
        { name: 'go', cmd: 'go version' },
        { name: 'node', cmd: 'node --version' }
      ];
      
      const results: Record<string, string | null> = {};
      
      for (const tool of tools) {
        try {
          // Using template literals with mock adapter
          const promise = $mock`${tool.cmd}`;
          results[tool.name] = await promise.text();
        } catch {
          results[tool.name] = null;
        }
      }
      
      expect(results['git']).toBe('git version 2.40.0');
      expect(results['go']).toBeNull();
      expect(results['node']).toBe('v20.11.0');
    });

    it('should handle parallel tool checks without unhandled rejections', async () => {
      // Mix of success and failure
      mockAdapter.mockSuccess(/npm --version/, '10.2.4\n');
      mockAdapter.mockFailure(/cargo --version/, 'cargo: command not found', 127);
      mockAdapter.mockSuccess(/python --version/, 'Python 3.11.0\n');
      
      const checks = [
        $mock`npm --version`.text().catch(() => null),
        $mock`cargo --version`.text().catch(() => null),
        $mock`python --version`.text().catch(() => null)
      ];
      
      const results = await Promise.all(checks);
      
      expect(results[0]).toBe('10.2.4');
      expect(results[1]).toBeNull();
      expect(results[2]).toBe('Python 3.11.0');
    });
  });
});