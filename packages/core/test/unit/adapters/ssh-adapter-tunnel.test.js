import { describeSSH, getSSHConfig } from '@xec-sh/test-utils';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
describeSSH('SSH Adapter Tunnel Tests', () => {
    let adapter;
    beforeEach(() => {
        adapter = new SSHAdapter({
            connectionPool: {
                enabled: true,
                maxConnections: 5,
                idleTimeout: 30000,
                keepAlive: true
            }
        });
    });
    afterEach(async () => {
        await adapter.dispose();
    });
    describe('tunnel() with real SSH connection', () => {
        it('should create a tunnel to SSH service', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            const result = await adapter.execute(connectCommand);
            expect(result.stdout).toContain('connected');
            const localPort = 18080 + Math.floor(Math.random() * 1000);
            const tunnel = await adapter.tunnel({
                localPort,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(tunnel).toBeDefined();
            expect(tunnel.localPort).toBe(localPort);
            expect(tunnel.localHost).toBeDefined();
            expect(tunnel.remoteHost).toBe('localhost');
            expect(tunnel.remotePort).toBe(22);
            expect(tunnel.isOpen).toBe(true);
            const { NodeSSH } = await import('../../../src/utils/ssh.js');
            const tunnelSSH = new NodeSSH();
            const connected = await tunnelSSH.connect({
                host: '127.0.0.1',
                port: tunnel.localPort,
                username: sshConfig.username,
                password: sshConfig.password,
                readyTimeout: 5000
            }).then(() => true).catch(() => false);
            expect(connected).toBe(true);
            if (connected) {
                const tunnelResult = await tunnelSSH.execCommand('echo "tunneled"');
                expect(tunnelResult.stdout.trim()).toBe('tunneled');
                await tunnelSSH.dispose();
            }
            await tunnel.close();
            expect(tunnel.isOpen).toBe(false);
        });
        it('should create a tunnel with dynamic port allocation', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnel = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(tunnel).toBeDefined();
            expect(tunnel.localPort).toBeGreaterThan(0);
            expect(tunnel.localPort).not.toBe(0);
            expect(tunnel.isOpen).toBe(true);
            const { NodeSSH } = await import('../../../src/utils/ssh.js');
            const tunnelSSH = new NodeSSH();
            const connected = await tunnelSSH.connect({
                host: '127.0.0.1',
                port: tunnel.localPort,
                username: sshConfig.username,
                password: sshConfig.password,
                readyTimeout: 5000
            }).then(() => true).catch(() => false);
            expect(connected).toBe(true);
            if (connected) {
                await tunnelSSH.dispose();
            }
            await tunnel.close();
        });
        it('should create tunnel to a remote service (SSH echo test)', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnel = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(tunnel.isOpen).toBe(true);
            expect(tunnel.localPort).toBeGreaterThan(0);
            const { NodeSSH } = await import('../../../src/utils/ssh.js');
            const tunnelSSH = new NodeSSH();
            const connected = await tunnelSSH.connect({
                host: '127.0.0.1',
                port: tunnel.localPort,
                username: sshConfig.username,
                password: sshConfig.password,
                readyTimeout: 5000
            }).then(() => true).catch(() => false);
            expect(connected).toBe(true);
            if (connected) {
                const result = await tunnelSSH.execCommand('echo "tunnel_test_success"');
                expect(result.stdout.trim()).toBe('tunnel_test_success');
                await tunnelSSH.dispose();
            }
            await tunnel.close();
            expect(tunnel.isOpen).toBe(false);
        });
        it('should track active tunnels correctly', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            expect(adapter.activeTunnels.size).toBe(0);
            const tunnel1 = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(adapter.activeTunnels.size).toBe(1);
            const tunnel2 = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(adapter.activeTunnels.size).toBe(2);
            await tunnel1.close();
            expect(adapter.activeTunnels.size).toBe(1);
            await tunnel2.close();
            expect(adapter.activeTunnels.size).toBe(0);
        });
        it('should handle multiple close calls on same tunnel gracefully', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnel = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(tunnel.isOpen).toBe(true);
            await tunnel.close();
            await expect(tunnel.close()).resolves.not.toThrow();
        });
        it('should throw error when no SSH connection is available', async () => {
            await expect(adapter.tunnel({
                localPort: 8080,
                remoteHost: 'remote.server',
                remotePort: 3306
            })).rejects.toThrow('No SSH connection available');
        });
        it('should pass localHost option correctly', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnel = await adapter.tunnel({
                localPort: 0,
                localHost: '0.0.0.0',
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(tunnel.localHost).toBe('0.0.0.0');
            await tunnel.close();
        });
        it('should handle tunnel creation failure gracefully', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            await expect(adapter.tunnel({
                localPort: 1,
                remoteHost: 'localhost',
                remotePort: 22
            })).rejects.toThrow();
            expect(adapter.activeTunnels.size).toBe(0);
        });
        it('should emit tunnel events', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const events = [];
            const eventHandler = (eventType, data) => {
                events.push({ type: eventType, data });
            };
            adapter.on('ssh:tunnel-created', (data) => eventHandler('ssh:tunnel-created', data));
            adapter.on('ssh:tunnel-closed', (data) => eventHandler('ssh:tunnel-closed', data));
            adapter.on('tunnel:created', (data) => eventHandler('tunnel:created', data));
            const tunnel = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            const createdEvents = events.filter(e => e.type.includes('created'));
            expect(createdEvents.length).toBeGreaterThan(0);
            const sshCreatedEvent = events.find(e => e.type === 'ssh:tunnel-created');
            expect(sshCreatedEvent).toBeDefined();
            expect(sshCreatedEvent?.data).toMatchObject({
                localPort: tunnel.localPort,
                remoteHost: 'localhost',
                remotePort: 22
            });
            events.length = 0;
            await tunnel.close();
            const closedEvents = events.filter(e => e.type.includes('closed'));
            expect(closedEvents.length).toBeGreaterThan(0);
            const sshClosedEvent = events.find(e => e.type === 'ssh:tunnel-closed');
            expect(sshClosedEvent).toBeDefined();
        });
        it('should create tunnel to remote service and verify file content', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const remoteFile = '/tmp/tunnel-test.txt';
            const testContent = `test-${Date.now()}`;
            const writeCommand = {
                command: `echo "${testContent}" > ${remoteFile}`,
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(writeCommand);
            const tunnel = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(tunnel.isOpen).toBe(true);
            const { NodeSSH } = await import('../../../src/utils/ssh.js');
            const ssh = new NodeSSH();
            const connected = await ssh.connect({
                host: '127.0.0.1',
                port: tunnel.localPort,
                username: sshConfig.username,
                password: sshConfig.password,
                readyTimeout: 5000
            }).then(() => true).catch(() => false);
            expect(connected).toBe(true);
            if (connected) {
                const result = await ssh.execCommand(`cat ${remoteFile}`);
                expect(result.stdout.trim()).toBe(testContent);
                await ssh.dispose();
            }
            await tunnel.close();
            const cleanupCommand = {
                command: `rm -f ${remoteFile}`,
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(cleanupCommand);
        });
    });
    describe('dispose() with tunnels', () => {
        it('should close all active tunnels on dispose', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnel1 = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            const tunnel2 = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            expect(adapter.activeTunnels.size).toBe(2);
            const tunnel1Port = tunnel1.localPort;
            const tunnel2Port = tunnel2.localPort;
            await adapter.dispose();
            expect(adapter.activeTunnels.size).toBe(0);
            const net = await import('net');
            const canConnect = async (port) => new Promise((resolve) => {
                const client = new net.Socket();
                client.on('connect', () => {
                    client.destroy();
                    resolve(true);
                });
                client.on('error', () => {
                    resolve(false);
                });
                client.connect(port, '127.0.0.1');
                setTimeout(() => {
                    client.destroy();
                    resolve(false);
                }, 100);
            });
            expect(await canConnect(tunnel1Port)).toBe(false);
            expect(await canConnect(tunnel2Port)).toBe(false);
        });
        it('should handle errors gracefully when closing tunnels during dispose', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnel1 = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            const tunnel2 = await adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            });
            const originalClose = tunnel1.close;
            tunnel1.close = async () => {
                throw new Error('Simulated close error');
            };
            expect(adapter.activeTunnels.size).toBe(2);
            await expect(adapter.dispose()).resolves.not.toThrow();
            tunnel1.close = originalClose;
            expect(adapter.activeTunnels.size).toBe(0);
        });
    });
    describe('concurrent tunnel operations', () => {
        it('should handle multiple concurrent tunnel creations', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const connectCommand = {
                command: 'echo "connected"',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    password: sshConfig.password
                }
            };
            await adapter.execute(connectCommand);
            const tunnelPromises = Array.from({ length: 5 }, (_, i) => adapter.tunnel({
                localPort: 0,
                remoteHost: 'localhost',
                remotePort: 22
            }));
            const tunnels = await Promise.all(tunnelPromises);
            expect(tunnels.length).toBe(5);
            tunnels.forEach(tunnel => {
                expect(tunnel.isOpen).toBe(true);
                expect(tunnel.localPort).toBeGreaterThan(0);
            });
            expect(adapter.activeTunnels.size).toBe(5);
            await Promise.all(tunnels.map(t => t.close()));
            expect(adapter.activeTunnels.size).toBe(0);
        });
        it('should handle tunnel operations with connection pooling', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const pooledAdapter = new SSHAdapter({
                connectionPool: {
                    enabled: true,
                    maxConnections: 2,
                    idleTimeout: 30000,
                    keepAlive: true
                }
            });
            try {
                const connectCommand = {
                    command: 'echo "connected"',
                    adapterOptions: {
                        type: 'ssh',
                        host: sshConfig.host,
                        port: sshConfig.port,
                        username: sshConfig.username,
                        password: sshConfig.password
                    }
                };
                await pooledAdapter.execute(connectCommand);
                const tunnel = await pooledAdapter.tunnel({
                    localPort: 0,
                    remoteHost: 'localhost',
                    remotePort: 22
                });
                expect(tunnel.isOpen).toBe(true);
                const echoCommand = {
                    command: 'echo "test through pooled connection"',
                    adapterOptions: {
                        type: 'ssh',
                        host: sshConfig.host,
                        port: sshConfig.port,
                        username: sshConfig.username,
                        password: sshConfig.password
                    }
                };
                const result = await pooledAdapter.execute(echoCommand);
                expect(result.stdout).toContain('test through pooled connection');
                expect(tunnel.isOpen).toBe(true);
                await tunnel.close();
            }
            finally {
                await pooledAdapter.dispose();
            }
        });
    });
}, {
    containers: ['ubuntu-apt'],
    timeout: 120000
});
//# sourceMappingURL=ssh-adapter-tunnel.test.js.map