/**
 * Diamond Dependency Resolution
 * Provides a clean interface for handling diamond dependency patterns
 * in the reactive system without using hacky type casting.
 */

import type { ComputationImpl } from './context.js';

/**
 * Interface for computations that support diamond dependency resolution
 */
export interface DiamondResolvable {
  /**
   * Mark the computation as stale without propagating to dependents.
   * This is used in the first pass of diamond dependency resolution.
   */
  markStaleWithoutPropagation(): void;
  
  /**
   * Get the dependency depth for topological sorting
   */
  getDependencyDepth(): number;
}

/**
 * Check if a computation supports diamond resolution
 */
export function isDiamondResolvable(computation: any): computation is DiamondResolvable {
  return computation != null &&
    typeof computation.markStaleWithoutPropagation === 'function' &&
    typeof computation.getDependencyDepth === 'function';
}

/**
 * Get the diamond resolvable interface from a computation
 * This handles the connection between ComputationImpl and ComputedImpl
 */
export function getDiamondResolvable(computation: ComputationImpl): DiamondResolvable | null {
  // Check if the computation has an associated computed instance
  const computedInternal = (computation as any).__computed;
  
  if (isDiamondResolvable(computedInternal)) {
    return computedInternal;
  }
  
  return null;
}

/**
 * Resolve diamond dependencies by sorting computations by dependency depth
 * and marking them stale in the correct order
 */
export function resolveDiamondDependencies(computations: ComputationImpl[]): void {
  // Separate computations that support diamond resolution
  const resolvableComputations: Array<{ computation: ComputationImpl; resolvable: DiamondResolvable; depth: number }> = [];
  const normalComputations: ComputationImpl[] = [];
  
  for (const computation of computations) {
    const resolvable = getDiamondResolvable(computation);
    if (resolvable) {
      resolvableComputations.push({
        computation,
        resolvable,
        depth: resolvable.getDependencyDepth()
      });
    } else {
      normalComputations.push(computation);
    }
  }
  
  // Sort resolvable computations by dependency depth (shallow first)
  resolvableComputations.sort((a, b) => a.depth - b.depth);
  
  // First pass: Mark all resolvable computations as stale without propagation
  for (const { resolvable } of resolvableComputations) {
    resolvable.markStaleWithoutPropagation();
  }
  
  // Second pass: Invalidate all computations (both resolvable and normal)
  for (const { computation } of resolvableComputations) {
    computation.invalidate();
  }
  
  for (const computation of normalComputations) {
    computation.invalidate();
  }
}

/**
 * Calculate the dependency depth of a computation
 * This helps determine the order of invalidation
 */
export function calculateDependencyDepth(
  computation: any,
  visited: Set<any> = new Set()
): number {
  if (visited.has(computation)) {
    return 0; // Circular dependency, return 0
  }
  
  visited.add(computation);
  
  // Get dependencies (this varies by computation type)
  const dependencies = computation.dependencies || 
                       computation.sources || 
                       [];
  
  if (dependencies.length === 0 || !dependencies[Symbol.iterator]) {
    return 0;
  }
  
  let maxDepth = 0;
  for (const dep of dependencies) {
    const depthFromDep = calculateDependencyDepth(dep, visited);
    maxDepth = Math.max(maxDepth, depthFromDep + 1);
  }
  
  return maxDepth;
}