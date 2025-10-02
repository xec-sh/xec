/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import {
  createTableState,
} from '../src/components/table/table-state.js';
import { clearSort, toggleSort } from '../src/components/table/table-sorter.js';
import {
  selectAll,
  clearSelection,
  toggleSelection,
} from '../src/components/table/table-selector.js';
import {
  clearFilter,
  exitFilterMode,
  enterFilterMode,
  updateFilterQuery,
} from '../src/components/table/table-filter.js';
import {
  navigateUp,
  navigateDown,
  navigateLast,
  navigateFirst,
  navigatePageDown,
} from '../src/components/table/table-navigator.js';

import type { InteractiveTableOptions } from '../src/components/table/types.js';

function createTestData() {
  return [
    { id: 1, name: 'Alice', role: 'Developer', salary: 90000, active: true },
    { id: 2, name: 'Bob', role: 'Designer', salary: 80000, active: true },
    { id: 3, name: 'Charlie', role: 'Manager', salary: 100000, active: false },
    { id: 4, name: 'David', role: 'Developer', salary: 95000, active: true },
    { id: 5, name: 'Eve', role: 'Designer', salary: 85000, active: true },
    { id: 6, name: 'Frank', role: 'Developer', salary: 92000, active: false },
    { id: 7, name: 'Grace', role: 'Manager', salary: 105000, active: true },
    { id: 8, name: 'Henry', role: 'Developer', salary: 88000, active: true },
    { id: 9, name: 'Iris', role: 'Designer', salary: 82000, active: false },
    { id: 10, name: 'Jack', role: 'Developer', salary: 94000, active: true },
  ];
}

function createTestOptions(overrides?: Partial<InteractiveTableOptions<any>>): InteractiveTableOptions<any> {
  return {
    data: createTestData(),
    columns: [
      { key: 'id', header: 'ID', sortable: true },
      { key: 'name', header: 'Name', sortable: true },
      { key: 'role', header: 'Role', sortable: true },
      { key: 'salary', header: 'Salary', sortable: true },
      { key: 'active', header: 'Active', sortable: true },
    ],
    selectable: 'multiple',
    sortable: true,
    filterable: true,
    pageSize: 5,
    borders: 'single',
    ...overrides,
  };
}

describe('table-integration', () => {
  describe('Full navigation flow', () => {
    it('should navigate through entire table', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Start at top
      expect(state.focusedRow).toBe(0);
      expect(state.data[state.focusedRow].name).toBe('Alice');

      // Navigate down 3 times
      state = navigateDown(state);
      state = navigateDown(state);
      state = navigateDown(state);
      expect(state.focusedRow).toBe(3);
      expect(state.data[state.focusedRow].name).toBe('David');

      // Jump to end
      state = navigateLast(state);
      expect(state.focusedRow).toBe(9);
      expect(state.data[state.focusedRow].name).toBe('Jack');

      // Navigate up
      state = navigateUp(state);
      expect(state.focusedRow).toBe(8);
      expect(state.data[state.focusedRow].name).toBe('Iris');

      // Jump to start
      state = navigateFirst(state);
      expect(state.focusedRow).toBe(0);
      expect(state.data[state.focusedRow].name).toBe('Alice');

      // Page down
      state = navigatePageDown(state);
      expect(state.focusedRow).toBe(5);
      expect(state.data[state.focusedRow].name).toBe('Frank');
    });

    it('should maintain viewport correctly during navigation', () => {
      const options = createTestOptions({ pageSize: 3 });
      let state = createTableState(createTestData(), options);

      expect(state.visibleRange).toEqual([0, 3]);

      // Navigate to position 5
      for (let i = 0; i < 5; i++) {
        state = navigateDown(state);
      }

      // Viewport should have scrolled
      expect(state.focusedRow).toBe(5);
      expect(state.visibleRange[0]).toBeLessThanOrEqual(5);
      expect(state.visibleRange[1]).toBeGreaterThan(5);
    });
  });

  describe('Selection scenarios', () => {
    it('should handle single selection with navigation', () => {
      const options = createTestOptions({ selectable: 'single' });
      let state = createTableState(createTestData(), options);

      // Select first row
      state = toggleSelection(state, 'single');
      expect(state.selected.size).toBe(1);
      expect(state.selected.has(state.data[0])).toBe(true);

      // Navigate and select another
      state = navigateDown(state);
      state = navigateDown(state);
      state = toggleSelection(state, 'single');

      // Should have only new selection
      expect(state.selected.size).toBe(1);
      expect(state.selected.has(state.data[2])).toBe(true);
      expect(state.selected.has(state.data[0])).toBe(false);
    });

    it('should handle multiple selection with navigation', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Select first row
      state = toggleSelection(state, 'multiple');
      expect(state.selected.size).toBe(1);

      // Navigate and select more
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');

      // Should have 3 selections
      expect(state.selected.size).toBe(3);
      expect(state.selected.has(state.data[0])).toBe(true);
      expect(state.selected.has(state.data[1])).toBe(true);
      expect(state.selected.has(state.data[2])).toBe(true);
    });

    it('should select all and then deselect individual rows', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Select all
      state = selectAll(state);
      expect(state.selected.size).toBe(10);

      // Navigate and deselect
      state = navigateDown(state);
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple'); // Deselect row 2

      expect(state.selected.size).toBe(9);
      expect(state.selected.has(state.data[2])).toBe(false);
    });
  });

  describe('Sorting with different data types', () => {
    it('should sort numbers correctly', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Sort by salary (ascending)
      state = toggleSort(state, 'salary', options);

      expect(state.data[0].salary).toBe(80000);
      expect(state.data[9].salary).toBe(105000);

      // Toggle to descending
      state = toggleSort(state, 'salary', options);

      expect(state.data[0].salary).toBe(105000);
      expect(state.data[9].salary).toBe(80000);
    });

    it('should sort strings correctly', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Sort by name
      state = toggleSort(state, 'name', options);

      expect(state.data[0].name).toBe('Alice');
      expect(state.data[9].name).toBe('Jack');
    });

    it('should sort booleans correctly', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Sort by active
      state = toggleSort(state, 'active', options);

      const firstHalf = state.data.slice(0, 5);
      const secondHalf = state.data.slice(5);

      // Should group by true/false
      const allFalseFirst = firstHalf.every((r) => !r.active);
      const allTrueSecond = secondHalf.every((r) => r.active);

      expect(allFalseFirst || allTrueSecond).toBe(true);
    });

    it('should maintain selection after sorting', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Select some rows
      const selectedRows = [state.data[1], state.data[5], state.data[8]];
      state.selected = new Set(selectedRows);

      // Sort
      state = toggleSort(state, 'name', options);

      // Selection should be maintained
      expect(state.selected.size).toBe(3);
      selectedRows.forEach((row) => {
        expect(state.selected.has(row)).toBe(true);
      });
    });
  });

  describe('Filtering with various patterns', () => {
    it('should filter by single term', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Developer', options);

      expect(state.data.length).toBe(5);
      expect(state.data.every((r) => r.role === 'Developer')).toBe(true);
    });

    it('should filter case-insensitively', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'developer', options);

      expect(state.data.length).toBe(5);
    });

    it('should handle partial matches', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Dev', options);

      expect(state.data.length).toBe(5);
    });

    it('should update results as query changes', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Broad filter
      state = updateFilterQuery(state, 'a', options);
      const broadCount = state.data.length;
      expect(broadCount).toBeGreaterThan(0);

      // Narrower filter
      state = updateFilterQuery(state, 'al', options);
      const narrowCount = state.data.length;
      expect(narrowCount).toBeLessThanOrEqual(broadCount);

      // Very specific
      state = updateFilterQuery(state, 'alice', options);
      expect(state.data.length).toBe(1);
      expect(state.data[0].name).toBe('Alice');
    });

    it('should adjust focus when filtered results change', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Navigate to last row
      state = navigateLast(state);
      expect(state.focusedRow).toBe(9);

      // Filter to only 2 results
      state = updateFilterQuery(state, 'Manager', options);
      expect(state.data.length).toBe(2);

      // Focus should be adjusted to last available row
      expect(state.focusedRow).toBe(1); // Last row in filtered results
      expect(state.focusedRow).toBeLessThan(state.data.length);
    });
  });

  describe('Combined operations', () => {
    it('should handle filter + sort + navigate', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Filter for developers
      state = updateFilterQuery(state, 'Developer', options);
      expect(state.data.length).toBe(5);

      // Sort by salary
      state = toggleSort(state, 'salary', options);
      expect(state.data[0].name).toBe('Henry'); // Lowest salary developer
      expect(state.data[4].name).toBe('David'); // Highest salary developer

      // Navigate to third result
      state = navigateDown(state);
      state = navigateDown(state);
      expect(state.focusedRow).toBe(2);
      expect(state.data[state.focusedRow].role).toBe('Developer');
    });

    it('should handle filter + sort + select', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Filter
      state = updateFilterQuery(state, 'Designer', options);
      expect(state.data.length).toBe(3);

      // Sort
      state = toggleSort(state, 'name', options);

      // Select all filtered results
      state = selectAll(state);
      expect(state.selected.size).toBe(3);

      // All selected should be designers
      Array.from(state.selected).forEach((row: any) => {
        expect(row.role).toBe('Designer');
      });

      // Clear filter but keep selection
      state = clearFilter(state, options);
      expect(state.data.length).toBe(10);
      expect(state.selected.size).toBe(3); // Selection maintained
    });

    it('should handle sort + filter (order matters)', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Sort first
      state = toggleSort(state, 'salary', options);

      // Then filter
      state = updateFilterQuery(state, 'Developer', options);

      // Results should be filtered AND sorted
      expect(state.data.length).toBe(5);
      expect(state.data[0].salary).toBeLessThan(state.data[4].salary);
      expect(state.data.every((r) => r.role === 'Developer')).toBe(true);
    });

    it('should handle full workflow: navigate + select + filter + clear filter + sort', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // 1. Navigate and select few rows
      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');
      expect(state.selected.size).toBe(2);

      // 2. Apply filter (may remove selected rows from view)
      state = updateFilterQuery(state, 'Manager', options);
      expect(state.data.length).toBe(2);

      // 3. Select filtered results
      state = selectAll(state);
      expect(state.selected.size).toBe(2); // All managers

      // 4. Clear filter
      state = clearFilter(state, options);
      expect(state.data.length).toBe(10);
      expect(state.selected.size).toBe(2); // Selection preserved

      // 5. Sort all data
      state = toggleSort(state, 'name', options);
      expect(state.data[0].name).toBe('Alice');

      // 6. Selection should still be valid
      expect(state.selected.size).toBe(2);
    });

    it('should handle clearing operations in different orders', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Setup: filter + sort + select
      state = updateFilterQuery(state, 'Developer', options);
      state = toggleSort(state, 'salary', options);
      state = selectAll(state);

      expect(state.data.length).toBe(5);
      expect(state.selected.size).toBe(5);
      expect(state.sort).not.toBeNull();

      // Clear sort first
      state = clearSort(state, options);
      expect(state.sort).toBeNull();
      expect(state.data.length).toBe(5); // Filter still active
      expect(state.selected.size).toBe(5); // Selection preserved

      // Clear selection
      state = clearSelection(state);
      expect(state.selected.size).toBe(0);
      expect(state.data.length).toBe(5); // Filter still active

      // Clear filter
      state = clearFilter(state, options);
      expect(state.data.length).toBe(10);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty table gracefully', () => {
      const options = createTestOptions();
      let state = createTableState([], options);

      expect(state.data.length).toBe(0);
      expect(state.focusedRow).toBe(0);

      // Navigation should not crash
      state = navigateDown(state);
      state = navigateUp(state);
      expect(state.focusedRow).toBe(0);

      // Selection should not crash
      state = toggleSelection(state, 'multiple');
      expect(state.selected.size).toBe(0);

      // Filter should not crash
      state = updateFilterQuery(state, 'test', options);
      expect(state.data.length).toBe(0);
    });

    it('should handle single row table', () => {
      const singleRow = [createTestData()[0]];
      const options = createTestOptions();
      let state = createTableState(singleRow, options);

      expect(state.data.length).toBe(1);

      // Navigation should stay on same row
      state = navigateDown(state);
      expect(state.focusedRow).toBe(0);

      state = navigateUp(state);
      expect(state.focusedRow).toBe(0);

      // Selection should work
      state = toggleSelection(state, 'single');
      expect(state.selected.size).toBe(1);
    });

    it('should handle filter that returns no results', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state.focusedRow = 5;

      state = updateFilterQuery(state, 'nonexistent', options);

      expect(state.data.length).toBe(0);
      expect(state.focusedRow).toBe(0);
    });

    it('should handle mode transitions correctly', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Enter filter mode
      state = enterFilterMode(state);
      expect(state.isFiltering).toBe(true);
      expect(state.filterQuery).toBe('');

      // Type some query
      state = updateFilterQuery(state, 'test', options);
      expect(state.filterQuery).toBe('test');

      // Exit filter mode
      state = exitFilterMode(state, options);
      expect(state.isFiltering).toBe(false);
      expect(state.filterQuery).toBe('test'); // Query preserved

      // Can enter again
      state = enterFilterMode(state);
      expect(state.isFiltering).toBe(true);
      expect(state.filterQuery).toBe(''); // Reset on entry
    });
  });

  describe('State consistency', () => {
    it('should maintain consistent state through complex operations', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Record initial data references
      const originalData = state.originalData;

      // Perform many operations
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');
      state = updateFilterQuery(state, 'Dev', options);
      state = toggleSort(state, 'name', options);
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');
      state = clearFilter(state, options);
      state = navigatePageDown(state);

      // Original data should never change
      expect(state.originalData).toBe(originalData);
      expect(state.originalData.length).toBe(10);

      // Data length should match (no filter active)
      expect(state.data.length).toBe(10);

      // Selected should be valid
      expect(state.selected.size).toBeLessThanOrEqual(10);

      // FocusedRow should be in bounds
      expect(state.focusedRow).toBeGreaterThanOrEqual(0);
      expect(state.focusedRow).toBeLessThan(state.data.length);
    });

    it('should never mutate input data', () => {
      const originalData = createTestData();
      const originalCopy = JSON.parse(JSON.stringify(originalData));

      const options = createTestOptions();
      let state = createTableState(originalData, options);

      // Perform operations
      state = updateFilterQuery(state, 'test', options);
      state = toggleSort(state, 'name', options);
      state = clearSort(state, options);

      // Original data should be unchanged
      expect(JSON.stringify(originalData)).toBe(JSON.stringify(originalCopy));
    });
  });
});
