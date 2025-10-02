/**
 * Table component - Static table rendering for terminal
 */

import type { Readable, Writable } from 'node:stream';

import { renderTable } from './table-renderer.js';
import InteractiveTablePrompt from './interactive-table.js';
import { renderInteractiveTable } from './interactive-renderer.js';

import type { TableOptions, InteractiveTableOptions } from './types.js';

/**
 * Render a static table to the output stream
 *
 * @example
 * ```typescript
 * import { table } from '@xec-sh/kit';
 *
 * const data = [
 *   { id: 1, name: 'Alice', age: 30 },
 *   { id: 2, name: 'Bob', age: 25 },
 *   { id: 3, name: 'Charlie', age: 35 }
 * ];
 *
 * table({
 *   data,
 *   columns: [
 *     { key: 'id', header: 'ID', width: 5 },
 *     { key: 'name', header: 'Name', width: 20 },
 *     { key: 'age', header: 'Age', width: 5, align: 'right' }
 *   ],
 *   borders: 'rounded'
 * });
 * ```
 */
export function table<T = any>(options: TableOptions<T>): void {
  const output: Writable = options.output ?? process.stdout;

  // Validate options
  if (!options.data || !Array.isArray(options.data)) {
    throw new TypeError('Table data must be an array');
  }

  if (!options.columns || !Array.isArray(options.columns) || options.columns.length === 0) {
    throw new TypeError('Table must have at least one column');
  }

  // Set defaults
  const tableOptions: TableOptions<T> = {
    borders: 'single',
    compact: false,
    showHeader: true,
    showRowNumbers: false,
    alternateRows: false,
    width: 'full',
    wordWrap: 'truncate',
    alignment: 'left',
    ...options,
    output,
  };

  // Render and output
  const rendered = renderTable(options.data, tableOptions);
  output.write(rendered + '\n');
}

/**
 * Interactive table with keyboard navigation, selection, sorting, and filtering
 *
 * @example
 * ```typescript
 * import { interactiveTable, isCancel } from '@xec-sh/kit';
 *
 * const data = [
 *   { id: 1, name: 'Alice', age: 30, role: 'Developer' },
 *   { id: 2, name: 'Bob', age: 25, role: 'Designer' },
 *   { id: 3, name: 'Charlie', age: 35, role: 'Manager' }
 * ];
 *
 * const selected = await interactiveTable({
 *   data,
 *   columns: [
 *     { key: 'id', header: 'ID', width: 5 },
 *     { key: 'name', header: 'Name', sortable: true },
 *     { key: 'age', header: 'Age', sortable: true, align: 'right' },
 *     { key: 'role', header: 'Role' }
 *   ],
 *   selectable: 'multiple',
 *   sortable: true,
 *   filterable: true,
 *   borders: 'rounded'
 * });
 *
 * if (isCancel(selected)) {
 *   console.log('Cancelled');
 *   return;
 * }
 *
 * console.log(`Selected ${selected.length} items`);
 * ```
 */
export function interactiveTable<T = any>(
  options: Omit<InteractiveTableOptions<T>, 'output'> & {
    input?: Readable;
    output?: Writable;
    signal?: AbortSignal;
  }
): Promise<T[] | symbol> {
  // Validate options
  if (!options.data || !Array.isArray(options.data)) {
    throw new TypeError('Table data must be an array');
  }

  if (!options.columns || !Array.isArray(options.columns) || options.columns.length === 0) {
    throw new TypeError('Table must have at least one column');
  }

  return new InteractiveTablePrompt({
    data: options.data,
    columns: options.columns,
    selectable: options.selectable ?? 'none',
    sortable: options.sortable ?? false,
    filterable: options.filterable ?? false,
    pageSize: options.pageSize ?? 10,
    borders: options.borders ?? 'single',
    compact: options.compact ?? false,
    showHeader: options.showHeader ?? true,
    alternateRows: options.alternateRows ?? false,
    width: options.width ?? 'full',
    alignment: options.alignment ?? 'left',
    input: options.input,
    output: options.output,
    signal: options.signal,
    render() {
      return renderInteractiveTable(this.tableState, this.tableOptions);
    },
  }).prompt() as Promise<T[] | symbol>;
}

// Export caching utilities (Phase 4)
export {
  Cache,
  memoize,
  TableCache,
  getGlobalTableCache,
  resetGlobalTableCache,
} from './cache.js';
// Export table utilities (Phase 3)
export {
  exportToCSV,
  exportToTSV,
  exportToJSON,
  exportToText,
  exportToHTML,
  exportToMarkdown,
} from './table-exporter.js';

// Export streaming utilities (Phase 3)
export {
  batchAsync,
  loadChunked,
  streamToArray,
  arrayToStream,
  asyncIterableToArray,
  arrayToAsyncIterable,
} from './streaming.js';
// Export inline editing utilities (Phase 3)
export {
  saveEdit,
  exitEditMode,
  enterEditMode,
  isCellEditable,
  updateEditValue,
  getCurrentCellInfo,
  navigateToNextEditableColumn,
  navigateToPreviousEditableColumn,
} from './table-editor.js';

// Export error handling utilities (Phase 4)
export {
  TableError,
  safeExecute,
  formatError,
  isTableError,
  ErrorRecovery,
  safeExecuteAsync,
  createRenderError,
  createStreamError,
  isRecoverableError,
  createValidationError,
  createEditFailedError,
  createInvalidDataError,
  createExportFailedError,
  createColumnNotFoundError,
} from './errors.js';

export type { ExportOptions } from './table-exporter.js';
export type { CacheConfig, CacheStrategy } from './cache.js';

export type { StreamOptions, StreamProgress } from './streaming.js';
export type { TableErrorCode, TableErrorHandler } from './errors.js';

// Re-export types
export type {
  WordWrap,
  Alignment,
  TableState,
  SortColumn,
  TableColumn,
  TableFooter,
  BorderStyle,
  ColumnWidth,
  BorderChars,
  TableLayout,
  // Static table types
  TableOptions,
  ColumnLayout,
  SelectionMode,
  SortDirection,
  VirtualConfig,
  // Virtual table types (Phase 3)
  VirtualTableOptions,
  // Interactive table types
  InteractiveTableOptions,
} from './types.js';
