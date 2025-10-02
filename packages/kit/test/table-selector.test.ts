/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import {
  selectAll,
  isSelected,
  clearSelection,
  toggleSelection,
  getSelectionCount,
} from '../src/components/table/table-selector.js';

import type { TableState } from '../src/components/table/types.js';

function createTestState(focusedRow: number, dataLength: number): TableState<any> {
  const data = Array.from({ length: dataLength }, (_, i) => ({ id: i, name: `Item ${i}` }));
  return {
    data,
    originalData: data,
    selected: new Set(),
    focusedRow,
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

describe('table-selector', () => {
  describe('toggleSelection - single mode', () => {
    it('should select the focused row when nothing is selected', () => {
      const state = createTestState(3, 10);
      const newState = toggleSelection(state, 'single');

      expect(newState.selected.size).toBe(1);
      expect(newState.selected.has(state.data[3])).toBe(true);
    });

    it('should deselect the focused row if it is selected', () => {
      const state = createTestState(3, 10);
      state.selected = new Set([state.data[3]]);

      const newState = toggleSelection(state, 'single');

      expect(newState.selected.size).toBe(0);
    });

    it('should replace previous selection with new selection', () => {
      const state = createTestState(5, 10);
      state.selected = new Set([state.data[2]]);

      const newState = toggleSelection(state, 'single');

      expect(newState.selected.size).toBe(1);
      expect(newState.selected.has(state.data[5])).toBe(true);
      expect(newState.selected.has(state.data[2])).toBe(false);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = toggleSelection(state, 'single');

      expect(newState.selected.size).toBe(0);
    });

    it('should handle focused row out of bounds', () => {
      const state = createTestState(10, 5);
      const newState = toggleSelection(state, 'single');

      expect(newState.selected.size).toBe(0);
    });
  });

  describe('toggleSelection - multiple mode', () => {
    it('should add the focused row to selection', () => {
      const state = createTestState(3, 10);
      const newState = toggleSelection(state, 'multiple');

      expect(newState.selected.size).toBe(1);
      expect(newState.selected.has(state.data[3])).toBe(true);
    });

    it('should remove the focused row if already selected', () => {
      const state = createTestState(3, 10);
      state.selected = new Set([state.data[3]]);

      const newState = toggleSelection(state, 'multiple');

      expect(newState.selected.size).toBe(0);
    });

    it('should keep previous selections when adding new one', () => {
      const state = createTestState(5, 10);
      state.selected = new Set([state.data[2], state.data[3]]);

      const newState = toggleSelection(state, 'multiple');

      expect(newState.selected.size).toBe(3);
      expect(newState.selected.has(state.data[2])).toBe(true);
      expect(newState.selected.has(state.data[3])).toBe(true);
      expect(newState.selected.has(state.data[5])).toBe(true);
    });

    it('should keep other selections when removing one', () => {
      const state = createTestState(3, 10);
      state.selected = new Set([state.data[2], state.data[3], state.data[5]]);

      const newState = toggleSelection(state, 'multiple');

      expect(newState.selected.size).toBe(2);
      expect(newState.selected.has(state.data[2])).toBe(true);
      expect(newState.selected.has(state.data[3])).toBe(false);
      expect(newState.selected.has(state.data[5])).toBe(true);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = toggleSelection(state, 'multiple');

      expect(newState.selected.size).toBe(0);
    });
  });

  describe('selectAll', () => {
    it('should select all rows', () => {
      const state = createTestState(0, 10);
      const newState = selectAll(state);

      expect(newState.selected.size).toBe(10);
      state.data.forEach((row) => {
        expect(newState.selected.has(row)).toBe(true);
      });
    });

    it('should handle already selected rows', () => {
      const state = createTestState(0, 10);
      state.selected = new Set([state.data[2], state.data[5]]);

      const newState = selectAll(state);

      expect(newState.selected.size).toBe(10);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = selectAll(state);

      expect(newState.selected.size).toBe(0);
    });

    it('should select only visible/filtered data', () => {
      const state = createTestState(0, 10);
      // Simulate filtered data - only 5 rows visible
      state.data = state.data.slice(0, 5);

      const newState = selectAll(state);

      expect(newState.selected.size).toBe(5);
    });

    it('should create new Set instance', () => {
      const state = createTestState(0, 10);
      const newState = selectAll(state);

      expect(newState.selected).not.toBe(state.selected);
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      const state = createTestState(0, 10);
      state.selected = new Set([state.data[2], state.data[5], state.data[8]]);

      const newState = clearSelection(state);

      expect(newState.selected.size).toBe(0);
    });

    it('should handle already empty selection', () => {
      const state = createTestState(0, 10);
      const newState = clearSelection(state);

      expect(newState.selected.size).toBe(0);
    });

    it('should create new Set instance', () => {
      const state = createTestState(0, 10);
      state.selected = new Set([state.data[2]]);

      const newState = clearSelection(state);

      expect(newState.selected).not.toBe(state.selected);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = clearSelection(state);

      expect(newState.selected.size).toBe(0);
    });
  });

  describe('isSelected', () => {
    it('should return true for selected row', () => {
      const state = createTestState(0, 10);
      state.selected = new Set([state.data[3]]);

      expect(isSelected(state, state.data[3])).toBe(true);
    });

    it('should return false for unselected row', () => {
      const state = createTestState(0, 10);
      state.selected = new Set([state.data[3]]);

      expect(isSelected(state, state.data[5])).toBe(false);
    });

    it('should return false for empty selection', () => {
      const state = createTestState(0, 10);

      expect(isSelected(state, state.data[0])).toBe(false);
    });
  });

  describe('getSelectionCount', () => {
    it('should return correct count', () => {
      const state = createTestState(0, 10);
      state.selected = new Set([state.data[1], state.data[3], state.data[7]]);

      expect(getSelectionCount(state)).toBe(3);
    });

    it('should return 0 for empty selection', () => {
      const state = createTestState(0, 10);

      expect(getSelectionCount(state)).toBe(0);
    });

    it('should return correct count after selectAll', () => {
      const state = createTestState(0, 10);
      const newState = selectAll(state);

      expect(getSelectionCount(newState)).toBe(10);
    });
  });

  describe('edge cases and immutability', () => {
    it('should maintain state immutability', () => {
      const state = createTestState(3, 10);
      const newState = toggleSelection(state, 'single');

      expect(state.selected.size).toBe(0);
      expect(newState.selected.size).toBe(1);
      expect(state).not.toBe(newState);
      expect(state.selected).not.toBe(newState.selected);
    });

    it('should preserve other state properties', () => {
      const state = createTestState(5, 10);
      state.sort = { key: 'id', direction: 'asc' };
      state.filterQuery = 'test';
      state.isFiltering = true;

      const newState = toggleSelection(state, 'multiple');

      expect(newState.sort).toBe(state.sort);
      expect(newState.filterQuery).toBe(state.filterQuery);
      expect(newState.isFiltering).toBe(state.isFiltering);
    });

    it('should handle rapid toggle operations', () => {
      let state = createTestState(3, 10);

      // Toggle on
      state = toggleSelection(state, 'multiple');
      expect(state.selected.size).toBe(1);

      // Toggle off
      state = toggleSelection(state, 'multiple');
      expect(state.selected.size).toBe(0);

      // Toggle on again
      state = toggleSelection(state, 'multiple');
      expect(state.selected.size).toBe(1);
    });

    it('should handle selection with complex objects', () => {
      const complexData = [
        { id: 1, nested: { value: 'a' }, array: [1, 2, 3] },
        { id: 2, nested: { value: 'b' }, array: [4, 5, 6] },
        { id: 3, nested: { value: 'c' }, array: [7, 8, 9] },
      ];

      const state: TableState<any> = {
        data: complexData,
        originalData: complexData,
        selected: new Set(),
        focusedRow: 1,
        focusedColumn: 0,
        sort: null,
        filterQuery: '',
        isFiltering: false,
        visibleRange: [0, 3],
        pageSize: 10,
        isEditing: false,
        editValue: '',
      };

      const newState = toggleSelection(state, 'multiple');

      expect(newState.selected.has(complexData[1])).toBe(true);
      expect(newState.selected.size).toBe(1);
    });

    it('should handle selection after data changes', () => {
      const state = createTestState(3, 10);
      const oldRow = state.data[3];
      state.selected = new Set([oldRow]);

      // Simulate data update
      const newData = state.data.map((row) => ({ ...row }));
      const newState = {
        ...state,
        data: newData,
        selected: new Set([oldRow]), // Old reference
      };

      // Old row reference should still be in selection
      expect(newState.selected.has(oldRow)).toBe(true);
      // But not the new object
      expect(newState.selected.has(newData[3])).toBe(false);
    });
  });

  describe('mode behavior differences', () => {
    it('single mode should replace selections', () => {
      const state = createTestState(3, 10);
      let result = toggleSelection(state, 'single');
      expect(result.selected.size).toBe(1);

      result.focusedRow = 5;
      result = toggleSelection(result, 'single');
      expect(result.selected.size).toBe(1);
      expect(result.selected.has(state.data[5])).toBe(true);
      expect(result.selected.has(state.data[3])).toBe(false);
    });

    it('multiple mode should accumulate selections', () => {
      const state = createTestState(3, 10);
      let result = toggleSelection(state, 'multiple');
      expect(result.selected.size).toBe(1);

      result.focusedRow = 5;
      result = toggleSelection(result, 'multiple');
      expect(result.selected.size).toBe(2);
      expect(result.selected.has(state.data[3])).toBe(true);
      expect(result.selected.has(state.data[5])).toBe(true);
    });
  });
});
