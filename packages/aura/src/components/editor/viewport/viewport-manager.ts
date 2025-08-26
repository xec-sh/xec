/**
 * Viewport Manager - handles visible area and scrolling for Phase 2
 */

import { signal, computed } from 'vibrancy';

import type { DocumentManager } from '../document/document-manager.js';

export interface ViewportState {
  scrollTop: number;      // Line offset from top
  scrollLeft: number;     // Column offset from left  
  width: number;          // Viewport width in characters
  height: number;         // Viewport height in lines
  visibleStartLine: number;
  visibleEndLine: number;
  visibleStartColumn: number;
  visibleEndColumn: number;
}

export interface ViewportOptions {
  overscan?: number;      // Extra lines to render above/below viewport
  scrollBeyondLastLine?: boolean;
  smoothScrolling?: boolean;
  scrollSpeed?: number;
}

export class ViewportManager {
  private document: DocumentManager;

  // Reactive state
  private scrollTop = signal(0);
  private scrollLeft = signal(0);
  private width = signal(80);
  private height = signal(24);

  // Options
  private overscan: number;
  private scrollBeyondLastLine: boolean;
  private smoothScrolling: boolean;
  private scrollSpeed: number;

  // Computed values
  private visibleRange = computed(() => {
    const top = this.scrollTop();
    const left = this.scrollLeft();
    const w = this.width();
    const h = this.height();
    const overscan = this.overscan;

    return {
      startLine: Math.max(0, top - overscan),
      endLine: Math.min(this.document.getLineCount() - 1, top + h + overscan),
      startColumn: Math.max(0, left),
      endColumn: left + w
    };
  });

  constructor(document: DocumentManager, options: ViewportOptions = {}) {
    this.document = document;
    this.overscan = options.overscan ?? 3;
    this.scrollBeyondLastLine = options.scrollBeyondLastLine ?? true;
    this.smoothScrolling = options.smoothScrolling ?? false;
    this.scrollSpeed = options.scrollSpeed ?? 3;
  }

  /**
   * Get current viewport state
   */
  getState(): ViewportState {
    const range = this.visibleRange();
    return {
      scrollTop: this.scrollTop(),
      scrollLeft: this.scrollLeft(),
      width: this.width(),
      height: this.height(),
      visibleStartLine: range.startLine,
      visibleEndLine: range.endLine,
      visibleStartColumn: range.startColumn,
      visibleEndColumn: range.endColumn
    };
  }

  /**
   * Set viewport dimensions
   */
  setDimensions(width: number, height: number): void {
    this.width.set(width);
    this.height.set(height);
    this.constrainScroll();
  }

  /**
   * Scroll to line
   */
  scrollToLine(line: number, position: 'top' | 'center' | 'bottom' = 'top'): void {
    let targetTop = line;

    switch (position) {
      case 'center':
        targetTop = Math.max(0, line - Math.floor(this.height() / 2));
        break;
      case 'bottom':
        targetTop = Math.max(0, line - this.height() + 1);
        break;
      default:
        targetTop = Math.max(0, line);
        break;
    }

    this.setScrollTop(targetTop);
  }

  /**
   * Scroll to column
   */
  scrollToColumn(column: number): void {
    this.setScrollLeft(column);
  }

  /**
   * Ensure position is visible - simplified like select.ts
   */
  ensureVisible(line: number, column: number): void {
    // Vertical scrolling - center if outside viewport
    const currentTop = this.scrollTop();
    const currentHeight = this.height();
    
    if (line < currentTop || line >= currentTop + currentHeight) {
      // Center the line in viewport when scrolling
      const halfHeight = Math.floor(currentHeight / 2);
      const targetTop = Math.max(0, line - halfHeight);
      this.setScrollTop(targetTop);
    }

    // Horizontal scrolling - ensure column is visible
    const currentLeft = this.scrollLeft();
    const currentWidth = this.width();
    
    if (column < currentLeft) {
      this.setScrollLeft(Math.max(0, column - 1));
    } else if (column >= currentLeft + currentWidth - 2) {
      const targetLeft = Math.max(0, column - currentWidth + 3);
      this.setScrollLeft(targetLeft);
    }
  }

  /**
   * Scroll by delta
   */
  scrollBy(deltaLines: number, deltaColumns: number = 0): void {
    this.setScrollTop(this.scrollTop() + deltaLines);
    this.setScrollLeft(this.scrollLeft() + deltaColumns);
  }

  /**
   * Scroll page up
   */
  pageUp(): void {
    const pageSize = Math.max(1, this.height() - 2);
    const newTop = Math.max(0, this.scrollTop() - pageSize);
    this.setScrollTop(newTop);
  }

  /**
   * Scroll page down
   */
  pageDown(): void {
    const pageSize = Math.max(1, this.height() - 2);
    const newTop = this.scrollTop() + pageSize;
    this.setScrollTop(newTop);
  }

  /**
   * Get visible lines
   */
  getVisibleLines(): number[] {
    const range = this.visibleRange();
    const lines: number[] = [];

    for (let i = range.startLine; i <= range.endLine; i++) {
      lines.push(i);
    }

    return lines;
  }

  /**
   * Check if line is visible
   */
  isLineVisible(line: number): boolean {
    const range = this.visibleRange();
    return line >= range.startLine && line <= range.endLine;
  }

  // Cache for max line length to avoid recalculation
  private cachedMaxLineLength = 0;
  private maxLineLengthDirty = true;

  /**
   * Get max scroll values - optimized
   */
  getMaxScroll(): { top: number; left: number } {
    const totalLines = this.document.getLineCount();
    const maxTop = this.scrollBeyondLastLine
      ? totalLines - 1
      : Math.max(0, totalLines - this.height());

    // Only recalculate max line length when needed
    if (this.maxLineLengthDirty) {
      this.cachedMaxLineLength = 0;
      const checkLines = Math.min(totalLines, 1000); // Check first 1000 lines for performance
      for (let i = 0; i < checkLines; i++) {
        this.cachedMaxLineLength = Math.max(this.cachedMaxLineLength, this.document.getLineLength(i));
      }
      this.maxLineLengthDirty = false;
    }

    const maxLeft = Math.max(0, this.cachedMaxLineLength - this.width());
    return { top: maxTop, left: maxLeft };
  }

  /**
   * Mark max line length cache as dirty
   */
  invalidateMaxLineLength(): void {
    this.maxLineLengthDirty = true;
  }

  /**
   * Set scroll position with constraints
   */
  private setScrollTop(value: number): void {
    const max = this.getMaxScroll().top;
    this.scrollTop.set(Math.max(0, Math.min(value, max)));
  }

  private setScrollLeft(value: number): void {
    const max = this.getMaxScroll().left;
    this.scrollLeft.set(Math.max(0, Math.min(value, max)));
  }

  /**
   * Constrain scroll to valid range
   */
  private constrainScroll(): void {
    const max = this.getMaxScroll();
    this.scrollTop.set(Math.max(0, Math.min(this.scrollTop(), max.top)));
    this.scrollLeft.set(Math.max(0, Math.min(this.scrollLeft(), max.left)));
  }

  /**
   * Handle mouse wheel events
   */
  handleWheel(deltaY: number, deltaX: number): void {
    this.scrollBy(
      Math.sign(deltaY) * this.scrollSpeed,
      Math.sign(deltaX) * this.scrollSpeed
    );
  }

  /**
   * Scroll up by one line
   */
  scrollUp(): void {
    this.scrollBy(-1);
  }

  /**
   * Scroll down by one line
   */
  scrollDown(): void {
    this.scrollBy(1);
  }

  /**
   * Scroll page up (alias for pageUp)
   */
  scrollPageUp(): void {
    this.pageUp();
  }

  /**
   * Scroll page down (alias for pageDown)
   */
  scrollPageDown(): void {
    this.pageDown();
  }

  /**
   * Ensure line is visible (wrapper for ensureVisible)
   */
  ensureLineVisible(line: number): void {
    this.ensureVisible(line, 0);
  }

  /**
   * Get visible range as object with start and end
   */
  getVisibleRange(): { start: number; end: number } {
    const range = this.visibleRange();
    return {
      start: range.startLine,
      end: range.endLine
    };
  }
}