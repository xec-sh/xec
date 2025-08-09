/**
 * Input Manager - Improved keyboard input handling for terex
 * 
 * Better key parsing, event distribution, and input state management
 * Based on analysis of ink's input handling patterns
 */

import type { Key, TerminalStream, MouseEvent } from './types.js';

export interface InputManagerOptions {
  /** Whether to enable raw mode for character-by-character input */
  rawMode?: boolean;
  /** Whether to handle paste events specially */
  handlePaste?: boolean;
  /** Paste threshold - bytes received within this time are considered paste */
  pasteThreshold?: number;
  /** Whether to emit keypress events for all input */
  emitAll?: boolean;
}

export interface KeypressEvent {
  key: Key;
  timestamp: number;
  isPaste: boolean;
}

export interface InputState {
  rawMode: boolean;
  listening: boolean;
  pasteMode: boolean;
}

/**
 * Enhanced input manager with better key parsing and event handling
 */
export class InputManager {
  private readonly stream: TerminalStream;
  private readonly options: Required<InputManagerOptions>;
  
  // Event handling
  private listeners: Array<(event: KeypressEvent) => void> = [];
  private mouseListeners: Array<(event: MouseEvent) => void> = [];
  private rawDataHandler: ((data: Buffer) => void) | null = null;
  
  // State
  private state: InputState = {
    rawMode: false,
    listening: false,
    pasteMode: false,
  };
  
  // Paste detection
  private lastInputTime = 0;
  private inputBuffer: Buffer[] = [];
  private pasteTimer: NodeJS.Timeout | null = null;
  
  constructor(stream: TerminalStream, options: InputManagerOptions = {}) {
    this.stream = stream;
    this.options = {
      rawMode: options.rawMode ?? true,
      handlePaste: options.handlePaste ?? true,
      pasteThreshold: options.pasteThreshold ?? 10, // ms
      emitAll: options.emitAll ?? false,
    };
  }
  
  /**
   * Start listening for input
   */
  start(): void {
    if (this.state.listening) {
      return;
    }
    
    // Enable raw mode if in TTY and requested
    if (this.stream.input && process.stdin.isTTY && this.options.rawMode) {
      try {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        this.state.rawMode = true;
      } catch (error) {
        console.warn('Failed to enable raw mode:', error);
      }
    }
    
    // Set up input handler
    if (this.stream.input) {
      this.rawDataHandler = (data: Buffer) => {
        this.handleRawInput(data);
      };
      
      this.stream.input.on('data', this.rawDataHandler);
    }
    
    this.state.listening = true;
  }
  
  /**
   * Stop listening for input
   */
  stop(): void {
    if (!this.state.listening) {
      return;
    }
    
    // Remove input handler
    if (this.rawDataHandler && this.stream.input) {
      this.stream.input.removeListener('data', this.rawDataHandler);
      this.rawDataHandler = null;
    }
    
    // Disable raw mode
    if (this.state.rawMode && process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch (error) {
        console.warn('Failed to disable raw mode:', error);
      }
    }
    
    // Clear paste timer
    if (this.pasteTimer) {
      clearTimeout(this.pasteTimer);
      this.pasteTimer = null;
    }
    
    this.state = {
      rawMode: false,
      listening: false,
      pasteMode: false,
    };
  }
  
  /**
   * Add keypress listener
   */
  onKeypress(listener: (event: KeypressEvent) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Add mouse event listener (stub for now - full implementation pending)
   */
  onMouseEvent(listener: (event: MouseEvent) => void): () => void {
    this.mouseListeners.push(listener);
    
    // TODO: Enable mouse tracking in terminal
    // This requires sending special escape sequences to the terminal
    // and parsing mouse event sequences from input
    
    // Return unsubscribe function
    return () => {
      const index = this.mouseListeners.indexOf(listener);
      if (index !== -1) {
        this.mouseListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Get current input state
   */
  getState(): Readonly<InputState> {
    return { ...this.state };
  }
  
  /**
   * Handle raw input data with improved parsing and paste detection
   */
  private handleRawInput(data: Buffer): void {
    const now = Date.now();
    const timeSinceLastInput = now - this.lastInputTime;
    
    // Paste detection
    let isPaste = false;
    if (this.options.handlePaste && data.length > 1) {
      isPaste = true;
      this.state.pasteMode = true;
      
      // Set timer to exit paste mode
      if (this.pasteTimer) {
        clearTimeout(this.pasteTimer);
      }
      this.pasteTimer = setTimeout(() => {
        this.state.pasteMode = false;
        this.pasteTimer = null;
      }, this.options.pasteThreshold * 5);
    } else if (this.state.pasteMode && timeSinceLastInput < this.options.pasteThreshold) {
      isPaste = true;
    }
    
    this.lastInputTime = now;
    
    // Parse input - handle both single chars and sequences
    if (data.length === 1) {
      // Single character
      const key = this.parseKeyFromBuffer(data);
      this.emitKeypress({ key, timestamp: now, isPaste });
    } else {
      // Multiple characters or escape sequences
      let offset = 0;
      while (offset < data.length) {
        const result = this.parseNextKey(data, offset);
        if (result) {
          this.emitKeypress({ 
            key: result.key, 
            timestamp: now, 
            isPaste: isPaste || result.consumed > 1 
          });
          offset += result.consumed;
        } else {
          offset++;
        }
      }
    }
  }
  
  /**
   * Parse next key from buffer starting at offset
   */
  private parseNextKey(data: Buffer, offset: number): { key: Key; consumed: number } | null {
    if (offset >= data.length) {
      return null;
    }
    
    // Try to parse escape sequence first
    const remaining = data.subarray(offset);
    const escapeResult = this.parseEscapeSequence(remaining);
    if (escapeResult) {
      return escapeResult;
    }
    
    // Single character fallback
    const singleChar = Buffer.from([data[offset]!]);
    return {
      key: this.parseKeyFromBuffer(singleChar),
      consumed: 1,
    };
  }
  
  /**
   * Parse escape sequences (improved from render-engine.ts)
   */
  private parseEscapeSequence(data: Buffer): { key: Key; consumed: number } | null {
    const str = data.toString();
    
    // ESC sequences
    if (str.startsWith('\x1b[')) {
      // Arrow keys
      if (str.startsWith('\x1b[A')) return { key: this.createKey('up', '\x1b[A'), consumed: 3 };
      if (str.startsWith('\x1b[B')) return { key: this.createKey('down', '\x1b[B'), consumed: 3 };
      if (str.startsWith('\x1b[C')) return { key: this.createKey('right', '\x1b[C'), consumed: 3 };
      if (str.startsWith('\x1b[D')) return { key: this.createKey('left', '\x1b[D'), consumed: 3 };
      
      // Function keys F1-F12
      if (str.startsWith('\x1b[1~') || str.startsWith('\x1b[H')) return { key: this.createKey('home', str.slice(0, 4)), consumed: 4 };
      if (str.startsWith('\x1b[4~') || str.startsWith('\x1b[F')) return { key: this.createKey('end', str.slice(0, 4)), consumed: 4 };
      if (str.startsWith('\x1b[5~')) return { key: this.createKey('pageup', '\x1b[5~'), consumed: 4 };
      if (str.startsWith('\x1b[6~')) return { key: this.createKey('pagedown', '\x1b[6~'), consumed: 4 };
      if (str.startsWith('\x1b[3~')) return { key: this.createKey('delete', '\x1b[3~'), consumed: 4 };
      if (str.startsWith('\x1b[2~')) return { key: this.createKey('insert', '\x1b[2~'), consumed: 4 };
      
      // Extended sequences
      if (str.startsWith('\x1b[1;5A')) return { key: this.createKey('up', '\x1b[1;5A', { ctrl: true }), consumed: 6 };
      if (str.startsWith('\x1b[1;5B')) return { key: this.createKey('down', '\x1b[1;5B', { ctrl: true }), consumed: 6 };
      if (str.startsWith('\x1b[1;5C')) return { key: this.createKey('right', '\x1b[1;5C', { ctrl: true }), consumed: 6 };
      if (str.startsWith('\x1b[1;5D')) return { key: this.createKey('left', '\x1b[1;5D', { ctrl: true }), consumed: 6 };
      
      if (str.startsWith('\x1b[1;2A')) return { key: this.createKey('up', '\x1b[1;2A', { shift: true }), consumed: 6 };
      if (str.startsWith('\x1b[1;2B')) return { key: this.createKey('down', '\x1b[1;2B', { shift: true }), consumed: 6 };
      if (str.startsWith('\x1b[1;2C')) return { key: this.createKey('right', '\x1b[1;2C', { shift: true }), consumed: 6 };
      if (str.startsWith('\x1b[1;2D')) return { key: this.createKey('left', '\x1b[1;2D', { shift: true }), consumed: 6 };
      
      // Function keys
      const fnMatch = str.match(/^\x1b\[(\d+)~$/);
      if (fnMatch) {
        const code = parseInt(fnMatch[1]!);
        const fnKey = this.getFunctionKeyName(code);
        if (fnKey) {
          return { key: this.createKey(fnKey, fnMatch[0]!), consumed: fnMatch[0]!.length };
        }
      }
    }
    
    // Alt sequences
    if (str.startsWith('\x1b') && str.length >= 2) {
      const nextChar = str[1];
      if (nextChar && nextChar !== '[') {
        return { 
          key: this.createKey(nextChar, str.slice(0, 2), { meta: true }), 
          consumed: 2 
        };
      }
    }
    
    return null;
  }
  
  /**
   * Parse single key from buffer
   */
  private parseKeyFromBuffer(data: Buffer): Key {
    const byte = data[0]!;
    const str = data.toString();
    
    // Control characters
    if (byte < 32) {
      switch (byte) {
        case 1: return this.createKey('a', '\x01', { ctrl: true });
        case 2: return this.createKey('b', '\x02', { ctrl: true });
        case 3: return this.createKey('c', '\x03', { ctrl: true });
        case 4: return this.createKey('d', '\x04', { ctrl: true });
        case 5: return this.createKey('e', '\x05', { ctrl: true });
        case 6: return this.createKey('f', '\x06', { ctrl: true });
        case 7: return this.createKey('g', '\x07', { ctrl: true });
        case 8: return this.createKey('backspace', '\x08');
        case 9: return this.createKey('tab', '\t');
        case 10: return this.createKey('enter', '\n');
        case 11: return this.createKey('k', '\x0b', { ctrl: true });
        case 12: return this.createKey('l', '\x0c', { ctrl: true });
        case 13: return this.createKey('enter', '\r');
        case 14: return this.createKey('n', '\x0e', { ctrl: true });
        case 15: return this.createKey('o', '\x0f', { ctrl: true });
        case 16: return this.createKey('p', '\x10', { ctrl: true });
        case 17: return this.createKey('q', '\x11', { ctrl: true });
        case 18: return this.createKey('r', '\x12', { ctrl: true });
        case 19: return this.createKey('s', '\x13', { ctrl: true });
        case 20: return this.createKey('t', '\x14', { ctrl: true });
        case 21: return this.createKey('u', '\x15', { ctrl: true });
        case 22: return this.createKey('v', '\x16', { ctrl: true });
        case 23: return this.createKey('w', '\x17', { ctrl: true });
        case 24: return this.createKey('x', '\x18', { ctrl: true });
        case 25: return this.createKey('y', '\x19', { ctrl: true });
        case 26: return this.createKey('z', '\x1a', { ctrl: true });
        case 27: return this.createKey('escape', '\x1b');
        case 28: return this.createKey('\\', '\x1c', { ctrl: true });
        case 29: return this.createKey(']', '\x1d', { ctrl: true });
        case 30: return this.createKey('^', '\x1e', { ctrl: true });
        case 31: return this.createKey('_', '\x1f', { ctrl: true });
        default: return this.createKey('unknown', str);
      }
    }
    
    // DEL
    if (byte === 127) {
      return this.createKey('backspace', '\x7f');
    }
    
    // Regular printable characters
    if (byte >= 32 && byte < 127) {
      const char = str;
      const isShift = char >= 'A' && char <= 'Z';
      return this.createKey(char.toLowerCase(), str, { shift: isShift });
    }
    
    // UTF-8 characters
    if (byte >= 128) {
      return this.createKey(str, str);
    }
    
    return this.createKey('unknown', str);
  }
  
  /**
   * Create key object with consistent structure
   */
  private createKey(
    name: string, 
    sequence: string, 
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}
  ): Key {
    return {
      name,
      sequence,
      ctrl: modifiers.ctrl ?? false,
      meta: modifiers.meta ?? false,
      shift: modifiers.shift ?? false,
    };
  }
  
  /**
   * Get function key name from code
   */
  private getFunctionKeyName(code: number): string | null {
    const fnKeys: Record<number, string> = {
      11: 'f1', 12: 'f2', 13: 'f3', 14: 'f4', 15: 'f5',
      17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10',
      23: 'f11', 24: 'f12',
    };
    return fnKeys[code] ?? null;
  }
  
  /**
   * Emit keypress event to all listeners
   */
  private emitKeypress(event: KeypressEvent): void {
    // Don't emit if no listeners and emitAll is false
    if (this.listeners.length === 0 && !this.options.emitAll) {
      return;
    }
    
    // Call all listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('Keypress listener error:', error);
      }
    }
  }
}

/**
 * Factory function to create input manager
 */
export function createInputManager(
  stream: TerminalStream,
  options?: InputManagerOptions
): InputManager {
  return new InputManager(stream, options);
}

/**
 * Create input manager with default streams
 */
export function createDefaultInputManager(
  options?: InputManagerOptions
): InputManager {
  const stream: TerminalStream = {
    input: process.stdin,
    output: process.stdout,
    isTTY: process.stdout.isTTY ?? false,
    colorMode: 'truecolor'
  };
  
  return new InputManager(stream, options);
}