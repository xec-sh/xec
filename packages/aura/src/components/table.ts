import { stringWidth } from "../utils.js"
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

// Table column configuration
export interface TableColumn {
  key: string;              // Unique column identifier
  title: string;            // Display title
  width?: number | 'auto';  // Fixed width or auto-calculate
  align?: 'left' | 'center' | 'right';  // Text alignment
  truncate?: TruncateMode;  // How to handle overflow
  formatter?: (value: any) => string;  // Custom cell formatter
  sortable?: boolean;       // Can this column be sorted
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

// Table component events
export enum TableComponentEvents {
  ROW_SELECTED = "rowSelected",
  SORT_CHANGED = "sortChanged",
  CELL_EDITED = "cellEdited",
  SCROLL_CHANGED = "scrollChanged",
}

export class TableComponent extends Component {
  protected focusable: boolean = true;

  // Data
  private _columns: TableColumn[] = [];
  private _rows: TableRow[] = [];

  // Selection state
  private _selectedIndices: Set<number> = new Set();
  private _focusedIndex: number = 0;

  // Sorting state
  private _sortColumn?: string;
  private _sortDirection: 'asc' | 'desc' = 'asc';

  // Scrolling state
  private _scrollOffset: number = 0;
  private _maxVisibleRows: number = 0;

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

    // Initialize data
    this._columns = options.columns || [];
    this._rows = options.rows || [];

    // Initialize layout options
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
  }

  // Calculate column widths
  private calculateColumnWidths(): void {
    this._columnWidths.clear();
    this._totalWidth = 0;

    const availableWidth = this.width - (this._showBorder ? 2 : 0);
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
    for (const width of this._columnWidths.values()) {
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

  // Render the table
  protected renderSelf(buffer: OptimizedBuffer): void {
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
    if (this._showBorder) {
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
    if (this._showBorder) {
      buffer.drawText(right, currentX, y, this._borderColor);
    }
  }

  // Draw header row
  private drawHeaderRow(buffer: OptimizedBuffer, x: number, y: number, borderChars: BorderCharacters): void {
    let currentX = x;

    // Fill background
    if (this._headerBackgroundColor.a > 0) {
      buffer.fillRect(x, y, this.width, 1, this._headerBackgroundColor);
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

      // Header text
      let headerText = column.title;
      if (this._sortColumn === column.key) {
        headerText += this._sortDirection === 'asc' ? ' ↑' : ' ↓';
      }

      const truncated = this.truncateText(headerText, width);
      const aligned = this.alignText(truncated, width, column.align || 'left');

      buffer.drawText(aligned, currentX, y, this._headerTextColor);
      currentX += width;

      // Column divider
      if (this._columnDivider && i < this._columns.length - 1) {
        buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
        currentX++;
      }
    }

    // Right border
    if (this._showBorder) {
      buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
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
      buffer.fillRect(x, y, this.width, 1, bgColor);
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

      // Cell value
      const value = row[column.key];
      const text = column.formatter ? column.formatter(value) : String(value ?? '');
      const truncated = this.truncateText(text, width, column.truncate);
      const aligned = this.alignText(truncated, width, column.align || 'left');

      buffer.drawText(aligned, currentX, y, textColor);
      currentX += width;

      // Column divider
      if (this._columnDivider && i < this._columns.length - 1) {
        buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
        currentX++;
      }
    }

    // Right border
    if (this._showBorder) {
      buffer.drawText(borderChars.vertical, currentX, y, this._borderColor);
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
    const column = this._columns.find(c => c.key === columnKey);

    if (!column || (column.sortable === false && !this._sortable)) {
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

  // Public getters and setters
  public get columns(): TableColumn[] {
    return this._columns;
  }

  public set columns(value: TableColumn[]) {
    this._columns = value;
    this.calculateColumnWidths();
    this.needsUpdate();
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
    this.needsUpdate();
  }

  public get selectedRows(): TableRow[] {
    const selected: TableRow[] = [];

    for (const index of this._selectedIndices) {
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
  }
}