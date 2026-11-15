import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import {
  MemoryCache,
  HybridCache,
  FileSystemCache,
} from '../../../src/module/module-cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache({ maxSize: 3, ttl: 1 }); // 1 second TTL
  });

  it('supports explicit no-retention without changing normal LRU semantics', async () => {
    const disabled = new MemoryCache({ maxSize: 0 });
    await disabled.set('source', 'private');
    expect(await disabled.get('source')).toBeNull();
    expect(await disabled.has('source')).toBe(false);
    expect(await disabled.stats()).toEqual({ memoryEntries: 0, fileEntries: 0, totalSize: 0 });
    for (const maxSize of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new MemoryCache({ maxSize })).toThrow('nonnegative safe integer');
    }
  });

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1');
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const value = await cache.get('non-existent');
    expect(value).toBeNull();
  });

  it('should check if key exists', async () => {
    await cache.set('key1', 'value1');
    expect(await cache.has('key1')).toBe(true);
    expect(await cache.has('non-existent')).toBe(false);
  });

  it('should delete keys', async () => {
    await cache.set('key1', 'value1');
    await cache.delete('key1');
    expect(await cache.has('key1')).toBe(false);
  });

  it('should clear all entries', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    expect(await cache.has('key1')).toBe(false);
    expect(await cache.has('key2')).toBe(false);
  });

  it('should respect TTL', async () => {
    await cache.set('key1', 'value1');
    expect(await cache.get('key1')).toBe('value1');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(await cache.get('key1')).toBeNull();
  });

  it('should enforce max size with LRU eviction', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');
    await cache.set('key4', 'value4'); // Should evict key1

    expect(await cache.has('key1')).toBe(false);
    expect(await cache.has('key2')).toBe(true);
    expect(await cache.has('key3')).toBe(true);
    expect(await cache.has('key4')).toBe(true);
  });

  it('should return accurate stats', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    const stats = await cache.stats();
    expect(stats.memoryEntries).toBe(2);
    expect(stats.fileEntries).toBe(0);
    expect(stats.totalSize).toBe(0);
  });
});

describe('FileSystemCache', () => {
  let cache: FileSystemCache;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-loader-test-'));
    cache = new FileSystemCache({ cacheDir: tempDir, ttl: 1 }); // 1 second TTL
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1');
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const value = await cache.get('non-existent');
    expect(value).toBeNull();
  });

  it('should check if key exists', async () => {
    await cache.set('key1', 'value1');
    expect(await cache.has('key1')).toBe(true);
    expect(await cache.has('non-existent')).toBe(false);
  });

  it('should delete keys', async () => {
    await cache.set('key1', 'value1');
    await cache.delete('key1');
    expect(await cache.has('key1')).toBe(false);
  });

  it('should clear all entries', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    expect(await cache.has('key1')).toBe(false);
    expect(await cache.has('key2')).toBe(false);
  });

  it('should respect TTL', async () => {
    await cache.set('key1', 'value1');
    expect(await cache.get('key1')).toBe('value1');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(await cache.get('key1')).toBeNull();
  });

  it('should create subdirectories based on hash', async () => {
    await cache.set('key1', 'value1');
    const files = await fs.readdir(tempDir, { recursive: true });
    expect(files.length).toBeGreaterThan(0);
  });

  it('should return accurate stats', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    const stats = await cache.stats();
    expect(stats.memoryEntries).toBe(0);
    expect(stats.fileEntries).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
  });
});

describe('FileSystemCache: ownership', () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-cache-owner-')); });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it('clears entries while retaining trust records, active sources and caller files', async () => {
    const cache = new FileSystemCache({ cacheDir: directory });
    await cache.set('entry', 'source');
    const preserved = ['module-lock.json', 'caller.txt', 'temp/active.mjs'];
    for (const file of preserved) {
      await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await fs.writeFile(path.join(directory, file), file);
    }
    await cache.clear();
    expect(await cache.get('entry')).toBeNull();
    for (const file of preserved) expect(await fs.readFile(path.join(directory, file), 'utf8')).toBe(file);
  });

  it('does not traverse symlinks or remove unrelated files inside the entry namespace', async () => {
    const cache = new FileSystemCache({ cacheDir: directory });
    await cache.set('entry', 'source');
    const entries = path.join(directory, 'entries-v2');
    const sentinel = path.join(entries, 'caller.txt');
    await fs.writeFile(sentinel, 'retain');
    const other = path.join(directory, 'other');
    await fs.mkdir(other);
    const target = path.join(other, 'af' + '0'.repeat(62) + '.json');
    await fs.writeFile(target, 'external');
    await fs.symlink(other, path.join(entries, 'af'), process.platform === 'win32' ? 'junction' : 'dir');
    await cache.clear();
    expect(await fs.readFile(sentinel, 'utf8')).toBe('retain');
    expect(await fs.readFile(target, 'utf8')).toBe('external');
    expect((await fs.lstat(path.join(entries, 'af'))).isSymbolicLink()).toBe(true);
  });

  it('reports an unusable cache directory instead of acknowledging cleanup', async () => {
    const cache = new FileSystemCache({ cacheDir: directory });
    await fs.writeFile(path.join(directory, 'entries-v2'), 'not a directory');
    await expect(cache.clear()).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});

describe('FileSystemCache: durability', () => {
  let cache: FileSystemCache;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-loader-durab-'));
    cache = new FileSystemCache({ cacheDir: tempDir, ttl: 60 });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function entryFiles(): Promise<string[]> {
    const names = await fs.readdir(tempDir, { recursive: true });
    return names.map(String).filter(n => n.endsWith('.json')).map(n => path.join(tempDir, n));
  }

  it.skipIf(process.platform === 'win32')('writes cache entries owner-only (0600)', async () => {
    await cache.set('module-source', 'export const token = 1;');

    const [file] = await entryFiles();
    expect(file).toBeDefined();
    expect((await fs.stat(file!)).mode & 0o777).toBe(0o600);
  });

  it('leaves no temp file behind after a write', async () => {
    await cache.set('k', 'v');

    const names = (await fs.readdir(tempDir, { recursive: true })).map(String);
    expect(names.some(n => n.endsWith('.tmp'))).toBe(false);
  });

  it('self-heals a corrupt entry: reports a miss and removes the file', async () => {
    await cache.set('k', 'v');
    const [file] = await entryFiles();
    await fs.writeFile(file!, '{ this is not valid json', 'utf-8');

    // A torn or truncated write must read as a miss, never throw...
    expect(await cache.get('k')).toBeNull();
    // ...and must not keep shadowing the key on every later read.
    expect(await entryFiles()).toEqual([]);
  });

  it('a concurrent write of the same key leaves one intact entry', async () => {
    const key = 'contended';
    await Promise.all([
      cache.set(key, 'A'.repeat(5000)),
      cache.set(key, 'B'.repeat(5000)),
    ]);

    // The atomic rename means the reader sees one whole write, not a splice.
    const value = await cache.get(key);
    expect(value).not.toBeNull();
    expect(['A'.repeat(5000), 'B'.repeat(5000)]).toContain(value);
  });
});

describe('HybridCache', () => {
  let cache: HybridCache;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-loader-test-'));
    cache = new HybridCache(
      { maxSize: 3, ttl: 10 },
      { cacheDir: tempDir, ttl: 10 }
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1');
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should check memory first, then disk', async () => {
    await cache.set('key1', 'value1');

    // First get should be from memory
    const value1 = await cache.get('key1');
    expect(value1).toBe('value1');

    // Clear memory, should still get from disk
    await cache.clear();
    await cache.set('key1', 'value1');
    const value2 = await cache.get('key1');
    expect(value2).toBe('value1');
  });

  it('should promote disk entries to memory on access', async () => {
    await cache.set('key1', 'value1');

    // Create new hybrid cache (fresh memory)
    const newCache = new HybridCache(
      { maxSize: 3, ttl: 10 },
      { cacheDir: tempDir, ttl: 10 }
    );

    // Should get from disk and promote to memory
    const value = await newCache.get('key1');
    expect(value).toBe('value1');
  });

  it('should delete from both memory and disk', async () => {
    await cache.set('key1', 'value1');
    await cache.delete('key1');

    expect(await cache.has('key1')).toBe(false);
  });

  it('should clear both memory and disk', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();

    expect(await cache.has('key1')).toBe(false);
    expect(await cache.has('key2')).toBe(false);
  });

  it('should return combined stats', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    const stats = await cache.stats();
    expect(stats.memoryEntries).toBe(2);
    expect(stats.fileEntries).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
  });
});
