import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createMockLogger } from '../../helpers/test-helpers.js';

// Mock the context provider
vi.mock('../../../src/context/provider.js', () => {
  const mockState = new Map<string, any>();
  const mockVars = new Map<string, any>();
  const mockLogger = createMockLogger();
  
  return {
    contextProvider: {
      getVariable: vi.fn((name: string) => mockVars.get(name)),
      setVariable: vi.fn((name: string, value: any) => {
        mockVars.set(name, value);
      }),
      getAllVariables: vi.fn(() => {
        const obj: Record<string, any> = {};
        mockVars.forEach((value, key) => {
          obj[key] = value;
        });
        return obj;
      }),
      getLogger: vi.fn(() => mockLogger),
      isDryRun: vi.fn(() => false),
      getRunId: vi.fn(() => 'test-run-123'),
      getRecipeId: vi.fn(() => 'test-recipe'),
      getTaskContext: vi.fn(() => ({
        taskId: 'test-task',
        phase: 'test-phase',
        attempt: 2,
        host: 'test-host'
      })),
      getState: vi.fn((key: string) => mockState.get(key)),
      setState: vi.fn((key: string, value: any) => {
        mockState.set(key, value);
      }),
      hasState: vi.fn((key: string) => mockState.has(key)),
      deleteState: vi.fn((key: string) => mockState.delete(key)),
      clearState: vi.fn(() => mockState.clear()),
      getHosts: vi.fn(() => ['host1', 'host2']),
      getTags: vi.fn(() => ['tag1', 'tag2']),
      matchesHost: vi.fn((hostname: string) => ['host1', 'host2'].includes(hostname)),
      matchesTags: vi.fn((tags: string[]) => tags.some(t => ['tag1', 'tag2'].includes(t))),
      getStoreOrThrow: vi.fn(() => ({
        secrets: { SECRET_KEY: 'secret-value' },
        helpers: {}
      })),
      _reset: () => {
        mockState.clear();
        mockVars.clear();
      },
      _getMockLogger: () => mockLogger
    }
  };
});

import {
  log, env, info,
  warn, fail, skip, when, debug,
  error, retry,
  getVar, setVar, secret, unless, getVars, getHost,
  getTags, isDryRun, getRunId, getPhase, getState,
  setState, hasState, getHosts, template,
  parallel, getTaskId, getHelper,
  getAttempt,
  clearState, getRecipeId,
  deleteState, matchesHost, matchesTags,
  SkipTaskError, registerHelper
} from '../../../src/context/globals.js';

describe('context/globals', () => {
  let mockProvider: any;
  let mockLogger: any;
  
  beforeEach(async () => {
    const { contextProvider } = await import('../../../src/context/provider.js');
    mockProvider = contextProvider;
    mockLogger = mockProvider._getMockLogger();
    mockProvider._reset();
    vi.clearAllMocks();
  });

  describe('Variable functions', () => {
    it('should get variable', () => {
      mockProvider.getVariable.mockReturnValueOnce('test-value');
      expect(getVar('test')).toBe('test-value');
      expect(mockProvider.getVariable).toHaveBeenCalledWith('test');
    });

    it('should set variable', () => {
      setVar('test', 'value');
      expect(mockProvider.setVariable).toHaveBeenCalledWith('test', 'value', 'local');
      
      setVar('global-test', 'global-value', 'global');
      expect(mockProvider.setVariable).toHaveBeenCalledWith('global-test', 'global-value', 'global');
    });

    it('should get all variables', () => {
      mockProvider.getAllVariables.mockReturnValueOnce({ a: 1, b: 2 });
      expect(getVars()).toEqual({ a: 1, b: 2 });
    });
  });

  describe('Logging functions', () => {
    it('should log messages at different levels', () => {
      log('test message');
      expect(mockLogger.info).toHaveBeenCalledWith('test message');

      log('debug message', 'debug');
      expect(mockLogger.debug).toHaveBeenCalledWith('debug message');

      debug('debug direct');
      expect(mockLogger.debug).toHaveBeenCalledWith('debug direct');

      info('info message');
      expect(mockLogger.info).toHaveBeenCalledWith('info message');

      warn('warning message');
      expect(mockLogger.warn).toHaveBeenCalledWith('warning message');

      error('error message');
      expect(mockLogger.error).toHaveBeenCalledWith('error message');
    });
  });

  describe('Context info functions', () => {
    it('should return dry run status', () => {
      mockProvider.isDryRun.mockReturnValueOnce(true);
      expect(isDryRun()).toBe(true);
    });


    it('should return run ID', () => {
      expect(getRunId()).toBe('test-run-123');
    });

    it('should return recipe ID', () => {
      expect(getRecipeId()).toBe('test-recipe');
    });

    it('should return task context info', () => {
      expect(getTaskId()).toBe('test-task');
      expect(getPhase()).toBe('test-phase');
      expect(getAttempt()).toBe(2);
      expect(getHost()).toBe('test-host');
    });

    it('should return default attempt if not set', () => {
      mockProvider.getTaskContext.mockReturnValueOnce({ taskId: 'test' });
      expect(getAttempt()).toBe(1);
    });
  });

  describe('State functions', () => {
    it('should manage state', () => {
      setState('key1', 'value1');
      expect(mockProvider.setState).toHaveBeenCalledWith('key1', 'value1');

      mockProvider.getState.mockReturnValueOnce('value1');
      expect(getState('key1')).toBe('value1');

      mockProvider.hasState.mockReturnValueOnce(true);
      expect(hasState('key1')).toBe(true);

      mockProvider.deleteState.mockReturnValueOnce(true);
      expect(deleteState('key1')).toBe(true);

      clearState();
      expect(mockProvider.clearState).toHaveBeenCalled();
    });
  });

  describe('Host and tag functions', () => {
    it('should return hosts and tags', () => {
      expect(getHosts()).toEqual(['host1', 'host2']);
      expect(getTags()).toEqual(['tag1', 'tag2']);
    });

    it('should match hosts and tags', () => {
      expect(matchesHost('host1')).toBe(true);
      expect(matchesHost('host3')).toBe(false);

      expect(matchesTags(['tag1', 'tag3'])).toBe(true);
      expect(matchesTags(['tag3', 'tag4'])).toBe(false);
    });
  });

  describe('Environment and secrets', () => {
    it('should get environment variables', () => {
      process.env.TEST_VAR = 'test-value';
      expect(env('TEST_VAR')).toBe('test-value');
      
      delete process.env.TEST_VAR;
      expect(env('TEST_VAR', 'default')).toBe('default');
    });

    it('should get environment from context vars', () => {
      mockProvider.getVariable.mockReturnValueOnce('context-value');
      expect(env('MISSING_VAR')).toBe('context-value');
      expect(mockProvider.getVariable).toHaveBeenCalledWith('env.MISSING_VAR');
    });

    it('should get secrets', () => {
      expect(secret('SECRET_KEY')).toBe('secret-value');
      expect(secret('MISSING_SECRET')).toBeUndefined();
    });
  });

  describe('Control flow functions', () => {
    it('should fail with error', () => {
      expect(() => fail('Task failed')).toThrow('Task failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Task failed');
    });

    it('should skip task', () => {
      expect(() => skip('Skipping task')).toThrow(SkipTaskError);
      expect(mockLogger.info).toHaveBeenCalledWith('Skipping: Skipping task');
    });

    it('should skip without reason', () => {
      expect(() => skip()).toThrow(SkipTaskError);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('SkipTaskError', () => {
    it('should create skip error with reason', () => {
      const error = new SkipTaskError('Custom reason');
      expect(error.message).toBe('Custom reason');
      expect(error.name).toBe('SkipTaskError');
    });

    it('should create skip error without reason', () => {
      const error = new SkipTaskError();
      expect(error.message).toBe('Task skipped');
    });
  });

  describe('Helper functions', () => {
    it('should register and get helpers', () => {
      const helperFn = vi.fn();
      const mockStore = { helpers: {} };
      mockProvider.getStoreOrThrow.mockReturnValue(mockStore);

      registerHelper('myHelper', helperFn);
      expect(mockStore.helpers.myHelper).toBe(helperFn);

      expect(getHelper('myHelper')).toBe(helperFn);
      expect(getHelper('nonexistent')).toBeUndefined();
    });
  });

  describe('Template function', () => {
    it('should interpolate variables', () => {
      const result = template('Hello {{name}}, you are {{age}} years old', {
        name: 'John',
        age: 30
      });
      expect(result).toBe('Hello John, you are 30 years old');
    });

    it('should use context variables if no data provided', () => {
      mockProvider.getAllVariables.mockReturnValueOnce({
        user: 'Alice',
        role: 'admin'
      });
      const result = template('User: {{user}}, Role: {{role}}');
      expect(result).toBe('User: Alice, Role: admin');
    });

    it('should leave unmatched placeholders', () => {
      const result = template('Hello {{name}}, {{missing}}', { name: 'Bob' });
      expect(result).toBe('Hello Bob, {{missing}}');
    });
  });

  describe('Condition functions', () => {
    it('should evaluate when conditions', () => {
      expect(when(true)).toBe(true);
      expect(when(false)).toBe(false);
      expect(when(() => true)).toBe(true);
      expect(when(() => false)).toBe(false);
    });

    it('should evaluate unless conditions', () => {
      expect(unless(true)).toBe(false);
      expect(unless(false)).toBe(true);
      expect(unless(() => true)).toBe(false);
      expect(unless(() => false)).toBe(true);
    });
  });

  describe('retry function', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const fn = vi.fn(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Fail');
        }
        return 'success';
      });

      const result = await retry(fn, { maxAttempts: 3, delay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const fn = vi.fn(() => {
        throw new Error('Always fails');
      });

      await expect(retry(fn, { maxAttempts: 2, delay: 10 }))
        .rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onError callback', async () => {
      const onError = vi.fn();
      const fn = vi.fn(() => {
        throw new Error('Test error');
      });

      await expect(retry(fn, { 
        maxAttempts: 2, 
        delay: 10,
        onError 
      })).rejects.toThrow();

      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 2);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      let lastTime = Date.now();
      
      const fn = vi.fn(() => {
        const now = Date.now();
        delays.push(now - lastTime);
        lastTime = now;
        throw new Error('Retry me');
      });

      await expect(retry(fn, {
        maxAttempts: 3,
        delay: 50,
        backoff: 2
      })).rejects.toThrow();

      // First call is immediate, then delays increase
      expect(delays[1]).toBeGreaterThanOrEqual(40); // ~50ms
      expect(delays[2]).toBeGreaterThanOrEqual(90); // ~100ms
    });
  });

  describe('parallel function', () => {
    it('should run tasks in parallel', async () => {
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3)
      ];

      const results = await parallel(tasks);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should limit concurrency', async () => {
      let running = 0;
      let maxRunning = 0;
      
      const tasks = Array(5).fill(0).map((_, i) => async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 50));
        running--;
        return i;
      });

      await parallel(tasks, { concurrency: 2 });
      expect(maxRunning).toBeLessThanOrEqual(2);
    });

    it('should stop on error by default', async () => {
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.reject(new Error('Task 2 failed')),
        () => Promise.resolve(3)
      ];

      await expect(parallel(tasks)).rejects.toThrow('Task 2 failed');
    });

    it('should continue on error when configured', async () => {
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.reject(new Error('Task 2 failed')),
        () => Promise.resolve(3)
      ];

      await expect(parallel(tasks, { stopOnError: false }))
        .rejects.toThrow('Some tasks failed');
    });

    it('should handle empty task array', async () => {
      const results = await parallel([]);
      expect(results).toEqual([]);
    }, 1000); // Add timeout to prevent hanging
  });
});