import { it, expect, describe } from 'vitest';

import { MockWritable } from './test-utils.js';
import stringWidth from '../src/core/utils/string-width.js';
import { table, exportToJSON, interactiveTable } from '../src/index.js';
import { enterFilterMode } from '../src/components/table/table-filter.js';
import { truncateTextStart } from '../src/components/table/cell-formatter.js';
import { renderInteractiveTable } from '../src/components/table/interactive-renderer.js';
import { updateStateData, createTableState } from '../src/components/table/table-state.js';

const data = [{ name: 'Alice', state: 'Ready', region: 'EU', owner: 'Ops' }];
const columns = [
  { key: 'name', header: 'Name' }, { key: 'state', header: 'State', priority: 10 },
  { key: 'region', header: 'Region' }, { key: 'owner', header: 'Owner' },
];

describe('table rendering boundaries', () => {
  it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid row/column size %s before writing', size => {
    const output = new MockWritable();
    expect(() => table({ data, columns, maxHeight: size, output })).toThrow(RangeError);
    expect(() => table({ data, columns: [{ ...columns[0]!, width: size }], output })).toThrow(RangeError);
    expect(() => interactiveTable({ data, columns, pageSize: size, output })).toThrow(RangeError);
    expect(output.buffer).toEqual([]);
  });

  it.each([NaN, Infinity, 0, -1, 1.1])('rejects invalid table width %s', width => {
    expect(() => table({ data, columns, width, output: new MockWritable() })).toThrow(RangeError);
  });

  it('rejects ambiguous column keys and selections', () => {
    const output = new MockWritable();
    expect(() => table({ data, columns: [columns[0]!, columns[0]!], output })).toThrow(/unique/);
    expect(() => interactiveTable({ data, columns, selectable: 'multiple', initialSelection: [{ ...data[0]! }], output })).toThrow(/from table data/);
  });

  it('removes terminal commands from plain cells and headers while preserving export data', () => {
    const attack = '\x1b]52;c;c2VjcmV0\x07\x1b[2Jsafe\rcarriage';
    const rows = [{ name: attack }];
    const cols = [{ key: 'name', header: '\x1b[2JHeader\nnext' }];
    const output = new MockWritable();
    table({ data: rows, columns: cols, output, headerStyle: text => text });
    const rendered = output.buffer.join('');
    expect(rendered).not.toContain('\x1b');
    expect(rendered).not.toContain('\r');
    expect(rendered).not.toContain('c2VjcmV0');
    expect(rendered).toContain('safe carriage');
    expect(rendered).toContain('Header next');
    expect(JSON.parse(exportToJSON(rows, cols))).toEqual(rows);
  });

  it('retains explicitly formatted ANSI styling', () => {
    const output = new MockWritable();
    table({ data, columns: [{ key: 'name', header: 'Name', format: value => `\x1b[31m${value}\x1b[39m` }], output });
    expect(output.buffer.join('')).toContain('\x1b[31mAlice\x1b[39m');
  });

  it('keeps grapheme clusters whole at the edit caret', () => {
    expect(truncateTextStart('prefix👨‍👩‍👧‍👦', 2)).toBe('👨‍👩‍👧‍👦');
    expect(truncateTextStart('prefixe\u0301', 1)).toBe('e\u0301');
    expect(truncateTextStart('prefix👨‍👩‍👧‍👦', 1)).toBe('');
  });

  it('keeps an existing filter and its displayed rows consistent on re-entry', () => {
    const options = { data, columns, filterable: true };
    const state = updateStateData({ ...createTableState(data, options), filterQuery: 'absent' }, options);
    const next = enterFilterMode(state);
    expect(next.filterQuery).toBe('absent');
    expect(next.data).toEqual([]);
  });

  it('keeps high-priority columns and reports hidden columns on narrow outputs', () => {
    const output = new MockWritable();
    output.columns = 20;
    table({ data, columns, output, headerStyle: text => text });
    const rendered = output.buffer.join('');
    expect(rendered).toContain('State');
    expect(rendered).toContain('2 hidden columns');
    expect(rendered.split('\n').every(line => stringWidth(line) <= 20)).toBe(true);
  });

  it('makes a horizontally focused column visible without changing row identity', () => {
    const output = new MockWritable();
    output.columns = 20;
    const options = { data, columns, output, sortable: true };
    const state = { ...createTableState(data, options), focusedColumn: 3 };
    const rendered = renderInteractiveTable(state, options);
    expect(rendered).toContain('Owner');
    expect(state.data[0]).toBe(data[0]);
    expect(rendered.split('\n').every(line => stringWidth(line) <= 20)).toBe(true);
  });

  it.each([1, 2, 4, 8])('bounds every line even at %i columns', width => {
    const output = new MockWritable();
    output.columns = width;
    table({ data: [], columns, output });
    expect(output.buffer.join('').split('\n').every(line => stringWidth(line) <= width)).toBe(true);
  });
});
