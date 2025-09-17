import { constants } from 'fs';
import { access, readFile } from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SecurePasswordHandler } from '../../../src/adapters/ssh/secure-password.js';

describe('SecurePasswordHandler - Comprehensive Coverage', () => {
  let handler: SecurePasswordHandler;

  beforeEach(() => {
    handler = new SecurePasswordHandler();
  });

  afterEach(async () => {
    await handler.dispose();
  });

  describe('Constructor and Basic Operations', () => {
    it('should create a new instance with encryption key', () => {
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(SecurePasswordHandler);
    });

    it('should implement Disposable interface', () => {
      expect(handler.dispose).toBeDefined();
      expect(typeof handler.dispose).toBe('function');
    });
  });

  describe('Password Storage and Retrieval', () => {
    it('should store and retrieve passwords', () => {
      const password = 'MySecretPassword123!';
      const id = 'test-id';
      
      handler.storePassword(id, password);
      const retrieved = handler.retrievePassword(id);
      
      expect(retrieved).toBe(password);
    });

    it('should return null for non-existent password', () => {
      const retrieved = handler.retrievePassword('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should store multiple passwords independently', () => {
      const passwords = [
        { id: 'pass1', value: 'Password1!' },
        { id: 'pass2', value: 'Password2@' },
        { id: 'pass3', value: 'Password3#' }
      ];
      
      passwords.forEach(p => handler.storePassword(p.id, p.value));
      
      passwords.forEach(p => {
        expect(handler.retrievePassword(p.id)).toBe(p.value);
      });
    });

    it('should handle special characters in passwords', () => {
      const specialPasswords = [
        "p@ss'word\"with`quotes",
        'password\\with\\backslashes',
        'password$with$variables',
        'password|with|pipes',
        'password&with&ampersands',
        'password;with;semicolons',
        'password\nwith\nnewlines',
        'password\twith\ttabs'
      ];
      
      specialPasswords.forEach((password, index) => {
        const id = `special-${index}`;
        handler.storePassword(id, password);
        expect(handler.retrievePassword(id)).toBe(password);
      });
    });

    it('should throw error when accessing after disposal', async () => {
      await handler.dispose();
      
      expect(() => handler.storePassword('id', 'pass')).toThrow('SecurePasswordHandler has been disposed');
      expect(() => handler.retrievePassword('id')).toThrow('SecurePasswordHandler has been disposed');
    });
  });

  describe('Askpass Script Creation', () => {
    it('should create askpass script with correct content', async () => {
      const password = 'TestPassword123!';
      const scriptPath = await handler.createAskPassScript(password);
      
      expect(scriptPath).toMatch(/askpass-[a-f0-9]+\.sh$/);
      
      // Verify file exists
      await expect(access(scriptPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Verify content
      const content = await readFile(scriptPath, 'utf8');
      expect(content).toContain('#!/bin/sh');
      expect(content).toContain(`echo '${password}'`);
      
      // Clean up
      await handler.cleanup();
    });

    it('should escape single quotes in password', async () => {
      const password = "Test'Password'With'Quotes";
      const scriptPath = await handler.createAskPassScript(password);
      
      const content = await readFile(scriptPath, 'utf8');
      expect(content).toContain("echo 'Test'\\''Password'\\''With'\\''Quotes'");
      
      await handler.cleanup();
    });

    it('should set correct permissions on script', async () => {
      const scriptPath = await handler.createAskPassScript('test');
      
      const { mode } = await import('fs').then(fs => 
        new Promise((resolve, reject) => 
          fs.stat(scriptPath, (err, stats) => err ? reject(err) : resolve(stats))
        )
      ) as any;
      
      // Check permissions are 0700 (owner read/write/execute only)
      expect(mode & 0o777).toBe(0o700);
      
      await handler.cleanup();
    });

    it('should track created scripts for cleanup', async () => {
      const scripts = await Promise.all([
        handler.createAskPassScript('pass1'),
        handler.createAskPassScript('pass2'),
        handler.createAskPassScript('pass3')
      ]);
      
      // All scripts should exist
      await Promise.all(scripts.map(script => 
        expect(access(script, constants.F_OK)).resolves.toBeUndefined()
      ));
      
      // After cleanup, all should be removed
      await handler.cleanup();
      
      await Promise.all(scripts.map(script => 
        expect(access(script, constants.F_OK)).rejects.toThrow()
      ));
    });

    it('should throw error after disposal', async () => {
      await handler.dispose();
      await expect(handler.createAskPassScript('test')).rejects.toThrow('SecurePasswordHandler has been disposed');
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up all temporary files', async () => {
      const scripts = await Promise.all([
        handler.createAskPassScript('pass1'),
        handler.createAskPassScript('pass2')
      ]);
      
      await handler.cleanup();
      
      // Files should be removed
      await Promise.all(scripts.map(script => 
        expect(access(script, constants.F_OK)).rejects.toThrow()
      ));
    });

    it('should clear password storage on cleanup', async () => {
      handler.storePassword('id1', 'pass1');
      handler.storePassword('id2', 'pass2');
      
      await handler.cleanup();
      
      // After cleanup, retrievePassword should still work but return null
      expect(handler.retrievePassword('id1')).toBeNull();
      expect(handler.retrievePassword('id2')).toBeNull();
    });

    it('should be idempotent', async () => {
      await handler.cleanup();
      await handler.cleanup(); // Should not throw
      expect(true).toBe(true);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Create a script
      const scriptPath = await handler.createAskPassScript('test');
      
      // Remove it manually to simulate error
      await import('fs/promises').then(fs => fs.unlink(scriptPath));
      
      // Cleanup should not throw
      await expect(handler.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Static Methods', () => {
    describe('maskPassword', () => {
      it('should mask password in command strings', () => {
        const command = 'echo myPassword123 | sudo -S ls';
        const masked = SecurePasswordHandler.maskPassword(command, 'myPassword123');
        
        expect(masked).toBe('echo ***MASKED*** | sudo -S ls');
        expect(masked).not.toContain('myPassword123');
      });

      it('should handle multiple occurrences', () => {
        const command = 'echo pass123 && echo pass123 | sudo -S pass123';
        const masked = SecurePasswordHandler.maskPassword(command, 'pass123');
        
        expect(masked).toBe('echo ***MASKED*** && echo ***MASKED*** | sudo -S ***MASKED***');
      });

      it('should handle special regex characters', () => {
        const command = 'echo p@ss.w*rd[123] | sudo';
        const masked = SecurePasswordHandler.maskPassword(command, 'p@ss.w*rd[123]');
        
        expect(masked).toBe('echo ***MASKED*** | sudo');
      });

      it('should return original command if no password provided', () => {
        const command = 'echo test';
        const masked = SecurePasswordHandler.maskPassword(command);
        
        expect(masked).toBe(command);
      });
    });

    describe('generatePassword', () => {
      it('should generate password of specified length', () => {
        const lengths = [8, 16, 32, 64];
        
        lengths.forEach(length => {
          const password = SecurePasswordHandler.generatePassword(length);
          expect(password).toHaveLength(length);
        });
      });

      it('should generate password with all required character types', () => {
        const password = SecurePasswordHandler.generatePassword(16);
        
        expect(password).toMatch(/[A-Z]/); // Uppercase
        expect(password).toMatch(/[a-z]/); // Lowercase
        expect(password).toMatch(/[0-9]/); // Numbers
        expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/); // Special chars
      });

      it('should generate different passwords each time', () => {
        const passwords = new Set();
        
        for (let i = 0; i < 100; i++) {
          passwords.add(SecurePasswordHandler.generatePassword(16));
        }
        
        expect(passwords.size).toBe(100);
      });

      it('should use default length of 32', () => {
        const password = SecurePasswordHandler.generatePassword();
        expect(password).toHaveLength(32);
      });
    });

    describe('validatePassword', () => {
      it('should validate strong passwords', () => {
        const strongPasswords = [
          'StrongP@ss123',
          'MySecure#Pass2023',
          'C0mpl3x!Password',
          'Test@123Password'
        ];
        
        strongPasswords.forEach(password => {
          const result = SecurePasswordHandler.validatePassword(password);
          expect(result.isValid).toBe(true);
          expect(result.issues).toHaveLength(0);
        });
      });

      it('should identify weak passwords', () => {
        const weakPasswords = [
          { password: 'short', issue: 'at least 8 characters' },
          { password: 'alllowercase123!', issue: 'uppercase letter' },
          { password: 'ALLUPPERCASE123!', issue: 'lowercase letter' },
          { password: 'NoNumbers!', issue: 'number' },
          { password: 'NoSpecialChars123', issue: 'special character' }
        ];
        
        weakPasswords.forEach(({ password, issue }) => {
          const result = SecurePasswordHandler.validatePassword(password);
          expect(result.isValid).toBe(false);
          expect(result.issues.some(i => i.includes(issue))).toBe(true);
        });
      });

      it('should report multiple issues', () => {
        const result = SecurePasswordHandler.validatePassword('abc');
        
        expect(result.isValid).toBe(false);
        expect(result.issues.length).toBeGreaterThan(1);
        expect(result.issues).toEqual(expect.arrayContaining([
          expect.stringContaining('8 characters'),
          expect.stringContaining('uppercase'),
          expect.stringContaining('number'),
          expect.stringContaining('special character')
        ]));
      });
    });

    describe('checkSecureMethodsAvailable', () => {
      it('should return availability status', async () => {
        const result = await SecurePasswordHandler.checkSecureMethodsAvailable();
        
        expect(result).toEqual({
          askpass: true,
          stdin: true,
          keyring: false
        });
      });
    });
  });

  describe('Security Features', () => {
    it('should use encryption for password storage', () => {
      const password = 'SensitivePassword123!';
      handler.storePassword('test', password);
      
      // The internal storage should be encrypted, not plain text
      // We can't directly test the encryption, but we can verify
      // that retrieval works correctly
      expect(handler.retrievePassword('test')).toBe(password);
    });

    it('should isolate passwords between instances', () => {
      const handler1 = new SecurePasswordHandler();
      const handler2 = new SecurePasswordHandler();
      
      handler1.storePassword('shared-id', 'password1');
      handler2.storePassword('shared-id', 'password2');
      
      expect(handler1.retrievePassword('shared-id')).toBe('password1');
      expect(handler2.retrievePassword('shared-id')).toBe('password2');
      
      handler1.dispose();
      handler2.dispose();
    });
  });

  describe('createSecureEnv', () => {
    it('should create environment with askpass and password', async () => {
      const password = 'TestPassword123';
      const askpassPath = await handler.createAskPassScript(password);
      
      const env = handler.createSecureEnv(askpassPath, { EXISTING: 'value' });
      
      expect(env['SUDO_ASKPASS']).toBe(askpassPath);
      expect(env['EXISTING']).toBe('value');
      expect(env['SUDO_LECTURE']).toBe('no');
      expect(env['SUDO_ASKPASS_REQUIRE']).toBe('1');
      
      // Should have password env var
      const scriptId = askpassPath.match(/askpass-([a-f0-9]+)\.sh$/)?.[1];
      expect(env[`SUDO_PASS_${scriptId}`]).toBe(password);
      
      await handler.cleanup();
    });

    it('should throw for invalid askpass path', () => {
      expect(() => handler.createSecureEnv('/tmp/invalid-path.sh')).toThrow('Invalid askpass script path');
    });

    it('should throw after disposal', async () => {
      await handler.dispose();
      expect(() => handler.createSecureEnv('/tmp/askpass-123abc.sh')).toThrow('SecurePasswordHandler has been disposed');
    });
  });
});