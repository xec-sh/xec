/**
 * Reactive System - Fine-grained reactivity for Aura
 * 
 * Based on signals pattern for optimal performance in terminal environments
 */

// Advanced reactive primitives
export { store } from './store.js';
export { effect } from './effect.js';
export { computed } from './computed.js';
export { onCleanup } from './context.js';
export { resource } from './resource.js';

// Core reactive primitives
export { signal, readonly } from './signal.js';
export { onMount, onUpdate } from './lifecycle.js';
export { batch, untrack, createRoot } from './batch.js';

// Re-export types from types/reactive
export type {
  Store,
  Owner,
  Signal,
  Resource,
  Disposable,
  Computation,
  StoreOptions,
  BatchOptions,
  EffectOptions,
  WritableSignal,
  ComputedOptions,
  ResourceOptions,
  ReactiveContext,
  TrackingContext
} from '../../types/reactive.js';