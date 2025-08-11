/**
 * Screen management implementation
 * Provides screen control and manipulation
 */

import { ansi } from './ansi.js';

import type {
  X,
  Y,
  Rows,
  Cols,
  Style,
  Screen,
  TerminalStream
} from '../types.js';

/**
 * Screen implementation
 */
export class ScreenImpl implements Screen {
  private stream: TerminalStream;

  constructor(stream: TerminalStream) {
    this.stream = stream;
  }

  // ============================================================================
  // Dimensions
  // ============================================================================

  get width(): Cols {
    return this.stream.cols;
  }

  get height(): Rows {
    return this.stream.rows;
  }

  // ============================================================================
  // Basic Operations
  // ============================================================================

  /**
   * Clear entire screen
   */
  clear(): void {
    this.stream.write(ansi.clearScreen());
    this.stream.write(ansi.cursorPosition(1, 1));
  }

  /**
   * Clear entire line at position
   */
  clearLine(y: Y): void {
    this.stream.write(ansi.cursorPosition(y + 1, 1));
    this.stream.write(ansi.clearLine());
  }

  /**
   * Clear from position to end of line
   */
  clearToEndOfLine(x: X, y: Y): void {
    this.stream.write(ansi.cursorPosition(y + 1, x + 1));
    this.stream.write(ansi.clearLineRight());
  }

  /**
   * Clear from start of line to position
   */
  clearToStartOfLine(x: X, y: Y): void {
    this.stream.write(ansi.cursorPosition(y + 1, x + 1));
    this.stream.write(ansi.clearLineLeft());
  }

  /**
   * Clear rectangular area
   */
  clearRect(x: X, y: Y, width: Cols, height: Rows): void {
    for (let row = 0; row < height; row++) {
      this.stream.write(ansi.cursorPosition(y + row + 1, x + 1));
      // Write spaces to clear the area
      this.stream.write(' '.repeat(width));
    }
  }

  // ============================================================================
  // Scrolling
  // ============================================================================

  /**
   * Scroll screen up by n lines
   */
  scrollUp(lines: number): void {
    this.stream.write(ansi.scrollUp(lines));
  }

  /**
   * Scroll screen down by n lines
   */
  scrollDown(lines: number): void {
    this.stream.write(ansi.scrollDown(lines));
  }

  /**
   * Set scrolling region
   */
  setScrollRegion(top: Y, bottom: Y): void {
    this.stream.write(ansi.setScrollRegion(top + 1, bottom + 1));
  }

  /**
   * Reset scrolling region to full screen
   */
  resetScrollRegion(): void {
    this.stream.write(ansi.resetScrollRegion());
  }

  // ============================================================================
  // Cell Operations
  // ============================================================================

  /**
   * Write text at current cursor position
   */
  write(text: string): void {
    this.stream.write(text);
  }

  /**
   * Write styled text at current cursor position
   */
  writeStyled(text: string, style: Style): void {
    this.stream.write(this.styleToAnsi(style));
    this.stream.write(text);
    this.stream.write(ansi.reset());
  }

  /**
   * Write text at position with optional style
   */
  writeAt(x: X, y: Y, text: string, style?: Style): void {
    // Move cursor to position
    this.stream.write(ansi.cursorPosition(y + 1, x + 1));
    
    // Apply style if provided
    if (style) {
      this.stream.write(this.styleToAnsi(style));
    }
    
    // Write text
    this.stream.write(text);
    
    // Reset style if it was applied
    if (style) {
      this.stream.write(ansi.reset());
    }
  }

  /**
   * Write styled text at position
   */
  writeStyledAt(x: X, y: Y, text: string, style: Style): void {
    this.writeAt(x, y, text, style);
  }

  /**
   * Write line of text at position with optional style
   */
  writeLineAt(y: Y, text: string, style?: Style): void {
    // Clear the line first
    this.clearLine(y);
    
    // Write text starting from column 0
    this.writeAt(0 as X, y, text, style);
  }

  /**
   * Draw a box at position
   */
  writeBox(x: X, y: Y, width: Cols, height: Rows, style?: Style): void {
    // Box drawing characters
    const chars = {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│'
    };

    // Apply style if provided
    if (style) {
      this.stream.write(this.styleToAnsi(style));
    }

    // Draw top border
    this.writeAt(x, y, chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight);

    // Draw sides
    for (let row = 1; row < height - 1; row++) {
      this.writeAt(x, (y + row) as Y, chars.vertical);
      this.writeAt((x + width - 1) as X, (y + row) as Y, chars.vertical);
    }

    // Draw bottom border
    this.writeAt(x, (y + height - 1) as Y, chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight);

    // Reset style if it was applied
    if (style) {
      this.stream.write(ansi.reset());
    }
  }

  // ============================================================================
  // Save/Restore
  // ============================================================================

  /**
   * Save current screen state
   */
  save(): void {
    // Use DECSC to save cursor and attributes
    this.stream.write('\x1b7');
    // Note: Full screen content saving would require buffering all cells
    // For now, we just save cursor state
  }

  /**
   * Restore saved screen state
   */
  restore(): void {
    // Use DECRC to restore cursor and attributes
    this.stream.write('\x1b8');
  }

  // ============================================================================
  // Bell
  // ============================================================================

  /**
   * Sound bell
   */
  bell(): void {
    this.stream.write(ansi.bell());
  }

  /**
   * Visual bell (flash screen)
   */
  visualBell(): void {
    this.stream.write(ansi.visualBell());
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Convert style object to ANSI escape sequences
   */
  private styleToAnsi(style: Style): string {
    let result = '';

    // Foreground color
    if (style.fg) {
      // This would need color system integration
      // For now, just handle basic cases
      if (style.fg === 'default') {
        result += ansi.fgDefault();
      }
    }

    // Background color
    if (style.bg) {
      if (style.bg === 'default') {
        result += ansi.bgDefault();
      }
    }

    // Text decorations
    if (style.bold) result += ansi.bold();
    if (style.italic) result += ansi.italic();
    if (style.underline) result += ansi.underline();
    if (style.strikethrough) result += ansi.strikethrough();
    if (style.dim) result += ansi.dim();
    if (style.inverse) result += ansi.inverse();
    if (style.hidden) result += ansi.hidden();
    if (style.blink) result += ansi.blink();
    if (style.overline) result += ansi.overline();

    return result;
  }
}

// Export alias for backward compatibility with tests
export { ScreenImpl as Screen };

export default ScreenImpl;