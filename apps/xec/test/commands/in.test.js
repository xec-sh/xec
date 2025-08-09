import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { existsSync } from 'fs';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { it, expect, describe, afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';
import { describeSSH, getSSHConfig, KindClusterManager, DockerContainerManager } from '@xec-sh/test-utils';
import { InCommand } from '../../src/commands/in.js';
describe('In Command', () => {
    let tempDir;
    let projectDir;
    let command;
    let originalCwd;
    let dockerManager;
    let originalPath;
    let originalShell;
    beforeEach(async () => {
        originalCwd = process.cwd();
        originalPath = process.env.PATH;
        originalShell = process.env.SHELL;
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-in-test-'));
        projectDir = path.join(tempDir, 'project');
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
        command = new InCommand();
        dockerManager = DockerContainerManager.getInstance();
        const pathSeparator = process.platform === 'win32' ? ';' : ':';
        const additionalPaths = ['/usr/local/bin', '/opt/homebrew/bin', '/bin', '/usr/bin'];
        const currentPath = process.env.PATH || '';
        process.env.PATH = [...additionalPaths, currentPath].join(pathSeparator);
        if (!process.env.SHELL) {
            process.env.SHELL = '/bin/bash';
        }
    });
    afterEach(async () => {
        if (originalPath !== undefined) {
            process.env.PATH = originalPath;
        }
        if (originalShell !== undefined) {
            process.env.SHELL = originalShell;
        }
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    describe('Docker Container Execution', () => {
        let testContainerName;
        beforeEach(async () => {
            testContainerName = 'xec-in-test-' + Date.now();
        });
        afterEach(async () => {
            if (dockerManager.isDockerAvailable() && testContainerName) {
                await $.local() `/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
            }
        });
        it('should execute commands in Docker containers', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'containers.test',
                'echo "Hello from Docker" > /tmp/test-output.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const verifyResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/test-output.txt`;
            expect(verifyResult.stdout).toContain('Hello from Docker');
        });
        it('should execute commands with environment variables', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName,
                            env: {
                                TEST_VAR: 'test_value',
                                NODE_ENV: 'production'
                            }
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'containers.test',
                'echo "TEST_VAR=$TEST_VAR NODE_ENV=$NODE_ENV" > /tmp/env-test.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const envResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/env-test.txt`;
            expect(envResult.stdout).toContain('TEST_VAR=test_value');
            expect(envResult.stdout).toContain('NODE_ENV=production');
        });
        it('should execute commands with custom working directory', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sh -c "mkdir -p /custom/dir && sleep 3600"`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName,
                            workdir: '/custom/dir'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await $.local() `/usr/local/bin/docker exec ${testContainerName} sh -c "echo 'test content' > /custom/dir/test.txt"`;
            await command.execute([
                'containers.test',
                'pwd > /tmp/pwd.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            await command.execute([
                'containers.test',
                'ls > /tmp/ls.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const pwdResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/pwd.txt`;
            expect(pwdResult.stdout.trim()).toBe('/custom/dir');
            const lsResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/ls.txt`;
            expect(lsResult.stdout).toContain('test.txt');
        });
    });
    describe('Kubernetes Pod Execution', () => {
        let clusterManager;
        let clusterReady = false;
        beforeAll(async () => {
            clusterManager = new KindClusterManager({ name: 'xec-in-test-cluster' });
            try {
                await clusterManager.createCluster();
                clusterReady = true;
            }
            catch (e) {
                console.log('Kind not available, skipping Kubernetes tests:', e);
            }
        }, 90000);
        afterAll(async () => {
            if (clusterReady) {
                await clusterManager.deleteCluster();
                clusterManager.cleanup();
            }
        });
        it('should execute commands in Kubernetes pods', async function () {
            if (!clusterReady) {
                this.skip();
                return;
            }
            await clusterManager.deployTestPod('test-pod', 'test');
            const config = {
                version: '2.0',
                targets: {
                    pods: {
                        test: {
                            namespace: 'test',
                            pod: 'test-pod',
                            container: 'main',
                            kubeconfig: clusterManager.getKubeConfigPath()
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const originalKubeconfig = process.env.KUBECONFIG;
            process.env.KUBECONFIG = clusterManager.getKubeConfigPath();
            try {
                await command.execute([
                    'pods.test',
                    'echo "Hello from Kubernetes" > /tmp/k8s-test.txt',
                    { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                const verifyCmd = clusterManager.kubectl('exec test-pod -n test -c main -- cat /tmp/k8s-test.txt');
                expect(verifyCmd).toContain('Hello from Kubernetes');
            }
            finally {
                if (originalKubeconfig) {
                    process.env.KUBECONFIG = originalKubeconfig;
                }
                else {
                    delete process.env.KUBECONFIG;
                }
            }
        }, 60000);
        it('should execute commands in specific containers of multi-container pods', async function () {
            if (!clusterReady) {
                this.skip();
                return;
            }
            try {
                await clusterManager.exec('kubectl create namespace test', { silent: true });
            }
            catch {
            }
            await clusterManager.createMultiContainerPod('multi-pod', 'test');
            const config = {
                version: '2.0',
                targets: {
                    pods: {
                        app: {
                            namespace: 'test',
                            pod: 'multi-pod',
                            container: 'app',
                            kubeconfig: clusterManager.getKubeConfigPath()
                        },
                        sidecar: {
                            namespace: 'test',
                            pod: 'multi-pod',
                            container: 'sidecar',
                            kubeconfig: clusterManager.getKubeConfigPath()
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const originalKubeconfig = process.env.KUBECONFIG;
            process.env.KUBECONFIG = clusterManager.getKubeConfigPath();
            try {
                await command.execute([
                    'pods.app',
                    'echo "From app container" > /tmp/app.txt',
                    { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                await command.execute([
                    'pods.sidecar',
                    'echo "From sidecar container" > /tmp/sidecar.txt',
                    { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                const appOutput = clusterManager.kubectl('exec multi-pod -n test -c app -- cat /tmp/app.txt');
                const sidecarOutput = clusterManager.kubectl('exec multi-pod -n test -c sidecar -- cat /tmp/sidecar.txt');
                expect(appOutput).toContain('From app container');
                expect(sidecarOutput).toContain('From sidecar container');
            }
            finally {
                if (originalKubeconfig) {
                    process.env.KUBECONFIG = originalKubeconfig;
                }
                else {
                    delete process.env.KUBECONFIG;
                }
            }
        });
    });
    describeSSH('SSH Host Execution', () => {
        it('should execute commands on SSH hosts', async () => {
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
            await command.execute([
                'hosts.test',
                'echo "Hello from SSH host" > /tmp/ssh-test.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const result = await sshEngine `cat /tmp/ssh-test.txt`;
            expect(result.stdout.trim()).toBe('Hello from SSH host');
            await sshEngine `rm -f /tmp/ssh-test.txt`;
        });
        it('should execute commands with environment variables on SSH hosts', async () => {
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
                            password: sshConfig.password,
                            env: {
                                TEST_ENV: 'ssh_value',
                                CUSTOM_VAR: 'custom'
                            }
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
                'echo "TEST_ENV=$TEST_ENV CUSTOM_VAR=$CUSTOM_VAR" > /tmp/env-test.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const result = await sshEngine `cat /tmp/env-test.txt`;
            expect(result.stdout).toContain('TEST_ENV=ssh_value');
            expect(result.stdout).toContain('CUSTOM_VAR=custom');
            await sshEngine `rm -f /tmp/env-test.txt`;
        });
    }, { containers: ['ubuntu-apt'] });
    describe('Script Execution', () => {
        let testContainerName;
        beforeEach(async () => {
            testContainerName = 'xec-script-test-' + Date.now();
        });
        afterEach(async () => {
            if (dockerManager.isDockerAvailable() && testContainerName) {
                await $.local() `/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
            }
        });
        it('should execute JavaScript files in containers', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
            const result = await $.local() `${dockerPath} run -d --name ${testContainerName} node:18-alpine sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start Node container: ' + result.stderr);
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        node: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const scriptPath = path.join(projectDir, 'test-script.js');
            await fs.writeFile(scriptPath, `
// This script will be executed with $target available for the container
const result = await $target\`echo "Script executed successfully"\`;
console.log(result.stdout);

// Also test that we can run multiple commands
const nodeVersion = await $target\`node --version\`;
console.log('Node version:', nodeVersion.stdout.trim());

// Write output to verify execution
await $target\`echo "Test completed" > /tmp/script-test-done.txt\`;
`);
            await command.execute([
                'containers.node',
                scriptPath,
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const verifyResult = await $.local() `${dockerPath} exec ${testContainerName} cat /tmp/script-test-done.txt`;
            expect(verifyResult.stdout.trim()).toBe('Test completed');
        });
    });
    describe('Task Execution', () => {
        let testContainerName;
        beforeEach(async () => {
            testContainerName = 'xec-task-test-' + Date.now();
        });
        afterEach(async () => {
            if (dockerManager.isDockerAvailable() && testContainerName) {
                await $.local() `/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
            }
        });
        it('should execute configured tasks in containers', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                },
                tasks: {
                    'test-task': {
                        description: 'Test task',
                        steps: [
                            { command: 'echo "Step 1 executed" >> /tmp/task-output.txt' },
                            { command: 'echo "Step 2 executed" >> /tmp/task-output.txt' }
                        ]
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute(['containers.test', 'dummy', { task: 'test-task', quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }]);
            const taskOutput = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/task-output.txt`;
            expect(taskOutput.stdout).toContain('Step 1 executed');
            expect(taskOutput.stdout).toContain('Step 2 executed');
        });
    });
    describe('Wildcard Targeting', () => {
        let containerNames = [];
        beforeEach(async () => {
            if (dockerManager.isDockerAvailable()) {
                const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
                for (let i = 1; i <= 3; i++) {
                    const name = `xec-worker-${i}-${Date.now()}`;
                    containerNames.push(name);
                    await $.local() `${dockerPath} run -d --name ${name} alpine:latest sleep 3600`.nothrow();
                }
            }
        });
        afterEach(async () => {
            if (dockerManager.isDockerAvailable()) {
                const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
                for (const name of containerNames) {
                    await $.local() `${dockerPath} rm -f ${name}`.nothrow();
                }
            }
            containerNames = [];
        });
        it('should execute commands on multiple containers with wildcards', async function () {
            if (!dockerManager.isDockerAvailable() || containerNames.length === 0) {
                this.skip();
                return;
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        'worker-1': { container: containerNames[0] },
                        'worker-2': { container: containerNames[1] },
                        'worker-3': { container: containerNames[2] },
                        'database': { image: 'postgres:latest' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'containers.worker-*',
                'echo "Worker $(hostname) reporting" > /tmp/worker-output.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
            for (const containerName of containerNames) {
                const output = await $.local() `${dockerPath} exec ${containerName} cat /tmp/worker-output.txt`;
                expect(output.stdout).toContain('Worker');
                expect(output.stdout).toContain('reporting');
            }
        });
    });
    describe('Error Handling', () => {
        it.skip('should handle non-existent containers gracefully', async () => {
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        missing: { container: 'non-existent-container' }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            try {
                await command.execute([
                    'containers.missing',
                    'echo test',
                    { quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                fail('Expected command.execute to throw an error');
            }
            catch (error) {
                console.log(error.message);
                expect(error.message).toMatch(/Container 'non-existent-container' not found/);
            }
        });
        it.skip('should handle command execution failures', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const testContainerName = 'xec-error-test-' + Date.now();
            try {
                const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
                await $.local() `${dockerPath} run -d --name ${testContainerName} alpine:latest sleep 3600`;
                const config = {
                    version: '2.0',
                    targets: {
                        containers: {
                            test: { container: testContainerName }
                        }
                    }
                };
                await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
                let errorThrown = false;
                try {
                    await command.execute([
                        'containers.test',
                        'exit 1',
                        { quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                    ]);
                }
                catch (error) {
                    errorThrown = true;
                    expect(error).toBeDefined();
                }
                expect(errorThrown).toBe(true);
            }
            finally {
                const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
                await $.local() `${dockerPath} rm -f ${testContainerName}`.nothrow();
            }
        });
        it('should require target specification', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([{ quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }])).rejects.toThrow(/Target specification is required/);
        });
    });
    describe('Dry Run Mode', () => {
        it('should not execute commands in dry run mode', async () => {
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        app: { image: 'alpine:latest' }
                    },
                    hosts: {
                        server: { host: 'example.com', user: 'deploy' }
                    },
                    pods: {
                        web: { namespace: 'default', pod: 'web-pod' }
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
                    'containers.app',
                    'echo test',
                    { dryRun: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                await command.execute([
                    'hosts.server',
                    'ls -la',
                    { dryRun: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                await command.execute([
                    'pods.web',
                    'date',
                    { dryRun: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                const fullOutput = output.join('');
                expect(fullOutput).toContain('[DRY RUN] Would execute');
                expect(fullOutput).toContain('app');
                expect(fullOutput).toContain('echo test');
                expect(fullOutput).toContain('server');
                expect(fullOutput).toContain('ls -la');
                expect(fullOutput).toContain('web');
                expect(fullOutput).toContain('date');
            }
            finally {
                process.stdout.write = originalWrite;
            }
        });
    });
    describe('Additional Real Command Execution Tests', () => {
        let testContainerName;
        beforeEach(async () => {
            testContainerName = 'xec-advanced-test-' + Date.now();
        });
        afterEach(async () => {
            if (dockerManager.isDockerAvailable() && testContainerName) {
                await $.local() `/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
            }
        });
        it('should execute complex bash commands with pipes and redirects', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'containers.test',
                'echo "line1\nline2\nline3" | grep "line2" > /tmp/grep-result.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const grepResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/grep-result.txt`;
            expect(grepResult.stdout.trim()).toBe('line2');
            await command.execute([
                'containers.test',
                'TEST_VAR="hello world"; echo $TEST_VAR > /tmp/var-test.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const varResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/var-test.txt`;
            expect(varResult.stdout.trim()).toBe('hello world');
        });
        it('should handle interactive mode flag correctly', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'containers.test',
                'tty > /tmp/tty-test.txt || echo "not a tty" > /tmp/tty-test.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const ttyResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/tty-test.txt`;
            expect(ttyResult.stdout.trim()).toBe('not a tty');
        });
        it('should execute commands with special characters correctly', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'containers.test',
                'echo "Test with spaces" > /tmp/special-chars.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            await command.execute([
                'containers.test',
                'echo "Pipe: |" >> /tmp/special-chars.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            await command.execute([
                'containers.test',
                'echo "Ampersand: &" >> /tmp/special-chars.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            await command.execute([
                'containers.test',
                'echo "Redirects: > <" >> /tmp/special-chars.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            await command.execute([
                'containers.test',
                "echo 'Single quote: \"' >> /tmp/special-chars.txt",
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            await command.execute([
                'containers.test',
                'echo "Backslash: \\\\" >> /tmp/special-chars.txt',
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const specialResult = await $.local() `/usr/local/bin/docker exec ${testContainerName} cat /tmp/special-chars.txt`;
            expect(specialResult.stdout).toContain('Test with spaces');
            expect(specialResult.stdout).toContain('Pipe: |');
            expect(specialResult.stdout).toContain('Ampersand: &');
            expect(specialResult.stdout).toContain('Redirects: > <');
            expect(specialResult.stdout).toContain('Single quote: "');
            expect(specialResult.stdout).toContain('Backslash: \\');
        });
        it('should execute commands using REPL mode', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} node:18-alpine sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const replPromise = command.execute([
                'containers.test',
                '',
                { repl: true, quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            setTimeout(() => {
                process.stdin.emit('data', '.exit\n');
            }, 100);
            await expect(replPromise).resolves.toBeUndefined();
        });
        it('should execute parallel commands correctly', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const container1 = 'xec-parallel-1-' + Date.now();
            const container2 = 'xec-parallel-2-' + Date.now();
            try {
                await $.local() `/usr/local/bin/docker run -d --name ${container1} alpine:latest sleep 3600`;
                await $.local() `/usr/local/bin/docker run -d --name ${container2} alpine:latest sleep 3600`;
                const config = {
                    version: '2.0',
                    targets: {
                        containers: {
                            'parallel-1': { container: container1 },
                            'parallel-2': { container: container2 }
                        }
                    }
                };
                await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
                await command.execute([
                    'containers.parallel-*',
                    'echo "Parallel execution" > /tmp/parallel.txt',
                    { parallel: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
                const result1 = await $.local() `/usr/local/bin/docker exec ${container1} cat /tmp/parallel.txt`;
                const result2 = await $.local() `/usr/local/bin/docker exec ${container2} cat /tmp/parallel.txt`;
                expect(result1.stdout.trim()).toBe('Parallel execution');
                expect(result2.stdout.trim()).toBe('Parallel execution');
            }
            finally {
                await $.local() `/usr/local/bin/docker rm -f ${container1} ${container2}`.nothrow();
            }
        });
        it.skip('should properly handle command timeouts', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const result = await $.local() `/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
            if (result.exitCode !== 0) {
                throw new Error('Failed to start test container');
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            let errorThrown = false;
            try {
                await command.execute([
                    'containers.test',
                    'sleep 5',
                    { quiet: true, timeout: '1s', configPath: path.join(projectDir, '.xec', 'config.yaml') }
                ]);
            }
            catch (error) {
                errorThrown = true;
                expect(error).toBeDefined();
            }
            expect(errorThrown).toBe(true);
        });
    });
    describe('Local Target Execution', () => {
        it('should execute commands on local target', async () => {
            const config = {
                version: '2.0',
                targets: {
                    local: {}
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(tempDir, 'local-test.txt');
            await command.execute([
                'local',
                `echo "Local execution test" > "${testFile}"`,
                { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content.trim()).toBe('Local execution test');
        });
    });
});
//# sourceMappingURL=in.test.js.map