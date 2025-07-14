import { it, vi, expect, describe, beforeEach } from 'vitest';

import {
  mergeContexts,
  ContextBuilder,
  createTaskContext,
  createRecipeContext,
  createExecutionContext
} from '../../../src/context/builder.js';

import type { Task, Recipe } from '../../../src/core/types.js';
import type { ExecutionContext } from '../../../src/context/provider.js';

// Mock logger module
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  createTaskLogger: vi.fn((taskId: string) => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    taskId
  })),
  createRecipeLogger: vi.fn((recipeId: string) => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    recipeId
  }))
}));

// Mock crypto for consistent UUIDs in tests
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-123')
}));

describe('context/builder', () => {
  let mockUUID: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUUID = vi.mocked(require('crypto').randomUUID);
  });

  describe('ContextBuilder', () => {
    describe('constructor', () => {
      it('should create builder with default options', () => {
        const builder = new ContextBuilder();
        const context = builder.build();

        expect(context.runId).toBe('test-uuid-123');
        expect(context.dryRun).toBe(false);
        expect(context.verbose).toBe(false);
        expect(context.parallel).toBe(false);
        expect(context.maxRetries).toBe(3);
        expect(context.timeout).toBe(300000);
        expect(context.globalVars).toEqual({});
        expect(context.secrets).toEqual({});
      });

      it('should create builder with custom options', () => {
        const options = {
          runId: 'custom-run-id',
          dryRun: true,
          verbose: true,
          parallel: true,
          maxRetries: 5,
          timeout: 600000,
          globalVars: { foo: 'bar' },
          secrets: { secret: 'value' }
        };

        const builder = new ContextBuilder(options);
        const context = builder.build();

        expect(context.runId).toBe('custom-run-id');
        expect(context.dryRun).toBe(true);
        expect(context.verbose).toBe(true);
        expect(context.parallel).toBe(true);
        expect(context.maxRetries).toBe(5);
        expect(context.timeout).toBe(600000);
        expect(context.globalVars).toEqual({ foo: 'bar' });
        expect(context.secrets).toEqual({ secret: 'value' });
      });
    });

    describe('static factory methods', () => {
      it('should create builder for recipe', () => {
        const recipe: Recipe = {
          id: 'test-recipe',
          vars: { recipeVar: 'value' },
          tasks: []
        };

        const builder = ContextBuilder.forRecipe(recipe);
        const context = builder.build();

        expect(context.recipeId).toBe('test-recipe');
        expect(context.globalVars).toEqual({ recipeVar: 'value' });
      });

      it('should create builder for task without parent context', () => {
        const task: Task = {
          id: 'test-task',
          name: 'Test Task',
          handler: vi.fn(),
          options: {
            vars: { taskVar: 'value' },
            timeout: 60000
          },
          dependencies: [],
          tags: [],
          metadata: { phase: 'test-phase' }
        };

        const builder = ContextBuilder.forTask(task);
        const context = builder.build();

        expect(context.taskId).toBe('test-task');
        expect(context.vars).toEqual({ taskVar: 'value' });
        expect(context.phase).toBeUndefined(); // phase comes from parent context
        expect(context.timeout).toBe(60000);
      });

      it('should create builder for task with parent context', () => {
        const parentContext = createExecutionContext({
          recipeId: 'parent-recipe',
          runId: 'parent-run',
          globalVars: { parentVar: 'parent' },
          secrets: { parentSecret: 'secret' }
        });

        const task: Task = {
          id: 'child-task',
          name: 'Child Task',
          handler: vi.fn(),
          options: {
            vars: { childVar: 'child' }
          },
          dependencies: [],
          tags: []
        };

        const builder = ContextBuilder.forTask(task, parentContext);
        const context = builder.build();

        expect(context.recipeId).toBe('parent-recipe');
        expect(context.runId).toBe('parent-run');
        expect(context.taskId).toBe('child-task');
        expect(context.vars).toEqual({ childVar: 'child' });
        expect(context.globalVars).toEqual({ parentVar: 'parent' });
        expect(context.secrets).toEqual({ parentSecret: 'secret' });
      });
    });

    describe('builder methods', () => {
      it('should set recipe ID', () => {
        const builder = new ContextBuilder();
        builder.withRecipeId('my-recipe');
        expect(builder.build().recipeId).toBe('my-recipe');
      });

      it('should set run ID', () => {
        const builder = new ContextBuilder();
        builder.withRunId('my-run');
        expect(builder.build().runId).toBe('my-run');
      });

      it('should set dry run', () => {
        const builder = new ContextBuilder();
        builder.withDryRun(true);
        expect(builder.build().dryRun).toBe(true);
      });

      it('should set verbose', () => {
        const builder = new ContextBuilder();
        builder.withVerbose(true);
        expect(builder.build().verbose).toBe(true);
      });

      it('should set parallel', () => {
        const builder = new ContextBuilder();
        builder.withParallel(true);
        expect(builder.build().parallel).toBe(true);
      });

      it('should set max retries', () => {
        const builder = new ContextBuilder();
        builder.withMaxRetries(10);
        expect(builder.build().maxRetries).toBe(10);
      });

      it('should set timeout', () => {
        const builder = new ContextBuilder();
        builder.withTimeout(120000);
        expect(builder.build().timeout).toBe(120000);
      });

      it('should not set timeout if undefined', () => {
        const builder = new ContextBuilder({ timeout: 60000 });
        builder.withTimeout(undefined);
        expect(builder.build().timeout).toBe(60000);
      });

      it('should set logger', () => {
        const logger = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn()
        };
        const builder = new ContextBuilder();
        builder.withLogger(logger);
        expect(builder.build().logger).toBe(logger);
      });

      it('should merge global vars', () => {
        const builder = new ContextBuilder({ globalVars: { a: 1, b: 2 } });
        builder.withGlobalVars({ b: 3, c: 4 });
        expect(builder.build().globalVars).toEqual({ a: 1, b: 3, c: 4 });
      });

      it('should merge secrets', () => {
        const builder = new ContextBuilder({ secrets: { key1: 'value1' } });
        builder.withSecrets({ key2: 'value2' });
        expect(builder.build().secrets).toEqual({ key1: 'value1', key2: 'value2' });
      });

      it('should set hosts', () => {
        const builder = new ContextBuilder();
        builder.withHosts(['host1', 'host2']);
        expect(builder.build().hosts).toEqual(['host1', 'host2']);
      });

      it('should set tags', () => {
        const builder = new ContextBuilder();
        builder.withTags(['tag1', 'tag2']);
        expect(builder.build().tags).toEqual(['tag1', 'tag2']);
      });

      it('should set state', () => {
        const state = new Map([['key', 'value']]);
        const builder = new ContextBuilder();
        builder.withState(state);
        expect(builder.build().state).toBe(state);
      });

      it('should set task ID', () => {
        const builder = new ContextBuilder();
        builder.withTaskId('my-task');
        expect(builder.build().taskId).toBe('my-task');
      });

      it('should merge vars', () => {
        const builder = new ContextBuilder({ vars: { a: 1 } });
        builder.withVars({ b: 2 });
        expect(builder.build().vars).toEqual({ a: 1, b: 2 });
      });

      it('should set host', () => {
        const builder = new ContextBuilder();
        builder.withHost('my-host');
        expect(builder.build().host).toBe('my-host');
      });

      it('should set phase', () => {
        const builder = new ContextBuilder();
        builder.withPhase('my-phase');
        expect(builder.build().phase).toBe('my-phase');
      });

      it('should set attempt', () => {
        const builder = new ContextBuilder();
        builder.withAttempt(3);
        expect(builder.build().attempt).toBe(3);
      });

      it('should support method chaining', () => {
        const context = new ContextBuilder()
          .withRecipeId('recipe')
          .withRunId('run')
          .withTaskId('task')
          .withDryRun(true)
          .withVerbose(true)
          .build();

        expect(context.recipeId).toBe('recipe');
        expect(context.runId).toBe('run');
        expect(context.taskId).toBe('task');
        expect(context.dryRun).toBe(true);
        expect(context.verbose).toBe(true);
      });
    });

    describe('inheritFrom', () => {
      it('should inherit all properties from parent context', () => {
        const parentContext = createExecutionContext({
          recipeId: 'parent-recipe',
          runId: 'parent-run',
          dryRun: true,
          verbose: true,
          parallel: true,
          maxRetries: 5,
          timeout: 120000,
          globalVars: { parentVar: 'value' },
          secrets: { parentSecret: 'secret' },
          hosts: ['host1', 'host2'],
          tags: ['tag1', 'tag2']
        });

        const builder = new ContextBuilder({ taskId: 'child-task' });
        builder.inheritFrom(parentContext);
        const context = builder.build();

        expect(context.recipeId).toBe('parent-recipe');
        expect(context.runId).toBe('parent-run');
        expect(context.taskId).toBe('child-task'); // Should preserve existing
        expect(context.dryRun).toBe(true);
        expect(context.verbose).toBe(true);
        expect(context.parallel).toBe(true);
        expect(context.maxRetries).toBe(5);
        expect(context.timeout).toBe(120000);
        expect(context.globalVars).toEqual({ parentVar: 'value' });
        expect(context.secrets).toEqual({ parentSecret: 'secret' });
        expect(context.hosts).toEqual(['host1', 'host2']);
        expect(context.tags).toEqual(['tag1', 'tag2']);
        expect(context.state).toBe(parentContext.state);
      });

      it('should create copies of arrays and objects', () => {
        const parentContext = createExecutionContext({
          globalVars: { a: 1 },
          secrets: { key: 'value' },
          hosts: ['host1'],
          tags: ['tag1']
        });

        const builder = new ContextBuilder();
        builder.inheritFrom(parentContext);
        const context = builder.build();

        // Modify parent arrays/objects
        parentContext.globalVars.b = 2;
        parentContext.secrets.key2 = 'value2';
        parentContext.hosts?.push('host2');
        parentContext.tags?.push('tag2');

        // Child context should not be affected
        expect(context.globalVars).toEqual({ a: 1 });
        expect(context.secrets).toEqual({ key: 'value' });
        expect(context.hosts).toEqual(['host1']);
        expect(context.tags).toEqual(['tag1']);
      });
    });

    describe('build', () => {
      it('should create execution context with defaults', () => {
        const builder = new ContextBuilder();
        const context = builder.build();

        expect(context.recipeId).toBe('unknown');
        expect(context.runId).toBe('test-uuid-123');
        expect(context.taskId).toBe('unknown');
        expect(context.vars).toEqual({});
        expect(context.host).toBeUndefined();
        expect(context.phase).toBeUndefined();
        expect(context.attempt).toBe(1);
        expect(context.dryRun).toBe(false);
        expect(context.verbose).toBe(false);
        expect(context.parallel).toBe(false);
        expect(context.maxRetries).toBe(3);
        expect(context.timeout).toBe(300000);
        expect(context.startTime).toBeInstanceOf(Date);
        expect(context.logger).toBeDefined();
        expect(context.globalVars).toEqual({});
        expect(context.secrets).toEqual({});
        expect(context.state).toBeInstanceOf(Map);
        expect(context.hosts).toBeUndefined();
        expect(context.tags).toBeUndefined();
      });

      it('should create default logger when not provided', () => {
        const builder = new ContextBuilder();
        const context = builder.build();
        expect(context.logger).toBeDefined();
      });

      it('should create task logger when task ID is provided', () => {
        const builder = new ContextBuilder({ taskId: 'my-task' });
        const context = builder.build();
        expect(context.logger.taskId).toBe('my-task');
      });

      it('should create recipe logger when recipe ID is provided', () => {
        const builder = new ContextBuilder({ recipeId: 'my-recipe' });
        const context = builder.build();
        expect(context.logger.recipeId).toBe('my-recipe');
      });

      it('should use debug level when verbose is true', async () => {
        const { createTaskLogger } = await import('../../../src/utils/logger.js');
        const builder = new ContextBuilder({ taskId: 'my-task', verbose: true });
        builder.build();
        expect(createTaskLogger).toHaveBeenCalledWith('my-task', { level: 'debug' });
      });
    });
  });

  describe('helper functions', () => {
    describe('createExecutionContext', () => {
      it('should create context with default options', () => {
        const context = createExecutionContext();
        expect(context.runId).toBe('test-uuid-123');
        expect(context.recipeId).toBe('unknown');
      });

      it('should create context with custom options', () => {
        const context = createExecutionContext({
          recipeId: 'my-recipe',
          runId: 'my-run',
          dryRun: true
        });
        expect(context.recipeId).toBe('my-recipe');
        expect(context.runId).toBe('my-run');
        expect(context.dryRun).toBe(true);
      });
    });

    describe('createTaskContext', () => {
      it('should create context for task', () => {
        const task: Task = {
          id: 'my-task',
          name: 'My Task',
          handler: vi.fn(),
          options: {
            vars: { taskVar: 'value' },
            timeout: 60000
          },
          dependencies: [],
          tags: [],
          metadata: { phase: 'test' }
        };

        const context = createTaskContext(task);
        expect(context.taskId).toBe('my-task');
        expect(context.vars).toEqual({ taskVar: 'value' });
        expect(context.phase).toBeUndefined(); // phase comes from parent context
        expect(context.timeout).toBe(60000);
      });

      it('should inherit from parent context', () => {
        const parentContext = createExecutionContext({
          recipeId: 'parent-recipe',
          globalVars: { parentVar: 'value' }
        });

        const task: Task = {
          id: 'child-task',
          name: 'Child Task',
          handler: vi.fn(),
          options: {},
          dependencies: [],
          tags: []
        };

        const context = createTaskContext(task, parentContext);
        expect(context.recipeId).toBe('parent-recipe');
        expect(context.taskId).toBe('child-task');
        expect(context.globalVars).toEqual({ parentVar: 'value' });
      });

      it('should apply option overrides', () => {
        const task: Task = {
          id: 'my-task',
          name: 'My Task',
          handler: vi.fn(),
          options: {
            vars: { a: 1 }
          },
          dependencies: [],
          tags: []
        };

        const context = createTaskContext(task, undefined, {
          vars: { b: 2 },
          host: 'override-host',
          phase: 'override-phase',
          attempt: 5
        });

        expect(context.vars).toEqual({ a: 1, b: 2 });
        expect(context.host).toBe('override-host');
        expect(context.phase).toBe('override-phase');
        expect(context.attempt).toBe(5);
      });
    });

    describe('createRecipeContext', () => {
      it('should create context for recipe', () => {
        const recipe: Recipe = {
          id: 'my-recipe',
          vars: { recipeVar: 'value' },
          tasks: []
        };

        const context = createRecipeContext(recipe);
        expect(context.recipeId).toBe('my-recipe');
        expect(context.globalVars).toEqual({ recipeVar: 'value' });
      });

      it('should accept custom options', () => {
        const recipe: Recipe = {
          id: 'my-recipe',
          tasks: []
        };

        const context = createRecipeContext(recipe, {
          runId: 'custom-run',
          dryRun: true
        });

        expect(context.recipeId).toBe('my-recipe');
        expect(context.runId).toBe('custom-run');
        expect(context.dryRun).toBe(true);
      });
    });

    describe('mergeContexts', () => {
      it('should merge contexts with deep merging of vars', () => {
        const base = createExecutionContext({
          recipeId: 'base-recipe',
          vars: { a: 1, b: { x: 1 } },
          globalVars: { global: 'base' },
          secrets: { secret: 'base' }
        });

        const override: Partial<ExecutionContext> = {
          taskId: 'override-task',
          vars: { b: { y: 2 }, c: 3 },
          globalVars: { global: 'override', new: 'value' },
          secrets: { secret: 'override', newSecret: 'value' }
        };

        const merged = mergeContexts(base, override);

        expect(merged.recipeId).toBe('base-recipe');
        expect(merged.taskId).toBe('override-task');
        expect(merged.vars).toEqual({ a: 1, b: { x: 1, y: 2 }, c: 3 });
        expect(merged.globalVars).toEqual({ global: 'override', new: 'value' });
        expect(merged.secrets).toEqual({ secret: 'override', newSecret: 'value' });
      });

      it('should preserve non-overridden properties', () => {
        const base = createExecutionContext({
          recipeId: 'base',
          runId: 'base-run',
          dryRun: true,
          verbose: false
        });

        const override: Partial<ExecutionContext> = {
          verbose: true
        };

        const merged = mergeContexts(base, override);

        expect(merged.recipeId).toBe('base');
        expect(merged.runId).toBe('base-run');
        expect(merged.dryRun).toBe(true);
        expect(merged.verbose).toBe(true);
      });
    });
  });
});