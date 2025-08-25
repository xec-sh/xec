/**
 * Multi-Cursor Manager - handles multiple cursors and their operations
 * Part of Phase 3: Advanced Editing
 */

import type { Position, CursorState, Range } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';

export interface MultiCursorState extends CursorState {
  id: number;
  isPrimary?: boolean;
}

export class MultiCursorManager {
  private cursors: Map<number, MultiCursorState> = new Map();
  private primaryCursorId = 0;
  private nextCursorId = 1;
  private document: DocumentManager;

  constructor(document: DocumentManager) {
    this.document = document;
    // Initialize with a single primary cursor
    this.addCursor({ line: 0, column: 0 }, true);
  }

  /**
   * Add a new cursor at the specified position
   */
  addCursor(position: Position, isPrimary = false): number {
    const normalizedPos = this.document.normalizePosition(position);
    
    // Check if a cursor already exists at this position
    for (const cursor of this.cursors.values()) {
      if (cursor.position.line === normalizedPos.line && 
          cursor.position.column === normalizedPos.column) {
        return cursor.id;
      }
    }

    const cursorId = this.nextCursorId++;
    const cursor: MultiCursorState = {
      id: cursorId,
      position: normalizedPos,
      preferredColumn: normalizedPos.column,
      isPrimary: isPrimary
    };

    if (isPrimary) {
      // Remove primary flag from existing cursors
      for (const c of this.cursors.values()) {
        c.isPrimary = false;
      }
      this.primaryCursorId = cursorId;
    }

    this.cursors.set(cursorId, cursor);
    return cursorId;
  }

  /**
   * Remove a cursor by ID
   */
  removeCursor(cursorId: number): void {
    if (this.cursors.size <= 1) {
      return; // Always keep at least one cursor
    }

    const cursor = this.cursors.get(cursorId);
    if (!cursor) return;

    this.cursors.delete(cursorId);

    // If we removed the primary cursor, make the first cursor primary
    if (cursor.isPrimary && this.cursors.size > 0) {
      const firstCursor = this.cursors.values().next().value;
      if (firstCursor) {
        firstCursor.isPrimary = true;
        this.primaryCursorId = firstCursor.id;
      }
    }
  }

  /**
   * Clear all cursors except the primary one
   */
  clearSecondaryCursors(): void {
    const primaryCursor = this.cursors.get(this.primaryCursorId);
    this.cursors.clear();
    if (primaryCursor) {
      this.cursors.set(this.primaryCursorId, primaryCursor);
    } else {
      // Create a new primary cursor if none exists
      this.addCursor({ line: 0, column: 0 }, true);
    }
  }

  /**
   * Get all cursors
   */
  getAllCursors(): MultiCursorState[] {
    return Array.from(this.cursors.values());
  }

  /**
   * Get primary cursor
   */
  getPrimaryCursor(): MultiCursorState | undefined {
    return this.cursors.get(this.primaryCursorId);
  }

  /**
   * Get cursors on a specific line
   */
  getCursorsOnLine(line: number): MultiCursorState[] {
    return Array.from(this.cursors.values()).filter(c => c.position.line === line);
  }

  /**
   * Move all cursors in a direction
   */
  moveAllCursors(
    direction: 'up' | 'down' | 'left' | 'right',
    amount = 1,
    maintainSelection = false
  ): void {
    for (const cursor of this.cursors.values()) {
      this.moveCursor(cursor.id, direction, amount, maintainSelection);
    }
  }

  /**
   * Move a specific cursor
   */
  private moveCursor(
    cursorId: number,
    direction: 'up' | 'down' | 'left' | 'right',
    amount = 1,
    maintainSelection = false
  ): void {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) return;

    let newPosition: Position;

    switch (direction) {
      case 'up':
        newPosition = this.moveUp(cursor, amount);
        break;
      case 'down':
        newPosition = this.moveDown(cursor, amount);
        break;
      case 'left':
        newPosition = this.moveLeft(cursor, amount);
        break;
      case 'right':
        newPosition = this.moveRight(cursor, amount);
        break;
    }

    if (maintainSelection) {
      if (!cursor.selection) {
        cursor.selection = { start: cursor.position, end: newPosition };
      } else {
        cursor.selection.end = newPosition;
      }
    } else {
      cursor.selection = undefined;
    }

    cursor.position = newPosition;
    
    // Update preferred column for vertical movement
    if (direction === 'left' || direction === 'right') {
      cursor.preferredColumn = newPosition.column;
    }
  }

  private moveUp(cursor: MultiCursorState, lines: number): Position {
    const newLine = Math.max(0, cursor.position.line - lines);
    const lineLength = this.document.getLineLength(newLine);
    const column = Math.min(cursor.preferredColumn || 0, lineLength);
    return { line: newLine, column };
  }

  private moveDown(cursor: MultiCursorState, lines: number): Position {
    const maxLine = this.document.getLineCount() - 1;
    const newLine = Math.min(maxLine, cursor.position.line + lines);
    const lineLength = this.document.getLineLength(newLine);
    const column = Math.min(cursor.preferredColumn || 0, lineLength);
    return { line: newLine, column };
  }

  private moveLeft(cursor: MultiCursorState, columns: number): Position {
    const { line, column } = cursor.position;
    if (column >= columns) {
      return { line, column: column - columns };
    } else if (line > 0) {
      const prevLineLength = this.document.getLineLength(line - 1);
      return { line: line - 1, column: prevLineLength };
    }
    return { line: 0, column: 0 };
  }

  private moveRight(cursor: MultiCursorState, columns: number): Position {
    const { line, column } = cursor.position;
    const lineLength = this.document.getLineLength(line);
    
    if (column + columns <= lineLength) {
      return { line, column: column + columns };
    } else if (line < this.document.getLineCount() - 1) {
      return { line: line + 1, column: 0 };
    }
    return { line, column: lineLength };
  }

  /**
   * Insert text at all cursor positions
   */
  insertTextAtAllCursors(text: string): Array<{ position: Position; text: string }> {
    const edits: Array<{ position: Position; text: string }> = [];
    
    // Sort cursors by position (bottom to top, right to left) to avoid position shifts
    const sortedCursors = this.getAllCursors().sort((a, b) => {
      if (a.position.line !== b.position.line) {
        return b.position.line - a.position.line;
      }
      return b.position.column - a.position.column;
    });

    for (const cursor of sortedCursors) {
      edits.push({
        position: cursor.position,
        text
      });
    }

    return edits;
  }

  /**
   * Delete text at all cursor positions
   */
  deleteAtAllCursors(direction: 'backward' | 'forward'): Range[] {
    const ranges: Range[] = [];

    for (const cursor of this.cursors.values()) {
      if (cursor.selection) {
        ranges.push(cursor.selection);
      } else {
        const start = cursor.position;
        const end = direction === 'backward'
          ? this.moveLeft(cursor, 1)
          : this.moveRight(cursor, 1);
        
        if (start.line !== end.line || start.column !== end.column) {
          ranges.push(direction === 'backward' 
            ? { start: end, end: start }
            : { start, end });
        }
      }
    }

    return ranges;
  }

  /**
   * Select next occurrence of the word at cursor
   * Used for Ctrl+D functionality
   */
  selectNextOccurrence(): void {
    const primaryCursor = this.getPrimaryCursor();
    if (!primaryCursor) return;

    // Get the word at the primary cursor
    const wordRange = this.document.getWordRangeAtPosition(primaryCursor.position);
    if (!wordRange) return;

    const word = this.document.getTextInRange(wordRange);
    if (!word) return;

    // Find next occurrence
    const searchStart = primaryCursor.selection?.end || wordRange.end;
    const nextOccurrence = this.document.findNext(word, searchStart);

    if (nextOccurrence) {
      // Add a new cursor at the next occurrence
      const newCursorId = this.addCursor(nextOccurrence.start);
      const newCursor = this.cursors.get(newCursorId);
      if (newCursor) {
        newCursor.selection = nextOccurrence;
      }
    }
  }

  /**
   * Add cursors at all occurrences of the selected text
   */
  selectAllOccurrences(): void {
    const primaryCursor = this.getPrimaryCursor();
    if (!primaryCursor) return;

    const wordRange = primaryCursor.selection || 
                     this.document.getWordRangeAtPosition(primaryCursor.position);
    if (!wordRange) return;

    const text = this.document.getTextInRange(wordRange);
    if (!text) return;

    // Find all occurrences
    const occurrences = this.document.findAll(text);
    
    // Clear existing cursors
    this.clearSecondaryCursors();

    // Add cursor at each occurrence
    for (const range of occurrences) {
      const cursorId = this.addCursor(range.start, 
        range.start.line === wordRange.start.line && 
        range.start.column === wordRange.start.column);
      
      const cursor = this.cursors.get(cursorId);
      if (cursor) {
        cursor.selection = range;
      }
    }
  }

  /**
   * Merge overlapping selections
   */
  mergeOverlappingSelections(): void {
    const cursorsArray = Array.from(this.cursors.values());
    const toRemove: number[] = [];

    for (let i = 0; i < cursorsArray.length; i++) {
      for (let j = i + 1; j < cursorsArray.length; j++) {
        const cursor1 = cursorsArray[i];
        const cursor2 = cursorsArray[j];

        if (!cursor1 || !cursor2 || !cursor1.selection || !cursor2.selection) continue;

        // Check if selections overlap
        if (this.selectionsOverlap(cursor1.selection, cursor2.selection)) {
          // Merge selections
          const merged = this.mergeRanges(cursor1.selection, cursor2.selection);
          cursor1.selection = merged;
          cursor1.position = merged.end;
          toRemove.push(cursor2.id);
        }
      }
    }

    // Remove merged cursors
    for (const id of toRemove) {
      this.removeCursor(id);
    }
  }

  private selectionsOverlap(range1: Range, range2: Range): boolean {
    const r1Start = this.positionToOffset(range1.start);
    const r1End = this.positionToOffset(range1.end);
    const r2Start = this.positionToOffset(range2.start);
    const r2End = this.positionToOffset(range2.end);

    return !(r1End < r2Start || r2End < r1Start);
  }

  private mergeRanges(range1: Range, range2: Range): Range {
    const start = this.positionToOffset(range1.start) < this.positionToOffset(range2.start)
      ? range1.start : range2.start;
    const end = this.positionToOffset(range1.end) > this.positionToOffset(range2.end)
      ? range1.end : range2.end;
    return { start, end };
  }

  private positionToOffset(position: Position): number {
    let offset = 0;
    for (let i = 0; i < position.line; i++) {
      offset += this.document.getLineLength(i) + 1; // +1 for newline
    }
    return offset + position.column;
  }
  
  /**
   * Add cursor at next occurrence of selected text
   */
  addNextOccurrence(): boolean {
    const primaryCursor = this.cursors.get(this.primaryCursorId);
    if (!primaryCursor || !primaryCursor.selection) {
      return false;
    }
    
    // Get selected text from primary cursor
    const { start, end } = primaryCursor.selection;
    let selectedText = '';
    
    if (start.line === end.line) {
      const lineText = this.document.getLine(start.line);
      selectedText = lineText.substring(start.column, end.column);
    } else {
      // Multi-line selection - not supported for now
      return false;
    }
    
    if (!selectedText) {
      return false;
    }
    
    // Find next occurrence after the last cursor
    let searchFromPosition = primaryCursor.position;
    for (const cursor of this.cursors.values()) {
      if (cursor.position.line > searchFromPosition.line ||
          (cursor.position.line === searchFromPosition.line && 
           cursor.position.column > searchFromPosition.column)) {
        searchFromPosition = cursor.position;
      }
    }
    
    // Search for next occurrence
    const nextMatch = this.document.findNext(selectedText, searchFromPosition, {
      caseSensitive: true,
      wholeWord: false
    });
    
    if (nextMatch) {
      // Add cursor at the match
      const cursorId = this.addCursor(nextMatch.start);
      const newCursor = this.cursors.get(cursorId);
      if (newCursor) {
        newCursor.selection = nextMatch;
        newCursor.position = nextMatch.end;
      }
      return true;
    }
    
    // Try searching from beginning if no match found after current position
    const matchFromBeginning = this.document.findNext(selectedText, { line: 0, column: 0 }, {
      caseSensitive: true,
      wholeWord: false
    });
    
    if (matchFromBeginning && 
        (matchFromBeginning.start.line < primaryCursor.position.line ||
         (matchFromBeginning.start.line === primaryCursor.position.line && 
          matchFromBeginning.start.column < primaryCursor.position.column))) {
      // Add cursor at the match
      const cursorId = this.addCursor(matchFromBeginning.start);
      const newCursor = this.cursors.get(cursorId);
      if (newCursor) {
        newCursor.selection = matchFromBeginning;
        newCursor.position = matchFromBeginning.end;
      }
      return true;
    }
    
    return false;
  }
}