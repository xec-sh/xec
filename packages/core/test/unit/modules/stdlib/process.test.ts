import { it, expect, describe, beforeEach } from 'vitest';

import { Task, TaskContext } from '../../../../src/tasks/types.js';
import { processModule } from '../../../../src/modules/stdlib/process.js';

describe('modules/stdlib/process', () => {
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
      expect(processModule.metadata.name).toBe('process');
      expect(processModule.metadata.version).toBe('1.0.0');
      expect(processModule.metadata.tags).toContain('process');
    });
  });

  describe('validate', () => {
    it('should validate exec task', () => {
      const result = processModule.validate({
        type: 'exec',
        command: 'echo "hello"',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate spawn task', () => {
      const result = processModule.validate({
        type: 'spawn',
        command: 'ls',
        args: ['-la'],
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate system_info task', () => {
      const result = processModule.validate({
        type: 'system_info',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid task', () => {
      const result = processModule.validate({
        type: 'invalid',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute exec task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Execute echo',
        module: 'process',
        definition: {
          type: 'exec',
          command: 'echo "hello world"',
        },
      };

      const result = await processModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.output).toContain('hello world');
    });

    it('should execute system_info task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Get system info',
        module: 'process',
        definition: {
          type: 'system_info',
        },
      };

      const result = await processModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toHaveProperty('platform');
      expect(result.data).toHaveProperty('arch');
      expect(result.data).toHaveProperty('hostname');
      expect(result.data).toHaveProperty('cpus');
      expect(result.data).toHaveProperty('totalMemory');
    });

    it('should handle exec task failure', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Execute invalid command',
        module: 'process',
        definition: {
          type: 'exec',
          command: 'invalidcommandthatdoesnotexist',
        },
      };

      const result = await processModule.execute(task, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid task type', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Invalid task',
        module: 'process',
        definition: {
          type: 'invalid' as any,
        },
      };

      const result = await processModule.execute(task, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});