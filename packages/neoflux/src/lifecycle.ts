/**
 * Component Lifecycle Management
 * Integrated with reactive system for proper cleanup and dependency tracking
 * 
 * This module provides lifecycle hooks that integrate with the reactive system,
 * ensuring proper cleanup and memory management.
 */

import { onCleanup as onReactiveCleanup } from './context.js';

import type { Disposable } from './types.js';

// Lifecycle hook function type
export type LifecycleHook = () => void | (() => void);

// Context for tracking current component
let currentComponent: ComponentContext | null = null;

export interface ComponentContext {
  id: string;
  mounted: boolean;
  onMount: Set<LifecycleHook>;
  onCleanup: Set<LifecycleHook>;
  onUpdate: Set<LifecycleHook>;
  disposables: Set<Disposable>;
}

/**
 * Set the current component context
 * Used internally by the renderer
 */
export function setCurrentComponent(context: ComponentContext | null): void {
  currentComponent = context;
}

/**
 * Get the current component context
 */
export function getCurrentComponent(): ComponentContext | null {
  return currentComponent;
}

/**
 * Register a mount hook
 * The hook will be called when the component is mounted to the DOM
 */
export function onMount(fn: LifecycleHook): void {
  if (!currentComponent) {
    throw new Error('onMount can only be called during component initialization');
  }
  
  currentComponent.onMount.add(fn);
  
  // Also register cleanup with reactive system if we're in a reactive context
  const cleanup = () => {
    currentComponent?.onMount.delete(fn);
  };
  onReactiveCleanup(cleanup);
}

/**
 * Register a cleanup hook
 * The hook will be called when the component is unmounted or disposed
 */
export function onCleanup(fn: LifecycleHook): void {
  if (!currentComponent) {
    // Fallback to reactive cleanup if not in component context
    onReactiveCleanup(fn);
    return;
  }
  
  currentComponent.onCleanup.add(fn);
  
  // Also register with reactive system for proper cleanup
  onReactiveCleanup(fn);
}

/**
 * Register an update hook
 */
export function onUpdate(fn: LifecycleHook): void {
  if (!currentComponent) {
    throw new Error('onUpdate can only be called during component initialization');
  }
  
  currentComponent.onUpdate.add(fn);
}

/**
 * Create a new component context
 */
export function createComponentContext(id: string): ComponentContext {
  return {
    id,
    mounted: false,
    onMount: new Set(),
    onCleanup: new Set(),
    onUpdate: new Set(),
    disposables: new Set()
  };
}

/**
 * Run mount hooks for a component
 */
export function runMountHooks(context: ComponentContext): void {
  if (context.mounted) {
    console.warn(`Component ${context.id} is already mounted`);
    return;
  }
  
  context.mounted = true;
  
  for (const hook of context.onMount) {
    try {
      const cleanup = hook();
      if (typeof cleanup === 'function') {
        context.onCleanup.add(cleanup);
      }
    } catch (error) {
      console.error(`Error in mount hook:`, error);
    }
  }
}

/**
 * Run cleanup hooks for a component
 */
export function runCleanupHooks(context: ComponentContext): void {
  context.mounted = false;
  
  // Run cleanup hooks in reverse order (LIFO)
  const hooks = Array.from(context.onCleanup).reverse();
  for (const hook of hooks) {
    try {
      hook();
    } catch (error) {
      console.error(`Error in cleanup hook:`, error);
    }
  }
  
  // Clear all hooks
  context.onCleanup.clear();
  context.onMount.clear();
  context.onUpdate.clear();
  
  // Dispose all reactive resources
  for (const disposable of context.disposables) {
    try {
      disposable.dispose();
    } catch (error) {
      console.error(`Error disposing resource in component ${context.id}:`, error);
    }
  }
  context.disposables.clear();
}

/**
 * Run update hooks for a component
 */
export function runUpdateHooks(context: ComponentContext): void {
  if (!context.mounted) {
    console.warn(`Cannot update unmounted component ${context.id}`);
    return;
  }
  
  for (const hook of context.onUpdate) {
    try {
      hook();
    } catch (error) {
      console.error(`Error in update hook:`, error);
    }
  }
}

/**
 * Add a disposable resource to the current component
 */
export function addDisposable(disposable: Disposable): void {
  if (currentComponent) {
    currentComponent.disposables.add(disposable);
  } else {
    console.warn('addDisposable called outside of component context');
  }
}

/**
 * Run a function within a component context
 */
export function runInComponentContext<T>(
  context: ComponentContext,
  fn: () => T
): T {
  const prevComponent = currentComponent;
  currentComponent = context;
  try {
    return fn();
  } finally {
    currentComponent = prevComponent;
  }
}