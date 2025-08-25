/**
 * Bracket Matcher - Find and highlight matching brackets
 * Part of Phase 3: Advanced Editing
 */

import type { Position, Range } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';

export interface BracketPair {
  open: string;
  close: string;
}

export interface MatchedBracket {
  bracket: string;
  position: Position;
  matchPosition: Position | null;
  isOpen: boolean;
}

export class BracketMatcher {
  private document: DocumentManager;
  private bracketPairs: Map<string, string> = new Map();
  private reverseBracketPairs: Map<string, string> = new Map();
  private allBrackets: Set<string> = new Set();

  // Default bracket pairs
  private static readonly DEFAULT_PAIRS: BracketPair[] = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '<', close: '>' }
  ];

  constructor(document: DocumentManager, customPairs?: BracketPair[]) {
    this.document = document;
    this.initializeBrackets(customPairs || BracketMatcher.DEFAULT_PAIRS);
  }

  /**
   * Initialize bracket pairs
   */
  private initializeBrackets(pairs: BracketPair[]): void {
    this.bracketPairs.clear();
    this.reverseBracketPairs.clear();
    this.allBrackets.clear();

    for (const pair of pairs) {
      this.bracketPairs.set(pair.open, pair.close);
      this.reverseBracketPairs.set(pair.close, pair.open);
      this.allBrackets.add(pair.open);
      this.allBrackets.add(pair.close);
    }
  }

  /**
   * Check if a character is a bracket
   */
  isBracket(char: string): boolean {
    return this.allBrackets.has(char);
  }

  /**
   * Check if a character is an opening bracket
   */
  isOpenBracket(char: string): boolean {
    return this.bracketPairs.has(char);
  }

  /**
   * Check if a character is a closing bracket
   */
  isCloseBracket(char: string): boolean {
    return this.reverseBracketPairs.has(char);
  }

  /**
   * Find the matching bracket for the bracket at the given position
   */
  findMatchingBracket(position: Position): MatchedBracket | null {
    const line = this.document.getLine(position.line);
    if (!line || position.column >= line.length) return null;

    const char = line[position.column] ?? '';
    if (!this.isBracket(char)) return null;

    const isOpen = this.isOpenBracket(char);
    const matchPosition = isOpen
      ? this.findClosingBracket(position, char)
      : this.findOpeningBracket(position, char);

    return {
      bracket: char,
      position,
      matchPosition,
      isOpen
    };
  }

  /**
   * Find the closing bracket for an opening bracket
   */
  private findClosingBracket(startPos: Position, openBracket: string): Position | null {
    const closeBracket = this.bracketPairs.get(openBracket);
    if (!closeBracket) return null;

    let depth = 1;
    let line = startPos.line;
    let column = startPos.column + 1;

    while (line < this.document.getLineCount()) {
      const lineText = this.document.getLine(line);
      if (!lineText) {
        line++;
        column = 0;
        continue;
      }

      while (column < lineText.length) {
        const char = lineText[column];
        
        // Skip strings and comments (simplified - should be language-aware)
        if (this.isInStringOrComment(line, column)) {
          column++;
          continue;
        }

        if (char === openBracket) {
          depth++;
        } else if (char === closeBracket) {
          depth--;
          if (depth === 0) {
            return { line, column };
          }
        }
        column++;
      }

      line++;
      column = 0;
    }

    return null;
  }

  /**
   * Find the opening bracket for a closing bracket
   */
  private findOpeningBracket(startPos: Position, closeBracket: string): Position | null {
    const openBracket = this.reverseBracketPairs.get(closeBracket);
    if (!openBracket) return null;

    let depth = 1;
    let line = startPos.line;
    let column = startPos.column - 1;

    while (line >= 0) {
      const lineText = this.document.getLine(line);
      if (!lineText) {
        line--;
        if (line >= 0) {
          column = this.document.getLineLength(line) - 1;
        }
        continue;
      }

      while (column >= 0) {
        const char = lineText[column];
        
        // Skip strings and comments
        if (this.isInStringOrComment(line, column)) {
          column--;
          continue;
        }

        if (char === closeBracket) {
          depth++;
        } else if (char === openBracket) {
          depth--;
          if (depth === 0) {
            return { line, column };
          }
        }
        column--;
      }

      line--;
      if (line >= 0) {
        column = this.document.getLineLength(line) - 1;
      }
    }

    return null;
  }

  /**
   * Find all bracket pairs in a range
   */
  findAllBracketPairs(range?: Range): Array<[Position, Position]> {
    const pairs: Array<[Position, Position]> = [];
    const stack: Array<{ bracket: string; position: Position }> = [];

    const startLine = range?.start.line || 0;
    const endLine = range?.end.line || this.document.getLineCount() - 1;

    for (let line = startLine; line <= endLine; line++) {
      const lineText = this.document.getLine(line);
      if (!lineText) continue;

      const startCol = line === startLine && range ? range.start.column : 0;
      const endCol = line === endLine && range ? range.end.column : lineText.length;

      for (let column = startCol; column < endCol; column++) {
        const char = lineText[column] ?? '';
        
        if (this.isInStringOrComment(line, column)) {
          continue;
        }

        if (this.isOpenBracket(char)) {
          stack.push({ bracket: char, position: { line, column } });
        } else if (this.isCloseBracket(char)) {
          const expectedOpen = this.reverseBracketPairs.get(char) ?? '';
          
          // Find matching opening bracket in stack
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].bracket === expectedOpen) {
              const openPos = stack[i].position;
              pairs.push([openPos, { line, column }]);
              stack.splice(i, 1);
              break;
            }
          }
        }
      }
    }

    return pairs;
  }

  /**
   * Get the bracket at cursor position or the nearest bracket before cursor
   */
  getBracketAtOrBeforeCursor(position: Position): MatchedBracket | null {
    const line = this.document.getLine(position.line);
    if (!line) return null;

    // Check at cursor position
    if (position.column < line.length) {
      const char = line[position.column] ?? '';
      if (this.isBracket(char)) {
        return this.findMatchingBracket(position);
      }
    }

    // Check before cursor
    if (position.column > 0) {
      const prevPos = { line: position.line, column: position.column - 1 };
      const prevChar = line[position.column - 1] ?? '';
      if (this.isBracket(prevChar)) {
        return this.findMatchingBracket(prevPos);
      }
    }

    return null;
  }

  /**
   * Select content between matching brackets
   */
  selectBracketContent(position: Position, includeBrackets = false): Range | null {
    const matched = this.findMatchingBracket(position);
    if (!matched || !matched.matchPosition) return null;

    let start: Position;
    let end: Position;

    if (matched.isOpen) {
      start = includeBrackets ? matched.position : 
              { line: matched.position.line, column: matched.position.column + 1 };
      end = includeBrackets ? 
            { line: matched.matchPosition.line, column: matched.matchPosition.column + 1 } :
            matched.matchPosition;
    } else {
      start = includeBrackets ? matched.matchPosition :
              { line: matched.matchPosition.line, column: matched.matchPosition.column + 1 };
      end = includeBrackets ?
            { line: matched.position.line, column: matched.position.column + 1 } :
            matched.position;
    }

    return { start, end };
  }

  /**
   * Jump to matching bracket
   */
  jumpToMatchingBracket(position: Position): Position | null {
    const matched = this.getBracketAtOrBeforeCursor(position);
    return matched?.matchPosition || null;
  }

  /**
   * Check if position is inside a string or comment (simplified)
   * This should ideally use proper syntax highlighting information
   */
  private isInStringOrComment(line: number, column: number): boolean {
    const lineText = this.document.getLine(line);
    if (!lineText) return false;

    // Simple heuristic - check for quotes before position
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let i = 0; i < column && i < lineText.length; i++) {
      const char = lineText[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      // Check for string start/end
      if ((char === '"' || char === "'" || char === '`') && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString) {
        inString = false;
        stringChar = '';
      }

      // Check for line comment (simplified)
      if (!inString && i < lineText.length - 1) {
        const twoChars = lineText.substring(i, i + 2);
        if (twoChars === '//' || twoChars === '--' || twoChars === '#') {
          return column > i;
        }
      }
    }

    return inString;
  }

  /**
   * Highlight all matching bracket pairs in viewport
   */
  getViewportBracketPairs(startLine: number, endLine: number): Array<[Position, Position]> {
    return this.findAllBracketPairs({
      start: { line: startLine, column: 0 },
      end: { line: endLine, column: this.document.getLineLength(endLine) }
    });
  }

  /**
   * Update matches (for compatibility - currently no-op as matching is on-demand)
   */
  updateMatches(position?: Position): void {
    // Bracket matching is done on-demand, so this is a no-op
    // The position parameter is kept for API compatibility
  }

  /**
   * Get matching pairs (alias for findAllBracketPairs)
   */
  getMatchingPairs(range?: Range): Array<[Position, Position]> {
    return this.findAllBracketPairs(range);
  }
  
  /**
   * Jump to matching bracket
   */
  jumpToBracket(position: Position): Position {
    const match = this.findMatchingBracket(position);
    return match?.matchPosition || position;
  }
}