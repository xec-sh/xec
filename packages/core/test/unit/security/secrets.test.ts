import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { SecretManager } from '../../../src/security/secrets.js';

describe('security/secrets', () => {
  let secretManager: SecretManager;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = path.join(os.tmpdir(), `xec-secrets-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    secretManager = new SecretManager({
      storePath: testDir,
      encryptionKey: 'test-master-key',
      autoEncrypt: true,
    });

    await secretManager.initialize();
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('set/get secrets', () => {
    it('should store and retrieve secret', async () => {
      const name = 'test-secret';
      const value = 'secret-value';

      await secretManager.set(name, value);
      const retrieved = await secretManager.get(name);

      expect(retrieved).toBe(value);
    });

    it('should encrypt secrets when autoEncrypt is enabled', async () => {
      const name = 'test-secret';
      const value = 'secret-value';

      await secretManager.set(name, value);

      // Read the raw file to check encryption
      const secretsFile = path.join(testDir, 'secrets.json');
      const rawData = await fs.readFile(secretsFile, 'utf8');
      const secrets = JSON.parse(rawData);

      expect(secrets[name].encrypted).toBe(true);
      expect(secrets[name].value).not.toBe(value);
      expect(secrets[name].value).toContain('version');
    });

    it('should handle metadata', async () => {
      const name = 'test-secret';
      const value = 'secret-value';
      const metadata = { environment: 'test', service: 'api' };

      await secretManager.set(name, value, metadata);
      const retrievedMetadata = await secretManager.getMetadata(name);

      expect(retrievedMetadata).toEqual(metadata);
    });

    it('should return undefined for non-existent secret', async () => {
      const retrieved = await secretManager.get('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('has/delete', () => {
    it('should check if secret exists', async () => {
      const name = 'test-secret';
      const value = 'secret-value';

      expect(await secretManager.has(name)).toBe(false);

      await secretManager.set(name, value);
      expect(await secretManager.has(name)).toBe(true);
    });

    it('should delete secret', async () => {
      const name = 'test-secret';
      const value = 'secret-value';

      await secretManager.set(name, value);
      expect(await secretManager.has(name)).toBe(true);

      const deleted = await secretManager.delete(name);
      expect(deleted).toBe(true);
      expect(await secretManager.has(name)).toBe(false);
    });

    it('should return false when deleting non-existent secret', async () => {
      const deleted = await secretManager.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all secret names', async () => {
      await secretManager.set('secret1', 'value1');
      await secretManager.set('secret2', 'value2');
      await secretManager.set('secret3', 'value3');

      const names = await secretManager.list();
      expect(names).toHaveLength(3);
      expect(names).toContain('secret1');
      expect(names).toContain('secret2');
      expect(names).toContain('secret3');
    });

    it('should return empty array when no secrets', async () => {
      const names = await secretManager.list();
      expect(names).toEqual([]);
    });
  });

  describe('updateMetadata', () => {
    it('should update secret metadata', async () => {
      const name = 'test-secret';
      const value = 'secret-value';
      const initialMetadata = { version: '1.0' };
      const updateMetadata = { environment: 'production' };

      await secretManager.set(name, value, initialMetadata);
      await secretManager.updateMetadata(name, updateMetadata);

      const metadata = await secretManager.getMetadata(name);
      expect(metadata).toEqual({
        version: '1.0',
        environment: 'production',
      });
    });

    it('should throw error when updating metadata for non-existent secret', async () => {
      await expect(secretManager.updateMetadata('non-existent', {}))
        .rejects.toThrow("Secret 'non-existent' not found");
    });
  });

  describe('export/import', () => {
    it('should export and import secrets', async () => {
      // Set up secrets
      await secretManager.set('secret1', 'value1', { tag: 'test' });
      await secretManager.set('secret2', 'value2');
      await secretManager.set('secret3', 'value3');

      // Export
      const exportPassword = 'export-password';
      const exported = await secretManager.export(exportPassword);

      // Clear secrets
      await secretManager.clear();
      expect(await secretManager.list()).toHaveLength(0);

      // Import
      const imported = await secretManager.import(exported, exportPassword);
      expect(imported).toBe(3);

      // Verify imported secrets
      expect(await secretManager.get('secret1')).toBe('value1');
      expect(await secretManager.get('secret2')).toBe('value2');
      expect(await secretManager.get('secret3')).toBe('value3');
      expect(await secretManager.getMetadata('secret1')).toEqual({ tag: 'test' });
    });

    it('should fail import with wrong password', async () => {
      await secretManager.set('secret1', 'value1');

      const exportPassword = 'export-password';
      const exported = await secretManager.export(exportPassword);

      await expect(secretManager.import(exported, 'wrong-password'))
        .rejects.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all secrets', async () => {
      await secretManager.set('secret1', 'value1');
      await secretManager.set('secret2', 'value2');
      await secretManager.set('secret3', 'value3');

      expect(await secretManager.list()).toHaveLength(3);

      await secretManager.clear();
      expect(await secretManager.list()).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('should persist secrets between instances', async () => {
      const name = 'persistent-secret';
      const value = 'persistent-value';
      const metadata = { persistent: true };

      await secretManager.set(name, value, metadata);

      // Create new instance with same path
      const newManager = new SecretManager({
        storePath: testDir,
        encryptionKey: 'test-master-key',
        autoEncrypt: true,
      });
      await newManager.initialize();

      expect(await newManager.get(name)).toBe(value);
      expect(await newManager.getMetadata(name)).toEqual(metadata);
    });
  });

  describe('non-encrypted mode', () => {
    it('should store secrets without encryption when autoEncrypt is false', async () => {
      const plainManager = new SecretManager({
        storePath: testDir,
        autoEncrypt: false,
      });
      await plainManager.initialize();

      const name = 'plain-secret';
      const value = 'plain-value';

      await plainManager.set(name, value);

      // Read the raw file to check no encryption
      const secretsFile = path.join(testDir, 'secrets.json');
      const rawData = await fs.readFile(secretsFile, 'utf8');
      const secrets = JSON.parse(rawData);

      expect(secrets[name].encrypted).toBe(false);
      expect(secrets[name].value).toBe(value);
    });
  });
});