/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import {
  sortData,
  filterData,
  updateStateData,
  createTableState,
} from '../src/components/table/table-state.js';

import type { SortColumn, TableColumn, InteractiveTableOptions } from '../src/components/table/types.js';

function createTestData() {
  return [
    { id: 3, name: 'Charlie', age: 35, role: 'Manager' },
    { id: 1, name: 'Alice', age: 30, role: 'Developer' },
    { id: 2, name: 'Bob', age: 25, role: 'Designer' },
    { id: 5, name: 'Eve', age: 28, role: 'Developer' },
    { id: 4, name: 'David', age: 32, role: 'Developer' },
  ];
}

function createTestOptions(overrides?: Partial<InteractiveTableOptions<any>>): InteractiveTableOptions<any> {
  const columns: TableColumn<any>[] = [
    { key: 'id', header: 'ID', sortable: true },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'age', header: 'Age', sortable: true },
    { key: 'role', header: 'Role', sortable: true },
  ];

  return {
    data: createTestData(),
    columns,
    selectable: 'none',
    sortable: true,
    filterable: true,
    pageSize: 10,
    borders: 'single',
    ...overrides,
  };
}

describe('table-state', () => {
  describe('createTableState', () => {
    it('should create initial state with provided data', () => {
      const data = createTestData();
      const options = createTestOptions();

      const state = createTableState(data, options);

      expect(state.data).toBe(data);
      expect(state.originalData).toEqual(data);
      expect(state.originalData).not.toBe(data);
    });

    it('should initialize with empty selection', () => {
      const data = createTestData();
      const options = createTestOptions();

      const state = createTableState(data, options);

      expect(state.selected).toBeInstanceOf(Set);
      expect(state.selected.size).toBe(0);
    });

    it('should initialize with initialSelection when provided', () => {
      const data = createTestData();
      const options = createTestOptions({
        initialSelection: [data[0], data[2]],
      });

      const state = createTableState(data, options);

      expect(state.selected.size).toBe(2);
      expect(state.selected.has(data[0])).toBe(true);
      expect(state.selected.has(data[2])).toBe(true);
    });

    it('should initialize with focusedRow at 0', () => {
      const data = createTestData();
      const options = createTestOptions();

      const state = createTableState(data, options);

      expect(state.focusedRow).toBe(0);
    });

    it('should initialize with null sort', () => {
      const data = createTestData();
      const options = createTestOptions();

      const state = createTableState(data, options);

      expect(state.sort).toBeNull();
    });

    it('should initialize with initialSort when provided', () => {
      const data = createTestData();
      const options = createTestOptions({
        initialSort: { key: 'name', direction: 'asc' },
      });

      const state = createTableState(data, options);

      expect(state.sort).toEqual({ key: 'name', direction: 'asc' });
    });

    it('should initialize with empty filter query', () => {
      const data = createTestData();
      const options = createTestOptions();

      const state = createTableState(data, options);

      expect(state.filterQuery).toBe('');
      expect(state.isFiltering).toBe(false);
    });

    it('should set visible range based on page size', () => {
      const data = createTestData();
      const options = createTestOptions({ pageSize: 3 });

      const state = createTableState(data, options);

      expect(state.visibleRange).toEqual([0, 3]);
    });

    it('should cap visible range at data length', () => {
      const data = createTestData();
      const options = createTestOptions({ pageSize: 100 });

      const state = createTableState(data, options);

      expect(state.visibleRange).toEqual([0, 5]);
    });

    it('should handle empty data', () => {
      const options = createTestOptions();

      const state = createTableState([], options);

      expect(state.data).toEqual([]);
      expect(state.originalData).toEqual([]);
      expect(state.visibleRange).toEqual([0, 0]);
    });
  });

  describe('filterData', () => {
    it('should return all data when query is empty', () => {
      const data = createTestData();
      const options = createTestOptions();

      const filtered = filterData(data, '', options);

      expect(filtered).toBe(data);
    });

    it('should filter by matching any column', () => {
      const data = createTestData();
      const options = createTestOptions();

      const filtered = filterData(data, 'Developer', options);

      expect(filtered.length).toBe(3);
      expect(filtered.every((r) => r.role === 'Developer')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const data = createTestData();
      const options = createTestOptions();

      const filtered = filterData(data, 'alice', options);

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Alice');
    });

    it('should filter only specified columns when filterColumns provided', () => {
      const data = createTestData();
      const options = createTestOptions({
        filterColumns: ['name'],
      });

      const filtered = filterData(data, 'Alice', options);
      expect(filtered.length).toBe(1);

      const filtered2 = filterData(data, 'Developer', options);
      expect(filtered2.length).toBe(0); // Role not in filterColumns
    });

    it('should use custom filter function when provided', () => {
      const data = createTestData();
      const options = createTestOptions({
        customFilter: (row, query) => row.age > parseInt(query, 10),
      });

      const filtered = filterData(data, '30', options);

      expect(filtered.length).toBe(2); // Charlie (35) and David (32)
      expect(filtered.every((r) => r.age > 30)).toBe(true);
    });

    it('should handle partial matches', () => {
      const data = createTestData();
      const options = createTestOptions();

      const filtered = filterData(data, 'ar', options);

      expect(filtered.length).toBe(1); // Charlie (contains 'ar')
      expect(filtered[0].name).toBe('Charlie');
    });

    it('should return empty array when no matches', () => {
      const data = createTestData();
      const options = createTestOptions();

      const filtered = filterData(data, 'nonexistent', options);

      expect(filtered).toEqual([]);
    });

    it('should handle null and undefined values', () => {
      const data = [
        { id: 1, name: 'Alice', value: null },
        { id: 2, name: null, value: 'test' },
        { id: 3, name: 'Bob', value: undefined },
      ];
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'value', header: 'Value' },
        ],
        selectable: 'none',
        sortable: false,
        filterable: true,
        pageSize: 10,
        borders: 'single',
      };

      const filtered = filterData(data, 'Alice', options);

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Alice');
    });

    it('should not modify original data', () => {
      const data = createTestData();
      const options = createTestOptions();
      const originalLength = data.length;

      filterData(data, 'Developer', options);

      expect(data.length).toBe(originalLength);
    });
  });

  describe('sortData', () => {
    it('should return original data when sort is null', () => {
      const data = createTestData();

      const sorted = sortData(data, null);

      expect(sorted).toBe(data);
    });

    it('should sort in ascending order', () => {
      const data = createTestData();
      const sort: SortColumn = { key: 'id', direction: 'asc' };

      const sorted = sortData(data, sort);

      expect(sorted.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should sort in descending order', () => {
      const data = createTestData();
      const sort: SortColumn = { key: 'id', direction: 'desc' };

      const sorted = sortData(data, sort);

      expect(sorted.map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
    });

    it('should sort strings correctly', () => {
      const data = createTestData();
      const sort: SortColumn = { key: 'name', direction: 'asc' };

      const sorted = sortData(data, sort);

      expect(sorted.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie', 'David', 'Eve']);
    });

    it('should sort numbers correctly', () => {
      const data = createTestData();
      const sort: SortColumn = { key: 'age', direction: 'asc' };

      const sorted = sortData(data, sort);

      expect(sorted.map((r) => r.age)).toEqual([25, 28, 30, 32, 35]);
    });

    it('should handle null and undefined values', () => {
      const data = [
        { id: 1, value: 5 },
        { id: 2, value: null },
        { id: 3, value: 3 },
        { id: 4, value: undefined },
        { id: 5, value: 1 },
      ];
      const sort: SortColumn = { key: 'value', direction: 'asc' };

      const sorted = sortData(data, sort);

      // Non-null values should be sorted, nulls at end
      const values = sorted.map((r) => r.value);
      expect(values.slice(0, 3)).toEqual([1, 3, 5]);
    });

    it('should create new array', () => {
      const data = createTestData();
      const sort: SortColumn = { key: 'id', direction: 'asc' };

      const sorted = sortData(data, sort);

      expect(sorted).not.toBe(data);
    });

    it('should handle empty data', () => {
      const sort: SortColumn = { key: 'id', direction: 'asc' };

      const sorted = sortData([], sort);

      expect(sorted).toEqual([]);
    });

    it('should handle single item', () => {
      const data = [{ id: 1, name: 'Single' }];
      const sort: SortColumn = { key: 'id', direction: 'asc' };

      const sorted = sortData(data, sort);

      expect(sorted.length).toBe(1);
      expect(sorted[0]).toBe(data[0]);
    });
  });

  describe('updateStateData', () => {
    it('should apply both filter and sort', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      state.filterQuery = 'Developer';
      state.sort = { key: 'age', direction: 'asc' };

      const newState = updateStateData(state, options);

      expect(newState.data.length).toBe(3); // Filtered to developers
      expect(newState.data.map((r) => r.age)).toEqual([28, 30, 32]); // Sorted by age
    });

    it('should apply filter before sort', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      state.filterQuery = 'Developer';
      state.sort = { key: 'name', direction: 'asc' };

      const newState = updateStateData(state, options);

      expect(newState.data.map((r) => r.name)).toEqual(['Alice', 'David', 'Eve']);
    });

    it('should only filter when no sort', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      state.filterQuery = 'Developer';

      const newState = updateStateData(state, options);

      expect(newState.data.length).toBe(3);
      expect(newState.data.every((r) => r.role === 'Developer')).toBe(true);
    });

    it('should only sort when no filter', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      state.sort = { key: 'id', direction: 'asc' };

      const newState = updateStateData(state, options);

      expect(newState.data.length).toBe(5);
      expect(newState.data.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return original data when no filter or sort', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      const newState = updateStateData(state, options);

      expect(newState.data).toBe(state.originalData);
    });

    it('should reset focusedRow if out of bounds', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      state.focusedRow = 4; // Last row
      state.filterQuery = 'Alice'; // Will result in only 1 row

      const newState = updateStateData(state, options);

      expect(newState.focusedRow).toBe(0);
    });

    it('should preserve focusedRow if still in bounds', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      state.focusedRow = 1;
      state.filterQuery = 'Developer'; // Will result in 3 rows

      const newState = updateStateData(state, options);

      expect(newState.focusedRow).toBe(1);
    });

    it('should create new state object', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);

      const newState = updateStateData(state, options);

      expect(newState).not.toBe(state);
    });

    it('should preserve selection', () => {
      const data = createTestData();
      const options = createTestOptions();
      const state = createTableState(data, options);
      state.selected = new Set([data[0]]);

      state.sort = { key: 'id', direction: 'asc' };

      const newState = updateStateData(state, options);

      expect(newState.selected).toBe(state.selected);
    });
  });

  describe('integration scenarios', () => {
    it('should handle filter, sort, and selection together', () => {
      const data = createTestData();
      const options = createTestOptions();
      let state = createTableState(data, options);

      // Add some selections
      state.selected = new Set([data[0], data[2]]);

      // Apply filter
      state.filterQuery = 'Developer';
      state = updateStateData(state, options);

      expect(state.data.length).toBe(3);
      expect(state.selected.size).toBe(2); // Selection preserved

      // Apply sort
      state.sort = { key: 'age', direction: 'desc' };
      state = updateStateData(state, options);

      expect(state.data.map((r) => r.age)).toEqual([32, 30, 28]);
      expect(state.selected.size).toBe(2); // Selection still preserved

      // Clear filter
      state.filterQuery = '';
      state = updateStateData(state, options);

      expect(state.data.length).toBe(5);
      expect(state.data.map((r) => r.age)).toEqual([35, 32, 30, 28, 25]); // Still sorted
    });

    it('should handle changing filter with active sort', () => {
      const data = createTestData();
      const options = createTestOptions();
      let state = createTableState(data, options);

      // Set sort
      state.sort = { key: 'name', direction: 'asc' };
      state = updateStateData(state, options);

      // Filter for developers
      state.filterQuery = 'Developer';
      state = updateStateData(state, options);
      expect(state.data.map((r) => r.name)).toEqual(['Alice', 'David', 'Eve']);

      // Change filter
      state.filterQuery = 'Designer';
      state = updateStateData(state, options);
      expect(state.data.map((r) => r.name)).toEqual(['Bob']); // Still sorted
    });

    it('should handle edge case with empty results after filter and sort', () => {
      const data = createTestData();
      const options = createTestOptions();
      let state = createTableState(data, options);

      state.filterQuery = 'nonexistent';
      state.sort = { key: 'id', direction: 'asc' };
      state = updateStateData(state, options);

      expect(state.data).toEqual([]);
      expect(state.focusedRow).toBe(0);
    });
  });
});
