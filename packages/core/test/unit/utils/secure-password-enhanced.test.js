import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { SecurePasswordHandler } from '../../../src/utils/secure-password.js';
describe('SecurePasswordHandler Enhanced Security', () => {
    let tempDir;
    let handler;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'secure-pwd-test-'));
        handler = new SecurePasswordHandler();
    });
    afterEach(async () => {
        if (handler) {
            await handler.dispose();
        }
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    describe('Secure memory handling', () => {
        it('should store password in secure buffer', () => {
            const password = 'super-secret-password';
            const id = 'test-id';
            handler.storePassword(id, password);
            const retrieved = handler.retrievePassword(id);
            expect(retrieved).toBe(password);
        });
        it('should clear password from memory on dispose', async () => {
            const password = 'test-password-123';
            const id = 'test-id';
            handler.storePassword(id, password);
            await handler.dispose();
            expect(() => handler.storePassword('new-id', 'new-password')).toThrow('SecurePasswordHandler has been disposed');
        });
        it('should handle multiple passwords securely', () => {
            const passwords = {
                'id1': 'password1',
                'id2': 'password2',
                'id3': 'password3'
            };
            Object.entries(passwords).forEach(([id, pwd]) => {
                handler.storePassword(id, pwd);
            });
            Object.entries(passwords).forEach(([id, pwd]) => {
                expect(handler.retrievePassword(id)).toBe(pwd);
            });
        });
    });
    describe('Password masking', () => {
        it('should mask passwords in command strings', () => {
            const password = 'my-secret-password';
            const command = `echo ${password} | sudo -S apt-get update`;
            const masked = SecurePasswordHandler.maskPassword(command, password);
            expect(masked).not.toContain(password);
            expect(masked).toContain('***MASKED***');
            expect(masked).toBe('echo ***MASKED*** | sudo -S apt-get update');
        });
        it('should mask multiple occurrences of password', () => {
            const password = 'secret123';
            const command = `mysql -u root -p${password} -e "CREATE USER 'app'@'localhost' IDENTIFIED BY '${password}';"`;
            const masked = SecurePasswordHandler.maskPassword(command, password);
            expect(masked).not.toContain(password);
            expect(masked.match(/\*\*\*MASKED\*\*\*/g)).toHaveLength(2);
        });
        it('should mask passwords with special regex characters', () => {
            const password = 'p@$$w0rd.with[special]chars*';
            const command = `echo "${password}" | login`;
            const masked = SecurePasswordHandler.maskPassword(command, password);
            expect(masked).not.toContain(password);
            expect(masked).toContain('***MASKED***');
        });
        it('should handle empty passwords', () => {
            const command = 'echo test';
            const masked = SecurePasswordHandler.maskPassword(command);
            expect(masked).toBe(command);
        });
        it('should mask passwords in multiline commands', () => {
            const password = 'multiline-secret';
            const command = `
        export DB_PASS=${password}
        mysql -p${password} << EOF
        SELECT * FROM users WHERE password='${password}';
        EOF
      `;
            const masked = SecurePasswordHandler.maskPassword(command, password);
            expect(masked).not.toContain(password);
            expect(masked.match(/\*\*\*MASKED\*\*\*/g)).toHaveLength(3);
        });
    });
    describe('Askpass script generation', () => {
        it('should create askpass script with secure permissions', async () => {
            const password = 'sudo-password';
            const scriptPath = await handler.createAskPassScript(password);
            expect(scriptPath).toMatch(/askpass-[a-f0-9]+\.sh$/);
            const stats = await fs.stat(scriptPath);
            expect(stats.mode & 0o777).toBe(0o700);
        });
        it('should store password securely for askpass script', async () => {
            const password = 'test-password';
            const scriptPath = await handler.createAskPassScript(password);
            const match = scriptPath.match(/askpass-([a-f0-9]+)\.sh$/);
            expect(match).toBeTruthy();
            const scriptId = match?.[1];
            expect(scriptId).toBeDefined();
            const retrieved = handler.retrievePassword(scriptId);
            expect(retrieved).toBe(password);
        });
        it('should create executable askpass script', async () => {
            const scriptPath = await handler.createAskPassScript('test');
            const stats = await fs.stat(scriptPath);
            expect(stats.mode & 0o100).toBe(0o100);
        });
        it('should handle askpass script cleanup', async () => {
            const scriptPath = await handler.createAskPassScript('test');
            await expect(fs.access(scriptPath)).resolves.toBeUndefined();
            await handler.cleanup();
            await expect(fs.access(scriptPath)).rejects.toThrow();
        });
    });
    describe('Environment configuration for sudo', () => {
        it('should create secure environment for askpass', async () => {
            const password = 'sudo-password';
            const scriptPath = await handler.createAskPassScript(password);
            const baseEnv = { PATH: '/usr/bin:/bin' };
            const env = handler.createSecureEnv(scriptPath, baseEnv);
            expect(env['SUDO_ASKPASS']).toBe(scriptPath);
            expect(env['PATH']).toBe(baseEnv['PATH']);
            const scriptIdMatch = scriptPath.match(/askpass-([a-f0-9]+)\.sh$/);
            expect(scriptIdMatch).toBeTruthy();
            const scriptId = scriptIdMatch[1];
            expect(env[`SUDO_PASS_${scriptId}`]).toBe(password);
        });
        it('should handle invalid askpass path', () => {
            const invalidPath = '/tmp/invalid-askpass.sh';
            expect(() => handler.createSecureEnv(invalidPath))
                .toThrow('Invalid askpass script path');
        });
        it('should handle missing script ID in path', () => {
            const invalidPath = '/tmp/askpass-.sh';
            expect(() => handler.createSecureEnv(invalidPath))
                .toThrow('Invalid askpass script path');
        });
        it('should handle missing password for askpass script', async () => {
            const scriptPath = await handler.createAskPassScript('test');
            await handler.cleanup();
            handler = new SecurePasswordHandler();
            expect(() => handler.createSecureEnv(scriptPath))
                .toThrow('Password not found for askpass script');
        });
        it('should throw when creating secure env after dispose', async () => {
            const scriptPath = await handler.createAskPassScript('test');
            await handler.dispose();
            expect(() => handler.createSecureEnv(scriptPath))
                .toThrow('SecurePasswordHandler has been disposed');
        });
    });
    describe('Password generation', () => {
        it('should generate secure passwords', () => {
            const password = SecurePasswordHandler.generatePassword(16);
            expect(password).toHaveLength(16);
            expect(password).toMatch(/[A-Z]/);
            expect(password).toMatch(/[a-z]/);
            expect(password).toMatch(/[0-9]/);
            expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
        });
        it('should generate passwords of requested length', () => {
            const lengths = [8, 12, 16, 24, 32];
            lengths.forEach(length => {
                const password = SecurePasswordHandler.generatePassword(length);
                expect(password).toHaveLength(length);
            });
        });
        it('should generate unique passwords', () => {
            const passwords = new Set();
            for (let i = 0; i < 100; i++) {
                passwords.add(SecurePasswordHandler.generatePassword(16));
            }
            expect(passwords.size).toBe(100);
        });
        it('should use crypto.randomBytes for generation', () => {
            const password = SecurePasswordHandler.generatePassword(16);
            const password2 = SecurePasswordHandler.generatePassword(16);
            expect(password).not.toBe(password2);
        });
    });
    describe('Password strength validation', () => {
        it('should validate strong passwords', () => {
            const strongPasswords = [
                'P@ssw0rd123!',
                'MyStr0ng!Pass#2023',
                'C0mpl3x&P@ssw0rd'
            ];
            strongPasswords.forEach(pwd => {
                const result = SecurePasswordHandler.validatePassword(pwd);
                expect(result.isValid).toBe(true);
                expect(result.issues).toHaveLength(0);
            });
        });
        it('should reject weak passwords', () => {
            const weakPasswords = [
                'password',
                '12345678',
                'abc123',
                'qwerty'
            ];
            weakPasswords.forEach(pwd => {
                const result = SecurePasswordHandler.validatePassword(pwd);
                expect(result.isValid).toBe(false);
                expect(result.issues.length).toBeGreaterThan(0);
            });
        });
        it('should provide feedback for password improvement', () => {
            const result = SecurePasswordHandler.validatePassword('password');
            expect(result.issues).toBeDefined();
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues.some(i => i.includes('uppercase'))).toBe(true);
            expect(result.issues.some(i => i.includes('number'))).toBe(true);
        });
        it('should check minimum length', () => {
            const result = SecurePasswordHandler.validatePassword('P@s1');
            expect(result.isValid).toBe(false);
            expect(result.issues.some(i => i.includes('at least 8 characters'))).toBe(true);
        });
    });
    describe('Secure methods availability', () => {
        it('should check available secure methods', async () => {
            const methods = await SecurePasswordHandler.checkSecureMethodsAvailable();
            expect(methods).toEqual({
                askpass: true,
                stdin: true,
                keyring: false
            });
        });
    });
    describe('Edge cases and error handling', () => {
        it('should handle disposed handler gracefully', async () => {
            await handler.dispose();
            expect(() => handler.storePassword('id', 'pwd')).toThrow('disposed');
            expect(() => handler.retrievePassword('id')).toThrow('disposed');
            await expect(handler.createAskPassScript('pwd')).rejects.toThrow('disposed');
        });
        it('should prevent double disposal', async () => {
            await handler.dispose();
            await expect(handler.dispose()).resolves.toBeUndefined();
        });
        it('should handle concurrent operations safely', () => {
            const operations = Array.from({ length: 10 }, (_, i) => {
                handler.storePassword(`id${i}`, `password${i}`);
                return handler.retrievePassword(`id${i}`);
            });
            operations.forEach((retrieved, i) => {
                expect(retrieved).toBe(`password${i}`);
            });
        });
        it('should return null for non-existent password', () => {
            const result = handler.retrievePassword('non-existent');
            expect(result).toBeNull();
        });
    });
});
//# sourceMappingURL=secure-password-enhanced.test.js.map