/**
 * Interactive Table - Keyboard-navigable table with selection, sorting, and filtering
 */

import type {
  TableState,
  SortColumn,
  TableColumn,
  SelectionMode,
  SortDirection,
  InteractiveTableOptions,
} from './types.js';

import { toggleSort } from './table-sorter.js';
import { createTableState } from './table-state.js';
import Prompt, { type PromptOptions } from '../../core/prompts/prompt.js';
import {
  selectAll,
  clearSelection,
  toggleSelection,
} from './table-selector.js';
import {
  exitFilterMode,
  enterFilterMode,
  clearFilterInput,
  handleFilterInput,
  handleFilterBackspace,
} from './table-filter.js';
import {
  navigateUp,
  navigateDown,
  navigateLast,
  navigateFirst,
  navigatePageUp,
  navigatePageDown,
} from './table-navigator.js';

interface InteractiveTablePromptOptions<T>
  extends PromptOptions<T[], InteractiveTablePrompt<T>> {
  data: T[];
  columns: InteractiveTableOptions<T>['columns'];
  selectable?: SelectionMode;
  sortable?: boolean;
  filterable?: boolean;
  pageSize?: number;
  borders?: InteractiveTableOptions<T>['borders'];
  compact?: boolean;
  showHeader?: boolean;
  alternateRows?: boolean;
  width?: InteractiveTableOptions<T>['width'];
  alignment?: InteractiveTableOptions<T>['alignment'];
  message?: string;
  navigable?: boolean;
  initialSelection?: T[];
  initialSort?: SortColumn;
  filterPlaceholder?: string;
  filterColumns?: string[];
  customFilter?: (row: T, query: string) => boolean;
  headerStyle?: (text: string) => string;
  cellStyle?: (text: string, row: T, column: TableColumn<T>) => string;
  onSelect?: (rows: T[]) => void;
  onNavigate?: (row: T, index: number) => void;
  onSort?: (column: string, direction: SortDirection) => void;
  onFilter?: (query: string) => void;
}

export default class InteractiveTablePrompt<T> extends Prompt<T[]> {
  tableState: TableState<T>;
  tableOptions: InteractiveTableOptions<T>;

  constructor(opts: InteractiveTablePromptOptions<T>) {
    // Build table options first
    const tableOptions: InteractiveTableOptions<T> = {
      data: opts.data,
      columns: opts.columns,
      selectable: opts.selectable ?? 'none',
      sortable: opts.sortable ?? false,
      filterable: opts.filterable ?? false,
      pageSize: opts.pageSize ?? 10,
      borders: opts.borders ?? 'single',
      compact: opts.compact ?? false,
      showHeader: opts.showHeader ?? true,
      alternateRows: opts.alternateRows ?? false,
      width: opts.width ?? 'full',
      alignment: opts.alignment ?? 'left',
      message: opts.message,
      navigable: opts.navigable,
      initialSelection: opts.initialSelection,
      initialSort: opts.initialSort,
      filterPlaceholder: opts.filterPlaceholder,
      filterColumns: opts.filterColumns,
      customFilter: opts.customFilter,
      headerStyle: opts.headerStyle,
      cellStyle: opts.cellStyle,
      onSelect: opts.onSelect,
      onNavigate: opts.onNavigate,
      onSort: opts.onSort,
      onFilter: opts.onFilter,
      output: opts.output,
    };

    super(opts, false);

    this.tableOptions = tableOptions;
    this.tableState = createTableState(opts.data, tableOptions);
    // Start from the initial selection so submitting right away returns it
    this.value = Array.from(this.tableState.selected);

    // Register event handlers
    this.registerCursorHandlers();
    this.registerKeyHandlers();
  }

  private registerCursorHandlers() {
    this.on('cursor', (key) => {
      // If in filter mode, only Escape is handled by cursor
      if (this.tableState.isFiltering) {
        // Filter mode handled by key event handlers
        return;
      }

      const prevRow = this.tableState.focusedRow;

      // Navigation keys
      switch (key) {
        case 'up':
          this.tableState = navigateUp(this.tableState);
          break;
        case 'down':
          this.tableState = navigateDown(this.tableState);
          break;
        case 'left':
          // Future: horizontal scrolling
          break;
        case 'right':
          // Future: horizontal scrolling
          break;
        case 'space':
          if (this.tableOptions.selectable === 'single' || this.tableOptions.selectable === 'multiple') {
            this.tableState = toggleSelection(this.tableState, this.tableOptions.selectable);
            this.updateValue();
          }
          break;
        // no default
      }

      this.notifyNavigate(prevRow);
    });
  }

  private registerKeyHandlers() {
    this.on('key', (char, key) => {
      // Filter mode - handle text input
      if (this.tableState.isFiltering) {
        const prevQuery = this.tableState.filterQuery;
        if (key?.ctrl && key.name === 'u') {
          // Ctrl+U - clear filter input (control chars arrive as raw
          // sequences in `char`, so match on key.name)
          this.tableState = clearFilterInput(this.tableState, this.tableOptions);
        } else if (key?.name === 'backspace') {
          this.tableState = handleFilterBackspace(this.tableState, this.tableOptions);
        } else if (key?.name === 'escape') {
          this.tableState = exitFilterMode(this.tableState, this.tableOptions);
        } else if (char && char.length === 1 && !key?.ctrl && !key?.meta) {
          // Regular character input
          this.tableState = handleFilterInput(this.tableState, char, this.tableOptions);
        }
        if (this.tableState.filterQuery !== prevQuery && this.tableOptions.onFilter) {
          this.tableOptions.onFilter(this.tableState.filterQuery);
        }
        return;
      }

      // Normal mode - handle commands. Letter commands match on key.name,
      // which stays lowercase regardless of Shift/Caps Lock — the key event's
      // char keeps its original casing (upstream #534).
      switch (key?.name) {
        case 'a':
          // Select all (if Ctrl+A)
          if (key?.ctrl && this.tableOptions.selectable === 'multiple') {
            this.tableState = selectAll(this.tableState);
            this.updateValue();
          }
          break;
        case 'c':
          // Clear selection
          if (key?.ctrl && this.tableOptions.selectable !== 'none') {
            this.tableState = clearSelection(this.tableState);
            this.updateValue();
          }
          break;
        case 'f':
          // Enter filter mode (Ctrl+F)
          if (key?.ctrl && this.tableOptions.filterable) {
            this.tableState = enterFilterMode(this.tableState);
          }
          break;
        case 's':
          // Sort current column
          if (!key?.ctrl && this.tableOptions.sortable && this.tableState.data.length > 0) {
            const firstColumn = this.tableOptions.columns[0];
            if (firstColumn) {
              this.tableState = toggleSort(this.tableState, String(firstColumn.key), this.tableOptions);
              const sort = this.tableState.sort;
              if (sort && this.tableOptions.onSort) {
                this.tableOptions.onSort(sort.key, sort.direction);
              }
            }
          }
          break;
        // no default
      }
      if (char === '/' && this.tableOptions.filterable) {
        // Enter filter mode (/)
        this.tableState = enterFilterMode(this.tableState);
      }

      // Page navigation
      const prevRow = this.tableState.focusedRow;
      if (key?.name === 'pageup') {
        this.tableState = navigatePageUp(this.tableState);
      } else if (key?.name === 'pagedown') {
        this.tableState = navigatePageDown(this.tableState);
      } else if (key?.name === 'home') {
        this.tableState = navigateFirst(this.tableState);
      } else if (key?.name === 'end') {
        this.tableState = navigateLast(this.tableState);
      }
      this.notifyNavigate(prevRow);
    });
  }

  private notifyNavigate(prevRow: number) {
    const state = this.tableState;
    if (state.focusedRow === prevRow || !this.tableOptions.onNavigate) {
      return;
    }
    const row = state.data[state.focusedRow];
    if (row !== undefined) {
      this.tableOptions.onNavigate(row, state.focusedRow);
    }
  }

  private updateValue() {
    // Update the prompt value with selected rows
    this.value = Array.from(this.tableState.selected);
    if (this.tableOptions.onSelect) {
      this.tableOptions.onSelect(this.value);
    }
  }
}
