import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { NodeSSH } from '../../../src/utils/ssh';
import { SSHAdapter } from '../../../src/adapters/ssh/index';
jest.mock('../../../src/utils/ssh', () => ({
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
    let adapter;
    let mockSSHInstances = [];
    beforeEach(() => {
        mockSSHInstances = [];
        NodeSSH.mockImplementation(() => {
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
            const connections = await Promise.all([
                adapter.execute({
                    command: 'echo test1',
                    adapterOptions: { type: 'ssh', host: 'server1.example.com', username: 'user' }
                }),
                adapter.execute({
                    command: 'echo test2',
                    adapterOptions: { type: 'ssh', host: 'server2.example.com', username: 'user' }
                }),
                adapter.execute({
                    command: 'echo test3',
                    adapterOptions: { type: 'ssh', host: 'server3.example.com', username: 'user' }
                })
            ]);
            expect(connections).toHaveLength(3);
            expect(mockSSHInstances).toHaveLength(3);
            mockSSHInstances.forEach(instance => {
                expect(instance.connect).toHaveBeenCalledTimes(1);
            });
            await adapter.dispose();
            mockSSHInstances.forEach(instance => {
                expect(instance.dispose).toHaveBeenCalledTimes(1);
            });
        });
        it('should clear keep-alive timers on connection removal', async () => {
            jest.useFakeTimers();
            await adapter.execute({
                command: 'echo test',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            const instance = mockSSHInstances[0];
            jest.advanceTimersByTime(1000);
            expect(instance.execCommand).toHaveBeenCalledWith('echo "keep-alive"', expect.any(Object));
            await adapter.dispose();
            jest.clearAllTimers();
            jest.advanceTimersByTime(5000);
            const keepAliveCallCount = instance.execCommand.mock.calls.filter((call) => call[0] === 'echo "keep-alive"').length;
            expect(keepAliveCallCount).toBe(1);
            jest.useRealTimers();
        });
        it('should enforce maximum connection lifetime', async () => {
            jest.useFakeTimers();
            await adapter.execute({
                command: 'echo test',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            const firstInstance = mockSSHInstances[0];
            jest.advanceTimersByTime(11000);
            await adapter.execute({
                command: 'echo test2',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            expect(mockSSHInstances).toHaveLength(2);
            expect(firstInstance.dispose).toHaveBeenCalledTimes(1);
            expect(mockSSHInstances[1].connect).toHaveBeenCalledTimes(1);
            jest.useRealTimers();
        });
        it('should handle connection cleanup errors gracefully', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            await adapter.execute({
                command: 'echo test',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            const instance = mockSSHInstances[0];
            instance.dispose.mockRejectedValue(new Error('Dispose failed'));
            await expect(adapter.dispose()).resolves.toBeUndefined();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error disposing SSH connection'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });
        it('should remove connections that exceed error threshold', async () => {
            jest.useFakeTimers();
            await adapter.execute({
                command: 'echo test',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            const instance = mockSSHInstances[0];
            instance.execCommand.mockRejectedValue(new Error('Connection failed'));
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(1000);
                await jest.runAllTimersAsync();
            }
            expect(instance.dispose).toHaveBeenCalledTimes(1);
            jest.useRealTimers();
        });
        it('should handle concurrent connection closes properly', async () => {
            const hosts = ['server1.example.com', 'server2.example.com', 'server3.example.com'];
            await Promise.all(hosts.map(host => adapter.execute({
                command: 'echo test',
                adapterOptions: { type: 'ssh', host, username: 'user' }
            })));
            mockSSHInstances.forEach((instance, index) => {
                instance.dispose.mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, index * 100));
                });
            });
            const start = Date.now();
            await adapter.dispose();
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(300);
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
            await adapter.execute({
                command: 'echo test',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            const metrics = adapter.getPoolMetrics();
            expect(metrics.totalConnections).toBe(1);
            expect(metrics.activeConnections).toBe(1);
            expect(metrics.idleConnections).toBe(0);
            expect(metrics.connectionsCreated).toBe(1);
            expect(metrics.connectionsDestroyed).toBe(0);
            expect(metrics.connectionReuses).toBe(0);
            await adapter.execute({
                command: 'echo test2',
                adapterOptions: { type: 'ssh', host: 'server.example.com', username: 'user' }
            });
            const metricsAfterReuse = adapter.getPoolMetrics();
            expect(metricsAfterReuse.connectionReuses).toBe(1);
            await adapter.dispose();
        });
    });
});
//# sourceMappingURL=ssh-adapter-resources.test.js.map