/**
 * Computed - Derived reactive values with automatic memoization
 */

import { context, onCleanup, ComputationImpl, UpdatePriority, ComputationType } from './context.js';

import type { Signal, ComputedOptions } from '../../types/reactive.js';

/**
 * Default equality check for computed values
 */
function defaultEquals(a: any, b: any): boolean {
  return Object.is(a, b);
}

/**
 * Track currently computing computeds for circular dependency detection
 */
const computingStack = new Set<ComputedImpl<any>>();

/**
 * Computed implementation using reactive context
 */
class ComputedImpl<T> {
  private cache: T | undefined;
  private isStale = true;
  private isInitialized = false;  // Track if value has been computed at least once
  private computation: ComputationImpl;
  private subscribers = new Set<(value: T) => void>();
  private computations = new Set<ComputationImpl>();  // Track dependent computations
  private equals: (a: T, b: T) => boolean;
  private isComputing = false;
  private hasError = false;
  private error: any;
  private isDisposed = false;

  constructor(
    private fn: () => T,
    options?: ComputedOptions
  ) {
    this.equals = options?.equals || defaultEquals;
    
    // Create computation that will recompute when dependencies change
    this.computation = new ComputationImpl(
      () => {
        // This will be called when dependencies change
        // We just mark as stale and let next access recompute
        this.markStale();
      },
      null,
      true, // synchronous
      UpdatePriority.SYNC, // Computeds run with SYNC priority
      ComputationType.COMPUTED // Mark as computed type
    );
    
    // Store reference to this computed in the computation for signal notification
    (this.computation as any).__computed = this;
    
    // Set error handler that re-throws for computed
    this.computation.setErrorHandler((error: Error) => {
      throw error;
    });
    
    // Don't initialize immediately - let first access trigger it
    // This avoids issues with accessing other computeds during construction
  }

  // Get value with dependency tracking
  get(): T {
    // Check for circular dependency
    if (computingStack.has(this)) {
      console.warn('Circular dependency detected in computed value');
      return this.cache !== undefined ? this.cache : (undefined as any);
    }
    
    // If disposed, just return cached value without tracking
    if (this.isDisposed || (this.computation as any).isDisposed) {
      // If never initialized, compute once without tracking
      if (!this.isInitialized && this.cache === undefined) {
        context.untrack(() => this.computeValue());
      }
      return this.cache!;
    }
    
    // Track this computed as a dependency if we're in another computation
    context.tracking.track(this as unknown as Signal<T>);
    
    // Add current computation as subscriber (same as Signal)
    const computation = context.tracking.computation;
    if (computation instanceof ComputationImpl) {
      this.computations.add(computation);
      computation.addDependency(this as any);
    }
    
    // If stale or never computed, recompute
    if ((this.isStale || !this.isInitialized) && !this.isComputing) {
      this.computeValue();
    }
    
    // If we had an error, throw it
    if (this.hasError) {
      throw this.error;
    }
    
    return this.cache!;
  }

  peek(): T {
    if (this.isStale && !this.isComputing) {
      // Use untrack to avoid creating dependencies
      context.untrack(() => this.computeValue());
    }
    
    if (this.hasError) {
      throw this.error;
    }
    
    return this.cache!;
  }

  subscribe(fn: (value: T) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  // Compute the value and track dependencies
  private computeValue(): void {
    if (this.isComputing) {
      return; // Prevent infinite recursion
    }

    this.isComputing = true;
    computingStack.add(this); // Add to computing stack for circular dependency detection
    const oldValue = this.cache;
    
    try {
      // Clear error state
      this.hasError = false;
      this.error = undefined;
      
      // Replace the computation's execute function temporarily
      const originalExecute = this.computation.execute;
      this.computation.execute = () => {
        this.cache = this.fn();
      };
      
      try {
        // Run the computation - this will track dependencies
        this.computation.run();
        this.isStale = false;
      } finally {
        // Restore original execute function
        this.computation.execute = originalExecute;
      }
      
      // Mark as initialized after first computation
      const wasInitialized = this.isInitialized;
      this.isInitialized = true;
      
      // Check if value changed and notify subscribers
      // Notify if value changed OR if this is the first computation with subscribers
      const shouldNotify = this.cache !== undefined && (
        (wasInitialized && oldValue !== undefined && !this.equals(oldValue, this.cache)) ||
        (!wasInitialized && this.subscribers.size > 0)
      );
      
      if (shouldNotify) {
        this.notifySubscribers();
      }
    } catch (error) {
      // Store error to rethrow on access
      this.hasError = true;
      this.error = error;
      this.isStale = false; // Don't keep retrying on error
    } finally {
      this.isComputing = false;
      computingStack.delete(this); // Remove from computing stack
    }
  }

  // Called when dependencies change
  private markStale(): void {
    // Don't mark stale if disposed
    if (this.isDisposed || (this.computation as any).isDisposed) {
      return;
    }
    
    // Mark as stale
    this.isStale = true;
    
    // Always invalidate dependent computations, even if already stale
    // This is crucial for diamond dependencies where multiple paths may lead to the same computed
    const computations = Array.from(this.computations);
    for (const computation of computations) {
      computation.invalidate();
    }
    
    // Note: We don't recompute immediately - wait for next access
    // This is important for efficiency and avoiding unnecessary computations
  }
  
  // Mark stale without propagating to dependents (used by signal notification for diamond deps)
  markStaleWithoutPropagation(): void {
    // Don't mark stale if disposed
    if (this.isDisposed || (this.computation as any).isDisposed) {
      return;
    }
    
    // Just mark as stale without propagating
    this.isStale = true;
  }

  private notifySubscribers(): void {
    const value = this.cache!;
    for (const subscriber of this.subscribers) {
      subscriber(value);
    }
  }

  // Remove computation from subscribers
  removeComputation(computation: ComputationImpl): void {
    this.computations.delete(computation);
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.computation) {
      this.computation.dispose();
    }
    this.subscribers.clear();
    this.computations.clear();
  }
}

/**
 * Create a computed value
 */
export function computed<T>(
  fn: () => T,
  options?: ComputedOptions
): Signal<T> {
  const c = new ComputedImpl(fn, options);
  
  // Create callable interface
  const callable = Object.assign(
    () => c.get(),
    {
      peek: () => c.peek(),
      subscribe: (fn: (value: T) => void) => c.subscribe(fn)
    }
  );
  
  // Store the internal computed instance for cleanup
  (callable as any).__internal = c;
  
  // Add debug representation
  Object.defineProperty(callable, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => `Computed(${JSON.stringify(c.peek())})`
  });
  
  // Register for cleanup with current owner
  const owner = context.owner;
  if (owner) {
    onCleanup(() => c.dispose());
  }
  
  return callable as Signal<T>;
}