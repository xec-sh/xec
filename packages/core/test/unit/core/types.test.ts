import { it, vi, expect, describe } from 'vitest';

import type {
  Task,
  Hook,
  Recipe,
  Module,
  Logger,
  Variables,
  TaskError,
  JSONSchema,
  TaskResult,
  TaskHandler,
  TaskContext,
  RetryConfig,
  CanaryOptions,
  BlueGreenOptions,
  DeploymentPattern,
  RollingUpdateOptions
} from '../../../src/core/types.js';

describe('Core Types', () => {
  describe('Task', () => {
    it('should accept valid task configuration', () => {
      const handler: TaskHandler = async (context) => ({ success: true });
      
      const task: Task = {
        id: 'test-task',
        description: 'Test task',
        handler,
        vars: { foo: 'bar' },
        depends: ['other-task'],
        requiredVars: ['API_KEY'],
        varsSchema: { type: 'object' },
        phase: 'deploy',
        when: true,
        unless: false,
        hosts: ['server1', 'server2'],
        tags: ['deploy', 'critical'],
        timeout: 30000,
        retry: { maxAttempts: 3, delay: 1000 },
        parallel: true,
        continueOnError: false,
        rollback: async () => ({ rolled: true }),
        meta: { priority: 'high' }
      };
      
      expect(task.id).toBe('test-task');
      expect(task.handler).toBe(handler);
    });

    it('should accept minimal task configuration', () => {
      const task: Task = {
        id: 'minimal-task',
        handler: async () => ({})
      };
      
      expect(task.id).toBe('minimal-task');
      expect(task.description).toBeUndefined();
    });

    it('should support function conditions for when/unless', () => {
      const whenCondition = vi.fn().mockResolvedValue(true);
      const unlessCondition = vi.fn().mockResolvedValue(false);
      
      const task: Task = {
        id: 'conditional-task',
        handler: async () => ({}),
        when: whenCondition,
        unless: unlessCondition
      };
      
      expect(task.when).toBe(whenCondition);
      expect(task.unless).toBe(unlessCondition);
    });
  });

  describe('TaskContext', () => {
    it('should have required properties', () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };
      
      const context: TaskContext = {
        taskId: 'task-123',
        vars: { env: 'production' },
        host: 'server1',
        phase: 'deploy',
        attempt: 2,
        logger
      };
      
      expect(context.taskId).toBe('task-123');
      expect(context.vars).toEqual({ env: 'production' });
      expect(context.logger).toBe(logger);
    });
  });

  describe('TaskResult', () => {
    it('should accept various result formats', () => {
      const simpleResult: TaskResult = { success: true };
      const dryRunResult: TaskResult = { dryRun: true, actions: ['deploy'] };
      const hostResult: TaskResult = {
        hosts: [
          { hostname: 'server1', status: 'ok' },
          { hostname: 'server2', status: 'ok' }
        ]
      };
      const errorResult: TaskResult = {
        errors: [new Error('Failed to deploy')]
      };
      
      expect(simpleResult.success).toBe(true);
      expect(dryRunResult.dryRun).toBe(true);
      expect(hostResult.hosts).toHaveLength(2);
      expect(errorResult.errors).toHaveLength(1);
    });
  });

  describe('Recipe', () => {
    it('should accept full recipe configuration', () => {
      const beforeAll: Hook = vi.fn();
      const onError: Hook = vi.fn();
      
      const recipe: Recipe = {
        id: 'deploy-recipe',
        name: 'Deploy Application',
        description: 'Deploy app to production',
        version: '1.0.0',
        author: 'DevOps Team',
        tags: ['production', 'critical'],
        vars: { environment: 'prod' },
        requiredVars: ['API_TOKEN'],
        varsSchema: { type: 'object' },
        tasks: [{
          id: 'task1',
          handler: async () => ({})
        }],
        modules: [{
          name: 'custom-module',
          exports: { tasks: {} }
        }],
        hosts: ['web1', 'web2'],
        parallel: true,
        continueOnError: false,
        timeout: 600000,
        hooks: {
          beforeAll,
          afterAll: vi.fn(),
          beforeEach: vi.fn(),
          afterEach: vi.fn(),
          onError
        },
        meta: { team: 'platform' }
      };
      
      expect(recipe.id).toBe('deploy-recipe');
      expect(recipe.name).toBe('Deploy Application');
      expect(recipe.tasks).toHaveLength(1);
      expect(recipe.hooks?.beforeAll).toBe(beforeAll);
    });

    it('should accept minimal recipe configuration', () => {
      const recipe: Recipe = {
        id: 'minimal',
        name: 'Minimal Recipe',
        tasks: []
      };
      
      expect(recipe.id).toBe('minimal');
      expect(recipe.tasks).toEqual([]);
    });
  });

  describe('Module', () => {
    it('should accept module configuration', () => {
      const setup = vi.fn();
      const teardown = vi.fn();
      
      const module: Module = {
        name: 'aws-module',
        version: '2.0.0',
        description: 'AWS integration module',
        exports: {
          tasks: {
            deployLambda: async () => ({ deployed: true })
          },
          recipes: {},
          patterns: { serverless: {} },
          utils: { getRegion: () => 'us-east-1' }
        },
        setup,
        teardown
      };
      
      expect(module.name).toBe('aws-module');
      expect(module.setup).toBe(setup);
      expect(module.exports.tasks).toHaveProperty('deployLambda');
    });

    it('should accept minimal module configuration', () => {
      const module: Module = {
        name: 'minimal-module',
        exports: {}
      };
      
      expect(module.name).toBe('minimal-module');
      expect(module.version).toBeUndefined();
    });
  });

  describe('Logger', () => {
    it('should implement logger interface', () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };
      
      logger.debug('Debug message', { extra: 'data' });
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message', new Error('test'));
      
      expect(logger.debug).toHaveBeenCalledWith('Debug message', { extra: 'data' });
      expect(logger.info).toHaveBeenCalledWith('Info message');
      expect(logger.warn).toHaveBeenCalledWith('Warning message');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('RetryConfig', () => {
    it('should accept retry configuration', () => {
      const onError = vi.fn();
      
      const retryConfig: RetryConfig = {
        maxAttempts: 5,
        delay: 2000,
        backoffMultiplier: 2,
        maxDelay: 30000,
        onError
      };
      
      expect(retryConfig.maxAttempts).toBe(5);
      expect(retryConfig.backoffMultiplier).toBe(2);
      expect(retryConfig.onError).toBe(onError);
    });

    it('should accept minimal retry configuration', () => {
      const retryConfig: RetryConfig = {};
      
      expect(retryConfig.maxAttempts).toBeUndefined();
      expect(retryConfig.delay).toBeUndefined();
    });
  });

  describe('DeploymentPattern', () => {
    it('should implement deployment pattern interface', async () => {
      const pattern: DeploymentPattern = {
        name: 'custom-deploy',
        execute: vi.fn().mockResolvedValue({ deployed: true })
      };
      
      const result = await pattern.execute({ service: 'api' });
      
      expect(pattern.name).toBe('custom-deploy');
      expect(result).toEqual({ deployed: true });
      expect(pattern.execute).toHaveBeenCalledWith({ service: 'api' });
    });
  });

  describe('BlueGreenOptions', () => {
    it('should accept blue-green deployment options', () => {
      const healthCheck = vi.fn().mockResolvedValue(true);
      const deploy = vi.fn().mockResolvedValue(undefined);
      const switchFn = vi.fn().mockResolvedValue(undefined);
      const rollback = vi.fn().mockResolvedValue(undefined);
      
      const options: BlueGreenOptions = {
        service: 'web-app',
        healthCheck,
        deploy,
        switch: switchFn,
        rollback
      };
      
      expect(options.service).toBe('web-app');
      expect(options.healthCheck).toBe(healthCheck);
      expect(options.rollback).toBe(rollback);
    });

    it('should work without rollback', () => {
      const options: BlueGreenOptions = {
        service: 'api',
        healthCheck: async () => true,
        deploy: async () => {},
        switch: async () => {}
      };
      
      expect(options.rollback).toBeUndefined();
    });
  });

  describe('CanaryOptions', () => {
    it('should accept canary deployment options', () => {
      const validate1 = vi.fn().mockResolvedValue(true);
      const validate2 = vi.fn().mockResolvedValue(true);
      const deploy = vi.fn().mockResolvedValue(undefined);
      const rollback = vi.fn().mockResolvedValue(undefined);
      
      const options: CanaryOptions = {
        service: 'api-service',
        stages: [
          { percentage: 10, duration: 300000, validate: validate1 },
          { percentage: 50, duration: 600000, validate: validate2 }
        ],
        deploy,
        rollback
      };
      
      expect(options.service).toBe('api-service');
      expect(options.stages).toHaveLength(2);
      expect(options.stages[0].percentage).toBe(10);
      expect(options.stages[1].validate).toBe(validate2);
    });
  });

  describe('RollingUpdateOptions', () => {
    it('should accept rolling update options', () => {
      const update = vi.fn().mockResolvedValue(undefined);
      const validate = vi.fn().mockResolvedValue(true);
      const rollback = vi.fn().mockResolvedValue(undefined);
      
      const options: RollingUpdateOptions = {
        hosts: ['web1', 'web2', 'web3'],
        batchSize: 2,
        pauseBetween: 5000,
        update,
        validate,
        rollback
      };
      
      expect(options.hosts).toHaveLength(3);
      expect(options.batchSize).toBe(2);
      expect(options.pauseBetween).toBe(5000);
    });

    it('should work without optional properties', () => {
      const options: RollingUpdateOptions = {
        hosts: ['server1'],
        batchSize: 1,
        update: async () => {}
      };
      
      expect(options.pauseBetween).toBeUndefined();
      expect(options.validate).toBeUndefined();
      expect(options.rollback).toBeUndefined();
    });
  });

  describe('Type Guards and Utilities', () => {
    it('should correctly type check Variables', () => {
      const vars: Variables = {
        string: 'value',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { foo: 'bar' },
        nullValue: null,
        undefinedValue: undefined
      };
      
      expect(typeof vars).toBe('object');
      expect(vars.string).toBe('value');
      expect(Array.isArray(vars.array)).toBe(true);
    });

    it('should correctly type check JSONSchema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 }
        },
        required: ['name'],
        additionalProperties: false
      };
      
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    it('should handle TaskError type', () => {
      const taskError: TaskError = {
        taskId: 'task-failed',
        phase: 'execution',
        error: new Error('Deployment failed'),
        timestamp: new Date()
      };
      
      expect(taskError.taskId).toBe('task-failed');
      expect(taskError.error).toBeInstanceOf(Error);
      expect(taskError.timestamp).toBeInstanceOf(Date);
    });
  });
});