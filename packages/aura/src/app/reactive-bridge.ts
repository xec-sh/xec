/**
 * Aura Next - Reactive Bridge (Refactored)
 * Connects reactive system with Aura components using component registry
 */

import {
  batch,
  effect,
  isSignal,
  onCleanup,
  createRoot,
  type Signal
} from 'vibrancy';

import { registerCleanup } from './lifecycle-manager.js';
import { getGlobalRegistry } from './component-registry.js';
import {
  runMountHooks,
  runCleanupHooks,
  runInComponentContext,
  type ComponentContext,
  createComponentContext
} from './lifecycle.js';

import type { Component } from '../component.js';
import type { RenderContext } from '../types.js';
import type {
  AuraElement,
  ComponentType,
  AnyAuraElement,
  ComponentProps,
  ComponentInstance
} from './types.js';

// Counter for generating unique component IDs
let componentIdCounter = 0;

/**
 * Generate a unique component ID
 */
function generateComponentId(type: string): string {
  return `${type}-${++componentIdCounter}`;
}

/**
 * Get the current value from a signal or return the value itself
 */
export function getValue<T>(value: T | Signal<T>): T {
  return isSignal(value) ? (value as any)() : value;
}

/**
 * Create a component instance from an Aura element
 */
export function createComponentInstance<T extends ComponentType>(
  element: AuraElement<T>,
  ctx: RenderContext
): ComponentInstance<T> {
  const registry = getGlobalRegistry();

  // Extract ID from various sources
  const id = element.key
    ? String(element.key)
    : ((element.props as any).id || generateComponentId(element.type));

  // Unwrap reactive props to get current values
  const unwrappedProps = {
    ...unwrapReactiveProps(element.props),
    id
  };

  // Create component instance using registry
  const instance = registry.create(element.type, unwrappedProps as ComponentProps<T>, ctx);

  // Store instance reference
  element.instance = instance;

  // Set ref if provided
  if (element.ref && 'set' in element.ref) {
    element.ref.set(instance);
  }

  return instance;
}

/**
 * Unwrap reactive props to get current values
 */
function unwrapReactiveProps<T extends Record<string, unknown>>(props: T): T {
  const unwrapped = {} as T;

  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const value = props[key];
      (unwrapped as any)[key] = getValue(value);
    }
  }

  return unwrapped;
}

/**
 * Bind reactive props to a component instance
 * Creates effects that update the component when signals change
 */
export function bindReactiveProps<T extends ComponentType>(
  element: AuraElement<T>,
  instance: ComponentInstance<T>
): (() => void)[] {
  const disposables: (() => void)[] = [];
  const props = element.props;

  // Create effects for each reactive prop
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const value = props[key];

      if (isSignal(value)) {
        // Create an effect that updates the component property
        const disposable = effect(() => {
          const newValue = value();

          // Use batch to group multiple updates
          batch(() => {
            // Type-safe property assignment
            if (key in instance) {
              (instance as any)[key] = newValue;
            }

            // Trigger re-render if the component supports it
            if ('requestRender' in instance && typeof instance.requestRender === 'function') {
              instance.requestRender();
            }
          });
        });

        // effect returns a Disposable object with dispose() method
        disposables.push(() => disposable.dispose());
      }
    }
  }

  return disposables;
}

/**
 * Mount lifecycle data for tracking cleanup
 */
interface MountData {
  instance: Component | null;  // null for functional components
  cleanup: () => void;
  children: MountData[];
  context: ComponentContext;
}

/**
 * Mount a functional component directly without wrapper
 */
function mountFunctionalComponent(
  element: AnyAuraElement,
  parent: Component,
  ctx: RenderContext
): MountData {
  const fn = (element.props as any).fn;
  if (typeof fn !== 'function') {
    throw new Error('Functional component must have a fn prop');
  }

  // Create a unique context for this functional component
  const functionalId = generateComponentId('functional');
  const componentContext = createComponentContext(functionalId);

  // Store mounted children
  const childMountData: MountData[] = [];
  let isUpdating = false;

  // Function to update children based on reactive changes
  const updateChildren = () => {
    if (isUpdating) return;
    isUpdating = true;

    try {
      // Batch all updates to prevent multiple renders
      batch(() => {
        // Clean up existing children in reverse order to maintain consistency
        for (let i = childMountData.length - 1; i >= 0; i--) {
          unmountElement(childMountData[i]);
        }
        childMountData.length = 0;

        // Get new elements from the function
        const result = fn();
        if (result) {
          const elements = Array.isArray(result) ? result : [result];
          
          // Mount new elements directly to parent in correct order
          for (let i = 0; i < elements.length; i++) {
            const childElement = elements[i];
            if (childElement) {
              const childMount = mountElement(childElement, parent, ctx);
              childMountData.push(childMount);
            }
          }
        }

        // Request parent to re-render after all children are mounted
        if (parent.requestRender) {
          parent.requestRender();
        }
      });
    } finally {
      isUpdating = false;
    }
  };

  // Create reactive root for tracking
  const cleanup = createRoot((dispose) => {
    // Run within component context
    runInComponentContext(componentContext, () => {
      // Create effect for reactive updates
      // This will run immediately and track dependencies properly
      const effectDispose = effect(() => {
        updateChildren();
      });

      // Register cleanup
      onCleanup(() => {
        effectDispose.dispose();
      });

      // Run mount hook if provided
      if (element.onMount) {
        const mountCleanup = element.onMount();
        if (mountCleanup) {
          onCleanup(mountCleanup);
        }
      }

      // Register cleanup hook
      if (element.onCleanup) {
        onCleanup(element.onCleanup);
        registerCleanup(element.onCleanup, {
          name: 'functional.onCleanup',
          priority: 70
        });
      }

      // Run mount hooks
      runMountHooks(componentContext);
    });

    // Return cleanup function
    return () => {
      // Run cleanup hooks
      runCleanupHooks(componentContext);

      // Clean up children
      for (const child of childMountData) {
        unmountElement(child);
      }

      // Call dispose
      dispose();
    };
  });

  return {
    instance: null,  // No instance for functional components
    cleanup,
    children: childMountData,
    context: componentContext
  };
}

/**
 * Mount an Aura element tree to create component instances
 */
export function mountElement(
  element: AnyAuraElement,
  parent: Component,
  ctx?: RenderContext
): MountData {
  // Use provided context or get from parent
  const renderContext = ctx || parent.ctx;

  // Check if this is a functional component
  if (element.type === 'functional') {
    return mountFunctionalComponent(element as AuraElement<'functional'>, parent, renderContext);
  }

  // Create component instance
  const instance = createComponentInstance(element as AuraElement<ComponentType>, renderContext);

  // Create component context for lifecycle management
  const componentContext = createComponentContext(instance.id);

  // Store child mount data for cleanup
  const childMountData: MountData[] = [];

  // Create reactive root for this component within its context
  const cleanup = createRoot((dispose) => {
    // Run within component context so lifecycle hooks register correctly
    runInComponentContext(componentContext, () => {
      // Bind reactive props
      const propDisposables = bindReactiveProps(element as AuraElement<ComponentType>, instance);

      // Run mount hook if provided
      if (element.onMount) {
        const mountCleanup = element.onMount();
        if (mountCleanup) {
          onCleanup(mountCleanup);
        }
      }

      // Register cleanup hook with both reactive system and global lifecycle
      if (element.onCleanup) {
        onCleanup(element.onCleanup);
        // Also register with global lifecycle manager for graceful shutdown
        const componentType = (element as any).type || 'Component';
        registerCleanup(element.onCleanup, {
          name: `${componentType}.onCleanup`,
          priority: 70
        });
      }

      // Register cleanup for prop disposables
      onCleanup(() => {
        for (const disposable of propDisposables) {
          disposable();
        }
      });
    });

    // Add to parent BEFORE mounting children to maintain correct order
    if (parent && 'add' in parent && typeof parent.add === 'function') {
      parent.add(instance);
    }

    // Mount children if present (after parent is added)
    if (element.children) {
      for (const child of element.children) {
        // Mount child with current instance as parent
        // The child will be automatically added to parent inside the recursive mountElement call
        const childMount = mountElement(child, instance);
        childMountData.push(childMount);
      }
    }

    // Run mount hooks after component is added to parent and children are mounted
    runMountHooks(componentContext);

    // Return cleanup function
    return () => {
      // Run cleanup hooks
      runCleanupHooks(componentContext);

      // Clean up children first
      for (const child of childMountData) {
        child.cleanup();
      }

      // Call dispose
      dispose();
    };
  });

  return {
    instance,
    cleanup,
    children: childMountData,
    context: componentContext
  };
}

/**
 * Unmount an element and clean up resources
 */
export function unmountElement(mountData: MountData): void {
  // Clean up children first
  for (const child of mountData.children) {
    unmountElement(child);
  }

  // Remove from parent if possible (only for non-functional components)
  const instance = mountData.instance;
  if (instance) {
    if (instance.parent && 'remove' in instance.parent && typeof instance.parent.remove === 'function') {
      instance.parent.remove(instance.id);
    }

    // Dispose component if it has a dispose method
    if ('dispose' in instance && typeof instance.dispose === 'function') {
      instance.dispose();
    }
  }

  // Run cleanup
  mountData.cleanup();
}

/**
 * Update an existing element with new props/children
 * This is a more efficient alternative to unmounting and remounting
 */
export function updateElement<T extends ComponentType>(
  element: AuraElement<T>,
  mountData: MountData
): void {
  const instance = mountData.instance as ComponentInstance<T>;

  // Update props
  batch(() => {
    const unwrappedProps = unwrapReactiveProps(element.props);

    for (const key in unwrappedProps) {
      if (Object.prototype.hasOwnProperty.call(unwrappedProps, key) && key in instance) {
        (instance as any)[key] = unwrappedProps[key];
      }
    }

    // Trigger re-render
    if ('requestRender' in instance && typeof instance.requestRender === 'function') {
      instance.requestRender();
    }
  });

  // Run update hook if provided
  if (element.onUpdate) {
    element.onUpdate();
  }

  // TODO: Implement proper child reconciliation
  // For now, we're not updating children - this would require
  // a more sophisticated diffing algorithm
}

/**
 * Create a reactive component tree
 * This is the main entry point for mounting reactive components
 */
export function createReactiveTree(
  element: AnyAuraElement,
  parent: Component,
  ctx?: RenderContext
): () => void {
  const mountData = mountElement(element, parent, ctx);

  // Return cleanup function
  return () => {
    unmountElement(mountData);
  };
}