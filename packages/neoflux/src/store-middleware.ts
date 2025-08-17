/**
 * Store Middleware System
 * Provides middleware capabilities for store mutations
 */

import type { Store } from './types.js';

/**
 * Middleware function type
 */
export type MiddlewareFunction<T extends object = any> = (
  context: MiddlewareContext<T>
) => void | false | any;

/**
 * Context passed to middleware
 */
export interface MiddlewareContext<T extends object = any> {
  /** Path to the property being changed */
  path: string[];
  /** Previous value */
  oldValue: any;
  /** New value (can be modified) */
  newValue: any;
  /** The store instance */
  store: Store<T>;
  /** Abort the change */
  abort: () => void;
  /** Replace the new value */
  setValue: (value: any) => void;
  /** Metadata for this change */
  metadata?: Record<string, any>;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  /** Name of the middleware */
  name?: string;
  /** Whether this middleware is enabled */
  enabled?: boolean;
  /** Priority (lower numbers run first) */
  priority?: number;
  /** Path pattern to match (glob-like) */
  pathPattern?: string | RegExp;
}

/**
 * Middleware with configuration
 */
export interface Middleware<T extends object = any> extends MiddlewareConfig {
  /** The middleware function */
  handler: MiddlewareFunction<T>;
}

/**
 * Store middleware manager
 */
export class StoreMiddlewareManager<T extends object> {
  private middlewares: Middleware<T>[] = [];
  private enabled = true;
  
  /**
   * Add middleware
   */
  use(
    middleware: MiddlewareFunction<T> | Middleware<T>,
    config?: MiddlewareConfig
  ): () => void {
    const mw: Middleware<T> = typeof middleware === 'function'
      ? { handler: middleware, ...config }
      : middleware;
    
    // Set defaults
    mw.enabled = mw.enabled !== false;
    mw.priority = mw.priority ?? 50;
    
    // Insert in priority order
    const index = this.middlewares.findIndex(m => (m.priority || 50) > (mw.priority || 50));
    if (index === -1) {
      this.middlewares.push(mw);
    } else {
      this.middlewares.splice(index, 0, mw);
    }
    
    // Return unsubscribe function
    return () => {
      const idx = this.middlewares.indexOf(mw);
      if (idx !== -1) {
        this.middlewares.splice(idx, 1);
      }
    };
  }
  
  /**
   * Remove middleware by name
   */
  remove(name: string): boolean {
    const index = this.middlewares.findIndex(m => m.name === name);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Clear all middleware
   */
  clear(): void {
    this.middlewares = [];
  }
  
  /**
   * Enable/disable middleware
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Enable/disable specific middleware
   */
  setMiddlewareEnabled(name: string, enabled: boolean): boolean {
    const mw = this.middlewares.find(m => m.name === name);
    if (mw) {
      mw.enabled = enabled;
      return true;
    }
    return false;
  }
  
  /**
   * Apply middleware to a change
   */
  apply(
    path: string[],
    oldValue: any,
    newValue: any,
    store: Store<T>,
    metadata?: Record<string, any>
  ): { value: any; aborted: boolean } {
    if (!this.enabled || this.middlewares.length === 0) {
      return { value: newValue, aborted: false };
    }
    
    let currentValue = newValue;
    let aborted = false;
    
    const context: MiddlewareContext<T> = {
      path,
      oldValue,
      get newValue() { return currentValue; },
      store,
      metadata,
      abort: () => { aborted = true; },
      setValue: (value: any) => { currentValue = value; }
    };
    
    for (const mw of this.middlewares) {
      // Skip disabled middleware
      if (!mw.enabled) continue;
      
      // Check path pattern if specified
      if (mw.pathPattern) {
        const pathStr = path.join('.');
        if (typeof mw.pathPattern === 'string') {
          // Simple glob-like matching
          const pattern = mw.pathPattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '[^.]*')
            .replace(/\*\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          if (!regex.test(pathStr)) continue;
        } else if (mw.pathPattern instanceof RegExp) {
          if (!mw.pathPattern.test(pathStr)) continue;
        }
      }
      
      // Apply middleware
      const result = mw.handler(context);
      
      // Check if aborted
      if (aborted || result === false) {
        return { value: oldValue, aborted: true };
      }
      
      // Allow middleware to return new value
      if (result !== undefined && result !== null) {
        currentValue = result;
      }
    }
    
    return { value: currentValue, aborted: false };
  }
  
  /**
   * Get middleware list
   */
  getMiddlewares(): readonly Middleware<T>[] {
    return [...this.middlewares];
  }
}

/**
 * Common middleware factories
 */
export const commonMiddleware = {
  /**
   * Logging middleware
   */
  logger<T extends object>(options?: {
    console?: Console;
    prefix?: string;
    includeStack?: boolean;
  }): Middleware<T> {
    const console = options?.console ?? globalThis.console;
    const prefix = options?.prefix ?? '[Store]';
    
    return {
      name: 'logger',
      priority: 100, // Run early
      handler: (ctx) => {
        const pathStr = ctx.path.join('.');
        console.log(`${prefix} ${pathStr}: ${JSON.stringify(ctx.oldValue)} → ${JSON.stringify(ctx.newValue)}`);
        
        if (options?.includeStack) {
          console.trace();
        }
      }
    };
  },
  
  /**
   * Validation middleware
   */
  validator<T extends object>(
    validators: Record<string, (value: any, ctx: MiddlewareContext<T>) => boolean | string>
  ): Middleware<T> {
    return {
      name: 'validator',
      priority: 20, // Run before most middleware
      handler: (ctx) => {
        const pathStr = ctx.path.join('.');
        
        // Check for exact match or pattern match
        for (const [pattern, validator] of Object.entries(validators)) {
          const regex = new RegExp(
            '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]*').replace(/\*\*/g, '.*') + '$'
          );
          
          if (regex.test(pathStr)) {
            const result = validator(ctx.newValue, ctx);
            
            if (result === false) {
              console.error(`Validation failed for ${pathStr}: value ${JSON.stringify(ctx.newValue)} is invalid`);
              ctx.abort();
              return;
            } else if (typeof result === 'string') {
              console.error(`Validation failed for ${pathStr}: ${result}`);
              ctx.abort();
              return;
            }
          }
        }
      }
    };
  },
  
  /**
   * Immutability middleware (creates deep copies)
   */
  immutable<T extends object>(): Middleware<T> {
    return {
      name: 'immutable',
      priority: 30,
      handler: (ctx) => {
        if (typeof ctx.newValue === 'object' && ctx.newValue !== null) {
          ctx.setValue(structuredClone ? structuredClone(ctx.newValue) : JSON.parse(JSON.stringify(ctx.newValue)));
        }
      }
    };
  },
  
  /**
   * Persistence middleware
   */
  persist<T extends object>(options: {
    storage?: Storage;
    key?: string;
    debounce?: number;
    serialize?: (value: any) => string;
    deserialize?: (value: string) => any;
  } = {}): Middleware<T> {
    const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const key = options.key ?? 'store';
    const serialize = options.serialize ?? JSON.stringify;
    const deserialize = options.deserialize ?? JSON.parse;
    
    let timeoutId: any;
    
    return {
      name: 'persist',
      priority: 80, // Run late
      handler: (ctx) => {
        if (!storage) return;
        
        const save = () => {
          try {
            // Get root state
            const state = ctx.store.get();
            storage.setItem(key, serialize(state));
          } catch (error) {
            console.error('Failed to persist store:', error);
          }
        };
        
        if (options.debounce) {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(save, options.debounce);
        } else {
          save();
        }
      }
    };
  },
  
  /**
   * History/undo middleware
   */
  history<T extends object>(options: {
    maxSize?: number;
    debounce?: number;
  } = {}): Middleware<T> & {
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    clear: () => void;
  } {
    const maxSize = options.maxSize ?? 50;
    const history: any[] = [];
    let currentIndex = -1;
    let timeoutId: any;
    let store: Store<T> | null = null;
    
    const handler: MiddlewareFunction<T> = (ctx) => {
      if (!store) store = ctx.store;
      
      const addToHistory = () => {
        // Remove any redo history
        history.splice(currentIndex + 1);
        
        // Add new state
        const state = ctx.store.get();
        history.push(structuredClone ? structuredClone(state) : JSON.parse(JSON.stringify(state)));
        
        // Limit history size
        if (history.length > maxSize) {
          history.shift();
        } else {
          currentIndex++;
        }
      };
      
      if (options.debounce) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(addToHistory, options.debounce);
      } else {
        addToHistory();
      }
    };
    
    return {
      name: 'history',
      priority: 90,
      handler,
      undo: () => {
        if (currentIndex > 0 && store) {
          currentIndex--;
          const state = history[currentIndex];
          (store as any).set(state);
        }
      },
      redo: () => {
        if (currentIndex < history.length - 1 && store) {
          currentIndex++;
          const state = history[currentIndex];
          (store as any).set(state);
        }
      },
      canUndo: () => currentIndex > 0,
      canRedo: () => currentIndex < history.length - 1,
      clear: () => {
        history.length = 0;
        currentIndex = -1;
      }
    };
  },
  
  /**
   * Freeze certain paths (make them read-only)
   */
  freeze<T extends object>(paths: string[]): Middleware<T> {
    return {
      name: 'freeze',
      priority: 10, // Run very early
      handler: (ctx) => {
        const pathStr = ctx.path.join('.');
        if (paths.includes(pathStr)) {
          console.warn(`Attempted to modify frozen path: ${pathStr}`);
          ctx.abort();
        }
      }
    };
  },
  
  /**
   * Transform middleware (modify values)
   */
  transform<T extends object>(
    transforms: Record<string, (value: any, ctx: MiddlewareContext<T>) => any>
  ): Middleware<T> {
    return {
      name: 'transform',
      priority: 40,
      handler: (ctx) => {
        const pathStr = ctx.path.join('.');
        
        for (const [pattern, transformer] of Object.entries(transforms)) {
          const regex = new RegExp(
            '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]*').replace(/\*\*/g, '.*') + '$'
          );
          
          if (regex.test(pathStr)) {
            const transformed = transformer(ctx.newValue, ctx);
            ctx.setValue(transformed);
          }
        }
      }
    };
  }
};