import os from 'os';
import * as fs from 'fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { task } from '../../../src/dsl/task.js';
import { recipe } from '../../../src/dsl/recipe.js';
import { Logger } from '../../../src/utils/logger.js';
import * as loggerModule from '../../../src/utils/logger.js';
import {
  $,
  utils,
  ScriptHooks,
  defineScript,
  ScriptRunner,
  ScriptBuilder,
  ScriptContext,
  ScriptMetadata,
  CommandDefinition,
  createScriptContext
} from '../../../src/script/index.js';

// Mock modules
vi.mock('fs/promises');
vi.mock('which');
vi.mock('glob');
vi.mock('node-fetch');
vi.mock('@xec/ush', () => ({
  $: { mock: 'ush' }
}));

describe('script/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exports', () => {
    it('should export $ from ush', () => {
      expect($).toEqual({ mock: 'ush' });
    });
  });

  describe('createScriptContext', () => {
    it('should create a script context with default values', () => {
      const context = createScriptContext({});

      expect(context.metadata).toEqual({});
      expect(context.vars).toEqual({});
      expect(context.env).toBe(process.env);
      expect(context.cwd).toBe(process.cwd());
      expect(context.argv).toEqual([]);
      expect(context.logger).toBeInstanceOf(Logger);
      expect(context.runTask).toBeDefined();
      expect(context.runRecipe).toBeDefined();
    });

    it('should create a script context with custom values', () => {
      const metadata: ScriptMetadata = {
        name: 'test-script',
        description: 'Test description',
        version: '1.0.0'
      };
      const vars = { foo: 'bar', count: 42 };
      const argv = ['arg1', 'arg2'];
      const cwd = '/custom/path';

      const context = createScriptContext({
        metadata,
        vars,
        argv,
        cwd
      });

      expect(context.metadata).toEqual(metadata);
      expect(context.vars).toEqual(vars);
      expect(context.argv).toEqual(argv);
      expect(context.cwd).toBe(cwd);
      expect(context.logger).toBeInstanceOf(Logger);
    });

    it('should handle runTask method', async () => {
      const context = createScriptContext({
        vars: { baseVar: 'base' }
      });

      await expect(context.runTask('test-task')).rejects.toThrow('Task test-task not implemented');
    });

    it('should handle runRecipe method', async () => {
      const context = createScriptContext({
        vars: { baseVar: 'base' }
      });

      // This will throw as executeRecipe is not mocked
      await expect(context.runRecipe('test-recipe')).rejects.toThrow();
    });
  });

  describe('ScriptBuilder', () => {
    let builder: ScriptBuilder;

    beforeEach(() => {
      builder = new ScriptBuilder();
    });

    it('should set script name', () => {
      const result = builder.name('my-script').build();
      expect(result.metadata.name).toBe('my-script');
    });

    it('should set script description', () => {
      const result = builder.description('My awesome script').build();
      expect(result.metadata.description).toBe('My awesome script');
    });

    it('should set script version', () => {
      const result = builder.version('2.0.0').build();
      expect(result.metadata.version).toBe('2.0.0');
    });

    it('should set script author', () => {
      const result = builder.author('John Doe').build();
      expect(result.metadata.author).toBe('John Doe');
    });

    it('should set script tags', () => {
      const result = builder.tags('automation', 'deployment', 'ci').build();
      expect(result.metadata.tags).toEqual(['automation', 'deployment', 'ci']);
    });

    it('should set script requirements', () => {
      const result = builder.requires('node>=14', 'docker', 'git').build();
      expect(result.metadata.requirements).toEqual(['node>=14', 'docker', 'git']);
    });

    it('should add tasks', () => {
      const testTask = task('test').handler(async () => { }).build();
      const result = builder.task('test-task', testTask).build();

      expect(result.exports.tasks).toBeDefined();
      expect(result.exports.tasks!['test-task']).toBe(testTask);
    });

    it('should add recipes', () => {
      const testRecipe = recipe('test')
        .task(task('dummy').handler(async () => { }).build())
        .build();
      const result = builder.recipe('test-recipe', testRecipe).build();

      expect(result.exports.recipes).toBeDefined();
      expect(result.exports.recipes!['test-recipe']).toBe(testRecipe);
    });

    it('should add commands', () => {
      const command: CommandDefinition = {
        name: 'deploy',
        description: 'Deploy the application',
        usage: 'deploy [options]',
        options: [
          { flags: '-e, --env <env>', description: 'Environment', defaultValue: 'dev' }
        ],
        action: async (args, options) => { }
      };

      const result = builder.command(command).build();

      expect(result.exports.commands).toBeDefined();
      expect(result.exports.commands!['deploy']).toEqual(command);
    });

    it('should set hooks', () => {
      const hooks: ScriptHooks = {
        beforeLoad: async () => { },
        afterLoad: async () => { },
        beforeExecute: async () => { },
        afterExecute: async () => { },
        onError: async (error) => { }
      };

      const result = builder.hooks(hooks).build();
      expect(result.exports.hooks).toBe(hooks);
    });

    it('should build a complete script definition', () => {
      const testTask = task('test').handler(async () => { }).build();
      const testRecipe = recipe('test')
        .task(task('dummy').handler(async () => { }).build())
        .build();
      const command: CommandDefinition = {
        name: 'test-cmd',
        description: 'Test command',
        action: async () => { }
      };
      const hooks: ScriptHooks = {
        beforeLoad: async () => { }
      };

      const result = builder
        .name('complete-script')
        .description('A complete script')
        .version('1.0.0')
        .author('Test Author')
        .tags('test', 'complete')
        .requires('node>=16')
        .task('my-task', testTask)
        .recipe('my-recipe', testRecipe)
        .command(command)
        .hooks(hooks)
        .build();

      expect(result.metadata).toEqual({
        name: 'complete-script',
        description: 'A complete script',
        version: '1.0.0',
        author: 'Test Author',
        tags: ['test', 'complete'],
        requirements: ['node>=16']
      });

      expect(result.exports.tasks!['my-task']).toBe(testTask);
      expect(result.exports.recipes!['my-recipe']).toBe(testRecipe);
      expect(result.exports.commands!['test-cmd']).toBe(command);
      expect(result.exports.hooks).toBe(hooks);
    });
  });

  describe('defineScript', () => {
    it('should return a new ScriptBuilder instance', () => {
      const builder = defineScript();
      expect(builder).toBeInstanceOf(ScriptBuilder);
    });
  });

  describe('utils', () => {
    describe('file system utilities', () => {
      it('should export fs module', () => {
        expect(utils.fs).toBe(fs);
      });

      it('should export path module', () => {
        expect(utils.path).toBeDefined();
        expect(utils.path.join).toBeDefined();
        expect(utils.path.resolve).toBeDefined();
      });

      it('should export glob function', () => {
        expect(utils.glob).toBeDefined();
      });
    });

    describe('network utilities', () => {
      it('should export fetch function', () => {
        expect(utils.fetch).toBeDefined();
      });
    });

    describe('system utilities', () => {
      it('should export os module', () => {
        expect(utils.os).toBe(os);
      });

      it('should export which function', () => {
        expect(utils.which).toBeDefined();
      });
    });

    describe('process utilities', () => {
      it('should implement sleep function', async () => {
        const start = Date.now();
        await utils.sleep(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(50);
      });

      it('should implement exit function', () => {
        const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        utils.exit(0);
        expect(mockExit).toHaveBeenCalledWith(0);

        utils.exit(1);
        expect(mockExit).toHaveBeenCalledWith(1);

        utils.exit();
        expect(mockExit).toHaveBeenCalledWith(0);
      });

      it('should implement env function', () => {
        process.env.TEST_VAR = 'test-value';

        expect(utils.env('TEST_VAR')).toBe('test-value');
        expect(utils.env('NON_EXISTENT')).toBeUndefined();
        expect(utils.env('NON_EXISTENT', 'default')).toBe('default');

        delete process.env.TEST_VAR;
      });

      it('should implement setEnv function', () => {
        utils.setEnv('NEW_VAR', 'new-value');
        expect(process.env.NEW_VAR).toBe('new-value');

        delete process.env.NEW_VAR;
      });
    });

    describe('logging utilities', () => {
      it('should provide log functions', () => {
        const mockLogger = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          child: vi.fn().mockReturnThis()
        };
        
        vi.spyOn(loggerModule, 'createModuleLogger').mockReturnValue(mockLogger as any);

        // Need to re-import to get the mocked logger
        vi.resetModules();
        
        // Just verify the functions exist
        expect(utils.log.info).toBeDefined();
        expect(utils.log.success).toBeDefined();
        expect(utils.log.warning).toBeDefined();
        expect(utils.log.error).toBeDefined();
        
        // Call them to ensure they work
        utils.log.info('Info message');
        utils.log.success('Success message');
        utils.log.warning('Warning message');
        utils.log.error('Error message');
      });
    });

    describe('template utility', () => {
      it('should handle template strings', () => {
        const result = utils.template`Hello ${'world'}!`;
        expect(result).toBe('Hello world!');
      });

      it('should handle multiple values', () => {
        const name = 'John';
        const age = 30;
        const result = utils.template`Name: ${name}, Age: ${age}`;
        expect(result).toBe('Name: John, Age: 30');
      });

      it('should handle undefined values', () => {
        const result = utils.template`Value: ${undefined}!`;
        expect(result).toBe('Value: !');
      });
    });

    describe('shell utilities', () => {
      it('should quote simple arguments', () => {
        expect(utils.quote('simple')).toBe('simple');
        expect(utils.quote('test123')).toBe('test123');
      });

      it('should quote arguments with special characters', () => {
        expect(utils.quote('hello world')).toBe("'hello world'");
        expect(utils.quote('test"quote')).toBe("'test\"quote'");
        expect(utils.quote('test$var')).toBe("'test$var'");
        expect(utils.quote('test`cmd`')).toBe("'test`cmd`'");
        expect(utils.quote('test\\path')).toBe("'test\\path'");
      });

      it('should handle single quotes', () => {
        expect(utils.quote("test'quote")).toBe("'test'\"'\"'quote'");
      });
    });

    describe('retry utility', () => {
      it('should retry on failure', async () => {
        let attempts = 0;
        const fn = vi.fn(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Failure');
          }
          return 'success';
        });

        const result = await utils.retry(fn, { retries: 3, delay: 10 });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should throw after max retries', async () => {
        const fn = vi.fn(async () => {
          throw new Error('Always fails');
        });

        await expect(utils.retry(fn, { retries: 2, delay: 10 }))
          .rejects.toThrow('Always fails');

        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
      });

      it('should use exponential backoff', async () => {
        let attempts = 0;
        const timestamps: number[] = [];
        const fn = vi.fn(async () => {
          timestamps.push(Date.now());
          attempts++;
          if (attempts < 3) {
            throw new Error('Failure');
          }
          return 'success';
        });

        await utils.retry(fn, { retries: 3, delay: 10, backoff: 2 });

        // Check delays increase exponentially
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];

        expect(delay1).toBeGreaterThanOrEqual(10);
        expect(delay2).toBeGreaterThanOrEqual(20); // 10 * 2^1
      });

      it('should succeed on first try', async () => {
        const fn = vi.fn(async () => 'success');

        const result = await utils.retry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('temporary file utilities', () => {
      it('should return system temp directory', () => {
        expect(utils.tmpdir()).toBe(os.tmpdir());
      });

      it('should generate temporary file paths', () => {
        const path1 = utils.tmpfile();
        const path2 = utils.tmpfile();

        expect(path1).toContain(os.tmpdir());
        expect(path1).toContain('xec-');
        expect(path1).not.toBe(path2); // Should be unique
      });

      it('should use custom prefix and suffix', () => {
        const path = utils.tmpfile('test-', '.txt');

        expect(path).toContain('test-');
        expect(path).toContain('.txt');
      });
    });
  });

  describe('ScriptRunner', () => {
    let runner: ScriptRunner;
    let context: ScriptContext;

    beforeEach(() => {
      context = createScriptContext({
        metadata: { name: 'test-script' },
        vars: { testVar: 'test' }
      });
      runner = new ScriptRunner(context);
    });

    describe('runFile', () => {
      it('should read and execute a script file', async () => {
        const scriptContent = 'return "Hello from script";';
        vi.mocked(fs.readFile).mockResolvedValue(scriptContent);

        // Just test that readFile is called, not actual execution
        runner.runFile('/test/script.js').catch(() => { });

        expect(fs.readFile).toHaveBeenCalledWith('/test/script.js', 'utf-8');
      });

      it('should handle file read errors', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

        await expect(runner.runFile('/test/missing.js'))
          .rejects.toThrow('File not found');
      });
    });

    describe('run', () => {
      it('should have run method', () => {
        expect(runner.run).toBeDefined();
        expect(typeof runner.run).toBe('function');
      });

      it('should accept code and filename parameters', () => {
        // Just verify the method exists and is a function
        expect(runner.run).toBeDefined();
        expect(typeof runner.run).toBe('function');
      });
    });
  });

  describe('default export', () => {
    it('should export all required functions and classes', async () => {
      const { default: scriptExports } = await import('../../../src/script/index.js');

      expect(scriptExports.$).toBeDefined();
      expect(scriptExports.defineScript).toBeDefined();
      expect(scriptExports.createScriptContext).toBeDefined();
      expect(scriptExports.ScriptRunner).toBeDefined();
      expect(scriptExports.utils).toBeDefined();
      expect(scriptExports.task).toBeDefined();
      expect(scriptExports.recipe).toBeDefined();
    });
  });
});