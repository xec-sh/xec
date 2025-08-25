/**
 * Editor Renderer - handles rendering of editor content with Phase 2 features
 */

import { RGBA } from '../../../lib/colors.js';
import type { OptimizedBuffer } from '../../../renderer/buffer.js';
import type { DocumentManager } from '../document/document-manager.js';
import type { CursorManager } from '../cursor/cursor-manager.js';
import type { ViewportManager } from '../viewport/viewport-manager.js';
import type { GutterRenderer } from '../gutter/gutter-renderer.js';
import type { SearchMatch } from '../search/find-replace-widget.js';
import type { Position, Range } from '../types.js';

export interface RenderOptions {
  showWhitespace?: boolean;
  showIndentGuides?: boolean;
  highlightCurrentLine?: boolean;
  cursorStyle?: 'line' | 'block' | 'underline';
  cursorBlinking?: boolean;
  selectionColor?: RGBA;
  currentLineColor?: RGBA;
  searchMatchColor?: RGBA;
  currentSearchMatchColor?: RGBA;
  wordWrap?: boolean;
  wordWrapColumn?: number;
}

export class EditorRenderer {
  private document: DocumentManager;
  private cursorManager: CursorManager;
  private viewport: ViewportManager;
  private gutter: GutterRenderer;
  
  // Render options
  private showWhitespace: boolean;
  private showIndentGuides: boolean;
  private highlightCurrentLine: boolean;
  private cursorStyle: 'line' | 'block' | 'underline';
  private cursorBlinking: boolean;
  private wordWrap: boolean;
  private wordWrapColumn: number;
  
  // Colors
  private backgroundColor: RGBA;
  private foregroundColor: RGBA;
  private selectionColor: RGBA;
  private currentLineColor: RGBA;
  private searchMatchColor: RGBA;
  private currentSearchMatchColor: RGBA;
  private indentGuideColor: RGBA;
  private whitespaceColor: RGBA;
  
  // Search matches to highlight
  private searchMatches: SearchMatch[] = [];
  private currentSearchMatch: SearchMatch | null = null;
  
  // Cursor blink state
  private cursorVisible = true;
  private lastBlinkTime = 0;
  
  constructor(
    document: DocumentManager,
    cursorManager: CursorManager,
    viewport: ViewportManager,
    gutter: GutterRenderer,
    options: RenderOptions = {}
  ) {
    this.document = document;
    this.cursorManager = cursorManager;
    this.viewport = viewport;
    this.gutter = gutter;
    
    // Apply options
    this.showWhitespace = options.showWhitespace ?? false;
    this.showIndentGuides = options.showIndentGuides ?? false;
    this.highlightCurrentLine = options.highlightCurrentLine ?? true;
    this.cursorStyle = options.cursorStyle ?? 'block';
    this.cursorBlinking = options.cursorBlinking ?? true;
    this.wordWrap = options.wordWrap ?? false;
    this.wordWrapColumn = options.wordWrapColumn ?? 80;
    
    // Set colors
    this.backgroundColor = RGBA.fromValues(0.1, 0.1, 0.15, 1);
    this.foregroundColor = RGBA.fromValues(1, 1, 1, 1);
    this.selectionColor = options.selectionColor ?? RGBA.fromValues(0.3, 0.3, 0.5, 0.5);
    this.currentLineColor = options.currentLineColor ?? RGBA.fromValues(0.15, 0.15, 0.2, 0.5);
    this.searchMatchColor = options.searchMatchColor ?? RGBA.fromValues(0.5, 0.5, 0, 0.3);
    this.currentSearchMatchColor = options.currentSearchMatchColor ?? RGBA.fromValues(0.7, 0.7, 0, 0.5);
    this.indentGuideColor = RGBA.fromValues(0.3, 0.3, 0.3, 0.3);
    this.whitespaceColor = RGBA.fromValues(0.3, 0.3, 0.3, 0.5);
  }
  
  /**
   * Main render method
   */
  render(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    width: number,
    height: number,
    deltaTime: number
  ): void {
    // Update cursor blink
    this.updateCursorBlink(deltaTime);
    
    // Clear editor area
    buffer.fillRect(x, y, width, height, this.backgroundColor);
    
    // Get cursor and selection
    const cursor = this.cursorManager.getCursor();
    const selection = this.cursorManager.getSelection();
    
    // Ensure cursor is visible
    this.viewport.ensureVisible(cursor.position.line, cursor.position.column);
    
    // Render gutter
    const gutterWidth = this.gutter.render(
      buffer,
      x,
      y,
      height,
      cursor.position.line
    );
    
    // Calculate content area
    const contentX = x + gutterWidth;
    const contentWidth = width - gutterWidth;
    
    // Render content
    this.renderContent(
      buffer,
      contentX,
      y,
      contentWidth,
      height,
      cursor,
      selection
    );
    
    // Render scrollbars (if needed)
    this.renderScrollbars(buffer, x, y, width, height);
  }
  
  /**
   * Render editor content
   */
  private renderContent(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    width: number,
    height: number,
    cursor: { position: Position },
    selection: Range | null
  ): void {
    const visibleLines = this.viewport.getVisibleLines();
    const viewportState = this.viewport.getState();
    
    for (let i = 0; i < visibleLines.length && i < height; i++) {
      const lineNumber = visibleLines[i];
      const screenY = y + i;
      
      // Highlight current line
      if (this.highlightCurrentLine && lineNumber === cursor.position.line) {
        buffer.fillRect(x, screenY, width, 1, this.currentLineColor);
      }
      
      // Render line content
      this.renderLine(
        buffer,
        x,
        screenY,
        width,
        lineNumber,
        viewportState.scrollLeft,
        cursor,
        selection
      );
    }
    
    // Render cursor
    if (this.cursorVisible) {
      this.renderCursor(buffer, x, y, cursor, viewportState);
    }
  }
  
  /**
   * Render a single line
   */
  private renderLine(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    width: number,
    lineNumber: number,
    scrollLeft: number,
    cursor: { position: Position },
    selection: Range | null
  ): void {
    const lineText = this.document.getLine(lineNumber);
    const displayText = this.wordWrap ? 
      this.wrapLine(lineText, width) : 
      lineText.substring(scrollLeft, scrollLeft + width);
    
    // Render indent guides
    if (this.showIndentGuides) {
      this.renderIndentGuides(buffer, x, y, displayText);
    }
    
    // Render text with selection
    if (selection && this.isLineInSelection(lineNumber, selection)) {
      this.renderLineWithSelection(
        buffer,
        x,
        y,
        displayText,
        lineNumber,
        scrollLeft,
        selection
      );
    } else {
      // Render normal text
      buffer.drawText(
        displayText,
        x,
        y,
        this.foregroundColor,
        undefined,
        0
      );
    }
    
    // Render search matches
    this.renderSearchMatches(buffer, x, y, lineNumber, scrollLeft, width);
    
    // Render whitespace if enabled
    if (this.showWhitespace) {
      this.renderWhitespace(buffer, x, y, displayText);
    }
  }
  
  /**
   * Render line with selection
   */
  private renderLineWithSelection(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    text: string,
    lineNumber: number,
    scrollLeft: number,
    selection: Range
  ): void {
    const selectionOnLine = this.getLineSelectionRange(lineNumber, selection);
    
    // Adjust for horizontal scroll
    const startCol = Math.max(0, selectionOnLine.start - scrollLeft);
    const endCol = Math.min(text.length, selectionOnLine.end - scrollLeft);
    
    // Draw text before selection
    if (startCol > 0) {
      buffer.drawText(
        text.substring(0, startCol),
        x,
        y,
        this.foregroundColor,
        undefined,
        0
      );
    }
    
    // Draw selected text
    if (endCol > startCol) {
      buffer.drawText(
        text.substring(startCol, endCol),
        x + startCol,
        y,
        this.foregroundColor,
        this.selectionColor,
        0
      );
    }
    
    // Draw text after selection
    if (endCol < text.length) {
      buffer.drawText(
        text.substring(endCol),
        x + endCol,
        y,
        this.foregroundColor,
        undefined,
        0
      );
    }
  }
  
  /**
   * Render cursor
   */
  private renderCursor(
    buffer: OptimizedBuffer,
    contentX: number,
    contentY: number,
    cursor: { position: Position },
    viewportState: any
  ): void {
    // Calculate cursor screen position
    const cursorScreenY = contentY + (cursor.position.line - viewportState.scrollTop);
    const cursorScreenX = contentX + (cursor.position.column - viewportState.scrollLeft);
    
    // Check if cursor is visible
    if (cursorScreenY < contentY || cursorScreenY >= contentY + viewportState.height) {
      return;
    }
    if (cursorScreenX < contentX || cursorScreenX >= contentX + viewportState.width) {
      return;
    }
    
    // Render based on cursor style
    switch (this.cursorStyle) {
      case 'block':
        buffer.setCell(
          cursorScreenX,
          cursorScreenY,
          '█',
          this.foregroundColor,
          RGBA.fromValues(0.5, 0.5, 0.5, 0.7),
          0
        );
        break;
        
      case 'line':
        buffer.setCell(
          cursorScreenX,
          cursorScreenY,
          '│',
          this.foregroundColor,
          RGBA.fromValues(0, 0, 0, 0),
          0
        );
        break;
        
      case 'underline':
        buffer.setCell(
          cursorScreenX,
          cursorScreenY,
          '_',
          this.foregroundColor,
          RGBA.fromValues(0, 0, 0, 0),
          0
        );
        break;
    }
  }
  
  /**
   * Render search matches
   */
  private renderSearchMatches(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    lineNumber: number,
    scrollLeft: number,
    width: number
  ): void {
    for (const match of this.searchMatches) {
      if (match.lineNumber !== lineNumber) continue;
      
      const startCol = Math.max(0, match.range.start.column - scrollLeft);
      const endCol = Math.min(width, match.range.end.column - scrollLeft);
      
      if (endCol <= startCol) continue;
      
      const isCurrentMatch = match === this.currentSearchMatch;
      const highlightColor = isCurrentMatch ? 
        this.currentSearchMatchColor : 
        this.searchMatchColor;
      
      // Highlight the match
      for (let col = startCol; col < endCol; col++) {
        const cellX = x + col;
        const cell = buffer.get(cellX, y);
        if (cell) {
          buffer.setCell(
            cellX,
            y,
            String(cell?.char || ''),
            cell.fg,
            highlightColor,
            cell.attributes
          );
        }
      }
    }
  }
  
  /**
   * Render indent guides
   */
  private renderIndentGuides(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    text: string
  ): void {
    let indentLevel = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') {
        if ((i + 1) % 2 === 0) { // Assuming 2-space indents
          buffer.setCell(
            x + i,
            y,
            '│',
            this.indentGuideColor,
            RGBA.fromValues(0, 0, 0, 0),
            0
          );
        }
      } else {
        break;
      }
    }
  }
  
  /**
   * Render whitespace characters
   */
  private renderWhitespace(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    text: string
  ): void {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      let wsChar: string | null = null;
      
      if (char === ' ') {
        wsChar = '·';
      } else if (char === '\t') {
        wsChar = '→';
      }
      
      if (wsChar) {
        buffer.setCell(
          x + i,
          y,
          wsChar,
          this.whitespaceColor,
          RGBA.fromValues(0, 0, 0, 0),
          0
        );
      }
    }
  }
  
  /**
   * Render scrollbars
   */
  private renderScrollbars(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const maxScroll = this.viewport.getMaxScroll();
    const viewportState = this.viewport.getState();
    
    // Vertical scrollbar
    if (maxScroll.top > 0) {
      const scrollbarX = x + width - 1;
      const scrollbarHeight = height - 1; // Leave room for corner
      const thumbHeight = Math.max(1, Math.floor(
        (viewportState.height / this.document.getLineCount()) * scrollbarHeight
      ));
      const thumbPosition = Math.floor(
        (viewportState.scrollTop / maxScroll.top) * (scrollbarHeight - thumbHeight)
      );
      
      // Draw scrollbar track
      for (let i = 0; i < scrollbarHeight; i++) {
        const isThumb = i >= thumbPosition && i < thumbPosition + thumbHeight;
        buffer.setCell(
          scrollbarX,
          y + i,
          isThumb ? '█' : '│',
          RGBA.fromValues(0.4, 0.4, 0.4, isThumb ? 1 : 0.3),
          RGBA.fromValues(0, 0, 0, 0),
          0
        );
      }
    }
    
    // Horizontal scrollbar (if needed)
    if (maxScroll.left > 0) {
      const scrollbarY = y + height - 1;
      const scrollbarWidth = width - 1; // Leave room for corner
      const thumbWidth = Math.max(1, Math.floor(
        (viewportState.width / maxScroll.left) * scrollbarWidth
      ));
      const thumbPosition = Math.floor(
        (viewportState.scrollLeft / maxScroll.left) * (scrollbarWidth - thumbWidth)
      );
      
      // Draw scrollbar track
      for (let i = 0; i < scrollbarWidth; i++) {
        const isThumb = i >= thumbPosition && i < thumbPosition + thumbWidth;
        buffer.setCell(
          x + i,
          scrollbarY,
          isThumb ? '█' : '─',
          RGBA.fromValues(0.4, 0.4, 0.4, isThumb ? 1 : 0.3),
          RGBA.fromValues(0, 0, 0, 0),
          0
        );
      }
    }
  }
  
  /**
   * Update cursor blink state
   */
  private updateCursorBlink(deltaTime: number): void {
    if (!this.cursorBlinking) {
      this.cursorVisible = true;
      return;
    }
    
    this.lastBlinkTime += deltaTime;
    if (this.lastBlinkTime >= 530) { // Blink every 530ms
      this.cursorVisible = !this.cursorVisible;
      this.lastBlinkTime = 0;
    }
  }
  
  /**
   * Check if line is in selection
   */
  private isLineInSelection(lineNumber: number, selection: Range): boolean {
    return lineNumber >= selection.start.line && lineNumber <= selection.end.line;
  }
  
  /**
   * Get selection range for a line
   */
  private getLineSelectionRange(
    lineNumber: number,
    selection: Range
  ): { start: number; end: number } {
    const lineLength = this.document.getLineLength(lineNumber);
    
    let start = 0;
    let end = lineLength;
    
    if (lineNumber === selection.start.line) {
      start = selection.start.column;
    }
    
    if (lineNumber === selection.end.line) {
      end = selection.end.column;
    }
    
    return { start, end };
  }
  
  /**
   * Wrap line for word wrap
   */
  private wrapLine(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) {
      return text;
    }
    
    // Simple wrap at column boundary
    // TODO: Implement smart word wrapping
    return text.substring(0, maxWidth);
  }
  
  /**
   * Set search matches to highlight
   */
  setSearchMatches(matches: SearchMatch[], current: SearchMatch | null): void {
    this.searchMatches = matches;
    this.currentSearchMatch = current;
  }
  
  /**
   * Update render options
   */
  updateOptions(options: Partial<RenderOptions>): void {
    if (options.showWhitespace !== undefined) {
      this.showWhitespace = options.showWhitespace;
    }
    if (options.showIndentGuides !== undefined) {
      this.showIndentGuides = options.showIndentGuides;
    }
    if (options.highlightCurrentLine !== undefined) {
      this.highlightCurrentLine = options.highlightCurrentLine;
    }
    if (options.cursorStyle !== undefined) {
      this.cursorStyle = options.cursorStyle;
    }
    if (options.cursorBlinking !== undefined) {
      this.cursorBlinking = options.cursorBlinking;
    }
    if (options.wordWrap !== undefined) {
      this.wordWrap = options.wordWrap;
    }
    if (options.wordWrapColumn !== undefined) {
      this.wordWrapColumn = options.wordWrapColumn;
    }
  }
}