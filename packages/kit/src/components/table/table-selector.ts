/**
 * Table selection logic
 */

import type { TableState, SelectionMode } from './types.js';

/**
 * Toggle selection for current row
 */
export function toggleSelection<T>(
  state: TableState<T>,
  mode: SelectionMode
): TableState<T> {
  if (mode === 'none' || state.data.length === 0) {
    return state;
  }

  const currentRow = state.data[state.focusedRow];
  if (!currentRow) {
    return state;
  }

  const newSelected = new Set(state.selected);

  if (mode === 'single') {
    // Single selection: clear all and select current
    newSelected.clear();
    if (!state.selected.has(currentRow)) {
      newSelected.add(currentRow);
    }
  } else {
    // Multiple selection: toggle current
    if (newSelected.has(currentRow)) {
      newSelected.delete(currentRow);
    } else {
      newSelected.add(currentRow);
    }
  }

  return {
    ...state,
    selected: newSelected,
  };
}

/**
 * Select all rows
 */
export function selectAll<T>(state: TableState<T>): TableState<T> {
  const newSelected = new Set(state.data);

  return {
    ...state,
    selected: newSelected,
  };
}

/**
 * Clear all selection
 */
export function clearSelection<T>(state: TableState<T>): TableState<T> {
  return {
    ...state,
    selected: new Set(),
  };
}

/**
 * Check if row is selected
 */
export function isSelected<T>(state: TableState<T>, row: T): boolean {
  return state.selected.has(row);
}

/**
 * Get selected rows as array
 */
export function getSelectedRows<T>(state: TableState<T>): T[] {
  return Array.from(state.selected);
}

/**
 * Get selection count
 */
export function getSelectionCount<T>(state: TableState<T>): number {
  return state.selected.size;
}
