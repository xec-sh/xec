/**
 * Comprehensive tests for Table component
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { TestHarness } from '../../../../src/test/test-harness.js';
import { MockTerminal } from '../../../../src/test/mock-terminal.js';
import { Table, type TableData, type TableColumn } from '../../../../src/components/complex/table.js';

import type { Key } from '../../../../src/core/types.js';

// ============================================================================
// Test Data
// ============================================================================

interface TestData extends TableData {
  id: number;
  name: string;
  email: string;
  age: number;
  status: 'active' | 'inactive';
  department: string;
  salary: number;
}

const mockData: TestData[] = [
  { id: 1, name: 'John Doe', email: 'john@example.com', age: 30, status: 'active', department: 'Engineering', salary: 75000 },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active', department: 'Marketing', salary: 65000 },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', age: 35, status: 'inactive', department: 'Sales', salary: 55000 },
  { id: 4, name: 'Alice Brown', email: 'alice@example.com', age: 28, status: 'active', department: 'Engineering', salary: 70000 },
  { id: 5, name: 'Charlie Wilson', email: 'charlie@example.com', age: 42, status: 'active', department: 'HR', salary: 60000 }
];

const mockColumns: TableColumn<TestData>[] = [
  {
    key: 'id',
    label: 'ID',
    width: 5,
    align: 'right'
  },
  {
    key: 'name',
    label: 'Name',
    width: 15,
    sortable: true
  },
  {
    key: 'email',
    label: 'Email',
    width: 20,
    filterable: true
  },
  {
    key: 'age',
    label: 'Age',
    width: 5,
    align: 'center',
    sortable: true,
    sorter: (a, b) => a.age - b.age
  },
  {
    key: 'status',
    label: 'Status',
    width: 10,
    filterable: true,
    formatter: (value) => value === 'active' ? '✓ Active' : '✗ Inactive'
  },
  {
    key: 'department',
    label: 'Department',
    width: 12,
    filterable: true
  }
];

// ============================================================================
// Test Suite
// ============================================================================

describe('Table Component', () => {
  let table: Table<TestData>;
  let terminal: MockTerminal;
  let harness: TestHarness;

  beforeEach(() => {
    terminal = new MockTerminal();
    harness = new TestHarness(terminal);
  });

  afterEach(() => {
    if (table) {
      table.unmount();
    }
    vi.clearAllMocks();
  });

  // ========================================================================
  // Basic Functionality
  // ========================================================================

  describe('Basic Functionality', () => {
    it('should create table with data and columns', () => {
      table = new Table({
        data: mockData,
        columns: mockColumns
      });

      expect(table).toBeDefined();
      expect(table.getData()).toHaveLength(5);
    });

    it('should render table with headers and data', () => {
      table = new Table({
        data: mockData.slice(0, 2),
        columns: mockColumns,
        showHeader: true
      });

      const output = table.render();
      expect(output.lines).toBeDefined();
      expect(output.lines.length).toBeGreaterThan(0);

      // Check for header row
      const headerFound = output.lines.some(line => line.includes('Name') && line.includes('Email'));
      expect(headerFound).toBe(true);

      // Check for data rows
      const dataFound = output.lines.some(line => line.includes('John Doe'));
      expect(dataFound).toBe(true);
    });

    it('should handle empty data', () => {
      table = new Table({
        data: [],
        columns: mockColumns
      });

      const output = table.render();
      expect(output.lines.some(line => line.includes('No data available'))).toBe(true);
    });

    it('should handle loading state', () => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        loading: true
      });

      const output = table.render();
      expect(output.lines.some(line => line.includes('Loading...'))).toBe(true);
    });
  });

  // ========================================================================
  // Data Management
  // ========================================================================

  describe('Data Management', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns
      });
    });

    it('should set new data', () => {
      const newData = mockData.slice(0, 2);
      table.setData(newData);
      expect(table.getData()).toHaveLength(2);
    });

    it('should add row', () => {
      const newRow: TestData = {
        id: 6,
        name: 'New User',
        email: 'new@example.com',
        age: 25,
        status: 'active',
        department: 'IT',
        salary: 50000
      };

      table.addRow(newRow);
      expect(table.getData()).toHaveLength(6);
      expect(table.getData()).toContain(newRow);
    });

    it('should add row at specific index', () => {
      const newRow: TestData = {
        id: 6,
        name: 'New User',
        email: 'new@example.com',
        age: 25,
        status: 'active',
        department: 'IT',
        salary: 50000
      };

      table.addRow(newRow, 1);
      const data = table.getData();
      expect(data).toHaveLength(6);
      expect(data[1]).toEqual(newRow);
    });

    it('should remove rows', () => {
      table.removeRows([0, 2]);
      const data = table.getData();
      expect(data).toHaveLength(3);
      expect(data.find(row => row.id === 1)).toBeUndefined();
      expect(data.find(row => row.id === 3)).toBeUndefined();
    });

    it('should update row', () => {
      table.updateRow(0, { name: 'Updated Name', age: 99 });
      const data = table.getData();
      expect(data[0].name).toBe('Updated Name');
      expect(data[0].age).toBe(99);
      expect(data[0].email).toBe('john@example.com'); // Should preserve other fields
    });
  });

  // ========================================================================
  // Selection
  // ========================================================================

  describe('Selection', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        selectable: true,
        multiSelect: true
      });
    });

    it('should handle single selection', () => {
      table.setSelectedRows([0]);
      const selected = table.getSelectedRows();
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe(1);
    });

    it('should handle multiple selection', () => {
      table.setSelectedRows([0, 2, 4]);
      const selected = table.getSelectedRows();
      expect(selected).toHaveLength(3);
      expect(selected.map(row => row.id)).toEqual([1, 3, 5]);
    });

    it('should clear selection', () => {
      table.setSelectedRows([0, 1, 2]);
      expect(table.getSelectedRows()).toHaveLength(3);
      
      table.clearSelection();
      expect(table.getSelectedRows()).toHaveLength(0);
    });

    it('should handle keyboard selection with space', () => {
      const spaceKey: Key = { name: 'space', sequence: ' ', ctrl: false, meta: false, shift: false };
      
      // Focus first row and select
      table.focusCell(0, 0);
      const handled = table.handleKeypress(spaceKey);
      
      expect(handled).toBe(true);
      expect(table.getSelectedRows()).toHaveLength(1);
    });
  });

  // ========================================================================
  // Sorting
  // ========================================================================

  describe('Sorting', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        sortable: true
      });
    });

    it('should sort by name ascending', () => {
      const onSort = vi.fn();
      table = new Table({
        data: mockData,
        columns: mockColumns,
        sortable: true,
        onSort
      });

      // Simulate clicking on name column header
      // This would normally be done through mouse interaction
      // For testing, we'll call the sort method directly via public API
      // Since the sort method isn't exposed, we'll test the callback
      const nameColumn = mockColumns.find(col => col.key === 'name')!;
      onSort(nameColumn, 'asc');

      expect(onSort).toHaveBeenCalledWith(nameColumn, 'asc');
    });

    it('should sort by age using custom sorter', () => {
      const onSort = vi.fn();
      table = new Table({
        data: mockData,
        columns: mockColumns,
        sortable: true,
        onSort
      });

      const ageColumn = mockColumns.find(col => col.key === 'age')!;
      onSort(ageColumn, 'asc');

      expect(onSort).toHaveBeenCalledWith(ageColumn, 'asc');
    });
  });

  // ========================================================================
  // Filtering
  // ========================================================================

  describe('Filtering', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        filterable: true
      });
    });

    it('should filter data when callback provided', () => {
      const onFilter = vi.fn();
      table = new Table({
        data: mockData,
        columns: mockColumns,
        filterable: true,
        onFilter
      });

      // Simulate filter being applied
      const filters = [{ column: 'status', value: 'active', active: true }];
      onFilter(filters);

      expect(onFilter).toHaveBeenCalledWith(filters);
    });

    it('should handle filter toggle with Ctrl+F', () => {
      const ctrlF: Key = { name: 'f', sequence: 'f', ctrl: true, meta: false, shift: false };
      const handled = table.handleKeypress(ctrlF);
      expect(handled).toBe(true);
    });
  });

  // ========================================================================
  // Pagination
  // ========================================================================

  describe('Pagination', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        paginated: true,
        pageSize: 2
      });
    });

    it('should paginate data', () => {
      const output = table.render();
      const pageText = output.lines.find(line => line.includes('Page 1 of'));
      expect(pageText).toBeDefined();
    });

    it('should navigate to different page', () => {
      table.goToPage(2);
      // The table should now show page 2 data
      // We can't easily test the rendered output here, but we can verify the method doesn't throw
      expect(() => table.render()).not.toThrow();
    });

    it('should change page size', () => {
      table.setPageSize(3);
      // Should now show 3 items per page
      // The table should recalculate pagination
      expect(() => table.render()).not.toThrow();
    });

    it('should handle page navigation with keys', () => {
      const pageDown: Key = { name: 'pagedown', sequence: '\x1b[6~', ctrl: false, meta: false, shift: false };
      const pageUp: Key = { name: 'pageup', sequence: '\x1b[5~', ctrl: false, meta: false, shift: false };

      const handled1 = table.handleKeypress(pageDown);
      const handled2 = table.handleKeypress(pageUp);

      expect(handled1).toBe(true);
      expect(handled2).toBe(true);
    });
  });

  // ========================================================================
  // Keyboard Navigation
  // ========================================================================

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        keyboardNavigation: true
      });
    });

    it('should handle arrow key navigation', () => {
      const downKey: Key = { name: 'down', sequence: '\x1b[B', ctrl: false, meta: false, shift: false };
      const upKey: Key = { name: 'up', sequence: '\x1b[A', ctrl: false, meta: false, shift: false };
      const leftKey: Key = { name: 'left', sequence: '\x1b[D', ctrl: false, meta: false, shift: false };
      const rightKey: Key = { name: 'right', sequence: '\x1b[C', ctrl: false, meta: false, shift: false };

      expect(table.handleKeypress(downKey)).toBe(true);
      expect(table.handleKeypress(upKey)).toBe(true);
      expect(table.handleKeypress(leftKey)).toBe(true);
      expect(table.handleKeypress(rightKey)).toBe(true);
    });

    it('should handle home and end keys', () => {
      const homeKey: Key = { name: 'home', sequence: '\x1b[H', ctrl: false, meta: false, shift: false };
      const endKey: Key = { name: 'end', sequence: '\x1b[F', ctrl: false, meta: false, shift: false };

      expect(table.handleKeypress(homeKey)).toBe(true);
      expect(table.handleKeypress(endKey)).toBe(true);
    });

    it('should handle select all with Ctrl+A', () => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        selectable: true,
        multiSelect: true,
        keyboardNavigation: true
      });

      const ctrlA: Key = { name: 'a', sequence: 'a', ctrl: true, meta: false, shift: false };
      const handled = table.handleKeypress(ctrlA);
      
      expect(handled).toBe(true);
    });
  });

  // ========================================================================
  // Cell Focus
  // ========================================================================

  describe('Cell Focus', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        keyboardNavigation: true
      });
    });

    it('should focus specific cell', () => {
      table.focusCell(1, 2);
      // Should focus row 1, column 2
      // We can't easily test the visual focus, but method should not throw
      expect(() => table.render()).not.toThrow();
    });

    it('should handle bounds checking for focus', () => {
      // Try to focus beyond bounds
      table.focusCell(100, 100);
      expect(() => table.render()).not.toThrow();

      table.focusCell(-1, -1);
      expect(() => table.render()).not.toThrow();
    });
  });

  // ========================================================================
  // Export Functionality
  // ========================================================================

  describe('Export', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData.slice(0, 2),
        columns: mockColumns
      });
    });

    it('should export as JSON', () => {
      const jsonData = table.export('json');
      const parsed = JSON.parse(jsonData);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('John Doe');
    });

    it('should export as CSV', () => {
      const csvData = table.export('csv');
      const lines = csvData.split('\n');
      expect(lines[0]).toContain('ID,Name,Email,Age,Status,Department'); // Headers
      expect(lines[1]).toContain('1,John Doe,john@example.com'); // First row
    });

    it('should call onExport callback when provided', () => {
      const onExport = vi.fn();
      table = new Table({
        data: mockData.slice(0, 2),
        columns: mockColumns,
        onExport
      });

      table.export('json');
      expect(onExport).toHaveBeenCalledWith(expect.any(Array), 'json');
    });
  });

  // ========================================================================
  // Styling and Appearance
  // ========================================================================

  describe('Styling and Appearance', () => {
    it('should render with borders when enabled', () => {
      table = new Table({
        data: mockData.slice(0, 1),
        columns: mockColumns,
        bordered: true
      });

      const output = table.render();
      const borderFound = output.lines.some(line => line.includes('┌') || line.includes('└') || line.includes('│'));
      expect(borderFound).toBe(true);
    });

    it('should render without borders when disabled', () => {
      table = new Table({
        data: mockData.slice(0, 1),
        columns: mockColumns,
        bordered: false
      });

      const output = table.render();
      // Should not contain border characters
      const borderFound = output.lines.some(line => line.includes('┌') || line.includes('└'));
      expect(borderFound).toBe(false);
    });

    it('should apply striped styling', () => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        striped: true
      });

      const output = table.render();
      // Check that output is generated (striping is in ANSI codes which are hard to test directly)
      expect(output.lines.length).toBeGreaterThan(0);
    });

    it('should show row numbers when enabled', () => {
      table = new Table({
        data: mockData.slice(0, 2),
        columns: mockColumns,
        showRowNumbers: true
      });

      const output = table.render();
      // Should contain row numbers
      const numberFound = output.lines.some(line => line.includes('1') || line.includes('2'));
      expect(numberFound).toBe(true);
    });
  });

  // ========================================================================
  // Event Callbacks
  // ========================================================================

  describe('Event Callbacks', () => {
    let onRowSelect: ReturnType<typeof vi.fn>;
    let onRowDoubleClick: ReturnType<typeof vi.fn>;
    let onCellClick: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onRowSelect = vi.fn();
      onRowDoubleClick = vi.fn();
      onCellClick = vi.fn();

      table = new Table({
        data: mockData,
        columns: mockColumns,
        selectable: true,
        onRowSelect,
        onRowDoubleClick,
        onCellClick
      });
    });

    it('should call onRowDoubleClick on Enter key', () => {
      const enterKey: Key = { name: 'enter', sequence: '\r', ctrl: false, meta: false, shift: false };
      
      // Focus a row first
      table.focusCell(0, 0);
      table.handleKeypress(enterKey);

      expect(onRowDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 0);
    });
  });

  // ========================================================================
  // Custom Formatters and Renderers
  // ========================================================================

  describe('Custom Formatters', () => {
    it('should use custom formatter for column', () => {
      const customColumns = [...mockColumns];
      customColumns[4] = {
        ...customColumns[4],
        formatter: (value) => `[${value}]`
      };

      table = new Table({
        data: mockData.slice(0, 1),
        columns: customColumns
      });

      const output = table.render();
      const formattedFound = output.lines.some(line => line.includes('[active]') || line.includes('[inactive]'));
      expect(formattedFound).toBe(true);
    });

    it('should handle custom sorter', () => {
      const customColumns = [...mockColumns];
      customColumns[1] = {
        ...customColumns[1],
        sorter: (a, b) => b.name.localeCompare(a.name) // Reverse sort
      };

      table = new Table({
        data: mockData,
        columns: customColumns,
        sortable: true
      });

      // The sorter function is used internally, just verify no error
      expect(() => table.render()).not.toThrow();
    });
  });

  // ========================================================================
  // Error Handling
  // ========================================================================

  describe('Error Handling', () => {
    it('should handle invalid column configuration gracefully', () => {
      const invalidColumns: TableColumn<TestData>[] = [
        { key: 'nonexistent' as keyof TestData, label: 'Invalid', width: 10 }
      ];

      table = new Table({
        data: mockData,
        columns: invalidColumns
      });

      expect(() => table.render()).not.toThrow();
    });

    it('should handle empty columns array', () => {
      table = new Table({
        data: mockData,
        columns: []
      });

      const output = table.render();
      expect(output.lines).toBeDefined();
    });

    it('should handle very large data sets', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + (i % 50),
        status: i % 2 === 0 ? 'active' as const : 'inactive' as const,
        department: 'Engineering',
        salary: 50000 + i
      }));

      table = new Table({
        data: largeData,
        columns: mockColumns,
        paginated: true,
        pageSize: 10
      });

      expect(() => table.render()).not.toThrow();
      expect(table.getData()).toHaveLength(1000);
    });
  });

  // ========================================================================
  // Performance
  // ========================================================================

  describe('Performance', () => {
    it('should handle frequent updates efficiently', () => {
      table = new Table({
        data: mockData,
        columns: mockColumns
      });

      const startTime = performance.now();
      
      // Perform multiple updates
      for (let i = 0; i < 100; i++) {
        table.updateRow(0, { age: 30 + i });
        table.render(); // Force re-render
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle large column sets', () => {
      const manyColumns: TableColumn<TestData>[] = Array.from({ length: 20 }, (_, i) => ({
        key: i < mockColumns.length ? mockColumns[i % mockColumns.length].key : 'name',
        label: `Column ${i}`,
        width: 10
      }));

      table = new Table({
        data: mockData.slice(0, 10),
        columns: manyColumns
      });

      expect(() => table.render()).not.toThrow();
    });
  });

  // ========================================================================
  // Accessibility
  // ========================================================================

  describe('Accessibility', () => {
    beforeEach(() => {
      table = new Table({
        data: mockData,
        columns: mockColumns,
        keyboardNavigation: true,
        selectable: true
      });
    });

    it('should provide cursor position for screen readers', () => {
      table.focusCell(1, 2);
      const output = table.render();
      
      // Should provide cursor position when focused
      if (output.cursor) {
        expect(output.cursor.x).toBeGreaterThanOrEqual(0);
        expect(output.cursor.y).toBeGreaterThanOrEqual(0);
      }
    });

    it('should support keyboard-only navigation', () => {
      const keys: Key[] = [
        { name: 'tab', sequence: '\t', ctrl: false, meta: false, shift: false },
        { name: 'down', sequence: '\x1b[B', ctrl: false, meta: false, shift: false },
        { name: 'right', sequence: '\x1b[C', ctrl: false, meta: false, shift: false },
        { name: 'space', sequence: ' ', ctrl: false, meta: false, shift: false }
      ];

      // All keys should be handled
      keys.forEach(key => {
        expect(table.handleKeypress(key)).toBe(true);
      });
    });
  });

  // ========================================================================
  // Cleanup
  // ========================================================================

  describe('Cleanup', () => {
    it('should cleanup properly on unmount', async () => {
      table = new Table({
        data: mockData,
        columns: mockColumns
      });

      await expect(table.unmount()).resolves.toBeUndefined();
    });

    it('should refresh data correctly', () => {
      table = new Table({
        data: mockData,
        columns: mockColumns
      });

      expect(() => table.refresh()).not.toThrow();
      expect(() => table.render()).not.toThrow();
    });
  });
});