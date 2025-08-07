import { EventEmitter } from '../event-emitter.js';

type Listener<T> = (value: T) => void;
type Unsubscribe = () => void;
type UpdateFn<T> = (prev: T) => T;
type Dependency = { 
  id: string;
  get: () => any;
};

interface ReactiveNode {
  id: string;
  dependencies: Set<string>;
  dependents: Set<string>;
  value: any;
  compute?: () => any;
  isDirty: boolean;
}

export class ReactiveState<T extends Record<string, any>> extends EventEmitter {
  private state: T;
  private listeners: Map<string, Set<Listener<any>>> = new Map();
  private nodes: Map<string, ReactiveNode> = new Map();
  private computedNodes: Map<string, ReactiveNode> = new Map();
  private currentDependencies: Set<string> | null = null;
  private updateQueue: Set<string> = new Set();
  private isUpdating = false;

  constructor(initialState: T) {
    super();
    this.state = { ...initialState };
    
    // Initialize reactive nodes for each state property
    Object.keys(initialState).forEach(key => {
      this.nodes.set(key, {
        id: key,
        dependencies: new Set(),
        dependents: new Set(),
        value: initialState[key as keyof T],
        isDirty: false,
      });
    });
  }

  /**
   * Get a reactive value with dependency tracking
   */
  get<K extends keyof T>(key: K): T[K] {
    const keyStr = String(key);
    
    // Track dependency if we're inside a computed function
    if (this.currentDependencies) {
      this.currentDependencies.add(keyStr);
    }
    
    return this.state[key];
  }

  /**
   * Set a reactive value and trigger updates
   */
  set<K extends keyof T>(key: K, value: T[K] | UpdateFn<T[K]>): void {
    const keyStr = String(key);
    const prevValue = this.state[key];
    
    // Handle update function
    const newValue = typeof value === 'function' 
      ? (value as UpdateFn<T[K]>)(prevValue)
      : value;
    
    // Skip if value hasn't changed
    if (Object.is(prevValue, newValue)) return;
    
    // Update state
    this.state[key] = newValue;
    
    // Mark node as dirty and add to update queue
    const node = this.nodes.get(keyStr);
    if (node) {
      node.value = newValue;
      node.isDirty = true;
      this.updateQueue.add(keyStr);
      
      // Mark all dependents as dirty
      node.dependents.forEach(depId => {
        const depNode = this.nodes.get(depId) || this.computedNodes.get(depId);
        if (depNode) {
          depNode.isDirty = true;
          this.updateQueue.add(depId);
        }
      });
    }
    
    // Process updates
    this.processUpdateQueue();
    
    // Emit change event
    this.emit('change', { key, prevValue, newValue });
    
    // Notify listeners
    const listeners = this.listeners.get(keyStr);
    if (listeners) {
      listeners.forEach(listener => listener(newValue));
    }
  }

  /**
   * Create a computed value that depends on other reactive values
   */
  computed<R>(id: string, compute: () => R): () => R {
    // Track dependencies
    this.currentDependencies = new Set();
    const initialValue = compute();
    const dependencies = this.currentDependencies;
    this.currentDependencies = null;
    
    // Create computed node
    const node: ReactiveNode = {
      id,
      dependencies,
      dependents: new Set(),
      value: initialValue,
      compute,
      isDirty: false,
    };
    
    this.computedNodes.set(id, node);
    
    // Register as dependent of its dependencies
    dependencies.forEach(depId => {
      const depNode = this.nodes.get(depId) || this.computedNodes.get(depId);
      if (depNode) {
        depNode.dependents.add(id);
      }
    });
    
    // Return getter function
    return () => {
      const node = this.computedNodes.get(id);
      if (!node) return initialValue;
      
      // Recompute if dirty
      if (node.isDirty && node.compute) {
        // Track new dependencies
        this.currentDependencies = new Set();
        node.value = node.compute();
        const newDeps = this.currentDependencies;
        this.currentDependencies = null;
        
        // Update dependencies
        this.updateDependencies(node, newDeps);
        node.isDirty = false;
      }
      
      // Track dependency if we're inside another computed
      if (this.currentDependencies) {
        this.currentDependencies.add(id);
      }
      
      return node.value;
    };
  }

  /**
   * Subscribe to changes in a specific key
   */
  subscribe<K extends keyof T>(key: K, listener: Listener<T[K]>): Unsubscribe {
    const keyStr = String(key);
    
    if (!this.listeners.has(keyStr)) {
      this.listeners.set(keyStr, new Set());
    }
    
    this.listeners.get(keyStr)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(keyStr);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(keyStr);
        }
      }
    };
  }

  /**
   * Subscribe to all state changes
   */
  subscribeAll(listener: (changes: { key: keyof T; prevValue: any; newValue: any }) => void): Unsubscribe {
    this.on('change', listener);
    return () => this.off('change', listener);
  }

  /**
   * Batch multiple updates
   */
  batch(updates: () => void): void {
    const wasUpdating = this.isUpdating;
    this.isUpdating = true;
    
    try {
      updates();
    } finally {
      this.isUpdating = wasUpdating;
      if (!wasUpdating) {
        this.processUpdateQueue();
      }
    }
  }

  /**
   * Get the current state snapshot
   */
  getState(): Readonly<T> {
    return { ...this.state };
  }

  /**
   * Reset state to initial values
   */
  reset(initialState: T): void {
    this.batch(() => {
      Object.entries(initialState).forEach(([key, value]) => {
        this.set(key as keyof T, value);
      });
    });
  }

  /**
   * Dispose of all subscriptions and computed values
   */
  dispose(): void {
    this.listeners.clear();
    this.nodes.clear();
    this.computedNodes.clear();
    this.updateQueue.clear();
    this.removeAllListeners();
  }

  private updateDependencies(node: ReactiveNode, newDeps: Set<string>): void {
    // Remove from old dependencies
    node.dependencies.forEach(depId => {
      if (!newDeps.has(depId)) {
        const depNode = this.nodes.get(depId) || this.computedNodes.get(depId);
        if (depNode) {
          depNode.dependents.delete(node.id);
        }
      }
    });
    
    // Add to new dependencies
    newDeps.forEach(depId => {
      if (!node.dependencies.has(depId)) {
        const depNode = this.nodes.get(depId) || this.computedNodes.get(depId);
        if (depNode) {
          depNode.dependents.add(node.id);
        }
      }
    });
    
    node.dependencies = newDeps;
  }

  private processUpdateQueue(): void {
    if (this.isUpdating || this.updateQueue.size === 0) return;
    
    // Process all updates
    const queue = Array.from(this.updateQueue);
    this.updateQueue.clear();
    
    // Recompute dirty computed values
    queue.forEach(id => {
      const node = this.computedNodes.get(id);
      if (node && node.isDirty && node.compute) {
        // Track dependencies during recomputation
        this.currentDependencies = new Set();
        node.value = node.compute();
        const newDeps = this.currentDependencies;
        this.currentDependencies = null;
        
        // Update dependencies
        this.updateDependencies(node, newDeps);
        node.isDirty = false;
        
        // Emit change for computed values
        this.emit('computed-change', { id, value: node.value });
      }
    });
  }
}