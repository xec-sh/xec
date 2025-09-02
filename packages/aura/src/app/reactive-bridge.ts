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

import { getGlobalRegistry } from './component-registry.js';

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
        const dispose = effect(() => {
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

        disposables.push(dispose as unknown as (() => void));
      }
    }
  }

  return disposables;
}

/**
 * Mount lifecycle data for tracking cleanup
 */
interface MountData {
  instance: Component;
  cleanup: () => void;
  children: MountData[];
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

  // Create component instance
  const instance = createComponentInstance(element as AuraElement<ComponentType>, renderContext);

  // Store child mount data for cleanup
  const childMountData: MountData[] = [];

  // Create reactive root for this component
  const cleanup = createRoot((dispose) => {
    // Bind reactive props
    const propDisposables = bindReactiveProps(element as AuraElement<ComponentType>, instance);

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
    }

    // Mount children if present
    if (element.children) {
      for (const child of element.children) {
        const childMount = mountElement(child, instance);
        childMountData.push(childMount);

        // Add child to parent component
        if ('add' in instance && typeof instance.add === 'function') {
          instance.add(childMount.instance);
        }
      }
    }

    // Add to parent after children are mounted
    if (parent && 'add' in parent && typeof parent.add === 'function') {
      parent.add(instance);
    }

    // Return cleanup function
    return () => {
      // Clean up children first
      for (const child of childMountData) {
        child.cleanup();
      }

      // Clean up prop effects
      for (const disposable of propDisposables) {
        disposable();
      }

      // Call dispose
      dispose();
    };
  });

  return {
    instance,
    cleanup,
    children: childMountData
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

  // Remove from parent if possible
  const instance = mountData.instance;
  if (instance.parent && 'remove' in instance.parent && typeof instance.parent.remove === 'function') {
    instance.parent.remove(instance.id);
  }

  // Run cleanup
  mountData.cleanup();

  // Dispose component if it has a dispose method
  if ('dispose' in instance && typeof instance.dispose === 'function') {
    instance.dispose();
  }
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