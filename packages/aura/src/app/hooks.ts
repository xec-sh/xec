/**
 * Aura Next - Hooks
 * Reusable logic patterns for Aura components
 */

import {
  batch,
  signal,
  effect,
  computed,
  type Signal,
  type WritableSignal
} from 'vibrancy';

import { onMount, onCleanup } from './lifecycle.js';

/**
 * Create a local state signal
 * 
 * @example
 * ```typescript
 * const [count, setCount] = useState(0);
 * ```
 */
export function useState<T>(initialValue: T): [Signal<T>, (value: T | ((prev: T) => T)) => void] {
  const state = signal(initialValue);

  const setState = (value: T | ((prev: T) => T)) => {
    if (typeof value === 'function') {
      state.update(value as (prev: T) => T);
    } else {
      state.set(value);
    }
  };

  return [state, setState];
}

/**
 * Create a memoized computed value
 * 
 * @example
 * ```typescript
 * const doubled = useMemo(() => count() * 2, [count]);
 * ```
 */
export function useMemo<T>(
  fn: () => T,
  deps?: Signal<any>[]
): Signal<T> {
  return computed(fn);
}

/**
 * Create a callback that doesn't change between renders
 * 
 * @example
 * ```typescript
 * const handleClick = useCallback(() => {
 *   console.log('Clicked');
 * }, []);
 * ```
 */
export function useCallback<T extends (...args: any[]) => any>(
  fn: T,
  deps?: Signal<any>[]
): T {
  // In a reactive system, callbacks don't need memoization
  // but we keep the API for compatibility
  return fn;
}

/**
 * Use local storage with automatic persistence
 * 
 * @example
 * ```typescript
 * const theme = useLocalStorage('theme', 'dark');
 * ```
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): WritableSignal<T> {
  // Check if window is available (browser environment)
  const isClient = typeof window !== 'undefined' && window.localStorage;

  // Get initial value from storage or use default
  const getStoredValue = (): T => {
    if (!isClient) return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  };

  const value = signal<T>(getStoredValue());

  // Save to localStorage when value changes
  effect(() => {
    if (!isClient) return;

    try {
      window.localStorage.setItem(key, JSON.stringify(value()));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  });

  return value;
}

/**
 * Use session storage with automatic persistence
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T
): WritableSignal<T> {
  const isClient = typeof window !== 'undefined' && window.sessionStorage;

  const getStoredValue = (): T => {
    if (!isClient) return initialValue;

    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading sessionStorage key "${key}":`, error);
      return initialValue;
    }
  };

  const value = signal<T>(getStoredValue());

  effect(() => {
    if (!isClient) return;

    try {
      window.sessionStorage.setItem(key, JSON.stringify(value()));
    } catch (error) {
      console.error(`Error setting sessionStorage key "${key}":`, error);
    }
  });

  return value;
}

/**
 * Use a debounced value
 * 
 * @example
 * ```typescript
 * const debouncedSearch = useDebounce(searchTerm, 500);
 * ```
 */
export function useDebounce<T>(
  value: Signal<T> | T,
  delay: number
): Signal<T> {
  const getValue = () => typeof value === 'function' ? (value as Signal<T>)() : value;
  const debounced = signal<T>(getValue());

  effect(() => {
    const current = getValue();
    const timeout = setTimeout(() => {
      debounced.set(current);
    }, delay);

    onCleanup(() => clearTimeout(timeout));
  });

  return debounced;
}

/**
 * Use a throttled value
 */
export function useThrottle<T>(
  value: Signal<T> | T,
  delay: number
): Signal<T> {
  const getValue = () => typeof value === 'function' ? (value as Signal<T>)() : value;
  const throttled = signal<T>(getValue());
  let lastUpdate = 0;

  effect(() => {
    const current = getValue();
    const now = Date.now();

    if (now - lastUpdate >= delay) {
      throttled.set(current);
      lastUpdate = now;
    }
  });

  return throttled;
}

/**
 * Use the previous value of a signal
 */
export function usePrevious<T>(value: Signal<T> | T): Signal<T | undefined> {
  const getValue = () => typeof value === 'function' ? (value as Signal<T>)() : value;
  const previous = signal<T | undefined>(undefined);
  const current = signal<T>(getValue());

  effect(() => {
    const newValue = getValue();
    previous.set(current());
    current.set(newValue);
  });

  return previous;
}

/**
 * Use a toggle state
 * 
 * @example
 * ```typescript
 * const [isOpen, toggle] = useToggle(false);
 * ```
 */
export function useToggle(
  initialValue = false
): [Signal<boolean>, () => void] {
  const state = signal(initialValue);
  const toggle = () => state.update(v => !v);

  return [state, toggle];
}

/**
 * Use a counter
 * 
 * @example
 * ```typescript
 * const { count, increment, decrement, reset } = useCounter(0);
 * ```
 */
export function useCounter(initialValue = 0): {
  count: Signal<number>;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  set: (value: number) => void;
} {
  const count = signal(initialValue);

  return {
    count,
    increment: () => count.update(n => n + 1),
    decrement: () => count.update(n => n - 1),
    reset: () => count.set(initialValue),
    set: (value: number) => count.set(value)
  };
}

/**
 * Use an interval that automatically cleans up
 */
export function useInterval(
  callback: () => void,
  delay: number | null
): void {
  onMount(() => {
    if (delay === null) return;

    const handle = setInterval(callback, delay);
    return () => clearInterval(handle);
  });
}

/**
 * Use a timeout that automatically cleans up
 */
export function useTimeout(
  callback: () => void,
  delay: number | null
): void {
  onMount(() => {
    if (delay === null) return;

    const handle = setTimeout(callback, delay);
    return () => clearTimeout(handle);
  });
}

/**
 * Use window dimensions (for browser compatibility)
 */
export function useWindowSize(): {
  width: Signal<number>;
  height: Signal<number>;
} {
  const width = signal(process.stdout.columns || 80);
  const height = signal(process.stdout.rows || 24);

  onMount(() => {
    const handleResize = () => {
      batch(() => {
        width.set(process.stdout.columns || 80);
        height.set(process.stdout.rows || 24);
      });
    };

    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  });

  return { width, height };
}