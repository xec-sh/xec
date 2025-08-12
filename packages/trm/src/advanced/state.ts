/**
 * State Management Module
 * Signal-based reactive state system inspired by SolidJS
 */

import type { Disposable } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface Signal<T> {
  (): T;                                          // Getter
  readonly value: T;                             // Alternative getter
  readonly subscribe: (fn: (value: T) => void) => Disposable;
}

export interface WritableSignal<T> extends Signal<T> {
  (value: T): void;                              // Setter
  set(value: T): void;                          // Alternative setter
  update(fn: (prev: T) => T): void;
  mutate(fn: (value: T) => void): void;
}

export interface Computed<T> extends Signal<T> {
  readonly dependencies: Signal<any>[];
  invalidate(): void;
}

export interface Resource<T> {
  readonly data: Signal<T | undefined>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<Error | undefined>;
  refetch(): void;
}

export interface Store<T extends object> {
  readonly state: T;
  set<K extends keyof T>(key: K, value: T[K]): void;
  update<K extends keyof T>(key: K, fn: (prev: T[K]) => T[K]): void;
  subscribe(fn: (state: T) => void): Disposable;
  
  // Nested updates
  setIn(path: string[], value: any): void;
  updateIn(path: string[], fn: (prev: any) => any): void;
  
  // Transactions
  batch(fn: () => void): void;
  transaction(fn: (draft: T) => void): void;
}

// ============================================================================
// Global State
// ============================================================================

interface Context {
  tracking: boolean;
  dependencies: Set<SignalImpl<any>>;
  observer?: () => void;
  updates: Set<() => void>;
  batching: boolean;
}

const context: Context = {
  tracking: false,
  dependencies: new Set(),
  observer: undefined,
  updates: new Set(),
  batching: false
};

// Stack for nested contexts
const contextStack: Context[] = [];

function pushContext(ctx: Partial<Context>): void {
  contextStack.push({ ...context });
  Object.assign(context, ctx);
}

function popContext(): void {
  const prev = contextStack.pop();
  if (prev) {
    Object.assign(context, prev);
  }
}

// ============================================================================
// Signal Implementation
// ============================================================================

class SignalImpl<T> {
  private _value: T;
  private observers = new Set<() => void>();
  
  constructor(value: T) {
    this._value = value;
  }
  
  read(): T {
    if (context.tracking && context.observer) {
      context.dependencies.add(this);
    }
    return this._value;
  }
  
  get value(): T {
    return this.read();
  }
  
  write(value: T): void {
    this.set(value);
  }
  
  // Setter (method)
  set(value: T): void {
    if (!Object.is(this._value, value)) {
      this._value = value;
      this.notify();
    }
  }
  
  update(fn: (prev: T) => T): void {
    this.set(fn(this._value));
  }
  
  mutate(fn: (value: T) => void): void {
    fn(this._value);
    this.notify();
  }
  
  subscribe(fn: (value: T) => void): Disposable {
    const wrapper = () => fn(this._value);
    this.observers.add(wrapper);
    
    return {
      disposed: false,
      dispose: () => {
        this.observers.delete(wrapper);
        (this as any).disposed = true;
      }
    };
  }
  
  addObserver(fn: () => void): void {
    this.observers.add(fn);
  }
  
  removeObserver(fn: () => void): void {
    this.observers.delete(fn);
  }
  
  private notify(): void {
    if (context.batching) {
      this.observers.forEach(fn => context.updates.add(fn));
    } else {
      this.observers.forEach(fn => fn());
    }
  }
}

// ============================================================================
// Computed Implementation
// ============================================================================

class ComputedImpl<T> {
  private _value: T | undefined;
  private _dirty = true;
  private _fn: () => T;
  private _dependencies = new Set<SignalImpl<any>>();
  private observers = new Set<() => void>();
  
  constructor(fn: () => T) {
    this._fn = fn;
  }
  
  read(): T {
    if (context.tracking && context.observer) {
      context.dependencies.add(this as any);
    }
    
    if (this._dirty) {
      this.compute();
    }
    
    return this._value!;
  }
  
  get value(): T {
    return this.read();
  }
  
  get dependencies(): Signal<any>[] {
    const signals: Signal<any>[] = [];
    for (const dep of this._dependencies) {
      const signal = (() => dep.read()) as Signal<any>;
      Object.defineProperty(signal, 'value', {
        get: () => dep.value,
        configurable: true
      });
      Object.defineProperty(signal, 'subscribe', {
        value: dep.subscribe.bind(dep),
        writable: false,
        configurable: true
      });
      signals.push(signal);
    }
    return signals;
  }
  
  invalidate(): void {
    this._dirty = true;
    this.notify();
  }
  
  subscribe(fn: (value: T) => void): Disposable {
    const wrapper = () => fn(this.value);
    this.observers.add(wrapper);
    
    return {
      disposed: false,
      dispose: () => {
        this.observers.delete(wrapper);
        (this as any).disposed = true;
      }
    };
  }
  
  private compute(): void {
    // Clean up old dependencies
    this.cleanup();
    
    // Track new dependencies
    pushContext({
      tracking: true,
      dependencies: new Set(),
      observer: () => this.invalidate()
    });
    
    try {
      this._value = this._fn();
      this._dirty = false;
      
      // Subscribe to new dependencies
      context.dependencies.forEach(dep => {
        this._dependencies.add(dep);
        dep.addObserver(() => this.invalidate());
      });
    } finally {
      popContext();
    }
  }
  
  private cleanup(): void {
    this._dependencies.forEach(dep => {
      dep.removeObserver(() => this.invalidate());
    });
    this._dependencies.clear();
  }
  
  private notify(): void {
    if (context.batching) {
      this.observers.forEach(fn => context.updates.add(fn));
    } else {
      this.observers.forEach(fn => fn());
    }
  }
}

// ============================================================================
// Effect Implementation
// ============================================================================

class EffectImpl implements Disposable {
  private _fn: () => void | (() => void);
  private _cleanup?: () => void;
  private _dependencies = new Map<SignalImpl<any>, () => void>();
  private _running = false;
  private _scheduled = false;
  disposed = false;
  
  constructor(fn: () => void | (() => void)) {
    this._fn = fn;
    this.boundRun = this.scheduleRun.bind(this);
  }
  
  private boundRun: () => void;
  
  private scheduleRun(): void {
    if (this._scheduled || this.disposed) return;
    this._scheduled = true;
    // Use setTimeout(0) instead of queueMicrotask for better test compatibility
    setTimeout(() => {
      this._scheduled = false;
      if (!this.disposed) {
        this.run();
      }
    }, 0);
  }
  
  run(): void {
    // Prevent infinite recursion
    if (this._running || this.disposed) return;
    this._running = true;
    
    try {
      // Clean up previous effect
      if (this._cleanup) {
        this._cleanup();
        this._cleanup = undefined;
      }
    
      // Clean up old dependencies
      this._dependencies.forEach((observer, dep) => {
        dep.removeObserver(observer);
      });
      this._dependencies.clear();
      
      // Track new dependencies
      pushContext({
        tracking: true,
        dependencies: new Set(),
        observer: this.boundRun
      });
      
      try {
        const cleanupFn = this._fn();
        if (typeof cleanupFn === 'function') {
          this._cleanup = cleanupFn;
        }
        
        // Subscribe to new dependencies
        context.dependencies.forEach(dep => {
          const observer = this.boundRun;
          this._dependencies.set(dep, observer);
          dep.addObserver(observer);
        });
      } finally {
        popContext();
      }
    } finally {
      this._running = false;
    }
  }
  
  dispose(): void {
    if (this._cleanup) {
      this._cleanup();
    }
    this._dependencies.forEach((observer, dep) => {
      dep.removeObserver(observer);
    });
    this._dependencies.clear();
    this.disposed = true;
  }
}

// ============================================================================
// Resource Implementation
// ============================================================================

class ResourceImpl<T> implements Resource<T> {
  readonly data: Signal<T | undefined>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<Error | undefined>;
  private fetcher: () => Promise<T>;
  private setData: (value: T | undefined) => void;
  private setLoading: (value: boolean) => void;
  private setError: (value: Error | undefined) => void;
  
  constructor(fetcher: () => Promise<T>) {
    this.fetcher = fetcher;
    
    const [data, setData] = createSignal<T | undefined>(undefined);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal<Error | undefined>(undefined);
    
    this.data = data;
    this.loading = loading;
    this.error = error;
    this.setData = setData;
    this.setLoading = setLoading;
    this.setError = setError;
    
    this.fetch();
  }
  
  private async fetch(): Promise<void> {
    this.setLoading(true);
    this.setError(undefined);
    
    try {
      const result = await this.fetcher();
      this.setData(result);
    } catch (err) {
      this.setError(err as Error);
    } finally {
      this.setLoading(false);
    }
  }
  
  refetch(): void {
    this.fetch();
  }
}

// ============================================================================
// Store Implementation
// ============================================================================

class StoreImpl<T extends object> implements Store<T> {
  private _rawState: T;  // Store raw state without proxy
  private _stateSignal: WritableSignal<T>;
  private observers = new Set<(state: T) => void>();
  
  constructor(initial: T) {
    this._rawState = JSON.parse(JSON.stringify(initial));  // Deep clone initial state
    const [stateSignal, setStateSignal] = createSignal(this._rawState);
    this._stateSignal = stateSignal as WritableSignal<T>;
    (this._stateSignal as any).set = setStateSignal;
  }
  
  get state(): T {
    // Always return a fresh proxy to ensure nested properties work
    return this.createProxy();
  }
  
  set<K extends keyof T>(key: K, value: T[K]): void {
    this._rawState[key] = value;
    (this._stateSignal as any).set({ ...this._rawState });
    this.notifyObservers();
  }
  
  update<K extends keyof T>(key: K, fn: (prev: T[K]) => T[K]): void {
    this._rawState[key] = fn(this._rawState[key]);
    (this._stateSignal as any).set({ ...this._rawState });
    this.notifyObservers();
  }
  
  setIn(path: string[], value: any): void {
    if (path.length === 0) return;
    
    // Deep clone the raw state to ensure we don't mutate the original
    const newState = JSON.parse(JSON.stringify(this._rawState));
    
    let current: any = newState;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
      if (!current) return;
    }
    
    const lastKey = path[path.length - 1];
    if (current && typeof current === 'object') {
      current[lastKey] = value;
      
      // Update the entire raw state
      Object.assign(this._rawState, newState);
      
      // Update signal
      (this._stateSignal as any).set({ ...this._rawState });
      this.notifyObservers();
    }
  }
  
  updateIn(path: string[], fn: (prev: any) => any): void {
    if (path.length === 0) return;
    
    // Deep clone the raw state to ensure we don't mutate the original
    const newState = JSON.parse(JSON.stringify(this._rawState));
    
    let current: any = newState;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
      if (!current) return;
    }
    
    const lastKey = path[path.length - 1];
    if (current && typeof current === 'object') {
      current[lastKey] = fn(current[lastKey]);
      
      // Update the entire raw state
      Object.assign(this._rawState, newState);
      
      // Update signal
      (this._stateSignal as any).set({ ...this._rawState });
      this.notifyObservers();
    }
  }
  
  subscribe(fn: (state: T) => void): Disposable {
    this.observers.add(fn);
    
    return {
      disposed: false,
      dispose: () => {
        this.observers.delete(fn);
        (this as any).disposed = true;
      }
    };
  }
  
  batch(fn: () => void): void {
    batch(fn);
  }
  
  transaction(fn: (draft: T) => void): void {
    batch(() => {
      fn(this._rawState);
      this.notifyObservers();
    });
  }
  
  private createProxy(obj: any = this._rawState): any {
    return new Proxy(obj, {
      get: (target, prop, receiver) => {
        // Special handling for known symbols
        if (prop === Symbol.toStringTag || prop === Symbol.iterator) {
          return Reflect.get(target, prop, receiver);
        }
        
        const value = Reflect.get(target, prop, receiver);
        
        // Return nested proxy for objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return this.createProxy(value);
        }
        
        return value;
      },
      
      set: (target, prop, value, receiver) => {
        // Update the property
        Reflect.set(target, prop, value, receiver);
        // Trigger state update
        (this._stateSignal as any).set({ ...this._rawState });
        this.notifyObservers();
        return true;
      }
    });
  }
  
  
  private notifyObservers(): void {
    this.observers.forEach(fn => fn(this._rawState));
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a reactive signal
 */
export function createSignal<T>(initial: T): [Signal<T>, (value: T) => void] {
  const signal = new SignalImpl(initial);
  
  // Create getter function with properties
  const getter = (() => signal.read()) as Signal<T>;
  Object.defineProperty(getter, 'value', {
    get: () => signal.value,
    configurable: true
  });
  Object.defineProperty(getter, 'subscribe', {
    value: signal.subscribe.bind(signal),
    writable: false,
    configurable: true
  });
  
  const setter = (value: T) => signal.set(value);
  
  return [getter, setter];
}

/**
 * Create a computed value that updates when dependencies change
 */
export function createMemo<T>(fn: () => T): Signal<T> {
  const computed = new ComputedImpl(fn);
  
  // Create getter function with properties
  const getter = (() => computed.read()) as Signal<T>;
  Object.defineProperty(getter, 'value', {
    get: () => computed.value,
    configurable: true
  });
  Object.defineProperty(getter, 'subscribe', {
    value: computed.subscribe.bind(computed),
    writable: false,
    configurable: true
  });
  
  return getter;
}

/**
 * Create an effect that runs when dependencies change
 */
export function createEffect(fn: () => void | (() => void)): Disposable {
  const effect = new EffectImpl(fn);
  // Run initial effect immediately and synchronously
  effect.run();
  return effect;
}

/**
 * Create a resource that fetches async data
 */
export function createResource<T>(fetcher: () => Promise<T>): Resource<T> {
  return new ResourceImpl(fetcher);
}

/**
 * Create a reactive store for complex state
 */
export function createStore<T extends object>(initial: T): Store<T> {
  return new StoreImpl(initial);
}

/**
 * Run updates without tracking dependencies
 */
export function untrack<T>(fn: () => T): T {
  const prevTracking = context.tracking;
  const prevDeps = context.dependencies;
  const prevObserver = context.observer;
  
  context.tracking = false;
  context.dependencies = new Set();
  context.observer = undefined;
  
  try {
    return fn();
  } finally {
    context.tracking = prevTracking;
    context.dependencies = prevDeps;
    context.observer = prevObserver;
  }
}

/**
 * Batch multiple updates together
 */
export function batch<T>(fn: () => T): T {
  if (context.batching) {
    return fn();
  }
  
  const prevBatching = context.batching;
  context.batching = true;
  const prevUpdates = new Set(context.updates);
  context.updates.clear();
  
  try {
    const result = fn();
    
    // Execute all batched updates
    const updates = Array.from(context.updates);
    context.updates.clear();
    
    // Restore previous state before executing updates
    context.batching = prevBatching;
    context.updates = prevUpdates;
    
    // Execute updates after restoring state
    updates.forEach(update => update());
    
    return result;
  } finally {
    context.batching = false;
  }
}

// ============================================================================
// Lifecycle Hooks
// ============================================================================

const cleanupHandlers: (() => void)[] = [];
const mountHandlers: (() => void)[] = [];

/**
 * Register a cleanup handler
 */
export function onCleanup(fn: () => void): void {
  cleanupHandlers.push(fn);
}

/**
 * Register a mount handler
 */
export function onMount(fn: () => void): void {
  mountHandlers.push(fn);
  // Execute immediately if already mounted
  queueMicrotask(fn);
}

/**
 * Clean up all registered handlers
 */
export function cleanup(): void {
  cleanupHandlers.forEach(fn => fn());
  cleanupHandlers.length = 0;
  mountHandlers.length = 0;
}