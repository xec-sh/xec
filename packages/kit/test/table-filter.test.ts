/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import {
  clearFilter,
  exitFilterMode,
  isFilterActive,
  enterFilterMode,
  toggleFilterMode,
  getFilteredCount,
  clearFilterInput,
  updateFilterQuery,
  handleFilterInput,
  handleFilterBackspace,
} from '../src/components/table/table-filter.js';

import type { TableState, TableColumn, InteractiveTableOptions } from '../src/components/table/types.js';

function createTestData() {
  return [
    { id: 1, name: 'Alice', role: 'Developer', email: 'alice@example.com' },
    { id: 2, name: 'Bob', role: 'Designer', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', role: 'Manager', email: 'charlie@example.com' },
    { id: 4, name: 'David', role: 'Developer', email: 'david@example.com' },
    { id: 5, name: 'Eve', role: 'Designer', email: 'eve@example.com' },
  ];
}

function createTestState(): TableState<any> {
  const data = createTestData();
  return {
    data,
    originalData: data,
    selected: new Set(),
    focusedRow: 0,
    focusedColumn: 0,
    sort: null,
    filterQuery: '',
    isFiltering: false,
    visibleRange: [0, 5],
    pageSize: 10,
    isEditing: false,
    editValue: '',
  };
}

function createTestOptions(filterColumns?: string[]): InteractiveTableOptions<any> {
  const columns: TableColumn<any>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'role', header: 'Role' },
    { key: 'email', header: 'Email' },
  ];

  return {
    data: createTestData(),
    columns,
    selectable: 'none',
    sortable: false,
    filterable: true,
    filterColumns,
    pageSize: 10,
    borders: 'single',
  };
}

describe('table-filter', () => {
  describe('enterFilterMode', () => {
    it('should set isFiltering to true', () => {
      const state = createTestState();
      const newState = enterFilterMode(state);

      expect(newState.isFiltering).toBe(true);
    });

    it('should clear filter query', () => {
      const state = createTestState();
      state.filterQuery = 'existing';

      const newState = enterFilterMode(state);

      expect(newState.filterQuery).toBe('');
    });

    it('should preserve other state properties', () => {
      const state = createTestState();
      state.selected = new Set([state.data[0]]);
      state.sort = { key: 'id', direction: 'asc' };

      const newState = enterFilterMode(state);

      expect(newState.selected).toBe(state.selected);
      expect(newState.sort).toBe(state.sort);
    });

    it('should be immutable', () => {
      const state = createTestState();
      const newState = enterFilterMode(state);

      expect(state).not.toBe(newState);
      expect(state.isFiltering).toBe(false);
    });
  });

  describe('exitFilterMode', () => {
    it('should set isFiltering to false', () => {
      const state = createTestState();
      state.isFiltering = true;
      const options = createTestOptions();

      const newState = exitFilterMode(state, options);

      expect(newState.isFiltering).toBe(false);
    });

    it('should update filtered data', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Developer';
      const options = createTestOptions();

      const newState = exitFilterMode(state, options);

      expect(newState.data.length).toBe(2); // Alice and David
    });

    it('should preserve filter query', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'test';
      const options = createTestOptions();

      const newState = exitFilterMode(state, options);

      expect(newState.filterQuery).toBe('test');
    });
  });

  describe('updateFilterQuery', () => {
    it('should update filter query', () => {
      const state = createTestState();
      state.isFiltering = true;
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'Dev', options);

      expect(newState.filterQuery).toBe('Dev');
    });

    it('should filter data based on query', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'Developer', options);

      expect(newState.data.length).toBe(2);
      expect(newState.data.every((r) => r.role === 'Developer')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'developer', options);

      expect(newState.data.length).toBe(2);
    });

    it('should search across all columns by default', () => {
      const state = createTestState();
      const options = createTestOptions();

      const alice = updateFilterQuery(state, 'Alice', options);
      expect(alice.data.length).toBe(1);
      expect(alice.data[0].name).toBe('Alice');

      const developer = updateFilterQuery(state, 'Developer', options);
      expect(developer.data.length).toBe(2);

      const example = updateFilterQuery(state, 'example.com', options);
      expect(example.data.length).toBe(5); // All have example.com in email
    });

    it('should search only specified columns when filterColumns is set', () => {
      const state = createTestState();
      const options = createTestOptions(['name']);

      const byName = updateFilterQuery(state, 'Alice', options);
      expect(byName.data.length).toBe(1);

      // Should not find by role when filtering only name column
      const byRole = updateFilterQuery(state, 'Developer', options);
      expect(byRole.data.length).toBe(0);
    });

    it('should return empty array when no matches', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'nonexistent', options);

      expect(newState.data).toEqual([]);
    });

    it('should return all data when query is empty', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, '', options);

      expect(newState.data.length).toBe(5);
    });

    it('should handle partial matches', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'li', options);

      expect(newState.data.length).toBe(2); // Alice and Charlie
    });

    it('should reset focused row if out of bounds', () => {
      const state = createTestState();
      state.focusedRow = 4; // Last row
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'Alice', options);

      expect(newState.data.length).toBe(1);
      expect(newState.focusedRow).toBe(0);
    });
  });

  describe('clearFilter', () => {
    it('should clear filter query', () => {
      const state = createTestState();
      state.filterQuery = 'test';
      const options = createTestOptions();

      const newState = clearFilter(state, options);

      expect(newState.filterQuery).toBe('');
    });

    it('should exit filter mode', () => {
      const state = createTestState();
      state.isFiltering = true;
      const options = createTestOptions();

      const newState = clearFilter(state, options);

      expect(newState.isFiltering).toBe(false);
    });

    it('should restore all data', () => {
      const state = createTestState();
      state.data = [state.data[0]]; // Filtered to one row
      state.filterQuery = 'Alice';
      const options = createTestOptions();

      const newState = clearFilter(state, options);

      expect(newState.data.length).toBe(5);
    });
  });

  describe('toggleFilterMode', () => {
    it('should enter filter mode when not filtering', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = toggleFilterMode(state, options);

      expect(newState.isFiltering).toBe(true);
    });

    it('should exit filter mode when filtering', () => {
      const state = createTestState();
      state.isFiltering = true;
      const options = createTestOptions();

      const newState = toggleFilterMode(state, options);

      expect(newState.isFiltering).toBe(false);
    });
  });

  describe('isFilterActive', () => {
    it('should return true when filter query is not empty', () => {
      const state = createTestState();
      state.filterQuery = 'test';

      expect(isFilterActive(state)).toBe(true);
    });

    it('should return false when filter query is empty', () => {
      const state = createTestState();

      expect(isFilterActive(state)).toBe(false);
    });
  });

  describe('getFilteredCount', () => {
    it('should return count of filtered data', () => {
      const state = createTestState();
      state.data = state.data.slice(0, 2);

      expect(getFilteredCount(state)).toBe(2);
    });

    it('should return 0 for empty filtered data', () => {
      const state = createTestState();
      state.data = [];

      expect(getFilteredCount(state)).toBe(0);
    });
  });

  describe('handleFilterInput', () => {
    it('should append character to filter query', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Dev';
      const options = createTestOptions();

      const newState = handleFilterInput(state, 'e', options);

      expect(newState.filterQuery).toBe('Deve');
    });

    it('should filter data with new query', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Dev';
      const options = createTestOptions();

      const newState = handleFilterInput(state, 'e', options);

      expect(newState.data.length).toBe(2); // Matches "Deve"
    });

    it('should do nothing when not in filter mode', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = handleFilterInput(state, 'x', options);

      expect(newState).toBe(state);
      expect(newState.filterQuery).toBe('');
    });

    it('should handle special characters', () => {
      const state = createTestState();
      state.isFiltering = true;
      const options = createTestOptions();

      const newState = handleFilterInput(state, '@', options);

      expect(newState.filterQuery).toBe('@');
    });
  });

  describe('handleFilterBackspace', () => {
    it('should remove last character from filter query', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Dev';
      const options = createTestOptions();

      const newState = handleFilterBackspace(state, options);

      expect(newState.filterQuery).toBe('De');
    });

    it('should update filtered data', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Alice';
      state.data = [state.originalData[0]]; // Filtered to Alice
      const options = createTestOptions();

      const newState = handleFilterBackspace(state, options);

      expect(newState.filterQuery).toBe('Alic');
      expect(newState.data.length).toBe(1); // Still matches
    });

    it('should do nothing when query is empty', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = '';
      const options = createTestOptions();

      const newState = handleFilterBackspace(state, options);

      expect(newState).toBe(state);
    });

    it('should do nothing when not in filter mode', () => {
      const state = createTestState();
      state.filterQuery = 'test';
      const options = createTestOptions();

      const newState = handleFilterBackspace(state, options);

      expect(newState).toBe(state);
    });

    it('should expand results when removing restrictive character', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Alice';
      state.data = [state.originalData[0]]; // Only Alice
      const options = createTestOptions();

      const newState = handleFilterBackspace(state, options);

      expect(newState.filterQuery).toBe('Alic');
      expect(newState.data.length).toBe(1); // Still Alice
    });
  });

  describe('clearFilterInput', () => {
    it('should clear filter query completely', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Developer';
      const options = createTestOptions();

      const newState = clearFilterInput(state, options);

      expect(newState.filterQuery).toBe('');
    });

    it('should restore all data', () => {
      const state = createTestState();
      state.isFiltering = true;
      state.filterQuery = 'Alice';
      state.data = [state.originalData[0]];
      const options = createTestOptions();

      const newState = clearFilterInput(state, options);

      expect(newState.data.length).toBe(5);
    });

    it('should do nothing when not in filter mode', () => {
      const state = createTestState();
      state.filterQuery = 'test';
      const options = createTestOptions();

      const newState = clearFilterInput(state, options);

      expect(newState).toBe(state);
    });
  });

  describe('custom filter function', () => {
    it('should use custom filter when provided', () => {
      const state = createTestState();
      const options: InteractiveTableOptions<any> = {
        ...createTestOptions(),
        customFilter: (row, query) => row.id > parseInt(query, 10),
      };

      const newState = updateFilterQuery(state, '2', options);

      expect(newState.data.length).toBe(3); // IDs 3, 4, 5
      expect(newState.data.every((r) => r.id > 2)).toBe(true);
    });

    it('should fall back to default filter when customFilter is not provided', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'Alice', options);

      expect(newState.data.length).toBe(1);
    });
  });

  describe('edge cases and immutability', () => {
    it('should maintain state immutability', () => {
      const state = createTestState();
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'test', options);

      expect(state).not.toBe(newState);
      expect(state.filterQuery).toBe('');
      expect(newState.filterQuery).toBe('test');
    });

    it('should preserve other state properties', () => {
      const state = createTestState();
      state.selected = new Set([state.data[0]]);
      state.sort = { key: 'id', direction: 'asc' };
      const options = createTestOptions();

      const newState = updateFilterQuery(state, 'test', options);

      expect(newState.selected).toBe(state.selected);
      expect(newState.sort).toBe(state.sort);
    });

    it('should handle Unicode characters', () => {
      const state: TableState<any> = {
        data: [
          { name: 'Ñoño' },
          { name: 'José' },
          { name: '日本語' },
        ],
        originalData: [
          { name: 'Ñoño' },
          { name: 'José' },
          { name: '日本語' },
        ],
        selected: new Set(),
        focusedRow: 0,
        focusedColumn: 0,
        sort: null,
        filterQuery: '',
        isFiltering: false,
        visibleRange: [0, 3],
        pageSize: 10,
        isEditing: false,
        editValue: '',
      };

      const options: InteractiveTableOptions<any> = {
        data: state.data,
        columns: [{ key: 'name', header: 'Name' }],
        selectable: 'none',
        sortable: false,
        filterable: true,
        pageSize: 10,
        borders: 'single',
      };

      const newState = updateFilterQuery(state, 'José', options);
      expect(newState.data.length).toBe(1);
      expect(newState.data[0].name).toBe('José');
    });

    it('should handle very long filter queries', () => {
      const state = createTestState();
      const options = createTestOptions();
      const longQuery = 'a'.repeat(1000);

      const newState = updateFilterQuery(state, longQuery, options);

      expect(newState.filterQuery).toBe(longQuery);
      expect(newState.data).toEqual([]);
    });
  });
});
