/**
 * Wiring tests for interactiveTable().
 *
 * Regression: interactiveTable() silently dropped every option that was not
 * part of a hard-coded subset — message, initialSelection, initialSort,
 * navigable, headerStyle/cellStyle, customFilter/filterColumns, validate and
 * all callbacks (onSelect/onNavigate/onSort/onFilter) were declared in
 * InteractiveTableOptions, documented, and ignored.
 */

import { vi, test, expect, describe, afterEach, beforeEach } from 'vitest';

import * as prompts from '../src/index.js';
import { MockReadable, MockWritable } from './test-utils.js';

interface Row {
  id: number;
  name: string;
}

const columns = [
  { key: 'id', header: 'ID', width: 5 },
  { key: 'name', header: 'Name', width: 15 },
];

function createData(): Row[] {
  return [
    { id: 1, name: 'Charlie' },
    { id: 2, name: 'Alice' },
    { id: 3, name: 'Bob' },
  ];
}

describe('interactiveTable wiring', () => {
  let output: MockWritable;
  let input: MockReadable;

  beforeEach(() => {
    output = new MockWritable();
    input = new MockReadable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders the message option', async () => {
    const result = prompts.interactiveTable({
      data: createData(),
      columns,
      message: 'Pick your rows',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    await result;

    expect(output.buffer.join('')).toContain('Pick your rows');
  });

  test('initialSelection is returned when submitting immediately', async () => {
    const data = createData();
    const result = prompts.interactiveTable({
      data,
      columns,
      selectable: 'multiple',
      initialSelection: [data[1]!],
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    const value = await result;

    expect(value).toEqual([data[1]]);
  });

  test('initialSort orders the rendered rows', async () => {
    const result = prompts.interactiveTable({
      data: createData(),
      columns,
      sortable: true,
      initialSort: { key: 'name', direction: 'asc' },
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    await result;

    const frame = output.buffer.join('');
    const alice = frame.indexOf('Alice');
    const bob = frame.indexOf('Bob');
    const charlie = frame.indexOf('Charlie');
    expect(alice).toBeGreaterThan(-1);
    expect(alice).toBeLessThan(bob);
    expect(bob).toBeLessThan(charlie);
  });

  test('onSelect fires when toggling selection with space', async () => {
    const onSelect = vi.fn();
    const data = createData();
    const result = prompts.interactiveTable({
      data,
      columns,
      selectable: 'multiple',
      onSelect,
      input,
      output,
    });

    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'return' });
    const value = await result;

    expect(onSelect).toHaveBeenCalledWith([data[0]]);
    expect(value).toEqual([data[0]]);
  });

  test('onNavigate fires when moving focus', async () => {
    const onNavigate = vi.fn();
    const data = createData();
    const result = prompts.interactiveTable({
      data,
      columns,
      onNavigate,
      input,
      output,
    });

    input.emit('keypress', '', { name: 'down' });
    input.emit('keypress', '', { name: 'return' });
    await result;

    expect(onNavigate).toHaveBeenCalledWith(data[1], 1);
  });

  test('onSort fires when sorting with the s key', async () => {
    const onSort = vi.fn();
    const result = prompts.interactiveTable({
      data: createData(),
      columns,
      sortable: true,
      onSort,
      input,
      output,
    });

    input.emit('keypress', 's', { name: 's' });
    input.emit('keypress', '', { name: 'return' });
    await result;

    expect(onSort).toHaveBeenCalledWith('id', 'asc');
  });

  test('onFilter fires while typing a filter query', async () => {
    const onFilter = vi.fn();
    const result = prompts.interactiveTable({
      data: createData(),
      columns,
      filterable: true,
      onFilter,
      input,
      output,
    });

    input.emit('keypress', '/', { name: '/' });
    input.emit('keypress', 'a', { name: 'a' });
    input.emit('keypress', 'l', { name: 'l' });
    input.emit('keypress', '', { name: 'return' });
    await result;

    expect(onFilter).toHaveBeenNthCalledWith(1, 'a');
    expect(onFilter).toHaveBeenNthCalledWith(2, 'al');
  });

  test('customFilter is used for filtering', async () => {
    const customFilter = vi.fn((row: Row, query: string) => String(row.id) === query);
    const result = prompts.interactiveTable({
      data: createData(),
      columns,
      filterable: true,
      customFilter,
      input,
      output,
    });

    input.emit('keypress', '/', { name: '/' });
    input.emit('keypress', '2', { name: '2' });
    input.emit('keypress', '', { name: 'return' });
    await result;

    expect(customFilter).toHaveBeenCalled();
  });

  test('validate rejects submission until it passes', async () => {
    const result = prompts.interactiveTable({
      data: createData(),
      columns,
      selectable: 'multiple',
      validate: (rows) => (rows.length === 0 ? 'Select at least one row' : undefined),
      input,
      output,
    });

    // first submit attempt with empty selection is rejected
    input.emit('keypress', '', { name: 'return' });
    expect(output.buffer.join('')).toContain('Select at least one row');

    // select a row, then submit succeeds
    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'return' });
    const value = await result;

    expect(Array.isArray(value)).toBe(true);
    expect((value as Row[]).length).toBe(1);
  });
});
