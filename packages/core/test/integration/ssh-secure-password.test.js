import { it, jest, expect } from '@jest/globals';
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/test-utils';
import { $ } from '../../src/index.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { SecurePasswordHandler } from '../../src/utils/secure-password.js';
describeSSH('SSH Secure Password Integration Tests', () => {
    describe('Secure Askpass Method', () => {
        testEachPackageManager('should execute sudo commands with secure-askpass method', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass'
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
        testEachPackageManager('should handle commands with special characters', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass'
                }
            });
            try {
                const result = await ssh.execute({
                    command: 'echo "Test $USER with special chars: $HOME"',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('Test');
                expect(result.stdout).toContain('with special chars:');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should work with custom SecurePasswordHandler', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const customHandler = new SecurePasswordHandler();
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass',
                    secureHandler: customHandler
                }
            });
            try {
                const result = await ssh.execute({
                    command: 'ls -la /root',
                    adapterOptions: {
                        type: 'ssh',
                        ...sshConfig
                    }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('total');
            }
            finally {
                await ssh.dispose();
                await customHandler.cleanup();
            }
        });
        testEachPackageManager('should execute multiple sudo commands', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass'
                }
            });
            try {
                const results = await Promise.all([
                    ssh.execute({
                        command: 'id',
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    }),
                    ssh.execute({
                        command: 'pwd',
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    }),
                    ssh.execute({
                        command: 'hostname',
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    })
                ]);
                results.forEach(result => {
                    expect(result.exitCode).toBe(0);
                    expect(result.stdout).toBeTruthy();
                });
                expect(results[0].stdout).toContain('uid=0(root)');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should clean up remote askpass scripts', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass'
                }
            });
            const $ssh = $.ssh(sshConfig);
            try {
                const beforeResult = await $ssh `ls -la /tmp | grep askpass- | wc -l`.nothrow();
                const beforeCount = parseInt(beforeResult.stdout.trim()) || 0;
                await ssh.execute({
                    command: 'echo test',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
                const afterResult = await $ssh `ls -la /tmp | grep askpass- | wc -l`.nothrow();
                const afterCount = parseInt(afterResult.stdout.trim()) || 0;
                expect(afterCount).toBeLessThanOrEqual(beforeCount);
            }
            finally {
                await ssh.dispose();
            }
        });
    });
    describe('Comparison of sudo methods', () => {
        testEachPackageManager('should work with stdin method', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'stdin'
                }
            });
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('root');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should work with echo method (not recommended)', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
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
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe('root');
                expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Using echo for sudo password is insecure'));
            }
            finally {
                await ssh.dispose();
                consoleWarnSpy.mockRestore();
            }
        });
    });
    describe('Error handling', () => {
        testEachPackageManager('should handle incorrect sudo password', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: 'wrongpassword',
                    method: 'secure-askpass'
                }
            });
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    nothrow: true,
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(result.exitCode).not.toBe(0);
                expect(result.stderr || result.stdout).toMatch(/incorrect password|authentication failure|Sorry/i);
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should handle non-sudo commands without sudo wrapping', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: false
                }
            });
            try {
                const result = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(sshConfig.username);
            }
            finally {
                await ssh.dispose();
            }
        });
    });
    describe('SSH Adapter with secure sudo', () => {
        testEachPackageManager('should execute sudo commands via SSHAdapter with secure-askpass', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass'
                }
            });
            try {
                const idResult = await ssh.execute({
                    command: 'id -u',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(idResult.exitCode).toBe(0);
                expect(idResult.stdout.trim()).toBe('0');
                const lsResult = await ssh.execute({
                    command: 'ls -la /root/.ssh',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(lsResult.exitCode).toBe(0);
                expect(lsResult.stdout).toContain('authorized_keys');
                const whoamiResult = await ssh.execute({
                    command: 'whoami',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(whoamiResult.exitCode).toBe(0);
                expect(whoamiResult.stdout.trim()).toBe('root');
            }
            finally {
                await ssh.dispose();
            }
        });
        testEachPackageManager('should combine $ helper for regular commands with SSHAdapter for sudo', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const sshWithSudo = new SSHAdapter({
                sudo: {
                    enabled: true,
                    password: sshConfig.password,
                    method: 'secure-askpass'
                }
            });
            try {
                const regularResult = await $ssh `whoami`;
                expect(regularResult.stdout.trim()).toBe(sshConfig.username);
                const sudoResult = await sshWithSudo.execute({
                    command: 'whoami',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(sudoResult.stdout.trim()).toBe('root');
                const [regular2, sudo2] = await Promise.all([
                    $ssh `echo "Regular user: $(whoami)"`,
                    sshWithSudo.execute({
                        command: 'echo "Sudo user: $(whoami)"',
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    })
                ]);
                expect(regular2.stdout).toContain(`Regular user: ${sshConfig.username}`);
                expect(sudo2.stdout).toContain('Sudo user: root');
            }
            finally {
                await sshWithSudo.dispose();
            }
        });
    });
    describe('Password security features', () => {
        it('should mask passwords in logs', () => {
            const command = 'echo mySecretPass123 | sudo -S ls';
            const masked = SecurePasswordHandler.maskPassword(command, 'mySecretPass123');
            expect(masked).toBe('echo ***MASKED*** | sudo -S ls');
            expect(masked).not.toContain('mySecretPass123');
        });
        it('should validate password strength', () => {
            const weakResult = SecurePasswordHandler.validatePassword('weak');
            expect(weakResult.isValid).toBe(false);
            expect(weakResult.issues).toContain('Password should be at least 8 characters long');
            const strongResult = SecurePasswordHandler.validatePassword('Str0ng!Pass123');
            expect(strongResult.isValid).toBe(true);
            expect(strongResult.issues).toHaveLength(0);
        });
        it('should generate secure passwords', () => {
            const password = SecurePasswordHandler.generatePassword(16);
            expect(password).toHaveLength(16);
            const validation = SecurePasswordHandler.validatePassword(password);
            expect(validation.isValid).toBe(true);
        });
    });
});
//# sourceMappingURL=ssh-secure-password.test.js.map