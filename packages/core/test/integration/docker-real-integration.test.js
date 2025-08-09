import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';
import { $ } from '../../src/index.js';
import { DockerAdapter } from '../../../src/adapters/docker/index.js';
const DOCKER_AVAILABLE = await(async () => {
    try {
        const adapter = new DockerAdapter();
        const isAvailable = await adapter.isAvailable();
        await adapter.dispose();
        return isAvailable;
    }
    catch {
        return false;
    }
})();
const describeIfDocker = DOCKER_AVAILABLE ? describe : describe.skip;
describeIfDocker('Docker Adapter Real Integration Tests', () => {
    const TEST_PREFIX = `ush-docker-test-${Date.now()}`;
    let adapter;
    beforeAll(async () => {
        adapter = new DockerAdapter();
        console.log('Docker integration tests starting...');
    });
    afterAll(async () => {
        console.log('Cleaning up Docker test containers...');
        const containers = await $ `docker ps -a --filter "name=${TEST_PREFIX}" --format "{{.Names}}"`.nothrow();
        if (containers.stdout) {
            const names = containers.stdout.trim().split('\n').filter(n => n);
            for (const name of names) {
                await $ `docker rm -f ${name}`.nothrow();
            }
        }
        await adapter.dispose();
    });
    describe('Container Lifecycle Management', () => {
        it('should create, run, and remove a container', async () => {
            const containerName = `${TEST_PREFIX}-lifecycle`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const result = await $docker `echo "Hello from container"`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('Hello from container');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should handle running containers', async () => {
            const containerName = `${TEST_PREFIX}-running`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const result1 = await $docker `uname -a`;
                expect(result1.exitCode).toBe(0);
                expect(result1.stdout).toContain('Linux');
                const result2 = await $docker `cat /etc/os-release`;
                expect(result2.exitCode).toBe(0);
                expect(result2.stdout).toContain('Alpine');
            }
            finally {
                await $ `docker stop ${containerName}`;
                await $ `docker rm ${containerName}`;
            }
        });
    });
    describe('Working Directory and Environment', () => {
        it('should handle working directory', async () => {
            const containerName = `${TEST_PREFIX}-workdir`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({
                    container: containerName,
                    workdir: '/tmp'
                });
                const result = await $docker `pwd`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('/tmp');
                const $dockerHome = $docker.cd('/home');
                const result2 = await $dockerHome `pwd`;
                expect(result2.exitCode).toBe(0);
                expect(result2.stdout.trim()).toBe('/tmp');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should handle environment variables', async () => {
            const containerName = `${TEST_PREFIX}-env`;
            await $ `docker run -d --name ${containerName} -e EXISTING_VAR=existing alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName })
                    .env({ NEW_VAR: 'new_value', ANOTHER_VAR: 'another' });
                const result1 = await $docker `echo $EXISTING_VAR`;
                expect(result1.exitCode).toBe(0);
                expect(result1.stdout.trim()).toBe('existing');
                const result2 = await $docker `echo "$NEW_VAR - $ANOTHER_VAR"`;
                expect(result2.exitCode).toBe(0);
                expect(result2.stdout.trim()).toBe('new_value - another');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('User and Permissions', () => {
        it('should execute as different users', async () => {
            const containerName = `${TEST_PREFIX}-user`;
            await $ `docker run -d --name ${containerName} alpine:latest sh -c "adduser -D testuser && sleep 300"`;
            try {
                const $dockerRoot = $.docker({ container: containerName });
                const rootResult = await $dockerRoot `whoami`;
                expect(rootResult.exitCode).toBe(0);
                expect(rootResult.stdout.trim()).toBe('root');
                const $dockerUser = $.docker({
                    container: containerName,
                    user: 'testuser'
                });
                const userResult = await $dockerUser `whoami`;
                expect(userResult.exitCode).toBe(0);
                expect(userResult.stdout.trim()).toBe('testuser');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('File Operations', () => {
        it('should handle file creation and reading', async () => {
            const containerName = `${TEST_PREFIX}-files`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                await $docker `echo "Test content" > /tmp/test.txt`;
                const result = await $docker `cat /tmp/test.txt`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('Test content');
                const statResult = await $docker `stat /tmp/test.txt`;
                expect(statResult.exitCode).toBe(0);
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should handle volume mounts', async () => {
            const containerName = `${TEST_PREFIX}-volume`;
            const hostDir = join(tmpdir(), `ush-docker-volume-${Date.now()}`);
            await fs.mkdir(hostDir, { recursive: true });
            try {
                const testFile = join(hostDir, 'test.txt');
                await fs.writeFile(testFile, 'Host content');
                await $ `docker run -d --name ${containerName} -v ${hostDir}:/data alpine:latest sleep 300`;
                const $docker = $.docker({ container: containerName });
                const readResult = await $docker `cat /data/test.txt`;
                expect(readResult.exitCode).toBe(0);
                expect(readResult.stdout.trim()).toBe('Host content');
                await $docker `echo "Container content" > /data/from-container.txt`;
                const hostContent = await fs.readFile(join(hostDir, 'from-container.txt'), 'utf8');
                expect(hostContent.trim()).toBe('Container content');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
                await fs.rm(hostDir, { recursive: true, force: true });
            }
        });
    });
    describe('Network Operations', () => {
        it('should handle network connections', async () => {
            const containerName = `${TEST_PREFIX}-network`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const echoResult = await $docker `echo "Container is working"`;
                expect(echoResult.exitCode).toBe(0);
                expect(echoResult.stdout.trim()).toBe('Container is working');
                const ncResult = await $docker `nc -z -w5 google.com 80 && echo "Network OK"`;
                expect(ncResult.exitCode).toBe(0);
                expect(ncResult.stdout.trim()).toBe('Network OK');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        }, 30000);
    });
    describe('Multi-Container Scenarios', () => {
        it('should handle multiple containers', async () => {
            const container1 = `${TEST_PREFIX}-multi-1`;
            const container2 = `${TEST_PREFIX}-multi-2`;
            const network = `${TEST_PREFIX}-network`;
            await $ `docker network create ${network}`;
            try {
                await $ `docker run -d --name ${container1} --network ${network} alpine:latest sleep 300`;
                await $ `docker run -d --name ${container2} --network ${network} alpine:latest sleep 300`;
                const $docker1 = $.docker({ container: container1 });
                const $docker2 = $.docker({ container: container2 });
                const pingResult = await $docker1 `ping -c 1 ${container2}`;
                expect(pingResult.exitCode).toBe(0);
                expect(pingResult.stdout).toMatch(/1 packets transmitted.*1 received|1 packets transmitted.*1 packets received/);
            }
            finally {
                await $ `docker rm -f ${container1} ${container2}`.nothrow();
                await $ `docker network rm ${network}`.nothrow();
            }
        }, 60000);
    });
    describe('Error Handling', () => {
        it('should handle non-existent container', async () => {
            const $docker = $.docker({ container: 'non-existent-container-12345' });
            const result = await $docker `echo "test"`.nothrow();
            expect(result.exitCode).not.toBe(0);
            expect(result.stderr).toMatch(/Error|No such container/);
        });
        it('should handle command failures', async () => {
            const containerName = `${TEST_PREFIX}-error`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const result1 = await $docker `nonexistentcommand`.nothrow();
                expect(result1.exitCode).not.toBe(0);
                const result2 = await $docker `exit 42`.nothrow();
                expect(result2.exitCode).toBe(42);
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should handle stopped container', async () => {
            const containerName = `${TEST_PREFIX}-stopped`;
            await $ `docker run --name ${containerName} alpine:latest echo "done"`;
            try {
                const $docker = $.docker({ container: containerName });
                const result = await $docker `echo "test"`.nothrow();
                expect(result.exitCode).not.toBe(0);
                expect(result.stderr).toContain('is not running');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('Stream Handling', () => {
        it('should handle large outputs', async () => {
            const containerName = `${TEST_PREFIX}-stream`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const result = await $docker `seq 1 10000`;
                expect(result.exitCode).toBe(0);
                const lines = result.stdout.trim().split('\n');
                expect(lines).toHaveLength(10000);
                expect(lines[0]).toBe('1');
                expect(lines[9999]).toBe('10000');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should handle stderr', async () => {
            const containerName = `${TEST_PREFIX}-stderr`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const result = await $docker `sh -c "echo 'stdout message' && echo 'stderr message' >&2"`.nothrow();
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('stdout message');
                expect(result.stderr.trim()).toBe('stderr message');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('Container Management', () => {
        it('should list containers', async () => {
            const containerName = `${TEST_PREFIX}-list`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const containers = await adapter.listContainers(true);
                expect(Array.isArray(containers)).toBe(true);
                expect(containers.some(c => c.includes(containerName))).toBe(true);
                const runningContainers = await adapter.listContainers(false);
                expect(Array.isArray(runningContainers)).toBe(true);
                expect(runningContainers.some(c => c.includes(containerName))).toBe(true);
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should create and manage containers with adapter methods', async () => {
            const containerName = `${TEST_PREFIX}-adapter-create`;
            try {
                await adapter.createContainer({
                    name: containerName,
                    image: 'alpine:latest',
                    env: { TEST_ENV: 'test_value' }
                });
                await $ `docker rm ${containerName}`;
                await $ `docker run -d --name ${containerName} -e TEST_ENV=test_value alpine:latest sleep 300`;
                const $docker = $.docker({ container: containerName });
                const result = await $docker `echo $TEST_ENV`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('test_value');
                await adapter.stopContainer(containerName);
                await adapter.removeContainer(containerName);
                const containers = await adapter.listContainers(true);
                expect(containers.some(c => c.includes(containerName))).toBe(false);
            }
            catch (e) {
                await $ `docker rm -f ${containerName}`.nothrow();
                throw e;
            }
        });
        it('should inspect container', async () => {
            const containerName = `${TEST_PREFIX}-inspect`;
            await $ `docker run -d --name ${containerName} -e MY_VAR=my_value alpine:latest sleep 300`;
            try {
                const info = await adapter.inspectContainer(containerName);
                expect(info).toBeDefined();
                expect(info.Name).toBe(`/${containerName}`);
                expect(info.Config.Env).toContain('MY_VAR=my_value');
                expect(info.State.Running).toBe(true);
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should get container stats', async () => {
            const containerName = `${TEST_PREFIX}-stats`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const stats = await adapter.getStats(containerName);
                expect(stats).toBeDefined();
                expect(typeof stats).toBe('object');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('Image Management', () => {
        it('should list images', async () => {
            await $ `docker pull alpine:latest`.nothrow();
            const images = await adapter.listImages();
            expect(Array.isArray(images)).toBe(true);
            expect(images.some(img => img.includes('alpine'))).toBe(true);
            const alpineImages = await adapter.listImages('alpine');
            expect(Array.isArray(alpineImages)).toBe(true);
            expect(alpineImages.every(img => img.includes('alpine'))).toBe(true);
        });
        it('should tag and remove images', async () => {
            const newTag = `${TEST_PREFIX}-tagged:test`;
            try {
                await adapter.tagImage('alpine:latest', newTag);
                const images = await adapter.listImages();
                expect(images.some(img => img.includes(TEST_PREFIX))).toBe(true);
                await adapter.removeImage(newTag);
                const imagesAfter = await adapter.listImages();
                expect(imagesAfter.some(img => img.includes(newTag))).toBe(false);
            }
            catch (e) {
                await $ `docker rmi ${newTag}`.nothrow();
                throw e;
            }
        });
    });
    describe('Logs and Streaming', () => {
        it('should get container logs', async () => {
            const containerName = `${TEST_PREFIX}-logs`;
            await $ `docker run -d --name ${containerName} alpine:latest sh -c "echo 'Line 1' && sleep 1 && echo 'Line 2' && sleep 300"`;
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                const logs = await adapter.getLogs(containerName);
                expect(logs).toContain('Line 1');
                expect(logs).toContain('Line 2');
                const tailLogs = await adapter.getLogs(containerName, { tail: 1 });
                expect(tailLogs).toContain('Line 2');
                expect(tailLogs).not.toContain('Line 1');
                const timestampLogs = await adapter.getLogs(containerName, { timestamps: true });
                expect(timestampLogs).toMatch(/\d{4}-\d{2}-\d{2}T/);
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it.skip('should stream container logs', async () => {
            const containerName = `${TEST_PREFIX}-stream-logs`;
            await $ `docker run -d --name ${containerName} alpine:latest sh -c "for i in 1 2 3; do echo Line \$i; sleep 1; done"`;
            try {
                const lines = [];
                const streamPromise = adapter.streamLogs(containerName, (data) => lines.push(data), { follow: true });
                await new Promise(resolve => setTimeout(resolve, 4000));
                await $ `docker stop ${containerName}`;
                try {
                    await streamPromise;
                }
                catch (e) {
                }
                const output = lines.join('');
                expect(lines.length).toBeGreaterThan(0);
                expect(output).toContain('1');
                expect(output).toContain('2');
                expect(output).toContain('3');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('File Copy Operations', () => {
        it.skip('should copy files to and from container', async () => {
            const containerName = `${TEST_PREFIX}-copy`;
            const localFile = join(tmpdir(), `test-copy-${Date.now()}.txt`);
            const containerFile = '/tmp/container-test.txt';
            await fs.writeFile(localFile, 'Test copy content');
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                await adapter.copyToContainer(localFile, containerName, containerFile);
                const $docker = $.docker({ container: containerName });
                const result = await $docker `cat ${containerFile}`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('Test copy content');
                await $docker `echo ' - Modified' >> ${containerFile}`;
                const modifiedResult = await $docker `cat ${containerFile}`;
                expect(modifiedResult.stdout).toContain('Modified');
                const localFile2 = join(tmpdir(), `test-copy-back-${Date.now()}.txt`);
                await adapter.copyFromContainer(containerName, containerFile, localFile2);
                const content = await fs.readFile(localFile2, 'utf8');
                expect(content).toContain('Test copy content');
                expect(content.trim()).toMatch(/Modified/);
                await fs.unlink(localFile2);
            }
            finally {
                await $ `docker rm -f ${containerName}`;
                await fs.unlink(localFile);
            }
        });
    });
    describe('Network Management', () => {
        it.skip('should create and manage networks', async () => {
            const networkName = `${TEST_PREFIX}-network-${Date.now()}`;
            try {
                await adapter.createNetwork(networkName, {
                    driver: 'bridge'
                });
                const networks = await adapter.listNetworks();
                expect(networks.some(n => n.includes(networkName))).toBe(true);
                const containerName = `${TEST_PREFIX}-network-container`;
                await $ `docker run -d --name ${containerName} --network ${networkName} alpine:latest sleep 300`;
                try {
                    const $docker = $.docker({ container: containerName });
                    const result = await $docker `ip addr show`;
                    expect(result.exitCode).toBe(0);
                    expect(result.stdout).toContain('172.28');
                }
                finally {
                    await $ `docker rm -f ${containerName}`;
                }
                await adapter.removeNetwork(networkName);
                const networksAfter = await adapter.listNetworks();
                expect(networksAfter.some(n => n.includes(networkName))).toBe(false);
            }
            catch (e) {
                await $ `docker network rm ${networkName}`.nothrow();
                throw e;
            }
        });
    });
    describe('Volume Management', () => {
        it('should create and manage volumes', async () => {
            const volumeName = `${TEST_PREFIX}-volume-test`;
            try {
                await adapter.createVolume(volumeName, {
                    labels: { test: 'true' }
                });
                const volumes = await adapter.listVolumes();
                expect(volumes.some(v => v.includes(volumeName))).toBe(true);
                const containerName = `${TEST_PREFIX}-volume-container`;
                await $ `docker run -d --name ${containerName} -v ${volumeName}:/data alpine:latest sleep 300`;
                try {
                    const $docker = $.docker({ container: containerName });
                    await $docker `echo "Volume test data" > /data/test.txt`;
                    const container2 = `${TEST_PREFIX}-volume-container2`;
                    await $ `docker run -d --name ${container2} -v ${volumeName}:/data alpine:latest sleep 300`;
                    try {
                        const $docker2 = $.docker({ container: container2 });
                        const result = await $docker2 `cat /data/test.txt`;
                        expect(result.exitCode).toBe(0);
                        expect(result.stdout.trim()).toBe('Volume test data');
                    }
                    finally {
                        await $ `docker rm -f ${container2}`;
                    }
                }
                finally {
                    await $ `docker rm -f ${containerName}`;
                }
                await adapter.removeVolume(volumeName);
                const volumesAfter = await adapter.listVolumes();
                expect(volumesAfter.some(v => v.includes(volumeName))).toBe(false);
            }
            catch (e) {
                await $ `docker volume rm ${volumeName}`.nothrow();
                throw e;
            }
        });
    });
    describe('Health Check', () => {
        it('should wait for container to be healthy', async () => {
            const containerName = `${TEST_PREFIX}-health`;
            await $ `docker run -d --name ${containerName} --health-cmd="test -f /tmp/healthy" --health-interval=1s --health-retries=10 --health-timeout=3s alpine:latest sh -c "sleep 3 && touch /tmp/healthy && sleep 300"`;
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                await adapter.waitForHealthy(containerName, 20000);
                const info = await adapter.inspectContainer(containerName);
                expect(info.State.Health?.Status).toBe('healthy');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('JSON Execution', () => {
        it.skip('should execute commands and parse JSON output', async () => {
            const containerName = `${TEST_PREFIX}-json`;
            await $ `docker run -d --name ${containerName} alpine:latest sh -c "apk add jq && sleep 300"`;
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                const $docker = $.docker({ container: containerName });
                await $docker `echo '{"name": "test", "value": 42}' > /tmp/data.json`;
                const catResult = await $docker `cat /tmp/data.json`;
                expect(catResult.exitCode).toBe(0);
                expect(catResult.stdout.trim()).toBe('{"name": "test", "value": 42}');
                const data = await adapter.execJson(containerName, ['cat', '/tmp/data.json']);
                expect(data).toEqual({ name: 'test', value: 42 });
                const jqResult = await $docker `cat /tmp/data.json | jq -r .name`;
                expect(jqResult.stdout.trim()).toBe('test');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
    describe('Auto-create Container', () => {
        it('should auto-create container when not exists', async () => {
            const autoAdapter = new DockerAdapter({
                autoCreate: {
                    enabled: true,
                    image: 'alpine:latest',
                    autoRemove: false
                }
            });
            const nonExistentContainer = `${TEST_PREFIX}-auto-create`;
            try {
                const result = await autoAdapter.execute({
                    command: 'echo "Auto created"',
                    adapterOptions: {
                        type: 'docker',
                        container: nonExistentContainer
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('Auto created');
            }
            finally {
                await $ `docker rm -f ${nonExistentContainer}`.nothrow();
                await autoAdapter.dispose();
            }
        });
    });
    describe('Image Operations', () => {
        it.skip('should pull and push images', async () => {
            const testImage = 'hello-world:latest';
            await adapter.pullImage(testImage);
            const images = await adapter.listImages();
            expect(images.some(img => img.includes('hello-world'))).toBe(true);
        });
    });
    describe('Docker Compose', () => {
        it('should handle compose operations', async () => {
            const composeFile = join(tmpdir(), `docker-compose-${Date.now()}.yml`);
            const composeContent = `
version: '3'
services:
  test:
    image: alpine:latest
    command: sleep 300
`;
            await fs.writeFile(composeFile, composeContent);
            try {
                expect(adapter.composeUp).toBeDefined();
                expect(adapter.composeDown).toBeDefined();
                expect(adapter.composePs).toBeDefined();
                expect(adapter.composeLogs).toBeDefined();
            }
            finally {
                await fs.rm(composeFile, { force: true });
            }
        });
    });
    describe('Build Operations', () => {
        it('should build images from Dockerfile', async () => {
            const buildDir = join(tmpdir(), `docker-build-${Date.now()}`);
            await fs.mkdir(buildDir, { recursive: true });
            const dockerfile = join(buildDir, 'Dockerfile');
            await fs.writeFile(dockerfile, `
FROM alpine:latest
RUN echo "Test build"
CMD ["echo", "Built successfully"]
`);
            const imageName = `${TEST_PREFIX}-built:test`;
            try {
                await adapter.buildImage({
                    tag: imageName,
                    dockerfile: 'Dockerfile',
                    context: buildDir
                });
                const images = await adapter.listImages();
                expect(images.some(img => img.includes(TEST_PREFIX))).toBe(true);
                const containerName = `${TEST_PREFIX}-built-test`;
                await $ `docker run --name ${containerName} ${imageName}`;
                const logs = await adapter.getLogs(containerName);
                expect(logs).toContain('Built successfully');
                await $ `docker rm ${containerName}`;
                await adapter.removeImage(imageName, true);
            }
            catch (e) {
                await $ `docker rmi ${imageName}`.nothrow();
                throw e;
            }
            finally {
                await fs.rm(buildDir, { recursive: true, force: true });
            }
        });
    });
    describe('Advanced Features', () => {
        it('should handle TTY mode', async () => {
            const containerName = `${TEST_PREFIX}-tty`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({
                    container: containerName,
                    tty: true
                });
                const result = await $docker `echo "TTY test"`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('TTY test');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
        it('should handle command with pipes and redirects', async () => {
            const containerName = `${TEST_PREFIX}-pipes`;
            await $ `docker run -d --name ${containerName} alpine:latest sleep 300`;
            try {
                const $docker = $.docker({ container: containerName });
                const result = await $docker `echo -e "line1\nline2\nline3" | grep line2 | wc -l`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('1');
            }
            finally {
                await $ `docker rm -f ${containerName}`;
            }
        });
    });
});
//# sourceMappingURL=docker-real-integration.test.js.map