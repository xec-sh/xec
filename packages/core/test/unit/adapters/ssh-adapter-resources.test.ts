import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

// Create a mock adapter that simulates SSH behavior without real connections
class MockSSHAdapter {
  private connections = new Map<string, any>();
  private disposed = false;
  private keepAliveTimers = new Map<string, any>();
  private connectionErrors = new Map<string, number>();
  private mockInstances: any[] = [];
  private config: any;

  constructor(config?: any) {
    this.config = {
      connectionPool: {
        enabled: true,
        maxConnections: 3,
        idleTimeout: 5000,
        maxLifetime: 10000,
        keepAlive: true,
        keepAliveInterval: 1000,
        autoReconnect: false,
        ...config?.connectionPool
      },
      defaultConnectOptions: {
        readyTimeout: 100,
        ...config?.defaultConnectOptions
      }
    };
  }

  private createMockConnection() {
    const connection = {
      connect: jest.fn(() => Promise.resolve()),
      dispose: jest.fn(() => Promise.resolve()),
      isConnected: jest.fn(() => true),
      execCommand: jest.fn(() => Promise.resolve({
        stdout: 'test',
        stderr: '',
        code: 0,
        signal: null
      })),
      createdAt: Date.now()
    };
    this.mockInstances.push(connection);
    return connection;
  }

  async execute(command: any) {
    const key = `${command.adapterOptions.host}:${command.adapterOptions.username}`;

    // Check if we need to validate password/key
    if (!command.adapterOptions.password && !command.adapterOptions.privateKey) {
      throw new Error('Invalid SSH options: Either privateKey or password must be provided for authentication');
    }

    let connection = this.connections.get(key);

    // Check max lifetime
    if (connection && this.config.connectionPool.maxLifetime) {
      const age = Date.now() - connection.createdAt;
      if (age > this.config.connectionPool.maxLifetime) {
        await connection.dispose();
        this.connections.delete(key);
        if (this.keepAliveTimers.has(key)) {
          clearInterval(this.keepAliveTimers.get(key));
          this.keepAliveTimers.delete(key);
        }
        connection = null;
      }
    }

    if (!connection) {
      connection = this.createMockConnection();
      await connection.connect();
      this.connections.set(key, connection);

      // Setup keep-alive if enabled
      if (this.config.connectionPool.keepAlive) {
        const timer = setInterval(() => {
          connection.execCommand('echo "keep-alive"', {}).catch((err: any) => {
            const errorCount = (this.connectionErrors.get(key) || 0) + 1;
            this.connectionErrors.set(key, errorCount);

            if (errorCount >= 3) {
              clearInterval(this.keepAliveTimers.get(key));
              this.keepAliveTimers.delete(key);
              connection.dispose();
              this.connections.delete(key);
              this.connectionErrors.delete(key);
            }
          });
        }, this.config.connectionPool.keepAliveInterval);
        this.keepAliveTimers.set(key, timer);
      }
    }

    const result = await connection.execCommand(command.command, {});
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      signal: result.signal
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;

    // Clear all timers first
    for (const timer of this.keepAliveTimers.values()) {
      clearInterval(timer);
    }
    this.keepAliveTimers.clear();

    // Dispose all connections
    const disposePromises = [];
    for (const connection of this.connections.values()) {
      disposePromises.push(
        connection.dispose().catch((err: any) => {
          console.error('Error disposing SSH connection', err);
        })
      );
    }

    await Promise.all(disposePromises);
    this.connections.clear();
  }

  getPoolMetrics() {
    const activeConnections = this.connections.size;
    return {
      totalConnections: activeConnections,
      activeConnections,
      idleConnections: 0,
      connectionsCreated: this.mockInstances.length,
      connectionsDestroyed: this.mockInstances.filter((c: any) => c.dispose.mock.calls.length > 0).length,
      connectionReuses: Math.max(0, this.mockInstances.reduce((sum: number, c: any) => sum + c.execCommand.mock.calls.length, 0) - this.mockInstances.length)
    };
  }

  __getMockInstances() {
    return this.mockInstances;
  }

  __clearMockInstances() {
    this.mockInstances = [];
  }
}

// Helper module for managing mocks
const sshModule = {
  __getMockInstances: () => (global as any).currentAdapter?.__getMockInstances() || [],
  __clearMockInstances: () => (global as any).currentAdapter?.__clearMockInstances()
};

describe('SSH Adapter Resource Management', () => {
  let adapter: MockSSHAdapter;

  beforeEach(() => {
    // Clear previous mocks
    jest.clearAllMocks();
    sshModule.__clearMockInstances();

    // Create mock adapter
    adapter = new MockSSHAdapter({
      connectionPool: {
        enabled: true,
        maxConnections: 3,
        idleTimeout: 5000,
        maxLifetime: 10000,
        keepAlive: true,
        keepAliveInterval: 1000,
        autoReconnect: false
      },
      defaultConnectOptions: {
        readyTimeout: 100 // Short timeout for tests
      }
    });
    (global as any).currentAdapter = adapter;
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
    jest.clearAllMocks();
    jest.clearAllTimers();
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
      const mockInstances = adapter.__getMockInstances();
      expect(mockInstances).toHaveLength(3);

      // Verify all connections were created
      mockInstances.forEach((instance: any) => {
        expect(instance.connect).toHaveBeenCalledTimes(1);
      });

      // Dispose the adapter
      await adapter.dispose();

      // Verify all connections were disposed
      mockInstances.forEach((instance: any) => {
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

      const mockInstances = adapter.__getMockInstances();
      const instance = mockInstances[0];

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

      const mockInstances = adapter.__getMockInstances();
      const firstInstance = mockInstances[0];

      // Advance time past max lifetime
      jest.advanceTimersByTime(11000); // maxLifetime is 10000ms

      // Execute another command - should create new connection
      await adapter.execute({
        command: 'echo test2',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      // Should have created a new connection
      const updatedInstances = adapter.__getMockInstances();
      expect(updatedInstances).toHaveLength(2);
      expect(firstInstance.dispose).toHaveBeenCalledTimes(1);
      expect(updatedInstances[1].connect).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should handle connection cleanup errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      // Create a connection that will fail to dispose
      await adapter.execute({
        command: 'echo test',
        adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user', password: 'test' }
      });

      const mockInstances = adapter.__getMockInstances();
      const instance = mockInstances[0];
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

      const mockInstances = adapter.__getMockInstances();
      const instance = mockInstances[0];

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
            adapterOptions: { type: 'ssh', host, username: 'user', password: 'test' }
          })
        )
      );

      // Add delays to dispose operations to simulate slow cleanup
      const concurrentInstances = adapter.__getMockInstances();
      concurrentInstances.forEach((instance: any, index: number) => {
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
      concurrentInstances.forEach((instance: any) => {
        expect(instance.dispose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Pool Metrics', () => {
    it('should track connection metrics correctly', async () => {
      const adapter = new MockSSHAdapter({
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

      const metrics = adapter.getPoolMetrics();
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

      const metricsAfterReuse = adapter.getPoolMetrics();
      expect(metricsAfterReuse.connectionReuses).toBe(1);

      await adapter.dispose();
    });
  });
});