/**
 * Table component for Terex
 * Provides comprehensive data table functionality with sorting, filtering, pagination, and keyboard navigation
 */

import { StyleBuilder } from '../../core/color.js';
import { BaseComponent } from '../../core/component.js';

import type { Key, Output, Component } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type CellValue = string | number | boolean | null | undefined | Date;
export type TableData = Record<string, CellValue>;

export interface TableColumn<T = TableData> {
  key: keyof T;
  label: string;
  width?: number | 'auto' | string;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  sticky?: boolean;
  formatter?: (value: CellValue, row: T, column: TableColumn<T>) => string;
  sorter?: (a: T, b: T) => number;
  filter?: (value: CellValue, filterText: string) => boolean;
  validator?: (value: CellValue) => string | null;
  editor?: Component<unknown>;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

export interface FilterState {
  column: string;
  value: string;
  active: boolean;
}

export interface SelectionState {
  selectedRows: Set<number>;
  selectAllState: 'none' | 'all' | 'partial';
  focusedRow: number | null;
  focusedColumn: number | null;
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
}

export interface TableOptions<T = TableData> {
  columns: TableColumn<T>[];
  data: T[];
  selectable?: boolean;
  multiSelect?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  resizable?: boolean;
  editable?: boolean;
  striped?: boolean;
  bordered?: boolean;
  hover?: boolean;
  dense?: boolean;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  height?: number;
  maxHeight?: number;
  stickyHeader?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  showRowNumbers?: boolean;
  allowExport?: boolean;
  keyboardNavigation?: boolean;
  onRowSelect?: (row: T, index: number) => void;
  onRowDoubleClick?: (row: T, index: number) => void;
  onCellClick?: (value: CellValue, row: T, column: TableColumn<T>, rowIndex: number, colIndex: number) => void;
  onCellEdit?: (value: CellValue, row: T, column: TableColumn<T>, rowIndex: number, colIndex: number) => void;
  onSort?: (column: TableColumn<T>, direction: SortDirection) => void;
  onFilter?: (filters: FilterState[]) => void;
  onPageChange?: (page: number) => void;
  onExport?: (data: T[], format: 'csv' | 'json') => void;
}

export interface TableState<T = TableData> {
  data: T[];
  filteredData: T[];
  displayData: T[];
  sortState: SortState;
  filters: FilterState[];
  selection: SelectionState;
  pagination: PaginationState;
  columnWidths: number[];
  isFilterRowVisible: boolean;
  editingCell: { row: number; col: number } | null;
  loading: boolean;
  scrollTop: number;
  scrollLeft: number;
}

// ============================================================================
// Table Component
// ============================================================================

export class Table<T extends TableData = TableData> extends BaseComponent<TableState<T>> {
  private options: Required<TableOptions<T>>;
  private style: StyleBuilder;
  private filterComponents: Map<string, Component<unknown>>;

  constructor(options: TableOptions<T>) {
    // Calculate initial pagination
    const totalRows = options.data?.length || 0;
    const pageSize = options.pageSize || 10;
    const totalPages = Math.ceil(totalRows / pageSize);

    const initialState: TableState<T> = {
      data: options.data || [],
      filteredData: options.data || [],
      displayData: options.data ? options.data.slice(0, pageSize) : [],
      sortState: { column: null, direction: null },
      filters: [],
      selection: {
        selectedRows: new Set(),
        selectAllState: 'none',
        focusedRow: null,
        focusedColumn: null
      },
      pagination: {
        currentPage: 1,
        pageSize,
        totalPages,
        totalRows
      },
      columnWidths: [],
      isFilterRowVisible: false,
      editingCell: null,
      loading: options.loading ?? false,
      scrollTop: 0,
      scrollLeft: 0
    };

    super({ initialState });

    // Set default options
    this.options = {
      columns: options.columns || [],
      data: options.data || [],
      selectable: options.selectable ?? false,
      multiSelect: options.multiSelect ?? true,
      sortable: options.sortable ?? true,
      filterable: options.filterable ?? true,
      paginated: options.paginated ?? true,
      pageSize: options.pageSize || 10,
      resizable: options.resizable ?? false,
      editable: options.editable ?? false,
      striped: options.striped ?? true,
      bordered: options.bordered ?? true,
      hover: options.hover ?? true,
      dense: options.dense ?? false,
      loading: options.loading ?? false,
      loadingText: options.loadingText || 'Loading...',
      emptyText: options.emptyText || 'No data available',
      height: options.height ?? 0,
      maxHeight: options.maxHeight ?? 0,
      stickyHeader: options.stickyHeader ?? true,
      showHeader: options.showHeader ?? true,
      showFooter: options.showFooter ?? false,
      showRowNumbers: options.showRowNumbers ?? false,
      allowExport: options.allowExport ?? false,
      keyboardNavigation: options.keyboardNavigation ?? true,
      onRowSelect: options.onRowSelect ?? (() => {}),
      onRowDoubleClick: options.onRowDoubleClick ?? (() => {}),
      onCellClick: options.onCellClick ?? (() => {}),
      onCellEdit: options.onCellEdit ?? (() => {}),
      onSort: options.onSort ?? (() => {}),
      onFilter: options.onFilter ?? (() => {}),
      onPageChange: options.onPageChange ?? (() => {}),
      onExport: options.onExport ?? (() => {})
    };

    this.style = new StyleBuilder();
    this.filterComponents = new Map();

    // Initialize column widths
    this.calculateColumnWidths();

    // Apply initial sorting and filtering
    this.updateDisplayData();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private calculateColumnWidths(): void {
    const terminalWidth = process.stdout.columns || 80;
    const availableWidth = terminalWidth - 2; // Account for borders
    
    let totalFixed = 0;
    let autoColumns = 0;

    // Calculate space for fixed columns and count auto columns
    for (const column of this.options.columns) {
      if (typeof column.width === 'number') {
        totalFixed += column.width;
      } else if (column.width === 'auto' || !column.width) {
        autoColumns++;
      }
    }

    // Add space for selection column
    if (this.options.selectable) {
      totalFixed += 4; // "[ ] " width
    }

    // Add space for row numbers
    if (this.options.showRowNumbers) {
      const maxRowNumber = this.state.pagination.totalRows.toString().length;
      totalFixed += maxRowNumber + 2; // Number + padding
    }

    const remainingWidth = Math.max(0, availableWidth - totalFixed);
    const autoColumnWidth = autoColumns > 0 ? Math.floor(remainingWidth / autoColumns) : 0;

    const widths: number[] = [];
    for (const column of this.options.columns) {
      if (typeof column.width === 'number') {
        widths.push(Math.max(column.minWidth || 5, Math.min(column.maxWidth || 100, column.width)));
      } else {
        widths.push(Math.max(column.minWidth || 5, Math.min(column.maxWidth || 50, autoColumnWidth)));
      }
    }

    this.setState({ columnWidths: widths });
  }

  private updateDisplayData(): void {
    const { data } = this.state;

    // Apply filters
    const filteredData = this.applyFilters(data);

    // Apply sorting
    const sortedData = this.applySorting(filteredData);

    // Apply pagination
    const { currentPage, pageSize } = this.state.pagination;
    const startIndex = (currentPage - 1) * pageSize;
    const displayData = this.options.paginated 
      ? sortedData.slice(startIndex, startIndex + pageSize)
      : sortedData;

    // Update pagination info
    const totalRows = sortedData.length;
    const totalPages = Math.ceil(totalRows / pageSize);

    this.setState({
      filteredData: sortedData,
      displayData,
      pagination: {
        ...this.state.pagination,
        totalRows,
        totalPages,
        currentPage: Math.min(this.state.pagination.currentPage, totalPages || 1)
      }
    });
  }

  private applyFilters(data: T[]): T[] {
    if (this.state.filters.length === 0) {
      return data;
    }

    return data.filter(row => this.state.filters.every(filter => {
        if (!filter.active || !filter.value.trim()) return true;

        const column = this.options.columns.find(col => col.key === filter.column);
        if (!column) return true;

        const cellValue = row[column.key];
        
        if (column.filter) {
          return column.filter(cellValue, filter.value);
        }

        // Default string-based filtering
        const searchValue = filter.value.toLowerCase();
        const cellString = String(cellValue || '').toLowerCase();
        return cellString.includes(searchValue);
      }));
  }

  private applySorting(data: T[]): T[] {
    const { sortState } = this.state;
    if (!sortState.column || !sortState.direction) {
      return data;
    }

    const column = this.options.columns.find(col => col.key === sortState.column);
    if (!column) return data;

    return [...data].sort((a, b) => {
      if (column.sorter) {
        const result = column.sorter(a, b);
        return sortState.direction === 'desc' ? -result : result;
      }

      // Default sorting
      const aValue = a[column.key];
      const bValue = b[column.key];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      let result = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        result = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        result = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        result = aValue.getTime() - bValue.getTime();
      } else {
        result = String(aValue).localeCompare(String(bValue));
      }

      return sortState.direction === 'desc' ? -result : result;
    });
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): Output {
    const lines: string[] = [];
    
    if (this.state.loading) {
      return this.renderLoading();
    }

    if (this.state.displayData.length === 0) {
      return this.renderEmpty();
    }

    // Render header
    if (this.options.showHeader) {
      lines.push(...this.renderHeader());
    }

    // Render filter row
    if (this.state.isFilterRowVisible && this.options.filterable) {
      lines.push(...this.renderFilterRow());
    }

    // Render table body
    lines.push(...this.renderBody());

    // Render footer
    if (this.options.showFooter) {
      lines.push(...this.renderFooter());
    }

    // Render pagination
    if (this.options.paginated) {
      lines.push('');
      lines.push(...this.renderPagination());
    }

    return {
      lines,
      cursor: this.getCursorPosition()
    };
  }

  private renderLoading(): Output {
    const lines = [
      `⏳ ${this.options.loadingText}`
    ];
    return { lines };
  }

  private renderEmpty(): Output {
    const lines = [
      this.style.dim().text(this.options.emptyText)
    ];
    return { lines };
  }

  private renderHeader(): string[] {
    const lines: string[] = [];
    const { columnWidths } = this.state;

    // Top border
    if (this.options.bordered) {
      lines.push(this.renderBorder('top'));
    }

    // Header row
    let headerRow = this.options.bordered ? '│' : '';

    // Row number column header
    if (this.options.showRowNumbers) {
      const width = this.state.pagination.totalRows.toString().length + 2;
      headerRow += this.style.bold().text('#'.padEnd(width));
      if (this.options.bordered) headerRow += '│';
    }

    // Selection column header
    if (this.options.selectable) {
      const selectAllIndicator = this.getSelectAllIndicator();
      headerRow += this.style.bold().text(`[${selectAllIndicator}] `);
      if (this.options.bordered) headerRow += '│';
    }

    // Data columns
    this.options.columns.forEach((column, index) => {
      const width = columnWidths[index] || 10;
      let headerText = column.label;

      // Add sort indicator
      if (this.options.sortable && column.sortable !== false) {
        const { sortState } = this.state;
        if (sortState.column === column.key) {
          headerText += sortState.direction === 'asc' ? ' ↑' : ' ↓';
        } else {
          headerText += ' ⇅';
        }
      }

      headerText = this.truncateText(headerText, width);
      headerText = this.alignText(headerText, width, column.align || 'left');
      headerRow += this.style.bold().text(headerText);

      if (this.options.bordered && index < this.options.columns.length - 1) {
        headerRow += '│';
      }
    });

    if (this.options.bordered) {
      headerRow += '│';
    }

    lines.push(headerRow);

    // Header bottom border
    if (this.options.bordered) {
      lines.push(this.renderBorder('middle'));
    }

    return lines;
  }

  private renderFilterRow(): string[] {
    const lines: string[] = [];
    const { columnWidths } = this.state;

    let filterRow = this.options.bordered ? '│' : '';

    // Row number column (empty)
    if (this.options.showRowNumbers) {
      const width = this.state.pagination.totalRows.toString().length + 2;
      filterRow += ' '.repeat(width);
      if (this.options.bordered) filterRow += '│';
    }

    // Selection column (empty)
    if (this.options.selectable) {
      filterRow += '    '; // "[ ] " width
      if (this.options.bordered) filterRow += '│';
    }

    // Filter inputs for each column
    this.options.columns.forEach((column, index) => {
      const width = columnWidths[index] || 10;
      const filter = this.state.filters.find(f => f.column === column.key);
      const filterText = filter?.value || '';

      let filterInput = '🔍' + filterText.padEnd(width - 1);
      filterInput = this.truncateText(filterInput, width);
      
      if (this.state.selection.focusedColumn === index && this.state.isFilterRowVisible) {
        filterInput = this.style.cyan().underline().text(filterInput);
      } else {
        filterInput = this.style.dim().text(filterInput);
      }

      filterRow += filterInput;

      if (this.options.bordered && index < this.options.columns.length - 1) {
        filterRow += '│';
      }
    });

    if (this.options.bordered) {
      filterRow += '│';
    }

    lines.push(filterRow);

    // Filter row bottom border
    if (this.options.bordered) {
      lines.push(this.renderBorder('middle'));
    }

    return lines;
  }

  private renderBody(): string[] {
    const lines: string[] = [];
    const { displayData, columnWidths, selection } = this.state;

    displayData.forEach((row, rowIndex) => {
      const absoluteRowIndex = this.getAbsoluteRowIndex(rowIndex);
      const isSelected = selection.selectedRows.has(absoluteRowIndex);
      const isFocused = selection.focusedRow === absoluteRowIndex;

      let rowLine = this.options.bordered ? '│' : '';

      // Row number
      if (this.options.showRowNumbers) {
        const width = this.state.pagination.totalRows.toString().length + 2;
        const rowNum = (absoluteRowIndex + 1).toString().padStart(width - 1) + ' ';
        rowLine += this.style.dim().text(rowNum);
        if (this.options.bordered) rowLine += '│';
      }

      // Selection checkbox
      if (this.options.selectable) {
        const checked = isSelected ? '✓' : ' ';
        let selectCell = `[${checked}] `;
        if (isFocused) {
          selectCell = this.style.cyan().text(selectCell);
        }
        rowLine += selectCell;
        if (this.options.bordered) rowLine += '│';
      }

      // Data columns
      this.options.columns.forEach((column, colIndex) => {
        const width = columnWidths[colIndex] || 10;
        const cellValue = row[column.key];
        let cellText = column.formatter 
          ? column.formatter(cellValue, row, column)
          : String(cellValue || '');

        cellText = this.truncateText(cellText, width);
        cellText = this.alignText(cellText, width, column.align || 'left');

        // Apply cell styling
        if (isFocused && selection.focusedColumn === colIndex) {
          cellText = this.style.cyan().inverse().text(cellText);
        } else if (isSelected) {
          cellText = this.style.blue().text(cellText);
        } else if (this.options.striped && rowIndex % 2 === 1) {
          cellText = this.style.dim().text(cellText);
        }

        rowLine += cellText;

        if (this.options.bordered && colIndex < this.options.columns.length - 1) {
          rowLine += '│';
        }
      });

      if (this.options.bordered) {
        rowLine += '│';
      }

      lines.push(rowLine);
    });

    // Bottom border
    if (this.options.bordered) {
      lines.push(this.renderBorder('bottom'));
    }

    return lines;
  }

  private renderFooter(): string[] {
    const lines: string[] = [];
    const { pagination } = this.state;

    // Summary information
    const summary = `Showing ${pagination.currentPage} of ${pagination.totalPages} pages (${pagination.totalRows} total rows)`;
    lines.push(this.style.dim().text(summary));

    return lines;
  }

  private renderPagination(): string[] {
    const lines: string[] = [];
    const { pagination } = this.state;

    if (pagination.totalPages <= 1) {
      return lines;
    }

    const buttons: string[] = [];

    // Previous button
    if (pagination.currentPage > 1) {
      buttons.push(this.style.cyan().text('◀ Prev'));
    } else {
      buttons.push(this.style.dim().text('◀ Prev'));
    }

    // Page numbers
    const startPage = Math.max(1, pagination.currentPage - 2);
    const endPage = Math.min(pagination.totalPages, pagination.currentPage + 2);

    if (startPage > 1) {
      buttons.push('1');
      if (startPage > 2) {
        buttons.push('...');
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      if (i === pagination.currentPage) {
        buttons.push(this.style.cyan().inverse().text(` ${i} `));
      } else {
        buttons.push(this.style.cyan().text(String(i)));
      }
    }

    if (endPage < pagination.totalPages) {
      if (endPage < pagination.totalPages - 1) {
        buttons.push('...');
      }
      buttons.push(String(pagination.totalPages));
    }

    // Next button
    if (pagination.currentPage < pagination.totalPages) {
      buttons.push(this.style.cyan().text('Next ▶'));
    } else {
      buttons.push(this.style.dim().text('Next ▶'));
    }

    lines.push(buttons.join('  '));

    // Page info
    lines.push(this.style.dim().text(`Page ${pagination.currentPage} of ${pagination.totalPages}`));

    return lines;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private renderBorder(position: 'top' | 'middle' | 'bottom'): string {
    const chars = {
      top: { left: '┌', right: '┐', horizontal: '─', junction: '┬' },
      middle: { left: '├', right: '┤', horizontal: '─', junction: '┼' },
      bottom: { left: '└', right: '┘', horizontal: '─', junction: '┴' }
    };

    const { left, right, horizontal, junction } = chars[position];
    let border = left;

    // Row number column
    if (this.options.showRowNumbers) {
      const width = this.state.pagination.totalRows.toString().length + 2;
      border += horizontal.repeat(width) + junction;
    }

    // Selection column
    if (this.options.selectable) {
      border += horizontal.repeat(4) + junction;
    }

    // Data columns
    this.state.columnWidths.forEach((width, index) => {
      border += horizontal.repeat(width);
      if (index < this.state.columnWidths.length - 1) {
        border += junction;
      }
    });

    border += right;
    return border;
  }

  private truncateText(text: string, width: number): string {
    if (text.length <= width) {
      return text;
    }
    return text.slice(0, width - 1) + '…';
  }

  private alignText(text: string, width: number, align: 'left' | 'center' | 'right'): string {
    if (text.length >= width) return text;

    const padding = width - text.length;
    
    switch (align) {
      case 'center':
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      case 'right':
        return ' '.repeat(padding) + text;
      default:
        return text + ' '.repeat(padding);
    }
  }

  private getAbsoluteRowIndex(displayIndex: number): number {
    const { currentPage, pageSize } = this.state.pagination;
    return (currentPage - 1) * pageSize + displayIndex;
  }

  private getSelectAllIndicator(): string {
    const { selectAllState } = this.state.selection;
    switch (selectAllState) {
      case 'all': return '✓';
      case 'partial': return '-';
      default: return ' ';
    }
  }

  private getCursorPosition(): { x: number; y: number } | undefined {
    const { selection } = this.state;
    if (selection.focusedRow === null && selection.focusedColumn === null) {
      return undefined;
    }

    // Calculate cursor position based on focused cell
    // This is simplified - in practice, you'd need to calculate exact position
    return { x: 0, y: 0 };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  override handleKeypress(key: Key): boolean {
    if (!this.options.keyboardNavigation) {
      return false;
    }

    let handled = false;

    switch (key.name) {
      case 'up':
      case 'down':
        this.handleVerticalNavigation(key.name === 'up' ? -1 : 1);
        handled = true;
        break;

      case 'left':
      case 'right':
        this.handleHorizontalNavigation(key.name === 'left' ? -1 : 1);
        handled = true;
        break;

      case 'tab':
        this.handleHorizontalNavigation(key.shift ? -1 : 1);
        handled = true;
        break;

      case 'space':
        if (this.options.selectable) {
          this.handleRowSelection();
          handled = true;
        }
        break;

      case 'enter':
      case 'return':
        this.handleRowAction();
        handled = true;
        break;

      case 'a':
        if (key.ctrl && this.options.selectable && this.options.multiSelect) {
          this.selectAll();
          handled = true;
        }
        break;

      case 'f':
        if (key.ctrl && this.options.filterable) {
          this.toggleFilterRow();
          handled = true;
        }
        break;

      case 'home':
        this.navigateToRow(0);
        handled = true;
        break;

      case 'end':
        this.navigateToRow(this.state.displayData.length - 1);
        handled = true;
        break;

      case 'pageup':
        this.navigatePages(-1);
        handled = true;
        break;

      case 'pagedown':
        this.navigatePages(1);
        handled = true;
        break;

      default:
        // Handle typing in filter mode
        if (this.state.isFilterRowVisible && this.isTextInput(key)) {
          this.handleFilterInput(key);
          handled = true;
        }
    }

    if (!handled) {
      handled = super.handleKeypress(key);
    }

    return handled;
  }

  private handleVerticalNavigation(direction: number): void {
    const { selection } = this.state;
    const currentRow = selection.focusedRow ?? -1;
    const maxRow = this.state.displayData.length - 1;
    
    const newRow = Math.max(0, Math.min(maxRow, currentRow + direction));
    
    if (newRow !== currentRow) {
      this.setState({
        selection: {
          ...selection,
          focusedRow: this.getAbsoluteRowIndex(newRow)
        }
      });
    }
  }

  private handleHorizontalNavigation(direction: number): void {
    const { selection } = this.state;
    const currentCol = selection.focusedColumn ?? -1;
    const maxCol = this.options.columns.length - 1;
    
    const newCol = Math.max(0, Math.min(maxCol, currentCol + direction));
    
    if (newCol !== currentCol) {
      this.setState({
        selection: {
          ...selection,
          focusedColumn: newCol
        }
      });
    }
  }

  private handleRowSelection(): void {
    const { selection } = this.state;
    if (selection.focusedRow === null) return;

    const newSelected = new Set(selection.selectedRows);
    
    if (newSelected.has(selection.focusedRow)) {
      newSelected.delete(selection.focusedRow);
    } else {
      if (!this.options.multiSelect) {
        newSelected.clear();
      }
      newSelected.add(selection.focusedRow);
    }

    const selectAllState = this.calculateSelectAllState(newSelected);

    this.setState({
      selection: {
        ...selection,
        selectedRows: newSelected,
        selectAllState
      }
    });

    // Emit selection event
    if (this.options.onRowSelect && selection.focusedRow !== null) {
      const row = this.getRowByIndex(selection.focusedRow);
      if (row) {
        this.options.onRowSelect(row, selection.focusedRow);
      }
    }
  }

  private handleRowAction(): void {
    const { selection } = this.state;
    if (selection.focusedRow === null) return;

    const row = this.getRowByIndex(selection.focusedRow);
    if (row && this.options.onRowDoubleClick) {
      this.options.onRowDoubleClick(row, selection.focusedRow);
    }
  }

  private handleFilterInput(key: Key): void {
    const { selection } = this.state;
    if (selection.focusedColumn === null) return;

    const column = this.options.columns[selection.focusedColumn];
    if (!column) return;

    const existingFilter = this.state.filters.find(f => f.column === column.key);
    const currentValue = existingFilter?.value || '';

    let newValue = currentValue;
    
    if (key.name === 'backspace') {
      newValue = currentValue.slice(0, -1);
    } else if (key.name === 'delete') {
      newValue = '';
    } else if (key.sequence && key.sequence.length === 1) {
      newValue = currentValue + key.sequence;
    }

    this.setColumnFilter(String(column.key), newValue);
  }

  private isTextInput(key: Key): boolean {
    return !!(key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta);
  }

  // ============================================================================
  // Navigation Methods
  // ============================================================================

  private navigateToRow(rowIndex: number): void {
    const { selection } = this.state;
    const clampedIndex = Math.max(0, Math.min(this.state.displayData.length - 1, rowIndex));
    
    this.setState({
      selection: {
        ...selection,
        focusedRow: this.getAbsoluteRowIndex(clampedIndex)
      }
    });
  }

  private navigatePages(direction: number): void {
    if (!this.options.paginated) return;

    const { pagination } = this.state;
    const newPage = Math.max(1, Math.min(pagination.totalPages, pagination.currentPage + direction));
    
    if (newPage !== pagination.currentPage) {
      this.setState({
        pagination: {
          ...pagination,
          currentPage: newPage
        }
      });
      
      this.updateDisplayData();
      
      if (this.options.onPageChange) {
        this.options.onPageChange(newPage);
      }
    }
  }

  // ============================================================================
  // Selection Methods
  // ============================================================================

  private selectAll(): void {
    const { selection } = this.state;
    const newSelected = new Set<number>();
    
    // Select all visible rows
    this.state.filteredData.forEach((_, index) => {
      newSelected.add(index);
    });

    this.setState({
      selection: {
        ...selection,
        selectedRows: newSelected,
        selectAllState: 'all'
      }
    });
  }

  private calculateSelectAllState(selectedRows: Set<number>): 'none' | 'all' | 'partial' {
    if (selectedRows.size === 0) return 'none';
    if (selectedRows.size === this.state.filteredData.length) return 'all';
    return 'partial';
  }

  // ============================================================================
  // Filter Methods
  // ============================================================================

  private toggleFilterRow(): void {
    this.setState({ 
      isFilterRowVisible: !this.state.isFilterRowVisible 
    });
  }

  private setColumnFilter(column: string, value: string): void {
    const filters = this.state.filters.filter(f => f.column !== column);
    
    if (value.trim()) {
      filters.push({
        column,
        value,
        active: true
      });
    }

    this.setState({ filters });
    this.updateDisplayData();

    if (this.options.onFilter) {
      this.options.onFilter(filters);
    }
  }

  // ============================================================================
  // Sorting Methods
  // ============================================================================

  private sortByColumn(column: TableColumn<T>): void {
    const { sortState } = this.state;
    
    let newDirection: SortDirection = 'asc';
    
    if (sortState.column === column.key) {
      if (sortState.direction === 'asc') {
        newDirection = 'desc';
      } else if (sortState.direction === 'desc') {
        newDirection = null;
      }
    }

    const newSortState = {
      column: newDirection ? String(column.key) : null,
      direction: newDirection
    };

    this.setState({ sortState: newSortState });
    this.updateDisplayData();

    if (this.options.onSort) {
      this.options.onSort(column, newDirection);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getRowByIndex(index: number): T | undefined {
    return this.state.filteredData[index];
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get all table data
   */
  getData(): T[] {
    return [...this.state.data];
  }

  /**
   * Set table data
   */
  setData(data: T[]): void {
    this.setState({ data: [...data] });
    this.updateDisplayData();
  }

  /**
   * Add a row
   */
  addRow(row: T, index?: number): void {
    const newData = [...this.state.data];
    if (index !== undefined) {
      newData.splice(index, 0, row);
    } else {
      newData.push(row);
    }
    this.setData(newData);
  }

  /**
   * Remove rows by indices
   */
  removeRows(indices: number[]): void {
    const newData = this.state.data.filter((_, index) => !indices.includes(index));
    this.setData(newData);
  }

  /**
   * Update a row
   */
  updateRow(index: number, row: Partial<T>): void {
    const newData = [...this.state.data];
    if (newData[index]) {
      newData[index] = { ...newData[index], ...row } as T;
    }
    this.setData(newData);
  }

  /**
   * Get selected rows
   */
  getSelectedRows(): T[] {
    return Array.from(this.state.selection.selectedRows)
      .map(index => this.state.filteredData[index])
      .filter((row): row is T => Boolean(row));
  }

  /**
   * Set selected rows
   */
  setSelectedRows(indices: number[]): void {
    const { selection } = this.state;
    const newSelected = new Set(indices);
    const selectAllState = this.calculateSelectAllState(newSelected);

    this.setState({
      selection: {
        ...selection,
        selectedRows: newSelected,
        selectAllState
      }
    });
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    const { selection } = this.state;
    this.setState({
      selection: {
        ...selection,
        selectedRows: new Set(),
        selectAllState: 'none'
      }
    });
  }

  /**
   * Focus a specific cell
   */
  focusCell(row: number, column: number): void {
    const { selection } = this.state;
    this.setState({
      selection: {
        ...selection,
        focusedRow: row,
        focusedColumn: column
      }
    });
  }

  /**
   * Go to specific page
   */
  goToPage(page: number): void {
    const clampedPage = Math.max(1, Math.min(this.state.pagination.totalPages, page));
    if (clampedPage !== this.state.pagination.currentPage) {
      this.setState({
        pagination: {
          ...this.state.pagination,
          currentPage: clampedPage
        }
      });
      this.updateDisplayData();
    }
  }

  /**
   * Set page size
   */
  setPageSize(size: number): void {
    this.setState({
      pagination: {
        ...this.state.pagination,
        pageSize: size,
        currentPage: 1
      }
    });
    this.updateDisplayData();
  }

  /**
   * Export data
   */
  export(format: 'csv' | 'json' = 'json'): string {
    let result: string;

    if (format === 'json') {
      result = JSON.stringify(this.state.filteredData, null, 2);
    } else {
      // CSV export
      if (this.state.filteredData.length === 0) {
        result = '';
      } else {
        const headers = this.options.columns.map(col => col.label).join(',');
        const rows = this.state.filteredData.map(row => 
          this.options.columns.map(col => String(row[col.key] || '')).join(',')
        );
        
        result = [headers, ...rows].join('\n');
      }
    }

    // Call onExport callback if provided, but still return the data
    if (this.options.onExport) {
      this.options.onExport(this.state.filteredData, format);
    }

    return result;
  }

  /**
   * Refresh the table
   */
  refresh(): void {
    this.calculateColumnWidths();
    this.updateDisplayData();
  }
}