/**
 * Tests for empty table rendering edge cases
 * These tests ensure that empty tables are rendered correctly with borders
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { table } from '../src/index.js';
import { MockWritable } from './test-utils.js';

describe('Empty table rendering', () => {
  let output: MockWritable;

  beforeEach(() => {
    output = new MockWritable();
  });

  it('should render empty table with single borders', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'single',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Should have borders around "(no data)"
    expect(result).toContain('│');
    expect(result).toContain('(no data)');

    // Find the line with "(no data)" and verify it has borders
    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('│');
  });

  it('should render empty table with double borders', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'double',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Should have double borders around "(no data)"
    expect(result).toContain('║');
    expect(result).toContain('(no data)');

    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('║');
  });

  it('should render empty table with rounded borders', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'rounded',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Should have rounded borders
    expect(result).toContain('╭');
    expect(result).toContain('╯');
    expect(result).toContain('(no data)');

    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('│');
  });

  it('should render empty table with ascii borders', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'ascii',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Should have ASCII borders around "(no data)"
    expect(result).toContain('|');
    expect(result).toContain('(no data)');

    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('|');
  });

  it('should render empty table with no borders', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'none',
      output,
    });

    const result = output.buffer.join('');

    // Should show "(no data)" without borders
    expect(result).toContain('(no data)');
    expect(result).not.toContain('│');
    expect(result).not.toContain('|');
  });

  it('should center "(no data)" message with single column', () => {
    table({
      data: [],
      columns: [{ key: 'value', header: 'Value', width: 30 }],
      borders: 'single',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Message should be centered
    expect(result).toContain('(no data)');

    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('│');
    // Message should have spaces on both sides (centered)
    expect(noDataLine).toMatch(/│\s+\(no data\)\s+│/);
  });

  it('should center "(no data)" message with multiple columns', () => {
    table({
      data: [],
      columns: [
        { key: 'a', header: 'A', width: 10 },
        { key: 'b', header: 'B', width: 10 },
        { key: 'c', header: 'C', width: 10 },
      ],
      borders: 'single',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Message should span all columns and be centered
    expect(result).toContain('(no data)');

    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('│');
    // Message should have spaces on both sides (centered)
    expect(noDataLine).toMatch(/│\s+\(no data\)\s+│/);
  });

  it('should handle very narrow columns', () => {
    table({
      data: [],
      columns: [
        { key: 'a', header: 'A', width: 3 },
        { key: 'b', header: 'B', width: 3 },
      ],
      borders: 'single',
      output,
    });

    const result = output.buffer.join('');

    // Should still show message, even if columns are narrow
    expect(result).toContain('(no data)');
    expect(result).toContain('│');
  });

  it('should handle very wide columns', () => {
    table({
      data: [],
      columns: [
        { key: 'a', header: 'Very Long Column Header A', width: 50 },
        { key: 'b', header: 'Very Long Column Header B', width: 50 },
      ],
      borders: 'single',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n');

    // Message should be centered in wide table
    expect(result).toContain('(no data)');

    const noDataLine = lines.find((line: string) => line.includes('(no data)'));
    expect(noDataLine).toBeDefined();
    expect(noDataLine).toContain('│');
    // Message should have spaces on both sides (centered)
    expect(noDataLine).toMatch(/│\s+\(no data\)\s+│/);
  });

  it('should render empty table without header', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'single',
      showHeader: false,
      output,
    });

    const result = output.buffer.join('');

    // When showHeader is false and data is empty, only footer renders
    expect(result).toContain('└');
    expect(result).toContain('┘');
    // Should not contain header or data
    expect(result).not.toContain('Name');
    expect(result).not.toContain('(no data)');
  });

  it('should have consistent line count in empty table', () => {
    table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 15 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'single',
      output,
    });

    const result = output.buffer.join('');
    const lines = result.split('\n').filter((line: string) => line.trim().length > 0);

    // Empty table should have:
    // 1. Top border
    // 2. Header row
    // 3. Header separator
    // 4. "(no data)" row
    // 5. Bottom border
    expect(lines.length).toBe(5);
  });
});
