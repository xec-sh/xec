/**
 * Reactive System Type Definitions
 * Core types for Aura's fine-grained reactivity
 */

/**
 * Signal - Basic reactive primitive
 * Read-only interface for reactive values
 */
export interface Signal<T> {
  /** Get current value with dependency tracking */
  (): T;
  /** Get current value without dependency tracking */
  peek(): T;
  /** Subscribe to changes */
  subscribe(fn: (value: T) => void): () => void;
}

/**
 * WritableSignal - Mutable signal
 * Extends Signal with mutation capabilities
 */
export interface WritableSignal<T> extends Signal<T> {
  /** Set new value directly or via update function */
  set(value: T | ((prev: T) => T)): void;
  /** Update value via function */
  update(fn: (prev: T) => T): void;
  /** Mutate value in place (for objects/arrays) */
  mutate(fn: (value: T) => void): void;
}

/**
 * ComputedSignal - Derived reactive value
 */
export interface ComputedSignal<T> extends Signal<T> {
  readonly value: T;
}

/**
 * Store - Reactive state container
 */
export interface Store<T extends object> {
  get(): T;
  get<K extends keyof T>(key: K): T[K];
  getState(): T;
  set<K extends keyof T>(key: K, value: T[K]): void;
  update(updates: Partial<T>): void;
  subscribe(fn: (state: T) => void): () => void;
  transaction(fn: (state: T) => void): void;
}

/**
 * Resource - Async data management
 */
export interface Resource<T> {
  /** Get current value */
  (): T | undefined;
  /** Loading state */
  readonly loading: Signal<boolean>;
  /** Error state */
  readonly error: Signal<Error | undefined>;
  /** Refetch data */
  refetch(): Promise<void>;
  /** Optimistic update */
  mutate(value: T | ((prev: T | undefined) => T)): void;
}

/**
 * Disposable - Cleanup interface
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Computed options
 */
export interface ComputedOptions {
  /** Custom equality check */
  equals?: (a: any, b: any) => boolean;
  /** Debug name for DevTools */
  name?: string;
}

/**
 * Effect options
 */
export interface EffectOptions {
  /** Defer initial execution */
  defer?: boolean;
  /** Custom scheduler for batching */
  scheduler?: (fn: () => void) => void;
  /** Debug name for DevTools */
  name?: string;
}

/**
 * Store options
 */
export interface StoreOptions {
  /** Store name for DevTools */
  name?: string;
  /** Persistence configuration */
  persist?: boolean | PersistOptions;
  /** Middleware for store updates */
  middleware?: Middleware[];
}

/**
 * Persistence options for Store
 */
export interface PersistOptions {
  /** Storage key */
  key: string;
  /** Storage backend */
  storage?: Storage;
  /** Serialization */
  serialize?: (value: any) => string;
  /** Deserialization */
  deserialize?: (value: string) => any;
  /** Paths to persist */
  paths?: string[];
}

/**
 * Store middleware
 */
export interface Middleware {
  /** Called before state update */
  beforeUpdate?: (path: string[], oldValue: any, newValue: any) => any;
  /** Called after state update */
  afterUpdate?: (path: string[], oldValue: any, newValue: any) => void;
}

/**
 * Resource options
 */
export interface ResourceOptions<T> {
  /** Initial value */
  initialValue?: T;
  /** Retry configuration */
  retry?: number | RetryOptions;
  /** Cache time in ms */
  cacheTime?: number;
  /** Stale time in ms */
  staleTime?: number;
  /** On success callback */
  onSuccess?: (data: T) => void;
  /** On error callback */
  onError?: (error: Error) => void;
}

/**
 * Retry options for Resource
 */
export interface RetryOptions {
  /** Max retry attempts */
  count: number;
  /** Delay between retries */
  delay?: number | ((attempt: number) => number);
  /** Retry condition */
  when?: (error: Error) => boolean;
}

/**
 * Batch options
 */
export interface BatchOptions {
  /** Use sync flush instead of microtask */
  sync?: boolean;
  /** Custom scheduler */
  scheduler?: (fn: () => void) => void;
}

/**
 * Tracking context for dependency collection
 */
export interface TrackingContext {
  /** Currently executing computation */
  readonly computation: Computation | null;
  /** Track signal read */
  track<T>(signal: Signal<T>): void;
  /** Trigger signal update */
  trigger<T>(signal: Signal<T>): void;
  /** Run without tracking */
  untrack<T>(fn: () => T): T;
}

/**
 * Computation - Internal reactive node
 */
export interface Computation {
  /** Unique ID */
  readonly id: number;
  /** Execute computation */
  execute(): void;
  /** Mark as stale */
  invalidate(): void;
  /** Cleanup */
  dispose(): void;
}

/**
 * Owner - Computation ownership for cleanup
 */
export interface Owner {
  /** Parent owner */
  readonly parent: Owner | null;
  /** Child computations */
  readonly children: Set<Computation>;
  /** Cleanup handlers */
  readonly cleanups: (() => void)[];
  /** Dispose owner and children */
  dispose(): void;
}

/**
 * Global reactive context
 */
export interface ReactiveContext {
  /** Current tracking context */
  readonly tracking: TrackingContext;
  /** Current owner */
  readonly owner: Owner | null;
  /** Create new owner scope */
  createRoot<T>(fn: (dispose: () => void) => T): T;
  /** Run in owner context */
  runWithOwner<T>(owner: Owner | null, fn: () => T): T;
  /** Batch updates */
  batch(fn: () => void): void;
  /** Untrack execution */
  untrack<T>(fn: () => T): T;
}