/**
 * Lifecycle hooks for components
 */

import type { LifecycleHook } from '../../types.js';

// Context for tracking current component
let currentComponent: ComponentContext | null = null;

interface ComponentContext {
  onMount: Set<LifecycleHook>;
  onCleanup: Set<LifecycleHook>;
  onUpdate: Set<LifecycleHook>;
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
 */
export function onMount(fn: LifecycleHook): void {
  if (!currentComponent) {
    throw new Error('onMount can only be called during component initialization');
  }
  
  currentComponent.onMount.add(fn);
}

/**
 * Register a cleanup hook
 */
export function onCleanup(fn: LifecycleHook): void {
  if (!currentComponent) {
    throw new Error('onCleanup can only be called during component initialization');
  }
  
  currentComponent.onCleanup.add(fn);
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
export function createComponentContext(): ComponentContext {
  return {
    onMount: new Set(),
    onCleanup: new Set(),
    onUpdate: new Set()
  };
}

/**
 * Run mount hooks for a component
 */
export function runMountHooks(context: ComponentContext): void {
  for (const hook of context.onMount) {
    const cleanup = hook();
    if (typeof cleanup === 'function') {
      context.onCleanup.add(cleanup);
    }
  }
}

/**
 * Run cleanup hooks for a component
 */
export function runCleanupHooks(context: ComponentContext): void {
  for (const hook of context.onCleanup) {
    hook();
  }
}

/**
 * Run update hooks for a component
 */
export function runUpdateHooks(context: ComponentContext): void {
  for (const hook of context.onUpdate) {
    hook();
  }
}