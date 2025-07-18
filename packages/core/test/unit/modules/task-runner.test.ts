import { it, vi, expect, describe, beforeEach } from 'vitest';

import { TaskRunner } from '../../../src/modules/task-runner.js';

import type { Task, XecModule, TaskContext } from '../../../src/modules/environment-types.js';

// Mock environment manager
vi.mock('../../../src/modules/environment-manager.js', () => ({
  EnvironmentManager: vi.fn().mockImplementation(() => ({
    detectEnvironment: vi.fn().mockResolvedValue({
      type: 'local',
      capabilities: { shell: true, sudo: true },
      platform: { os: 'linux', arch: 'x64', distro: 'ubuntu' }
    }),
    createTaskContext: vi.fn().mockImplementation((params = {}) => Promise.resolve({
      $: vi.fn(),
      env: {
        type: 'local',
        capabilities: { shell: true, sudo: true, docker: false, systemd: true },
        platform: { os: 'linux', arch: 'x64', distro: 'ubuntu' }
      },
      params,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      },
      fs: { read: vi.fn(), write: vi.fn() },
      http: { get: vi.fn() },
      template: { render: vi.fn() }
    })),
    cleanup: vi.fn()
  }))
}));

describe('TaskRunner', () => {
  let runner: TaskRunner;
  let mockEnvManager: any;
  let mockContext: TaskContext;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    runner = new TaskRunner();
    mockEnvManager = (runner as any).environmentManager;
    
    mockContext = {
      $: vi.fn(),
      env: {
        type: 'local',
        capabilities: { shell: true, sudo: true, docker: false, systemd: true },
        platform: { os: 'linux', arch: 'x64', distro: 'ubuntu' }
      },
      params: {},
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      } as any,
      fs: { read: vi.fn(), write: vi.fn() } as any,
      http: { get: vi.fn() } as any,
      template: { render: vi.fn() } as any
    };
    
    // Don't override the mock implementation, let it handle params dynamically
  });
  
  describe('registerModule', () => {
    it('should register a module and its tasks', () => {
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: {
          task1: {
            name: 'task1',
            run: vi.fn()
          },
          task2: {
            name: 'task2',
            run: vi.fn()
          }
        }
      };
      
      runner.registerModule(module);
      
      expect(runner.hasTask('test-module:task1')).toBe(true);
      expect(runner.hasTask('test-module:task2')).toBe(true);
      expect(runner.hasTask('task1')).toBe(true);
      expect(runner.hasTask('task2')).toBe(true);
    });
    
    it('should run setup hook when registering module', async () => {
      const setupHook = vi.fn();
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        setup: setupHook
      };
      
      runner.registerModule(module);
      
      // Setup hook is called asynchronously
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(setupHook).toHaveBeenCalledWith(expect.objectContaining({
        $: expect.any(Function),
        env: expect.any(Object),
        params: expect.any(Object)
      }));
    });
    
    it('should not override existing short task names', () => {
      const task1: Task = {
        name: 'shared-task',
        run: vi.fn().mockResolvedValue('module1')
      };
      
      const task2: Task = {
        name: 'shared-task',
        run: vi.fn().mockResolvedValue('module2')
      };
      
      const module1: XecModule = {
        name: 'module1',
        version: '1.0.0',
        tasks: { 'shared-task': task1 }
      };
      
      const module2: XecModule = {
        name: 'module2',
        version: '1.0.0',
        tasks: { 'shared-task': task2 }
      };
      
      runner.registerModule(module1);
      runner.registerModule(module2);
      
      const registeredTask = runner.getTask('shared-task');
      expect(registeredTask).toBe(task1); // First module wins
    });
  });
  
  describe('unregisterModule', () => {
    it('should unregister module and its tasks', async () => {
      const teardownHook = vi.fn();
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: {
          task1: { name: 'task1', run: vi.fn() }
        },
        teardown: teardownHook
      };
      
      runner.registerModule(module);
      runner.unregisterModule('test-module');
      
      // Teardown hook is called asynchronously
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(runner.hasTask('test-module:task1')).toBe(false);
      expect(teardownHook).toHaveBeenCalledWith(expect.objectContaining({
        $: expect.any(Function),
        env: expect.any(Object),
        params: expect.any(Object)
      }));
    });
  });
  
  describe('runTask', () => {
    it('should run a registered task', async () => {
      const taskRun = vi.fn().mockResolvedValue('result');
      const task: Task = {
        name: 'test-task',
        run: taskRun
      };
      
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: { 'test-task': task }
      };
      
      runner.registerModule(module);
      
      const result = await runner.runTask('test-task', { params: { foo: 'bar' } });
      
      expect(result).toBe('result');
      expect(taskRun).toHaveBeenCalledWith(expect.objectContaining({
        params: { foo: 'bar' },
        $: expect.any(Function),
        env: expect.any(Object),
        fs: expect.any(Object),
        http: expect.any(Object),
        log: expect.any(Object),
        template: expect.any(Object)
      }));
    });
    
    it('should throw error for unknown task', async () => {
      await expect(runner.runTask('unknown-task')).rejects.toThrow("Task 'unknown-task' not found");
    });
    
    it('should check environment hints', async () => {
      const task: Task = {
        name: 'k8s-only',
        run: vi.fn(),
        hints: {
          unsupportedEnvironments: ['local']
        }
      };
      
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: { 'k8s-only': task }
      };
      
      runner.registerModule(module);
      
      await expect(runner.runTask('k8s-only')).rejects.toThrow(
        "Task 'k8s-only' is not supported in local environment"
      );
    });
    
    it('should retry failed tasks', async () => {
      let attempts = 0;
      const taskRun = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });
      
      const task: Task = {
        name: 'flaky-task',
        run: taskRun
      };
      
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: { 'flaky-task': task }
      };
      
      runner.registerModule(module);
      
      const result = await runner.runTask('flaky-task', { retries: 2 });
      
      expect(result).toBe('success');
      expect(taskRun).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('runModuleTask', () => {
    it('should run task with module prefix', async () => {
      const taskRun = vi.fn().mockResolvedValue('result');
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: {
          'test-task': {
            name: 'test-task',
            run: taskRun
          }
        }
      };
      
      runner.registerModule(module);
      
      const result = await runner.runModuleTask('test-module', 'test-task');
      
      expect(result).toBe('result');
      expect(taskRun).toHaveBeenCalled();
    });
  });
  
  describe('getAvailableTasks', () => {
    it('should list all registered tasks', async () => {
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: {
          task1: { name: 'task1', description: 'First task', run: vi.fn() },
          task2: { name: 'task2', description: 'Second task', run: vi.fn() }
        }
      };
      
      runner.registerModule(module);
      
      const tasks = await runner.getAvailableTasks();
      
      expect(tasks).toContainEqual({
        name: 'test-module:task1',
        description: 'First task',
        module: 'test-module'
      });
      
      expect(tasks).toContainEqual({
        name: 'task1',
        description: 'First task',
        module: undefined
      });
    });
  });
  
  describe('runTasks', () => {
    beforeEach(() => {
      const module: XecModule = {
        name: 'test-module',
        version: '1.0.0',
        tasks: {
          fast: { name: 'fast', run: vi.fn().mockResolvedValue('fast-result') },
          slow: { 
            name: 'slow', 
            run: vi.fn().mockImplementation(async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              return 'slow-result';
            })
          }
        }
      };
      
      runner.registerModule(module);
    });
    
    it('should run tasks sequentially by default', async () => {
      const start = Date.now();
      
      const results = await runner.runTasks([
        { name: 'slow' },
        { name: 'fast' }
      ]);
      
      const duration = Date.now() - start;
      
      expect(results).toEqual(['slow-result', 'fast-result']);
      expect(duration).toBeGreaterThanOrEqual(50); // Sequential execution
    });
    
    it('should run tasks in parallel when specified', async () => {
      const start = Date.now();
      
      const results = await runner.runTasks([
        { name: 'slow' },
        { name: 'fast' }
      ], { parallel: true });
      
      const duration = Date.now() - start;
      
      expect(results).toEqual(['slow-result', 'fast-result']);
      expect(duration).toBeLessThan(100); // Parallel execution
    });
  });
  
  describe('cleanup', () => {
    it('should run teardown hooks for all modules', async () => {
      const teardown1 = vi.fn();
      const teardown2 = vi.fn();
      
      const module1: XecModule = {
        name: 'module1',
        version: '1.0.0',
        teardown: teardown1
      };
      
      const module2: XecModule = {
        name: 'module2',
        version: '1.0.0',
        teardown: teardown2
      };
      
      runner.registerModule(module1);
      runner.registerModule(module2);
      
      await runner.cleanup();
      
      expect(teardown1).toHaveBeenCalled();
      expect(teardown2).toHaveBeenCalled();
      expect(mockEnvManager.cleanup).toHaveBeenCalled();
    });
  });
});