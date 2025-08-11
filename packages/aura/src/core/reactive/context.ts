/**
 * Reactive Context Implementation
 * Manages dependency tracking and computation scheduling
 */

import type {
  Owner,
  Signal,
  Computation,
  TrackingContext,
  ReactiveContext
} from '../../types/reactive.js';

/**
 * Global state for reactive system
 */
let currentComputation: Computation | null = null;
let currentOwner: Owner | null = null;
let batchDepth = 0;
const batchedUpdates = new Set<Computation>();
const batchedSubscribers = new Set<() => void>();

/**
 * Computation implementation
 */
export class ComputationImpl implements Computation {
  private static nextId = 1;
  readonly id: number;
  public execute: () => void;
  private isStale = false;
  private isRunning = false;
  private dependencies = new Set<Signal<any>>();
  private owner: Owner | null;

  constructor(fn: () => void, owner: Owner | null = currentOwner) {
    this.id = ComputationImpl.nextId++;
    this.execute = fn;
    this.owner = owner;
    
    if (owner) {
      owner.children.add(this);
    }
  }

  run(): void {
    if (this.isRunning) {
      // Silently return to avoid console spam
return;
    }

    const prevComputation = currentComputation;
    const prevOwner = currentOwner;
    
    try {
      this.isRunning = true;
      currentComputation = this;
      currentOwner = this.owner;
      
      // Clear old dependencies
      this.clearDependencies();
      
// Run computation
      this.execute();
      
      this.isStale = false;
    } finally {
      this.isRunning = false;
      currentComputation = prevComputation;
      currentOwner = prevOwner;
    }
  }

  invalidate(): void {
    if (this.isStale) return;
    
    this.isStale = true;
    
    if (batchDepth > 0) {
      batchedUpdates.add(this);
} else {
this.run();
    }
  }

  dispose(): void {
    this.clearDependencies();
    
    if (this.owner) {
      this.owner.children.delete(this);
    }
  }

  private clearDependencies(): void {
    // Clear all dependencies
    // Signal cleanup is handled by Signal implementation
    this.dependencies.clear();
  }

  addDependency(signal: Signal<any>): void {
    this.dependencies.add(signal);
  }
}

/**
 * Owner implementation for cleanup management
 */
export class OwnerImpl implements Owner {
  readonly parent: Owner | null;
  readonly children = new Set<Computation>();
  readonly cleanups: (() => void)[] = [];

  constructor(parent: Owner | null = currentOwner) {
    this.parent = parent;
  }

  dispose(): void {
    // Dispose children first
    for (const child of this.children) {
      child.dispose();
    }
    this.children.clear();

    // Run cleanup handlers
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups.length = 0;
  }
}

/**
 * Tracking context implementation
 */
class TrackingContextImpl implements TrackingContext {
  get computation(): Computation | null {
    return currentComputation;
  }

  track<T>(signal: Signal<T>): void {
    if (currentComputation) {
      (currentComputation as ComputationImpl).addDependency(signal);
    }
  }

  trigger<T>(_signal: Signal<T>): void {
    // This will be called by signals to notify their subscribers
    // Implementation depends on Signal's subscriber management
  }

  untrack<T>(fn: () => T): T {
    const prev = currentComputation;
    currentComputation = null;
    try {
      return fn();
    } finally {
      currentComputation = prev;
    }
  }
}

/**
 * Reactive context implementation
 */
class ReactiveContextImpl implements ReactiveContext {
  readonly tracking = new TrackingContextImpl();

  get owner(): Owner | null {
    return currentOwner;
  }

  createRoot<T>(fn: (dispose: () => void) => T): T {
    const owner = new OwnerImpl(null);
    const prevOwner = currentOwner;
    
    try {
      currentOwner = owner;
      return fn(() => owner.dispose());
    } finally {
      currentOwner = prevOwner;
    }
  }

  runWithOwner<T>(owner: Owner | null, fn: () => T): T {
    const prevOwner = currentOwner;
    currentOwner = owner;
    try {
      return fn();
    } finally {
      currentOwner = prevOwner;
    }
  }

  batch(fn: () => void): void {
    if (batchDepth === 0) {
      batchDepth++;
      try {
        fn();
      } finally {
        batchDepth--;
        this.flushBatch();
      }
    } else {
      batchDepth++;
      try {
        fn();
      } finally {
        batchDepth--;
      }
    }
  }

  untrack<T>(fn: () => T): T {
    return this.tracking.untrack(fn);
  }

  private flushBatch(): void {
    if (batchDepth > 0) return;
    
    // First run all computations
    const updates = [...batchedUpdates];
    batchedUpdates.clear();
    
    // Sort by computation ID for consistent ordering
    updates.sort((a, b) => a.id - b.id);
    
    for (const computation of updates) {
      if ('run' in computation && typeof (computation as any).run === 'function') {
        (computation as any).run();
      } else {
        computation.execute();
      }
    }
    
    // Then run all subscriber notifications
    const subscribers = [...batchedSubscribers];
    batchedSubscribers.clear();
    
    for (const subscriber of subscribers) {
      subscriber();
    }
  }
}

/**
 * Global reactive context instance
 */
export const context = new ReactiveContextImpl();

/**
 * Helper to get current owner
 */
export function getOwner(): Owner | null {
  return currentOwner;
}

/**
 * Check if we're currently in a batch
 */
export function isInBatch(): boolean {
  return batchDepth > 0;
}

/**
 * Queue a subscriber notification for batch execution
 */
export function queueSubscriberNotification(fn: () => void): void {
  if (batchDepth > 0) {
    batchedSubscribers.add(fn);
  } else {
    fn();
  }
}

/**
 * Helper to run cleanup on current owner
 */
export function onCleanup(fn: () => void): void {
  if (currentOwner) {
    currentOwner.cleanups.push(fn);
  }
}