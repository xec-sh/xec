// Stream I/O handling for stdin/stdout

import { EventEmitter } from './event-emitter.js';

import type { Key } from './types.js';

export interface StreamHandlerOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  isTTY?: boolean;
}

export class StreamHandler extends EventEmitter {
  private input: NodeJS.ReadStream;
  private output: NodeJS.WriteStream;
  private isTTY: boolean;
  private isRaw = false;
  private listeners: Array<() => void> = [];

  constructor(options: StreamHandlerOptions = {}) {
    super();
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.isTTY = options.isTTY ?? (this.input.isTTY && this.output.isTTY);
  }

  start(): void {
    if (!this.isTTY) return;

    // Enable raw mode
    if (this.input.setRawMode) {
      this.input.setRawMode(true);
      this.isRaw = true;
    }
    
    this.input.resume();
    this.input.setEncoding('utf8');

    // Handle keypress
    const onData = (data: string) => {
      const key = this.parseKey(data);
      this.emit('key', key);
    };

    // Handle resize
    const onResize = () => {
      this.emit('resize', {
        width: this.output.columns || 80,
        height: this.output.rows || 24
      });
    };

    this.input.on('data', onData);
    this.output.on('resize', onResize);

    this.listeners.push(
      () => this.input.off('data', onData),
      () => this.output.off('resize', onResize)
    );
  }

  stop(): void {
    // Restore terminal
    if (this.isRaw && this.input.setRawMode) {
      this.input.setRawMode(false);
      this.isRaw = false;
    }
    
    this.input.pause();

    // Remove all listeners
    this.listeners.forEach(remove => remove());
    this.listeners = [];
  }

  write(text: string): void {
    this.output.write(text);
  }

  clearLine(): void {
    if (!this.isTTY) return;
    this.output.clearLine(0);
    this.output.cursorTo(0);
  }

  clearScreen(): void {
    if (!this.isTTY) return;
    this.output.write('\x1Bc'); // Clear screen
  }

  moveCursor(x: number, y: number): void {
    if (!this.isTTY) return;
    this.output.moveCursor(x, y);
  }

  cursorTo(x: number, y?: number): void {
    if (!this.isTTY) return;
    this.output.cursorTo(x, y);
  }

  hideCursor(): void {
    if (!this.isTTY) return;
    this.output.write('\x1B[?25l');
  }

  showCursor(): void {
    if (!this.isTTY) return;
    this.output.write('\x1B[?25h');
  }

  getSize(): { width: number; height: number } {
    return {
      width: this.output.columns || 80,
      height: this.output.rows || 24
    };
  }

  isInteractive(): boolean {
    return this.isTTY;
  }

  private parseKey(data: string): Key {
    const key: Key = {
      sequence: data,
      ctrl: false,
      meta: false,
      shift: false
    };

    // Ctrl+A
    if (data === '\x01') {
      key.ctrl = true;
      key.name = 'a';
    }
    // Ctrl+C
    else if (data === '\x03') {
      key.ctrl = true;
      key.name = 'c';
    }
    // Ctrl+D
    else if (data === '\x04') {
      key.ctrl = true;
      key.name = 'd';
    }
    // Ctrl+E
    else if (data === '\x05') {
      key.ctrl = true;
      key.name = 'e';
    }
    // Ctrl+K
    else if (data === '\x0B') {
      key.ctrl = true;
      key.name = 'k';
    }
    // Ctrl+R
    else if (data === '\x12') {
      key.ctrl = true;
      key.name = 'r';
    }
    // Ctrl+U
    else if (data === '\x15') {
      key.ctrl = true;
      key.name = 'u';
    }
    // Ctrl+Y
    else if (data === '\x19') {
      key.ctrl = true;
      key.name = 'y';
    }
    // Ctrl+Z
    else if (data === '\x1A') {
      key.ctrl = true;
      key.name = 'z';
    }
    // Tab
    else if (data === '\t') {
      key.name = 'tab';
    }
    // Shift+Tab
    else if (data === '\x1B[Z') {
      key.name = 'tab';
      key.shift = true;
    }
    // Enter
    else if (data === '\r' || data === '\n') {
      key.name = 'enter';
    }
    // Escape
    else if (data === '\x1B' || data === '\x1B\x1B') {
      key.name = 'escape';
    }
    // Backspace
    else if (data === '\x7F' || data === '\x08') {
      key.name = 'backspace';
    }
    // Arrow keys
    else if (data === '\x1B[A') {
      key.name = 'up';
    }
    else if (data === '\x1B[B') {
      key.name = 'down';
    }
    else if (data === '\x1B[C') {
      key.name = 'right';
    }
    else if (data === '\x1B[D') {
      key.name = 'left';
    }
    // Home/End
    else if (data === '\x1B[H' || data === '\x1BOH') {
      key.name = 'home';
    }
    else if (data === '\x1B[F' || data === '\x1BOF') {
      key.name = 'end';
    }
    // Page Up/Down
    else if (data === '\x1B[5~') {
      key.name = 'pageup';
    }
    else if (data === '\x1B[6~') {
      key.name = 'pagedown';
    }
    // Delete
    else if (data === '\x1B[3~') {
      key.name = 'delete';
    }
    // Space
    else if (data === ' ') {
      key.name = 'space';
    }
    // Regular character - handle Unicode properly
    else if (data.length >= 1 && data.charCodeAt(0) >= 32) {
      key.char = data;
      key.name = data;
    }

    return key;
  }
}