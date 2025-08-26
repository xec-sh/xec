/**
 * Aura Next - Reactive Screen Dimensions
 * Provides reactive signals for terminal width and height that update on resize
 */

import {
  signal,
  effect,
  onCleanup,
  type Signal,
  type WritableSignal
} from 'vibrancy';

import { Renderer } from '../renderer/renderer.js';

// Global signals for screen dimensions
let screenWidthSignal: WritableSignal<number> | null = null;
let screenHeightSignal: WritableSignal<number> | null = null;
let currentRenderer: Renderer | null = null;

/**
 * Initialize screen dimension signals with a renderer
 * This should be called when the application starts
 */
export function initializeScreenDimensions(renderer: Renderer): void {
  // Clean up any existing signals
  if (currentRenderer && currentRenderer !== renderer) {
    currentRenderer.off('resize', updateDimensions);
  }

  currentRenderer = renderer;

  // Create or update signals with current dimensions
  if (!screenWidthSignal) {
    screenWidthSignal = signal(renderer.width);
  } else {
    screenWidthSignal.set(renderer.width);
  }

  if (!screenHeightSignal) {
    screenHeightSignal = signal(renderer.height);
  } else {
    screenHeightSignal.set(renderer.height);
  }

  // Listen for resize events
  renderer.on('resize', updateDimensions);
}

/**
 * Update dimension signals when terminal resizes
 */
function updateDimensions(width: number, height: number): void {
  if (screenWidthSignal && screenHeightSignal) {
    screenWidthSignal.set(width);
    screenHeightSignal.set(height);
  }
}

/**
 * Clean up dimension signals
 */
export function cleanupScreenDimensions(): void {
  if (currentRenderer) {
    currentRenderer.off('resize', updateDimensions);
    currentRenderer = null;
  }
  screenWidthSignal = null;
  screenHeightSignal = null;
}

/**
 * Get the current terminal width as a reactive signal
 * Returns a signal that updates when the terminal is resized
 * 
 * @example
 * ```typescript
 * import { screenWidth } from '@xec-sh/aura';
 * 
 * const MyComponent = () => {
 *   const width = screenWidth();
 *   return box({ width }, 'Content');
 * };
 * ```
 */
export function screenWidth(): Signal<number> {
  if (!screenWidthSignal) {
    throw new Error('Screen dimensions not initialized. Make sure application is started.');
  }
  return screenWidthSignal;
}

/**
 * Get the current terminal height as a reactive signal
 * Returns a signal that updates when the terminal is resized
 * 
 * @example
 * ```typescript
 * import { screenHeight } from '@xec-sh/aura';
 * 
 * const MyComponent = () => {
 *   const height = screenHeight();
 *   return box({ height }, 'Content');
 * };
 * ```
 */
export function screenHeight(): Signal<number> {
  if (!screenHeightSignal) {
    throw new Error('Screen dimensions not initialized. Make sure application is started.');
  }
  return screenHeightSignal;
}

/**
 * Get both width and height as reactive signals
 * 
 * @example
 * ```typescript
 * import { screenDimensions } from '@xec-sh/aura';
 * 
 * const MyComponent = () => {
 *   const { width, height } = screenDimensions();
 *   return box({ width, height }, 'Fullscreen content');
 * };
 * ```
 */
export function screenDimensions(): { width: Signal<number>; height: Signal<number> } {
  return {
    width: screenWidth(),
    height: screenHeight()
  };
}

/**
 * Hook to use screen width in a component
 * Ensures proper cleanup when component unmounts
 */
export function useScreenWidth(): Signal<number> {
  const width = screenWidth();
  
  // Set up effect to track updates
  const dispose = effect(() => {
    // This will re-run when width changes
    width();
  });

  // Register cleanup
  onCleanup(() => {
    dispose.dispose();
  });

  return width;
}

/**
 * Hook to use screen height in a component
 * Ensures proper cleanup when component unmounts
 */
export function useScreenHeight(): Signal<number> {
  const height = screenHeight();
  
  // Set up effect to track updates
  const dispose = effect(() => {
    // This will re-run when height changes
    height();
  });

  // Register cleanup
  onCleanup(() => {
    dispose.dispose();
  });

  return height;
}

/**
 * Hook to use both screen dimensions
 * Ensures proper cleanup when component unmounts
 */
export function useScreenDimensions(): { width: Signal<number>; height: Signal<number> } {
  return {
    width: useScreenWidth(),
    height: useScreenHeight()
  };
}