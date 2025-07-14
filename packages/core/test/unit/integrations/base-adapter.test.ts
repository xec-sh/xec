import { it, vi, expect, describe, beforeEach } from 'vitest';

import { BaseAdapter, AdapterConfig, ExecutionResult } from '../../../src/integrations/base-adapter.js';

// Create a concrete implementation for testing
class TestAdapter extends BaseAdapter {
  async connect(): Promise<void> {
    this.connected = true;
    this.connectionTime = Date.now();
    this.emitEvent({
      type: 'connected',
      timestamp: Date.now(),
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitEvent({
      type: 'disconnected',
      timestamp: Date.now(),
    });
  }

  async execute(command: string, options?: any): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    if (command === 'fail') {
      return {
        success: false,
        error: new Error('Command failed'),
        duration: Date.now() - startTime,
      };
    }
    
    return {
      success: true,
      output: `Executed: ${command}`,
      duration: Date.now() - startTime,
      metadata: { options },
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  validateConfig(config: any): boolean {
    return !!(config.name && config.type);
  }
}

describe('integrations/base-adapter', () => {
  let adapter: TestAdapter;
  const config: AdapterConfig = {
    name: 'test-adapter',
    type: 'test',
    timeout: 5000,
    retries: 3,
    debug: false,
  };

  beforeEach(() => {
    adapter = new TestAdapter(config);
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getLastError()).toBeNull();
      expect(adapter.getConnectionTime()).toBe(0);
    });
  });

  describe('connect/disconnect', () => {
    it('should connect successfully', async () => {
      await adapter.connect();
      
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getConnectionTime()).toBeGreaterThan(0);
    });

    it('should disconnect successfully', async () => {
      await adapter.connect();
      await adapter.disconnect();
      
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should execute command successfully', async () => {
      const result = await adapter.execute('test-command');
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('Executed: test-command');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle command failure', async () => {
      const result = await adapter.execute('fail');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Command failed');
    });
  });

  describe('healthCheck', () => {
    it('should return false when not connected', async () => {
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return true when connected', async () => {
      await adapter.connect();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const valid = adapter.validateConfig({ name: 'test', type: 'test' });
      expect(valid).toBe(true);
    });

    it('should reject invalid config', () => {
      const valid = adapter.validateConfig({ invalid: true });
      expect(valid).toBe(false);
    });
  });

  describe('event emission', () => {
    it('should emit connected event', async () => {
      const eventHandler = vi.fn();
      const specificHandler = vi.fn();
      
      adapter.on('event', eventHandler);
      adapter.on('connected', specificHandler);
      
      await adapter.connect();
      
      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'connected',
        timestamp: expect.any(Number),
      }));
      expect(specificHandler).toHaveBeenCalled();
    });

    it('should emit disconnected event', async () => {
      const eventHandler = vi.fn();
      const specificHandler = vi.fn();
      
      adapter.on('event', eventHandler);
      adapter.on('disconnected', specificHandler);
      
      await adapter.connect();
      await adapter.disconnect();
      
      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'disconnected',
        timestamp: expect.any(Number),
      }));
      expect(specificHandler).toHaveBeenCalled();
    });
  });

  describe('executeWithRetry', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await (adapter as any).executeWithRetry(mockFn, 3);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        (adapter as any).executeWithRetry(mockFn, 2)
      ).rejects.toThrow('Persistent failure');
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on success', async () => {
      const mockFn = vi.fn().mockResolvedValue('immediate success');

      const result = await (adapter as any).executeWithRetry(mockFn, 3);
      
      expect(result).toBe('immediate success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeWithTimeout', () => {
    it('should complete within timeout', async () => {
      const mockFn = vi.fn().mockImplementation(async () => {
        await (adapter as any).sleep(100);
        return 'completed';
      });

      const result = await (adapter as any).executeWithTimeout(mockFn, 1000);
      expect(result).toBe('completed');
    });

    it('should timeout for long operations', async () => {
      const mockFn = vi.fn().mockImplementation(async () => {
        await (adapter as any).sleep(2000);
        return 'too late';
      });

      await expect(
        (adapter as any).executeWithTimeout(mockFn, 100)
      ).rejects.toThrow('Operation timed out after 100ms');
    });
  });

  describe('logging', () => {
    it('should log debug messages when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const debugAdapter = new TestAdapter({ ...config, debug: true });
      
      (debugAdapter as any).log('debug', 'Test message', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not log debug messages when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      (adapter as any).log('debug', 'Test message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should always log errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      (adapter as any).log('error', 'Error message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});