import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { EnvSecretProvider } from '../../src/secrets/providers/env.js';

describe('EnvSecretProvider', () => {
  let provider: EnvSecretProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear any existing SECRET_ vars
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('SECRET_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('basic operations', () => {
    beforeEach(async () => {
      provider = new EnvSecretProvider();
      await provider.initialize();
    });

    it('should set and get secrets', async () => {
      await provider.set('test-key', 'test-value');
      expect(await provider.get('test-key')).toBe('test-value');
      expect(process.env.SECRET_TEST_KEY).toBe('test-value');
    });

    it('should return null for non-existent keys', async () => {
      expect(await provider.get('missing')).toBeNull();
    });

    it('should delete secrets', async () => {
      process.env.SECRET_DELETE_ME = 'value';
      expect(await provider.has('delete-me')).toBe(true);
      
      await provider.delete('delete-me');
      expect(await provider.has('delete-me')).toBe(false);
      expect(process.env.SECRET_DELETE_ME).toBeUndefined();
    });

    it('should list all secrets', async () => {
      process.env.SECRET_KEY1 = 'value1';
      process.env.SECRET_KEY2 = 'value2';
      process.env.SECRET_KEY3 = 'value3';
      process.env.OTHER_VAR = 'not-a-secret';
      
      const keys = await provider.list();
      expect(keys).toHaveLength(3);
      expect(keys.sort()).toEqual(['key1', 'key2', 'key3']);
    });

    it('should check if secret exists', async () => {
      process.env.SECRET_EXISTS = 'value';
      
      expect(await provider.has('exists')).toBe(true);
      expect(await provider.has('not-exists')).toBe(false);
    });
  });

  describe('key transformation', () => {
    beforeEach(async () => {
      provider = new EnvSecretProvider();
      await provider.initialize();
    });

    it('should handle keys with dots', async () => {
      await provider.set('my.dotted.key', 'value');
      expect(process.env.SECRET_MY_DOTTED_KEY).toBe('value');
      expect(await provider.get('my.dotted.key')).toBe('value');
    });

    it('should handle keys with dashes', async () => {
      await provider.set('my-dashed-key', 'value');
      expect(process.env.SECRET_MY_DASHED_KEY).toBe('value');
      expect(await provider.get('my-dashed-key')).toBe('value');
    });

    it('should handle mixed case keys', async () => {
      await provider.set('MixedCaseKey', 'value');
      expect(process.env.SECRET_MIXEDCASEKEY).toBe('value');
      expect(await provider.get('MixedCaseKey')).toBe('value');
    });

    it('should preserve key format in list', async () => {
      // Set various env vars
      process.env.SECRET_SIMPLE = 'value1';
      process.env.SECRET_WITH_UNDERSCORE = 'value2';
      process.env.SECRET_MULTIPLE_PARTS_HERE = 'value3';
      
      const keys = await provider.list();
      expect(keys).toContain('simple');
      expect(keys).toContain('with-underscore');
      expect(keys).toContain('multiple-parts-here');
    });
  });

  describe('custom prefix', () => {
    it('should use custom prefix', async () => {
      provider = new EnvSecretProvider({ prefix: 'CUSTOM_' });
      await provider.initialize();
      
      await provider.set('key', 'value');
      expect(process.env.CUSTOM_KEY).toBe('value');
      expect(process.env.SECRET_KEY).toBeUndefined();
      
      expect(await provider.get('key')).toBe('value');
    });

    it('should list with custom prefix', async () => {
      provider = new EnvSecretProvider({ prefix: 'APP_SECRET_' });
      await provider.initialize();
      
      process.env.APP_SECRET_KEY1 = 'value1';
      process.env.APP_SECRET_KEY2 = 'value2';
      process.env.SECRET_KEY3 = 'value3'; // Wrong prefix
      
      const keys = await provider.list();
      expect(keys).toHaveLength(2);
      expect(keys.sort()).toEqual(['key1', 'key2']);
    });

    it('should handle edge case with empty key parts', async () => {
      provider = new EnvSecretProvider();
      await provider.initialize();
      
      // This tests the getKeyFromEnv null return path
      const envProvider = provider as any;
      expect(envProvider.getKeyFromEnv('WRONG_PREFIX')).toBeNull();
      expect(envProvider.getKeyFromEnv('SECRET_')).toBe('');
    });
  });

  describe('real-world usage', () => {
    beforeEach(async () => {
      provider = new EnvSecretProvider();
      await provider.initialize();
    });

    it('should handle database connection strings', async () => {
      const dbUrl = 'postgres://user:pass@host:5432/db?ssl=true';
      await provider.set('database.url', dbUrl);
      
      expect(process.env.SECRET_DATABASE_URL).toBe(dbUrl);
      expect(await provider.get('database.url')).toBe(dbUrl);
    });

    it('should handle API keys', async () => {
      const apiKeys = {
        'github.token': 'ghp_1234567890abcdef',
        'openai.api.key': 'sk-1234567890abcdef',
        'stripe-secret-key': 'sk_test_1234567890'
      };
      
      for (const [key, value] of Object.entries(apiKeys)) {
        await provider.set(key, value);
      }
      
      const keys = await provider.list();
      expect(keys).toHaveLength(3);
      
      for (const [key, value] of Object.entries(apiKeys)) {
        expect(await provider.get(key)).toBe(value);
      }
    });

    it('should handle bulk operations', async () => {
      // Set many secrets
      const secrets: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        const key = `bulk-key-${i}`;
        const value = `bulk-value-${i}`;
        secrets[key] = value;
        await provider.set(key, value);
      }
      
      // List should find all
      const keys = await provider.list();
      expect(keys).toHaveLength(50);
      
      // Get all values
      for (const [key, expectedValue] of Object.entries(secrets)) {
        const value = await provider.get(key);
        expect(value).toBe(expectedValue);
      }
      
      // Delete half
      for (let i = 0; i < 25; i++) {
        await provider.delete(`bulk-key-${i}`);
      }
      
      // Should have 25 left
      const remainingKeys = await provider.list();
      expect(remainingKeys).toHaveLength(25);
    });

    it('should handle environment variable limits', async () => {
      // Most systems have limits on env var size
      const largeValue = 'x'.repeat(10000); // 10KB
      
      await provider.set('large-value', largeValue);
      expect(await provider.get('large-value')).toBe(largeValue);
    });
  });
});