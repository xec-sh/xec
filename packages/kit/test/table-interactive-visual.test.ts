/**
 * @vitest-environment node
 */

import { it, expect, describe } from 'vitest';

import { toggleSort } from '../src/components/table/table-sorter.js';
import { createTableState } from '../src/components/table/table-state.js';
import { navigateDown } from '../src/components/table/table-navigator.js';
import { updateFilterQuery } from '../src/components/table/table-filter.js';
import { selectAll, toggleSelection } from '../src/components/table/table-selector.js';
import { renderInteractiveTable } from '../src/components/table/interactive-renderer.js';

import type { InteractiveTableOptions } from '../src/components/table/types.js';

function createTestData() {
  return [
    { id: 1, name: 'Alice', role: 'Developer', status: 'Active' },
    { id: 2, name: 'Bob', role: 'Designer', status: 'Active' },
    { id: 3, name: 'Charlie', role: 'Manager', status: 'Inactive' },
    { id: 4, name: 'David', role: 'Developer', status: 'Active' },
    { id: 5, name: 'Eve', role: 'Designer', status: 'Active' },
  ];
}

function createTestOptions(overrides?: Partial<InteractiveTableOptions<any>>): InteractiveTableOptions<any> {
  return {
    data: createTestData(),
    columns: [
      { key: 'id', header: 'ID', width: 5, sortable: true },
      { key: 'name', header: 'Name', width: 15, sortable: true },
      { key: 'role', header: 'Role', width: 12, sortable: true },
      { key: 'status', header: 'Status', width: 10, sortable: true },
    ],
    selectable: 'multiple',
    sortable: true,
    filterable: true,
    pageSize: 5,
    borders: 'single',
    ...overrides,
  };
}

describe('table-interactive-visual', () => {
  describe('Basic rendering', () => {
    it('should render table with focus on first row', () => {
      const options = createTestOptions();
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render table with focus on middle row', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      // Navigate to middle
      state = navigateDown(state);
      state = navigateDown(state);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render empty table', () => {
      const options = createTestOptions();
      const state = createTableState([], options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });
  });

  describe('Selection states', () => {
    it('should render with single row selected', () => {
      const options = createTestOptions({ selectable: 'single' });
      let state = createTableState(createTestData(), options);

      state = toggleSelection(state, 'single');

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render with multiple rows selected', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Select rows 0, 1, 3
      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render with all rows selected', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      state = selectAll(state);
      state = navigateDown(state);
      state = navigateDown(state);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should show selection count in status bar', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('2 selected');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Sort indicators', () => {
    it('should render with ascending sort indicator', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = toggleSort(state, 'name', options);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('↑'); // Ascending indicator
      expect(output).toMatchSnapshot();
    });

    it('should render with descending sort indicator', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = toggleSort(state, 'name', options);
      state = toggleSort(state, 'name', options);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('↓'); // Descending indicator
      expect(output).toMatchSnapshot();
    });

    it('should render sorted data in correct order', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = toggleSort(state, 'name', options);

      const output = renderInteractiveTable(state, options);

      // Alice should be first when sorted by name
      const aliceIndex = output.indexOf('Alice');
      const bobIndex = output.indexOf('Bob');
      expect(aliceIndex).toBeLessThan(bobIndex);

      expect(output).toMatchSnapshot();
    });
  });

  describe('Filter states', () => {
    it('should render with active filter', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Developer', options);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('Filter: Developer');
      expect(output).toContain('2/5'); // 2 of 5 results
      expect(output).toMatchSnapshot();
    });

    it('should render in filter mode with input', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state.isFiltering = true;
      state.filterQuery = 'Dev';

      const output = renderInteractiveTable(state, options);

      // Check for filter input indicator (> and Dev are present, possibly with ANSI codes in between)
      expect(output).toContain('>');
      expect(output).toContain('Dev');
      expect(output).toMatchSnapshot();
    });

    it('should render filtered results', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Designer', options);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('Bob');
      expect(output).toContain('Eve');
      expect(output).not.toContain('Alice');
      expect(output).toMatchSnapshot();
    });

    it('should render empty filter results', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'NonExistent', options);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('No results');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Combined states', () => {
    it('should render with filter + sort + selection', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Filter for Developers
      state = updateFilterQuery(state, 'Developer', options);

      // Sort by name
      state = toggleSort(state, 'name', options);

      // Select all filtered
      state = selectAll(state);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('Filter: Developer');
      expect(output).toContain('↑');
      expect(output).toContain('2 selected');
      expect(output).toMatchSnapshot();
    });

    it('should render with sort + focus + selection', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      // Sort descending
      state = toggleSort(state, 'id', options);
      state = toggleSort(state, 'id', options);

      // Navigate and select
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render with filter mode active + existing filter', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Dev', options);
      state.isFiltering = true;
      state.filterQuery = 'Devel';

      const output = renderInteractiveTable(state, options);

      // Check for filter input indicator (> and Devel are present, possibly with ANSI codes in between)
      expect(output).toContain('>');
      expect(output).toContain('Devel');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Border styles', () => {
    it('should render with single borders', () => {
      const options = createTestOptions({ borders: 'single' });
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render with double borders', () => {
      const options = createTestOptions({ borders: 'double' });
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render with rounded borders', () => {
      const options = createTestOptions({ borders: 'rounded' });
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });

    it('should render without borders', () => {
      const options = createTestOptions({ borders: 'none' });
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });
  });

  describe('Status bar variations', () => {
    it('should show row position in status bar', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = navigateDown(state);
      state = navigateDown(state);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('Row 3/5');
      expect(output).toMatchSnapshot();
    });

    it('should show selection count when items selected', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      state = selectAll(state);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('5 selected');
      expect(output).toMatchSnapshot();
    });

    it('should show filter query and count', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Active', options);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('Filter: Active');
      expect(output).toMatchSnapshot();
    });

    it('should show all status components together', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      state = updateFilterQuery(state, 'Developer', options);
      state = selectAll(state);
      state = navigateDown(state);

      const output = renderInteractiveTable(state, options);

      expect(output).toContain('2 selected');
      expect(output).toContain('Filter: Developer');
      expect(output).toContain('Row 2/2');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Visual focus indicators', () => {
    it('should highlight focused row with inverse colors', () => {
      const options = createTestOptions();
      let state = createTableState(createTestData(), options);

      state = navigateDown(state);

      const output = renderInteractiveTable(state, options);

      // Inverse ANSI codes should be present
      expect(output).toMatch(/\u001b\[7m/); // Inverse/reverse video
      expect(output).toMatchSnapshot();
    });

    it('should show selected rows with cyan color', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      state = toggleSelection(state, 'multiple');
      state = navigateDown(state);
      state = navigateDown(state);
      state = toggleSelection(state, 'multiple');

      const output = renderInteractiveTable(state, options);

      // Cyan ANSI codes should be present
      expect(output).toMatch(/\u001b\[36m/); // Cyan color
      expect(output).toMatchSnapshot();
    });

    it('should combine focus and selection styling', () => {
      const options = createTestOptions({ selectable: 'multiple' });
      let state = createTableState(createTestData(), options);

      state = toggleSelection(state, 'multiple');
      // Focus stays on selected row

      const output = renderInteractiveTable(state, options);

      // Should have inverse (focus takes precedence)
      expect(output).toMatch(/\u001b\[7m/);
      // Should show selection count in status bar (green color)
      expect(output).toContain('1 selected');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Compact mode', () => {
    it('should render in compact mode', () => {
      const options = createTestOptions({ compact: true });
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });
  });

  describe('Alternate rows', () => {
    it('should render with alternating row colors', () => {
      const options = createTestOptions({ alternateRows: true });
      const state = createTableState(createTestData(), options);

      const output = renderInteractiveTable(state, options);

      expect(output).toMatchSnapshot();
    });
  });
});
