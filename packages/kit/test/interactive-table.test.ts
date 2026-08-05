/**
 * Wiring tests for interactiveTable().
 *
 * Regression: interactiveTable() silently dropped every option that was not
 * part of a hard-coded subset — message, initialSelection, initialSort,
 * navigable, headerStyle/cellStyle, customFilter/filterColumns, validate and
 * all callbacks (onSelect/onNavigate/onSort/onFilter) were declared in
 * InteractiveTableOptions, documented, and ignored.
 *
 * Same disease, second round: `editable`/`validateEdit`/`onEdit` were
 * declared and never wired (the edit key did nothing), `loadMore`/`hasMore`
 * had no implementation at all, `s` could only ever sort columns[0], and in
 * filter mode Enter submitted the whole prompt instead of applying the
 * filter. These tests pin the completed behaviour:
 *  - filter mode: Enter applies the filter and leaves filter mode; Escape
 *    discards it; only normal-mode Enter submits
 *  - edit mode: `e` opens the focused cell, Enter commits (via validateEdit),
 *    Escape cancels, ←/→ pick the column
 *  - `s` sorts the column focused with ←/→
 *  - navigation near the end of loaded data triggers loadMore
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
    // first Enter applies the filter, second submits the prompt
    input.emit('keypress', '', { name: 'return' });
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
    // first Enter applies the filter, second submits the prompt
    input.emit('keypress', '', { name: 'return' });
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

  describe('filter mode transitions', () => {
    test('Enter applies the filter and keeps the prompt open', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        filterable: true,
        input,
        output,
      });

      input.emit('keypress', '/', { name: '/' });
      input.emit('keypress', 'a', { name: 'a' });
      input.emit('keypress', 'l', { name: 'l' });
      input.emit('keypress', '', { name: 'return' });

      // the filter is applied (status bar shows it) and the prompt is still
      // rendering frames, i.e. Enter did not submit
      const afterApply = output.buffer.join('');
      expect(afterApply).toContain('Filter: al');
      expect(afterApply).toContain('1/3');

      input.emit('keypress', '', { name: 'return' });
      const value = await result;
      expect(Array.isArray(value)).toBe(true);
    });

    test('Escape leaves filter mode without cancelling the prompt', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        filterable: true,
        input,
        output,
      });

      input.emit('keypress', '/', { name: '/' });
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'escape', sequence: '' });
      input.emit('keypress', '', { name: 'return' });
      const value = await result;

      expect(prompts.isCancel(value)).toBe(false);
      expect(Array.isArray(value)).toBe(true);
    });

    test('Escape still cancels from normal mode', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        filterable: true,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'escape', sequence: '' });
      const value = await result;

      expect(prompts.isCancel(value)).toBe(true);
    });
  });

  describe('inline editing', () => {
    test('e opens the focused cell and Enter commits through onEdit', async () => {
      const onEdit = vi.fn();
      const data = createData();
      const result = prompts.interactiveTable({
        data,
        columns,
        editable: true,
        onEdit,
        input,
        output,
      });

      // edit the id cell of the first row: clear the prefilled value, type 42
      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', '', { name: 'u', ctrl: true });
      input.emit('keypress', '4', { name: '4' });
      input.emit('keypress', '2', { name: '2' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      // type is inferred from the old value: the number cell stays a number
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 42, name: 'Charlie' }),
        'id',
        1,
        42
      );
      // the committed value is rendered immediately
      expect(output.buffer.join('')).toContain('42');
    });

    test('edit buffer is rendered in place while typing', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        editable: true,
        input,
        output,
      });

      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', 'x', { name: 'x' });

      // buffer = prefilled '1' + typed 'x', followed by the caret
      expect(output.buffer.join('')).toContain('1x');

      input.emit('keypress', '', { name: 'escape', sequence: '' });
      input.emit('keypress', '', { name: 'return' });
      await result;
    });

    test('validateEdit rejects: error shown, edit mode stays, fix passes', async () => {
      const onEdit = vi.fn();
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        editable: true,
        validateEdit: (_row, _column, newValue) =>
          Number(newValue) > 100 ? 'Too big' : undefined,
        onEdit,
        input,
        output,
      });

      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', '', { name: 'u', ctrl: true });
      input.emit('keypress', '9', { name: '9' });
      input.emit('keypress', '9', { name: '9' });
      input.emit('keypress', '9', { name: '9' });
      input.emit('keypress', '', { name: 'return' });

      // rejected like a prompt validation error, still editing
      expect(output.buffer.join('')).toContain('✖ Too big');
      expect(onEdit).not.toHaveBeenCalled();

      // fix the value and commit
      input.emit('keypress', '', { name: 'u', ctrl: true });
      input.emit('keypress', '7', { name: '7' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 'id', 1, 7);
    });

    test('Escape cancels the edit without changing data', async () => {
      const onEdit = vi.fn();
      const data = createData();
      const result = prompts.interactiveTable({
        data,
        columns,
        editable: true,
        onEdit,
        input,
        output,
      });

      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', '9', { name: '9' });
      input.emit('keypress', '', { name: 'escape', sequence: '' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(onEdit).not.toHaveBeenCalled();
      expect(data[0]).toEqual({ id: 1, name: 'Charlie' });
    });

    test('editableColumns keeps other columns read-only', async () => {
      const onEdit = vi.fn();
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        editable: true,
        editableColumns: ['name'],
        onEdit,
        input,
        output,
      });

      // focused column is `id`, which is not editable — `e` must not open it
      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', '5', { name: '5' });
      input.emit('keypress', '', { name: 'return' });
      const value = await result;

      expect(onEdit).not.toHaveBeenCalled();
      expect(Array.isArray(value)).toBe(true);
    });

    test('←/→ choose the edit target column', async () => {
      const onEdit = vi.fn();
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        editable: true,
        input,
        output,
        onEdit,
      });

      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', '!', { name: undefined });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      // the second column (name) took the edit, appended to the old value
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Charlie!' }),
        'name',
        'Charlie',
        'Charlie!'
      );
    });

    test('an edited selected row is returned with the edit applied', async () => {
      const data = createData();
      const result = prompts.interactiveTable({
        data,
        columns,
        selectable: 'multiple',
        editable: true,
        input,
        output,
      });

      input.emit('keypress', ' ', { name: 'space' }); // select Charlie
      input.emit('keypress', '', { name: 'right' }); // target the name column
      input.emit('keypress', 'e', { name: 'e' });
      input.emit('keypress', '', { name: 'u', ctrl: true });
      input.emit('keypress', 'Z', { name: 'z' });
      input.emit('keypress', '', { name: 'return' }); // commit edit
      input.emit('keypress', '', { name: 'return' }); // submit
      const value = await result;

      expect(value).toEqual([{ id: 1, name: 'Z' }]);
    });
  });

  describe('column-selectable sorting', () => {
    test('s sorts the column focused with ←/→', async () => {
      const onSort = vi.fn();
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        sortable: true,
        onSort,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', 's', { name: 's' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(onSort).toHaveBeenCalledWith('name', 'asc');

      // rendered rows follow the name sort
      const frame = output.buffer.join('');
      const alice = frame.lastIndexOf('Alice');
      const charlie = frame.lastIndexOf('Charlie');
      expect(alice).toBeGreaterThan(-1);
      expect(alice).toBeLessThan(charlie);
    });

    test('column focus is clamped at the edges', async () => {
      const onSort = vi.fn();
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        sortable: true,
        onSort,
        input,
        output,
      });

      // walking past the last column stays on the last column
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', 's', { name: 's' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(onSort).toHaveBeenCalledWith('name', 'asc');
    });
  });

  describe('incremental loading (loadMore)', () => {
    test('navigating near the end fetches and appends the next batch', async () => {
      const loadMore = vi.fn().mockResolvedValue([{ id: 4, name: 'Dora' }]);
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        pageSize: 2,
        hasMore: true,
        loadMore,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'down' });
      await vi.waitFor(() => {
        expect(loadMore).toHaveBeenCalledTimes(1);
        // appended rows count into the row indicator; `+` says more may come
        expect(output.buffer.join('')).toContain('Row 2/4+');
      });

      input.emit('keypress', '', { name: 'return' });
      await result;
    });

    test('an empty batch marks the dataset complete', async () => {
      const loadMore = vi.fn().mockResolvedValue([]);
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        pageSize: 2,
        hasMore: true,
        loadMore,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'down' });
      await vi.waitFor(() => {
        // the resolved empty batch drops the `+` from the row counter
        // (earlier frames in the buffer legitimately still carry it)
        const tail = output.buffer.slice(-3).join('');
        expect(tail).toContain('Row 2/3');
        expect(tail).not.toContain('3+');
      });

      // hasMore dropped: further navigation must not fetch again
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(loadMore).toHaveBeenCalledTimes(1);
    });

    test('a dataset shorter than the window is topped up immediately', async () => {
      const loadMore = vi.fn().mockResolvedValue([
        { id: 2, name: 'Beth' },
        { id: 3, name: 'Cody' },
      ]);
      const result = prompts.interactiveTable({
        data: [{ id: 1, name: 'Ann' }],
        columns,
        pageSize: 5,
        hasMore: true,
        loadMore,
        input,
        output,
      });

      await vi.waitFor(() => {
        // appended rows are inside the scroll window, hence rendered
        expect(output.buffer.join('')).toContain('Cody');
      });

      input.emit('keypress', '', { name: 'return' });
      await result;
    });

    test('a failed batch surfaces as a table error and is retried', async () => {
      const loadMore = vi
        .fn()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue([{ id: 4, name: 'Dora' }]);
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        pageSize: 2,
        hasMore: true,
        loadMore,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'down' });
      await vi.waitFor(() => {
        expect(output.buffer.join('')).toContain('✖ network down');
      });

      // next navigation retries
      input.emit('keypress', '', { name: 'down' });
      await vi.waitFor(() => {
        expect(loadMore).toHaveBeenCalledTimes(2);
      });

      input.emit('keypress', '', { name: 'return' });
      await result;
    });

    test('loading indicator is shown while a batch is in flight', async () => {
      let release!: (rows: Row[]) => void;
      const loadMore = vi.fn(
        () => new Promise<Row[]>((resolve) => {
          release = resolve;
        })
      );
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        pageSize: 2,
        hasMore: true,
        loadMore,
        loadingIndicator: 'Fetching…',
        input,
        output,
      });

      input.emit('keypress', '', { name: 'down' });
      expect(output.buffer.join('')).toContain('Fetching…');

      release([]);
      await vi.waitFor(() => {
        // indicator gone once the batch settled: the repaint tail shows the
        // counter without `+` and without the indicator text
        const tail = output.buffer.slice(-3).join('');
        expect(tail).toContain('Row 2/3');
        expect(tail).not.toContain('Fetching…');
      });
      input.emit('keypress', '', { name: 'return' });
      await result;
    });
  });

  describe('previously ignored render options', () => {
    test('maxHeight clamps the scroll window', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        maxHeight: 2,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'return' });
      await result;

      // window holds two rows: the third row never renders
      const frame = output.buffer.join('');
      expect(frame).toContain('Charlie');
      expect(frame).toContain('Alice');
      expect(frame).not.toContain('Bob');
    });

    test('showRowNumbers prepends the # column', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        showRowNumbers: true,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(output.buffer.join('')).toContain('#');
    });

    test('footer text renders below the table', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        footer: { text: (rows) => `${rows.length} people` },
        input,
        output,
      });

      input.emit('keypress', '', { name: 'return' });
      await result;

      expect(output.buffer.join('')).toContain('3 people');
    });
  });

  describe('key hints footer', () => {
    test('hints reflect the enabled features', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        selectable: 'multiple',
        sortable: true,
        filterable: true,
        editable: true,
        input,
        output,
      });

      input.emit('keypress', '', { name: 'return' });
      await result;

      const frame = output.buffer.join('');
      expect(frame).toContain('↑/↓ to navigate');
      expect(frame).toContain('←/→: column');
      expect(frame).toContain('Space: select');
      expect(frame).toContain('s: sort');
      expect(frame).toContain('/: filter');
      expect(frame).toContain('e: edit');
      expect(frame).toContain('Enter: confirm');
    });

    test('filter mode swaps the hints', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        filterable: true,
        input,
        output,
      });

      input.emit('keypress', '/', { name: '/' });
      expect(output.buffer.join('')).toContain('Enter: apply');

      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      await result;
    });

    test('edit mode swaps the hints', async () => {
      const result = prompts.interactiveTable({
        data: createData(),
        columns,
        editable: true,
        input,
        output,
      });

      input.emit('keypress', 'e', { name: 'e' });
      expect(output.buffer.join('')).toContain('Enter: save');

      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      await result;
    });
  });
});
