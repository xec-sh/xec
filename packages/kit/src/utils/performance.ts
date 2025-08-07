// Performance optimization utilities

import { EventEmitter } from '../core/event-emitter.js';

// Polyfill for requestAnimationFrame in Node.js
const requestAnimationFrame = (typeof globalThis !== 'undefined' && (globalThis as any).requestAnimationFrame) || 
  ((callback: () => void) => setImmediate(callback));
const cancelAnimationFrame = (typeof globalThis !== 'undefined' && (globalThis as any).cancelAnimationFrame) || 
  ((id: any) => clearImmediate(id));

// Get current time using performance API or Date
export function now(): number {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
}

// Virtual scrolling for handling large datasets
export interface VirtualScrollOptions {
  itemHeight: number;
  viewportHeight: number;
  bufferSize?: number;
  overscan?: number;
}

export class VirtualScroller<T> {
  private items: T[] = [];
  private itemHeight: number;
  private viewportHeight: number;
  private bufferSize: number;
  private overscan: number;
  private scrollOffset: number = 0;
  
  constructor(options: VirtualScrollOptions) {
    this.itemHeight = options.itemHeight;
    this.viewportHeight = options.viewportHeight;
    this.bufferSize = options.bufferSize ?? 100;
    this.overscan = options.overscan ?? 3;
  }
  
  setItems(items: T[]) {
    this.items = items;
  }
  
  setScrollOffset(offset: number) {
    this.scrollOffset = Math.max(0, Math.min(offset, this.getMaxScrollOffset()));
  }
  
  getVisibleRange(): { start: number; end: number; items: T[] } {
    const startIndex = Math.floor(this.scrollOffset / this.itemHeight);
    const endIndex = Math.ceil((this.scrollOffset + this.viewportHeight) / this.itemHeight);
    
    // Add overscan
    const overscanStart = Math.max(0, startIndex - this.overscan);
    const overscanEnd = Math.min(this.items.length, endIndex + this.overscan);
    
    return {
      start: overscanStart,
      end: overscanEnd,
      items: this.items.slice(overscanStart, overscanEnd),
    };
  }
  
  getMaxScrollOffset(): number {
    return Math.max(0, this.items.length * this.itemHeight - this.viewportHeight);
  }
  
  getTotalHeight(): number {
    return this.items.length * this.itemHeight;
  }
  
  getItemOffset(index: number): number {
    return index * this.itemHeight;
  }
  
  scrollToIndex(index: number) {
    const offset = this.getItemOffset(index);
    this.setScrollOffset(offset);
  }
  
  // Handle dynamic item heights
  static createDynamic<T>(options: {
    viewportHeight: number;
    getItemHeight: (item: T, index: number) => number;
    bufferSize?: number;
    overscan?: number;
  }) {
    return new DynamicVirtualScroller(options);
  }
}

// Dynamic height virtual scroller
export class DynamicVirtualScroller<T> extends EventEmitter {
  private items: T[] = [];
  private viewportHeight: number;
  private getItemHeight: (item: T, index: number) => number;
  private bufferSize: number;
  private overscan: number;
  private scrollOffset: number = 0;
  private heightCache: Map<number, number> = new Map();
  private totalHeightCache: number | null = null;
  private defaultItemHeight: number = 30;
  
  constructor(options: {
    viewportHeight: number;
    getItemHeight: (item: T, index: number) => number;
    bufferSize?: number;
    overscan?: number;
  }) {
    super();
    
    this.viewportHeight = options.viewportHeight;
    this.getItemHeight = options.getItemHeight;
    this.bufferSize = options.bufferSize ?? 100;
    this.overscan = options.overscan ?? 3;
  }
  
  setItems(items: T[]) {
    this.items = items;
    this.heightCache.clear();
    this.totalHeightCache = null;
    this.emit('items-changed');
  }
  
  getVisibleRange(): { start: number; end: number; items: T[]; offsets: number[] } {
    let currentOffset = 0;
    let startIndex = -1;
    let endIndex = -1;
    const offsets: number[] = [];
    
    for (let i = 0; i < this.items.length; i++) {
      const height = this.getCachedHeight(i);
      
      if (startIndex === -1 && currentOffset + height > this.scrollOffset) {
        startIndex = Math.max(0, i - this.overscan);
      }
      
      if (currentOffset < this.scrollOffset + this.viewportHeight + this.overscan * 50) {
        endIndex = i;
      }
      
      if (i >= startIndex && i <= endIndex) {
        offsets.push(currentOffset);
      }
      
      currentOffset += height;
      
      if (currentOffset > this.scrollOffset + this.viewportHeight + this.overscan * 100) {
        break;
      }
    }
    
    return {
      start: startIndex,
      end: endIndex + 1,
      items: this.items.slice(startIndex, endIndex + 1),
      offsets: offsets.slice(0, endIndex - startIndex + 1),
    };
  }
  
  private getCachedHeight(index: number): number {
    if (!this.heightCache.has(index)) {
      const item = this.items[index];
      if (item === undefined) return this.defaultItemHeight;
      const height = this.getItemHeight(item, index);
      this.heightCache.set(index, height);
    }
    return this.heightCache.get(index)!;
  }
  
  getTotalHeight(): number {
    if (this.totalHeightCache !== null) {
      return this.totalHeightCache;
    }
    
    let total = 0;
    for (let i = 0; i < this.items.length; i++) {
      total += this.getCachedHeight(i);
    }
    
    this.totalHeightCache = total;
    return total;
  }
}

// Render batching for efficient updates
export class RenderBatcher extends EventEmitter {
  private pendingUpdates: Map<string, () => void> = new Map();
  private frameId: any = null;
  private maxBatchSize: number;
  private priority: Map<string, number> = new Map();
  
  constructor(options: { maxBatchSize?: number } = {}) {
    super();
    this.maxBatchSize = options.maxBatchSize ?? 10;
  }
  
  schedule(id: string, update: () => void, priority: number = 0) {
    this.pendingUpdates.set(id, update);
    this.priority.set(id, priority);
    
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(() => this.flush());
    }
  }
  
  cancel(id: string) {
    this.pendingUpdates.delete(id);
    this.priority.delete(id);
  }
  
  flush() {
    const updates = Array.from(this.pendingUpdates.entries())
      .sort((a, b) => (this.priority.get(b[0]) ?? 0) - (this.priority.get(a[0]) ?? 0))
      .slice(0, this.maxBatchSize);
    
    this.pendingUpdates.clear();
    this.priority.clear();
    this.frameId = null;
    
    const startTime = now();
    
    updates.forEach(([id, update]) => {
      try {
        update();
      } catch (error) {
        this.emit('error', { id, error });
      }
    });
    
    const duration = now() - startTime;
    this.emit('batch-complete', { count: updates.length, duration });
    
    // Schedule next batch if there are more updates
    if (this.pendingUpdates.size > 0) {
      this.frameId = requestAnimationFrame(() => this.flush());
    }
  }
  
  clear() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.pendingUpdates.clear();
    this.priority.clear();
  }
}

// Memory leak prevention
export class MemoryManager {
  private resources: Map<string, WeakRef<any>> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Map<string, Array<{ target: any; event: string; handler: any }>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  
  register(id: string, resource: any) {
    this.resources.set(id, new WeakRef(resource));
  }
  
  registerTimer(id: string, timer: NodeJS.Timeout) {
    this.clearTimer(id);
    this.timers.set(id, timer);
  }
  
  registerInterval(id: string, interval: NodeJS.Timeout) {
    this.clearInterval(id);
    this.intervals.set(id, interval);
  }
  
  registerListener(id: string, target: any, event: string, handler: any) {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, []);
    }
    this.listeners.get(id)!.push({ target, event, handler });
  }
  
  clearTimer(id: string) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
  
  clearInterval(id: string) {
    const interval = this.intervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(id);
    }
  }
  
  clearListeners(id: string) {
    const listeners = this.listeners.get(id);
    if (listeners) {
      listeners.forEach(({ target, event, handler }) => {
        if (target && typeof target.removeListener === 'function') {
          target.removeListener(event, handler);
        } else if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(event, handler);
        }
      });
      this.listeners.delete(id);
    }
  }
  
  cleanup(id: string) {
    this.clearTimer(id);
    this.clearInterval(id);
    this.clearListeners(id);
    this.resources.delete(id);
  }
  
  cleanupAll() {
    // Clear all timers
    this.timers.forEach((timer, id) => this.clearTimer(id));
    
    // Clear all intervals
    this.intervals.forEach((interval, id) => this.clearInterval(id));
    
    // Clear all listeners
    this.listeners.forEach((_, id) => this.clearListeners(id));
    
    // Clear resources
    this.resources.clear();
  }
  
  // Check for leaked resources
  checkForLeaks(): string[] {
    const leaks: string[] = [];
    
    this.resources.forEach((ref, id) => {
      if (ref.deref() === undefined) {
        leaks.push(`Resource ${id} has been garbage collected but not cleaned up`);
      }
    });
    
    return leaks;
  }
}

// Large dataset handling utilities
export class DatasetOptimizer<T> {
  private chunkSize: number;
  private indexMap?: Map<string, number>;
  private keyExtractor?: (item: T) => string;
  
  constructor(options: {
    chunkSize?: number;
    keyExtractor?: (item: T) => string;
  } = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.keyExtractor = options.keyExtractor;
  }
  
  // Process large dataset in chunks
  async processInChunks<R>(
    data: T[],
    processor: (chunk: T[]) => Promise<R[]>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunk = data.slice(i, Math.min(i + this.chunkSize, data.length));
      const chunkResults = await processor(chunk);
      results.push(...chunkResults);
      
      if (onProgress) {
        onProgress(Math.min(i + this.chunkSize, data.length), data.length);
      }
      
      // Allow other tasks to run
      await new Promise(resolve => setImmediate(resolve));
    }
    
    return results;
  }
  
  // Build index for fast lookups
  buildIndex(data: T[]) {
    if (!this.keyExtractor) {
      throw new Error('Key extractor required for indexing');
    }
    
    this.indexMap = new Map();
    
    data.forEach((item, index) => {
      const key = this.keyExtractor!(item);
      this.indexMap!.set(key, index);
    });
  }
  
  // Fast lookup by key
  findByKey(data: T[], key: string): T | undefined {
    if (!this.indexMap) {
      throw new Error('Index not built');
    }
    
    const index = this.indexMap.get(key);
    return index !== undefined ? data[index] : undefined;
  }
  
  // Filter large dataset efficiently
  async filter(
    data: T[],
    predicate: (item: T) => boolean | Promise<boolean>
  ): Promise<T[]> {
    const chunks = Math.ceil(data.length / this.chunkSize);
    const results: T[] = [];
    
    await Promise.all(
      Array.from({ length: chunks }, async (_, i) => {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, data.length);
        const chunk = data.slice(start, end);
        
        const filtered = await Promise.all(
          chunk.map(async (item) => {
            const include = await predicate(item);
            return include ? item : null;
          })
        );
        
        results.push(...filtered.filter((item) => item !== null) as T[]);
      })
    );
    
    return results;
  }
}

// Performance monitoring
export class PerformanceMonitor extends EventEmitter {
  private metrics: Map<string, number[]> = new Map();
  private marks: Map<string, number> = new Map();
  private enabled: boolean;
  
  constructor(enabled: boolean = true) {
    super();
    this.enabled = enabled;
  }
  
  mark(name: string) {
    if (!this.enabled) return;
    
    this.marks.set(name, now());
  }
  
  measure(name: string, startMark: string, endMark?: string) {
    if (!this.enabled) return;
    
    const start = this.marks.get(startMark);
    if (!start) return;
    
    const end = endMark ? this.marks.get(endMark) : now();
    if (!end) return;
    
    const duration = end - start;
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push(duration);
    
    this.emit('measure', { name, duration });
    
    // Cleanup marks
    this.marks.delete(startMark);
    if (endMark) {
      this.marks.delete(endMark);
    }
  }
  
  getMetrics(name: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      count,
      avg: sum / count,
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      p50: sorted[Math.floor(count * 0.5)] ?? 0,
      p95: sorted[Math.floor(count * 0.95)] ?? 0,
      p99: sorted[Math.floor(count * 0.99)] ?? 0,
    };
  }
  
  clear(name?: string) {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
    this.marks.clear();
  }
  
  enable() {
    this.enabled = true;
  }
  
  disable() {
    this.enabled = false;
  }
}