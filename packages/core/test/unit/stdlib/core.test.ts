import { it, vi, expect, describe, beforeEach } from 'vitest';

import { getVar, setVar, template } from '../../../src/context/globals.js';
import { tasks, helpers, coreModule } from '../../../src/stdlib/core/index.js';

import type { TaskContext } from '../../../src/core/types.js';

// Mock the globals module
vi.mock('../../../src/context/globals.js', () => ({
  getVar: vi.fn(),
  setVar: vi.fn(),
  template: vi.fn()
}));

// Mock @xec/ush
vi.mock('@xec/ush', () => ({
  exec: vi.fn()
}));

describe('stdlib/core', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn()
      }
    };
  });

  describe('module structure', () => {
    it('should export core module with correct metadata', () => {
      expect(coreModule.name).toBe('@xec/stdlib-core');
      expect(coreModule.version).toBe('1.0.0');
      expect(coreModule.description).toBe('Core utilities and tasks for Xec');
      expect(coreModule.dependencies).toEqual([]);
      expect(coreModule.metadata.category).toBe('stdlib');
      expect(coreModule.metadata.tags).toContain('core');
      expect(coreModule.metadata.tags).toContain('utilities');
    });

    it('should export tasks and helpers', () => {
      expect(coreModule.exports.tasks).toBe(tasks);
      expect(coreModule.exports.helpers).toBe(helpers);
      expect(coreModule.exports.patterns).toEqual({});
      expect(coreModule.exports.integrations).toEqual({});
    });
  });

  describe('helpers', () => {
    describe('string manipulation', () => {
      it('should convert to uppercase', () => {
        expect(helpers.uppercase('hello')).toBe('HELLO');
      });

      it('should convert to lowercase', () => {
        expect(helpers.lowercase('HELLO')).toBe('hello');
      });

      it('should capitalize string', () => {
        expect(helpers.capitalize('hello')).toBe('Hello');
        expect(helpers.capitalize('HELLO')).toBe('HELLO');
        expect(helpers.capitalize('')).toBe('');
      });

      it('should trim string', () => {
        expect(helpers.trim('  hello  ')).toBe('hello');
        expect(helpers.trim('\thello\n')).toBe('hello');
      });
    });

    describe('array operations', () => {
      it('should get first element', () => {
        expect(helpers.first([1, 2, 3])).toBe(1);
        expect(helpers.first([])).toBeUndefined();
      });

      it('should get last element', () => {
        expect(helpers.last([1, 2, 3])).toBe(3);
        expect(helpers.last([])).toBeUndefined();
      });

      it('should get unique elements', () => {
        expect(helpers.unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
        expect(helpers.unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
      });

      it('should flatten array', () => {
        expect(helpers.flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
        expect(helpers.flatten([['a'], ['b', 'c']])).toEqual(['a', 'b', 'c']);
      });
    });

    describe('object operations', () => {
      it('should get object keys', () => {
        expect(helpers.keys({ a: 1, b: 2 })).toEqual(['a', 'b']);
        expect(helpers.keys({})).toEqual([]);
      });

      it('should get object values', () => {
        expect(helpers.values({ a: 1, b: 2 })).toEqual([1, 2]);
        expect(helpers.values({})).toEqual([]);
      });

      it('should get object entries', () => {
        expect(helpers.entries({ a: 1, b: 2 })).toEqual([['a', 1], ['b', 2]]);
        expect(helpers.entries({})).toEqual([]);
      });

      it('should merge objects', () => {
        expect(helpers.merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
        expect(helpers.merge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
        expect(helpers.merge({}, { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
      });
    });

    describe('date/time operations', () => {
      it('should get current date', () => {
        const now = helpers.now();
        expect(now).toBeInstanceOf(Date);
      });

      it('should get timestamp', () => {
        const timestamp = helpers.timestamp();
        expect(typeof timestamp).toBe('number');
        expect(timestamp).toBeGreaterThan(0);
      });

      it('should format date', () => {
        const date = new Date('2023-12-25');
        expect(helpers.formatDate(date)).toBe('2023-12-25');
        expect(helpers.formatDate(date, 'YYYY/MM/DD')).toBe('2023/12/25');
        expect(helpers.formatDate(date, 'DD-MM-YYYY')).toBe('25-12-2023');
      });
    });

    describe('math operations', () => {
      it('should generate random number', () => {
        const random = helpers.random();
        expect(random).toBeGreaterThanOrEqual(0);
        expect(random).toBeLessThanOrEqual(1);

        const random2 = helpers.random(10, 20);
        expect(random2).toBeGreaterThanOrEqual(10);
        expect(random2).toBeLessThanOrEqual(20);
      });

      it('should round number', () => {
        expect(helpers.round(3.14159)).toBe(3);
        expect(helpers.round(3.14159, 2)).toBe(3.14);
        expect(helpers.round(3.14159, 4)).toBe(3.1416);
      });
    });

    describe('type checking', () => {
      it('should check string type', () => {
        expect(helpers.isString('hello')).toBe(true);
        expect(helpers.isString(123)).toBe(false);
        expect(helpers.isString(null)).toBe(false);
      });

      it('should check number type', () => {
        expect(helpers.isNumber(123)).toBe(true);
        expect(helpers.isNumber('123')).toBe(false);
        expect(helpers.isNumber(NaN)).toBe(true);
      });

      it('should check boolean type', () => {
        expect(helpers.isBoolean(true)).toBe(true);
        expect(helpers.isBoolean(false)).toBe(true);
        expect(helpers.isBoolean(1)).toBe(false);
      });

      it('should check array type', () => {
        expect(helpers.isArray([])).toBe(true);
        expect(helpers.isArray([1, 2, 3])).toBe(true);
        expect(helpers.isArray({})).toBe(false);
      });

      it('should check object type', () => {
        expect(helpers.isObject({})).toBe(true);
        expect(helpers.isObject({ a: 1 })).toBe(true);
        expect(helpers.isObject([])).toBe(false);
        expect(helpers.isObject(null)).toBe(false);
      });
    });

    describe('JSON operations', () => {
      it('should convert to JSON', () => {
        expect(helpers.toJSON({ a: 1 })).toBe('{\n  "a": 1\n}');
        expect(helpers.toJSON([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]');
      });

      it('should parse from JSON', () => {
        expect(helpers.fromJSON('{"a":1}')).toEqual({ a: 1 });
        expect(helpers.fromJSON('[1,2,3]')).toEqual([1, 2, 3]);
      });
    });

    describe('environment operations', () => {
      it('should get environment variable', () => {
        process.env.TEST_VAR = 'test_value';
        expect(helpers.env('TEST_VAR')).toBe('test_value');
        expect(helpers.env('MISSING_VAR', 'default')).toBe('default');
        delete process.env.TEST_VAR;
      });

      it('should get platform', () => {
        expect(helpers.platform()).toBe(process.platform);
      });

      it('should get architecture', () => {
        expect(helpers.arch()).toBe(process.arch);
      });
    });

    describe('utility operations', () => {
      it('should sleep for specified time', async () => {
        const start = Date.now();
        await helpers.sleep(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small variance
      });

      it('should retry function on failure', async () => {
        let attempts = 0;
        const fn = vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Failed');
          }
          return 'success';
        });

        const result = await helpers.retry(fn, 3, 10);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should throw after max retry attempts', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

        await expect(helpers.retry(fn, 3, 10)).rejects.toThrow('Always fails');
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('tasks', () => {
    describe('variable management tasks', () => {
      it('should set variable with setVar task', async () => {
        mockContext.vars = { name: 'testVar', value: 'testValue' };

        const result = await tasks.setVar.handler(mockContext);

        expect(setVar).toHaveBeenCalledWith('testVar', 'testValue');
        expect(result).toEqual({ set: { testVar: 'testValue' } });
      });

      it('should get variable with getVar task', async () => {
        mockContext.vars = { name: 'testVar' };
        vi.mocked(getVar).mockReturnValue('testValue');

        const result = await tasks.getVar.handler(mockContext);

        expect(getVar).toHaveBeenCalledWith('testVar');
        expect(result).toEqual({ testVar: 'testValue' });
      });
    });

    describe('logging tasks', () => {
      it('should log debug message', async () => {
        mockContext.vars = { message: 'Debug message' };

        const result = await tasks.debug.handler(mockContext);

        expect(mockContext.logger.debug).toHaveBeenCalledWith('Debug message');
        expect(result).toEqual({ logged: 'debug' });
      });

      it('should log info message', async () => {
        mockContext.vars = { message: 'Info message' };

        const result = await tasks.info.handler(mockContext);

        expect(mockContext.logger.info).toHaveBeenCalledWith('Info message');
        expect(result).toEqual({ logged: 'info' });
      });

      it('should log warn message', async () => {
        mockContext.vars = { message: 'Warning message' };

        const result = await tasks.warn.handler(mockContext);

        expect(mockContext.logger.warn).toHaveBeenCalledWith('Warning message');
        expect(result).toEqual({ logged: 'warn' });
      });

      it('should log error message', async () => {
        mockContext.vars = { message: 'Error message' };

        const result = await tasks.error.handler(mockContext);

        expect(mockContext.logger.error).toHaveBeenCalledWith('Error message');
        expect(result).toEqual({ logged: 'error' });
      });
    });

    describe('control flow tasks', () => {
      it('should delay for specified time', async () => {
        mockContext.vars = { ms: 50 };

        const start = Date.now();
        const result = await tasks.delay.handler(mockContext);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small variance
        expect(result).toEqual({ delayed: 50 });
      });
    });

    describe('template task', () => {
      it('should render template', async () => {
        mockContext.vars = {
          template: 'Hello {{name}}!',
          data: { name: 'World' }
        };
        vi.mocked(template).mockReturnValue('Hello World!');

        const result = await tasks.template.handler(mockContext);

        expect(template).toHaveBeenCalledWith('Hello {{name}}!', { name: 'World' });
        expect(result).toEqual({ rendered: 'Hello World!' });
      });

      it('should use context vars if data not provided', async () => {
        mockContext.vars = {
          template: 'Hello {{name}}!',
          name: 'Context'
        };
        vi.mocked(template).mockReturnValue('Hello Context!');

        const result = await tasks.template.handler(mockContext);

        expect(template).toHaveBeenCalledWith('Hello {{name}}!', mockContext.vars);
        expect(result).toEqual({ rendered: 'Hello Context!' });
      });
    });

    describe('task metadata', () => {
      it('should have proper task structure', () => {
        Object.values(tasks).forEach(task => {
          expect(task).toHaveProperty('id');
          expect(task).toHaveProperty('name');
          expect(task).toHaveProperty('description');
          expect(task).toHaveProperty('handler');
          expect(task).toHaveProperty('options');
          expect(task.options).toHaveProperty('vars');
        });
      });

      it('should have descriptive names', () => {
        expect(tasks.setVar.description).toBe('Set a variable value');
        expect(tasks.getVar.description).toBe('Get a variable value');
        expect(tasks.debug.description).toBe('Log debug message');
        expect(tasks.info.description).toBe('Log info message');
        expect(tasks.warn.description).toBe('Log warning message');
        expect(tasks.error.description).toBe('Log error message');
        expect(tasks.delay.description).toBe('Wait for specified time');
        expect(tasks.template.description).toBe('Render a template string');
      });

      it('should have required vars defined', () => {
        expect(tasks.setVar.options.vars).toHaveProperty('name');
        expect(tasks.setVar.options.vars).toHaveProperty('value');
        expect(tasks.getVar.options.vars).toHaveProperty('name');
        expect(tasks.debug.options.vars).toHaveProperty('message');
        expect(tasks.delay.options.vars).toHaveProperty('ms');
      });
    });
  });
});