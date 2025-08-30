
import { stringWidth, createTextAttributes } from "../utils.js"
import { useTheme } from "../theme/context.js"
import { OptimizedBuffer } from "../renderer/buffer.js"
import { RGBA, parseColor, type Color } from "../lib/colors.js"
import { Component, type ComponentProps } from "../component.js"
import {
  BorderChars,
  type BorderStyle,
  type BorderCharacters
} from "../lib/border.js"

import type { ParsedKey, RenderContext } from "../types.js"

// Cell content type
export type CellContent = string | null | undefined;

// Cell renderer function type
export type CellRenderer = (
  value: any,
  row: TableRow,
  column: TableColumn,
  rowIndex: number,
  columnIndex: number
) => string | null | undefined;

// Table column configuration
export interface TableColumn {
  key: string;              // Unique column identifier
  title: string;            // Display title
  width?: number | 'auto';  // Fixed width or auto-calculate
  align?: 'left' | 'center' | 'right';  // Text alignment
  truncate?: TruncateMode;  // How to handle overflow
  formatter?: (value: any) => string;  // Custom cell formatter
  sortable?: boolean;       // Can this column be sorted
  cellRenderer?: CellRenderer;  // Custom cell renderer
}

// Table row data
export interface TableRow {
  [key: string]: any;       // Row data indexed by column key
  _id?: string;            // Optional unique row identifier
  _selected?: boolean;     // Optional selection state
  _disabled?: boolean;     // Optional disabled state
}

// Text truncation modes
export enum TruncateMode {
  END = 'end',       // "Long text..."
  START = 'start',   // "...ong text"
  MIDDLE = 'middle', // "Long...text"
  NONE = 'none'      // No truncation
}

// Text style for headers and cells
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

// Table theme structure (as specified in spec)
export interface TableTheme {
  // Base colors
  background?: Color;
  border?: Color;
  text?: Color;

  // Header
  header?: {
    background?: Color;
    text?: Color;
    border?: Color;
  };

  // States
  states?: {
    selected?: {
      background?: Color;
      text?: Color;
    };
    hover?: {
      background?: Color;
      text?: Color;
    };
    disabled?: {
      background?: Color;
      text?: Color;
    };
  };

  // Alternating rows
  alternateRow?: {
    background?: Color;
  };

  // Borders
  borders?: {
    style?: BorderStyle;
    dividers?: boolean;
  };
}


// Table component props
export interface TableProps extends ComponentProps {
  // Data
  columns: TableColumn[];
  rows: TableRow[];

  // Layout
  showHeader?: boolean;           // Show column headers (default: true)
  showBorder?: boolean;           // Show table borders (default: true)
  borderStyle?: BorderStyle;      // Border style (single, double, rounded, etc.)
  customBorderChars?: BorderCharacters;  // Custom border characters
  columnDivider?: boolean;        // Show vertical dividers between columns
  rowDivider?: boolean;          // Show horizontal dividers between rows
  compactMode?: boolean;         // Reduce padding for compact display

  // Behavior
  selectable?: boolean;          // Enable row selection (default: false)
  multiSelect?: boolean;         // Allow multiple selection (default: false)
  sortable?: boolean;           // Enable column sorting (default: false)
  scrollable?: boolean;         // Enable vertical scrolling (default: true)
  wrapText?: boolean;          // Wrap long text to multiple lines (default: false)

  // Appearance
  headerStyle?: TextStyle;      // Style for header row
  alternateRowColors?: boolean; // Alternate row background colors
  highlightOnHover?: boolean;   // Highlight row on hover/focus

  // Colors (theme tokens or direct colors)
  backgroundColor?: Color;
  borderColor?: Color;
  headerBackgroundColor?: Color;
  headerTextColor?: Color;
  selectedBackgroundColor?: Color;
  selectedTextColor?: Color;
  alternateRowColor?: Color;
  textColor?: Color;
  focusedBackgroundColor?: Color;
  focusedTextColor?: Color;
  disabledTextColor?: Color;
  disabledBackgroundColor?: Color;

  // Events
  onRowSelect?: (row: TableRow, index: number) => void;
  onSort?: (column: TableColumn, direction: 'asc' | 'desc') => void;
  onCellEdit?: (row: TableRow, column: TableColumn, value: any) => void;

  // Additional options
  scrollOffset?: number;
  selectedIndex?: number;
  fastScrollStep?: number;
}

// Reactive table props interface (as specified in spec)
// Note: This is for documentation/future reactive bridge implementation
// The actual implementation would handle signal unwrapping separately
export interface ReactiveTableProps {
  columns: TableColumn[] | (() => TableColumn[]);
  rows: TableRow[] | (() => TableRow[]);
  selectedRows?: () => TableRow[];
  sortConfig?: () => { column: string; direction: 'asc' | 'desc' };
  // Include other TableProps as needed
  showHeader?: boolean;
  showBorder?: boolean;
  selectable?: boolean;
  multiSelect?: boolean;
  sortable?: boolean;
  onRowSelect?: (row: TableRow, index: number) => void;
  onSort?: (column: TableColumn, direction: 'asc' | 'desc') => void;
}

// Sort configuration type
export interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
}

// Table component events
export enum TableComponentEvents {
  ROW_SELECTED = "rowSelected",
  SORT_CHANGED = "sortChanged",
  CELL_EDITED = "cellEdited",
  SCROLL_CHANGED = "scrollChanged",
  COLUMN_FOCUS_CHANGED = "columnFocusChanged",
}

// Internal component for dividers - removed as we'll handle borders differently

// Internal component for table cells
class TableCellComponent extends Component {
  private _content: CellContent;
  private _textColor: RGBA;
  private _backgroundColor: RGBA;
  private _align: 'left' | 'center' | 'right';
  private _truncate: TruncateMode;

  constructor(
    ctx: RenderContext,
    options: {
      content: CellContent;
      width: number;
      height?: number;
      textColor?: RGBA;
      backgroundColor?: RGBA;
      align?: 'left' | 'center' | 'right';
      truncate?: TruncateMode;
      padding?: number;
    }
  ) {
    super(ctx, {
      width: options.width,
      height: options.height ?? 1,
    });

    this._content = options.content;
    this._textColor = options.textColor ?? RGBA.fromHex('#FFFFFF');
    this._backgroundColor = options.backgroundColor ?? RGBA.fromValues(0, 0, 0, 0);
    this._align = options.align ?? 'left';
    this._truncate = options.truncate ?? TruncateMode.END;
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    // Fill background if needed
    if (this._backgroundColor.a > 0) {
      buffer.fillRect(this.x, this.y, this.width, this.height, this._backgroundColor);
    }

    // Render text content
    if (typeof this._content === 'string') {
      const text = this.truncateText(this._content, this.width, this._truncate);
      const aligned = this.alignText(text, this.width, this._align);
      buffer.drawText(aligned, this.x, this.y, this._textColor);
    }
  }

  private truncateText(text: string, width: number, mode: TruncateMode): string {
    const textWidth = stringWidth(text);

    if (textWidth <= width || mode === TruncateMode.NONE) {
      return text;
    }

    const ellipsis = '...';
    const ellipsisWidth = 3;

    if (width <= ellipsisWidth) {
      return ellipsis.substring(0, width);
    }

    const availableWidth = width - ellipsisWidth;

    switch (mode) {
      case TruncateMode.START:
        return ellipsis + text.substring(text.length - availableWidth);
      case TruncateMode.MIDDLE: {
        const halfWidth = Math.floor(availableWidth / 2);
        return text.substring(0, halfWidth) + ellipsis +
          text.substring(text.length - (availableWidth - halfWidth));
      }
      case TruncateMode.END:
      default:
        return text.substring(0, availableWidth) + ellipsis;
    }
  }

  private alignText(text: string, width: number, align: 'left' | 'center' | 'right'): string {
    const textWidth = stringWidth(text);

    if (textWidth >= width) {
      return text.substring(0, width);
    }

    const padding = width - textWidth;

    switch (align) {
      case 'center': {
        const leftPadding = Math.floor(padding / 2);
        const rightPadding = padding - leftPadding;
        return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
      }
      case 'right':
        return ' '.repeat(padding) + text;
      case 'left':
      default:
        return text + ' '.repeat(padding);
    }
  }
}

// Internal component for table rows
class TableRowComponent extends Component {
  private _cells: TableCellComponent[] = [];
  private _backgroundColor: RGBA;
  private _isHeader: boolean;
  private _dividerColor?: RGBA;
  private _dividerChar?: string;
  private _columnWidths: number[];
  private _showDividers: boolean;

  constructor(
    ctx: RenderContext,
    options: {
      height?: number;
      backgroundColor?: RGBA;
      isHeader?: boolean;
      dividerColor?: RGBA;
      dividerChar?: string;
      columnWidths: number[];
      showDividers?: boolean;
    }
  ) {
    super(ctx, {
      width: 'auto',
      height: options.height ?? 1,
      flexDirection: 'row',
    });

    this._backgroundColor = options.backgroundColor ?? RGBA.fromValues(0, 0, 0, 0);
    this._isHeader = options.isHeader ?? false;
    this._dividerColor = options.dividerColor;
    this._dividerChar = options.dividerChar;
    this._columnWidths = options.columnWidths;
    this._showDividers = options.showDividers ?? false;
  }

  public addCell(cell: TableCellComponent): void {
    this._cells.push(cell);
    this.add(cell);
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    // Fill background if needed
    if (this._backgroundColor.a > 0) {
      buffer.fillRect(this.x, this.y, this.width, this.height, this._backgroundColor);
    }

    // Draw column dividers manually after cells are positioned
    if (this._showDividers && this._dividerChar && this._dividerColor) {
      let currentX = this.x;
      for (let i = 0; i < this._cells.length - 1; i++) {
        currentX += this._columnWidths[i];
        buffer.drawText(this._dividerChar, currentX, this.y, this._dividerColor);
        currentX += 1; // Space for divider
      }
    }
  }
}

// Main table component refactored to use composition
export class TableComponent extends Component {
  protected focusable: boolean = true;

  // Data
  private _columns: TableColumn[] = [];
  private _rows: TableRow[] = [];
  private _rowComponents: Component[] = [];
  private _headerRow?: Component;

  // Selection state
  private _selectedIndices: Set<number> = new Set();
  private _focusedIndex: number = 0;

  // Sorting state
  private _sortColumn?: string;
  private _sortDirection: 'asc' | 'desc' = 'asc';

  // Scrolling state
  private _scrollOffset: number = 0;
  private _horizontalScrollOffset: number = 0;
  private _maxVisibleRows: number = 0;
  private _maxVisibleColumns: number = 0;

  // Column width management
  private _columnWidths: Map<string, number> = new Map();
  private _totalWidth: number = 0;

  // Layout options
  private _showHeader: boolean;
  private _showBorder: boolean;
  private _borderStyle: BorderStyle;
  private _customBorderChars?: BorderCharacters;
  private _columnDivider: boolean;
  private _rowDivider: boolean;
  private _compactMode: boolean;

  // Behavior options
  private _selectable: boolean;
  private _multiSelect: boolean;
  private _sortable: boolean;
  private _scrollable: boolean;
  private _wrapText: boolean;

  // Appearance options
  private _headerStyle?: TextStyle;
  private _alternateRowColors: boolean;
  private _highlightOnHover: boolean;

  // Colors (resolved to RGBA)
  private _backgroundColor: RGBA;
  private _borderColor: RGBA;
  private _headerBackgroundColor: RGBA;
  private _headerTextColor: RGBA;
  private _selectedBackgroundColor: RGBA;
  private _selectedTextColor: RGBA;
  private _alternateRowColor: RGBA;
  private _textColor: RGBA;
  private _focusedBackgroundColor: RGBA;
  private _focusedTextColor: RGBA;
  private _disabledTextColor: RGBA;
  private _disabledBackgroundColor: RGBA;

  // Event handlers
  private _onRowSelect?: (row: TableRow, index: number) => void;
  private _onSort?: (column: TableColumn, direction: 'asc' | 'desc') => void;
  private _onCellEdit?: (row: TableRow, column: TableColumn, value: any) => void;

  // Other options
  private _fastScrollStep: number;


  // Performance optimization: column width cache
  private _lastColumnCacheKey?: string;

  // Batch update support (as mentioned in spec)
  private _batchUpdateTimeout?: NodeJS.Timeout;
  private _pendingUpdates: Map<string, any> = new Map();

  // Default options
  protected _defaultOptions = {
    showHeader: true,
    showBorder: true,
    borderStyle: 'single' as BorderStyle,
    columnDivider: true,
    rowDivider: false,
    compactMode: false,
    selectable: false,
    multiSelect: false,
    sortable: false,
    scrollable: true,
    wrapText: false,
    alternateRowColors: false,
    highlightOnHover: false,
    backgroundColor: 'transparent',
    borderColor: '#CCCCCC',
    headerBackgroundColor: '#333333',
    headerTextColor: '#FFFFFF',
    selectedBackgroundColor: '#0066CC',
    selectedTextColor: '#FFFFFF',
    alternateRowColor: '#1A1A1A',
    textColor: '#E0E0E0',
    focusedBackgroundColor: '#334455',
    focusedTextColor: '#FFFFFF',
    disabledTextColor: '#666666',
    disabledBackgroundColor: '#2A2A2A',
    fastScrollStep: 5,
  }

  constructor(ctx: RenderContext, options: TableProps) {
    super(ctx, options);

    // Get theme and resolver
    const theme = useTheme();
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token);
      } catch {
        return null;
      }
    };

    // Get component theme from global theme
    const componentTheme = theme.components?.table;

    // Helper to resolve colors
    const resolveColorValue = (value: Color | string | undefined, defaultValue: string): RGBA => {
      if (!value) value = defaultValue;
      try {
        return theme.resolveColor(value);
      } catch {
        return parseColor(value, themeResolver);
      }
    };

    // Set up layout for table - always use flexbox column layout
    this.flexDirection = 'column';
    this.alignItems = 'stretch';

    // Initialize data
    this._columns = options.columns || [];
    this._rows = options.rows || [];

    // Initialize layout options BEFORE component mode
    this._showHeader = options.showHeader ?? this._defaultOptions.showHeader;
    this._showBorder = options.showBorder ?? this._defaultOptions.showBorder;
    this._borderStyle = options.borderStyle ?? this._defaultOptions.borderStyle;
    this._customBorderChars = options.customBorderChars;
    this._columnDivider = options.columnDivider ?? this._defaultOptions.columnDivider;
    this._rowDivider = options.rowDivider ?? this._defaultOptions.rowDivider;
    this._compactMode = options.compactMode ?? this._defaultOptions.compactMode;

    // Initialize behavior options
    this._selectable = options.selectable ?? this._defaultOptions.selectable;
    this._multiSelect = options.multiSelect ?? this._defaultOptions.multiSelect;
    this._sortable = options.sortable ?? this._defaultOptions.sortable;
    this._scrollable = options.scrollable ?? this._defaultOptions.scrollable;
    this._wrapText = options.wrapText ?? this._defaultOptions.wrapText;

    // Initialize appearance options
    this._headerStyle = options.headerStyle;
    this._alternateRowColors = options.alternateRowColors ?? this._defaultOptions.alternateRowColors;
    // TODO: Implement mouse hover tracking for highlightOnHover
    // This requires:
    // 1. Mouse event handling infrastructure
    // 2. Tracking mouse position relative to table rows
    // 3. Updating hover state and re-rendering affected rows
    this._highlightOnHover = options.highlightOnHover ?? this._defaultOptions.highlightOnHover;

    // Resolve colors with theme support
    this._backgroundColor = resolveColorValue(
      options.backgroundColor ?? componentTheme?.background,
      this._defaultOptions.backgroundColor
    );

    this._borderColor = resolveColorValue(
      options.borderColor ?? componentTheme?.border,
      this._defaultOptions.borderColor
    );

    this._headerBackgroundColor = resolveColorValue(
      options.headerBackgroundColor ?? componentTheme?.header?.background,
      this._defaultOptions.headerBackgroundColor
    );

    this._headerTextColor = resolveColorValue(
      options.headerTextColor ?? componentTheme?.header?.text,
      this._defaultOptions.headerTextColor
    );

    this._selectedBackgroundColor = resolveColorValue(
      options.selectedBackgroundColor ?? componentTheme?.states?.selected?.background,
      this._defaultOptions.selectedBackgroundColor
    );

    this._selectedTextColor = resolveColorValue(
      options.selectedTextColor ?? componentTheme?.states?.selected?.text,
      this._defaultOptions.selectedTextColor
    );

    this._alternateRowColor = resolveColorValue(
      options.alternateRowColor ?? componentTheme?.alternateRow?.background,
      this._defaultOptions.alternateRowColor
    );

    this._textColor = resolveColorValue(
      options.textColor ?? componentTheme?.text,
      this._defaultOptions.textColor
    );

    this._focusedBackgroundColor = resolveColorValue(
      options.focusedBackgroundColor ?? componentTheme?.states?.hover?.background,
      this._defaultOptions.focusedBackgroundColor
    );

    this._focusedTextColor = resolveColorValue(
      options.focusedTextColor ?? componentTheme?.states?.hover?.text,
      this._defaultOptions.focusedTextColor
    );

    this._disabledTextColor = resolveColorValue(
      options.disabledTextColor ?? componentTheme?.states?.disabled?.text,
      this._defaultOptions.disabledTextColor
    );

    this._disabledBackgroundColor = resolveColorValue(
      options.disabledBackgroundColor ?? componentTheme?.states?.disabled?.background,
      this._defaultOptions.disabledBackgroundColor
    );

    // Initialize event handlers
    this._onRowSelect = options.onRowSelect;
    this._onSort = options.onSort;
    // TODO: Implement cell editing functionality
    // This requires:
    // 1. Cell edit mode with visual indication
    // 2. Input handling for editing cell content
    // 3. Validation and error handling
    // 4. Commit/cancel mechanisms
    this._onCellEdit = options.onCellEdit;

    // Initialize other options
    this._fastScrollStep = options.fastScrollStep ?? this._defaultOptions.fastScrollStep;
    this._scrollOffset = options.scrollOffset ?? 0;

    // Initialize selection
    if (options.selectedIndex !== undefined) {
      this._focusedIndex = options.selectedIndex;
      if (this._selectable) {
        this._selectedIndices.add(options.selectedIndex);
      }
    }

    // Set up keyboard handler
    this.onKeyDown = (key: ParsedKey) => this.handleKeyInput(key);

    // Calculate initial layout
    this.calculateColumnWidths();
    this.calculateMaxVisibleRows();

    // Initialize components
    this.initializeDataMode();
  }


  // Initialize data mode - we'll render content directly in renderSelf
  private initializeDataMode(): void {
    // Clear existing rows
    this.clearRows();
    // We'll render everything in renderSelf to have full control
  }


  // Clear all row components
  private clearRows(): void {
    // Remove all children
    const children = this.getChildren();
    for (const child of children) {
      this.remove(child.id);
    }
    this._rowComponents = [];
    this._headerRow = undefined;
  }


  // Calculate column widths with caching
  private calculateColumnWidths(): void {
    // Cache optimization: only recalculate if columns or data changed
    const cacheKey = `${this._columns.length}_${this._rows.length}_${this.width}`;
    if (this._lastColumnCacheKey === cacheKey) {
      return; // Use cached widths
    }
    this._lastColumnCacheKey = cacheKey;

    this._columnWidths.clear();
    this._totalWidth = 0;

    // Reserve space for scroll indicators when needed
    const needsScrollSpace = this._scrollable && this._rows.length > this._maxVisibleRows && !this._showBorder;
    const scrollIndicatorWidth = needsScrollSpace ? 1 : 0;

    const availableWidth = this.width - (this._showBorder ? 2 : 0) - scrollIndicatorWidth;
    const padding = this._compactMode ? 0 : 1;

    // First pass: fixed widths and calculate auto widths
    const autoColumns: TableColumn[] = [];
    let usedWidth = 0;

    for (const column of this._columns) {
      if (typeof column.width === 'number') {
        this._columnWidths.set(column.key, column.width);
        usedWidth += column.width;
      } else {
        autoColumns.push(column);
      }
    }

    // Add space for column dividers
    if (this._columnDivider && this._columns.length > 1) {
      usedWidth += this._columns.length - 1;
    }

    // Second pass: distribute remaining width to auto columns
    if (autoColumns.length > 0) {
      const remainingWidth = Math.max(0, availableWidth - usedWidth);
      const widthPerColumn = Math.floor(remainingWidth / autoColumns.length);

      for (const column of autoColumns) {
        // Calculate based on content width
        let maxWidth = stringWidth(column.title) + padding * 2;

        for (const row of this._rows) {
          const value = row[column.key];
          const text = column.formatter ? column.formatter(value) : String(value ?? '');
          const width = stringWidth(text) + padding * 2;
          maxWidth = Math.max(maxWidth, width);
        }

        // Use calculated width or distributed width, whichever is smaller
        const finalWidth = Math.min(maxWidth, widthPerColumn);
        this._columnWidths.set(column.key, finalWidth);
      }
    }

    // Calculate total width
    for (const width of Array.from(this._columnWidths.values())) {
      this._totalWidth += width;
    }

    if (this._columnDivider && this._columns.length > 1) {
      this._totalWidth += this._columns.length - 1;
    }

    if (this._showBorder) {
      this._totalWidth += 2;
    }
  }

  // Calculate maximum visible rows
  private calculateMaxVisibleRows(): void {
    let availableHeight = this.height;

    if (this._showBorder) {
      availableHeight -= 2; // Top and bottom borders
    }

    if (this._showHeader) {
      availableHeight -= 1; // Header row
      if (this._showBorder || this._rowDivider) {
        availableHeight -= 1; // Header separator
      }
    }

    if (this._rowDivider && this._rows.length > 1) {
      availableHeight -= this._rows.length - 1; // Row dividers
    }

    this._maxVisibleRows = Math.max(1, availableHeight);
  }

  // Get visible rows based on scroll offset
  private getVisibleRows(): TableRow[] {
    if (!this._scrollable) {
      return this._rows;
    }

    const start = this._scrollOffset;
    const end = Math.min(this._rows.length, start + this._maxVisibleRows);
    return this._rows.slice(start, end);
  }

  // Truncate text based on mode
  private truncateText(text: string, width: number, mode: TruncateMode = TruncateMode.END): string {
    const textWidth = stringWidth(text);

    // TODO: Implement proper text wrapping with multi-line support
    // Currently wrapText only prevents truncation but doesn't actually wrap to multiple lines
    // This would require:
    // 1. Calculating wrapped lines for each cell
    // 2. Dynamic row height adjustment
    // 3. Rendering text across multiple lines within a cell
    if (this._wrapText || textWidth <= width || mode === TruncateMode.NONE) {
      return text;
    }

    const ellipsis = '...';
    const ellipsisWidth = 3;

    if (width <= ellipsisWidth) {
      return ellipsis.substring(0, width);
    }

    const availableWidth = width - ellipsisWidth;

    switch (mode) {
      case TruncateMode.START:
        return ellipsis + text.substring(text.length - availableWidth);

      case TruncateMode.MIDDLE: {
        const halfWidth = Math.floor(availableWidth / 2);
        return text.substring(0, halfWidth) + ellipsis + text.substring(text.length - (availableWidth - halfWidth));
      }
      case TruncateMode.END:
      default:
        return text.substring(0, availableWidth) + ellipsis;
    }
  }

  // Align text within column width
  private alignText(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
    const textWidth = stringWidth(text);

    if (textWidth >= width) {
      return text.substring(0, width);
    }

    const padding = width - textWidth;

    switch (align) {
      case 'center': {
        const leftPadding = Math.floor(padding / 2);
        const rightPadding = padding - leftPadding;
        return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
      }
      case 'right':
        return ' '.repeat(padding) + text;

      case 'left':
      default:
        return text + ' '.repeat(padding);
    }
  }

  // Render the table borders and structure
  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // Use the old rendering approach which works properly
    this.renderDataModeOld(buffer);

    // Note: Scroll indicators are now integrated directly into border rendering
    // to avoid overlapping issues
  }

  // Render table borders
  private renderBorders(buffer: OptimizedBuffer): void {
    const borderChars = this._customBorderChars || BorderChars[this._borderStyle];
    const x = this.x;
    const y = this.y;

    // Draw top border
    this.drawHorizontalBorder(
      buffer, x, y,
      borderChars.topLeft, borderChars.topRight,
      borderChars.horizontal, borderChars.topT
    );

    // Draw vertical borders
    for (let i = 1; i < this.height - 1; i++) {
      buffer.drawText(borderChars.vertical, x, y + i, this._borderColor);
      buffer.drawText(borderChars.vertical, x + this.width - 1, y + i, this._borderColor);
    }

    // Draw bottom border
    this.drawHorizontalBorder(
      buffer, x, y + this.height - 1,
      borderChars.bottomLeft, borderChars.bottomRight,
      borderChars.horizontal, borderChars.bottomT
    );
  }

  // Scroll indicators are now integrated into drawDataRow and drawHeaderRow methods

  // DEPRECATED: Old rendering methods kept for reference
  private renderDataModeOld(buffer: OptimizedBuffer): void {
    const x = this.x;
    let y = this.y;

    const borderChars = this._customBorderChars || BorderChars[this._borderStyle];

    // Draw top border
    if (this._showBorder) {
      this.drawHorizontalBorder(buffer, x, y, borderChars.topLeft, borderChars.topRight, borderChars.horizontal, borderChars.topT);
      y++;
    }

    // Draw header
    if (this._showHeader) {
      this.drawHeaderRow(buffer, x, y, borderChars);
      y++;

      // Draw header separator
      if (this._showBorder || this._rowDivider) {
        this.drawHorizontalBorder(buffer, x, y, borderChars.leftT, borderChars.rightT, borderChars.horizontal, borderChars.cross);
        y++;
      }
    }

    // Draw rows
    const visibleRows = this.getVisibleRows();
    const startIndex = this._scrollOffset;

    for (let i = 0; i < visibleRows.length; i++) {
      const row = visibleRows[i];
      const rowIndex = startIndex + i;
      const isSelected = this._selectedIndices.has(rowIndex);
      const isFocused = rowIndex === this._focusedIndex && this.focused;

      this.drawDataRow(buffer, x, y, row, rowIndex, isSelected, isFocused, borderChars);
      y++;

      // Draw row divider
      if (this._rowDivider && i < visibleRows.length - 1) {
        this.drawHorizontalBorder(buffer, x, y, borderChars.leftT, borderChars.rightT, borderChars.horizontal, borderChars.cross);
        y++;
      }
    }

    // Draw bottom border
    if (this._showBorder) {
      this.drawHorizontalBorder(buffer, x, y, borderChars.bottomLeft, borderChars.bottomRight, borderChars.horizontal, borderChars.bottomT);
    }
  }


  // Draw horizontal border
  private drawHorizontalBorder(buffer: OptimizedBuffer, x: number, y: number, left: string, right: string, horizontal: string, junction: string): void {
    let currentX = x;

    // Left corner
    if (this._showBorder && left) {
      buffer.drawText(left, currentX, y, this._borderColor);
      currentX++;
    }

    // Column sections
    for (let i = 0; i < this._columns.length; i++) {
      const column = this._columns[i];
      const width = this._columnWidths.get(column.key) || 0;

      // Horizontal line
      for (let j = 0; j < width; j++) {
        buffer.drawText(horizontal, currentX, y, this._borderColor);
        currentX++;
      }

      // Column junction
      if (this._columnDivider && i < this._columns.length - 1) {
        buffer.drawText(junction, currentX, y, this._borderColor);
        currentX++;
      }
    }

    // Right corner
    if (this._showBorder && right) {
      buffer.drawText(right, currentX, y, this._borderColor);
    }
  }

  // Draw header row
  private drawHeaderRow(buffer: OptimizedBuffer, x: number, y: number, borderChars: BorderCharacters): void {
    let currentX = x;

    // Fill background
    if (this._headerBackgroundColor.a > 0) {
      // Adjust fillRect to exclude border areas
      const fillX = this._showBorder ? x + 1 : x;
      const fillWidth = this._showBorder ? this.width - 1 : this.width;
      buffer.fillRect(fillX, y, fillWidth, 1, this._headerBackgroundColor);
    }

    // Left border
    if (this._showBorder) {
      buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
      currentX++;
    }

    // Column headers
    for (let i = 0; i < this._columns.length; i++) {
      const column = this._columns[i];
      const width = this._columnWidths.get(column.key) || 0;

      // Header text with sorting indicators
      let headerText = column.title;
      if (this._sortColumn === column.key) {
        headerText += this._sortDirection === 'asc' ? ' ↑' : ' ↓';
      } else if (this._sortable && (column.sortable !== false)) {
        // Only show sort indicator if global sorting is enabled
        // and column is not explicitly marked as non-sortable
        headerText += ' ⇅';
      }

      const truncated = this.truncateText(headerText, width);
      const aligned = this.alignText(truncated, width, column.align || 'left');

      // Apply header style attributes if specified
      const attributes = this._headerStyle ? createTextAttributes(this._headerStyle) : 0;
      buffer.drawText(aligned, currentX, y, this._headerTextColor, undefined, attributes);
      currentX += width;

      // Column divider
      if (this._columnDivider && i < this._columns.length - 1) {
        buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
        currentX++;
      }
    }

    // Right border with scroll indicators
    if (this._showBorder) {
      // Check if we should show a scroll indicator instead of border
      const needsScrollIndicators = this._scrollable && this._rows.length > this._maxVisibleRows;

      if (needsScrollIndicators) {
        // Calculate data area bounds for scroll indicators
        let dataStartY = this.y;
        let dataEndY = this.y;

        if (this._showBorder) {
          dataStartY++; // Skip top border
        }
        if (this._showHeader) {
          dataStartY++; // Skip header row
          if (this._showBorder || this._rowDivider) {
            dataStartY++; // Skip header separator
          }
        }

        // Calculate the actual end position based on visible rows and layout
        if (this._showBorder) {
          dataEndY++; // Account for top border
        }
        if (this._showHeader) {
          dataEndY++; // Account for header row
          if (this._showBorder || this._rowDivider) {
            dataEndY++; // Account for header separator
          }
        }
        
        // Add visible rows
        const visibleRows = this.getVisibleRows();
        dataEndY += visibleRows.length - 1;
        
        // Account for row dividers between data rows
        if (this._rowDivider && visibleRows.length > 1) {
          dataEndY += visibleRows.length - 1;
        }

        // Check if current position should show scroll indicator
        const showTopIndicator = this._scrollOffset > 0 && y === dataStartY;
        const showBottomIndicator = this._scrollOffset + this._maxVisibleRows < this._rows.length && y === dataEndY;

        if (showTopIndicator) {
          buffer.drawText('▲', currentX, y, this._borderColor);
        } else if (showBottomIndicator) {
          buffer.drawText('▼', currentX, y, this._borderColor);
        } else {
          buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
        }
      } else {
        buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
      }
    } else if (this._scrollable && this._rows.length > this._maxVisibleRows) {
      // When borders are off, still show scroll indicators in reserved space
      let dataStartY = this.y;
      let dataEndY = this.y;

      if (this._showHeader) {
        dataStartY++; // Skip header row
        dataEndY++; // Account for header row
        if (this._rowDivider) {
          dataStartY++; // Skip header separator
          dataEndY++; // Account for header separator
        }
      }

      // Calculate the actual end position based on visible rows
      const visibleRows = this.getVisibleRows();
      dataEndY += visibleRows.length - 1;

      // Account for row dividers between data rows
      if (this._rowDivider && visibleRows.length > 1) {
        dataEndY += visibleRows.length - 1;
      }

      const showTopIndicator = this._scrollOffset > 0 && y === dataStartY;
      const showBottomIndicator = this._scrollOffset + this._maxVisibleRows < this._rows.length && y === dataEndY;

      if (showTopIndicator) {
        buffer.drawText('▲', this.x + this.width - 1, y, this._borderColor);
      } else if (showBottomIndicator) {
        buffer.drawText('▼', this.x + this.width - 1, y, this._borderColor);
      }
    }
  }

  // Draw data row
  private drawDataRow(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    row: TableRow,
    rowIndex: number,
    isSelected: boolean,
    isFocused: boolean,
    borderChars: BorderCharacters
  ): void {
    let currentX = x;

    // Determine colors
    let bgColor = this._backgroundColor;
    let textColor = this._textColor;

    if (row._disabled) {
      bgColor = this._disabledBackgroundColor;
      textColor = this._disabledTextColor;
    } else if (isSelected) {
      bgColor = this._selectedBackgroundColor;
      textColor = this._selectedTextColor;
    } else if (isFocused) {
      bgColor = this._focusedBackgroundColor;
      textColor = this._focusedTextColor;
    } else if (this._alternateRowColors && rowIndex % 2 === 1) {
      bgColor = this._alternateRowColor;
    }

    // Fill background
    if (bgColor.a > 0) {
      // Adjust fillRect to exclude border areas
      const fillX = this._showBorder ? x + 1 : x;
      const fillWidth = this._showBorder ? this.width - 1 : this.width;
      buffer.fillRect(fillX, y, fillWidth, 1, bgColor);
    }

    // Left border
    if (this._showBorder) {
      buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
      currentX++;
    }

    // Column cells
    for (let i = 0; i < this._columns.length; i++) {
      const column = this._columns[i];
      const width = this._columnWidths.get(column.key) || 0;

      // Check if there's a custom cell renderer
      if (column.cellRenderer) {
        const cellContent = column.cellRenderer(row[column.key], row, column, rowIndex, i);

        if (typeof cellContent === 'string') {
          // Render as text
          const truncated = this.truncateText(cellContent, width, column.truncate);
          const aligned = this.alignText(truncated, width, column.align || 'left');
          buffer.drawText(aligned, currentX, y, textColor);
        }
      } else {
        // Default text rendering
        const value = row[column.key];
        const text = column.formatter ? column.formatter(value) : String(value ?? '');
        const truncated = this.truncateText(text, width, column.truncate);
        const aligned = this.alignText(truncated, width, column.align || 'left');

        buffer.drawText(aligned, currentX, y, textColor);
      }

      currentX += width;

      // Column divider
      if (this._columnDivider && i < this._columns.length - 1) {
        buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
        currentX++;
      }
    }

    // Right border with scroll indicators
    if (this._showBorder) {
      // Check if we should show a scroll indicator instead of border
      const needsScrollIndicators = this._scrollable && this._rows.length > this._maxVisibleRows;

      if (needsScrollIndicators) {
        // Calculate data area bounds for scroll indicators
        let dataStartY = this.y;
        let dataEndY = this.y;

        if (this._showBorder) {
          dataStartY++; // Skip top border
        }
        if (this._showHeader) {
          dataStartY++; // Skip header row
          if (this._showBorder || this._rowDivider) {
            dataStartY++; // Skip header separator
          }
        }

        // Calculate the actual end position based on visible rows and layout
        if (this._showBorder) {
          dataEndY++; // Account for top border
        }
        if (this._showHeader) {
          dataEndY++; // Account for header row
          if (this._showBorder || this._rowDivider) {
            dataEndY++; // Account for header separator
          }
        }
        
        // Add visible rows
        const visibleRows = this.getVisibleRows();
        dataEndY += visibleRows.length - 1;
        
        // Account for row dividers between data rows
        if (this._rowDivider && visibleRows.length > 1) {
          dataEndY += visibleRows.length - 1;
        }

        // Check if current position should show scroll indicator
        const showTopIndicator = this._scrollOffset > 0 && y === dataStartY;
        const showBottomIndicator = this._scrollOffset + this._maxVisibleRows < this._rows.length && y === dataEndY;

        if (showTopIndicator) {
          buffer.drawText('▲', currentX, y, this._borderColor);
        } else if (showBottomIndicator) {
          buffer.drawText('▼', currentX, y, this._borderColor);
        } else {
          buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
        }
      } else {
        buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
      }
    } else if (this._scrollable && this._rows.length > this._maxVisibleRows) {
      // When borders are off, still show scroll indicators in reserved space
      let dataStartY = this.y;
      let dataEndY = this.y;

      if (this._showHeader) {
        dataStartY++; // Skip header row
        dataEndY++; // Account for header row
        if (this._rowDivider) {
          dataStartY++; // Skip header separator
          dataEndY++; // Account for header separator
        }
      }

      // Calculate the actual end position based on visible rows
      const visibleRows = this.getVisibleRows();
      dataEndY += visibleRows.length - 1;

      // Account for row dividers between data rows
      if (this._rowDivider && visibleRows.length > 1) {
        dataEndY += visibleRows.length - 1;
      }

      const showTopIndicator = this._scrollOffset > 0 && y === dataStartY;
      const showBottomIndicator = this._scrollOffset + this._maxVisibleRows < this._rows.length && y === dataEndY;

      if (showTopIndicator) {
        buffer.drawText('▲', this.x + this.width - 1, y, this._borderColor);
      } else if (showBottomIndicator) {
        buffer.drawText('▼', this.x + this.width - 1, y, this._borderColor);
      }
    }
  }

  // Handle keyboard input
  private handleKeyInput(key: ParsedKey): void {
    if (!this._selectable || this._rows.length === 0) {
      return;
    }

    switch (key.name) {
      case 'up':
      case 'k':
        this.moveFocus(-1);
        break;

      case 'down':
      case 'j':
        this.moveFocus(1);
        break;

      case 'left':
      case 'h':
        // Horizontal scroll left if table is wider than viewport
        if (this._totalWidth > this.width) {
          this._horizontalScrollOffset = Math.max(0, this._horizontalScrollOffset - 1);
          this.needsUpdate();
        }
        break;

      case 'right':
      case 'l':
        // Horizontal scroll right if table is wider than viewport
        if (this._totalWidth > this.width) {
          const maxHorizontalScroll = Math.max(0, this._totalWidth - this.width);
          this._horizontalScrollOffset = Math.min(maxHorizontalScroll, this._horizontalScrollOffset + 1);
          this.needsUpdate();
        }
        break;

      case 'pageup':
        this.moveFocus(-this._fastScrollStep);
        break;

      case 'pagedown':
        this.moveFocus(this._fastScrollStep);
        break;

      case 'home':
        this._focusedIndex = 0;
        this.ensureVisible(this._focusedIndex);
        this.needsUpdate();
        break;

      case 'end':
        this._focusedIndex = this._rows.length - 1;
        this.ensureVisible(this._focusedIndex);
        this.needsUpdate();
        break;

      case 'space':
        this.toggleSelection(this._focusedIndex);
        break;

      case 'return':
      case 'enter':
        this.selectRow(this._focusedIndex);
        break;

      case 'a':
        if (key.ctrl && this._multiSelect) {
          this.selectAll();
        }
        break;

      case 'tab':
        // Move to next column if editable
        if (this._onCellEdit) {
          this.moveFocusToNextColumn(key.shift);
        }
        break;

      default:
    }
  }

  // Move focus by delta
  private moveFocus(delta: number): void {
    const newIndex = Math.max(0, Math.min(this._rows.length - 1, this._focusedIndex + delta));

    if (newIndex !== this._focusedIndex) {
      this._focusedIndex = newIndex;
      this.ensureVisible(this._focusedIndex);
      this.needsUpdate();
    }
  }

  // Ensure row is visible
  private ensureVisible(index: number): void {
    if (!this._scrollable) {
      return;
    }

    if (index < this._scrollOffset) {
      this._scrollOffset = index;
    } else if (index >= this._scrollOffset + this._maxVisibleRows) {
      this._scrollOffset = index - this._maxVisibleRows + 1;
    }
  }

  // Toggle selection
  private toggleSelection(index: number): void {
    if (!this._selectable || index < 0 || index >= this._rows.length) {
      return;
    }

    const row = this._rows[index];
    if (row._disabled) {
      return;
    }

    if (this._selectedIndices.has(index)) {
      this._selectedIndices.delete(index);
    } else {
      if (!this._multiSelect) {
        this._selectedIndices.clear();
      }
      this._selectedIndices.add(index);
    }

    this.needsUpdate();

    if (this._onRowSelect) {
      this._onRowSelect(row, index);
    }

    this.emit(TableComponentEvents.ROW_SELECTED, { row, index, selected: this._selectedIndices.has(index) });
  }

  // Select a specific row
  private selectRow(index: number): void {
    if (!this._selectable || index < 0 || index >= this._rows.length) {
      return;
    }

    const row = this._rows[index];
    if (row._disabled) {
      return;
    }

    if (!this._multiSelect) {
      this._selectedIndices.clear();
    }

    this._selectedIndices.add(index);
    this.needsUpdate();

    if (this._onRowSelect) {
      this._onRowSelect(row, index);
    }

    this.emit(TableComponentEvents.ROW_SELECTED, { row, index, selected: true });
  }

  // Move focus to next/previous column (for editable tables)
  private moveFocusToNextColumn(reverse: boolean = false): void {
    // This is a placeholder for column navigation in editable mode
    // In the current implementation, we don't have per-cell focus,
    // so this would need additional state management
    // For now, emit an event that could be handled externally
    const currentColumnIndex = 0; // Would need to track current column
    const nextColumnIndex = reverse ? currentColumnIndex - 1 : currentColumnIndex + 1;

    if (nextColumnIndex >= 0 && nextColumnIndex < this._columns.length) {
      this.emit('columnFocusChanged', {
        row: this._focusedIndex,
        column: nextColumnIndex
      });
    }
  }

  // Select all rows
  private selectAll(): void {
    if (!this._multiSelect) {
      return;
    }

    this._selectedIndices.clear();

    for (let i = 0; i < this._rows.length; i++) {
      if (!this._rows[i]._disabled) {
        this._selectedIndices.add(i);
      }
    }

    this.needsUpdate();
  }

  // Sort by column
  public sortByColumn(columnKey: string, direction?: 'asc' | 'desc'): void {
    // Don't sort if global sorting is disabled
    if (!this._sortable) {
      return;
    }

    const column = this._columns.find(c => c.key === columnKey);

    if (!column || column.sortable === false) {
      return;
    }

    // Toggle direction if same column
    if (this._sortColumn === columnKey && !direction) {
      this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortColumn = columnKey;
      this._sortDirection = direction || 'asc';
    }

    // Sort rows
    this._rows.sort((a, b) => {
      const aVal = a[columnKey];
      const bVal = b[columnKey];

      let comparison = 0;

      if (aVal === bVal) {
        comparison = 0;
      } else if (aVal === null || aVal === undefined) {
        comparison = 1;
      } else if (bVal === null || bVal === undefined) {
        comparison = -1;
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return this._sortDirection === 'asc' ? comparison : -comparison;
    });

    this.needsUpdate();

    if (this._onSort) {
      this._onSort(column, this._sortDirection);
    }

    this.emit(TableComponentEvents.SORT_CHANGED, { column, direction: this._sortDirection });
  }

  // Recalculate layout (as mentioned in spec for reactive updates)
  public recalculateLayout(): void {
    this.calculateColumnWidths();
    this.calculateMaxVisibleRows();

    // Reinitialize
    this.initializeDataMode();

    this.needsUpdate();
  }

  // Public getters and setters
  public get columns(): TableColumn[] {
    return this._columns;
  }

  public set columns(value: TableColumn[]) {
    this._columns = value;
    this.calculateColumnWidths();
    this.needsUpdate();
  }

  // Batch update method (performance optimization from spec)
  public batchUpdate(updates: Partial<TableProps>): void {
    // Store pending updates
    for (const [key, value] of Object.entries(updates)) {
      this._pendingUpdates.set(key, value);
    }

    // Clear existing timeout
    if (this._batchUpdateTimeout) {
      clearTimeout(this._batchUpdateTimeout);
    }

    // Debounce updates
    this._batchUpdateTimeout = setTimeout(() => {
      this.applyBatchUpdates();
    }, 16); // One frame at 60fps
  }

  private applyBatchUpdates(): void {
    // Apply all pending updates
    for (const [key, value] of Array.from(this._pendingUpdates)) {
      switch (key) {
        case 'columns':
          this._columns = value;
          break;
        case 'rows':
          this._rows = value;
          break;
        case 'selectedIndex':
          this._focusedIndex = value;
          if (this._selectable) {
            this._selectedIndices.clear();
            this._selectedIndices.add(value);
          }
          break;
        // Add other properties as needed
        default:
      }
    }

    // Clear pending updates
    this._pendingUpdates.clear();
    this._batchUpdateTimeout = undefined;

    // Recalculate and update
    this.recalculateLayout();
  }

  public get rows(): TableRow[] {
    return this._rows;
  }

  public set rows(value: TableRow[]) {
    this._rows = value;
    this._selectedIndices.clear();
    this._focusedIndex = 0;
    this._scrollOffset = 0;
    this.calculateColumnWidths();
    this.calculateMaxVisibleRows();

    // Reinitialize components
    this.initializeDataMode();

    this.needsUpdate();
  }

  public get sortable(): boolean {
    return this._sortable;
  }

  public set sortable(value: boolean) {
    this._sortable = value;

    // Clear sort state when sorting is disabled
    if (!value) {
      this._sortColumn = undefined;
      this._sortDirection = 'asc';
    }

    this.needsUpdate();
  }

  // Efficient diff-based row updates (as mentioned in spec)
  public updateRows(newRows: TableRow[]): void {
    // Performance optimization: only update changed rows
    const oldRowsMap = new Map(this._rows.map((row, idx) => [row._id || idx, row]));
    const newRowsMap = new Map(newRows.map((row, idx) => [row._id || idx, row]));

    // Detect changes
    let hasChanges = false;
    if (this._rows.length !== newRows.length) {
      hasChanges = true;
    } else {
      for (const [id, newRow] of Array.from(newRowsMap)) {
        const oldRow = oldRowsMap.get(id);
        if (!oldRow || JSON.stringify(oldRow) !== JSON.stringify(newRow)) {
          hasChanges = true;
          break;
        }
      }
    }

    if (hasChanges) {
      this._rows = newRows;
      // Preserve selection if possible
      const newSelectedIndices = new Set<number>();
      for (const oldIndex of Array.from(this._selectedIndices)) {
        const oldRow = this._rows[oldIndex];
        if (oldRow?._id) {
          const newIndex = newRows.findIndex(r => r._id === oldRow._id);
          if (newIndex !== -1) {
            newSelectedIndices.add(newIndex);
          }
        }
      }
      this._selectedIndices = newSelectedIndices;

      this.calculateColumnWidths();
      this.calculateMaxVisibleRows();

      this.initializeDataMode();

      this.needsUpdate();
    }
  }

  public get selectedRows(): TableRow[] {
    const selected: TableRow[] = [];

    for (const index of Array.from(this._selectedIndices)) {
      if (index < this._rows.length) {
        selected.push(this._rows[index]);
      }
    }

    return selected;
  }

  public get selectedIndices(): number[] {
    return Array.from(this._selectedIndices);
  }

  public clearSelection(): void {
    this._selectedIndices.clear();
    this.needsUpdate();
  }

  // Override resize to recalculate layout
  protected onResize(width: number, height: number): void {
    super.onResize(width, height);
    this.calculateColumnWidths();
    this.calculateMaxVisibleRows();

    // Reinitialize to update layout
    this.initializeDataMode();
  }


}