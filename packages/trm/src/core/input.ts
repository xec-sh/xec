/**
 * Input system implementation
 * Handles keyboard, mouse, and other input events
 */

import { ansi } from './ansi.js';
import { CircularBuffer } from './circular-buffer.js';
import { MouseButton, MouseAction } from '../types.js';

import type {
  X,
  Y,
  Input,
  KeyEvent,
  InputEvent,
  MouseEvent,
  PasteEvent,
  FocusEvent,
  TerminalStream
} from '../types.js';

/**
 * Parse ANSI escape sequences into input events
 */
class InputParser {
  private buffer = '';
  private pasteBuffer = '';
  private inPasteMode = false;

  /**
   * Parse raw input bytes into events
   */
  *parse(data: Uint8Array): Generator<InputEvent> {
    const text = new TextDecoder().decode(data);
    this.buffer += text;

    while (this.buffer.length > 0) {
      const prevBufferLength = this.buffer.length;
      const event = this.parseNext();
      if (event) {
        yield event;
      } else if (this.buffer.length === prevBufferLength) {
        // No progress was made, so we need more data
        break;
      }
      // Otherwise, continue parsing even if no event was returned
    }
  }

  private parseNext(): InputEvent | null {
    // Check for bracketed paste
    if (this.buffer.startsWith('\x1b[200~')) {
      this.inPasteMode = true;
      this.pasteBuffer = '';
      this.buffer = this.buffer.slice(6);
      return null;
    }

    if (this.inPasteMode) {
      const endIndex = this.buffer.indexOf('\x1b[201~');
      if (endIndex >= 0) {
        this.pasteBuffer += this.buffer.slice(0, endIndex);
        this.buffer = this.buffer.slice(endIndex + 6);
        this.inPasteMode = false;
        
        const event: PasteEvent = {
          type: 'paste',
          data: this.pasteBuffer,
          bracketed: true
        };
        this.pasteBuffer = '';
        return event;
      } else {
        this.pasteBuffer += this.buffer;
        this.buffer = '';
        return null;
      }
    }

    // Check for escape sequences
    if (this.buffer[0] === '\x1b') {
      return this.parseEscapeSequence();
    }

    // Regular character
    const char = this.buffer[0];
    this.buffer = this.buffer.slice(1);

    return this.createKeyEvent(char, char);
  }

  private parseEscapeSequence(): InputEvent | null {
    // CSI sequences
    if (this.buffer.startsWith('\x1b[')) {
      return this.parseCSI();
    }

    // SS3 sequences
    if (this.buffer.startsWith('\x1bO')) {
      return this.parseSS3();
    }

    // Alt+key combinations
    if (this.buffer.length >= 2) {
      const char = this.buffer[1];
      this.buffer = this.buffer.slice(2);
      return this.createKeyEvent(char, '\x1b' + char, false, true);
    }

    // Just escape key
    this.buffer = this.buffer.slice(1);
    return this.createKeyEvent('Escape', '\x1b', true);
  }

  private parseCSI(): InputEvent | null {
    // ESC character (\x1b) is necessary for parsing ANSI escape sequences
    // eslint-disable-next-line no-control-regex
    const match = this.buffer.match(/^\x1b\[<?([0-9;]*)(.)$/);
    if (!match) {
      // Need more data
      if (this.buffer.length > 20) {
        // Probably not a valid sequence, skip it
        this.buffer = this.buffer.slice(1);
      }
      return null;
    }

    const [full, params, code] = match;
    this.buffer = this.buffer.slice(full.length);

    // Mouse events (SGR mode)
    if (code === 'M' || code === 'm') {
      // SGR mouse sequences start with < 
      if (full.includes('<')) {
        return this.parseSGRMouse(params, code === 'M');
      }
      // Regular mouse events
      return this.parseRegularMouse(params);
    }

    // Cursor position report
    if (code === 'R') {
      // This is a response to cursor position query, not an input event
      return null;
    }

    // Focus events
    if (params === '' && code === 'I') {
      const event: FocusEvent = {
        type: 'focus',
        focused: true
      };
      return event;
    }
    if (params === '' && code === 'O') {
      const event: FocusEvent = {
        type: 'focus',
        focused: false
      };
      return event;
    }

    // Function keys and special keys
    return this.parseSpecialKey(params, code);
  }

  private parseSS3(): InputEvent | null {
    if (this.buffer.length < 3) {
      return null;
    }

    const code = this.buffer[2];
    this.buffer = this.buffer.slice(3);

    // Application keypad mode
    const keys: Record<string, string> = {
      'A': 'ArrowUp',
      'B': 'ArrowDown',
      'C': 'ArrowRight',
      'D': 'ArrowLeft',
      'H': 'Home',
      'F': 'End',
      'P': 'F1',
      'Q': 'F2',
      'R': 'F3',
      'S': 'F4'
    };

    const key = keys[code];
    if (key) {
      return this.createKeyEvent(key, '\x1bO' + code, true);
    }

    return null;
  }

  private parseSpecialKey(params: string, code: string): KeyEvent | null {
    const parts = params.split(';');
    const modifiers = parts[1] ? parseInt(parts[1]) - 1 : 0;

    const ctrl = !!(modifiers & 4);
    const alt = !!(modifiers & 2);
    const shift = !!(modifiers & 1);

    // Arrow keys
    const arrows: Record<string, string> = {
      'A': 'ArrowUp',
      'B': 'ArrowDown',
      'C': 'ArrowRight',
      'D': 'ArrowLeft'
    };

    if (arrows[code]) {
      return this.createKeyEvent(arrows[code], `\x1b[${params}${code}`, true, alt, ctrl, shift);
    }

    // Function keys
    const functionKeys: Record<string, string> = {
      '11~': 'F1', '12~': 'F2', '13~': 'F3', '14~': 'F4',
      '15~': 'F5', '17~': 'F6', '18~': 'F7', '19~': 'F8',
      '20~': 'F9', '21~': 'F10', '23~': 'F11', '24~': 'F12'
    };

    const fKey = functionKeys[parts[0] + code];
    if (fKey) {
      return this.createKeyEvent(fKey, `\x1b[${params}${code}`, true, alt, ctrl, shift);
    }

    // Other special keys
    const specialKeys: Record<string, string> = {
      '1~': 'Home',
      '2~': 'Insert',
      '3~': 'Delete',
      '4~': 'End',
      '5~': 'PageUp',
      '6~': 'PageDown',
      '7~': 'Home',
      '8~': 'End'
    };

    const special = specialKeys[parts[0] + code];
    if (special) {
      return this.createKeyEvent(special, `\x1b[${params}${code}`, true, alt, ctrl, shift);
    }

    return null;
  }

  private parseRegularMouse(params: string): MouseEvent | null {
    // Parse traditional mouse event format
    const parts = params.split(';');
    if (parts.length < 3) return null;

    const buttonByte = parseInt(parts[0]) - 32;
    const x = (parseInt(parts[1]) - 33) as X;
    const y = (parseInt(parts[2]) - 33) as Y;

    let button: MouseButton;
    let action: MouseAction;

    // Decode button from byte
    const buttonCode = buttonByte & 0x03;
    if (buttonCode === 0) button = MouseButton.Left;
    else if (buttonCode === 1) button = MouseButton.Middle;
    else if (buttonCode === 2) button = MouseButton.Right;
    else button = MouseButton.None;

    // Check if it's a release
    if ((buttonByte & 0x03) === 3) {
      action = MouseAction.Release;
      button = MouseButton.None;
    } else {
      action = MouseAction.Press;
    }

    const event: MouseEvent = {
      type: 'mouse',
      x,
      y,
      button,
      action,
      ctrl: !!(buttonByte & 0x10),
      alt: !!(buttonByte & 0x08),
      shift: !!(buttonByte & 0x04),
      meta: false
    };

    return event;
  }

  private parseSGRMouse(params: string, pressed: boolean): MouseEvent | null {
    const parts = params.split(';');
    if (parts.length < 3) return null;

    const buttonAction = parseInt(parts[0]);
    const x = (parseInt(parts[1]) - 1) as X;
    const y = (parseInt(parts[2]) - 1) as Y;

    const modifiers = buttonAction & 0x1C;
    const shift = !!(modifiers & 0x04);
    const alt = !!(modifiers & 0x08);
    const ctrl = !!(modifiers & 0x10);

    const buttonCode = buttonAction & 0x43;
    let button: MouseButton;
    let action: MouseAction;

    // Decode button
    if (buttonCode === 0) button = MouseButton.Left;
    else if (buttonCode === 1) button = MouseButton.Middle;
    else if (buttonCode === 2) button = MouseButton.Right;
    else if (buttonCode === 64) button = MouseButton.ScrollUp;
    else if (buttonCode === 65) button = MouseButton.ScrollDown;
    else button = MouseButton.None;

    // Decode action
    if (buttonCode >= 64) {
      action = buttonCode === 64 ? MouseAction.ScrollUp : MouseAction.ScrollDown;
    } else if (buttonAction & 0x20) {
      action = MouseAction.Move;
    } else {
      action = pressed ? MouseAction.Press : MouseAction.Release;
    }

    const event: MouseEvent = {
      type: 'mouse',
      x,
      y,
      button,
      action,
      ctrl,
      alt,
      shift,
      meta: false
    };

    return event;
  }

  private createKeyEvent(
    key: string,
    sequence: string,
    isSpecial = false,
    alt = false,
    ctrl = false,
    shift = false,
    meta = false
  ): KeyEvent {
    // Handle control characters
    if (sequence.length === 1) {
      const code = sequence.charCodeAt(0);
      
      // Ctrl+letter combinations
      if (code >= 1 && code <= 26) {
        ctrl = true;
        key = String.fromCharCode(code + 96); // Convert to letter
      }
      
      // Special control characters
      switch (code) {
        case 0: key = 'Null'; isSpecial = true; break;
        case 9: key = 'Tab'; isSpecial = true; break;
        case 10: 
        case 13: key = 'Enter'; isSpecial = true; break;
        case 27: key = 'Escape'; isSpecial = true; break;
        case 127: key = 'Backspace'; isSpecial = true; break;
        default: 
          // Other codes don't need special handling
          break;
      }
    }

    const event: KeyEvent = {
      type: 'key',
      key,
      sequence,
      isSpecial,
      ctrl,
      alt,
      shift,
      meta,
      ...(isSpecial ? { name: key.toLowerCase() } : { char: key })
    };

    return event;
  }
}

/**
 * Input implementation
 */
export class InputImpl implements Input {
  private terminalStream: TerminalStream;
  private parser = new InputParser();
  private circularBuffer: CircularBuffer;
  private _mouseEnabled = false;
  private _keyboardEnabled = true;
  private _bracketedPasteEnabled = false;
  private _focusTrackingEnabled = false;
  private closed = false;

  constructor(stream: TerminalStream) {
    this.terminalStream = stream;
    // Initialize circular buffer with 1MB limit for input data
    this.circularBuffer = new CircularBuffer({
      maxSize: 1024 * 1024, // 1MB should be plenty for terminal input
      overflowStrategy: 'drop-oldest' // Drop old input if buffer fills
    });
  }

  // ============================================================================
  // Stream Access
  // ============================================================================

  get stream(): AsyncIterable<Uint8Array> {
    return this.createRawStream();
  }

  private async *createRawStream(): AsyncGenerator<Uint8Array> {
    if (typeof this.terminalStream.stdin[Symbol.asyncIterator] === 'function') {
      // Use async iterator if available
      for await (const chunk of this.terminalStream.stdin as AsyncIterable<Uint8Array>) {
        if (this.closed) break;
        yield chunk;
      }
    } else {
      // Fall back to event-based reading for Node.js with circular buffer
      const stdin = this.terminalStream.stdin as NodeJS.ReadStream;
      let resolve: ((value: Buffer | null) => void) | null = null;
      
      // Set up data listener
      const onData = (chunk: Buffer) => {
        if (resolve) {
          resolve(chunk);
          resolve = null;
        } else {
          // Use circular buffer instead of unbounded array
          this.circularBuffer.write(chunk);
        }
      };
      
      // Set up end/close listeners
      const onEnd = () => {
        if (resolve) {
          resolve(null);
          resolve = null;
        }
      };
      
      // Check if stdin has event methods (Node.js stream)
      if (typeof stdin.on === 'function') {
        stdin.on('data', onData);
        stdin.on('end', onEnd);
        stdin.on('close', onEnd);
      }
      
      try {
        while (!this.closed) {
          // Check if there's data in the circular buffer
          const buffered = this.circularBuffer.read();
          if (buffered) {
            yield new Uint8Array(buffered);
          } else {
            // Wait for next chunk
            const chunk = await new Promise<Buffer | null>((res) => {
              resolve = res;
              // Check again if data arrived while setting up promise
              const immediateData = this.circularBuffer.read();
              if (immediateData) {
                resolve = null;
                res(immediateData);
              }
            });
            
            if (chunk === null || this.closed) break;
            yield new Uint8Array(chunk);
          }
        }
      } finally {
        // Clean up listeners if stdin has event methods
        if (typeof stdin.off === 'function') {
          stdin.off('data', onData);
          stdin.off('end', onEnd);
          stdin.off('close', onEnd);
        } else if (typeof stdin.removeListener === 'function') {
          // Fallback for older Node.js versions
          stdin.removeListener('data', onData);
          stdin.removeListener('end', onEnd);
          stdin.removeListener('close', onEnd);
        }
      }
    }
  }

  // ============================================================================
  // Parsed Events
  // ============================================================================

  get events(): AsyncIterable<InputEvent> {
    return this.createEventStream();
  }

  private async *createEventStream(): AsyncGenerator<InputEvent> {
    for await (const chunk of this.stream) {
      if (this.closed) break;
      
      for (const event of this.parser.parse(chunk)) {
        // Filter events based on what's enabled
        if (event.type === 'key' && !this._keyboardEnabled) continue;
        if (event.type === 'mouse' && !this._mouseEnabled) continue;
        
        yield event;
      }
    }
  }

  // ============================================================================
  // Feature Control
  // ============================================================================

  enableMouse(): void {
    if (!this._mouseEnabled) {
      this.terminalStream.write(ansi.mouseEnableAll());
      this.terminalStream.write(ansi.mouseEnableSGR());
      this._mouseEnabled = true;
    }
  }

  disableMouse(): void {
    if (this._mouseEnabled) {
      this.terminalStream.write(ansi.mouseDisableAll());
      this.terminalStream.write(ansi.mouseDisableSGR());
      this._mouseEnabled = false;
    }
  }

  enableKeyboard(): void {
    this._keyboardEnabled = true;
  }

  disableKeyboard(): void {
    this._keyboardEnabled = false;
  }

  enableBracketedPaste(): void {
    if (!this._bracketedPasteEnabled) {
      this.terminalStream.write(ansi.bracketedPasteEnable());
      this._bracketedPasteEnabled = true;
    }
  }

  disableBracketedPaste(): void {
    if (this._bracketedPasteEnabled) {
      this.terminalStream.write(ansi.bracketedPasteDisable());
      this._bracketedPasteEnabled = false;
    }
  }

  enableFocusTracking(): void {
    if (!this._focusTrackingEnabled) {
      this.terminalStream.write(ansi.focusTrackingEnable());
      this._focusTrackingEnabled = true;
    }
  }

  disableFocusTracking(): void {
    if (this._focusTrackingEnabled) {
      this.terminalStream.write(ansi.focusTrackingDisable());
      this._focusTrackingEnabled = false;
    }
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  get mouseEnabled(): boolean {
    return this._mouseEnabled;
  }

  get keyboardEnabled(): boolean {
    return this._keyboardEnabled;
  }

  get bracketedPasteEnabled(): boolean {
    return this._bracketedPasteEnabled;
  }

  get focusTrackingEnabled(): boolean {
    return this._focusTrackingEnabled;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  close(): void {
    this.closed = true;
    this.disableMouse();
    this.disableBracketedPaste();
    this.disableFocusTracking();
    // Clear circular buffer to free memory
    this.circularBuffer.clear();
  }
}

export default InputImpl;