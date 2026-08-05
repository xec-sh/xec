/**
 * Interactive Table - Keyboard-navigable table with selection, sorting,
 * filtering, inline editing and incremental loading
 */

import type { Key } from 'node:readline';
import type {
  TableState,
  SortColumn,
  TableColumn,
  TableFooter,
  SelectionMode,
  SortDirection,
  VirtualTableOptions,
} from './types.js';

import { toggleSort } from './table-sorter.js';
import { updateStateData, createTableState } from './table-state.js';
import Prompt, { type PromptOptions } from '../../core/prompts/prompt.js';
import {
  selectAll,
  clearSelection,
  toggleSelection,
} from './table-selector.js';
import {
  saveEdit,
  exitEditMode,
  enterEditMode,
  updateEditValue,
} from './table-editor.js';
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
  columns: VirtualTableOptions<T>['columns'];
  selectable?: SelectionMode;
  sortable?: boolean;
  filterable?: boolean;
  pageSize?: number;
  borders?: VirtualTableOptions<T>['borders'];
  compact?: boolean;
  showHeader?: boolean;
  showRowNumbers?: boolean;
  alternateRows?: boolean;
  width?: VirtualTableOptions<T>['width'];
  maxHeight?: number;
  alignment?: VirtualTableOptions<T>['alignment'];
  message?: string;
  navigable?: boolean;
  initialSelection?: T[];
  initialSort?: SortColumn;
  filterPlaceholder?: string;
  filterColumns?: string[];
  customFilter?: (row: T, query: string) => boolean;
  headerStyle?: (text: string) => string;
  cellStyle?: (text: string, row: T, column: TableColumn<T>) => string;
  footer?: string | TableFooter<T>;
  onSelect?: (rows: T[]) => void;
  onNavigate?: (row: T, index: number) => void;
  onSort?: (column: string, direction: SortDirection) => void;
  onFilter?: (query: string) => void;
  editable?: boolean;
  validateEdit?: (row: T, column: string, newValue: any) => string | undefined;
  onEdit?: (row: T, column: string, oldValue: any, newValue: any) => void;
  editableColumns?: string[];
  loadMore?: () => Promise<T[]>;
  hasMore?: boolean;
  loadingIndicator?: string | (() => string);
}

export default class InteractiveTablePrompt<T> extends Prompt<T[]> {
  tableState: TableState<T>;
  tableOptions: VirtualTableOptions<T>;

  constructor(opts: InteractiveTablePromptOptions<T>) {
    // Build table options first. `maxHeight` caps the scroll window: the
    // interactive table has no overflow indicator row, the window itself is
    // the viewport.
    const pageSize = Math.max(
      1,
      Math.min(opts.pageSize ?? 10, opts.maxHeight ?? Number.MAX_SAFE_INTEGER)
    );
    const tableOptions: VirtualTableOptions<T> = {
      data: opts.data,
      columns: opts.columns,
      selectable: opts.selectable ?? 'none',
      sortable: opts.sortable ?? false,
      filterable: opts.filterable ?? false,
      pageSize,
      borders: opts.borders ?? 'single',
      compact: opts.compact ?? false,
      showHeader: opts.showHeader ?? true,
      showRowNumbers: opts.showRowNumbers ?? false,
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
      footer: opts.footer,
      onSelect: opts.onSelect,
      onNavigate: opts.onNavigate,
      onSort: opts.onSort,
      onFilter: opts.onFilter,
      editable: opts.editable ?? false,
      validateEdit: opts.validateEdit,
      onEdit: opts.onEdit,
      editableColumns: opts.editableColumns,
      loadMore: opts.loadMore,
      hasMore: opts.hasMore ?? false,
      loadingIndicator: opts.loadingIndicator,
      output: opts.output,
    };

    super(opts, false);

    this.tableOptions = tableOptions;
    this.tableState = {
      ...createTableState(opts.data, tableOptions),
      hasMore: Boolean(tableOptions.hasMore && tableOptions.loadMore),
    };
    // Start from the initial selection so submitting right away returns it
    this.value = Array.from(this.tableState.selected);

    // Register event handlers
    this.registerCursorHandlers();
    this.registerKeyHandlers();

    // A dataset shorter than the window may need a first batch before any
    // navigation happens
    this.#maybeLoadMore();
  }

  /**
   * In filter mode Enter applies the filter and returns to normal mode;
   * in edit mode it commits the cell. Only plain normal-mode Enter submits.
   */
  protected override _shouldSubmit(_char: string | undefined, _key: Key): boolean {
    if (this.tableState.isFiltering) {
      this.tableState = exitFilterMode(this.tableState, this.tableOptions);
      return false;
    }
    if (this.tableState.isEditing) {
      this.#commitEdit();
      return false;
    }
    return true;
  }

  /**
   * Escape leaves filter or edit mode instead of cancelling the prompt.
   * Ctrl+C (and any other cancel alias) still cancels from anywhere.
   */
  protected override _shouldCancel(_char: string | undefined, key: Key): boolean {
    if (key?.name !== 'escape') {
      return true;
    }
    if (this.tableState.isFiltering) {
      this.tableState = exitFilterMode(this.tableState, this.tableOptions);
      return false;
    }
    if (this.tableState.isEditing) {
      this.tableState = { ...exitEditMode(this.tableState), error: undefined };
      return false;
    }
    return true;
  }

  private registerCursorHandlers() {
    this.on('cursor', (key) => {
      // Modal sub-states consume their own keys
      if (this.tableState.isFiltering || this.tableState.isEditing) {
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
          this.#moveColumn(-1);
          break;
        case 'right':
          this.#moveColumn(1);
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
      this.#maybeLoadMore();
    });
  }

  private registerKeyHandlers() {
    this.on('key', (char, key) => {
      // Filter mode - handle text input
      if (this.tableState.isFiltering) {
        // Enter and Escape transitions live in _shouldSubmit/_shouldCancel,
        // which run after this handler — swallowing them here would leave
        // stale mode state for those hooks (and Enter's `\r` would land in
        // the query)
        if (key?.name === 'return' || key?.name === 'escape') {
          return;
        }
        const prevQuery = this.tableState.filterQuery;
        if (key?.ctrl && key.name === 'u') {
          // Ctrl+U - clear filter input (control chars arrive as raw
          // sequences in `char`, so match on key.name)
          this.tableState = clearFilterInput(this.tableState, this.tableOptions);
        } else if (key?.name === 'backspace') {
          this.tableState = handleFilterBackspace(this.tableState, this.tableOptions);
        } else if (char && char.length === 1 && !key?.ctrl && !key?.meta) {
          // Regular character input
          this.tableState = handleFilterInput(this.tableState, char, this.tableOptions);
        }
        if (this.tableState.filterQuery !== prevQuery && this.tableOptions.onFilter) {
          this.tableOptions.onFilter(this.tableState.filterQuery);
        }
        return;
      }

      // Edit mode - handle text input into the edit buffer. Any edit clears
      // a previous validation error; commit/cancel live in the hooks.
      if (this.tableState.isEditing) {
        if (key?.name === 'return' || key?.name === 'escape') {
          return;
        }
        if (key?.ctrl && key.name === 'u') {
          this.tableState = { ...updateEditValue(this.tableState, ''), error: undefined };
        } else if (key?.name === 'backspace') {
          this.tableState = {
            ...updateEditValue(this.tableState, this.tableState.editValue.slice(0, -1)),
            error: undefined,
          };
        } else if (char && char.length === 1 && !key?.ctrl && !key?.meta) {
          this.tableState = {
            ...updateEditValue(this.tableState, this.tableState.editValue + char),
            error: undefined,
          };
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
        case 'e':
          // Edit the focused cell
          if (!key?.ctrl && this.tableOptions.editable) {
            this.tableState = { ...enterEditMode(this.tableState, this.tableOptions), error: undefined };
          }
          break;
        case 'f':
          // Enter filter mode (Ctrl+F)
          if (key?.ctrl && this.tableOptions.filterable) {
            this.tableState = enterFilterMode(this.tableState);
          }
          break;
        case 's':
          // Sort the focused column (←/→ move the focus)
          if (!key?.ctrl && this.tableOptions.sortable && this.tableState.data.length > 0) {
            const column = this.tableOptions.columns[this.tableState.focusedColumn];
            if (column) {
              this.tableState = toggleSort(this.tableState, String(column.key), this.tableOptions);
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
      this.#maybeLoadMore();
    });
  }

  /**
   * Move the focused column (the target of `s` and `e`). Clamped like the
   * vertical navigation, and only meaningful when a column-scoped action
   * exists.
   */
  #moveColumn(delta: number) {
    if (!this.tableOptions.sortable && !this.tableOptions.editable) {
      return;
    }
    const count = this.tableOptions.columns.length;
    const next = Math.max(0, Math.min(count - 1, this.tableState.focusedColumn + delta));
    if (next !== this.tableState.focusedColumn) {
      this.tableState = { ...this.tableState, focusedColumn: next };
    }
  }

  /**
   * Commit the edit buffer. `saveEdit` replaces the row object, so the
   * selection set and the submit value must be re-pointed at the new row —
   * otherwise submitting after an edit would return the pre-edit data.
   */
  #commitEdit() {
    const oldRow = this.tableState.data[this.tableState.focusedRow];
    const next = saveEdit(this.tableState, this.tableOptions);
    this.tableState = next;
    if (next.isEditing || oldRow === undefined) {
      return; // validation rejected the edit (or there was nothing to edit)
    }
    const newRow = next.data[this.tableState.focusedRow];
    if (newRow !== undefined && newRow !== oldRow && next.selected.has(oldRow)) {
      const selected = new Set(next.selected);
      selected.delete(oldRow);
      selected.add(newRow);
      this.tableState = { ...next, selected };
    }
    this.value = Array.from(this.tableState.selected);
  }

  /**
   * Fetch the next batch when navigation is within one page of the end of
   * the loaded rows. Resolved rows are appended to the original data and
   * filter/sort re-applied; an empty batch marks the dataset complete.
   */
  #maybeLoadMore() {
    const { loadMore } = this.tableOptions;
    const state = this.tableState;
    if (!loadMore || !state.hasMore || state.isLoading) {
      return;
    }
    if (state.focusedRow < state.data.length - state.pageSize) {
      return;
    }

    this.tableState = { ...state, isLoading: true };
    loadMore().then(
      (rows) => {
        const current = this.tableState;
        if (rows.length === 0) {
          this.tableState = { ...current, isLoading: false, hasMore: false };
        } else {
          const next = updateStateData(
            {
              ...current,
              isLoading: false,
              originalData: [...current.originalData, ...rows],
            },
            this.tableOptions
          );
          // The scroll window keeps its position but must grow to cover the
          // new rows — a window computed over a short initial dataset would
          // otherwise leave the appended rows invisible
          const rangeStart = next.visibleRange[0];
          this.tableState = {
            ...next,
            visibleRange: [rangeStart, Math.min(rangeStart + next.pageSize, next.data.length)],
          };
        }
        this.#repaint();
      },
      (error: unknown) => {
        this.tableState = {
          ...this.tableState,
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        };
        this.#repaint();
      }
    );
  }

  /**
   * Repaint after an async state change. Skipped before the first frame
   * (prompt() renders it with the fresh state anyway) and after the prompt
   * settled — writing into a closed prompt would corrupt the terminal.
   */
  #repaint() {
    if (this.state === 'submit' || this.state === 'cancel' || this.state === 'initial') {
      return;
    }
    this.render();
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
