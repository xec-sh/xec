/**
 * Advanced Circular Dependency Detection and Resolution
 * Provides strategies for handling circular dependencies in the reactive system
 */

/**
 * Error thrown when a circular dependency is detected
 */
export class CircularDependencyError extends Error {
  constructor(public readonly cycle: any[]) {
    const cycleDescription = cycle.map((c: any) => c.name || c.id || 'anonymous').join(' -> ');
    super(`Circular dependency detected: ${cycleDescription}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Options for handling circular dependencies
 */
export interface CircularDependencyOptions {
  /** Whether to allow circular dependencies with default values */
  allowWithDefaults?: boolean;
  /** Whether to break cycles at optional computations */
  breakAtOptional?: boolean;
  /** Maximum depth before assuming circular dependency */
  maxDepth?: number;
  /** Whether to log warnings for circular dependencies */
  logWarnings?: boolean;
  /** Whether to throw errors on detection (false = try to recover) */
  throwOnDetection?: boolean;
}

/**
 * Base interface for resolvable computations
 * Does not extend Computation to avoid requiring unnecessary properties
 */
export interface ResolvableComputation {
  /** Whether this computation is optional and can be skipped */
  isOptional?: boolean;
  /** Default value to use if circular dependency is detected */
  defaultValue?: any;
  /** Whether to skip this computation in a cycle */
  skip?: () => void;
  /** Name for debugging */
  name?: string;
}

/**
 * Advanced circular dependency resolver
 */
export class CircularDependencyResolver {
  private stack = new Set<ResolvableComputation>();
  private detected: Array<ResolvableComputation[]> = [];
  private options: CircularDependencyOptions;
  private depthMap = new Map<ResolvableComputation, number>();
  
  constructor(options: CircularDependencyOptions = {}) {
    this.options = {
      allowWithDefaults: false,
      breakAtOptional: true,
      maxDepth: 100,
      logWarnings: true,
      ...options
    };
  }
  
  /**
   * Enter a computation context
   * Returns true if safe to proceed, false if should skip
   */
  enter(computation: ResolvableComputation): boolean {
    // Check max depth
    const currentDepth = this.depthMap.get(computation) || 0;
    if (currentDepth >= (this.options.maxDepth || 100)) {
      if (this.options.logWarnings) {
        console.warn(`Max depth (${this.options.maxDepth}) reached for computation:`, computation.name || computation);
      }
      return false;
    }
    
    // Check for circular dependency
    if (this.stack.has(computation)) {
      const cycle = Array.from(this.stack);
      const cycleStart = Array.from(this.stack).indexOf(computation);
      const actualCycle = cycle.slice(cycleStart);
      actualCycle.push(computation); // Complete the cycle
      
      this.detected.push(actualCycle);
      
      if (this.options.logWarnings) {
        const cycleNames = actualCycle.map(c => c.name || 'anonymous').join(' -> ');
        console.warn(`Circular dependency detected: ${cycleNames}`);
      }
      
      // Try to recover
      if (this.canRecover(actualCycle)) {
        return this.recover(actualCycle, computation);
      }
      
      // If can't recover, throw error
      throw new CircularDependencyError(actualCycle);
    }
    
    // Add to stack and update depth
    this.stack.add(computation);
    this.depthMap.set(computation, currentDepth + 1);
    return true;
  }
  
  /**
   * Exit a computation context
   */
  exit(computation: ResolvableComputation): void {
    this.stack.delete(computation);
    this.depthMap.delete(computation);
  }
  
  /**
   * Check if we can recover from a circular dependency
   */
  private canRecover(cycle: ResolvableComputation[]): boolean {
    // Check if we can use default values
    if (this.options.allowWithDefaults) {
      const hasDefault = cycle.some(c => c.defaultValue !== undefined);
      if (hasDefault) return true;
    }
    
    // Check if we can break at optional computations
    if (this.options.breakAtOptional) {
      const hasOptional = cycle.some(c => c.isOptional);
      if (hasOptional) return true;
    }
    
    return false;
  }
  
  /**
   * Attempt to recover from a circular dependency
   */
  private recover(cycle: ResolvableComputation[], current: ResolvableComputation): boolean {
    // Try to use default value
    if (this.options.allowWithDefaults && current.defaultValue !== undefined) {
      if (this.options.logWarnings) {
        console.warn(`Using default value for ${current.name || 'computation'} to break cycle`);
      }
      return false; // Don't proceed with computation, use default
    }
    
    // Try to skip optional computation
    if (this.options.breakAtOptional) {
      const optional = cycle.find(c => c.isOptional);
      if (optional && optional.skip) {
        if (this.options.logWarnings) {
          console.warn(`Skipping optional computation ${optional.name || 'anonymous'} to break cycle`);
        }
        optional.skip();
        return false;
      }
    }
    
    return false;
  }
  
  /**
   * Reset the resolver state
   */
  reset(): void {
    this.stack.clear();
    this.detected = [];
    this.depthMap.clear();
  }
  
  /**
   * Get all detected circular dependencies
   */
  getDetectedCycles(): Array<ResolvableComputation[]> {
    return this.detected;
  }
  
  /**
   * Check if currently in a computation
   */
  isComputing(): boolean {
    return this.stack.size > 0;
  }
  
  /**
   * Get current computation depth
   */
  getCurrentDepth(): number {
    return this.stack.size;
  }
  
  /**
   * Get current computation stack (for debugging)
   */
  getStack(): ResolvableComputation[] {
    return Array.from(this.stack);
  }
  
  /**
   * Analyze dependency graph for potential circular dependencies
   * This is a static analysis that doesn't require execution
   */
  static analyzeDependencyGraph(
    nodes: Map<any, Set<any>>
  ): { hasCycles: boolean; cycles: any[][] } {
    const visited = new Set<any>();
    const recursionStack = new Set<any>();
    const cycles: any[][] = [];
    
    function dfs(node: any, path: any[] = []): boolean {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const dependencies = nodes.get(node) || new Set();
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          if (dfs(dep, [...path])) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart);
          cycle.push(dep);
          cycles.push(cycle);
        }
      }
      
      recursionStack.delete(node);
      return false;
    }
    
    // Check all nodes
    for (const node of nodes.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }
    
    return {
      hasCycles: cycles.length > 0,
      cycles
    };
  }
}

/**
 * Global instance optimized for production
 * - Allows default values to prevent crashes
 * - Breaks at optional computations for graceful degradation
 * - Higher max depth for complex reactive graphs
 * - Warnings only in development
 */
export const globalCircularResolver = new CircularDependencyResolver({
  allowWithDefaults: true,
  breakAtOptional: true,
  maxDepth: 500, // Increased for complex production apps
  logWarnings: process.env.NODE_ENV !== 'production',
  throwOnDetection: false // Try to recover in production
});

/**
 * Helper decorator for marking computations as optional
 */
export function optional<T extends Function>(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  const original = descriptor.value;
  descriptor.value = function(...args: any[]) {
    (this as any).isOptional = true;
    return original.apply(this, args);
  };
  return descriptor;
}

/**
 * Helper decorator for providing default values
 */
export function withDefault<T>(defaultValue: T) {
  return function(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value;
    descriptor.value = function(...args: any[]) {
      (this as any).defaultValue = defaultValue;
      return original.apply(this, args);
    };
    return descriptor;
  };
}