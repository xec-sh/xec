/**
 * Cursor control module for terminal manipulation
 * Provides low-level cursor movement and visibility control
 */

import { Position, TerminalStream } from './types.js';

// ANSI escape codes for cursor control
const ESC = '\x1b[';
const CSI = ESC;

/**
 * Cursor controller for terminal manipulation
 */
export class CursorController {
  private readonly output: NodeJS.WriteStream;
  private readonly input: NodeJS.ReadStream;
  private currentPosition: Position = { x: 0, y: 0 };
  private savedPositions: Position[] = [];
  private visible = true;

  constructor(stream: TerminalStream) {
    this.output = stream.output;
    this.input = stream.input;
  }

  /**
   * Initialize cursor controller by requesting current position from terminal
   * Should be called once at startup before using the controller
   */
  async initialize(): Promise<void> {
    // Only request position if we're in a TTY environment
    if (this.output.isTTY) {
      await this.requestPosition();
    }
  }

  /**
   * Move cursor to absolute position
   */
  moveTo(x: number, y: number): this {
    // Clamp negative values to 0 for graceful handling
    const clampedX = Math.max(0, x);
    const clampedY = Math.max(0, y);
    this.validatePosition(clampedX, clampedY);
    this.write(`${CSI}${clampedY + 1};${clampedX + 1}H`);
    this.currentPosition = { x: clampedX, y: clampedY };
    return this;
  }

  /**
   * Move cursor up by n lines
   */
  up(lines = 1): this {
    this.validateCount(lines);
    if (lines > 0) {
      this.write(`${CSI}${lines}A`);
      this.currentPosition = {
        x: this.currentPosition.x,
        y: Math.max(0, this.currentPosition.y - lines)
      };
    }
    return this;
  }

  /**
   * Move cursor down by n lines
   */
  down(lines = 1): this {
    this.validateCount(lines);
    if (lines > 0) {
      this.write(`${CSI}${lines}B`);
      this.currentPosition = {
        x: this.currentPosition.x,
        y: this.currentPosition.y + lines
      };
    }
    return this;
  }

  /**
   * Move cursor forward (right) by n columns
   */
  forward(columns = 1): this {
    this.validateCount(columns);
    if (columns > 0) {
      this.write(`${CSI}${columns}C`);
      this.currentPosition = {
        x: this.currentPosition.x + columns,
        y: this.currentPosition.y
      };
    }
    return this;
  }

  /**
   * Move cursor backward (left) by n columns
   */
  backward(columns = 1): this {
    this.validateCount(columns);
    if (columns > 0) {
      this.write(`${CSI}${columns}D`);
      this.currentPosition = {
        x: Math.max(0, this.currentPosition.x - columns),
        y: this.currentPosition.y
      };
    }
    return this;
  }

  /**
   * Move cursor to beginning of line n lines down
   */
  nextLine(lines = 1): this {
    this.validateCount(lines);
    if (lines > 0) {
      this.write(`${CSI}${lines}E`);
      this.currentPosition = {
        x: 0,
        y: this.currentPosition.y + lines
      };
    }
    return this;
  }

  /**
   * Move cursor to beginning of line n lines up
   */
  previousLine(lines = 1): this {
    this.validateCount(lines);
    if (lines > 0) {
      this.write(`${CSI}${lines}F`);
      this.currentPosition = {
        x: 0,
        y: Math.max(0, this.currentPosition.y - lines)
      };
    }
    return this;
  }

  /**
   * Move cursor to column n in current line
   */
  column(n: number): this {
    this.validatePosition(n, 0);
    this.write(`${CSI}${n + 1}G`);
    this.currentPosition = {
      x: n,
      y: this.currentPosition.y
    };
    return this;
  }

  /**
   * Move cursor to column n in current line (alias for column)
   */
  toColumn(n: number): this {
    return this.column(n);
  }

  /**
   * Save current cursor position
   */
  save(): this {
    this.write(`${CSI}s`);
    this.savedPositions.push({ ...this.currentPosition });
    return this;
  }

  /**
   * Restore previously saved cursor position
   */
  restore(): this {
    const saved = this.savedPositions.pop();
    if (saved) {
      this.write(`${CSI}u`);
      this.currentPosition = saved;
    }
    return this;
  }

  /**
   * Hide cursor
   */
  hide(): this {
    if (this.visible) {
      this.write(`${CSI}?25l`);
      this.visible = false;
    }
    return this;
  }

  /**
   * Show cursor
   */
  show(): this {
    this.write(`${CSI}?25h`);
    this.visible = true;
    return this;
  }

  /**
   * Get current cursor position
   */
  getPosition(): Readonly<Position> {
    return { ...this.currentPosition };
  }

  /**
   * Check if cursor is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Request cursor position report from terminal
   * Returns a promise that resolves with the position
   */
  async requestPosition(): Promise<Position> {
    return new Promise((resolve) => {
      const handler = (data: Buffer): void => {
        const match = /\[(\d+);(\d+)R/.exec(data.toString());
        if (match && match[1] && match[2]) {
          const y = parseInt(match[1], 10) - 1;
          const x = parseInt(match[2], 10) - 1;
          this.currentPosition = { x, y };
          this.input.off('data', handler);
          resolve({ x, y });
        }
      };
      
      this.input.on('data', handler);
      this.write(`${CSI}6n`);
      
      // Timeout after 100ms
      setTimeout(() => {
        this.input.off('data', handler);
        resolve(this.currentPosition);
      }, 100);
    });
  }

  /**
   * Reset cursor to home position (0, 0)
   */
  home(): this {
    return this.moveTo(0, 0);
  }

  /**
   * Move cursor by relative offset
   */
  move(dx: number, dy: number): this {
    const newX = Math.max(0, this.currentPosition.x + dx);
    const newY = Math.max(0, this.currentPosition.y + dy);
    return this.moveTo(newX, newY);
  }

  private write(data: string): void {
    this.output.write(data);
  }

  private validatePosition(x: number, y: number): void {
    if (x < 0 || y < 0) {
      throw new RangeError(`Invalid position: (${x}, ${y}). Positions must be non-negative.`);
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new TypeError(`Invalid position: (${x}, ${y}). Positions must be integers.`);
    }
  }

  private validateCount(count: number): void {
    if (count < 0) {
      throw new RangeError(`Invalid count: ${count}. Count must be non-negative.`);
    }
    if (!Number.isInteger(count)) {
      throw new TypeError(`Invalid count: ${count}. Count must be an integer.`);
    }
  }
}

/**
 * Factory function to create a cursor controller
 */
export function createCursorController(stream: TerminalStream): CursorController {
  return new CursorController(stream);
}