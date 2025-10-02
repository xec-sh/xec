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
