/**
 * Tests for table export functionality
 */

import { describe, it, expect } from 'vitest';
import {
  exportToCSV,
  exportToTSV,
  exportToJSON,
  exportToText,
  exportToMarkdown,
  exportToHTML,
} from '../src/components/table/table-exporter.js';
import type { TableColumn } from '../src/components/table/types.js';

interface TestData {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

const testData: TestData[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'Developer', active: true },
  { id: 2, name: 'Bob', email: 'bob@example.com', role: 'Designer', active: false },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'Manager', active: true },
];

const testColumns: TableColumn<TestData>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'role', header: 'Role' },
  { key: 'active', header: 'Active' },
];

describe('table-exporter', () => {
  describe('exportToCSV', () => {
    it('should export data to CSV with headers', () => {
      const csv = exportToCSV(testData, testColumns, { includeHeaders: true });

      // By default, values are quoted
      expect(csv).toContain('"ID","Name","Email","Role","Active"');
      expect(csv).toContain('"1","Alice","alice@example.com","Developer","true"');
      expect(csv).toContain('"2","Bob","bob@example.com","Designer","false"');
      expect(csv).toContain('"3","Charlie","charlie@example.com","Manager","true"');
    });

    it('should export data to CSV without headers', () => {
      const csv = exportToCSV(testData, testColumns, { includeHeaders: false });

      expect(csv).not.toContain('ID');
      expect(csv).not.toContain('Name');
      expect(csv).toContain('"1","Alice","alice@example.com","Developer","true"');
    });

    it('should handle custom delimiter', () => {
      const csv = exportToCSV(testData, testColumns, { delimiter: ';' });

      expect(csv).toContain('"ID";"Name";"Email";"Role";"Active"');
      expect(csv).toContain('"1";"Alice";"alice@example.com";"Developer";"true"');
    });

    it('should escape values with special characters', () => {
      const data = [{ id: 1, name: 'O\'Brien, "Special"', email: 'test@test.com', role: 'Dev', active: true }];

      const csv = exportToCSV(data, testColumns);

      expect(csv).toContain('"O\'Brien, ""Special"""');
    });

    it('should handle line endings', () => {
      const csvUnix = exportToCSV(testData, testColumns, { lineEnding: '\n' });
      const csvWindows = exportToCSV(testData, testColumns, { lineEnding: '\r\n' });

      expect(csvUnix.includes('\r\n')).toBe(false);
      expect(csvWindows.includes('\r\n')).toBe(true);
    });

    it('should export only specified columns', () => {
      const csv = exportToCSV(testData, testColumns, {
        columns: ['id', 'name'],
      });

      expect(csv).toContain('"ID","Name"');
      expect(csv).not.toContain('Email');
      expect(csv).not.toContain('Role');
    });

    it('should handle empty data', () => {
      const csv = exportToCSV([], testColumns);

      expect(csv).toBe('"ID","Name","Email","Role","Active"');
    });

    it('should throw for no columns', () => {
      expect(() => {
        exportToCSV(testData, testColumns, { columns: [] });
      }).toThrow('No columns to export');
    });
  });

  describe('exportToTSV', () => {
    it('should export data to TSV format', () => {
      const tsv = exportToTSV(testData, testColumns);

      expect(tsv).toContain('ID\tName\tEmail\tRole\tActive');
      expect(tsv).toContain('1\tAlice\talice@example.com\tDeveloper\ttrue');
    });

    it('should not quote values in TSV', () => {
      const data = [{ id: 1, name: 'Test Name', email: 'test@test.com', role: 'Dev', active: true }];
      const tsv = exportToTSV(data, testColumns);

      expect(tsv).not.toContain('"Test Name"');
      expect(tsv).toContain('Test Name');
    });
  });

  describe('exportToJSON', () => {
    it('should export data to JSON', () => {
      const json = exportToJSON(testData, testColumns);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);
      expect(parsed[0]).toEqual(testData[0]);
    });

    it('should pretty print JSON when requested', () => {
      const json = exportToJSON(testData, testColumns, { prettyPrint: true });

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should export compact JSON by default', () => {
      const json = exportToJSON(testData, testColumns);

      expect(json).not.toContain('\n  ');
      expect(json.startsWith('[')).toBe(true);
    });

    it('should export only specified columns', () => {
      const json = exportToJSON(testData, testColumns, {
        columns: ['id', 'name'],
      });
      const parsed = JSON.parse(json);

      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('name');
      expect(parsed[0]).not.toHaveProperty('email');
    });

    it('should handle empty data', () => {
      const json = exportToJSON([], testColumns);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual([]);
    });
  });

  describe('exportToText', () => {
    it('should export data to formatted text table', () => {
      const text = exportToText(testData, testColumns);

      expect(text).toContain('ID');
      expect(text).toContain('Name');
      expect(text).toContain('Alice');
      expect(text).toContain('─');
      expect(text).toContain('│');
    });

    it('should align columns properly', () => {
      const columns: TableColumn<TestData>[] = [
        { key: 'id', header: 'ID', align: 'right' },
        { key: 'name', header: 'Name', align: 'left' },
      ];

      const text = exportToText(testData, columns);
      const lines = text.split('\n');

      // Headers and data should be properly aligned
      expect(lines.length).toBeGreaterThan(2);
    });

    it('should include separator between header and data', () => {
      const text = exportToText(testData, testColumns);

      expect(text).toMatch(/─+┼─+/);
    });

    it('should export only specified columns', () => {
      const text = exportToText(testData, testColumns, {
        columns: ['id', 'name'],
      } as any);

      expect(text).toContain('ID');
      expect(text).toContain('Name');
      expect(text).not.toContain('Email');
    });
  });

  describe('exportToMarkdown', () => {
    it('should export data to Markdown table', () => {
      const md = exportToMarkdown(testData, testColumns);

      expect(md).toContain('| ID | Name | Email | Role | Active |');
      expect(md).toContain('| --- | --- | --- | --- | --- |');
      expect(md).toContain('| 1 | Alice | alice@example.com | Developer | true |');
    });

    it('should respect column alignment', () => {
      const columns: TableColumn<TestData>[] = [
        { key: 'id', header: 'ID', align: 'right' },
        { key: 'name', header: 'Name', align: 'center' },
        { key: 'email', header: 'Email', align: 'left' },
      ];

      const md = exportToMarkdown(testData, columns);

      expect(md).toContain('---:'); // Right align
      expect(md).toContain(':---:'); // Center align
      expect(md).toContain('---'); // Left align (default)
    });

    it('should escape pipe characters', () => {
      const data = [{ id: 1, name: 'Test|Name', email: 'test@test.com', role: 'Dev', active: true }];
      const md = exportToMarkdown(data, testColumns);

      expect(md).toContain('Test\\|Name');
    });

    it('should export only specified columns', () => {
      const md = exportToMarkdown(testData, testColumns, {
        columns: ['id', 'name'],
      });

      expect(md).toContain('| ID | Name |');
      expect(md).not.toContain('Email');
    });
  });

  describe('exportToHTML', () => {
    it('should export data to HTML table', () => {
      const html = exportToHTML(testData, testColumns);

      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('</table>');
      expect(html).toContain('<th>ID</th>');
      expect(html).toContain('<td>Alice</td>');
    });

    it('should escape HTML special characters', () => {
      const data = [{ id: 1, name: '<script>alert("xss")</script>', email: 'test@test.com', role: 'Dev', active: true }];
      const html = exportToHTML(data, testColumns);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should include alignment styles', () => {
      const columns: TableColumn<TestData>[] = [
        { key: 'id', header: 'ID', align: 'right' },
        { key: 'name', header: 'Name', align: 'center' },
      ];

      const html = exportToHTML(testData, columns);

      expect(html).toContain('text-align: right');
      expect(html).toContain('text-align: center');
    });

    it('should export only specified columns', () => {
      const html = exportToHTML(testData, testColumns, {
        columns: ['id', 'name'],
      });

      expect(html).toContain('<th>ID</th>');
      expect(html).toContain('<th>Name</th>');
      expect(html).not.toContain('<th>Email</th>');
    });

    it('should handle empty data', () => {
      const html = exportToHTML([], testColumns);

      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      // Should have headers but no data rows
    });
  });

  describe('Export with custom formatters', () => {
    it('should apply column formatters in CSV', () => {
      const columns: TableColumn<TestData>[] = [
        { key: 'id', header: 'ID' },
        {
          key: 'name',
          header: 'Name',
          format: (value) => value.toUpperCase(),
        },
      ];

      const csv = exportToCSV(testData, columns);

      expect(csv).toContain('ALICE');
      expect(csv).toContain('BOB');
      expect(csv).toContain('CHARLIE');
    });

    it('should apply column formatters in JSON', () => {
      const columns: TableColumn<TestData>[] = [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
      ];

      const json = exportToJSON(testData, columns);
      const parsed = JSON.parse(json);

      // JSON export uses raw values, not formatted
      expect(parsed[0].name).toBe('Alice');
    });
  });

  describe('Large dataset export performance', () => {
    it('should handle large datasets efficiently', () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        role: 'Developer',
        active: true,
      }));

      const start = performance.now();
      const csv = exportToCSV(largeData, testColumns);
      const end = performance.now();

      expect(csv.split('\n').length).toBe(10001); // Header + 10000 rows
      expect(end - start).toBeLessThan(500); // Should be fast
    });
  });
});
