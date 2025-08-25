/**
 * Cursor Manager - handles cursor position and movement
 */

import type { Range, Position, CursorState } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';

export class CursorManager {
  private cursor: CursorState;
  private document: DocumentManager;

  constructor(document: DocumentManager) {
    this.document = document;
    this.cursor = {
      position: { line: 0, column: 0 },
      preferredColumn: 0
    };
  }

  /**
   * Get current cursor state
   */
  getCursor(): CursorState {
    return { ...this.cursor };
  }

  /**
   * Set cursor position
   */
  setCursor(position: Position, maintainSelection = false): void {
    const normalizedPos = this.document.normalizePosition(position);

    if (!maintainSelection) {
      this.cursor = {
        position: normalizedPos,
        preferredColumn: normalizedPos.column
      };
    } else if (this.cursor.selection) {
      // Extend selection
      const anchor = this.cursor.selection.start;
      this.cursor.position = normalizedPos;
      this.cursor.selection = { start: anchor, end: normalizedPos };
    } else {
      // Start new selection
      const anchor = this.cursor.position;
      this.cursor.position = normalizedPos;
      this.cursor.selection = { start: anchor, end: normalizedPos };
    }
  }

  /**
   * Move cursor by offset
   */
  moveByOffset(offset: number, maintainSelection = false): void {
    const newPosition = this.document.offsetPosition(this.cursor.position, offset);
    this.setCursor(newPosition, maintainSelection);
  }

  /**
   * Move cursor up
   */
  moveUp(lines = 1, maintainSelection = false): void {
    const { line } = this.cursor.position;
    const newLine = Math.max(0, line - lines);
    const lineLength = this.document.getLineLength(newLine);
    const column = Math.min(this.cursor.preferredColumn || 0, lineLength);

    this.setCursor({ line: newLine, column }, maintainSelection);

    // Preserve preferred column for vertical movement
    if (!maintainSelection) {
      this.cursor.preferredColumn = this.cursor.preferredColumn || this.cursor.position.column;
    }
  }

  /**
   * Move cursor down
   */
  moveDown(lines = 1, maintainSelection = false): void {
    const { line } = this.cursor.position;
    const maxLine = this.document.getLineCount() - 1;
    const newLine = Math.min(maxLine, line + lines);
    const lineLength = this.document.getLineLength(newLine);
    const column = Math.min(this.cursor.preferredColumn || 0, lineLength);

    this.setCursor({ line: newLine, column }, maintainSelection);

    // Preserve preferred column for vertical movement
    if (!maintainSelection) {
      this.cursor.preferredColumn = this.cursor.preferredColumn || this.cursor.position.column;
    }
  }

  /**
   * Move cursor left
   */
  moveLeft(columns = 1, maintainSelection = false): void {
    const { line, column } = this.cursor.position;

    if (column > 0) {
      // Move within line
      this.setCursor({ line, column: column - columns }, maintainSelection);
    } else if (line > 0) {
      // Move to end of previous line
      const prevLineLength = this.document.getLineLength(line - 1);
      this.setCursor({ line: line - 1, column: prevLineLength }, maintainSelection);
    }

    // Reset preferred column for horizontal movement
    if (!maintainSelection) {
      this.cursor.preferredColumn = this.cursor.position.column;
    }
  }

  /**
   * Move cursor right
   */
  moveRight(columns = 1, maintainSelection = false): void {
    const { line, column } = this.cursor.position;
    const lineLength = this.document.getLineLength(line);

    if (column < lineLength) {
      // Move within line
      this.setCursor({ line, column: column + columns }, maintainSelection);
    } else if (line < this.document.getLineCount() - 1) {
      // Move to start of next line
      this.setCursor({ line: line + 1, column: 0 }, maintainSelection);
    }

    // Reset preferred column for horizontal movement
    if (!maintainSelection) {
      this.cursor.preferredColumn = this.cursor.position.column;
    }
  }

  /**
   * Move to start of line
   */
  moveToLineStart(maintainSelection = false): void {
    const { line } = this.cursor.position;
    this.setCursor({ line, column: 0 }, maintainSelection);
    this.cursor.preferredColumn = 0;
  }

  /**
   * Move to end of line
   */
  moveToLineEnd(maintainSelection = false): void {
    const { line } = this.cursor.position;
    const lineLength = this.document.getLineLength(line);
    this.setCursor({ line, column: lineLength }, maintainSelection);
    this.cursor.preferredColumn = lineLength;
  }

  /**
   * Move to start of document
   */
  moveToDocumentStart(maintainSelection = false): void {
    this.setCursor({ line: 0, column: 0 }, maintainSelection);
    this.cursor.preferredColumn = 0;
  }

  /**
   * Move to end of document
   */
  moveToDocumentEnd(maintainSelection = false): void {
    const lastLine = this.document.getLineCount() - 1;
    const lastLineLength = this.document.getLineLength(lastLine);
    this.setCursor({ line: lastLine, column: lastLineLength }, maintainSelection);
    this.cursor.preferredColumn = lastLineLength;
  }

  /**
   * Move to next word
   */
  moveToNextWord(maintainSelection = false): void {
    const newPosition = this.document.findWordBoundary(this.cursor.position, 'forward');
    this.setCursor(newPosition, maintainSelection);
    this.cursor.preferredColumn = newPosition.column;
  }

  /**
   * Move to previous word
   */
  moveToPreviousWord(maintainSelection = false): void {
    const newPosition = this.document.findWordBoundary(this.cursor.position, 'backward');
    this.setCursor(newPosition, maintainSelection);
    this.cursor.preferredColumn = newPosition.column;
  }

  /**
   * Get current selection
   */
  getSelection(): Range | null {
    return this.cursor.selection || null;
  }

  /**
   * Set selection
   */
  setSelection(range: Range): void {
    // Don't normalize - preserve the direction
    this.cursor.selection = range;
    this.cursor.position = range.end;
    this.cursor.preferredColumn = range.end.column;
    // Track the anchor (start of selection)
    this.cursor.selectionAnchor = range.start;
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.cursor.selection = undefined;
  }

  /**
   * Select all text
   */
  selectAll(): void {
    const lastLine = this.document.getLineCount() - 1;
    const lastLineLength = this.document.getLineLength(lastLine);

    this.setSelection({
      start: { line: 0, column: 0 },
      end: { line: lastLine, column: lastLineLength }
    });
  }

  /**
   * Select current word
   */
  selectWord(): void {
    const start = this.document.findWordBoundary(this.cursor.position, 'backward');
    const end = this.document.findWordBoundary(this.cursor.position, 'forward');

    if (start.line !== end.line || start.column !== end.column) {
      this.setSelection({ start, end });
    }
  }

  /**
   * Select current line
   */
  selectLine(): void {
    const { line } = this.cursor.position;
    const lineLength = this.document.getLineLength(line);

    this.setSelection({
      start: { line, column: 0 },
      end: { line, column: lineLength }
    });
  }

  /**
   * Check if position is in selection
   */
  isInSelection(position: Position): boolean {
    if (!this.cursor.selection) {
      return false;
    }

    const { start, end } = this.cursor.selection;
    const pos = this.document.normalizePosition(position);

    if (pos.line < start.line || pos.line > end.line) {
      return false;
    }

    if (pos.line === start.line && pos.column < start.column) {
      return false;
    }

    if (pos.line === end.line && pos.column > end.column) {
      return false;
    }

    return true;
  }
}