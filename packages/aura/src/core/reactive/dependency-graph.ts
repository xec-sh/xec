/**
 * Dependency Graph for Topological Sorting
 * Ensures correct execution order of reactive computations
 */

export interface GraphNode {
  id: string | number;
  name?: string;
  dependencies: Set<GraphNode>;
  dependents: Set<GraphNode>;
  computation?: any;
  type?: 'signal' | 'computed' | 'effect';
}

export class DependencyGraph {
  private nodes = new Map<any, GraphNode>();
  private nodesByName = new Map<string, GraphNode>();
  private executionOrder: GraphNode[] = [];
  private dirty = true;
  private idCounter = 0;

  /**
   * Add a signal to the graph
   */
  addSignal(signal: any, name: string): string {
    const node: GraphNode = {
      id: `signal_${this.idCounter++}`,
      name,
      dependencies: new Set(),
      dependents: new Set(),
      computation: signal,
      type: 'signal'
    };
    this.nodes.set(signal, node);
    this.nodesByName.set(name, node);
    this.dirty = true;
    return node.id as string;
  }

  /**
   * Add a computed to the graph
   */
  addComputed(computed: any, name: string): string {
    const node: GraphNode = {
      id: `computed_${this.idCounter++}`,
      name,
      dependencies: new Set(),
      dependents: new Set(),
      computation: computed,
      type: 'computed'
    };
    this.nodes.set(computed, node);
    this.nodesByName.set(name, node);
    this.dirty = true;
    return node.id as string;
  }

  /**
   * Add a computation to the graph (generic)
   */
  addNode(computation: any): GraphNode {
    if (!this.nodes.has(computation)) {
      const node: GraphNode = {
        id: this.nodes.size,
        dependencies: new Set(),
        dependents: new Set(),
        computation
      };
      this.nodes.set(computation, node);
      this.dirty = true;
    }
    return this.nodes.get(computation)!;
  }

  /**
   * Add a dependency relationship
   */
  addDependency(dependent: any, dependency: any): void {
    let dependentNode: GraphNode | undefined;
    let dependencyNode: GraphNode | undefined;
    
    // Handle string IDs
    if (typeof dependent === 'string') {
      dependentNode = Array.from(this.nodes.values()).find(n => n.id === dependent);
    } else {
      dependentNode = this.nodes.get(dependent) || this.addNode(dependent);
    }
    
    if (typeof dependency === 'string') {
      dependencyNode = Array.from(this.nodes.values()).find(n => n.id === dependency);
    } else {
      dependencyNode = this.nodes.get(dependency) || this.addNode(dependency);
    }
    
    if (dependentNode && dependencyNode) {
      dependentNode.dependencies.add(dependencyNode);
      dependencyNode.dependents.add(dependentNode);
      this.dirty = true;
    }
  }

  /**
   * Remove a dependency relationship
   */
  removeDependency(dependent: any, dependency: any): void {
    const dependentNode = this.nodes.get(dependent);
    const dependencyNode = this.nodes.get(dependency);
    
    if (dependentNode && dependencyNode) {
      dependentNode.dependencies.delete(dependencyNode);
      dependencyNode.dependents.delete(dependentNode);
      this.dirty = true;
    }
  }

  /**
   * Remove a node from the graph
   */
  removeNode(computation: any): void {
    const node = this.nodes.get(computation);
    if (!node) return;

    // Remove from dependencies
    for (const dep of node.dependencies) {
      dep.dependents.delete(node);
    }

    // Remove from dependents
    for (const dependent of node.dependents) {
      dependent.dependencies.delete(node);
    }

    this.nodes.delete(computation);
    this.dirty = true;
  }

  /**
   * Perform topological sort using Kahn's algorithm
   */
  topologicalSort(): GraphNode[] {
    if (!this.dirty && this.executionOrder.length > 0) {
      return this.executionOrder;
    }

    const nodes = Array.from(this.nodes.values());
    const inDegree = new Map<GraphNode, number>();
    const queue: GraphNode[] = [];
    const result: GraphNode[] = [];

    // Calculate in-degrees
    for (const node of nodes) {
      inDegree.set(node, node.dependencies.size);
      if (node.dependencies.size === 0) {
        queue.push(node);
      }
    }

    // Process nodes with no dependencies
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      // Reduce in-degree for dependents
      for (const dependent of node.dependents) {
        const degree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, degree);
        
        if (degree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== nodes.length) {
      console.warn('Cycle detected in dependency graph');
      // Return nodes in original order if cycle detected
      return nodes;
    }

    this.executionOrder = result;
    this.dirty = false;
    
    return result;
  }

  /**
   * Get all dependencies of a computation
   */
  getDependencies(computation: any): any[] {
    let node: GraphNode | undefined;
    
    if (typeof computation === 'string') {
      node = Array.from(this.nodes.values()).find(n => n.id === computation);
    } else {
      node = this.nodes.get(computation);
    }
    
    if (!node) return [];
    
    const result: GraphNode[] = [];
    const visited = new Set<GraphNode>();
    
    const traverse = (n: GraphNode) => {
      if (visited.has(n)) return;
      visited.add(n);
      
      for (const dep of n.dependencies) {
        result.push(dep);
        traverse(dep);
      }
    };
    
    traverse(node);
    return result;
  }

  /**
   * Get all dependents of a computation
   */
  getDependents(computation: any): any[] {
    let node: GraphNode | undefined;
    
    if (typeof computation === 'string') {
      node = Array.from(this.nodes.values()).find(n => n.id === computation);
    } else {
      node = this.nodes.get(computation);
    }
    
    if (!node) return [];
    
    const result: GraphNode[] = [];
    const visited = new Set<GraphNode>();
    
    const traverse = (n: GraphNode) => {
      if (visited.has(n)) return;
      visited.add(n);
      
      for (const dependent of n.dependents) {
        result.push(dependent);
        traverse(dependent);
      }
    };
    
    traverse(node);
    return result;
  }

  /**
   * Detect cycles in the graph
   */
  detectCycles(): any[][] {
    const cycles: any[][] = [];
    const visited = new Set<GraphNode>();
    const recursionStack = new Set<GraphNode>();
    const path: GraphNode[] = [];

    const dfs = (node: GraphNode): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (recursionStack.has(dep)) {
          // Cycle detected
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart).map(n => n.computation);
          cycles.push(cycle);
          return true;
        }
      }

      path.pop();
      recursionStack.delete(node);
      return false;
    };

    for (const node of this.nodes.values()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.executionOrder = [];
    this.dirty = true;
  }

  /**
   * Get graph size
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Generate DOT format for graph visualization
   */
  toDot(): string {
    let dot = 'digraph DependencyGraph {\n';
    
    // Add nodes
    for (const [, node] of this.nodes) {
      const label = node.name || node.id.toString();
      const shape = node.type === 'signal' ? 'box' : 
                    node.type === 'computed' ? 'ellipse' : 'diamond';
      dot += `  "${node.id}" [label="${label}", shape=${shape}];\n`;
    }
    
    // Add edges
    for (const [, node] of this.nodes) {
      for (const dep of node.dependencies) {
        dot += `  "${node.id}" -> "${dep.id}";\n`;
      }
    }
    
    dot += '}';
    return dot;
  }
  
  /**
   * Get graph statistics
   */
  getStats(): { 
    nodes: number; 
    edges: number; 
    depth: number;
    signals: number;
    computeds: number;
    effects: number;
  } {
    let edges = 0;
    let signals = 0;
    let computeds = 0;
    let effects = 0;
    
    for (const [, node] of this.nodes) {
      edges += node.dependencies.size;
      
      if (node.type === 'signal') signals++;
      else if (node.type === 'computed') computeds++;
      else if (node.type === 'effect') effects++;
    }
    
    // Calculate depth
    const depths = new Map<GraphNode, number>();
    const calculateDepth = (node: GraphNode): number => {
      if (depths.has(node)) return depths.get(node)!;
      
      if (node.dependencies.size === 0) {
        depths.set(node, 0);
        return 0;
      }
      
      let maxDepth = 0;
      for (const dep of node.dependencies) {
        maxDepth = Math.max(maxDepth, calculateDepth(dep) + 1);
      }
      
      depths.set(node, maxDepth);
      return maxDepth;
    };
    
    let maxDepth = 0;
    for (const [, node] of this.nodes) {
      maxDepth = Math.max(maxDepth, calculateDepth(node));
    }
    
    return {
      nodes: this.nodes.size,
      edges,
      depth: maxDepth,
      signals,
      computeds,
      effects
    };
  }

  /**
   * Debug: visualize the graph
   */
  visualize(): { nodes: any[], edges: any[], depth: number } {
    const nodes: any[] = [];
    const edges: any[] = [];
    
    // Collect nodes
    for (const [, node] of this.nodes) {
      nodes.push({
        id: node.id,
        name: node.name || node.id,
        type: node.type || 'unknown'
      });
      
      // Collect edges
      for (const dep of node.dependencies) {
        edges.push({
          from: node.id,
          to: dep.id
        });
      }
    }
    
    // Calculate depth
    const depths = new Map<GraphNode, number>();
    const calculateDepth = (node: GraphNode): number => {
      if (depths.has(node)) return depths.get(node)!;
      
      if (node.dependencies.size === 0) {
        depths.set(node, 0);
        return 0;
      }
      
      let maxDepth = 0;
      for (const dep of node.dependencies) {
        maxDepth = Math.max(maxDepth, calculateDepth(dep) + 1);
      }
      
      depths.set(node, maxDepth);
      return maxDepth;
    };
    
    let maxDepth = 0;
    for (const [, node] of this.nodes) {
      maxDepth = Math.max(maxDepth, calculateDepth(node));
    }
    
    return {
      nodes,
      edges,
      depth: maxDepth
    };
  }
}

// Global dependency graph instance
export const globalDependencyGraph = new DependencyGraph();