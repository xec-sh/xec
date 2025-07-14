import { it, expect, describe, beforeEach } from 'vitest';

import { Task, TaskContext } from '../../../../src/tasks/types.js';
import { networkModule } from '../../../../src/modules/stdlib/network.js';

describe('modules/stdlib/network', () => {
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
      expect(networkModule.metadata.name).toBe('network');
      expect(networkModule.metadata.version).toBe('1.0.0');
      expect(networkModule.metadata.tags).toContain('network');
    });
  });

  describe('validate', () => {
    it('should validate ping task', () => {
      const result = networkModule.validate({
        type: 'ping',
        host: 'example.com',
        timeout: 5000,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate dns_lookup task', () => {
      const result = networkModule.validate({
        type: 'dns_lookup',
        hostname: 'example.com',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate tcp_check task', () => {
      const result = networkModule.validate({
        type: 'tcp_check',
        host: 'example.com',
        port: 80,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate http_check task', () => {
      const result = networkModule.validate({
        type: 'http_check',
        url: 'https://example.com',
        method: 'GET',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate wait_for_port task', () => {
      const result = networkModule.validate({
        type: 'wait_for_port',
        host: 'localhost',
        port: 8080,
        timeout: 30000,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid task', () => {
      const result = networkModule.validate({
        type: 'invalid',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute ping task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Ping test',
        module: 'network',
        definition: {
          type: 'ping',
          host: 'localhost',
          timeout: 1000,
        },
      };

      const result = await networkModule.execute(task, context);
      
      expect(result.success).toBeDefined();
      expect(result.changed).toBe(false);
      expect(result.output).toBeDefined();
    });

    it('should execute dns_lookup task', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'DNS lookup',
        module: 'network',
        definition: {
          type: 'dns_lookup',
          hostname: 'localhost',
        },
      };

      const result = await networkModule.execute(task, context);
      
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.data).toBeDefined();
    });

    it('should handle invalid task type', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Invalid task',
        module: 'network',
        definition: {
          type: 'invalid' as any,
        },
      };

      const result = await networkModule.execute(task, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});