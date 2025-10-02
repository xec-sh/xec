/**
 * Table filtering logic
 */

import { updateStateData } from './table-state.js';

import type { TableState, InteractiveTableOptions } from './types.js';

/**
 * Enter filter mode
 */
export function enterFilterMode<T>(state: TableState<T>): TableState<T> {
  return {
    ...state,
    isFiltering: true,
    filterQuery: '',
  };
}

/**
 * Exit filter mode
 */
export function exitFilterMode<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  const newState = {
    ...state,
    isFiltering: false,
  };

  return updateStateData(newState, options);
}

/**
 * Update filter query
 */
export function updateFilterQuery<T>(
  state: TableState<T>,
  query: string,
  options: InteractiveTableOptions<T>
): TableState<T> {
  const newState = {
    ...state,
    filterQuery: query,
  };

  return updateStateData(newState, options);
}

/**
 * Clear filter
 */
export function clearFilter<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  const newState = {
    ...state,
    filterQuery: '',
    isFiltering: false,
  };

  return updateStateData(newState, options);
}

/**
 * Apply current filter to data
 */
export function applyFilter<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  return updateStateData(state, options);
}

/**
 * Toggle filter mode
 */
export function toggleFilterMode<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (state.isFiltering) {
    return exitFilterMode(state, options);
  }
  return enterFilterMode(state);
}

/**
 * Check if filter is active (has query)
 */
export function isFilterActive<T>(state: TableState<T>): boolean {
  return state.filterQuery.length > 0;
}

/**
 * Get filtered row count
 */
export function getFilteredCount<T>(state: TableState<T>): number {
  return state.data.length;
}

/**
 * Handle filter input character
 */
export function handleFilterInput<T>(
  state: TableState<T>,
  char: string,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!state.isFiltering) {
    return state;
  }

  const newQuery = state.filterQuery + char;
  return updateFilterQuery(state, newQuery, options);
}

/**
 * Handle filter backspace
 */
export function handleFilterBackspace<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!state.isFiltering || state.filterQuery.length === 0) {
    return state;
  }

  const newQuery = state.filterQuery.slice(0, -1);
  return updateFilterQuery(state, newQuery, options);
}

/**
 * Clear filter input completely (Ctrl+U)
 */
export function clearFilterInput<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!state.isFiltering) {
    return state;
  }

  return updateFilterQuery(state, '', options);
}
