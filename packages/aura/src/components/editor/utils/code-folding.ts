/**
 * Code Folding - Collapse and expand code regions
 * Part of Phase 3: Advanced Editing
 */

import type { Position, Range } from '../types.js';
import type { DocumentManager } from '../document/document-manager.js';
import { BracketMatcher } from './bracket-matcher.js';

export interface FoldingRange {
  startLine: number;
  endLine: number;
  kind?: 'comment' | 'imports' | 'region' | 'bracket';
  isCollapsed: boolean;
}

export interface FoldingMarker {
  line: number;
  canFold: boolean;
  isFolded: boolean;
  range?: FoldingRange;
}

export class CodeFoldingManager {
  private document: DocumentManager;
  private bracketMatcher: BracketMatcher;
  private foldedRanges: Set<FoldingRange> = new Set();
  private foldingRanges: FoldingRange[] = [];

  constructor(document: DocumentManager) {
    this.document = document;
    this.bracketMatcher = new BracketMatcher(document);
    this.updateFoldingRanges();
  }

  /**
   * Update all available folding ranges
   */
  updateFoldingRanges(): void {
    this.foldingRanges = [
      ...this.findBracketFoldingRanges(),
      ...this.findIndentationFoldingRanges(),
      ...this.findCommentFoldingRanges(),
      ...this.findRegionFoldingRanges()
    ];

    // Sort by start line
    this.foldingRanges.sort((a, b) => a.startLine - b.startLine);
    
    // Remove overlapping ranges (keep the outer ones)
    this.foldingRanges = this.removeOverlappingRanges(this.foldingRanges);
  }

  /**
   * Find folding ranges based on brackets
   */
  private findBracketFoldingRanges(): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    const bracketPairs = this.bracketMatcher.findAllBracketPairs();

    for (const [open, close] of bracketPairs) {
      // Only create folding range if brackets are on different lines
      if (open.line < close.line) {
        // Check if there's content worth folding
        if (close.line - open.line > 1 || this.hasContentBetween(open, close)) {
          ranges.push({
            startLine: open.line,
            endLine: close.line,
            kind: 'bracket',
            isCollapsed: false
          });
        }
      }
    }

    return ranges;
  }

  /**
   * Find folding ranges based on indentation
   */
  private findIndentationFoldingRanges(): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    const lineCount = this.document.getLineCount();
    const stack: Array<{ line: number; indent: number }> = [];

    for (let i = 0; i < lineCount; i++) {
      const line = this.document.getLine(i);
      if (!line || line.trim() === '') continue;

      const indent = this.getIndentLevel(line);

      // Pop from stack while current indent is less than or equal to stack top
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        const start = stack.pop()!;
        
        // Only create range if there are enough lines to fold
        if (i - start.line > 2) {
          ranges.push({
            startLine: start.line,
            endLine: i - 1,
            kind: 'region',
            isCollapsed: false
          });
        }
      }

      // Push current line to stack if it has content
      if (line.trim()) {
        stack.push({ line: i, indent });
      }
    }

    return ranges;
  }

  /**
   * Find comment block folding ranges
   */
  private findCommentFoldingRanges(): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    const lineCount = this.document.getLineCount();
    let inCommentBlock = false;
    let commentStartLine = -1;

    for (let i = 0; i < lineCount; i++) {
      const line = this.document.getLine(i);
      if (!line) continue;

      const trimmed = line.trim();
      
      // Check for block comment start
      if (trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
        inCommentBlock = true;
        commentStartLine = i;
      }
      
      // Check for block comment end
      if (inCommentBlock && trimmed.endsWith('*/')) {
        if (i > commentStartLine) {
          ranges.push({
            startLine: commentStartLine,
            endLine: i,
            kind: 'comment',
            isCollapsed: false
          });
        }
        inCommentBlock = false;
      }
      
      // Check for consecutive line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        if (commentStartLine === -1) {
          commentStartLine = i;
        }
      } else if (commentStartLine !== -1 && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
        // End of line comment block
        if (i - commentStartLine > 2) {
          ranges.push({
            startLine: commentStartLine,
            endLine: i - 1,
            kind: 'comment',
            isCollapsed: false
          });
        }
        commentStartLine = -1;
      }
    }

    return ranges;
  }

  /**
   * Find region-based folding ranges (e.g., #region...#endregion)
   */
  private findRegionFoldingRanges(): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    const regionStack: number[] = [];
    const lineCount = this.document.getLineCount();

    for (let i = 0; i < lineCount; i++) {
      const line = this.document.getLine(i);
      if (!line) continue;

      const trimmed = line.trim();
      
      // Check for region markers (common in various languages)
      if (trimmed.includes('#region') || 
          trimmed.includes('// region') || 
          trimmed.includes('//region') ||
          trimmed.includes('// <editor-fold')) {
        regionStack.push(i);
      } else if (trimmed.includes('#endregion') || 
                 trimmed.includes('// endregion') || 
                 trimmed.includes('//endregion') ||
                 trimmed.includes('// </editor-fold')) {
        const startLine = regionStack.pop();
        if (startLine !== undefined && i > startLine) {
          ranges.push({
            startLine,
            endLine: i,
            kind: 'region',
            isCollapsed: false
          });
        }
      }
    }

    return ranges;
  }

  /**
   * Remove overlapping ranges, keeping the outer ones
   */
  private removeOverlappingRanges(ranges: FoldingRange[]): FoldingRange[] {
    const result: FoldingRange[] = [];
    
    for (const range of ranges) {
      let isContained = false;
      
      for (const existing of result) {
        if (range.startLine >= existing.startLine && 
            range.endLine <= existing.endLine &&
            !(range.startLine === existing.startLine && range.endLine === existing.endLine)) {
          isContained = true;
          break;
        }
      }
      
      if (!isContained) {
        // Remove any ranges that are contained within this one
        for (let i = result.length - 1; i >= 0; i--) {
          if (result[i].startLine >= range.startLine && 
              result[i].endLine <= range.endLine &&
              !(result[i].startLine === range.startLine && result[i].endLine === range.endLine)) {
            result.splice(i, 1);
          }
        }
        result.push(range);
      }
    }
    
    return result;
  }

  /**
   * Get indent level of a line
   */
  private getIndentLevel(line: string): number {
    let level = 0;
    for (const char of line) {
      if (char === ' ') level++;
      else if (char === '\t') level += 4;
      else break;
    }
    return level;
  }

  /**
   * Check if there's content between two positions
   */
  private hasContentBetween(start: Position, end: Position): boolean {
    if (start.line === end.line) {
      return end.column - start.column > 1;
    }
    
    // Check if there's non-whitespace content
    for (let line = start.line + 1; line < end.line; line++) {
      const lineText = this.document.getLine(line);
      if (lineText && lineText.trim()) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Toggle fold at the given line
   */
  toggleFold(line: number): boolean {
    const range = this.getFoldingRangeAtLine(line);
    if (!range) return false;

    if (range.isCollapsed) {
      this.expand(range);
    } else {
      this.collapse(range);
    }
    
    return true;
  }

  /**
   * Collapse a folding range
   */
  collapse(range: FoldingRange): void {
    range.isCollapsed = true;
    this.foldedRanges.add(range);
  }

  /**
   * Expand a folding range
   */
  expand(range: FoldingRange): void {
    range.isCollapsed = false;
    this.foldedRanges.delete(range);
  }

  /**
   * Collapse all folding ranges
   */
  collapseAll(): void {
    for (const range of this.foldingRanges) {
      this.collapse(range);
    }
  }

  /**
   * Expand all folding ranges
   */
  expandAll(): void {
    for (const range of this.foldingRanges) {
      this.expand(range);
    }
  }

  /**
   * Collapse all regions of a specific kind
   */
  collapseAllOfKind(kind: 'comment' | 'imports' | 'region' | 'bracket'): void {
    for (const range of this.foldingRanges) {
      if (range.kind === kind) {
        this.collapse(range);
      }
    }
  }

  /**
   * Get folding range at a specific line
   */
  getFoldingRangeAtLine(line: number): FoldingRange | null {
    for (const range of this.foldingRanges) {
      if (line >= range.startLine && line <= range.endLine) {
        return range;
      }
    }
    return null;
  }

  /**
   * Get all folding ranges
   */
  getAllFoldingRanges(): FoldingRange[] {
    return [...this.foldingRanges];
  }

  /**
   * Get folded ranges
   */
  getFoldedRanges(): FoldingRange[] {
    return Array.from(this.foldedRanges);
  }

  /**
   * Check if a line is folded
   */
  isLineFolded(line: number): boolean {
    for (const range of this.foldedRanges) {
      if (line > range.startLine && line <= range.endLine) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get visible lines considering folded regions
   */
  getVisibleLines(): number[] {
    const visible: number[] = [];
    const lineCount = this.document.getLineCount();
    
    for (let i = 0; i < lineCount; i++) {
      if (!this.isLineFolded(i)) {
        visible.push(i);
      }
    }
    
    return visible;
  }

  /**
   * Get folding markers for the gutter
   */
  getFoldingMarkers(): FoldingMarker[] {
    const markers: FoldingMarker[] = [];
    
    for (const range of this.foldingRanges) {
      markers.push({
        line: range.startLine,
        canFold: true,
        isFolded: range.isCollapsed,
        range
      });
    }
    
    return markers;
  }

  /**
   * Calculate actual line number considering folded regions
   */
  getActualLineNumber(visualLine: number): number {
    let actualLine = 0;
    let visualCount = 0;
    
    while (actualLine < this.document.getLineCount() && visualCount < visualLine) {
      if (!this.isLineFolded(actualLine)) {
        visualCount++;
      }
      actualLine++;
    }
    
    return actualLine;
  }

  // === Alias methods for compatibility ===

  /**
   * Get folded line numbers
   */
  getFoldedLines(): number[] {
    const lines: number[] = [];
    for (const range of this.foldedRanges) {
      for (let i = range.startLine + 1; i <= range.endLine; i++) {
        lines.push(i);
      }
    }
    return lines;
  }

  /**
   * Get foldable range at line (alias)
   */
  getFoldableRange(line: number): FoldingRange | null {
    return this.getFoldingRangeAtLine(line);
  }

  /**
   * Fold all ranges (alias)
   */
  foldAll(): void {
    this.collapseAll();
  }

  /**
   * Unfold all ranges (alias)
   */
  unfoldAll(): void {
    this.expandAll();
  }
}