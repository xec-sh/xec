// Table component with virtual scrolling and advanced features

import { Key } from '../../core/types.js';
import { Prompt } from '../../core/prompt.js';

export interface TableColumn<T = any> {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: (value: any, row: T) => string;
}

export interface TableOptions<T = any> {
  message: string;
  columns: TableColumn<T>[];
  data: T[];
  selectable?: 'single' | 'multiple' | false;
  pageSize?: number;
  search?: boolean;
  sort?: string[] | boolean;
  filter?: (row: T, query: string) => boolean;
  initialSelection?: T[];
  theme?: any;
  onSelect?: (row: T) => void | Promise<void>;
  interactive?: boolean; // Keep table open after selection
  refreshData?: () => T[] | Promise<T[]>; // Callback to refresh data
}

interface TableState<T> {
  data: T[];
  filteredData: T[];
  selectedRows: Set<T>;
  focusedIndex: number;
  scrollOffset: number;
  searchQuery: string;
  sortColumn?: string;
  sortDirection: 'asc' | 'desc';
  searching: boolean;
  status: string;
  error?: string;
}

export class TablePrompt<T = any> extends Prompt<T | T[], TableOptions<T>> {
  private originalData: T[];

  constructor(options: TableOptions<T>) {
    super({
      ...options
    });

    this.originalData = [...options.data];

    const state: TableState<T> = {
      data: options.data,
      filteredData: options.data,
      selectedRows: new Set(options.initialSelection || []),
      focusedIndex: 0,
      scrollOffset: 0,
      searchQuery: '',
      sortColumn: undefined,
      sortDirection: 'asc',
      searching: false,
      status: 'idle',
      error: undefined
    };

    this.state.setState(state);
  }

  render(): string {
    const state = this.state.getState() as TableState<T>;
    const { theme } = this.getRenderContext();
    const lines: string[] = [];

    // Message
    lines.push(theme.formatters.primary(this.config.message));
    lines.push('');

    // Search bar
    if (this.config.search) {
      const searchPrefix = state.searching 
        ? theme.formatters.primary('Search: ')
        : theme.formatters.muted('Search: ');
      
      const searchLine = searchPrefix + (state.searchQuery || theme.formatters.muted('Type / to search'));
      lines.push(searchLine);
      lines.push('');
    }

    // Column headers
    const headerLine = this.renderHeader(state);
    lines.push(theme.formatters.bold(headerLine));
    lines.push(this.renderSeparator())

    // Virtual scrolling - calculate visible rows
    const pageSize = this.config.pageSize || 10;
    const totalRows = state.filteredData.length;
    
    // Adjust scroll offset if needed
    const maxOffset = Math.max(0, totalRows - pageSize);
    const scrollOffset = Math.min(state.scrollOffset, maxOffset);
    
    const visibleRows = state.filteredData.slice(scrollOffset, scrollOffset + pageSize);

    // Render rows
    if (visibleRows.length === 0) {
      lines.push(theme.formatters.muted('  No data to display'));
    } else {
      visibleRows.forEach((row, index) => {
        const actualIndex = scrollOffset + index;
        const isFocused = actualIndex === state.focusedIndex;
        const isSelected = state.selectedRows.has(row);
        
        const rowLine = this.renderRow(row, isFocused, isSelected, state);
        lines.push(rowLine);
      });
    }

    // Scroll indicator
    if (totalRows > pageSize) {
      lines.push('');
      const scrollInfo = `Showing ${scrollOffset + 1}-${Math.min(scrollOffset + pageSize, totalRows)} of ${totalRows} rows`;
      lines.push(theme.formatters.muted(scrollInfo));
      
      // Scroll bar visualization
      const scrollBar = this.renderScrollBar(scrollOffset, pageSize, totalRows);
      lines.push(scrollBar);
    }

    // Selection info
    if (this.config.selectable && state.selectedRows.size > 0) {
      lines.push('');
      lines.push(theme.formatters.success(`${state.selectedRows.size} row(s) selected`));
    }

    // Status line for interactive mode
    if (state.status === 'processing') {
      lines.push('');
      lines.push(theme.formatters.warning('Processing...'));
    } else if (state.status === 'error' && state.error) {
      lines.push('');
      lines.push(theme.formatters.error(`Error: ${state.error}`));
    }

    // Help text
    lines.push('');
    const helpTexts = [];
    if (this.config.selectable) {
      helpTexts.push('Space: select');
      if (this.config.selectable === 'multiple') {
        helpTexts.push('a: select all');
      }
    }
    if (this.config.search) helpTexts.push('/: search');
    if (this.config.sort) helpTexts.push('s: sort');
    if (this.config.interactive) {
      if (this.config.onSelect) helpTexts.push('Enter: action');
      if (this.config.refreshData) helpTexts.push('r: refresh');
      helpTexts.push('q: exit');
    }
    helpTexts.push('↑↓: navigate');
    
    lines.push(theme.formatters.muted(helpTexts.join(' • ')));

    return lines.join('\n');
  }

  async handleInput(key: Key): Promise<void> {
    const state = this.state.getState() as TableState<T>;

    // Search mode
    if (state.searching) {
      await this.handleSearchInput(key);
      return;
    }

    // Start search
    if (key.name === '/' && this.config.search) {
      this.state.setState({ ...state, searching: true });
      return;
    }

    // Navigation
    if (key.name === 'up') {
      this.moveFocus(-1);
      return;
    }

    if (key.name === 'down') {
      this.moveFocus(1);
      return;
    }

    if (key.name === 'pageup') {
      this.moveFocus(-(this.config.pageSize || 10));
      return;
    }

    if (key.name === 'pagedown') {
      this.moveFocus(this.config.pageSize || 10);
      return;
    }

    if (key.name === 'home') {
      this.setFocus(0);
      return;
    }

    if (key.name === 'end') {
      this.setFocus(state.filteredData.length - 1);
      return;
    }

    // Selection
    if (this.config.selectable && key.name === 'space') {
      this.toggleSelection();
      return;
    }

    if (this.config.selectable === 'multiple' && key.name === 'a' && key.ctrl) {
      this.selectAll();
      return;
    }

    // Sorting
    if (this.config.sort && key.name === 's') {
      await this.showSortMenu();
      return;
    }

    // Submit/Select
    if (key.name === 'return' || key.name === 'enter') {
      // If onSelect is provided and we're in interactive mode or single selection
      if (this.config.onSelect && (this.config.interactive || this.config.selectable === 'single')) {
        const selected = state.filteredData[state.focusedIndex];
        if (selected) {
          try {
            // Show loading state
            this.state.setState({ ...state, status: 'processing' });
            await this.config.onSelect(selected);
            
            // If refreshData is provided, refresh the data
            if (this.config.refreshData) {
              await this.refreshTableData();
            } else {
              this.state.setState({ ...state, status: 'idle' });
            }
            
            // If not interactive mode, close after selection
            if (!this.config.interactive) {
              await this.submit(selected);
            }
          } catch (error) {
            this.state.setState({ 
              ...state, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Selection failed'
            });
          }
        }
      } else {
        // Original behavior when onSelect is not provided
        if (this.config.selectable === 'single') {
          const selected = state.filteredData[state.focusedIndex];
          if (selected) {
            await this.submit(selected);
          }
        } else if (this.config.selectable === 'multiple') {
          await this.submit(Array.from(state.selectedRows));
        } else {
          // Non-selectable table - just close
          await this.submit(state.filteredData as any);
        }
      }
      return;
    }
    
    // Refresh data (r key in interactive mode)
    if (this.config.interactive && this.config.refreshData && key.name === 'r') {
      await this.refreshTableData();
      return;
    }
    
    // Exit interactive mode (q key)
    if (this.config.interactive && key.name === 'q') {
      if (this.config.selectable === 'multiple') {
        await this.submit(Array.from(state.selectedRows));
      } else {
        await this.cancel();
      }
      return;
    }
  }

  private async handleSearchInput(key: Key): Promise<void> {
    const state = this.state.getState() as TableState<T>;

    if (key.name === 'escape') {
      // Exit search mode
      this.state.setState({ 
        ...state, 
        searching: false,
        searchQuery: '',
        filteredData: state.data
      });
      return;
    }

    if (key.name === 'return' || key.name === 'enter') {
      // Apply search
      this.state.setState({ ...state, searching: false });
      this.applyFilter();
      return;
    }

    if (key.name === 'backspace') {
      const newQuery = state.searchQuery.slice(0, -1);
      this.state.setState({ ...state, searchQuery: newQuery });
      if (newQuery === '') {
        this.state.setState({ ...state, filteredData: state.data });
      } else {
        this.applyFilter(newQuery);
      }
      return;
    }

    // Regular character input
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const newQuery = state.searchQuery + key.sequence;
      this.state.setState({ ...state, searchQuery: newQuery });
      this.applyFilter(newQuery);
    }
  }

  private renderHeader(state: TableState<T>): string {
    const { theme } = this.getRenderContext();
    const parts: string[] = [];
    
    // Row indicator column (2 chars)
    parts.push('  ');
    
    // Selection column
    if (this.config.selectable) {
      parts.push(' '); // Separator
      parts.push('   '); // Space for checkbox [ ] (3 chars)
    }

    // Data columns
    this.config.columns.forEach((column, index) => {
      parts.push(' │ '); // Column separator
      const width = column.width || 20;
      let label = column.label;
      
      // Add sort indicator
      if (state.sortColumn === column.key) {
        label += state.sortDirection === 'asc' ? ' ↑' : ' ↓';
      }
      
      const aligned = this.alignText(label, width, column.align || 'center');
      parts.push(aligned);
    });

    return parts.join('');
  }

  private renderSeparator(): string {
    const parts: string[] = [];
    
    // Row indicator column (2 chars)
    parts.push('──');
    
    // Selection column
    if (this.config.selectable) {
      parts.push('─'); // Separator
      parts.push('───'); // Match checkbox width (3 chars)
    }

    // Data columns
    this.config.columns.forEach((column, index) => {
      parts.push('─┼─'); // Column separator
      const width = column.width || 20;
      parts.push('─'.repeat(width));
    });

    return parts.join('');
  }

  private renderRow(row: T, isFocused: boolean, isSelected: boolean, state: TableState<T>): string {
    const { theme } = this.getRenderContext();
    const parts: string[] = [];
    
    // Row indicator (2 chars)
    const indicator = isFocused ? '▶ ' : '  ';
    parts.push(indicator);

    // Selection checkbox
    if (this.config.selectable) {
      parts.push(' '); // Separator
      const checkbox = isSelected ? '[✓]' : '[ ]';
      parts.push(checkbox);
    }

    // Data columns
    this.config.columns.forEach((column, index) => {
      parts.push(' │ '); // Column separator
      const value = (row as any)[column.key];
      const formatted = column.format ? column.format(value, row) : String(value ?? '');
      const width = column.width || 20;
      const aligned = this.alignText(formatted, width, column.align || 'left');
      parts.push(aligned);
    });

    const line = parts.join('');

    // Apply styling
    if (isFocused) {
      return theme.formatters.primary(line);
    } else if (isSelected) {
      return theme.formatters.success(line);
    } else {
      return line;
    }
  }

  private renderScrollBar(offset: number, pageSize: number, total: number): string {
    const { theme } = this.getRenderContext();
    const barLength = 20;
    const thumbSize = Math.max(1, Math.round((pageSize / total) * barLength));
    const thumbPosition = Math.round((offset / (total - pageSize)) * (barLength - thumbSize));
    
    let bar = '';
    for (let i = 0; i < barLength; i++) {
      if (i >= thumbPosition && i < thumbPosition + thumbSize) {
        bar += '█';
      } else {
        bar += '░';
      }
    }
    
    return theme.formatters.muted(`[${bar}]`);
  }

  private alignText(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
    // Get visual width accounting for Unicode and emojis
    const visualWidth = this.getVisualWidth(text);
    
    if (visualWidth > width) {
      // Truncate text while accounting for visual width
      const truncated = this.truncateText(text, width - 1);
      const truncatedWidth = this.getVisualWidth(truncated);
      const ellipsis = '…';
      return truncated + ellipsis + ' '.repeat(Math.max(0, width - truncatedWidth - 1));
    }
    
    const padding = width - visualWidth;
    
    switch (align) {
      case 'center':
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      
      case 'right':
        return ' '.repeat(padding) + text;
      
      default: // left
        return text + ' '.repeat(padding);
    }
  }

  private getVisualWidth(text: string): number {
    // Strip ANSI codes if any
    const stripped = text.replace(/\x1b\[[^m]*m/g, '');
    
    // Count visual width accounting for emojis and Unicode
    let width = 0;
    const chars = Array.from(stripped);
    
    for (const char of chars) {
      // Basic emoji and wide character detection
      const code = char.codePointAt(0);
      if (!code) continue;
      
      // Check for combining characters and zero-width characters
      if (
        (code >= 0x0300 && code <= 0x036F) || // Combining diacritical marks
        (code >= 0x1AB0 && code <= 0x1AFF) || // Combining diacritical marks extended
        (code >= 0x1DC0 && code <= 0x1DFF) || // Combining diacritical marks supplement
        (code >= 0x20D0 && code <= 0x20FF) || // Combining diacritical marks for symbols
        (code >= 0xFE00 && code <= 0xFE0F) || // Variation selectors
        (code >= 0xFE20 && code <= 0xFE2F) || // Combining half marks
        (code === 0x200B) || // Zero-width space
        (code === 0x200C) || // Zero-width non-joiner
        (code === 0x200D) || // Zero-width joiner
        (code === 0xFEFF)    // Zero-width no-break space
      ) {
        width += 0; // Zero-width characters
      } else if (
        (code >= 0x1F300 && code <= 0x1FAF8) || // Emojis
        (code >= 0x2600 && code <= 0x27BF) ||   // Misc symbols
        (code >= 0x2300 && code <= 0x23FF) ||   // Misc technical
        (code >= 0x2700 && code <= 0x27BF) ||   // Dingbats
        (code >= 0xFF00 && code <= 0xFFEF) ||   // Full-width forms
        (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK ideographs
        (code >= 0x3000 && code <= 0x303F) ||   // CJK symbols
        (code >= 0xAC00 && code <= 0xD7AF)      // Hangul syllables
      ) {
        width += 2; // Wide characters
      } else if (code >= 0x20 && code <= 0x7E) {
        width += 1; // ASCII printable
      } else if (code === 0x09) {
        width += 4; // Tab
      } else if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) {
        width += 0; // Control characters
      } else {
        width += 1; // Default
      }
    }
    
    return width;
  }

  private truncateText(text: string, maxWidth: number): string {
    if (maxWidth <= 0) return '';
    
    const chars = Array.from(text);
    let width = 0;
    let result = '';
    
    for (const char of chars) {
      const charWidth = this.getCharWidth(char);
      if (width + charWidth > maxWidth) break;
      width += charWidth;
      result += char;
    }
    
    return result;
  }
  
  private getCharWidth(char: string): number {
    const code = char.codePointAt(0);
    if (!code) return 0;
    
    // Check for combining characters and zero-width characters
    if (
      (code >= 0x0300 && code <= 0x036F) || // Combining diacritical marks
      (code >= 0x1AB0 && code <= 0x1AFF) || // Combining diacritical marks extended
      (code >= 0x1DC0 && code <= 0x1DFF) || // Combining diacritical marks supplement
      (code >= 0x20D0 && code <= 0x20FF) || // Combining diacritical marks for symbols
      (code >= 0xFE00 && code <= 0xFE0F) || // Variation selectors
      (code >= 0xFE20 && code <= 0xFE2F) || // Combining half marks
      (code === 0x200B) || // Zero-width space
      (code === 0x200C) || // Zero-width non-joiner
      (code === 0x200D) || // Zero-width joiner
      (code === 0xFEFF)    // Zero-width no-break space
    ) {
      return 0; // Zero-width characters
    } else if (
      (code >= 0x1F300 && code <= 0x1FAF8) || // Emojis
      (code >= 0x2600 && code <= 0x27BF) ||   // Misc symbols  
      (code >= 0x2300 && code <= 0x23FF) ||   // Misc technical
      (code >= 0x2700 && code <= 0x27BF) ||   // Dingbats
      (code >= 0x231A && code <= 0x231B) ||   // Watch  
      (code >= 0x23E9 && code <= 0x23F3) ||   // Hourglass and others
      (code >= 0x23F8 && code <= 0x23FA) ||   // Pause/stop/record
      (code >= 0x25AA && code <= 0x25AB) ||   // Small squares
      (code >= 0x25FB && code <= 0x25FE) ||   // Medium squares
      (code >= 0x2B1B && code <= 0x2B1C) ||   // Large squares
      (code >= 0x2B50 && code <= 0x2B55) ||   // Stars
      (code >= 0xFF00 && code <= 0xFFEF) ||   // Full-width forms
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK ideographs
      (code >= 0x3000 && code <= 0x303F) ||   // CJK symbols
      (code >= 0xAC00 && code <= 0xD7AF)      // Hangul syllables
    ) {
      return 2; // Wide characters
    } else if (code >= 0x20 && code <= 0x7E) {
      return 1; // ASCII printable
    } else if (code === 0x09) {
      return 4; // Tab
    } else if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) {
      return 0; // Control characters
    } else {
      return 1; // Default
    }
  }

  private moveFocus(delta: number): void {
    const state = this.state.getState() as TableState<T>;
    const newIndex = Math.max(0, Math.min(state.filteredData.length - 1, state.focusedIndex + delta));
    this.setFocus(newIndex);
  }

  private setFocus(index: number): void {
    const state = this.state.getState() as TableState<T>;
    const pageSize = this.config.pageSize || 10;
    
    // Update focused index
    this.state.setState({ ...state, focusedIndex: index });
    
    // Update scroll offset to keep focused item visible
    if (index < state.scrollOffset) {
      this.state.setState({ ...state, scrollOffset: index });
    } else if (index >= state.scrollOffset + pageSize) {
      this.state.setState({ ...state, scrollOffset: index - pageSize + 1 });
    }
  }

  private toggleSelection(): void {
    const state = this.state.getState() as TableState<T>;
    const row = state.filteredData[state.focusedIndex];
    
    if (!row) return;
    
    const newSelected = new Set(state.selectedRows);
    
    if (this.config.selectable === 'single') {
      // Single selection - clear others
      newSelected.clear();
      newSelected.add(row);
    } else {
      // Multiple selection - toggle
      if (newSelected.has(row)) {
        newSelected.delete(row);
      } else {
        newSelected.add(row);
      }
    }
    
    this.state.setState({ ...state, selectedRows: newSelected });
  }

  private selectAll(): void {
    const state = this.state.getState() as TableState<T>;
    const allSelected = state.selectedRows.size === state.filteredData.length;
    
    if (allSelected) {
      // Deselect all
      this.state.setState({ ...state, selectedRows: new Set() });
    } else {
      // Select all visible
      this.state.setState({ ...state, selectedRows: new Set(state.filteredData) });
    }
  }

  private applyFilter(query?: string): void {
    const state = this.state.getState() as TableState<T>;
    const searchQuery = query ?? state.searchQuery;
    
    if (!searchQuery) {
      this.state.setState({ ...state, filteredData: state.data });
      return;
    }
    
    let filtered: T[];
    
    if (this.config.filter) {
      // Use custom filter function
      filtered = state.data.filter(row => this.config.filter!(row, searchQuery));
    } else {
      // Default filter - search all string columns
      const lowerQuery = searchQuery.toLowerCase();
      filtered = state.data.filter(row => this.config.columns.some(column => {
          const value = (row as any)[column.key];
          return String(value ?? '').toLowerCase().includes(lowerQuery);
        }));
    }
    
    this.state.setState({ 
      ...state, 
      filteredData: filtered,
      focusedIndex: 0,
      scrollOffset: 0
    });
  }

  private async showSortMenu(): Promise<void> {
    // In a real implementation, this would show a submenu to select sort column
    // For now, cycle through columns
    const state = this.state.getState() as TableState<T>;
    const sortableColumns = Array.isArray(this.config.sort) 
      ? this.config.sort 
      : this.config.columns.map(c => c.key);
    
    const currentIndex = state.sortColumn ? sortableColumns.indexOf(state.sortColumn) : -1;
    const nextIndex = (currentIndex + 1) % sortableColumns.length;
    const nextColumn = sortableColumns[nextIndex];
    
    if (nextColumn) {
      // Toggle direction if same column
      const nextDirection = state.sortColumn === nextColumn && state.sortDirection === 'asc' ? 'desc' : 'asc';
      
      this.sortData(nextColumn, nextDirection);
    }
  }

  private sortData(column: string, direction: 'asc' | 'desc'): void {
    const state = this.state.getState() as TableState<T>;
    
    const sorted = [...state.filteredData].sort((a, b) => {
      const aVal = (a as any)[column];
      const bVal = (b as any)[column];
      
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      const result = aVal < bVal ? -1 : 1;
      return direction === 'asc' ? result : -result;
    });
    
    this.state.setState({
      ...state,
      filteredData: sorted,
      sortColumn: column,
      sortDirection: direction
    });
  }

  private async refreshTableData(): Promise<void> {
    if (!this.config.refreshData) return;
    
    const state = this.state.getState() as TableState<T>;
    
    try {
      this.state.setState({ ...state, status: 'processing' });
      
      // Get fresh data
      const newData = await this.config.refreshData();
      
      // Reapply filters and sorting
      let filteredData = newData;
      
      // Apply search filter if active
      if (state.searchQuery) {
        if (this.config.filter) {
          filteredData = newData.filter(row => this.config.filter!(row, state.searchQuery));
        } else {
          const lowerQuery = state.searchQuery.toLowerCase();
          filteredData = newData.filter(row => 
            this.config.columns.some(column => {
              const value = (row as any)[column.key];
              return String(value ?? '').toLowerCase().includes(lowerQuery);
            })
          );
        }
      }
      
      // Reapply sorting if active
      if (state.sortColumn) {
        filteredData = [...filteredData].sort((a, b) => {
          const aVal = (a as any)[state.sortColumn!];
          const bVal = (b as any)[state.sortColumn!];
          
          if (aVal === bVal) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          
          const result = aVal < bVal ? -1 : 1;
          return state.sortDirection === 'asc' ? result : -result;
        });
      }
      
      // Update state with new data
      this.state.setState({
        ...state,
        data: newData,
        filteredData,
        status: 'idle',
        error: undefined
      });
      
      // Update original data reference
      this.originalData = [...newData];
      
    } catch (error) {
      this.state.setState({
        ...state,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to refresh data'
      });
    }
  }

  protected override formatValue(value: T | T[]): string {
    if (Array.isArray(value)) {
      return `${value.length} rows selected`;
    }
    return 'Table data';
  }
}