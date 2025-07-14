import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { SkipTaskError } from '../../../src/context/globals.js';
import { contextProvider } from '../../../src/context/provider.js';
import { executeRecipe, RecipeExecutor } from '../../../src/engine/executor.js';

import type { Task, Recipe } from '../../../src/core/types.js';

// Mock dependencies
vi.mock('p-queue', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn((fn) => fn()),
    pause: vi.fn(),
    clear: vi.fn(),
    onIdle: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  createTaskLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  createRecipeLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('engine/executor', () => {
  let mockRecipe: Recipe;
  let mockTask: Task;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockTask = {
      id: 'test-task',
      name: 'test-task',
      description: 'Test task',
      handler: vi.fn().mockResolvedValue({ result: 'success' }),
      options: {},
      dependencies: [],
      tags: []
    };

    mockRecipe = {
      id: 'test-recipe',
      name: 'test-recipe',
      tasks: new Map([['test-task', mockTask]])
    };
  });

  afterEach(() => {
    // Clean up context
    const ContextProviderClass = (contextProvider.constructor as any);
    ContextProviderClass.instance = null;
  });

  describe('RecipeExecutor', () => {
    describe('constructor', () => {
      it('should create executor with default options', () => {
        const executor = new RecipeExecutor(mockRecipe);
        expect(executor).toBeDefined();
      });

      it('should create executor with custom options', () => {
        const options = {
          dryRun: true,
          verbose: true,
          parallel: true,
          maxConcurrency: 5,
          continueOnError: true,
          timeout: 60000,
          globalVars: { foo: 'bar' },
          secrets: { secret: 'value' },
          hosts: ['host1', 'host2'],
          tags: ['tag1', 'tag2']
        };

        const executor = new RecipeExecutor(mockRecipe, options);
        expect(executor).toBeDefined();
      });
    });

    describe('execute', () => {
      it('should execute simple recipe successfully', async () => {
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(result.results.size).toBe(1);
        expect(result.results.get('test-task')).toEqual({ result: 'success' });
        expect(result.errors.size).toBe(0);
        expect(result.skipped.size).toBe(0);
        expect(result.status.total).toBe(1);
        expect(result.status.completed).toBe(1);
        expect(result.status.failed).toBe(0);
        expect(result.status.skipped).toBe(0);
        expect(mockTask.handler).toHaveBeenCalledTimes(1);
      });

      it('should execute recipe with multiple tasks', async () => {
        const task2: Task = {
          id: 'task-2',
          name: 'task-2',
          handler: vi.fn().mockResolvedValue({ result: 'task2' }),
          options: {},
          dependencies: [],
          tags: []
        };
        const task3: Task = {
          id: 'task-3',
          name: 'task-3',
          handler: vi.fn().mockResolvedValue({ result: 'task3' }),
          options: {},
          dependencies: [],
          tags: []
        };

        mockRecipe.tasks.set('task-2', task2);
        mockRecipe.tasks.set('task-3', task3);
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(result.results.size).toBe(3);
        expect(result.status.completed).toBe(3);
        expect(mockTask.handler).toHaveBeenCalled();
        expect(task2.handler).toHaveBeenCalled();
        expect(task3.handler).toHaveBeenCalled();
      });

      it('should respect task dependencies', async () => {
        const executionOrder: string[] = [];
        
        const task1: Task = {
          id: 'task-1',
          name: 'task-1',
          handler: vi.fn(async () => {
            executionOrder.push('task-1');
            return { result: 'task1' };
          }),
          options: {},
          dependencies: [],
          tags: []
        };

        const task2: Task = {
          id: 'task-2',
          name: 'task-2',
          dependencies: ['task-1'],
          handler: vi.fn(async () => {
            executionOrder.push('task-2');
            return { result: 'task2' };
          }),
          options: {},
          tags: []
        };

        const task3: Task = {
          id: 'task-3',
          name: 'task-3',
          dependencies: ['task-2'],
          handler: vi.fn(async () => {
            executionOrder.push('task-3');
            return { result: 'task3' };
          }),
          options: {},
          tags: []
        };

        mockRecipe.tasks = new Map([
          ['task-1', task1],
          ['task-2', task2],
          ['task-3', task3]
        ]);
        
        const executor = new RecipeExecutor(mockRecipe);
        await executor.execute();

        expect(executionOrder).toEqual(['task-1', 'task-2', 'task-3']);
      });

      it('should handle dry run mode', async () => {
        const executor = new RecipeExecutor(mockRecipe, { dryRun: true });
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(result.results.get('test-task')).toEqual({ dryRun: true });
        expect(mockTask.handler).not.toHaveBeenCalled();
      });

      it('should handle task errors', async () => {
        mockTask.handler = vi.fn().mockRejectedValue(new Error('Task failed'));
        
        const executor = new RecipeExecutor(mockRecipe);
        await expect(executor.execute()).rejects.toThrow('Task failed');
      });

      it('should continue on error when configured', async () => {
        const task2: Task = {
          id: 'task-2',
          name: 'task-2',
          handler: vi.fn().mockResolvedValue({ result: 'task2' }),
          options: {},
          dependencies: [],
          tags: []
        };

        mockTask.handler = vi.fn().mockRejectedValue(new Error('Task failed'));
        mockRecipe.tasks.set('task-2', task2);
        
        const executor = new RecipeExecutor(mockRecipe, { continueOnError: true });
        const result = await executor.execute();

        expect(result.success).toBe(false);
        expect(result.errors.size).toBe(1);
        expect(result.results.size).toBe(1);
        expect(result.results.get('task-2')).toEqual({ result: 'task2' });
      });

      it('should skip tasks when condition is false', async () => {
        mockTask.options.when = false;
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(result.skipped.size).toBe(1);
        expect(result.skipped.has('test-task')).toBe(true);
        expect(mockTask.handler).not.toHaveBeenCalled();
      });

      it('should skip tasks when unless condition is true', async () => {
        mockTask.options.unless = true;
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(result.skipped.size).toBe(1);
        expect(mockTask.handler).not.toHaveBeenCalled();
      });

      it('should handle SkipTaskError', async () => {
        mockTask.handler = vi.fn().mockImplementation(() => {
          throw new SkipTaskError('Skipped by handler');
        });
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        // SkipTaskError is still counted as an error but also marked as skipped
        expect(result.success).toBe(false);
        expect(result.skipped.size).toBe(1);
        expect(result.errors.size).toBe(1);
      });

      it('should handle task timeout', async () => {
        mockTask.handler = vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { result: 'success' };
        });
        mockTask.options.timeout = 50;
        
        const executor = new RecipeExecutor(mockRecipe);
        await expect(executor.execute()).rejects.toThrow('timed out');
      });

      it('should retry failed tasks', async () => {
        let attempts = 0;
        mockTask.handler = vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return { result: 'success' };
        });
        mockTask.options.retry = { maxAttempts: 3, delay: 10 };
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(mockTask.handler).toHaveBeenCalledTimes(3);
        expect(result.results.get('test-task')).toEqual({ result: 'success' });
      });

      it('should fail after max retry attempts', async () => {
        mockTask.handler = vi.fn().mockRejectedValue(new Error('Persistent failure'));
        mockTask.options.retry = { maxAttempts: 2, delay: 10 };
        
        const executor = new RecipeExecutor(mockRecipe);
        await expect(executor.execute()).rejects.toThrow('Persistent failure');
        expect(mockTask.handler).toHaveBeenCalledTimes(2);
      });

      it('should validate task variables', async () => {
        mockTask.metadata = { requiredVars: ['required'] };
        
        const executor = new RecipeExecutor(mockRecipe);
        await expect(executor.execute()).rejects.toThrow();
      });

      it('should execute task on multiple hosts', async () => {
        mockTask.options.hosts = ['host1', 'host2'];
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(mockTask.handler).toHaveBeenCalledTimes(2);
        const taskResult = result.results.get('test-task') as any;
        expect(taskResult.hosts).toHaveLength(2);
      });

      it('should filter tasks by host', async () => {
        mockTask.options.hosts = ['host1', 'host2'];
        
        const executor = new RecipeExecutor(mockRecipe, { hosts: ['host3'] });
        const result = await executor.execute();

        expect(result.skipped.size).toBe(1);
        expect(mockTask.handler).not.toHaveBeenCalled();
      });

      it('should filter tasks by tags', async () => {
        mockTask.tags = ['tag1', 'tag2'];
        
        const executor = new RecipeExecutor(mockRecipe, { tags: ['tag3'] });
        const result = await executor.execute();

        expect(result.skipped.size).toBe(1);
        expect(mockTask.handler).not.toHaveBeenCalled();
      });

      it('should match tasks with overlapping tags', async () => {
        mockTask.tags = ['tag1', 'tag2'];
        
        const executor = new RecipeExecutor(mockRecipe, { tags: ['tag2', 'tag3'] });
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(mockTask.handler).toHaveBeenCalled();
      });

      it('should execute rollback on failure', async () => {
        const rollbackFn = vi.fn().mockResolvedValue(undefined);
        mockTask.handler = vi.fn().mockRejectedValue(new Error('Task failed'));
        mockTask.metadata = { rollback: rollbackFn };
        
        const executor = new RecipeExecutor(mockRecipe);
        await expect(executor.execute()).rejects.toThrow('Task failed');
        expect(rollbackFn).toHaveBeenCalled();
      });

      it('should handle rollback errors gracefully', async () => {
        mockTask.handler = vi.fn().mockRejectedValue(new Error('Task failed'));
        mockTask.metadata = { rollback: vi.fn().mockRejectedValue(new Error('Rollback failed')) };
        
        const executor = new RecipeExecutor(mockRecipe);
        await expect(executor.execute()).rejects.toThrow('Task failed');
      });
    });

    describe('hooks', () => {
      it('should execute recipe lifecycle hooks', async () => {
        const beforeHook = vi.fn().mockResolvedValue(undefined);
        const afterHook = vi.fn().mockResolvedValue(undefined);
        const beforeEachHook = vi.fn().mockResolvedValue(undefined);
        const afterEachHook = vi.fn().mockResolvedValue(undefined);
        const onErrorHook = vi.fn().mockResolvedValue(undefined);
        
        const hooks: RecipeHooks = {
          before: [beforeHook],
          after: [afterHook],
          beforeEach: beforeEachHook,
          afterEach: afterEachHook,
          onError: [onErrorHook]
        };
        
        mockRecipe.hooks = hooks;
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(beforeHook).toHaveBeenCalled();
        expect(afterHook).toHaveBeenCalled();
        expect(beforeEachHook).toHaveBeenCalledWith(mockTask);
        expect(afterEachHook).toHaveBeenCalledWith(mockTask, { result: 'success' });
        expect(onErrorHook).not.toHaveBeenCalled();
      });

      it('should execute executor hooks', async () => {
        const hooks = {
          before: vi.fn().mockResolvedValue(undefined),
          after: vi.fn().mockResolvedValue(undefined),
          beforeTask: vi.fn().mockResolvedValue(undefined),
          afterTask: vi.fn().mockResolvedValue(undefined),
          onError: vi.fn().mockResolvedValue(undefined)
        };
        
        const executor = new RecipeExecutor(mockRecipe, { hooks });
        const result = await executor.execute();

        expect(hooks.before).toHaveBeenCalled();
        expect(hooks.after).toHaveBeenCalled();
        expect(hooks.beforeTask).toHaveBeenCalledWith(mockTask);
        expect(hooks.afterTask).toHaveBeenCalledWith(mockTask, { result: 'success' });
        expect(hooks.onError).not.toHaveBeenCalled();
      });

      it('should execute error hooks on failure', async () => {
        const recipeOnErrorHook = vi.fn().mockResolvedValue(undefined);
        const recipeHooks: RecipeHooks = {
          onError: [recipeOnErrorHook]
        };
        const executorHooks = {
          onError: vi.fn().mockResolvedValue(undefined)
        };
        
        mockRecipe.hooks = recipeHooks;
        mockTask.handler = vi.fn().mockRejectedValue(new Error('Task failed'));
        
        const executor = new RecipeExecutor(mockRecipe, { 
          hooks: executorHooks,
          continueOnError: true 
        });
        await executor.execute();

        expect(recipeOnErrorHook).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
        expect(executorHooks.onError).toHaveBeenCalledWith(mockTask, expect.any(Error));
      });
    });

    describe('stop', () => {
      it('should stop execution', async () => {
        const executor = new RecipeExecutor(mockRecipe);
        await executor.stop();
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe('getProgress', () => {
      it('should return execution progress', async () => {
        const executor = new RecipeExecutor(mockRecipe);
        const progress = executor.getProgress();

        expect(progress).toEqual({
          completed: 0,
          total: 1,
          percentage: 0,
          running: [],
          failed: []
        });
      });
    });

    describe('condition evaluation', () => {
      it('should evaluate string conditions', async () => {
        mockTask.options.when = 'vars.enabled === true';
        
        const executor = new RecipeExecutor(mockRecipe, {
          globalVars: { enabled: true }
        });
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(mockTask.handler).toHaveBeenCalled();
      });

      it('should handle invalid string conditions', async () => {
        mockTask.options.when = 'invalid javascript {{';
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.skipped.size).toBe(1);
        expect(mockTask.handler).not.toHaveBeenCalled();
      });

      it('should evaluate function conditions', async () => {
        mockTask.options.when = () => true;
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(mockTask.handler).toHaveBeenCalled();
      });

      it('should skip async function conditions', async () => {
        mockTask.options.when = async () => true;
        
        const executor = new RecipeExecutor(mockRecipe);
        const result = await executor.execute();

        expect(result.skipped.size).toBe(1);
        expect(mockTask.handler).not.toHaveBeenCalled();
      });
    });
  });

  describe('executeRecipe', () => {
    it('should execute recipe with helper function', async () => {
      const result = await executeRecipe(mockRecipe);
      
      expect(result.success).toBe(true);
      expect(result.results.size).toBe(1);
      expect(mockTask.handler).toHaveBeenCalled();
    });

    it('should pass options to executor', async () => {
      const result = await executeRecipe(mockRecipe, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.results.get('test-task')).toEqual({ dryRun: true });
      expect(mockTask.handler).not.toHaveBeenCalled();
    });
  });
});