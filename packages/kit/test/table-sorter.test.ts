/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import {
  setSort,
  clearSort,
  toggleSort,
  getSortableColumns,
} from '../src/components/table/table-sorter.js';

import type { TableState, TableColumn, InteractiveTableOptions } from '../src/components/table/types.js';

function createTestData(length: number) {
  return Array.from({ length }, (_, i) => ({
    id: i,
    name: `Item ${String.fromCharCode(65 + (i % 26))}`,
    value: Math.floor(Math.random() * 100),
    date: new Date(2024, 0, i + 1),
  }));
}

function createTestState(dataLength: number): TableState<any> {
  const data = createTestData(dataLength);
  return {
    data,
    originalData: data,
    selected: new Set(),
    focusedRow: 0,
    focusedColumn: 0,
    sort: null,
    filterQuery: '',
    isFiltering: false,
    visibleRange: [0, Math.min(10, dataLength)],
    pageSize: 10,
    isEditing: false,
    editValue: '',
  };
}

function createTestOptions(sortableKeys: string[] = []): InteractiveTableOptions<any> {
  const columns: TableColumn<any>[] = [
    { key: 'id', header: 'ID', sortable: sortableKeys.includes('id') },
    { key: 'name', header: 'Name', sortable: sortableKeys.includes('name') },
    { key: 'value', header: 'Value', sortable: sortableKeys.includes('value') },
    { key: 'date', header: 'Date', sortable: sortableKeys.includes('date') },
  ];

  return {
    data: [],
    columns,
    selectable: 'none',
    sortable: true,
    filterable: false,
    pageSize: 10,
    borders: 'single',
  };
}

describe('table-sorter', () => {
  describe('toggleSort', () => {
    it('should set ascending sort on first toggle', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.sort).toEqual({ key: 'id', direction: 'asc' });
    });

    it('should toggle from ascending to descending', () => {
      const state = createTestState(10);
      state.sort = { key: 'id', direction: 'asc' };
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.sort).toEqual({ key: 'id', direction: 'desc' });
    });

    it('should clear sort when toggling from descending', () => {
      const state = createTestState(10);
      state.sort = { key: 'id', direction: 'desc' };
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.sort).toBeNull();
    });

    it('should switch to new column when sorting different column', () => {
      const state = createTestState(10);
      state.sort = { key: 'id', direction: 'asc' };
      const options = createTestOptions(['id', 'name']);

      const newState = toggleSort(state, 'name', options);

      expect(newState.sort).toEqual({ key: 'name', direction: 'asc' });
    });

    it('should not sort non-sortable column', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']); // 'name' is not sortable

      const newState = toggleSort(state, 'name', options);

      expect(newState.sort).toBeNull();
      expect(newState).toBe(state);
    });

    it('should handle non-existent column', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'nonexistent', options);

      expect(newState.sort).toBeNull();
      expect(newState).toBe(state);
    });

    it('should update data when sorting', () => {
      const state = createTestState(5);
      state.data = [
        { id: 3, name: 'C', value: 30 },
        { id: 1, name: 'A', value: 10 },
        { id: 2, name: 'B', value: 20 },
      ];
      state.originalData = [...state.data];
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.data[0].id).toBe(1);
      expect(newState.data[1].id).toBe(2);
      expect(newState.data[2].id).toBe(3);
    });

    it('should sort in descending order', () => {
      const state = createTestState(5);
      state.data = [
        { id: 1, name: 'A', value: 10 },
        { id: 2, name: 'B', value: 20 },
        { id: 3, name: 'C', value: 30 },
      ];
      state.originalData = [...state.data];
      state.sort = { key: 'id', direction: 'asc' };
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.data[0].id).toBe(3);
      expect(newState.data[1].id).toBe(2);
      expect(newState.data[2].id).toBe(1);
    });

    it('should restore original order when clearing sort', () => {
      const state = createTestState(3);
      const originalOrder = [
        { id: 3, name: 'C', value: 30 },
        { id: 1, name: 'A', value: 10 },
        { id: 2, name: 'B', value: 20 },
      ];
      state.data = [...originalOrder];
      state.originalData = [...originalOrder];
      state.sort = { key: 'id', direction: 'desc' };
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.data[0].id).toBe(3);
      expect(newState.data[1].id).toBe(1);
      expect(newState.data[2].id).toBe(2);
    });
  });

  describe('setSort', () => {
    it('should set sort to specified direction', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']);

      const newState = setSort(state, 'id', 'desc', options);

      expect(newState.sort).toEqual({ key: 'id', direction: 'desc' });
    });

    it('should override existing sort', () => {
      const state = createTestState(10);
      state.sort = { key: 'name', direction: 'asc' };
      const options = createTestOptions(['id', 'name']);

      const newState = setSort(state, 'id', 'desc', options);

      expect(newState.sort).toEqual({ key: 'id', direction: 'desc' });
    });

    it('should not sort non-sortable column', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']);

      const newState = setSort(state, 'name', 'asc', options);

      expect(newState.sort).toBeNull();
      expect(newState).toBe(state);
    });

    it('should update data according to sort direction', () => {
      const state = createTestState(3);
      state.data = [
        { id: 2, name: 'B', value: 20 },
        { id: 3, name: 'C', value: 30 },
        { id: 1, name: 'A', value: 10 },
      ];
      state.originalData = [...state.data];
      const options = createTestOptions(['id']);

      const newState = setSort(state, 'id', 'asc', options);

      expect(newState.data[0].id).toBe(1);
      expect(newState.data[1].id).toBe(2);
      expect(newState.data[2].id).toBe(3);
    });
  });

  describe('clearSort', () => {
    it('should clear sort state', () => {
      const state = createTestState(10);
      state.sort = { key: 'id', direction: 'asc' };
      const options = createTestOptions(['id']);

      const newState = clearSort(state, options);

      expect(newState.sort).toBeNull();
    });

    it('should restore original data order', () => {
      const state = createTestState(3);
      const originalOrder = [
        { id: 3, name: 'C', value: 30 },
        { id: 1, name: 'A', value: 10 },
        { id: 2, name: 'B', value: 20 },
      ];
      state.data = [originalOrder[1], originalOrder[2], originalOrder[0]]; // Sorted
      state.originalData = [...originalOrder];
      state.sort = { key: 'id', direction: 'asc' };
      const options = createTestOptions(['id']);

      const newState = clearSort(state, options);

      expect(newState.data[0].id).toBe(3);
      expect(newState.data[1].id).toBe(1);
      expect(newState.data[2].id).toBe(2);
    });

    it('should handle already cleared sort', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']);

      const newState = clearSort(state, options);

      expect(newState.sort).toBeNull();
    });
  });

  describe('getSortableColumns', () => {
    it('should return list of sortable column keys', () => {
      const options = createTestOptions(['id', 'name', 'value']);

      const sortable = getSortableColumns(options);

      expect(sortable).toEqual(['id', 'name', 'value']);
    });

    it('should return empty array when no columns are sortable', () => {
      const options = createTestOptions([]);

      const sortable = getSortableColumns(options);

      expect(sortable).toEqual([]);
    });

    it('should include all columns when sortable is not explicitly set to false', () => {
      const options: InteractiveTableOptions<any> = {
        data: [],
        columns: [
          { key: 'id', header: 'ID' }, // sortable undefined
          { key: 'name', header: 'Name', sortable: true },
          { key: 'value', header: 'Value', sortable: false },
        ],
        selectable: 'none',
        sortable: true,
        filterable: false,
        pageSize: 10,
        borders: 'single',
      };

      const sortable = getSortableColumns(options);

      // Columns with undefined sortable and sortable: true should be included
      expect(sortable).toEqual(['id', 'name']);
    });
  });

  describe('sorting different data types', () => {
    it('should sort numbers correctly', () => {
      const state = createTestState(5);
      state.data = [
        { value: 50 },
        { value: 10 },
        { value: 30 },
        { value: 20 },
        { value: 40 },
      ];
      state.originalData = [...state.data];
      const options: InteractiveTableOptions<any> = {
        data: state.data,
        columns: [{ key: 'value', header: 'Value', sortable: true }],
        selectable: 'none',
        sortable: true,
        filterable: false,
        pageSize: 10,
        borders: 'single',
      };

      const newState = toggleSort(state, 'value', options);

      expect(newState.data.map((r) => r.value)).toEqual([10, 20, 30, 40, 50]);
    });

    it('should sort strings correctly', () => {
      const state = createTestState(5);
      state.data = [
        { name: 'Charlie' },
        { name: 'Alice' },
        { name: 'Eve' },
        { name: 'Bob' },
        { name: 'David' },
      ];
      state.originalData = [...state.data];
      const options: InteractiveTableOptions<any> = {
        data: state.data,
        columns: [{ key: 'name', header: 'Name', sortable: true }],
        selectable: 'none',
        sortable: true,
        filterable: false,
        pageSize: 10,
        borders: 'single',
      };

      const newState = toggleSort(state, 'name', options);

      expect(newState.data.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie', 'David', 'Eve']);
    });

    it('should handle null and undefined values', () => {
      const state = createTestState(5);
      state.data = [
        { value: 5 },
        { value: null },
        { value: 3 },
        { value: undefined },
        { value: 1 },
      ];
      state.originalData = [...state.data];
      const options: InteractiveTableOptions<any> = {
        data: state.data,
        columns: [{ key: 'value', header: 'Value', sortable: true }],
        selectable: 'none',
        sortable: true,
        filterable: false,
        pageSize: 10,
        borders: 'single',
      };

      const newState = toggleSort(state, 'value', options);

      // Null/undefined should be at the end
      const values = newState.data.map((r) => r.value);
      expect(values.slice(0, 3)).toEqual([1, 3, 5]);
    });
  });

  describe('edge cases and immutability', () => {
    it('should maintain state immutability', () => {
      const state = createTestState(10);
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(state.sort).toBeNull();
      expect(newState.sort).not.toBeNull();
      expect(state).not.toBe(newState);
    });

    it('should preserve other state properties', () => {
      const state = createTestState(10);
      state.selected = new Set([state.data[2]]);
      state.filterQuery = 'test';
      state.isFiltering = true;
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.selected).toBe(state.selected);
      expect(newState.filterQuery).toBe(state.filterQuery);
      expect(newState.isFiltering).toBe(state.isFiltering);
    });

    it('should not modify original data array', () => {
      const state = createTestState(3);
      const originalDataRef = state.data;
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.data).not.toBe(originalDataRef);
    });

    it('should handle empty data', () => {
      const state = createTestState(0);
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.sort).toEqual({ key: 'id', direction: 'asc' });
      expect(newState.data).toEqual([]);
    });

    it('should handle single row', () => {
      const state = createTestState(1);
      const options = createTestOptions(['id']);

      const newState = toggleSort(state, 'id', options);

      expect(newState.sort).toEqual({ key: 'id', direction: 'asc' });
      expect(newState.data.length).toBe(1);
    });
  });
});
