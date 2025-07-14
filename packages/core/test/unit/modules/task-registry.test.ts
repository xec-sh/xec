import { z } from 'zod';
import { it, vi, expect, describe, beforeEach } from 'vitest';

import { TaskRegistry } from '../../../src/modules/task-registry.js';

import type { TaskDefinition } from '../../../src/modules/types.js';

describe('modules/task-registry', () => {
  let registry: TaskRegistry;
  let mockTask: TaskDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new TaskRegistry();
    
    mockTask = {
      name: 'test-task',
      description: 'Test task',
      handler: vi.fn().mockResolvedValue({ result: 'success' }),
      tags: ['test', 'mock']
    };
  });

  describe('register', () => {
    it('should register a task', () => {
      registry.register('test-module', mockTask);
      
      const task = registry.get('test-module:test-task');
      expect(task).toBeDefined();
      expect(task?.name).toBe('test-task');
    });

    it('should throw error if task already registered', () => {
      registry.register('test-module', mockTask);
      
      expect(() => registry.register('test-module', mockTask)).toThrow(
        "Task 'test-module:test-task' is already registered"
      );
    });

    it('should initialize execution stats', () => {
      registry.register('test-module', mockTask);
      
      const stats = registry.getStats('test-module:test-task');
      expect(stats).toEqual({
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        averageExecutionTime: 0,
        lastExecutionTime: 0,
        lastError: null
      });
    });

    it('should organize tasks by module', () => {
      const task2: TaskDefinition = {
        name: 'task-2',
        handler: vi.fn()
      };
      
      registry.register('test-module', mockTask);
      registry.register('test-module', task2);
      
      const moduleTasks = registry.getByModule('test-module');
      expect(moduleTasks.size).toBe(2);
      expect(moduleTasks.has('test-task')).toBe(true);
      expect(moduleTasks.has('task-2')).toBe(true);
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      registry.register('test-module', mockTask);
    });

    it('should unregister a task', () => {
      registry.unregister('test-module', 'test-task');
      
      expect(registry.get('test-module:test-task')).toBeUndefined();
    });

    it('should remove from module tasks', () => {
      registry.unregister('test-module', 'test-task');
      
      const moduleTasks = registry.getByModule('test-module');
      expect(moduleTasks.size).toBe(0);
    });

    it('should remove execution stats', () => {
      registry.unregister('test-module', 'test-task');
      
      expect(registry.getStats('test-module:test-task')).toBeUndefined();
    });

    it('should cleanup empty module entries', () => {
      registry.unregister('test-module', 'test-task');
      
      const moduleTasks = registry.getByModule('test-module');
      expect(moduleTasks.size).toBe(0);
    });
  });

  describe('unregisterAll', () => {
    beforeEach(() => {
      const task2: TaskDefinition = {
        name: 'task-2',
        handler: vi.fn()
      };
      
      registry.register('test-module', mockTask);
      registry.register('test-module', task2);
      registry.register('other-module', mockTask);
    });

    it('should unregister all tasks from a module', () => {
      registry.unregisterAll('test-module');
      
      expect(registry.get('test-module:test-task')).toBeUndefined();
      expect(registry.get('test-module:task-2')).toBeUndefined();
      expect(registry.get('other-module:test-task')).toBeDefined();
    });

    it('should handle non-existent module', () => {
      // Should not throw
      registry.unregisterAll('non-existent');
      expect(true).toBe(true);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      registry.register('test-module', mockTask);
    });

    it('should get task by full name', () => {
      const task = registry.get('test-module:test-task');
      expect(task).toBe(mockTask);
    });

    it('should get task by short name', () => {
      const task = registry.get('test-task');
      expect(task).toBe(mockTask);
    });

    it('should return undefined for non-existent task', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });

    it('should prefer exact match over short name', () => {
      const shortNameTask: TaskDefinition = {
        name: 'test-module:test-task',
        handler: vi.fn()
      };
      
      registry.register('weird', shortNameTask);
      
      const task = registry.get('test-module:test-task');
      expect(task).toBe(mockTask);
    });
  });

  describe('getByModule', () => {
    it('should get all tasks for a module', () => {
      const task2: TaskDefinition = {
        name: 'task-2',
        handler: vi.fn()
      };
      
      registry.register('test-module', mockTask);
      registry.register('test-module', task2);
      
      const tasks = registry.getByModule('test-module');
      expect(tasks.size).toBe(2);
      expect(tasks.get('test-task')).toBe(mockTask);
      expect(tasks.get('task-2')).toBe(task2);
    });

    it('should return empty map for non-existent module', () => {
      const tasks = registry.getByModule('non-existent');
      expect(tasks.size).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should get all registered tasks', () => {
      const task2: TaskDefinition = {
        name: 'task-2',
        handler: vi.fn()
      };
      
      registry.register('module-1', mockTask);
      registry.register('module-2', task2);
      
      const allTasks = registry.getAll();
      expect(allTasks.size).toBe(2);
      expect(allTasks.has('module-1:test-task')).toBe(true);
      expect(allTasks.has('module-2:task-2')).toBe(true);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      registry.register('test-module', mockTask);
    });

    it('should execute task successfully', async () => {
      const params = { input: 'test' };
      const result = await registry.execute('test-module:test-task', params);
      
      expect(result).toEqual({ result: 'success' });
      expect(mockTask.handler).toHaveBeenCalledWith(params);
    });

    it('should execute task by short name', async () => {
      const result = await registry.execute('test-task', {});
      
      expect(result).toEqual({ result: 'success' });
    });

    it('should throw error for non-existent task', async () => {
      await expect(registry.execute('non-existent', {})).rejects.toThrow(
        "Task 'non-existent' not found"
      );
    });

    it('should validate input parameters', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });
      
      mockTask.parameters = schema;
      registry.register('validated', mockTask);
      
      await expect(registry.execute('validated:test-task', { name: 'test' }))
        .rejects.toThrow('Invalid parameters');
    });

    it('should pass validated parameters to handler', async () => {
      const schema = z.object({
        name: z.string().default('default')
      });
      
      mockTask.parameters = schema;
      registry.register('validated', mockTask);
      
      await registry.execute('validated:test-task', {});
      
      expect(mockTask.handler).toHaveBeenCalledWith({ name: 'default' });
    });

    it('should validate return value', async () => {
      const returnSchema = z.object({
        status: z.string()
      });
      
      mockTask.returns = returnSchema;
      mockTask.handler = vi.fn().mockResolvedValue({ invalid: 'return' });
      registry.register('validated', mockTask);
      
      await expect(registry.execute('validated:test-task', {}))
        .rejects.toThrow('Invalid return value');
    });

    it('should handle task timeout', async () => {
      mockTask.timeout = 50;
      mockTask.handler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'success' };
      });
      
      registry.register('timeout', mockTask);
      
      await expect(registry.execute('timeout:test-task', {}))
        .rejects.toThrow('Task execution timed out after 50ms');
    });

    it('should handle task with retries', async () => {
      let attempts = 0;
      mockTask.retries = 2;
      mockTask.handler = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { result: 'success' };
      });
      
      registry.register('retry', mockTask);
      
      const result = await registry.execute('retry:test-task', {});
      
      expect(result).toEqual({ result: 'success' });
      expect(mockTask.handler).toHaveBeenCalledTimes(3);
    });

    it('should update execution stats on success', async () => {
      await registry.execute('test-module:test-task', {});
      
      const stats = registry.getStats('test-module:test-task');
      expect(stats).toMatchObject({
        totalExecutions: 1,
        successCount: 1,
        failureCount: 0,
        lastError: null
      });
      // Use toBeGreaterThanOrEqual(0) since very fast executions might be 0ms
      expect(stats?.lastExecutionTime).toBeGreaterThanOrEqual(0);
      expect(stats?.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should update execution stats on failure', async () => {
      const error = new Error('Task failed');
      mockTask.handler = vi.fn().mockRejectedValue(error);
      registry.register('failing', mockTask);
      
      await expect(registry.execute('failing:test-task', {})).rejects.toThrow();
      
      const stats = registry.getStats('failing:test-task');
      expect(stats).toMatchObject({
        totalExecutions: 1,
        successCount: 0,
        failureCount: 1,
        lastError: error
      });
    });

    it('should calculate average execution time', async () => {
      // Fast execution
      mockTask.handler = vi.fn().mockResolvedValue({ result: 'fast' });
      await registry.execute('test-module:test-task', {});
      
      // Slow execution
      mockTask.handler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'slow' };
      });
      await registry.execute('test-module:test-task', {});
      
      const stats = registry.getStats('test-module:test-task');
      expect(stats?.totalExecutions).toBe(2);
      expect(stats?.averageExecutionTime).toBeGreaterThan(0);
      expect(stats?.averageExecutionTime).toBeLessThan(50);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const tasks: Array<[string, TaskDefinition]> = [
        ['module-1', {
          name: 'deploy-task',
          handler: vi.fn(),
          tags: ['deployment', 'production']
        }],
        ['module-1', {
          name: 'test-task',
          handler: vi.fn(),
          tags: ['test']
        }],
        ['module-2', {
          name: 'deploy-staging',
          handler: vi.fn(),
          tags: ['deployment', 'staging']
        }]
      ];
      
      for (const [module, task] of tasks) {
        registry.register(module, task);
      }
    });

    it('should search by name', () => {
      const results = registry.search({ name: 'deploy' });
      
      expect(results).toHaveLength(2);
      expect(results.map(t => t.name)).toContain('deploy-task');
      expect(results.map(t => t.name)).toContain('deploy-staging');
    });

    it('should search by tags', () => {
      const results = registry.search({ tags: ['deployment'] });
      
      expect(results).toHaveLength(2);
      expect(results.every(t => t.tags?.includes('deployment'))).toBe(true);
    });

    it('should search by multiple tags (AND)', () => {
      const results = registry.search({ tags: ['deployment', 'production'] });
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('deploy-task');
    });

    it('should combine search criteria', () => {
      const results = registry.search({
        name: 'deploy',
        tags: ['staging']
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('deploy-staging');
    });

    it('should return all tasks when no criteria', () => {
      const results = registry.search({});
      
      expect(results).toHaveLength(3);
    });

    it('should handle tasks without tags', () => {
      const taskWithoutTags: TaskDefinition = {
        name: 'no-tags',
        handler: vi.fn()
      };
      
      registry.register('module-3', taskWithoutTags);
      
      const results = registry.search({ tags: ['any'] });
      
      expect(results.map(t => t.name)).not.toContain('no-tags');
    });
  });

  describe('getStats/getAllStats', () => {
    it('should get stats for specific task', () => {
      registry.register('test-module', mockTask);
      
      const stats = registry.getStats('test-module:test-task');
      expect(stats).toBeDefined();
    });

    it('should return undefined for non-existent task stats', () => {
      const stats = registry.getStats('non-existent');
      expect(stats).toBeUndefined();
    });

    it('should get all stats', () => {
      registry.register('module-1', mockTask);
      registry.register('module-2', { name: 'task-2', handler: vi.fn() });
      
      const allStats = registry.getAllStats();
      expect(allStats.size).toBe(2);
      expect(allStats.has('module-1:test-task')).toBe(true);
      expect(allStats.has('module-2:task-2')).toBe(true);
    });
  });
});