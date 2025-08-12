/**
 * Signal - Basic reactive primitive
 * 
 * Implements fine-grained reactivity for optimal terminal rendering
 */

import type { Signal, WritableSignal } from '../../types/reactive.js';

export type { WritableSignal };
import { context, ComputationImpl, incrementUpdateVersion, queueSubscriberNotification } from './context.js';

/**
 * Default equality check
 */
function defaultEquals(a: any, b: any): boolean {
  return Object.is(a, b);
}

/**
 * Signal implementation
 */
class SignalImpl<T> {
  private value: T;
  private subscribers = new Set<() => void>();
  private computations = new Set<ComputationImpl>();
  private version = 0;
  private equals: (a: T, b: T) => boolean;

  constructor(
    initial: T,
    options?: { equals?: (a: T, b: T) => boolean }
  ) {
    this.value = initial;
    this.equals = options?.equals || defaultEquals;
  }

  // Getter - tracks dependencies  
  call(): T {
    // Track dependency if we're in a computation
    context.tracking.track(this as any);

    // Add current computation as subscriber
    const computation = context.tracking.computation;
    if (computation instanceof ComputationImpl) {
      this.computations.add(computation);
      computation.addDependency(this as any);
    }

    return this.value;
  }

  // Make the signal callable
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Signal(${JSON.stringify(this.value)})`;
  }

  // Peek at value without tracking
  peek(): T {
    return this.value;
  }

  // Subscribe to changes
  subscribe(fn: (value: T) => void): () => void {
    const wrapper = () => fn(this.value);
    this.subscribers.add(wrapper);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(wrapper);
    };
  }

  // Set value
  set(value: T | ((prev: T) => T)): void {
    const newValue = typeof value === 'function'
      ? (value as (prev: T) => T)(this.value)
      : value;

    if (!this.equals(this.value, newValue)) {
      this.value = newValue;
      this.version++;
      // Increment update version for new update cycle
      incrementUpdateVersion();
      this.notify();
    }
  }

  // Update with function
  update(fn: (prev: T) => T): void {
    this.set(fn(this.value));
  }

  // Mutate for objects/arrays
  mutate(fn: (value: T) => void): void {
    fn(this.value);
    this.version++;
    this.notify();
  }

  // Notify all subscribers
  private notify(): void {
    // First, collect all computations to invalidate
    const computationsToInvalidate = Array.from(this.computations);
    
    // For synchronous computations (computed values), we need to mark them all as stale first
    // before any of them start propagating invalidation to prevent diamond dependency issues
    const syncComputations = [];
    const asyncComputations = [];
    
    for (const computation of computationsToInvalidate) {
      if ((computation as any).synchronous) {
        syncComputations.push(computation);
      } else {
        asyncComputations.push(computation);
      }
    }
    
    // First pass: Mark all sync computations as stale without propagating
    for (const computation of syncComputations) {
      // For computed values, we need to mark them stale directly
      // This is a bit of a hack but necessary for diamond dependencies
      const computedInternal = (computation as any).__computed;
      if (computedInternal && typeof computedInternal.markStaleWithoutPropagation === 'function') {
        computedInternal.markStaleWithoutPropagation();
      }
    }
    
    // Second pass: Now propagate invalidation for all computations
    for (const computation of computationsToInvalidate) {
      computation.invalidate();
    }

    // Then notify regular subscribers
    for (const subscriber of this.subscribers) {
      queueSubscriberNotification(subscriber);
    }
  }

  // Remove computation from subscribers
  removeComputation(computation: ComputationImpl): void {
    this.computations.delete(computation);
  }

  // Get computations for debugging
  getComputations(): Set<ComputationImpl> {
    return this.computations;
  }
}

/**
 * Create a writable signal
 */
export function signal<T>(
  initial: T,
  options?: { equals?: (a: T, b: T) => boolean }
): WritableSignal<T> {
  const s = new SignalImpl(initial, options);

  // Create callable interface
  const callable = Object.assign(
    () => s.call(),
    {
      peek: () => s.peek(),
      subscribe: (fn: (value: T) => void) => s.subscribe(fn),
      set: (value: T | ((prev: T) => T)) => s.set(value),
      update: (fn: (prev: T) => T) => s.update(fn),
      mutate: (fn: (value: T) => void) => s.mutate(fn)
    }
  );

  // Store the internal signal instance for cleanup purposes
  (callable as any).__internal = s;

  // Add debug representation
  Object.defineProperty(callable, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => `Signal(${JSON.stringify(s.peek())})`
  });

  return callable as WritableSignal<T>;
}

/**
 * Create a read-only signal from a writable signal
 */
export function readonly<T>(signal: WritableSignal<T>): Signal<T> {
  const readonlySignal = Object.assign(
    () => signal(),
    {
      peek: () => signal.peek(),
      subscribe: (fn: (value: T) => void) => signal.subscribe(fn)
    }
  );

  return readonlySignal as Signal<T>;
}

// Export for internal use by other reactive primitives
export { SignalImpl };