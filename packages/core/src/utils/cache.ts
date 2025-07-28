import crypto from 'crypto';

import { ExecutionResult } from '../core/result.js';

import type { EnhancedEventEmitter } from './event-emitter.js';

export interface CacheOptions {
  key?: string;
  ttl?: number; // Time to live in milliseconds
  invalidateOn?: string[]; // List of command patterns that invalidate cache
}

export interface CachedResult {
  result: ExecutionResult;
  timestamp: number;
  ttl: number;
  key: string;
}

export class ResultCache {
  private cache: Map<string, CachedResult> = new Map();
  private inflight: Map<string, Promise<ExecutionResult>> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private eventEmitter?: EnhancedEventEmitter;

  constructor(cleanupIntervalMs: number = 60000, eventEmitter?: EnhancedEventEmitter) {
    this.eventEmitter = eventEmitter;
    // Run cleanup every minute by default
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
    
    // Don't keep process alive
    this.cleanupInterval.unref();
  }

  /**
   * Generate a cache key from command and options
   */
  generateKey(command: string, cwd?: string, env?: Record<string, string>): string {
    const data = {
      command,
      cwd: cwd || process.cwd(),
      env: env || {}
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Get an inflight promise if it exists
   */
  getInflight(key: string): Promise<ExecutionResult> | null {
    return this.inflight.get(key) || null;
  }

  /**
   * Set an inflight promise
   */
  setInflight(key: string, promise: Promise<ExecutionResult>): void {
    this.inflight.set(key, promise);
  }

  /**
   * Clear an inflight promise
   */
  clearInflight(key: string): void {
    this.inflight.delete(key);
  }

  /**
   * Get a cached result if it exists and is not expired
   */
  get(key: string): ExecutionResult | null {
    const cached = this.cache.get(key);
    
    if (!cached) {
      // Emit cache miss event
      if (this.eventEmitter) {
        this.eventEmitter.emitEnhanced('cache:miss', {
          key
        }, 'cache');
      }
      return null;
    }
    
    const now = Date.now();
    const age = now - cached.timestamp;
    
    // Check if expired
    if (cached.ttl > 0 && age > cached.ttl) {
      this.cache.delete(key);
      
      // Emit cache evict event
      if (this.eventEmitter) {
        this.eventEmitter.emitEnhanced('cache:evict', {
          key,
          reason: 'ttl'
        }, 'cache');
      }
      
      // Emit cache miss event
      if (this.eventEmitter) {
        this.eventEmitter.emitEnhanced('cache:miss', {
          key
        }, 'cache');
      }
      
      return null;
    }
    
    // Emit cache hit event
    if (this.eventEmitter) {
      this.eventEmitter.emitEnhanced('cache:hit', {
        key,
        ttl: cached.ttl,
        size: JSON.stringify(cached.result).length
      }, 'cache');
    }
    
    return cached.result;
  }

  /**
   * Store a result in the cache
   */
  set(key: string, result: ExecutionResult, ttl: number = 0): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl,
      key
    });
    
    // Emit cache set event
    if (this.eventEmitter) {
      this.eventEmitter.emitEnhanced('cache:set', {
        key,
        ttl,
        size: JSON.stringify(result).length
      }, 'cache');
    }
  }

  /**
   * Invalidate cache entries based on key patterns
   */
  invalidate(patterns: string[]): void {
    if (patterns.length === 0) return;
    
    const regexes = patterns.map(p => {
      // Convert glob-like patterns to regex
      const regexPattern = p
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
      return new RegExp(`^${regexPattern}$`);
    });
    
    for (const [key, cached] of this.cache.entries()) {
      if (regexes.some(regex => regex.test(key))) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    // This is a simplified version - in production you'd track hits/misses
    const size = this.cache.size;
    return {
      size,
      hits: 0,
      misses: 0,
      hitRate: 0
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, cached] of this.cache.entries()) {
      if (cached.ttl > 0) {
        const age = now - cached.timestamp;
        if (age > cached.ttl) {
          this.cache.delete(key);
          
          // Emit cache evict event
          if (this.eventEmitter) {
            this.eventEmitter.emitEnhanced('cache:evict', {
              key,
              reason: 'ttl'
            }, 'cache');
          }
        }
      }
    }
  }

  /**
   * Dispose of the cache and stop cleanup
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Global cache instance
export const globalCache = new ResultCache();