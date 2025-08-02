import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SecretManager } from '../../src/secrets/manager.js';
import { SecretError, SecretProvider } from '../../src/secrets/types.js';

// Mock provider for testing
class MockProvider implements SecretProvider {
  private secrets = new Map<string, string>();
  initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async get(key: string): Promise<string | null> {
    return this.secrets.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.secrets.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }

  async has(key: string): Promise<boolean> {
    return this.secrets.has(key);
  }
}

describe('SecretManager', () => {
  let manager: SecretManager;
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider();
  });

  describe('initialization', () => {
    it('should initialize with default local provider', async () => {
      manager = new SecretManager();
      await manager.initialize();
      
      // Should use LocalSecretProvider by default
      expect(manager).toBeDefined();
    });

    it('should initialize with custom provider config', async () => {
      manager = new SecretManager({
        type: 'local',
        config: {
          storageDir: '/tmp/test-secrets'
        }
      });
      
      await manager.initialize();
      expect(manager).toBeDefined();
    });

    it('should initialize provider on first use', async () => {
      manager = new SecretManager();
      
      // Provider should be initialized when first method is called
      await manager.set('key', 'value');
      
      // Should work without explicit initialize
      const value = await manager.get('key');
      expect(value).toBeDefined();
    });

    it('should handle initialization errors', async () => {
      const errorProvider = new MockProvider();
      errorProvider.initialize = jest.fn().mockRejectedValue(
        new Error('Init failed')
      );
      
      // Create manager with mock provider factory
      manager = new SecretManager();
      (manager as any).provider = errorProvider;
      
      await expect(manager.initialize()).rejects.toThrow('Init failed');
    });
  });

  describe('basic operations', () => {
    beforeEach(async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      await manager.initialize();
    });

    it('should set and get secrets', async () => {
      await manager.set('test-key', 'test-value');
      const value = await manager.get('test-key');
      
      expect(value).toBe('test-value');
    });

    it('should return null for non-existent keys', async () => {
      const value = await manager.get('non-existent');
      expect(value).toBeNull();
    });

    it('should delete secrets', async () => {
      await manager.set('delete-me', 'value');
      expect(await manager.has('delete-me')).toBe(true);
      
      await manager.delete('delete-me');
      expect(await manager.has('delete-me')).toBe(false);
    });

    it('should list secrets', async () => {
      await manager.set('key1', 'value1');
      await manager.set('key2', 'value2');
      await manager.set('key3', 'value3');
      
      const keys = await manager.list();
      expect(keys.sort()).toEqual(['key1', 'key2', 'key3']);
    });

    it('should check if secret exists', async () => {
      await manager.set('exists', 'value');
      
      expect(await manager.has('exists')).toBe(true);
      expect(await manager.has('not-exists')).toBe(false);
    });
  });

  describe('validation', () => {
    beforeEach(async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      await manager.initialize();
    });

    it('should validate key format', async () => {
      const validKeys = [
        'simple-key',
        'key_with_underscore',
        'key.with.dots',
        'KEY-123',
        'a',
        '1234'
      ];
      
      for (const key of validKeys) {
        await expect(manager.set(key, 'value')).resolves.not.toThrow();
      }
    });

    it('should reject invalid keys', async () => {
      const invalidKeys = [
        '',
        ' ',
        'key with spaces',
        'key\nwith\nnewlines',
        'key\twith\ttabs',
        '../path/traversal',
        '../../etc/passwd',
        'key:with:colons',
        'key;with;semicolons',
        'key|with|pipes'
      ];
      
      for (const key of invalidKeys) {
        await expect(manager.set(key, 'value')).rejects.toThrow(SecretError);
      }
    });

    it('should reject empty values', async () => {
      await expect(manager.set('key', '')).rejects.toThrow(SecretError);
    });

    it('should enforce key length limits', async () => {
      const longKey = 'x'.repeat(256);
      const tooLongKey = 'x'.repeat(257);
      
      await expect(manager.set(longKey, 'value')).resolves.not.toThrow();
      await expect(manager.set(tooLongKey, 'value')).rejects.toThrow(SecretError);
    });

    it('should enforce value length limits', async () => {
      const largeValue = 'x'.repeat(64 * 1024); // 64KB
      const tooLargeValue = 'x'.repeat(65 * 1024); // 65KB
      
      await expect(manager.set('key', largeValue)).resolves.not.toThrow();
      await expect(manager.set('key', tooLargeValue)).rejects.toThrow(SecretError);
    });
  });

  describe('provider switching', () => {
    it('should update provider configuration', async () => {
      manager = new SecretManager({
        type: 'local',
        config: { storageDir: '/tmp/secrets1' }
      });
      
      await manager.initialize();
      await manager.set('key1', 'value1');
      
      // Update to new provider config
      await manager.updateProvider({
        type: 'local',
        config: { storageDir: '/tmp/secrets2' }
      });
      
      // Old secret should not be accessible
      expect(await manager.get('key1')).toBeNull();
      
      // Can set new secrets
      await manager.set('key2', 'value2');
      expect(await manager.get('key2')).toBe('value2');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      manager = new SecretManager();
    });

    it('should wrap provider errors', async () => {
      const errorProvider = new MockProvider();
      errorProvider.get = jest.fn().mockRejectedValue(
        new Error('Provider error')
      );
      
      (manager as any).provider = errorProvider;
      await manager.initialize();
      
      await expect(manager.get('key')).rejects.toThrow(SecretError);
    });

    it('should handle provider not found', async () => {
      expect(() => {
        new SecretManager({
          type: 'non-existent' as any
        });
      }).toThrow('Unknown secret provider type: non-existent');
    });
  });

  describe('env provider fallback', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    it('should use env provider', async () => {
      process.env.SECRET_TEST_KEY = 'env-value';
      
      manager = new SecretManager({ type: 'env' });
      await manager.initialize();
      
      const value = await manager.get('test-key');
      expect(value).toBe('env-value');
    });

    it('should handle env provider operations', async () => {
      manager = new SecretManager({ type: 'env' });
      await manager.initialize();
      
      // Set should update env
      await manager.set('new-key', 'new-value');
      expect(process.env.SECRET_NEW_KEY).toBe('new-value');
      
      // Delete should remove from env
      process.env.SECRET_DELETE_ME = 'value';
      await manager.delete('delete-me');
      expect(process.env.SECRET_DELETE_ME).toBeUndefined();
      
      // List should show env secrets
      process.env.SECRET_KEY1 = 'value1';
      process.env.SECRET_KEY2 = 'value2';
      const keys = await manager.list();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      await manager.initialize();
    });

    it('should handle concurrent sets', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(manager.set(`key${i}`, `value${i}`));
      }
      
      await Promise.all(promises);
      
      for (let i = 0; i < 10; i++) {
        expect(await manager.get(`key${i}`)).toBe(`value${i}`);
      }
    });

    it('should handle concurrent reads', async () => {
      await manager.set('shared-key', 'shared-value');
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(manager.get('shared-key'));
      }
      
      const results = await Promise.all(promises);
      expect(results.every(r => r === 'shared-value')).toBe(true);
    });
  });

  describe('extended operations', () => {
    beforeEach(async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      await manager.initialize();
    });

    it('should get required secrets', async () => {
      await manager.set('required-key', 'required-value');
      
      const value = await manager.getRequired('required-key');
      expect(value).toBe('required-value');
    });

    it('should throw for missing required secrets', async () => {
      await expect(manager.getRequired('missing-key')).rejects.toThrow(SecretError);
      
      try {
        await manager.getRequired('missing-key');
      } catch (error) {
        expect(error).toBeInstanceOf(SecretError);
        expect((error as SecretError).code).toBe('SECRET_NOT_FOUND');
        expect((error as SecretError).key).toBe('missing-key');
      }
    });

    it('should get many secrets at once', async () => {
      await manager.set('key1', 'value1');
      await manager.set('key2', 'value2');
      await manager.set('key3', 'value3');
      
      const results = await manager.getMany(['key1', 'key2', 'key3', 'missing']);
      
      expect(results).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        missing: null
      });
    });

    it('should set many secrets at once', async () => {
      const secrets = {
        bulk1: 'value1',
        bulk2: 'value2',
        bulk3: 'value3'
      };
      
      await manager.setMany(secrets);
      
      for (const [key, value] of Object.entries(secrets)) {
        expect(await manager.get(key)).toBe(value);
      }
    });

    it('should delete many secrets at once', async () => {
      await manager.set('del1', 'value1');
      await manager.set('del2', 'value2');
      await manager.set('del3', 'value3');
      await manager.set('keep', 'value');
      
      await manager.deleteMany(['del1', 'del2', 'del3']);
      
      expect(await manager.has('del1')).toBe(false);
      expect(await manager.has('del2')).toBe(false);
      expect(await manager.has('del3')).toBe(false);
      expect(await manager.has('keep')).toBe(true);
    });

    it('should clear all secrets', async () => {
      await manager.set('clear1', 'value1');
      await manager.set('clear2', 'value2');
      await manager.set('clear3', 'value3');
      
      await manager.clear();
      
      const keys = await manager.list();
      expect(keys).toHaveLength(0);
    });

    it('should get provider type', () => {
      const localManager = new SecretManager({ type: 'local' });
      const envManager = new SecretManager({ type: 'env' });
      
      expect(localManager.getProviderType()).toBe('local');
      expect(envManager.getProviderType()).toBe('env');
    });
  });

  describe('provider types', () => {
    it('should throw for unimplemented providers', () => {
      const unimplementedTypes = ['vault', 'aws-secrets', '1password'];
      
      for (const type of unimplementedTypes) {
        expect(() => new SecretManager({ type: type as any })).toThrow(SecretError);
        
        try {
          new SecretManager({ type: type as any });
        } catch (error) {
          expect(error).toBeInstanceOf(SecretError);
          expect((error as SecretError).code).toBe('PROVIDER_NOT_IMPLEMENTED');
        }
      }
    });

    it('should validate value type', async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      
      // Try to set non-string value
      await expect(manager.set('key', 123 as any)).rejects.toThrow(SecretError);
      
      try {
        await manager.set('key', null as any);
      } catch (error) {
        expect(error).toBeInstanceOf(SecretError);
        expect((error as SecretError).code).toBe('INVALID_VALUE');
      }
    });
  });

  describe('default manager', () => {
    it('should create default manager instance', async () => {
      // Use dynamic import for ES modules
      const module1 = await import('../../src/secrets/manager.js');
      const manager1 = module1.getDefaultSecretManager();
      const manager2 = module1.getDefaultSecretManager();
      
      expect(manager1).toBe(manager2); // Should be same instance
      expect(manager1).toBeInstanceOf(module1.SecretManager);
    });

    it('should handle default manager singleton pattern', async () => {
      // Test that default manager maintains singleton pattern
      const module = await import('../../src/secrets/manager.js');
      
      // Get the manager multiple times
      const managers = await Promise.all([
        Promise.resolve(module.getDefaultSecretManager()),
        Promise.resolve(module.getDefaultSecretManager()),
        Promise.resolve(module.getDefaultSecretManager())
      ]);
      
      // All should be the same instance
      expect(managers[0]).toBe(managers[1]);
      expect(managers[1]).toBe(managers[2]);
    });
  });

  describe('real-world integration', () => {
    it('should handle complete secret lifecycle', async () => {
      // Use real local provider
      const tempDir = `/tmp/xec-test-secrets-${Date.now()}`;
      manager = new SecretManager({
        type: 'local',
        config: { storageDir: tempDir }
      });
      
      // Create
      await manager.set('api-key', 'sk-1234567890');
      expect(await manager.has('api-key')).toBe(true);
      
      // Read
      const value = await manager.get('api-key');
      expect(value).toBe('sk-1234567890');
      
      // Update
      await manager.set('api-key', 'sk-0987654321');
      expect(await manager.get('api-key')).toBe('sk-0987654321');
      
      // List
      const keys = await manager.list();
      expect(keys).toContain('api-key');
      
      // Delete
      await manager.delete('api-key');
      expect(await manager.has('api-key')).toBe(false);
      
      // Clean up
      const fs = await import('fs/promises');
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should handle bulk operations efficiently', async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      
      // Bulk set
      const bulkSecrets: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        bulkSecrets[`key${i}`] = `value${i}`;
      }
      
      const startSet = Date.now();
      await manager.setMany(bulkSecrets);
      const setDuration = Date.now() - startSet;
      
      // Should be reasonably fast
      expect(setDuration).toBeLessThan(1000);
      
      // Bulk get
      const keys = Object.keys(bulkSecrets);
      const startGet = Date.now();
      const results = await manager.getMany(keys);
      const getDuration = Date.now() - startGet;
      
      expect(getDuration).toBeLessThan(100);
      expect(Object.keys(results)).toHaveLength(100);
      
      // Verify all values
      for (const [key, value] of Object.entries(bulkSecrets)) {
        expect(results[key]).toBe(value);
      }
    });

    it('should handle special characters in secrets', async () => {
      manager = new SecretManager();
      (manager as any).provider = mockProvider;
      
      const specialValues = [
        'password with spaces',
        'multi\nline\nvalue',
        'unicode: 你好世界 🔐',
        'symbols: !@#$%^&*()_+-=[]{}|;:\'",.<>?/',
        JSON.stringify({ nested: { data: 'structure' } }),
        'base64:' + Buffer.from('binary data').toString('base64')
      ];
      
      for (let i = 0; i < specialValues.length; i++) {
        const key = `special${i}`;
        await manager.set(key, specialValues[i]);
        expect(await manager.get(key)).toBe(specialValues[i]);
      }
    });
  });
});