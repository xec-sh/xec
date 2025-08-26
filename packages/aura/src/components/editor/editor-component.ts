/**
 * Editor Component - Main editor implementation for Phases 1-3
 * Implements core editing, visual features, and advanced editing capabilities
 */

import { signal, effect } from 'vibrancy';

import { RGBA } from '../../lib/colors.js';
import { UndoManager } from './utils/undo-manager.js';
import { TextBuffer } from '../../renderer/text-buffer.js';
import { OptimizedBuffer } from '../../renderer/buffer.js';
import { CursorManager } from './cursor/cursor-manager.js';
import { DefaultKeyBindings } from './utils/keybindings.js';
import { BracketMatcher } from './utils/bracket-matcher.js';
import { CodeFoldingManager } from './utils/code-folding.js';
import { EditorRenderer } from './renderer/editor-renderer.js';
import { DocumentManager } from './document/document-manager.js';
import { ViewportManager } from './viewport/viewport-manager.js';
import { Component, type ComponentProps } from '../../component.js';
import { MultiCursorManager } from './cursor/multi-cursor-manager.js';
import { SmartIndentationManager } from './utils/smart-indentation.js';
import { BlockSelectionManager } from './selection/block-selection.js';
import { AutoClosingPairsManager } from './utils/auto-closing-pairs.js';
import { GutterRenderer, type GutterOptions } from './gutter/gutter-renderer.js';
import { type SearchMatch, FindReplaceWidget } from './search/find-replace-widget.js';

import type { ParsedKey } from '../../lib/parse.keypress.js';
import type {
  Range,
  Position,
  EditorAPI,
  KeyBinding,
  CursorState,
  EditorCommand,
  BaseEditorProps
} from './types.js';

export interface EditorProps extends ComponentProps, BaseEditorProps {
  onContentChange?: (content: string) => void;
  onCursorChange?: (cursor: CursorState) => void;
  onSelectionChange?: (selection: Range | null) => void;
  onSearch?: (query: string, matches: SearchMatch[]) => void;

  // Phase 2 options
  wordWrap?: boolean;
  showGutter?: boolean;
  gutterOptions?: GutterOptions; // Options for gutter configuration
  showMinimap?: boolean;
  showFindWidget?: boolean;

  // Phase 3 options
  enableMultiCursor?: boolean;
  enableBlockSelection?: boolean;
  enableSmartIndent?: boolean;
  enableBracketMatching?: boolean;
  enableCodeFolding?: boolean;
  enableAutoClosingPairs?: boolean;
}

export class EditorComponent extends Component implements EditorAPI {
  // Internal managers
  private document: DocumentManager;
  private cursorManager: CursorManager;
  private multiCursorManager: MultiCursorManager | null = null;
  private undoManager: UndoManager;
  private viewportManager: ViewportManager;

  // Phase 2 components
  private findReplaceWidget: FindReplaceWidget | null = null;
  private gutterRenderer: GutterRenderer | null = null;
  private editorRenderer: EditorRenderer;

  // Phase 3 features
  private blockSelection: BlockSelectionManager | null = null;
  private smartIndentation: SmartIndentationManager | null = null;
  private bracketMatcher: BracketMatcher | null = null;
  private codeFolding: CodeFoldingManager | null = null;
  private autoClosingPairs: AutoClosingPairsManager | null = null;

  // Reactive state
  private content = signal<string>('');
  private cursorState = signal<CursorState>({ position: { line: 0, column: 0 } });
  private isDirtySignal = signal<boolean>(false);
  private isSearchActive = signal<boolean>(false);
  private searchMatches = signal<SearchMatch[]>([]);
  private foldedLines = signal<Set<number>>(new Set());

  // Override isDirty getter from base Component
  protected override get isDirty(): boolean {
    return this.isDirtySignal();
  }

  // Configuration
  private tabSize: number;
  private insertSpaces: boolean;
  private readOnly: boolean;
  private wordWrap: boolean;
  private showGutter: boolean;
  private gutterOptions: GutterOptions;
  private showMinimap: boolean;
  
  // Track last scroll position
  private lastScrollTop = 0;
  private lastScrollLeft = 0;

  // Phase 3 configuration
  private enableMultiCursor: boolean;
  private enableBlockSelection: boolean;
  private enableSmartIndent: boolean;
  private enableBracketMatching: boolean;
  private enableCodeFolding: boolean;
  private enableAutoClosingPairs: boolean;

  // Rendering
  private textBuffer: TextBuffer;

  // Keybindings and commands
  private keyBindings: Map<string, EditorCommand>;
  private commands: Map<string, EditorCommand>;

  // Event callbacks
  private onContentChange?: (content: string) => void;
  private onCursorChange?: (cursor: CursorState) => void;
  private onSelectionChange?: (selection: Range | null) => void;
  private onSearch?: (query: string, matches: SearchMatch[]) => void;

  constructor(id: string, options: EditorProps = {}) {
    super(id, options);
    this.focusable = true;

    // Initialize configuration
    this.tabSize = options.tabSize ?? 4;
    this.insertSpaces = options.insertSpaces ?? true;
    this.readOnly = options.readOnly ?? false;
    this.wordWrap = options.wordWrap ?? false;
    this.showGutter = options.showGutter ?? true;
    this.showMinimap = options.showMinimap ?? false;
    this.enableCodeFolding = options.enableCodeFolding ?? true;

    // Initialize gutter options with defaults
    this.gutterOptions = {
      showLineNumbers: options.lineNumbers ?? true, // Use lineNumbers from BaseEditorProps
      relativeLineNumbers: false,
      showFoldIndicators: this.enableCodeFolding,
      showGitStatus: false,
      ...options.gutterOptions // Allow override with explicit gutterOptions
    };

    // Phase 3 configuration
    this.enableMultiCursor = options.enableMultiCursor ?? true;
    this.enableBlockSelection = options.enableBlockSelection ?? true;
    this.enableSmartIndent = options.enableSmartIndent ?? true;
    this.enableBracketMatching = options.enableBracketMatching ?? true;

    this.enableAutoClosingPairs = options.enableAutoClosingPairs ?? true;

    // Initialize managers
    this.document = new DocumentManager(options.content || '');
    this.cursorManager = new CursorManager(this.document);
    this.undoManager = new UndoManager();
    this.viewportManager = new ViewportManager(this.document, {
      scrollBeyondLastLine: true
    });
    this.viewportManager.setDimensions(this.width, this.height);

    // Initialize Phase 2 components
    if (this.showGutter) {
      this.gutterRenderer = new GutterRenderer(
        this.document,
        this.viewportManager,
        this.gutterOptions
      );
    }

    // Initialize renderer (pass null if gutter is disabled)
    this.editorRenderer = new EditorRenderer(
      this.document,
      this.cursorManager,
      this.viewportManager,
      this.gutterRenderer || null,
      {}
    );

    // Initialize Phase 3 features
    if (this.enableMultiCursor) {
      this.multiCursorManager = new MultiCursorManager(this.document);
    }
    if (this.enableBlockSelection) {
      this.blockSelection = new BlockSelectionManager(this.document);
    }
    if (this.enableSmartIndent) {
      this.smartIndentation = new SmartIndentationManager(this.document, this.tabSize, this.insertSpaces);
    }
    if (this.enableBracketMatching) {
      this.bracketMatcher = new BracketMatcher(this.document);
    }
    if (this.enableCodeFolding) {
      this.codeFolding = new CodeFoldingManager(this.document);
    }
    if (this.enableAutoClosingPairs) {
      this.autoClosingPairs = new AutoClosingPairsManager(this.document);
    }

    // Initialize text buffer for rendering
    this.textBuffer = TextBuffer.create(2 * 1024 * 1024);

    // Initialize keybindings and commands
    this.keyBindings = new Map();
    this.commands = new Map();
    this.registerDefaultCommands();
    this.registerPhase2Commands();
    this.registerPhase3Commands();
    this.registerDefaultKeyBindings();

    // Set initial content
    if (options.content) {
      this.setValue(options.content);
    }

    // Store callbacks
    this.onContentChange = options.onContentChange;
    this.onCursorChange = options.onCursorChange;
    this.onSelectionChange = options.onSelectionChange;
    this.onSearch = options.onSearch;

    // Set up reactive effects
    this.setupReactiveEffects();
  }

  /**
   * Set up reactive effects for state changes
   */
  private setupReactiveEffects(): void {
    // Update content signal when document changes
    effect(() => {
      const newContent = this.document.getText();
      if (newContent !== this.content()) {
        this.content.set(newContent);
        this.isDirtySignal.set(true);
        this.onContentChange?.(newContent);

        // Update code folding if enabled
        if (this.codeFolding) {
          this.foldedLines.set(new Set(this.codeFolding.getFoldedLines()));
        }
      }
    });

    // Update cursor signal when cursor changes
    effect(() => {
      const cursor = this.cursorManager.getCursor();
      this.cursorState.set(cursor);
      this.onCursorChange?.(cursor);

      const selection = this.cursorManager.getSelection();
      this.onSelectionChange?.(selection);

      // Update bracket matching if enabled
      if (this.enableBracketMatching && this.bracketMatcher) {
        this.bracketMatcher.updateMatches(cursor.position);
      }
    });

    // Update viewport when cursor moves - no debouncing for instant response
    effect(() => {
      const cursor = this.cursorState();
      
      // Only scroll if cursor actually changed position
      // This prevents unnecessary scroll updates
      this.viewportManager.ensureVisible(cursor.position.line, cursor.position.column);
      
      // Only trigger update if viewport actually scrolled
      const state = this.viewportManager.getState();
      if (state.scrollTop !== this.lastScrollTop || state.scrollLeft !== this.lastScrollLeft) {
        this.lastScrollTop = state.scrollTop;
        this.lastScrollLeft = state.scrollLeft;
        this.needsUpdate();
      }
    });
  }

  /**
   * Register default editor commands (Phase 1)
   */
  private registerDefaultCommands(): void {
    // Movement commands
    this.registerCommand('cursorUp', () => this.cursorManager.moveUp());
    this.registerCommand('cursorDown', () => this.cursorManager.moveDown());
    this.registerCommand('cursorLeft', () => this.cursorManager.moveLeft());
    this.registerCommand('cursorRight', () => this.cursorManager.moveRight());

    this.registerCommand('cursorLineStart', () => this.cursorManager.moveToLineStart());
    this.registerCommand('cursorLineEnd', () => this.cursorManager.moveToLineEnd());
    this.registerCommand('cursorDocumentStart', () => this.cursorManager.moveToDocumentStart());
    this.registerCommand('cursorDocumentEnd', () => this.cursorManager.moveToDocumentEnd());

    this.registerCommand('cursorWordLeft', () => this.cursorManager.moveToPreviousWord());
    this.registerCommand('cursorWordRight', () => this.cursorManager.moveToNextWord());
    
    // Page navigation
    this.registerCommand('pageUp', () => this.handlePageUp());
    this.registerCommand('pageDown', () => this.handlePageDown());

    // Selection commands
    this.registerCommand('selectUp', () => this.cursorManager.moveUp(1, true));
    this.registerCommand('selectDown', () => this.cursorManager.moveDown(1, true));
    this.registerCommand('selectLeft', () => this.cursorManager.moveLeft(1, true));
    this.registerCommand('selectRight', () => this.cursorManager.moveRight(1, true));

    this.registerCommand('selectAll', () => this.cursorManager.selectAll());
    this.registerCommand('selectWord', () => this.cursorManager.selectWord());
    this.registerCommand('selectLine', () => this.cursorManager.selectLine());

    // Edit commands
    this.registerCommand('deleteLeft', () => this.deleteLeft());
    this.registerCommand('deleteRight', () => this.deleteRight());
    this.registerCommand('deleteWordLeft', () => this.deleteWordLeft());
    this.registerCommand('deleteWordRight', () => this.deleteWordRight());

    this.registerCommand('insertNewLine', () => this.insertNewLine());
    this.registerCommand('insertTab', () => this.insertTab());

    // Undo/Redo
    this.registerCommand('undo', () => this.undo());
    this.registerCommand('redo', () => this.redo());
  }

  /**
   * Register Phase 2 commands
   */
  private registerPhase2Commands(): void {
    // Find/Replace commands
    this.registerCommand('find', () => this.showFindWidget());
    this.registerCommand('findNext', () => this.findNext());
    this.registerCommand('findPrevious', () => this.findPrevious());
    this.registerCommand('replace', () => this.showReplaceWidget());
    this.registerCommand('closeFindWidget', () => this.closeFindWidget());

    // Viewport commands
    this.registerCommand('scrollUp', () => this.viewportManager.scrollUp());
    this.registerCommand('scrollDown', () => this.viewportManager.scrollDown());
    this.registerCommand('scrollPageUp', () => this.handlePageUp());
    this.registerCommand('scrollPageDown', () => this.handlePageDown());
  }

  /**
   * Register Phase 3 commands
   */
  private registerPhase3Commands(): void {
    // Multi-cursor commands
    if (this.enableMultiCursor) {
      this.registerCommand('addCursorAbove', () => this.addCursorAbove());
      this.registerCommand('addCursorBelow', () => this.addCursorBelow());
      this.registerCommand('addCursorToNextMatch', () => this.addCursorToNextMatch());
      this.registerCommand('clearSecondaryCursors', () => this.clearSecondaryCursors());
    }

    // Block selection commands
    if (this.enableBlockSelection) {
      this.registerCommand('startBlockSelection', () => this.startBlockSelection());
      this.registerCommand('expandBlockSelectionUp', () => this.expandBlockSelection('up'));
      this.registerCommand('expandBlockSelectionDown', () => this.expandBlockSelection('down'));
      this.registerCommand('expandBlockSelectionLeft', () => this.expandBlockSelection('left'));
      this.registerCommand('expandBlockSelectionRight', () => this.expandBlockSelection('right'));
    }

    // Code folding commands
    if (this.enableCodeFolding) {
      this.registerCommand('toggleFold', () => this.toggleFold());
      this.registerCommand('foldAll', () => this.foldAll());
      this.registerCommand('unfoldAll', () => this.unfoldAll());
    }

    // Bracket matching commands
    if (this.enableBracketMatching) {
      this.registerCommand('jumpToBracket', () => this.jumpToBracket());
      this.registerCommand('selectToBracket', () => this.selectToBracket());
    }
  }

  /**
   * Register default keybindings
   */
  private registerDefaultKeyBindings(): void {
    // Use default keybindings from utils
    for (const binding of DefaultKeyBindings) {
      this.registerKeyBinding(binding);
    }
    
    // Add page navigation keybindings
    this.registerKeyBinding({ key: 'PageUp', action: 'pageUp' });
    this.registerKeyBinding({ key: 'PageDown', action: 'pageDown' });

    // Add Phase 2 keybindings
    this.registerKeyBinding({ key: 'f', ctrl: true, action: 'find' });
    this.registerKeyBinding({ key: 'h', ctrl: true, action: 'replace' });
    this.registerKeyBinding({ key: 'F3', action: 'findNext' });
    this.registerKeyBinding({ key: 'F3', shift: true, action: 'findPrevious' });
    this.registerKeyBinding({ key: 'Escape', action: 'closeFindWidget' });

    // Add Phase 3 keybindings
    if (this.enableMultiCursor) {
      this.registerKeyBinding({ key: 'd', ctrl: true, action: 'addCursorToNextMatch' });
      this.registerKeyBinding({ key: 'ArrowUp', ctrl: true, alt: true, action: 'addCursorAbove' });
      this.registerKeyBinding({ key: 'ArrowDown', ctrl: true, alt: true, action: 'addCursorBelow' });
      this.registerKeyBinding({ key: 'Escape', action: 'clearSecondaryCursors' });
    }

    if (this.enableBlockSelection) {
      this.registerKeyBinding({ key: 'ArrowUp', shift: true, alt: true, action: 'expandBlockSelectionUp' });
      this.registerKeyBinding({ key: 'ArrowDown', shift: true, alt: true, action: 'expandBlockSelectionDown' });
      this.registerKeyBinding({ key: 'ArrowLeft', shift: true, alt: true, action: 'expandBlockSelectionLeft' });
      this.registerKeyBinding({ key: 'ArrowRight', shift: true, alt: true, action: 'expandBlockSelectionRight' });
    }

    if (this.enableCodeFolding) {
      this.registerKeyBinding({ key: '[', ctrl: true, shift: true, action: 'toggleFold' });
      this.registerKeyBinding({ key: 'k', ctrl: true, meta: true, action: 'foldAll' });
      this.registerKeyBinding({ key: 'j', ctrl: true, meta: true, action: 'unfoldAll' });
    }

    if (this.enableBracketMatching) {
      this.registerKeyBinding({ key: 'p', ctrl: true, action: 'jumpToBracket' });
      this.registerKeyBinding({ key: 'p', ctrl: true, shift: true, action: 'selectToBracket' });
    }
  }

  /**
   * Register a command
   */
  registerCommand(name: string, command: EditorCommand): void {
    this.commands.set(name, command);
  }

  /**
   * Register a keybinding
   */
  registerKeyBinding(binding: KeyBinding): void {
    const key = this.getKeyBindingKey(binding);
    const command = this.commands.get(binding.action);
    if (command) {
      this.keyBindings.set(key, command);
    }
  }

  /**
   * Get key string from keybinding
   */
  private getKeyBindingKey(binding: KeyBinding): string {
    const parts: string[] = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Meta');
    parts.push(binding.key);
    return parts.join('+');
  }

  // === EditorAPI Implementation ===

  getValue(): string {
    return this.document.getText();
  }

  setValue(value: string): void {
    this.document.setText(value);
    this.cursorManager.setCursor({ line: 0, column: 0 });
    this.undoManager.clear();
    this.isDirtySignal.set(false);

    // Reset multi-cursor if enabled
    if (this.multiCursorManager) {
      this.multiCursorManager.clearSecondaryCursors();
    }
  }

  getLine(lineNumber: number): string {
    return this.document.getLine(lineNumber);
  }

  getLineCount(): number {
    return this.document.getLineCount();
  }

  getCursor(): CursorState {
    return this.cursorManager.getCursor();
  }

  setCursor(cursor: CursorState): void {
    this.cursorManager.setCursor(cursor.position);
    if (cursor.selection) {
      this.cursorManager.setSelection(cursor.selection);
    }
  }

  moveCursor(direction: 'up' | 'down' | 'left' | 'right', amount = 1): void {
    // Move cursor in bulk for better performance
    switch (direction) {
      case 'up': 
        this.cursorManager.moveUp(amount);
        break;
      case 'down': 
        this.cursorManager.moveDown(amount);
        break;
      case 'left': 
        this.cursorManager.moveLeft(amount);
        break;
      case 'right': 
        this.cursorManager.moveRight(amount);
        break;
    }
  }

  insertText(text: string): void {
    if (this.readOnly) return;

    // Handle auto-closing pairs if enabled
    if (this.enableAutoClosingPairs && this.autoClosingPairs) {
      const handled = this.autoClosingPairs.handleInput(
        text,
        this.cursorManager.getCursor().position
      );
      if (handled) {
        return;
      }
    }

    const cursor = this.cursorManager.getCursor();
    const selection = this.cursorManager.getSelection();

    // Store cursor state for undo
    const cursorBefore = cursor;

    // Delete selection if exists
    if (selection) {
      this.document.deleteText(selection);
      this.cursorManager.clearSelection();
      this.cursorManager.setCursor(selection.start);
    }

    // Insert text
    const change = this.document.insertText(cursor.position, text);

    // Move cursor to end of inserted text
    const lines = text.split('\n');
    let newPosition: Position;

    if (lines.length === 1) {
      newPosition = {
        line: cursor.position.line,
        column: cursor.position.column + text.length
      };
    } else {
      newPosition = {
        line: cursor.position.line + lines.length - 1,
        column: (lines[lines.length - 1] ?? '').length
      };
    }

    this.cursorManager.setCursor(newPosition);

    // Add to undo stack
    const cursorAfter = this.cursorManager.getCursor();
    this.undoManager.addAction({
      id: `insert-${Date.now()}`,
      changes: [change],
      cursorBefore,
      cursorAfter
    });
  }

  private insertNewLine(): void {
    if (this.readOnly) return;

    // Use smart indentation if enabled
    if (this.enableSmartIndent && this.smartIndentation) {
      const cursor = this.cursorManager.getCursor();
      const indentLevel = this.smartIndentation.getIndentLevel(cursor.position.line);
      const indent = this.insertSpaces
        ? ' '.repeat(indentLevel * this.tabSize)
        : '\t'.repeat(indentLevel);
      this.insertText('\n' + indent);
    } else {
      this.insertText('\n');
    }
  }

  deleteText(range?: Range): void {
    if (this.readOnly) return;

    const cursor = this.cursorManager.getCursor();
    const cursorBefore = cursor;

    const rangeToDelete = range || this.cursorManager.getSelection();
    if (!rangeToDelete) return;

    const change = this.document.deleteText(rangeToDelete);
    this.cursorManager.clearSelection();
    this.cursorManager.setCursor(rangeToDelete.start);

    const cursorAfter = this.cursorManager.getCursor();
    this.undoManager.addAction({
      id: `delete-${Date.now()}`,
      changes: [change],
      cursorBefore,
      cursorAfter
    });
  }

  replaceText(range: Range, text: string): void {
    if (this.readOnly) return;

    const cursor = this.cursorManager.getCursor();
    const cursorBefore = cursor;

    const change = this.document.replaceText(range, text);

    // Move cursor to end of replaced text
    const lines = text.split('\n');
    let newPosition: Position;

    if (lines.length === 1) {
      newPosition = {
        line: range.start.line,
        column: range.start.column + text.length
      };
    } else {
      newPosition = {
        line: range.start.line + lines.length - 1,
        column: (lines[lines.length - 1] ?? '').length
      };
    }

    this.cursorManager.setCursor(newPosition);

    const cursorAfter = this.cursorManager.getCursor();
    this.undoManager.addAction({
      id: `replace-${Date.now()}`,
      changes: [change],
      cursorBefore,
      cursorAfter
    });
  }

  undo(): void {
    const action = this.undoManager.undo();
    if (!action) return;

    // Apply inverse of changes
    for (const change of action.changes.reverse()) {
      if (change.text) {
        // Was an insertion, delete it
        const endPos = this.getEndPositionOfChange(change);
        this.document.deleteText({ start: change.range.start, end: endPos });
      } else {
        // Was a deletion, restore it
        // Note: We need to store deleted text in the change for proper undo
        // This is a simplified version
        this.document.insertText(change.range.start, '');
      }
    }

    // Restore cursor position
    this.cursorManager.setCursor(action.cursorBefore.position);
    if (action.cursorBefore.selection) {
      this.cursorManager.setSelection(action.cursorBefore.selection);
    }
  }

  redo(): void {
    const action = this.undoManager.redo();
    if (!action) return;

    // Apply changes
    for (const change of action.changes) {
      if (change.text) {
        this.document.insertText(change.range.start, change.text);
      } else {
        this.document.deleteText(change.range);
      }
    }

    // Restore cursor position
    this.cursorManager.setCursor(action.cursorAfter.position);
    if (action.cursorAfter.selection) {
      this.cursorManager.setSelection(action.cursorAfter.selection);
    }
  }

  canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  getSelection(): Range | null {
    return this.cursorManager.getSelection();
  }

  setSelection(range: Range): void {
    this.cursorManager.setSelection(range);
  }

  clearSelection(): void {
    this.cursorManager.clearSelection();
  }

  selectAll(): void {
    this.cursorManager.selectAll();
  }

  // === Phase 2 Methods ===

  showFindWidget(): void {
    if (!this.findReplaceWidget) {
      this.findReplaceWidget = new FindReplaceWidget(
        'find-widget',
        this.document,
        {
          onClose: () => this.closeFindWidget(),
          onFind: (matches) => {
            this.searchMatches.set(matches);
            this.onSearch?.(this.findReplaceWidget?.getSearchQuery?.() || '', matches);
          },
          onReplace: (match, replacement) => {
            this.replaceText(match.range, replacement);
          },
          onReplaceAll: (matches, replacement) => {
            for (const match of matches) {
              this.replaceText(match.range, replacement);
            }
          }
        }
      );
      this.add(this.findReplaceWidget);
    }
    this.isSearchActive.set(true);
    this.needsUpdate();
  }

  showReplaceWidget(): void {
    this.showFindWidget();
    // The widget handles both find and replace
  }

  closeFindWidget(): void {
    if (this.findReplaceWidget) {
      this.remove(this.findReplaceWidget.id);
      this.findReplaceWidget = null;
    }
    this.isSearchActive.set(false);
    this.searchMatches.set([]);
    this.needsUpdate();
  }

  findNext(): void {
    if (this.findReplaceWidget) {
      this.findReplaceWidget.findNext();
    }
  }

  findPrevious(): void {
    if (this.findReplaceWidget) {
      this.findReplaceWidget.findPrevious();
    }
  }

  // === Phase 3 Methods ===

  addCursorAbove(): void {
    if (!this.multiCursorManager) return;
    const currentPos = this.cursorManager.getCursor().position;
    if (currentPos.line > 0) {
      this.multiCursorManager.addCursor({
        line: currentPos.line - 1,
        column: currentPos.column
      });
      this.needsUpdate();
    }
  }

  addCursorBelow(): void {
    if (!this.multiCursorManager) return;
    const currentPos = this.cursorManager.getCursor().position;
    if (currentPos.line < this.document.getLineCount() - 1) {
      this.multiCursorManager.addCursor({
        line: currentPos.line + 1,
        column: currentPos.column
      });
      this.needsUpdate();
    }
  }

  addCursorToNextMatch(): void {
    if (!this.multiCursorManager) return;
    const selection = this.cursorManager.getSelection();
    if (selection) {
      const selectedText = this.document.getTextInRange(selection);
      // Find next occurrence and add cursor there
      const nextMatch = this.document.findNext(selectedText, selection.end);
      if (nextMatch) {
        this.multiCursorManager.addCursor(nextMatch.start);
        this.needsUpdate();
      }
    }
  }

  clearSecondaryCursors(): void {
    if (!this.multiCursorManager) return;
    this.multiCursorManager.clearSecondaryCursors();
    this.needsUpdate();
  }

  startBlockSelection(): void {
    if (!this.blockSelection) return;
    const cursor = this.cursorManager.getCursor();
    this.blockSelection.start(cursor.position);
    this.needsUpdate();
  }

  expandBlockSelection(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.blockSelection) return;
    this.blockSelection.move(direction);
    const selection = this.blockSelection.getSelection();
    if (selection) {
      // BlockSelection's getSelection returns a BlockSelection object, not a Range
      // We need to convert it to Range[] or use getSelectionRanges
      const ranges = this.blockSelection.getSelectionRanges();
      if (ranges.length > 0 && ranges[0]) {
        this.cursorManager.setSelection(ranges[0]);
      }
    }
    this.needsUpdate();
  }

  toggleFold(): void {
    if (!this.codeFolding) return;
    const cursor = this.cursorManager.getCursor();
    const foldableRange = this.codeFolding.getFoldableRange(cursor.position.line);
    if (foldableRange) {
      this.codeFolding.toggleFold(foldableRange.startLine);
      this.foldedLines.set(new Set(this.codeFolding.getFoldedLines()));
      this.needsUpdate();
    }
  }

  foldAll(): void {
    if (!this.codeFolding) return;
    this.codeFolding.foldAll();
    this.foldedLines.set(new Set(this.codeFolding.getFoldedLines()));
    this.needsUpdate();
  }

  unfoldAll(): void {
    if (!this.codeFolding) return;
    this.codeFolding.unfoldAll();
    this.foldedLines.set(new Set(this.codeFolding.getFoldedLines()));
    this.needsUpdate();
  }

  jumpToBracket(): void {
    if (!this.bracketMatcher) return;
    const cursor = this.cursorManager.getCursor();
    const matchedBracket = this.bracketMatcher.findMatchingBracket(cursor.position);
    if (matchedBracket && matchedBracket.matchPosition) {
      this.cursorManager.setCursor(matchedBracket.matchPosition);
      this.needsUpdate();
    }
  }

  selectToBracket(): void {
    if (!this.bracketMatcher) return;
    const cursor = this.cursorManager.getCursor();
    const matchedBracket = this.bracketMatcher.findMatchingBracket(cursor.position);
    if (matchedBracket && matchedBracket.matchPosition) {
      this.cursorManager.setSelection({
        start: cursor.position,
        end: matchedBracket.matchPosition
      });
      this.needsUpdate();
    }
  }

  // === Helper methods ===

  private deleteLeft(): void {
    const selection = this.cursorManager.getSelection();

    if (selection) {
      this.deleteText(selection);
    } else {
      const cursor = this.cursorManager.getCursor();
      if (cursor.position.column > 0) {
        const range: Range = {
          start: { line: cursor.position.line, column: cursor.position.column - 1 },
          end: cursor.position
        };
        this.deleteText(range);
      } else if (cursor.position.line > 0) {
        const prevLineLength = this.document.getLineLength(cursor.position.line - 1);
        const range: Range = {
          start: { line: cursor.position.line - 1, column: prevLineLength },
          end: cursor.position
        };
        this.deleteText(range);
      }
    }
  }

  private deleteRight(): void {
    const selection = this.cursorManager.getSelection();

    if (selection) {
      this.deleteText(selection);
    } else {
      const cursor = this.cursorManager.getCursor();
      const lineLength = this.document.getLineLength(cursor.position.line);

      if (cursor.position.column < lineLength) {
        const range: Range = {
          start: cursor.position,
          end: { line: cursor.position.line, column: cursor.position.column + 1 }
        };
        this.deleteText(range);
      } else if (cursor.position.line < this.document.getLineCount() - 1) {
        const range: Range = {
          start: cursor.position,
          end: { line: cursor.position.line + 1, column: 0 }
        };
        this.deleteText(range);
      }
    }
  }

  private deleteWordLeft(): void {
    const cursor = this.cursorManager.getCursor();
    const wordStart = this.document.findWordBoundary(cursor.position, 'backward');
    const range: Range = { start: wordStart, end: cursor.position };
    this.deleteText(range);
  }

  private deleteWordRight(): void {
    const cursor = this.cursorManager.getCursor();
    const wordEnd = this.document.findWordBoundary(cursor.position, 'forward');
    const range: Range = { start: cursor.position, end: wordEnd };
    this.deleteText(range);
  }

  private insertTab(): void {
    const text = this.insertSpaces ? ' '.repeat(this.tabSize) : '\t';
    this.insertText(text);
  }

  private getEndPositionOfChange(change: { range: Range; text: string }): Position {
    if (!change.text) {
      return change.range.start;
    }

    const lines = change.text.split('\n');
    if (lines.length === 1) {
      return {
        line: change.range.start.line,
        column: change.range.start.column + change.text.length
      };
    }

    return {
      line: change.range.start.line + lines.length - 1,
      column: (lines[lines.length - 1] ?? '').length
    };
  }

  // === Component lifecycle ===

  protected onMount(): void {
    // Set up keyboard event handling
    this.setupKeyboardHandling();

    // Initialize viewport scroll position - center cursor on mount
    const cursor = this.cursorManager.getCursor();
    this.viewportManager.scrollToLine(cursor.position.line, 'center');
    this.viewportManager.scrollToColumn(cursor.position.column);
  }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height);

    // Update viewport dimensions with correct size
    // Account for gutter width if present
    const gutterWidth = this.gutterRenderer?.calculateWidth() ?? 0;
    const contentWidth = Math.max(1, width - gutterWidth);
    const contentHeight = Math.max(1, height);

    this.viewportManager.setDimensions(contentWidth, contentHeight);
    
    // Invalidate max line length cache when resizing
    this.viewportManager.invalidateMaxLineLength();

    // Only ensure visibility, don't force scroll
    const cursor = this.cursorManager.getCursor();
    this.viewportManager.ensureVisible(cursor.position.line, cursor.position.column);

    // Update without forcing dirty state
    this.needsUpdate();
  }

  private setupKeyboardHandling(): void {
    // This will be connected to the actual terminal input
    // For now, it's a placeholder
  }

  // === Rendering ===

  protected override renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    if (!buffer) return;

    // Clear the component area
    buffer.fillRect(this.x, this.y, this.width, this.height, RGBA.fromValues(0.1, 0.1, 0.2, 1));

    // Don't update viewport dimensions here - only in onResize
    const visibleRange = this.viewportManager.getVisibleRange();

    // Note: Gutter is rendered inside editorRenderer, not here
    // This prevents duplicate line numbers

    // Use the editor renderer for main content (including gutter)
    this.editorRenderer.render(
      buffer,
      this.x,
      this.y,
      this.width,
      this.height,
      deltaTime
    );

    // Render find widget if active
    if (this.findReplaceWidget && this.isSearchActive()) {
      this.findReplaceWidget.x = this.x;
      this.findReplaceWidget.y = this.y + this.height - 6;
      this.findReplaceWidget.render(buffer, deltaTime);
    }
  }

  private isLineInSelection(lineNumber: number, selection: Range): boolean {
    return lineNumber >= selection.start.line && lineNumber <= selection.end.line;
  }

  private getLineSelectionRange(lineNumber: number, selection: Range): { start: number; end: number } {
    const lineLength = this.document.getLineLength(lineNumber);

    let start = 0;
    let end = lineLength;

    if (lineNumber === selection.start.line) {
      start = selection.start.column;
    }

    if (lineNumber === selection.end.line) {
      end = selection.end.column;
    }

    return { start, end };
  }

  override handleKeyPress(key: ParsedKey): boolean {
    // Check if find widget is active and should handle the key
    if (this.findReplaceWidget && this.isSearchActive()) {
      if (this.findReplaceWidget.handleKeyPress(key)) {
        return true;
      }
    }

    // Extract key name - prefer 'name' over 'sequence' 
    let keyStr = key.name;

    // If name is empty or just a modifier, use the sequence/raw
    if (!keyStr || keyStr === 'undefined') {
      keyStr = key.sequence || key.raw;
    }

    // Handle special cases where name might be a descriptive string
    // Map common key names to expected format
    const keyNameMap: Record<string, string> = {
      'return': 'Enter',
      'enter': 'Enter',
      'escape': 'Escape',
      'esc': 'Escape',
      'tab': 'Tab',
      'backspace': 'Backspace',
      'delete': 'Delete',
      'up': 'ArrowUp',
      'down': 'ArrowDown',
      'left': 'ArrowLeft',
      'right': 'ArrowRight',
      'home': 'Home',
      'end': 'End',
      'pageup': 'PageUp',
      'pagedown': 'PageDown',
      'space': ' ',
      'f3': 'F3'
    };

    // Normalize key name
    const normalizedKey = keyNameMap[keyStr.toLowerCase()] || keyStr;

    // Build command key string with modifiers
    const parts: string[] = [];
    if (key.ctrl) parts.push('Ctrl');
    if (key.option) parts.push('Alt'); // Note: option is Alt on Mac
    if (key.shift) parts.push('Shift');
    if (key.meta) parts.push('Meta');
    if (normalizedKey) parts.push(normalizedKey);

    const commandKey = parts.join('+');

    // Check for registered command
    const command = this.keyBindings.get(commandKey);
    if (command) {
      command(this);
      this.needsUpdate();
      return true;
    }

    // If no modifiers (except shift) and it's a printable character, insert it
    if (!key.ctrl && !key.option && !key.meta) {
      // Use raw for single character input or the normalized key
      const textToInsert = key.raw.length === 1 ? key.raw : (normalizedKey.length === 1 ? normalizedKey : '');

      if (textToInsert) {
        this.insertText(textToInsert);
        this.needsUpdate();
        return true;
      }
    }

    return false;
  }

  // === Additional methods for compatibility ===

  /**
   * Get multi-cursor count
   */
  getMultiCursorCount(): number {
    if (this.multiCursorManager) {
      return this.multiCursorManager.getAllCursors().length;
    }
    return 1;
  }

  /**
   * Toggle find/replace widget
   */
  toggleFindReplace(): void {
    if (this.findReplaceWidget) {
      this.findReplaceWidget.toggle();
      this.needsUpdate();
    }
  }

  /**
   * Select next occurrence of current selection
   */
  selectNextOccurrence(): void {
    if (!this.multiCursorManager) return;

    const cursor = this.cursorManager.getCursor();
    const selection = this.cursorManager.getSelection();

    if (selection) {
      this.multiCursorManager.addNextOccurrence();
      this.needsUpdate();
    }
  }

  /**
   * Update gutter options dynamically
   */
  updateGutterOptions(options: Partial<GutterOptions>): void {
    this.gutterOptions = { ...this.gutterOptions, ...options };
    if (this.gutterRenderer) {
      this.gutterRenderer.updateOptions(this.gutterOptions);
      this.needsUpdate();
    }
  }

  /**
   * Toggle line numbers display
   */
  toggleLineNumbers(): void {
    this.updateGutterOptions({
      showLineNumbers: !this.gutterOptions.showLineNumbers
    });
  }

  /**
   * Toggle relative line numbers
   */
  toggleRelativeLineNumbers(): void {
    this.updateGutterOptions({
      relativeLineNumbers: !this.gutterOptions.relativeLineNumbers
    });
  }

  /**
   * Handle Page Up - move cursor and scroll
   */
  private handlePageUp(): void {
    const pageSize = Math.max(1, this.viewportManager.getState().height - 2);
    
    // Move cursor up by page size
    const cursor = this.cursorManager.getCursor();
    const newLine = Math.max(0, cursor.position.line - pageSize);
    this.cursorManager.setCursor({ line: newLine, column: cursor.position.column });
    
    // Scroll viewport
    this.viewportManager.scrollPageUp();
  }

  /**
   * Handle Page Down - move cursor and scroll
   */
  private handlePageDown(): void {
    const pageSize = Math.max(1, this.viewportManager.getState().height - 2);
    
    // Move cursor down by page size
    const cursor = this.cursorManager.getCursor();
    const maxLine = this.document.getLineCount() - 1;
    const newLine = Math.min(maxLine, cursor.position.line + pageSize);
    this.cursorManager.setCursor({ line: newLine, column: cursor.position.column });
    
    // Scroll viewport
    this.viewportManager.scrollPageDown();
  }

  /**
   * Get current gutter width
   */
  getGutterWidth(): number {
    return this.gutterRenderer?.getWidth() ?? 0;
  }

  /**
   * Set gutter marker (breakpoint, bookmark, etc)
   */
  setGutterMarker(line: number, type: 'breakpoint' | 'bookmark' | 'error' | 'warning' | 'info', color?: RGBA): void {
    if (this.gutterRenderer) {
      this.gutterRenderer.addMarker({ line, type, color });
      this.needsUpdate();
    }
  }

  /**
   * Clear gutter markers
   */
  clearGutterMarkers(line?: number, type?: string): void {
    if (this.gutterRenderer) {
      if (line !== undefined) {
        this.gutterRenderer.removeMarkers(line, type);
      } else {
        // Clear all markers
        for (let i = 0; i < this.document.getLineCount(); i++) {
          this.gutterRenderer.removeMarkers(i);
        }
      }
      this.needsUpdate();
    }
  }
}