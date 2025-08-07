import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { MockTTY, createMockTTY, mockProcessStreams } from '../../../helpers/mock-tty.js';
import { TaskList, taskList, type Task } from '../../../../src/components/feedback/task-list.js';

describe('TaskList', () => {
  let mockTTY: MockTTY;
  let streams: ReturnType<typeof mockProcessStreams>;

  beforeEach(() => {
    mockTTY = createMockTTY();
    streams = mockProcessStreams({ isTTY: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockTTY.cleanup();
    streams.restore();
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should run tasks sequentially', async () => {
      const order: number[] = [];
      const tasks: Task[] = [
        {
          title: 'Task 1',
          task: async () => {
            order.push(1);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        },
        {
          title: 'Task 2',
          task: async () => {
            order.push(2);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      
      // Advance through tasks
      await vi.runAllTimersAsync();
      await runPromise;
      
      expect(order).toEqual([1, 2]);
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✔ Task 1');
      expect(output).toContain('✔ Task 2');
    });

    it('should run concurrent tasks', async () => {
      const running = new Set<number>();
      const maxConcurrent = { value: 0 };
      
      const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
        title: `Task ${i + 1}`,
        task: async () => {
          running.add(i);
          maxConcurrent.value = Math.max(maxConcurrent.value, running.size);
          await new Promise(resolve => setTimeout(resolve, 100));
          running.delete(i);
        }
      }));

      const list = new TaskList({ tasks, concurrent: 3 });
      const runPromise = list.run();
      
      await vi.runAllTimersAsync();
      await runPromise;
      
      expect(maxConcurrent.value).toBe(3);
    });

    it('should show task output', async () => {
      const tasks: Task[] = [
        {
          title: 'Build',
          task: (ctx, task) => {
            task.log('Compiling...');
          }
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Compiling...');
    });

    it('should support spinner', async () => {
      const tasks: Task[] = [
        {
          title: 'Download',
          task: async (ctx, task) => {
            const spinner = task.spin('Downloading...');
            await new Promise(resolve => setTimeout(resolve, 100));
            spinner.stop();
            task.succeed('Downloaded');
          }
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Downloaded');
    });

    it('should update context', async () => {
      interface Context {
        value?: number;
        doubled?: number;
      }

      const tasks: Task<Context>[] = [
        {
          title: 'Set value',
          task: (ctx) => {
            ctx.value = 10;
          }
        },
        {
          title: 'Double value',
          task: (ctx) => {
            ctx.doubled = (ctx.value || 0) * 2;
          }
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      
      await vi.runAllTimersAsync();
      const context = await runPromise;
      
      expect(context.value).toBe(10);
      expect(context.doubled).toBe(20);
    });

    it('should use factory function', async () => {
      const tasks: Task[] = [
        {
          title: 'Quick task',
          task: () => {}
        }
      ];

      const list = taskList(tasks);
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✔ Quick task');
    });
  });

  describe('skip conditions', () => {
    it('should skip task with boolean', async () => {
      const tasks: Task[] = [
        {
          title: 'Skipped task',
          task: () => {
            throw new Error('Should not run');
          },
          skip: true
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('○ Skipped task');
    });

    it('should skip task with reason', async () => {
      const tasks: Task[] = [
        {
          title: 'Conditional task',
          task: () => {},
          skip: 'Not needed in test environment'
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Not needed in test environment');
    });

    it('should skip task with function', async () => {
      interface Context {
        skipInstall?: boolean;
      }

      const tasks: Task<Context>[] = [
        {
          title: 'Install dependencies',
          task: () => {},
          skip: (ctx) => ctx.skipInstall ? 'Skipping install' : false
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run({ skipInstall: true });
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Skipping install');
    });
  });

  describe('error handling', () => {
    it('should handle task failure', async () => {
      const tasks: Task[] = [
        {
          title: 'Failing task',
          task: () => {
            throw new Error('Task failed');
          }
        }
      ];

      const list = new TaskList({ tasks });
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await expect(runPromise).rejects.toThrow('Task failed');
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✖ Failing task');
      expect(output).toContain('Task failed');
    });

    it('should continue on error when configured', async () => {
      const tasks: Task[] = [
        {
          title: 'Fail',
          task: () => {
            throw new Error('Error');
          }
        },
        {
          title: 'Success',
          task: () => {}
        }
      ];

      const list = new TaskList({ tasks, stopOnError: false });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✖ Fail');
      expect(output).toContain('✔ Success');
    });

    it('should handle task.fail()', async () => {
      const tasks: Task[] = [
        {
          title: 'Custom fail',
          task: (ctx, task) => {
            task.fail('Custom error message');
          }
        }
      ];

      const list = new TaskList({ tasks, stopOnError: false });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✖ Custom fail');
      expect(output).toContain('Custom error message');
    });

    it('should handle task.fail() with Error', async () => {
      const error = new Error('Error object');
      const tasks: Task[] = [
        {
          title: 'Error task',
          task: (ctx, task) => {
            task.fail(error);
          }
        }
      ];

      const list = new TaskList({ tasks, stopOnError: false });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Error object');
    });
  });

  describe('retry functionality', () => {
    it('should retry failed tasks', async () => {
      let attempts = 0;
      const retrySpy = vi.fn();
      
      const tasks: Task[] = [
        {
          title: 'Flaky task',
          task: async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error('Retry me');
            }
          },
          retry: 2
        }
      ];

      const list = new TaskList({ tasks });
      list.on('retry', retrySpy);
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      expect(attempts).toBe(3);
      expect(retrySpy).toHaveBeenCalledTimes(2);
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✔ Flaky task');
    });

    it('should fail after max retries', async () => {
      let attempts = 0;
      
      const tasks: Task[] = [
        {
          title: 'Always fails',
          task: async () => {
            attempts++;
            throw new Error('Always fails');
          },
          retry: 2
        }
      ];

      const list = new TaskList({ tasks });
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await expect(runPromise).rejects.toThrow();
      
      expect(attempts).toBe(3); // Initial + 2 retries
    });
  });

  describe('rollback', () => {
    it('should run rollback on failure', async () => {
      const rollbackSpy = vi.fn();
      
      const tasks: Task[] = [
        {
          title: 'Deploy',
          task: () => {
            throw new Error('Deploy failed');
          },
          rollback: rollbackSpy
        }
      ];

      const list = new TaskList({ tasks });
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await expect(runPromise).rejects.toThrow();
      
      expect(rollbackSpy).toHaveBeenCalled();
    });

    it('should handle rollback errors', async () => {
      const tasks: Task[] = [
        {
          title: 'Deploy',
          task: () => {
            throw new Error('Deploy failed');
          },
          rollback: () => {
            throw new Error('Rollback failed');
          }
        }
      ];

      const list = new TaskList({ tasks });
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await expect(runPromise).rejects.toThrow('Task failed');
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Rollback failed');
    });
  });

  describe('task instance methods', () => {
    it('should handle succeed with message', async () => {
      const tasks: Task[] = [
        {
          title: 'Build',
          task: (ctx, task) => {
            task.succeed('Build complete!');
          }
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Build complete!');
    });

    it('should handle skip in task', async () => {
      const tasks: Task[] = [
        {
          title: 'Optional task',
          task: (ctx, task) => {
            task.skip('Not needed');
          }
        }
      ];

      const list = new TaskList({ tasks });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('○ Optional task');
      expect(output).toContain('Not needed');
    });
  });

  describe('events', () => {
    it('should emit complete event', async () => {
      const completeSpy = vi.fn();
      const tasks: Task[] = [
        { title: 'Task', task: () => {} }
      ];

      const list = new TaskList({ tasks });
      list.on('complete', completeSpy);
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await runPromise;
      
      expect(completeSpy).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should emit error event', async () => {
      const errorSpy = vi.fn();
      const tasks: Task[] = [
        {
          title: 'Error task',
          task: () => {
            throw new Error('Test error');
          }
        }
      ];

      const list = new TaskList({ tasks });
      list.on('error', errorSpy);
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      await expect(runPromise).rejects.toThrow();
      
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty task list', async () => {
      const list = new TaskList({ tasks: [] });
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      const context = await runPromise;
      
      expect(context).toEqual({});
    });

    it('should prevent multiple runs', async () => {
      const tasks: Task[] = [
        {
          title: 'Long task',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      ];

      const list = new TaskList({ tasks });
      
      const run1 = list.run();
      await expect(list.run()).rejects.toThrow('already running');
      
      await vi.runAllTimersAsync();
      await run1;
    });

    it('should merge initial context', async () => {
      interface Context {
        initial: string;
        added?: string;
      }

      const tasks: Task<Context>[] = [
        {
          title: 'Add value',
          task: (ctx) => {
            ctx.added = 'added';
          }
        }
      ];

      const list = new TaskList({ 
        tasks,
        context: { initial: 'value' }
      });
      
      const runPromise = list.run();
      await vi.runAllTimersAsync();
      const context = await runPromise;
      
      expect(context).toEqual({
        initial: 'value',
        added: 'added'
      });
    });
  });
});