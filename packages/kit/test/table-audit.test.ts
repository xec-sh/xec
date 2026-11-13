import { it, vi, expect, describe } from 'vitest';

import { MockReadable, MockWritable } from './test-utils.js';
import { isCancel, exportToJSON, interactiveTable } from '../src/index.js';
import { updateStateData, createTableState } from '../src/components/table/table-state.js';
import { navigateLast, navigatePageDown } from '../src/components/table/table-navigator.js';
import { saveEdit, enterEditMode, updateEditValue } from '../src/components/table/table-editor.js';

const columns = [{ key: 'id', header: 'ID' }, { key: 'name', header: 'Name' }];
const rows = Array.from({ length: 20 }, (_, id) => ({ id, name: `item-${id}` }));

describe('table state and interactive lifecycle', () => {
  it('keeps filtered rows inside the viewport after scrolling to the end', () => {
    const options = { data: rows, columns, pageSize: 3 };
    const state = { ...navigateLast(createTableState(rows, options)), filterQuery: 'item-1' };
    const next = updateStateData(state, options);
    expect(next.visibleRange[0]).toBeLessThanOrEqual(next.focusedRow);
    expect(next.visibleRange[1]).toBeGreaterThan(next.focusedRow);
    expect(next.visibleRange[1]).toBeLessThanOrEqual(next.data.length);
  });

  it('keeps focus nonnegative when paging an empty result', () => {
    const state = createTableState([], { data: [], columns });
    expect(navigatePageDown(state).focusedRow).toBe(0);
  });

  it.each(['abc', '', 'Infinity'])('rejects invalid numeric edit %j without changing data', value => {
    const onEdit = vi.fn();
    const options = { data: rows, columns, editable: true, onEdit };
    const state = updateEditValue(enterEditMode(createTableState(rows, options), options), value);
    const next = saveEdit(state, options);
    expect(next.isEditing).toBe(true);
    expect(next.error).toContain('finite number');
    expect(next.originalData).toEqual(rows);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('reapplies sorting and updates selection through the exported edit helper', () => {
    const options = {
      data: rows, columns, editable: true, initialSelection: [rows[0]!],
      initialSort: { key: 'id', direction: 'asc' as const },
    };
    const state = updateEditValue(enterEditMode(createTableState(rows, options), options), '100');
    const next = saveEdit(state, options);
    expect(next.data.at(-1)?.id).toBe(100);
    expect([...next.selected]).toEqual([{ id: 100, name: 'item-0' }]);
    expect(next.selected.has(rows[0]!)).toBe(false);
  });

  it('preserves a literal __proto__ column in JSON export', () => {
    const data = [JSON.parse('{"__proto__":"literal"}')];
    expect(JSON.parse(exportToJSON(data, [{ key: '__proto__', header: 'Value' }]))[0])
      .toEqual(JSON.parse('{"__proto__":"literal"}'));
  });

  it('cancels with Ctrl+C without firing a selection mutation', async () => {
    const input = new MockReadable();
    const onSelect = vi.fn();
    const result = interactiveTable({
      data: rows, columns, input, output: new MockWritable(),
      selectable: 'multiple', initialSelection: [rows[0]!], onSelect,
    });
    input.emit('keypress', '\x03', { name: 'c', ctrl: true });
    expect(isCancel(await result)).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('honors navigable false for arrow and page navigation', async () => {
    const input = new MockReadable();
    const onNavigate = vi.fn();
    const result = interactiveTable({
      data: rows, columns, input, output: new MockWritable(), navigable: false,
      selectable: 'single', onNavigate,
    });
    input.emit('keypress', '', { name: 'down' });
    input.emit('keypress', '', { name: 'pagedown' });
    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'return' });
    expect(await result).toEqual([rows[0]]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('aborts incremental loading and ignores late results on cancellation', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    let finish!: (value: typeof rows) => void;
    let signal: AbortSignal | undefined;
    const loadMore = vi.fn((received: AbortSignal) => {
      signal = received;
      return new Promise<typeof rows>(resolve => { finish = resolve; });
    });
    const result = interactiveTable({ data: [], columns, input, output, hasMore: true, loadMore });
    await vi.waitFor(() => expect(loadMore).toHaveBeenCalledOnce());
    input.emit('keypress', '\x03', { name: 'c', ctrl: true });
    expect(isCancel(await result)).toBe(true);
    expect(signal?.aborted).toBe(true);
    const frameCount = output.buffer.length;
    finish(rows);
    await Promise.resolve();
    await Promise.resolve();
    expect(output.buffer.length).toBe(frameCount);
  });

  it('does not dispatch a load for an already cancelled prompt', async () => {
    const loadMore = vi.fn().mockResolvedValue(rows);
    const result = interactiveTable({
      data: [], columns, input: new MockReadable(), output: new MockWritable(),
      hasMore: true, loadMore, signal: AbortSignal.abort(),
    });
    expect(isCancel(await result)).toBe(true);
    await Promise.resolve();
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('reports a synchronous loader failure and remains cancellable', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = interactiveTable({
      data: [], columns, input, output, hasMore: true,
      loadMore() { throw new Error('loader failed'); },
    });
    await vi.waitFor(() => expect(output.buffer.join('')).toContain('loader failed'));
    input.emit('keypress', '', { name: 'escape' });
    expect(isCancel(await result)).toBe(true);
  });

  it('filters pasted Unicode and deletes an entire grapheme', async () => {
    const input = new MockReadable();
    const onFilter = vi.fn();
    const result = interactiveTable({
      data: [{ id: 1, name: 'dev👩🏽‍💻' }], columns, input, output: new MockWritable(),
      filterable: true, onFilter,
    });
    input.emit('keypress', '/', { name: '/' });
    input.emit('keypress', 'dev👩🏽‍💻', {});
    expect(onFilter).toHaveBeenLastCalledWith('dev👩🏽‍💻');
    input.emit('keypress', '', { name: 'backspace' });
    expect(onFilter).toHaveBeenLastCalledWith('dev');
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    await result;
  });
});

describe('table asynchronous callbacks', () => {
  it('rejects and finalizes when rendering a loaded row fails', async () => {
    const input = new MockReadable();
    const failure = new Error('row renderer failed');
    let signal: AbortSignal | undefined;
    const result = interactiveTable({
      data: [{ id: 1, name: 'first' }], columns, input, output: new MockWritable(), hasMore: true,
      async loadMore(value) { signal = value; return [{ id: 99, name: 'loaded' }]; },
      cellStyle(text, row) { if (row.id === 99) throw failure; return text; },
    });
    await expect(result).rejects.toBe(failure);
    expect(signal?.aborted).toBe(true);
    expect(input.listenerCount('keypress')).toBe(0);
  });

  it('validates selections asynchronously through the shared prompt lifecycle', async () => {
    const input = new MockReadable();
    const validate = vi.fn(async (selected: typeof rows) => selected.length ? undefined : 'Choose a row');
    const result = interactiveTable({
      data: rows, columns, input, output: new MockWritable(),
      selectable: 'single', initialSelection: [rows[0]!], validate,
    });
    input.emit('keypress', '\r', { name: 'return' });
    expect(await result).toEqual([rows[0]]);
    expect(validate).toHaveBeenCalledExactlyOnceWith([rows[0]]);
  });
});
