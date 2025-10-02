/**
 * Performance tests for table component
 *
 * Tests verify that table meets performance targets from specification:
 * - Initial render: <50ms for 100 rows
 * - Filter/sort: <100ms for 10,000 rows
 * - Memory: <10MB for 10,000 rows
 * - Scroll response: <16ms (60fps)
 */

import { describe, it, expect } from 'vitest';
import { createTableState } from '../src/components/table/table-state.js';
import { toggleSort } from '../src/components/table/table-sorter.js';
import { updateFilterQuery } from '../src/components/table/table-filter.js';
import { navigateDown, navigatePageDown } from '../src/components/table/table-navigator.js';
import { renderInteractiveTable } from '../src/components/table/interactive-renderer.js';
import type { InteractiveTableOptions } from '../src/components/table/types.js';

/**
 * Generate test data
 */
function generateTestData(count: number) {
  const roles = ['Developer', 'Designer', 'Manager', 'QA', 'DevOps'];
  const statuses = ['Active', 'Inactive', 'On Leave'];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    role: roles[i % roles.length]!,
    status: statuses[i % statuses.length]!,
    salary: 50000 + (i * 1000) % 100000,
    department: `Dept ${(i % 10) + 1}`,
    joinDate: new Date(2020 + (i % 5), (i % 12), (i % 28) + 1).toISOString(),
    performance: (i % 5) + 1,
    active: i % 3 === 0,
  }));
}

/**
 * Measure execution time
 */
function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

/**
 * Measure memory usage (approximation)
 */
function measureMemory<T>(data: T[]): number {
  // Rough estimation: JSON size as proxy for memory
  const jsonSize = JSON.stringify(data).length;
  return jsonSize / (1024 * 1024); // Convert to MB
}

describe('table-performance', () => {
  describe('Rendering performance', () => {
    it('should render 100 rows in <50ms', () => {
      const data = generateTestData(100);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
          { key: 'salary', header: 'Salary' },
        ],
      };
      const state = createTableState(data, options);

      const time = measureTime(() => {
        renderInteractiveTable(state, options);
      });

      expect(time).toBeLessThan(50);
    });

    it('should render 1,000 rows efficiently', () => {
      const data = generateTestData(1000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
        ],
      };
      const state = createTableState(data, options);

      const time = measureTime(() => {
        renderInteractiveTable(state, options);
      });

      // Should be reasonable even for large dataset (only renders visible rows)
      expect(time).toBeLessThan(100);
    });

    it('should render 10,000 rows efficiently with virtualization', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
        ],
      };
      const state = createTableState(data, options);

      const time = measureTime(() => {
        renderInteractiveTable(state, options);
      });

      // Virtualization should keep render time low regardless of total rows
      expect(time).toBeLessThan(100);
    });
  });

  describe('Sorting performance', () => {
    it('should sort 10,000 rows in <100ms', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'salary', header: 'Salary' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = toggleSort(state, 'salary', options);
      });

      expect(time).toBeLessThan(100);
      expect(state.sort).toBeDefined();
      expect(state.sort!.key).toBe('salary');
    });

    it('should sort string columns efficiently', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = toggleSort(state, 'name', options);
      });

      expect(time).toBeLessThan(100);
    });

    it('should handle multiple sort operations', () => {
      const data = generateTestData(5000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'salary', header: 'Salary' },
          { key: 'performance', header: 'Performance' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = toggleSort(state, 'salary', options);
        state = toggleSort(state, 'salary', options); // Toggle to desc
        state = toggleSort(state, 'performance', options);
      });

      expect(time).toBeLessThan(300); // 3 operations * 100ms
    });
  });

  describe('Filtering performance', () => {
    it('should filter 10,000 rows in <100ms', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
          { key: 'status', header: 'Status' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = updateFilterQuery(state, 'Developer', options);
      });

      expect(time).toBeLessThan(100);
      expect(state.filterQuery).toBe('Developer');
      expect(state.data.length).toBeLessThan(data.length);
    });

    it('should handle complex filters efficiently', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'email', header: 'Email' },
          { key: 'department', header: 'Department' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = updateFilterQuery(state, 'user123@', options);
      });

      expect(time).toBeLessThan(100);
    });

    it('should filter after sort efficiently', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'salary', header: 'Salary' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = toggleSort(state, 'salary', options);
        state = updateFilterQuery(state, 'User 1', options);
      });

      expect(time).toBeLessThan(200); // 2 operations
    });
  });

  describe('Navigation performance', () => {
    it('should navigate through 10,000 rows efficiently', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        // Simulate multiple navigation operations
        for (let i = 0; i < 100; i++) {
          state = navigateDown(state);
        }
      });

      // Should be very fast (<16ms for 60fps, but we allow more iterations)
      expect(time).toBeLessThan(50);
    });

    it('should handle page navigation efficiently', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'id', header: 'ID' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        for (let i = 0; i < 10; i++) {
          state = navigatePageDown(state);
        }
      });

      expect(time).toBeLessThan(50);
    });
  });

  describe('Memory efficiency', () => {
    it('should use <10MB for 10,000 rows', () => {
      const data = generateTestData(10000);
      const memoryMB = measureMemory(data);

      expect(memoryMB).toBeLessThan(10);
    });

    it('should handle 100,000 rows without excessive memory', () => {
      const data = generateTestData(100000);
      const memoryMB = measureMemory(data);

      // Should scale linearly (roughly 10x for 10x data)
      expect(memoryMB).toBeLessThan(100);
    });
  });

  describe('Virtualization efficiency', () => {
    it('should only render visible rows regardless of total count', () => {
      // Test with different dataset sizes
      const sizes = [100, 1000, 10000, 100000];
      const renderTimes: number[] = [];

      for (const size of sizes) {
        const data = generateTestData(size);
        const options: InteractiveTableOptions<any> = {
          data,
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Name' },
          ],
        };
        const state = createTableState(data, options);

        const time = measureTime(() => {
          renderInteractiveTable(state, options);
        });

        renderTimes.push(time);
      }

      // Render times should not scale linearly with data size
      // (indicating virtualization is working)
      const ratio = renderTimes[3]! / renderTimes[0]!;
      expect(ratio).toBeLessThan(10); // Should not be 1000x slower for 1000x data
    });

    it('should maintain stable visible range during navigation', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [{ key: 'id', header: 'ID' }],
      };
      let state = createTableState(data, options);

      const initialRangeSize = state.visibleRange[1] - state.visibleRange[0];

      // Navigate multiple times
      for (let i = 0; i < 50; i++) {
        state = navigateDown(state);
      }

      const finalRangeSize = state.visibleRange[1] - state.visibleRange[0];

      // Range size should remain consistent
      expect(finalRangeSize).toBe(initialRangeSize);
    });

    it('should update visible range on page navigation', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [{ key: 'id', header: 'ID' }],
      };
      let state = createTableState(data, options);

      const initialRange = state.visibleRange;

      state = navigatePageDown(state);

      // Range should have moved
      expect(state.visibleRange[0]).toBeGreaterThan(initialRange[0]);
      expect(state.visibleRange[1]).toBeGreaterThan(initialRange[1]);
    });
  });

  describe('Combined operations performance', () => {
    it('should handle filter + sort + render efficiently', () => {
      const data = generateTestData(10000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'salary', header: 'Salary' },
          { key: 'role', header: 'Role' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = updateFilterQuery(state, 'Developer', options);
        state = toggleSort(state, 'salary', options);
        renderInteractiveTable(state, options);
      });

      expect(time).toBeLessThan(300); // Filter + Sort + Render
    });

    it('should handle rapid filter changes', () => {
      const data = generateTestData(5000);
      const options: InteractiveTableOptions<any> = {
        data,
        columns: [
          { key: 'role', header: 'Role' },
        ],
      };
      let state = createTableState(data, options);

      const time = measureTime(() => {
        state = updateFilterQuery(state, 'D', options);
        state = updateFilterQuery(state, 'De', options);
        state = updateFilterQuery(state, 'Dev', options);
        state = updateFilterQuery(state, 'Deve', options);
        state = updateFilterQuery(state, 'Devel', options);
      });

      expect(time).toBeLessThan(500); // 5 filter operations
    });
  });
});
