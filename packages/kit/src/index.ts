export * from './prism/index.js';
// Export all prompts
export * from './prompts/text.js';

export * from './prompts/group.js';
// Export all utilities
export * from './utilities/log.js';
export * from './prompts/select.js';
// Export all components
export * from './components/box.js';
export * from './utilities/path.js';
export * from './prompts/confirm.js';
export * from './components/note.js';
export * from './components/task.js';
export * from './prompts/password.js';

export * from './utilities/common.js';
export * from './utilities/stream.js';
export * from './prompts/select-key.js';
export * from './components/spinner.js';
export * from './utilities/messages.js';
export * from './components/task-log.js';

export * from './prompts/multi-select.js';
export * from './prompts/autocomplete.js';
export * from './components/progress-bar.js';
export * from './utilities/limit-options.js';
export * from './prompts/group-multi-select.js';
export { table, interactiveTable } from './components/table/index.js';

// Export core functionality
export {
  block,
  getRows,
  isCancel,
  settings,
  getColumns,
  updateSettings,
  type ClackSettings,
} from './core/index.js';

// Export table optimization utilities (Phase 4)
export {
  Cache,
  memoize,
  TableError,
  TableCache,
  safeExecute,
  formatError,
  isTableError,
  ErrorRecovery,
  safeExecuteAsync,
  createRenderError,
  createStreamError,
  isRecoverableError,
  getGlobalTableCache,
  createValidationError,
  createEditFailedError,
  resetGlobalTableCache,
  createInvalidDataError,
  createExportFailedError,
  createColumnNotFoundError,
} from './components/table/index.js';

// Export table utilities (Phase 3)
export {
  saveEdit,
  batchAsync,
  exportToCSV,
  exportToTSV,
  loadChunked,
  exportToJSON,
  exportToText,
  exportToHTML,
  exitEditMode,
  streamToArray,
  arrayToStream,
  enterEditMode,
  isCellEditable,
  updateEditValue,
  exportToMarkdown,
  getCurrentCellInfo,
  asyncIterableToArray,
  arrayToAsyncIterable,
  navigateToNextEditableColumn,
  navigateToPreviousEditableColumn,
} from './components/table/index.js';

// Export table types
export type {
  WordWrap,
  Alignment,
  TableState,
  TableColumn,
  CacheConfig,
  BorderStyle,
  TableOptions,
  ExportOptions,
  StreamOptions,
  CacheStrategy,
  SelectionMode,
  SortDirection,
  VirtualConfig,
  StreamProgress,
  TableErrorCode,
  TableErrorHandler,
  VirtualTableOptions,
  InteractiveTableOptions,
} from './components/table/index.js';
