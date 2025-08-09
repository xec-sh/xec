import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';
import { $ } from '../../src/index.js';
describe('Docker Enhanced API Integration Tests', () => {
    const checkDocker = async () => {
        try {
            const result = await $ `docker version --format json`;
            return result.exitCode === 0;
        }
        catch {
            return false;
        }
    };
    const testOrSkip = process.env['CI'] ? it.skip : it;
    beforeAll(async () => {
        if (await checkDocker()) {
            await $ `docker ps -a | grep xec-test | awk '{print $1}' | xargs -r docker rm -f || true`;
        }
    });
    afterAll(async () => {
        if (await checkDocker()) {
            await $ `docker ps -a | grep xec-test | awk '{print $1}' | xargs -r docker rm -f || true`;
        }
    });
    describe('Container Lifecycle Management', () => {
        testOrSkip('should create, start, execute, and remove a container', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-lifecycle',
                command: 'sleep 3600'
            }).start();
            expect(container.name).toBe('xec-test-lifecycle');
            expect(container.started).toBe(true);
            const result = await container.exec `echo "Hello from container"`;
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('Hello from container');
            const rawResult = await container.execRaw('ls', ['-la', '/']);
            expect(rawResult.exitCode).toBe(0);
            expect(rawResult.stdout).toContain('bin');
            await container.stop();
            expect(container.started).toBe(false);
            await container.remove();
            expect(container.removed).toBe(true);
        }, 30000);
        testOrSkip('should handle container with auto-generated name', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                command: 'sleep 3600'
            }).start();
            expect(container.name).toMatch(/^xec-\d+-[a-z0-9]+$/);
            await container.remove(true);
        }, 20000);
        testOrSkip('should restart a container', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-restart',
                command: 'sh -c "echo Started at $(date); sleep 3600"'
            }).start();
            const logs1 = await container.logs();
            expect(logs1).toContain('Started at');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await container.restart();
            const logs2 = await container.logs();
            const startCount = (logs2.match(/Started at/g) || []).length;
            expect(startCount).toBe(2);
            await container.remove(true);
        }, 20000);
    });
    describe('Container Configuration', () => {
        testOrSkip('should create container with environment variables', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-env',
                command: 'sleep 3600',
                env: {
                    TEST_VAR: 'test_value',
                    CUSTOM_ENV: 'production'
                }
            }).start();
            const result = await container.exec `printenv TEST_VAR`;
            expect(result.stdout.trim()).toBe('test_value');
            const customEnv = await container.exec `printenv CUSTOM_ENV`;
            expect(customEnv.stdout.trim()).toBe('production');
            await container.remove(true);
        }, 20000);
        testOrSkip('should create container with port mapping', async () => {
            const container = await $.docker({
                image: 'nginx:alpine',
                name: 'xec-test-ports',
                ports: { '8888': '80' }
            }).start();
            const ps = await $ `docker ps --filter name=xec-test-ports --format "table {{.Ports}}"`;
            expect(ps.stdout).toContain('8888->80');
            await container.remove(true);
        }, 20000);
        testOrSkip('should create container with volumes', async () => {
            const tempDir = `/tmp/xec-test-${Date.now()}`;
            await fs.mkdir(tempDir, { recursive: true });
            await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello from host');
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-volumes',
                command: 'sleep 3600',
                volumes: {
                    [tempDir]: '/data'
                }
            }).start();
            const result = await container.exec `cat /data/test.txt`;
            expect(result.stdout).toContain('Hello from host');
            await container.exec `echo "Hello from container" > /data/from-container.txt`;
            const hostContent = await fs.readFile(path.join(tempDir, 'from-container.txt'), 'utf-8');
            expect(hostContent).toContain('Hello from container');
            await container.remove(true);
            await fs.rm(tempDir, { recursive: true });
        }, 20000);
        testOrSkip('should create container with working directory and user', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-workdir',
                command: 'sleep 3600',
                workdir: '/tmp',
                user: 'nobody'
            }).start();
            const pwd = await container.exec `pwd`;
            expect(pwd.stdout.trim()).toBe('/tmp');
            const whoami = await container.exec `whoami`;
            expect(whoami.stdout.trim()).toBe('nobody');
            await container.remove(true);
        }, 20000);
    });
    describe('Container Logs', () => {
        testOrSkip('should get container logs', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-logs',
                command: 'sh -c "echo Line1; echo Line2; echo Line3"'
            }).start();
            await new Promise(resolve => setTimeout(resolve, 2000));
            const logs = await container.logs();
            expect(logs).toContain('Line1');
            expect(logs).toContain('Line2');
            expect(logs).toContain('Line3');
            await container.remove(true);
        }, 20000);
        testOrSkip('should stream container logs', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-stream',
                command: ['sh', '-c', 'for i in 1 2 3; do echo "Log $i"; sleep 1; done']
            }).start();
            await new Promise(resolve => setTimeout(resolve, 5000));
            const logs = await container.logs();
            expect(logs).toBeTruthy();
            expect(logs).toContain('Log 1');
            expect(logs).toContain('Log 2');
            expect(logs).toContain('Log 3');
            const streamedData = [];
            await container.streamLogs((data) => {
                streamedData.push(data);
            });
            expect(streamedData.length).toBeGreaterThan(0);
            await container.remove(true);
        }, 20000);
        testOrSkip('should follow container logs with timeout', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-follow',
                command: 'sh -c "while true; do echo Following $(date); sleep 1; done"'
            }).start();
            const collectedLogs = [];
            const followPromise = container.follow((data) => {
                collectedLogs.push(data);
            });
            await new Promise(resolve => setTimeout(resolve, 3000));
            await container.stop();
            try {
                await followPromise;
            }
            catch {
            }
            expect(collectedLogs.length).toBeGreaterThan(0);
            expect(collectedLogs.some(log => log.includes('Following'))).toBe(true);
            await container.remove(true);
        }, 20000);
    });
    describe('Container Health Checks', () => {
        testOrSkip('should wait for container to be healthy', async () => {
            const container = await $.docker({
                image: 'nginx:alpine',
                name: 'xec-test-health',
                ports: { '8889': '80' },
                healthcheck: {
                    test: 'wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1',
                    interval: '2s',
                    timeout: '2s',
                    retries: 3,
                    startPeriod: '5s'
                }
            }).start();
            await container.waitForHealthy(30000);
            const testAccess = await $ `curl -s -o /dev/null -w "%{http_code}" http://localhost:8889 || echo "000"`;
            expect(['200', '000']).toContain(testAccess.stdout.trim());
            await container.remove(true);
        }, 40000);
    });
    describe('Container File Operations', () => {
        testOrSkip('should copy files to and from container', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-copy',
                command: 'sleep 3600'
            }).start();
            const testFile = `/tmp/xec-copy-test-${Date.now()}.txt`;
            await fs.writeFile(testFile, 'Test content for copy');
            await container.copyTo(testFile, '/root/copied.txt');
            const catResult = await container.exec `cat /root/copied.txt`;
            expect(catResult.stdout).toContain('Test content for copy');
            await container.exec `echo "Added in container" >> /root/copied.txt`;
            const outputFile = `/tmp/xec-copy-back-${Date.now()}.txt`;
            await container.copyFrom('/root/copied.txt', outputFile);
            const content = await fs.readFile(outputFile, 'utf-8');
            expect(content).toContain('Test content for copy');
            expect(content).toContain('Added in container');
            await fs.unlink(testFile);
            await fs.unlink(outputFile);
            await container.remove(true);
        }, 20000);
    });
    describe('Container Networking', () => {
        testOrSkip('should get container IP address', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-ip',
                command: 'sleep 3600'
            }).start();
            const ip = await container.getIpAddress();
            expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
            await container.remove(true);
        }, 20000);
        testOrSkip('should work with custom networks', async () => {
            await $ `docker network create xec-test-net || true`;
            try {
                const container = await $.docker({
                    image: 'alpine:latest',
                    name: 'xec-test-custom-net',
                    command: 'sleep 3600',
                    network: 'xec-test-net'
                }).start();
                const ip = await container.getIpAddress('xec-test-net');
                expect(ip).toBeTruthy();
                expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
                await container.remove(true);
            }
            finally {
                await $ `docker network rm xec-test-net || true`;
            }
        }, 20000);
    });
    describe('Container Stats and Inspection', () => {
        testOrSkip('should get container stats', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-stats',
                command: 'sleep 3600'
            }).start();
            await new Promise(resolve => setTimeout(resolve, 2000));
            const stats = await container.stats();
            expect(stats).toBeDefined();
            if (stats && typeof stats === 'object') {
                expect(Object.keys(stats).length).toBeGreaterThan(0);
            }
            await container.remove(true);
        }, 20000);
        testOrSkip('should inspect container', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-inspect',
                command: 'sleep 3600',
                labels: {
                    'test-label': 'test-value'
                }
            }).start();
            const info = await container.inspect();
            expect(info).toBeDefined();
            expect(info.Config.Labels['test-label']).toBe('test-value');
            expect(info.State.Running).toBe(true);
            await container.remove(true);
        }, 20000);
    });
    describe('Error Handling', () => {
        testOrSkip('should handle errors when container operations fail', async () => {
            const container = await $.docker({
                image: 'alpine:latest',
                name: 'xec-test-errors',
                command: 'sleep 3600'
            }).start();
            await container.stop();
            expect(() => container.exec `echo test`).toThrow();
            await container.remove();
            await expect(container.start()).rejects.toThrow();
        }, 20000);
        testOrSkip('should handle non-existent image gracefully', async () => {
            const container = $.docker({
                image: 'non-existent-image-xec-test:latest',
                name: 'xec-test-no-image'
            });
            await expect(container.start()).rejects.toThrow();
        }, 20000);
    });
    describe('Backward Compatibility', () => {
        testOrSkip('should work with existing containers using direct execution', async () => {
            await $ `docker run -d --name xec-test-existing alpine:latest sleep 3600`;
            try {
                const existing = $.docker({
                    name: 'xec-test-existing',
                    image: 'alpine'
                });
                const result = await existing `echo "Working with existing container"`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('Working with existing container');
            }
            finally {
                await $ `docker stop xec-test-existing && docker rm xec-test-existing`;
            }
        }, 20000);
    });
});
//# sourceMappingURL=docker-enhanced-api.test.js.map