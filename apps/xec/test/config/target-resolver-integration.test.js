import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { TargetResolver } from '../../src/config/target-resolver';
describe('TargetResolver Integration Tests', () => {
    let tempDir;
    let config;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-resolver-test-'));
        config = {
            version: '2.0',
            targets: {
                hosts: {
                    'test-host': {
                        host: 'test.example.com',
                        user: 'testuser'
                    }
                },
                containers: {
                    'test-container': {
                        image: 'node:18'
                    }
                },
                pods: {
                    'test-pod': {
                        namespace: 'default',
                        selector: 'app=test'
                    }
                }
            }
        };
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    describe('Real File-Based Tests', () => {
        it('should handle command failures gracefully by writing results to files', async () => {
            class FileBasedResolver extends TargetResolver {
                constructor(config, resultsDir) {
                    super(config);
                    this.resultsDir = resultsDir;
                }
                async isDockerContainer(name) {
                    const resultFile = path.join(this.resultsDir, `docker-${name}.txt`);
                    try {
                        await fs.access(resultFile);
                        const content = await fs.readFile(resultFile, 'utf-8');
                        return content.trim() === 'true';
                    }
                    catch {
                        await fs.writeFile(resultFile, 'false');
                        return false;
                    }
                }
                async isKubernetesPod(name) {
                    const resultFile = path.join(this.resultsDir, `k8s-${name}.txt`);
                    try {
                        await fs.access(resultFile);
                        const content = await fs.readFile(resultFile, 'utf-8');
                        return content.trim() === 'true';
                    }
                    catch {
                        await fs.writeFile(resultFile, 'false');
                        return false;
                    }
                }
            }
            const resultsDir = path.join(tempDir, 'results');
            await fs.mkdir(resultsDir, { recursive: true });
            const resolver = new FileBasedResolver(config, resultsDir);
            const isContainer = await resolver.isDockerContainer('test-container');
            expect(isContainer).toBe(false);
            const dockerResultFile = path.join(resultsDir, 'docker-test-container.txt');
            const dockerResult = await fs.readFile(dockerResultFile, 'utf-8');
            expect(dockerResult).toBe('false');
            const isPod = await resolver.isKubernetesPod('test-pod');
            expect(isPod).toBe(false);
            const k8sResultFile = path.join(resultsDir, 'k8s-test-pod.txt');
            const k8sResult = await fs.readFile(k8sResultFile, 'utf-8');
            expect(k8sResult).toBe('false');
        });
        it('should simulate successful detection by pre-creating marker files', async () => {
            class FileBasedResolver extends TargetResolver {
                constructor(config, markersDir) {
                    super(config);
                    this.markersDir = markersDir;
                }
                async isDockerContainer(name) {
                    const markerFile = path.join(this.markersDir, `docker-${name}.marker`);
                    try {
                        await fs.access(markerFile);
                        return true;
                    }
                    catch {
                        return false;
                    }
                }
                async isKubernetesPod(name) {
                    const markerFile = path.join(this.markersDir, `k8s-${name}.marker`);
                    try {
                        await fs.access(markerFile);
                        return true;
                    }
                    catch {
                        return false;
                    }
                }
            }
            const markersDir = path.join(tempDir, 'markers');
            await fs.mkdir(markersDir, { recursive: true });
            await fs.writeFile(path.join(markersDir, 'docker-myapp.marker'), '');
            await fs.writeFile(path.join(markersDir, 'k8s-mypod.marker'), '');
            const resolver = new FileBasedResolver(config, markersDir);
            const isDockerContainer = await resolver.isDockerContainer('myapp');
            expect(isDockerContainer).toBe(true);
            const isNotDockerContainer = await resolver.isDockerContainer('nonexistent');
            expect(isNotDockerContainer).toBe(false);
            const isK8sPod = await resolver.isKubernetesPod('mypod');
            expect(isK8sPod).toBe(true);
            const isNotK8sPod = await resolver.isKubernetesPod('nonexistent');
            expect(isNotK8sPod).toBe(false);
        });
        it('should write detection logs to files for debugging', async () => {
            class LoggingResolver extends TargetResolver {
                constructor(config, logDir) {
                    super(config);
                    this.logDir = logDir;
                }
                async log(type, operation, details) {
                    const logFile = path.join(this.logDir, `${type}-operations.log`);
                    const entry = {
                        timestamp: new Date().toISOString(),
                        operation,
                        details
                    };
                    const logEntry = JSON.stringify(entry) + '\n';
                    await fs.appendFile(logFile, logEntry);
                }
                async isDockerContainer(name) {
                    await this.log('docker', 'isDockerContainer', { name });
                    const result = name.startsWith('docker-');
                    await this.log('docker', 'isDockerContainer-result', { name, result });
                    return result;
                }
                async isKubernetesPod(name) {
                    await this.log('k8s', 'isKubernetesPod', { name });
                    const result = name.startsWith('pod-');
                    await this.log('k8s', 'isKubernetesPod-result', { name, result });
                    return result;
                }
            }
            const logDir = path.join(tempDir, 'logs');
            await fs.mkdir(logDir, { recursive: true });
            const resolver = new LoggingResolver(config, logDir);
            await resolver.isDockerContainer('docker-app');
            await resolver.isDockerContainer('regular-app');
            await resolver.isKubernetesPod('pod-web');
            await resolver.isKubernetesPod('regular-web');
            const dockerLog = await fs.readFile(path.join(logDir, 'docker-operations.log'), 'utf-8');
            const k8sLog = await fs.readFile(path.join(logDir, 'k8s-operations.log'), 'utf-8');
            const dockerEntries = dockerLog.trim().split('\n').map(line => JSON.parse(line));
            const k8sEntries = k8sLog.trim().split('\n').map(line => JSON.parse(line));
            expect(dockerEntries).toHaveLength(4);
            expect(k8sEntries).toHaveLength(4);
            const dockerAppResult = dockerEntries.find(e => e.operation === 'isDockerContainer-result' && e.details.name === 'docker-app');
            expect(dockerAppResult?.details.result).toBe(true);
            const regularAppResult = dockerEntries.find(e => e.operation === 'isDockerContainer-result' && e.details.name === 'regular-app');
            expect(regularAppResult?.details.result).toBe(false);
        });
        it('should handle concurrent detection operations using file locks', async () => {
            class ConcurrentResolver extends TargetResolver {
                constructor(config, lockDir) {
                    super(config);
                    this.lockDir = lockDir;
                }
                async acquireLock(name) {
                    const lockFile = path.join(this.lockDir, `${name}.lock`);
                    try {
                        await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
                        return true;
                    }
                    catch {
                        return false;
                    }
                }
                async releaseLock(name) {
                    const lockFile = path.join(this.lockDir, `${name}.lock`);
                    try {
                        await fs.unlink(lockFile);
                    }
                    catch {
                    }
                }
                async isDockerContainer(name) {
                    const lockName = `docker-${name}`;
                    const acquired = await this.acquireLock(lockName);
                    try {
                        await new Promise(resolve => setTimeout(resolve, 10));
                        return acquired && name.includes('container');
                    }
                    finally {
                        if (acquired) {
                            await this.releaseLock(lockName);
                        }
                    }
                }
            }
            const lockDir = path.join(tempDir, 'locks');
            await fs.mkdir(lockDir, { recursive: true });
            const resolver = new ConcurrentResolver(config, lockDir);
            const results = await Promise.all([
                resolver.isDockerContainer('test-container-1'),
                resolver.isDockerContainer('test-container-2'),
                resolver.isDockerContainer('test-app'),
                resolver.isDockerContainer('test-container-3')
            ]);
            expect(results[0]).toBe(true);
            expect(results[1]).toBe(true);
            expect(results[2]).toBe(false);
            expect(results[3]).toBe(true);
            const remainingFiles = await fs.readdir(lockDir);
            expect(remainingFiles).toHaveLength(0);
        });
    });
    describe('SSH Config File Tests', () => {
        it('should parse SSH config from a real file', async () => {
            const sshConfigContent = `
Host test-server
    HostName test.example.com
    User testuser
    Port 2222
    IdentityFile ~/.ssh/test_key

Host prod-*
    User deploy
    Port 22
    
Host prod-web
    HostName web.prod.example.com
    
Host prod-api
    HostName api.prod.example.com
`;
            const sshConfigPath = path.join(tempDir, 'ssh_config');
            await fs.writeFile(sshConfigPath, sshConfigContent);
            class TestSSHResolver extends TargetResolver {
                async getSSHHost(name) {
                    try {
                        const configContent = await fs.readFile(sshConfigPath, 'utf-8');
                        const lines = configContent.split('\n');
                        const hosts = {};
                        let currentHost = null;
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith('#'))
                                continue;
                            if (trimmed.startsWith('Host ')) {
                                currentHost = trimmed.substring(5).trim();
                                if (!hosts[currentHost]) {
                                    hosts[currentHost] = {};
                                }
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
                                const mappedKey = keyMap[key] || key.toLowerCase();
                                hosts[currentHost][mappedKey] = value;
                            }
                        }
                        const result = hosts[name] ? { ...hosts[name] } : {};
                        for (const [pattern, config] of Object.entries(hosts)) {
                            if (pattern.includes('*')) {
                                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                                if (regex.test(name)) {
                                    for (const [key, value] of Object.entries(config)) {
                                        if (!result[key]) {
                                            result[key] = value;
                                        }
                                    }
                                }
                            }
                        }
                        return Object.keys(result).length > 0 ? { type: 'ssh', ...result } : undefined;
                    }
                    catch {
                        return undefined;
                    }
                }
            }
            const resolver = new TestSSHResolver(config);
            const testServer = await resolver.getSSHHost('test-server');
            expect(testServer).toEqual({
                type: 'ssh',
                host: 'test.example.com',
                user: 'testuser',
                port: '2222',
                privateKey: '~/.ssh/test_key'
            });
            const prodWeb = await resolver.getSSHHost('prod-web');
            expect(prodWeb).toEqual({
                type: 'ssh',
                host: 'web.prod.example.com',
                user: 'deploy',
                port: '22'
            });
            const nonExistent = await resolver.getSSHHost('nonexistent');
            expect(nonExistent).toBeUndefined();
        });
    });
});
//# sourceMappingURL=target-resolver-integration.test.js.map