/**
 * Mock terminal implementation for testing
 * Provides a fully controllable terminal environment for unit tests
 */

import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

import {
  Key,
  ColorMode,
  MouseEvent,
  TerminalSize,
  TerminalStream,
  MockTerminal as IMockTerminal
} from '../core/types.js';

/**
 * Mock readable stream for input simulation
 */
class MockReadStream extends Readable {
  private inputQueue: string[] = [];
  private paused = false;

  constructor(public isTTY = true) {
    super();
  }

  override _read(): void {
    if (this.paused) return;
    
    while (this.inputQueue.length > 0) {
      const input = this.inputQueue.shift();
      if (input) {
        if (!this.push(input)) {
          break;
        }
      }
    }
  }

  pushInput(input: string): void {
    this.inputQueue.push(input);
    this._read();
  }

  override pause(): this {
    this.paused = true;
    return this;
  }

  override resume(): this {
    this.paused = false;
    this._read();
    return this;
  }

  setRawMode(mode: boolean): this {
    // Mock implementation
    return this;
  }
}

/**
 * Mock writable stream for output capture
 */
class MockWriteStream extends Writable {
  private output: string[] = [];
  private columns = 80;
  private rows = 24;

  constructor(public isTTY = true) {
    super();
  }

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const str = chunk.toString();
    this.output.push(str);
    callback();
  }

  getOutput(): string[] {
    return [...this.output];
  }

  getAllOutput(): string {
    return this.output.join('');
  }

  getLastOutput(): string {
    return this.output[this.output.length - 1] ?? '';
  }

  clearOutput(): void {
    this.output = [];
  }

  moveCursor(dx: number, dy: number): boolean {
    // Mock implementation
    this.output.push(`[CURSOR_MOVE: ${dx}, ${dy}]`);
    return true;
  }

  clearLine(dir: -1 | 0 | 1): boolean {
    // Mock implementation
    this.output.push(`[CLEAR_LINE: ${dir}]`);
    return true;
  }

  cursorTo(x: number, y?: number): boolean {
    // Mock implementation
    this.output.push(`[CURSOR_TO: ${x}, ${y ?? 0}]`);
    return true;
  }

  setSize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.emit('resize');
  }

  getWindowSize(): [number, number] {
    return [this.columns, this.rows];
  }
}

/**
 * Mock terminal implementation
 */
export class MockTerminal extends EventEmitter implements IMockTerminal {
  public readonly input: NodeJS.ReadStream;
  public readonly output: NodeJS.WriteStream;
  public readonly isTTY: boolean;
  public readonly colorMode: ColorMode;
  private inputHistory: string[] = [];
  private outputHistory: string[] = [];
  private currentSize: TerminalSize;

  constructor(width?: number, height?: number);
  constructor(options?: {
    isTTY?: boolean;
    colorMode?: ColorMode;
    width?: number;
    height?: number;
  });
  constructor(widthOrOptions?: number | {
    isTTY?: boolean;
    colorMode?: ColorMode;
    width?: number;
    height?: number;
  }, height?: number) {
    super(); // Call EventEmitter constructor
    
    let options: {
      isTTY?: boolean;
      colorMode?: ColorMode;
      width?: number;
      height?: number;
    };

    // Handle constructor overloads
    if (typeof widthOrOptions === 'number') {
      options = {
        width: widthOrOptions,
        height
      };
    } else {
      options = widthOrOptions ?? {};
    }

    this.isTTY = options.isTTY ?? true;
    this.colorMode = options.colorMode ?? '256';
    
    this.input = new MockReadStream(this.isTTY) as unknown as NodeJS.ReadStream;
    this.output = new MockWriteStream(this.isTTY) as unknown as NodeJS.WriteStream;
    
    this.currentSize = {
      columns: options.width ?? 80,
      rows: options.height ?? 24,
      width: options.width ?? 80,
      height: options.height ?? 24
    };

    // Set initial size
    (this.output as any).setSize(this.currentSize.columns, this.currentSize.rows);
  }

  /**
   * Get terminal columns (for compatibility with tests)
   */
  get columns(): number {
    return this.currentSize.columns;
  }

  /**
   * Get terminal rows (for compatibility with tests)
   */
  get rows(): number {
    return this.currentSize.rows;
  }

  /**
   * Get mock input history
   */
  get mockInput(): ReadonlyArray<string> {
    return [...this.inputHistory];
  }

  /**
   * Get mock output history
   */
  get mockOutput(): ReadonlyArray<string> {
    return (this.output as any).getOutput();
  }

  /**
   * Set terminal size
   */
  setSize(size: TerminalSize): void {
    this.currentSize = { ...size };
    (this.output as any).setSize(size.columns, size.rows);
  }

  /**
   * Push input to the terminal
   */
  pushInput(input: string): void {
    this.inputHistory.push(input);
    (this.input as any).pushInput(input);
  }

  /**
   * Get the last output
   */
  getLastOutput(): string {
    return (this.output as any).getLastOutput();
  }

  /**
   * Get all output as a single string
   */
  getAllOutput(): string {
    return (this.output as any).getAllOutput();
  }

  /**
   * Clear output buffer
   */
  clearOutput(): void {
    (this.output as any).clearOutput();
  }

  /**
   * Move cursor to specific position
   */
  cursorTo(x: number, y: number = 0): boolean {
    return (this.output as any).cursorTo(x, y);
  }

  /**
   * Move cursor up by n lines
   */
  cursorUp(lines: number = 1): boolean {
    this.output.write(`\x1b[${lines}A`);
    return true;
  }

  /**
   * Move cursor down by n lines
   */
  cursorDown(lines: number = 1): boolean {
    this.output.write(`\x1b[${lines}B`);
    return true;
  }

  /**
   * Move cursor forward by n columns
   */
  cursorForward(columns: number = 1): boolean {
    this.output.write(`\x1b[${columns}C`);
    return true;
  }

  /**
   * Move cursor backward by n columns
   */
  cursorBackward(columns: number = 1): boolean {
    this.output.write(`\x1b[${columns}D`);
    return true;
  }

  /**
   * Save cursor position
   */
  cursorSavePosition(): boolean {
    this.output.write('\x1b[s');
    return true;
  }

  /**
   * Restore cursor position
   */
  cursorRestorePosition(): boolean {
    this.output.write('\x1b[u');
    return true;
  }

  /**
   * Show cursor
   */
  cursorShow(): boolean {
    this.output.write('\x1b[?25h');
    return true;
  }

  /**
   * Hide cursor
   */
  cursorHide(): boolean {
    this.output.write('\x1b[?25l');
    return true;
  }

  /**
   * Clear current line
   */
  clearLine(dir: -1 | 0 | 1 = 0): boolean {
    return (this.output as any).clearLine(dir);
  }

  /**
   * Clear screen down
   */
  clearScreenDown(): boolean {
    this.output.write('\x1b[0J');
    return true;
  }

  /**
   * Clear entire screen
   */
  clearScreen(): boolean {
    this.output.write('\x1b[2J');
    return true;
  }

  /**
   * Scroll up
   */
  scrollUp(lines: number = 1): boolean {
    this.output.write(`\x1b[${lines}S`);
    return true;
  }

  /**
   * Scroll down
   */
  scrollDown(lines: number = 1): boolean {
    this.output.write(`\x1b[${lines}T`);
    return true;
  }

  /**
   * Check if terminal has colors
   */
  hasColors(depth?: number): boolean {
    return this.colorMode !== 'none';
  }

  /**
   * Get color depth
   */
  getColorDepth(): number {
    return this.colorMode === 'none' ? 1 : 256;
  }

  /**
   * Terminal beep
   */
  beep(): boolean {
    this.output.write('\x07');
    return true;
  }

  /**
   * Get window size (alias for compatibility)
   */
  getWindowSize(): [number, number] {
    return [this.currentSize.columns, this.currentSize.rows];
  }

  /**
   * Write text to terminal
   */
  write(text: string | number): boolean {
    // Handle null/undefined gracefully by converting to empty string
    if (text == null) {
      text = '';
    }
    this.output.write(String(text));
    return true;
  }

  /**
   * Write line to terminal
   */
  writeLine(text: string): boolean {
    this.output.write(text + '\n');
    return true;
  }

  /**
   * Get output as string (for compatibility with tests)
   */
  getOutput(): string {
    return this.getAllOutput();
  }

  /**
   * Get output as lines (for compatibility with tests)
   */
  getLines(): string[] {
    return this.getBufferRaw();
  }

  /**
   * Get output buffer as array of strings (for compatibility with tests)
   */
  getBuffer(): string[] {
    return this.getBufferInternal(true);
  }

  /**
   * Get raw buffer without trimming (preserves intentional padding)
   */
  getBufferRaw(): string[] {
    return this.getBufferInternal(false);
  }

  /**
   * Get buffer with optional trimming
   */
  private getBufferInternal(trimLines: boolean = true): string[] {
    const output = this.getAllOutput();
    
    // If there's no output, return empty array
    if (!output) {
      return [];
    }
    
    // Parse ANSI cursor positioning sequences to create a proper line buffer
    const buffer: string[] = new Array(this.currentSize.rows).fill('').map(() => ' '.repeat(this.currentSize.columns));
    
    // Process cursor positioning sequences
    const cursorRegex = /\x1b\[(\d+);(\d+)H([^\x1b]*)/g;
    const matches = Array.from(output.matchAll(cursorRegex));
    
    if (matches.length > 0) {
      for (const match of matches) {
        const [, rowStr, colStr, content] = match;
        const row = parseInt(rowStr || '0', 10) - 1; // Convert to 0-based
        const col = parseInt(colStr || '0', 10) - 1; // Convert to 0-based
        const safeContent = content || '';
        
        if (row >= 0 && row < buffer.length && col >= 0) {
          // Replace the content at the specified position
          const currentLine = buffer[row] || '';
          const beforeCursor = currentLine.substring(0, col);
          const afterCursor = currentLine.substring(col + (safeContent.length || 0));
          buffer[row] = beforeCursor + safeContent + afterCursor;
          
          // Mark this line as having content to prevent inappropriate trimming
          (buffer as any)[`_hasContent_${row}`] = true;
        }
      }
      // Trim trailing spaces from each line if requested
      return trimLines ? buffer.map(line => line.trimEnd()) : buffer;
    }
    
    // If no cursor positioning was found, fall back to simple line splitting
    return output.split('\n').map(line => line || '');
  }

  /**
   * Clear terminal output (alias)
   */
  clear(): void {
    this.clearOutput();
  }

  
  /**
   * Get the last N lines from output
   */
  getLastLines(count: number): string[] {
    const lines = this.getBuffer();
    if (count <= 0) return [];
    return lines.slice(-count);
  }
  
  /**
   * Get the number of lines in the buffer
   */
  getLineCount(): number {
    return this.getBuffer().length;
  }
  
  /**
   * Resize the terminal
   */
  resize(columns: number, rows: number): void {
    this.setSize({ columns, rows, width: columns, height: rows });
    this.emit('resize');
  }
  
  // EventEmitter methods are now inherited from EventEmitter
  
  /**
   * Check if output contains specific text
   */
  contains(text: string): boolean {
    return this.getAllOutput().includes(text);
  }
  
  /**
   * Find line index containing text
   */
  findLine(text: string): number {
    const lines = this.getBuffer();
    return lines.findIndex(line => line.includes(text));
  }
  
  /**
   * Get total buffer character length
   */
  getBufferLength(): number {
    return this.getAllOutput().length;
  }
  
  /**
   * Simulate keypress event
   */
  simulateKeypress(str: string, key: Partial<Key>): void {
    // Emit keypress event on terminal instance (now extends EventEmitter)
    this.emit('keypress', str, key);
  }

  /**
   * Simulate key press
   */
  sendKey(key: Partial<Key>): void {
    const fullKey: Key = {
      sequence: key.sequence ?? '',
      name: key.name ?? '',
      ctrl: key.ctrl ?? false,
      meta: key.meta ?? false,
      shift: key.shift ?? false,
      code: key.code
    };

    // Generate appropriate escape sequence
    let sequence = fullKey.sequence;
    if (!sequence) {
      if (fullKey.name === 'return' || fullKey.name === 'enter') {
        sequence = '\r';
      } else if (fullKey.name === 'escape') {
        sequence = '\x1b';
      } else if (fullKey.name === 'tab') {
        sequence = '\t';
      } else if (fullKey.name === 'backspace') {
        sequence = '\x7f';
      } else if (fullKey.name === 'up') {
        sequence = '\x1b[A';
      } else if (fullKey.name === 'down') {
        sequence = '\x1b[B';
      } else if (fullKey.name === 'right') {
        sequence = '\x1b[C';
      } else if (fullKey.name === 'left') {
        sequence = '\x1b[D';
      } else if (fullKey.ctrl && fullKey.name) {
        // Ctrl + letter
        const charCode = fullKey.name.charCodeAt(0);
        if (charCode >= 97 && charCode <= 122) {
          sequence = String.fromCharCode(charCode - 96);
        }
      } else {
        sequence = fullKey.name;
      }
    }

    this.pushInput(sequence);
  }

  /**
   * Simulate mouse event
   */
  sendMouse(event: Partial<MouseEvent>): void {
    const fullEvent: MouseEvent = {
      type: event.type ?? 'click',
      x: event.x ?? 0,
      y: event.y ?? 0,
      button: event.button,
      modifiers: {
        ctrl: event.modifiers?.ctrl ?? false,
        meta: event.modifiers?.meta ?? false,
        shift: event.modifiers?.shift ?? false,
        alt: event.modifiers?.alt ?? false
      }
    };

    // Generate mouse escape sequence (simplified)
    const sequence = `\x1b[<${fullEvent.button === 'left' ? 0 : fullEvent.button === 'right' ? 2 : 1};${fullEvent.x};${fullEvent.y}${fullEvent.type === 'click' ? 'M' : 'm'}`;
    this.pushInput(sequence);
  }

  /**
   * Simulate text input
   */
  sendText(text: string): void {
    for (const char of text) {
      this.pushInput(char);
    }
  }

  /**
   * Wait for specific output
   */
  async waitForOutput(matcher: string | RegExp, timeout = 1000): Promise<string> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = (): void => {
        const output = this.getAllOutput();
        const match = typeof matcher === 'string' 
          ? output.includes(matcher)
          : matcher.test(output);
        
        if (match) {
          resolve(output);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for output matching: ${matcher}`));
        } else {
          setTimeout(check, 10);
        }
      };
      
      check();
    });
  }

  /**
   * Create a snapshot of current state
   */
  snapshot(): {
    input: string[];
    output: string[];
    size: TerminalSize;
  } {
    return {
      input: [...this.inputHistory],
      output: (this.output as any).getOutput(),
      size: { ...this.currentSize }
    };
  }

  /**
   * Reset terminal state
   */
  reset(): void {
    this.inputHistory = [];
    this.outputHistory = [];
    this.clearOutput();
    this.currentSize = {
      columns: 80,
      rows: 24,
      width: 80,
      height: 24
    };
    (this.output as any).setSize(80, 24);
  }

  /**
   * Get terminal as TerminalStream
   */
  asStream(): TerminalStream {
    return {
      input: this.input as unknown as NodeJS.ReadStream,
      output: this.output as unknown as NodeJS.WriteStream,
      isTTY: this.isTTY,
      colorMode: this.colorMode
    };
  }

  /**
   * Cleanup terminal resources
   */
  cleanup(): void {
    this.reset();
    this.removeAllListeners();
  }
}

/**
 * Create a mock terminal
 */
export function createMockTerminal(options?: {
  isTTY?: boolean;
  colorMode?: ColorMode;
  width?: number;
  height?: number;
}): MockTerminal {
  return new MockTerminal(options);
}