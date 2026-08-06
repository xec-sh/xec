export type {
  HSL, HSV, LAB, LCH, RGB, PrismOptions, PrismInstance, PrismUtilities,
} from './prism/index.js';
export {
  prism, strip, mixRgb, hasAnsi, hexToRgb, hslToRgb,
  hsvToRgb, labToRgb, lchToRgb, rgbToHex, rgbToHsl, rgbToHsv, rgbToLab,
  rgbToLch, luminance, ColorLevel, parseColor, createPrism, getCssColor, stderrColor, stdoutColor, PrismBuilder,
  isValidColor, stringLength, contrastRatio, isColorEnabled, getCssColorNames, createPrismStderr, getBestColorMethod,
} from './prism/index.js';
// Export all prompts
export { text } from './prompts/text.js';
export { date } from './prompts/date.js';
export { group } from './prompts/group.js';
export type { TextOptions } from './prompts/text.js';

export type { DateFormat, DateOptions } from './prompts/date.js';
export type { PromptGroup, PromptGroupOptions, PromptGroupAwaitedReturn } from './prompts/group.js';
// Export all utilities
export { log } from './utilities/log.js';
export type { LogMessageOptions } from './utilities/log.js';
export type { Option, SelectOptions } from './prompts/select.js';
export { select, SELECT_INSTRUCTIONS } from './prompts/select.js';
// Export all components
export { box } from './components/box.js';
export { path } from './utilities/path.js';
export { note } from './components/note.js';
export { tasks } from './components/task.js';
export { confirm } from './prompts/confirm.js';
export { stream } from './utilities/stream.js';
export type { Task } from './components/task.js';
export { password } from './prompts/password.js';
export { taskLog } from './components/task-log.js';
export { selectKey } from './prompts/select-key.js';
export { multiline } from './prompts/multi-line.js';
export type { PathOptions } from './utilities/path.js';

export type { NoteOptions } from './components/note.js';
export { progress } from './components/progress-bar.js';
export type { ConfirmOptions } from './prompts/confirm.js';
export type { CommonOptions } from './utilities/common.js';
export { limitOptions } from './utilities/limit-options.js';
export type { PasswordOptions } from './prompts/password.js';
export { intro, outro, cancel } from './utilities/messages.js';
export type { SelectKeyOptions } from './prompts/select-key.js';
export type { MultiLineOptions } from './prompts/multi-line.js';
export { spinner, SPINNER_FRAMES } from './components/spinner.js';

export { groupMultiselect } from './prompts/group-multi-select.js';
export type { BoxOptions, BoxAlignment } from './components/box.js';
export type { MultiSelectOptions } from './prompts/multi-select.js';
export { table, interactiveTable } from './components/table/index.js';
export type { LimitOptionsParams } from './utilities/limit-options.js';
export type { GroupMultiSelectOptions } from './prompts/group-multi-select.js';
export { multiselect, MULTISELECT_INSTRUCTIONS } from './prompts/multi-select.js';
export { autocomplete, autocompleteMultiselect } from './prompts/autocomplete.js';
export type { ProgressResult, ProgressOptions } from './components/progress-bar.js';
export type { SpinnerResult, SpinnerOptions, SpinnerFrameStyle } from './components/spinner.js';
export type {
  AutocompleteOptions, AutocompleteMultiSelectOptions,
} from './prompts/autocomplete.js';
export type {
  TaskLogOptions, TaskLogMessageOptions, TaskLogCompletionOptions,
} from './components/task-log.js';
export {
  isCI, S_BAR, isTTY, S_INFO, S_WARN, symbol, S_BAR_H,
  S_ERROR, unicode, S_BAR_END, S_SUCCESS,
  symbolBar, unicodeOr, S_BAR_START, S_STEP_ERROR, computeLabel,
  S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_SUBMIT, S_CONNECT_LEFT, S_RADIO_ACTIVE, S_BAR_END_RIGHT,
  S_PASSWORD_MASK, S_RADIO_INACTIVE, S_BAR_START_RIGHT, S_CHECKBOX_ACTIVE, S_CORNER_TOP_LEFT, S_CORNER_TOP_RIGHT, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED,
  S_CORNER_BOTTOM_LEFT, S_CORNER_BOTTOM_RIGHT, formatInstructionFooter,
} from './utilities/common.js';

// Export core functionality
export {
  block,
  getRows,
  isCancel,
  settings,
  getColumns,
  findCursor,
  CANCEL_SYMBOL,
  runValidation,
  DEFAULT_THEME,
  type Validate,
  type KitTheme,
  updateSettings,
  type DateParts,
  type ClackSettings,
  type DateFormatConfig,
  type StandardSchemaV1,
} from './core/index.js';

// Export table types
export type {
  WordWrap,
  Alignment,
  TableState,
  TableColumn,
  BorderStyle,
  TableOptions,
  ExportOptions,
  StreamOptions,
  SelectionMode,
  SortDirection,
  StreamProgress,
  TableErrorCode,
  TableErrorHandler,
  VirtualTableOptions,
  InteractiveTableOptions,
} from './components/table/index.js';

// Export table error utilities (Phase 4)
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
