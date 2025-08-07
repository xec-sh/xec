// @xec-sh/kit - Modern CLI interaction library

// =============================================================================
// Core Components and Utilities
// =============================================================================

// TypeScript utilities
export * from './utils/types.js';
export { log } from './utils/log.js';
// Plugin system
export { PluginRegistry } from './plugins/registry.js';

// =============================================================================
// Phase 1: Essential Components
// =============================================================================

export { emojiPlugin } from './plugins/emoji-plugin.js';
export { backSymbol, cancelSymbol } from './core/types.js';
export { ComponentExplorer } from './dev-tools/component-explorer.js';

// Core infrastructure
export { StreamHandler, type StreamHandlerOptions } from './core/stream-handler.js';
export { StreamHandlerFactory } from './core/stream-handler-factory.js';
// Primitive components
export { TextPrompt, type TextOptions } from './components/primitives/text.js';
// Developer tools
export { 
  debug, 
  DebugLevel, 
  DebugManager 
} from './dev-tools/debug.js';
export { NumberPrompt, type NumberOptions } from './components/primitives/number.js';

export { ConfirmPrompt, type ConfirmOptions } from './components/primitives/confirm.js';
export { PasswordPrompt, type PasswordOptions } from './components/primitives/password.js';
// Feedback components
export { 
  Spinner, 
  spinner, 
  type SpinnerOptions 
} from './components/feedback/spinner.js';

// =============================================================================
// Phase 2: Advanced Components
// =============================================================================

export { SelectPrompt, type SelectOption, type SelectOptions } from './components/primitives/select.js';
export { 
  TablePrompt, 
  type TableColumn, 
  type TableOptions 
} from './components/advanced/table.js';
export { 
  panel, 
  PanelPrompt, 
  type PanelAction, 
  type PanelOptions 
} from './components/layout/panel.js';
export { 
  wizard, 
  WizardPrompt, 
  type WizardPage, 
  type WizardOptions 
} from './components/layout/wizard.js';

export { 
  FormPrompt, 
  type FormStep, 
  type FormField, 
  type FormOptions 
} from './components/advanced/form.js';
export { 
  type FileInfo, 
  FilePickerPrompt, 
  type FilePickerOptions 
} from './components/advanced/file-picker.js';
export { 
  columns, 
  ColumnsPrompt, 
  type ColumnPane, 
  type ColumnsOptions 
} from './components/layout/columns.js';
export { MultiSelectPrompt, type MultiSelectOption, type MultiSelectOptions } from './components/primitives/multiselect.js';

// =============================================================================
// Phase 3: Developer Experience
// =============================================================================

// Advanced interactive components
export { 
  AutocompletePrompt, 
  type AutocompleteOption, 
  type AutocompleteOptions 
} from './components/advanced/autocomplete.js';

export { 
  TaskList, 
  taskList, 
  type Task, 
  type TaskInstance, 
  type TaskListOptions 
} from './components/feedback/task-list.js';
// Layout components
export { 
  group, 
  GroupPrompt, 
  type GroupConfig, 
  type GroupOptions, 
  type GroupPromptItem 
} from './components/layout/group.js';
// Advanced interactions
export { 
  type Command, 
  CommandPalette, 
  commandPalette, 
  type CommandGroup, 
  type CommandPaletteOptions 
} from './components/advanced/command-palette.js';

export { 
  withHelp,
  createHelp,
  type WithHelp,
  ContextualHelp,
  type HelpContent,
  renderMarkdownHelp,
  type ContextualHelpOptions
} from './utils/contextual-help.js';
// Performance optimizations
export {
  RenderBatcher,
  MemoryManager,
  VirtualScroller,
  DatasetOptimizer,
  PerformanceMonitor,
  DynamicVirtualScroller,
  type VirtualScrollOptions
} from './utils/performance.js';
export { 
  Progress, 
  progress, 
  MultiProgress, 
  multiProgress, 
  type ProgressTask, 
  type ProgressOptions, 
  type MultiProgressOptions 
} from './components/feedback/progress.js';
// Reactive system
export { 
  memo,
  watch,
  derived,
  reactive,
  computed,
  watchMany,
  validators,
  ReactiveState,
  asyncComputed,
  ReactivePrompt,
  computedValues,
  ReactiveValidator
} from './core/reactive/index.js';

// =============================================================================
// Phase 4: Advanced Features
// =============================================================================

export {
  MouseMode,
  type Region,
  MouseSupport,
  TerminalMouse,
  type MouseEvent,
  withMouseSupport,
  type MousePosition,
  type WithMouseSupport,
  type MouseSupportOptions
} from './utils/mouse-support.js';
export {
  type Shortcut,
  mergeShortcuts,
  SHORTCUT_SCHEMES,
  type ShortcutMap,
  KeyboardShortcuts,
  DEFAULT_SHORTCUTS,
  withKeyboardShortcuts,
  type WithKeyboardShortcuts,
  type KeyboardShortcutsOptions
} from './utils/keyboard-shortcuts.js';

export type { Theme } from './core/types.js';

export type { 
  DebugConfig, 
  DebugLogEntry, 
  PerformanceEntry 
} from './dev-tools/debug.js';

export type { 
  KitPlugin, 
  PluginMeta, 
  PluginContext, 
  ComponentDefinition 
} from './plugins/plugin.js';

export type { 
  ComponentDoc, 
  ComponentExample, 
  ComponentExplorerOptions 
} from './dev-tools/component-explorer.js';

export type {
  ValidationRule,
  ValidationResult,
  ValidationSchema,
  ReactivePromptConfig,
  CrossFieldValidation,
  ReactivePromptDefinition
} from './core/reactive/index.js';

// =============================================================================
// Main Kit API - Simple Functions
// =============================================================================

// Import utilities
import { log } from './utils/log.js';
// Import debug
import { debug } from './dev-tools/debug.js';
// Import layout factory functions
import { group } from './components/layout/group.js';
import { panel } from './components/layout/panel.js';
import { wizard } from './components/layout/wizard.js';
// Import plugin system
import { PluginRegistry } from './plugins/registry.js';
// Create global plugin registry instance
const pluginRegistry = new PluginRegistry();
// Import contextual help
import { createHelp } from './utils/contextual-help.js';
import { MouseSupport } from './utils/mouse-support.js';
import { columns } from './components/layout/columns.js';
// Import feedback factory functions
import { spinner } from './components/feedback/spinner.js';
import { taskList } from './components/feedback/task-list.js';
// Import keyboard and mouse support
import { KeyboardShortcuts } from './utils/keyboard-shortcuts.js';
// Import advanced factory functions
import { commandPalette } from './components/advanced/command-palette.js';
import { progress, multiProgress } from './components/feedback/progress.js';
import { FormPrompt, type FormOptions } from './components/advanced/form.js';
import { TextPrompt, type TextOptions } from './components/primitives/text.js';
import { TablePrompt, type TableOptions } from './components/advanced/table.js';
// Import reactive system
import { watch, reactive, computed, validators } from './core/reactive/index.js';
import { NumberPrompt, type NumberOptions } from './components/primitives/number.js';
import { SelectPrompt, type SelectOptions } from './components/primitives/select.js';
import { ConfirmPrompt, type ConfirmOptions } from './components/primitives/confirm.js';
import { PasswordPrompt, type PasswordOptions } from './components/primitives/password.js';
import { FilePickerPrompt, type FilePickerOptions } from './components/advanced/file-picker.js';
import { MultiSelectPrompt, type MultiSelectOptions } from './components/primitives/multiselect.js';
import { AutocompletePrompt, type AutocompleteOptions } from './components/advanced/autocomplete.js';

import type { KitPlugin } from './plugins/plugin.js';

/**
 * Display a text input prompt
 */
export async function text(
  message: string,
  options?: TextOptions
): Promise<string>;
export async function text(
  options: TextOptions & { message: string }
): Promise<string>;
export async function text(
  messageOrOptions: string | (TextOptions & { message: string }),
  maybeOptions?: TextOptions
): Promise<string> {
  const config = typeof messageOrOptions === 'string'
    ? { message: messageOrOptions, ...maybeOptions }
    : messageOrOptions;
  
  const prompt = new TextPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a yes/no confirmation prompt
 */
export async function confirm(
  message: string,
  options?: ConfirmOptions
): Promise<boolean>;
export async function confirm(
  options: ConfirmOptions & { message: string }
): Promise<boolean>;
export async function confirm(
  messageOrOptions: string | (ConfirmOptions & { message: string }),
  maybeOptions?: ConfirmOptions
): Promise<boolean> {
  const config = typeof messageOrOptions === 'string'
    ? { message: messageOrOptions, ...maybeOptions }
    : messageOrOptions;
  
  const prompt = new ConfirmPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a password input prompt with masked characters
 */
export async function password(
  message: string,
  options?: PasswordOptions
): Promise<string>;
export async function password(
  options: PasswordOptions & { message: string }
): Promise<string>;
export async function password(
  messageOrOptions: string | (PasswordOptions & { message: string }),
  maybeOptions?: PasswordOptions
): Promise<string> {
  const config = typeof messageOrOptions === 'string'
    ? { message: messageOrOptions, ...maybeOptions }
    : messageOrOptions;
  
  const prompt = new PasswordPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a number input prompt
 */
export async function number(
  message: string,
  options?: NumberOptions
): Promise<number>;
export async function number(
  options: NumberOptions & { message: string }
): Promise<number>;
export async function number(
  messageOrOptions: string | (NumberOptions & { message: string }),
  maybeOptions?: NumberOptions
): Promise<number> {
  const config = typeof messageOrOptions === 'string'
    ? { message: messageOrOptions, ...maybeOptions }
    : messageOrOptions;
  
  const prompt = new NumberPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a single selection list
 */
export async function select<T = string>(
  message: string,
  options: T[] | SelectOptions<T>
): Promise<T>;
export async function select<T = string>(
  options: SelectOptions<T> & { message: string }
): Promise<T>;
export async function select<T = string>(
  messageOrOptions: string | (SelectOptions<T> & { message: string }),
  maybeOptions?: T[] | SelectOptions<T>
): Promise<T> {
  let config: SelectOptions<T> & { message: string };
  
  if (typeof messageOrOptions === 'string') {
    // Handle array of options
    if (Array.isArray(maybeOptions)) {
      config = { message: messageOrOptions, options: maybeOptions };
    } else {
      config = { message: messageOrOptions, ...maybeOptions! };
    }
  } else {
    config = messageOrOptions;
  }
  
  const prompt = new SelectPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a multiple selection list
 */
export async function multiselect<T = string>(
  message: string,
  options: T[] | MultiSelectOptions<T>
): Promise<T[]>;
export async function multiselect<T = string>(
  options: MultiSelectOptions<T> & { message: string }
): Promise<T[]>;
export async function multiselect<T = string>(
  messageOrOptions: string | (MultiSelectOptions<T> & { message: string }),
  maybeOptions?: T[] | MultiSelectOptions<T>
): Promise<T[]> {
  let config: MultiSelectOptions<T> & { message: string };
  
  if (typeof messageOrOptions === 'string') {
    // Handle array of options
    if (Array.isArray(maybeOptions)) {
      config = { message: messageOrOptions, options: maybeOptions };
    } else {
      config = { message: messageOrOptions, ...maybeOptions! };
    }
  } else {
    config = messageOrOptions;
  }
  
  const prompt = new MultiSelectPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display an autocomplete prompt with fuzzy search
 */
export async function autocomplete<T = string>(
  message: string,
  options: AutocompleteOptions<T>
): Promise<T>;
export async function autocomplete<T = string>(
  options: AutocompleteOptions<T> & { message: string }
): Promise<T>;
export async function autocomplete<T = string>(
  messageOrOptions: string | (AutocompleteOptions<T> & { message: string }),
  maybeOptions?: AutocompleteOptions<T>
): Promise<T> {
  const config = typeof messageOrOptions === 'string'
    ? { ...maybeOptions!, message: messageOrOptions }
    : messageOrOptions;
  
  const prompt = new AutocompletePrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a table for data selection
 */
export async function table<T = any>(
  message: string,
  options: TableOptions<T>
): Promise<T | T[]>;
export async function table<T = any>(
  options: TableOptions<T> & { message: string }
): Promise<T | T[]>;
export async function table<T = any>(
  messageOrOptions: string | (TableOptions<T> & { message: string }),
  maybeOptions?: TableOptions<T>
): Promise<T | T[]> {
  const config = typeof messageOrOptions === 'string'
    ? { ...maybeOptions!, message: messageOrOptions }
    : messageOrOptions;
  
  const prompt = new TablePrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

/**
 * Display a multi-field form
 */
export async function form<T = Record<string, any>>(
  options: FormOptions
): Promise<T> {
  const prompt = new FormPrompt(options);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result as T;
}

/**
 * Display a file picker
 */
export async function filePicker(
  message: string,
  options?: FilePickerOptions
): Promise<string | string[]>;
export async function filePicker(
  options: FilePickerOptions & { message: string }
): Promise<string | string[]>;
export async function filePicker(
  messageOrOptions: string | (FilePickerOptions & { message: string }),
  maybeOptions?: FilePickerOptions
): Promise<string | string[]> {
  const config = typeof messageOrOptions === 'string'
    ? { message: messageOrOptions, ...maybeOptions }
    : messageOrOptions;
  
  const prompt = new FilePickerPrompt(config);
  const result = await prompt.prompt();
  
  if (typeof result === 'symbol') {
    throw new Error('Cancelled');
  }
  
  return result;
}

// =============================================================================
// Main Kit Object
// =============================================================================

/**
 * The main kit object provides convenient access to all prompt types
 */
export const kit = {
  // Simple prompts
  text,
  confirm,
  password,
  number,
  select,
  multiselect,
  
  // Advanced prompts
  autocomplete,
  table,
  form,
  filePicker,
  
  // Feedback
  spinner,
  progress,
  multiProgress,
  taskList,
  
  // Layout
  group,
  panel,
  wizard,
  columns,
  
  // Utilities
  log,
  
  // Phase 3: Plugin system
  use(plugin: KitPlugin) {
    pluginRegistry.register(plugin);
  },
  
  // Phase 3: Debug
  debug,
  
  // Phase 4: Reactive
  reactive,
  computed,
  watch,
  validators,
  
  // Phase 4: Advanced
  commandPalette,
  help: createHelp,
  shortcuts: KeyboardShortcuts,
  mouse: MouseSupport,
};

// Default export
export default kit;