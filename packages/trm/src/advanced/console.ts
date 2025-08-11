/**
 * Console Interception Module
 * Intercept and manage console output with filtering and buffering
 */

import { ansi } from '../core/ansi.js';
import { colors } from '../core/color.js';
import { StylesImpl } from '../core/styles.js';

import type { Style, Disposable } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ConsoleInterceptor {
  // Patching
  patch(options?: PatchOptions): Disposable;
  readonly isPatched: boolean;
  
  // Message streams
  readonly messages: AsyncIterable<ConsoleMessage>;
  onMessage(handler: MessageHandler): Disposable;
  
  // Filtering
  filter(level: LogLevel): void;
  exclude(pattern: RegExp): void;
  include(pattern: RegExp): void;
  clearFilters(): void;
  
  // Buffering
  buffer(size: number): void;
  flush(): ConsoleMessage[];
  clear(): void;
  
  // Output control
  suppress(suppress: boolean): void;
  readonly isSuppressed: boolean;
}

export interface PatchOptions {
  methods?: ConsoleMethods[];
  preserveOriginal?: boolean;
  captureStack?: boolean;
  timestamp?: boolean;
  colorize?: boolean;
  formatOutput?: boolean;
}

export interface ConsoleMessage {
  readonly level: LogLevel;
  readonly method: string;
  readonly args: any[];
  readonly timestamp: number;
  readonly stack?: string;
  
  // Formatting
  toString(): string;
  toANSI(): string;
  toJSON(): object;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error' | 'fatal';

export type ConsoleMethods = 
  | 'log'
  | 'info'
  | 'warn'
  | 'error'
  | 'debug'
  | 'trace'
  | 'dir'
  | 'dirxml'
  | 'table'
  | 'time'
  | 'timeEnd'
  | 'timeLog'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'count'
  | 'countReset'
  | 'assert'
  | 'clear'
  | 'profile'
  | 'profileEnd';

export type MessageHandler = (message: ConsoleMessage) => void;

// ============================================================================
// Log Level Utilities
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  log: 3,
  warn: 4,
  error: 5,
  fatal: 6
};

const METHOD_TO_LEVEL: Record<string, LogLevel> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  log: 'log',
  warn: 'warn',
  error: 'error',
  dir: 'debug',
  dirxml: 'debug',
  table: 'info',
  assert: 'error',
  group: 'info',
  groupCollapsed: 'info',
  groupEnd: 'info',
  time: 'debug',
  timeEnd: 'debug',
  timeLog: 'debug',
  count: 'debug',
  countReset: 'debug',
  clear: 'info',
  profile: 'debug',
  profileEnd: 'debug'
};

const LEVEL_COLORS: Record<LogLevel, Style> = {
  trace: { fg: { type: 'ansi', value: 7 }, dim: true },      // Gray dim
  debug: { fg: { type: 'ansi', value: 4 } },                 // Blue
  info: { fg: { type: 'ansi', value: 6 } },                  // Cyan
  log: {},                                                    // Default
  warn: { fg: { type: 'ansi', value: 3 } },                  // Yellow
  error: { fg: { type: 'ansi', value: 1 }, bold: true },     // Red bold
  fatal: { fg: { type: 'ansi', value: 1 }, bg: { type: 'ansi', value: 7 }, bold: true } // Red on white
};

// ============================================================================
// Console Message Implementation
// ============================================================================

class ConsoleMessageImpl implements ConsoleMessage {
  readonly level: LogLevel;
  readonly method: string;
  readonly args: any[];
  readonly timestamp: number;
  readonly stack?: string;
  
  constructor(
    method: string,
    args: any[],
    options: {
      timestamp?: boolean;
      captureStack?: boolean;
    } = {}
  ) {
    this.method = method;
    this.args = args;
    this.level = METHOD_TO_LEVEL[method] || 'log';
    this.timestamp = options.timestamp ? Date.now() : 0;
    
    if (options.captureStack) {
      const error = new Error();
      this.stack = error.stack;
    }
  }
  
  toString(): string {
    const parts: string[] = [];
    
    // Add timestamp
    if (this.timestamp) {
      const date = new Date(this.timestamp);
      parts.push(`[${date.toISOString()}]`);
    }
    
    // Add level
    parts.push(`[${this.level.toUpperCase()}]`);
    
    // Format arguments
    const formattedArgs = this.args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'undefined') return 'undefined';
      if (arg === null) return 'null';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });
    
    parts.push(...formattedArgs);
    
    // Add stack trace if available
    if (this.stack) {
      const stackLines = this.stack.split('\n').slice(3); // Skip Error and constructor lines
      parts.push('\n' + stackLines.join('\n'));
    }
    
    return parts.join(' ');
  }
  
  toANSI(): string {
    const styles = new StylesImpl();
    const style = LEVEL_COLORS[this.level] || {};
    const styleCode = styles.apply(style);
    const resetCode = styles.reset();
    
    const parts: string[] = [];
    
    // Add styled timestamp
    if (this.timestamp) {
      const date = new Date(this.timestamp);
      parts.push(`${ansi.dim()}[${date.toISOString()}]${ansi.resetDim()}`);
    }
    
    // Add styled level
    parts.push(`${styleCode}[${this.level.toUpperCase()}]${resetCode}`);
    
    // Format arguments with appropriate styling
    const formattedArgs = this.args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'undefined') return `${ansi.dim()}undefined${ansi.resetDim()}`;
      if (arg === null) return `${ansi.dim()}null${ansi.resetDim()}`;
      if (typeof arg === 'number') return `${ansi.bold()}${arg}${ansi.resetBold()}`;
      if (typeof arg === 'boolean') return `${ansi.italic()}${arg}${ansi.resetItalic()}`;
      if (typeof arg === 'object') {
        try {
          const json = JSON.stringify(arg, null, 2);
          // Simple JSON syntax highlighting
          return json
            .replace(/"([^"]+)":/g, `${colors.toForeground(colors.cyan)}"$1":${ansi.reset()}`)  // Keys
            .replace(/: "([^"]+)"/g, `: ${colors.toForeground(colors.green)}"$1"${ansi.reset()}`) // String values
            .replace(/: (\d+)/g, `: ${colors.toForeground(colors.yellow)}$1${ansi.reset()}`)      // Numbers
            .replace(/: (true|false)/g, `: ${colors.toForeground(colors.magenta)}$1${ansi.reset()}`); // Booleans
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });
    
    parts.push(...formattedArgs);
    
    // Add stack trace if available
    if (this.stack) {
      const stackLines = this.stack.split('\n').slice(3);
      const styledStack = stackLines.map(line => 
        `${ansi.dim()}${line}${ansi.resetDim()}`
      ).join('\n');
      parts.push('\n' + styledStack);
    }
    
    return parts.join(' ');
  }
  
  toJSON(): object {
    return {
      level: this.level,
      method: this.method,
      args: this.args,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// ============================================================================
// Console Interceptor Implementation
// ============================================================================

class ConsoleInterceptorImpl implements ConsoleInterceptor {
  private _isPatched = false;
  private _isSuppressed = false;
  private originalMethods: Map<string, Function> = new Map();
  private messageHandlers = new Set<MessageHandler>();
  private messageBuffer: ConsoleMessage[] = [];
  private bufferSize = 100;
  
  // Filtering
  private minLevel: LogLevel = 'trace';
  private excludePatterns: RegExp[] = [];
  private includePatterns: RegExp[] = [];
  
  // Options
  private options: Required<PatchOptions> = {
    methods: ['log', 'info', 'warn', 'error', 'debug', 'trace'] as ConsoleMethods[],
    preserveOriginal: true,
    captureStack: false,
    timestamp: true,
    colorize: true,
    formatOutput: true
  };
  
  // Timers for console.time
  private timers = new Map<string, number>();
  
  // Counters for console.count
  private counters = new Map<string, number>();
  
  // Group depth for console.group
  private groupDepth = 0;
  
  get isPatched(): boolean {
    return this._isPatched;
  }
  
  get isSuppressed(): boolean {
    return this._isSuppressed;
  }
  
  patch(options?: PatchOptions): Disposable {
    if (this._isPatched) {
      throw new Error('Console already patched');
    }
    
    // Merge options
    if (options) {
      Object.assign(this.options, options);
    }
    
    // Store original methods and patch
    for (const method of this.options.methods) {
      const original = (console as any)[method];
      if (typeof original === 'function') {
        this.originalMethods.set(method, original);
        (console as any)[method] = this.createInterceptor(method, original);
      }
    }
    
    // Patch special methods
    this.patchSpecialMethods();
    
    this._isPatched = true;
    
    return {
      disposed: false,
      dispose: () => this.unpatch()
    };
  }
  
  private unpatch(): void {
    if (!this._isPatched) return;
    
    // Restore original methods
    for (const [method, original] of this.originalMethods) {
      (console as any)[method] = original;
    }
    
    this.originalMethods.clear();
    this._isPatched = false;
  }
  
  private createInterceptor(method: string, original: Function): Function {
    return (...args: any[]) => {
      // Create message
      const message = new ConsoleMessageImpl(method, args, {
        timestamp: this.options.timestamp,
        captureStack: this.options.captureStack
      });
      
      // Check filters
      if (!this.shouldLog(message)) {
        return;
      }
      
      // Add to buffer
      this.addToBuffer(message);
      
      // Notify handlers
      this.notifyHandlers(message);
      
      // Call original if not suppressed
      if (this.options.preserveOriginal && !this._isSuppressed) {
        if (this.options.formatOutput && this.options.colorize) {
          // Use formatted output
          original(message.toANSI());
        } else {
          // Use original arguments
          original.apply(console, args);
        }
      }
    };
  }
  
  private patchSpecialMethods(): void {
    // console.time
    const originalTime = console.time;
    console.time = (label?: string) => {
      const l = label || 'default';
      this.timers.set(l, performance.now());
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalTime.call(console, label);
      }
    };
    
    // console.timeEnd
    const originalTimeEnd = console.timeEnd;
    console.timeEnd = (label?: string) => {
      const l = label || 'default';
      const start = this.timers.get(l);
      
      if (start !== undefined) {
        const duration = performance.now() - start;
        this.timers.delete(l);
        
        const message = new ConsoleMessageImpl('timeEnd', 
          [`${l}: ${duration.toFixed(3)}ms`], 
          { timestamp: this.options.timestamp }
        );
        
        this.addToBuffer(message);
        this.notifyHandlers(message);
      }
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalTimeEnd.call(console, label);
      }
    };
    
    // console.count
    const originalCount = console.count;
    console.count = (label?: string) => {
      const l = label || 'default';
      const count = (this.counters.get(l) || 0) + 1;
      this.counters.set(l, count);
      
      const message = new ConsoleMessageImpl('count', 
        [`${l}: ${count}`], 
        { timestamp: this.options.timestamp }
      );
      
      this.addToBuffer(message);
      this.notifyHandlers(message);
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalCount.call(console, label);
      }
    };
    
    // console.countReset
    const originalCountReset = console.countReset;
    console.countReset = (label?: string) => {
      const l = label || 'default';
      this.counters.delete(l);
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalCountReset.call(console, label);
      }
    };
    
    // console.group
    const originalGroup = console.group;
    console.group = (...args: any[]) => {
      this.groupDepth++;
      
      const message = new ConsoleMessageImpl('group', args, {
        timestamp: this.options.timestamp
      });
      
      this.addToBuffer(message);
      this.notifyHandlers(message);
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalGroup.apply(console, args);
      }
    };
    
    // console.groupEnd
    const originalGroupEnd = console.groupEnd;
    console.groupEnd = () => {
      if (this.groupDepth > 0) {
        this.groupDepth--;
      }
      
      const message = new ConsoleMessageImpl('groupEnd', [], {
        timestamp: this.options.timestamp
      });
      
      this.addToBuffer(message);
      this.notifyHandlers(message);
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalGroupEnd.call(console);
      }
    };
    
    // console.clear
    const originalClear = console.clear;
    console.clear = () => {
      const message = new ConsoleMessageImpl('clear', [], {
        timestamp: this.options.timestamp
      });
      
      this.addToBuffer(message);
      this.notifyHandlers(message);
      
      if (this.options.preserveOriginal && !this._isSuppressed) {
        originalClear.call(console);
      }
    };
  }
  
  private shouldLog(message: ConsoleMessage): boolean {
    // Check log level
    if (LOG_LEVELS[message.level] < LOG_LEVELS[this.minLevel]) {
      return false;
    }
    
    // Get text to check - concatenate all string arguments
    const text = message.args
      .filter(arg => typeof arg === 'string')
      .join(' ');
    
    // Check include patterns
    if (this.includePatterns.length > 0) {
      const included = this.includePatterns.some(pattern => pattern.test(text));
      if (!included) return false;
    }
    
    // Check exclude patterns
    if (this.excludePatterns.length > 0) {
      const excluded = this.excludePatterns.some(pattern => pattern.test(text));
      if (excluded) return false;
    }
    
    return true;
  }
  
  private addToBuffer(message: ConsoleMessage): void {
    this.messageBuffer.push(message);
    
    // Trim buffer if needed
    while (this.messageBuffer.length > this.bufferSize) {
      this.messageBuffer.shift();
    }
  }
  
  private notifyHandlers(message: ConsoleMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        // Prevent handler errors from breaking interception
        if (this.originalMethods.has('error')) {
          this.originalMethods.get('error')!('Console handler error:', error);
        }
      }
    }
  }
  
  get messages(): AsyncIterable<ConsoleMessage> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        const queue: ConsoleMessage[] = [];
        let resolve: ((value: void) => void) | null = null;
        
        const handler = (message: ConsoleMessage) => {
          queue.push(message);
          if (resolve) {
            resolve();
            resolve = null;
          }
        };
        
        self.messageHandlers.add(handler);
        
        try {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift()!;
            } else {
              await new Promise<void>(r => { resolve = r; });
            }
          }
        } finally {
          self.messageHandlers.delete(handler);
        }
      }
    };
  }
  
  onMessage(handler: MessageHandler): Disposable {
    this.messageHandlers.add(handler);
    
    return {
      disposed: false,
      dispose: () => {
        this.messageHandlers.delete(handler);
        (this as any).disposed = true;
      }
    };
  }
  
  filter(level: LogLevel): void {
    this.minLevel = level;
  }
  
  exclude(pattern: RegExp): void {
    this.excludePatterns.push(pattern);
  }
  
  include(pattern: RegExp): void {
    this.includePatterns.push(pattern);
  }
  
  clearFilters(): void {
    this.minLevel = 'trace';
    this.excludePatterns = [];
    this.includePatterns = [];
  }
  
  buffer(size: number): void {
    this.bufferSize = Math.max(0, size);
    
    // Trim existing buffer if needed
    while (this.messageBuffer.length > this.bufferSize) {
      this.messageBuffer.shift();
    }
  }
  
  flush(): ConsoleMessage[] {
    const messages = [...this.messageBuffer];
    this.messageBuffer = [];
    return messages;
  }
  
  clear(): void {
    this.messageBuffer = [];
  }
  
  suppress(suppress: boolean): void {
    this._isSuppressed = suppress;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new console interceptor
 */
export function createConsoleInterceptor(): ConsoleInterceptor {
  return new ConsoleInterceptorImpl();
}

/**
 * Global console interceptor instance
 */
export const consoleInterceptor = createConsoleInterceptor();

/**
 * Patch console with default options
 */
export function patchConsole(options?: PatchOptions): Disposable {
  return consoleInterceptor.patch(options);
}

/**
 * Create a console message manually
 */
export function createConsoleMessage(
  method: string,
  args: any[],
  options?: { timestamp?: boolean; captureStack?: boolean }
): ConsoleMessage {
  return new ConsoleMessageImpl(method, args, options);
}