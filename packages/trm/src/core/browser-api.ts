/**
 * Browser API Polyfills
 * Provides browser APIs for terminal environments
 */

import { setTimeout, clearTimeout } from './platform.js';

// ============================================================================
// Animation Frame Polyfill
// ============================================================================

let animationFrameId = 0;
const animationFrameCallbacks = new Map<number, any>();
let lastFrameTime = 0;

/**
 * Polyfill for requestAnimationFrame
 */
export function requestAnimationFrame(callback: (time: number) => void): number {
  const id = ++animationFrameId;
  const now = performance.now();
  const timeToNextFrame = Math.max(0, 16 - (now - lastFrameTime));
  
  const handle = setTimeout(() => {
    animationFrameCallbacks.delete(id);
    lastFrameTime = performance.now();
    callback(lastFrameTime);
  }, timeToNextFrame);
  
  animationFrameCallbacks.set(id, handle);
  return id;
}

/**
 * Polyfill for cancelAnimationFrame
 */
export function cancelAnimationFrame(id: number): void {
  const handle = animationFrameCallbacks.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    animationFrameCallbacks.delete(id);
  }
}

// ============================================================================
// Performance API
// ============================================================================

// Performance.now is already available in Node.js, Deno, and Bun
// Just re-export for consistency
export { performance } from './platform.js';