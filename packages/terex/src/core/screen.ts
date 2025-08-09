/**
 * Screen management module for terminal buffer control
 * Handles clearing, scrolling, and buffer management
 */

import { CursorController } from './cursor.js';
import {
  Rectangle,
  TerminalSize,
  TerminalStream
} from './types.js';

// ANSI escape codes for screen control
const ESC = '\x1b[';
const CSI = ESC;

/**
 * Screen buffer types
 */
export type BufferType = 'main' | 'alternate';

/**
 * Clear modes for screen operations
 */
export type ClearMode = 'all' | 'above' | 'below' | 'line' | 'end' | 'start';

/**
 * Virtual screen for double buffering
 * Allows components to write to a buffer that gets flushed to terminal
 */
export class Screen {
  private buffer: Map<string, string> = new Map();
  private width: number;
  private height: number;
  private dirtyRegions: Set<string> = new Set();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /**
   * Write text at specific position
   */
  writeAt(x: number, y: number, text: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }

    const key = `${x},${y}`;
    const existing = this.buffer.get(key);

    if (existing !== text) {
      this.buffer.set(key, text);
      this.dirtyRegions.add(key);
    }
  }

  /**
   * Write a line of text at position
   */
  writeLine(x: number, y: number, text: string): void {
    let currentX = x;
    for (const char of text) {
      if (currentX >= this.width) break;
      this.writeAt(currentX, y, char);
      currentX++;
    }
  }

  /**
   * Fill a rectangular area with a character
   */
  fillRect(x: number, y: number, width: number, height: number, char: string): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        this.writeAt(x + dx, y + dy, char);
      }
    }
  }

  /**
   * Clear the entire buffer
   */
  clear(): void {
    this.buffer.clear();
    this.dirtyRegions.clear();
  }

  /**
   * Clear a rectangular area
   */
  clearRect(x: number, y: number, width: number, height: number): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const key = `${x + dx},${y + dy}`;
        this.buffer.delete(key);
        this.dirtyRegions.add(key);
      }
    }
  }

  /**
   * Get the buffer content at position
   */
  getAt(x: number, y: number): string | undefined {
    return this.buffer.get(`${x},${y}`);
  }

  /**
   * Check if there are dirty regions
   */
  isDirty(): boolean {
    return this.dirtyRegions.size > 0;
  }

  /**
   * Get all dirty regions
   */
  getDirtyRegions(): Set<string> {
    return new Set(this.dirtyRegions);
  }

  /**
   * Clear dirty regions
   */
  clearDirty(): void {
    this.dirtyRegions.clear();
  }

  /**
   * Get the entire buffer
   */
  getBuffer(): Map<string, string> {
    return new Map(this.buffer);
  }

  /**
   * Render to a string array (for testing)
   */
  toStringArray(): string[] {
    const lines: string[] = [];

    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) {
        const char = this.buffer.get(`${x},${y}`);
        line += char || ' ';
      }
      lines.push(line);
    }

    return lines;
  }

  /**
   * Get screen dimensions
   */
  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Resize the screen
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    // Remove buffer entries outside new bounds
    for (const key of this.buffer.keys()) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (!isNaN(x) && !isNaN(y) && (x >= width || y >= height)) {
        this.buffer.delete(key);
      }
    }
  }
}

/**
 * Screen controller for terminal display management
 */
export class ScreenController {
  private readonly output: NodeJS.WriteStream;
  private readonly cursor: CursorController;
  private size: TerminalSize;
  private currentBuffer: BufferType = 'main';
  private savedScreenState: string[] = [];

  constructor(stream: TerminalStream, cursor: CursorController) {
    this.output = stream.output;
    this.cursor = cursor;
    this.size = this.getTerminalSize();

    // Listen for resize events
    if (stream.output.isTTY) {
      process.stdout.on('resize', () => {
        this.size = this.getTerminalSize();
      });
    }
  }

  /**
   * Clear screen or parts of it
   */
  clear(mode: ClearMode = 'all'): this {
    // eslint-disable-next-line default-case
    switch (mode) {
      case 'all':
        this.write(`${CSI}2J`);
        this.cursor.home();
        break;
      case 'above':
        this.write(`${CSI}1J`);
        break;
      case 'below':
        this.write(`${CSI}0J`);
        break;
      case 'line':
        this.write(`${CSI}2K`);
        break;
      case 'end':
        this.write(`${CSI}0K`);
        break;
      case 'start':
        this.write(`${CSI}1K`);
        break;
    }
    return this;
  }

  /**
   * Clear current line
   */
  clearLine(): this {
    return this.clear('line');
  }

  /**
   * Clear from cursor to end of line
   */
  clearToEndOfLine(): this {
    return this.clear('end');
  }

  /**
   * Clear from cursor to start of line
   */
  clearToStartOfLine(): this {
    return this.clear('start');
  }

  /**
   * Clear from cursor to end of screen
   */
  clearToEndOfScreen(): this {
    return this.clear('below');
  }

  /**
   * Clear from cursor to start of screen
   */
  clearToStartOfScreen(): this {
    return this.clear('above');
  }

  /**
   * Scroll screen up by n lines
   */
  scrollUp(lines = 1): this {
    this.write(`${CSI}${lines}S`);
    return this;
  }

  /**
   * Scroll screen down by n lines
   */
  scrollDown(lines = 1): this {
    this.write(`${CSI}${lines}T`);
    return this;
  }

  /**
   * Set scroll region
   */
  setScrollRegion(top: number, bottom: number): this {
    this.write(`${CSI}${top};${bottom}r`);
    return this;
  }

  /**
   * Reset scroll region
   */
  resetScrollRegion(): this {
    this.write(`${CSI}r`);
    return this;
  }

  /**
   * Switch to alternate buffer
   */
  useAlternateBuffer(): this {
    if (this.currentBuffer === 'main') {
      this.write(`${CSI}?1049h`);
      this.currentBuffer = 'alternate';
    }
    return this;
  }

  /**
   * Switch back to main buffer
   */
  useMainBuffer(): this {
    if (this.currentBuffer === 'alternate') {
      this.write(`${CSI}?1049l`);
      this.currentBuffer = 'main';
    }
    return this;
  }

  /**
   * Save current screen state
   */
  saveScreen(): this {
    this.write(`${CSI}?47h`);
    return this;
  }

  /**
   * Restore saved screen state
   */
  restoreScreen(): this {
    this.write(`${CSI}?47l`);
    return this;
  }

  /**
   * Enable line wrapping
   */
  enableLineWrap(): this {
    this.write(`${CSI}?7h`);
    return this;
  }

  /**
   * Disable line wrapping
   */
  disableLineWrap(): this {
    this.write(`${CSI}?7l`);
    return this;
  }

  /**
   * Set window title
   */
  setTitle(title: string): this {
    this.write(`${ESC}]0;${title}\x07`);
    return this;
  }

  /**
   * Ring the terminal bell
   */
  bell(): this {
    this.write('\x07');
    return this;
  }

  /**
   * Flash the screen (visual bell)
   */
  flash(): this {
    // Flash by inverting colors briefly
    this.write(`${CSI}?5h`);
    setTimeout(() => {
      this.write(`${CSI}?5l`);
    }, 100);
    return this;
  }

  /**
   * Clear a rectangular area
   */
  clearRect(rect: Rectangle): this {
    const { x, y, width, height } = rect;
    const savedPosition = this.cursor.getPosition();

    for (let row = y; row < y + height; row++) {
      this.cursor.moveTo(x, row);
      for (let col = 0; col < width; col++) {
        this.write(' ');
      }
    }

    if (savedPosition) {
      this.cursor.moveTo(savedPosition.x, savedPosition.y);
    }

    return this;
  }

  /**
   * Fill a rectangular area with a character
   */
  fillRect(rect: Rectangle, char: string): this {
    const { x, y, width, height } = rect;
    const savedPosition = this.cursor.getPosition();
    const fillChar = char.charAt(0) || ' ';

    for (let row = y; row < y + height; row++) {
      this.cursor.moveTo(x, row);
      this.write(fillChar.repeat(width));
    }

    if (savedPosition) {
      this.cursor.moveTo(savedPosition.x, savedPosition.y);
    }

    return this;
  }

  /**
   * Draw a box around a rectangular area
   */
  drawBox(rect: Rectangle, style: 'single' | 'double' | 'rounded' = 'single'): this {
    const { x, y, width, height } = rect;
    const savedPosition = this.cursor.getPosition();

    const chars = this.getBoxCharacters(style);

    // Top line
    this.cursor.moveTo(x, y);
    this.write(chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight);

    // Side lines
    for (let row = y + 1; row < y + height - 1; row++) {
      this.cursor.moveTo(x, row);
      this.write(chars.vertical);
      this.cursor.moveTo(x + width - 1, row);
      this.write(chars.vertical);
    }

    // Bottom line
    this.cursor.moveTo(x, y + height - 1);
    this.write(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight);

    if (savedPosition) {
      this.cursor.moveTo(savedPosition.x, savedPosition.y);
    }

    return this;
  }

  /**
   * Get box drawing characters
   */
  private getBoxCharacters(style: 'single' | 'double' | 'rounded') {
    switch (style) {
      case 'double':
        return {
          horizontal: '═',
          vertical: '║',
          topLeft: '╔',
          topRight: '╗',
          bottomLeft: '╚',
          bottomRight: '╝'
        };
      case 'rounded':
        return {
          horizontal: '─',
          vertical: '│',
          topLeft: '╭',
          topRight: '╮',
          bottomLeft: '╰',
          bottomRight: '╯'
        };
      default:
        return {
          horizontal: '─',
          vertical: '│',
          topLeft: '┌',
          topRight: '┐',
          bottomLeft: '└',
          bottomRight: '┘'
        };
    }
  }

  /**
   * Get current terminal size
   */
  getTerminalSize(): TerminalSize {
    const columns = this.output.columns || 80;
    const rows = this.output.rows || 24;
    return { 
      width: columns, 
      height: rows,
      rows,
      columns
    };
  }

  /**
   * Get current size
   */
  getSize(): TerminalSize {
    return { ...this.size };
  }

  /**
   * Write raw output to terminal
   */
  public write(data: string): void {
    this.output.write(data);
  }

  /**
   * Create a new virtual screen
   */
  createVirtualScreen(): Screen {
    const { width, height } = this.getSize();
    return new Screen(width, height);
  }
}