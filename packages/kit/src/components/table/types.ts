/**
 * Table component types and interfaces
 */

import type { CommonOptions } from '../../utilities/common.js';
import type { CacheConfig, CacheStrategy } from './cache.js';

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
 * Word wrap strategy
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

  /** Compact mode (less vertical spacing) */
  compact?: boolean;

  /** Header style function */
  headerStyle?: (text: string) => string;

  /** Cell style function */
  cellStyle?: (text: string, row: T, column: TableColumn<T>) => string;

  /** Table width ('auto' fits content, 'full' uses terminal width, number is percentage) */
  width?: number | 'auto' | 'full';

  /** Maximum table height in rows */
  maxHeight?: number;

  /** Word wrap strategy */
  wordWrap?: WordWrap;

  /** Default text alignment */
  alignment?: Alignment;

  /** Show row numbers */
  showRowNumbers?: boolean;

  /** Show table header */
  showHeader?: boolean;

  /** Alternate row colors */
  alternateRows?: boolean;

  /** Table footer */
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

  /** Enable inline cell editing (Phase 3) */
  editable?: boolean;

  /** Edit validation function (Phase 3) */
  validateEdit?: (row: T, column: string, newValue: any) => string | undefined;

  /** Edit callback (Phase 3) */
  onEdit?: (row: T, column: string, oldValue: any, newValue: any) => void;

  /** Editable columns (if undefined, all columns are editable) (Phase 3) */
  editableColumns?: string[];
}

/**
 * Virtual scrolling configuration
 */
export interface VirtualConfig {
  /** Whether virtualization is enabled */
  enabled: boolean;

  /** Threshold (minimum rows) before enabling virtualization */
  threshold: number;

  /** Virtualization mode */
  mode: 'vertical' | 'horizontal' | 'both';
}

// Re-export cache types from cache.js
export type { CacheConfig, CacheStrategy };

/**
 * Virtual table options (Phase 3)
 * Extends InteractiveTableOptions with virtualization and lazy loading
 */
export interface VirtualTableOptions<T = any> extends InteractiveTableOptions<T> {
  /** Virtualization configuration */
  virtual?: boolean | VirtualConfig;

  /** Height of each row item (for virtual scrolling) */
  itemHeight?: number;

  /** Buffer size for virtual scrolling (rows to render outside visible area) */
  bufferSize?: number;

  /** Load more data callback */
  loadMore?: () => Promise<T[]>;

  /** Whether more data is available */
  hasMore?: boolean;

  /** Loading indicator text or function */
  loadingIndicator?: string | (() => string);

  /** Caching configuration */
  cache?: boolean | CacheConfig;

  /** Debounce scroll events (milliseconds) */
  debounceScroll?: number;

  /** Number of rows to render in a batch */
  renderBatchSize?: number;
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

  /** Is editing (Phase 3) */
  isEditing: boolean;

  /** Edit value (Phase 3) */
  editValue: string;
}
