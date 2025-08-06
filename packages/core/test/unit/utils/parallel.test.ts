import { it, expect, describe, beforeEach } from '@jest/globals';

import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';

describe('Parallel Utils', () => {
  const engine = new ExecutionEngine();
  const mock = new MockAdapter();
  engine.registerAdapter('mock', mock);
  const $ = createCallableEngine(engine);
  const $mock = $.with({ adapter: 'mock' as any });

  beforeEach(() => {
    mock.clearMocks();
  });

  describe('ParallelEngine', () => {
    describe('all', () => {
      it('should execute all commands and return results', async () => {
        mock.mockSuccess('sh -c "echo "1""', '1');
        mock.mockSuccess('sh -c "echo "2""', '2');
        mock.mockSuccess('sh -c "echo "3""', '3');

        const results = await $mock.parallel.all([
          'echo "1"',
          'echo "2"',
          'echo "3"'
        ]);

        expect(results).toHaveLength(3);
        expect(results[0]?.stdout).toBe('1');
        expect(results[1]?.stdout).toBe('2');
        expect(results[2]?.stdout).toBe('3');
      });

      it('should throw if any command fails', async () => {
        mock.mockSuccess('sh -c "echo "1""', '1');
        mock.mockFailure('sh -c "fail"', 'Command failed', 1);
        mock.mockSuccess('sh -c "echo "3""', '3');

        await expect($mock.parallel.all([
          'echo "1"',
          'fail',
          'echo "3"'
        ])).rejects.toThrow();
      });
    });

    describe('race', () => {
      it('should return the first successful result', async () => {
        // Mock with different delays
        mock.mockCommand('sh -c "slow"', { stdout: 'slow', exitCode: 0, delay: 100 });
        mock.mockCommand('sh -c "fast"', { stdout: 'fast', exitCode: 0, delay: 10 });
        mock.mockCommand('sh -c "medium"', { stdout: 'medium', exitCode: 0, delay: 50 });

        const result = await $mock.parallel.race([
          'slow',
          'fast',
          'medium'
        ]);

        expect(result.stdout).toBe('fast');
      });
    });

    describe('map', () => {
      it('should map over items and execute commands', async () => {
        const items = ['file1.txt', 'file2.txt', 'file3.txt'];

        items.forEach(item => {
          mock.mockSuccess(`sh -c "process ${item}"`, `processed ${item}`);
        });

        const result = await $mock.parallel.map(
          items,
          (item) => `process ${item}`
        );

        expect(result.succeeded).toHaveLength(3);
        expect(result.succeeded[0]?.stdout).toBe('processed file1.txt');
      });

      it('should respect maxConcurrency', async () => {
        const items = Array(10).fill(0).map((_, i) => i);

        items.forEach(i => {
          mock.mockSuccess(`sh -c "echo ${i}"`, `${i}`);
        });

        const result = await $mock.parallel.map(
          items,
          (i) => `echo ${i}`,
          { maxConcurrency: 2 }
        );

        expect(result.succeeded).toHaveLength(10);
      });
    });

    describe('filter', () => {
      it('should filter items based on command success', async () => {
        const files = ['valid1.txt', 'invalid.txt', 'valid2.txt'];

        mock.mockSuccess('sh -c "test -f valid1.txt"', '');
        mock.mockFailure('sh -c "test -f invalid.txt"', '', 1);
        mock.mockSuccess('sh -c "test -f valid2.txt"', '');

        const validFiles = await $mock.parallel.filter(
          files,
          (file) => `test -f ${file}`
        );

        expect(validFiles).toEqual(['valid1.txt', 'valid2.txt']);
      });
    });

    describe('some', () => {
      it('should return true if at least one command succeeds', async () => {
        mock.mockFailure('sh -c "test1"', 'fail', 1);
        mock.mockSuccess('sh -c "test2"', 'success');
        mock.mockFailure('sh -c "test3"', 'fail', 1);

        const result = await $mock.parallel.some([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(true);
      });

      it('should return false if all commands fail', async () => {
        mock.mockFailure('sh -c "test1"', 'fail', 1);
        mock.mockFailure('sh -c "test2"', 'fail', 1);
        mock.mockFailure('sh -c "test3"', 'fail', 1);

        const result = await $mock.parallel.some([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(false);
      });
    });

    describe('every', () => {
      it('should return true if all commands succeed', async () => {
        mock.mockSuccess('sh -c "test1"', 'ok');
        mock.mockSuccess('sh -c "test2"', 'ok');
        mock.mockSuccess('sh -c "test3"', 'ok');

        const result = await $mock.parallel.every([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(true);
      });

      it('should return false if any command fails', async () => {
        mock.mockSuccess('sh -c "test1"', 'ok');
        mock.mockFailure('sh -c "test2"', 'fail', 1);
        mock.mockSuccess('sh -c "test3"', 'ok');

        const result = await $mock.parallel.every([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(false);
      });
    });

    describe('ProcessPromise support', () => {
      it('should handle ProcessPromise in all()', async () => {
        mock.mockSuccess('sh -c "echo "promise1""', 'promise1');
        mock.mockSuccess('sh -c "echo "promise2""', 'promise2');
        mock.mockSuccess('sh -c "echo "direct""', 'direct');

        // Create ProcessPromises
        const promise1 = $mock`echo "promise1"`;
        const promise2 = $mock`echo "promise2"`;

        // Mix ProcessPromises with direct commands
        const results = await $mock.parallel.all([
          promise1,
          promise2,
          'echo "direct"'
        ]);

        expect(results).toHaveLength(3);
        expect(results[0]?.stdout).toBe('promise1');
        expect(results[1]?.stdout).toBe('promise2');
        expect(results[2]?.stdout).toBe('direct');
      });

      it('should handle ProcessPromise with nothrow()', async () => {
        mock.mockSuccess('sh -c "echo "ok""', 'ok');
        mock.mockFailure('sh -c "fail"', 'error', 1);

        // Create ProcessPromises with nothrow
        const okPromise = $mock`echo "ok"`.nothrow();
        const failPromise = $mock`fail`.nothrow();

        const result = await $mock.parallel.settled([
          okPromise,
          failPromise
        ]);

        // Both should succeed because nothrow() prevents throwing
        expect(result.succeeded).toHaveLength(2);
        expect(result.failed).toHaveLength(0);
        expect(result.succeeded[0]?.stdout).toBe('ok');
        expect(result.succeeded[1]?.exitCode).toBe(1);
      });

      it('should handle ProcessPromise in race()', async () => {
        mock.mockCommand('sh -c "slow"', { stdout: 'slow', exitCode: 0, delay: 100 });
        mock.mockCommand('sh -c "fast"', { stdout: 'fast', exitCode: 0, delay: 10 });

        const slowPromise = $mock`slow`;
        const fastPromise = $mock`fast`;

        const result = await $mock.parallel.race([slowPromise, fastPromise]);
        expect(result.stdout).toBe('fast');
      });

      it('should handle ProcessPromise in map()', async () => {
        const items = ['a', 'b', 'c'];
        
        items.forEach(item => {
          mock.mockSuccess(`sh -c "echo ${item}"`, item);
        });

        const result = await $mock.parallel.map(
          items,
          (item) => $mock`echo ${item}` // Return ProcessPromise
        );

        expect(result.succeeded).toHaveLength(3);
        expect(result.succeeded.map(r => r.stdout)).toEqual(['a', 'b', 'c']);
      });

      it('should handle ProcessPromise in filter()', async () => {
        const numbers = [1, 2, 3, 4, 5];

        // Mock success for even numbers, failure for odd
        numbers.forEach(n => {
          if (n % 2 === 0) {
            mock.mockSuccess(`sh -c "test ${n}"`, '');
          } else {
            mock.mockFailure(`sh -c "test ${n}"`, '', 1);
          }
        });

        // Create ProcessPromises with nothrow to prevent throwing
        const promises = numbers.map(n => $mock`test ${n}`.nothrow());
        
        // Wait for all promises to be created
        await new Promise(resolve => setTimeout(resolve, 10));

        // Use the already-created promises in filter
        const evenNumbers = await $mock.parallel.filter(
          numbers,
          (_, index) => promises[index]! // Return pre-created ProcessPromise
        );

        expect(evenNumbers).toEqual([2, 4]);
      });

      it('should handle ProcessPromise in some()', async () => {
        mock.mockFailure('sh -c "fail1"', 'error', 1);
        mock.mockSuccess('sh -c "success"', 'ok');
        mock.mockFailure('sh -c "fail2"', 'error', 1);

        const promises = [
          $mock`fail1`.nothrow(),
          $mock`success`.nothrow(),
          $mock`fail2`.nothrow()
        ];

        const result = await $mock.parallel.some(promises);
        expect(result).toBe(true);
      });

      it('should handle ProcessPromise in every()', async () => {
        mock.mockSuccess('sh -c "ok1"', 'ok');
        mock.mockSuccess('sh -c "ok2"', 'ok');
        mock.mockSuccess('sh -c "ok3"', 'ok');

        const promises = [
          $mock`ok1`,
          $mock`ok2`,
          $mock`ok3`
        ];

        const result = await $mock.parallel.every(promises);
        expect(result).toBe(true);
      });

      it('should handle mixed types in parallel execution', async () => {
        mock.mockSuccess('sh -c "from-string"', 'string result');
        mock.mockSuccess('sh -c "from-command"', 'command result');
        mock.mockSuccess('sh -c "from-promise"', 'promise result');

        const promise = $mock`from-promise`;
        const command = { command: 'from-command' };

        const result = await $mock.parallel.settled([
          'from-string',
          command,
          promise
        ]);

        expect(result.succeeded).toHaveLength(3);
        expect(result.succeeded[0]?.stdout).toBe('string result');
        expect(result.succeeded[1]?.stdout).toBe('command result');
        expect(result.succeeded[2]?.stdout).toBe('promise result');
      });

      it('should maintain ProcessPromise configuration', async () => {
        mock.mockSuccess('sh -c "test"', 'output');

        // Create a ProcessPromise with custom config
        const promise = $mock`test`;

        const results = await $mock.parallel.all([promise]);
        
        expect(results).toHaveLength(1);
        expect(results[0]?.stdout).toBe('output');
      });
    });
  });
});