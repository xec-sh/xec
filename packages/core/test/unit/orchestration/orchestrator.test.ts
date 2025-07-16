import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { Orchestrator, TaskExecution, OrchestratorConfig } from '../../../src/orchestration/orchestrator.js';

describe('orchestration/orchestrator', () => {
  let orchestrator: Orchestrator;
  let config: OrchestratorConfig;

  beforeEach(() => {
    config = {
      parallelism: 2,
      strategy: 'sequential',
      maxConcurrency: 5,
      retryPolicy: {
        maxRetries: 2,
        retryDelay: 100,
        backoffMultiplier: 2,
      },
    };
    orchestrator = new Orchestrator(config);
  });

  afterEach(() => {
    orchestrator.reset();
    orchestrator.removeAllListeners();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const defaultOrchestrator = new Orchestrator();
      const defaultConfig = defaultOrchestrator.getConfig();
      
      expect(defaultConfig.parallelism).toBe(1);
      expect(defaultConfig.strategy).toBe('sequential');
      expect(defaultConfig.maxConcurrency).toBe(10);
      expect(defaultConfig.retryPolicy?.maxRetries).toBe(3);
      expect(defaultConfig.retryPolicy?.retryDelay).toBe(1000);
      expect(defaultConfig.retryPolicy?.backoffMultiplier).toBe(2);
    });

    it('should create with custom config', () => {
      const customConfig = orchestrator.getConfig();
      
      expect(customConfig.parallelism).toBe(2);
      expect(customConfig.strategy).toBe('sequential');
      expect(customConfig.maxConcurrency).toBe(5);
      expect(customConfig.retryPolicy?.maxRetries).toBe(2);
      expect(customConfig.retryPolicy?.retryDelay).toBe(100);
      expect(customConfig.retryPolicy?.backoffMultiplier).toBe(2);
    });

    it('should be an EventEmitter', () => {
      expect(orchestrator.on).toBeDefined();
      expect(orchestrator.emit).toBeDefined();
      expect(orchestrator.removeAllListeners).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const config1 = orchestrator.getConfig();
      const config2 = orchestrator.getConfig();
      
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('executeTask', () => {
    it('should execute a function task successfully', async () => {
      const task = vi.fn().mockResolvedValue('result');
      const context = { foo: 'bar' };
      
      const result = await orchestrator.executeTask(task, context);
      
      expect(result).toBe('result');
      expect(task).toHaveBeenCalledWith(context);
    });

    it('should execute an object task with execute method', async () => {
      const task = {
        id: 'task-1',
        name: 'Test Task',
        execute: vi.fn().mockResolvedValue('result'),
      };
      const context = { foo: 'bar' };
      
      const result = await orchestrator.executeTask(task, context);
      
      expect(result).toBe('result');
      expect(task.execute).toHaveBeenCalledWith(context);
    });

    it('should throw error for invalid task', async () => {
      const task = { id: 'task-1', name: 'Invalid Task' };
      const context = { foo: 'bar' };
      
      await expect(orchestrator.executeTask(task, context)).rejects.toThrow(
        'Task must be a function or have an execute method'
      );
    });

    it('should emit lifecycle events', async () => {
      const task = vi.fn().mockResolvedValue('result');
      const context = { foo: 'bar' };
      
      const events: { type: string; execution: TaskExecution }[] = [];
      
      orchestrator.on('taskQueued', (execution) => {
        events.push({ type: 'taskQueued', execution: { ...execution } });
      });
      orchestrator.on('taskStarted', (execution) => {
        events.push({ type: 'taskStarted', execution: { ...execution } });
      });
      orchestrator.on('taskCompleted', (execution) => {
        events.push({ type: 'taskCompleted', execution: { ...execution } });
      });
      
      await orchestrator.executeTask(task, context);
      
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('taskQueued');
      expect(events[0].execution.status).toBe('pending');
      expect(events[1].type).toBe('taskStarted');
      expect(events[1].execution.status).toBe('running');
      expect(events[2].type).toBe('taskCompleted');
      expect(events[2].execution.status).toBe('completed');
      expect(events[2].execution.result).toBe('result');
    });

    it('should emit taskFailed event on failure', async () => {
      const error = new Error('Task failed');
      const task = vi.fn().mockRejectedValue(error);
      const context = { foo: 'bar' };
      
      const events: { type: string; execution: TaskExecution }[] = [];
      
      orchestrator.on('taskFailed', (execution) => {
        events.push({ type: 'taskFailed', execution });
      });
      
      await expect(orchestrator.executeTask(task, context)).rejects.toThrow('Task failed');
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('taskFailed');
      expect(events[0].execution.status).toBe('failed');
      expect(events[0].execution.error).toBe(error);
    });

    it('should track execution in executions map', async () => {
      const task = {
        id: 'task-1',
        name: 'Test Task',
        execute: vi.fn().mockResolvedValue('result'),
      };
      const context = { foo: 'bar' };
      
      await orchestrator.executeTask(task, context);
      
      const executions = orchestrator.getExecutions();
      expect(executions).toHaveLength(1);
      expect(executions[0].id).toBe('task-1');
      expect(executions[0].name).toBe('Test Task');
      expect(executions[0].status).toBe('completed');
      expect(executions[0].result).toBe('result');
    });

    it('should generate random id if task has no id', async () => {
      const task = {
        name: 'Test Task',
        execute: vi.fn().mockResolvedValue('result'),
      };
      const context = { foo: 'bar' };
      
      await orchestrator.executeTask(task, context);
      
      const executions = orchestrator.getExecutions();
      expect(executions).toHaveLength(1);
      expect(executions[0].id).toBeDefined();
      expect(executions[0].id).not.toBe('');
    });

    it('should set start and end times', async () => {
      const task = vi.fn().mockResolvedValue('result');
      const context = { foo: 'bar' };
      
      const startTime = Date.now();
      await orchestrator.executeTask(task, context);
      const endTime = Date.now();
      
      const executions = orchestrator.getExecutions();
      expect(executions[0].startTime).toBeDefined();
      expect(executions[0].endTime).toBeDefined();
      expect(executions[0].startTime!.getTime()).toBeGreaterThanOrEqual(startTime);
      expect(executions[0].endTime!.getTime()).toBeLessThanOrEqual(endTime);
    });
  });

  describe('retry mechanism', () => {
    it('should retry failed tasks', async () => {
      let attemptCount = 0;
      const task = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Retry me');
        }
        return 'success';
      });
      const context = { foo: 'bar' };
      
      const result = await orchestrator.executeTask(task, context);
      
      expect(result).toBe('success');
      expect(task).toHaveBeenCalledTimes(3);
    });

    it('should emit taskRetrying event', async () => {
      let attemptCount = 0;
      const task = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Retry me');
        }
        return 'success';
      });
      const context = { foo: 'bar' };
      
      const retryEvents: any[] = [];
      orchestrator.on('taskRetrying', (event) => {
        retryEvents.push({ ...event });
      });
      
      await orchestrator.executeTask(task, context);
      
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].delay).toBe(200); // Delay is multiplied after first failure
    });

    it('should apply backoff multiplier', async () => {
      let attemptCount = 0;
      const task = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Retry me');
        }
        return 'success';
      });
      const context = { foo: 'bar' };
      
      const retryEvents: any[] = [];
      orchestrator.on('taskRetrying', (event) => {
        retryEvents.push({ ...event });
      });
      
      await orchestrator.executeTask(task, context);
      
      expect(retryEvents).toHaveLength(2);
      expect(retryEvents[0].delay).toBe(200); // After first failure: 100 * 2
      expect(retryEvents[1].delay).toBe(400); // After second failure: 200 * 2
    });

    it('should throw after max retries', async () => {
      const task = vi.fn().mockRejectedValue(new Error('Always fails'));
      const context = { foo: 'bar' };
      
      await expect(orchestrator.executeTask(task, context)).rejects.toThrow('Always fails');
      expect(task).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('executeTasks', () => {
    describe('sequential strategy', () => {
      it('should execute tasks sequentially', async () => {
        const executionOrder: number[] = [];
        const tasks = [
          vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            executionOrder.push(1);
            return 'result1';
          }),
          vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            executionOrder.push(2);
            return 'result2';
          }),
          vi.fn().mockImplementation(async () => {
            executionOrder.push(3);
            return 'result3';
          }),
        ];
        const context = { foo: 'bar' };
        
        const results = await orchestrator.executeTasks(tasks, context);
        
        expect(results).toEqual(['result1', 'result2', 'result3']);
        expect(executionOrder).toEqual([1, 2, 3]);
      });

      it('should stop on first failure', async () => {
        const tasks = [
          vi.fn().mockResolvedValue('result1'),
          vi.fn().mockRejectedValue(new Error('Task 2 failed')),
          vi.fn().mockResolvedValue('result3'),
        ];
        const context = { foo: 'bar' };
        
        await expect(orchestrator.executeTasks(tasks, context)).rejects.toThrow('Task 2 failed');
        
        expect(tasks[0]).toHaveBeenCalled();
        expect(tasks[1]).toHaveBeenCalled();
        expect(tasks[2]).not.toHaveBeenCalled();
      });
    });

    describe('parallel strategy', () => {
      beforeEach(() => {
        orchestrator = new Orchestrator({ ...config, strategy: 'parallel' });
      });

      it('should execute tasks in parallel', async () => {
        const executionOrder: number[] = [];
        const tasks = [
          vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            executionOrder.push(1);
            return 'result1';
          }),
          vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            executionOrder.push(2);
            return 'result2';
          }),
          vi.fn().mockImplementation(async () => {
            executionOrder.push(3);
            return 'result3';
          }),
        ];
        const context = { foo: 'bar' };
        
        const results = await orchestrator.executeTasks(tasks, context);
        
        expect(results).toEqual(['result1', 'result2', 'result3']);
        expect(executionOrder).toEqual([3, 2, 1]); // Fastest first
      });

      it('should fail fast on any task failure', async () => {
        const tasks = [
          vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'result1';
          }),
          vi.fn().mockRejectedValue(new Error('Task 2 failed')),
          vi.fn().mockResolvedValue('result3'),
        ];
        const context = { foo: 'bar' };
        
        await expect(orchestrator.executeTasks(tasks, context)).rejects.toThrow('Task 2 failed');
        
        // All tasks should have been started
        expect(tasks[0]).toHaveBeenCalled();
        expect(tasks[1]).toHaveBeenCalled();
        expect(tasks[2]).toHaveBeenCalled();
      });
    });

    describe('batch strategy', () => {
      beforeEach(() => {
        orchestrator = new Orchestrator({ ...config, strategy: 'batch', parallelism: 2 });
      });

      it('should execute tasks in batches', async () => {
        const executionTimes: number[] = [];
        const tasks = Array(5).fill(null).map((_, i) => 
          vi.fn().mockImplementation(async () => {
            executionTimes.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 50));
            return `result${i + 1}`;
          })
        );
        const context = { foo: 'bar' };
        
        const results = await orchestrator.executeTasks(tasks, context);
        
        expect(results).toEqual(['result1', 'result2', 'result3', 'result4', 'result5']);
        
        // Check batching: tasks 0,1 should start together, then 2,3, then 4
        expect(executionTimes[1] - executionTimes[0]).toBeLessThan(10);
        expect(executionTimes[2] - executionTimes[1]).toBeGreaterThan(40);
        expect(executionTimes[3] - executionTimes[2]).toBeLessThan(10);
        expect(executionTimes[4] - executionTimes[3]).toBeGreaterThan(40);
      });
    });

    it('should throw error for unknown strategy', async () => {
      const invalidOrchestrator = new Orchestrator({ 
        strategy: 'invalid' as any 
      });
      
      await expect(invalidOrchestrator.executeTasks([], {})).rejects.toThrow(
        'Unknown strategy: invalid'
      );
    });
  });

  describe('concurrency control', () => {
    it('should respect maxConcurrency limit', async () => {
      orchestrator = new Orchestrator({ 
        strategy: 'parallel',
        maxConcurrency: 2 
      });
      
      let runningCount = 0;
      let maxRunning = 0;
      
      const tasks = Array(5).fill(null).map(() => 
        vi.fn().mockImplementation(async () => {
          runningCount++;
          maxRunning = Math.max(maxRunning, runningCount);
          await new Promise(resolve => setTimeout(resolve, 100));
          runningCount--;
          return 'result';
        })
      );
      const context = { foo: 'bar' };
      
      await orchestrator.executeTasks(tasks, context);
      
      expect(maxRunning).toBeLessThanOrEqual(2);
    });

    it('should wait for capacity before starting new tasks', async () => {
      orchestrator = new Orchestrator({ 
        strategy: 'parallel',
        maxConcurrency: 1 
      });
      
      const task1Started = vi.fn();
      const task1Continue = vi.fn();
      const task2Started = vi.fn();
      
      const task1 = vi.fn().mockImplementation(async () => {
        task1Started();
        await new Promise(resolve => {
          task1Continue.mockImplementation(resolve);
        });
        return 'result1';
      });
      
      const task2 = vi.fn().mockImplementation(async () => {
        task2Started();
        return 'result2';
      });
      
      const promise = orchestrator.executeTasks([task1, task2], {});
      
      // Wait for task1 to start
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(task1Started).toHaveBeenCalled();
      expect(task2Started).not.toHaveBeenCalled();
      
      // Let task1 complete
      task1Continue();
      
      await promise;
      
      expect(task2Started).toHaveBeenCalled();
    });
  });

  describe('execution tracking', () => {
    it('should track all executions', async () => {
      const tasks = [
        { id: 'task-1', name: 'Task 1', execute: vi.fn().mockResolvedValue('result1') },
        { id: 'task-2', name: 'Task 2', execute: vi.fn().mockResolvedValue('result2') },
        { id: 'task-3', name: 'Task 3', execute: vi.fn().mockResolvedValue('result3') },
      ];
      const context = { foo: 'bar' };
      
      await orchestrator.executeTasks(tasks, context);
      
      const executions = orchestrator.getExecutions();
      expect(executions).toHaveLength(3);
      expect(executions.map(e => e.id)).toEqual(['task-1', 'task-2', 'task-3']);
      expect(executions.every(e => e.status === 'completed')).toBe(true);
    });

    it('should get specific execution by id', async () => {
      const task = {
        id: 'task-1',
        name: 'Test Task',
        execute: vi.fn().mockResolvedValue('result'),
      };
      const context = { foo: 'bar' };
      
      await orchestrator.executeTask(task, context);
      
      const execution = orchestrator.getExecution('task-1');
      expect(execution).toBeDefined();
      expect(execution?.id).toBe('task-1');
      expect(execution?.name).toBe('Test Task');
      expect(execution?.status).toBe('completed');
      
      const notFound = orchestrator.getExecution('non-existent');
      expect(notFound).toBeUndefined();
    });

    it('should track running state', async () => {
      expect(orchestrator.isRunning()).toBe(false);
      
      let resolveTask: () => void;
      const task = vi.fn().mockImplementation(() => 
        new Promise(resolve => {
          resolveTask = () => resolve('result');
        })
      );
      
      const promise = orchestrator.executeTask(task, {});
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(orchestrator.isRunning()).toBe(true);
      
      resolveTask!();
      await promise;
      
      expect(orchestrator.isRunning()).toBe(false);
    });
  });

  describe('waitForCompletion', () => {
    it('should wait for all tasks to complete', async () => {
      orchestrator = new Orchestrator({ strategy: 'parallel' });
      
      const tasks = Array(3).fill(null).map((_, i) => 
        vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, (i + 1) * 50));
          return `result${i + 1}`;
        })
      );
      
      const promise = orchestrator.executeTasks(tasks, {});
      
      // Wait a bit for tasks to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(orchestrator.isRunning()).toBe(true);
      
      await orchestrator.waitForCompletion();
      
      expect(orchestrator.isRunning()).toBe(false);
      
      const results = await promise;
      expect(results).toEqual(['result1', 'result2', 'result3']);
    });

    it('should return immediately if no tasks running', async () => {
      const start = Date.now();
      await orchestrator.waitForCompletion();
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
  });

  describe('reset', () => {
    it('should clear all executions and running tasks', async () => {
      const tasks = [
        { id: 'task-1', execute: vi.fn().mockResolvedValue('result1') },
        { id: 'task-2', execute: vi.fn().mockResolvedValue('result2') },
      ];
      
      await orchestrator.executeTasks(tasks, {});
      
      expect(orchestrator.getExecutions()).toHaveLength(2);
      
      orchestrator.reset();
      
      expect(orchestrator.getExecutions()).toHaveLength(0);
      expect(orchestrator.isRunning()).toBe(false);
    });

    it('should allow reuse after reset', async () => {
      const task = { id: 'task-1', execute: vi.fn().mockResolvedValue('result') };
      
      await orchestrator.executeTask(task, {});
      orchestrator.reset();
      await orchestrator.executeTask(task, {});
      
      const executions = orchestrator.getExecutions();
      expect(executions).toHaveLength(1);
      expect(executions[0].id).toBe('task-1');
    });
  });

  describe('error handling', () => {
    it('should handle sync errors in tasks', async () => {
      const task = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      
      await expect(orchestrator.executeTask(task, {})).rejects.toThrow('Sync error');
      
      const executions = orchestrator.getExecutions();
      expect(executions[0].status).toBe('failed');
      expect(executions[0].error?.message).toBe('Sync error');
    });

    it('should handle async errors in tasks', async () => {
      const task = vi.fn().mockRejectedValue(new Error('Async error'));
      
      await expect(orchestrator.executeTask(task, {})).rejects.toThrow('Async error');
      
      const executions = orchestrator.getExecutions();
      expect(executions[0].status).toBe('failed');
      expect(executions[0].error?.message).toBe('Async error');
    });

    it('should clean up running set on error', async () => {
      const task = vi.fn().mockRejectedValue(new Error('Failed'));
      
      await expect(orchestrator.executeTask(task, {})).rejects.toThrow();
      
      expect(orchestrator.isRunning()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty task array', async () => {
      const results = await orchestrator.executeTasks([], {});
      expect(results).toEqual([]);
    });

    it('should handle task with no name', async () => {
      const task = {
        execute: vi.fn().mockResolvedValue('result'),
      };
      
      await orchestrator.executeTask(task, {});
      
      const executions = orchestrator.getExecutions();
      expect(executions).toHaveLength(1);
      expect(executions[0].name).toBeUndefined();
    });

    it('should handle very large batch sizes', async () => {
      orchestrator = new Orchestrator({ 
        strategy: 'batch',
        parallelism: 100 
      });
      
      const tasks = Array(50).fill(null).map((_, i) => 
        vi.fn().mockResolvedValue(`result${i}`)
      );
      
      const results = await orchestrator.executeTasks(tasks, {});
      
      expect(results).toHaveLength(50);
      expect(results[0]).toBe('result0');
      expect(results[49]).toBe('result49');
    });

    it('should handle mixed task types', async () => {
      const tasks = [
        vi.fn().mockResolvedValue('function result'),
        {
          id: 'object-task',
          name: 'Object Task',
          execute: vi.fn().mockResolvedValue('object result'),
        },
      ];
      
      const results = await orchestrator.executeTasks(tasks, {});
      
      expect(results).toEqual(['function result', 'object result']);
    });

    it('should handle sync tasks', async () => {
      const task = vi.fn().mockReturnValue('sync result');
      
      const result = await orchestrator.executeTask(task, {});
      
      expect(result).toBe('sync result');
    });

    it('should cleanup properly after multiple resets', async () => {
      const task = { id: 'task-1', execute: vi.fn().mockResolvedValue('result') };
      
      await orchestrator.executeTask(task, {});
      orchestrator.reset();
      
      await orchestrator.executeTask(task, {});
      orchestrator.reset();
      
      await orchestrator.executeTask(task, {});
      
      const executions = orchestrator.getExecutions();
      expect(executions).toHaveLength(1);
    });
  });

  describe('event emissions', () => {
    it('should emit all lifecycle events in order', async () => {
      const events: string[] = [];
      const task = vi.fn().mockResolvedValue('result');
      
      orchestrator.on('taskQueued', () => events.push('queued'));
      orchestrator.on('taskStarted', () => events.push('started'));
      orchestrator.on('taskCompleted', () => events.push('completed'));
      
      await orchestrator.executeTask(task, {});
      
      expect(events).toEqual(['queued', 'started', 'completed']);
    });

    it('should include execution details in events', async () => {
      const task = {
        id: 'task-1',
        name: 'Test Task',
        execute: vi.fn().mockResolvedValue('result'),
      };
      
      let queuedExecution: TaskExecution | undefined;
      let startedExecution: TaskExecution | undefined;
      let completedExecution: TaskExecution | undefined;
      
      orchestrator.on('taskQueued', (execution) => {
        queuedExecution = { ...execution };
      });
      orchestrator.on('taskStarted', (execution) => {
        startedExecution = { ...execution };
      });
      orchestrator.on('taskCompleted', (execution) => {
        completedExecution = { ...execution };
      });
      
      await orchestrator.executeTask(task, {});
      
      expect(queuedExecution?.id).toBe('task-1');
      expect(queuedExecution?.status).toBe('pending');
      
      expect(startedExecution?.id).toBe('task-1');
      expect(startedExecution?.status).toBe('running');
      expect(startedExecution?.startTime).toBeDefined();
      
      expect(completedExecution?.id).toBe('task-1');
      expect(completedExecution?.status).toBe('completed');
      expect(completedExecution?.result).toBe('result');
      expect(completedExecution?.endTime).toBeDefined();
    });
  });

  describe('job scheduling scenarios', () => {
    it('should handle scheduled tasks with delays', async () => {
      const executionOrder: number[] = [];
      
      const task1 = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        executionOrder.push(1);
        return 'result1';
      });
      
      const task2 = vi.fn().mockImplementation(async () => {
        executionOrder.push(2);
        return 'result2';
      });
      
      // Execute task1 first, then task2
      const promise1 = orchestrator.executeTask(task1, {});
      const promise2 = orchestrator.executeTask(task2, {});
      
      await Promise.all([promise1, promise2]);
      
      // Task2 should complete before task1 due to the delay
      expect(executionOrder).toEqual([2, 1]);
    });

    it('should handle task cancellation gracefully', async () => {
      // Test that running tasks can be tracked and potentially cancelled
      let taskResolve: () => void;
      const task = vi.fn().mockImplementation(() => 
        new Promise(resolve => {
          taskResolve = () => resolve('cancelled');
        })
      );
      
      const promise = orchestrator.executeTask(task, {});
      
      // Wait a bit for the task to be marked as running
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Task should be running
      expect(orchestrator.isRunning()).toBe(true);
      
      // Simulate cancellation by resolving the task
      taskResolve!();
      await promise;
      
      expect(orchestrator.isRunning()).toBe(false);
    });

    it('should handle recursive task execution', async () => {
      let depth = 0;
      const maxDepth = 3;
      const results: string[] = [];
      
      const recursiveTask = {
        execute: vi.fn().mockImplementation(async (context: any) => {
          const currentDepth = ++depth;
          if (currentDepth < maxDepth) {
            // Execute another task recursively
            const nestedResult = await orchestrator.executeTask(recursiveTask, context);
            results.push(nestedResult);
          }
          return `depth-${currentDepth}`;
        }),
      };
      
      const result = await orchestrator.executeTask(recursiveTask, {});
      
      // The outermost call returns its depth, inner calls are stored in results
      expect(result).toBe('depth-1');
      // The recursive calls happen in reverse order due to the way they're nested
      expect(results).toEqual(['depth-3', 'depth-2']);
      expect(recursiveTask.execute).toHaveBeenCalledTimes(3);
      expect(orchestrator.getExecutions()).toHaveLength(3);
    });
  });

  describe('concurrent orchestration runs', () => {
    it('should handle multiple orchestrators independently', async () => {
      const orchestrator1 = new Orchestrator({ strategy: 'sequential' });
      const orchestrator2 = new Orchestrator({ strategy: 'parallel' });
      
      const task1 = vi.fn().mockResolvedValue('result1');
      const task2 = vi.fn().mockResolvedValue('result2');
      
      const [result1, result2] = await Promise.all([
        orchestrator1.executeTask(task1, {}),
        orchestrator2.executeTask(task2, {}),
      ]);
      
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      
      expect(orchestrator1.getExecutions()).toHaveLength(1);
      expect(orchestrator2.getExecutions()).toHaveLength(1);
    });

    it('should maintain separate event streams', async () => {
      const orchestrator1 = new Orchestrator();
      const orchestrator2 = new Orchestrator();
      
      const events1: string[] = [];
      const events2: string[] = [];
      
      orchestrator1.on('taskCompleted', () => events1.push('completed'));
      orchestrator2.on('taskCompleted', () => events2.push('completed'));
      
      const task = vi.fn().mockResolvedValue('result');
      
      await Promise.all([
        orchestrator1.executeTask(task, {}),
        orchestrator2.executeTask(task, {}),
      ]);
      
      expect(events1).toEqual(['completed']);
      expect(events2).toEqual(['completed']);
    });
  });
});