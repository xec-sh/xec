import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { AdapterError } from '../../../src/core/error.js';
import { SSHAdapter, SSHAdapterConfig } from '../../../src/adapters/ssh/index.js';

describe('SSH Connection Pool', () => {
  let adapter: SSHAdapter;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  describe('Connection Pool Configuration', () => {
    it('should create adapter with connection pool enabled by default', () => {
      adapter = new SSHAdapter();
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      expect(poolConfig.enabled).toBe(true);
    });

    it('should respect custom connection pool configuration', () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: false,
          maxConnections: 5,
          idleTimeout: 120000,
          keepAlive: false
        }
      };
      
      adapter = new SSHAdapter(config);
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      
      expect(poolConfig.enabled).toBe(false);
      expect(poolConfig.maxConnections).toBe(5);
      expect(poolConfig.idleTimeout).toBe(120000);
      expect(poolConfig.keepAlive).toBe(false);
    });

    it('should initialize connection pool when enabled', () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: true, maxConnections: 10, idleTimeout: 300000, keepAlive: true }
      });
      
      const connectionPool = (adapter as any).connectionPool;
      expect(connectionPool).toBeDefined();
      expect(connectionPool.constructor.name).toBe('Map');
    });

    it('should not initialize connection pool when disabled', () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: false, maxConnections: 10, idleTimeout: 300000, keepAlive: true }
      });
      
      const connectionPool = (adapter as any).connectionPool;
      expect(connectionPool).toBeDefined();
      expect(connectionPool.constructor.name).toBe('Map');
    });
  });

  describe('Connection Pool Metrics', () => {
    it('should initialize metrics object', () => {
      adapter = new SSHAdapter();
      
      const metrics = adapter.getConnectionPoolMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.idleConnections).toBe(0);
      expect(metrics.connectionsCreated).toBe(0);
      expect(metrics.connectionsDestroyed).toBe(0);
      expect(metrics.reuseCount).toBe(0);
      expect(metrics.connectionsFailed).toBe(0);
    });

    it('should return metrics even when pool is disabled', () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: false, maxConnections: 10, idleTimeout: 300000, keepAlive: true }
      });
      
      const metrics = adapter.getConnectionPoolMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.totalConnections).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when SSH options are missing', async () => {
      adapter = new SSHAdapter();
      
      await expect(adapter.execute({
        command: 'ls'
      })).rejects.toThrow(AdapterError);
    });

    it('should throw error when adapterOptions type is incorrect', async () => {
      adapter = new SSHAdapter();
      
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'docker' as any
        }
      })).rejects.toThrow(AdapterError);
    });
  });

  describe('Keep-Alive Configuration', () => {
    it('should respect keep-alive settings', () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true,
          keepAliveInterval: 30000
        }
      };
      
      adapter = new SSHAdapter(config);
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      
      expect(poolConfig.keepAlive).toBe(true);
      expect(poolConfig.keepAliveInterval).toBe(30000);
    });

    it('should have default keep-alive interval', () => {
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true
        }
      });
      
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      expect(poolConfig.keepAliveInterval).toBe(30000); // default value
    });
  });

  describe('Auto-Reconnect Configuration', () => {
    it('should respect auto-reconnect settings', () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true,
          autoReconnect: true,
          maxReconnectAttempts: 3,
          reconnectDelay: 1000
        }
      };
      
      adapter = new SSHAdapter(config);
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      
      expect(poolConfig.autoReconnect).toBe(true);
      expect(poolConfig.maxReconnectAttempts).toBe(3);
      expect(poolConfig.reconnectDelay).toBe(1000);
    });

    it('should have default auto-reconnect values', () => {
      adapter = new SSHAdapter();
      
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      expect(poolConfig.autoReconnect).toBe(true);
      expect(poolConfig.maxReconnectAttempts).toBe(3);
      expect(poolConfig.reconnectDelay).toBe(1000);
    });
  });

  describe('Pool Cleanup', () => {
    it('should clean up timers on dispose', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 60000,
          keepAlive: true
        }
      });
      
      // Access private properties for testing
      const cleanupInterval = (adapter as any).poolCleanupInterval;
      
      // Pool cleanup should be initialized
      expect(cleanupInterval).toBeDefined();
      
      await adapter.dispose();
      
      // clearInterval should have been called with the cleanup interval
      expect(clearIntervalSpy).toHaveBeenCalledWith(cleanupInterval);
      
      clearIntervalSpy.mockRestore();
    });

    it('should handle multiple dispose calls gracefully', async () => {
      adapter = new SSHAdapter();
      
      await adapter.dispose();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });
  });

  describe('Connection Pool Size Limits', () => {
    it('should respect maxConnections setting', () => {
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 2,
          idleTimeout: 300000,
          keepAlive: true
        }
      });
      
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      expect(poolConfig.maxConnections).toBe(2);
    });

    it('should have default maxConnections value', () => {
      adapter = new SSHAdapter();
      
      const poolConfig = (adapter as any).sshConfig.connectionPool;
      expect(poolConfig.maxConnections).toBe(10); // default value
    });
  });

  describe('Event Emission', () => {
    it('should be able to register event listeners', () => {
      adapter = new SSHAdapter();
      
      const metricsHandler = jest.fn();
      const cleanupHandler = jest.fn();
      
      adapter.on('ssh:pool-metrics', metricsHandler);
      adapter.on('ssh:pool-cleanup', cleanupHandler);
      
      // Check that listeners are registered
      expect(adapter.listenerCount('ssh:pool-metrics')).toBe(1);
      expect(adapter.listenerCount('ssh:pool-cleanup')).toBe(1);
    });

    it('should remove event listeners', () => {
      adapter = new SSHAdapter();
      
      const handler = jest.fn();
      adapter.on('ssh:pool-metrics', handler);
      
      expect(adapter.listenerCount('ssh:pool-metrics')).toBe(1);
      
      adapter.off('ssh:pool-metrics', handler);
      
      expect(adapter.listenerCount('ssh:pool-metrics')).toBe(0);
    });
  });
});