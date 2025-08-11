/**
 * Batch - Group multiple updates into a single render
 * Re-exports batch functionality from context
 */

import { context } from './context.js';

/**
 * Batch multiple signal updates to prevent excessive re-renders
 */
export function batch(fn: () => void): void {
  context.batch(fn);
}

/**
 * Untrack execution - run without dependency tracking
 */
export function untrack<T>(fn: () => T): T {
  return context.untrack(fn);
}

/**
 * Create a root scope for reactive computations
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  return context.createRoot(fn);
}