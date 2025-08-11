/**
 * Aura - Post-minimalist TUI Framework
 * 
 * A reactive, composable terminal UI framework built on top of TRM
 */

// Export types
export * from './types.js';

// Export hooks
export * from './hooks/index.js';

// Export utilities
export * from './utils/index.js';

// Export styles
export * from './styles/index.js';

// Export prompts
export * from './prompts/index.js';

// Export main aura function
export { aura } from './core/aura.js';

// Export components
export * from './components/index.js';

// Export renderer
export { mount, render, unmount } from './core/renderer.js';

// Export reactive system
export { 
  batch,
  store,
  signal,
  effect,
  onMount,
  computed,
  resource,
  onUpdate,
  onCleanup
} from './core/reactive/index.js';

// Version
export const VERSION = '0.0.1';