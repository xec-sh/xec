/**
 * ReactiveState - Advanced reactive state management powered by Vibrancy
 * 
 * Features:
 * - Fine-grained reactivity with automatic dependency tracking
 * - Diamond dependency resolution
 * - Async computed values support
 * - Memory-safe with automatic cleanup
 * - Store middleware support
 * - Selective subscriptions
 */

import { EventEmitter } from '../event-emitter.js';
import {
  store,
  signal,
  computed,
  effect,
  batch,
  untrack,
  createRoot,
  onCleanup,
  type Store,
  type Signal,
  type WritableSignal,
  type ComputedSignal,
  type Disposable,
  StoreSubscriptionManager,
  StoreMiddlewareManager,
  type MiddlewareFunction,
  type SubscriptionCallback,
  asyncComputed,
  type AsyncComputed,
  resolveDiamondDependencies,
  ProxyRegistry
} from 'vibrancy';

type Listener<T> = (value: T) => void;
type Unsubscribe = () => void;
type UpdateFn<T> = (prev: T) => T;

// Advanced computed options
interface ComputedOptions<T> {
  async?: boolean;
  defaultValue?: T;
  equals?: (a: T, b: T) => boolean;
  onError?: (error: Error) => void;
}

// Enhanced reactive node for tracking
interface ReactiveNode {
  id: string;
  signal?: WritableSignal<any>;
  computed?: ComputedSignal<any> | AsyncComputed<any>;
  dispose?: Disposable;
}

export class ReactiveState<T extends Record<string, any>> extends EventEmitter {
  private store: Store<T>;
  private signals: Map<keyof T, WritableSignal<T[keyof T]>> = new Map();
  private computedValues: Map<string, ComputedSignal<any> | AsyncComputed<any>> = new Map();
  private subscriptions: StoreSubscriptionManager<T>;
  private middleware: StoreMiddlewareManager<T>;
  private proxyRegistry: ProxyRegistry;
  private rootDispose?: () => void;
  private disposed = false;

  constructor(initialState: T) {
    super();
    
    // Create root context for cleanup
    createRoot((dispose) => {
      this.rootDispose = dispose;
      
      // Initialize vibrancy store with enhanced features
      this.store = store<T>(initialState, {
        // Enable diamond dependency resolution
        enableDiamondResolution: true,
        // Enable proxy registry for memory management
        proxyRegistry: true
      });
      
      // Initialize subscription manager for selective subscriptions
      this.subscriptions = new StoreSubscriptionManager(this.store);
      
      // Initialize middleware manager
      this.middleware = new StoreMiddlewareManager(this.store);
      
      // Initialize proxy registry for memory management
      this.proxyRegistry = new ProxyRegistry();
      
      // Create signals for each property for fine-grained reactivity
      Object.keys(initialState).forEach((key) => {
        const k = key as keyof T;
        const sig = signal(initialState[k]);
        this.signals.set(k, sig);
        
        // Sync signal with store
        effect(() => {
          const storeValue = this.store[k];
          if (!Object.is(sig.get(), storeValue)) {
            sig.set(storeValue);
          }
        });
        
        // Sync store with signal
        effect(() => {
          const sigValue = sig.get();
          if (!Object.is(this.store[k], sigValue)) {
            batch(() => {
              this.store[k] = sigValue;
            });
          }
        });
      });
      
      // Setup change tracking
      effect(() => {
        // Track all store changes
        const snapshot = { ...this.store };
        
        untrack(() => {
          Object.keys(snapshot).forEach((key) => {
            const k = key as keyof T;
            const value = snapshot[k];
            const signal = this.signals.get(k);
            
            if (signal && !Object.is(signal.peek(), value)) {
              this.emit('change', {
                key: k,
                prevValue: signal.peek(),
                newValue: value
              });
            }
          });
        });
      });
    });
  }

  /**
   * Get a reactive value with automatic dependency tracking
   */
  get<K extends keyof T>(key: K): T[K] {
    const signal = this.signals.get(key);
    if (signal) {
      return signal.get();
    }
    return this.store[key];
  }

  /**
   * Set a reactive value with automatic updates
   */
  set<K extends keyof T>(key: K, value: T[K] | UpdateFn<T[K]>): void {
    if (this.disposed) {
      throw new Error('ReactiveState has been disposed');
    }
    
    batch(() => {
      const signal = this.signals.get(key);
      if (signal) {
        const currentValue = signal.peek();
        const newValue = typeof value === 'function' 
          ? (value as UpdateFn<T[K]>)(currentValue)
          : value;
        
        if (!Object.is(currentValue, newValue)) {
          signal.set(newValue);
          this.store[key] = newValue;
        }
      } else {
        // Fallback to direct store update
        const currentValue = this.store[key];
        const newValue = typeof value === 'function'
          ? (value as UpdateFn<T[K]>)(currentValue)
          : value;
        
        if (!Object.is(currentValue, newValue)) {
          this.store[key] = newValue;
        }
      }
    });
  }

  /**
   * Create a computed value with automatic dependency tracking
   * Supports both sync and async computations
   */
  computed<R>(
    id: string, 
    compute: () => R | Promise<R>,
    options?: ComputedOptions<R>
  ): () => R {
    if (this.computedValues.has(id)) {
      const existing = this.computedValues.get(id)!;
      return () => existing.get();
    }
    
    // Check if computation is async
    const isAsync = options?.async || compute.constructor.name === 'AsyncFunction';
    
    if (isAsync) {
      // Create async computed with advanced features
      const asyncComp = asyncComputed(
        compute as () => Promise<R>,
        {
          defaultValue: options?.defaultValue,
          onError: options?.onError || ((err) => {
            console.error(`Error in async computed "${id}":`, err);
            this.emit('computed-error', { id, error: err });
          })
        }
      );
      
      this.computedValues.set(id, asyncComp);
      
      // Track changes
      effect(() => {
        const value = asyncComp.get();
        untrack(() => {
          this.emit('computed-change', { id, value });
        });
      });
      
      return () => asyncComp.get();
    } else {
      // Create sync computed with diamond dependency resolution
      const comp = computed(() => {
        // Use diamond resolver for complex dependency graphs
        return resolveDiamondDependencies(() => compute() as R);
      }, {
        equals: options?.equals
      });
      
      this.computedValues.set(id, comp);
      
      // Track changes
      effect(() => {
        const value = comp.get();
        untrack(() => {
          this.emit('computed-change', { id, value });
        });
      });
      
      return () => comp.get();
    }
  }

  /**
   * Subscribe to changes in a specific key with fine-grained control
   */
  subscribe<K extends keyof T>(
    key: K, 
    listener: Listener<T[K]>,
    options?: { immediate?: boolean; deep?: boolean }
  ): Unsubscribe {
    const signal = this.signals.get(key);
    
    if (signal) {
      // Use signal subscription for fine-grained reactivity
      const disposable = effect(() => {
        const value = signal.get();
        untrack(() => listener(value));
      });
      
      // Call immediately if requested
      if (options?.immediate) {
        listener(signal.peek());
      }
      
      onCleanup(() => disposable.dispose());
      
      return () => disposable.dispose();
    } else {
      // Fallback to store subscription
      return this.subscriptions.subscribe(
        String(key),
        listener as SubscriptionCallback<T>,
        { immediate: options?.immediate }
      );
    }
  }

  /**
   * Subscribe to all state changes
   */
  subscribeAll(
    listener: (changes: { key: keyof T; prevValue: any; newValue: any }) => void
  ): Unsubscribe {
    this.on('change', listener);
    return () => this.off('change', listener);
  }

  /**
   * Subscribe to specific paths with pattern matching
   */
  subscribePattern(
    pattern: string | RegExp,
    callback: SubscriptionCallback<T>
  ): Unsubscribe {
    return this.subscriptions.subscribe(pattern, callback);
  }

  /**
   * Add middleware for intercepting state changes
   */
  use(middleware: MiddlewareFunction<T>): Unsubscribe {
    return this.middleware.use(middleware);
  }

  /**
   * Batch multiple updates for optimal performance
   */
  batch(updates: () => void): void {
    batch(updates);
  }

  /**
   * Execute function without tracking dependencies
   */
  untrack<R>(fn: () => R): R {
    return untrack(fn);
  }

  /**
   * Create a derived store with computed values
   */
  derive<D extends Record<string, any>>(
    derivations: {
      [K in keyof D]: () => D[K] | Promise<D[K]>
    }
  ): Store<D> {
    const derivedState = {} as D;
    
    Object.entries(derivations).forEach(([key, compute]) => {
      const comp = this.computed(
        `derived_${key}`,
        compute as () => any,
        { async: true }
      );
      
      Object.defineProperty(derivedState, key, {
        get: comp,
        enumerable: true,
        configurable: true
      });
    });
    
    return store(derivedState);
  }

  /**
   * Get the current state snapshot
   */
  getState(): Readonly<T> {
    return { ...this.store };
  }

  /**
   * Get a specific computed value
   */
  getComputed<R>(id: string): R | undefined {
    const comp = this.computedValues.get(id);
    return comp ? comp.get() : undefined;
  }

  /**
   * Check if a computed value exists
   */
  hasComputed(id: string): boolean {
    return this.computedValues.has(id);
  }

  /**
   * Reset state to initial values
   */
  reset(initialState: T): void {
    batch(() => {
      Object.entries(initialState).forEach(([key, value]) => {
        this.set(key as keyof T, value);
      });
    });
  }

  /**
   * Create a transaction for atomic updates
   */
  transaction(fn: (state: T) => void): void {
    batch(() => {
      fn(this.store);
    });
  }

  /**
   * Get reactive statistics for debugging
   */
  getStats(): {
    signalCount: number;
    computedCount: number;
    subscriptionCount: number;
    proxyCount: number;
  } {
    return {
      signalCount: this.signals.size,
      computedCount: this.computedValues.size,
      subscriptionCount: this.subscriptions.getSubscriptionCount(),
      proxyCount: this.proxyRegistry.size()
    };
  }

  /**
   * Dispose of all subscriptions and computed values
   */
  dispose(): void {
    if (this.disposed) return;
    
    this.disposed = true;
    
    // Clear all computed values
    this.computedValues.clear();
    
    // Clear all signals
    this.signals.clear();
    
    // Clear subscriptions
    this.subscriptions.clear();
    
    // Clear middleware
    this.middleware.clear();
    
    // Clear proxy registry
    this.proxyRegistry.clear();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    // Dispose root context
    if (this.rootDispose) {
      this.rootDispose();
    }
  }

  /**
   * Check if the state has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }
}

// Export convenience factory function
export function createReactiveState<T extends Record<string, any>>(
  initialState: T
): ReactiveState<T> {
  return new ReactiveState(initialState);
}