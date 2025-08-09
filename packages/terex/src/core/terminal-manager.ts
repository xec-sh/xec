/**
 * Terminal Manager - Improved terminal handling for terex
 * 
 * Handles cursor positioning properly to render at current position
 * like log-update instead of always clearing and going to line 1
 */

import { CursorController } from './cursor.js';
import { ScreenController } from './screen.js';
import { RenderMode } from './render-engine.js';

import type { Position, TerminalSize, TerminalStream } from './types.js';

export interface TerminalManagerOptions {
  /** Whether to preserve terminal state on exit */
  preserveState?: boolean;
  /** Whether to use log-update style rendering (render at cursor position) */
  mode?: RenderMode;
  /** Whether to hide cursor during rendering */
  hideCursor?: boolean;
  /** Whether to enable automatic cleanup on process signals */
  autoCleanup?: boolean;
}

/**
 * Manages terminal state and provides ink/log-update style rendering
 * Key improvements:
 * - Renders at current cursor position instead of always at (0,0)
 * - Proper cleanup mechanisms with signal handlers
 * - Preserves terminal state
 * - Better cursor management
 */
export class TerminalManager {
  private readonly stream: TerminalStream;
  private readonly cursor: CursorController;
  private readonly screen: ScreenController;
  private readonly options: Required<TerminalManagerOptions>;

  // State tracking
  private initialPosition: Position | null = null;
  private renderStartPosition: Position | null = null;
  private currentRenderHeight = 0;
  private isActive = false;
  private cleanupHandlers: Array<() => void | Promise<void>> = [];
  private signalHandlers: Map<NodeJS.Signals | 'exit', () => void> = new Map();

  constructor(stream: TerminalStream, options: TerminalManagerOptions = {}) {
    this.stream = stream;
    this.cursor = new CursorController(stream);
    this.screen = new ScreenController(stream, this.cursor);

    this.options = {
      preserveState: options.preserveState ?? true,
      mode: options.mode ?? 'inline',
      hideCursor: options.hideCursor ?? true,
      autoCleanup: options.autoCleanup ?? true,
    };
  }

  /**
   * Initialize terminal manager
   * - Gets current cursor position 
   * - Sets up signal handlers for cleanup
   * - Prepares terminal for rendering
   */
  async initialize(): Promise<void> {
    if (this.isActive) {
      return;
    }

    if (this.options.mode === 'fullscreen') {
      // Fullscreen mode: clear terminal and start from top
      this.screen.clear();
      this.cursor.moveTo(0, 0);
      this.initialPosition = { x: 0, y: 0 };
      this.renderStartPosition = { x: 0, y: 0 };
    } else {
      // For log-update, we render at current cursor position
      this.initialPosition = { x: 0, y: 0 };
      this.renderStartPosition = { x: 0, y: 0 };
    }

    // Setup signal handlers for cleanup
    if (this.options.autoCleanup) {
      this.setupSignalHandlers();
    }

    // Hide cursor if requested
    if (this.options.hideCursor) {
      this.cursor.hide();
    }

    this.isActive = true;
  }

  /**
   * Render content at the current position (log-update style)
   * This is the key improvement - renders at cursor position instead of clearing screen
   */
  async renderAtPosition(lines: string[]): Promise<void> {
    if (!this.isActive) {
      throw new Error('TerminalManager not initialized');
    }

    // For the very first render, save cursor position
    if (this.currentRenderHeight === 0 && this.options.mode === 'inline') {
      this.cursor.save();
    }

    // If we have a previous render, we need to clear it
    if (this.currentRenderHeight > 0) {
      // Restore to the saved position (start of our render area)
      if (this.options.mode === 'inline') {
        this.cursor.restore();
      }

      // Clear all the lines we previously rendered
      for (let i = 0; i < this.currentRenderHeight; i++) {
        this.screen.clearLine();
        if (i < this.currentRenderHeight - 1) {
          this.cursor.down(1);
        }
      }

      // Go back to the start position - move up to first line
      if (this.currentRenderHeight > 1) {
        this.cursor.up(this.currentRenderHeight - 1);
      }
    }

    // Render each line
    for (let i = 0; i < lines.length; i++) {
      // Clear the current line (in case new content is shorter than old)
      this.screen.clearLine();

      // Write the line content
      const line = lines[i];
      if (line !== undefined) {
        this.screen.write(line);
      }

      // Move to next line unless it's the last line
      if (i < lines.length - 1) {
        this.screen.write('\n');
      }
    }

    // Update render height tracking
    this.currentRenderHeight = lines.length;

    // Save the position again for the next render (in log-update style)
    if (this.options.mode === 'inline') {
      // Move back to the first line and save position
      if (this.currentRenderHeight > 1) {
        this.cursor.up(this.currentRenderHeight - 1);
      }
      this.cursor.toColumn(0);
      this.cursor.save();
    }
  }


  /**
   * Render content in fullscreen mode
   * Clears terminal and renders from top-left corner
   */
  async renderFullscreen(lines: string[]): Promise<void> {
    if (!this.isActive) {
      throw new Error('TerminalManager not initialized');
    }

    // Move cursor to top-left
    this.cursor.moveTo(0, 0);

    // Clear screen
    this.screen.clear();

    // Render each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined) {
        // Move to beginning of line and write content
        this.cursor.moveTo(0, i);
        this.screen.write(line);
      }
    }

    // Track render height for cleanup
    this.currentRenderHeight = lines.length;
  }

  /**
   * End rendering session and prepare for exit
   * Clears rendered content and moves cursor to clean position
   */
  async endRender(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    // Clear the rendered content in log-update mode
    if (this.options.mode === 'inline' && this.currentRenderHeight > 0) {
      // Restore to the saved position (start of our render area)
      this.cursor.restore();

      // Clear all the lines we previously rendered
      for (let i = 0; i < this.currentRenderHeight; i++) {
        this.screen.clearLine();
        if (i < this.currentRenderHeight - 1) {
          this.cursor.down(1);
        }
      }

      // IMPORTANT: Move cursor back to the first line of the render area
      // after clearing all lines
      if (this.currentRenderHeight > 1) {
        this.cursor.up(this.currentRenderHeight - 1);
      }

      // Reset render height
      this.currentRenderHeight = 0;
    }

    // Show cursor
    if (this.options.hideCursor) {
      this.cursor.show();
    }

    // Don't add extra newline in log-update mode - cursor is already at the right position
    if (this.options.mode !== 'inline') {
      // Write final newline to leave space for next command
      this.stream.output.write('\n');
    }
  }

  /**
   * Cleanup terminal state and restore original state
   */
  async cleanup(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    // Run cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        await handler();
      } catch (error) {
        console.warn('Cleanup handler failed:', error);
      }
    }

    // Clear the rendered content if it hasn't been cleared yet
    if (this.options.mode === 'inline' && this.currentRenderHeight > 0) {
      // Restore to the saved position (start of our render area)
      this.cursor.restore();

      // Clear all the lines we previously rendered
      for (let i = 0; i < this.currentRenderHeight; i++) {
        this.screen.clearLine();
        if (i < this.currentRenderHeight - 1) {
          this.cursor.down(1);
        }
      }

      // IMPORTANT: Move cursor back to the first line of the render area
      // after clearing all lines
      if (this.currentRenderHeight > 1) {
        this.cursor.up(this.currentRenderHeight - 1);
      }

      // Reset render height
      this.currentRenderHeight = 0;
    } else if (this.currentRenderHeight > 0 && this.options.mode !== 'inline') {
      // For non-log-update mode, just move to next line
      this.stream.output.write('\n');
    }

    // Restore cursor visibility
    this.cursor.show();

    // Move to next line for clean exit only if we want to preserve state
    // and we actually rendered something
    if (this.options.preserveState && this.options.mode !== 'inline') {
      this.stream.output.write('\n');
    }

    // Remove signal handlers
    this.removeSignalHandlers();

    this.isActive = false;
  }

  /**
   * Add cleanup handler
   */
  addCleanupHandler(handler: () => void | Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Get current terminal size
   */
  getTerminalSize(): TerminalSize {
    return this.screen.getSize();
  }

  /**
   * Get current cursor position
   */
  getCurrentPosition(): Position | null {
    return this.isActive ? this.cursor.getPosition() : null;
  }

  /**
   * Get initial cursor position (where rendering started)
   */
  getInitialPosition(): Position | null {
    return this.initialPosition;
  }

  /**
   * Check if terminal is active
   */
  isActiveState(): boolean {
    return this.isActive;
  }

  /**
   * Setup signal handlers for cleanup
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];

    for (const signal of signals) {
      const handler = () => {
        this.cleanup().finally(() => {
          process.exit(0);
        });
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    // Handle process exit
    const exitHandler = () => {
      this.cleanup();
    };

    process.on('exit', exitHandler);
    this.signalHandlers.set('exit', exitHandler);
  }

  /**
   * Remove signal handlers
   */
  private removeSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      if (signal === 'exit') {
        process.removeListener('exit', handler);
      } else {
        process.removeListener(signal, handler);
      }
    }
    this.signalHandlers.clear();
  }

  /**
   * Get the underlying controllers for advanced usage
   */
  getControllers(): {
    cursor: CursorController;
    screen: ScreenController;
  } {
    return {
      cursor: this.cursor,
      screen: this.screen,
    };
  }
}

/**
 * Factory function to create terminal manager
 */
export function createTerminalManager(
  stream: TerminalStream,
  options?: TerminalManagerOptions
): TerminalManager {
  return new TerminalManager(stream, options);
}

/**
 * Create terminal manager with default streams
 */
export function createDefaultTerminalManager(
  options?: TerminalManagerOptions
): TerminalManager {
  const stream: TerminalStream = {
    input: process.stdin,
    output: process.stdout,
    isTTY: process.stdout.isTTY ?? false,
    colorMode: 'truecolor'
  };

  return new TerminalManager(stream, options);
}