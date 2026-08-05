---
title: Tables
description: Static table rendering, interactive navigation with sorting and filtering, data export
---

# Tables

`table` renders data once; `interactiveTable` opens a navigable view with selection, sorting and filtering.

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

- `width` - a number, `'auto'`, or `'content'`
- `align` - `'left'` (default), `'center'`, `'right'`
- `format: (value, row) => string` - render the cell value
- `style: (text, value, row) => string` - color the rendered text (return an ANSI string, e.g. via `prism`)
- `ellipsis` - show `…` when truncated

```typescript
import { table, prism } from '@xec-sh/kit';

table({
  data: services,
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
- `width` - `'full'` (default, terminal width), `'auto'` (fit content), or a number
- `compact` - less vertical spacing
- `showHeader` (default `true`), `showRowNumbers`, `alternateRows`
- `wordWrap` - `'truncate'` (default) or `'wrap'`
- `alignment` - default alignment for all columns
- `maxHeight` - cap rendered rows
- `headerStyle` / `cellStyle` - style functions applied across the table
- `footer` - a string, or `{ text, columns }` with per-column footers; functions receive the data

## Interactive Table

`interactiveTable` takes the same data and columns, renders a live view, and resolves with the selected rows — or the cancel symbol:

```typescript
import { interactiveTable, isCancel } from '@xec-sh/kit';

const picked = await interactiveTable({
  data: rows,
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

- `selectable` - `'none'` (default), `'single'`, `'multiple'`; `initialSelection` pre-selects rows
- `sortable` - enable sorting; `initialSort: { key, direction }` starts sorted; per-column `sortable: false` opts a column out
- `filterable` - enable the filter line; `filterPlaceholder`, `filterColumns` (keys to search), or `customFilter: (row, query) => boolean`
- `pageSize` - visible rows per page (default 10)
- `message` - a prompt-style title above the table
- Callbacks: `onSelect(rows)`, `onNavigate(row, index)`, `onSort(key, direction)`, `onFilter(query)`
- `validate: (rows) => string | undefined` - checked on submit; a returned message is shown and the table stays open

### Keys

| Key | Action |
|-----|--------|
| `↑` / `↓` (or `k` / `j`) | Move between rows |
| `PageUp` / `PageDown`, `Home` / `End` | Page and jump navigation |
| `Space` | Toggle selection of the focused row |
| `Ctrl+A` | Select all (`selectable: 'multiple'`) |
| `s` | Cycle sort on the first column: ascending, descending, off |
| `/` or `Ctrl+F` | Enter filter mode; type to filter, `Ctrl+U` clears, `Escape` exits |
| `Enter` | Submit the selection |
| `Ctrl+C` / `Escape` | Cancel — the promise resolves with the cancel symbol |

## Export

Exporters turn `(data, columns, options?)` into a string:

```typescript
import { exportToCSV, exportToJSON, exportToMarkdown } from '@xec-sh/kit';

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
const rows = await interactiveTable({
  data,
  columns,
  editable: true,
  editableColumns: ['name'],
  validateEdit: (value, row, column) =>
    String(value).trim() === '' ? 'Cannot be empty' : undefined,
  onEdit: (row, column, value) => audit.push({ row, column, value }),
});
```

Escape leaves the editor without committing; Enter commits.

## Large data

The renderer draws only the visible window, so render cost follows the
viewport, not the data. For data that arrives in batches, `loadMore` is called
as navigation nears the end of what is loaded while `hasMore` is true; the row
counter shows `N+` while more may exist:

```typescript
await interactiveTable({
  data: firstPage,
  columns,
  hasMore: () => cursor.hasNext,
  loadMore: async () => fetchNextPage(),
});
```

## Export safety

CSV and TSV export accept `escapeFormulas: true`, which prefixes values
starting with `=`, `+`, `-` or `@` so a spreadsheet will not execute them.
It is off by default — an exporter must not alter data silently — and worth
turning on whenever the rows contain untrusted input.

## See Also

- [Components](./components.md)
- [Colors & Theming](./theming.md)
