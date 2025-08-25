/**
 * Type definitions for the Editor component
 */

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface CursorState {
  position: Position;
  preferredColumn?: number;
  selection?: Range;
  selectionAnchor?: Position;  // Track where selection started for direction
}

export interface DocumentChange {
  range: Range;
  text: string;
  timestamp: number;
  deletedText?: string; // For undo/redo functionality
}

export interface UndoableAction {
  id: string;
  changes: DocumentChange[];
  cursorBefore: CursorState;
  cursorAfter: CursorState;
}

export interface EditorOptions {
  content?: string;
  language?: string;
  tabSize?: number;
  insertSpaces?: boolean;
  wordWrap?: boolean;
  readOnly?: boolean;
  lineNumbers?: boolean;
  cursorStyle?: 'line' | 'block' | 'underline';
  theme?: string;
}

export interface EditorState {
  content: string;
  cursor: CursorState;
  selection?: Range;
  isDirty: boolean;
  readOnly: boolean;
}

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  action: string;
}

export type EditorCommand = (editor: any) => void | Promise<void>;

export interface EditorAPI {
  // Document operations
  getValue(): string;
  setValue(value: string): void;
  getLine(lineNumber: number): string;
  getLineCount(): number;
  
  // Cursor operations
  getCursor(): CursorState;
  setCursor(cursor: CursorState): void;
  moveCursor(direction: 'up' | 'down' | 'left' | 'right', amount?: number): void;
  
  // Edit operations
  insertText(text: string): void;
  deleteText(range?: Range): void;
  replaceText(range: Range, text: string): void;
  
  // Undo/Redo
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  
  // Selection
  getSelection(): Range | null;
  setSelection(range: Range): void;
  clearSelection(): void;
  selectAll(): void;
}