import { it, expect, describe, beforeEach } from 'vitest';

import { Task, TaskContext } from '../../../../src/tasks/types.js';
import { utilsModule } from '../../../../src/modules/stdlib/utils.js';

describe('modules/stdlib/utils', () => {
  let context: TaskContext;

  beforeEach(() => {
    context = {
      variables: new Map(),
      secrets: new Map(),
      resources: {},
    };
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(utilsModule.metadata.name).toBe('utils');
      expect(utilsModule.metadata.version).toBe('1.0.0');
      expect(utilsModule.metadata.tags).toContain('utils');
    });
  });

  describe('validate', () => {
    it('should validate sleep task', () => {
      const result = utilsModule.validate({
        type: 'sleep',
        duration: 1000,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate random task', () => {
      const result = utilsModule.validate({
        type: 'random',
        min: 0,
        max: 100,
        integer: true,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate hash task', () => {
      const result = utilsModule.validate({
        type: 'hash',
        algorithm: 'sha256',
        data: 'test data',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid task', () => {
      const result = utilsModule.validate({
        type: 'invalid',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute sleep task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Sleep test',
        module: 'utils',
        definition: {
          type: 'sleep',
          duration: 10,
        },
      };

      const start = Date.now();
      const result = await utilsModule.execute(task, context);
      const elapsed = Date.now() - start;
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it('should execute random task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Random number',
        module: 'utils',
        definition: {
          type: 'random',
          min: 10,
          max: 20,
          integer: true,
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBeGreaterThanOrEqual(10);
      expect(result.data).toBeLessThan(20);
      expect(Number.isInteger(result.data)).toBe(true);
    });

    it('should execute uuid task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Generate UUID',
        module: 'utils',
        definition: {
          type: 'uuid',
          version: 'v4',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should execute hash task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Hash data',
        module: 'utils',
        definition: {
          type: 'hash',
          algorithm: 'sha256',
          data: 'test data',
          encoding: 'hex',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBe('916f0027a575074ce72a331777c3478d6513f786a591bd892da1a577bf2335f9');
    });

    it('should execute template task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Render template',
        module: 'utils',
        definition: {
          type: 'template',
          template: 'Hello {{name}}, your age is {{person.age}}',
          variables: {
            name: 'John',
            person: { age: 30 },
          },
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBe('Hello John, your age is 30');
    });

    it('should execute parse_json task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Parse JSON',
        module: 'utils',
        definition: {
          type: 'parse_json',
          json: '{"name": "test", "value": 42}',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toEqual({ name: 'test', value: 42 });
    });

    it('should execute stringify_json task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Stringify JSON',
        module: 'utils',
        definition: {
          type: 'stringify_json',
          data: { name: 'test', value: 42 },
          pretty: true,
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBe('{\n  "name": "test",\n  "value": 42\n}');
    });

    it('should execute base64_encode task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Base64 encode',
        module: 'utils',
        definition: {
          type: 'base64_encode',
          data: 'hello world',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBe('aGVsbG8gd29ybGQ=');
    });

    it('should execute base64_decode task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Base64 decode',
        module: 'utils',
        definition: {
          type: 'base64_decode',
          data: 'aGVsbG8gd29ybGQ=',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBe('hello world');
    });

    it('should execute timestamp task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Get timestamp',
        module: 'utils',
        definition: {
          type: 'timestamp',
          format: 'unix',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(typeof result.data).toBe('number');
    });

    it('should execute path_join task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Join paths',
        module: 'utils',
        definition: {
          type: 'path_join',
          parts: ['home', 'user', 'documents', 'file.txt'],
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toContain('home');
      expect(result.data).toContain('file.txt');
    });

    it('should execute path_parse task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Parse path',
        module: 'utils',
        definition: {
          type: 'path_parse',
          path: '/home/user/documents/file.txt',
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toHaveProperty('dir');
      expect(result.data).toHaveProperty('base');
      expect(result.data).toHaveProperty('ext');
      expect(result.data).toHaveProperty('name');
    });

    it('should handle invalid task type', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Invalid task',
        module: 'utils',
        definition: {
          type: 'invalid' as any,
        },
      };

      const result = await utilsModule.execute(task, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});