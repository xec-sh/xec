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
        targetTop = line - Math.floor(this.height() / 2);
        break;
      case 'bottom':
        targetTop = line - this.height() + 1;
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
   * Ensure position is visible
   */
  ensureVisible(line: number, column: number): void {
    const state = this.getState();
    
    // Vertical scrolling
    if (line < state.scrollTop) {
      this.scrollToLine(line, 'top');
    } else if (line >= state.scrollTop + state.height) {
      this.scrollToLine(line, 'bottom');
    }
    
    // Horizontal scrolling
    if (column < state.scrollLeft) {
      this.scrollToColumn(column);
    } else if (column >= state.scrollLeft + state.width) {
      this.scrollToColumn(column - state.width + 1);
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
    this.scrollBy(-Math.max(1, this.height() - 2));
  }
  
  /**
   * Scroll page down
   */
  pageDown(): void {
    this.scrollBy(Math.max(1, this.height() - 2));
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
  
  /**
   * Get max scroll values
   */
  getMaxScroll(): { top: number; left: number } {
    const totalLines = this.document.getLineCount();
    const maxTop = this.scrollBeyondLastLine
      ? totalLines - 1
      : Math.max(0, totalLines - this.height());
    
    // Find longest line for horizontal scroll
    let maxLineLength = 0;
    for (let i = 0; i < totalLines; i++) {
      maxLineLength = Math.max(maxLineLength, this.document.getLineLength(i));
    }
    
    const maxLeft = Math.max(0, maxLineLength - this.width());
    
    return { top: maxTop, left: maxLeft };
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