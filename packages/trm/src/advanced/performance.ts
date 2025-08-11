/**
 * Performance Monitoring Module - Final Version
 * Comprehensive performance tracking and profiling
 */

import { type Signal, createSignal } from './state.js';
import { cancelAnimationFrame, requestAnimationFrame } from '../core/browser-api.js';

import type { Disposable } from '../types.js';

// Use global performance API with proper fallback
const getPerformanceNow = () => {
  // Check for mocked performance.now first (for tests)
  if (typeof globalThis.performance !== 'undefined' && globalThis.performance.now) {
    return globalThis.performance.now();
  }
  return Date.now();
};

// ============================================================================
// Types
// ============================================================================

export interface PerformanceMonitor {
  // Metrics collection
  readonly metrics: Metrics;
  startMeasure(name: string): () => void;
  measure<T>(name: string, fn: () => T): T;
  measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T>;
  
  // Profiling
  startProfiling(name?: string): Profiler;
  stopProfiling(): ProfileData | undefined;
  
  // Resource monitoring - return direct values, not signals
  readonly memory: MemoryInfo;
  readonly cpu: CPUInfo;
  
  // Frame timing - return direct values, not signals
  readonly frameTime: number;
  readonly fps: number;
  
  // Alerts
  setThreshold(metric: string, threshold: number | ThresholdConfig): void;
  onThresholdExceeded(handler: ThresholdHandler): Disposable;
  
  // Control
  start(): void;
  stop(): void;
  reset(): void;
}

export interface Metrics {
  get(name: string): MetricData | undefined;
  getAll(): Map<string, MetricData>;
  clear(): void;
  
  // Aggregates
  readonly average: Map<string, number>;
  readonly median: Map<string, number>;
  readonly p95: Map<string, number>;
  readonly p99: Map<string, number>;
  readonly min: Map<string, number>;
  readonly max: Map<string, number>;
}

export interface MetricData {
  readonly name: string;
  readonly count: number;
  readonly total: number;
  readonly min: number;
  readonly max: number;
  readonly average: number;
  readonly samples: number[];
  readonly lastValue: number;
  readonly lastTimestamp: number;
}

export interface Profiler {
  readonly id: string;
  readonly name: string;
  readonly startTime: number;
  
  mark(label: string): void;
  measure(name: string, startMark?: string, endMark?: string): void;
  stop(): ProfileData;
  getEntries(): any[];
}

export interface ProfileData {
  readonly id: string;
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly marks: ProfileMark[];
  readonly measures: ProfileMeasure[];
  readonly callTree?: CallTreeNode;
  readonly entries: any[];
  readonly summary: Map<string, any>;
  readonly timestamp: number;
}

export interface ProfileMark {
  readonly label: string;
  readonly timestamp: number;
  readonly relativeTime: number;
}

export interface ProfileMeasure {
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
}

export interface CallTreeNode {
  readonly name: string;
  readonly selfTime: number;
  readonly totalTime: number;
  readonly callCount: number;
  readonly children: CallTreeNode[];
}

export interface MemoryInfo {
  readonly used: number;
  readonly total: number;
  readonly rss: number;
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly external: number;
  readonly arrayBuffers: number;
}

export interface CPUInfo {
  readonly usage: number;
  readonly user: number;
  readonly system: number;
  readonly idle: number;
}

export interface ThresholdConfig {
  value: number;
  type?: 'above' | 'below';
  duration?: number;
  cooldown?: number;
}

export type ThresholdHandler = (metric: string, value: number, threshold: number) => void;

export interface ThresholdEvent {
  readonly metric: string;
  readonly value: number;
  readonly threshold: number;
  readonly type: 'above' | 'below';
  readonly timestamp: number;
}

// ============================================================================
// Metrics Implementation
// ============================================================================

class MetricsImpl implements Metrics {
  private data = new Map<string, MetricData>();
  
  get(name: string): MetricData | undefined {
    return this.data.get(name);
  }
  
  getAll(): Map<string, MetricData> {
    return new Map(this.data);
  }
  
  clear(): void {
    this.data.clear();
  }
  
  record(name: string, value: number): void {
    const existing = this.data.get(name);
    
    if (existing) {
      const samples = [...existing.samples, value];
      
      // Keep only last 1000 samples
      if (samples.length > 1000) {
        samples.shift();
      }
      
      this.data.set(name, {
        name,
        count: existing.count + 1,
        total: existing.total + value,
        min: Math.min(existing.min, value),
        max: Math.max(existing.max, value),
        average: (existing.total + value) / (existing.count + 1),
        samples,
        lastValue: value,
        lastTimestamp: Date.now()
      });
    } else {
      this.data.set(name, {
        name,
        count: 1,
        total: value,
        min: value,
        max: value,
        average: value,
        samples: [value],
        lastValue: value,
        lastTimestamp: Date.now()
      });
    }
  }
  
  get average(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [name, data] of this.data) {
      result.set(name, data.average);
    }
    return result;
  }
  
  get median(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [name, data] of this.data) {
      const sorted = [...data.samples].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      result.set(name, median);
    }
    return result;
  }
  
  get p95(): Map<string, number> {
    return this.getPercentile(95);
  }
  
  get p99(): Map<string, number> {
    return this.getPercentile(99);
  }
  
  get min(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [name, data] of this.data) {
      result.set(name, data.min);
    }
    return result;
  }
  
  get max(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [name, data] of this.data) {
      result.set(name, data.max);
    }
    return result;
  }
  
  private getPercentile(percentile: number): Map<string, number> {
    const result = new Map<string, number>();
    
    for (const [name, data] of this.data) {
      const sorted = [...data.samples].sort((a, b) => a - b);
      const index = Math.ceil((percentile / 100) * sorted.length) - 1;
      result.set(name, sorted[Math.max(0, index)]);
    }
    
    return result;
  }
}

// ============================================================================
// Profiler Implementation
// ============================================================================

class ProfilerImpl implements Profiler {
  readonly id: string;
  readonly name: string;
  readonly startTime: number;
  
  private marks: ProfileMark[] = [];
  private measures: ProfileMeasure[] = [];
  private marksMap = new Map<string, number>();
  
  constructor(name?: string) {
    this.id = `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.name = name || this.id;
    this.startTime = getPerformanceNow();
  }
  
  mark(label: string): void {
    const timestamp = getPerformanceNow();
    const relativeTime = timestamp - this.startTime;
    
    this.marks.push({ label, timestamp, relativeTime });
    this.marksMap.set(label, timestamp);
  }
  
  measure(name: string, startMark?: string, endMark?: string): void {
    let startTime: number;
    let endTime: number;
    
    if (startMark) {
      startTime = this.marksMap.get(startMark) ?? this.startTime;
    } else {
      startTime = this.startTime;
    }
    
    if (endMark) {
      endTime = this.marksMap.get(endMark) ?? getPerformanceNow();
    } else {
      endTime = getPerformanceNow();
    }
    
    this.measures.push({
      name,
      startTime,
      endTime,
      duration: endTime - startTime
    });
  }
  
  getEntries(): any[] {
    return [...this.marks, ...this.measures];
  }
  
  stop(): ProfileData {
    const endTime = getPerformanceNow();
    const summary = new Map<string, any>();
    
    for (const measure of this.measures) {
      summary.set(measure.name, {
        duration: measure.duration,
        startTime: measure.startTime,
        endTime: measure.endTime
      });
    }
    
    return {
      id: this.id,
      name: this.name,
      startTime: this.startTime,
      endTime,
      duration: endTime - this.startTime,
      marks: [...this.marks],
      measures: [...this.measures],
      entries: this.getEntries(),
      summary,
      timestamp: Date.now()
    };
  }
}

// ============================================================================
// Performance Monitor Implementation
// ============================================================================

class PerformanceMonitorImpl implements PerformanceMonitor {
  readonly metrics: Metrics;
  
  private running = false;
  private profilers = new Map<string, ProfilerImpl>();
  private currentProfiler?: ProfilerImpl;
  
  // Resource monitoring
  private _memory: Signal<MemoryInfo>;
  private setMemory: (value: MemoryInfo) => void;
  private _cpu: Signal<CPUInfo>;
  private setCPU: (value: CPUInfo) => void;
  
  // Frame timing
  private _frameTime: Signal<number>;
  private setFrameTime: (value: number) => void;
  private _fps: Signal<number>;
  private setFPS: (value: number) => void;
  
  private frameCount = 0;
  private lastFrameTime = 0;
  private lastFPSUpdate = 0;
  
  // Thresholds
  private thresholds = new Map<string, {
    config: ThresholdConfig;
    exceededSince?: number;
    lastAlert?: number;
  }>();
  private thresholdHandlers = new Set<ThresholdHandler>();
  
  // Monitoring intervals
  private resourceInterval?: any;
  private frameInterval?: number;
  
  // Track start times for measurements
  private measurementStarts = new Map<string, number>();
  
  constructor() {
    this.metrics = new MetricsImpl();
    
    // Initialize signals
    const [memory, setMemory] = createSignal<MemoryInfo>({
      used: 1024 * 1024 * 100,  // 100MB default
      total: 1024 * 1024 * 1000, // 1GB default
      rss: 1024 * 1024 * 150,
      heapUsed: 1024 * 1024 * 80,
      heapTotal: 1024 * 1024 * 200,
      external: 1024 * 1024 * 10,
      arrayBuffers: 1024 * 1024 * 5
    });
    this._memory = memory;
    this.setMemory = setMemory;
    
    const [cpu, setCPU] = createSignal<CPUInfo>({
      usage: 10,
      user: 5,
      system: 5,
      idle: 90
    });
    this._cpu = cpu;
    this.setCPU = setCPU;
    
    const [frameTime, setFrameTime] = createSignal(16.67);
    this._frameTime = frameTime;
    this.setFrameTime = setFrameTime;
    
    const [fps, setFPS] = createSignal(60);
    this._fps = fps;
    this.setFPS = setFPS;
  }
  
  get memory(): MemoryInfo {
    // Update and return current value
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      const memInfo = {
        used: usage.heapUsed + usage.external,
        total: usage.heapTotal,
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers || 0
      };
      this.setMemory(memInfo);
      return memInfo;
    }
    return this._memory();
  }
  
  get cpu(): CPUInfo {
    // Update and return current value
    if (typeof process !== 'undefined' && process.cpuUsage) {
      const usage = process.cpuUsage();
      const total = usage.user + usage.system;
      const cpuPercent = total / 1000000;
      const cpuInfo = {
        usage: cpuPercent,
        user: usage.user / 1000000,
        system: usage.system / 1000000,
        idle: Math.max(0, 100 - cpuPercent)
      };
      this.setCPU(cpuInfo);
      return cpuInfo;
    }
    return this._cpu();
  }
  
  get frameTime(): number {
    return this._frameTime();
  }
  
  get fps(): number {
    return this._fps();
  }
  
  start(): void {
    if (this.running) return;
    
    this.running = true;
    
    // Start resource monitoring
    this.startResourceMonitoring();
    
    // Start frame timing
    this.startFrameTiming();
  }
  
  stop(): void {
    if (!this.running) return;
    
    this.running = false;
    
    // Stop resource monitoring
    if (this.resourceInterval) {
      clearInterval(this.resourceInterval);
      this.resourceInterval = undefined;
    }
    
    // Stop frame timing
    if (this.frameInterval) {
      cancelAnimationFrame(this.frameInterval);
      this.frameInterval = undefined;
    }
  }
  
  reset(): void {
    this.metrics.clear();
    this.profilers.clear();
    this.currentProfiler = undefined;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.lastFPSUpdate = 0;
    this.measurementStarts.clear();
  }
  
  startMeasure(name: string): () => void {
    const startTime = getPerformanceNow();
    this.measurementStarts.set(name, startTime);
    
    return () => {
      const start = this.measurementStarts.get(name) ?? startTime;
      const duration = getPerformanceNow() - start;
      (this.metrics as MetricsImpl).record(name, duration);
      this.checkThresholds(name, duration);
      this.measurementStarts.delete(name);
    };
  }
  
  measure<T>(name: string, fn: () => T): T {
    const startTime = getPerformanceNow();
    
    try {
      const result = fn();
      const duration = getPerformanceNow() - startTime;
      (this.metrics as MetricsImpl).record(name, duration);
      this.checkThresholds(name, duration);
      return result;
    } catch (error) {
      const duration = getPerformanceNow() - startTime;
      (this.metrics as MetricsImpl).record(name, duration);
      this.checkThresholds(name, duration);
      throw error;
    }
  }
  
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startTime = getPerformanceNow();
    
    try {
      const result = await fn();
      const duration = getPerformanceNow() - startTime;
      (this.metrics as MetricsImpl).record(name, duration);
      this.checkThresholds(name, duration);
      return result;
    } catch (error) {
      const duration = getPerformanceNow() - startTime;
      (this.metrics as MetricsImpl).record(name, duration);
      this.checkThresholds(name, duration);
      throw error;
    }
  }
  
  startProfiling(name?: string): Profiler {
    const profiler = new ProfilerImpl(name);
    this.profilers.set(profiler.id, profiler);
    this.currentProfiler = profiler;
    return profiler;
  }
  
  stopProfiling(): ProfileData | undefined {
    if (!this.currentProfiler) return undefined;
    
    const data = this.currentProfiler.stop();
    this.profilers.delete(this.currentProfiler.id);
    this.currentProfiler = undefined;
    
    return data;
  }
  
  setThreshold(metric: string, threshold: number | ThresholdConfig): void {
    const config = typeof threshold === 'number' 
      ? { value: threshold, type: 'above' as const }
      : threshold;
    this.thresholds.set(metric, { config });
  }
  
  onThresholdExceeded(handler: ThresholdHandler): Disposable {
    this.thresholdHandlers.add(handler);
    
    return {
      disposed: false,
      dispose: () => {
        this.thresholdHandlers.delete(handler);
        (this as any).disposed = true;
      }
    };
  }
  
  private startResourceMonitoring(): void {
    const updateResources = () => {
      // Memory monitoring (Node.js specific)
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        this.setMemory({
          used: usage.heapUsed + usage.external,
          total: usage.heapTotal,
          rss: usage.rss,
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal,
          external: usage.external,
          arrayBuffers: usage.arrayBuffers || 0
        });
        
        // Check memory thresholds
        this.checkThresholds('memory.used', usage.heapUsed);
        this.checkThresholds('memory.total', usage.heapTotal);
      }
      
      // CPU monitoring (simplified)
      if (typeof process !== 'undefined' && process.cpuUsage) {
        const usage = process.cpuUsage();
        const total = usage.user + usage.system;
        const cpuPercent = total / 1000000; // Convert to percentage
        
        this.setCPU({
          usage: cpuPercent,
          user: usage.user / 1000000,
          system: usage.system / 1000000,
          idle: Math.max(0, 100 - cpuPercent)
        });
        
        // Check CPU thresholds
        this.checkThresholds('cpu.usage', cpuPercent);
      }
    };
    
    // Update every second
    updateResources();
    this.resourceInterval = setInterval(updateResources, 1000);
  }
  
  private startFrameTiming(): void {
    const measureFrame = () => {
      if (!this.running) return;
      
      const now = getPerformanceNow();
      
      if (this.lastFrameTime > 0) {
        const frameTime = now - this.lastFrameTime;
        this.setFrameTime(frameTime);
        (this.metrics as MetricsImpl).record('frame.time', frameTime);
        
        // Check frame time threshold
        this.checkThresholds('frame.time', frameTime);
        
        this.frameCount++;
        
        // Update FPS every second
        if (now - this.lastFPSUpdate >= 1000) {
          const fps = this.frameCount / ((now - this.lastFPSUpdate) / 1000);
          this.setFPS(fps);
          (this.metrics as MetricsImpl).record('frame.fps', fps);
          
          // Check FPS threshold
          this.checkThresholds('frame.fps', fps);
          
          this.frameCount = 0;
          this.lastFPSUpdate = now;
        }
      }
      
      this.lastFrameTime = now;
      this.frameInterval = requestAnimationFrame(() => measureFrame());
    };
    
    measureFrame();
  }
  
  private checkThresholds(metric: string, value: number): void {
    const threshold = this.thresholds.get(metric);
    if (!threshold) return;
    
    const { config } = threshold;
    const exceeded = (config.type || 'above') === 'above' 
      ? value > config.value
      : value < config.value;
    
    if (exceeded) {
      const now = Date.now();
      
      // Check if we've been exceeding for the required duration
      if (!threshold.exceededSince) {
        threshold.exceededSince = now;
      }
      
      const duration = config.duration || 0;
      if (now - (threshold.exceededSince || now) >= duration) {
        // Check cooldown
        const cooldown = config.cooldown || 0;
        if (!threshold.lastAlert || now - threshold.lastAlert >= cooldown) {
          threshold.lastAlert = now;
          
          // Notify handlers immediately
          for (const handler of this.thresholdHandlers) {
            try {
              handler(metric, value, config.value);
            } catch (error) {
              // Ignore handler errors
            }
          }
        }
      }
    } else {
      // Reset exceeded state
      threshold.exceededSince = undefined;
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new performance monitor
 */
export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitorImpl();
}

// Default singleton instance
export const performanceMonitor = createPerformanceMonitor();

// Convenience exports
export const measure = performanceMonitor.measure.bind(performanceMonitor);
export const measureAsync = performanceMonitor.measureAsync.bind(performanceMonitor);
export const startProfiling = performanceMonitor.startProfiling.bind(performanceMonitor);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}min`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Calculate statistics for a set of values
 */
export function calculateStats(values: number[]): {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
} {
  if (values.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p95: 0,
      p99: 0
    };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  
  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}