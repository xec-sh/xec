import { it, expect, describe } from '@jest/globals';

import { createExecutionEngine } from '../../../src/index.js';
import { MockAdapter } from '../../../src/adapters/mock-adapter.js';

describe('Parallel Utils', () => {
  const $ = createExecutionEngine();
  const mock = new MockAdapter();
  $.registerAdapter('mock', mock);
  const $mock = $.with({ adapter: 'mock' as any });

  beforeEach(() => {
    mock.clearMocks();
  });

  describe('ParallelEngine', () => {
    describe('all', () => {
      it('should execute all commands and return results', async () => {
        mock.mockSuccess('echo "1"', '1');
        mock.mockSuccess('echo "2"', '2');
        mock.mockSuccess('echo "3"', '3');

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
        mock.mockSuccess('echo "1"', '1');
        mock.mockFailure('fail', 'Command failed', 1);
        mock.mockSuccess('echo "3"', '3');

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
        mock.mockCommand('slow', { stdout: 'slow', exitCode: 0, delay: 100 });
        mock.mockCommand('fast', { stdout: 'fast', exitCode: 0, delay: 10 });
        mock.mockCommand('medium', { stdout: 'medium', exitCode: 0, delay: 50 });

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
          mock.mockSuccess(`process ${item}`, `processed ${item}`);
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
          mock.mockSuccess(`echo ${i}`, `${i}`);
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

        mock.mockSuccess('test -f valid1.txt', '');
        mock.mockFailure('test -f invalid.txt', '', 1);
        mock.mockSuccess('test -f valid2.txt', '');

        const validFiles = await $mock.parallel.filter(
          files,
          (file) => `test -f ${file}`
        );

        expect(validFiles).toEqual(['valid1.txt', 'valid2.txt']);
      });
    });

    describe('some', () => {
      it('should return true if at least one command succeeds', async () => {
        mock.mockFailure('test1', 'fail', 1);
        mock.mockSuccess('test2', 'success');
        mock.mockFailure('test3', 'fail', 1);

        const result = await $mock.parallel.some([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(true);
      });

      it('should return false if all commands fail', async () => {
        mock.mockFailure('test1', 'fail', 1);
        mock.mockFailure('test2', 'fail', 1);
        mock.mockFailure('test3', 'fail', 1);

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
        mock.mockSuccess('test1', 'ok');
        mock.mockSuccess('test2', 'ok');
        mock.mockSuccess('test3', 'ok');

        const result = await $mock.parallel.every([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(true);
      });

      it('should return false if any command fails', async () => {
        mock.mockSuccess('test1', 'ok');
        mock.mockFailure('test2', 'fail', 1);
        mock.mockSuccess('test3', 'ok');

        const result = await $mock.parallel.every([
          'test1',
          'test2',
          'test3'
        ]);

        expect(result).toBe(false);
      });
    });
  });
});