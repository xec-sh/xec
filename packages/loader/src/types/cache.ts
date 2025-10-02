/**
 * Caching system types
 * @module @xec-sh/loader/types/cache
 */

/**
 * Cache entry metadata
 */
export interface CacheEntry<T = any> {
  /** Cached value */
  content: T;

  /** Timestamp when cached */
  timestamp: number;

  /** Optional metadata */
  metadata?: Record<string, any>;

  /** Module type (for module cache) */
  moduleType?: 'esm' | 'cjs' | 'umd' | 'unknown';

  /** Response headers (for module cache) */
  headers?: Record<string, string>;
}

/**
 * Cache interface
 */
export interface Cache<T = any> {
  /** Get value from cache */
  get(key: string): Promise<T | null>;

  /** Set value in cache */
  set(key: string, value: T, ttl?: number): Promise<void>;

  /** Check if key exists in cache */
  has(key: string): Promise<boolean>;

  /** Delete value from cache */
  delete(key: string): Promise<void>;

  /** Clear all cache entries */
  clear(): Promise<void>;

  /** Get cache statistics */
  stats(): Promise<CacheStats>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of entries in memory */
  memoryEntries: number;

  /** Number of entries on disk */
  fileEntries: number;

  /** Total size in bytes */
  totalSize: number;

  /** Cache hit rate (0-1) */
  hitRate?: number;
}

/**
 * Memory cache options
 */
export interface MemoryCacheOptions {
  /** Maximum number of entries */
  maxSize?: number;

  /** Default TTL in seconds */
  ttl?: number;
}

/**
 * File system cache options
 */
export interface FileSystemCacheOptions {
  /** Cache directory path */
  cacheDir: string;

  /** Default TTL in seconds */
  ttl?: number;

  /** Enable compression */
  compress?: boolean;
}

/**
 * Hybrid cache options (memory + disk)
 */
export interface HybridCacheOptions {
  /** Memory limit (number of entries) */
  memoryLimit: number;

  /** Disk cache path */
  diskPath: string;

  /** Default TTL in seconds */
  ttl?: number;
}
