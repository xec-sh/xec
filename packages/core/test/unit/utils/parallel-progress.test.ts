import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionResultImpl } from '../../../src/core/result.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { parallel, ParallelEngine } from '../../../src/utils/parallel.js';

import type { Command } from '../../../src/types/command.js';
import type { ExecutionResult } from '../../../src/core/result.js';
import type { ParallelResult, ParallelOptions } from '../../../src/utils/parallel.js';

// Mock execution engine
class MockExecutionEngine {
  private delay: number;
  private shouldFail: boolean;
  private throwOnFail: boolean;

  constructor(delay = 10, shouldFail = false, throwOnFail = true) {
    this.delay = delay;
    this.shouldFail = shouldFail;
    this.throwOnFail = throwOnFail;
  }

  async execute(command: Command): Promise<ExecutionResult> {
    // Handle abort signal for timeout
    if (command.signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        command.signal!.addEventListener('abort', () => {
          reject(new Error('Command aborted due to timeout'));
        });
      });

      const delayPromise = new Promise<void>(resolve => setTimeout(resolve, this.delay));

      // Race between delay and abort
      await Promise.race([delayPromise, abortPromise]);
    } else {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    const startedAt = new Date();
    const finishedAt = new Date(startedAt.getTime() + this.delay);

    // Handle failure based on throwOnFail flag
    if (this.shouldFail && command.command?.includes('fail')) {
      if (this.throwOnFail) {
        throw new Error(`Command failed: ${command.command}`);
      } else {
        return new ExecutionResultImpl(
          '',
          `Command failed: ${command.command}`,
          1,  // Exit code 1 for failure
          undefined,
          command.command || '',
          this.delay,
          startedAt,
          finishedAt,
          'mock'
        );
      }
    }

    return new ExecutionResultImpl(
      `Output: ${command.command}`,
      '',
      0,
      undefined,
      command.command || '',
      this.delay,
      startedAt,
      finishedAt,
      'mock'
    );
  }
}

describe('Parallel Execution with Progress', () => {
  let mockEngine: MockExecutionEngine;

  beforeEach(() => {
    mockEngine = new MockExecutionEngine(10);
  });

  describe('onProgress callback', () => {
    it('should call onProgress for each completed command', async () => {
      const progressUpdates: Array<{
        completed: number;
        total: number;
        succeeded: number;
        failed: number;
      }> = [];

      const commands = ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'];

      await parallel(commands, mockEngine as any, {
        onProgress: (completed, total, succeeded, failed) => {
          progressUpdates.push({ completed, total, succeeded, failed });
        }
      });

      // Should have received progress updates
      expect(progressUpdates.length).toBe(commands.length);

      // Check progression
      progressUpdates.forEach((update, index) => {
        expect(update.completed).toBe(index + 1);
        expect(update.total).toBe(commands.length);
        expect(update.succeeded).toBe(index + 1);
        expect(update.failed).toBe(0);
      });
    });

    it('should track failed commands in progress', async () => {
      const failEngine = new MockExecutionEngine(10, true);
      const progressUpdates: Array<{
        completed: number;
        succeeded: number;
        failed: number;
      }> = [];

      const commands = ['cmd1', 'fail1', 'cmd2', 'fail2', 'cmd3'];

      await parallel(commands, failEngine as any, {
        stopOnError: false,
        onProgress: (completed, total, succeeded, failed) => {
          progressUpdates.push({ completed, succeeded, failed });
        }
      });

      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate).toBeDefined();
      expect(lastUpdate?.completed).toBe(5);
      expect(lastUpdate?.succeeded).toBe(3);
      expect(lastUpdate?.failed).toBe(2);
    });

    it('should call onProgress with limited concurrency', async () => {
      const progressUpdates: number[] = [];
      const commands = Array(10).fill(null).map((_, i) => `cmd${i}`);

      await parallel(commands, mockEngine as any, {
        maxConcurrency: 2,
        onProgress: (completed) => {
          progressUpdates.push(completed);
        }
      });

      // Should have received all progress updates
      expect(progressUpdates.length).toBe(10);

      // Progress should be sequential
      progressUpdates.forEach((completed, index) => {
        expect(completed).toBe(index + 1);
      });
    });

    it('should not call onProgress if not provided', async () => {
      // This should not throw
      const result = await parallel(
        ['cmd1', 'cmd2', 'cmd3'],
        mockEngine as any,
        { maxConcurrency: 2 }
      );

      expect(result.succeeded.length).toBe(3);
    });
  });

  describe('batch method', () => {
    it('should execute commands with batch method', async () => {
      const engine = new ExecutionEngine();
      const progressUpdates: number[] = [];

      // Mock the parallel.settled method
      const mockSettled = jest.fn<
        (commands: (string | Command)[], options?: ParallelOptions) => Promise<ParallelResult>
      >().mockImplementation(async (commands: (string | Command)[], options?: ParallelOptions) => {
        // Simulate progress
        const total = commands.length;
        for (let i = 1; i <= total; i++) {
          if (options?.onProgress) {
            options.onProgress(i, total, i, 0);
          }
        }

        return {
          results: commands.map((cmd) => {
            const cmdStr = typeof cmd === 'string' ? cmd : cmd.command || '';
            const startedAt = new Date();
            const finishedAt = new Date(startedAt.getTime() + 10);
            return new ExecutionResultImpl(
              `Output: ${cmdStr}`,
              '',
              0,
              undefined,
              cmdStr,
              10,
              startedAt,
              finishedAt,
              'mock'
            );
          }),
          succeeded: commands.map((cmd) => {
            const cmdStr = typeof cmd === 'string' ? cmd : cmd.command || '';
            const startedAt = new Date();
            const finishedAt = new Date(startedAt.getTime() + 10);
            return new ExecutionResultImpl(
              `Output: ${cmdStr}`,
              '',
              0,
              undefined,
              cmdStr,
              10,
              startedAt,
              finishedAt,
              'mock'
            );
          }),
          failed: [],
          duration: 100
        };
      });

      engine.parallel.settled = mockSettled as any;

      const result = await engine.batch(
        ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'],
        {
          concurrency: 2,
          onProgress: (completed) => {
            progressUpdates.push(completed);
          }
        }
      );

      expect(mockSettled).toHaveBeenCalledWith(
        ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'],
        expect.objectContaining({
          maxConcurrency: 2
        })
      );

      expect(result.succeeded.length).toBe(5);
      expect(progressUpdates).toEqual([1, 2, 3, 4, 5]);
    });

    it('should use default concurrency if not specified', async () => {
      const engine = new ExecutionEngine();

      const mockSettled = jest.fn<
        (commands: (string | Command)[], options?: ParallelOptions) => Promise<ParallelResult>
      >().mockResolvedValue({
        results: [],
        succeeded: [],
        failed: [],
        duration: 0
      });

      engine.parallel.settled = mockSettled as any;

      await engine.batch(['cmd1', 'cmd2']);

      expect(mockSettled).toHaveBeenCalledWith(
        ['cmd1', 'cmd2'],
        expect.objectContaining({
          maxConcurrency: 5 // Default
        })
      );
    });
  });

  describe('Progress tracking with different scenarios', () => {
    it('should handle empty command list', async () => {
      const progressCalls: number[] = [];

      const result = await parallel([], mockEngine as any, {
        onProgress: (completed) => {
          progressCalls.push(completed);
        }
      });

      expect(progressCalls.length).toBe(0);
      expect(result.succeeded.length).toBe(0);
    });

    it('should handle single command', async () => {
      let progressCalled = false;

      await parallel(['single-cmd'], mockEngine as any, {
        onProgress: (completed, total, succeeded, failed) => {
          progressCalled = true;
          expect(completed).toBe(1);
          expect(total).toBe(1);
          expect(succeeded).toBe(1);
          expect(failed).toBe(0);
        }
      });

      expect(progressCalled).toBe(true);
    });

    it('should stop reporting progress on stopOnError', async () => {
      const failEngine = new MockExecutionEngine(10, true);
      const progressUpdates: number[] = [];

      const commands = ['cmd1', 'cmd2', 'fail1', 'cmd3', 'cmd4'];

      await parallel(commands, failEngine as any, {
        stopOnError: true,
        onProgress: (completed) => {
          progressUpdates.push(completed);
        }
      });

      // Should stop after first error (but still report it)
      expect(progressUpdates.length).toBeLessThanOrEqual(3);
    });

    it('should handle timeout with progress tracking', async () => {
      const slowEngine = new MockExecutionEngine(100);
      const progressData: Array<{
        completed: number;
        total: number;
        succeeded: number;
        failed: number;
      }> = [];

      const result = await parallel(
        ['cmd1', 'cmd2', 'cmd3'],
        slowEngine as any,
        {
          timeout: 50, // Timeout before completion
          stopOnError: false,
          onProgress: (completed, total, succeeded, failed) => {
            progressData.push({ completed, total, succeeded, failed });
          }
        }
      );

      // Check that we got progress updates
      expect(progressData.length).toBeGreaterThan(0);

      // Check final result
      expect(result.failed.length).toBe(3);
      expect(result.succeeded.length).toBe(0);

      // Last progress update should show all failed
      const lastUpdate = progressData[progressData.length - 1];
      expect(lastUpdate).toBeDefined();
      expect(lastUpdate?.completed).toBe(3);
      expect(lastUpdate?.failed).toBe(3);
    });
  });

  describe('ParallelEngine with progress', () => {
    it('should support progress in ParallelEngine.map', async () => {
      const parallelEngine = new ParallelEngine(mockEngine as any);
      const items = [1, 2, 3, 4, 5];
      const progressUpdates: number[] = [];

      const result = await parallelEngine.map(
        items,
        (item) => `process-${item}`,
        {
          maxConcurrency: 2,
          onProgress: (completed) => {
            progressUpdates.push(completed);
          }
        }
      );

      expect(result.succeeded.length).toBe(5);
      expect(progressUpdates).toEqual([1, 2, 3, 4, 5]);
    });

    it('should support progress in ParallelEngine.settled', async () => {
      const parallelEngine = new ParallelEngine(mockEngine as any);
      let finalProgress = { completed: 0, total: 0 };

      const result = await parallelEngine.settled(
        ['task1', 'task2', 'task3'],
        {
          onProgress: (completed, total) => {
            finalProgress = { completed, total };
          }
        }
      );

      expect(result.succeeded.length).toBe(3);
      expect(finalProgress.completed).toBe(3);
      expect(finalProgress.total).toBe(3);
    });
  });

  describe('ParallelEngine additional methods', () => {
    it('should handle errors in ParallelEngine.all', async () => {
      const failEngine = new MockExecutionEngine(10, true);
      const parallelEngine = new ParallelEngine(failEngine as any);

      await expect(
        parallelEngine.all(['cmd1', 'fail1', 'cmd2'])
      ).rejects.toThrow('Command failed: fail1');
    });

    it('should execute race correctly', async () => {
      const varyingDelayEngine = {
        async execute(command: Command): Promise<ExecutionResult> {
          const delay = command.command === 'fast' ? 10 : 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          const startedAt = new Date();
          const finishedAt = new Date(startedAt.getTime() + delay);
          return new ExecutionResultImpl(
            `Output: ${command.command}`,
            '',
            0,
            undefined,
            command.command || '',
            delay,
            startedAt,
            finishedAt,
            'mock'
          );
        }
      };

      const parallelEngine = new ParallelEngine(varyingDelayEngine as any);
      const result = await parallelEngine.race(['slow', 'fast', 'slower']);

      expect(result.stdout).toBe('Output: fast');
    });

    it('should filter items based on command success', async () => {
      const filterEngine = {
        async execute(command: Command): Promise<ExecutionResult> {
          const shouldSucceed = command.command?.includes('pass');

          if (!shouldSucceed) {
            throw new Error('Command failed');
          }

          const startedAt = new Date();
          const finishedAt = new Date(startedAt.getTime() + 10);
          return new ExecutionResultImpl(
            'passed',
            '',
            0,
            undefined,
            command.command || '',
            10,
            startedAt,
            finishedAt,
            'mock'
          );
        }
      };

      const parallelEngine = new ParallelEngine(filterEngine as any);
      const items = ['item1', 'item2', 'item3', 'item4'];

      const filtered = await parallelEngine.filter(
        items,
        (item) => item.includes('2') || item.includes('4') ? 'pass' : 'fail'
      );

      expect(filtered).toEqual(['item2', 'item4']);
    });

    it('should check if some commands succeed', async () => {
      const mixedEngine = new MockExecutionEngine(10, true);
      const parallelEngine = new ParallelEngine(mixedEngine as any);

      const result = await parallelEngine.some(['fail1', 'cmd1', 'fail2']);
      expect(result).toBe(true);

      const allFail = await parallelEngine.some(['fail1', 'fail2', 'fail3']);
      expect(allFail).toBe(false);
    });

    it('should check if every command succeeds', async () => {
      const mixedEngine = new MockExecutionEngine(10, true);
      const parallelEngine = new ParallelEngine(mixedEngine as any);

      const allSucceed = await parallelEngine.every(['cmd1', 'cmd2', 'cmd3']);
      expect(allSucceed).toBe(true);

      const someFail = await parallelEngine.every(['cmd1', 'fail1', 'cmd2']);
      expect(someFail).toBe(false);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle errors with progress tracking', async () => {
      const failEngine = new MockExecutionEngine(10, true, true);  // throwOnFail = true
      const progressData: Array<{ failed: number; succeeded: number }> = [];

      // With stopOnError: false, parallel catches errors and continues
      const result = await parallel(
        ['cmd1', 'fail1', 'cmd2', 'fail2', 'cmd3'],
        failEngine as any,
        {
          stopOnError: false,
          onProgress: (completed, total, succeeded, failed) => {
            progressData.push({ failed, succeeded });
          }
        }
      );

      // Errors are caught by parallel and counted as failures
      expect(result.failed.length).toBe(2);
      expect(result.succeeded.length).toBe(3);
      expect(progressData.length).toBe(5);

      // Verify progress tracking
      const lastProgress = progressData[progressData.length - 1];
      expect(lastProgress?.failed).toBe(2);
      expect(lastProgress?.succeeded).toBe(3);
    });

    it('should handle non-throwing errors in commands', async () => {
      const customEngine = {
        async execute(command: Command): Promise<ExecutionResult> {
          const startedAt = new Date();
          const finishedAt = new Date(startedAt.getTime() + 10);
          return new ExecutionResultImpl(
            '',
            'Error occurred',
            1,
            undefined,
            command.command || '',
            10,
            startedAt,
            finishedAt,
            'mock'
          );
        }
      };

      const result = await parallel(
        ['cmd1', 'cmd2'],
        customEngine as any,
        { stopOnError: false }
      );

      expect(result.succeeded.length).toBe(2);
      expect(result.failed.length).toBe(0);
      result.results.forEach(r => {
        expect((r as ExecutionResult).exitCode).toBe(1);
      });
    });

    it('should handle limited concurrency without errors', async () => {
      const slowEngine = new MockExecutionEngine(5);
      const progressData: number[] = [];

      const result = await parallel(
        ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'],
        slowEngine as any,
        {
          maxConcurrency: 2,
          onProgress: (completed) => {
            progressData.push(completed);
          }
        }
      );

      // All commands should succeed
      expect(result.succeeded.length).toBe(5);
      expect(result.failed.length).toBe(0);

      // Progress should be tracked
      expect(progressData.length).toBe(5);
      expect(progressData).toEqual([1, 2, 3, 4, 5]);
    });
  });
});