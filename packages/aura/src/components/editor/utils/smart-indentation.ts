/**
 * Smart Indentation - Language-aware auto-indentation
 * Part of Phase 3: Advanced Editing
 */

import type { Position } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';

export interface IndentationRules {
  increaseIndentPattern?: RegExp;
  decreaseIndentPattern?: RegExp;
  indentNextLinePattern?: RegExp;
  unindentedLinePattern?: RegExp;
}

export interface LanguageConfig {
  id: string;
  indentationRules?: IndentationRules;
  brackets?: Array<[string, string]>;
  comments?: {
    lineComment?: string;
    blockComment?: [string, string];
  };
}

export class SmartIndentationManager {
  private document: DocumentManager;
  private tabSize: number;
  private insertSpaces: boolean;
  private languageConfig: LanguageConfig | null = null;

  // Default indentation rules for common languages
  private static readonly DEFAULT_RULES: Map<string, IndentationRules> = new Map([
    ['javascript', {
      increaseIndentPattern: /^.*\{[^}]*$|^.*\[[^\]]*$|^.*\([^)]*$/,
      decreaseIndentPattern: /^\s*[}\])].*$/,
      indentNextLinePattern: /^(?!.*[;{}]\s*$).*[,]\s*$/,
      unindentedLinePattern: /^(\s*\/\/|\s*\/\*|\s*\*)/
    }],
    ['typescript', {
      increaseIndentPattern: /^.*\{[^}]*$|^.*\[[^\]]*$|^.*\([^)]*$/,
      decreaseIndentPattern: /^\s*[}\])].*$/,
      indentNextLinePattern: /^(?!.*[;{}]\s*$).*[,]\s*$/,
      unindentedLinePattern: /^(\s*\/\/|\s*\/\*|\s*\*)/
    }],
    ['python', {
      increaseIndentPattern: /^.*:\s*(#.*)?$/,
      decreaseIndentPattern: /^\s*(pass|return|break|continue|raise)\b/,
      unindentedLinePattern: /^\s*#/
    }],
    ['rust', {
      increaseIndentPattern: /^.*\{[^}]*$|^.*\[[^\]]*$|^.*\([^)]*$/,
      decreaseIndentPattern: /^\s*[}\])].*$/,
      unindentedLinePattern: /^(\s*\/\/|\s*\/\*)/
    }],
    ['go', {
      increaseIndentPattern: /^.*\{[^}]*$/,
      decreaseIndentPattern: /^\s*\}.*$/,
      unindentedLinePattern: /^(\s*\/\/|\s*\/\*)/
    }]
  ]);

  constructor(
    document: DocumentManager,
    tabSize = 4,
    insertSpaces = true,
    language?: string
  ) {
    this.document = document;
    this.tabSize = tabSize;
    this.insertSpaces = insertSpaces;
    
    if (language) {
      this.setLanguage(language);
    }
  }

  /**
   * Set the language for indentation rules
   */
  setLanguage(language: string): void {
    const rules = SmartIndentationManager.DEFAULT_RULES.get(language.toLowerCase());
    if (rules) {
      this.languageConfig = {
        id: language,
        indentationRules: rules
      };
    }
  }

  /**
   * Get the indentation string (tabs or spaces)
   */
  getIndentString(): string {
    return this.insertSpaces ? ' '.repeat(this.tabSize) : '\t';
  }

  /**
   * Calculate the indentation level for a line
   */
  getLineIndentLevel(lineNumber: number): number {
    const line = this.document.getLine(lineNumber);
    if (!line) return 0;

    let indentLevel = 0;
    let i = 0;

    while (i < line.length) {
      if (line[i] === ' ') {
        indentLevel++;
        i++;
      } else if (line[i] === '\t') {
        indentLevel += this.tabSize;
        i++;
      } else {
        break;
      }
    }

    return Math.floor(indentLevel / this.tabSize);
  }

  /**
   * Get the indentation string for a specific level
   */
  getIndentationForLevel(level: number): string {
    const indentString = this.getIndentString();
    return indentString.repeat(Math.max(0, level));
  }

  /**
   * Calculate smart indentation for a new line
   */
  getSmartIndentForNewLine(afterLine: number): string {
    const previousLine = this.document.getLine(afterLine);
    if (!previousLine) return '';

    const previousIndentLevel = this.getLineIndentLevel(afterLine);
    let newIndentLevel = previousIndentLevel;

    // Apply language-specific rules if available
    if (this.languageConfig?.indentationRules) {
      const rules = this.languageConfig.indentationRules;
      const trimmedLine = previousLine.trim();

      // Check if we should increase indentation
      if (rules.increaseIndentPattern?.test(previousLine)) {
        newIndentLevel++;
      }

      // Check if the next line should be unindented
      if (afterLine < this.document.getLineCount() - 1) {
        const nextLine = this.document.getLine(afterLine + 1);
        if (nextLine && rules.decreaseIndentPattern?.test(nextLine)) {
          newIndentLevel = Math.max(0, newIndentLevel - 1);
        }
      }
    } else {
      // Fallback: simple bracket-based indentation
      newIndentLevel = this.getSimpleBracketIndent(afterLine);
    }

    return this.getIndentationForLevel(newIndentLevel);
  }

  /**
   * Simple bracket-based indentation (fallback)
   */
  private getSimpleBracketIndent(lineNumber: number): number {
    const line = this.document.getLine(lineNumber);
    if (!line) return 0;

    const currentIndent = this.getLineIndentLevel(lineNumber);
    const openBrackets = (line.match(/[\{\[\(]/g) || []).length;
    const closeBrackets = (line.match(/[\}\]\)]/g) || []).length;

    return Math.max(0, currentIndent + openBrackets - closeBrackets);
  }

  /**
   * Auto-indent a line based on its content and context
   */
  autoIndentLine(lineNumber: number): string {
    const line = this.document.getLine(lineNumber);
    if (!line) return '';

    const trimmedLine = line.trim();
    if (!trimmedLine) return '';

    let indentLevel = 0;

    // Calculate indent based on previous line
    if (lineNumber > 0) {
      indentLevel = this.getLineIndentLevel(lineNumber - 1);
      const previousLine = this.document.getLine(lineNumber - 1);

      if (this.languageConfig?.indentationRules) {
        const rules = this.languageConfig.indentationRules;

        // Increase indent if previous line matches pattern
        if (previousLine && rules.increaseIndentPattern?.test(previousLine)) {
          indentLevel++;
        }

        // Decrease indent if current line matches pattern
        if (rules.decreaseIndentPattern?.test(trimmedLine)) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
      }
    }

    return this.getIndentationForLevel(indentLevel) + trimmedLine;
  }

  /**
   * Fix indentation for a range of lines
   */
  fixIndentation(startLine: number, endLine: number): Map<number, string> {
    const fixes = new Map<number, string>();
    
    for (let line = startLine; line <= endLine; line++) {
      const currentLine = this.document.getLine(line);
      if (!currentLine || !currentLine.trim()) continue;

      const fixedLine = this.autoIndentLine(line);
      if (fixedLine !== currentLine) {
        fixes.set(line, fixedLine);
      }
    }

    return fixes;
  }

  /**
   * Detect indentation settings from document content
   */
  detectIndentation(): { tabSize: number; insertSpaces: boolean } {
    const sampleSize = Math.min(100, this.document.getLineCount());
    const indentations: string[] = [];

    for (let i = 0; i < sampleSize; i++) {
      const line = this.document.getLine(i);
      if (!line) continue;

      const indent = line.match(/^(\s+)/);
      if (indent) {
        indentations.push(indent[1]);
      }
    }

    if (indentations.length === 0) {
      return { tabSize: this.tabSize, insertSpaces: this.insertSpaces };
    }

    // Count tabs vs spaces
    let tabCount = 0;
    let spaceCount = 0;
    const spaceCounts: number[] = [];

    for (const indent of indentations) {
      if (indent.includes('\t')) {
        tabCount++;
      } else {
        spaceCount++;
        spaceCounts.push(indent.length);
      }
    }

    const insertSpaces = spaceCount > tabCount;

    // Detect tab size from space indentations
    let tabSize = this.tabSize;
    if (insertSpaces && spaceCounts.length > 0) {
      // Find GCD of space counts to determine tab size
      tabSize = spaceCounts.reduce((gcd, count) => {
        while (count) {
          const temp = count;
          count = gcd % count;
          gcd = temp;
        }
        return gcd;
      });
      
      // Ensure reasonable tab size
      if (tabSize < 2 || tabSize > 8) {
        tabSize = this.tabSize;
      }
    }

    return { tabSize, insertSpaces };
  }

  /**
   * Handle tab key press with smart indentation
   */
  handleTab(position: Position, shiftKey = false): string {
    const lineNumber = position.line;
    const line = this.document.getLine(lineNumber);
    if (!line) return '';

    if (shiftKey) {
      // Decrease indentation
      const currentIndent = this.getLineIndentLevel(lineNumber);
      const newIndent = Math.max(0, currentIndent - 1);
      const newIndentString = this.getIndentationForLevel(newIndent);
      const trimmedLine = line.trim();
      return newIndentString + trimmedLine;
    } else {
      // Increase indentation or insert tab
      if (position.column === 0 || line.substring(0, position.column).trim() === '') {
        // At start of line or in leading whitespace - increase indent
        const currentIndent = this.getLineIndentLevel(lineNumber);
        const newIndent = currentIndent + 1;
        const newIndentString = this.getIndentationForLevel(newIndent);
        const trimmedLine = line.trim();
        return newIndentString + trimmedLine;
      } else {
        // Insert tab at cursor position
        return this.getIndentString();
      }
    }
  }

  /**
   * Get indent level (alias for getLineIndentLevel)
   */
  getIndentLevel(lineNumber: number): number {
    return this.getLineIndentLevel(lineNumber);
  }
}