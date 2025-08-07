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
    lines.push(this.renderSeparator());

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

    // Submit
    if (key.name === 'return' || key.name === 'enter') {
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

    // Selection column
    if (this.config.selectable) {
      parts.push('  '); // Space for checkbox
    }

    // Data columns
    this.config.columns.forEach(column => {
      const width = column.width || 20;
      let label = column.label;
      
      // Add sort indicator
      if (state.sortColumn === column.key) {
        label += state.sortDirection === 'asc' ? ' ↑' : ' ↓';
      }
      
      const aligned = this.alignText(label, width, column.align || 'left');
      parts.push(aligned);
    });

    return parts.join(' │ ');
  }

  private renderSeparator(): string {
    const parts: string[] = [];

    if (this.config.selectable) {
      parts.push('──');
    }

    this.config.columns.forEach(column => {
      const width = column.width || 20;
      parts.push('─'.repeat(width));
    });

    return parts.join('─┼─');
  }

  private renderRow(row: T, isFocused: boolean, isSelected: boolean, state: TableState<T>): string {
    const { theme } = this.getRenderContext();
    const parts: string[] = [];

    // Selection indicator
    if (this.config.selectable) {
      const checkbox = isSelected ? '[✓]' : '[ ]';
      parts.push(checkbox);
    }

    // Data columns
    this.config.columns.forEach(column => {
      const value = (row as any)[column.key];
      const formatted = column.format ? column.format(value, row) : String(value ?? '');
      const width = column.width || 20;
      const aligned = this.alignText(formatted, width, column.align || 'left');
      parts.push(aligned);
    });

    const line = parts.join(' │ ');

    // Apply styling
    if (isFocused) {
      return theme.formatters.primary('▶ ' + line);
    } else if (isSelected) {
      return theme.formatters.success('  ' + line);
    } else {
      return '  ' + line;
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

  private alignText(text: string, width: number, align: 'left' | 'center' | 'right'): string {
    if (text.length > width) {
      return text.substring(0, width - 3) + '...';
    }
    
    const padding = width - text.length;
    
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

  protected override formatValue(value: T | T[]): string {
    if (Array.isArray(value)) {
      return `${value.length} rows selected`;
    }
    return 'Table data';
  }
}