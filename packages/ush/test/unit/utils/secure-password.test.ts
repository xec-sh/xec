import { tmpdir } from 'node:os';
import { access, unlink } from 'node:fs/promises';
import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SecurePasswordHandler } from '../../../src/utils/secure-password.js';

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
    await handler.cleanup();
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
  });
  
  describe('createSecureEnv', () => {
    test('should create environment with askpass path', () => {
      const env = handler.createSecureEnv('/path/to/askpass');
      
      expect(env).toEqual({
        SUDO_ASKPASS: '/path/to/askpass',
        SUDO_LECTURE: 'no',
        SUDO_ASKPASS_REQUIRE: '1'
      });
    });
    
    test('should merge with base environment', () => {
      const baseEnv = { FOO: 'bar', PATH: '/usr/bin' };
      const env = handler.createSecureEnv('/path/to/askpass', baseEnv);
      
      expect(env).toEqual({
        FOO: 'bar',
        PATH: '/usr/bin',
        SUDO_ASKPASS: '/path/to/askpass',
        SUDO_LECTURE: 'no',
        SUDO_ASKPASS_REQUIRE: '1'
      });
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
  });
});