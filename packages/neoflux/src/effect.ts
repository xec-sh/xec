/**
 * Effect - Side effects that run when dependencies change
 * With integrated circular dependency protection
 */

import { context, getOwner, OwnerImpl, UpdatePriority, ComputationImpl, ComputationType } from './context.js';
import { globalCircularResolver, CircularDependencyError, type ResolvableComputation } from './circular-dependency-resolver.js';

import type { Owner, Disposable, EffectOptions } from './types.js';

/**
 * Extended effect options for circular dependency handling
 */
export interface EffectOptionsExtended extends EffectOptions {
  /** Whether this effect is optional and can be skipped in cycles */
  isOptional?: boolean;
  /** Default behavior when circular dependency is detected */
  onCircularDependency?: 'skip' | 'warn' | 'error';
}

/**
 * Effect implementation using reactive context
 * With circular dependency detection and recovery
 */
class EffectImpl implements Disposable, ResolvableComputation {
  private computation: ComputationImpl;
  private effectOwner: Owner | null = null;
  private cleanupFn?: () => void;
  private isDisposed = false;
  private scheduler: ((fn: () => void) => void) | undefined;
  private static idCounter = 0;
  
  // ResolvableComputation properties
  public readonly id: string;
  public readonly name?: string;
  public readonly isOptional?: boolean;
  public readonly defaultValue = undefined; // Effects don't have default values
  private onCircularDependency: 'skip' | 'warn' | 'error';

  constructor(
    private fn: () => void | (() => void),
    options?: EffectOptionsExtended
  ) {
    this.id = `effect_${EffectImpl.idCounter++}`;
    this.name = options?.name;
    this.isOptional = options?.isOptional ?? false;
    this.onCircularDependency = options?.onCircularDependency ?? 'warn';
    this.scheduler = options?.scheduler;
    
    // Create computation that will track dependencies
    this.computation = new ComputationImpl(() => {
      // Dispose previous effect owner (runs onCleanup handlers)
      if (this.effectOwner) {
        try {
          this.effectOwner.dispose();
        } catch (error) {
          console.error('Error in effect owner disposal:', error);
        }
        this.effectOwner = null;
      }
      
      // Clean up previous effect return value with error handling
      if (this.cleanupFn) {
        try {
          this.cleanupFn();
        } catch (error) {
          console.error('Error in effect cleanup function:', error);
        }
        this.cleanupFn = undefined;
      }
      
      // Create new owner for this effect run
      this.effectOwner = new OwnerImpl(getOwner());
      
      // Run the effect function with its own owner and circular dependency protection
      try {
        // Enter circular dependency tracking
        const canProceed = globalCircularResolver.enter(this as ResolvableComputation);
        
        if (!canProceed) {
          // Circular dependency detected and resolver decided to skip
          globalCircularResolver.exit(this as ResolvableComputation);
          
          if (this.onCircularDependency === 'error') {
            throw new CircularDependencyError([this]);
          } else if (this.onCircularDependency === 'warn') {
            console.warn(`Circular dependency detected in effect '${this.name || this.id}'`);
          }
          // Skip execution if circular dependency detected
          return;
        }
        
        try {
          const cleanup = context.runWithOwner(this.effectOwner, () => this.fn());
          if (typeof cleanup === 'function') {
            this.cleanupFn = cleanup;
          }
        } finally {
          // Exit circular dependency tracking
          globalCircularResolver.exit(this as ResolvableComputation);
        }
      } catch (error) {
        if (error instanceof CircularDependencyError) {
          if (this.onCircularDependency === 'error') {
            throw error;
          } else if (this.onCircularDependency === 'warn') {
            console.warn(`Circular dependency in effect '${this.name || this.id}':`, error.message);
          }
          // Skip execution on circular dependency
        } else {
          console.error('Error in effect:', error);
        }
      }
    }, getOwner(), false, UpdatePriority.NORMAL, ComputationType.EFFECT);
    
    // Set the scheduler on the computation if provided
    if (this.scheduler) {
      (this.computation as any).scheduler = this.scheduler;
    }
    
    // Run immediately unless deferred
    if (!options?.defer) {
      if (this.scheduler) {
        this.scheduler(() => this.computation.run());
      } else {
        this.computation.run();
      }
    } else if (options?.defer && this.scheduler) {
      // If deferred with a scheduler, schedule the initial run
      this.scheduler(() => this.computation.run());
    }
    // If deferred without scheduler, don't run at all initially
  }

  // ResolvableComputation methods
  execute(): void {
    this.computation.run();
  }
  
  invalidate(): void {
    this.computation.invalidate();
  }
  
  skip(): void {
    // Effects can skip by not running
    if (this.isOptional) {
      console.debug(`Skipping optional effect '${this.name || this.id}' to break circular dependency`);
    }
  }
  
  dispose(): void {
    if (this.isDisposed) return;
    
    this.isDisposed = true;
    
    // Dispose effect owner (runs onCleanup handlers)
    if (this.effectOwner) {
      try {
        this.effectOwner.dispose();
      } catch (error) {
        console.error('Error in effect owner disposal:', error);
      }
      this.effectOwner = null;
    }
    
    // Run cleanup with error handling
    if (this.cleanupFn) {
      try {
        this.cleanupFn();
      } catch (error) {
        console.error('Error in effect cleanup function:', error);
      }
      this.cleanupFn = undefined;
    }
    
    // Dispose computation
    try {
      this.computation.dispose();
    } catch (error) {
      console.error('Error disposing computation:', error);
    }
  }
}

/**
 * Create an effect that runs when dependencies change
 * With circular dependency protection
 */
export function effect(
  fn: () => void | (() => void),
  options?: EffectOptionsExtended
): Disposable {
  const effectImpl = new EffectImpl(fn, options);
  
  // Register the effect for cleanup with the current owner
  const owner = getOwner();
  if (owner) {
    owner.cleanups.push(() => effectImpl.dispose());
  }
  
  return effectImpl;
}