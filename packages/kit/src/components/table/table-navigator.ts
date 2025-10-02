/**
 * Table navigation logic
 */

import type { TableState } from './types.js';

/**
 * Navigate up
 */
export function navigateUp<T>(state: TableState<T>): TableState<T> {
  if (state.focusedRow === 0) {
    return state;
  }

  const newRow = state.focusedRow - 1;
  const [rangeStart, rangeEnd] = state.visibleRange;

  let newRange: [number, number] = [rangeStart, rangeEnd];
  if (newRow < rangeStart) {
    newRange = [newRow, newRow + state.pageSize];
  }

  return {
    ...state,
    focusedRow: newRow,
    visibleRange: newRange,
  };
}

/**
 * Navigate down
 */
export function navigateDown<T>(state: TableState<T>): TableState<T> {
  if (state.focusedRow >= state.data.length - 1) {
    return state;
  }

  const newRow = state.focusedRow + 1;
  const [rangeStart, rangeEnd] = state.visibleRange;

  let newRange: [number, number] = [rangeStart, rangeEnd];
  if (newRow >= rangeEnd) {
    newRange = [newRow - state.pageSize + 1, newRow + 1];
  }

  return {
    ...state,
    focusedRow: newRow,
    visibleRange: newRange,
  };
}

/**
 * Navigate to first row
 */
export function navigateFirst<T>(state: TableState<T>): TableState<T> {
  return {
    ...state,
    focusedRow: 0,
    visibleRange: [0, Math.min(state.pageSize, state.data.length)],
  };
}

/**
 * Navigate to last row
 */
export function navigateLast<T>(state: TableState<T>): TableState<T> {
  const lastRow = Math.max(0, state.data.length - 1);
  const rangeStart = Math.max(0, lastRow - state.pageSize + 1);

  return {
    ...state,
    focusedRow: lastRow,
    visibleRange: [rangeStart, state.data.length],
  };
}

/**
 * Navigate page up
 */
export function navigatePageUp<T>(state: TableState<T>): TableState<T> {
  const newRow = Math.max(0, state.focusedRow - state.pageSize);
  const rangeStart = Math.max(0, newRow);
  const rangeEnd = Math.min(state.data.length, rangeStart + state.pageSize);

  return {
    ...state,
    focusedRow: newRow,
    visibleRange: [rangeStart, rangeEnd],
  };
}

/**
 * Navigate page down
 */
export function navigatePageDown<T>(state: TableState<T>): TableState<T> {
  const newRow = Math.min(state.data.length - 1, state.focusedRow + state.pageSize);
  const rangeEnd = Math.min(state.data.length, newRow + 1);
  const rangeStart = Math.max(0, rangeEnd - state.pageSize);

  return {
    ...state,
    focusedRow: newRow,
    visibleRange: [rangeStart, rangeEnd],
  };
}
