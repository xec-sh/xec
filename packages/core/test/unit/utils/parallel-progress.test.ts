import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { parallel, ParallelEngine } from '../../../src/utils/parallel.js';

import type { Command } from '../../../src/core/command.js';
import type { ExecutionResult } from '../../../src/core/result.js';

// Mock execution engine
class MockExecutionEngine {
  private delay: number;
  private shouldFail: boolean;
  
  constructor(delay = 10, shouldFail = false) {
    this.delay = delay;
    this.shouldFail = shouldFail;
  }
  
  async execute(command: Command): Promise<ExecutionResult> {
    await new Promise(resolve => setTimeout(resolve, this.delay));
    
    if (this.shouldFail && command.command?.includes('fail')) {
      throw new Error(`Command failed: ${command.command}`);
    }
    
    return {
      stdout: `Output: ${command.command}`,
      stderr: '',
      exitCode: 0,
      signal: undefined,
      command: command.command || '',
      duration: this.delay,
      startedAt: new Date(),
      finishedAt: new Date(),
      adapter: 'mock',
      toString: () => `Output: ${command.command}`,
      toJSON: () => ({ stdout: `Output: ${command.command}`, stderr: '', exitCode: 0 }),
      throwIfFailed: () => {},
      isSuccess: () => true
    };
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
      expect(lastUpdate.completed).toBe(5);
      expect(lastUpdate.succeeded).toBe(3);
      expect(lastUpdate.failed).toBe(2);
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
      const mockSettled = jest.fn().mockImplementation(async (commands, options) => {
        // Simulate progress
        const total = commands.length;
        for (let i = 1; i <= total; i++) {
          if (options.onProgress) {
            options.onProgress(i, total, i, 0);
          }
        }
        
        return {
          results: commands.map((cmd: any) => ({
            stdout: `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`,
            stderr: '',
            exitCode: 0
          })),
          succeeded: commands.map((cmd: any) => ({
            stdout: `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`,
            stderr: '',
            exitCode: 0
          })),
          failed: [],
          duration: 100
        };
      });
      
      engine.parallel.settled = mockSettled;
      
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
      
      const mockSettled = jest.fn().mockResolvedValue({
        results: [],
        succeeded: [],
        failed: [],
        duration: 0
      });
      
      engine.parallel.settled = mockSettled;
      
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
      const progressUpdates: number[] = [];
      
      await parallel(
        ['cmd1', 'cmd2', 'cmd3'],
        slowEngine as any,
        {
          timeout: 50, // Timeout before completion
          stopOnError: false,
          onProgress: (completed, total, succeeded, failed) => {
            progressUpdates.push(failed);
          }
        }
      );
      
      // All should fail due to timeout
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate).toBe(3);
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
});