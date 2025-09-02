/**
 * Aura Component Factory
 * Main function for creating reactive components with composition support
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
 * Special props that are not component props
 */
interface SpecialProps<T extends ComponentType> {
  key?: string | number;
  ref?: WritableSignal<ComponentInstance<T> | null>;
  onMount?: () => void | (() => void);
  onCleanup?: () => void;
  onUpdate?: () => void;
  children?: AnyAuraElement | AnyAuraElement[];
}

/**
 * Combined props type with special props
 */
export type AuraProps<T extends ComponentType> = ComponentProps<T> & SpecialProps<T>;

/**
 * Create a reactive Aura element with full type inference
 * 
 * @example
 * ```typescript
 * const container = aura('box', { title: 'Container' },
 *   aura('text', { value: 'Line 1' }),
 *   aura('text', { value: 'Line 2' })
 * );
 * ```
 */
export function aura<T extends ComponentType>(
  type: T,
  props?: AuraProps<T>,
  ...children: AnyAuraElement[]
): AuraElement<T> {
  if (!props) {
    return {
      type,
      props: {} as ComponentProps<T>,
      children: children.length > 0 ? children : undefined
    };
  }

  // Extract special props using destructuring for type safety
  const {
    key,
    ref,
    onMount,
    onCleanup,
    onUpdate,
    children: propsChildren,
    ...componentProps
  } = props;

  // Merge children from props and arguments
  const allChildren: AnyAuraElement[] = [];

  if (propsChildren) {
    const childArray = Array.isArray(propsChildren) ? propsChildren : [propsChildren];
    allChildren.push(...childArray);
  }

  if (children.length > 0) {
    allChildren.push(...children);
  }

  return {
    type,
    props: componentProps as ComponentProps<T>,
    children: allChildren.length > 0 ? allChildren : undefined,
    key,
    ref,
    onMount,
    onCleanup,
    onUpdate
  };
}

// ============== Composition Helpers ==============

/**
 * Create a Box layout component
 */
export function Box(props?: AuraProps<'box'>, ...children: AnyAuraElement[]) {
  return aura('box', props, ...children);
}

/**
 * Create a Text component
 */
export function Text(props?: AuraProps<'text'>) {
  return aura('text', props);
}

/**
 * Create a vertical stack (column layout)
 */
export function VStack(
  props?: Omit<AuraProps<'box'>, 'flexDirection'>,
  ...children: AnyAuraElement[]
) {
  const stackProps: AuraProps<'box'> = {
    ...props,
    flexDirection: 'column'
  };
  return aura('box', stackProps, ...children);
}

/**
 * Create a horizontal stack (row layout)
 */
export function HStack(
  props?: Omit<AuraProps<'box'>, 'flexDirection'>,
  ...children: AnyAuraElement[]
) {
  const stackProps: AuraProps<'box'> = {
    ...props,
    flexDirection: 'row'
  };
  return aura('box', stackProps, ...children);
}

/**
 * Create a centered container
 */
export function Center(props?: AuraProps<'box'>, ...children: AnyAuraElement[]) {
  const centerProps: AuraProps<'box'> = {
    ...props,
    alignItems: 'center',
    justifyContent: 'center'
  };
  return aura('box', centerProps, ...children);
}

/**
 * Create a Tabs component
 */
export function Tabs(props?: AuraProps<'tabs'>) {
  return aura('tabs', props);
}

/**
 * Create a Table component
 */
export function Table(props?: AuraProps<'table'>) {
  return aura('table', props);
}

/**
 * Create an Input component
 */
export function Input(props?: AuraProps<'input'>) {
  return aura('input', props);
}

/**
 * Create a Select component
 */
export function Select(props?: AuraProps<'select'>) {
  return aura('select', props);
}

/**
 * Create an ASCII font component
 */
export function ASCIIFont(props?: AuraProps<'ascii-font'>) {
  return aura('ascii-font', props);
}

/**
 * Create a Frame Buffer component
 */
export function FrameBuffer(props?: AuraProps<'frame-buffer'>) {
  return aura('frame-buffer', props);
}

/**
 * Create a ScrollBar component
 */
export function ScrollBar(props?: AuraProps<'scroll-bar'>) {
  return aura('scroll-bar', props);
}

/**
 * Create a ScrollBox component
 */
export function ScrollBox(props?: AuraProps<'scroll-box'>, ...children: AnyAuraElement[]) {
  return aura('scroll-box', props, ...children);
}
