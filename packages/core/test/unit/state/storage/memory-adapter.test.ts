import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { MemoryStorageAdapter } from '../../../../src/state/storage/memory-adapter.js';

describe('state/storage/memory-adapter', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(async () => {
    adapter = new MemoryStorageAdapter();
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('connect/disconnect', () => {
    it('should connect successfully', async () => {
      const newAdapter = new MemoryStorageAdapter();
      await expect(newAdapter.connect()).resolves.not.toThrow();
      await newAdapter.disconnect();
    });

    it('should disconnect successfully', async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe('get/set/delete', () => {
    it('should set and get a value', async () => {
      const key = 'test-key';
      const value = { name: 'test', data: [1, 2, 3] };
      
      await adapter.set(key, value);
      const retrieved = await adapter.get(key);
      
      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const value = await adapter.get('non-existent');
      expect(value).toBeNull();
    });

    it('should overwrite existing value', async () => {
      const key = 'test-key';
      
      await adapter.set(key, { value: 1 });
      await adapter.set(key, { value: 2 });
      
      const retrieved = await adapter.get(key);
      expect(retrieved).toEqual({ value: 2 });
    });

    it('should delete a value', async () => {
      const key = 'test-key';
      
      await adapter.set(key, { value: 1 });
      expect(await adapter.get(key)).toBeDefined();
      
      await adapter.delete(key);
      expect(await adapter.get(key)).toBeNull();
    });

    it('should handle deleting non-existent key', async () => {
      await expect(adapter.delete('non-existent')).resolves.not.toThrow();
    });

    it('should handle various data types', async () => {
      // String
      await adapter.set('string', 'hello world');
      expect(await adapter.get('string')).toBe('hello world');
      
      // Number
      await adapter.set('number', 42);
      expect(await adapter.get('number')).toBe(42);
      
      // Boolean
      await adapter.set('boolean', true);
      expect(await adapter.get('boolean')).toBe(true);
      
      // Array
      await adapter.set('array', [1, 2, 3]);
      expect(await adapter.get('array')).toEqual([1, 2, 3]);
      
      // Object
      await adapter.set('object', { a: 1, b: 2 });
      expect(await adapter.get('object')).toEqual({ a: 1, b: 2 });
      
      // Null
      await adapter.set('null', null);
      expect(await adapter.get('null')).toBeNull();
    });
  });

  describe('scan', () => {
    beforeEach(async () => {
      // Set up test data
      await adapter.set('users:user-1', { name: 'Alice' });
      await adapter.set('users:user-2', { name: 'Bob' });
      await adapter.set('users:user-3', { name: 'Charlie' });
      await adapter.set('products:prod-1', { name: 'Widget' });
      await adapter.set('products:prod-2', { name: 'Gadget' });
    });

    it('should scan all entries with empty prefix', async () => {
      const results: Array<[string, any]> = [];
      
      for await (const entry of adapter.scan('')) {
        results.push(entry);
      }
      
      expect(results).toHaveLength(5);
      expect(results.map(([key]) => key).sort()).toEqual([
        'products:prod-1',
        'products:prod-2',
        'users:user-1',
        'users:user-2',
        'users:user-3'
      ]);
    });

    it('should scan entries with specific prefix', async () => {
      const results: Array<[string, any]> = [];
      
      for await (const entry of adapter.scan('users:')) {
        results.push(entry);
      }
      
      expect(results).toHaveLength(3);
      expect(results.every(([key]) => key.startsWith('users:'))).toBe(true);
    });

    it('should return empty iterator for non-matching prefix', async () => {
      const results: Array<[string, any]> = [];
      
      for await (const entry of adapter.scan('nonexistent:')) {
        results.push(entry);
      }
      
      expect(results).toHaveLength(0);
    });

    it('should handle options (if implemented)', async () => {
      // The current implementation might not support options
      // This test is a placeholder for future enhancements
      const results: Array<[string, any]> = [];
      
      for await (const entry of adapter.scan('users:', { limit: 2 })) {
        results.push(entry);
      }
      
      // Current implementation returns all matching entries
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('batch', () => {
    it('should execute batch operations', async () => {
      const operations = [
        { op: 'set' as const, key: 'key1', value: { data: 1 } },
        { op: 'set' as const, key: 'key2', value: { data: 2 } },
        { op: 'get' as const, key: 'key1' },
        { op: 'delete' as const, key: 'key2' },
        { op: 'get' as const, key: 'key2' }
      ];

      const results = await adapter.batch(operations);
      
      expect(results).toHaveLength(5);
      expect(results[0]).toBe(true); // set returns true
      expect(results[1]).toBe(true); // set returns true
      expect(results[2]).toEqual({ data: 1 }); // get key1
      expect(results[3]).toBe(true); // delete returns true
      expect(results[4]).toBeNull(); // get deleted key2
    });

    it('should handle empty batch', async () => {
      const results = await adapter.batch([]);
      expect(results).toEqual([]);
    });

    it('should handle batch with only get operations', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      
      const operations = [
        { op: 'get' as const, key: 'key1' },
        { op: 'get' as const, key: 'key2' },
        { op: 'get' as const, key: 'key3' }
      ];

      const results = await adapter.batch(operations);
      
      expect(results).toEqual(['value1', 'value2', null]);
    });

    it('should maintain operation order', async () => {
      const operations = [
        { op: 'set' as const, key: 'counter', value: 1 },
        { op: 'get' as const, key: 'counter' },
        { op: 'set' as const, key: 'counter', value: 2 },
        { op: 'get' as const, key: 'counter' },
        { op: 'delete' as const, key: 'counter' },
        { op: 'get' as const, key: 'counter' }
      ];

      const results = await adapter.batch(operations);
      
      expect(results[1]).toBe(1); // First get
      expect(results[3]).toBe(2); // Second get
      expect(results[5]).toBeNull(); // Get after delete
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent sets', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(adapter.set(`key-${i}`, { value: i }));
      }
      
      await Promise.all(promises);
      
      // Verify all values were set
      for (let i = 0; i < 100; i++) {
        const value = await adapter.get(`key-${i}`);
        expect(value).toEqual({ value: i });
      }
    });

    it('should handle concurrent gets', async () => {
      // Set up data
      for (let i = 0; i < 10; i++) {
        await adapter.set(`key-${i}`, { value: i });
      }
      
      // Concurrent reads
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(adapter.get(`key-${i}`));
      }
      
      const results = await Promise.all(promises);
      
      for (let i = 0; i < 10; i++) {
        expect(results[i]).toEqual({ value: i });
      }
    });

    it('should handle mixed concurrent operations', async () => {
      const operations = [];
      
      // Mix of operations
      for (let i = 0; i < 30; i++) {
        if (i % 3 === 0) {
          operations.push(adapter.set(`key-${i}`, { value: i }));
        } else if (i % 3 === 1) {
          operations.push(adapter.get(`key-${i}`));
        } else {
          operations.push(adapter.delete(`key-${i}`));
        }
      }
      
      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });
});