/**
 * Async Computed Values
 * Provides support for asynchronous computed values with loading states
 */

import { signal, type WritableSignal } from './signal.js';
import { computed } from './computed.js';
import { effect } from './effect.js';
import { createRoot } from './batch.js';
import type { Signal, Disposable } from './types.js';

/**
 * Options for async computed values
 */
export interface AsyncComputedOptions<T> {
  /** Initial value while loading */
  initial?: T;
  /** Whether to cache results */
  cache?: boolean;
  /** Debounce delay in milliseconds */
  debounce?: number;
  /** Retry on error */
  retry?: boolean;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Custom error handler */
  onError?: (error: Error) => void;
  /** Custom equality check */
  equals?: (a: T, b: T) => boolean;
}

/**
 * State of an async computed value
 */
export interface AsyncComputedState<T> {
  /** Current value */
  value: T | undefined;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | undefined;
  /** Version for tracking updates */
  version: number;
}

/**
 * Result of async computed
 */
export interface AsyncComputed<T> {
  /** Get the current value (reactive) */
  value: Signal<T | undefined>;
  /** Get loading state (reactive) */
  loading: Signal<boolean>;
  /** Get error state (reactive) */
  error: Signal<Error | undefined>;
  /** Manually trigger refresh */
  refresh: () => Promise<void>;
  /** Retry after error */
  retry: () => void;
  /** Dispose and cleanup */
  dispose: () => void;
  /** Get current state snapshot */
  getState: () => AsyncComputedState<T>;
}

/**
 * Debounce helper
 */
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timeoutId: any;
  
  const debounced = ((...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        try {
          const result = fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };
  
  return debounced;
}

/**
 * Create an async computed value
 */
export function asyncComputed<T>(
  fn: () => Promise<T>,
  options: AsyncComputedOptions<T> = {}
): AsyncComputed<T> {
  // Create state signals
  const state = signal<AsyncComputedState<T>>({
    value: options.initial,
    loading: false,
    error: undefined,
    version: 0
  });
  
  // Derived signals for convenient access
  const value = computed(() => state().value);
  const loading = computed(() => state().loading);
  const error = computed(() => state().error);
  
  let currentVersion = 0;
  let disposeEffect: (() => void) | null = null;
  let retryCount = 0;
  
  // Debounced function if needed
  const executor = options.debounce 
    ? debounce(fn, options.debounce)
    : fn;
  
  // Fetch function with error handling and retries
  async function fetch(): Promise<void> {
    const version = ++currentVersion;
    
    // Update loading state
    state.mutate(s => {
      s.loading = true;
      s.error = undefined;
    });
    
    try {
      const result = await executor();
      
      // Only update if this is still the current version
      if (version === currentVersion) {
        state.mutate(s => {
          s.value = result;
          s.loading = false;
          s.error = undefined;
          s.version = version;
        });
        retryCount = 0; // Reset retry count on success
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      // Only update if this is still the current version
      if (version === currentVersion) {
        state.mutate(s => {
          s.loading = false;
          s.error = error;
          s.version = version;
        });
        
        // Handle error
        if (options.onError) {
          options.onError(error);
        }
        
        // Auto-retry if configured
        if (options.retry && retryCount < (options.retryAttempts || 3)) {
          retryCount++;
          const delay = options.retryDelay || (1000 * Math.pow(2, retryCount - 1)); // Exponential backoff
          setTimeout(() => {
            if (version === currentVersion) {
              fetch();
            }
          }, delay);
        }
      }
    }
  }
  
  // Create reactive effect to track dependencies
  disposeEffect = createRoot(dispose => {
    effect(() => {
      // This effect will re-run when any reactive dependencies in fn change
      fetch(); // Call without await - effect should be synchronous
    });
    
    return dispose;
  });
  
  // Manual refresh function
  async function refresh(): Promise<void> {
    retryCount = 0;
    await fetch();
  }
  
  // Retry function
  function retry(): void {
    retryCount = 0;
    fetch();
  }
  
  // Dispose function
  function dispose(): void {
    if (disposeEffect) {
      disposeEffect();
      disposeEffect = null;
    }
    if ('cancel' in executor) {
      (executor as any).cancel();
    }
  }
  
  // Get state snapshot
  function getState(): AsyncComputedState<T> {
    return { ...state() };
  }
  
  return {
    value,
    loading,
    error,
    refresh,
    retry,
    dispose,
    getState
  };
}

/**
 * Create an async resource (similar to SolidJS resource)
 */
export function asyncResource<T, S = any>(
  source: () => S | undefined,
  fetcher: (source: S) => Promise<T>,
  options: AsyncComputedOptions<T> = {}
): AsyncComputed<T> {
  return asyncComputed(
    () => {
      const sourceValue = source();
      if (sourceValue === undefined) {
        return Promise.resolve(undefined as any);
      }
      return fetcher(sourceValue);
    },
    options
  );
}

/**
 * Create multiple async computed values with shared loading state
 */
export function asyncComputedGroup<T extends Record<string, () => Promise<any>>>(
  computeds: T,
  options: AsyncComputedOptions<any> = {}
): {
  values: { [K in keyof T]: Signal<Awaited<ReturnType<T[K]>> | undefined> };
  loading: Signal<boolean>;
  errors: Signal<Partial<{ [K in keyof T]: Error }>>;
  refresh: () => Promise<void>;
  dispose: () => void;
} {
  const results: any = {};
  const loadingSignals: WritableSignal<boolean>[] = [];
  const errorSignals: WritableSignal<Error | undefined>[] = [];
  const refreshFns: (() => Promise<void>)[] = [];
  const disposeFns: (() => void)[] = [];
  
  for (const [key, fn] of Object.entries(computeds)) {
    const async = asyncComputed(fn as () => Promise<any>, options);
    results[key] = async.value;
    loadingSignals.push(async.loading as WritableSignal<boolean>);
    errorSignals.push(async.error as WritableSignal<Error | undefined>);
    refreshFns.push(async.refresh);
    disposeFns.push(async.dispose);
  }
  
  // Combined loading state
  const loading = computed(() => 
    loadingSignals.some(s => s())
  );
  
  // Combined errors
  const errors = computed(() => {
    const errs: any = {};
    let hasError = false;
    
    Object.keys(computeds).forEach((key, i) => {
      const errorSignal = errorSignals[i];
      if (errorSignal) {
        const error = errorSignal();
        if (error) {
          errs[key] = error;
          hasError = true;
        }
      }
    });
    
    return hasError ? errs : {};
  });
  
  // Refresh all
  async function refresh(): Promise<void> {
    await Promise.all(refreshFns.map(fn => fn()));
  }
  
  // Dispose all
  function dispose(): void {
    disposeFns.forEach(fn => fn());
  }
  
  return {
    values: results,
    loading,
    errors,
    refresh,
    dispose
  };
}

/**
 * Helper to create suspense-compatible async computed
 */
export function suspenseAsyncComputed<T>(
  fn: () => Promise<T>,
  options: AsyncComputedOptions<T> = {}
): {
  read: () => T;
  loading: Signal<boolean>;
  error: Signal<Error | undefined>;
} {
  const async = asyncComputed(fn, options);
  let suspensePromise: Promise<T> | null = null;
  
  function read(): T {
    const currentError = async.error();
    if (currentError) {
      throw currentError;
    }
    
    const currentValue = async.value();
    const isLoading = async.loading();
    
    if (isLoading && !currentValue) {
      // Create or reuse suspense promise
      if (!suspensePromise) {
        suspensePromise = new Promise<T>((resolve, reject) => {
          const unsubscribe = effect(() => {
            const error = async.error();
            const value = async.value();
            const loading = async.loading();
            
            if (error) {
              unsubscribe.dispose();
              suspensePromise = null;
              reject(error);
            } else if (!loading && value !== undefined) {
              unsubscribe.dispose();
              suspensePromise = null;
              resolve(value);
            }
          });
        });
      }
      throw suspensePromise;
    }
    
    return currentValue as T;
  }
  
  return {
    read,
    loading: async.loading,
    error: async.error
  };
}