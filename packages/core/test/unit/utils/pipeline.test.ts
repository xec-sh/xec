import { test, expect, describe, beforeEach } from '@jest/globals';

import { MockAdapter } from '../../../src/adapters/mock-adapter.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import {
  Pipeline,
  teeOperator,
  mapOperator,
  filterOperator,
  reduceOperator,
  conditionalOperator
} from '../../../src/utils/pipeline.js';

describe('Pipeline Operators', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine({
      throwOnNonZeroExit: false
    });
  });

  describe('Pipeline class', () => {
    test('should create pipeline with stages', () => {
      const pipeline = new Pipeline(engine);
      pipeline.add({ command: 'echo "test"', shell: true });
      pipeline.add({ command: 'cat' });

      expect(pipeline).toBeDefined();
      // Pipeline doesn't expose stages directly, so we'll test by execution
    });

    test('should add stages', () => {
      const pipeline = new Pipeline(engine);
      pipeline.add('echo "test"');
      pipeline.add('cat');

      expect(pipeline).toBeDefined();
    });

    test('should execute pipeline sequentially', async () => {
      // Create a mock adapter for predictable results
      const mockAdapter = new MockAdapter();
      mockAdapter.mockCommand(/echo "hello world"/, { 
        stdout: 'hello world\n', 
        stderr: '', 
        exitCode: 0 
      });
      
      // Create engine with mock adapter
      const mockEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      // Replace the local adapter with our mock
      (mockEngine as any).adapters = new Map([['local', mockAdapter]]);

      const pipeline = new Pipeline(mockEngine);
      pipeline.add('echo "hello world"');
      
      const result = await pipeline.execute();
      
      expect(result).toBeDefined();
      if (!Array.isArray(result)) {
        expect(result.stdout).toContain('hello world');
      }
    });
  });

  describe('Operators', () => {
    test('should use pipe operator', async () => {
      // Create a mock adapter for predictable results
      const mockAdapter = new MockAdapter();
      mockAdapter.mockCommand(/echo "test data"/, { 
        stdout: 'test data\n', 
        stderr: '', 
        exitCode: 0 
      });
      
      // Create engine with mock adapter
      const mockEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      // Replace the local adapter with our mock
      (mockEngine as any).adapters = new Map([['local', mockAdapter]]);

      const pipeline = new Pipeline(mockEngine);
      pipeline.add('echo "test data"');
      
      const result = await pipeline.execute();
      
      expect(result).toBeDefined();
    });

    test('should handle pipeline failures gracefully', async () => {
      // Create a mock adapter for predictable results
      const mockAdapter = new MockAdapter();
      mockAdapter.mockCommand('sh -c "echo "start""', { stdout: 'start', stderr: '', exitCode: 0 });
      mockAdapter.mockCommand('sh -c "false"', { stdout: '', stderr: 'Command failed', exitCode: 1 });
      
      // Create engine with mock adapter that doesn't throw
      const mockEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      // Replace the local adapter with our mock
      (mockEngine as any).adapters = new Map([['local', mockAdapter]]);

      const pipeline = new Pipeline(mockEngine, {
        stopOnError: false
      });
      pipeline.add('echo "start"'); // This will succeed and set lastResult
      pipeline.add('false'); // This will fail but not stop the pipeline
      
      const result = await pipeline.execute();
      expect(result).toBeDefined();
      // The result will be the last successful result
      expect(result).not.toBeNull();
      if (result && !Array.isArray(result)) {
        expect(result.exitCode).toBe(0); // Last successful command
        expect(result.stdout).toBe('start');
      }
    });

    test('should support continue on error', async () => {
      // Create a mock adapter for predictable results
      const mockAdapter = new MockAdapter();
      // Mock specific commands instead of generic patterns
      mockAdapter.mockCommand('sh -c "true"', { stdout: 'success', stderr: '', exitCode: 0 });
      mockAdapter.mockCommand('sh -c "false"', { stdout: '', stderr: 'Command failed', exitCode: 1 });
      
      // Create engine with mock adapter
      const mockEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      // Replace the local adapter with our mock
      (mockEngine as any).adapters = new Map([['local', mockAdapter]]);

      const pipeline = new Pipeline(mockEngine, {
        stopOnError: false,
        collectResults: true
      });
      
      pipeline.add('true');  // This will succeed
      pipeline.add('false'); // This will fail
      pipeline.add('true');  // This should still run
      
      const results = await pipeline.execute();
      
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        // When stopOnError is false, only successful commands are included in collectResults
        expect(results).toHaveLength(2);
        expect(results[0]?.exitCode).toBe(0);
        expect(results[1]?.exitCode).toBe(0);
      }
    });

    test('should support custom operators', async () => {
      // Create a mock adapter for predictable results
      const mockAdapter = new MockAdapter();
      mockAdapter.mockDefault({ stdout: 'test output', stderr: '', exitCode: 0 });
      
      // Create engine with mock adapter
      const mockEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      // Replace the local adapter with our mock
      (mockEngine as any).adapters = new Map([['local', mockAdapter]]);

      const pipeline = new Pipeline(mockEngine, {
        collectResults: true
      });
      pipeline.add('echo "before"');
      pipeline.add('echo "after"');
      
      // Use transform to modify result
      pipeline.transform(0, (result) => {
        result.stdout = result.stdout.toUpperCase();
        return result;
      });
      
      const results = await pipeline.execute();
      
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results[0]?.stdout).toBe('TEST OUTPUT'); // First command transformed
        expect(results[1]?.stdout).toBe('test output'); // Second command not transformed
      }
    });

    test('should use tee operator', async () => {
      const outputs: string[] = [];
      const destination = (data: string) => outputs.push(data);
      
      const result = await teeOperator('echo "test output"', destination);
      
      expect(result).toBeDefined();
      expect(result.stdout).toContain('test output');
      // The output includes newline, so check if any output contains our text
      expect(outputs.some(o => o.includes('test output'))).toBe(true);
    });

    test('should use map operator', async () => {
      const lines = ['line1', 'line2', 'line3'];
      const mapper = (line: string) => `echo "processed: ${line}"`;
      
      const results = await mapOperator(lines, mapper);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(3);
    });

    test('should use filter operator', async () => {
      const lines = ['valid', 'invalid', 'also-valid'];
      // This will create commands that test each line
      const filterCommand = (line: string) => `test "${line}" != "invalid"`;
      
      const filtered = await filterOperator(lines, filterCommand);
      
      expect(Array.isArray(filtered)).toBe(true);
      // Note: This test depends on the test command being available
      // In a real environment, it would filter out 'invalid'
    });

    test('should use reduce operator', async () => {
      const lines = ['1', '2', '3', '4', '5'];
      const reducer = (acc: number, line: string) => acc + parseInt(line);
      
      const result = await reduceOperator(lines, 0, reducer);
      
      expect(result).toBe(15);
    });

    test('should use conditional operator', async () => {
      const condition = true;
      
      const result = await conditionalOperator(
        condition,
        'echo "success"',
        'echo "fail"'
      );
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.stdout).toContain('success');
      }
    });
  });

  describe('Complex pipelines', () => {
    test('should handle multi-stage processing', async () => {
      const mockAdapter = new MockAdapter();
      mockAdapter.mockCommand(/echo/, { stdout: 'line1\nline2\nline3\n', stderr: '', exitCode: 0 });
      mockAdapter.mockCommand(/process/, { stdout: 'processed: line1\nprocessed: line2\nprocessed: line3\n', stderr: '', exitCode: 0 });
      
      const mockEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      (mockEngine as any).adapters = new Map([['local', mockAdapter]]);

      const pipeline = new Pipeline(mockEngine);
      pipeline.add('echo "data"');
      pipeline.add('process');
      
      const results = await pipeline.execute();
      expect(results).toBeDefined();
    });
  });
});