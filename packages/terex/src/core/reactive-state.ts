/**
 * Reactive state management with automatic change tracking
 * Uses Proxy to automatically detect state changes and trigger re-renders
 */

import type { Component } from './types.js';

// ============================================================================
// Types
// ============================================================================

export type StateChangeListener<T> = (newState: T, oldState: T, changedKeys: string[]) => void;

export interface ReactiveStateOptions<T> {
  readonly onChange?: StateChangeListener<T>;
  readonly deepWatch?: boolean;
  readonly ignoreKeys?: readonly string[];
}

// ============================================================================
// Reactive State Manager
// ============================================================================

/**
 * Creates a reactive state object that automatically tracks changes
 * and triggers callbacks when properties are modified
 */
export class ReactiveState<T extends Record<string, unknown>> {
  private readonly originalState: T;
  private readonly listeners: { id: number; callback: StateChangeListener<T> }[] = [];
  private readonly options: Required<ReactiveStateOptions<T>>;
  private readonly ignoredKeys: Set<string>;
  private batchMode = false;
  private batchChanges = new Set<string>();
  private nextListenerId = 0;
  
  // Proxy handler for intercepting property access
  private readonly proxyHandler: ProxyHandler<T> = {
    set: (target: T, property: string | symbol, value: unknown): boolean => {
      if (typeof property !== 'string') {
        return Reflect.set(target, property, value);
      }
      
      // Skip ignored keys
      if (this.ignoredKeys.has(property)) {
        return Reflect.set(target, property, value);
      }
      
      const oldValue = target[property];
      
      // Check if value actually changed
      if (this.isEqual(oldValue, value)) {
        return true;
      }
      
      // Set the new value
      const success = Reflect.set(target, property, value);
      
      if (success) {
        if (this.batchMode) {
          // In batch mode, just collect the changed keys
          this.batchChanges.add(property);
        } else {
          // Normal mode - notify immediately
          const oldState = this.deepClone(target);
          // Temporarily set the old value back to get the proper old state
          const currentValue = target[property];
          (target as Record<string, unknown>)[property] = oldValue;
          const realOldState = this.deepClone(target);
          (target as Record<string, unknown>)[property] = currentValue;
          
          const newState = this.deepClone(target);
          this.notifyChange(newState, realOldState, [property]);
        }
      }
      
      return success;
    },
    
    get: (target: T, property: string | symbol): unknown => {
      const value = Reflect.get(target, property);
      
      // If deep watching and value is an object, wrap it in a proxy too
      if (
        this.options.deepWatch &&
        typeof property === 'string' &&
        value !== null &&
        typeof value === 'object' &&
        !this.ignoredKeys.has(property)
      ) {
        return this.createNestedProxy(value as Record<string, unknown>, property);
      }
      
      return value;
    }
  };
  
  public readonly state: T;
  
  constructor(initialState: T, options: ReactiveStateOptions<T> = {}) {
    this.originalState = this.deepClone(initialState);
    this.options = {
      onChange: options.onChange ?? (() => {}),
      deepWatch: options.deepWatch ?? true,
      ignoreKeys: options.ignoreKeys ?? []
    };
    this.ignoredKeys = new Set(this.options.ignoreKeys);
    
    // Create the reactive proxy
    this.state = new Proxy(initialState, this.proxyHandler);
  }
  
  /**
   * Add a change listener
   */
  addListener(listener: StateChangeListener<T>): () => void {
    const id = this.nextListenerId++;
    this.listeners.push({ id, callback: listener });
    
    // Return unsubscribe function that removes the specific instance by ID
    return () => {
      const index = this.listeners.findIndex(l => l.id === id);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to state changes (alias for addListener)
   */
  subscribe(listener: StateChangeListener<T>): () => void {
    return this.addListener(listener);
  }
  
  /**
   * Remove a change listener
   */
  removeListener(listener: StateChangeListener<T>): void {
    const index = this.listeners.findIndex(l => l.callback === listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.listeners.length = 0;
  }

  /**
   * Get the number of listeners
   */
  listenerCount(): number {
    return this.listeners.length;
  }
  
  /**
   * Get a snapshot of the current state
   */
  getSnapshot(): T {
    return this.deepClone(this.state);
  }

  /**
   * Restore state from a snapshot
   */
  restoreSnapshot(snapshot: T): void {
    this.set(snapshot);
  }

  /**
   * Get the current state (alias for getSnapshot for API compatibility)
   */
  get(): T {
    return this.getSnapshot();
  }

  /**
   * Update the state using a function or partial object
   */
  update(updateFn: (currentState: T) => T | Partial<T>): void {
    const result = updateFn(this.getSnapshot());
    
    if (result && typeof result === 'object') {
      this.batch(state => {
        Object.assign(state, result);
      });
    }
  }

  /**
   * Set the entire state (replaces current state)
   */
  set(newState: T): void {
    this.batch(state => {
      // Clear existing properties
      for (const key of Object.keys(state)) {
        delete state[key];
      }
      // Set new properties
      Object.assign(state, newState);
    });
  }
  
  /**
   * Reset state to initial values
   */
  reset(): void {
    const oldState = this.deepClone(this.state);
    const changedKeys: string[] = [];
    
    // Reset all properties
    for (const key of Object.keys(this.state)) {
      if (!this.isEqual(this.state[key], this.originalState[key])) {
        changedKeys.push(key);
        (this.state as Record<string, unknown>)[key] = this.deepClone(this.originalState[key] as unknown);
      }
    }
    
    if (changedKeys.length > 0) {
      this.notifyChange(this.getSnapshot(), oldState, changedKeys);
    }
  }
  
  /**
   * Batch multiple state updates
   */
  batch(updateFn: (state: T) => void): void {
    if (this.batchMode) {
      // Already in batch mode, just apply updates
      updateFn(this.state);
      return;
    }
    
    const oldState = this.deepClone(this.state);
    
    // Enable batch mode
    this.batchMode = true;
    this.batchChanges.clear();
    
    try {
      // Apply updates
      updateFn(this.state);
    } finally {
      // Disable batch mode
      this.batchMode = false;
    }
    
    // Notify once with all changes
    if (this.batchChanges.size > 0) {
      const newState = this.getSnapshot();
      const changedKeys = Array.from(this.batchChanges);
      this.batchChanges.clear();
      this.notifyChange(newState, oldState, changedKeys);
    }
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Create a nested proxy for deep watching
   */
  private createNestedProxy(
    value: Record<string, unknown>, 
    parentKey: string
  ): Record<string, unknown> {
    return new Proxy(value, {
      set: (target, property, newValue): boolean => {
        if (typeof property !== 'string') {
          return Reflect.set(target, property, newValue);
        }
        
        const oldValue = target[property];
        
        if (this.isEqual(oldValue, newValue)) {
          return true;
        }
        
        const success = Reflect.set(target, property, newValue);
        
        if (success) {
          // Notify change with nested path
          const oldState = this.deepClone(this.state);
          const newState = this.getSnapshot();
          this.notifyChange(newState, oldState, [`${parentKey}.${property}`]);
        }
        
        return success;
      },
      
      get: (target, property): unknown => {
        const value = Reflect.get(target, property);
        
        // If deep watching and value is an object, wrap it in a proxy too
        if (
          this.options.deepWatch &&
          typeof property === 'string' &&
          value !== null &&
          typeof value === 'object' &&
          !this.ignoredKeys.has(property)
        ) {
          return this.createNestedProxy(value as Record<string, unknown>, `${parentKey}.${property}`);
        }
        
        return value;
      }
    });
  }
  
  /**
   * Notify all listeners of state change
   */
  private notifyChange(newState: T, oldState: T, changedKeys: string[]): void {
    // Call the primary onChange handler
    this.options.onChange(newState, oldState, changedKeys);
    
    // Call all registered listeners
    this.listeners.forEach(listenerObj => {
      try {
        listenerObj.callback(newState, oldState, changedKeys);
      } catch (error) {
        console.error('ReactiveState listener error:', error);
      }
    });
  }
  
  /**
   * Deep clone an object with circular reference protection
   */
  private deepClone<U>(obj: U, seen = new WeakMap()): U {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    // Check for circular reference
    if (seen.has(obj as object)) {
      return seen.get(obj as object) as U;
    }
    
    if (obj instanceof Date && typeof obj.getTime === 'function') {
      try {
        return new Date(obj.getTime()) as U;
      } catch {
        // If getTime fails, fall through to generic object handling
      }
    }
    
    if (obj instanceof Array) {
      const cloned = [] as unknown as U;
      seen.set(obj as object, cloned);
      (cloned as unknown[]).push(...(obj as unknown[]).map(item => this.deepClone(item, seen)));
      return cloned;
    }
    
    if (obj instanceof Object) {
      const cloned = {} as U;
      seen.set(obj as object, cloned);
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          cloned[key] = this.deepClone(obj[key], seen);
        }
      }
      return cloned;
    }
    
    return obj;
  }
  
  /**
   * Check if two values are equal (shallow comparison)
   */
  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }
    
    // Handle NaN
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
      return true;
    }
    
    // For objects, only check reference equality
    // Deep equality would be too expensive for reactive state
    return false;
  }
}

// ============================================================================
// Component Integration
// ============================================================================

/**
 * Create a reactive component state that automatically triggers re-renders
 */
export function createReactiveComponentState<T extends Record<string, unknown>>(
  component: Component<unknown>,
  initialState: T,
  options: ReactiveStateOptions<T> = {}
): ReactiveState<T> {
  const reactiveState = new ReactiveState(initialState, {
    ...options,
    onChange: (newState, oldState, changedKeys) => {
      // Call user-provided onChange first
      if (options.onChange) {
        options.onChange(newState, oldState, changedKeys);
      }
      
      // Mark component as dirty for re-rendering
      if (component && typeof (component as { invalidate?: () => void }).invalidate === 'function') {
        (component as unknown as { invalidate: () => void }).invalidate();
      }
      
      // Emit state change event
      if (component && 'events' in component && component.events && typeof (component.events as { emit?: (event: string, ...args: unknown[]) => void }).emit === 'function') {
        (component.events as { emit: (event: string, ...args: unknown[]) => void }).emit('stateChange', newState, oldState);
      }
    }
  });
  
  return reactiveState;
}

// ============================================================================
// Hook-like API for Reactive State
// ============================================================================

/**
 * Hook-like API for creating reactive state
 */
export function useState<T extends Record<string, unknown>>(
  initialState: T,
  options?: ReactiveStateOptions<T>
): [T, (updates: Partial<T>) => void, ReactiveState<T>] {
  const reactiveState = new ReactiveState(initialState, options);
  
  const setState = (updates: Partial<T>): void => {
    reactiveState.batch(state => {
      Object.assign(state, updates);
    });
  };
  
  return [reactiveState.state, setState, reactiveState];
}

/**
 * Create a computed value that automatically updates when dependencies change
 */
export function useComputed<T extends Record<string, unknown>, U>(
  deps: ReactiveState<T>,
  computeFn: (state: T) => U
): ReactiveState<{ value: U }> {
  const initialValue = computeFn(deps.state);
  const computed = new ReactiveState({ value: initialValue });
  
  // Update computed value when dependencies change
  deps.addListener((newState) => {
    const newValue = computeFn(newState);
    if (!Object.is(computed.state.value, newValue)) {
      computed.state.value = newValue;
    }
  });
  
  return computed;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create a reactive state from a plain object
 */
export function reactive<T extends Record<string, unknown>>(
  obj: T,
  options?: ReactiveStateOptions<T>
): ReactiveState<T> {
  return new ReactiveState(obj, options);
}

/**
 * Create a reactive state from a plain object (alias for reactive)
 */
export function createReactiveState<T extends Record<string, unknown>>(
  obj: T,
  options?: ReactiveStateOptions<T>
): ReactiveState<T> {
  return new ReactiveState(obj, options);
}

/**
 * Check if an object is a reactive state
 */
export function isReactive<T extends Record<string, unknown>>(obj: unknown): obj is ReactiveState<T> {
  return obj instanceof ReactiveState;
}