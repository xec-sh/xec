---
title: Tables
description: Static table rendering, interactive navigation with sorting and filtering, data export
---

# Tables

`table` renders data once. `interactiveTable` adds keyboard navigation, selection, sorting, filtering and editing.

## Static Table

```typescript
import { table } from '@xec-sh/kit';

table({
  data: [
    { name: 'api', status: 'running' },
    { name: 'web', status: 'stopped' },
  ],
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status' },
  ],
});
```

### Columns

A column is `{ key, header }` plus:

- `width` - a positive integer, `'auto'`, or `'content'`
- `align` - `'left'` (default), `'center'`, `'right'`
- `format: (value, row) => string` - render the cell value
- `style: (text, value, row) => string` - color the rendered text (return an ANSI string, e.g. via `prism`)
- `ellipsis` - show `...` when truncated
- `priority` - higher values keep a column visible longer on narrow outputs

```typescript
import { table, prism } from '@xec-sh/kit';

table({
  data: [
    { name: 'api', status: 'running', memory: 128.5 },
    { name: 'web', status: 'stopped', memory: 0 },
  ],
  columns: [
    { key: 'name', header: 'Service' },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      style: (text, value) => (value === 'running' ? prism.green(text) : prism.red(text)),
    },
    { key: 'memory', header: 'MB', align: 'right', format: (v) => v.toFixed(1) },
  ],
});
```

### Table Options

- `borders` - `'single'` (default), `'double'`, `'rounded'`, `'ascii'`, `'none'`
- `width` - `'full'` (default, terminal width), `'auto'` (fit content), or a fraction greater than 0 and at most 1
- `compact` - remove horizontal cell padding
- `showHeader` (default `true`), `showRowNumbers`, `alternateRows`
- `wordWrap` - `'truncate'` (default) or `'wrap'`
- `alignment` - default alignment for all columns
- `maxHeight` - cap rendered rows
- `headerStyle` / `cellStyle` - style functions applied across the table
- `footer` - a string, or `{ text, columns }` with per-column footers; functions receive the data

Column keys must be unique. Plain headers and values are stripped of terminal control sequences. Formatting and styling callbacks supply trusted display output. Exports retain the original data.

When columns exceed the output width, the table reports how many are hidden. Interactive tables keep the focused column visible as you move left or right. Resizing recalculates the layout. `width: 'auto'` renders all columns at their content widths.

## Interactive Table

`interactiveTable` takes the same data and columns, renders a live view, and resolves with the selected rows — or the cancel symbol:

```typescript
import { interactiveTable, isCancel } from '@xec-sh/kit';

const picked = await interactiveTable({
  data: [
    { id: 1, name: 'Ada', role: 'developer' },
    { id: 2, name: 'Sam', role: 'operator' },
  ],
  columns: [
    { key: 'id', header: 'ID', width: 5 },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'role', header: 'Role' },
  ],
  selectable: 'multiple',   // 'none' | 'single' | 'multiple'
  sortable: true,
  filterable: true,
});

if (isCancel(picked)) process.exit(0);
console.log(`Selected ${picked.length} rows`);
```

### Options

- `selectable` - `'none'` (default), `'single'`, `'multiple'`; `initialSelection` pre-selects the same row objects supplied in `data`
- `sortable` - enable sorting; `initialSort: { key, direction }` starts sorted; per-column `sortable: false` opts a column out
- `filterable` - enable the filter line; `filterPlaceholder`, `filterColumns` (keys to search), or `customFilter: (row, query) => boolean`
- `pageSize` - visible rows per page (default 10)
- `message` - a prompt-style title above the table
- Callbacks: `onSelect(rows)`, `onNavigate(row, index)`, `onSort(key, direction)`, `onFilter(query)`
- `validate` - a synchronous or asynchronous callback, or a Standard Schema. A returned message keeps the table open. Cancellation also works while validation is pending.

### Keys

| Key | Action |
|-----|--------|
| `↑` / `↓` (or `k` / `j`) | Move between rows |
| `PageUp` / `PageDown`, `Home` / `End` | Page and jump navigation |
| `Space` | Toggle selection of the focused row |
| `Ctrl+A` | Select all (`selectable: 'multiple'`) |
| `←` / `→` | Focus a column, including columns hidden by a narrow viewport |
| `s` | Cycle sort on the focused column through ascending, descending and off |
| `e` | Edit the focused cell |
| `Ctrl+U` | Clear selection, or clear the active filter/editor input |
| `/` or `Ctrl+F` | Enter filter mode; type to filter, `Ctrl+U` clears, `Escape` exits |
| `Enter` | Submit the selection |
| `Ctrl+C` / `Escape` | Cancel — the promise resolves with the cancel symbol |

## Export

Exporters turn `(data, columns, options?)` into a string:

```typescript
import { exportToCSV, exportToJSON, exportToMarkdown } from '@xec-sh/kit';

const rows = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Sam' }];
const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
];

exportToCSV(rows, columns);                          // "ID","Name" ...
exportToJSON(rows, columns, { prettyPrint: true });  // array of objects, keyed by column key
exportToMarkdown(rows, columns);                     // | ID | Name | ...
```

Available: `exportToCSV`, `exportToTSV`, `exportToJSON`, `exportToHTML`, `exportToMarkdown`, `exportToText`. Text formats apply column `format` functions; JSON exports raw values. `options.columns` restricts export to a subset of column keys.

## Editing

`editable: true` opens a cell editor in place. `editableColumns` restricts which
columns accept edits, `validateEdit` rejects a value with a message rendered
like any prompt error, and `onEdit` fires when a change commits:

```typescript
import { interactiveTable } from '@xec-sh/kit';

const data = [{ id: 1, name: 'Ada' }];
const columns = [{ key: 'id', header: 'ID' }, { key: 'name', header: 'Name' }];
const changes: { id: number; column: string; oldValue: unknown; newValue: unknown }[] = [];

const rows = await interactiveTable({
  data,
  columns,
  editable: true,
  editableColumns: ['name'],
  validateEdit: (row, column, value) =>
    String(value).trim() === '' ? 'Cannot be empty' : undefined,
  onEdit: (row, column, oldValue, newValue) => {
    changes.push({ id: row.id, column, oldValue, newValue });
  },
});
```

Escape leaves the editor without committing. Enter commits. Numeric and boolean cells reject invalid values. Successful edits update selection, sorting and filtering together, and keep focus on the edited row while it remains visible.

## Large data

The renderer draws the visible row window. Filtering and sorting operate on all loaded rows. For data that arrives in batches, `loadMore` is called
as navigation nears the end of what is loaded while `hasMore` is true; the row
counter shows `N+` while more may exist. Returning an empty batch marks the end. This example uses two in-memory pages; an application can fetch the next batch inside `loadMore`.

```typescript
import { interactiveTable } from '@xec-sh/kit';

const pages = [
  [{ id: 1, name: 'api' }],
  [{ id: 2, name: 'web' }],
];
let page = 1;

await interactiveTable({
  data: pages[0],
  columns: [{ key: 'id', header: 'ID' }, { key: 'name', header: 'Name' }],
  hasMore: true,
  loadMore: async signal => {
    signal.throwIfAborted();
    return pages[page++] ?? [];
  },
});
```

Pass the supplied signal to network requests. It aborts when the prompt completes, is cancelled or fails. Late results are ignored. Loader errors stay visible and the next navigation can retry loading.

`streamToArray` releases its reader and cancels the source when stopped early. `asyncIterableToArray` closes the iterator and observes cancellation between yields. Pass the same signal to an asynchronous producer so pending I/O can stop. `loadChunked` advances by the actual page length. `batchAsync` limits concurrency, stops admission on failure and waits for admitted operations before rejecting.

## Export safety

CSV and TSV export accept `escapeFormulas: true`, which prefixes values
starting with `=`, `+`, `-` or `@` so a spreadsheet will not execute them.
It is off by default — an exporter must not alter data silently — and worth
turning on whenever the rows contain untrusted input.

## See Also

- [Components](./components.md)
- [Colors & Theming](./theming.md)
