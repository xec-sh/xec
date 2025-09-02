/**
 * Aura Next - Reactive Bridge
 * Connects NeoFlux reactive system with Aura components
 */

import {
  batch,
  effect,
  isSignal,
  onCleanup,
  createRoot,
  type Signal,
  type Disposable
} from 'vibrancy';

import { BoxComponent } from '../components/box.js';
import { TextComponent } from '../components/text.js';
import { TabsComponent } from '../components/tabs.js';
import { InputComponent } from '../components/input.js';
import { GroupComponent } from '../components/group.js';
import { TableComponent } from '../components/table.js';
import { SelectComponent } from '../components/select.js';
import { ASCIIFontComponent } from '../components/ascii-font.js';
import { FrameBufferComponent } from '../components/frame-buffer.js';

import type { Component } from '../component.js';
import type { RenderContext } from '../types.js';
import type {
  AuraElement,
  ComponentType,
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
  return isSignal(value) ? value() : value;
}

/**
 * Create a component instance from an Aura element
 */
export function createComponentInstance<T extends ComponentType>(
  element: AuraElement<T>,
  ctx: RenderContext
): ComponentInstance<T> {
  let instance: any;

  // Use key as ID if provided, otherwise use props.id or generate one
  const props = element.props as any;
  const id = element.key
    ? String(element.key)
    : (props.id || generateComponentId(element.type));
  const unwrappedProps = { ...unwrapReactiveProps(props), id };

  // Create the appropriate component instance with context and props
  switch (element.type) {
    case 'box':
      instance = new BoxComponent(ctx, unwrappedProps);
      break;
    case 'text':
      instance = new TextComponent(ctx, unwrappedProps);
      break;
    case 'input':
      instance = new InputComponent(ctx, unwrappedProps);
      break;
    case 'select':
      instance = new SelectComponent(ctx, unwrappedProps);
      break;
    case 'table':
      instance = new TableComponent(ctx, unwrappedProps);
      break;
    case 'tabs':
      instance = new TabsComponent(ctx, unwrappedProps);
      break;
    case 'group':
      instance = new GroupComponent(ctx, unwrappedProps);
      break;
    case 'frame-buffer':
      instance = new FrameBufferComponent(ctx, unwrappedProps);
      break;
    case 'ascii-font':
      instance = new ASCIIFontComponent(ctx, unwrappedProps);
      break;
    default:
      throw new Error(`Unknown component type: ${element.type}`);
  }

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
function unwrapReactiveProps<T extends Record<string, any>>(props: T): any {
  const unwrapped: any = {};

  for (const key in props) {
    const value = props[key];
    unwrapped[key] = getValue(value);
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
): Disposable[] {
  const disposables: Disposable[] = [];
  const props = element.props as any;

  // Create effects for each reactive prop
  for (const key in props) {
    const value = props[key];

    if (isSignal(value)) {
      // Create an effect that updates the component property
      const dispose = effect(() => {
        const newValue = value();

        // Use batch to group multiple updates
        batch(() => {
          (instance as any)[key] = newValue;

          // Trigger re-render if needed
          if ('requestRender' in instance && typeof instance.requestRender === 'function') {
            instance.requestRender();
          }
        });
      });

      disposables.push(dispose);
    }
  }

  return disposables;
}

/**
 * Mount an Aura element tree to create component instances
 */
export function mountElement<T extends ComponentType>(
  element: AuraElement<T>,
  parent?: Component
): ComponentInstance<T> {
  // Get context from parent or throw error if no parent
  if (!parent) {
    throw new Error('Cannot mount element without parent component');
  }
  const ctx = parent.ctx;

  // Create component instance with context
  const instance = createComponentInstance(element, ctx);

  // Create reactive root for this component
  const cleanup = createRoot((dispose) => {
    // Bind reactive props
    const propDisposables = bindReactiveProps(element, instance);

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

    // Add to parent first (required for children to get context)
    if (parent) {
      parent.add(instance);
    }

    // Mount children recursively
    if (element.children) {
      for (const child of element.children) {
        // Pass instance as parent - child will be added inside mountElement
        mountElement(child, instance);
      }
    }

    // Return cleanup function
    return () => {
      // Dispose all prop effects
      propDisposables.forEach(d => d.dispose());

      // Remove from parent
      if (parent && instance.parent === parent) {
        parent.remove(instance.id);
      }

      // Dispose the reactive root
      dispose();
    };
  });

  // Store cleanup function on instance for later disposal
  (instance as any).__cleanup = cleanup;

  return instance;
}

/**
 * Unmount a component and clean up its reactive subscriptions
 */
export function unmountElement(instance: Component): void {
  // Call the stored cleanup function if it exists
  const cleanup = (instance as any).__cleanup;
  if (cleanup && typeof cleanup === 'function') {
    cleanup();
  }

  // Recursively unmount children
  const children = instance.getChildren();
  for (const child of children) {
    unmountElement(child);
  }
}

/**
 * Update an existing component tree with a new element tree
 * This is used for efficient re-rendering
 */
export function updateElement<T extends ComponentType>(
  element: AuraElement<T>,
  instance: ComponentInstance<T>
): void {
  // Update props
  const props = unwrapReactiveProps(element.props as any);
  for (const key in props) {
    (instance as any)[key] = props[key];
  }

  // Update children (simplified - full reconciliation would be more complex)
  if (element.children) {
    // Clear existing children
    const existingChildren = instance.getChildren();
    for (const child of existingChildren) {
      instance.remove(child.id);
      unmountElement(child);
    }

    // Mount new children
    for (const child of element.children) {
      // Pass instance as parent - child will be added inside mountElement
      mountElement(child, instance);
    }
  }

  // Run update hook if provided
  if (element.onUpdate) {
    element.onUpdate();
  }
}