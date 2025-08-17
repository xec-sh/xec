/**
 * Computed - Derived reactive values with automatic memoization
 */

import { context, onCleanup, UpdatePriority, ComputationImpl, ComputationType } from './context.js';
import type { DiamondResolvable } from './diamond-resolver.js';
import { calculateDependencyDepth } from './diamond-resolver.js';
import { globalCircularResolver, CircularDependencyError, type ResolvableComputation } from './circular-dependency-resolver.js';

import type { Signal, ComputedOptions } from './types.js';

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
 * Implements DiamondResolvable for proper diamond dependency handling
 * and ResolvableComputation for circular dependency resolution
 */
class ComputedImpl<T> implements DiamondResolvable, ResolvableComputation {
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
  private static idCounter = 0;
  
  // ResolvableComputation properties
  public readonly id: string;
  public readonly name?: string;
  public readonly isOptional?: boolean;
  public readonly defaultValue?: T;

  constructor(
    private fn: () => T,
    options?: ComputedOptionsExtended
  ) {
    this.id = `computed_${ComputedImpl.idCounter++}`;
    this.name = options?.name;
    this.isOptional = options?.isOptional;
    this.defaultValue = options?.defaultValue;
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

  // ResolvableComputation methods (for interface compliance)
  execute(): void {
    this.computeValue();
  }
  
  invalidate(): void {
    this.markStale();
  }
  
  // Get value with dependency tracking
  get(): T {
    // Try to enter computation context using circular resolver
    const canProceed = globalCircularResolver.enter(this as ResolvableComputation);
    
    if (!canProceed) {
      // Circular dependency detected and resolver decided to skip
      globalCircularResolver.exit(this as ResolvableComputation);
      
      // Return default value if available, otherwise cached value
      if (this.defaultValue !== undefined) {
        return this.defaultValue;
      }
      return this.cache !== undefined ? this.cache : (undefined as any);
    }
    
    // Legacy check for backward compatibility
    if (computingStack.has(this)) {
      globalCircularResolver.exit(this as ResolvableComputation);
      console.warn('Circular dependency detected in computed value (legacy check)');
      return this.cache !== undefined ? this.cache : (undefined as any);
    }
    
    try {
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
    } finally {
      // Always exit from circular resolver
      globalCircularResolver.exit(this as ResolvableComputation);
    }
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

  // ResolvableComputation skip method
  skip(): void {
    // Mark as not stale to avoid recomputation
    this.isStale = false;
    // Use default value if available
    if (this.defaultValue !== undefined) {
      this.cache = this.defaultValue;
    }
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
      // Always notify if value changed, or if this is the first computation
      const valueChanged = wasInitialized && oldValue !== undefined && this.cache !== undefined && !this.equals(oldValue, this.cache);
      const shouldNotify = valueChanged || !wasInitialized;
      
      if (shouldNotify && this.subscribers.size > 0) {
        this.notifySubscribers();
      }
    } catch (error) {
      // Check if it's a circular dependency error
      if (error instanceof CircularDependencyError) {
        console.error(`Circular dependency in computed '${this.name || 'anonymous'}':`, error.message);
        // Use default value if available
        if (this.defaultValue !== undefined) {
          this.cache = this.defaultValue;
          this.hasError = false;
          this.isStale = false;
        } else {
          // Store error to rethrow on access
          this.hasError = true;
          this.error = error;
          this.isStale = false;
        }
      } else {
        // Store other errors to rethrow on access
        this.hasError = true;
        this.error = error;
        this.isStale = false; // Don't keep retrying on error
      }
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
  
  // Get the dependency depth for topological sorting
  getDependencyDepth(): number {
    return calculateDependencyDepth(this);
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
 * Computed with enhanced options for circular dependency handling
 */
export interface ComputedOptionsExtended extends ComputedOptions {
  name?: string;
  isOptional?: boolean;
  defaultValue?: any;
}

/**
 * Create a computed value
 */
export function computed<T>(
  fn: () => T,
  options?: ComputedOptionsExtended
): Signal<T> {
  const c = new ComputedImpl(fn, options);
  
  // Create callable interface
  const callable = Object.assign(
    () => c.get(),
    {
      peek: () => c.peek(),
      subscribe: (callback: (value: T) => void) => c.subscribe(callback)
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