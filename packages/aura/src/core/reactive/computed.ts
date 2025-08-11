/**
 * Computed - Derived reactive values with automatic memoization
 */

import { context, onCleanup, ComputationImpl } from './context.js';

import type { Signal, ComputedOptions } from '../../types/reactive.js';

/**
 * Default equality check for computed values
 */
function defaultEquals(a: any, b: any): boolean {
  return Object.is(a, b);
}

/**
 * Computed implementation using reactive context
 */
class ComputedImpl<T> {
  private cache: T | undefined;
  private isStale = true;
  private computation: ComputationImpl | null = null;
  private subscribers = new Set<(value: T) => void>();
  private computations = new Set<ComputationImpl>();  // Track dependent computations
  private equals: (a: T, b: T) => boolean;
  private isComputing = false;

  constructor(
    private fn: () => T,
    options?: ComputedOptions
  ) {
    this.equals = options?.equals || defaultEquals;
    // Create computation that will recompute when dependencies change
    this.computation = new ComputationImpl(() => {
      // When our dependencies change, mark us as stale
      // and invalidate all computations that depend on us
      this.invalidate();
    });
    
    // Do initial computation to set up dependencies
    // This ensures nested computeds work correctly
    this.initializeValue();
  }
  
  // Method to invalidate this computed and propagate to dependents
  private invalidate(): void {
    if (this.isStale) return; // Already stale, no need to propagate
    
    // Store old value before marking stale
    const oldValue = this.cache;
    
    // Mark as stale
    this.isStale = true;
    
    // Recompute immediately to get new value
    const newValue = context.untrack(() => this.fn());
    
    // Only update and propagate if value changed
    if (!this.equals(oldValue!, newValue)) {
      this.cache = newValue;
      this.isStale = false;
      
      // Invalidate all dependent computations
      for (const computation of this.computations) {
computation.invalidate();
      }
      
      // Notify regular subscribers
      for (const subscriber of this.subscribers) {
        subscriber(newValue);
      }
    } else {
      // Value didn't change, just mark as not stale
      this.isStale = false;
    }
  }

  // Get value with dependency tracking
  get(): T {
    // Track this computed as a dependency if we're in another computation
    context.tracking.track(this as unknown as Signal<T>);
    
    // Add current computation as subscriber (same as Signal)
    const computation = context.tracking.computation;
    if (computation instanceof ComputationImpl) {
      this.computations.add(computation);
      computation.addDependency(this as any);
    }
    
    if (this.isStale && !this.isComputing) {
      // Recompute the value
      this.recompute();
    }
    
    return this.cache!;
  }

  peek(): T {
    if (this.isStale && !this.isComputing) {
      // Use untrack to avoid creating dependencies
      context.untrack(() => this.recompute());
    }
    return this.cache!;
  }

  subscribe(fn: (value: T) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  // Initial computation to set up dependencies
  private initializeValue(): void {
    if (this.isComputing) {
      return;
    }

    this.isComputing = true;
    
    try {
      // Store the original execute function
      const originalExecute = this.computation?.execute;
      
      if (this.computation) {
        // Temporarily set execute to compute the value
        this.computation.execute = () => {
          try {
            this.cache = this.fn();
            this.isStale = false;
          } catch (error) {
            // If initialization fails, mark as stale so it can retry later
            this.isStale = true;
            throw error;
          }
        };
        
        // Run with dependency tracking
        try {
          this.computation.run();
        } catch (error) {
          // Initialization error - will retry on next access
          this.isStale = true;
        }
        
        // Restore original execute function
        if (originalExecute) {
          this.computation.execute = originalExecute;
        }
      } else {
        // Fallback if no computation
        try {
          this.cache = this.fn();
          this.isStale = false;
        } catch (error) {
          this.isStale = true;
        }
      }
    } finally {
      this.isComputing = false;
    }
  }
  
  private recompute(): void {
    // Prevent infinite loops
    if (this.isComputing) {
      return; // Silently return instead of warning
    }

    this.isComputing = true;
    
    try {
      // Store the old value to check if it changed
      const oldValue = this.cache;
      
      // Compute with proper dependency tracking
      // We need to run this through the computation to track dependencies
      if (this.computation) {
        let newValue: T | undefined;
        let error: Error | undefined;
        
        // Temporarily replace execute function
        const originalExecute = this.computation.execute;
        this.computation.execute = () => {
          try {
            newValue = this.fn();
          } catch (e) {
            error = e as Error;
            throw e;
          }
        };
        
        // Run computation (might throw)
        try {
          this.computation.run();
        } catch (e) {
          // Restore execute function before re-throwing
          this.computation.execute = originalExecute;
          throw e;
        }
        
        // Restore execute function
        this.computation.execute = originalExecute;
        
        if (error) {
          throw error;
        }
        
        const changed = oldValue !== undefined && !this.equals(oldValue, newValue!);
        this.cache = newValue!;
        this.isStale = false;
        
        // After computation is complete, notify if value changed
        if (changed) {
          // Notify dependent computations
          for (const comp of this.computations) {
            comp.invalidate();
          }
          // Notify regular subscribers
          const value = this.cache!;
          for (const subscriber of this.subscribers) {
            subscriber(value);
          }
        }
      } else {
        // Fallback without computation
        const newValue = this.fn();
        const changed = oldValue !== undefined && !this.equals(oldValue, newValue);
        this.cache = newValue;
        this.isStale = false;
        
        if (changed) {
          for (const comp of this.computations) {
            comp.invalidate();
          }
          for (const subscriber of this.subscribers) {
            subscriber(newValue);
          }
        }
      }
    } finally {
      this.isComputing = false;
    }
  }

  dispose(): void {
    if (this.computation) {
      this.computation.dispose();
      this.computation = null;
    }
    this.subscribers.clear();
  }
}

/**
 * Create a computed signal
 */
export function computed<T>(
  fn: () => T,
  options?: ComputedOptions
): Signal<T> {
  const c = new ComputedImpl(fn, options);
  
  // Create callable interface that properly forwards all methods
  const callable = function() {
    return c.get();
  } as Signal<T>;
  
  // Copy all methods
  callable.peek = () => c.peek();
  callable.subscribe = (fn: (value: T) => void) => c.subscribe(fn);
  
  // Store reference to implementation for internal use
  (callable as any).__impl = c;
  
  // Add debug representation
  Object.defineProperty(callable, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => `Computed(${JSON.stringify(c.peek())})`
  });
  
  // Register cleanup
  onCleanup(() => c.dispose());
  
  return callable;
}