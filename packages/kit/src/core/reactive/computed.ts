/**
 * Computed values and reactive utilities powered by Vibrancy
 * 
 * Provides advanced computed values with:
 * - Automatic dependency tracking
 * - Diamond dependency resolution
 * - Async computation support
 * - Memory-safe cleanup
 * - Circular dependency detection
 * - Backward compatibility with ReactiveState
 */

import {
  computed as vibrancyComputed,
  asyncComputed as vibrancyAsyncComputed,
  effect,
  signal,
  batch,
  untrack,
  createRoot,
  onCleanup,
  type ComputedSignal,
  type AsyncComputed as VibrancyAsyncComputed,
  type WritableSignal,
  type Disposable,
  resolveDiamondDependencies,
  CircularDependencyResolver,
  optional,
  withDefault
} from 'vibrancy';

import { ReactiveState } from './reactive-state.js';

// Re-export vibrancy types
export type { ComputedSignal, WritableSignal };

interface ComputedOptions<T> {
  equals?: (a: T, b: T) => boolean;
  name?: string;
  onError?: (error: Error) => void;
}

interface AsyncComputedOptions<T> extends ComputedOptions<T> {
  defaultValue?: T;
  debounce?: number;
  retry?: {
    times: number;
    delay: number;
  };
}

interface MemoOptions<T> extends ComputedOptions<T> {
  cache?: Map<string, T>;
  maxSize?: number;
  ttl?: number; // Time to live in ms
}

// Cache entry for memoization
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  dependencies: Set<any>;
}

/**
 * Create a computed value with automatic dependency tracking
 * Enhanced with diamond dependency resolution
 * 
 * Overloaded to support both standalone and ReactiveState usage
 */
export function computed<T>(
  computation: () => T,
  options?: ComputedOptions<T>
): ComputedSignal<T>;
export function computed<T extends Record<string, any>, R>(
  state: ReactiveState<T>,
  compute: (get: <K extends keyof T>(key: K) => T[K]) => R
): () => R;
export function computed<T extends Record<string, any>, R>(
  stateOrComputation: ReactiveState<T> | (() => R),
  computeOrOptions?: ((get: <K extends keyof T>(key: K) => T[K]) => R) | ComputedOptions<R>
): ComputedSignal<R> | (() => R) {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrComputation instanceof ReactiveState) {
    const state = stateOrComputation;
    const compute = computeOrOptions as (get: <K extends keyof T>(key: K) => T[K]) => R;
    const getter = <K extends keyof T>(key: K) => state.get(key);
    const id = `computed_${Math.random().toString(36).slice(2, 9)}`;
    return state.computed(id, () => compute(getter));
  }
  
  // Modern vibrancy-based implementation
  const computation = stateOrComputation as () => R;
  const options = computeOrOptions as ComputedOptions<R> | undefined;
  
  // Wrap computation with diamond resolver for complex dependency graphs
  const resolvedComputation = () => {
    try {
      return resolveDiamondDependencies(computation);
    } catch (error) {
      if (options?.onError) {
        options.onError(error as Error);
        return undefined as R;
      }
      throw error;
    }
  };
  
  const comp = vibrancyComputed(resolvedComputation, {
    equals: options?.equals
  });
  
  // Add debug name if provided
  if (options?.name) {
    Object.defineProperty(comp, 'name', { value: options.name });
  }
  
  return comp;
}

/**
 * Create an async computed value with loading states
 * 
 * Overloaded for backward compatibility
 */
export function asyncComputed<T>(
  computation: () => Promise<T>,
  options?: AsyncComputedOptions<T>
): VibrancyAsyncComputed<T>;
export function asyncComputed<T extends Record<string, any>, R>(
  state: ReactiveState<T>,
  compute: (get: <K extends keyof T>(key: K) => T[K]) => Promise<R>,
  initialValue: R
): {
  value: () => R;
  loading: () => boolean;
  error: () => Error | null;
  refresh: () => Promise<void>;
};
export function asyncComputed<T extends Record<string, any>, R>(
  stateOrComputation: ReactiveState<T> | (() => Promise<R>),
  computeOrOptions?: ((get: <K extends keyof T>(key: K) => T[K]) => Promise<R>) | AsyncComputedOptions<R>,
  initialValue?: R
): any {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrComputation instanceof ReactiveState) {
    const state = stateOrComputation;
    const compute = computeOrOptions as (get: <K extends keyof T>(key: K) => T[K]) => Promise<R>;
    let currentValue = initialValue!;
    let isLoading = false;
    let currentError: Error | null = null;
    let computePromise: Promise<void> | null = null;
    
    const refresh = async () => {
      if (computePromise) return computePromise;
      
      isLoading = true;
      currentError = null;
      
      computePromise = (async () => {
        try {
          const getter = <K extends keyof T>(key: K) => state.get(key);
          currentValue = await compute(getter);
        } catch (error) {
          currentError = error instanceof Error ? error : new Error(String(error));
        } finally {
          isLoading = false;
          computePromise = null;
        }
      })();
      
      return computePromise;
    };
    
    // Initial computation
    refresh();
    
    // Re-compute when dependencies change
    const id = `async_computed_${Math.random().toString(36).slice(2, 9)}`;
    state.computed(id, () => {
      refresh();
      return currentValue;
    });
    
    return {
      value: () => currentValue,
      loading: () => isLoading,
      error: () => currentError,
      refresh,
    };
  }
  
  // Modern vibrancy-based implementation
  const computation = stateOrComputation as () => Promise<R>;
  const options = computeOrOptions as AsyncComputedOptions<R> | undefined;
  
  let retryCount = 0;
  
  const computationWithRetry = async (): Promise<R> => {
    try {
      retryCount = 0;
      return await computation();
    } catch (error) {
      if (options?.retry && retryCount < options.retry.times) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, options.retry!.delay));
        return computationWithRetry();
      }
      
      if (options?.onError) {
        options.onError(error as Error);
        if (options.defaultValue !== undefined) {
          return options.defaultValue;
        }
      }
      throw error;
    }
  };
  
  // Add debouncing if specified
  const finalComputation = options?.debounce
    ? debounced(computationWithRetry, options.debounce)
    : computationWithRetry;
  
  return vibrancyAsyncComputed(finalComputation, {
    defaultValue: options?.defaultValue,
    onError: options?.onError
  });
}

/**
 * Create a memoized computed value with caching
 * 
 * Overloaded for backward compatibility
 */
export function memo<T, Args extends any[]>(
  fn: (...args: Args) => T,
  options?: MemoOptions<T>
): (...args: Args) => T;
export function memo<T extends Record<string, any>, R>(
  state: ReactiveState<T>,
  compute: (get: <K extends keyof T>(key: K) => T[K]) => R,
  equals?: (prev: R, next: R) => boolean
): () => R;
export function memo<T extends Record<string, any>, R, Args extends any[]>(
  stateOrFn: ReactiveState<T> | ((...args: Args) => R),
  computeOrOptions?: ((get: <K extends keyof T>(key: K) => T[K]) => R) | MemoOptions<R>,
  equals?: (prev: R, next: R) => boolean
): any {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrFn instanceof ReactiveState) {
    const state = stateOrFn;
    const compute = computeOrOptions as (get: <K extends keyof T>(key: K) => T[K]) => R;
    let lastValue: R;
    let hasValue = false;
    
    const equalsFn = equals || Object.is;
    
    return computed(state, (get) => {
      const newValue = compute(get);
      
      if (!hasValue || !equalsFn(lastValue, newValue)) {
        lastValue = newValue;
        hasValue = true;
      }
      
      return lastValue;
    });
  }
  
  // Modern implementation with caching
  const fn = stateOrFn as (...args: Args) => R;
  const options = computeOrOptions as MemoOptions<R> | undefined;
  
  const cache = options?.cache || new Map<string, CacheEntry<R>>();
  const maxSize = options?.maxSize || 100;
  const ttl = options?.ttl;
  
  // Cleanup old entries if max size exceeded
  const cleanupCache = () => {
    if (cache.size > maxSize) {
      const entriesToDelete = cache.size - maxSize;
      const keys = Array.from(cache.keys());
      for (let i = 0; i < entriesToDelete; i++) {
        cache.delete(keys[i]);
      }
    }
  };
  
  return (...args: Args): R => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    
    // Check if cached value is still valid
    if (cached) {
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }
      cache.delete(key);
    }
    
    // Track dependencies during computation
    const dependencies = new Set<any>();
    let result: R;
    
    createRoot((dispose) => {
      const tracker = effect(() => {
        result = fn(...args);
      });
      
      // Store the result with dependencies
      cache.set(key, {
        value: result!,
        timestamp: Date.now(),
        dependencies
      });
      
      cleanupCache();
      dispose();
    });
    
    return result!;
  };
}

/**
 * Watch a value and run effect when it changes
 * 
 * Overloaded for backward compatibility
 */
export function watch<T>(
  source: (() => T) | WritableSignal<T>,
  callback: (value: T, oldValue: T | undefined) => void,
  options?: { immediate?: boolean }
): Disposable;
export function watch<T extends Record<string, any>, K extends keyof T>(
  state: ReactiveState<T>,
  key: K,
  callback: (newValue: T[K], oldValue: T[K]) => void,
  options?: { immediate?: boolean }
): () => void;
export function watch<T extends Record<string, any>, K extends keyof T>(
  stateOrSource: ReactiveState<T> | (() => T[K]) | WritableSignal<T[K]>,
  keyOrCallback: K | ((value: T[K], oldValue: T[K] | undefined) => void),
  callbackOrOptions?: ((newValue: T[K], oldValue: T[K]) => void) | { immediate?: boolean },
  options?: { immediate?: boolean }
): any {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrSource instanceof ReactiveState) {
    const state = stateOrSource;
    const key = keyOrCallback as K;
    const callback = callbackOrOptions as (newValue: T[K], oldValue: T[K]) => void;
    let oldValue = state.get(key);
    
    if (options?.immediate) {
      callback(oldValue, oldValue);
    }
    
    return state.subscribe(key, (newValue) => {
      callback(newValue, oldValue);
      oldValue = newValue;
    });
  }
  
  // Modern vibrancy-based implementation
  const source = stateOrSource as (() => T[K]) | WritableSignal<T[K]>;
  const callback = keyOrCallback as (value: T[K], oldValue: T[K] | undefined) => void;
  const watchOptions = callbackOrOptions as { immediate?: boolean } | undefined;
  
  let oldValue: T[K] | undefined;
  let isFirst = true;
  
  const getValue = typeof source === 'function' 
    ? source 
    : () => source.get();
  
  const dispose = effect(() => {
    const newValue = getValue();
    
    if (isFirst) {
      isFirst = false;
      if (watchOptions?.immediate) {
        callback(newValue, undefined);
      }
      oldValue = newValue;
      return;
    }
    
    if (!Object.is(newValue, oldValue)) {
      const prevValue = oldValue;
      oldValue = newValue;
      untrack(() => callback(newValue, prevValue));
    }
  });
  
  return { dispose };
}

/**
 * Watch multiple sources and run effect when any changes
 * 
 * Overloaded for backward compatibility
 */
export function watchMany<T extends readonly unknown[]>(
  sources: { [K in keyof T]: (() => T[K]) | WritableSignal<T[K]> },
  callback: (values: T, oldValues: T | undefined) => void,
  options?: { immediate?: boolean }
): Disposable;
export function watchMany<T extends Record<string, any>>(
  state: ReactiveState<T>,
  keys: (keyof T)[],
  callback: (changes: { key: keyof T; newValue: any; oldValue: any }[]) => void
): () => void;
export function watchMany<T extends Record<string, any> | readonly unknown[]>(
  stateOrSources: ReactiveState<T> | { [K in keyof T]: (() => T[K]) | WritableSignal<T[K]> },
  keysOrCallback: ((keyof T)[] | ((values: T, oldValues: T | undefined) => void)),
  callbackOrOptions?: ((changes: { key: keyof T; newValue: any; oldValue: any }[]) => void) | { immediate?: boolean }
): any {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrSources instanceof ReactiveState) {
    const state = stateOrSources as ReactiveState<T>;
    const keys = keysOrCallback as (keyof T)[];
    const callback = callbackOrOptions as (changes: { key: keyof T; newValue: any; oldValue: any }[]) => void;
    
    const oldValues = new Map<keyof T, any>();
    keys.forEach(key => oldValues.set(key, state.get(key)));
    
    const changes: { key: keyof T; newValue: any; oldValue: any }[] = [];
    let updateTimeout: NodeJS.Timeout | null = null;
    
    const unsubscribes = keys.map(key => 
      state.subscribe(key, (newValue) => {
        const oldValue = oldValues.get(key);
        changes.push({ key, newValue, oldValue });
        oldValues.set(key, newValue);
        
        // Batch changes
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          if (changes.length > 0) {
            callback([...changes]);
            changes.length = 0;
          }
        }, 0);
      })
    );
    
    return () => {
      unsubscribes.forEach(unsub => unsub());
      if (updateTimeout) clearTimeout(updateTimeout);
    };
  }
  
  // Modern vibrancy-based implementation
  const sources = stateOrSources as { [K in keyof T]: (() => T[K]) | WritableSignal<T[K]> };
  const callback = keysOrCallback as (values: T, oldValues: T | undefined) => void;
  const options = callbackOrOptions as { immediate?: boolean } | undefined;
  
  let oldValues: T | undefined;
  let isFirst = true;
  
  const getValues = (): T => {
    return sources.map(source => 
      typeof source === 'function' ? source() : source.get()
    ) as unknown as T;
  };
  
  const dispose = effect(() => {
    const newValues = getValues();
    
    if (isFirst) {
      isFirst = false;
      if (options?.immediate) {
        callback(newValues, undefined);
      }
      oldValues = newValues;
      return;
    }
    
    const hasChanged = !oldValues || newValues.some(
      (val, i) => !Object.is(val, oldValues![i])
    );
    
    if (hasChanged) {
      const prevValues = oldValues;
      oldValues = newValues;
      untrack(() => callback(newValues, prevValues));
    }
  });
  
  return { dispose };
}

/**
 * Create a derived state or value
 * 
 * Overloaded for backward compatibility
 */
export function derived<T, S extends readonly unknown[]>(
  sources: { [K in keyof S]: (() => S[K]) | WritableSignal<S[K]> },
  fn: (values: S) => T,
  options?: ComputedOptions<T>
): ComputedSignal<T>;
export function derived<T extends Record<string, any>, D extends Record<string, any>>(
  state: ReactiveState<T>,
  derive: (get: <K extends keyof T>(key: K) => T[K]) => D
): ReactiveState<D>;
export function derived<T extends Record<string, any>, D extends Record<string, any>, S extends readonly unknown[]>(
  stateOrSources: ReactiveState<T> | { [K in keyof S]: (() => S[K]) | WritableSignal<S[K]> },
  deriveOrFn: ((get: <K extends keyof T>(key: K) => T[K]) => D) | ((values: S) => D),
  options?: ComputedOptions<D>
): any {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrSources instanceof ReactiveState) {
    const state = stateOrSources;
    const derive = deriveOrFn as (get: <K extends keyof T>(key: K) => T[K]) => D;
    const getter = <K extends keyof T>(key: K) => state.get(key);
    const initialDerived = derive(getter);
    const derivedState = new ReactiveState(initialDerived);
    
    // Update derived state when parent changes
    state.subscribeAll(() => {
      const newDerived = derive(getter);
      derivedState.batch(() => {
        Object.entries(newDerived).forEach(([key, value]) => {
          derivedState.set(key as keyof D, value);
        });
      });
    });
    
    return derivedState;
  }
  
  // Modern vibrancy-based implementation
  const sources = stateOrSources as { [K in keyof S]: (() => S[K]) | WritableSignal<S[K]> };
  const fn = deriveOrFn as (values: S) => D;
  
  return computed(() => {
    const values = sources.map(source =>
      typeof source === 'function' ? source() : source.get()
    ) as unknown as S;
    
    return fn(values);
  }, options);
}

/**
 * Create computed values from an object of computations
 * 
 * Overloaded for backward compatibility
 */
export function computedValues<T extends Record<string, any>>(
  computations: { [K in keyof T]: () => T[K] }
): { [K in keyof T]: ComputedSignal<T[K]> };
export function computedValues<T extends Record<string, any>, C extends Record<string, any>>(
  state: ReactiveState<T>,
  computations: {
    [K in keyof C]: (get: <P extends keyof T>(key: P) => T[P]) => C[K]
  }
): { [K in keyof C]: () => C[K] };
export function computedValues<T extends Record<string, any>, C extends Record<string, any>>(
  stateOrComputations: ReactiveState<T> | { [K in keyof C]: () => C[K] },
  computations?: {
    [K in keyof C]: (get: <P extends keyof T>(key: P) => T[P]) => C[K]
  }
): any {
  // Check if first argument is ReactiveState (backward compatibility)
  if (stateOrComputations instanceof ReactiveState) {
    const state = stateOrComputations;
    const result = {} as { [K in keyof C]: () => C[K] };
    
    Object.entries(computations!).forEach(([key, compute]) => {
      result[key as keyof C] = computed(state, compute as any);
    });
    
    return result;
  }
  
  // Modern vibrancy-based implementation
  const comps = stateOrComputations as { [K in keyof C]: () => C[K] };
  const result = {} as { [K in keyof C]: ComputedSignal<C[K]> };
  
  for (const key in comps) {
    result[key] = computed(comps[key]);
  }
  
  return result;
}

// Helper function for debouncing
function debounced<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  delay: number
): (...args: Args) => Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  let lastResolve: ((value: T) => void) | undefined;
  let lastReject: ((error: any) => void) | undefined;
  
  return (...args: Args): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        if (lastReject) {
          lastReject(new Error('Debounced'));
        }
      }
      
      lastResolve = resolve;
      lastReject = reject;
      
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
}

// Re-export convenience functions
export { batch, untrack, createRoot, onCleanup } from 'vibrancy';