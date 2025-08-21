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

import type { Context, AuraElement } from './types.js';

// Global context storage
const contextStorage = new Map<symbol, WritableSignal<any>>();

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
  contextStorage.set(id, valueSignal);

  return {
    id,
    defaultValue,
    Provider: (props: { value: T; children: AuraElement[] }) => {
      // Update context value
      valueSignal.set(props.value);

      // Return children wrapped in a group
      return aura('group', {
        children: props.children
      }) as AuraElement;
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
  const valueSignal = contextStorage.get(context.id);

  if (!valueSignal) {
    // If context not found, create with default value
    const newSignal = signal(context.defaultValue);
    contextStorage.set(context.id, newSignal);
    return newSignal;
  }

  return valueSignal;
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
  children: () => AuraElement[]
): AuraElement {
  return context.Provider({ value, children: children() });
}

/**
 * Clear all context values
 * Useful for testing or resetting application state
 */
export function clearContexts(): void {
  contextStorage.clear();
}

/**
 * Get the current value of a context without subscribing to changes
 */
export function getContextValue<T>(context: Context<T>): T {
  const valueSignal = contextStorage.get(context.id);
  return valueSignal ? valueSignal() : context.defaultValue;
}

/**
 * Set a context value imperatively
 */
export function setContextValue<T>(context: Context<T>, value: T): void {
  let valueSignal = contextStorage.get(context.id);

  if (!valueSignal) {
    valueSignal = signal(value);
    contextStorage.set(context.id, valueSignal);
  } else {
    valueSignal.set(value);
  }
}