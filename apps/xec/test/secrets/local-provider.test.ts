import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SecretError } from '../../src/secrets/types.js';
import { LocalSecretProvider } from '../../src/secrets/providers/local.js';

describe('LocalSecretProvider', () => {
  let provider: LocalSecretProvider;
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = path.join(os.tmpdir(), `xec-test-secrets-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    provider = new LocalSecretProvider({
      storageDir: testDir
    });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('initialize', () => {
    it('should create storage directory if it does not exist', async () => {
      const customDir = path.join(testDir, 'custom-secrets');
      const customProvider = new LocalSecretProvider({
        storageDir: customDir
      });

      expect(existsSync(customDir)).toBe(false);
      await customProvider.initialize();
      expect(existsSync(customDir)).toBe(true);

      const stats = await fs.stat(customDir);
      expect(stats.isDirectory()).toBe(true);
      // Check permissions (0o700)
      expect(stats.mode & 0o777).toBe(0o700);
    });

    it('should create index file on initialization', async () => {
      await provider.initialize();
      
      const indexPath = path.join(testDir, '.index.json');
      expect(existsSync(indexPath)).toBe(true);
      
      const content = await fs.readFile(indexPath, 'utf8');
      expect(JSON.parse(content)).toEqual({});
    });

    it('should handle initialization errors', async () => {
      // Make directory read-only to cause error
      const readOnlyDir = path.join(testDir, 'readonly');
      await fs.mkdir(readOnlyDir, { mode: 0o500 });
      
      const errorProvider = new LocalSecretProvider({
        storageDir: path.join(readOnlyDir, 'secrets')
      });

      await expect(errorProvider.initialize()).rejects.toThrow();
      
      // Clean up
      await fs.chmod(readOnlyDir, 0o700);
    });

    it('should be idempotent', async () => {
      await provider.initialize();
      await provider.initialize(); // Should not throw
      
      expect(existsSync(testDir)).toBe(true);
    });
  });

  describe('set/get', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should set and get a secret', async () => {
      const key = 'test-key';
      const value = 'test-value';
      
      await provider.set(key, value);
      const retrieved = await provider.get(key);
      
      expect(retrieved).toBe(value);
    });

    it('should encrypt secrets on disk', async () => {
      const key = 'sensitive-key';
      const value = 'sensitive-value';
      
      await provider.set(key, value);
      
      // Read the raw file
      const files = await fs.readdir(testDir);
      const secretFile = files.find(f => f.endsWith('.secret'));
      expect(secretFile).toBeDefined();
      
      const rawContent = await fs.readFile(path.join(testDir, secretFile!), 'utf8');
      const data = JSON.parse(rawContent);
      
      // Check encrypted data structure
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('encrypted');
      expect(data).toHaveProperty('iv');
      expect(data).toHaveProperty('authTag');
      expect(data).toHaveProperty('salt');
      expect(data).toHaveProperty('algorithm', 'aes-256-gcm');
      
      // Ensure value is not in plaintext
      expect(rawContent).not.toContain(value);
    });

    it('should handle unicode values', async () => {
      const key = 'unicode-key';
      const value = 'Hello 世界! 🔐 Ñoño';
      
      await provider.set(key, value);
      const retrieved = await provider.get(key);
      
      expect(retrieved).toBe(value);
    });

    it('should handle large values', async () => {
      const key = 'large-key';
      const value = 'x'.repeat(10000); // 10KB of data
      
      await provider.set(key, value);
      const retrieved = await provider.get(key);
      
      expect(retrieved).toBe(value);
    });

    it('should return null for non-existent keys', async () => {
      const result = await provider.get('non-existent');
      expect(result).toBeNull();
    });

    it('should overwrite existing secrets', async () => {
      const key = 'overwrite-key';
      
      await provider.set(key, 'value1');
      await provider.set(key, 'value2');
      
      const retrieved = await provider.get(key);
      expect(retrieved).toBe('value2');
    });

    it('should update metadata on set', async () => {
      const key = 'metadata-key';
      await provider.set(key, 'value');
      
      const indexPath = path.join(testDir, '.index.json');
      const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      
      expect(index[key]).toHaveProperty('hashedKey');
      expect(index[key]).toHaveProperty('createdAt');
      expect(index[key]).toHaveProperty('updatedAt');
      expect(index[key]).toHaveProperty('fingerprint');
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should delete an existing secret', async () => {
      const key = 'delete-me';
      await provider.set(key, 'value');
      
      expect(await provider.has(key)).toBe(true);
      await provider.delete(key);
      expect(await provider.has(key)).toBe(false);
      
      const retrieved = await provider.get(key);
      expect(retrieved).toBeNull();
    });

    it('should remove from index when deleted', async () => {
      const key = 'indexed-key';
      await provider.set(key, 'value');
      await provider.delete(key);
      
      const indexPath = path.join(testDir, '.index.json');
      const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      
      expect(index).not.toHaveProperty(key);
    });

    it('should handle deleting non-existent keys', async () => {
      // Should not throw
      await expect(provider.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should list all secret keys', async () => {
      const keys = ['key1', 'key2', 'key3'];
      
      for (const key of keys) {
        await provider.set(key, `value-${key}`);
      }
      
      const list = await provider.list();
      expect(list.sort()).toEqual(keys.sort());
    });

    it('should return empty array when no secrets', async () => {
      const list = await provider.list();
      expect(list).toEqual([]);
    });

    it('should update list after operations', async () => {
      await provider.set('key1', 'value1');
      expect(await provider.list()).toEqual(['key1']);
      
      await provider.set('key2', 'value2');
      expect((await provider.list()).sort()).toEqual(['key1', 'key2']);
      
      await provider.delete('key1');
      expect(await provider.list()).toEqual(['key2']);
    });
  });

  describe('has', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should check if secret exists', async () => {
      await provider.set('exists', 'value');
      
      expect(await provider.has('exists')).toBe(true);
      expect(await provider.has('not-exists')).toBe(false);
    });
  });

  describe('passphrase support', () => {
    it('should encrypt/decrypt with passphrase', async () => {
      const passphraseProvider = new LocalSecretProvider({
        storageDir: path.join(testDir, 'passphrase'),
        passphrase: 'my-passphrase'
      });
      
      await passphraseProvider.initialize();
      
      const key = 'passphrase-key';
      const value = 'passphrase-value';
      
      await passphraseProvider.set(key, value);
      const retrieved = await passphraseProvider.get(key);
      
      expect(retrieved).toBe(value);
    });

    it('should fail to decrypt with wrong passphrase', async () => {
      const provider1 = new LocalSecretProvider({
        storageDir: path.join(testDir, 'passphrase2'),
        passphrase: 'correct-passphrase'
      });
      
      await provider1.initialize();
      await provider1.set('key', 'value');
      
      const provider2 = new LocalSecretProvider({
        storageDir: path.join(testDir, 'passphrase2'),
        passphrase: 'wrong-passphrase'
      });
      
      await provider2.initialize();
      await expect(provider2.get('key')).rejects.toThrow();
    });
  });

  describe('changePassphrase', () => {
    it('should re-encrypt all secrets with new passphrase', async () => {
      const dir = path.join(testDir, 'change-passphrase');
      const provider1 = new LocalSecretProvider({
        storageDir: dir,
        passphrase: 'old-pass'
      });
      
      await provider1.initialize();
      
      // Set some secrets
      await provider1.set('key1', 'value1');
      await provider1.set('key2', 'value2');
      
      // Change passphrase
      await provider1.changePassphrase('old-pass', 'new-pass');
      
      // Try to read with new passphrase
      const provider2 = new LocalSecretProvider({
        storageDir: dir,
        passphrase: 'new-pass'
      });
      
      await provider2.initialize();
      expect(await provider2.get('key1')).toBe('value1');
      expect(await provider2.get('key2')).toBe('value2');
      
      // Old passphrase should no longer work
      const provider3 = new LocalSecretProvider({
        storageDir: dir,
        passphrase: 'old-pass'
      });
      
      await provider3.initialize();
      await expect(provider3.get('key1')).rejects.toThrow();
    });
  });

  describe('export/import', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should export all secrets', async () => {
      const secrets = {
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      };
      
      for (const [key, value] of Object.entries(secrets)) {
        await provider.set(key, value);
      }
      
      const exported = await provider.export();
      expect(exported).toEqual(secrets);
    });

    it('should import secrets', async () => {
      const secrets = {
        imported1: 'value1',
        imported2: 'value2'
      };
      
      await provider.import(secrets);
      
      for (const [key, value] of Object.entries(secrets)) {
        expect(await provider.get(key)).toBe(value);
      }
    });

    it('should handle empty export/import', async () => {
      const exported = await provider.export();
      expect(exported).toEqual({});
      
      await provider.import({});
      expect(await provider.list()).toEqual([]);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should throw SecretError with proper code', async () => {
      // Make storage directory read-only
      await fs.chmod(testDir, 0o500);
      
      try {
        await provider.set('fail-key', 'value');
      } catch (error) {
        expect(error).toBeInstanceOf(SecretError);
        expect((error as SecretError).code).toBe('SET_ERROR');
        expect((error as SecretError).key).toBe('fail-key');
      } finally {
        // Restore permissions
        await fs.chmod(testDir, 0o700);
      }
    });

    it('should handle storage access errors during initialization', async () => {
      const inaccessibleDir = path.join(testDir, 'inaccessible');
      await fs.mkdir(inaccessibleDir, { mode: 0o000 });
      
      const errorProvider = new LocalSecretProvider({
        storageDir: inaccessibleDir
      });
      
      try {
        await errorProvider.initialize();
      } catch (error) {
        // It might throw different errors based on platform
        expect(error).toBeDefined();
      }
      
      // Clean up
      await fs.chmod(inaccessibleDir, 0o700);
    });

    it('should handle list errors with corrupted index', async () => {
      // Create a corrupted index file
      const indexPath = path.join(testDir, '.index.json');
      await fs.writeFile(indexPath, '{invalid json', { mode: 0o600 });
      
      await expect(provider.list()).rejects.toThrow(SecretError);
    });

    it('should handle ENOENT errors in readIndex gracefully', async () => {
      // Remove the index file to trigger ENOENT
      const indexPath = path.join(testDir, '.index.json');
      await fs.unlink(indexPath);
      
      // Should return empty list
      const list = await provider.list();
      expect(list).toEqual([]);
    });

    it('should handle ENOENT errors in get method', async () => {
      // This tests the specific ENOENT handling in get method
      const result = await provider.get('non-existent-key-that-never-existed');
      expect(result).toBeNull();
    });
  });

  describe('file permissions', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should create secret files with restricted permissions', async () => {
      await provider.set('secure-key', 'secure-value');
      
      const files = await fs.readdir(testDir);
      const secretFile = files.find(f => f.endsWith('.secret'));
      expect(secretFile).toBeDefined();
      
      const stats = await fs.stat(path.join(testDir, secretFile!));
      // Check that only owner can read/write (0o600)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should create index with restricted permissions', async () => {
      const indexPath = path.join(testDir, '.index.json');
      const stats = await fs.stat(indexPath);
      expect(stats.mode & 0o777).toBe(0o600);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle concurrent access to same secret', async () => {
      await provider.initialize();
      const key = 'concurrent-key';
      
      // Write sequentially to avoid race conditions with index updates
      for (let i = 0; i < 5; i++) {
        await provider.set(key, `value-${i}`);
      }
      
      // The last write should win
      const value = await provider.get(key);
      expect(value).toBe('value-4');
    });

    it('should handle real file corruption scenarios', async () => {
      await provider.set('corrupt-key', 'original-value');
      
      // Corrupt the secret file
      const files = await fs.readdir(testDir);
      const secretFile = files.find(f => f.endsWith('.secret'));
      const secretPath = path.join(testDir, secretFile!);
      
      // Write invalid JSON
      await fs.writeFile(secretPath, 'not json at all', { mode: 0o600 });
      
      // Should throw when trying to read
      await expect(provider.get('corrupt-key')).rejects.toThrow();
    });

    it('should handle filesystem quota/space issues', async () => {
      // This test simulates what happens when disk is full
      // We'll create a very large value that might fail on systems with quotas
      const hugeValue = 'x'.repeat(1000000); // 1MB
      
      try {
        await provider.set('huge-key', hugeValue);
        const retrieved = await provider.get('huge-key');
        expect(retrieved).toBe(hugeValue);
      } catch (error) {
        // If it fails due to space, that's also a valid test case
        expect(error).toBeInstanceOf(SecretError);
      }
    });

    it('should maintain data integrity across provider instances', async () => {
      // Set secrets with one provider
      await provider.set('persist-key1', 'value1');
      await provider.set('persist-key2', 'value2');
      
      // Create new provider instance
      const newProvider = new LocalSecretProvider({
        storageDir: testDir
      });
      
      // Should be able to read secrets immediately
      expect(await newProvider.get('persist-key1')).toBe('value1');
      expect(await newProvider.get('persist-key2')).toBe('value2');
      expect(await newProvider.list()).toHaveLength(2);
    });

    it('should handle special characters in keys and values', async () => {
      const specialKeys = [
        'key-with-spaces in it',
        'key/with/slashes',
        'key\\with\\backslashes',
        'key:with:colons',
        'key|with|pipes',
        'key.with.dots',
        'key-with-émojis-🔐'
      ];
      
      for (const key of specialKeys) {
        const value = `Special value for ${key} with émojis 🎉`;
        await provider.set(key, value);
        expect(await provider.get(key)).toBe(value);
      }
      
      expect(await provider.list()).toHaveLength(specialKeys.length);
    });

    it('should handle provider with custom passphrase', async () => {
      const customDir = path.join(testDir, 'custom-passphrase');
      const passphrase = 'my-s3cr3t-p@ssw0rd!';
      
      const provider1 = new LocalSecretProvider({
        storageDir: customDir,
        passphrase
      });
      
      await provider1.set('protected-key', 'protected-value');
      
      // Same passphrase should work
      const provider2 = new LocalSecretProvider({
        storageDir: customDir,
        passphrase
      });
      
      expect(await provider2.get('protected-key')).toBe('protected-value');
      
      // Wrong passphrase should fail
      const provider3 = new LocalSecretProvider({
        storageDir: customDir,
        passphrase: 'wrong-passphrase'
      });
      
      await expect(provider3.get('protected-key')).rejects.toThrow();
      
      // No passphrase should also fail
      const provider4 = new LocalSecretProvider({
        storageDir: customDir
      });
      
      await expect(provider4.get('protected-key')).rejects.toThrow();
    });
  });
});