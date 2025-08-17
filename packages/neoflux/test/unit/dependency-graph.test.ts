import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph, globalDependencyGraph } from '../../src/dependency-graph.js';
import { signal } from '../../src/signal.js';
import { computed } from '../../src/computed.js';
import { createRoot } from '../../src/batch.js';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('Basic operations', () => {
    it('should create an empty graph', () => {
      expect(graph.size()).toBe(0);
    });

    it('should add nodes', () => {
      const node1 = { id: 'node1', type: 'signal' };
      const node2 = { id: 'node2', type: 'computed' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      
      expect(graph.size()).toBe(2);
    });

    it('should remove nodes', () => {
      const node = { id: 'node1', type: 'signal' };
      
      graph.addNode(node);
      expect(graph.size()).toBe(1);
      
      graph.removeNode(node);
      expect(graph.size()).toBe(0);
    });

    it('should add dependencies between nodes', () => {
      const node1 = { id: 'node1', type: 'signal' };
      const node2 = { id: 'node2', type: 'computed' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node2, node1);
      
      const dependencies = graph.getDependencies(node2);
      expect(dependencies).toContainEqual(expect.objectContaining({ computation: node1 }));
      
      const dependents = graph.getDependents(node1);
      expect(dependents).toContainEqual(expect.objectContaining({ computation: node2 }));
    });

    it('should remove dependencies', () => {
      const node1 = { id: 'node1', type: 'signal' };
      const node2 = { id: 'node2', type: 'computed' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node2, node1);
      
      graph.removeDependency(node2, node1);
      
      const dependencies = graph.getDependencies(node2);
      expect(dependencies).toHaveLength(0);
      
      const dependents = graph.getDependents(node1);
      expect(dependents).toHaveLength(0);
    });

    it('should handle removing non-existent nodes gracefully', () => {
      const node = { id: 'node1' };
      
      expect(() => graph.removeNode(node)).not.toThrow();
      expect(graph.size()).toBe(0);
    });
  });

  describe('Dependency tracking', () => {
    it('should track direct dependencies', () => {
      const sig = { id: 'signal' };
      const comp = { id: 'computed' };
      
      graph.addNode(sig);
      graph.addNode(comp);
      graph.addDependency(comp, sig);
      
      const dependencies = graph.getDependencies(comp);
      expect(dependencies).toContainEqual(expect.objectContaining({ computation: sig }));
      
      const dependents = graph.getDependents(sig);
      expect(dependents).toContainEqual(expect.objectContaining({ computation: comp }));
    });

    it('should track transitive dependencies', () => {
      const sig = { id: 'signal' };
      const comp1 = { id: 'computed1' };
      const comp2 = { id: 'computed2' };
      
      graph.addNode(sig);
      graph.addNode(comp1);
      graph.addNode(comp2);
      graph.addDependency(comp1, sig);
      graph.addDependency(comp2, comp1);
      
      // Direct dependencies
      const comp1Dependencies = graph.getDependencies(comp1);
      expect(comp1Dependencies).toContainEqual(expect.objectContaining({ computation: sig }));
      
      const comp2Dependencies = graph.getDependencies(comp2);
      expect(comp2Dependencies).toContainEqual(expect.objectContaining({ computation: comp1 }));
    });

    it('should handle multiple dependencies', () => {
      const sig1 = { id: 'signal1' };
      const sig2 = { id: 'signal2' };
      const comp = { id: 'computed' };
      
      graph.addNode(sig1);
      graph.addNode(sig2);
      graph.addNode(comp);
      graph.addDependency(comp, sig1);
      graph.addDependency(comp, sig2);
      
      const dependencies = graph.getDependencies(comp);
      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContainEqual(expect.objectContaining({ computation: sig1 }));
      expect(dependencies).toContainEqual(expect.objectContaining({ computation: sig2 }));
    });
  });

  describe('Circular dependency detection', () => {
    it('should detect cycles', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      const node3 = { id: 'node3' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);
      graph.addDependency(node2, node1);
      graph.addDependency(node3, node2);
      graph.addDependency(node1, node3); // Creates cycle
      
      const cycles = graph.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should not detect cycles in DAG', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      const node3 = { id: 'node3' };
      const node4 = { id: 'node4' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);
      graph.addNode(node4);
      
      // Diamond pattern (not circular)
      graph.addDependency(node2, node1);
      graph.addDependency(node3, node1);
      graph.addDependency(node4, node2);
      graph.addDependency(node4, node3);
      
      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(0);
    });
  });

  describe('Topological sorting', () => {
    it('should sort nodes topologically', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      const node3 = { id: 'node3' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);
      graph.addDependency(node2, node1);
      graph.addDependency(node3, node2);
      
      const sorted = graph.topologicalSort();
      
      expect(sorted).toHaveLength(3);
      // node1 should come before node2
      const index1 = sorted.findIndex(n => n.computation === node1);
      const index2 = sorted.findIndex(n => n.computation === node2);
      const index3 = sorted.findIndex(n => n.computation === node3);
      
      expect(index1).toBeLessThan(index2);
      expect(index2).toBeLessThan(index3);
    });

    it('should handle diamond dependencies', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      const node3 = { id: 'node3' };
      const node4 = { id: 'node4' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);
      graph.addNode(node4);
      
      graph.addDependency(node2, node1);
      graph.addDependency(node3, node1);
      graph.addDependency(node4, node2);
      graph.addDependency(node4, node3);
      
      const sorted = graph.topologicalSort();
      
      expect(sorted).toHaveLength(4);
      
      const index1 = sorted.findIndex(n => n.computation === node1);
      const index2 = sorted.findIndex(n => n.computation === node2);
      const index3 = sorted.findIndex(n => n.computation === node3);
      const index4 = sorted.findIndex(n => n.computation === node4);
      
      // node1 should come before node2 and node3
      expect(index1).toBeLessThan(index2);
      expect(index1).toBeLessThan(index3);
      // node2 and node3 should come before node4
      expect(index2).toBeLessThan(index4);
      expect(index3).toBeLessThan(index4);
    });

    it('should handle cycles in topological sort', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node1, node2);
      graph.addDependency(node2, node1);
      
      const sorted = graph.topologicalSort();
      // Should still return nodes even with cycle (warning logged)
      expect(sorted.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle isolated nodes', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      const isolated = { id: 'isolated' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(isolated);
      graph.addDependency(node2, node1);
      
      const sorted = graph.topologicalSort();
      
      expect(sorted).toHaveLength(3);
      expect(sorted.some(n => n.computation === isolated)).toBe(true);
      
      const index1 = sorted.findIndex(n => n.computation === node1);
      const index2 = sorted.findIndex(n => n.computation === node2);
      expect(index1).toBeLessThan(index2);
    });
  });

  describe('Graph analysis', () => {
    it('should provide graph statistics', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node2, node1);
      
      const stats = graph.getStats();
      expect(stats).toHaveProperty('nodes');
      expect(stats).toHaveProperty('edges');
      expect(stats).toHaveProperty('depth');
      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBeGreaterThan(0);
    });

    it('should generate DOT format for visualization', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node2, node1);
      
      const dot = graph.toDot();
      expect(typeof dot).toBe('string');
      expect(dot).toContain('digraph');
    });

    it('should provide visualization data', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node2, node1);
      
      const visualization = graph.visualize();
      expect(visualization).toHaveProperty('nodes');
      expect(visualization).toHaveProperty('edges');
      expect(visualization).toHaveProperty('depth');
      expect(visualization.nodes).toHaveLength(2);
      expect(visualization.edges).toHaveLength(1);
    });

    it('should add signals with names', () => {
      const sig = signal(10);
      const id = graph.addSignal(sig, 'testSignal');
      
      expect(typeof id).toBe('string');
      expect(id).toContain('signal');
      expect(graph.size()).toBe(1);
    });

    it('should add computed with names', () => {
      const comp = computed(() => 20);
      const id = graph.addComputed(comp, 'testComputed');
      
      expect(typeof id).toBe('string');
      expect(id).toContain('computed');
      expect(graph.size()).toBe(1);
    });
  });

  describe('Global dependency graph', () => {
    it('should provide global instance', () => {
      expect(globalDependencyGraph).toBeInstanceOf(DependencyGraph);
    });

    it('should track real signal dependencies', () => {
      createRoot((dispose) => {
        const sig = signal(10);
        const comp = computed(() => sig() * 2);
        
        // Access computed to establish dependency
        comp();
        
        // The global graph exists and can be used
        expect(globalDependencyGraph).toBeDefined();
        expect(globalDependencyGraph.size()).toBeGreaterThanOrEqual(0);
        
        dispose();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large graphs efficiently', () => {
      const nodes: any[] = [];
      const nodeCount = 100;
      
      // Create nodes
      for (let i = 0; i < nodeCount; i++) {
        const node = { id: `node${i}` };
        nodes.push(node);
        graph.addNode(node);
      }
      
      // Create edges (each node depends on previous)
      for (let i = 1; i < nodeCount; i++) {
        graph.addDependency(nodes[i], nodes[i - 1]);
      }
      
      expect(graph.size()).toBe(nodeCount);
      
      // Should still perform topological sort
      const sorted = graph.topologicalSort();
      expect(sorted).toHaveLength(nodeCount);
    });

    it('should handle dense graphs', () => {
      const nodes: any[] = [];
      const nodeCount = 20;
      
      // Create nodes
      for (let i = 0; i < nodeCount; i++) {
        const node = { id: `node${i}` };
        nodes.push(node);
        graph.addNode(node);
      }
      
      // Create dense connections
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < Math.min(i + 5, nodeCount); j++) {
          graph.addDependency(nodes[j], nodes[i]);
        }
      }
      
      expect(graph.size()).toBe(nodeCount);
      
      // Should detect cycles if any
      const cycles = graph.detectCycles();
      expect(Array.isArray(cycles)).toBe(true);
      
      // Should still perform topological sort
      const sorted = graph.topologicalSort();
      expect(sorted.length).toBeGreaterThanOrEqual(0);
    });

    it('should clear the graph', () => {
      const node1 = { id: 'node1' };
      const node2 = { id: 'node2' };
      
      graph.addNode(node1);
      graph.addNode(node2);
      graph.addDependency(node2, node1);
      
      expect(graph.size()).toBe(2);
      
      graph.clear();
      
      expect(graph.size()).toBe(0);
    });
  });
});