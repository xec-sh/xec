/**
 * @module dev-tools/debug
 * Debug mode and logging utilities for Kit development
 */

import color from 'picocolors';

import { EventEmitter } from '../core/event-emitter.js';

/**
 * Debug levels
 */
export enum DebugLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

/**
 * Debug log entry
 */
export interface DebugLogEntry {
  timestamp: number;
  level: DebugLevel;
  category: string;
  message: string;
  data?: any;
  stack?: string;
}

/**
 * Performance entry
 */
export interface PerformanceEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Debug configuration
 */
export interface DebugConfig {
  /**
   * Enable debug mode
   * @default false
   */
  enabled?: boolean;
  
  /**
   * Debug level
   * @default DebugLevel.INFO
   */
  level?: DebugLevel;
  
  /**
   * Categories to include (empty = all)
   * @default []
   */
  include?: string[];
  
  /**
   * Categories to exclude
   * @default []
   */
  exclude?: string[];
  
  /**
   * Enable performance tracking
   * @default true
   */
  performance?: boolean;
  
  /**
   * Log to file
   * @default undefined
   */
  logFile?: string;
  
  /**
   * Pretty print JSON data
   * @default true
   */
  prettyPrint?: boolean;
}

/**
 * Debug manager for Kit
 * 
 * @class DebugManager
 * @extends EventEmitter
 * 
 * @example
 * ```typescript
 * const debug = new DebugManager({
 *   enabled: true,
 *   level: DebugLevel.DEBUG,
 *   include: ['prompt', 'render']
 * });
 * 
 * debug.log('prompt', 'Starting text prompt', { options });
 * 
 * const perf = debug.startPerformance('render');
 * // ... do work
 * debug.endPerformance(perf);
 * ```
 */
export class DebugManager extends EventEmitter {
  private config: Required<DebugConfig>;
  private logs: DebugLogEntry[] = [];
  private performances: Map<string, PerformanceEntry> = new Map();
  private startTime = Date.now();

  constructor(config: DebugConfig = {}) {
    super();
    
    this.config = {
      enabled: config.enabled ?? (process.env['KIT_DEBUG'] === 'true'),
      level: config.level ?? DebugLevel.INFO,
      include: config.include ?? [],
      exclude: config.exclude ?? [],
      performance: config.performance ?? true,
      logFile: config.logFile || '',
      prettyPrint: config.prettyPrint ?? true,
    };
    
    // Parse debug level from env
    if (process.env['KIT_DEBUG_LEVEL']) {
      const level = process.env['KIT_DEBUG_LEVEL'].toUpperCase();
      this.config.level = DebugLevel[level as keyof typeof DebugLevel] ?? DebugLevel.INFO;
    }
    
    // Parse categories from env
    if (process.env['KIT_DEBUG_INCLUDE']) {
      this.config.include = process.env['KIT_DEBUG_INCLUDE'].split(',');
    }
    if (process.env['KIT_DEBUG_EXCLUDE']) {
      this.config.exclude = process.env['KIT_DEBUG_EXCLUDE'].split(',');
    }
  }

  /**
   * Check if debug is enabled
   */
  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable debug mode
   */
  enable(): void {
    this.config.enabled = true;
    this.emit('enabled');
  }

  /**
   * Disable debug mode
   */
  disable(): void {
    this.config.enabled = false;
    this.emit('disabled');
  }

  /**
   * Set debug level
   */
  setLevel(level: DebugLevel): void {
    this.config.level = level;
  }

  /**
   * Check if category should be logged
   */
  private shouldLog(category: string, level: DebugLevel): boolean {
    if (!this.config.enabled) return false;
    if (level > this.config.level) return false;
    
    // Check includes
    if (this.config.include.length > 0) {
      const included = this.config.include.some(inc => 
        category === inc || category.startsWith(inc + '.')
      );
      if (!included) return false;
    }
    
    // Check excludes
    if (this.config.exclude.length > 0) {
      const excluded = this.config.exclude.some(exc => 
        category === exc || category.startsWith(exc + '.')
      );
      if (excluded) return false;
    }
    
    return true;
  }

  /**
   * Format timestamp
   */
  private formatTime(timestamp: number): string {
    const elapsed = timestamp - this.startTime;
    return `+${elapsed}ms`;
  }

  /**
   * Format log message
   */
  private formatMessage(entry: DebugLogEntry): string {
    const levelColors: Record<DebugLevel, (s: string) => string> = {
      [DebugLevel.NONE]: (s: string) => s,
      [DebugLevel.ERROR]: color.red,
      [DebugLevel.WARN]: color.yellow,
      [DebugLevel.INFO]: color.blue,
      [DebugLevel.DEBUG]: color.gray,
      [DebugLevel.TRACE]: color.dim,
    };
    
    const levelNames: Record<DebugLevel, string> = {
      [DebugLevel.NONE]: 'NONE ',
      [DebugLevel.ERROR]: 'ERROR',
      [DebugLevel.WARN]: 'WARN ',
      [DebugLevel.INFO]: 'INFO ',
      [DebugLevel.DEBUG]: 'DEBUG',
      [DebugLevel.TRACE]: 'TRACE',
    };
    
    const colorFn = levelColors[entry.level] || ((s: string) => s);
    const levelName = levelNames[entry.level] || 'UNKNOWN';
    
    let output = '';
    output += color.dim(this.formatTime(entry.timestamp)) + ' ';
    output += colorFn(levelName) + ' ';
    output += color.cyan(`[${entry.category}]`) + ' ';
    output += entry.message;
    
    if (entry.data) {
      const data = this.config.prettyPrint 
        ? JSON.stringify(entry.data, null, 2)
        : JSON.stringify(entry.data);
      output += '\n' + color.dim(data);
    }
    
    if (entry.stack) {
      output += '\n' + color.dim(entry.stack);
    }
    
    return output;
  }

  /**
   * Log a message
   */
  private logMessage(level: DebugLevel, category: string, message: string, data?: any): void {
    if (!this.shouldLog(category, level)) return;
    
    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    };
    
    // Capture stack for errors
    if (level === DebugLevel.ERROR) {
      entry.stack = new Error().stack?.split('\n').slice(3).join('\n');
    }
    
    this.logs.push(entry);
    
    // Output to console
    console.error(this.formatMessage(entry));
    
    // Write to file if configured
    if (this.config.logFile) {
      // File logging is intentionally not implemented for security reasons
      // Use external log aggregation tools or pipe output to a file instead
    }
    
    this.emit('log', entry);
  }

  /**
   * Log error
   */
  error(category: string, message: string, data?: any): void {
    this.logMessage(DebugLevel.ERROR, category, message, data);
  }

  /**
   * Log warning
   */
  warn(category: string, message: string, data?: any): void {
    this.logMessage(DebugLevel.WARN, category, message, data);
  }

  /**
   * Log info
   */
  info(category: string, message: string, data?: any): void {
    this.logMessage(DebugLevel.INFO, category, message, data);
  }

  /**
   * Log debug
   */
  debug(category: string, message: string, data?: any): void {
    this.logMessage(DebugLevel.DEBUG, category, message, data);
  }

  /**
   * Log trace
   */
  trace(category: string, message: string, data?: any): void {
    this.logMessage(DebugLevel.TRACE, category, message, data);
  }

  /**
   * Shorthand log method
   */
  log(category: string, message: string, data?: any): void {
    this.debug(category, message, data);
  }

  /**
   * Start performance measurement
   */
  startPerformance(name: string, metadata?: Record<string, any>): PerformanceEntry {
    if (!this.config.performance || !this.config.enabled) {
      return { name, startTime: 0 };
    }
    
    const entry: PerformanceEntry = {
      name,
      startTime: performance.now(),
      metadata,
    };
    
    this.performances.set(name, entry);
    this.debug('performance', `Started: ${name}`, metadata);
    
    return entry;
  }

  /**
   * End performance measurement
   */
  endPerformance(entry: PerformanceEntry): void {
    if (!this.config.performance || !this.config.enabled) return;
    
    entry.endTime = performance.now();
    entry.duration = entry.endTime - entry.startTime;
    
    this.debug('performance', `Completed: ${entry.name} (${entry.duration.toFixed(2)}ms)`, {
      duration: entry.duration,
      metadata: entry.metadata,
    });
    
    this.emit('performance', entry);
  }

  /**
   * Measure function performance
   */
  async measure<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const perf = this.startPerformance(name);
    try {
      const result = await fn();
      this.endPerformance(perf);
      return result;
    } catch (error) {
      perf.metadata = { error: error instanceof Error ? error.message : String(error) };
      this.endPerformance(perf);
      throw error;
    }
  }

  /**
   * Get all logs
   */
  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: string): DebugLogEntry[] {
    return this.logs.filter(log => log.category === category);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: DebugLevel): DebugLogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get performance entries
   */
  getPerformanceEntries(): PerformanceEntry[] {
    return Array.from(this.performances.values());
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    
    for (const [name, entry] of this.performances) {
      if (entry.duration !== undefined) {
        summary[name] = entry.duration;
      }
    }
    
    return summary;
  }

  /**
   * Create a category-specific logger
   */
  createLogger(category: string): {
    error: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    info: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
    trace: (message: string, data?: any) => void;
    log: (message: string, data?: any) => void;
  } {
    return {
      error: (message, data) => this.error(category, message, data),
      warn: (message, data) => this.warn(category, message, data),
      info: (message, data) => this.info(category, message, data),
      debug: (message, data) => this.debug(category, message, data),
      trace: (message, data) => this.trace(category, message, data),
      log: (message, data) => this.log(category, message, data),
    };
  }
}

/**
 * Global debug instance
 */
export const debug = new DebugManager();