/**
 * Main Aura factory function
 * 
 * Creates Aura component instances with type-safe props
 */

import type { 
  Aura, 
  AuraType, 
  BoxProps,
  AuraProps,
  FlexProps,
  GridProps,
  TextProps,
  InputProps,
  SelectProps,
  ButtonProps,
  BaseAuraProps
} from '../types.js';

let idCounter = 0;

/**
 * Generate unique ID for Aura elements
 */
function generateId(): string {
  return `aura-${++idCounter}`;
}

/**
 * Main factory function for creating Aura components
 * 
 * @example
 * ```typescript
 * const app = aura('flex', {
 *   direction: 'column',
 *   gap: 2,
 *   children: [
 *     aura('text', { value: 'Hello, Aura!' }),
 *     aura('button', { 
 *       label: 'Click me',
 *       onClick: () => console.log('Clicked!')
 *     })
 *   ]
 * });
 * ```
 */
export function aura<T extends AuraType>(
  type: T,
  props: AuraProps<T>
): Aura<T> {
  // Create the Aura instance
  const instance: Aura<T> = {
    type,
    props,
    id: generateId(),
    children: []
  };

  // Extract children from props
  const baseProps = props as BaseAuraProps;
  if (baseProps.children) {
    // Handle both static and reactive children
    const children = typeof baseProps.children === 'function' 
      ? baseProps.children() 
      : baseProps.children;
    
    instance.children = children;
    
    // Set parent reference for each child
    children.forEach(child => {
      child.parent = instance as Aura;
    });
  }

  return instance;
}

// ============================================================================
// Component-specific factory functions for better DX
// ============================================================================

/**
 * Create a box container (absolute positioning)
 */
export function box(props: BoxProps): Aura<'box'> {
  return aura('box', props);
}

/**
 * Create a flex container
 */
export function flex(props: FlexProps): Aura<'flex'> {
  return aura('flex', props);
}

/**
 * Create a grid container
 */
export function grid(props: GridProps): Aura<'grid'> {
  return aura('grid', props);
}

/**
 * Create a text element
 */
export function text(props: TextProps | string): Aura<'text'> {
  if (typeof props === 'string') {
    return aura('text', { value: props });
  }
  return aura('text', props);
}

/**
 * Create an input element
 */
export function input(props: InputProps): Aura<'input'> {
  return aura('input', props);
}

/**
 * Create a select element
 */
export function select<T = any>(props: SelectProps<T>): Aura<'select'> {
  return aura('select', props);
}

/**
 * Create a button element
 */
export function button(props: ButtonProps | string): Aura<'button'> {
  if (typeof props === 'string') {
    return aura('button', { label: props });
  }
  return aura('button', props);
}