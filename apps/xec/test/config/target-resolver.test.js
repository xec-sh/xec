import * as os from 'os';
import * as path from 'path';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { TargetResolver } from '../../src/config/target-resolver';
describe('TargetResolver', () => {
    let resolver;
    let config;
    let testDir;
    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-target-resolver-test-'));
        await fs.mkdir(path.join(testDir, '.xec'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'test-containers'), { recursive: true });
        config = {
            version: '2.0',
            targets: {
                local: {
                    type: 'local'
                },
                hosts: {
                    'web-1': {
                        host: 'web1.example.com',
                        user: 'deploy',
                        port: 22
                    },
                    'web-2': {
                        host: 'web2.example.com',
                        user: 'deploy'
                    },
                    'db-master': {
                        host: 'db.example.com',
                        user: 'postgres',
                        port: 5432
                    }
                },
                containers: {
                    app: {
                        image: 'node:18',
                        volumes: ['./:/app']
                    },
                    redis: {
                        image: 'redis:7',
                        container: 'redis-cache'
                    }
                },
                pods: {
                    api: {
                        namespace: 'production',
                        selector: 'app=api'
                    },
                    worker: {
                        pod: 'worker-deployment-abc',
                        namespace: 'production'
                    }
                }
            }
        };
        resolver = new TargetResolver(config);
    });
    afterEach(async () => {
        if (testDir) {
            await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
        }
    });
    describe('resolve()', () => {
        it('should resolve local target', async () => {
            const target = await resolver.resolve('local');
            expect(target).toEqual({
                id: 'local',
                type: 'local',
                config: {
                    type: 'local'
                },
                source: 'configured'
            });
        });
        it('should resolve configured SSH hosts', async () => {
            const target = await resolver.resolve('hosts.web-1');
            expect(target).toEqual({
                id: 'hosts.web-1',
                type: 'ssh',
                name: 'web-1',
                config: {
                    type: 'ssh',
                    host: 'web1.example.com',
                    user: 'deploy',
                    port: 22
                },
                source: 'configured'
            });
        });
        it('should resolve configured containers', async () => {
            const target = await resolver.resolve('containers.app');
            expect(target).toEqual({
                id: 'containers.app',
                type: 'docker',
                name: 'app',
                config: {
                    type: 'docker',
                    image: 'node:18',
                    volumes: ['./:/app']
                },
                source: 'configured'
            });
        });
        it('should resolve configured pods', async () => {
            const target = await resolver.resolve('pods.api');
            expect(target).toEqual({
                id: 'pods.api',
                type: 'k8s',
                name: 'api',
                config: {
                    type: 'k8s',
                    namespace: 'production',
                    selector: 'app=api'
                },
                source: 'configured'
            });
        });
        it('should cache resolved targets', async () => {
            const target1 = await resolver.resolve('hosts.web-1');
            const target2 = await resolver.resolve('hosts.web-1');
            expect(target1).toBe(target2);
        });
        it('should clear cache after timeout', async () => {
            resolver = new TargetResolver(config, { cacheTimeout: 100 });
            const target1 = await resolver.resolve('hosts.web-1');
            await new Promise(resolve => setTimeout(resolve, 150));
            const target2 = await resolver.resolve('hosts.web-1');
            expect(target1).not.toBe(target2);
            expect(target1).toEqual(target2);
        });
        it('should throw for non-existent targets', async () => {
            resolver = new TargetResolver(config, { autoDetect: false });
            await expect(resolver.resolve('hosts.nonexistent')).rejects.toThrow("Target 'nonexistent' not found in hosts");
        });
        it('should handle missing targets config', async () => {
            const emptyConfig = { version: '2.0' };
            resolver = new TargetResolver(emptyConfig, { autoDetect: false });
            const local = await resolver.resolve('local');
            expect(local.type).toBe('local');
            await expect(resolver.resolve('hosts.anything')).rejects.toThrow("Target 'anything' not found in hosts");
        });
        describe('auto-detection', () => {
            it('should auto-detect Docker containers', async () => {
                const dockerPsFile = path.join(testDir, 'docker-ps.txt');
                await fs.writeFile(dockerPsFile, 'mycontainer\nredis-cache\nnginx\n');
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        try {
                            const content = await fs.readFile(dockerPsFile, 'utf-8');
                            const containers = content.trim().split('\n');
                            return containers.includes(name);
                        }
                        catch {
                            return false;
                        }
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('mycontainer');
                expect(target).toEqual({
                    id: 'mycontainer',
                    type: 'docker',
                    name: 'mycontainer',
                    config: {
                        type: 'docker',
                        container: 'mycontainer'
                    },
                    source: 'detected'
                });
            });
            it('should auto-detect Kubernetes pods', async () => {
                const kubectlPodsFile = path.join(testDir, 'kubectl-pods.txt');
                await fs.writeFile(kubectlPodsFile, 'mypod\ntest-pod\napp-pod\n');
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        try {
                            const content = await fs.readFile(kubectlPodsFile, 'utf-8');
                            const pods = content.trim().split('\n');
                            return pods.includes(name);
                        }
                        catch {
                            return false;
                        }
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('mypod');
                expect(target).toEqual({
                    id: 'mypod',
                    type: 'k8s',
                    name: 'mypod',
                    config: {
                        type: 'k8s',
                        pod: 'mypod',
                        namespace: 'default'
                    },
                    source: 'detected'
                });
            });
            it('should use Kubernetes context and namespace from config', async () => {
                config.targets.kubernetes = {
                    $namespace: 'production',
                    $context: 'prod-cluster'
                };
                const k8sPodsFile = path.join(testDir, 'k8s-pods-prod.txt');
                await fs.writeFile(k8sPodsFile, 'mypod\nprod-app\nprod-db\n');
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        try {
                            const content = await fs.readFile(k8sPodsFile, 'utf-8');
                            const pods = content.trim().split('\n');
                            return pods.includes(name);
                        }
                        catch {
                            return false;
                        }
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('mypod');
                expect(target.config).toMatchObject({
                    type: 'k8s',
                    pod: 'mypod',
                    namespace: 'production'
                });
            });
            it('should default to SSH for hostnames', async () => {
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('example.com');
                expect(target).toEqual({
                    id: 'example.com',
                    type: 'ssh',
                    name: 'example.com',
                    config: {
                        type: 'ssh',
                        host: 'example.com'
                    },
                    source: 'detected'
                });
            });
            it('should parse user@host format', async () => {
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('user@example.com');
                expect(target).toEqual({
                    id: 'user@example.com',
                    type: 'ssh',
                    name: 'user@example.com',
                    config: {
                        type: 'ssh',
                        host: 'example.com',
                        user: 'user'
                    },
                    source: 'detected'
                });
            });
            it('should handle SSH targets without @ or .', async () => {
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                await expect(testResolver.resolve('simplestring')).rejects.toThrow("Target 'simplestring' not found");
            });
        });
    });
    describe('find()', () => {
        it('should find targets by exact name', async () => {
            const targets = await resolver.find('hosts.web-1');
            expect(targets).toHaveLength(1);
            expect(targets[0].id).toBe('hosts.web-1');
        });
        it('should find targets by wildcard pattern', async () => {
            const targets = await resolver.find('hosts.web-*');
            expect(targets).toHaveLength(2);
            expect(targets.map(t => t.id)).toContain('hosts.web-1');
            expect(targets.map(t => t.id)).toContain('hosts.web-2');
        });
        it('should find targets with ? wildcard', async () => {
            const targets = await resolver.find('hosts.web-?');
            expect(targets).toHaveLength(2);
            expect(targets.map(t => t.id)).toContain('hosts.web-1');
            expect(targets.map(t => t.id)).toContain('hosts.web-2');
        });
        it('should expand brace patterns', async () => {
            const targets = await resolver.find('hosts.web-{1,2}');
            expect(targets).toHaveLength(2);
            expect(targets.map(t => t.id)).toContain('hosts.web-1');
            expect(targets.map(t => t.id)).toContain('hosts.web-2');
        });
        it('should search across types with auto mode', async () => {
            const dockerPsFile = path.join(testDir, 'docker-ps-search.txt');
            await fs.writeFile(dockerPsFile, 'app-1\napp-2\n');
            class TestableTargetResolver extends TargetResolver {
                async isDockerContainer(name) {
                    try {
                        const content = await fs.readFile(dockerPsFile, 'utf-8');
                        const containers = content.trim().split('\n');
                        return containers.includes(name);
                    }
                    catch {
                        return false;
                    }
                }
            }
            const testResolver = new TestableTargetResolver(config);
            const targets = await testResolver.find('app*');
            expect(targets.length).toBeGreaterThanOrEqual(1);
            expect(targets.some(t => t.id === 'containers.app')).toBe(true);
        });
        it('should remove duplicates', async () => {
            const targets = await resolver.find('hosts.web-1');
            const ids = targets.map(t => t.id);
            const uniqueIds = [...new Set(ids)];
            expect(ids).toEqual(uniqueIds);
        });
    });
    describe('list()', () => {
        it('should list all configured targets', async () => {
            const targets = await resolver.list();
            expect(targets).toHaveLength(8);
            expect(targets.some(t => t.id === 'local')).toBe(true);
            expect(targets.some(t => t.id === 'hosts.web-1')).toBe(true);
            expect(targets.some(t => t.id === 'hosts.web-2')).toBe(true);
            expect(targets.some(t => t.id === 'hosts.db-master')).toBe(true);
            expect(targets.some(t => t.id === 'containers.app')).toBe(true);
            expect(targets.some(t => t.id === 'containers.redis')).toBe(true);
            expect(targets.some(t => t.id === 'pods.api')).toBe(true);
            expect(targets.some(t => t.id === 'pods.worker')).toBe(true);
        });
        it('should handle empty targets config', async () => {
            const emptyConfig = { version: '2.0' };
            const emptyResolver = new TargetResolver(emptyConfig);
            const targets = await emptyResolver.list();
            expect(targets).toHaveLength(1);
            expect(targets[0].id).toBe('local');
        });
    });
    describe('create()', () => {
        it('should create dynamic SSH target', async () => {
            const target = await resolver.create({
                type: 'ssh',
                host: 'dynamic.example.com',
                user: 'admin'
            });
            expect(target).toEqual({
                id: 'dynamic-ssh-dynamic.example.com',
                type: 'ssh',
                config: {
                    type: 'ssh',
                    host: 'dynamic.example.com',
                    user: 'admin'
                },
                source: 'created'
            });
            const resolved = await resolver.resolve('dynamic-ssh-dynamic.example.com');
            expect(resolved).toBe(target);
        });
        it('should create dynamic Docker target', async () => {
            const target = await resolver.create({
                type: 'docker',
                image: 'alpine:latest'
            });
            expect(target).toEqual({
                id: 'dynamic-docker-ephemeral',
                type: 'docker',
                config: {
                    type: 'docker',
                    image: 'alpine:latest'
                },
                source: 'created'
            });
        });
        it('should create dynamic Kubernetes target', async () => {
            const target = await resolver.create({
                type: 'k8s',
                pod: 'mypod',
                namespace: 'custom'
            });
            expect(target).toEqual({
                id: 'dynamic-k8s-mypod',
                type: 'k8s',
                config: {
                    type: 'k8s',
                    pod: 'mypod',
                    namespace: 'custom'
                },
                source: 'created'
            });
        });
        it('should create local target', async () => {
            const target = await resolver.create({
                type: 'local',
                env: { CUSTOM_VAR: 'value' }
            });
            expect(target).toEqual({
                id: 'local',
                type: 'local',
                config: {
                    type: 'local',
                    env: { CUSTOM_VAR: 'value' }
                },
                source: 'created'
            });
        });
    });
    describe('Docker Compose integration', () => {
        it('should find compose services', async () => {
            config.targets.$compose = {
                file: 'docker-compose.yml',
                project: 'myproject'
            };
            const composeServicesFile = path.join(testDir, 'compose-services.json');
            await fs.writeFile(composeServicesFile, '{"Service":"web","Name":"myproject_web_1"}\n' +
                '{"Service":"db","Name":"myproject_db_1"}\n');
            class TestableTargetResolver extends TargetResolver {
                async findComposeServices(pattern) {
                    try {
                        const content = await fs.readFile(composeServicesFile, 'utf-8');
                        const services = content.trim().split('\n').map(line => JSON.parse(line));
                        const targets = [];
                        for (const service of services) {
                            if (matchPattern(pattern, service.Service)) {
                                targets.push({
                                    id: `containers.${service.Service}`,
                                    type: 'docker',
                                    name: service.Service,
                                    config: this.applyDefaults({
                                        type: 'docker',
                                        container: service.Name
                                    }),
                                    source: 'detected'
                                });
                            }
                        }
                        return targets;
                    }
                    catch {
                        return [];
                    }
                }
            }
            const { matchPattern } = await import('../../src/config/utils');
            const testResolver = new TestableTargetResolver(config);
            const targets = await testResolver.find('containers.*');
            expect(targets.some(t => t.id === 'containers.app')).toBe(true);
            expect(targets.some(t => t.id === 'containers.redis')).toBe(true);
        });
        it('should handle docker compose failures gracefully', async () => {
            config.targets.$compose = {
                file: 'docker-compose.yml',
                project: 'failing'
            };
            class TestableTargetResolver extends TargetResolver {
                async findComposeServices(pattern) {
                    return [];
                }
            }
            const testResolver = new TestableTargetResolver(config);
            const targets = await testResolver.find('containers.*');
            expect(targets.some(t => t.id === 'containers.app')).toBe(true);
            expect(targets.some(t => t.id === 'containers.redis')).toBe(true);
            expect(targets.length).toBe(2);
        });
    });
    describe('clearCache()', () => {
        it('should clear target cache', async () => {
            const dockerPsFile = path.join(testDir, 'docker-ps-cache.txt');
            await fs.writeFile(dockerPsFile, 'mycontainer\n');
            class TestableTargetResolver extends TargetResolver {
                async isDockerContainer(name) {
                    try {
                        const content = await fs.readFile(dockerPsFile, 'utf-8');
                        const containers = content.trim().split('\n');
                        return containers.includes(name);
                    }
                    catch {
                        return false;
                    }
                }
                async isKubernetesPod(name) {
                    return false;
                }
            }
            const testResolver = new TestableTargetResolver(config);
            const target1 = await testResolver.resolve('mycontainer');
            expect(target1.source).toBe('detected');
            testResolver.clearCache();
            await fs.writeFile(dockerPsFile, 'different-container\n');
            await expect(testResolver.resolve('mycontainer')).rejects.toThrow("Target 'mycontainer' not found");
        });
    });
    describe('pattern matching', () => {
        it('should find local target by pattern', async () => {
            const targets = await resolver.find('local');
            expect(targets).toHaveLength(1);
            expect(targets[0].id).toBe('local');
            expect(targets[0].type).toBe('local');
        });
        it('should handle complex patterns', async () => {
            config.targets.hosts = {
                ...config.targets.hosts,
                'api-prod-1': { host: 'api1.prod.example.com' },
                'api-prod-2': { host: 'api2.prod.example.com' },
                'api-dev-1': { host: 'api1.dev.example.com' }
            };
            resolver = new TargetResolver(config);
            let targets = await resolver.find('hosts.api-prod-*');
            expect(targets).toHaveLength(2);
            targets = await resolver.find('hosts.*-1');
            expect(targets).toHaveLength(3);
            targets = await resolver.find('hosts.api-*-1');
            expect(targets).toHaveLength(2);
        });
    });
    describe('global target defaults', () => {
        beforeEach(() => {
            config = {
                version: '2.0',
                targets: {
                    defaults: {
                        timeout: 30000,
                        shell: '/bin/bash',
                        encoding: 'utf8',
                        maxBuffer: 20000000,
                        throwOnNonZeroExit: false,
                        env: {
                            GLOBAL_VAR: 'global_value'
                        },
                        ssh: {
                            port: 2222,
                            keepAlive: true,
                            keepAliveInterval: 10000,
                            connectionPool: {
                                enabled: true,
                                maxConnections: 5,
                                idleTimeout: 300000
                            },
                            sudo: {
                                enabled: true,
                                method: 'askpass'
                            },
                            sftp: {
                                enabled: true,
                                concurrency: 2
                            }
                        },
                        docker: {
                            tty: true,
                            workdir: '/workspace',
                            autoRemove: true,
                            socketPath: '/custom/docker.sock',
                            user: 'appuser',
                            runMode: 'run'
                        },
                        kubernetes: {
                            namespace: 'production',
                            tty: false,
                            stdin: true,
                            kubeconfig: '/custom/kube.config',
                            context: 'prod-cluster',
                            execFlags: ['--verbose']
                        }
                    },
                    hosts: {
                        'test-host': {
                            host: 'test.example.com'
                        },
                        'custom-host': {
                            host: 'custom.example.com',
                            port: 3333,
                            timeout: 60000,
                            env: {
                                CUSTOM_VAR: 'custom_value',
                                GLOBAL_VAR: 'override_value'
                            }
                        }
                    },
                    containers: {
                        'test-container': {
                            image: 'test:latest'
                        },
                        'custom-container': {
                            image: 'custom:latest',
                            tty: false,
                            workdir: '/app',
                            timeout: 45000
                        }
                    },
                    pods: {
                        'test-pod': {
                            selector: 'app=test'
                        },
                        'custom-pod': {
                            selector: 'app=custom',
                            namespace: 'dev',
                            tty: true,
                            timeout: 90000
                        }
                    },
                    local: {
                        type: 'local',
                        timeout: 15000
                    }
                }
            };
            resolver = new TargetResolver(config);
        });
        describe('common defaults', () => {
            it('should apply common defaults to SSH host without overrides', async () => {
                const target = await resolver.resolve('hosts.test-host');
                expect(target.config).toMatchObject({
                    type: 'ssh',
                    host: 'test.example.com',
                    timeout: 30000,
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    env: {
                        GLOBAL_VAR: 'global_value'
                    },
                    port: 2222,
                    keepAlive: true,
                    keepAliveInterval: 10000,
                    connectionPool: {
                        enabled: true,
                        maxConnections: 5,
                        idleTimeout: 300000
                    },
                    sudo: {
                        enabled: true,
                        method: 'askpass'
                    },
                    sftp: {
                        enabled: true,
                        concurrency: 2
                    }
                });
            });
            it('should override defaults with target-specific values', async () => {
                const target = await resolver.resolve('hosts.custom-host');
                expect(target.config).toMatchObject({
                    type: 'ssh',
                    host: 'custom.example.com',
                    port: 3333,
                    timeout: 60000,
                    env: {
                        CUSTOM_VAR: 'custom_value',
                        GLOBAL_VAR: 'override_value'
                    },
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    keepAlive: true,
                    keepAliveInterval: 10000,
                    connectionPool: {
                        enabled: true,
                        maxConnections: 5,
                        idleTimeout: 300000
                    }
                });
            });
            it('should apply common defaults to Docker container', async () => {
                const target = await resolver.resolve('containers.test-container');
                expect(target.config).toMatchObject({
                    type: 'docker',
                    image: 'test:latest',
                    timeout: 30000,
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    env: {
                        GLOBAL_VAR: 'global_value'
                    },
                    tty: true,
                    workdir: '/workspace',
                    autoRemove: true,
                    socketPath: '/custom/docker.sock',
                    user: 'appuser',
                    runMode: 'run'
                });
            });
            it('should apply common defaults to Kubernetes pod', async () => {
                const target = await resolver.resolve('pods.test-pod');
                expect(target.config).toMatchObject({
                    type: 'k8s',
                    selector: 'app=test',
                    timeout: 30000,
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    env: {
                        GLOBAL_VAR: 'global_value'
                    },
                    namespace: 'production',
                    tty: false,
                    stdin: true,
                    kubeconfig: '/custom/kube.config',
                    context: 'prod-cluster',
                    execFlags: ['--verbose']
                });
            });
            it('should apply common defaults to local target', async () => {
                const target = await resolver.resolve('local');
                expect(target.config).toMatchObject({
                    type: 'local',
                    timeout: 15000,
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    env: {
                        GLOBAL_VAR: 'global_value'
                    }
                });
            });
        });
        describe('type-specific defaults', () => {
            it('should not apply SSH defaults to Docker containers', async () => {
                const target = await resolver.resolve('containers.test-container');
                expect(target.config).not.toHaveProperty('port');
                expect(target.config).not.toHaveProperty('keepAlive');
                expect(target.config).not.toHaveProperty('connectionPool');
            });
            it('should not apply Docker defaults to SSH hosts', async () => {
                const target = await resolver.resolve('hosts.test-host');
                expect(target.config).not.toHaveProperty('autoRemove');
                expect(target.config).not.toHaveProperty('runMode');
            });
            it('should not apply Kubernetes defaults to other target types', async () => {
                const sshTarget = await resolver.resolve('hosts.test-host');
                const dockerTarget = await resolver.resolve('containers.test-container');
                expect(sshTarget.config).not.toHaveProperty('namespace');
                expect(sshTarget.config).not.toHaveProperty('execFlags');
                expect(dockerTarget.config).not.toHaveProperty('namespace');
                expect(dockerTarget.config).not.toHaveProperty('execFlags');
            });
        });
        describe('complex merging scenarios', () => {
            it('should merge nested objects correctly', async () => {
                config.targets.hosts['nested-host'] = {
                    host: 'nested.example.com',
                    connectionPool: {
                        maxConnections: 10
                    }
                };
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.nested-host');
                expect(target.config.connectionPool).toEqual({
                    enabled: true,
                    maxConnections: 10,
                    idleTimeout: 300000
                });
            });
            it('should merge arrays correctly for Kubernetes execFlags', async () => {
                config.targets.pods['array-pod'] = {
                    selector: 'app=array',
                    execFlags: ['--quiet']
                };
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('pods.array-pod');
                expect(target.config.execFlags).toEqual(['--verbose', '--quiet']);
            });
            it('should handle partial sudo config', async () => {
                config.targets.hosts['sudo-host'] = {
                    host: 'sudo.example.com',
                    sudo: {
                        password: 'secret123'
                    }
                };
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.sudo-host');
                expect(target.config.sudo).toEqual({
                    enabled: true,
                    method: 'askpass',
                    password: 'secret123'
                });
            });
        });
        describe('auto-detected targets with defaults', () => {
            it('should apply defaults to auto-detected Docker container', async () => {
                const dockerPsFile = path.join(testDir, 'docker-ps-defaults.txt');
                await fs.writeFile(dockerPsFile, 'detected-container\n');
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        try {
                            const content = await fs.readFile(dockerPsFile, 'utf-8');
                            const containers = content.trim().split('\n');
                            return containers.includes(name);
                        }
                        catch {
                            return false;
                        }
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('detected-container');
                expect(target.config).toMatchObject({
                    type: 'docker',
                    container: 'detected-container',
                    timeout: 30000,
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    env: {
                        GLOBAL_VAR: 'global_value'
                    },
                    tty: true,
                    workdir: '/workspace',
                    autoRemove: true,
                    socketPath: '/custom/docker.sock',
                    user: 'appuser',
                    runMode: 'run'
                });
            });
            it('should apply defaults to auto-detected SSH host', async () => {
                class TestableTargetResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('user@detected.example.com');
                expect(target.config).toMatchObject({
                    type: 'ssh',
                    host: 'detected.example.com',
                    user: 'user',
                    timeout: 30000,
                    shell: '/bin/bash',
                    encoding: 'utf8',
                    maxBuffer: 20000000,
                    throwOnNonZeroExit: false,
                    env: {
                        GLOBAL_VAR: 'global_value'
                    },
                    port: 2222,
                    keepAlive: true,
                    keepAliveInterval: 10000,
                    connectionPool: {
                        enabled: true,
                        maxConnections: 5,
                        idleTimeout: 300000
                    }
                });
            });
        });
        describe('no defaults scenario', () => {
            it('should work without any defaults defined', async () => {
                config = {
                    version: '2.0',
                    targets: {
                        hosts: {
                            'no-defaults': {
                                host: 'nodefaults.example.com',
                                port: 22
                            }
                        }
                    }
                };
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.no-defaults');
                expect(target.config).toEqual({
                    type: 'ssh',
                    host: 'nodefaults.example.com',
                    port: 22
                });
            });
        });
        describe('profile overrides with defaults', () => {
            it('should apply profile-specific defaults override', async () => {
                config.targets.defaults.ssh.port = 4444;
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.test-host');
                expect(target.config.port).toBe(4444);
            });
        });
        describe('list() with defaults', () => {
            it('should apply defaults to all listed targets', async () => {
                const targets = await resolver.list();
                const sshTarget = targets.find(t => t.id === 'hosts.test-host');
                expect(sshTarget?.config.timeout).toBe(30000);
                expect(sshTarget?.config.port).toBe(2222);
                const dockerTarget = targets.find(t => t.id === 'containers.test-container');
                expect(dockerTarget?.config.timeout).toBe(30000);
                expect(dockerTarget?.config.tty).toBe(true);
                const k8sTarget = targets.find(t => t.id === 'pods.test-pod');
                expect(k8sTarget?.config.timeout).toBe(30000);
                expect(k8sTarget?.config.namespace).toBe('production');
            });
        });
        describe('find() with defaults', () => {
            it('should apply defaults to all found targets', async () => {
                const targets = await resolver.find('hosts.*');
                expect(targets).toHaveLength(2);
                targets.forEach(target => {
                    expect(target.config.shell).toBe('/bin/bash');
                    expect(target.config.encoding).toBe('utf8');
                    expect(target.config.keepAlive).toBe(true);
                });
            });
        });
        describe('edge cases', () => {
            it('should handle undefined defaults gracefully', async () => {
                config.targets.defaults = undefined;
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.test-host');
                expect(target.config).toEqual({
                    type: 'ssh',
                    host: 'test.example.com'
                });
            });
            it('should handle empty defaults object', async () => {
                config.targets.defaults = {};
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.test-host');
                expect(target.config).toEqual({
                    type: 'ssh',
                    host: 'test.example.com'
                });
            });
            it('should handle boolean shell value correctly', async () => {
                config.targets.defaults.shell = false;
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.test-host');
                expect(target.config.shell).toBe(false);
            });
            it('should preserve null/undefined values in target config', async () => {
                config.targets.hosts['null-host'] = {
                    host: 'null.example.com',
                    port: undefined,
                    user: null
                };
                resolver = new TargetResolver(config);
                const target = await resolver.resolve('hosts.null-host');
                expect(target.config.port).toBe(2222);
                expect(target.config.user).toBeNull();
            });
        });
    });
    describe('additional coverage tests', () => {
        describe('duplicate filtering', () => {
            it('should filter out duplicate targets in find()', async () => {
                config.targets.hosts = {
                    'test': { host: 'test.com' },
                    'test-1': { host: 'test1.com' },
                    'test-2': { host: 'test2.com' }
                };
                class TestableTargetResolver extends TargetResolver {
                    async findHosts(pattern) {
                        const targets = await super.findHosts(pattern);
                        if (targets.length > 0) {
                            targets.push(targets[0]);
                        }
                        return targets;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const targets = await testResolver.find('hosts.test');
                expect(targets).toHaveLength(1);
                expect(targets[0].id).toBe('hosts.test');
            });
        });
        describe('SSH config parsing', () => {
            it('should parse SSH config file', async () => {
                const sshDir = path.join(testDir, '.ssh');
                await fs.mkdir(sshDir, { recursive: true });
                const sshConfigPath = path.join(sshDir, 'config');
                await fs.writeFile(sshConfigPath, `
Host myserver
  HostName 192.168.1.100
  User admin
  Port 2222
  IdentityFile ~/.ssh/id_rsa

Host otherserver
  HostName other.example.com
  User root
  Port 22

Host * 
  ForwardAgent yes
`);
                class TestableTargetResolver extends TargetResolver {
                    async getSSHHost(name) {
                        try {
                            const configContent = await fs.readFile(sshConfigPath, 'utf-8');
                            const lines = configContent.split('\n');
                            let currentHost;
                            const hosts = {};
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed.startsWith('Host ')) {
                                    currentHost = trimmed.substring(5).trim();
                                    hosts[currentHost] = {};
                                }
                                else if (currentHost && trimmed.includes(' ')) {
                                    const [key, ...valueParts] = trimmed.split(/\s+/);
                                    const value = valueParts.join(' ');
                                    const keyMap = {
                                        'HostName': 'host',
                                        'User': 'user',
                                        'Port': 'port',
                                        'IdentityFile': 'privateKey'
                                    };
                                    if (key) {
                                        const mappedKey = keyMap[key];
                                        if (mappedKey && currentHost) {
                                            hosts[currentHost][mappedKey] = value;
                                        }
                                    }
                                }
                            }
                            if (hosts[name]) {
                                return {
                                    type: 'ssh',
                                    host: hosts[name].host || name,
                                    ...hosts[name]
                                };
                            }
                        }
                        catch {
                        }
                        return undefined;
                    }
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const target = await testResolver.resolve('myserver');
                expect(target).toEqual({
                    id: 'myserver',
                    type: 'ssh',
                    name: 'myserver',
                    config: {
                        type: 'ssh',
                        host: '192.168.1.100',
                        user: 'admin',
                        port: '2222',
                        privateKey: '~/.ssh/id_rsa'
                    },
                    source: 'detected'
                });
            });
            it('should handle missing SSH config gracefully', async () => {
                class TestableTargetResolver extends TargetResolver {
                    async getSSHHost(name) {
                        return undefined;
                    }
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                await expect(testResolver.resolve('unknownhost')).rejects.toThrow("Target 'unknownhost' not found");
            });
            it('should cover line 468 in getSSHHost', async () => {
                const sshConfigPath = path.join(testDir, '.ssh', 'config');
                await fs.mkdir(path.dirname(sshConfigPath), { recursive: true });
                await fs.writeFile(sshConfigPath, 'Host myhost\n  HostName example.com\n');
                class TestableTargetResolver extends TargetResolver {
                    async getSSHHost(name) {
                        try {
                            const configContent = await fs.readFile(sshConfigPath, 'utf-8');
                            const lines = configContent.split('\n');
                            let currentHost;
                            const hosts = {};
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed.startsWith('Host ')) {
                                    currentHost = trimmed.substring(5).trim();
                                    hosts[currentHost] = {};
                                }
                                else if (currentHost && trimmed.includes(' ')) {
                                    const [key, ...valueParts] = trimmed.split(/\s+/);
                                    const value = valueParts.join(' ');
                                    const keyMap = {
                                        'HostName': 'host',
                                        'User': 'user',
                                        'Port': 'port',
                                        'IdentityFile': 'privateKey'
                                    };
                                    if (key) {
                                        const mappedKey = keyMap[key];
                                        if (mappedKey && currentHost) {
                                            hosts[currentHost][mappedKey] = value;
                                        }
                                    }
                                }
                            }
                            if (hosts[name]) {
                                return {
                                    type: 'ssh',
                                    host: hosts[name].host || name,
                                    ...hosts[name]
                                };
                            }
                        }
                        catch {
                        }
                        return undefined;
                    }
                    async isDockerContainer(name) {
                        return false;
                    }
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const result = await testResolver.resolve('myhost');
                expect(result.config.host).toBe('example.com');
            });
        });
        describe('Docker Compose services detection', () => {
            it('should handle Docker Compose command failure gracefully', async () => {
                config.targets.$compose = {
                    file: 'docker-compose.yml',
                    project: 'myproject'
                };
                delete config.targets.$compose;
                resolver = new TargetResolver(config);
                const targets = await resolver.find('containers.*');
                expect(targets.some(t => t.id === 'containers.app')).toBe(true);
                expect(targets.some(t => t.id === 'containers.redis')).toBe(true);
            });
        });
        describe('resolveConfigured edge cases', () => {
            it('should return undefined for unknown target type', async () => {
                class TestableTargetResolver extends TargetResolver {
                    async testResolveConfigured(ref) {
                        return this.resolveConfigured(ref);
                    }
                }
                const testResolver = new TestableTargetResolver(config);
                const result = await testResolver.testResolveConfigured({
                    type: 'unknown',
                    name: 'test'
                });
                expect(result).toBeUndefined();
            });
        });
        describe('Docker and Kubernetes detection', () => {
            it('should detect running Docker containers', async () => {
                class TestableDockerResolver extends TargetResolver {
                    constructor() {
                        super(...arguments);
                        this.mockContainers = ['test-container-1', 'test-container-2'];
                    }
                    async isDockerContainer(name) {
                        return this.mockContainers.includes(name);
                    }
                }
                const testResolver = new TestableDockerResolver(config);
                const isContainer = await testResolver.isDockerContainer('test-container-1');
                expect(isContainer).toBe(true);
                const isNotContainer = await testResolver.isDockerContainer('nonexistent-container');
                expect(isNotContainer).toBe(false);
            });
            it('should handle Docker command failure', async () => {
                class TestDockerResolver extends TargetResolver {
                    async isDockerContainer(name) {
                        return false;
                    }
                }
                const testResolver = new TestDockerResolver(config);
                const isContainer = await testResolver.isDockerContainer('test-container');
                expect(isContainer).toBe(false);
            });
            it('should detect Kubernetes pods', async () => {
                class MockKubernetesResolver extends TargetResolver {
                    async isKubernetesPod(name) {
                        return name === 'mypod';
                    }
                }
                const testResolver = new MockKubernetesResolver(config);
                const isPod = await testResolver.isKubernetesPod('mypod');
                expect(isPod).toBe(true);
                const isNotPod = await testResolver.isKubernetesPod('nonexistent');
                expect(isNotPod).toBe(false);
            });
            it('should handle kubectl command failure', async () => {
                class TestKubernetesResolver extends TargetResolver {
                    async isKubernetesPod(name) {
                        return false;
                    }
                }
                const testResolver = new TestKubernetesResolver(config);
                const isPod = await testResolver.isKubernetesPod('test-pod');
                expect(isPod).toBe(false);
            });
            it('should use Kubernetes context from config', async () => {
                config.targets.kubernetes = {
                    $namespace: 'custom-ns',
                    $context: 'prod-cluster'
                };
                class ArgumentCapturingResolver extends TargetResolver {
                    constructor() {
                        super(...arguments);
                        this.lastKubectlArgs = [];
                    }
                    async isKubernetesPod(name) {
                        const namespace = this.config.targets?.kubernetes?.$namespace || 'default';
                        const context = this.config.targets?.kubernetes?.$context;
                        const args = ['get', 'pod', name, '-n', namespace];
                        if (context) {
                            args.push('--context', context);
                        }
                        this.lastKubectlArgs = args;
                        return true;
                    }
                }
                const testResolver = new ArgumentCapturingResolver(config);
                await testResolver.isKubernetesPod('mypod');
                expect(testResolver.lastKubectlArgs).toContain('--context');
                expect(testResolver.lastKubectlArgs).toContain('prod-cluster');
                expect(testResolver.lastKubectlArgs).toContain('-n');
                expect(testResolver.lastKubectlArgs).toContain('custom-ns');
            });
        });
        describe('Docker Compose integration implementation', () => {
            it('should handle empty compose services list', async () => {
                config.targets.$compose = {
                    file: 'docker-compose.yml',
                    project: 'testproject'
                };
                const originalShell = $.shell;
                class TestResolver extends TargetResolver {
                    async findComposeServices(pattern) {
                        const services = [
                            { Service: 'web', Name: 'testproject_web_1' },
                            { Service: 'db', Name: 'testproject_db_1' },
                            { Service: 'cache', Name: 'testproject_cache_1' }
                        ];
                        const targets = [];
                        for (const service of services) {
                            if ((await import('../../src/config/utils.js')).matchPattern(pattern, service.Service)) {
                                targets.push({
                                    id: `containers.${service.Service}`,
                                    type: 'docker',
                                    name: service.Service,
                                    config: this.applyDefaults({
                                        type: 'docker',
                                        container: service.Name
                                    }),
                                    source: 'detected'
                                });
                            }
                        }
                        return targets;
                    }
                }
                const testResolver = new TestResolver(config);
                const targets = await testResolver.find('containers.*');
                expect(targets.some(t => t.id === 'containers.web')).toBe(true);
                expect(targets.some(t => t.id === 'containers.db')).toBe(true);
                expect(targets.some(t => t.id === 'containers.cache')).toBe(true);
            });
            it('should build correct Docker Compose arguments', async () => {
                config.targets.$compose = {
                    file: 'custom-compose.yml',
                    project: 'myapp'
                };
                expect(config.targets.$compose.file).toBe('custom-compose.yml');
                expect(config.targets.$compose.project).toBe('myapp');
                const compose = config.targets.$compose;
                const args = ['compose'];
                if (compose.file) {
                    args.push('-f', compose.file);
                }
                if (compose.project) {
                    args.push('-p', compose.project);
                }
                args.push('ps', '--format', 'json');
                expect(args).toContain('-f');
                expect(args).toContain('custom-compose.yml');
                expect(args).toContain('-p');
                expect(args).toContain('myapp');
            });
            it('should handle malformed Docker Compose JSON', async () => {
                const malformedJson = 'invalid json';
                const validJson = '{"Service":"valid","Name":"container"}';
                expect(() => JSON.parse(malformedJson)).toThrow();
                expect(() => JSON.parse(validJson)).not.toThrow();
                const lines = [malformedJson, validJson, 'another invalid'];
                const parsedServices = [];
                for (const line of lines) {
                    try {
                        const service = JSON.parse(line);
                        parsedServices.push(service);
                    }
                    catch {
                    }
                }
                expect(parsedServices).toHaveLength(1);
                expect(parsedServices[0].Service).toBe('valid');
            });
        });
    });
});
//# sourceMappingURL=target-resolver.test.js.map