/**
 * Interactive Table - Keyboard-navigable table with selection, sorting, and filtering
 */

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

import type { TableState, SelectionMode, InteractiveTableOptions } from './types.js';

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
      output: opts.output,
    };

    super(opts, false);

    this.tableOptions = tableOptions;
    this.tableState = createTableState(opts.data, tableOptions);
    this.value = [];

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
      }
    });
  }

  private registerKeyHandlers() {
    this.on('key', (char, key) => {
      // Filter mode - handle text input
      if (this.tableState.isFiltering) {
        if (key?.ctrl && char === 'u') {
          // Ctrl+U - clear filter input
          this.tableState = clearFilterInput(this.tableState, this.tableOptions);
        } else if (key?.name === 'backspace') {
          this.tableState = handleFilterBackspace(this.tableState, this.tableOptions);
        } else if (key?.name === 'escape') {
          this.tableState = exitFilterMode(this.tableState, this.tableOptions);
        } else if (char && char.length === 1 && !key?.ctrl && !key?.meta) {
          // Regular character input
          this.tableState = handleFilterInput(this.tableState, char, this.tableOptions);
        }
        return;
      }

      // Normal mode - handle commands
      switch (char) {
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
        case '/':
          // Enter filter mode (/)
          if (this.tableOptions.filterable) {
            this.tableState = enterFilterMode(this.tableState);
          }
          break;
        case 's':
          // Sort current column
          if (this.tableOptions.sortable && this.tableState.data.length > 0) {
            const firstColumn = this.tableOptions.columns[0];
            if (firstColumn) {
              this.tableState = toggleSort(this.tableState, String(firstColumn.key), this.tableOptions);
            }
          }
          break;
      }

      // Page navigation
      if (key?.name === 'pageup') {
        this.tableState = navigatePageUp(this.tableState);
      } else if (key?.name === 'pagedown') {
        this.tableState = navigatePageDown(this.tableState);
      } else if (key?.name === 'home') {
        this.tableState = navigateFirst(this.tableState);
      } else if (key?.name === 'end') {
        this.tableState = navigateLast(this.tableState);
      }
    });
  }

  private updateValue() {
    // Update the prompt value with selected rows
    this.value = Array.from(this.tableState.selected);
  }
}
