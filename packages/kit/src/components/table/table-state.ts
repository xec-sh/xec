/**
 * Table state management
 */

import type { TableState, SortColumn, InteractiveTableOptions } from './types.js';

/**
 * Create initial table state
 */
export function createTableState<T>(
  data: T[],
  options: InteractiveTableOptions<T>
): TableState<T> {
  const pageSize = options.pageSize ?? 10;

  return {
    data,
    originalData: [...data],
    selected: new Set(options.initialSelection ?? []),
    focusedRow: 0,
    focusedColumn: 0,
    sort: options.initialSort ?? null,
    filterQuery: '',
    isFiltering: false,
    visibleRange: [0, Math.min(pageSize, data.length)],
    pageSize,
    isEditing: false,
    editValue: '',
  };
}

/**
 * Apply filter to data
 */
export function filterData<T>(
  data: T[],
  query: string,
  options: InteractiveTableOptions<T>
): T[] {
  if (!query) {
    return data;
  }

  if (options.customFilter) {
    return data.filter((row) => options.customFilter!(row, query));
  }

  const lowerQuery = query.toLowerCase();
  const filterColumns = options.filterColumns ?? options.columns.map((c) => String(c.key));

  return data.filter((row) => {
    for (const key of filterColumns) {
      const value = (row as any)[key];
      if (value != null && String(value).toLowerCase().includes(lowerQuery)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Sort data
 */
export function sortData<T>(data: T[], sort: SortColumn | null): T[] {
  if (!sort) {
    return data;
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = (a as any)[sort.key];
    const bVal = (b as any)[sort.key];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal);
    const bStr = String(bVal);
    const comparison = aStr.localeCompare(bStr);

    return sort.direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Update state with new data (filter + sort)
 */
export function updateStateData<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  let data = state.originalData;

  // Apply filter
  if (state.filterQuery) {
    data = filterData(data, state.filterQuery, options);
  }

  // Apply sort
  if (state.sort) {
    data = sortData(data, state.sort);
  }

  return {
    ...state,
    data,
    focusedRow: Math.min(state.focusedRow, Math.max(0, data.length - 1)),
  };
}
