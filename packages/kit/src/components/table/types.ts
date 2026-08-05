/**
 * Table component types and interfaces
 */

import type { CommonOptions } from '../../utilities/common.js';

/**
 * Border style types
 */
export type BorderStyle = 'single' | 'double' | 'rounded' | 'ascii' | 'none';

/**
 * Text alignment options
 */
export type Alignment = 'left' | 'center' | 'right';

/**
 * Column width strategy
 */
export type ColumnWidth = number | 'auto' | 'content';

/**
 * Word wrap strategy.
 *
 * `'truncate'` (default) cuts overflowing cells with an ellipsis;
 * `'wrap'` breaks them across as many physical lines as needed.
 * The booleans are shorthands: `true` = `'wrap'`, `false` = `'truncate'`.
 */
export type WordWrap = boolean | 'truncate' | 'wrap';

/**
 * Table column definition
 */
export interface TableColumn<T = any> {
  /** Column key (property name in data object) */
  key: keyof T | string;

  /** Column header text */
  header: string;

  /** Column width strategy */
  width?: ColumnWidth;

  /** Text alignment for this column */
  align?: Alignment;

  /** Custom formatter function */
  format?: (value: any, row: T) => string;

  /** Custom style function (returns ANSI styled string) */
  style?: (text: string, value: any, row: T) => string;

  /** Whether column is sortable (Phase 2) */
  sortable?: boolean;

  /** Priority for responsive hiding (Phase 2) */
  priority?: number;

  /** Whether to show ellipsis for truncated text */
  ellipsis?: boolean;
}

/**
 * Table footer definition
 */
export interface TableFooter<T = any> {
  /** Footer text or function */
  text?: string | ((data: T[]) => string);

  /** Column-specific footers */
  columns?: Record<string, string | ((data: T[]) => string)>;
}

/**
 * Basic table options for Phase 1
 */
export interface TableOptions<T = any> extends CommonOptions {
  /** Table data */
  data: T[];

  /** Column definitions */
  columns: TableColumn<T>[];

  /** Border style */
  borders?: BorderStyle;

  /**
   * Compact mode: drop the one-space padding inside bordered cells, so the
   * table fits narrow terminals. With `borders: 'none'` there is no padding
   * to drop and the option has no effect. (Was declared and silently
   * ignored before v0.10.)
   */
  compact?: boolean;

  /** Header style function */
  headerStyle?: (text: string) => string;

  /** Cell style function */
  cellStyle?: (text: string, row: T, column: TableColumn<T>) => string;

  /** Table width ('auto' fits content, 'full' uses terminal width, number is percentage) */
  width?: number | 'auto' | 'full';

  /**
   * Cap the number of rendered body rows. When data overflows, the last
   * visible line becomes a muted `… N more rows` indicator, so the cap is
   * honest about what it hides. On the interactive table this clamps the
   * scrolling window (`pageSize`) instead. (Was declared and silently
   * ignored before v0.10.)
   */
  maxHeight?: number;

  /**
   * Word wrap strategy for overflowing cells. `'wrap'` renders multi-line
   * rows in the static table; the interactive table always truncates —
   * keyboard navigation needs one row per line to keep the focus math and
   * the scroll window stable. (Only `'truncate'` worked before v0.10.)
   */
  wordWrap?: WordWrap;

  /** Default text alignment */
  alignment?: Alignment;

  /**
   * Prepend a right-aligned `#` column with 1-based row numbers. Numbers are
   * computed at render time — the data rows are never copied or mutated, so
   * row identity (selection sets, callbacks) is preserved. (Was declared and
   * silently ignored before v0.10.)
   */
  showRowNumbers?: boolean;

  /** Show table header */
  showHeader?: boolean;

  /**
   * Render odd rows in the theme's muted role so wide tables stay scannable.
   * Only applies on a TTY outside CI — piped output stays clean. (Ignored by
   * the interactive table before v0.10.)
   */
  alternateRows?: boolean;

  /**
   * Table footer. A plain string (or `TableFooter.text`) renders below the
   * bottom border; `TableFooter.columns` renders an extra aligned row inside
   * the table — e.g. per-column totals. (`columns` was declared and silently
   * ignored before v0.10, and the interactive table dropped the option
   * entirely.)
   */
  footer?: string | TableFooter<T>;
}

/**
 * Border character set
 */
export interface BorderChars {
  /** Top border character */
  top: string;

  /** Bottom border character */
  bottom: string;

  /** Left border character */
  left: string;

  /** Right border character */
  right: string;

  /** Top-left corner */
  topLeft: string;

  /** Top-right corner */
  topRight: string;

  /** Bottom-left corner */
  bottomLeft: string;

  /** Bottom-right corner */
  bottomRight: string;

  /** Cross (intersection) */
  cross: string;

  /** Top join (T-junction pointing down) */
  topJoin: string;

  /** Bottom join (T-junction pointing up) */
  bottomJoin: string;

  /** Left join (T-junction pointing right) */
  leftJoin: string;

  /** Right join (T-junction pointing left) */
  rightJoin: string;
}

/**
 * Calculated column layout
 */
export interface ColumnLayout {
  /** Calculated width */
  width: number;

  /** Column definition */
  column: TableColumn;

  /** Column index */
  index: number;
}

/**
 * Table layout calculation result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TableLayout<T = any> {
  /** Column layouts */
  columns: ColumnLayout[];

  /** Total table width */
  totalWidth: number;

  /** Available width for content */
  contentWidth: number;

  /** Border characters to use */
  borders: BorderChars;

  /** Whether borders are enabled */
  hasBorders: boolean;
}

/**
 * Interactive table selection mode
 */
export type SelectionMode = 'none' | 'single' | 'multiple';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort column definition
 */
export interface SortColumn {
  /** Column key */
  key: string;

  /** Sort direction */
  direction: SortDirection;
}

/**
 * Interactive table options (Phase 2)
 */
export interface InteractiveTableOptions<T = any> extends TableOptions<T> {
  /** Message to display */
  message?: string;

  /** Selection mode */
  selectable?: SelectionMode;

  /** Initial selection */
  initialSelection?: T[];

  /** Enable navigation */
  navigable?: boolean;

  /** Page size for navigation */
  pageSize?: number;

  /** Enable sorting */
  sortable?: boolean;

  /** Initial sort */
  initialSort?: SortColumn;

  /** Enable filtering */
  filterable?: boolean;

  /** Filter placeholder */
  filterPlaceholder?: string;

  /** Columns to filter on */
  filterColumns?: string[];

  /** Custom filter function */
  customFilter?: (row: T, query: string) => boolean;

  /** Selection changed callback */
  onSelect?: (rows: T[]) => void;

  /** Navigation callback */
  onNavigate?: (row: T, index: number) => void;

  /** Sort callback */
  onSort?: (column: string, direction: SortDirection) => void;

  /** Filter callback */
  onFilter?: (query: string) => void;

  /** Validation function */
  validate?: (rows: T[]) => string | undefined;

  /**
   * Enable inline cell editing: `e` opens the focused cell, typed input
   * replaces its value, `Enter` commits, `Esc` cancels. `←`/`→` move the
   * focused column. Edits infer the type from the old value (number and
   * boolean cells stay numbers and booleans). (Declared but never wired
   * before v0.10 — the key did nothing.)
   */
  editable?: boolean;

  /**
   * Validate a pending edit before it is committed. Return an error message
   * to reject — it is rendered like the prompt's own validation errors and
   * the cell stays in edit mode; return `undefined` to accept.
   */
  validateEdit?: (row: T, column: string, newValue: any) => string | undefined;

  /** Called after an edit is committed, with the updated row. */
  onEdit?: (row: T, column: string, oldValue: any, newValue: any) => void;

  /** Editable columns (if undefined, all columns are editable) */
  editableColumns?: string[];
}

/**
 * Interactive table options with incremental data loading.
 *
 * A terminal table is inherently virtualized: the interactive renderer only
 * ever draws the `pageSize`-row scroll window, whatever the dataset size, and
 * the scroll position stays stable as data grows. What this type adds is the
 * incremental half: `loadMore`/`hasMore` fetch further batches as navigation
 * approaches the end of the loaded rows.
 *
 * The pre-v0.10 surface also declared browser virtual-scrolling knobs —
 * `virtual`, `itemHeight`, `bufferSize`, `debounceScroll`, `renderBatchSize`,
 * `cache` — none of which was implemented, and none of which has a terminal
 * meaning (a row is one line; there are no pixel heights, scroll events or
 * paint batches). They were removed rather than implemented.
 */
export interface VirtualTableOptions<T = any> extends InteractiveTableOptions<T> {
  /**
   * Fetch the next batch of rows. Invoked when navigation moves within one
   * page of the end of the loaded data while `hasMore` is true; resolved
   * rows are appended (filter and sort are re-applied). Resolving to an
   * empty batch marks the dataset complete. A rejection is shown as a table
   * error and loading is retried on the next navigation.
   */
  loadMore?: () => Promise<T[]>;

  /**
   * Whether more data is available beyond the initial `data`. While true,
   * the row counter shows `N+` and `loadMore` fires near the end.
   */
  hasMore?: boolean;

  /** Loading indicator text or function (default: `Loading…`). */
  loadingIndicator?: string | (() => string);
}

/**
 * Interactive table state
 */
export interface TableState<T = any> {
  /** Current data (filtered & sorted) */
  data: T[];

  /** Original unfiltered data */
  originalData: T[];

  /** Selected rows */
  selected: Set<T>;

  /** Focused row index */
  focusedRow: number;

  /** Focused column index */
  focusedColumn: number;

  /** Current sort */
  sort: SortColumn | null;

  /** Filter query */
  filterQuery: string;

  /** Whether in filter mode */
  isFiltering: boolean;

  /** Visible range [start, end] */
  visibleRange: [number, number];

  /** Page size */
  pageSize: number;

  /** Error message */
  error?: string;

  /** Whether the focused cell is being edited */
  isEditing: boolean;

  /** Edit buffer for the cell being edited */
  editValue: string;

  /** Whether a `loadMore` batch is in flight */
  isLoading: boolean;

  /** Whether more rows can be fetched via `loadMore` */
  hasMore: boolean;
}
