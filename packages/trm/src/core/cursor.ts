/**
 * Cursor management implementation
 * Provides cursor control and positioning for terminals
 */

import { ansi } from './ansi.js';
import {
  type X,
  type Y,
  CursorShape,
  type Cursor,
  type CursorPosition
} from '../types.js';

/**
 * Cursor implementation
 */
export class CursorImpl implements Cursor {
  private _position: CursorPosition = { x: 0 as X, y: 0 as Y };
  private _visible = true;
  private _shape = CursorShape.Block;
  private _blinking = true;
  private savedPosition?: CursorPosition;
  private positionStack: CursorPosition[] = [];
  private writeOutput: (data: string) => void;

  constructor(writeOutput: (data: string) => void) {
    this.writeOutput = writeOutput;
  }

  // ============================================================================
  // Position
  // ============================================================================

  /**
   * Move cursor to absolute position
   */
  moveTo(x: X, y: Y): void {
    this._position = { x, y };
    // Terminal positions are 1-indexed
    this.writeOutput(ansi.cursorPosition(y + 1, x + 1));
  }

  /**
   * Move cursor up
   */
  moveUp(lines: number): void {
    if (lines <= 0) return;
    this._position = { ...this._position, y: Math.max(0, this._position.y - lines) as Y };
    this.writeOutput(ansi.cursorUp(lines));
  }

  /**
   * Move cursor down
   */
  moveDown(lines: number): void {
    if (lines <= 0) return;
    this._position = { ...this._position, y: (this._position.y + lines) as Y };
    this.writeOutput(ansi.cursorDown(lines));
  }

  /**
   * Move cursor left
   */
  moveLeft(cols: number): void {
    if (cols <= 0) return;
    this._position = { ...this._position, x: Math.max(0, this._position.x - cols) as X };
    this.writeOutput(ansi.cursorBack(cols));
  }

  /**
   * Move cursor right
   */
  moveRight(cols: number): void {
    if (cols <= 0) return;
    this._position = { ...this._position, x: (this._position.x + cols) as X };
    this.writeOutput(ansi.cursorForward(cols));
  }

  /**
   * Move cursor to column
   */
  moveToColumn(col: X): void {
    this._position = { ...this._position, x: col };
    this.writeOutput(ansi.cursorColumn(col + 1));
  }

  /**
   * Move to next line
   */
  moveToNextLine(lines = 1): void {
    if (lines <= 0) return;
    this._position = { 
      x: 0 as X,
      y: (this._position.y + lines) as Y 
    };
    this.writeOutput(ansi.cursorNextLine(lines));
  }

  /**
   * Move to previous line
   */
  moveToPreviousLine(lines = 1): void {
    if (lines <= 0) return;
    this._position = {
      x: 0 as X,
      y: Math.max(0, this._position.y - lines) as Y
    };
    this.writeOutput(ansi.cursorPreviousLine(lines));
  }

  // ============================================================================
  // Position Queries
  // ============================================================================

  /**
   * Get cursor position asynchronously
   * This requires reading from the terminal input
   */
  async getPosition(): Promise<CursorPosition> {
    // Send cursor position request
    this.writeOutput(ansi.getCursorPosition());
    
    // In a real implementation, this would read from stdin
    // and parse the response (ESC[row;colR)
    // For now, return the tracked position
    return new Promise((resolve) => {
      // Simulate async operation
      setTimeout(() => {
        resolve({ ...this._position });
      }, 0);
    });
  }

  /**
   * Get current position (synchronous, tracked internally)
   */
  get position(): CursorPosition {
    return { ...this._position };
  }

  // ============================================================================
  // Visibility
  // ============================================================================

  /**
   * Show cursor
   */
  show(): void {
    this._visible = true;
    this.writeOutput(ansi.cursorShow());
  }

  /**
   * Hide cursor
   */
  hide(): void {
    this._visible = false;
    this.writeOutput(ansi.cursorHide());
  }

  /**
   * Get cursor visibility
   */
  get visible(): boolean {
    return this._visible;
  }

  // ============================================================================
  // Style
  // ============================================================================

  /**
   * Set cursor shape
   */
  setShape(shape: CursorShape): void {
    this._shape = shape;
    this.writeOutput(ansi.cursorShape(shape));
  }

  /**
   * Get cursor shape
   */
  get shape(): CursorShape {
    return this._shape;
  }

  // ============================================================================
  // Blinking
  // ============================================================================

  /**
   * Enable cursor blinking
   */
  enableBlink(): void {
    this._blinking = true;
    this.writeOutput(ansi.cursorBlink(true));
  }

  /**
   * Disable cursor blinking
   */
  disableBlink(): void {
    this._blinking = false;
    this.writeOutput(ansi.cursorBlink(false));
  }

  /**
   * Get blinking state
   */
  get blinking(): boolean {
    return this._blinking;
  }

  // ============================================================================
  // Save/Restore
  // ============================================================================

  /**
   * Save cursor position
   */
  save(): void {
    this.savedPosition = { ...this._position };
    this.writeOutput(ansi.cursorSave());
  }

  /**
   * Restore cursor position
   */
  restore(): void {
    if (this.savedPosition) {
      this._position = { ...this.savedPosition };
    }
    this.writeOutput(ansi.cursorRestore());
  }

  /**
   * Push current position to stack
   */
  push(): void {
    this.positionStack.push({ ...this._position });
    this.writeOutput(ansi.cursorSavePosition());
  }

  /**
   * Pop position from stack
   */
  pop(): void {
    const position = this.positionStack.pop();
    if (position) {
      this._position = position;
      this.writeOutput(ansi.cursorRestorePosition());
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Reset cursor to default state
   */
  reset(): void {
    this._position = { x: 0 as X, y: 0 as Y };
    this._visible = true;
    this._shape = CursorShape.Block;
    this._blinking = true;
    this.savedPosition = undefined;
    this.positionStack = [];
    
    // Reset cursor in terminal
    this.writeOutput(ansi.cursorShow());
    this.writeOutput(ansi.cursorBlink(true));
    this.writeOutput(ansi.cursorShape(CursorShape.Block));
    this.writeOutput(ansi.cursorPosition(1, 1));
  }

  /**
   * Update internal position tracking
   * (Used when position changes due to text output)
   */
  updatePosition(x: X, y: Y): void {
    this._position = { x, y };
  }
}

// Export alias for backward compatibility with tests
export { CursorImpl as Cursor };

// Export default
export default CursorImpl;