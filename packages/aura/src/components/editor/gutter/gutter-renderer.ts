/**
 * Gutter Renderer - renders line numbers, fold indicators, breakpoints, etc.
 */

import { RGBA } from '../../../lib/colors.js';
import type { OptimizedBuffer } from '../../../renderer/buffer.js';
import type { ViewportManager } from '../viewport/viewport-manager.js';
import type { DocumentManager } from '../document/document-manager.js';

export interface GutterOptions {
  showLineNumbers?: boolean;
  relativeLineNumbers?: boolean;
  showFoldIndicators?: boolean;
  showGitStatus?: boolean;
  width?: number;
  backgroundColor?: RGBA;
  lineNumberColor?: RGBA;
  currentLineNumberColor?: RGBA;
  modifiedLineColor?: RGBA;
  addedLineColor?: RGBA;
  deletedLineColor?: RGBA;
}

export interface GutterMarker {
  line: number;
  type: 'breakpoint' | 'bookmark' | 'error' | 'warning' | 'info';
  color?: RGBA;
  char?: string;
}

export class GutterRenderer {
  private document: DocumentManager;
  private viewport: ViewportManager;
  
  // Options
  private showLineNumbers: boolean;
  private relativeLineNumbers: boolean;
  private showFoldIndicators: boolean;
  private showGitStatus: boolean;
  private width: number;
  
  // Colors
  private backgroundColor: RGBA;
  private lineNumberColor: RGBA;
  private currentLineNumberColor: RGBA;
  private modifiedLineColor: RGBA;
  private addedLineColor: RGBA;
  private deletedLineColor: RGBA;
  
  // Markers
  private markers: Map<number, GutterMarker[]> = new Map();
  
  // Folded regions
  private foldedRegions: Set<number> = new Set();
  
  // Git status (line -> 'added' | 'modified' | 'deleted')
  private gitStatus: Map<number, 'added' | 'modified' | 'deleted'> = new Map();
  
  constructor(
    document: DocumentManager,
    viewport: ViewportManager,
    options: GutterOptions = {}
  ) {
    this.document = document;
    this.viewport = viewport;
    
    // Apply options
    this.showLineNumbers = options.showLineNumbers ?? true;
    this.relativeLineNumbers = options.relativeLineNumbers ?? false;
    this.showFoldIndicators = options.showFoldIndicators ?? false;
    this.showGitStatus = options.showGitStatus ?? false;
    this.width = options.width ?? 6;
    
    // Set colors
    this.backgroundColor = options.backgroundColor ?? RGBA.fromValues(0.15, 0.15, 0.2, 1);
    this.lineNumberColor = options.lineNumberColor ?? RGBA.fromValues(0.5, 0.5, 0.5, 1);
    this.currentLineNumberColor = options.currentLineNumberColor ?? RGBA.fromValues(0.9, 0.9, 0.9, 1);
    this.modifiedLineColor = options.modifiedLineColor ?? RGBA.fromValues(1, 0.8, 0, 1);
    this.addedLineColor = options.addedLineColor ?? RGBA.fromValues(0, 1, 0, 1);
    this.deletedLineColor = options.deletedLineColor ?? RGBA.fromValues(1, 0, 0, 1);
  }
  
  /**
   * Calculate gutter width based on content
   */
  calculateWidth(): number {
    if (!this.showLineNumbers) {
      return this.showFoldIndicators ? 2 : 0;
    }
    
    const lineCount = this.document.getLineCount();
    const digits = Math.max(3, lineCount.toString().length);
    
    let width = digits + 1; // +1 for padding
    
    if (this.showFoldIndicators) {
      width += 2;
    }
    
    if (this.showGitStatus) {
      width += 1;
    }
    
    return Math.max(this.width, width);
  }
  
  /**
   * Render the gutter
   */
  render(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    height: number,
    currentLine: number
  ): number {
    const width = this.calculateWidth();
    if (width === 0) return 0;
    
    // Fill gutter background
    buffer.fillRect(x, y, width, height, this.backgroundColor);
    
    // Get visible lines
    const visibleLines = this.viewport.getVisibleLines();
    const viewportState = this.viewport.getState();
    
    for (let i = 0; i < visibleLines.length && i < height; i++) {
      const lineNumber = visibleLines[i];
      const screenY = y + i;
      
      this.renderGutterLine(
        buffer,
        x,
        screenY,
        width,
        lineNumber,
        lineNumber === currentLine
      );
    }
    
    // Draw separator
    const separatorX = x + width - 1;
    const separatorColor = RGBA.fromValues(0.3, 0.3, 0.3, 1);
    for (let i = 0; i < height; i++) {
      buffer.setCell(
        separatorX,
        y + i,
        '│',
        separatorColor,
        this.backgroundColor,
        0
      );
    }
    
    return width;
  }
  
  /**
   * Render a single gutter line
   */
  private renderGutterLine(
    buffer: OptimizedBuffer,
    x: number,
    y: number,
    width: number,
    lineNumber: number,
    isCurrentLine: boolean
  ): void {
    let currentX = x;
    
    // Git status indicator
    if (this.showGitStatus) {
      const status = this.gitStatus.get(lineNumber);
      if (status) {
        const color = status === 'added' ? this.addedLineColor :
                     status === 'modified' ? this.modifiedLineColor :
                     this.deletedLineColor;
        const char = status === 'added' ? '+' :
                    status === 'modified' ? '~' :
                    '-';
        buffer.setCell(currentX, y, char, color, this.backgroundColor, 0);
      }
      currentX++;
    }
    
    // Fold indicator
    if (this.showFoldIndicators) {
      if (this.canFoldLine(lineNumber)) {
        const foldChar = this.foldedRegions.has(lineNumber) ? '▶' : '▼';
        const foldColor = RGBA.fromValues(0.6, 0.6, 0.6, 1);
        buffer.setCell(currentX, y, foldChar, foldColor, this.backgroundColor, 0);
      }
      currentX += 2;
    }
    
    // Line numbers
    if (this.showLineNumbers) {
      const displayNumber = this.getDisplayLineNumber(lineNumber, isCurrentLine);
      const numberStr = displayNumber.toString().padStart(width - currentX - 1, ' ');
      const numberColor = isCurrentLine ? this.currentLineNumberColor : this.lineNumberColor;
      
      buffer.drawText(
        numberStr,
        currentX,
        y,
        numberColor,
        undefined,
        0
      );
      currentX += numberStr.length;
    }
    
    // Markers (breakpoints, bookmarks, etc.)
    const markers = this.markers.get(lineNumber);
    if (markers && markers.length > 0) {
      const marker = markers[0]; // Show first marker
      const markerChar = marker.char ?? '●';
      const markerColor = marker.color ?? RGBA.fromValues(1, 0, 0, 1);
      buffer.setCell(
        currentX,
        y,
        markerChar,
        markerColor,
        this.backgroundColor,
        0
      );
    }
  }
  
  /**
   * Get display line number (handles relative numbering)
   */
  private getDisplayLineNumber(lineNumber: number, isCurrentLine: boolean): number {
    if (!this.relativeLineNumbers || isCurrentLine) {
      return lineNumber + 1; // 1-based numbering
    }
    
    // For relative line numbers, show distance from current line
    // This requires knowing the current cursor line
    // For now, just return absolute number
    return lineNumber + 1;
  }
  
  /**
   * Check if line can be folded
   */
  private canFoldLine(lineNumber: number): boolean {
    // Simple heuristic: lines that end with { or start a function/class
    const line = this.document.getLine(lineNumber);
    return line.includes('{') || 
           line.includes('function') || 
           line.includes('class') ||
           line.includes('interface');
  }
  
  /**
   * Add a marker to the gutter
   */
  addMarker(marker: GutterMarker): void {
    const markers = this.markers.get(marker.line) || [];
    markers.push(marker);
    this.markers.set(marker.line, markers);
  }
  
  /**
   * Remove markers from a line
   */
  removeMarkers(line: number, type?: string): void {
    if (!type) {
      this.markers.delete(line);
    } else {
      const markers = this.markers.get(line);
      if (markers) {
        const filtered = markers.filter(m => m.type !== type);
        if (filtered.length > 0) {
          this.markers.set(line, filtered);
        } else {
          this.markers.delete(line);
        }
      }
    }
  }
  
  /**
   * Toggle fold at line
   */
  toggleFold(line: number): void {
    if (this.foldedRegions.has(line)) {
      this.foldedRegions.delete(line);
    } else if (this.canFoldLine(line)) {
      this.foldedRegions.add(line);
    }
  }
  
  /**
   * Set git status for a line
   */
  setGitStatus(line: number, status: 'added' | 'modified' | 'deleted' | null): void {
    if (status) {
      this.gitStatus.set(line, status);
    } else {
      this.gitStatus.delete(line);
    }
  }
  
  /**
   * Clear all git status
   */
  clearGitStatus(): void {
    this.gitStatus.clear();
  }
  
  /**
   * Get gutter width
   */
  getWidth(): number {
    return this.calculateWidth();
  }
  
  /**
   * Update options
   */
  updateOptions(options: Partial<GutterOptions>): void {
    if (options.showLineNumbers !== undefined) {
      this.showLineNumbers = options.showLineNumbers;
    }
    if (options.relativeLineNumbers !== undefined) {
      this.relativeLineNumbers = options.relativeLineNumbers;
    }
    if (options.showFoldIndicators !== undefined) {
      this.showFoldIndicators = options.showFoldIndicators;
    }
    if (options.showGitStatus !== undefined) {
      this.showGitStatus = options.showGitStatus;
    }
    if (options.width !== undefined) {
      this.width = options.width;
    }
  }
}