/**
 * Screen buffer implementation
 * Provides efficient terminal buffer management with diffing
 */

import { StylesImpl } from './styles.js';
import { styleComparator } from './style-comparator.js';

import type {
  X,
  Y,
  Cell,
  Cols,
  Rows,
  Style,
  Point,
  BoxStyle,
  Rectangle,
  LineStyle,
  BufferPatch,
  ScreenBuffer,
  BufferManager,
  TerminalStream
} from '../types.js';

/**
 * Create an empty cell
 */
function createCell(char = ' ', style?: Style): Cell {
  return {
    char,
    width: getCharWidth(char),
    style,
    dirty: false
  };
}

/**
 * Get the display width of a character
 */
function getCharWidth(char: string): number {
  if (!char || char.length === 0) return 0;
  
  // Control characters have no width
  const code = char.charCodeAt(0);
  if (code < 0x20 || (code >= 0x7F && code < 0xA0)) {
    return 0;
  }
  
  // Check for wide characters (CJK, etc.)
  // This is a simplified check - a full implementation would use a proper Unicode library
  if (code >= 0x1100 && code <= 0x115F) return 2; // Hangul Jamo
  if (code >= 0x2E80 && code <= 0x9FFF) return 2; // CJK
  if (code >= 0xAC00 && code <= 0xD7AF) return 2; // Hangul Syllables
  if (code >= 0xF900 && code <= 0xFAFF) return 2; // CJK Compatibility
  if (code >= 0xFE30 && code <= 0xFE4F) return 2; // CJK Compatibility Forms
  if (code >= 0xFF00 && code <= 0xFF60) return 2; // Fullwidth Forms
  if (code >= 0xFFE0 && code <= 0xFFE6) return 2; // Fullwidth Forms
  
  return 1;
}

/**
 * Screen buffer implementation
 */
export class ScreenBufferImpl implements ScreenBuffer {
  private cells: Cell[][];
  readonly width: Cols;
  readonly height: Rows;
  
  constructor(width: Cols, height: Rows) {
    this.width = width;
    this.height = height;
    this.cells = [];
    
    // Initialize with empty cells
    for (let y = 0; y < height; y++) {
      this.cells[y] = [];
      for (let x = 0; x < width; x++) {
        this.cells[y][x] = createCell();
      }
    }
  }

  /**
   * Set a cell at the given position (supports both signatures)
   */
  setCell(x: X, y: Y, charOrCell: string | Cell, style?: Style): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    
    let char: string;
    let cellStyle: Style | undefined;
    
    // Handle both signatures
    if (typeof charOrCell === 'string') {
      // Signature: setCell(x, y, char, style)
      char = charOrCell;
      cellStyle = style;
    } else {
      // Signature: setCell(x, y, cell)
      char = charOrCell.char;
      cellStyle = charOrCell.style;
    }
    
    const cell = this.cells[y][x];
    const newWidth = getCharWidth(char);
    
    // Mark as dirty if changed
    if (cell.char !== char || styleComparator.differs(cell.style, cellStyle)) {
      cell.dirty = true;
    }
    
    cell.char = char;
    cell.width = newWidth;
    cell.style = cellStyle;
    
    // Handle wide characters
    if (newWidth === 2 && x + 1 < this.width) {
      // Clear the next cell for wide characters
      const nextCell = this.cells[y][x + 1];
      nextCell.char = '';
      nextCell.width = 0;
      nextCell.style = cellStyle;
      nextCell.dirty = true;
    }
  }

  /**
   * Get a cell at the given position
   */
  getCell(x: X, y: Y): Cell | undefined {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return undefined;
    }
    const cell = this.cells[y][x];
    // Return only the Cell properties expected by tests
    const result: Cell = {
      char: cell.char,
      width: cell.width
    };
    if (cell.style !== undefined) {
      result.style = cell.style;
    }
    // Don't include dirty flag in returned cell
    return result;
  }

  /**
   * Write text at the given position
   */
  writeText(x: X, y: Y, text: string, style?: Style): void {
    let currentX: number = x;
    
    for (const char of text) {
      if (currentX >= this.width) {
        break;
      }
      
      // Handle newlines
      if (char === '\n') {
        y = (y + 1) as Y;
        currentX = x;
        if (y >= this.height) {
          break;
        }
        continue;
      }
      
      // Handle tabs
      if (char === '\t') {
        const tabWidth = 8 - (currentX % 8);
        for (let i = 0; i < tabWidth && currentX < this.width; i++) {
          this.setCell(currentX as X, y, ' ', style);
          currentX++;
        }
        continue;
      }
      
      this.setCell(currentX as X, y, char, style);
      currentX = (currentX + getCharWidth(char)) as X;
    }
  }

  /**
   * Write a line of text
   */
  writeLine(y: Y, text: string, style?: Style): void {
    this.clearLine(y, style);
    this.writeText(0 as X, y, text, style);
  }

  /**
   * Measure text dimensions
   */
  measureText(text: string): { width: Cols; height: Rows } {
    // Handle empty text
    if (!text || text.length === 0) {
      return {
        width: 0 as Cols,
        height: 0 as Rows
      };
    }
    
    let width = 0;
    let height = 1;
    let currentLineWidth = 0;
    
    for (const char of text) {
      if (char === '\n') {
        height++;
        width = Math.max(width, currentLineWidth);
        currentLineWidth = 0;
      } else if (char === '\t') {
        currentLineWidth += 8 - (currentLineWidth % 8);
      } else {
        currentLineWidth += getCharWidth(char);
      }
    }
    
    width = Math.max(width, currentLineWidth);
    
    return {
      width: width as Cols,
      height: height as Rows
    };
  }

  /**
   * Clear the entire buffer
   */
  clear(style?: Style): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        if (cell.char !== ' ' || cell.style !== style) {
          cell.dirty = true;
        }
        cell.char = ' ';
        cell.width = 1;
        cell.style = style;
      }
    }
  }

  /**
   * Clear a line
   */
  clearLine(y: Y, style?: Style): void {
    if (y < 0 || y >= this.height) {
      return;
    }
    
    for (let x = 0; x < this.width; x++) {
      const cell = this.cells[y][x];
      if (cell.char !== ' ' || cell.style !== style) {
        cell.dirty = true;
      }
      cell.char = ' ';
      cell.width = 1;
      cell.style = style;
    }
  }

  /**
   * Fill a rectangle with a specific cell (spec-compliant)
   */
  fill(rectOrChar: Rectangle | string, cellOrStyle?: Cell | Style): void {
    if (typeof rectOrChar === 'string') {
      // Legacy signature: fill(char: string, style?: Style) - fills entire buffer
      const char = rectOrChar;
      const style = cellOrStyle as Style | undefined;
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          this.setCell(x as X, y as Y, char, style);
        }
      }
    } else {
      // Spec signature: fill(rect: Rectangle, cell: Cell)
      const rect = rectOrChar;
      const cell = cellOrStyle as Cell;
      const x2 = Math.min(rect.x + rect.width, this.width);
      const y2 = Math.min(rect.y + rect.height, this.height);
      
      for (let y = rect.y; y < y2; y++) {
        for (let x = rect.x; x < x2; x++) {
          this.setCell(x as X, y as Y, cell);
        }
      }
    }
  }

  /**
   * Fill a rectangle with a character
   */
  fillRect(x: X, y: Y, width: Cols, height: Rows, char: string, style?: Style): void {
    const x2 = Math.min(x + width, this.width);
    const y2 = Math.min(y + height, this.height);
    
    for (let cy = y; cy < y2; cy++) {
      for (let cx = x; cx < x2; cx++) {
        this.setCell(cx as X, cy as Y, char, style);
      }
    }
  }

  /**
   * Clear a rectangular region
   */
  clearRect(x: X, y: Y, width: Cols, height: Rows, style?: Style): void {
    const endX = Math.min(x + width, this.width);
    const endY = Math.min(y + height, this.height);
    
    for (let cy = y; cy < endY; cy++) {
      for (let cx = x; cx < endX; cx++) {
        const cell = this.cells[cy][cx];
        if (cell.char !== ' ' || cell.style !== style) {
          cell.dirty = true;
        }
        cell.char = ' ';
        cell.width = 1;
        cell.style = style;
      }
    }
  }


  /**
   * Copy from another buffer
   */
  copyFrom(
    source: ScreenBuffer,
    sx: X, sy: Y,
    dx: X, dy: Y,
    width: Cols, height: Rows
  ): void {
    const endX = Math.min(sx + width, source.width);
    const endY = Math.min(sy + height, source.height);
    
    for (let y = sy; y < endY; y++) {
      for (let x = sx; x < endX; x++) {
        const sourceCell = source.getCell(x, y);
        if (sourceCell) {
          const targetX = (dx + (x - sx)) as X;
          const targetY = (dy + (y - sy)) as Y;
          this.setCell(targetX, targetY, sourceCell.char, sourceCell.style);
        }
      }
    }
  }

  /**
   * Scroll the buffer up
   */
  scrollUp(lines: number): void {
    if (lines <= 0 || lines >= this.height) {
      this.clear();
      return;
    }
    
    // Move lines up
    for (let y = 0; y < this.height - lines; y++) {
      this.cells[y] = this.cells[y + lines];
      // Mark all cells as dirty
      for (const cell of this.cells[y]) {
        cell.dirty = true;
      }
    }
    
    // Clear the bottom lines
    for (let y = this.height - lines; y < this.height; y++) {
      this.cells[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.cells[y][x] = createCell();
        this.cells[y][x].dirty = true;
      }
    }
  }

  /**
   * Scroll the buffer down
   */
  scrollDown(lines: number): void {
    if (lines <= 0 || lines >= this.height) {
      this.clear();
      return;
    }
    
    // Move lines down
    for (let y = this.height - 1; y >= lines; y--) {
      this.cells[y] = this.cells[y - lines];
      // Mark all cells as dirty
      for (const cell of this.cells[y]) {
        cell.dirty = true;
      }
    }
    
    // Clear the top lines
    for (let y = 0; y < lines; y++) {
      this.cells[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.cells[y][x] = createCell();
        this.cells[y][x].dirty = true;
      }
    }
  }

  /**
   * Clone the buffer
   */
  clone(): ScreenBuffer {
    const cloned = new ScreenBufferImpl(this.width, this.height);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        cloned.setCell(x as X, y as Y, cell.char, cell.style);
      }
    }
    
    return cloned;
  }

  /**
   * Export to array
   */
  toArray(): ReadonlyArray<ReadonlyArray<Cell>> {
    return this.cells.map(row => row.map(cell => ({ ...cell })));
  }

  /**
   * Clear dirty flags
   */
  clearDirty(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.cells[y][x].dirty = false;
      }
    }
  }

  /**
   * Get dirty cells as patches
   */
  getDirtyPatches(): BufferPatch[] {
    const patches: BufferPatch[] = [];
    
    for (let y = 0; y < this.height; y++) {
      let startX = -1;
      let cells: Cell[] = [];
      
      for (let x = 0; x <= this.width; x++) {
        const isDirty = x < this.width && this.cells[y][x].dirty;
        
        if (isDirty) {
          if (startX === -1) {
            startX = x;
          }
          cells.push({ ...this.cells[y][x] });
        } else if (startX !== -1) {
          // End of dirty region
          patches.push({
            x: startX as X,
            y: y as Y,
            cells
          });
          startX = -1;
          cells = [];
        }
      }
    }
    
    return patches;
  }

  /**
   * Copy a region within this buffer
   */
  copy(src: Rectangle, dst: Point): void {
    // Read the source region
    const copiedCells: Cell[][] = [];
    for (let y = 0; y < src.height; y++) {
      copiedCells[y] = [];
      for (let x = 0; x < src.width; x++) {
        const cell = this.getCell(
          (src.x + x) as X,
          (src.y + y) as Y
        );
        copiedCells[y][x] = cell ? { ...cell } : createCell();
      }
    }
    
    // Write to destination
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const destX = (dst.x + x) as X;
        const destY = (dst.y + y) as Y;
        if (destX < this.width && destY < this.height) {
          const cell = copiedCells[y][x];
          this.setCell(destX, destY, cell.char, cell.style);
        }
      }
    }
  }

  /**
   * Draw a line between two points
   */
  drawLine(from: Point, to: Point, style: LineStyle): void {
    const char = style.char || '-';
    const lineStyle = style.style;
    
    // Bresenham's line algorithm
    let x0 = from.x;
    let y0 = from.y;
    const x1 = to.x;
    const y1 = to.y;
    
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      this.setCell(x0, y0, char, lineStyle);
      
      if (x0 === x1 && y0 === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 = (x0 + sx) as X;
      }
      if (e2 < dx) {
        err += dx;
        y0 = (y0 + sy) as Y;
      }
    }
  }

  /**
   * Draw a box
   */
  drawBox(rect: Rectangle, style: BoxStyle): void {
    // Box drawing characters
    const chars = style.type === 'double' ? {
      topLeft: '╔', topRight: '╗',
      bottomLeft: '╚', bottomRight: '╝',
      horizontal: '═', vertical: '║'
    } : style.type === 'rounded' ? {
      topLeft: '╭', topRight: '╮',
      bottomLeft: '╰', bottomRight: '╯',
      horizontal: '─', vertical: '│'
    } : style.type === 'thick' ? {
      topLeft: '┏', topRight: '┓',
      bottomLeft: '┗', bottomRight: '┛',
      horizontal: '━', vertical: '┃'
    } : {
      topLeft: '┌', topRight: '┐',
      bottomLeft: '└', bottomRight: '┘',
      horizontal: '─', vertical: '│'
    };
    
    const x2 = (rect.x + rect.width - 1) as X;
    const y2 = (rect.y + rect.height - 1) as Y;
    
    // Draw corners
    this.setCell(rect.x, rect.y, chars.topLeft, style.style);
    this.setCell(x2, rect.y, chars.topRight, style.style);
    this.setCell(rect.x, y2, chars.bottomLeft, style.style);
    this.setCell(x2, y2, chars.bottomRight, style.style);
    
    // Draw horizontal lines
    for (let x = rect.x + 1; x < x2; x++) {
      this.setCell(x as X, rect.y, chars.horizontal, style.style);
      this.setCell(x as X, y2, chars.horizontal, style.style);
    }
    
    // Draw vertical lines
    for (let y = rect.y + 1; y < y2; y++) {
      this.setCell(rect.x, y as Y, chars.vertical, style.style);
      this.setCell(x2, y as Y, chars.vertical, style.style);
    }
    
    // Fill if requested
    if (style.fill) {
      for (let y = rect.y + 1; y < y2; y++) {
        for (let x = rect.x + 1; x < x2; x++) {
          this.setCell(x as X, y as Y, ' ', style.style);
        }
      }
    }
  }
}

/**
 * Buffer manager implementation
 */
export class BufferManagerImpl implements BufferManager {
  private stream?: TerminalStream;
  private _frontBuffer: ScreenBuffer;
  private _backBuffer: ScreenBuffer;

  constructor(stream?: TerminalStream) {
    this.stream = stream;
    // Initialize buffers with actual terminal dimensions if available
    const width = (stream?.cols || 80) as Cols;
    const height = (stream?.rows || 24) as Rows;
    this._frontBuffer = new ScreenBufferImpl(width, height);
    this._backBuffer = new ScreenBufferImpl(width, height);
  }

  /**
   * Get the front buffer
   */
  get frontBuffer(): ScreenBuffer {
    return this._frontBuffer;
  }

  /**
   * Get the back buffer
   */
  get backBuffer(): ScreenBuffer {
    return this._backBuffer;
  }

  /**
   * Swap front and back buffers
   */
  flip(): void {
    const temp = this._frontBuffer;
    this._frontBuffer = this._backBuffer;
    this._backBuffer = temp;
  }

  /**
   * Create a new buffer
   */
  create(width: Cols, height: Rows): ScreenBuffer {
    const buffer = new ScreenBufferImpl(width, height);
    // Update internal buffers if they're different size
    if (this._frontBuffer.width !== width || this._frontBuffer.height !== height) {
      this._frontBuffer = new ScreenBufferImpl(width, height);
      this._backBuffer = new ScreenBufferImpl(width, height);
    }
    return buffer;
  }

  /**
   * Render a buffer to the terminal
   */
  render(buffer: ScreenBuffer, x?: X, y?: Y): void {
    const startX = x || (0 as X);
    const startY = y || (0 as Y);
    
    // Get the buffer's content
    const cells = buffer.toArray();
    
    // Create styles helper for converting styles to ANSI sequences
    const styles = new StylesImpl();
    
    // Move to starting position and render each row
    for (let row = 0; row < cells.length; row++) {
      // Move cursor to the row position
      this.stream?.write(`\x1b[${startY + row + 1};${startX + 1}H`);
      
      // Render the row with styles
      let output = '';
      let lastStyle: Style | undefined = undefined;
      
      for (let col = 0; col < cells[row].length; col++) {
        const cell = cells[row][col];
        if (cell.char) {
          // Check if style changed
          const styleChanged = styleComparator.differs(cell.style, lastStyle);
          
          if (styleChanged) {
            // Reset previous style
            if (lastStyle !== undefined || cell.style !== undefined) {
              output += '\x1b[0m'; // Reset all styles
            }
            
            // Apply new style
            if (cell.style) {
              output += styles.apply(cell.style);
            }
            
            lastStyle = cell.style;
          }
          
          output += cell.char;
        }
      }
      
      // Reset styles at end of line if any were applied
      if (lastStyle !== undefined) {
        output += '\x1b[0m';
      }
      
      if (output) {
        this.stream?.write(output);
      }
    }
    
    // Flush the stream to ensure all output is displayed
    if (this.stream && typeof this.stream.flush === 'function') {
      this.stream.flush();
    }
  }

  /**
   * Diff two buffers
   */
  diff(a: ScreenBuffer, b: ScreenBuffer): BufferPatch[] {
    const patches: BufferPatch[] = [];
    
    const width = Math.min(a.width, b.width);
    const height = Math.min(a.height, b.height);
    
    for (let y = 0; y < height; y++) {
      let startX = -1;
      let cells: Cell[] = [];
      
      for (let x = 0; x <= width; x++) {
        const isDifferent = x < width && this.cellsDiffer(
          a.getCell(x as X, y as Y),
          b.getCell(x as X, y as Y)
        );
        
        if (isDifferent) {
          if (startX === -1) {
            startX = x;
          }
          const cell = b.getCell(x as X, y as Y);
          if (cell) {
            cells.push({ ...cell, dirty: true });
          }
        } else if (startX !== -1) {
          // End of different region
          patches.push({
            x: startX as X,
            y: y as Y,
            cells
          });
          startX = -1;
          cells = [];
        }
      }
    }
    
    return patches;
  }

  /**
   * Apply a patch to a buffer
   */
  applyPatch(buffer: ScreenBuffer, patch: BufferPatch): void {
    let x = patch.x;
    
    for (const cell of patch.cells) {
      buffer.setCell(x, patch.y, cell.char, cell.style);
      x = (x + (cell.width || 1)) as X;
    }
  }

  /**
   * Apply multiple patches
   */
  applyPatches(buffer: ScreenBuffer, patches: BufferPatch[]): void {
    for (const patch of patches) {
      this.applyPatch(buffer, patch);
    }
  }

  /**
   * Optimize patches by merging adjacent ones
   */
  optimizePatches(patches: BufferPatch[]): BufferPatch[] {
    if (patches.length <= 1) {
      return patches;
    }
    
    // Sort patches by position
    const sorted = [...patches].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    
    const optimized: BufferPatch[] = [];
    let current = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      // Check if patches are adjacent
      if (current.y === next.y && 
          current.x + current.cells.length === next.x) {
        // Merge patches
        current = {
          x: current.x,
          y: current.y,
          cells: [...current.cells, ...next.cells]
        };
      } else {
        optimized.push(current);
        current = next;
      }
    }
    
    optimized.push(current);
    return optimized;
  }


  /**
   * Check if two cells are different
   */
  private cellsDiffer(a?: Cell, b?: Cell): boolean {
    if (!a || !b) return true;
    if (a.char !== b.char) return true;
    if (a.width !== b.width) return true;
    if (styleComparator.differs(a.style, b.style)) return true;
    return false;
  }
}

// Export the implementation class
// Export aliases for backward compatibility with tests
export { BufferManagerImpl as Buffer };
export { ScreenBufferImpl as ScreenBuffer };

export default BufferManagerImpl;