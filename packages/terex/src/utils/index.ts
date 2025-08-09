/**
 * Utility functions for Terex
 * Common helpers and utilities
 */

import type { Output } from '../core/types.js';

// ============================================================================
// Rendering Utilities
// ============================================================================

/**
 * No-op function for placeholders
 */
export function noop(): void {
  // Intentionally empty
}

/**
 * Identity function
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * Check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    return value; // Return original value for invalid range
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Create a range of numbers
 */
export function range(start: number, end?: number, step = 1): number[] {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (!array || size <= 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Flatten an array one level deep
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  if (!array) return [];
  const result: T[] = [];
  for (const item of array) {
    if (Array.isArray(item)) {
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Get unique values from an array
 */
export function unique<T>(array: T[]): T[] {
  if (!array) return [];
  return [...new Set(array)];
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  let timeout: NodeJS.Timeout | null = null;
  let savedArgs: Parameters<T> | null = null;
  let hasPendingCall = false;
  
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall);
    savedArgs = args; // Always save the latest arguments
    
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
        hasPendingCall = false;
      }
      lastCall = now;
      fn(...args);
    } else if (!hasPendingCall) {
      hasPendingCall = true;
      timeout = setTimeout(() => {
        lastCall = Date.now();
        timeout = null;
        hasPendingCall = false;
        if (savedArgs) {
          fn(...savedArgs);
        }
      }, remaining);
    }
  }) as T;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): T & { cancel(): void } {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      fn(...args);
    }, delay);
  }) as T & { cancel(): void };
  
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as T;
  }
  
  if (obj instanceof Object) {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;
  
  const source = sources.shift();
  if (!source) return target;
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (isObject(targetValue) && isObject(sourceValue)) {
        target[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        target[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }
  
  return deepMerge(target, ...sources);
}

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if value is a plain object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && value.constructor === Object;
}

/**
 * Check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Create a unique ID
 */
export function uniqueId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}${timestamp}-${random}`;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Measure function execution time
 */
export async function measureTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const time = performance.now() - start;
  return { result, time };
}

/**
 * Memoize a function
 */
export function memoize<T extends (...args: never[]) => unknown>(
  fn: T,
  getKey?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = fn(...args);
    cache.set(key, result as ReturnType<T>);
    return result;
  }) as T;
}

/**
 * Compose functions from right to left
 */
export function compose<T>(...fns: ((arg: T) => T)[]): (arg: T) => T {
  return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

/**
 * Pipe functions from left to right
 */
export function pipe<T>(...fns: ((arg: T) => T)[]): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}

/**
 * Create a deferred promise
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}

// ============================================================================
// Rendering Utilities
// ============================================================================

/**
 * Overlay child output onto parent buffer lines
 * Extracted from container components to avoid duplication
 */
export function overlayChildOutput(
  parentLines: string[],
  childOutput: Output,
  x: number,
  y: number,
  width: number,
  height: number,
  parentWidth: number
): void {
  const childLines = childOutput.lines;

  for (let childY = 0; childY < Math.min(childLines.length, height); childY++) {
    const parentY = y + childY;
    
    if (parentY >= 0 && parentY < parentLines.length) {
      const childLine = childLines[childY] ?? '';
      
      // Get visual length and create properly sized output
      const visualLength = getStringVisualLength(childLine);
      const clippedLine = visualLength <= width 
        ? childLine + ' '.repeat(width - visualLength)
        : truncateString(childLine, width);

      // Replace the section of the parent line
      const parentLine = parentLines[parentY];
      if (parentLine !== undefined) {
        const before = parentLine.substring(0, Math.max(0, x));
        const after = parentLine.substring(x + width);
        
        // Ensure we maintain the parent line's full width
        let result = before + clippedLine + after;
        const resultVisualLength = getStringVisualLength(result);
        
        // Pad to parentWidth if shorter
        if (resultVisualLength < parentWidth) {
          result += ' '.repeat(parentWidth - resultVisualLength);
        }
        
        parentLines[parentY] = result;
      }
    }
  }
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Strip ANSI escape sequences from a string
 * Extracted from input components to avoid duplication
 */
export function stripAnsi(str: string | undefined): string {
  if (!str) return '';
  // Only remove well-formed ANSI sequences with proper terminators
  // Be conservative: only strip sequences that end with common ANSI terminators
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mABCDEFGHJKSTfhlnpsu]/g, '');
}

/**
 * Get the visual length of a string (excluding ANSI codes)
 */
export function getStringVisualLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Truncate a string to a specific visual length, preserving ANSI codes
 */
export function truncateString(str: string, maxLength: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= maxLength) {
    return str;
  }
  
  // Find position in original string that corresponds to maxLength visual chars
  let visualLength = 0;
  let position = 0;
  let inEscape = false;
  
  while (position < str.length && visualLength < maxLength) {
    const char = str[position];
    
    if (char === '\x1b') {
      inEscape = true;
    } else if (inEscape && char === 'm') {
      inEscape = false;
    } else if (!inEscape) {
      visualLength++;
    }
    
    position++;
  }
  
  return str.substring(0, position);
}

/**
 * Get visual length of a string (alias for getStringVisualLength)
 */
export function visualLength(str: string): number {
  return getStringVisualLength(str);
}

// ============================================================================
// Performance Optimizations
// ============================================================================

/**
 * Batch manager for grouping updates together
 */
export class BatchManager {
  private batches = new Map<string, Set<() => void>>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private isProcessing = false;

  /**
   * Add a function to a batch
   */
  batch(batchId: string, fn: () => void, delay = 0): void {
    if (!this.batches.has(batchId)) {
      this.batches.set(batchId, new Set());
    }

    this.batches.get(batchId)!.add(fn);

    // Clear existing timeout
    const existingTimeout = this.timeouts.get(batchId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.processBatch(batchId);
    }, delay);

    this.timeouts.set(batchId, timeout);
  }

  /**
   * Process a specific batch immediately
   */
  processBatch(batchId: string): void {
    const batch = this.batches.get(batchId);
    if (!batch || batch.size === 0) return;

    // Clear timeout
    const timeout = this.timeouts.get(batchId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(batchId);
    }

    // Execute all functions in batch
    this.isProcessing = true;
    try {
      for (const fn of batch) {
        try {
          fn();
        } catch (error) {
          console.error('Error in batched function:', error);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    // Clear batch
    this.batches.delete(batchId);
  }

  /**
   * Process all batches immediately
   */
  processAll(): void {
    for (const batchId of this.batches.keys()) {
      this.processBatch(batchId);
    }
  }

  /**
   * Clear a specific batch
   */
  clearBatch(batchId: string): void {
    const timeout = this.timeouts.get(batchId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(batchId);
    }
    this.batches.delete(batchId);
  }

  /**
   * Clear all batches
   */
  clearAll(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.batches.clear();
  }

  /**
   * Check if currently processing batches
   */
  isProcessingBatch(): boolean {
    return this.isProcessing;
  }

  /**
   * Get number of pending batches
   */
  getPendingBatchCount(): number {
    return this.batches.size;
  }
}

// Global batch manager instance
export const batchManager = new BatchManager();

/**
 * Enhanced memoization with TTL and LRU eviction
 */
export interface MemoizeOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size
  getKey?: (...args: never[]) => string;
}

export function memoizeAdvanced<T extends (...args: never[]) => unknown>(
  fn: T,
  options: MemoizeOptions = {}
): T & { cache: Map<string, { value: ReturnType<T>; timestamp: number }>; clear(): void } {
  const cache = new Map<string, { value: ReturnType<T>; timestamp: number }>();
  const { ttl, maxSize = 100, getKey } = options;

  const memoized = ((...args: Parameters<T>) => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);
    const now = Date.now();

    // Check if cached value exists and is not expired
    const cached = cache.get(key);
    if (cached) {
      if (!ttl || now - cached.timestamp < ttl) {
        return cached.value;
      } else {
        cache.delete(key); // Remove expired entry
      }
    }

    // Compute new value
    const result = fn(...args) as ReturnType<T>;

    // Store in cache
    cache.set(key, { value: result, timestamp: now });

    // Evict oldest entries if cache is too large
    if (maxSize && cache.size > maxSize) {
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, cache.size - maxSize);
      for (const [keyToRemove] of toRemove) {
        cache.delete(keyToRemove);
      }
    }

    return result;
  }) as T & { cache: Map<string, { value: ReturnType<T>; timestamp: number }>; clear(): void };

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized;
}

/**
 * Resource manager for tracking and cleaning up resources
 */
export class ResourceManager {
  private resources = new Map<string, {
    resource: unknown;
    cleanup: () => void | Promise<void>;
    timestamp: number;
  }>();

  /**
   * Register a resource with cleanup function
   */
  register<T>(id: string, resource: T, cleanup: () => void | Promise<void>): T {
    // Clean up existing resource with same ID
    this.unregister(id);

    this.resources.set(id, {
      resource,
      cleanup,
      timestamp: Date.now()
    });

    return resource;
  }

  /**
   * Unregister and cleanup a resource
   */
  async unregister(id: string): Promise<void> {
    const entry = this.resources.get(id);
    if (entry) {
      this.resources.delete(id);
      try {
        await entry.cleanup();
      } catch (error) {
        console.error(`Failed to cleanup resource ${id}:`, error);
      }
    }
  }

  /**
   * Get a registered resource
   */
  get<T>(id: string): T | undefined {
    return this.resources.get(id)?.resource as T | undefined;
  }

  /**
   * Check if resource is registered
   */
  has(id: string): boolean {
    return this.resources.has(id);
  }

  /**
   * Get all resource IDs
   */
  getIds(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Clean up resources older than specified age
   */
  async cleanupOld(maxAge: number): Promise<void> {
    const now = Date.now();
    const oldResources: string[] = [];

    for (const [id, entry] of this.resources) {
      if (now - entry.timestamp > maxAge) {
        oldResources.push(id);
      }
    }

    for (const id of oldResources) {
      await this.unregister(id);
    }
  }

  /**
   * Clean up all resources
   */
  async dispose(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const id of this.resources.keys()) {
      promises.push(this.unregister(id));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Get resource count
   */
  size(): number {
    return this.resources.size;
  }
}

/**
 * Performance profiler for measuring execution times and memory usage
 */
export class PerformanceProfiler {
  private measurements = new Map<string, {
    count: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    avgTime: number;
    memoryUsage?: number;
  }>();

  /**
   * Measure a function's performance
   */
  async measure<T>(
    name: string,
    fn: () => T | Promise<T>,
    includeMemory = false
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = includeMemory ? this.getMemoryUsage() : undefined;

    try {
      const result = await fn();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.recordMeasurement(name, duration, startMemory);
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.recordMeasurement(name, duration, startMemory);
      throw error;
    }
  }

  /**
   * Start a measurement
   */
  start(name: string, includeMemory = false): { end(): void } {
    const startTime = performance.now();
    const startMemory = includeMemory ? this.getMemoryUsage() : undefined;

    return {
      end: () => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        this.recordMeasurement(name, duration, startMemory);
      }
    };
  }

  /**
   * Record a measurement
   */
  private recordMeasurement(name: string, duration: number, startMemory?: number): void {
    const existing = this.measurements.get(name);
    
    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.minTime = Math.min(existing.minTime, duration);
      existing.maxTime = Math.max(existing.maxTime, duration);
      existing.avgTime = existing.totalTime / existing.count;
      
      if (startMemory !== undefined) {
        const currentMemory = this.getMemoryUsage();
        existing.memoryUsage = currentMemory - startMemory;
      }
    } else {
      this.measurements.set(name, {
        count: 1,
        totalTime: duration,
        minTime: duration,
        maxTime: duration,
        avgTime: duration,
        memoryUsage: startMemory !== undefined ? this.getMemoryUsage() - startMemory : undefined
      });
    }
  }

  /**
   * Get measurements for a specific operation
   */
  get(name: string): typeof this.measurements extends Map<string, infer T> ? T | undefined : never {
    return this.measurements.get(name);
  }

  /**
   * Get all measurements
   */
  getAll(): Map<string, ReturnType<typeof this.get>> {
    return new Map(this.measurements);
  }

  /**
   * Clear specific measurement
   */
  clear(name: string): void {
    this.measurements.delete(name);
  }

  /**
   * Clear all measurements
   */
  clearAll(): void {
    this.measurements.clear();
  }

  /**
   * Get summary report
   */
  getReport(): string {
    const lines: string[] = ['Performance Report:'];
    lines.push(''.padEnd(50, '─'));

    for (const [name, stats] of this.measurements) {
      lines.push(`${name}:`);
      lines.push(`  Count: ${stats.count}`);
      lines.push(`  Total: ${stats.totalTime.toFixed(2)}ms`);
      lines.push(`  Avg: ${stats.avgTime.toFixed(2)}ms`);
      lines.push(`  Min: ${stats.minTime.toFixed(2)}ms`);
      lines.push(`  Max: ${stats.maxTime.toFixed(2)}ms`);
      
      if (stats.memoryUsage !== undefined) {
        lines.push(`  Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get memory usage in bytes (Node.js specific)
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
}

// Global profiler instance
export const profiler = new PerformanceProfiler();

/**
 * Frame rate limiter for smooth animations and updates
 */
export class FrameLimiter {
  private lastFrame = 0;
  private targetInterval: number;

  constructor(fps = 60) {
    this.targetInterval = 1000 / fps;
  }

  /**
   * Request next frame
   */
  requestFrame(callback: () => void): void {
    const now = Date.now();
    const elapsed = now - this.lastFrame;

    if (elapsed >= this.targetInterval) {
      this.lastFrame = now;
      callback();
    } else {
      setTimeout(() => {
        this.requestFrame(callback);
      }, this.targetInterval - elapsed);
    }
  }

  /**
   * Set target FPS
   */
  setFPS(fps: number): void {
    this.targetInterval = 1000 / fps;
  }

  /**
   * Get current FPS
   */
  getCurrentFPS(): number {
    return 1000 / this.targetInterval;
  }
}

/**
 * Object pool for reusing objects to reduce GC pressure
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn?: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn?: (obj: T) => void, maxSize = 100) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  /**
   * Get an object from the pool
   */
  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  /**
   * Return an object to the pool
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.pool.push(obj);
    }
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool.length = 0;
  }

  /**
   * Get pool size
   */
  size(): number {
    return this.pool.length;
  }

  /**
   * Pre-fill the pool with objects
   */
  preFill(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.pool.length < this.maxSize) {
        this.pool.push(this.createFn());
      }
    }
  }
}

/**
 * Lazy value container that computes value only when needed
 */
export class Lazy<T> {
  private value: T | undefined = undefined;
  private computed = false;
  private computeFn: () => T;

  constructor(computeFn: () => T) {
    this.computeFn = computeFn;
  }

  /**
   * Get the value (computing it if necessary)
   */
  get(): T {
    if (!this.computed) {
      this.value = this.computeFn();
      this.computed = true;
    }
    return this.value!;
  }

  /**
   * Reset the lazy value
   */
  reset(): void {
    this.value = undefined;
    this.computed = false;
  }

  /**
   * Check if value has been computed
   */
  isComputed(): boolean {
    return this.computed;
  }

  /**
   * Set the value directly
   */
  set(value: T): void {
    this.value = value;
    this.computed = true;
  }
}