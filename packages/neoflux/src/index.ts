/**
 * NeoFlux - Next-generation reactive system
 * 
 * Fine-grained reactivity with advanced features:
 * - Diamond dependency resolution
 * - Async computed values
 * - Store middleware system
 * - Selective subscriptions
 * - Circular dependency detection
 */

export { effect } from './effect.js';
export { computed } from './computed.js';
// Resource management
export { resource } from './resource.js';
// Core reactive primitives
export { signal, isSignal } from './signal.js';

export { batch, untrack, createRoot } from './batch.js';

// Store with reactivity
export { store, selector, transaction, Transaction } from './store.js';

// Dependency graph
export { DependencyGraph, globalDependencyGraph } from './dependency-graph.js';

// Diamond dependency resolution
export {
  type DiamondResolvable,
  isDiamondResolvable,
  getDiamondResolvable,
  resolveDiamondDependencies,
  calculateDependencyDepth
} from './diamond-resolver.js';

// Proxy registry for memory management
export { ProxyRegistry, globalProxyRegistry } from './proxy-registry.js';

// Advanced features
export {
  asyncComputed,
  asyncResource,
  asyncComputedGroup,
  suspenseAsyncComputed,
  type AsyncComputed,
  type AsyncComputedOptions,
  type AsyncComputedState
} from './async-computed.js';

export {
  CircularDependencyResolver,
  CircularDependencyError,
  globalCircularResolver,
  optional,
  withDefault,
  type CircularDependencyOptions,
  type ResolvableComputation
} from './circular-dependency-resolver.js';

export {
  StoreMiddlewareManager,
  commonMiddleware,
  type Middleware,
  type MiddlewareFunction,
  type MiddlewareContext,
  type MiddlewareConfig
} from './store-middleware.js';

export {
  StoreSubscriptionManager,
  PathMatcher,
  storeComputed,
  derivedStore,
  type SubscriptionCallback,
  type SubscriptionOptions
} from './store-subscriptions.js';
// Context and reactive cleanup
export {
  getOwner,
  onCleanup  // This is the reactive system's onCleanup
} from './context.js';

// Lifecycle hooks - properly integrated with reactive system
export {
  onMount,
  onUpdate,
  runMountHooks,
  addDisposable,
  runUpdateHooks,
  runCleanupHooks,
  setCurrentComponent,
  getCurrentComponent,
  runInComponentContext,
  createComponentContext,
  onCleanup as onComponentCleanup
} from './lifecycle.js';

// Re-export types from local types file
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
  ComputedSignal,
  ComputedOptions,
  ResourceOptions,
  ReactiveContext,
  TrackingContext
} from './types.js';

// Default export for convenience
import { signal } from './signal.js';
import { computed } from './computed.js';
import { effect } from './effect.js';
import { store } from './store.js';
import { resource } from './resource.js';
import { batch, untrack, createRoot } from './batch.js';
import { onCleanup } from './context.js';
import { asyncComputed } from './async-computed.js';

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
  asyncComputed
};