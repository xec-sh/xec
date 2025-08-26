/**
 * Document Manager - handles text content and line operations
 */

import type { Position, Range, DocumentChange } from '../types.js';

export class DocumentManager {
  private lines: string[] = [''];
  private _version: number = 0;
  
  constructor(content: string = '') {
    this.setText(content);
  }
  
  /**
   * Get the full text content
   */
  getText(): string {
    return this.lines.join('\n');
  }
  
  /**
   * Set the full text content
   */
  setText(content: string): void {
    this.lines = content ? content.split('\n') : [''];
    this._version++;
  }
  
  /**
   * Get a specific line
   */
  getLine(lineNumber: number): string {
    if (lineNumber < 0 || lineNumber >= this.lines.length) {
      return '';
    }
    return this.lines[lineNumber] ?? '';
  }
  
  /**
   * Get total number of lines
   */
  getLineCount(): number {
    return this.lines.length;
  }
  
  /**
   * Get line length
   */
  getLineLength(lineNumber: number): number {
    return this.getLine(lineNumber).length;
  }
  
  /**
   * Get text in a range
   */
  getTextInRange(range: Range): string {
    const { start, end } = range;
    
    if (start.line === end.line) {
      // Single line selection
      const line = this.getLine(start.line);
      return line.substring(start.column, end.column);
    }
    
    // Multi-line selection
    const result: string[] = [];
    
    // First line
    result.push(this.getLine(start.line).substring(start.column));
    
    // Middle lines
    for (let i = start.line + 1; i < end.line; i++) {
      result.push(this.getLine(i));
    }
    
    // Last line
    result.push(this.getLine(end.line).substring(0, end.column));
    
    return result.join('\n');
  }
  
  /**
   * Insert text at position
   */
  insertText(position: Position, text: string): DocumentChange {
    // Extend document if position is beyond current lines
    while (position.line >= this.lines.length) {
      this.lines.push('');
    }
    
    const { line, column } = this.normalizePosition(position);
    const currentLine = this.getLine(line);
    
    if (!text.includes('\n')) {
      // Single line insertion
      const newLine = 
        currentLine.substring(0, column) + 
        text + 
        currentLine.substring(column);
      this.lines[line] = newLine;
      
      this._version++;
      return {
        range: { start: position, end: position },
        text,
        timestamp: Date.now()
      };
    }
    
    // Multi-line insertion
    const insertLines = text.split('\n');
    const before = currentLine.substring(0, column);
    const after = currentLine.substring(column);
    
    // First line
    this.lines[line] = before + insertLines[0];
    
    // Insert middle lines
    for (let i = 1; i < insertLines.length - 1; i++) {
      this.lines.splice(line + i, 0, insertLines[i] ?? '');
    }
    
    // Last line
    if (insertLines.length > 1) {
      this.lines.splice(line + insertLines.length - 1, 0, (insertLines[insertLines.length - 1] ?? '') + after);
    }
    
    this._version++;
    return {
      range: { start: position, end: position },
      text,
      timestamp: Date.now()
    };
  }
  
  /**
   * Delete text in range
   */
  deleteText(range: Range): DocumentChange {
    const { start, end } = this.normalizeRange(range);
    const deletedText = this.getTextInRange({ start, end });
    
    if (start.line === end.line) {
      // Single line deletion
      const line = this.getLine(start.line);
      this.lines[start.line] = 
        line.substring(0, start.column) + 
        line.substring(end.column);
    } else {
      // Multi-line deletion
      const firstLine = this.getLine(start.line);
      const lastLine = this.getLine(end.line);
      
      // Combine first and last line
      this.lines[start.line] = 
        firstLine.substring(0, start.column) + 
        lastLine.substring(end.column);
      
      // Remove lines in between
      this.lines.splice(start.line + 1, end.line - start.line);
    }
    
    this._version++;
    return {
      range: { start, end },
      text: '',
      timestamp: Date.now()
    };
  }
  
  /**
   * Replace text in range
   */
  replaceText(range: Range, text: string): DocumentChange {
    this.deleteText(range);
    return this.insertText(range.start, text);
  }
  
  /**
   * Normalize position to valid bounds
   */
  normalizePosition(position: Position): Position {
    let { line, column } = position;
    
    // Clamp line
    line = Math.max(0, Math.min(line, this.lines.length - 1));
    
    // Clamp column
    const lineLength = this.getLineLength(line);
    column = Math.max(0, Math.min(column, lineLength));
    
    return { line, column };
  }
  
  /**
   * Normalize range to valid bounds
   */
  normalizeRange(range: Range): Range {
    const start = this.normalizePosition(range.start);
    const end = this.normalizePosition(range.end);
    
    // Ensure start comes before end
    if (start.line > end.line || 
        (start.line === end.line && start.column > end.column)) {
      return { start: end, end: start };
    }
    
    return { start, end };
  }
  
  /**
   * Get position after applying offset
   */
  offsetPosition(position: Position, offset: number): Position {
    let { line, column } = position;
    let remaining = offset;
    
    if (offset > 0) {
      // Move forward
      while (remaining > 0 && line < this.lines.length) {
        const lineLength = this.getLineLength(line);
        const availableOnLine = lineLength - column;
        
        if (remaining <= availableOnLine) {
          column += remaining;
          remaining = 0;
        } else {
          remaining -= availableOnLine + 1; // +1 for newline
          line++;
          column = 0;
        }
      }
    } else {
      // Move backward
      remaining = Math.abs(remaining);
      while (remaining > 0 && (line > 0 || column > 0)) {
        if (column >= remaining) {
          column -= remaining;
          remaining = 0;
        } else {
          remaining -= column + 1; // +1 for newline
          line--;
          if (line >= 0) {
            column = this.getLineLength(line);
          }
        }
      }
    }
    
    return this.normalizePosition({ line, column });
  }
  
  /**
   * Get character at position
   */
  getCharAt(position: Position): string {
    const { line, column } = this.normalizePosition(position);
    const lineText = this.getLine(line);
    
    if (column >= lineText.length) {
      return line < this.lines.length - 1 ? '\n' : '';
    }
    
    return lineText[column] ?? '';
  }
  
  /**
   * Find next word boundary
   */
  findWordBoundary(position: Position, direction: 'forward' | 'backward'): Position {
    let { line, column } = this.normalizePosition(position);
    const isWordChar = (char: string) => /\w/.test(char);
    
    if (direction === 'forward') {
      // Skip current word
      while (line < this.lines.length) {
        const lineText = this.getLine(line);
        while (column < lineText.length && isWordChar(lineText[column] ?? '')) {
          column++;
        }
        
        // Skip whitespace
        while (column < lineText.length && !isWordChar(lineText[column] ?? '')) {
          column++;
        }
        
        if (column < lineText.length) {
          break;
        }
        
        // Move to next line
        if (line < this.lines.length - 1) {
          line++;
          column = 0;
        } else {
          break;
        }
      }
    } else {
      // Move backward
      while (line >= 0) {
        const lineText = this.getLine(line);
        
        // If at start of line, move to end of previous line
        if (column === 0) {
          if (line > 0) {
            line--;
            column = this.getLineLength(line);
            continue;
          } else {
            break;
          }
        }
        
        // Skip whitespace backwards
        while (column > 0 && !isWordChar(lineText[column - 1] ?? '')) {
          column--;
        }
        
        // Skip word backwards
        while (column > 0 && isWordChar(lineText[column - 1] ?? '')) {
          column--;
        }
        
        break;
      }
    }
    
    return { line, column };
  }
  
  /**
   * Get document version
   */
  get version(): number {
    return this._version;
  }

  /**
   * Get content (alias for getText)
   */
  getContent(): string {
    return this.getText();
  }

  /**
   * Get word range at position
   */
  getWordRangeAtPosition(position: Position): Range | null {
    const { line, column } = this.normalizePosition(position);
    const lineText = this.getLine(line);
    
    if (!lineText) return null;
    
    const isWordChar = (char: string) => /\w/.test(char);
    
    // Check if we're on a word character
    if (column >= lineText.length || !isWordChar(lineText[column] ?? '')) {
      // Check if we're right after a word
      if (column > 0 && isWordChar(lineText[column - 1] ?? '')) {
        // Use position before cursor
      } else {
        return null;
      }
    }
    
    // Find word start
    let start = column;
    while (start > 0 && isWordChar(lineText[start - 1] ?? '')) {
      start--;
    }
    
    // Find word end
    let end = column;
    while (end < lineText.length && isWordChar(lineText[end] ?? '')) {
      end++;
    }
    
    if (start === end) return null;
    
    return {
      start: { line, column: start },
      end: { line, column: end }
    };
  }

  /**
   * Find next occurrence of text
   */
  findNext(searchText: string, fromPosition: Position, options?: { caseSensitive?: boolean; wholeWord?: boolean }): Range | null {
    if (!searchText) return null;
    
    const { caseSensitive = false, wholeWord = false } = options || {};
    const searchStr = caseSensitive ? searchText : searchText.toLowerCase();
    const { line: startLine, column: startColumn } = this.normalizePosition(fromPosition);
    
    for (let lineNum = startLine; lineNum < this.lines.length; lineNum++) {
      const lineText = this.lines[lineNum] ?? '';
      const compareText = caseSensitive ? lineText : lineText.toLowerCase();
      const startCol = lineNum === startLine ? startColumn : 0;
      
      let index = compareText.indexOf(searchStr, startCol);
      
      while (index !== -1) {
        // Check whole word constraint
        if (wholeWord) {
          const before = index > 0 ? (lineText[index - 1] ?? ' ') : ' ';
          const after = index + searchText.length < lineText.length ? 
                       (lineText[index + searchText.length] ?? ' ') : ' ';
          
          if (/\w/.test(before ?? ' ') || /\w/.test(after ?? ' ')) {
            index = compareText.indexOf(searchStr, index + 1);
            continue;
          }
        }
        
        return {
          start: { line: lineNum, column: index },
          end: { line: lineNum, column: index + searchText.length }
        };
      }
    }
    
    return null;
  }

  /**
   * Find all occurrences of text
   */
  findAll(searchText: string, options?: { caseSensitive?: boolean; wholeWord?: boolean }): Range[] {
    if (!searchText) return [];
    
    const results: Range[] = [];
    const { caseSensitive = false, wholeWord = false } = options || {};
    const searchStr = caseSensitive ? searchText : searchText.toLowerCase();
    
    for (let lineNum = 0; lineNum < this.lines.length; lineNum++) {
      const lineText = this.lines[lineNum] ?? '';
      const compareText = caseSensitive ? lineText : lineText.toLowerCase();
      
      let index = compareText.indexOf(searchStr);
      
      while (index !== -1) {
        // Check whole word constraint
        if (wholeWord) {
          const before = index > 0 ? (lineText[index - 1] ?? ' ') : ' ';
          const after = index + searchText.length < lineText.length ? 
                       (lineText[index + searchText.length] ?? ' ') : ' ';
          
          if (!/\w/.test(before) && !/\w/.test(after)) {
            results.push({
              start: { line: lineNum, column: index },
              end: { line: lineNum, column: index + searchText.length }
            });
          }
        } else {
          results.push({
            start: { line: lineNum, column: index },
            end: { line: lineNum, column: index + searchText.length }
          });
        }
        
        index = compareText.indexOf(searchStr, index + 1);
      }
    }
    
    return results;
  }
}