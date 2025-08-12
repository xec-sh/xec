/**
 * Main Terminal implementation
 * Combines all core components into a unified terminal interface
 */

import { InputImpl } from './input.js';
import { ScreenImpl } from './screen.js';
import { CursorImpl } from './cursor.js';
import { ColorSystem } from './color.js';
import { StylesImpl } from './styles.js';
import { ANSISequences } from './ansi.js';
import { initPlatform } from './platform.js';
import { EventEmitterImpl } from './events.js';
import { BufferManagerImpl } from './buffer.js';
import { createTerminalStream } from './stream.js';
import {
  type X,
  type Y,
  type ANSI,
  type Rows,
  type Cols,
  type Style,
  ColorDepth,
  type Input,
  type Screen,
  type Cursor,
  type Colors,
  type Styles,
  type Terminal,
  type CursorShape,
  type EventEmitter,
  type TerminalState,
  type BufferManager,
  type TerminalStream,
  type TerminalEvents,
  type TerminalOptions
} from '../types.js';

/**
 * Main Terminal implementation
 */
export class TerminalImpl implements Terminal {
  readonly stream: TerminalStream;
  readonly screen: Screen;
  readonly cursor: Cursor;
  readonly colors: Colors;
  readonly styles: Styles;
  readonly input: Input;
  readonly buffer: BufferManager;
  readonly ansi: ANSI;
  readonly events: EventEmitter<TerminalEvents>;

  private _initialized = false;
  private _closed = false;
  private alternateBufferDisposer?: { dispose(): void };
  private resizeHandler?: () => void;
  private options: Required<Omit<TerminalOptions, 'stdin' | 'stdout' | 'stderr' | 'cursorShape' | 'platform'>> & {
    cursorShape?: CursorShape;
    platform?: any;
  };
  private lastOutput = '';
  private updatePositionSaved = false;

  constructor(options: TerminalOptions = {}) {
    // Set defaults - inline mode is default
    this.options = {
      mode: options.mode ?? 'inline',
      clearOnExit: options.clearOnExit ?? false,
      colors: options.colors ?? true,
      forceColor: options.forceColor ?? false,
      rawMode: options.rawMode ?? false,
      alternateBuffer: options.alternateBuffer ?? false,
      mouse: options.mouse ?? false,
      keyboard: options.keyboard ?? true,
      bracketedPaste: options.bracketedPaste ?? false,
      focusTracking: options.focusTracking ?? false,
      cursorHidden: options.cursorHidden ?? false,
      cursorShape: options.cursorShape,
      bufferSize: options.bufferSize ?? 1024,
      flushInterval: options.flushInterval ?? 16,
      platform: options.platform,
      debug: options.debug ?? false,
      logLevel: options.logLevel ?? 'error'
    };

    // Create terminal stream
    this.stream = createTerminalStream(
      options.stdin,
      options.stdout,
      options.stderr
    );

    // Initialize components
    this.screen = new ScreenImpl(this.stream);
    this.cursor = new CursorImpl((data) => this.stream.write(data));
    this.colors = new ColorSystem(
      options.colors === true ? ColorDepth.TrueColor :
        options.colors === false ? ColorDepth.None :
          typeof options.colors === 'number' ? options.colors :
            this.stream.colorDepth
    );
    this.styles = new StylesImpl(this.colors);
    this.input = new InputImpl(this.stream) as Input;
    this.buffer = new BufferManagerImpl(this.stream);
    this.ansi = new ANSISequences();
    this.events = new EventEmitterImpl<TerminalEvents>() as EventEmitter<TerminalEvents>;

    // Apply initial options
    this.applyOptions(options);
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // Initialize platform-specific features
    await initPlatform();

    // Set up resize handling
    this.setupResizeHandler();

    // Configure based on mode
    switch (this.options.mode) {
      case 'fullscreen':
        // Use alternate buffer for fullscreen mode
        this.alternateBufferDisposer = this.stream.useAlternateBuffer();
        // Always clear screen in fullscreen mode - it's a fresh canvas
        this.screen.clear();
        // Raw mode is usually needed for fullscreen
        if (this.options.rawMode !== false) {
          this.stream.setRawMode(true);
        }
        break;

      case 'inline':
      default:
        // Inline mode - continue from current position
        // Note: Cursor position will be saved when update() is first called if needed
        break;
    }

    // Override with explicit alternateBuffer option if provided
    if (this.options.alternateBuffer && !this.alternateBufferDisposer) {
      this.alternateBufferDisposer = this.stream.useAlternateBuffer();
    }

    // Set raw mode if explicitly requested
    if (this.options.rawMode) {
      this.stream.setRawMode(true);
    }

    // Hide cursor if requested
    if (this.options.cursorHidden) {
      this.cursor.hide();
    }

    // Set cursor shape if specified
    if (this.options.cursorShape !== undefined) {
      this.cursor.setShape(this.options.cursorShape);
    }

    // Enable mouse if requested
    if (this.options.mouse) {
      this.input.enableMouse();
    }

    // Enable bracketed paste if requested
    if (this.options.bracketedPaste) {
      this.input.enableBracketedPaste();
    }

    // Enable focus tracking if requested
    if (this.options.focusTracking) {
      this.input.enableFocusTracking();
    }

    // Start input event processing
    this.startInputProcessing();

    this._initialized = true;
    this.events.emit('resize', this.stream.rows, this.stream.cols);
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }

    this._closed = true;

    // Clear on exit if requested
    if (this.options.clearOnExit) {
      switch (this.options.mode) {
        case 'inline':
          // Clear the last rendered content
          if (this.lastOutput) {
            if (this.updatePositionSaved) {
              // If we saved position during updates, restore and clear
              this.cursor.restore();
              this.stream.write(this.ansi.clearScreenDown());
            } else {
              // Otherwise, move up based on output lines and clear
              const lines = this.lastOutput.split('\n').length;
              this.stream.write(this.ansi.cursorUp(lines));
              this.stream.write(this.ansi.clearScreenDown());
            }
          }
          break;

        case 'fullscreen':
          // Fullscreen mode will clear when exiting alternate buffer
          break;
          
        default:
          // Unknown mode - no clearing needed
          break;
      }
    }

    // Emit close event
    this.events.emit('close');

    // Close input
    this.input.close();

    // Restore cursor
    this.cursor.show();

    // Disable raw mode
    if (this.stream.isRaw) {
      this.stream.setRawMode(false);
    }

    // Restore main buffer
    if (this.alternateBufferDisposer) {
      this.alternateBufferDisposer.dispose();
    }

    // Remove resize handler
    if (this.resizeHandler) {
      this.removeResizeHandler();
    }

    // Flush any remaining output
    await this.stream.flush();
  }

  // ============================================================================
  // State
  // ============================================================================

  get initialized(): boolean {
    return this._initialized;
  }

  get closed(): boolean {
    return this._closed;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Write data to the stream
   */
  write(data: string | Uint8Array): void {
    // Track output for clearing on exit
    if (typeof data === 'string') {
      this.lastOutput += data;
    }
    this.stream.write(data);
  }

  /**
   * Write a line of text
   */
  writeLine(data: string): void {
    this.lastOutput += data + '\n';
    this.stream.writeLine(data);
  }

  /**
   * Optimized write method with style support
   * Writes directly to the stream with minimal overhead
   */
  writeStyled(
    text: string,
    style?: Style,
    options?: {
      newline?: boolean;
      flush?: boolean;
      position?: { x: X; y: Y };
    }
  ): void {
    let output = '';

    // Move to position if specified
    if (options?.position) {
      output += this.ansi.cursorPosition(
        options.position.y + 1,
        options.position.x + 1
      );
    }

    // Apply style if provided
    if (style) {
      output += this.styles.apply(style);
    }

    // Add the text
    output += text;

    // Reset style if it was applied
    if (style) {
      output += '\x1b[0m'; // Direct reset sequence
    }

    // Add newline if requested
    if (options?.newline) {
      output += '\n';
    }

    // Write to stream
    this.stream.write(output);

    // Track output for cleanup
    this.lastOutput += output;

    // Flush if requested
    if (options?.flush) {
      this.stream.flush();
    }
  }

  /**
   * Write styled text with template literal support
   * Allows for inline styling with tagged templates
   */
  writeTemplate(strings: TemplateStringsArray, ...values: any[]): void {
    let output = '';
    let currentStyle: Style | undefined;

    for (let i = 0; i < strings.length; i++) {
      // Add the string part
      if (currentStyle) {
        output += this.styles.apply(currentStyle);
      }
      output += strings[i];
      if (currentStyle) {
        output += '\x1b[0m'; // Reset all styles
      }

      // Process the value if present
      if (i < values.length) {
        const value = values[i];

        // Check if value is a style object
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Assume it's a style object
          currentStyle = value as Style;
        } else {
          // Regular value - convert to string and apply current style
          if (currentStyle) {
            output += this.styles.apply(currentStyle);
          }
          output += String(value);
          if (currentStyle) {
            output += '\x1b[0m'; // Reset all styles
            currentStyle = undefined;
          }
        }
      }
    }

    this.stream.write(output);
    this.lastOutput += output;
  }

  /**
   * Update output in-place
   * Works in any mode to update content without scrolling
   */
  update(content: string): void {
    if (this.options.mode === 'inline') {
      // Save cursor position on first update
      if (!this.updatePositionSaved) {
        this.cursor.save();
        this.updatePositionSaved = true;
      } else {
        // Restore to saved position for subsequent updates
        this.cursor.restore();
      }

      // Clear from current position down
      this.stream.write(this.ansi.clearScreenDown());

      // Write new content
      this.lastOutput = content;
      this.stream.write(content);
    } else {
      // Fullscreen mode - just write
      this.stream.write(content);
    }
  }

  /**
   * Clear the last output (useful for cleaning up)
   */
  clearLastOutput(): void {
    if (this.lastOutput) {
      const lines = this.lastOutput.split('\n').length;
      this.stream.write(this.ansi.cursorUp(lines));
      this.stream.write(this.ansi.clearScreenDown());
      this.lastOutput = '';
    }
  }

  async flush(): Promise<void> {
    return this.stream.flush();
  }

  getSize(): { rows: Rows; cols: Cols } {
    return {
      rows: this.stream.rows,
      cols: this.stream.cols
    };
  }

  // ============================================================================
  // State Management
  // ============================================================================

  saveState(): TerminalState {
    return {
      cursorPosition: this.cursor.position,
      cursorVisible: this.cursor.visible,
      cursorShape: this.cursor.shape,
      alternateBuffer: !!this.alternateBufferDisposer,
      rawMode: this.stream.isRaw,
      mouseEnabled: this.input.mouseEnabled
    };
  }

  restoreState(state: TerminalState): void {
    // Restore cursor
    this.cursor.moveTo(state.cursorPosition.x, state.cursorPosition.y);

    if (state.cursorVisible) {
      this.cursor.show();
    } else {
      this.cursor.hide();
    }

    this.cursor.setShape(state.cursorShape);

    // Restore modes
    if (state.rawMode !== this.stream.isRaw) {
      this.stream.setRawMode(state.rawMode);
    }

    if (state.mouseEnabled !== this.input.mouseEnabled) {
      if (state.mouseEnabled) {
        this.input.enableMouse();
      } else {
        this.input.disableMouse();
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private applyOptions(_options: TerminalOptions): void {
    // Options are already stored in this.options field defined at line 53
  }

  private setupResizeHandler(): void {
    const runtime = this.stream.platform.runtime;

    if (runtime === 'node' || runtime === 'bun') {
      // Handle SIGWINCH for terminal resize
      this.resizeHandler = () => {
        const newSize = this.getSize();
        this.events.emit('resize', newSize.rows, newSize.cols);
      };

      process.on('SIGWINCH', this.resizeHandler);

      // Also listen to stdout resize if available
      const stdout = this.stream.stdout as NodeJS.WriteStream;
      if (stdout.on) {
        stdout.on('resize', this.resizeHandler);
      }
    }
  }

  private removeResizeHandler(): void {
    if (this.resizeHandler) {
      const runtime = this.stream.platform.runtime;

      if (runtime === 'node' || runtime === 'bun') {
        process.off('SIGWINCH', this.resizeHandler);

        const stdout = this.stream.stdout as NodeJS.WriteStream;
        if (stdout.off) {
          stdout.off('resize', this.resizeHandler);
        }
      }
    }
  }

  private startInputProcessing(): void {
    // Process input events in the background
    (async () => {
      try {
        for await (const event of this.input.events) {
          if (this._closed) break;

          // Emit specific event types
          switch (event.type) {
            case 'key':
              this.events.emit('key', event);
              break;
            case 'mouse':
              this.events.emit('mouse', event);
              break;
            case 'paste':
              this.events.emit('paste', event);
              break;
            case 'focus':
              if (event.focused) {
                this.events.emit('focus', true);
              } else {
                this.events.emit('blur');
              }
              break;
            case 'resize':
              this.events.emit('resize', event.rows, event.cols);
              break;
            default:
              // Unknown event type - emit as generic input event
              this.events.emit('input', event);
              break;
          }
        }
      } catch (error) {
        if (!this._closed) {
          this.events.emit('error', error as Error);
        }
      }
    })();

    // Also process raw data events
    (async () => {
      try {
        for await (const data of this.input.stream) {
          if (this._closed) break;
          this.events.emit('data', data);
        }
      } catch (error) {
        if (!this._closed) {
          this.events.emit('error', error as Error);
        }
      }
    })();
  }
}

/**
 * Create a new terminal instance
 */
export function createTerminal(options?: TerminalOptions): Terminal {
  return new TerminalImpl(options);
}

export default createTerminal;