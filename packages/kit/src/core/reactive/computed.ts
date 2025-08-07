import { ReactiveState } from './reactive-state.js';

/**
 * Create a computed value that automatically updates when its dependencies change
 */
export function computed<T extends Record<string, any>, R>(
  state: ReactiveState<T>,
  compute: (get: <K extends keyof T>(key: K) => T[K]) => R
): () => R {
  // Create a bound getter for the compute function
  const getter = <K extends keyof T>(key: K) => state.get(key);
  
  // Generate unique ID for this computed value
  const id = `computed_${Math.random().toString(36).slice(2, 9)}`;
  
  // Create the computed value
  return state.computed(id, () => compute(getter));
}

/**
 * Create multiple computed values at once
 */
export function computedValues<T extends Record<string, any>, C extends Record<string, any>>(
  state: ReactiveState<T>,
  computations: {
    [K in keyof C]: (get: <P extends keyof T>(key: P) => T[P]) => C[K]
  }
): { [K in keyof C]: () => C[K] } {
  const result = {} as { [K in keyof C]: () => C[K] };
  
  Object.entries(computations).forEach(([key, compute]) => {
    result[key as keyof C] = computed(state, compute as any);
  });
  
  return result;
}

/**
 * Create a computed value with memoization
 */
export function memo<T extends Record<string, any>, R>(
  state: ReactiveState<T>,
  compute: (get: <K extends keyof T>(key: K) => T[K]) => R,
  equals?: (prev: R, next: R) => boolean
): () => R {
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

/**
 * Create an async computed value
 */
export function asyncComputed<T extends Record<string, any>, R>(
  state: ReactiveState<T>,
  compute: (get: <K extends keyof T>(key: K) => T[K]) => Promise<R>,
  initialValue: R
): {
  value: () => R;
  loading: () => boolean;
  error: () => Error | null;
  refresh: () => Promise<void>;
} {
  let currentValue = initialValue;
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

/**
 * Create a derived state that syncs with the parent state
 */
export function derived<T extends Record<string, any>, D extends Record<string, any>>(
  state: ReactiveState<T>,
  derive: (get: <K extends keyof T>(key: K) => T[K]) => D
): ReactiveState<D> {
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

/**
 * Watch for changes in specific values
 */
export function watch<T extends Record<string, any>, K extends keyof T>(
  state: ReactiveState<T>,
  key: K,
  callback: (newValue: T[K], oldValue: T[K]) => void,
  options?: { immediate?: boolean }
): () => void {
  let oldValue = state.get(key);
  
  if (options?.immediate) {
    callback(oldValue, oldValue);
  }
  
  return state.subscribe(key, (newValue) => {
    callback(newValue, oldValue);
    oldValue = newValue;
  });
}

/**
 * Watch multiple values at once
 */
export function watchMany<T extends Record<string, any>>(
  state: ReactiveState<T>,
  keys: (keyof T)[],
  callback: (changes: { key: keyof T; newValue: any; oldValue: any }[]) => void
): () => void {
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