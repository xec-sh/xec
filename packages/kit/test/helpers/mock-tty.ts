import { vi } from 'vitest';
import { EventEmitter } from 'events';

import type { Key } from '../../src/core/types.js';

export interface MockTTY extends EventEmitter {
  isTTY: boolean;
  write: ReturnType<typeof vi.fn>;
  cursorTo: ReturnType<typeof vi.fn>;
  clearLine: ReturnType<typeof vi.fn>;
  moveCursor: ReturnType<typeof vi.fn>;
  columns: number;
  rows: number;
  cleanup?: () => void;
  getOutput?: () => string;
}

export interface MockReadStream extends MockTTY {
  setRawMode: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  setEncoding: ReturnType<typeof vi.fn>;
}

export function createMockTTY(isTTY = true): MockTTY {
  const tty = new EventEmitter() as MockTTY;
  tty.isTTY = isTTY;
  tty.write = vi.fn();
  tty.cursorTo = vi.fn();
  tty.clearLine = vi.fn();
  tty.moveCursor = vi.fn();
  tty.columns = 80;
  tty.rows = 24;
  tty.cleanup = () => {
    // Reset all mocks
    tty.write.mockClear();
    tty.cursorTo.mockClear();
    tty.clearLine.mockClear();
    tty.moveCursor.mockClear();
  };
  tty.getOutput = () => {
    const calls = tty.write.mock.calls;
    return calls
      .map(call => call[0])
      .filter(content => typeof content === 'string')
      .join('');
  };
  return tty;
}

export function createMockReadStream(isTTY = true): MockReadStream {
  const stream = createMockTTY(isTTY) as MockReadStream;
  stream.setRawMode = vi.fn();
  stream.resume = vi.fn();
  stream.pause = vi.fn();
  stream.setEncoding = vi.fn();
  return stream;
}

export function mockProcessStreams(options: { isTTY?: boolean } = {}) {
  const isTTY = options.isTTY ?? false;
  const stdin = createMockReadStream(isTTY);
  const stdout = createMockTTY(isTTY);
  const stderr = createMockTTY(isTTY);
  
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;
  const originalStderr = process.stderr;
  
  Object.defineProperty(process, 'stdin', {
    value: stdin,
    configurable: true,
    writable: true
  });
  
  Object.defineProperty(process, 'stdout', {
    value: stdout,
    configurable: true,
    writable: true
  });
  
  Object.defineProperty(process, 'stderr', {
    value: stderr,
    configurable: true,
    writable: true
  });
  
  return {
    stdin,
    stdout,
    stderr,
    restore() {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        configurable: true,
        writable: true
      });
      Object.defineProperty(process, 'stdout', {
        value: originalStdout,
        configurable: true,
        writable: true
      });
      Object.defineProperty(process, 'stderr', {
        value: originalStderr,
        configurable: true,
        writable: true
      });
    },
    // Helper to simulate key presses
    sendKey(key: string | Partial<Key>) {
      if (typeof key === 'string') {
        // Handle special key names
        if (key === 'tab') {
          stdin.emit('data', '\t');
        } else if (key === 'return' || key === 'enter') {
          stdin.emit('data', '\r');
        } else if (key === 'escape') {
          stdin.emit('data', '\x1B');
        } else if (key === 'backspace') {
          stdin.emit('data', '\x7F');
        } else if (key === 'up') {
          stdin.emit('data', '\x1B[A');
        } else if (key === 'down') {
          stdin.emit('data', '\x1B[B');
        } else if (key === 'left') {
          stdin.emit('data', '\x1B[D');
        } else if (key === 'right') {
          stdin.emit('data', '\x1B[C');
        } else if (key === 'pageup') {
          stdin.emit('data', '\x1B[5~');
        } else if (key === 'pagedown') {
          stdin.emit('data', '\x1B[6~');
        } else {
          // For multi-character strings, emit as single data event to preserve Unicode
          stdin.emit('data', key);
        }
      } else {
        // Convert key object to data string
        if (key.name === 'return' || key.name === 'enter') {
          stdin.emit('data', '\r');
        } else if (key.name === 'escape') {
          stdin.emit('data', '\x1B');
        } else if (key.name === 'backspace') {
          stdin.emit('data', '\x7F');
        } else if (key.name === 'up') {
          stdin.emit('data', '\x1B[A');
        } else if (key.name === 'down') {
          stdin.emit('data', '\x1B[B');
        } else if (key.name === 'left') {
          stdin.emit('data', '\x1B[D');
        } else if (key.name === 'right') {
          stdin.emit('data', '\x1B[C');
        } else if (key.name === 'home') {
          stdin.emit('data', '\x1B[H');
        } else if (key.name === 'end') {
          stdin.emit('data', '\x1B[F');
        } else if (key.name === 'delete') {
          stdin.emit('data', '\x1B[3~');
        } else if (key.name === 'pageup') {
          stdin.emit('data', '\x1B[5~');
        } else if (key.name === 'pagedown') {
          stdin.emit('data', '\x1B[6~');
        } else if (key.name === 'space') {
          stdin.emit('data', ' ');
        } else if (key.name === 'tab') {
          if (key.shift) {
            stdin.emit('data', '\x1B[Z');
          } else {
            stdin.emit('data', '\t');
          }
        } else if (key.ctrl && key.name === 'c') {
          stdin.emit('data', '\x03');
        } else if (key.ctrl && key.name === 'd') {
          stdin.emit('data', '\x04');
        } else if (key.ctrl && key.name === 'a') {
          stdin.emit('data', '\x01');
        } else if (key.ctrl && key.name === 'e') {
          stdin.emit('data', '\x05');
        } else if (key.ctrl && key.name === 'k') {
          stdin.emit('data', '\x0B');
        } else if (key.ctrl && key.name === 'u') {
          stdin.emit('data', '\x15');
        } else if (key.ctrl && key.name === 'y') {
          stdin.emit('data', '\x19');
        } else if (key.ctrl && key.name === 'z') {
          stdin.emit('data', '\x1A');
        } else if (key.ctrl && key.name === 'r') {
          stdin.emit('data', '\x12');
        } else if (key.char) {
          stdin.emit('data', key.char);
        } else if (key.name && key.name.length === 1) {
          stdin.emit('data', key.name);
        }
      }
    }
  };
}