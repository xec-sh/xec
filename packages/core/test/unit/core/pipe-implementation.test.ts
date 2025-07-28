import { Writable, Transform } from 'node:stream';
import { test, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionResultImpl } from '../../../src/core/result.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { pipeUtils, executePipe } from '../../../src/core/pipe-implementation.js';


describe('Pipe Implementation', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine({
      throwOnNonZeroExit: false
    });
  });

  describe('executePipe', () => {
    test('should pipe to string command', async () => {
      const sourceResult = new ExecutionResultImpl(
        'hello world\n',
        '',
        0,
        undefined,
        'echo "hello world"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        'cat',
        engine
      );

      expect(result.stdout).toBe('hello world\n');
      expect(result.exitCode).toBe(0);
    });

    test('should pipe to command object', async () => {
      const sourceResult = new ExecutionResultImpl(
        'test data',
        '',
        0,
        undefined,
        'echo "test data"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        { command: 'cat', shell: true },
        engine
      );

      expect(result.stdout).toBe('test data');
      expect(result.exitCode).toBe(0);
    });

    test('should pipe to template literal', async () => {
      const sourceResult = new ExecutionResultImpl(
        'hello world',
        '',
        0,
        undefined,
        'echo "hello world"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const template = Object.assign(['tr a-z A-Z'], { raw: ['tr a-z A-Z'] }) as TemplateStringsArray;
      
      const result = await executePipe(
        Promise.resolve(sourceResult),
        template,
        engine
      );

      expect(result.stdout.trim()).toBe('HELLO WORLD');
      expect(result.exitCode).toBe(0);
    });

    test('should pipe to Transform stream', async () => {
      const sourceResult = new ExecutionResultImpl(
        'hello world',
        '',
        0,
        undefined,
        'echo "hello world"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const upperCaseTransform = new Transform({
        transform(chunk, encoding, callback) {
          callback(null, chunk.toString().toUpperCase());
        }
      });

      const result = await executePipe(
        Promise.resolve(sourceResult),
        upperCaseTransform,
        engine
      );

      expect(result.stdout).toBe('HELLO WORLD');
      expect(result.exitCode).toBe(0);
    });

    test('should pipe to Writable stream', async () => {
      const sourceResult = new ExecutionResultImpl(
        'test data',
        '',
        0,
        undefined,
        'echo "test data"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      let writtenData = '';
      const writableStream = new Writable({
        write(chunk, encoding, callback) {
          writtenData += chunk.toString();
          callback();
        }
      });

      const result = await executePipe(
        Promise.resolve(sourceResult),
        writableStream,
        engine
      );

      expect(writtenData).toBe('test data');
      expect(result).toEqual(sourceResult);
    });

    test('should pipe to line processor function', async () => {
      const sourceResult = new ExecutionResultImpl(
        'line1\nline2\nline3',
        '',
        0,
        undefined,
        'echo "lines"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const processedLines: string[] = [];
      const lineProcessor = (line: string) => {
        processedLines.push(line);
      };

      const result = await executePipe(
        Promise.resolve(sourceResult),
        lineProcessor,
        engine,
        { lineByLine: true }
      );

      expect(processedLines).toEqual(['line1', 'line2', 'line3']);
      expect(result).toEqual(sourceResult);
    });

    test('should handle custom line separator', async () => {
      const sourceResult = new ExecutionResultImpl(
        'item1;item2;item3',
        '',
        0,
        undefined,
        'echo "items"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const processedItems: string[] = [];
      const itemProcessor = (item: string) => {
        processedItems.push(item);
      };

      const result = await executePipe(
        Promise.resolve(sourceResult),
        itemProcessor,
        engine,
        { lineByLine: true, lineSeparator: ';' }
      );

      expect(processedItems).toEqual(['item1', 'item2', 'item3']);
    });

    test('should throw on error when throwOnError is true', async () => {
      const sourceResult = new ExecutionResultImpl(
        '',
        'error',
        1,
        undefined,
        'false',
        100,
        new Date(),
        new Date(),
        'local'
      );

      await expect(
        executePipe(
          Promise.resolve(sourceResult),
          'cat',
          engine,
          { throwOnError: true }
        )
      ).rejects.toThrow('Previous command failed with exit code 1');
    });

    test('should not throw on error when throwOnError is false', async () => {
      const sourceResult = new ExecutionResultImpl(
        '',
        'error',
        1,
        undefined,
        'false',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        'echo "recovered"',
        engine,
        { throwOnError: false }
      );

      expect(result.stdout.trim()).toBe('recovered');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('pipeUtils', () => {
    test('should create uppercase transform', async () => {
      const transform = pipeUtils.toUpperCase();
      const sourceResult = new ExecutionResultImpl(
        'hello world',
        '',
        0,
        undefined,
        'echo',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        transform,
        engine
      );

      expect(result.stdout).toBe('HELLO WORLD');
    });

    test('should create grep transform', async () => {
      const transform = pipeUtils.grep('world');
      const sourceResult = new ExecutionResultImpl(
        'hello world\ngoodbye moon\nworld peace',
        '',
        0,
        undefined,
        'echo',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        transform,
        engine
      );

      expect(result.stdout.trim()).toBe('hello world\nworld peace');
    });

    test('should create grep transform with regex', async () => {
      const transform = pipeUtils.grep(/^world/);
      const sourceResult = new ExecutionResultImpl(
        'hello world\nworld peace\ngoodbye world',
        '',
        0,
        undefined,
        'echo',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        transform,
        engine
      );

      expect(result.stdout.trim()).toBe('world peace');
    });

    test('should create replace transform', async () => {
      const transform = pipeUtils.replace('world', 'universe');
      const sourceResult = new ExecutionResultImpl(
        'hello world',
        '',
        0,
        undefined,
        'echo',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        transform,
        engine
      );

      expect(result.stdout).toBe('hello universe');
    });

    test('should create replace transform with regex', async () => {
      const transform = pipeUtils.replace(/w\w+d/g, 'REPLACED');
      const sourceResult = new ExecutionResultImpl(
        'hello world and weird things',
        '',
        0,
        undefined,
        'echo',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        transform,
        engine
      );

      expect(result.stdout).toBe('hello REPLACED and REPLACED things');
    });

    test('should create tee transform', async () => {
      const outputs: string[] = [];
      const dest1 = new Writable({
        write(chunk, encoding, callback) {
          outputs.push(`dest1: ${chunk.toString()}`);
          callback();
        }
      });
      const dest2 = new Writable({
        write(chunk, encoding, callback) {
          outputs.push(`dest2: ${chunk.toString()}`);
          callback();
        }
      });

      const transform = pipeUtils.tee(dest1, dest2);
      const sourceResult = new ExecutionResultImpl(
        'test data',
        '',
        0,
        undefined,
        'echo',
        100,
        new Date(),
        new Date(),
        'local'
      );

      const result = await executePipe(
        Promise.resolve(sourceResult),
        transform,
        engine
      );

      expect(result.stdout).toBe('test data');
      expect(outputs).toContain('dest1: test data');
      expect(outputs).toContain('dest2: test data');
    });
  });

  describe('ProcessPromise.pipe integration', () => {
    test('should chain multiple pipes', async () => {
      // First, let's test that pipes work with a manually created result
      const sourceResult = new ExecutionResultImpl(
        'test data',
        '',
        0,
        undefined,
        'echo "test data"',
        100,
        new Date(),
        new Date(),
        'local'
      );

      // Test piping the result through transforms
      const upperResult = await executePipe(
        Promise.resolve(sourceResult),
        pipeUtils.toUpperCase(),
        engine
      );
      
      expect(upperResult.stdout).toBe('TEST DATA');
      
      // Now pipe that result through replace
      const finalResult = await executePipe(
        Promise.resolve(upperResult),
        pipeUtils.replace('DATA', 'OUTPUT'),
        engine
      );
      
      expect(finalResult.stdout).toBe('TEST OUTPUT');
    });

    test('should pipe to Transform stream', async () => {
      const promise = engine.run`echo "hello world"`;
      
      const result = await promise.pipe(pipeUtils.toUpperCase());

      expect(result.stdout.trim()).toBe('HELLO WORLD');
    });

    test('should pipe to function', async () => {
      const promise = engine.run`printf "line1\nline2\nline3"`;
      
      const lines: string[] = [];
      await promise.pipe((line: string) => {
        lines.push(`processed: ${line}`);
      }, { lineByLine: true });

      expect(lines).toEqual([
        'processed: line1',
        'processed: line2', 
        'processed: line3'
      ]);
    });

    test('should handle pipe errors with nothrow', async () => {
      const promise = engine.run`exit 1`.nothrow();
      
      const result = await promise.pipe`echo "recovered"`;

      expect(result.stdout.trim()).toBe('recovered');
      expect(result.exitCode).toBe(0);
    });

    test('should support complex pipe chains', async () => {
      // Create a source result with multiple lines
      const sourceResult = new ExecutionResultImpl(
        'apple\nbanana\napple\ncherry',
        '',
        0,
        undefined,
        'printf "apple\\nbanana\\napple\\ncherry"',
        100,
        new Date(),
        new Date(),
        'local'
      );
      
      // First apply grep filter
      const grepResult = await executePipe(
        Promise.resolve(sourceResult),
        pipeUtils.grep('apple'),
        engine
      );
      
      // Verify grep worked
      expect(grepResult.stdout.trim()).toBe('apple\napple');
      
      // Now process the lines
      const lines: string[] = [];
      await executePipe(
        Promise.resolve(grepResult),
        (line: string) => {
          lines.push(line);
        },
        engine,
        { lineByLine: true }
      );

      expect(lines).toEqual(['apple', 'apple']);
    });
  });
});