/**
 * Reactive System - Fine-grained reactivity for Aura
 * 
 * Enhanced with topological sorting, deep reactivity, and priority scheduling
 */

// Core reactive primitives
export { signal } from './signal.js';
export { effect } from './effect.js';
export { computed } from './computed.js';
// Resource management
export { resource } from './resource.js';

export { onMount, onUpdate } from './lifecycle.js';

// Context and lifecycle
export {
  getOwner,
  onCleanup
} from './context.js';

export { batch, untrack, createRoot } from './batch.js';
// Dependency graph
export { globalDependencyGraph, DependencyGraph } from './dependency-graph.js';

// Store with reactivity
export { store, selector, store as deepStore, transaction, Transaction } from './store.js';

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

import { store } from './store.js';
// Default export for convenience
import { signal } from './signal.js';
import { effect } from './effect.js';
import { computed } from './computed.js';
import { resource } from './resource.js';
import { onCleanup } from './context.js';
import { onMount, onUpdate } from './lifecycle.js';
import { batch, untrack, createRoot } from './batch.js';

export default {
  signal,
  computed,
  effect,
  store,
  resource,
  batch,
  untrack,
  createRoot,
  onCleanup,
  onMount,
  onUpdate
};