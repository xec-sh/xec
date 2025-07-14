import * as fs from 'fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { Logger } from '../../../src/utils/logger.js';
import { ExecutionContext } from '../../../src/core/types.js';
import {
  scriptTask,
  loadScriptTasks,
  scriptTaskModule,
  ScriptTaskBuilder,
  dynamicScriptTask,
  ScriptTaskOptions
} from '../../../src/script/script-task.js';

// Mock modules
vi.mock('fs/promises');

describe('script/script-task', () => {
  let mockContext: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      taskId: 'test-task',
      recipeId: 'test-recipe',
      runId: 'run-123',
      vars: { contextVar: 'context-value' },
      globalVars: {},
      secrets: {},
      state: new Map(),
      host: 'localhost',
      phase: 'execute',
      attempt: 1,
      logger: new Logger({ name: 'test' }),
      dryRun: false,
      verbose: false,
      startTime: new Date()
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scriptTask', () => {
    it('should create a task for running a script file', () => {
      const options: ScriptTaskOptions = {
        path: './scripts/test.js',
        metadata: { description: 'Test script' }
      };

      const task = scriptTask('test-script', options);

      expect(task.id).toBe('test-script');
      expect(task.name).toBe('test-script');
      expect(task.description).toBe('Test script');
      expect(task.handler).toBeDefined();
    });

    it('should create a task for running inline code', () => {
      const options: ScriptTaskOptions = {
        code: 'console.log("Hello");',
        metadata: { name: 'inline-script' }
      };

      const task = scriptTask('inline-task', options);

      expect(task.id).toBe('inline-task');
      expect(task.description).toBe('Run script: inline-task');
      expect(task.handler).toBeDefined();
    });

    it('should throw error if neither path nor code is provided', () => {
      expect(() => scriptTask('invalid', {}))
        .toThrow('Script task requires either path or code option');
    });

    it('should have handler that accepts context', async () => {
      const options: ScriptTaskOptions = {
        code: 'return "test";'
      };

      const task = scriptTask('test', options);
      expect(task.handler).toBeDefined();
      expect(typeof task.handler).toBe('function');

      // Handler should accept context parameter
      expect(task.handler.length).toBeGreaterThanOrEqual(1);
    });

    it('should set default description when metadata description not provided', () => {
      const task1 = scriptTask('script1', { path: 'test.js' });
      expect(task1.description).toBe('Run script: script1');

      const task2 = scriptTask('script2', {
        code: 'test',
        metadata: { description: 'Custom' }
      });
      expect(task2.description).toBe('Custom');
    });
  });

  describe('ScriptTaskBuilder', () => {
    let builder: ScriptTaskBuilder;

    beforeEach(() => {
      builder = new ScriptTaskBuilder('test-builder');
    });

    it('should set script file path', () => {
      builder.fromFile('./test.js');
      const task = builder.build();

      expect(task).toBeDefined();
      expect(task.name).toBe('test-builder');
    });

    it('should set inline code', () => {
      builder.fromCode('return 42;');
      const task = builder.build();

      expect(task).toBeDefined();
    });

    it('should set variables', () => {
      builder.withVars({ foo: 'bar', count: 10 });
      const task = builder.build();

      expect(task).toBeDefined();
    });

    it('should set environment variables', () => {
      builder.withEnv({ NODE_ENV: 'test', DEBUG: 'true' });
      const task = builder.build();

      expect(task).toBeDefined();
    });

    it('should set working directory', () => {
      builder.inDirectory('/custom/dir');
      const task = builder.build();

      expect(task).toBeDefined();
    });

    it('should build a complete task', () => {
      const task = builder
        .fromFile('./script.js')
        .withVars({ var1: 'value1' })
        .withEnv({ ENV1: 'env-value' })
        .inDirectory('/work/dir')
        .description('Custom description')
        .build();

      expect(task.name).toBe('test-builder');
      expect(task.description).toBe('Custom description');
      expect(task.handler).toBeDefined();
    });

    it('should support method chaining', () => {
      const result = builder
        .fromCode('test')
        .withVars({})
        .withEnv({})
        .inDirectory('/')
        .description('test');

      expect(result).toBe(builder);
    });
  });

  describe('scriptTaskModule', () => {
    it('should create a script task with options', () => {
      const options: ScriptTaskOptions = {
        path: './test.js'
      };

      const task = scriptTaskModule('module-task', options);

      expect(task.name).toBe('module-task');
      expect(task.handler).toBeDefined();
    });

    it('should return a builder when no options provided', () => {
      const result = scriptTaskModule('builder-task');

      // The function returns a builder disguised as a Task
      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('ScriptTaskBuilder');
    });
  });

  describe('loadScriptTasks', () => {
    it('should load script files from a directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'task1.xec',
        'task2.js',
        'task3.mjs',
        'not-a-script.txt',
        'directory'
      ] as any);

      vi.mocked(fs.stat).mockImplementation((filePath) => {
        if (filePath.includes('directory')) {
          return Promise.resolve({ isFile: () => false } as any);
        }
        return Promise.resolve({ isFile: () => true } as any);
      });

      const tasks = await loadScriptTasks('/scripts/dir');

      expect(Object.keys(tasks)).toEqual(['task1', 'task2', 'task3']);
      expect(tasks.task1).toBeDefined();
      expect(tasks.task2).toBeDefined();
      expect(tasks.task3).toBeDefined();
    });

    it('should handle empty directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const tasks = await loadScriptTasks('/empty/dir');

      expect(Object.keys(tasks)).toHaveLength(0);
    });

    it('should handle directory read errors', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const tasks = await loadScriptTasks('/restricted/dir');

      expect(Object.keys(tasks)).toHaveLength(0);
    });

    it('should filter out non-script files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'README.md',
        '.gitignore',
        'package.json',
        'script.js'
      ] as any);

      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      const tasks = await loadScriptTasks('/mixed/dir');

      expect(Object.keys(tasks)).toEqual(['script']);
    });

    it('should handle nested extensions correctly', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'script.test.js',
        'config.prod.xec'
      ] as any);

      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      const tasks = await loadScriptTasks('/nested/dir');

      expect(Object.keys(tasks)).toEqual(['script.test', 'config.prod']);
    });

    it('should skip directories', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'scripts',
        'task.js'
      ] as any);

      vi.mocked(fs.stat).mockImplementation((filePath) => {
        if (filePath.includes('scripts')) {
          return Promise.resolve({ isFile: () => false } as any);
        }
        return Promise.resolve({ isFile: () => true } as any);
      });

      const tasks = await loadScriptTasks('/root/dir');

      expect(Object.keys(tasks)).toEqual(['task']);
    });
  });

  describe('dynamicScriptTask', () => {
    it('should create a task that loads scripts dynamically', () => {
      const task = dynamicScriptTask('dynamic-loader');

      expect(task.name).toBe('dynamic-loader');
      expect(task.description).toBe('Run a dynamic script');
      expect(task.handler).toBeDefined();
    });

    it('should throw error if script path not provided', async () => {
      const task = dynamicScriptTask('dynamic');

      await expect(task.handler(mockContext))
        .rejects.toThrow('No script path provided in vars.script');
    });

    it('should create a task with proper handler', () => {
      const task = dynamicScriptTask('dynamic');

      expect(task.handler).toBeDefined();
      expect(typeof task.handler).toBe('function');
    });
  });

  describe('integration scenarios', () => {
    it('should handle task creation with all options', () => {
      const options: ScriptTaskOptions = {
        path: './complex.js',
        metadata: {
          name: 'complex-script',
          description: 'A complex script task',
          version: '1.0.0'
        },
        vars: {
          input: 'test-input',
          config: { nested: true }
        },
        env: {
          NODE_ENV: 'production',
          API_KEY: 'secret'
        },
        cwd: '/app/scripts'
      };

      const task = scriptTask('complex', options);

      expect(task.name).toBe('complex');
      expect(task.description).toBe('A complex script task');
      expect(task.handler).toBeDefined();
    });

    it('should handle builder pattern with all methods', () => {
      const task = new ScriptTaskBuilder('builder-complete')
        .fromFile('./builder-script.js')
        .withVars({ buildVar: 'build-value' })
        .withEnv({ BUILD_ENV: 'test' })
        .inDirectory('/build/dir')
        .description('Builder pattern test')
        .tags('script', 'builder')
        .timeout(5000)
        .build();

      expect(task.name).toBe('builder-complete');
      expect(task.description).toBe('Builder pattern test');
      expect(task.tags).toEqual(['script', 'builder']);
      expect(task.options.timeout).toBe(5000);
      expect(task.handler).toBeDefined();
    });

    it('should create tasks from loaded scripts', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['task1.js', 'task2.xec'] as any);
      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      const tasks = await loadScriptTasks('/scripts');

      expect(Object.keys(tasks)).toHaveLength(2);

      // Each loaded task should be a valid script task
      for (const taskName in tasks) {
        const task = tasks[taskName];
        expect(task.handler).toBeDefined();
        expect(task.name).toBe(taskName);
      }
    });
  });
});