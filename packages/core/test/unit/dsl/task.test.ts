import { it, vi, expect, describe, beforeEach } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { createMockLogger } from '../../helpers/test-helpers.js';
import {
  log,
  task,
  noop,
  fail,
  wait,
  shell,
  group,
  script,
  parallel,
  sequence,
  TaskBuilder
} from '../../../src/dsl/task.js';

import type { Task, TaskHandler, TaskContext } from '../../../src/core/types.js';

describe('TaskBuilder', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });

  describe('create', () => {
    it('should create a new TaskBuilder instance', () => {
      const builder = TaskBuilder.create('test-task');
      expect(builder).toBeInstanceOf(TaskBuilder);
    });

    it('should initialize with default values', () => {
      const builder = TaskBuilder.create('test-task');
      const testHandler: TaskHandler = async () => ({});
      const built = builder.handler(testHandler).build();

      expect(built.id).toBe('test-task');
      expect(built.depends).toEqual([]);
      expect(built.hosts).toEqual([]);
      expect(built.tags).toEqual([]);
      expect(built.vars).toEqual({});
      expect(built.meta).toEqual({});
    });
  });

  describe('builder methods', () => {
    it('should set description', () => {
      const built = task('test')
        .description('Test task description')
        .handler(async () => ({}))
        .build();

      expect(built.description).toBe('Test task description');
    });

    it('should set handler using handler() or run()', () => {
      const handler1: TaskHandler = async () => ({ result: 1 });
      const handler2: TaskHandler = async () => ({ result: 2 });

      const task1 = task('test1').handler(handler1).build();
      const task2 = task('test2').run(handler2).build();

      expect(task1.handler).toBe(handler1);
      expect(task2.handler).toBe(handler2);
    });

    it('should set variables using vars() and var()', () => {
      const built = task('test')
        .handler(async () => ({}))
        .vars({ foo: 'bar', count: 1 })
        .var('enabled', true)
        .var('name', 'test')
        .build();

      expect(built.vars).toEqual({
        foo: 'bar',
        count: 1,
        enabled: true,
        name: 'test'
      });
    });

    it('should merge variables', () => {
      const built = task('test')
        .handler(async () => ({}))
        .vars({ a: 1, b: 2 })
        .vars({ b: 3, c: 4 })
        .build();

      expect(built.vars).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should set dependencies using depends() and dependsOn()', () => {
      const built = task('test')
        .handler(async () => ({}))
        .depends('task1', 'task2')
        .dependsOn('task3')
        .build();

      expect(built.depends).toEqual(['task1', 'task2', 'task3']);
    });

    it('should set required vars using requires()', () => {
      const built = task('test')
        .handler(async () => ({}))
        .requires('API_KEY', 'API_SECRET')
        .requires('REGION')
        .build();

      expect(built.requiredVars).toEqual(['API_KEY', 'API_SECRET', 'REGION']);
    });

    it('should set schema', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } }
      };

      const built = task('test')
        .handler(async () => ({}))
        .schema(schema)
        .build();

      expect(built.varsSchema).toEqual(schema);
    });

    it('should set phase', () => {
      const built = task('test')
        .handler(async () => ({}))
        .phase('deploy')
        .build();

      expect(built.phase).toBe('deploy');
    });

    it('should set conditions using when(), unless(), onlyIf(), skipIf()', () => {
      const whenFn = () => true;
      const unlessFn = () => false;

      const built = task('test')
        .handler(async () => ({}))
        .when(whenFn)
        .unless(unlessFn)
        .build();

      expect(built.when).toBe(whenFn);
      expect(built.unless).toBe(unlessFn);

      const built2 = task('test2')
        .handler(async () => ({}))
        .onlyIf('${ready}')
        .skipIf('${maintenance}')
        .build();

      expect(built2.when).toBe('${ready}');
      expect(built2.unless).toBe('${maintenance}');
    });

    it('should set hosts', () => {
      const built = task('test')
        .handler(async () => ({}))
        .hosts('web1', 'web2')
        .hosts('db1')
        .build();

      expect(built.hosts).toEqual(['web1', 'web2', 'db1']);
    });

    it('should set tags', () => {
      const built = task('test')
        .handler(async () => ({}))
        .tags('deploy', 'production')
        .tags('critical')
        .build();

      expect(built.tags).toEqual(['deploy', 'production', 'critical']);
    });

    it('should set timeout', () => {
      const built = task('test')
        .handler(async () => ({}))
        .timeout(5000)
        .build();

      expect(built.timeout).toBe(5000);
    });

    it('should set retry config', () => {
      const built1 = task('test1')
        .handler(async () => ({}))
        .retry(3)
        .build();

      expect(built1.retry).toEqual({ maxAttempts: 3 });

      const built2 = task('test2')
        .handler(async () => ({}))
        .retry({ maxAttempts: 5, delay: 1000, backoffMultiplier: 2 })
        .build();

      expect(built2.retry).toEqual({
        maxAttempts: 5,
        delay: 1000,
        backoffMultiplier: 2
      });
    });

    it('should set parallel and continueOnError flags', () => {
      const built = task('test')
        .handler(async () => ({}))
        .parallel()
        .continueOnError()
        .build();

      expect(built.parallel).toBe(true);
      expect(built.continueOnError).toBe(true);

      const built2 = task('test2')
        .handler(async () => ({}))
        .parallel(false)
        .continueOnError(false)
        .build();

      expect(built2.parallel).toBe(false);
      expect(built2.continueOnError).toBe(false);
    });

    it('should set rollback handler', () => {
      const rollbackHandler: TaskHandler = async () => ({ rolled: true });

      const built = task('test')
        .handler(async () => ({}))
        .rollback(rollbackHandler)
        .build();

      expect(built.rollback).toBe(rollbackHandler);
    });

    it('should set meta data', () => {
      const built = task('test')
        .handler(async () => ({}))
        .meta('priority', 'high')
        .meta({ author: 'test', version: '1.0' })
        .build();

      expect(built.meta).toEqual({
        priority: 'high',
        author: 'test',
        version: '1.0'
      });
    });
  });

  describe('validation', () => {
    it('should throw if no handler is set', () => {
      expect(() => {
        task('test').build();
      }).toThrow(ValidationError);
    });

    it('should throw if id is not set', () => {
      const builder = new TaskBuilder('');
      expect(() => {
        builder.handler(async () => ({})).build();
      }).toThrow('Task must have an id');
    });

    it('should throw for duplicate dependencies', () => {
      expect(() => {
        task('test')
          .handler(async () => ({}))
          .depends('task1', 'task2', 'task1')
          .build();
      }).toThrow('duplicate dependencies');
    });

    it('should throw if task depends on itself', () => {
      expect(() => {
        task('test')
          .handler(async () => ({}))
          .depends('test')
          .build();
      }).toThrow('cannot depend on itself');
    });

    it('should throw for invalid timeout', () => {
      expect(() => {
        task('test')
          .handler(async () => ({}))
          .timeout(0);
      }).toThrow(ValidationError);

      expect(() => {
        task('test')
          .handler(async () => ({}))
          .timeout(86400001); // > 24 hours
      }).toThrow(ValidationError);
    });

    it('should throw for invalid retry config', () => {
      expect(() => {
        task('test')
          .handler(async () => ({}))
          .retry({ maxAttempts: 11 });
      }).toThrow('maxAttempts cannot exceed 10');
    });

    it('should warn if requiredVars not in schema', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: { type: 'string' }
        },
        required: ['foo']
      };

      expect(() => {
        task('test')
          .handler(async () => ({}))
          .schema(schema)
          .requires('foo', 'bar')
          .build();
      }).toThrow('Required vars not defined in schema: bar');
    });
  });
});

describe('task helper function', () => {
  it('should create TaskBuilder with handler', () => {
    const handler: TaskHandler = async () => ({});
    const builder = task('test', handler);
    const built = builder.build();

    expect(built.id).toBe('test');
    expect(built.handler).toBe(handler);
  });

  it('should create TaskBuilder without handler', () => {
    const builder = task('test');
    expect(builder).toBeInstanceOf(TaskBuilder);
  });
});

describe('shell task', () => {
  beforeEach(() => {
    vi.mock('@xec/ush', () => {
      const mockExecute = vi.fn().mockResolvedValue({
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });
      
      const $ = Object.assign(mockExecute, {
        cd: vi.fn().mockReturnThis(),
        env: vi.fn().mockReturnThis()
      });
      
      return { $ };
    });
  });

  it('should create a shell command task', async () => {
    const shellTask = shell('run-ls', 'ls -la').build();

    expect(shellTask.id).toBe('run-ls');
    expect(shellTask.handler).toBeDefined();

    const result = await shellTask.handler({
      taskId: 'run-ls',
      vars: {},
      logger: createMockLogger()
    });

    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exitCode');
  });

  it('should accept options', () => {
    const shellTask = shell('run-cmd', 'echo test', {
      cwd: '/tmp',
      env: { NODE_ENV: 'test' },
      shell: '/bin/bash'
    }).build();

    expect(shellTask.id).toBe('run-cmd');
  });
});

describe('script task', () => {
  beforeEach(() => {
    vi.mock('@xec/ush', () => {
      const mockExecute = vi.fn().mockResolvedValue({
        stdout: 'script output',
        stderr: '',
        exitCode: 0
      });
      
      const $ = mockExecute;
      
      return { $ };
    });
  });

  it('should create a script execution task', async () => {
    const scriptTask = script('run-script', './deploy.sh', ['--prod']).build();

    expect(scriptTask.id).toBe('run-script');

    const result = await scriptTask.handler({
      taskId: 'run-script',
      vars: {},
      logger: createMockLogger()
    });

    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exitCode');
  });

  it('should work without args', () => {
    const scriptTask = script('simple-script', './test.sh').build();
    expect(scriptTask.id).toBe('simple-script');
  });
});

describe('parallel task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a parallel execution task', async () => {
    const task1 = task('t1', async () => ({ result: 1 })).build();
    const task2 = task('t2', async () => ({ result: 2 })).build();

    const parallelTask = parallel('run-parallel', [task1, task2]).build();

    expect(parallelTask.id).toBe('run-parallel');
    expect(parallelTask.parallel).toBe(true);

    const result = await parallelTask.handler(mockContext);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ result: 1 });
    expect(result.results[1]).toEqual({ result: 2 });
  });
});

describe('sequence task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a sequential execution task', async () => {
    const task1 = task('t1', async () => ({ result: 1 })).build();
    const task2 = task('t2', async () => ({ result: 2 })).build();

    const sequenceTask = sequence('run-sequence', [task1, task2]).build();

    expect(sequenceTask.id).toBe('run-sequence');

    const result = await sequenceTask.handler(mockContext);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ result: 1 });
    expect(result.results[1]).toEqual({ result: 2 });
  });

  it('should set dependencies between tasks', () => {
    const task1: Task = {
      id: 't1',
      handler: async () => ({ result: 1 }),
      depends: []
    };
    const task2: Task = {
      id: 't2',
      handler: async () => ({ result: 2 }),
      depends: []
    };
    const task3: Task = {
      id: 't3',
      handler: async () => ({ result: 3 }),
      depends: []
    };

    sequence('seq', [task1, task2, task3]);

    expect(task1.depends).toEqual([]);
    expect(task2.depends).toEqual(['t1']);
    expect(task3.depends).toEqual(['t2']);
  });
});

describe('group task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a group task', async () => {
    const task1 = task('t1', async () => ({})).build();
    const task2 = task('t2', async () => ({})).build();

    const groupTask = group('task-group', [task1, task2]).build();

    expect(groupTask.id).toBe('task-group');
    expect(groupTask.meta.tasks).toEqual([task1, task2]);

    const result = await groupTask.handler(mockContext);
    expect(result.message).toContain('Group task-group completed');
    expect(result.tasks).toEqual(['t1', 't2']);
  });
});

describe('noop task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a no-operation task', async () => {
    const noopTask = noop('do-nothing').build();

    expect(noopTask.id).toBe('do-nothing');

    const result = await noopTask.handler(mockContext);
    expect(result).toEqual({ message: 'No operation' });
  });
});

describe('log task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a logging task', async () => {
    const logger = createMockLogger();
    const context = { ...mockContext, logger };

    const logTask = log('log-info', 'Test message').build();

    expect(logTask.id).toBe('log-info');

    const result = await logTask.handler(context);
    expect(result).toEqual({ message: 'Test message', level: 'info' });
    expect(logger.info).toHaveBeenCalledWith('Test message');
  });

  it('should support different log levels', async () => {
    const logger = createMockLogger();
    const context = { ...mockContext, logger };

    const debugTask = log('log-debug', 'Debug', 'debug').build();
    const warnTask = log('log-warn', 'Warning', 'warn').build();
    const errorTask = log('log-error', 'Error', 'error').build();

    await debugTask.handler(context);
    await warnTask.handler(context);
    await errorTask.handler(context);

    expect(logger.debug).toHaveBeenCalledWith('Debug');
    expect(logger.warn).toHaveBeenCalledWith('Warning');
    expect(logger.error).toHaveBeenCalledWith('Error');
  });
});

describe('fail task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a failing task', async () => {
    const failTask = fail('always-fail', 'Expected failure').build();

    expect(failTask.id).toBe('always-fail');

    await expect(failTask.handler(mockContext)).rejects.toThrow('Expected failure');
  });
});

describe('wait task', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: createMockLogger()
    };
  });
  it('should create a delay task', async () => {
    const waitTask = wait('delay-100', 100).build();

    expect(waitTask.id).toBe('delay-100');

    const start = Date.now();
    const result = await waitTask.handler(mockContext);
    const duration = Date.now() - start;

    expect(result).toEqual({ waited: 100 });
    expect(duration).toBeGreaterThanOrEqual(90); // Allow some tolerance
  });
});

describe('complex task compositions', () => {
  it('should compose tasks with multiple configurations', () => {
    const complexTask = task('complex')
      .description('A complex task with all options')
      .handler(async (ctx) => ({ success: true, vars: ctx.vars }))
      .vars({ env: 'prod' })
      .var('region', 'us-east-1')
      .depends('setup', 'config')
      .requires('API_KEY')
      .schema({
        type: 'object',
        properties: {
          API_KEY: { type: 'string' }
        },
        required: ['API_KEY']
      })
      .phase('deploy')
      .when(() => true)
      .unless(false)
      .hosts('web1', 'web2')
      .tags('production', 'critical')
      .timeout(30000)
      .retry({ maxAttempts: 3, delay: 1000 })
      .parallel(true)
      .continueOnError(false)
      .rollback(async () => ({ rolledBack: true }))
      .meta('priority', 'high')
      .meta({ team: 'platform' })
      .build();

    expect(complexTask.id).toBe('complex');
    expect(complexTask.description).toBe('A complex task with all options');
    expect(complexTask.vars).toEqual({ env: 'prod', region: 'us-east-1' });
    expect(complexTask.depends).toEqual(['setup', 'config']);
    expect(complexTask.requiredVars).toEqual(['API_KEY']);
    expect(complexTask.phase).toBe('deploy');
    expect(complexTask.hosts).toEqual(['web1', 'web2']);
    expect(complexTask.tags).toEqual(['production', 'critical']);
    expect(complexTask.timeout).toBe(30000);
    expect(complexTask.retry).toEqual({ maxAttempts: 3, delay: 1000 });
    expect(complexTask.parallel).toBe(true);
    expect(complexTask.continueOnError).toBe(false);
    expect(complexTask.meta).toEqual({ priority: 'high', team: 'platform' });
  });
});