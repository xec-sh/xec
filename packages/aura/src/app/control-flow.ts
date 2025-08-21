/**
 * Aura Next - Control Flow
 * Utilities for conditional rendering and iteration
 */

import {
  computed,
  type Signal
} from 'vibrancy';

import { getValue } from './reactive-bridge.js';

import type {
  AuraElement,
  ComponentInstance
} from './types.js';

/**
 * Conditionally render elements based on a signal value
 * 
 * @example
 * ```typescript
 * show(isLoading, () => 
 *   aura('text', { value: 'Loading...' })
 * )
 * ```
 */
export function show<T>(
  when: Signal<T | undefined | null | false> | T | undefined | null | false,
  children: ((value: T) => AuraElement | AuraElement[]) | AuraElement | AuraElement[],
  fallback?: () => AuraElement | AuraElement[]
): AuraElement[] {
  const condition = getValue(when);

  if (condition) {
    const result = typeof children === 'function'
      ? children(condition as T)
      : children;
    return Array.isArray(result) ? result : [result];
  } else if (fallback) {
    const result = fallback();
    return Array.isArray(result) ? result : [result];
  }

  return [];
}

/**
 * Render a list of items with automatic tracking
 * 
 * @example
 * ```typescript
 * forEach(items, (item, index) =>
 *   aura('box', {
 *     key: item.id,
 *     children: [
 *       aura('text', { value: computed(() => `${index()}. ${item.name}`) })
 *     ]
 *   })
 * )
 * ```
 */
export function forEach<T>(
  each: Signal<T[]> | T[],
  children: (item: T, index: Signal<number>) => AuraElement,
  fallback?: () => AuraElement | AuraElement[]
): AuraElement[] {
  const items = getValue(each);

  if (!items || items.length === 0) {
    if (fallback) {
      const result = fallback();
      return Array.isArray(result) ? result : [result];
    }
    return [];
  }

  return items.map((item, idx) => {
    // Create a signal for the index
    const indexSignal = computed(() => idx);
    return children(item, indexSignal);
  });
}

/**
 * Switch/case for component rendering
 * 
 * @example
 * ```typescript
 * switchCase(status, {
 *   'loading': () => aura('spinner'),
 *   'error': () => aura('text', { value: 'Error!', color: 'red' }),
 *   'success': () => aura('text', { value: 'Done!', color: 'green' }),
 *   default: () => aura('text', { value: 'Unknown' })
 * })
 * ```
 */
export function switchCase<T extends string | number>(
  value: Signal<T> | T,
  cases: Record<T | 'default', () => AuraElement | AuraElement[]>
): AuraElement[] {
  const current = getValue(value);

  if (current in cases) {
    const result = cases[current]();
    return Array.isArray(result) ? result : [result];
  } else if ('default' in cases) {
    const result = cases.default();
    return Array.isArray(result) ? result : [result];
  }

  return [];
}

/**
 * Portal - render elements outside of the component hierarchy
 * Useful for modals, tooltips, etc.
 */
export function portal(
  children: AuraElement | AuraElement[],
  target?: ComponentInstance<any>
): AuraElement[] {
  // TODO: Implement portal rendering
  // For now, just return children as-is
  return Array.isArray(children) ? children : [children];
}

/**
 * Lazy load a component
 * The component is only created when first accessed
 */
export function lazy<T extends AuraElement>(
  loader: () => Promise<T> | T
): Signal<T | null> {
  let loaded: T | null = null;
  let loading = false;

  return computed(() => {
    if (!loaded && !loading) {
      loading = true;
      const result = loader();
      if (result instanceof Promise) {
        result.then(val => {
          loaded = val;
          loading = false;
        });
        return null;
      } else {
        loaded = result;
        loading = false;
      }
    }
    return loaded;
  });
}

/**
 * Memoize a component to prevent unnecessary re-renders
 */
export function memo<T extends AuraElement>(
  component: () => T,
  deps?: Signal<any>[]
): Signal<T> {
  return computed(() => component());
}

/**
 * Helper to flatten nested arrays of elements
 */
export function flatten(elements: (AuraElement | AuraElement[])[]): AuraElement[] {
  const result: AuraElement[] = [];

  for (const element of elements) {
    if (Array.isArray(element)) {
      result.push(...element);
    } else {
      result.push(element);
    }
  }

  return result;
}