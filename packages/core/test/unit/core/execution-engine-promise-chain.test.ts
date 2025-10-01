import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { CommandError } from '../../../src/core/error.js';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';

describe('ExecutionEngine - Promise Chain Handling', () => {
  // Helper function to create isolated test setup
  function createTestSetup() {
    const engine = new ExecutionEngine({
      defaultTimeout: 5000,
      throwOnNonZeroExit: true
    });
    const mockAdapter = new MockAdapter();
    mockAdapter.mockDefault({ stdout: '', stderr: '', exitCode: 0 });
    engine.registerAdapter('mock', mockAdapter);
    const mockEngine = engine.with({ adapter: 'mock' as any });
    // Create a proper tagged template function
    const $mock = (strings: TemplateStringsArray, ...values: any[]) => mockEngine.tag(strings, ...values);
    return { engine, mockAdapter, $mock };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Force garbage collection of any pending promises
    if (global.gc) {
      global.gc();
    }
    // Return a promise to ensure Jest waits
    return new Promise(resolve => setTimeout(resolve, 0));
  });

  // This second beforeEach was redundant and causing issues by clearing mocks after setup
  // Removed to avoid double-clearing

  describe('.text() method', () => {
    it('should handle command failures without unhandled rejections', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockFailure(/sh -c "echo failing"/, 'Command not found', 127);

      const promise = $mock`echo failing`;

      // This should not cause an unhandled rejection
      try {
        await promise.text();
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        expect((error as CommandError).exitCode).toBe(127);
      }
    });

    it('should properly chain promises when command succeeds', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockSuccess(/sh -c "echo success-test"/, 'test output\n');

      const promise = $mock`echo success-test`;
      const text = await promise.text();

      expect(text).toBe('test output');
    });

    it('should handle errors in promise chain without detaching', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockFailure(/sh -c "failing-command"/, 'Command failed', 1);

      const promise = $mock`failing-command`;

      // Create the .text() promise but don't await immediately
      const textPromise = promise.text();

      // Should reject with CommandError
      try {
        await textPromise;
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        expect((error as Error).message).toContain('Command failed');
      }
    });

    it('should handle .text() called multiple times', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockSuccess(/sh -c "echo multi-text"/, 'multi output\n');

      const promise = $mock`echo multi-text`;
      
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
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockFailure(/echo json/, 'Command not found', 127);

      const promise = $mock`echo json`;

      // This should not cause an unhandled rejection
      try {
        await promise.json();
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        expect((error as CommandError).exitCode).toBe(127);
      }
    });

    it('should properly parse JSON when command succeeds', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      // Use regex to match echo with JSON content
      mockAdapter.mockSuccess(/sh -c "echo json-success"/, '{"key": "value"}\n');
      
      const promise = $mock`echo json-success`;
      const json = await promise.json();
      
      expect(json).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON without unhandled rejections', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockSuccess(/sh -c "echo invalid"/, 'not json\n');

      const promise = $mock`echo invalid`;
      
      // Should reject with parse error, not unhandled rejection
      await expect(promise.json()).rejects.toThrow('Failed to parse JSON');
    });

    it('should handle errors in promise chain without detaching', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockFailure(/sh -c "failing-json"/, 'Command failed', 1);

      const promise = $mock`failing-json`;

      // Create the .json() promise but don't await immediately
      const jsonPromise = promise.json();

      // Should reject with CommandError
      try {
        await jsonPromise;
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        expect((error as Error).message).toContain('Command failed');
      }
    });

    it('should handle .json() called multiple times', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      // Use regex to match echo with JSON content
      mockAdapter.mockSuccess(/sh -c "echo json-multi"/, '{"count": 42}\n');

      const promise = $mock`echo json-multi`;
      
      // Call .json() multiple times
      const json1Promise = promise.json();
      const json2Promise = promise.json();
      
      const [json1, json2] = await Promise.all([json1Promise, json2Promise]);
      
      expect(json1).toEqual({ count: 42 });
      expect(json2).toEqual({ count: 42 });
    });

    it('should handle JSON parse errors in chained promises', async () => {
      const { mockAdapter, $mock } = createTestSetup();
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
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockFailure(/sh -c "test-text-fail"/, 'Failed', 1);

      const promise = $mock`test-text-fail`;

      // Create .text() promise that will reject
      const textPromise = promise.text();

      // Base promise should also reject
      try {
        await promise;
        throw new Error('Base promise should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
      }

      try {
        await textPromise;
        throw new Error('Text promise should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
      }
    });

    it('should not affect base promise when .json() fails', async () => {
      const { mockAdapter, $mock } = createTestSetup();
      mockAdapter.mockFailure(/sh -c "test-json-fail"/, 'Failed', 1);

      const promise = $mock`test-json-fail`;

      // Create .json() promise that will reject
      const jsonPromise = promise.json();

      // Base promise should also reject
      try {
        await promise;
        throw new Error('Base promise should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
      }

      try {
        await jsonPromise;
        throw new Error('JSON promise should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
      }
    });

    it('should handle mixed .text() and .json() calls', async () => {
      const { mockAdapter, $mock } = createTestSetup();
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
      const { mockAdapter, $mock } = createTestSetup();
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
      const { mockAdapter, $mock } = createTestSetup();
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
      const { mockAdapter, $mock } = createTestSetup();
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
      const { mockAdapter, $mock } = createTestSetup();
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
      const { mockAdapter, $mock } = createTestSetup();
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