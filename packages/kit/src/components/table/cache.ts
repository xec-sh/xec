/**
 * Caching layer for table performance optimization (Phase 4)
 *
 * Provides various caching strategies to improve rendering performance:
 * - Column width caching
 * - Formatted cell caching
 * - Sort comparator caching
 * - Layout calculation caching
 */

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
}

/**
 * Cache eviction strategy
 */
export type CacheStrategy = 'lru' | 'lfu' | 'fifo';

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum number of entries */
  maxSize: number;

  /** Time-to-live in milliseconds */
  ttl?: number;

  /** Eviction strategy */
  strategy: CacheStrategy;
}

/**
 * Generic cache implementation
 */
export class Cache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private config: CacheConfig;
  private insertionOrder: K[] = [];

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      ttl: config.ttl,
      strategy: config.strategy ?? 'lru',
    };
  }

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (this.config.ttl && Date.now() - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access count for LFU
    entry.accessCount++;

    // Update LRU order
    if (this.config.strategy === 'lru') {
      this.updateLRU(key);
    }

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V): void {
    // Check if we need to evict
    if (!this.cache.has(key) && this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0,
    });

    // Track insertion order for FIFO
    if (this.config.strategy === 'fifo' && !this.insertionOrder.includes(key)) {
      this.insertionOrder.push(key);
    }

    // Update LRU order
    if (this.config.strategy === 'lru') {
      this.updateLRU(key);
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check TTL
    if (this.config.ttl && Date.now() - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: K): boolean {
    const result = this.cache.delete(key);
    const index = this.insertionOrder.indexOf(key);
    if (index >= 0) {
      this.insertionOrder.splice(index, 1);
    }
    return result;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.insertionOrder = [];
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
    strategy: CacheStrategy;
  } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      strategy: this.config.strategy,
    };
  }

  /**
   * Get or compute value
   */
  getOrCompute(key: K, compute: () => V): V {
    const cached = this.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = compute();
    this.set(key, value);
    return value;
  }

  /**
   * Evict entry based on strategy
   */
  private evict(): void {
    if (this.cache.size === 0) {
      return;
    }

    let keyToEvict: K | undefined;

    switch (this.config.strategy) {
      case 'fifo':
        keyToEvict = this.insertionOrder[0];
        break;

      case 'lru':
        keyToEvict = this.insertionOrder[0];
        break;

      case 'lfu': {
        let minAccessCount = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.accessCount < minAccessCount) {
            minAccessCount = entry.accessCount;
            keyToEvict = key;
          }
        }
        break;
      }
    }

    if (keyToEvict !== undefined) {
      this.delete(keyToEvict);
    }
  }

  /**
   * Update LRU order
   */
  private updateLRU(key: K): void {
    const index = this.insertionOrder.indexOf(key);
    if (index >= 0) {
      this.insertionOrder.splice(index, 1);
    }
    this.insertionOrder.push(key);
  }
}

/**
 * Memoization decorator for functions
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  config?: Partial<CacheConfig>
): T {
  const cache = new Cache<string, ReturnType<T>>(config);

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    return cache.getOrCompute(key, () => fn(...args));
  }) as T;
}

/**
 * Table-specific caches
 */
export class TableCache {
  private columnWidthCache: Cache<string, number>;
  private formattedCellCache: Cache<string, string>;
  private sortComparatorCache: Cache<string, (a: any, b: any) => number>;

  constructor(config: Partial<CacheConfig> = {}) {
    const defaultConfig = {
      maxSize: 1000,
      strategy: 'lru' as CacheStrategy,
      ...config,
    };

    this.columnWidthCache = new Cache(defaultConfig);
    this.formattedCellCache = new Cache({ ...defaultConfig, maxSize: 10000 });
    this.sortComparatorCache = new Cache({ ...defaultConfig, maxSize: 100 });
  }

  /**
   * Cache column width
   */
  cacheColumnWidth(columnKey: string, width: number): void {
    this.columnWidthCache.set(columnKey, width);
  }

  /**
   * Get cached column width
   */
  getColumnWidth(columnKey: string): number | undefined {
    return this.columnWidthCache.get(columnKey);
  }

  /**
   * Cache formatted cell
   */
  cacheFormattedCell(rowIndex: number, columnKey: string, formatted: string): void {
    const key = `${rowIndex}:${columnKey}`;
    this.formattedCellCache.set(key, formatted);
  }

  /**
   * Get cached formatted cell
   */
  getFormattedCell(rowIndex: number, columnKey: string): string | undefined {
    const key = `${rowIndex}:${columnKey}`;
    return this.formattedCellCache.get(key);
  }

  /**
   * Cache sort comparator
   */
  cacheSortComparator(columnKey: string, comparator: (a: any, b: any) => number): void {
    this.sortComparatorCache.set(columnKey, comparator);
  }

  /**
   * Get cached sort comparator
   */
  getSortComparator(columnKey: string): ((a: any, b: any) => number) | undefined {
    return this.sortComparatorCache.get(columnKey);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.columnWidthCache.clear();
    this.formattedCellCache.clear();
    this.sortComparatorCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      columnWidth: this.columnWidthCache.getStats(),
      formattedCell: this.formattedCellCache.getStats(),
      sortComparator: this.sortComparatorCache.getStats(),
    };
  }
}

/**
 * Global table cache instance
 */
let globalTableCache: TableCache | undefined;

/**
 * Get global table cache
 */
export function getGlobalTableCache(): TableCache {
  if (!globalTableCache) {
    globalTableCache = new TableCache();
  }
  return globalTableCache;
}

/**
 * Reset global table cache
 */
export function resetGlobalTableCache(): void {
  globalTableCache = undefined;
}
