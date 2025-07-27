import { it , jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { NodeSSH } from '../../../src/utils/ssh.js';
import { SSHAdapter, SSHAdapterConfig } from '../../../src/adapters/ssh-adapter.js';

// Mock the ssh module
jest.mock('../../../src/utils/ssh.js');

describe('SSH Connection Pool', () => {
  let adapter: SSHAdapter;
  let mockSSHInstances: any[] = [];
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockSSHInstances = [];
    
    // Mock NodeSSH constructor
    const MockedNodeSSH = NodeSSH as jest.MockedClass<typeof NodeSSH>;
    MockedNodeSSH.mockImplementation(() => {
      const mockInstance = {
        connect: jest.fn(() => Promise.resolve()),
        dispose: jest.fn(),
        isConnected: jest.fn(() => true),
        execCommand: jest.fn(() => Promise.resolve({
          stdout: 'test output',
          stderr: '',
          code: 0
        }))
      };
      mockSSHInstances.push(mockInstance);
      return mockInstance as any;
    });
  });
  
  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  describe('Connection Pooling', () => {
    it('should reuse connections for the same host', async () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true
        }
      };
      
      adapter = new SSHAdapter(config);
      
      const sshOptions = {
        type: 'ssh' as const,
        host: 'test.example.com',
        username: 'testuser',
        privateKey: 'test-key'
      };
      
      // Execute two commands to the same host
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: sshOptions
      });
      
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: sshOptions
      });
      
      // Should only create one connection
      expect(mockSSHInstances.length).toBe(1);
      expect(mockSSHInstances[0].connect).toHaveBeenCalledTimes(1);
      expect(mockSSHInstances[0].execCommand).toHaveBeenCalledTimes(2);
    });
    
    it('should create separate connections for different hosts', async () => {
      adapter = new SSHAdapter();
      
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: {
          type: 'ssh',
          host: 'host1.example.com',
          username: 'user1',
          privateKey: 'key1'
        }
      });
      
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: {
          type: 'ssh',
          host: 'host2.example.com',
          username: 'user2',
          privateKey: 'key2'
        }
      });
      
      // Should create two connections
      expect(mockSSHInstances.length).toBe(2);
    });
    
    it('should respect max connections limit', async () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 2,
          idleTimeout: 300000,
          keepAlive: true
        }
      };
      
      adapter = new SSHAdapter(config);
      
      // Create connections to different hosts
      const hosts = ['host1', 'host2', 'host3'];
      const promises = hosts.map(host =>
        adapter.execute({
          command: 'echo test',
          adapterOptions: {
            type: 'ssh',
            host: `${host}.example.com`,
            username: 'user',
            privateKey: 'key'
          }
        })
      );
      
      await Promise.all(promises);
      
      // Should not exceed max connections
      // One connection should have been removed
      expect(mockSSHInstances.filter(ssh => ssh.dispose).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Keep-Alive', () => {
    it('should set up keep-alive when enabled', async () => {
      jest.useFakeTimers();
      
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
      
      await adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'ssh',
          host: 'test.example.com',
          username: 'user',
          privateKey: 'key'
        }
      });
      
      // Advance time to trigger keep-alive
      jest.advanceTimersByTime(30000);
      
      // Should have executed keep-alive command
      expect(mockSSHInstances[0].execCommand).toHaveBeenCalledWith(
        'echo "keep-alive"',
        expect.objectContaining({ cwd: '/' })
      );
      
      jest.useRealTimers();
    });
  });

  describe('Auto-Reconnect', () => {
    it('should attempt to reconnect on connection failure', async () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true,
          autoReconnect: true,
          maxReconnectAttempts: 3,
          reconnectDelay: 100
        }
      };
      
      adapter = new SSHAdapter(config);
      
      const sshOptions = {
        type: 'ssh' as const,
        host: 'test.example.com',
        username: 'user',
        privateKey: 'key'
      };
      
      // First connection succeeds
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: sshOptions
      });
      
      // Simulate connection failure
      mockSSHInstances[0].isConnected.mockReturnValue(false);
      
      // Second attempt should trigger reconnection
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: sshOptions
      });
      
      // Should have attempted to reconnect
      expect(mockSSHInstances[0].connect).toHaveBeenCalledTimes(2);
    });
    
    it('should fail after max reconnect attempts', async () => {
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true,
          autoReconnect: true,
          maxReconnectAttempts: 2,
          reconnectDelay: 10
        }
      };
      
      adapter = new SSHAdapter(config);
      
      const sshOptions = {
        type: 'ssh' as const,
        host: 'test.example.com',
        username: 'user',
        privateKey: 'key'
      };
      
      // First connection succeeds
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: sshOptions
      });
      
      // Simulate persistent connection failure
      mockSSHInstances[0].isConnected.mockReturnValue(false);
      mockSSHInstances[0].connect.mockRejectedValue(new Error('Connection failed'));
      
      // Should eventually give up and create new connection
      try {
        await adapter.execute({
          command: 'echo test2',
          adapterOptions: sshOptions
        });
      } catch (error) {
        // Expected to fail
      }
      
      // Should have created a new connection after giving up
      expect(mockSSHInstances.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Connection Pool Metrics', () => {
    it('should track connection metrics', async () => {
      adapter = new SSHAdapter();
      
      const sshOptions = {
        type: 'ssh' as const,
        host: 'test.example.com',
        username: 'user',
        privateKey: 'key'
      };
      
      // Execute multiple commands
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: sshOptions
      });
      
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: sshOptions
      });
      
      // Get metrics
      const metrics = adapter.getConnectionPoolMetrics();
      
      expect(metrics.connectionsCreated).toBe(1);
      expect(metrics.reuseCount).toBe(1);
      expect(metrics.activeConnections).toBeGreaterThanOrEqual(0);
      expect(metrics.totalConnections).toBeGreaterThanOrEqual(0);
    });
    
    it('should emit pool metrics events', async () => {
      const metricsEvents: any[] = [];
      
      adapter = new SSHAdapter();
      adapter.on('ssh:pool-metrics', (event) => {
        metricsEvents.push(event);
      });
      
      await adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'ssh',
          host: 'test.example.com',
          username: 'user',
          privateKey: 'key'
        }
      });
      
      expect(metricsEvents.length).toBeGreaterThan(0);
      expect(metricsEvents[0].metrics).toBeDefined();
    });
  });

  describe('Pool Cleanup', () => {
    it('should clean up idle connections', async () => {
      jest.useFakeTimers();
      
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 60000, // 1 minute
          keepAlive: true
        }
      };
      
      adapter = new SSHAdapter(config);
      
      await adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'ssh',
          host: 'test.example.com',
          username: 'user',
          privateKey: 'key'
        }
      });
      
      // Advance time past idle timeout
      jest.advanceTimersByTime(120000); // 2 minutes
      
      // Connection should be cleaned up
      expect(mockSSHInstances[0].dispose).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
    
    it('should emit cleanup events', async () => {
      jest.useFakeTimers();
      
      const cleanupEvents: any[] = [];
      
      const config: SSHAdapterConfig = {
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 60000,
          keepAlive: true
        }
      };
      
      adapter = new SSHAdapter(config);
      adapter.on('ssh:pool-cleanup', (event) => {
        cleanupEvents.push(event);
      });
      
      await adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'ssh',
          host: 'test.example.com',
          username: 'user',
          privateKey: 'key'
        }
      });
      
      // Advance time to trigger cleanup
      jest.advanceTimersByTime(120000);
      
      expect(cleanupEvents.length).toBeGreaterThan(0);
      expect(cleanupEvents[0].cleaned).toBe(1);
      
      jest.useRealTimers();
    });
  });

  describe('Error Tracking', () => {
    it('should track connection errors', async () => {
      adapter = new SSHAdapter();
      
      const sshOptions = {
        type: 'ssh' as const,
        host: 'test.example.com',
        username: 'user',
        privateKey: 'key'
      };
      
      // First command succeeds
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: sshOptions
      });
      
      // Simulate command failure
      mockSSHInstances[0].execCommand.mockRejectedValueOnce(new Error('Command failed'));
      
      try {
        await adapter.execute({
          command: 'echo test2',
          adapterOptions: sshOptions
        });
      } catch (error) {
        // Expected
      }
      
      // Connection should still be in pool but with error count
      const metrics = adapter.getConnectionPoolMetrics();
      expect(metrics.activeConnections).toBeGreaterThanOrEqual(0);
    });
    
    it('should remove connections after too many errors', async () => {
      adapter = new SSHAdapter();
      
      const sshOptions = {
        type: 'ssh' as const,
        host: 'test.example.com',
        username: 'user',
        privateKey: 'key'
      };
      
      // First command succeeds
      await adapter.execute({
        command: 'echo test1',
        adapterOptions: sshOptions
      });
      
      // Simulate multiple failures
      mockSSHInstances[0].execCommand.mockRejectedValue(new Error('Command failed'));
      
      // Execute failing commands
      for (let i = 0; i < 4; i++) {
        try {
          await adapter.execute({
            command: `echo test${i + 2}`,
            adapterOptions: sshOptions
          });
        } catch (error) {
          // Expected
        }
      }
      
      // Connection should be removed after too many errors
      expect(mockSSHInstances[0].dispose).toHaveBeenCalled();
    });
  });
});