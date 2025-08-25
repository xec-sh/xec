/**
 * Auto-closing Pairs - Automatically close brackets, quotes, etc.
 * Part of Phase 3: Advanced Editing
 */

import type { Position } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';

export interface AutoClosingPair {
  open: string;
  close: string;
  notIn?: Array<'string' | 'comment'>;
}

export interface AutoClosingConfig {
  pairs: AutoClosingPair[];
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoCloseTags: boolean;
  autoSurround: boolean;
}

export class AutoClosingPairsManager {
  private document: DocumentManager;
  private config: AutoClosingConfig;
  private pairs: Map<string, AutoClosingPair> = new Map();
  private skipNextChar: string | null = null;

  // Default auto-closing pairs
  private static readonly DEFAULT_PAIRS: AutoClosingPair[] = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string'] },
    { open: '`', close: '`', notIn: ['string'] },
    { open: '<', close: '>', notIn: ['string', 'comment'] }
  ];

  constructor(document: DocumentManager, config?: Partial<AutoClosingConfig>) {
    this.document = document;
    this.config = {
      pairs: config?.pairs || AutoClosingPairsManager.DEFAULT_PAIRS,
      autoCloseBrackets: config?.autoCloseBrackets ?? true,
      autoCloseQuotes: config?.autoCloseQuotes ?? true,
      autoCloseTags: config?.autoCloseTags ?? false,
      autoSurround: config?.autoSurround ?? true
    };

    this.initializePairs();
  }

  /**
   * Initialize the pairs map
   */
  private initializePairs(): void {
    this.pairs.clear();
    for (const pair of this.config.pairs) {
      this.pairs.set(pair.open, pair);
    }
  }

  /**
   * Handle character insertion with auto-closing
   */
  handleCharacterInsertion(
    char: string,
    position: Position,
    hasSelection: boolean = false
  ): { text: string; cursorOffset: number } | null {
    // Check if we should skip this character
    if (this.skipNextChar === char) {
      this.skipNextChar = null;
      const nextChar = this.getCharAt(position);
      if (nextChar === char) {
        // Skip over the existing character
        return { text: '', cursorOffset: 1 };
      }
    }

    // Handle auto-surround for selections
    if (hasSelection && this.config.autoSurround) {
      const pair = this.pairs.get(char);
      if (pair) {
        return {
          text: `${pair.open}SELECTION${pair.close}`,
          cursorOffset: 0
        };
      }
    }

    // Check if this is an opening character
    const pair = this.pairs.get(char);
    if (!pair) {
      return null;
    }

    // Check context restrictions
    if (pair.notIn && this.isInContext(position, pair.notIn)) {
      return null;
    }

    // Check if we should auto-close
    if (!this.shouldAutoClose(char, position)) {
      return null;
    }

    // Auto-close the pair
    this.skipNextChar = pair.close;
    return {
      text: `${pair.open}${pair.close}`,
      cursorOffset: 1
    };
  }

  /**
   * Handle backspace with auto-deletion of pairs
   */
  handleBackspace(position: Position): { deleteCount: number } | null {
    if (position.column === 0) return null;

    const prevPos = { line: position.line, column: position.column - 1 };
    const prevChar = this.getCharAt(prevPos);
    const nextChar = this.getCharAt(position);

    // Check if we're between a pair
    for (const pair of this.config.pairs) {
      if (prevChar === pair.open && nextChar === pair.close) {
        // Delete both characters
        return { deleteCount: 2 };
      }
    }

    return null;
  }

  /**
   * Check if we're typing over a closing character
   */
  shouldSkipCharacter(char: string, position: Position): boolean {
    const nextChar = this.getCharAt(position);
    
    // Check if the next character is the same closing character
    for (const pair of this.config.pairs) {
      if (char === pair.close && nextChar === char) {
        // Check if we have an unmatched opening character before
        if (this.hasUnmatchedOpening(pair, position)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if auto-closing should happen
   */
  private shouldAutoClose(char: string, position: Position): boolean {
    const pair = this.pairs.get(char);
    if (!pair) return false;

    // Check configuration
    if (this.isBracket(char) && !this.config.autoCloseBrackets) {
      return false;
    }
    if (this.isQuote(char) && !this.config.autoCloseQuotes) {
      return false;
    }
    if (char === '<' && !this.config.autoCloseTags) {
      return false;
    }

    // Don't auto-close if the next character is not whitespace or closing
    const nextChar = this.getCharAt(position);
    if (nextChar && !this.isWhitespace(nextChar) && !this.isClosingChar(nextChar)) {
      // Special case for quotes - allow auto-close at word boundaries
      if (this.isQuote(char)) {
        return this.isWordBoundary(position);
      }
      return false;
    }

    // For quotes, check if we're already inside quotes
    if (this.isQuote(char)) {
      return !this.isInsideQuotes(position, char);
    }

    return true;
  }

  /**
   * Check if position is in specified contexts
   */
  private isInContext(position: Position, contexts: Array<'string' | 'comment'>): boolean {
    for (const context of contexts) {
      if (context === 'string' && this.isInString(position)) {
        return true;
      }
      if (context === 'comment' && this.isInComment(position)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if position is inside a string
   */
  private isInString(position: Position): boolean {
    const line = this.document.getLine(position.line);
    if (!line) return false;

    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let i = 0; i < position.column && i < line.length; i++) {
      const char = line[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'" || char === '`') && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString) {
        inString = false;
        stringChar = '';
      }
    }

    return inString;
  }

  /**
   * Check if position is inside a comment
   */
  private isInComment(position: Position): boolean {
    const line = this.document.getLine(position.line);
    if (!line) return false;

    // Check for line comment
    const beforeCursor = line.substring(0, position.column);
    if (beforeCursor.includes('//') || beforeCursor.includes('#')) {
      return true;
    }

    // Check for block comment (simplified)
    // This should ideally use proper syntax highlighting
    return false;
  }

  /**
   * Check if position is inside quotes
   */
  private isInsideQuotes(position: Position, quoteChar: string): boolean {
    const line = this.document.getLine(position.line);
    if (!line) return false;

    let count = 0;
    for (let i = 0; i < position.column && i < line.length; i++) {
      if (line[i] === quoteChar && (i === 0 || line[i - 1] !== '\\')) {
        count++;
      }
    }

    return count % 2 === 1;
  }

  /**
   * Check if there's an unmatched opening character
   */
  private hasUnmatchedOpening(pair: AutoClosingPair, position: Position): boolean {
    const line = this.document.getLine(position.line);
    if (!line) return false;

    let openCount = 0;
    let closeCount = 0;

    for (let i = 0; i < position.column; i++) {
      if (line[i] === pair.open) openCount++;
      if (line[i] === pair.close) closeCount++;
    }

    return openCount > closeCount;
  }

  /**
   * Get character at position
   */
  private getCharAt(position: Position): string | null {
    const line = this.document.getLine(position.line);
    if (!line || position.column >= line.length) return null;
    return line[position.column];
  }

  /**
   * Check if character is a bracket
   */
  private isBracket(char: string): boolean {
    return ['(', ')', '[', ']', '{', '}', '<', '>'].includes(char);
  }

  /**
   * Check if character is a quote
   */
  private isQuote(char: string): boolean {
    return ['"', "'", '`'].includes(char);
  }

  /**
   * Check if character is whitespace
   */
  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  /**
   * Check if character is a closing character
   */
  private isClosingChar(char: string): boolean {
    return [')', ']', '}', '>', ';', ',', '.'].includes(char);
  }

  /**
   * Check if position is at a word boundary
   */
  private isWordBoundary(position: Position): boolean {
    const line = this.document.getLine(position.line);
    if (!line) return true;

    if (position.column === 0 || position.column >= line.length) {
      return true;
    }

    const prevChar = line[position.column - 1];
    const nextChar = line[position.column];

    const isWordChar = (char: string) => /\w/.test(char);
    
    return !isWordChar(prevChar) || !isWordChar(nextChar);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoClosingConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.pairs) {
      this.initializePairs();
    }
  }

  /**
   * Get HTML tag auto-closing suggestion
   */
  getTagAutoClose(position: Position): string | null {
    if (!this.config.autoCloseTags) return null;

    const line = this.document.getLine(position.line);
    if (!line) return null;

    // Simple HTML tag detection
    const beforeCursor = line.substring(0, position.column);
    const tagMatch = beforeCursor.match(/<(\w+)(?:\s+[^>]*)?>$/);
    
    if (tagMatch) {
      const tagName = tagMatch[1];
      // Don't auto-close self-closing tags
      const selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link'];
      if (!selfClosing.includes(tagName.toLowerCase())) {
        return `</${tagName}>`;
      }
    }

    return null;
  }

  /**
   * Handle input (alias for handleCharacterInsertion)
   */
  handleInput(
    char: string,
    position: Position,
    hasSelection: boolean = false
  ): { insertText: string; skipNextChar?: boolean } | null {
    const result = this.handleCharacterInsertion(char, position, hasSelection);
    if (!result) return null;
    
    // Transform the result to match expected interface
    return {
      insertText: result.text,
      skipNextChar: result.cursorOffset === 0
    };
  }
}