/**
 * Module caching implementations
 * @module @xec-sh/loader/module/module-cache
 */

import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';

import type { Cache, CacheEntry, CacheStats, MemoryCacheOptions, FileSystemCacheOptions } from '../types/index.js';

/**
 * In-memory cache implementation
 */
export class MemoryCache<T = any> implements Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(options: MemoryCacheOptions = {}) {
    this.maxSize = options.maxSize || 500;
    this.ttl = (options.ttl || 3600) * 1000; // Convert to ms
  }

  async get(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.content;
  }

  async set(key: string, value: T, _ttl?: number): Promise<void> {
    // Enforce max size (LRU-like eviction)
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      content: value,
      timestamp: Date.now(),
    });
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async stats(): Promise<CacheStats> {
    return {
      memoryEntries: this.cache.size,
      fileEntries: 0,
      totalSize: 0,
    };
  }
}

/**
 * File system cache implementation
 */
export class FileSystemCache implements Cache<string> {
  private cacheDir: string;
  private ttl: number;

  constructor(options: FileSystemCacheOptions) {
    this.cacheDir = options.cacheDir;
    this.ttl = (options.ttl || 3600) * 1000; // Convert to ms
  }

  async get(key: string): Promise<string | null> {
    const filePath = this.getCachePath(key);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const entry: CacheEntry<string> = JSON.parse(content);

      // Check if expired
      if (Date.now() - entry.timestamp > this.ttl) {
        await fs.unlink(filePath).catch(() => {});
        return null;
      }

      return entry.content;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, _ttl?: number): Promise<void> {
    const filePath = this.getCachePath(key);
    const entry: CacheEntry<string> = {
      content: value,
      timestamp: Date.now(),
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getCachePath(key);
    await fs.unlink(filePath).catch(() => {});
  }

  async clear(): Promise<void> {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch {
      // Ignore errors
    }
  }

  async stats(): Promise<CacheStats> {
    let fileCount = 0;
    let totalSize = 0;

    try {
      const files = await fs.readdir(this.cacheDir, { recursive: true });
      for (const file of files) {
        const filePath = path.join(this.cacheDir, String(file));
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            fileCount++;
            totalSize += stats.size;
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Directory doesn't exist or not accessible
    }

    return {
      memoryEntries: 0,
      fileEntries: fileCount,
      totalSize,
    };
  }

  private getCachePath(key: string): string {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.cacheDir, hash.substring(0, 2), hash + '.json');
  }
}

/**
 * Hybrid cache (memory + disk)
 */
export class HybridCache implements Cache<string> {
  private memoryCache: MemoryCache<string>;
  private diskCache: FileSystemCache;

  constructor(memoryOptions: MemoryCacheOptions, diskOptions: FileSystemCacheOptions) {
    this.memoryCache = new MemoryCache(memoryOptions);
    this.diskCache = new FileSystemCache(diskOptions);
  }

  async get(key: string): Promise<string | null> {
    // Try memory first
    let value = await this.memoryCache.get(key);
    if (value !== null) return value;

    // Try disk
    value = await this.diskCache.get(key);
    if (value !== null) {
      // Promote to memory cache
      await this.memoryCache.set(key, value);
      return value;
    }

    return null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    // Write to both caches
    await Promise.all([
      this.memoryCache.set(key, value, ttl),
      this.diskCache.set(key, value, ttl),
    ]);
  }

  async has(key: string): Promise<boolean> {
    const hasMemory = await this.memoryCache.has(key);
    if (hasMemory) return true;

    return this.diskCache.has(key);
  }

  async delete(key: string): Promise<void> {
    await Promise.all([
      this.memoryCache.delete(key),
      this.diskCache.delete(key),
    ]);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.memoryCache.clear(),
      this.diskCache.clear(),
    ]);
  }

  async stats(): Promise<CacheStats> {
    const [memStats, diskStats] = await Promise.all([
      this.memoryCache.stats(),
      this.diskCache.stats(),
    ]);

    return {
      memoryEntries: memStats.memoryEntries,
      fileEntries: diskStats.fileEntries,
      totalSize: diskStats.totalSize,
    };
  }
}
