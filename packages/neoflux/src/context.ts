/**
 * Reactive Context Implementation with Priority Scheduling and Topological Sorting
 * Manages dependency tracking and computation scheduling
 */

import { DependencyGraph } from './dependency-graph.js';

import type {
  Owner,
  Signal,
  Computation,
  TrackingContext,
  ReactiveContext
} from './types.js';

/**
 * Update priority levels for deterministic execution order
 */
export enum UpdatePriority {
  SYNC = 0,      // Synchronous updates (computed)
  HIGH = 1,      // Important effects (UI updates)
  NORMAL = 2,    // Normal effects
  LOW = 3,       // Background tasks
  IDLE = 4       // Can be deferred
}

/**
 * Computation type for categorization
 */
export enum ComputationType {
  SIGNAL = 'signal',
  COMPUTED = 'computed',
  EFFECT = 'effect',
  RESOURCE = 'resource'
}

/**
 * Global state for reactive system
 */
let currentComputation: Computation | null = null;
let currentOwner: Owner | null = null;
let batchDepth = 0;
const batchedUpdates = new Set<Computation>();
const batchedSubscribers = new Set<() => void>();
let inSyncContext = false;
let executionPhase: 'idle' | 'signals' | 'computed' | 'effects' = 'idle';
let effectExecutionDepth = 0;
const MAX_EFFECT_DEPTH = 100; // Prevent infinite loops

// Priority queues for scheduled updates
const priorityQueues = new Map<UpdatePriority, Set<Computation>>();
for (let i = 0; i <= UpdatePriority.IDLE; i++) {
  priorityQueues.set(i, new Set());
}

// Global dependency graph for topological sorting
const globalDependencyGraph = new DependencyGraph();

// Update deduplication
const pendingUpdates = new Map<Computation, { 
  priority: UpdatePriority; 
  timestamp: number;
  version: number;
}>();

// let scheduledFlush: Promise<void> | null = null;
let updateVersion = 0;

export function incrementUpdateVersion(): void {
  updateVersion++;
}

// Object pool for performance
class ComputationPool {
  private pool: ComputationImpl[] = [];
  private maxSize = 100;

  get(): ComputationImpl | null {
    return this.pool.pop() || null;
  }

  release(comp: ComputationImpl): void {
    if (this.pool.length < this.maxSize) {
      comp.reset();
      this.pool.push(comp);
    }
  }
}

const computationPool = new ComputationPool();

/**
 * Enhanced Computation implementation with priorities and better error handling
 */
export class ComputationImpl implements Computation {
  private static nextId = 1;
  readonly id: number;
  public execute: () => void;
  private isStale = false;
  private isRunning = false;
  private isDisposed = false;
  private dependencies = new Set<Signal<any>>();
  
  // Getter for dependencies (needed for sorting computeds)
  getDependencies(): Set<Signal<any>> {
    return this.dependencies;
  }
  private owner: Owner | null;
  public synchronous: boolean = false;
  public priority: UpdatePriority = UpdatePriority.NORMAL;
  public type: ComputationType = ComputationType.EFFECT;
  private lastUpdateVersion = -1;
  private errorHandler?: (error: Error) => void;

  constructor(
    fn: () => void, 
    owner: Owner | null = currentOwner, 
    synchronous: boolean = false,
    priority: UpdatePriority = UpdatePriority.NORMAL,
    type: ComputationType = ComputationType.EFFECT
  ) {
    this.id = ComputationImpl.nextId++;
    this.execute = fn;
    this.owner = owner;
    this.synchronous = synchronous;
    this.priority = priority;
    this.type = type;

    if (owner) {
      owner.children.add(this);
    }

    globalDependencyGraph.addNode(this);
  }

  run(): void {
    if (this.isRunning || this.isDisposed) {
      return;
    }

    // Prevent double runs of effects in the same tick
    if (this.type === ComputationType.EFFECT) {
      // Track that this effect has run in this tick
      if (this.lastUpdateVersion === updateVersion && updateVersion > 0) {
        this.isStale = false; // Clear stale flag even if we don't run
        return; // Already ran in this update cycle
      }
      this.lastUpdateVersion = updateVersion;
    }

    const prevComputation = currentComputation;
    const prevOwner = currentOwner;

    try {
      this.isRunning = true;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      currentComputation = this;
      currentOwner = this.owner;

      // Clear old dependencies
      this.clearDependencies();

      // Run computation with error handling
      try {
        this.execute();
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler(error as Error);
        } else {
          console.error(`Error in ${this.type} computation:`, error);
        }
      }

      this.isStale = false;
    } finally {
      this.isRunning = false;
      currentComputation = prevComputation;
      currentOwner = prevOwner;
    }
  }

  invalidate(): void {
    if (this.isDisposed) return;

    if (this.synchronous) {
      // For synchronous computations (computeds), mark as stale
      // If we're in a batch, add to batch for proper ordering
      if (batchDepth > 0) {
        // Mark stale and add to batch
        this.execute(); // This calls markStale on the computed
        batchedUpdates.add(this);
      } else {
        // Not in batch, execute immediately
        this.execute();
      }
      return;
    }
    
    // For async computations (effects), mark as stale
    // When not in a batch, run immediately to capture all updates
    if (batchDepth === 0) {
      // Check if this computation has a custom scheduler
      const scheduler = (this as any).scheduler;
      if (scheduler) {
        scheduler(() => {
          if (!this.isDisposed) {
            this.run();
          }
        });
      } else if (effectExecutionDepth < MAX_EFFECT_DEPTH) {
        // Run immediately to ensure each signal update triggers the effect
        // But limit depth to prevent infinite loops
        effectExecutionDepth++;
        try {
          this.run();
        } finally {
          effectExecutionDepth--;
        }
      } else {
        // Max depth reached, schedule asynchronously to break the loop
        if (!this.isStale) {
          this.isStale = true;
          Promise.resolve().then(() => {
            if (!this.isDisposed && this.isStale) {
              this.run();
            }
          });
        }
      }
    } else {
      // In a batch, mark as stale and add to batch
      if (this.isStale) {
        return;
      }
      this.isStale = true;
      batchedUpdates.add(this);
    }
  }

  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;
    this.clearDependencies();

    globalDependencyGraph.removeNode(this);

    if (this.owner) {
      this.owner.children.delete(this);
    }

    // Return to pool if possible
    computationPool.release(this);
  }

  private clearDependencies(): void {
    // Unregister from dependency graph - disabled for debugging
    for (const signal of this.dependencies) {
      globalDependencyGraph.removeDependency(this, signal);
      
      // Unregister from signal - signal is already a SignalImpl instance
      if (signal && typeof (signal as any).removeComputation === 'function') {
        (signal as any).removeComputation(this);
      }
    }
    this.dependencies.clear();
  }

  addDependency(signal: Signal<any>): void {
    this.dependencies.add(signal);
    globalDependencyGraph.addDependency(this, signal);
  }

  setErrorHandler(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  reset(): void {
    this.isStale = false;
    this.isRunning = false;
    this.isDisposed = false;
    this.dependencies.clear();
    this.owner = null;
    this.lastUpdateVersion = -1;
    this.errorHandler = undefined;
  }
}

/**
 * Enhanced Owner implementation with better error handling
 */
export class OwnerImpl implements Owner {
  readonly parent: Owner | null;
  readonly children = new Set<Computation>();
  readonly cleanups: (() => void)[] = [];
  private errorBoundary?: (error: Error) => void;

  constructor(parent: Owner | null = currentOwner) {
    this.parent = parent;
  }

  dispose(): void {
    // Dispose children first (in reverse order for proper cleanup)
    const childrenArray = Array.from(this.children);
    for (let i = childrenArray.length - 1; i >= 0; i--) {
      try {
        childrenArray[i]?.dispose();
      } catch (error) {
        this.handleError(error as Error, 'disposing child');
      }
    }
    this.children.clear();

    // Run cleanup handlers (in reverse order)
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        const cleanup = this.cleanups[i];
        if (cleanup) cleanup();
      } catch (error) {
        this.handleError(error as Error, 'cleanup handler');
      }
    }
    this.cleanups.length = 0;
  }

  setErrorBoundary(handler: (error: Error) => void): void {
    this.errorBoundary = handler;
  }

  private handleError(error: Error, context: string): void {
    if (this.errorBoundary) {
      this.errorBoundary(error);
    } else {
      console.error(`Error in ${context}:`, error);
    }
  }
}

// /**
//  * Schedule update based on priority
//  */
// function scheduleUpdate(computation: Computation): void {
//   const impl = computation as ComputationImpl;
//   const queue = priorityQueues.get(impl.priority);
//   if (queue) {
//     queue.add(computation);
//   }

//   if (!scheduledFlush) {
//     scheduledFlush = Promise.resolve().then(() => flushUpdates());
//   }
// }

// /**
//  * Flush all pending updates in priority order with topological sorting
//  */
// function flushUpdates(): void {
//   // scheduledFlush = null;
//   updateVersion++;
//
//   // Phase 1: Signals (already updated)
//   executionPhase = 'signals';
//
//   // Phase 2: Computed values in topological order
//   executionPhase = 'computed';
//   const computeds: Computation[] = [];
//   
//   for (const [, queue] of priorityQueues) {
//     for (const comp of queue) {
//       if ((comp as ComputationImpl).type === ComputationType.COMPUTED) {
//         computeds.push(comp);
//         queue.delete(comp);
//       }
//     }
//   }
//
//   if (computeds.length > 0) {
//     // Run computeds directly without topological sort for now
//     for (const comp of computeds) {
//       (comp as ComputationImpl).run();
//     }
//   }
//
//   // Phase 3: Effects by priority
//   executionPhase = 'effects';
//   
//   for (let priority = UpdatePriority.SYNC; priority <= UpdatePriority.IDLE; priority++) {
//     const queue = priorityQueues.get(priority);
//     if (queue && queue.size > 0) {
//       const effects = Array.from(queue);
//       queue.clear();
//       
//       for (const effect of effects) {
//         if ((effect as ComputationImpl).type === ComputationType.EFFECT) {
//           (effect as ComputationImpl).run();
//         }
//       }
//     }
//   }
//
//   // Clear pending updates
//   pendingUpdates.clear();
//   executionPhase = 'idle';
// }

/**
 * Enhanced Tracking context implementation
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
    // Handled by signal implementation
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
 * Enhanced Reactive context implementation
 */
class ReactiveContextImpl implements ReactiveContext {
  readonly tracking = new TrackingContextImpl();

  get owner(): Owner | null {
    return currentOwner;
  }

  createRoot<T>(fn: (dispose: () => void) => T): T {
    const owner = new OwnerImpl(null);
    const prevOwner = currentOwner;
    const prevSyncContext = inSyncContext;

    try {
      currentOwner = owner;
      inSyncContext = true;
      const result = fn(() => owner.dispose());
      return result;
    } finally {
      inSyncContext = prevSyncContext;
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
      const prevSyncContext = inSyncContext;
      inSyncContext = false;
      batchDepth++;
      
      try {
        fn();
      } finally {
        batchDepth--;
        inSyncContext = prevSyncContext;
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

    // Collect all batched updates
    const updates = Array.from(batchedUpdates);
    batchedUpdates.clear();

    // Sort by type and priority for deterministic execution
    const signals: Computation[] = [];
    const computeds: Computation[] = [];
    const effects: Computation[] = [];

    for (const update of updates) {
      const impl = update as ComputationImpl;
      switch (impl.type) {
        case ComputationType.SIGNAL:
          signals.push(update);
          break;
        case ComputationType.COMPUTED:
          computeds.push(update);
          break;
        case ComputationType.EFFECT:
        case ComputationType.RESOURCE:
          effects.push(update);
          break;
        
        default:
          // Unknown computation type, treat as effect
          effects.push(update);
          break;
      }
    }

    // Execute in phases
    executionPhase = 'signals';
    for (const signal of signals) {
      (signal as ComputationImpl).run();
    }

    executionPhase = 'computed';
    if (computeds.length > 0) {
      // Sort computeds by dependencies (simple topological sort)
      // This ensures that computeds run in the correct order
      const sorted = this.sortComputedsByDependencies(computeds);
      for (const comp of sorted) {
        // For computeds, just access the computed to trigger recomputation
        // The computed will handle its own staleness check
        const computedImpl = (comp as any).__computed;
        if (computedImpl && typeof computedImpl.get === 'function') {
          // Use untrack to avoid creating new dependencies during batch flush
          context.untrack(() => computedImpl.get());
        }
      }
    }

    executionPhase = 'effects';
    // Sort effects by priority
    effects.sort((a, b) => 
      (a as ComputationImpl).priority - (b as ComputationImpl).priority
    );
    for (const effect of effects) {
      (effect as ComputationImpl).run();
    }

    // Run subscriber notifications
    const subscribers = Array.from(batchedSubscribers);
    batchedSubscribers.clear();
    for (const subscriber of subscribers) {
      try {
        subscriber();
      } catch (error) {
        console.error('Error in subscriber notification:', error);
      }
    }

    executionPhase = 'idle';
  }
  
  /**
   * Sort computeds in dependency order (topological sort)
   */
  private sortComputedsByDependencies(computeds: Computation[]): Computation[] {
    // Create a map to quickly check if a dependency is a computed in our list
    const computedSet = new Set(computeds);
    const inDegree = new Map<Computation, number>();
    const dependents = new Map<Computation, Set<Computation>>();
    
    // Initialize
    for (const comp of computeds) {
      inDegree.set(comp, 0);
      dependents.set(comp, new Set());
    }
    
    // Build dependency graph
    for (const comp of computeds) {
      const compImpl = comp as ComputationImpl;
      
      // Check each dependency
      for (const dep of compImpl.getDependencies()) {
        // The dependency might be a ComputedImpl directly (when stored internally)
        // Check if it has a computation property (ComputedImpl does)
        if ((dep as any).computation && (dep as any).computation instanceof ComputationImpl) {
          // This is a ComputedImpl, its computation is what we need
          const depComputation = (dep as any).computation;
          if (computedSet.has(depComputation)) {
            // comp depends on depComputation
            inDegree.set(comp, (inDegree.get(comp) || 0) + 1);
            dependents.get(depComputation)!.add(comp);
          }
        } else {
          // Check if the dependency has a __internal property (computed values do)
          const depInternal = (dep as any).__internal;
          if (depInternal && depInternal.computation) {
            // This dependency is a computed, check if it's in our batch
            const depComputation = depInternal.computation;
            if (computedSet.has(depComputation)) {
              // comp depends on depComputation
              inDegree.set(comp, (inDegree.get(comp) || 0) + 1);
              dependents.get(depComputation)!.add(comp);
            }
          }
        }
      }
    }
    
    // Topological sort using Kahn's algorithm
    const queue: Computation[] = [];
    const result: Computation[] = [];
    
    // Find all nodes with no dependencies
    for (const [comp, degree] of inDegree) {
      if (degree === 0) {
        queue.push(comp);
      }
    }
    
    // Process queue
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      // Reduce in-degree for dependents
      const currentDependents = dependents.get(current) || new Set();
      for (const dependent of currentDependents) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }
    
    // If we couldn't sort all (cycle), return original order
    if (result.length !== computeds.length) {
      return computeds;
    }
    
    return result;
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
    try {
      fn();
    } catch (error) {
      console.error('Error in subscriber notification:', error);
    }
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

/**
 * Get current execution phase
 */
export function getExecutionPhase(): string {
  return executionPhase;
}

/**
 * Debug utilities
 */
export const debug = {
  getDependencyGraph(): DependencyGraph {
    return globalDependencyGraph;
  },
  
  getPendingUpdates(): Map<Computation, any> {
    return pendingUpdates;
  },
  
  getUpdateVersion(): number {
    return updateVersion;
  },
  
  visualizeDependencies(): { nodes: any[], edges: any[], depth: number } {
    return globalDependencyGraph.visualize();
  },
  
  detectCycles(): any[][] {
    return globalDependencyGraph.detectCycles();
  }
};