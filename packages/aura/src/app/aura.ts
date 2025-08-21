/**
 * Aura Next - Component Factory
 * Main function for creating reactive components with full type inference
 */

import type { WritableSignal } from 'vibrancy';

import type {
  AuraElement,
  ComponentType,
  ComponentProps,
  AnyAuraElement,
  ComponentInstance
} from './types.js';

/**
 * Create a reactive Aura element with full type inference
 * 
 * @example
 * ```typescript
 * const box = aura('box', {
 *   title: computed(() => `Count: ${count()}`),
 *   backgroundColor: [0.5, 0.5, 0.5, 0.8],
 *   children: [
 *     aura('text', { value: 'Hello World' })
 *   ]
 * });
 * ```
 */
export function aura<T extends ComponentType>(
  type: T,
  props?: ComponentProps<T> & {
    children?: AnyAuraElement | AnyAuraElement[];
    key?: string | number;
    ref?: WritableSignal<ComponentInstance<T> | null>;
    onMount?: () => void | (() => void);
    onCleanup?: () => void;
    onUpdate?: () => void;
  }
): AuraElement<T> {
  // Handle props safely
  if (!props) {
    return {
      type,
      props: {} as ComponentProps<T>,
      children: undefined
    };
  }

  // Extract special props
  const children = props.children
    ? Array.isArray(props.children)
      ? props.children
      : [props.children]
    : undefined;

  // Build component props without special properties
  const componentProps: any = {};
  for (const key in props) {
    if (key !== 'children' && key !== 'key' && key !== 'ref' &&
      key !== 'onMount' && key !== 'onCleanup' && key !== 'onUpdate') {
      componentProps[key] = (props as any)[key];
    }
  }

  return {
    type,
    props: componentProps as ComponentProps<T>,
    children,
    key: (props as any).key,
    ref: (props as any).ref,
    onMount: (props as any).onMount,
    onCleanup: (props as any).onCleanup,
    onUpdate: (props as any).onUpdate
  };
}
