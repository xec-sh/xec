/**
 * Reconciler - Diff and patch algorithm for Aura trees
 * 
 * Efficiently updates the terminal buffer based on changes in the Aura tree
 */

import type { BufferManagerImpl } from '@xec-sh/trm';

import type { Aura } from '../types.js';

/**
 * Reconcile two Aura trees and apply minimal updates to the buffer
 * 
 * @param oldTree Previous Aura tree
 * @param newTree New Aura tree
 * @param bufferManager Buffer manager for rendering
 */
export function reconcile(
  oldTree: Aura,
  newTree: Aura,
  bufferManager: BufferManagerImpl
): void {
  // If types are different, replace entirely
  if (oldTree.type !== newTree.type) {
    replaceNode(oldTree, newTree, bufferManager);
    return;
  }

  // Update props if changed
  if (propsChanged(oldTree.props, newTree.props)) {
    updateNode(oldTree, newTree, bufferManager);
  }

  // Reconcile children
  reconcileChildren(oldTree, newTree, bufferManager);
}

/**
 * Check if props have changed
 */
function propsChanged(oldProps: any, newProps: any): boolean {
  const oldKeys = Object.keys(oldProps);
  const newKeys = Object.keys(newProps);

  // Different number of props
  if (oldKeys.length !== newKeys.length) {
    return true;
  }

  // Check each prop
  for (const key of oldKeys) {
    if (key === 'children') continue; // Children handled separately

    const oldValue = resolveValue(oldProps[key]);
    const newValue = resolveValue(newProps[key]);

    if (!isEqual(oldValue, newValue)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve reactive values
 */
function resolveValue(value: any): any {
  return typeof value === 'function' ? value() : value;
}

/**
 * Deep equality check
 */
function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object' && a !== null && b !== null) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    
    if (aKeys.length !== bKeys.length) return false;
    
    for (const key of aKeys) {
      if (!isEqual(a[key], b[key])) return false;
    }
    
    return true;
  }
  
  return false;
}

/**
 * Replace a node entirely
 */
function replaceNode(
  oldNode: Aura,
  newNode: Aura,
  bufferManager: BufferManagerImpl
): void {
  // Clear old node area
  clearNode(oldNode, bufferManager);
  
  // Render new node
  renderNode(newNode, bufferManager);
  
  // Update references
  newNode.element = oldNode.element;
  if (oldNode.parent) {
    const index = oldNode.parent.children?.indexOf(oldNode) ?? -1;
    if (index >= 0 && oldNode.parent.children) {
      oldNode.parent.children[index] = newNode;
    }
  }
}

/**
 * Update a node's props
 */
function updateNode(
  oldNode: Aura,
  newNode: Aura,
  bufferManager: BufferManagerImpl
): void {
  // Clear old rendering
  clearNode(oldNode, bufferManager);
  
  // Update props
  oldNode.props = newNode.props;
  
  // Re-render with new props
  renderNode(oldNode, bufferManager);
}

/**
 * Reconcile children arrays
 */
function reconcileChildren(
  oldNode: Aura,
  newNode: Aura,
  bufferManager: BufferManagerImpl
): void {
  const oldChildren = oldNode.children || [];
  const newChildren = newNode.children || [];
  
  const maxLength = Math.max(oldChildren.length, newChildren.length);
  
  for (let i = 0; i < maxLength; i++) {
    const oldChild = oldChildren[i];
    const newChild = newChildren[i];
    
    if (!oldChild && newChild) {
      // Add new child
      renderNode(newChild, bufferManager);
      oldChildren.push(newChild);
    } else if (oldChild && !newChild) {
      // Remove old child
      clearNode(oldChild, bufferManager);
      oldChildren.splice(i, 1);
      i--; // Adjust index
    } else if (oldChild && newChild) {
      // Reconcile existing children
      reconcile(oldChild, newChild, bufferManager);
    }
  }
  
  // Update children reference
  oldNode.children = oldChildren;
}

/**
 * Clear a node from the buffer
 */
function clearNode(_node: Aura, _bufferManager: BufferManagerImpl): void {
  // TODO: Calculate actual bounds and clear
  // For now, this is a placeholder
  // In a real implementation, we'd track the rendered area of each node
}

/**
 * Render a node to the buffer
 */
function renderNode(_node: Aura, _bufferManager: BufferManagerImpl): void {
  // TODO: Implement actual rendering logic
  // This would delegate to the renderer for the specific component type
}