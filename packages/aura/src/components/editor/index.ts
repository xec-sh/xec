/**
 * Editor component exports
 */

// Core components
export { EditorComponent } from './editor-component.js';
export type { EditorComponentOptions } from './editor-component.js';

// Document and cursor management
export { DocumentManager } from './document/document-manager.js';
export { CursorManager } from './cursor/cursor-manager.js';
export { UndoManager } from './utils/undo-manager.js';

// Phase 2: Visual Features
export { ViewportManager } from './viewport/viewport-manager.js';
export type { ViewportOptions, ViewportState } from './viewport/viewport-manager.js';

export { GutterRenderer } from './gutter/gutter-renderer.js';
export type { GutterOptions, GutterMarker } from './gutter/gutter-renderer.js';

export { FindReplaceWidget } from './search/find-replace-widget.js';
export type { FindReplaceWidgetOptions, SearchMatch, SearchOptions } from './search/find-replace-widget.js';

export { EditorRenderer } from './renderer/editor-renderer.js';
export type { RenderOptions } from './renderer/editor-renderer.js';

// Utilities
export { DefaultKeyBindings, getKeyBindingLabel, parseKeyEvent, keyBindingsMatch } from './utils/keybindings.js';

// Types
export type {
  Position,
  Range,
  CursorState,
  DocumentChange,
  UndoableAction,
  EditorOptions,
  EditorState,
  KeyBinding,
  EditorCommand,
  EditorAPI
} from './types.js';