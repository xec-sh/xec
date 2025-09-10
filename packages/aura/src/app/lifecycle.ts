/**
 * Aura Component Lifecycle Management
 * Unified lifecycle system integrated with reactive system for proper cleanup
 */

import type { Disposable } from 'vibrancy';

import {
  effect,
  onCleanup as onReactiveCleanup
} from 'vibrancy';

import { registerCleanup as registerGlobalCleanup } from './lifecycle-manager.js';

import type { EffectCleanup, EffectCallback } from './types.js';

// Lifecycle hook function type
export type LifecycleHook = () => void | (() => void);

export interface ComponentContext {
  id: string;
  mounted: boolean;
  onMount: Set<LifecycleHook>;
  onCleanup: Set<LifecycleHook>;
  onUpdate: Set<LifecycleHook>;
  disposables: Set<Disposable>;
}

// Context for tracking current component
let currentComponent: ComponentContext | null = null;

/**
 * Set the current component context
 * Used internally by the renderer and reactive bridge
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
 * Register a mount hook
 * The hook will be called when the component is mounted
 */
export function onMount(fn: EffectCallback): void {
  if (!currentComponent) {
    console.warn('onMount called outside of component context');
    return;
  }

  const hook = () => {
    const cleanup = fn();
    if (cleanup) {
      onCleanup(cleanup);
    }
  };

  currentComponent.onMount.add(hook);
}

/**
 * Register a callback to run when the component is cleaned up
 * Automatically registers with both reactive and global lifecycle systems
 */
export function onCleanup(fn: () => void): void {
  if (!currentComponent) {
    // When not in component context, still register with global lifecycle manager
    // This is important for app functions that call onCleanup
    const asyncWrapper = async () => {
      try {
        await Promise.resolve(fn());
      } catch (error) {
        console.error(`Error in onCleanup handler:`, error);
      }
    };
    
    registerGlobalCleanup(asyncWrapper, {
      name: `onCleanup[no-context]`,
      priority: 50
    });
    
    // Also register with reactive system if available
    onReactiveCleanup(fn);
    return;
  }

  // Add to component's cleanup set
  currentComponent.onCleanup.add(fn);

  // Also register with reactive system for proper cleanup
  onReactiveCleanup(fn);

  // Register with global lifecycle manager for graceful shutdown
  // This ensures cleanup runs even on process termination (CTRL+C, SIGTERM, etc.)
  // Use async wrapper to ensure cleanup completes before shutdown continues
  const componentId = currentComponent.id;
  const asyncWrapper = async () => {
    try {
      await Promise.resolve(fn());
    } catch (error) {
      console.error(`Error in onCleanup handler for component ${componentId}:`, error);
    }
  };
  
  const unregister = registerGlobalCleanup(asyncWrapper, {
    name: `Component.onCleanup[${componentId}]`,
    priority: 50 // Higher priority to run before other cleanups
  });

  // Don't unregister from global when component is disposed normally
  // We want these to always run on shutdown
  // currentComponent.onCleanup.add(unregister);
}

/**
 * Register a callback to run when the component updates
 */
export function onUpdate(fn: () => void): void {
  if (!currentComponent) {
    console.warn('onUpdate called outside of component context');
    return;
  }

  currentComponent.onUpdate.add(fn);
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
      console.error(`Error in mount hook for ${context.id}:`, error);
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
      console.error(`Error in cleanup hook for ${context.id}:`, error);
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
      console.error(`Error in update hook for ${context.id}:`, error);
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

/**
 * Create an effect that automatically cleans up when the component unmounts
 */
export function useEffect(callback: EffectCallback, deps?: any[]): void {
  let cleanup: EffectCleanup;

  const dispose = effect(() => {
    // Clean up previous effect
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }

    // Run new effect
    cleanup = callback();
  });

  // Register cleanup
  onCleanup(() => {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
    if (dispose && typeof dispose.dispose === 'function') {
      dispose.dispose();
    }
  });
}

/**
 * Register a callback to run on the next frame
 */
export function onFrame(callback: () => void): void {
  const handle = setImmediate(callback);
  onCleanup(() => clearImmediate(handle));
}

/**
 * Register a callback to run after a delay
 */
export function onTimeout(callback: () => void, delay: number): void {
  const handle = setTimeout(callback, delay);
  onCleanup(() => clearTimeout(handle));
}

/**
 * Register a callback to run at an interval
 */
export function onInterval(callback: () => void, interval: number): void {
  const handle = setInterval(callback, interval);
  onCleanup(() => clearInterval(handle));
}

/**
 * Register event listeners that automatically clean up
 */
export function onEvent<K extends keyof GlobalEventHandlersEventMap>(
  target: EventTarget,
  event: K,
  handler: (event: GlobalEventHandlersEventMap[K]) => void,
  options?: AddEventListenerOptions
): void {
  target.addEventListener(event, handler as any, options);
  onCleanup(() => {
    target.removeEventListener(event, handler as any, options);
  });
}

/**
 * Register process event listeners
 */
export function onProcessEvent(
  event: 'exit' | 'SIGINT' | 'SIGTERM' | 'uncaughtException' | 'unhandledRejection',
  handler: (...args: any[]) => void
): void {
  process.on(event, handler);
  onCleanup(() => {
    process.off(event, handler);
  });
}

/**
 * Focus management hooks
 */
let focusedComponent: any = null;

export function onFocus(callback: () => void): void {
  const component = getCurrentComponent();
  if (!component) return;

  (component as any).onFocus = () => {
    focusedComponent = component;
    callback();
  };
}

export function onBlur(callback: () => void): void {
  const component = getCurrentComponent();
  if (!component) return;

  (component as any).onBlur = () => {
    if (focusedComponent === component) {
      focusedComponent = null;
    }
    callback();
  };
}

export function getFocusedComponent(): any {
  return focusedComponent;
}

export function setFocus(component: any): void {
  if (focusedComponent && focusedComponent.onBlur) {
    focusedComponent.onBlur();
  }

  focusedComponent = component;

  if (component && component.onFocus) {
    component.onFocus();
  }
}