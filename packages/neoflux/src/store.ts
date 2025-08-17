/**
 * Deep Reactive Store with Proxy-based reactivity
 * Provides full deep reactivity for nested objects and arrays
 */

import { batch } from './batch.js';
import { computed } from './computed.js';
import { signal, type WritableSignal } from './signal.js';
import { ProxyRegistry } from './proxy-registry.js';

export interface StoreOptions {
  shallow?: string[];  // Paths that should not be deeply reactive
  lazy?: boolean;      // Lazy initialization of nested objects
  equals?: (a: any, b: any) => boolean; // Custom equality function
}

interface StoreSubscription {
  path: string;
  callback: (value: any) => void;
}

/**
 * LRU Cache for signal caching
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Deep reactive store implementation
 */
export class Store<T extends object> {
  private root: WritableSignal<T>;
  private proxies = new WeakMap<object, any>();
  private proxyRegistry = new ProxyRegistry();
  private signals = new Map<string, WritableSignal<any>>();
  private signalCache = new LRUCache<string, WritableSignal<any>>(500);
  private subscriptions: StoreSubscription[] = [];
  private options: StoreOptions;
  private version = 0;
  private globalSubscribers: Array<(state: T) => void> = [];

  constructor(initial: T, options: StoreOptions = {}) {
    this.options = {
      equals: Object.is,
      ...options
    };
    // Use default equality for root signal
    this.root = signal(initial, { equals: this.options.equals });

    // Create proxy first, then add methods
    // eslint-disable-next-line prefer-const
    let proxy: any;

    // Store reference for methods to use
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const storeInstance = this;

    // Store methods in a separate object to avoid proxy conflicts
    const storeMethods = {
      get: (key?: string | number | symbol): any => {
        // If no key provided, return entire state
        if (key === undefined) {
          return storeInstance.root();
        }
        // Access through proxy to get granular tracking
        const value = proxy ? (proxy as any)[key] : (storeInstance.root() as any)[key];
        // Return unproxified value for consistency with tests
        return storeInstance.unproxify(value);
      },
      getState: (): T => {
        return storeInstance.root();
      },
      set: (key: string | number | symbol, value: any | ((prev: any) => any)): void => {
        // Calculate new value if it's a function
        const newValue = typeof value === 'function'
          ? value((proxy as any)[key])
          : value;

        // Set through proxy to trigger granular updates
        (proxy as any)[key] = newValue;
      },
      subscribe: storeInstance.subscribe.bind(storeInstance),
      update: storeInstance.update.bind(storeInstance),
      reset: storeInstance.reset.bind(storeInstance),
      toJSON: storeInstance.toJSON.bind(storeInstance),
      getSignalCount: storeInstance.getSignalCount.bind(storeInstance),
      getSignalPaths: storeInstance.getSignalPaths.bind(storeInstance),
      getCacheSize: storeInstance.getCacheSize.bind(storeInstance),
      getVersion: storeInstance.getVersion.bind(storeInstance),
      transaction: (fn: (state: T) => void) => {
        batch(() => {
          fn(proxy);
        });
      }
    };

    // Store reference to methods in Store instance
    (this as any).__methods = storeMethods;

    // Create and assign the proxy - use the root signal's value to ensure they share the same object
    const rootValue = this.root.peek();
    proxy = storeInstance.createProxy(rootValue, [], storeMethods);

    return proxy as Store<T> & T;
  }


  private getOrCreateProxy(obj: object, path: string[]): any {
    const pathStr = path.join('.');
    
    // Try to get existing proxy from registry
    const existingProxy = this.proxyRegistry.get(pathStr);
    if (existingProxy) return existingProxy;
    
    // Create new proxy and register it
    const proxy = this.createProxy(obj, path);
    this.proxyRegistry.register(pathStr, proxy);
    return proxy;
  }

  private unproxify(value: any): any {
    // Return primitives as-is
    if (value === null || value === undefined || typeof value !== 'object') {
      return value;
    }

    // Check if it's a proxy
    if (!(value as any).__isProxy) {
      return value;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.unproxify(item));
    }

    // Handle Map
    if (value instanceof Map) {
      const result = new Map();
      for (const [k, v] of value) {
        result.set(k, this.unproxify(v));
      }
      return result;
    }

    // Handle Set
    if (value instanceof Set) {
      const result = new Set();
      for (const item of value) {
        result.add(this.unproxify(item));
      }
      return result;
    }

    // Handle plain objects
    const result: any = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = this.unproxify(value[key]);
      }
    }
    return result;
  }

  private createProxy<O extends object>(obj: O, path: string[], storeMethods?: any): O {
    // Handle primitives and null
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Return existing proxy
    if (this.proxies.has(obj)) {
      return this.proxies.get(obj);
    }

    // Check if path should be shallow
    const pathStr = path.join('.');
    if (this.options.shallow?.includes(pathStr)) {
      return obj;
    }

    // Special handling for arrays
    if (Array.isArray(obj)) {
      return this.createArrayProxy(obj, path, storeMethods) as any;
    }

    // Create object proxy
    const proxy = new Proxy(obj, {
      get: (target, prop, receiver) => {
        // Special properties
        if (prop === Symbol.toStringTag) return 'Store';
        if (prop === '__isProxy') return true;
        if (prop === '__path') return path;

        // If accessing store methods directly, return them from storeMethods
        if (path.length === 0 && storeMethods && storeMethods[prop]) {
          return storeMethods[prop];
        }

        // Skip non-enumerable and symbol properties for reactivity
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }

        const propPath = [...path, String(prop)];
        const pathKey = propPath.join('.');

        // Handle Map and Set methods specially
        if (target instanceof Map || target instanceof Set) {
          const value = Reflect.get(target, prop, target); // Use target as receiver for native methods

          // If it's a method that modifies the collection, wrap it to trigger reactivity
          if (typeof value === 'function') {
            const mutatingMethods = ['set', 'add', 'delete', 'clear'];
            if (mutatingMethods.includes(String(prop))) {
              return (...args: any[]) => {
                const result = value.apply(target, args);

                // Update size signal after mutation
                const sizeKey = [...path, 'size'].join('.');
                let sizeSig = this.signals.get(sizeKey);
                if (!sizeSig) {
                  sizeSig = signal(target.size, { equals: this.options.equals });
                  this.signals.set(sizeKey, sizeSig);
                  this.signalCache.set(sizeKey, sizeSig);
                } else {
                  sizeSig.set(target.size);
                }

                return result;
              };
            }
            return value.bind(target);
          }

          // For properties like 'size', track it reactively
          if (prop === 'size') {
            // Get or create signal for size tracking
            let sig = this.signalCache.get(pathKey);
            if (!sig) {
              sig = signal(target.size, { equals: this.options.equals });
              this.signals.set(pathKey, sig);
              this.signalCache.set(pathKey, sig);
            } else {
              // Update signal if size has changed
              if (sig.peek() !== target.size) {
                sig.set(target.size);
              }
            }
            return sig();
          }

          return value;
        }

        // Get the current value from target
        const currentValue = Reflect.get(target, prop, receiver);

        // Get or create signal for this path
        let sig = this.signalCache.get(pathKey);
        if (!sig) {
          if (!this.signals.has(pathKey)) {
            sig = signal(currentValue, { equals: this.options.equals });
            this.signals.set(pathKey, sig);
            this.signalCache.set(pathKey, sig);
          } else {
            sig = this.signals.get(pathKey)!;
            this.signalCache.set(pathKey, sig);
            // Ensure signal has current value
            if (sig.peek() !== currentValue) {
              sig.set(currentValue);
            }
          }
        } else {
          // Ensure cached signal has current value
          if (sig.peek() !== currentValue) {
            sig.set(currentValue);
          }
        }

        // Track dependency
        const value = sig();

        // Recursively proxy objects
        if (typeof value === 'object' && value !== null) {
          if (this.options.lazy && !this.proxies.has(value)) {
            // Lazy initialization - only create proxy when accessed
            return this.getOrCreateProxy(value, propPath);
          }
          return this.createProxy(value, propPath);
        }

        return value;
      },

      set: (target, prop, value, receiver) => {
        // Skip symbols
        if (typeof prop === 'symbol') {
          return Reflect.set(target, prop, value, receiver);
        }

        const propPath = [...path, String(prop)];
        const pathKey = propPath.join('.');

        // Batch multiple updates
        let result = true;
        batch(() => {
          // For both root and nested properties, handle the same way
          const oldValue = Reflect.get(target, prop, receiver);

          // Check equality - but arrays/objects are never equal by reference
          // Skip equality check for arrays and objects  
          const skipEqualityCheck = Array.isArray(value) ||
            (typeof value === 'object' && value !== null && !(value instanceof Date));

          if (!skipEqualityCheck && this.options.equals!(oldValue, value)) {
            result = true;
            return;
          }

          // If replacing an object, clear old proxy cache
          if (typeof oldValue === 'object' && oldValue !== null) {
            this.proxies.delete(oldValue);
            this.proxyRegistry.delete(pathKey);
          }

          // Update the actual value
          result = Reflect.set(target, prop, value, receiver);

          // Update or create signal
          let sig = this.signals.get(pathKey);
          if (!sig) {
            sig = signal(value, { equals: this.options.equals });
            this.signals.set(pathKey, sig);
            this.signalCache.set(pathKey, sig);
          } else {
            sig.set(value);
          }

          // If the new value is an array, update its length signal
          if (Array.isArray(value)) {
            const lengthKey = [...propPath, 'length'].join('.');
            let lengthSig = this.signals.get(lengthKey);
            if (!lengthSig) {
              lengthSig = signal(value.length, { equals: this.options.equals });
              this.signals.set(lengthKey, lengthSig);
              this.signalCache.set(lengthKey, lengthSig);
            } else {
              lengthSig.set(value.length);
            }
          }

          // Increment version for change tracking
          this.version++;

          // Update parent signals
          this.updateParentSignals(propPath);

          // Notify subscriptions
          this.notifySubscriptions(pathKey, value);
        });
        return result;
      },

      has: (target, prop) => {
        if (typeof prop === 'symbol') {
          return Reflect.has(target, prop);
        }

        const propPath = [...path, String(prop)];
        const pathKey = propPath.join('.');

        // Track access for reactivity
        const sig = this.signals.get(pathKey);
        if (sig) {
          sig(); // Track dependency
        }

        return Reflect.has(target, prop);
      },

      deleteProperty: (target, prop) => {
        if (typeof prop === 'symbol') {
          return Reflect.deleteProperty(target, prop);
        }

        const propPath = [...path, String(prop)];
        const pathKey = propPath.join('.');

        let result = true;
        batch(() => {
          result = Reflect.deleteProperty(target, prop);

          // Remove signal
          if (this.signals.has(pathKey)) {
            this.signals.delete(pathKey);
            this.signalCache.set(pathKey, undefined as any);
          }

          // Clean up nested signals
          this.cleanupNestedSignals(pathKey);

          // Update parent signals
          this.updateParentSignals(propPath);

          // Increment version
          this.version++;
        });
        return result;
      },

      ownKeys: (target) => {
        // Track access to keys
        const pathKey = path.join('.');
        const sig = this.signals.get(pathKey);
        if (sig) {
          sig(); // Track dependency
        }
        return Reflect.ownKeys(target);
      },

      getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop)
    });

    this.proxies.set(obj, proxy);
    return proxy;
  }

  private createArrayProxy<E>(arr: E[], path: string[], _storeMethods?: any): E[] {
    const proxy = new Proxy(arr, {
      get: (target, prop, receiver) => {
        // Special properties
        if (prop === '__isProxy') return true;
        if (prop === '__path') return path;

        // Array methods that mutate
        const mutatingMethods = [
          'push', 'pop', 'shift', 'unshift',
          'splice', 'sort', 'reverse', 'fill', 'copyWithin'
        ];

        if (typeof prop === 'string' && mutatingMethods.includes(prop)) {
          return (...args: any[]) => batch(() => {
            const result = (target as any)[prop](...args);
            this.updateArraySignals(path);
            return result;
          });
        }

        // Handle array indexing
        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          const propPath = [...path, prop];
          const pathKey = propPath.join('.');

          // Get or create signal
          let sig = this.signals.get(pathKey);
          if (!sig) {
            const value = Reflect.get(target, prop, receiver);
            sig = signal(value, { equals: this.options.equals });
            this.signals.set(pathKey, sig);
          }

          const value = sig();

          // Recursively proxy objects
          if (typeof value === 'object' && value !== null) {
            return this.createProxy(value, propPath);
          }

          return value;
        }

        // Handle length property
        if (prop === 'length') {
          const pathKey = [...path, 'length'].join('.');
          let sig = this.signals.get(pathKey);
          if (!sig) {
            sig = signal(target.length, { equals: this.options.equals });
            this.signals.set(pathKey, sig);
          }
          return sig();
        }

        // Default behavior
        const value = Reflect.get(target, prop, receiver);

        // Bind array methods to maintain correct context
        if (typeof value === 'function') {
          return value.bind(target);
        }

        return value;
      },

      set: (target, prop, value, receiver) => {
        let result = true;
        batch(() => {
          result = Reflect.set(target, prop, value, receiver);

          if (typeof prop === 'string' && !isNaN(Number(prop))) {
            const propPath = [...path, prop];
            const pathKey = propPath.join('.');

            let sig = this.signals.get(pathKey);
            if (!sig) {
              sig = signal(value, { equals: this.options.equals });
              this.signals.set(pathKey, sig);
            } else {
              sig.set(value);
            }
          }

          // Update length signal if needed
          if (prop === 'length' || (typeof prop === 'string' && !isNaN(Number(prop)))) {
            const lengthKey = [...path, 'length'].join('.');
            const lengthSig = this.signals.get(lengthKey);
            if (lengthSig) {
              lengthSig.set(target.length);
            }
          }

          this.updateArraySignals(path);
        });
        return result;
      }
    });

    this.proxies.set(arr, proxy);
    return proxy;
  }

  private updateParentSignals(path: string[]): void {
    // Update all parent paths
    for (let i = path.length - 1; i >= 0; i--) {
      const parentPath = path.slice(0, i).join('.');
      if (this.signals.has(parentPath)) {
        const parentSignal = this.signals.get(parentPath)!;
        const currentValue = parentSignal.peek();

        // Create new reference to trigger updates
        if (Array.isArray(currentValue)) {
          parentSignal.set([...currentValue]);
        } else if (typeof currentValue === 'object' && currentValue !== null) {
          parentSignal.set({ ...currentValue });
        }
      }
    }

    // Notify global subscribers about the change
    const currentState = this.root.peek();
    for (const subscriber of this.globalSubscribers) {
      // Pass a deep copy to ensure immutability
      const immutableCopy = JSON.parse(JSON.stringify(currentState));
      subscriber(immutableCopy);
    }
  }

  private updateArraySignals(path: string[]): void {
    const pathKey = path.join('.');
    if (this.signals.has(pathKey)) {
      const sig = this.signals.get(pathKey)!;
      const currentValue = sig.peek();
      if (Array.isArray(currentValue)) {
        sig.set([...currentValue]);
      }
    }
    this.updateParentSignals(path);
  }

  private cleanupNestedSignals(pathPrefix: string): void {
    const toDelete: string[] = [];

    for (const [key] of this.signals) {
      if (key.startsWith(pathPrefix + '.')) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.signals.delete(key);
      this.signalCache.set(key, undefined as any);
    }
  }

  private notifySubscriptions(path: string, value: any): void {
    for (const sub of this.subscriptions) {
      if (path.startsWith(sub.path) || sub.path === '*') {
        sub.callback(value);
      }
    }
  }

  // Public API

  get<K extends keyof T>(key: K): T[K] {
    return (this as any)[key];
  }

  set<K extends keyof T>(key: K, value: T[K] | ((prev: T[K]) => T[K])): void {
    if (typeof value === 'function') {
      const fn = value as (prev: T[K]) => T[K];
      (this as any)[key] = fn((this as any)[key]);
    } else {
      (this as any)[key] = value;
    }
  }

  update(fnOrObject: ((state: T) => void) | Partial<T>): void {
    batch(() => {
      if (typeof fnOrObject === 'function') {
        fnOrObject(this as any);
      } else {
        // Update with partial object
        const currentData = this.root();
        const proxy = this.proxies.get(currentData);
        if (proxy) {
          Object.assign(proxy, fnOrObject);
        } else {
          Object.assign(currentData, fnOrObject);
        }
      }
    });
  }

  reset(newState: T): void {
    batch(() => {
      // Clear all signals
      this.signals.clear();
      this.signalCache.clear();
      this.proxies = new WeakMap();
      this.proxyRegistry.clear();

      // Update root
      this.root.set(newState);

      // Recreate proxy
      const proxy = this.createProxy(newState, []);
      Object.setPrototypeOf(this, proxy);
    });
  }

  subscribe(pathOrCallback: string | ((state: T) => void), callback?: (value: any) => void): () => void {
    if (typeof pathOrCallback === 'function') {
      // Subscribe to all changes
      this.globalSubscribers.push(pathOrCallback);

      // Return unsubscribe function
      return () => {
        const index = this.globalSubscribers.indexOf(pathOrCallback);
        if (index >= 0) {
          this.globalSubscribers.splice(index, 1);
        }
      };
    } else {
      // Subscribe to specific path
      const subscription: StoreSubscription = {
        path: pathOrCallback,
        callback: callback!
      };

      this.subscriptions.push(subscription);

      // Return unsubscribe function
      return () => {
        const index = this.subscriptions.indexOf(subscription);
        if (index >= 0) {
          this.subscriptions.splice(index, 1);
        }
      };
    }
  }

  toJSON(): T {
    return JSON.parse(JSON.stringify(this.root()));
  }

  // Debug utilities

  getSignalCount(): number {
    return this.signals.size;
  }

  getCacheSize(): number {
    return this.signalCache.size();
  }

  getVersion(): number {
    return this.version;
  }

  getSignalPaths(): string[] {
    return Array.from(this.signals.keys());
  }
}

/**
 * Factory function for creating deep reactive stores
 */
export function store<T extends object>(
  initial: T,
  options?: StoreOptions
): Store<T> & T {
  const storeInstance = new Store(initial, options);
  // Ensure get and set methods are accessible
  if (!(storeInstance as any).get) {
    console.warn('Store get method not accessible, using fallback');
    // Create a simple store wrapper with get/set methods
    const wrapper = Object.assign({}, storeInstance, {
      get<K extends keyof T>(key: K): T[K] {
        return (storeInstance as any)[key];
      },
      set<K extends keyof T>(key: K, value: T[K]): void {
        (storeInstance as any)[key] = value;
      }
    });
    return wrapper as any;
  }
  return storeInstance as any;
}

/**
 * Create a selector for optimized subscriptions
 */
export function selector<T, R>(
  source: () => T,
  select: (value: T) => R,
  options?: { equals?: (a: R, b: R) => boolean }
): () => R {
  return computed(() => select(source()), options);
}

/**
 * Transaction support for atomic updates
 */
export class Transaction<T extends object> {
  private changes = new Map<any, { old: any; new: any }>();
  private committed = false;
  private store: Store<T>;

  constructor(s: Store<T>) {
    this.store = s;
  }

  update<K extends keyof T>(key: K, value: T[K]): void {
    if (this.committed) {
      throw new Error('Transaction already committed');
    }

    const oldValue = this.store.get(key);
    if (!this.changes.has(key)) {
      this.changes.set(key, { old: oldValue, new: value });
    } else {
      this.changes.get(key)!.new = value;
    }

    this.store.set(key, value);
  }

  commit(): void {
    this.committed = true;
  }

  rollback(): void {
    if (!this.committed) {
      batch(() => {
        for (const [key, { old }] of this.changes) {
          this.store.set(key as keyof T, old);
        }
      });
    }
  }
}

/**
 * Create a transaction
 */
export function transaction<T extends object>(
  s: Store<T>,
  fn: (tx: Transaction<T>) => void
): void {
  const tx = new Transaction(s);

  try {
    batch(() => {
      fn(tx);
      tx.commit();
    });
  } catch (error) {
    tx.rollback();
    throw error;
  }
}
