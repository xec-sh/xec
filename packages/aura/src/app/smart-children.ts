/**
 * Smart Children Processing
 * Automatically detects and wraps functional components
 */

import { Functional, type FunctionalComponentFn } from '../components/functional.js';

import type { AnyAuraElement } from './types.js';

/**
 * Type that can be passed as a child to containers
 * Can be an AuraElement, a functional component, or null/undefined
 */
export type SmartChild =
  | AnyAuraElement
  | FunctionalComponentFn
  | null
  | undefined
  | false;

/**
 * Process a smart child, automatically wrapping functions in Functional()
 */
export function processSmartChild(child: SmartChild): AnyAuraElement | null {
  if (!child) return null;

  // If it's already an AuraElement, return as-is
  if (typeof child === 'object' && 'type' in child && 'props' in child) {
    return child as AnyAuraElement;
  }

  // If it's a function, wrap it in Functional
  if (typeof child === 'function') {
    return Functional(child as FunctionalComponentFn);
  }

  return null;
}

/**
 * Process an array of smart children
 */
export function processSmartChildren(children: SmartChild[]): AnyAuraElement[] {
  const processed: AnyAuraElement[] = [];

  for (const child of children) {
    const result = processSmartChild(child);
    if (result) {
      processed.push(result);
    }
  }

  return processed;
}

/**
 * Helper to flatten and process mixed children
 * Handles both props.children and variadic children arguments
 */
export function normalizeChildren(
  propsChildren?: SmartChild | SmartChild[],
  ...additionalChildren: SmartChild[]
): AnyAuraElement[] {
  const allChildren: SmartChild[] = [];

  // Add children from props
  if (propsChildren !== undefined) {
    if (Array.isArray(propsChildren)) {
      allChildren.push(...propsChildren);
    } else {
      allChildren.push(propsChildren);
    }
  }

  // Add additional children
  allChildren.push(...additionalChildren);

  // Process all children
  return processSmartChildren(allChildren);
}