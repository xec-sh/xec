import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { FileStorageAdapter } from '../../../../src/state/storage/file-adapter.js';

describe('state/storage/file-adapter', () => {
  let adapter: FileStorageAdapter;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = path.join(os.tmpdir(), `xec-file-storage-test-${Date.now()}`);

    adapter = new FileStorageAdapter({
      basePath: testDir,
      encoding: 'utf8',
    });

    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('connect/disconnect', () => {
    it('should connect successfully', () => {
      expect(adapter.isConnected()).toBe(true);
    });

    it('should create base directory on connect', async () => {
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should throw error when using disconnected adapter', async () => {
      await adapter.disconnect();
      await expect(adapter.get('test')).rejects.toThrow('Storage adapter not connected');
    });
  });

  describe('get/set', () => {
    it('should store and retrieve value', async () => {
      const key = 'test:key';
      const value = { name: 'test', count: 42 };

      await adapter.set(key, value);
      const retrieved = await adapter.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await adapter.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should handle nested keys', async () => {
      const key = 'level1:level2:level3:key';
      const value = 'nested value';

      await adapter.set(key, value);
      const retrieved = await adapter.get(key);

      expect(retrieved).toBe(value);

      // Check file structure
      const filePath = path.join(testDir, 'level1', 'level2', 'level3', 'key.json');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should overwrite existing value', async () => {
      const key = 'test:key';

      await adapter.set(key, 'value1');
      await adapter.set(key, 'value2');

      const retrieved = await adapter.get(key);
      expect(retrieved).toBe('value2');
    });

    it('should handle various data types', async () => {
      await adapter.set('string', 'hello');
      await adapter.set('number', 123);
      await adapter.set('boolean', true);
      await adapter.set('array', [1, 2, 3]);
      await adapter.set('object', { a: 1, b: 'two' });
      await adapter.set('null', null);

      expect(await adapter.get('string')).toBe('hello');
      expect(await adapter.get('number')).toBe(123);
      expect(await adapter.get('boolean')).toBe(true);
      expect(await adapter.get('array')).toEqual([1, 2, 3]);
      expect(await adapter.get('object')).toEqual({ a: 1, b: 'two' });
      expect(await adapter.get('null')).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      const key = 'test:key';
      await adapter.set(key, 'value');

      const deleted = await (adapter as any).tryDelete(key);
      expect(deleted).toBe(true);

      const retrieved = await adapter.get(key);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await (adapter as any).tryDelete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should clean up empty directories', async () => {
      const key = 'deep:nested:structure:key';
      await adapter.set(key, 'value');
      await adapter.delete(key);

      // Check that empty directories are removed
      const deepDir = path.join(testDir, 'deep');
      const exists = await fs.access(deepDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      const key = 'test:key';
      await adapter.set(key, 'value');

      const exists = await adapter.has(key);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await adapter.has('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('keys', () => {
    it('should list all keys', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      await adapter.set('nested:key3', 'value3');

      const keys = await adapter.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('nested:key3');
    });

    it('should filter keys by prefix', async () => {
      await adapter.set('user:1', { name: 'Alice' });
      await adapter.set('user:2', { name: 'Bob' });
      await adapter.set('config:app', { version: '1.0' });

      const userKeys = await adapter.keys('user:');
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
      expect(userKeys).not.toContain('config:app');
    });

    it('should return empty array when no keys match', async () => {
      const keys = await adapter.keys('non-existent:');
      expect(keys).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all keys', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      await adapter.set('nested:key3', 'value3');

      await adapter.clear();

      const keys = await adapter.keys();
      expect(keys).toHaveLength(0);
    });

    it('should preserve hidden files', async () => {
      await adapter.set('key1', 'value1');

      // Create a hidden file
      const hiddenFile = path.join(testDir, '.hidden');
      await fs.writeFile(hiddenFile, 'hidden content');

      await adapter.clear();

      // Hidden file should still exist
      const exists = await fs.access(hiddenFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('size', () => {
    it('should calculate total storage size', async () => {
      await adapter.set('key1', 'short value');
      await adapter.set('key2', 'a'.repeat(1000)); // 1KB of 'a'

      const size = await adapter.size();
      expect(size).toBeGreaterThan(1000);
    });

    it('should return 0 for empty storage', async () => {
      const size = await adapter.size();
      expect(size).toBe(0);
    });
  });

  describe('batch', () => {
    it('should execute batch operations', async () => {
      await adapter.set('existing', 'value');

      const results = await adapter.batch([
        { type: 'set', key: 'new1', value: 'value1' },
        { type: 'set', key: 'new2', value: 'value2' },
        { type: 'get', key: 'existing' },
        { type: 'get', key: 'non-existent' },
        { type: 'delete', key: 'existing' },
        { type: 'delete', key: 'non-existent' },
      ]);

      expect(results).toEqual([
        true,       // set new1
        true,       // set new2
        'value',    // get existing
        null,       // get non-existent
        true,       // delete existing
        false,      // delete non-existent
      ]);

      // Verify operations were applied
      expect(await adapter.get('new1')).toBe('value1');
      expect(await adapter.get('new2')).toBe('value2');
      expect(await adapter.get('existing')).toBeNull();
    });
  });

  describe('security', () => {
    it('should prevent path traversal', async () => {
      const maliciousKey = '../../../etc/passwd';

      await expect(adapter.set(maliciousKey, 'evil')).rejects.toThrow('Invalid key');
    });

    it('should sanitize keys', async () => {
      const key = 'test<>:"|?*key';
      const value = 'sanitized';

      await adapter.set(key, value);
      const retrieved = await adapter.get(key);

      expect(retrieved).toBe(value);
    });
  });
});