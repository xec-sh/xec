/**
 * Table sorting logic
 */

import { updateStateData } from './table-state.js';

import type { TableState, SortColumn, SortDirection, InteractiveTableOptions } from './types.js';

/**
 * Toggle sort on a column
 */
export function toggleSort<T>(
  state: TableState<T>,
  columnKey: string,
  options: InteractiveTableOptions<T>
): TableState<T> {
  // Check if column is sortable
  const column = options.columns.find((c) => String(c.key) === columnKey);
  if (!column || column.sortable === false) {
    return state;
  }

  let newSort: SortColumn | null = null;

  if (state.sort && state.sort.key === columnKey) {
    // Already sorting this column - toggle direction
    if (state.sort.direction === 'asc') {
      newSort = { key: columnKey, direction: 'desc' };
    } else {
      // Was desc, now clear sort
      newSort = null;
    }
  } else {
    // Start sorting this column in ascending order
    newSort = { key: columnKey, direction: 'asc' };
  }

  const newState = {
    ...state,
    sort: newSort,
  };

  return updateStateData(newState, options);
}

/**
 * Set sort directly
 */
export function setSort<T>(
  state: TableState<T>,
  columnKey: string,
  direction: SortDirection,
  options: InteractiveTableOptions<T>
): TableState<T> {
  const column = options.columns.find((c) => String(c.key) === columnKey);
  if (!column || column.sortable === false) {
    return state;
  }

  const newState = {
    ...state,
    sort: { key: columnKey, direction },
  };

  return updateStateData(newState, options);
}

/**
 * Clear sort
 */
export function clearSort<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  const newState = {
    ...state,
    sort: null,
  };

  return updateStateData(newState, options);
}

/**
 * Get sortable columns
 */
export function getSortableColumns<T>(options: InteractiveTableOptions<T>): string[] {
  return options.columns.filter((c) => c.sortable !== false).map((c) => String(c.key));
}
