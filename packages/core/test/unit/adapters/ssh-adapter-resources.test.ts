import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { NodeSSH } from '../../../src/adapters/ssh/ssh';
import { SSHAdapter } from '../../../src/adapters/ssh/index';

// Mock the SSH module
jest.mock('../../../src/adapters/ssh/ssh', () => ({
  NodeSSH: jest.fn(() => ({
    connect: jest.fn(() => Promise.resolve()),
    dispose: jest.fn(() => Promise.resolve()),
    isConnected: jest.fn(() => true),
    execCommand: jest.fn(() => Promise.resolve({
      stdout: 'test',
      stderr: '',
      code: 0,
      signal: null
    }))
  }))
}));

describe('SSH Adapter Resource Management', () => {
  let adapter: SSHAdapter;
  let mockSSHInstances: any[] = [];

  beforeEach(() => {
    mockSSHInstances = [];
    (NodeSSH as any).mockImplementation(() => {
      const instance = {
        connect: jest.fn(() => Promise.resolve()),
        dispose: jest.fn(() => Promise.resolve()),
        isConnected: jest.fn(() => true),
        execCommand: jest.fn(() => Promise.resolve({
          stdout: 'test',
          stderr: '',
          code: 0,
          signal: null
        }))
      };
      mockSSHInstances.push(instance);
      return instance;
    });

    adapter = new SSHAdapter({
      connectionPool: {
        enabled: true,
        maxConnections: 3,
        idleTimeout: 5000,
        maxLifetime: 10000,
        keepAlive: true,
        keepAliveInterval: 1000,
        autoReconnect: false
      }
    });
  });

  afterEach(async () => {
    await adapter.dispose();
    jest.clearAllMocks();
  });

  describe('Connection Pool Cleanup', () => {
    it('should properly dispose all connections on adapter dispose', async () => {
      // Create multiple connections
      const connections = await Promise.all([
        adapter.execute({
          command: 'echo test1',
          adapterOptions: { type: 'ssh', host: 'server1.example.com', username: 'user', password: 'test' }
        }),
        adapter.execute({
          command: 'echo test2',
          adapterOptions: { type: 'ssh', host: 'server2.example.com', username: 'user', password: 'test' }
        }),
        adapter.execute({
          command: 'echo test3',
          adapterOptions: { type: 'ssh', host: 'server3.example.com', username: 'user', password: 'test' }
        })
      ]);

      expect(connections).toHaveLength(3);
      expect(mockSSHInstances).toHaveLength(3);

      // Verify all connections were created
      mockSSHInstances.forEach(instance => {
        expect(instance.connect).toHaveBeenCalledTimes(1);
      });

      // Dispose the adapter
      await adapter.dispose();

      // Verify all connections were disposed
      mockSSHInstances.forEach(instance => {
        expect(instance.dispose).toHaveBeenCalledTimes(1);
      });
    });

    it('should clear keep-alive timers on connection removal', async () => {
      jest.useFakeTimers();

      // Create a connection
      await adapter.execute({
        command: 'echo test',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const instance = mockSSHInstances[0];
      
      // Advance time to trigger keep-alive
      jest.advanceTimersByTime(1000);
      
      // Verify keep-alive was called
      expect(instance.execCommand).toHaveBeenCalledWith('echo "keep-alive"', expect.any(Object));

      // Dispose adapter
      await adapter.dispose();

      // Clear all timers and advance time
      jest.clearAllTimers();
      jest.advanceTimersByTime(5000);

      // Verify no more keep-alive calls after disposal
      const keepAliveCallCount = instance.execCommand.mock.calls.filter(
(call: any) => call[0] === 'echo "keep-alive"'
      ).length;
      
      expect(keepAliveCallCount).toBe(1); // Only the initial keep-alive

      jest.useRealTimers();
    });

    it('should enforce maximum connection lifetime', async () => {
      jest.useFakeTimers();

      // Create a connection
      await adapter.execute({
        command: 'echo test',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const firstInstance = mockSSHInstances[0];

      // Advance time past max lifetime
      jest.advanceTimersByTime(11000); // maxLifetime is 10000ms

      // Execute another command - should create new connection
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      // Should have created a new connection
      expect(mockSSHInstances).toHaveLength(2);
      expect(firstInstance.dispose).toHaveBeenCalledTimes(1);
      expect(mockSSHInstances[1].connect).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should handle connection cleanup errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Create a connection that will fail to dispose
      await adapter.execute({
        command: 'echo test',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const instance = mockSSHInstances[0];
      instance.dispose.mockRejectedValue(new Error('Dispose failed'));

      // Dispose should not throw even if connection disposal fails
      await expect(adapter.dispose()).resolves.toBeUndefined();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error disposing SSH connection'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should remove connections that exceed error threshold', async () => {
      jest.useFakeTimers();

      // Create a connection
      await adapter.execute({
        command: 'echo test',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const instance = mockSSHInstances[0];
      
      // Make keep-alive fail multiple times
      instance.execCommand.mockRejectedValue(new Error('Connection failed'));

      // Trigger keep-alive failures
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(1000);
        await jest.runAllTimersAsync();
      }

      // Connection should be removed after 3 failures
      expect(instance.dispose).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should handle concurrent connection closes properly', async () => {
      // Create multiple connections
      const hosts = ['server1.example.com', 'server2.example.com', 'server3.example.com'];
      
      await Promise.all(
        hosts.map(host =>
          adapter.execute({
            command: 'echo test',
            adapterOptions: { type: 'ssh', host, username: 'user' }
          })
        )
      );

      // Add delays to dispose operations to simulate slow cleanup
      mockSSHInstances.forEach((instance, index) => {
        instance.dispose.mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, index * 100));
        });
      });

      const start = Date.now();
      await adapter.dispose();
      const duration = Date.now() - start;

      // All connections should be disposed in parallel, not sequentially
      expect(duration).toBeLessThan(300); // Should be much less than 300ms (sequential would be ~300ms)
      
      // Verify all were disposed
      mockSSHInstances.forEach(instance => {
        expect(instance.dispose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Pool Metrics', () => {
    it('should track connection metrics correctly', async () => {
      const adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 3,
          idleTimeout: 60000,
          keepAlive: false
        }
      });

      // Execute command to create connection
      await adapter.execute({
        command: 'echo test',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const metrics = (adapter as any).getPoolMetrics();
      expect(metrics.totalConnections).toBe(1);
      expect(metrics.activeConnections).toBe(1);
      expect(metrics.idleConnections).toBe(0);
      expect(metrics.connectionsCreated).toBe(1);
      expect(metrics.connectionsDestroyed).toBe(0);
      expect(metrics.connectionReuses).toBe(0);

      // Reuse connection
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const metricsAfterReuse = (adapter as any).getPoolMetrics();
      expect(metricsAfterReuse.connectionReuses).toBe(1);

      await adapter.dispose();
    });
  });
});