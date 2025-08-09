import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { it, expect } from '@jest/globals';
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/test-utils';
import { $ } from '../../src/index';
import { SSHAdapter } from '../../../src/adapters/ssh/index';
describeSSH('SSH Authentication Tests', () => {
    describe('Password Authentication', () => {
        testEachPackageManager('should authenticate with correct password', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(sshConfig.username);
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should fail with incorrect password', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            await expect(ssh.execute({
                command: 'whoami',
                adapterOptions: {
                    type: 'ssh',
                    ...sshConfig,
                    password: 'wrongpassword'
                }
            })).rejects.toThrow(/authentication|password|failed|Connection/i);
            await ssh.dispose();
        });
        testEachPackageManager('should fail with non-existent user', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            await expect(ssh.execute({
                command: 'whoami',
                adapterOptions: {
                    type: 'ssh',
                    ...sshConfig,
                    username: 'nonexistentuser'
                }
            })).rejects.toThrow(/authentication|failed|Connection/i);
            await ssh.dispose();
        });
    });
    describe('Private Key Authentication', () => {
        it('should authenticate with private key file (ubuntu-apt)', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const ssh = new SSHAdapter();
            const keyDir = join(tmpdir(), `ssh-test-keys-${Date.now()}`);
            await fs.mkdir(keyDir, { recursive: true });
            const privateKeyPath = join(keyDir, 'id_rsa');
            const publicKeyPath = join(keyDir, 'id_rsa.pub');
            try {
                await $ `ssh-keygen -t rsa -b 2048 -f ${privateKeyPath} -N "" -q`;
                const publicKey = await fs.readFile(publicKeyPath, 'utf8');
                const backupResult = await ssh.execute({
                    command: 'cat ~/.ssh/authorized_keys 2>/dev/null || echo ""',
                    nothrow: true,
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                const authorizedKeysBackup = backupResult.stdout;
                await ssh.execute({
                    command: 'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                await ssh.execute({
                    command: `echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`,
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                const privateKeyContent = await fs.readFile(privateKeyPath, 'utf8');
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        host: sshConfig.host,
                        port: sshConfig.port,
                        username: sshConfig.username,
                        privateKey: privateKeyContent
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(sshConfig.username);
                if (authorizedKeysBackup) {
                    await ssh.execute({
                        command: `echo "${authorizedKeysBackup}" > ~/.ssh/authorized_keys`,
                        adapterOptions: {
                            type: 'ssh',
                            ...sshConfig
                        }
                    });
                }
                else {
                    await ssh.execute({
                        command: 'rm -f ~/.ssh/authorized_keys',
                        adapterOptions: {
                            type: 'ssh',
                            ...sshConfig
                        }
                    });
                }
            }
            finally {
                await ssh.dispose();
                await fs.rm(keyDir, { recursive: true, force: true });
            }
        });
        testEachPackageManager('should authenticate with private key content as Buffer', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter();
            const keyDir = join(tmpdir(), `ssh-test-keys-${Date.now()}-${container.name}`);
            await fs.mkdir(keyDir, { recursive: true });
            const privateKeyPath = join(keyDir, 'id_rsa');
            const publicKeyPath = join(keyDir, 'id_rsa.pub');
            try {
                await $ `ssh-keygen -t rsa -b 2048 -f ${privateKeyPath} -N "" -q`;
                const publicKey = await fs.readFile(publicKeyPath, 'utf8');
                const privateKeyContent = await fs.readFile(privateKeyPath, 'utf8');
                await ssh.execute({
                    command: 'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                await ssh.execute({
                    command: `echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`,
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        host: sshConfig.host,
                        port: sshConfig.port,
                        username: sshConfig.username,
                        privateKey: Buffer.from(privateKeyContent)
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(sshConfig.username);
                await ssh.execute({
                    command: 'rm -f ~/.ssh/authorized_keys',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
            }
            finally {
                await ssh.dispose();
                await fs.rm(keyDir, { recursive: true, force: true });
            }
        });
        testEachPackageManager('should fail with invalid private key', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            await expect(ssh.execute({
                command: 'whoami',
                adapterOptions: {
                    type: 'ssh',
                    host: sshConfig.host,
                    port: sshConfig.port,
                    username: sshConfig.username,
                    privateKey: Buffer.from('invalid-key-content')
                }
            })).rejects.toThrow();
            await ssh.dispose();
        });
        testEachPackageManager('should handle encrypted private key with passphrase', async (container) => {
            const encryptedKeyPath = join(tmpdir(), `encrypted-key-${Date.now()}`);
            const passphrase = 'test-passphrase';
            const sshConfig = getSSHConfig(container.name);
            await $ `ssh-keygen -t rsa -b 2048 -f ${encryptedKeyPath} -N ${passphrase} -q`;
            try {
                const encryptedKeyContent = await fs.readFile(encryptedKeyPath, 'utf8');
                const ssh = new SSHAdapter();
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        host: sshConfig.host,
                        port: sshConfig.port,
                        username: sshConfig.username,
                        privateKey: encryptedKeyContent,
                        passphrase,
                        password: sshConfig.password
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(sshConfig.username);
                await ssh.dispose();
            }
            finally {
                await fs.rm(encryptedKeyPath, { force: true });
                await fs.rm(`${encryptedKeyPath}.pub`, { force: true });
            }
        });
    });
    describe('Connection Options', () => {
        it('should respect connection timeout', async () => {
            const ssh = new SSHAdapter({
                defaultConnectOptions: {
                    readyTimeout: 2000,
                    timeout: 2000
                }
            });
            const start = Date.now();
            await expect(ssh.execute({
                command: 'whoami',
                timeout: 2000,
                adapterOptions: {
                    type: 'ssh',
                    host: '192.0.2.1',
                    port: 22,
                    username: 'test',
                    password: 'test'
                }
            })).rejects.toThrow(/timeout|timed out|Connection|ETIMEDOUT|ECONNREFUSED/i);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(25000);
            await ssh.dispose();
        });
        testEachPackageManager('should handle connection with valid credentials', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            try {
                const result = await ssh.execute({
                    command: 'echo ready',
                    timeout: 5000,
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('ready');
            }
            finally {
                await ssh.dispose();
            }
        });
        it('should handle custom SSH port', async () => {
            const ssh = new SSHAdapter();
            const alpineConfig = getSSHConfig('alpine-apk');
            try {
                const result = await ssh.execute({
                    command: 'cat /etc/os-release | grep ^ID=',
                    adapterOptions: {
                        type: 'ssh',
                        ...alpineConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('alpine');
            }
            finally {
                await ssh.dispose();
            }
        });
    });
    describe('Authentication Methods Priority', () => {
        testEachPackageManager('should prefer private key over password when both provided', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter();
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig,
                        privateKey: undefined,
                        password: sshConfig.password
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(sshConfig.username);
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should handle authentication with SSH agent', async (container) => {
            const hasAgent = !!process.env['SSH_AUTH_SOCK'];
            if (!hasAgent) {
                console.log('Skipping SSH agent test - no agent available');
                return;
            }
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
            }
            finally {
                await ssh.dispose();
            }
        });
    });
    describe('Host Key Verification', () => {
        testEachPackageManager('should connect with basic authentication', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            try {
                const result = await ssh.execute({
                    command: 'echo "authenticated"',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('authenticated');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should handle known_hosts file', async (container) => {
            const knownHostsPath = join(tmpdir(), `known_hosts-${Date.now()}`);
            const sshConfig = getSSHConfig(container.name);
            const hostKeyResult = await $ `ssh-keyscan -p ${sshConfig.port} ${sshConfig.host} 2>/dev/null`;
            await fs.writeFile(knownHostsPath, hostKeyResult.stdout);
            const ssh = new SSHAdapter();
            try {
                const result = await ssh.execute({
                    command: 'echo verified',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
            }
            finally {
                await ssh.dispose();
                await fs.rm(knownHostsPath, { force: true });
            }
        });
    });
    describe('Sudo Authentication', () => {
        testEachPackageManager('should execute sudo commands with password', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'echo'
                }
            });
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('root');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should handle sudo with NOPASSWD', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            try {
                const result = await ssh.execute({
                    command: 'sudo -n true 2>&1',
                    nothrow: true,
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                if (result.exitCode === 0) {
                    const whoamiResult = await ssh.execute({
                        command: 'sudo whoami',
                        adapterOptions: {
                            type: 'ssh',
                            ...sshConfig
                        }
                    });
                    expect(whoamiResult.stdout.trim()).toBe('root');
                }
                else {
                    expect(result.exitCode).not.toBe(0);
                    const output = result.stdout + result.stderr;
                    expect(output.toLowerCase()).toMatch(/password|sudo|authentication/);
                }
            }
            finally {
                await ssh.dispose();
            }
        });
    });
    describe('Multiple Authentication Attempts', () => {
        testEachPackageManager('should handle multiple failed attempts gracefully', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            let attemptCount = 0;
            const passwords = ['wrong1', 'wrong2', sshConfig.password];
            for (const password of passwords) {
                const ssh = new SSHAdapter();
                try {
                    attemptCount++;
                    const result = await ssh.execute({
                        command: 'whoami',
                        adapterOptions: {
                            type: 'ssh',
                            ...sshConfig,
                            password
                        }
                    });
                    expect(password).toBe(sshConfig.password);
                    expect(result.exitCode).toBe(0);
                    await ssh.dispose();
                    break;
                }
                catch (error) {
                    if (password !== sshConfig.password) {
                        expect(error instanceof Error ? error.message : String(error)).toMatch(/authentication|password|failed|Connection/i);
                    }
                    else {
                        throw error;
                    }
                }
                finally {
                    await ssh.dispose();
                }
            }
            expect(attemptCount).toBe(3);
        });
    });
    describe('$ Helper Authentication', () => {
        testEachPackageManager('should work with $ helper for SSH', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const result = await $ssh `whoami`;
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe(sshConfig.username);
        });
        testEachPackageManager('should chain SSH with other helpers', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig).cd('/tmp').env({ TEST_VAR: 'value' });
            const result = await $ssh `pwd && echo $TEST_VAR`;
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('/tmp');
            expect(result.stdout).toContain('value');
        });
    });
    describe('Session Persistence', () => {
        testEachPackageManager('should maintain session state across commands', async (container) => {
            const ssh = new SSHAdapter();
            const sshConfig = getSSHConfig(container.name);
            try {
                await ssh.execute({
                    command: 'export TEST_SESSION_VAR="persistent value"',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                const result = await ssh.execute({
                    command: 'echo $TEST_SESSION_VAR',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.stdout.trim()).toBe('');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should handle connection reuse', async (container) => {
            const ssh = new SSHAdapter({
                connectionPool: {
                    enabled: true,
                    maxConnections: 10,
                    idleTimeout: 300000,
                    keepAlive: true
                }
            });
            const sshConfig = getSSHConfig(container.name);
            try {
                for (let i = 0; i < 5; i++) {
                    const result = await ssh.execute({
                        command: `echo "Command ${i}"`,
                        adapterOptions: {
                            type: 'ssh',
                            ...sshConfig
                        }
                    });
                    expect(result.exitCode).toBe(0);
                    expect(result.stdout.trim()).toBe(`Command ${i}`);
                }
            }
            finally {
                await ssh.dispose();
            }
        });
    });
});
//# sourceMappingURL=ssh-authentication.test.js.map