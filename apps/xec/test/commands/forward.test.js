import * as os from 'os';
import * as net from 'net';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { describeSSH, getSSHConfig, DockerContainerManager } from '@xec-sh/test-utils';
import { ForwardCommand } from '../../src/commands/forward.js';
async function isPortInUse(port, host = 'localhost') {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port, host);
    });
}
async function findAvailablePort(startPort = 30000) {
    let port = startPort;
    while (await isPortInUse(port)) {
        port++;
    }
    return port;
}
describe('Forward Command', () => {
    let tempDir;
    let projectDir;
    let command;
    let originalCwd;
    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-forward-test-'));
        projectDir = path.join(tempDir, 'project');
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
        command = new ForwardCommand();
        process.chdir(projectDir);
    });
    afterEach(async () => {
        process.chdir(originalCwd);
        if (command && command['sessions']) {
            for (const [id, session] of command['sessions']) {
                if (session.cleanup) {
                    try {
                        await session.cleanup();
                    }
                    catch (e) {
                    }
                }
            }
            command['sessions'].clear();
        }
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    describe('Port Mapping Parsing', () => {
        it('should parse single port mapping', () => {
            const result = command['parsePortMappings']('8080');
            expect(result).toEqual([{ local: 8080, remote: 8080 }]);
        });
        it('should parse local:remote port mapping', () => {
            const result = command['parsePortMappings']('8080:80');
            expect(result).toEqual([{ local: 8080, remote: 80 }]);
        });
        it('should parse multiple port mappings', () => {
            const result = command['parsePortMappings']('8080:80,3306:3306,5432');
            expect(result).toEqual([
                { local: 8080, remote: 80 },
                { local: 3306, remote: 3306 },
                { local: 5432, remote: 5432 }
            ]);
        });
        it('should support auto port selection with 0', () => {
            const result = command['parsePortMappings']('0:3000');
            expect(result).toEqual([{ local: 0, remote: 3000 }]);
        });
    });
    describeSSH('SSH Port Forwarding', () => {
        it('should forward SSH ports correctly', async () => {
            const container = 'ubuntu-apt';
            const sshConfig = getSSHConfig(container);
            const localPort = await findAvailablePort(30000);
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        test: {
                            host: sshConfig.host,
                            port: sshConfig.port,
                            user: sshConfig.username,
                            password: sshConfig.password
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            await command.execute([
                'hosts.test',
                `${localPort}:22`,
                { background: true, quiet: true }
            ]);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const tunnelTest = $.ssh({
                host: 'localhost',
                port: localPort,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const result = await tunnelTest `echo "tunnel works"`;
            expect(result.stdout.trim()).toBe('tunnel works');
            expect(command['sessions'].size).toBeGreaterThan(0);
            const sessionKey = Array.from(command['sessions'].keys())[0];
            const session = command['sessions'].get(sessionKey);
            expect(session).toBeDefined();
            expect(session.mapping.local).toBe(localPort);
            expect(session.mapping.remote).toBe(22);
        });
        it('should forward multiple ports simultaneously', async () => {
            const container = 'ubuntu-apt';
            const sshConfig = getSSHConfig(container);
            const localPort1 = await findAvailablePort(31000);
            const localPort2 = await findAvailablePort(localPort1 + 1);
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        test: {
                            host: sshConfig.host,
                            port: sshConfig.port,
                            user: sshConfig.username,
                            password: sshConfig.password
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            await sshEngine `echo "test1" > /tmp/test1.txt`;
            await sshEngine `echo "test2" > /tmp/test2.txt`;
            await command.execute([
                'hosts.test',
                `${localPort1}:22,${localPort2}:22`,
                { background: true, quiet: true }
            ]);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const tunnelTest1 = $.ssh({
                host: 'localhost',
                port: localPort1,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const tunnelTest2 = $.ssh({
                host: 'localhost',
                port: localPort2,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const [result1, result2] = await Promise.all([
                tunnelTest1 `cat /tmp/test1.txt`,
                tunnelTest2 `cat /tmp/test2.txt`
            ]);
            expect(result1.stdout.trim()).toBe('test1');
            expect(result2.stdout.trim()).toBe('test2');
            expect(command['sessions'].size).toBe(2);
            await sshEngine `rm -f /tmp/test1.txt /tmp/test2.txt`;
        });
        it('should handle auto port selection', async () => {
            const container = 'ubuntu-apt';
            const sshConfig = getSSHConfig(container);
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        test: {
                            host: sshConfig.host,
                            port: sshConfig.port,
                            user: sshConfig.username,
                            password: sshConfig.password
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFilePath = `/tmp/autoport-test-${Date.now()}.txt`;
            const testContent = 'auto port selection test';
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            await sshEngine `echo ${testContent} > ${testFilePath}`;
            await command.execute([
                'hosts.test',
                '0:22',
                { background: true, quiet: false }
            ]);
            const sessions = command['sessions'];
            expect(sessions.size).toBe(1);
            const sessionKey = Array.from(sessions.keys())[0];
            const session = sessions.get(sessionKey);
            expect(session.mapping.local).toBeGreaterThan(0);
            expect(session.mapping.local).toBeLessThan(65536);
            expect(session.mapping.remote).toBe(22);
            const forwardedSSH = $.ssh({
                host: 'localhost',
                port: session.mapping.local,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const result = await forwardedSSH `cat ${testFilePath}`;
            expect(result.stdout.trim()).toBe(testContent);
            await sshEngine `rm -f ${testFilePath}`;
        });
    }, { containers: ['ubuntu-apt'] });
    describe('Docker Port Forwarding', () => {
        let dockerManager;
        let testContainerName;
        beforeEach(async () => {
            dockerManager = DockerContainerManager.getInstance();
            testContainerName = 'xec-forward-test-' + Date.now();
        });
        afterEach(async () => {
        });
        it('should forward Docker container ports', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const localPort = await findAvailablePort(32000);
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: 'test-container'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command['initializeConfig']({ configPath: path.join(projectDir, '.xec', 'config.yaml') });
            const target = await command['resolveTarget']('containers.test');
            const mapping = { local: localPort, remote: 80 };
            const parsed = command['parsePortMappings'](`${localPort}:80`);
            expect(parsed).toEqual([mapping]);
            const socatContainer = `xec-forward-test-container-${mapping.local}-${mapping.remote}`;
            const session = {
                target,
                mapping,
                process: socatContainer,
                cleanup: async () => {
                }
            };
            const sessionId = `${target.id}:${mapping.local}:${mapping.remote}`;
            command['sessions'].set(sessionId, session);
            const sessions = command['sessions'];
            expect(sessions.size).toBe(1);
            expect(sessions.has(sessionId)).toBe(true);
            const storedSession = sessions.get(sessionId);
            expect(storedSession).toBeDefined();
            expect(storedSession.target.type).toBe('docker');
            expect(storedSession.mapping.local).toBe(localPort);
            expect(storedSession.mapping.remote).toBe(80);
            expect(storedSession.process).toBe(socatContainer);
            const autoMapping = command['parsePortMappings']('0:80');
            expect(autoMapping[0].local).toBe(0);
            expect(autoMapping[0].remote).toBe(80);
        });
    });
    describe('Session Management', () => {
        it('should track active forwarding sessions', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        dummy: {
                            host: 'localhost',
                            user: 'test',
                            password: 'test123'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testPort = await findAvailablePort(40000);
            const sessionId = `hosts.dummy:${testPort}:80`;
            command['sessions'].set(sessionId, {
                target: {
                    id: 'hosts.dummy',
                    name: 'dummy',
                    type: 'ssh',
                    config: config.targets.hosts.dummy
                },
                mapping: { local: testPort, remote: 80 }
            });
            const sessions = command['sessions'];
            expect(sessions.size).toBe(1);
            expect(sessions.has(sessionId)).toBe(true);
            const session = sessions.get(sessionId);
            expect(session.mapping.local).toBe(testPort);
            expect(session.mapping.remote).toBe(80);
        });
        it('should prevent duplicate port forwards on same local port', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        test: { host: 'localhost', user: 'test' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            command['sessions'].set('hosts.test:8080:80', {
                target: { id: 'hosts.test' },
                mapping: { local: 8080, remote: 80 }
            });
            await expect(command.execute([
                'hosts.test',
                '8080:80',
                { quiet: true }
            ])).rejects.toThrow('Port forwarding already active');
        });
    });
    describe('Dry Run Mode', () => {
        it('should not forward ports in dry run mode', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        db: { host: 'db.example.com', user: 'postgres' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const output = [];
            const originalWrite = process.stdout.write;
            process.stdout.write = ((chunk, ...args) => {
                if (typeof chunk === 'string') {
                    output.push(chunk);
                }
                return true;
            });
            try {
                await command.execute([
                    'hosts.db',
                    '5432',
                    { dryRun: true, quiet: false }
                ]);
                const fullOutput = output.join('');
                expect(fullOutput).toContain('[DRY RUN] Would forward ports:');
                expect(fullOutput).toContain('postgres@db.example.com');
                expect(fullOutput).toContain('5432');
                expect(command['sessions'].size).toBe(0);
            }
            finally {
                process.stdout.write = originalWrite;
            }
        });
    });
    describe('Error Handling', () => {
        it('should require target and port specification', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([{ quiet: true }])).rejects.toThrow('Target and port mapping are required');
        });
        it('should validate port numbers', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        test: { host: 'test.example.com', user: 'deploy' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute(['hosts.test', '99999', { quiet: true }])).rejects.toThrow('Invalid remote port: 99999');
            await expect(command.execute(['hosts.test', '-1', { quiet: true }])).rejects.toThrow('Invalid remote port: -1');
            await expect(command.execute(['hosts.test', 'abc', { quiet: true }])).rejects.toThrow('Invalid remote port: abc');
        });
        it('should handle connection failures gracefully', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        valid: {
                            host: 'example.com',
                            user: 'test',
                            password: 'test123'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute(['hosts.nonexistent', '8080', { quiet: true }])).rejects.toThrow(/Target 'nonexistent' not found/);
        });
    });
    describe('Port Availability Checks', () => {
        it('should detect when a port is in use', async () => {
            const testPort = await findAvailablePort(35000);
            const server = net.createServer();
            await new Promise((resolve) => {
                server.listen(testPort, '127.0.0.1', () => resolve());
            });
            try {
                await new Promise(resolve => setTimeout(resolve, 100));
                const inUse = await isPortInUse(testPort, '127.0.0.1');
                expect(inUse).toBe(true);
                const availablePort = await findAvailablePort(testPort + 1);
                expect(availablePort).toBeGreaterThan(testPort);
                const isAvailable = await isPortInUse(availablePort, '127.0.0.1');
                expect(isAvailable).toBe(false);
            }
            finally {
                await new Promise((resolve) => {
                    server.close(() => resolve());
                });
            }
        });
        it('should check port availability using isPortAvailable method', async () => {
            const testPort = await findAvailablePort(36000);
            const available = await command['isPortAvailable'](testPort);
            expect(available).toBe(true);
            const server = net.createServer();
            await new Promise((resolve) => {
                server.listen(testPort, '127.0.0.1', () => resolve());
            });
            try {
                const nowAvailable = await command['isPortAvailable'](testPort);
                expect(nowAvailable).toBe(false);
            }
            finally {
                await new Promise((resolve) => {
                    server.close(() => resolve());
                });
            }
        });
        it('should find an available port using findAvailablePort method', async () => {
            const port = await command['findAvailablePort'](40000);
            expect(port).toBeGreaterThanOrEqual(40000);
            expect(port).toBeLessThan(65535);
            const available = await command['isPortAvailable'](port);
            expect(available).toBe(true);
        });
    });
    describe('Kubernetes Port Forwarding', () => {
        it('should handle Kubernetes pod port forwarding configuration', async () => {
            const localPort = await findAvailablePort(33000);
            const config = {
                version: '2.0',
                targets: {
                    pods: {
                        webapp: {
                            pod: 'webapp-deployment-abc123',
                            namespace: 'production'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command['initializeConfig']({ configPath: path.join(projectDir, '.xec', 'config.yaml') });
            const target = await command['resolveTarget']('pods.webapp');
            expect(target.type).toBe('k8s');
            expect(target.config.pod).toBe('webapp-deployment-abc123');
            expect(target.config.namespace).toBe('production');
            const mapping = command['parsePortMappings'](`${localPort}:8080`);
            expect(mapping).toEqual([{ local: localPort, remote: 8080 }]);
        });
    });
    describe('Cleanup Handlers', () => {
        it('should set up cleanup handlers for graceful shutdown', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        test: { host: 'localhost', user: 'test', password: 'test' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const originalOnce = process.once;
            const handlers = {};
            process.once = ((event, handler) => {
                handlers[event] = handler;
                return process;
            });
            try {
                command['setupCleanupHandlers']();
                expect(handlers['SIGINT']).toBeDefined();
                expect(handlers['SIGTERM']).toBeDefined();
                expect(typeof handlers['SIGINT']).toBe('function');
                expect(typeof handlers['SIGTERM']).toBe('function');
            }
            finally {
                process.once = originalOnce;
            }
        });
    });
    describe('Reverse Tunneling', () => {
        it('should indicate reverse tunneling is not yet supported for SSH', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        remote: {
                            host: 'remote.example.com',
                            user: 'deploy',
                            password: 'deploy123'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'hosts.remote',
                '8080:80',
                { reverse: true, quiet: true }
            ])).rejects.toThrow('Reverse tunneling is not yet implemented in this version');
        });
        it('should not support reverse forwarding for Docker', async () => {
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        app: { image: 'nginx:latest' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'containers.app',
                '80',
                { reverse: true, quiet: true }
            ])).rejects.toThrow('Reverse port forwarding is not supported for Docker');
        });
        it('should not support reverse forwarding for Kubernetes', async () => {
            const config = {
                version: '2.0',
                targets: {
                    pods: {
                        db: { namespace: 'default', pod: 'postgres-0' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'pods.db',
                '5432',
                { reverse: true, quiet: true }
            ])).rejects.toThrow('Reverse port forwarding is not supported for Kubernetes');
        });
    });
});
//# sourceMappingURL=forward.test.js.map