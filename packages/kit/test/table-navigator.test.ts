/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import {
  navigateUp,
  navigateDown,
  navigateLast,
  navigateFirst,
  navigatePageUp,
  navigatePageDown,
} from '../src/components/table/table-navigator.js';

import type { TableState } from '../src/components/table/types.js';

function createTestState(focusedRow: number, dataLength: number, pageSize = 10): TableState<any> {
  const data = Array.from({ length: dataLength }, (_, i) => ({ id: i }));
  return {
    data,
    originalData: data,
    selected: new Set(),
    focusedRow,
    focusedColumn: 0,
    sort: null,
    filterQuery: '',
    isFiltering: false,
    visibleRange: [0, Math.min(pageSize, dataLength)],
    pageSize,
    isEditing: false,
    editValue: '',
  };
}

describe('table-navigator', () => {
  describe('navigateUp', () => {
    it('should move focus up by one row', () => {
      const state = createTestState(5, 10);
      const newState = navigateUp(state);
      expect(newState.focusedRow).toBe(4);
    });

    it('should stay at first row when already at first row', () => {
      const state = createTestState(0, 10);
      const newState = navigateUp(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should handle single row table', () => {
      const state = createTestState(0, 1);
      const newState = navigateUp(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = navigateUp(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should adjust visible range when scrolling up', () => {
      const state = createTestState(5, 20, 10);
      const newState = navigateUp(state);
      expect(newState.focusedRow).toBe(4);
      expect(newState.visibleRange).toEqual([0, 10]);
    });

    it('should not scroll when already at first row', () => {
      const state = createTestState(0, 20, 10);
      state.visibleRange = [5, 15];
      const newState = navigateUp(state);
      expect(newState.focusedRow).toBe(0); // Stays at first
      expect(newState.visibleRange).toEqual([5, 15]); // Range unchanged
    });
  });

  describe('navigateDown', () => {
    it('should move focus down by one row', () => {
      const state = createTestState(5, 10);
      const newState = navigateDown(state);
      expect(newState.focusedRow).toBe(6);
    });

    it('should stay at last row when already at last row', () => {
      const state = createTestState(9, 10);
      const newState = navigateDown(state);
      expect(newState.focusedRow).toBe(9);
    });

    it('should handle single row table', () => {
      const state = createTestState(0, 1);
      const newState = navigateDown(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = navigateDown(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should adjust visible range when scrolling down', () => {
      const state = createTestState(5, 20, 10);
      const newState = navigateDown(state);
      expect(newState.focusedRow).toBe(6);
      expect(newState.visibleRange).toEqual([0, 10]);
    });

    it('should scroll viewport when navigating below visible range', () => {
      const state = createTestState(14, 20, 10);
      state.visibleRange = [5, 15];
      const newState = navigateDown(state);
      expect(newState.focusedRow).toBe(15);
      expect(newState.visibleRange[0]).toBeLessThanOrEqual(15);
      expect(newState.visibleRange[1]).toBeGreaterThanOrEqual(15);
    });
  });

  describe('navigatePageUp', () => {
    it('should move focus up by page size', () => {
      const state = createTestState(15, 30, 10);
      const newState = navigatePageUp(state);
      expect(newState.focusedRow).toBe(5);
    });

    it('should go to first row if less than page size from start', () => {
      const state = createTestState(5, 30, 10);
      const newState = navigatePageUp(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should stay at first row if already at start', () => {
      const state = createTestState(0, 30, 10);
      const newState = navigatePageUp(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0, 10);
      const newState = navigatePageUp(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should adjust visible range', () => {
      const state = createTestState(25, 50, 10);
      state.visibleRange = [20, 30];
      const newState = navigatePageUp(state);
      expect(newState.focusedRow).toBe(15);
      expect(newState.visibleRange).toEqual([15, 25]);
    });
  });

  describe('navigatePageDown', () => {
    it('should move focus down by page size', () => {
      const state = createTestState(5, 30, 10);
      const newState = navigatePageDown(state);
      expect(newState.focusedRow).toBe(15);
    });

    it('should go to last row if less than page size from end', () => {
      const state = createTestState(25, 30, 10);
      const newState = navigatePageDown(state);
      expect(newState.focusedRow).toBe(29);
    });

    it('should stay at last row if already at end', () => {
      const state = createTestState(29, 30, 10);
      const newState = navigatePageDown(state);
      expect(newState.focusedRow).toBe(29);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0, 10);
      const newState = navigatePageDown(state);
      // When data.length is 0, min(0-1, 0+10) = -1
      expect(newState.focusedRow).toBe(-1);
    });

    it('should adjust visible range', () => {
      const state = createTestState(5, 50, 10);
      state.visibleRange = [0, 10];
      const newState = navigatePageDown(state);
      expect(newState.focusedRow).toBe(15);
      // rangeEnd = min(50, 15+1) = 16
      // rangeStart = max(0, 16-10) = 6
      expect(newState.visibleRange).toEqual([6, 16]);
    });
  });

  describe('navigateFirst', () => {
    it('should move focus to first row', () => {
      const state = createTestState(15, 30);
      const newState = navigateFirst(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should adjust visible range to start', () => {
      const state = createTestState(25, 50, 10);
      state.visibleRange = [20, 30];
      const newState = navigateFirst(state);
      expect(newState.focusedRow).toBe(0);
      expect(newState.visibleRange).toEqual([0, 10]);
    });

    it('should handle already at first row', () => {
      const state = createTestState(0, 30);
      const newState = navigateFirst(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = navigateFirst(state);
      expect(newState.focusedRow).toBe(0);
    });
  });

  describe('navigateLast', () => {
    it('should move focus to last row', () => {
      const state = createTestState(5, 30);
      const newState = navigateLast(state);
      expect(newState.focusedRow).toBe(29);
    });

    it('should adjust visible range to end', () => {
      const state = createTestState(5, 50, 10);
      state.visibleRange = [0, 10];
      const newState = navigateLast(state);
      expect(newState.focusedRow).toBe(49);
      expect(newState.visibleRange).toEqual([40, 50]);
    });

    it('should handle already at last row', () => {
      const state = createTestState(29, 30);
      const newState = navigateLast(state);
      expect(newState.focusedRow).toBe(29);
    });

    it('should handle empty table', () => {
      const state = createTestState(0, 0);
      const newState = navigateLast(state);
      expect(newState.focusedRow).toBe(0);
    });

    it('should handle single row table', () => {
      const state = createTestState(0, 1);
      const newState = navigateLast(state);
      expect(newState.focusedRow).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle navigation with very large datasets', () => {
      const state = createTestState(5000, 10000, 100);
      const down = navigateDown(state);
      expect(down.focusedRow).toBe(5001);

      const up = navigateUp(state);
      expect(up.focusedRow).toBe(4999);
    });

    it('should maintain state immutability', () => {
      const state = createTestState(5, 10);
      const newState = navigateDown(state);

      expect(state.focusedRow).toBe(5);
      expect(newState.focusedRow).toBe(6);
      expect(state).not.toBe(newState);
    });

    it('should preserve other state properties', () => {
      const state = createTestState(5, 10);
      state.selected = new Set([state.data[2], state.data[4]]);
      state.sort = { key: 'id', direction: 'asc' };
      state.filterQuery = 'test';

      const newState = navigateDown(state);

      expect(newState.selected).toBe(state.selected);
      expect(newState.sort).toBe(state.sort);
      expect(newState.filterQuery).toBe(state.filterQuery);
    });
  });
});
