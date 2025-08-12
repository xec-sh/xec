/**
 * Effect - Side effects that run when dependencies change
 */

import { context, getOwner, OwnerImpl, ComputationImpl, UpdatePriority, ComputationType } from './context.js';

import type { Owner, Disposable, EffectOptions } from '../../types/reactive.js';

/**
 * Effect implementation using reactive context
 */
class EffectImpl implements Disposable {
  private computation: ComputationImpl;
  private effectOwner: Owner | null = null;
  private cleanupFn?: () => void;
  private isDisposed = false;
  private scheduler: ((fn: () => void) => void) | undefined;

  constructor(
    private fn: () => void | (() => void),
    options?: EffectOptions
  ) {
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
      
      // Run the effect function with its own owner
      try {
        const cleanup = context.runWithOwner(this.effectOwner, () => this.fn());
        if (typeof cleanup === 'function') {
          this.cleanupFn = cleanup;
        }
      } catch (error) {
        console.error('Error in effect:', error);
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
 */
export function effect(
  fn: () => void | (() => void),
  options?: EffectOptions
): Disposable {
  const effectImpl = new EffectImpl(fn, options);
  
  // Register the effect for cleanup with the current owner
  const owner = getOwner();
  if (owner) {
    owner.cleanups.push(() => effectImpl.dispose());
  }
  
  return effectImpl;
}