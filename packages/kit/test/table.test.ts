import { vi, test, expect, afterAll, describe, afterEach, beforeAll, beforeEach } from 'vitest';

import * as prompts from '../src/index.js';
import { prism as colors } from '../src/index.js';
import { MockReadable, MockWritable } from './test-utils.js';

describe.each(['true', 'false'])('table (isCI = %s)', (isCI) => {
  let originalCI: string | undefined;
  let output: MockWritable;
  let input: MockReadable;

  beforeAll(() => {
    originalCI = process.env['CI'];
    process.env['CI'] = isCI;
  });

  afterAll(() => {
    process.env['CI'] = originalCI;
  });

  beforeEach(() => {
    output = new MockWritable();
    input = new MockReadable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders basic table with data', () => {
    const data = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
      { id: 3, name: 'Charlie', age: 35 },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'id', header: 'ID', width: 5 },
        { key: 'name', header: 'Name', width: 15 },
        { key: 'age', header: 'Age', width: 5, align: 'right' },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with single border style', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'single',
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with double border style', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'double',
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with rounded border style', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'rounded',
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with ascii border style', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'ascii',
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with no borders', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      borders: 'none',
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders empty table', () => {
    prompts.table({
      data: [],
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with custom formatters', () => {
    const data = [
      { name: 'Alice', score: 95, status: true },
      { name: 'Bob', score: 78, status: false },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        {
          key: 'score',
          header: 'Score',
          width: 10,
          format: (v) => `${v}%`,
          align: 'right',
        },
        {
          key: 'status',
          header: 'Status',
          width: 10,
          format: (v) => (v ? '✓' : '✗'),
        },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with custom styles', () => {
    const data = [
      { name: 'Alice', status: 'active' },
      { name: 'Bob', status: 'inactive' },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        {
          key: 'status',
          header: 'Status',
          width: 10,
          style: (text, value) => (value === 'active' ? colors.green(text) : colors.red(text)),
        },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders table with text alignment', () => {
    const data = [{ left: 'L', center: 'C', right: 'R' }];

    prompts.table({
      data,
      columns: [
        { key: 'left', header: 'Left', width: 10, align: 'left' },
        { key: 'center', header: 'Center', width: 10, align: 'center' },
        { key: 'right', header: 'Right', width: 10, align: 'right' },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('truncates long text with ellipsis', () => {
    const data = [{ text: 'This is a very long text that should be truncated' }];

    prompts.table({
      data,
      columns: [{ key: 'text', header: 'Text', width: 15, ellipsis: true }],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('handles wide characters (CJK)', () => {
    const data = [
      { name: '太郎', description: '日本語のテスト' },
      { name: '花子', description: 'もう一つのテスト' },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: '名前', width: 10 },
        { key: 'description', header: '説明', width: 20 },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders with header styling', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      headerStyle: colors.cyan,
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders without header', () => {
    const data = [{ name: 'Test', value: '123' }];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      showHeader: false,
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('handles null and undefined values', () => {
    const data = [
      { name: 'Alice', value: null },
      { name: null, value: 'Test' },
      { name: 'Bob', value: undefined },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 10 },
        { key: 'value', header: 'Value', width: 10 },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders with auto width', () => {
    const data = [
      { short: 'A', long: 'This is a longer text' },
      { short: 'B', long: 'Short' },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'short', header: 'Short', width: 'auto' },
        { key: 'long', header: 'Long', width: 'auto' },
      ],
      width: 'auto',
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders with content width', () => {
    const data = [
      { name: 'A', description: 'First' },
      { name: 'BB', description: 'Second item' },
      { name: 'CCC', description: 'Third' },
    ];

    prompts.table({
      data,
      columns: [
        { key: 'name', header: 'Name', width: 'content' },
        { key: 'description', header: 'Description', width: 'content' },
      ],
      output,
    });

    expect(output.buffer).toMatchSnapshot();
  });

  test('throws error for invalid data', () => {
    expect(() => {
      prompts.table({
        data: null as any,
        columns: [{ key: 'name', header: 'Name' }],
        output,
      });
    }).toThrow('Table data must be an array');
  });

  test('throws error for empty columns', () => {
    expect(() => {
      prompts.table({
        data: [],
        columns: [],
        output,
      });
    }).toThrow('Table must have at least one column');
  });
});
