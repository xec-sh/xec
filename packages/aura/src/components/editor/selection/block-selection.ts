/**
 * Block Selection - handles column/block selection mode
 * Part of Phase 3: Advanced Editing
 */

import type { Position, Range } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';

export interface BlockSelection {
  anchor: Position;
  head: Position;
  startColumn: number;
  endColumn: number;
}

export class BlockSelectionManager {
  private document: DocumentManager;
  private blockSelection: BlockSelection | null = null;

  constructor(document: DocumentManager) {
    this.document = document;
  }

  /**
   * Start a block selection from the given position
   */
  startBlockSelection(anchor: Position): void {
    const normalized = this.document.normalizePosition(anchor);
    this.blockSelection = {
      anchor: normalized,
      head: normalized,
      startColumn: normalized.column,
      endColumn: normalized.column
    };
  }

  /**
   * Extend block selection to the given position
   */
  extendBlockSelection(head: Position): void {
    if (!this.blockSelection) {
      this.startBlockSelection(head);
      return;
    }

    const normalized = this.document.normalizePosition(head);
    this.blockSelection.head = normalized;

    // Update column range
    const anchorCol = this.blockSelection.anchor.column;
    const headCol = normalized.column;
    
    this.blockSelection.startColumn = Math.min(anchorCol, headCol);
    this.blockSelection.endColumn = Math.max(anchorCol, headCol);
  }

  /**
   * Get the current block selection
   */
  getBlockSelection(): BlockSelection | null {
    return this.blockSelection;
  }

  /**
   * Clear the block selection
   */
  clearBlockSelection(): void {
    this.blockSelection = null;
  }

  /**
   * Get all ranges covered by the block selection
   */
  getBlockSelectionRanges(): Range[] {
    if (!this.blockSelection) return [];

    const ranges: Range[] = [];
    const { anchor, head, startColumn, endColumn } = this.blockSelection;
    
    const startLine = Math.min(anchor.line, head.line);
    const endLine = Math.max(anchor.line, head.line);

    for (let line = startLine; line <= endLine; line++) {
      const lineLength = this.document.getLineLength(line);
      
      // Skip empty lines or lines shorter than start column
      if (lineLength === 0 || lineLength < startColumn) {
        continue;
      }

      const start: Position = { line, column: startColumn };
      const end: Position = { 
        line, 
        column: Math.min(endColumn, lineLength) 
      };

      ranges.push({ start, end });
    }

    return ranges;
  }

  /**
   * Get cursor positions for block selection (one per line)
   */
  getBlockSelectionCursors(): Position[] {
    if (!this.blockSelection) return [];

    const cursors: Position[] = [];
    const { anchor, head, endColumn } = this.blockSelection;
    
    const startLine = Math.min(anchor.line, head.line);
    const endLine = Math.max(anchor.line, head.line);

    for (let line = startLine; line <= endLine; line++) {
      const lineLength = this.document.getLineLength(line);
      const column = Math.min(endColumn, lineLength);
      cursors.push({ line, column });
    }

    return cursors;
  }

  /**
   * Insert text at all block selection positions
   */
  insertTextInBlock(text: string): Array<{ position: Position; text: string }> {
    const edits: Array<{ position: Position; text: string }> = [];
    const cursors = this.getBlockSelectionCursors();

    // Insert from bottom to top to avoid position shifts
    for (let i = cursors.length - 1; i >= 0; i--) {
      edits.push({
        position: cursors[i],
        text
      });
    }

    return edits;
  }

  /**
   * Delete the block selection
   */
  deleteBlockSelection(): Range[] {
    return this.getBlockSelectionRanges();
  }

  /**
   * Expand block selection by word boundaries
   */
  expandBlockSelectionByWord(): void {
    if (!this.blockSelection) return;

    const { anchor, head } = this.blockSelection;
    const startLine = Math.min(anchor.line, head.line);
    const endLine = Math.max(anchor.line, head.line);

    let minStartColumn = Infinity;
    let maxEndColumn = 0;

    // Find the minimum start and maximum end columns across all lines
    for (let line = startLine; line <= endLine; line++) {
      const lineText = this.document.getLine(line);
      if (!lineText) continue;

      // Find word boundaries at current column positions
      const startPos: Position = { line, column: this.blockSelection.startColumn };
      const endPos: Position = { line, column: this.blockSelection.endColumn };

      const wordStart = this.document.findWordBoundary(startPos, 'backward');
      const wordEnd = this.document.findWordBoundary(endPos, 'forward');

      if (wordStart.line === line) {
        minStartColumn = Math.min(minStartColumn, wordStart.column);
      }
      if (wordEnd.line === line) {
        maxEndColumn = Math.max(maxEndColumn, wordEnd.column);
      }
    }

    if (minStartColumn !== Infinity && maxEndColumn > 0) {
      this.blockSelection.startColumn = minStartColumn;
      this.blockSelection.endColumn = maxEndColumn;
    }
  }

  /**
   * Check if a position is within the block selection
   */
  isInBlockSelection(position: Position): boolean {
    if (!this.blockSelection) return false;

    const { anchor, head, startColumn, endColumn } = this.blockSelection;
    const startLine = Math.min(anchor.line, head.line);
    const endLine = Math.max(anchor.line, head.line);

    return position.line >= startLine && 
           position.line <= endLine &&
           position.column >= startColumn && 
           position.column <= endColumn;
  }

  /**
   * Convert block selection to multiple normal selections
   */
  toMultipleSelections(): Range[] {
    return this.getBlockSelectionRanges();
  }

  /**
   * Align text in block selection (add spaces to make all lines same length)
   */
  alignBlockSelection(): Array<{ position: Position; text: string }> {
    if (!this.blockSelection) return [];

    const edits: Array<{ position: Position; text: string }> = [];
    const ranges = this.getBlockSelectionRanges();
    
    // Find the maximum end column
    let maxColumn = 0;
    for (const range of ranges) {
      maxColumn = Math.max(maxColumn, range.end.column);
    }

    // Add spaces to align all lines
    for (const range of ranges) {
      const spacesToAdd = maxColumn - range.end.column;
      if (spacesToAdd > 0) {
        edits.push({
          position: range.end,
          text: ' '.repeat(spacesToAdd)
        });
      }
    }

    return edits;
  }

  // === Alias methods for compatibility ===

  /**
   * Start block selection (alias)
   */
  start(anchor: Position): void {
    this.startBlockSelection(anchor);
  }

  /**
   * Expand block selection (alias)
   */
  expand(head: Position): void {
    this.extendBlockSelection(head);
  }

  /**
   * Expand to position (alias)
   */
  expandTo(head: Position): void {
    this.extendBlockSelection(head);
  }

  /**
   * Get selection (alias)
   */
  getSelection(): BlockSelection | null {
    return this.getBlockSelection();
  }

  /**
   * Check if block selection is active
   */
  isActive(): boolean {
    return this.blockSelection !== null;
  }

  /**
   * Get anchor position
   */
  getAnchor(): Position | null {
    return this.blockSelection?.anchor || null;
  }

  /**
   * Clear selection (alias)
   */
  clear(): void {
    this.clearBlockSelection();
  }

  /**
   * Get cursors (alias)
   */
  getCursors(): Position[] {
    return this.getBlockSelectionCursors();
  }

  /**
   * Insert text (alias)
   */
  insertText(text: string): Array<{ position: Position; text: string }> {
    return this.insertTextInBlock(text);
  }

  /**
   * Delete selection (alias)
   */
  deleteSelection(): Range[] {
    return this.deleteBlockSelection();
  }

  /**
   * Get selection ranges (alias)
   */
  getSelectionRanges(): Range[] {
    return this.getBlockSelectionRanges();
  }

  /**
   * Move block selection
   */
  move(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.blockSelection) return;

    const { anchor, head } = this.blockSelection;
    let newAnchor = { ...anchor };
    let newHead = { ...head };

    switch (direction) {
      case 'up':
        if (newAnchor.line > 0) newAnchor.line--;
        if (newHead.line > 0) newHead.line--;
        break;
      case 'down':
        if (newAnchor.line < this.document.getLineCount() - 1) newAnchor.line++;
        if (newHead.line < this.document.getLineCount() - 1) newHead.line++;
        break;
      case 'left':
        if (newAnchor.column > 0) newAnchor.column--;
        if (newHead.column > 0) newHead.column--;
        break;
      case 'right':
        newAnchor.column++;
        newHead.column++;
        break;
    }

    this.blockSelection.anchor = this.document.normalizePosition(newAnchor);
    this.blockSelection.head = this.document.normalizePosition(newHead);
    
    // Update column range
    const anchorCol = this.blockSelection.anchor.column;
    const headCol = this.blockSelection.head.column;
    this.blockSelection.startColumn = Math.min(anchorCol, headCol);
    this.blockSelection.endColumn = Math.max(anchorCol, headCol);
  }

  /**
   * Get selection info
   */
  getSelectionInfo(): { lineCount: number; columnCount: number; ranges: Range[] } | null {
    if (!this.blockSelection) return null;

    const ranges = this.getBlockSelectionRanges();
    const { anchor, head, startColumn, endColumn } = this.blockSelection;
    
    const lineCount = Math.abs(head.line - anchor.line) + 1;
    const columnCount = endColumn - startColumn;

    return {
      lineCount,
      columnCount,
      ranges
    };
  }

  /**
   * Get selected text
   */
  getSelectedText(): string[] {
    if (!this.blockSelection) return [];

    const ranges = this.getBlockSelectionRanges();
    const selectedTexts: string[] = [];

    for (const range of ranges) {
      const lineText = this.document.getLine(range.start.line);
      const text = lineText.substring(range.start.column, range.end.column);
      selectedTexts.push(text);
    }

    return selectedTexts;
  }
}