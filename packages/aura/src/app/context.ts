/**
 * Aura Next - Context System
 * Dependency injection and context management
 */

import {
  signal,
  type Signal,
  type WritableSignal
} from 'vibrancy';

import { aura } from './aura.js';

import type { Context, AnyAuraElement } from './types.js';

// Context storage with proper typing
interface ContextEntry<T = unknown> {
  signal: WritableSignal<T>;
  subscribers: Set<() => void>;
}

// Global context storage with cleanup tracking
const contextStorage = new Map<symbol, ContextEntry>();

/**
 * Create a context for dependency injection
 * 
 * @example
 * ```typescript
 * const ThemeContext = createContext({
 *   colors: {
 *     primary: 'blue',
 *     background: 'black'
 *   }
 * });
 * ```
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol('context');

  // Create a signal for the context value
  const valueSignal = signal<T>(defaultValue);
  const entry: ContextEntry<T> = {
    signal: valueSignal,
    subscribers: new Set()
  };
  contextStorage.set(id, entry as ContextEntry<unknown>);

  return {
    id,
    defaultValue,
    Provider: (props: { value: T; children: AnyAuraElement[] }) => {
      // Update context value
      entry.signal.set(props.value);

      // Return children wrapped in a minimal box container
      // Box acts as a fragment/group that just passes through children
      return aura('box', {
        padding: 0,
        margin: 0,
        border: false,
        width: '100%',
        height: '100%'
      }, ...props.children);
    }
  };
}

/**
 * Use a context value in a component
 * 
 * @example
 * ```typescript
 * const theme = useContext(ThemeContext);
 * ```
 */
export function useContext<T>(context: Context<T>): Signal<T> {
  let entry = contextStorage.get(context.id) as ContextEntry<T> | undefined;

  if (!entry) {
    // If context not found, create with default value
    const newSignal = signal(context.defaultValue);
    entry = {
      signal: newSignal,
      subscribers: new Set()
    };
    contextStorage.set(context.id, entry as ContextEntry<unknown>);
  }

  return entry.signal;
}

/**
 * Provide a context value to child components
 * 
 * @example
 * ```typescript
 * provideContext(ThemeContext, darkTheme, () => [
 *   aura('box', { ... })
 * ])
 * ```
 */
export function provideContext<T>(
  context: Context<T>,
  value: T,
  children: () => AnyAuraElement[]
): AnyAuraElement {
  return context.Provider({ value, children: children() });
}

/**
 * Clear all context values
 * Useful for testing or resetting application state
 */
export function clearContexts(): void {
  // Clean up all subscribers before clearing
  for (const entry of contextStorage.values()) {
    entry.subscribers.clear();
  }
  contextStorage.clear();
}

/**
 * Get the current value of a context without subscribing to changes
 */
export function getContextValue<T>(context: Context<T>): T {
  const entry = contextStorage.get(context.id) as ContextEntry<T> | undefined;
  return entry ? entry.signal() : context.defaultValue;
}

/**
 * Set a context value imperatively
 */
export function setContextValue<T>(context: Context<T>, value: T): void {
  let entry = contextStorage.get(context.id) as ContextEntry<T> | undefined;

  if (!entry) {
    const valueSignal = signal(value);
    entry = {
      signal: valueSignal,
      subscribers: new Set()
    };
    contextStorage.set(context.id, entry as ContextEntry<unknown>);
  } else {
    entry.signal.set(value);
  }
}