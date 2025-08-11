/**
 * Effect - Side effects that run when dependencies change
 */

import { getOwner, ComputationImpl, OwnerImpl, context } from './context.js';

import type { Disposable, EffectOptions, Owner } from '../../types/reactive.js';

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
        this.effectOwner.dispose();
        this.effectOwner = null;
      }
      
      // Clean up previous effect return value
      if (this.cleanupFn) {
        this.cleanupFn();
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
    }, getOwner());
    
    // Run immediately unless deferred
    if (!options?.defer) {
      if (this.scheduler) {
        this.scheduler(() => this.computation.run());
      } else {
        this.computation.run();
      }
    }
  }

  dispose(): void {
    if (this.isDisposed) return;
    
    this.isDisposed = true;
    
    // Dispose effect owner (runs onCleanup handlers)
    if (this.effectOwner) {
      this.effectOwner.dispose();
      this.effectOwner = null;
    }
    
    // Run cleanup
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = undefined;
    }
    
    // Dispose computation
    this.computation.dispose();
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