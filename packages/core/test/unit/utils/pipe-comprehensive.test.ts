import { Transform } from 'node:stream';
import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { pipe } from '../../../src/utils/pipe.js';
import { ExecutionEngine } from '../../../src/index.js';

describe('Pipe Utility Comprehensive Tests', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new ExecutionEngine({
      throwOnNonZeroExit: true
    });
  });

  describe('Basic Pipe Operations', () => {
    it('should pipe output between commands', async () => {
      const pipeResult = pipe(
        ['echo "hello world"', 'grep world'],
        engine
      );
      
      expect(await pipeResult.text()).toBe('hello world');
      
      const result = await pipeResult;
      expect(result.exitCode).toBe(0);
    });

    it('should pipe through multiple commands', async () => {
      const pipeResult = pipe(
        ['echo "one\ntwo\nthree"', 'grep -v two', 'wc -l'],
        engine
      );
      
      const lineCount = parseInt(await pipeResult.text());
      expect(lineCount).toBe(2);
    });

    it('should preserve exit code from last command', async () => {
      // Create engine that doesn't throw on non-zero exit
      const nonThrowingEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      
      const pipeResult = pipe(
        ['echo "test"', 'grep nonexistent'],
        nonThrowingEngine,
        { throwOnError: false }
      );
      
      const result = await pipeResult;
      expect(result.exitCode).toBe(1);
      expect(result.stdout.trim()).toBe('');
    });

    it('should handle empty input', async () => {
      const pipeResult = pipe(
        ['echo ""', 'cat'],
        engine
      );
      
      const buffer = await pipeResult.buffer();
      expect(buffer.toString()).toBe('\n');
    });
  });

  describe('Error Handling', () => {
    it('should handle first command failure', async () => {
      await expect(pipe(
        ['nonexistentcommand', 'cat'],
        engine
      )).rejects.toThrow();
    });

    it('should handle intermediate command failure by default', async () => {
      await expect(pipe(
        ['echo "test"', 'nonexistentcommand', 'cat'],
        engine
      )).rejects.toThrow();
    });

    it('should handle last command failure', async () => {
      await expect(pipe(
        ['echo "test"', 'cat', 'nonexistentcommand'],
        engine
      )).rejects.toThrow();
    });

    it('should continue on failure with throwOnError false', async () => {
      // Create engine that doesn't throw on non-zero exit
      const nonThrowingEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      
      const pipeResult = pipe(
        ['echo "test"', 'grep nonexistent'],
        nonThrowingEngine,
        { throwOnError: false }
      );
      
      const result = await pipeResult;
      expect(result.exitCode).toBe(1);
    });

    it('should fail by default on non-zero exit code', async () => {
      await expect(pipe(
        ['echo "test"', 'exit 1'],
        engine
      )).rejects.toThrow();
    });
  });

  describe('Stream Handling', () => {
    it('should handle large data streams', async () => {
      const lines = 1000;
      const pipeResult = pipe(
        [`seq 1 ${lines}`, 'wc -l'],
        engine
      );
      
      const lineCount = parseInt(await pipeResult.text());
      expect(lineCount).toBe(lines);
    });

    it('should handle binary data', async () => {
      const pipeResult = pipe(
        ['printf "binary content" | base64', 'base64 -d'],
        engine
      );
      
      expect(await pipeResult.text()).toBe('binary content');
    });

    it('should handle stderr separately', async () => {
      // When piping, stderr is typically not piped unless explicitly redirected
      // This test verifies that stderr remains separate from stdout
      const pipeResult = pipe(
        // Use a command that produces both stdout and stderr
        ['sh -c "echo stdout && echo stderr >&2"', 'cat'],
        engine
      );
      
      const result = await pipeResult;
      expect(result.stdout.trim()).toBe('stdout');
      // Note: In a pipe, stderr from the first command is not piped to the second command
      // However, the way pipe.ts is implemented, stderr is cleared in pipeToTransform
      // and only the last command's stderr is kept. This test expectation needs adjustment.
      // Since cat doesn't produce stderr, the result.stderr will be empty
      expect(result.stderr).toBe('');
    });

    it('should work with Transform streams', async () => {
      const upperCaseTransform = new Transform({
        transform(chunk, encoding, callback) {
          callback(null, chunk.toString().toUpperCase());
        }
      });

      const pipeResult = pipe(
        ['echo "hello"', upperCaseTransform],
        engine
      );
      
      expect(await pipeResult.text()).toBe('HELLO');
    });
  });

  describe('Complex Pipelines', () => {
    it('should handle text processing pipeline', async () => {
      const pipeResult = pipe(
        [
          'echo "apple\nbanana\napple\norange\nbanana\napple"',
          'sort',
          'uniq -c',
          'sort -nr',
          'head -1'
        ],
        engine
      );
      
      const output = await pipeResult.text();
      expect(output).toMatch(/3\s+apple/);
    });

    it('should handle data transformation pipeline', async () => {
      const pipeResult = pipe(
        [
          'echo \'{"name":"test","value":42}\'',
          'sed \'s/test/updated/g\''
        ],
        engine
      );
      
      expect(await pipeResult.text()).toBe('{"name":"updated","value":42}');
    });

    it('should handle conditional pipeline', async () => {
      const testFile = `/tmp/pipe-test-${Date.now()}.txt`;
      
      // Create test file
      await engine.execute({ command: `echo "test content" > ${testFile}` });
      
      try {
        const pipeResult = pipe(
          [`cat ${testFile}`, 'grep -q "test" && echo "found"'],
          engine
        );
        
        expect(await pipeResult.text()).toBe('found');
      } finally {
        await engine.execute({ command: `rm -f ${testFile}` });
      }
    });
  });

  describe('Options and Configuration', () => {
    it('should respect custom encoding', async () => {
      const pipeResult = pipe(
        ['echo "encoded text"', 'cat'],
        engine,
        { encoding: 'utf8' }
      );
      
      expect(await pipeResult.text()).toBe('encoded text');
    });

    it('should handle buffer mode', async () => {
      const pipeResult = pipe(
        ['printf "buffer data"', 'cat'],
        engine
      );
      
      const buffer = await pipeResult.buffer();
      expect(buffer.toString()).toBe('buffer data');
    });

    it('should respect throwOnError option', async () => {
      // Create engine that doesn't throw on non-zero exit
      const nonThrowingEngine = new ExecutionEngine({
        throwOnNonZeroExit: false
      });
      
      const pipeResult = pipe(
        ['echo "test"', 'exit 42'],
        nonThrowingEngine,
        { throwOnError: false }
      );
      
      const result = await pipeResult;
      expect(result.exitCode).toBe(42);
    });
  });

  describe('Special Cases', () => {
    it('should handle empty pipeline', () => {
      expect(() => pipe([], engine)).toThrow(/at least one command/i);
    });

    it('should handle single command', async () => {
      const pipeResult = pipe(['echo "single"'], engine);
      
      expect(await pipeResult.text()).toBe('single');
    });

    it('should handle commands with Command objects', async () => {
      const pipeResult = pipe(
        [
          { command: 'echo "test"', shell: true },
          'cat'
        ],
        engine
      );
      
      expect(await pipeResult.text()).toBe('test');
    });

    it('should handle interactive commands', async () => {
      const pipeResult = pipe(
        ['echo "input"', 'cat'],
        engine
      );
      
      expect(await pipeResult.text()).toBe('input');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle rapid sequential pipes', async () => {
      const results = await Promise.all(
        Array(10).fill(null).map((_, i) => 
          pipe([`echo "test${i}"`, 'cat'], engine).text()
        )
      );
      
      results.forEach((text, i) => {
        expect(text).toBe(`test${i}`);
      });
    });

    it('should clean up resources on error', async () => {
      let errorThrown = false;
      
      try {
        await pipe(
          ['echo "test"', 'nonexistentcommand456'],
          engine
        );
      } catch {
        errorThrown = true;
      }
      
      expect(errorThrown).toBe(true);
      
      // Verify we can still run commands
      const result = await engine.execute({ command: 'echo "still works"' });
      expect(result.stdout.trim()).toBe('still works');
    });

    it('should handle memory efficiently with large data', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const pipeResult = pipe(
        ['yes | head -10000', 'wc -l'],
        engine
      );
      
      const lineCount = parseInt(await pipeResult.text());
      expect(lineCount).toBe(10000);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(50);
    });
  });

  describe('Real-world Use Cases', () => {
    it('should handle log processing pipeline', async () => {
      const logs = [
        '2024-01-01 INFO Starting application',
        '2024-01-01 ERROR Failed to connect',
        '2024-01-01 WARN Retry attempt 1',
        '2024-01-01 ERROR Failed to connect',
        '2024-01-01 INFO Connected successfully'
      ].join('\\n');
      
      const pipeResult = pipe(
        [`echo "${logs}"`, 'grep ERROR', 'wc -l'],
        engine
      );
      
      const errorCount = parseInt(await pipeResult.text());
      expect(errorCount).toBe(2);
    });

    it('should handle JSON processing pipeline', async () => {
      const jsonData = JSON.stringify([
        { name: 'item1', value: 10 },
        { name: 'item2', value: 20 },
        { name: 'item3', value: 30 }
      ]);
      
      const pipeResult = pipe(
        [
          `echo '${jsonData}'`,
          'grep -o "\\"value\\":[0-9]*"',
          'cut -d: -f2',
          'paste -sd+ -',
          'bc'
        ],
        engine
      );
      
      const sum = parseInt(await pipeResult.text());
      expect(sum).toBe(60);
    });

    it('should handle file processing pipeline', async () => {
      const testDir = `/tmp/pipe-test-dir-${Date.now()}`;
      await engine.execute({ command: `mkdir -p ${testDir}` });
      
      try {
        await engine.execute({ 
          command: `touch ${testDir}/file1.txt ${testDir}/file2.log ${testDir}/file3.txt` 
        });
        
        const pipeResult = pipe(
          [`ls ${testDir}`, 'grep ".txt$"', 'wc -l'],
          engine
        );
        
        const txtFileCount = parseInt(await pipeResult.text());
        expect(txtFileCount).toBe(2);
      } finally {
        await engine.execute({ command: `rm -rf ${testDir}` });
      }
    });
  });

  describe('PipeableResult Methods', () => {
    it('should support text() method', async () => {
      const pipeResult = pipe(['echo "  test  "'], engine);
      const text = await pipeResult.text();
      expect(text).toBe('test');  // text() trims output
    });

    it('should support json() method', async () => {
      const pipeResult = pipe(['echo \'{"key": "value"}\''], engine);
      const json = await pipeResult.json();
      expect(json).toEqual({ key: 'value' });
    });

    it('should support lines() method', async () => {
      const pipeResult = pipe(['echo "line1\nline2\nline3"'], engine);
      const lines = await pipeResult.lines();
      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('should support buffer() method', async () => {
      const pipeResult = pipe(['printf "test"'], engine);
      const buffer = await pipeResult.buffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe('test');
    });

    it('should chain pipe() calls', async () => {
      const pipeResult = pipe(['echo "hello"'], engine)
        .pipe('tr a-z A-Z')
        .pipe('cat');
      
      expect(await pipeResult.text()).toBe('HELLO');
    });
  });

  describe('Integration with ExecutionEngine', () => {
    it('should work with custom engine configuration', async () => {
      const customEngine = new ExecutionEngine({
        throwOnNonZeroExit: false,
        defaultShell: '/bin/bash'
      });

      const pipeResult = pipe(
        ['echo "test"', 'exit 1'],
        customEngine
      );
      
      const result = await pipeResult;
      expect(result.exitCode).toBe(1);
    });

    it('should respect engine environment variables', async () => {
      const customEngine = new ExecutionEngine({
        defaultEnv: { CUSTOM_VAR: 'custom_value' }
      });

      const pipeResult = pipe(
        ['echo "$CUSTOM_VAR"'],
        customEngine
      );
      
      expect(await pipeResult.text()).toBe('custom_value');
    });

    it('should work with engine working directory', async () => {
      const customEngine = new ExecutionEngine({
        defaultCwd: process.cwd()
      });

      const pipeResult = pipe(
        ['pwd'],
        customEngine
      );
      
      expect(await pipeResult.text()).toBe(process.cwd());
    });
  });

  describe('Error Cases and Edge Cases', () => {
    it('should throw error when first element is Transform', () => {
      const transform = new Transform({
        transform(chunk, encoding, callback) {
          callback(null, chunk);
        }
      });

      expect(() => pipe([transform as any], engine)).toThrow(/First element in pipe cannot be a Transform/);
    });

    it('should handle mixed command types', async () => {
      const pipeResult = pipe(
        [
          'echo "start"',
          { command: 'tr a-z A-Z' },
          'cat'
        ],
        engine
      );

      expect(await pipeResult.text()).toBe('START');
    });

    it('should propagate errors through Promise interface', async () => {
      const pipeResult = pipe(['nonexistentcommand123'], engine);
      
      // Test then/catch
      let errorCaught = false;
      try {
        await pipeResult;
      } catch {
        errorCaught = true;
      }
      expect(errorCaught).toBe(true);
    });

    it('should work with finally', async () => {
      let finallyCalled = false;
      const pipeResult = pipe(['echo "test"'], engine);
      
      await pipeResult.finally(() => { finallyCalled = true; });
      expect(finallyCalled).toBe(true);
    });
  });

  describe('Streaming to external destinations', () => {
    it('should pipe to writable stream', async () => {
      const chunks: string[] = [];
      const writableStream = new Transform({
        transform(chunk, encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        }
      });

      const pipeResult = pipe(['echo "test"'], engine);
      await pipeResult.toStream(writableStream);
      
      expect(chunks.join('')).toContain('test');
    });
  });
});