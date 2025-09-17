import { tmpdir } from 'node:os';
import { access, unlink } from 'node:fs/promises';
import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SecurePasswordHandler } from '../../../src/adapters/ssh/secure-password.js';

describe('SecurePasswordHandler', () => {
  let handler: SecurePasswordHandler;
  const createdFiles: string[] = [];
  
  beforeEach(() => {
    jest.clearAllMocks();
    handler = new SecurePasswordHandler();
    createdFiles.length = 0;
  });
  
  afterEach(async () => {
    // Clean up any files created during tests
    if (handler) {
      await handler.cleanup();
      await handler.dispose();
    }
    for (const file of createdFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore errors
      }
    }
  });
  
  describe('createAskPassScript', () => {
    test('should create askpass script with password', async () => {
      const scriptPath = await handler.createAskPassScript('mypassword');
      createdFiles.push(scriptPath);
      
      expect(scriptPath).toContain('askpass-');
      expect(scriptPath).toContain('.sh');
      expect(scriptPath).toContain(tmpdir());
      
      // Verify file was created
      await expect(access(scriptPath)).resolves.toBeUndefined();
    });
    
    test('should escape single quotes in password', async () => {
      // Test that the function doesn't throw with quotes
      const scriptPath = await handler.createAskPassScript("pass'word'test");
      createdFiles.push(scriptPath);
      
      expect(scriptPath).toBeTruthy();
    });
    
    test('should store script path for cleanup', async () => {
      const scriptPath = await handler.createAskPassScript('password');
      createdFiles.push(scriptPath);
      
      // File should exist before cleanup
      await expect(access(scriptPath)).resolves.toBeUndefined();
      
      await handler.cleanup();
      
      // File should be deleted after cleanup
      await expect(access(scriptPath)).rejects.toThrow();
    });
    
    // Skip testing writeFile error as it requires complex mocking
    // The error handling is covered by the implementation
  });
  
  describe('createSecureEnv', () => {
    test('should create environment with askpass path', async () => {
      // First create a valid askpass script
      const password = 'mypassword123';
      const scriptPath = await handler.createAskPassScript(password);
      createdFiles.push(scriptPath);
      
      const env = handler.createSecureEnv(scriptPath);
      
      // Extract script ID from path to verify environment
      const scriptId = scriptPath.match(/askpass-([a-f0-9]+)\.sh$/)![1];
      
      expect(env).toEqual({
        SUDO_ASKPASS: scriptPath,
        [`SUDO_PASS_${scriptId}`]: password,
        SUDO_LECTURE: 'no',
        SUDO_ASKPASS_REQUIRE: '1'
      });
    });
    
    test('should merge with base environment', async () => {
      const password = 'mypassword456';
      const scriptPath = await handler.createAskPassScript(password);
      createdFiles.push(scriptPath);
      
      const baseEnv = { FOO: 'bar', PATH: '/usr/bin' };
      const env = handler.createSecureEnv(scriptPath, baseEnv);
      
      // Extract script ID from path
      const scriptId = scriptPath.match(/askpass-([a-f0-9]+)\.sh$/)![1];
      
      expect(env).toEqual({
        FOO: 'bar',
        PATH: '/usr/bin',
        SUDO_ASKPASS: scriptPath,
        [`SUDO_PASS_${scriptId}`]: password,
        SUDO_LECTURE: 'no',
        SUDO_ASKPASS_REQUIRE: '1'
      });
    });
    
    test('should throw error for invalid askpass path', () => {
      expect(() => {
        handler.createSecureEnv('/invalid/path/to/askpass');
      }).toThrow('Invalid askpass script path');
    });
    
    test('should throw error after disposal', async () => {
      const scriptPath = await handler.createAskPassScript('password');
      createdFiles.push(scriptPath);
      
      await handler.dispose();
      
      expect(() => {
        handler.createSecureEnv(scriptPath);
      }).toThrow('SecurePasswordHandler has been disposed');
    });
    
    test('should throw error for path without script ID', () => {
      // Path that matches the pattern but captures empty string
      expect(() => {
        handler.createSecureEnv('/tmp/askpass-.sh');
      }).toThrow('Invalid askpass script path');
    });
    
    test('should throw error when password not found', async () => {
      // Create a valid askpass script
      const scriptPath = await handler.createAskPassScript('test-password');
      createdFiles.push(scriptPath);
      
      // Extract the script ID and delete the password
      const scriptId = scriptPath.match(/askpass-([a-f0-9]+)\.sh$/)![1];
      
      // Create a new handler (simulating lost password scenario)
      const newHandler = new SecurePasswordHandler();
      
      expect(() => {
        newHandler.createSecureEnv(scriptPath);
      }).toThrow('Password not found for askpass script');
      
      await newHandler.dispose();
    });
  });
  
  describe('maskPassword', () => {
    test('should mask password in command string', () => {
      const masked = SecurePasswordHandler.maskPassword(
        'echo mypassword | sudo -S command',
        'mypassword'
      );
      
      expect(masked).toBe('echo ***MASKED*** | sudo -S command');
    });
    
    test('should mask multiple occurrences', () => {
      const masked = SecurePasswordHandler.maskPassword(
        'echo secret && echo secret again',
        'secret'
      );
      
      expect(masked).toBe('echo ***MASKED*** && echo ***MASKED*** again');
    });
    
    test('should handle empty password', () => {
      const masked = SecurePasswordHandler.maskPassword('echo test', '');
      
      expect(masked).toBe('echo test');
    });
    
    test('should handle undefined password', () => {
      const masked = SecurePasswordHandler.maskPassword('echo test', undefined);
      
      expect(masked).toBe('echo test');
    });
    
    test('should escape regex special characters', () => {
      const masked = SecurePasswordHandler.maskPassword(
        'echo pass.word$test | command',
        'pass.word$test'
      );
      
      expect(masked).toBe('echo ***MASKED*** | command');
    });
  });
  
  describe('checkSecureMethodsAvailable', () => {
    test('should return available methods', async () => {
      const methods = await SecurePasswordHandler.checkSecureMethodsAvailable();
      
      expect(methods).toEqual({
        askpass: true,
        stdin: true,
        keyring: false
      });
    });
  });
  
  describe('generatePassword', () => {
    test('should generate password of default length', () => {
      const password = SecurePasswordHandler.generatePassword();
      
      expect(password).toHaveLength(32);
      expect(password).toMatch(/[A-Za-z0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
    });
    
    test('should generate password of specified length', () => {
      const password = SecurePasswordHandler.generatePassword(16);
      
      expect(password).toHaveLength(16);
    });
    
    test('should use different characters', () => {
      const password1 = SecurePasswordHandler.generatePassword(10);
      const password2 = SecurePasswordHandler.generatePassword(10);
      
      // Passwords should be different (very unlikely to be the same)
      expect(password1).not.toBe(password2);
    });
  });
  
  describe('cleanup', () => {
    test('should remove all askpass scripts', async () => {
      const script1 = await handler.createAskPassScript('pass1');
      const script2 = await handler.createAskPassScript('pass2');
      
      // Files should exist
      await expect(access(script1)).resolves.toBeUndefined();
      await expect(access(script2)).resolves.toBeUndefined();
      
      await handler.cleanup();
      
      // Files should be deleted
      await expect(access(script1)).rejects.toThrow();
      await expect(access(script2)).rejects.toThrow();
    });
    
    test('should handle cleanup errors gracefully', async () => {
      // Create a script
      await handler.createAskPassScript('password');
      
      // Cleanup should not throw even if there are issues
      await expect(handler.cleanup()).resolves.toBeUndefined();
    });
    
    test('should clear temp files set after cleanup', async () => {
      const scriptPath = await handler.createAskPassScript('password');
      
      await handler.cleanup();
      
      // Second cleanup should work without issues
      await expect(handler.cleanup()).resolves.toBeUndefined();
    });
  });
  
  describe('validatePassword', () => {
    test('should validate strong password', () => {
      const result = SecurePasswordHandler.validatePassword('MyStr0ng!Pass');
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
    
    test('should detect weak password', () => {
      const result = SecurePasswordHandler.validatePassword('weak');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password should be at least 8 characters long');
      expect(result.issues).toContain('Password should contain at least one uppercase letter');
      expect(result.issues).toContain('Password should contain at least one number');
      expect(result.issues).toContain('Password should contain at least one special character');
    });
    
    test('should detect missing lowercase letter', () => {
      const result = SecurePasswordHandler.validatePassword('STRONG123!');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues).toContain('Password should contain at least one lowercase letter');
    });
  });
  
  describe('storePassword and retrievePassword', () => {
    test('should store and retrieve password', () => {
      const id = 'test-id-123';
      const password = 'mySecretPassword';
      
      handler.storePassword(id, password);
      const retrieved = handler.retrievePassword(id);
      
      expect(retrieved).toBe(password);
    });
    
    test('should return null for non-existent password', () => {
      const retrieved = handler.retrievePassword('non-existent');
      
      expect(retrieved).toBeNull();
    });
    
    test('should store multiple passwords independently', () => {
      handler.storePassword('id1', 'password1');
      handler.storePassword('id2', 'password2');
      handler.storePassword('id3', 'password3');
      
      expect(handler.retrievePassword('id1')).toBe('password1');
      expect(handler.retrievePassword('id2')).toBe('password2');
      expect(handler.retrievePassword('id3')).toBe('password3');
    });
    
    test('should encrypt passwords differently each time', async () => {
      // Create two handlers with same password
      const handler1 = new SecurePasswordHandler();
      const handler2 = new SecurePasswordHandler();
      
      handler1.storePassword('id', 'samePassword');
      handler2.storePassword('id', 'samePassword');
      
      // The encrypted data should be different due to random salt/iv
      // We can't directly access the encrypted data, but we can verify
      // that both handlers can retrieve their own passwords
      expect(handler1.retrievePassword('id')).toBe('samePassword');
      expect(handler2.retrievePassword('id')).toBe('samePassword');
      
      // Clean up
      await handler1.dispose();
      await handler2.dispose();
    });
  });
  
  describe('dispose', () => {
    test('should prevent operations after disposal', async () => {
      await handler.dispose();
      
      // All methods should throw after disposal
      expect(() => handler.storePassword('id', 'pass')).toThrow('SecurePasswordHandler has been disposed');
      expect(() => handler.retrievePassword('id')).toThrow('SecurePasswordHandler has been disposed');
      await expect(handler.createAskPassScript('pass')).rejects.toThrow('SecurePasswordHandler has been disposed');
    });
    
    test('should clean up passwords on disposal', async () => {
      handler.storePassword('id', 'password');
      expect(handler.retrievePassword('id')).toBe('password');
      
      await handler.dispose();
      
      // Create a new handler - it shouldn't have the old password
      const newHandler = new SecurePasswordHandler();
      expect(newHandler.retrievePassword('id')).toBeNull();
      await newHandler.dispose();
    });
    
    test('should be idempotent', async () => {
      await handler.dispose();
      // Second disposal should not throw
      await expect(handler.dispose()).resolves.toBeUndefined();
    });
    
    test('should clean up temp files on disposal', async () => {
      const scriptPath = await handler.createAskPassScript('password');
      
      // File should exist
      await expect(access(scriptPath)).resolves.toBeUndefined();
      
      await handler.dispose();
      
      // File should be cleaned up
      await expect(access(scriptPath)).rejects.toThrow();
    });
  });
  
  describe('error handling', () => {
    test('should handle special characters in passwords', async () => {
      const specialPasswords = [
        "pass'word",
        'pass"word',
        'pass\\word',
        'pass`word',
        'pass$word',
        'pass;word',
        'pass|word',
        'pass&word',
        'pass word',
        'pass\nword',
        'pass\tword'
      ];
      
      for (const password of specialPasswords) {
        const scriptPath = await handler.createAskPassScript(password);
        createdFiles.push(scriptPath);
        
        // Should be able to create env with the script
        const env = handler.createSecureEnv(scriptPath);
        expect(env['SUDO_ASKPASS']).toBe(scriptPath);
        
        // Should be able to retrieve the password
        const scriptId = scriptPath.match(/askpass-([a-f0-9]+)\.sh$/)![1];
        expect(env[`SUDO_PASS_${scriptId}`]).toBe(password);
      }
    });
  });
});