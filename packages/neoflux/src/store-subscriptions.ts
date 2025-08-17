/**
 * Enhanced Store Subscriptions
 * Provides selective path-based subscriptions for stores
 */

import type { Store } from './types.js';

/**
 * Subscription callback
 */
export type SubscriptionCallback<T = any> = (
  value: T,
  oldValue: T | undefined,
  path: string[]
) => void;

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  /** Whether to call immediately with current value */
  immediate?: boolean;
  /** Whether to deeply watch nested changes */
  deep?: boolean;
  /** Custom equality check */
  equals?: (a: any, b: any) => boolean;
  /** Debounce delay in milliseconds */
  debounce?: number;
}

/**
 * Internal subscription record
 */
interface SubscriptionRecord {
  path: string[];
  callback: SubscriptionCallback;
  options: SubscriptionOptions;
  lastValue?: any;
  timeoutId?: any;
}

/**
 * Path matcher utility
 */
export class PathMatcher {
  private pattern: string;
  private regex: RegExp;
  private isWildcard: boolean;
  
  constructor(pattern: string) {
    this.pattern = pattern;
    this.isWildcard = pattern.includes('*');
    
    if (this.isWildcard) {
      // Convert glob pattern to regex
      const regexStr = '^' + pattern
        .split('.')
        .map(part => {
          if (part === '*') return '[^.]+';
          if (part === '**') return '.*';
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('\\.') + '$';
      
      this.regex = new RegExp(regexStr);
    } else {
      this.regex = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
    }
  }
  
  /**
   * Check if a path matches this pattern
   */
  matches(path: string | string[]): boolean {
    const pathStr = Array.isArray(path) ? path.join('.') : path;
    return this.regex.test(pathStr);
  }
  
  /**
   * Check if this pattern could match children of the given path
   */
  matchesChildren(path: string | string[]): boolean {
    if (!this.isWildcard) return false;
    
    const pathStr = Array.isArray(path) ? path.join('.') : path;
    const childPattern = pathStr + '.**';
    
    return this.matches(childPattern) || this.pattern.startsWith(pathStr + '.');
  }
  
  /**
   * Extract captured groups from a path
   */
  extract(path: string | string[]): string[] | null {
    const pathStr = Array.isArray(path) ? path.join('.') : path;
    const match = pathStr.match(this.regex);
    return match ? match.slice(1) : null;
  }
}

/**
 * Enhanced subscription manager for stores
 */
export class StoreSubscriptionManager<T extends object> {
  private subscriptions: SubscriptionRecord[] = [];
  private pathCache = new Map<string, any>();
  private store: Store<T>;
  
  constructor(store: Store<T>) {
    this.store = store;
  }
  
  /**
   * Subscribe to a specific path or pattern
   */
  subscribe(
    path: string | string[],
    callback: SubscriptionCallback,
    options: SubscriptionOptions = {}
  ): () => void {
    const pathArray = Array.isArray(path) ? path : path.split('.');
    const pathStr = pathArray.join('.');
    
    const subscription: SubscriptionRecord = {
      path: pathArray,
      callback,
      options: {
        equals: Object.is,
        ...options
      },
      lastValue: undefined
    };
    
    this.subscriptions.push(subscription);
    
    // Call immediately if requested
    if (options.immediate) {
      const currentValue = this.getValueAtPath(pathArray);
      this.triggerCallback(subscription, currentValue, undefined, pathArray);
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.subscriptions.indexOf(subscription);
      if (index !== -1) {
        // Clear any pending debounce
        if (subscription.timeoutId) {
          clearTimeout(subscription.timeoutId);
        }
        this.subscriptions.splice(index, 1);
      }
    };
  }
  
  /**
   * Subscribe to multiple paths
   */
  subscribeMany(
    subscriptions: Array<{
      path: string | string[];
      callback: SubscriptionCallback;
      options?: SubscriptionOptions;
    }>
  ): () => void {
    const unsubscribes = subscriptions.map(sub =>
      this.subscribe(sub.path, sub.callback, sub.options)
    );
    
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }
  
  /**
   * Watch for any changes in the store
   */
  watchAll(callback: (state: T) => void): () => void {
    return this.subscribe('', (value) => callback(value as T), { deep: true });
  }
  
  /**
   * Notify subscribers of a change
   */
  notify(path: string[], newValue: any, oldValue: any): void {
    const pathStr = path.join('.');
    
    for (const subscription of this.subscriptions) {
      if (this.shouldNotify(subscription, path, pathStr)) {
        const value = path.length === 0 ? newValue : this.getValueAtPath(subscription.path);
        
        // Check equality
        if (!subscription.options.equals!(value, subscription.lastValue)) {
          this.triggerCallback(subscription, value, subscription.lastValue, path);
          subscription.lastValue = value;
        }
      }
    }
  }
  
  /**
   * Check if a subscription should be notified
   */
  private shouldNotify(subscription: SubscriptionRecord, changePath: string[], changePathStr: string): boolean {
    const subPathStr = subscription.path.join('.');
    
    // Exact match
    if (subPathStr === changePathStr) {
      return true;
    }
    
    // Pattern matching
    if (subPathStr.includes('*')) {
      const matcher = new PathMatcher(subPathStr);
      return matcher.matches(changePathStr);
    }
    
    // Deep watching - check if change is in a child path
    if (subscription.options.deep) {
      if (changePathStr.startsWith(subPathStr + '.')) {
        return true;
      }
    }
    
    // Check if change is in a parent path (affects this subscription)
    if (subPathStr.startsWith(changePathStr + '.')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Trigger a subscription callback
   */
  private triggerCallback(
    subscription: SubscriptionRecord,
    value: any,
    oldValue: any,
    path: string[]
  ): void {
    const trigger = () => {
      try {
        subscription.callback(value, oldValue, path);
      } catch (error) {
        console.error('Error in subscription callback:', error);
      }
    };
    
    if (subscription.options.debounce) {
      // Clear existing timeout
      if (subscription.timeoutId) {
        clearTimeout(subscription.timeoutId);
      }
      
      // Set new timeout
      subscription.timeoutId = setTimeout(() => {
        subscription.timeoutId = undefined;
        trigger();
      }, subscription.options.debounce);
    } else {
      trigger();
    }
  }
  
  /**
   * Get value at a specific path
   */
  private getValueAtPath(path: string[]): any {
    if (path.length === 0) {
      return this.store.get();
    }
    
    let current: any = this.store.get();
    
    for (const key of path) {
      if (current == null) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }
  
  /**
   * Clear all subscriptions
   */
  clear(): void {
    // Clear any pending debounces
    for (const subscription of this.subscriptions) {
      if (subscription.timeoutId) {
        clearTimeout(subscription.timeoutId);
      }
    }
    
    this.subscriptions = [];
    this.pathCache.clear();
  }
  
  /**
   * Get subscription count
   */
  get count(): number {
    return this.subscriptions.length;
  }
  
  /**
   * Get all active subscription paths
   */
  getPaths(): string[] {
    return this.subscriptions.map(sub => sub.path.join('.'));
  }
}

/**
 * Computed values derived from store paths
 */
export function storeComputed<T extends object, R>(
  store: Store<T>,
  paths: string[],
  compute: (...values: any[]) => R,
  options?: SubscriptionOptions
): {
  get: () => R;
  dispose: () => void;
} {
  let currentValue: R;
  let isInitialized = false;
  const unsubscribes: (() => void)[] = [];
  
  // Helper to get value at path
  function getValueAtPath(path: string): any {
    const parts = path.split('.');
    let current: any = store.get();
    
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    
    return current;
  }
  
  // Compute initial value
  function recompute() {
    const values = paths.map(path => getValueAtPath(path));
    currentValue = compute(...values);
    isInitialized = true;
  }
  
  // Initial computation
  recompute();
  
  // Subscribe to paths
  const manager = (store as any).__subscriptions as StoreSubscriptionManager<T>;
  if (manager) {
    for (const path of paths) {
      const unsub = manager.subscribe(
        path,
        () => recompute(),
        options
      );
      unsubscribes.push(unsub);
    }
  }
  
  return {
    get: () => {
      if (!isInitialized) recompute();
      return currentValue;
    },
    dispose: () => {
      unsubscribes.forEach(unsub => unsub());
    }
  };
}

/**
 * Create a derived store from specific paths
 */
export function derivedStore<T extends object, R extends object>(
  store: Store<T>,
  mapping: Record<string, string>,
  options?: SubscriptionOptions
): Store<R> {
  // Create new store with initial mapped values
  const initialState: any = {};
  
  function getValueAtPath(path: string): any {
    const parts = path.split('.');
    let current: any = store.get();
    
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    
    return current;
  }
  
  // Set initial values
  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    initialState[targetKey] = getValueAtPath(sourcePath);
  }
  
  // Create derived store
  const derived = new (store.constructor as any)(initialState) as Store<R>;
  
  // Subscribe to changes and update derived store
  const manager = (store as any).__subscriptions as StoreSubscriptionManager<T>;
  if (manager) {
    for (const [targetKey, sourcePath] of Object.entries(mapping)) {
      manager.subscribe(
        sourcePath,
        (value) => {
          (derived as any)[targetKey] = value;
        },
        options
      );
    }
  }
  
  return derived;
}