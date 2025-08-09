/**
 * TTY test wrapper for ensuring proper TTY environment in tests
 * Provides guaranteed isTTY=true and setRawMode function for all test scenarios
 */

import { Readable, Writable } from 'stream';

import type { TerminalStream } from '../core/types.js';

// ============================================================================
// TTY Stream Wrapper
// ============================================================================

/**
 * Mock TTY stream that ensures isTTY is always true
 */
export class MockTTYStream extends Writable {
  private buffer: string[] = [];
  private _isTTY = true;
  private _rows = 24;
  private _columns = 80;
  private _colorDepth = 24;
  private rawMode = false;
  private cursorHidden = false;
  private alternateBuffer = false;
  
  constructor(options?: {
    rows?: number;
    columns?: number;
    colorDepth?: number;
  }) {
    super();
    if (options?.rows) this._rows = options.rows;
    if (options?.columns) this._columns = options.columns;
    if (options?.colorDepth) this._colorDepth = options.colorDepth;
  }
  
  // TTY properties
  get isTTY(): boolean {
    return this._isTTY;
  }
  
  get rows(): number {
    return this._rows;
  }
  
  get columns(): number {
    return this._columns;
  }
  
  // Color support
  hasColors(count?: number): boolean {
    if (!count) return true;
    if (this._colorDepth === 1) return false;
    if (this._colorDepth === 4) return count <= 16;
    if (this._colorDepth === 8) return count <= 256;
    return true; // 24-bit color
  }
  
  getColorDepth(): number {
    return this._colorDepth;
  }
  
  setColorDepth(depth: number): void {
    this._colorDepth = depth;
  }
  
  // Cursor control
  cursorTo(x: number, y?: number): boolean {
    this.write(`\x1b[${y !== undefined ? y + 1 : ''}${y !== undefined ? ';' : ''}${x + 1}H`);
    return true;
  }
  
  moveCursor(dx: number, dy: number): boolean {
    if (dx !== 0) {
      this.write(dx > 0 ? `\x1b[${dx}C` : `\x1b[${-dx}D`);
    }
    if (dy !== 0) {
      this.write(dy > 0 ? `\x1b[${dy}B` : `\x1b[${-dy}A`);
    }
    return true;
  }
  
  clearLine(dir: -1 | 0 | 1): boolean {
    const codes = {
      '-1': '\x1b[1K', // Clear to left
      '0': '\x1b[2K',  // Clear entire line
      '1': '\x1b[0K'   // Clear to right
    };
    this.write(codes[String(dir) as keyof typeof codes]);
    return true;
  }
  
  clearScreenDown(): boolean {
    this.write('\x1b[J');
    return true;
  }
  
  // Get terminal size
  getWindowSize(): [number, number] {
    return [this._columns, this._rows];
  }
  
  // Write implementation
  override _write(chunk: Buffer | string, encoding: string, callback: (error?: Error | null) => void): void {
    const str = chunk.toString();
    this.buffer.push(str);
    callback();
  }
  
  // Test helpers
  getOutput(): string {
    return this.buffer.join('');
  }
  
  clearBuffer(): void {
    this.buffer = [];
  }
  
  getAllWrites(): string[] {
    return [...this.buffer];
  }
  
  // Resize terminal
  resize(columns: number, rows: number): void {
    this._columns = columns;
    this._rows = rows;
    this.emit('resize');
  }
  
  // Raw mode control
  setRawMode(mode: boolean): void {
    this.rawMode = mode;
  }
  
  isRaw(): boolean {
    return this.rawMode;
  }
  
  // Additional TTY methods
  hideCursor(): void {
    this.cursorHidden = true;
    this.write('\x1b[?25l');
  }
  
  showCursor(): void {
    this.cursorHidden = false;
    this.write('\x1b[?25h');
  }
  
  isCursorHidden(): boolean {
    return this.cursorHidden;
  }
  
  enterAlternateBuffer(): void {
    this.alternateBuffer = true;
    this.write('\x1b[?1049h');
  }
  
  exitAlternateBuffer(): void {
    this.alternateBuffer = false;
    this.write('\x1b[?1049l');
  }
  
  isAlternateBuffer(): boolean {
    return this.alternateBuffer;
  }
}

/**
 * Mock TTY input stream
 */
export class MockTTYInputStream extends Readable {
  private _isTTY = true;
  private rawMode = false;
  private inputBuffer: string[] = [];
  private reading = false;
  
  constructor() {
    super();
  }
  
  get isTTY(): boolean {
    return this._isTTY;
  }
  
  setRawMode(mode: boolean): void {
    this.rawMode = mode;
  }
  
  isRaw(): boolean {
    return this.rawMode;
  }
  
  // Simulate key press
  sendKey(key: string): void {
    this.inputBuffer.push(key);
    if (this.reading) {
      this.flush();
    }
  }
  
  // Simulate multiple keys
  sendKeys(keys: string[]): void {
    this.inputBuffer.push(...keys);
    if (this.reading) {
      this.flush();
    }
  }
  
  // Send special keys
  sendSpecialKey(name: 'up' | 'down' | 'left' | 'right' | 'enter' | 'escape' | 'tab' | 'backspace'): void {
    const sequences: Record<string, string> = {
      up: '\x1b[A',
      down: '\x1b[B',
      right: '\x1b[C',
      left: '\x1b[D',
      enter: '\r',
      escape: '\x1b',
      tab: '\t',
      backspace: '\x7f'
    };
    this.sendKey(sequences[name] || '');
  }
  
  // Send Ctrl+key combination
  sendCtrlKey(key: string): void {
    if (key.length === 1) {
      const code = key.toLowerCase().charCodeAt(0) - 96;
      if (code >= 1 && code <= 26) {
        this.sendKey(String.fromCharCode(code));
      }
    }
  }
  
  // Flush input buffer
  private flush(): void {
    while (this.inputBuffer.length > 0) {
      const data = this.inputBuffer.shift()!;
      this.push(Buffer.from(data));
    }
  }
  
  override _read(): void {
    this.reading = true;
    this.flush();
  }
}

// ============================================================================
// TTY Test Environment
// ============================================================================

/**
 * Complete TTY test environment with input and output streams
 */
export class TTYTestEnvironment {
  readonly stdin: MockTTYInputStream;
  readonly stdout: MockTTYStream;
  readonly stderr: MockTTYStream;
  
  constructor(options?: {
    rows?: number;
    columns?: number;
    colorDepth?: number;
  }) {
    this.stdin = new MockTTYInputStream();
    this.stdout = new MockTTYStream(options);
    this.stderr = new MockTTYStream(options);
  }
  
  /**
   * Send input to stdin
   */
  sendInput(input: string): void {
    this.stdin.sendKey(input);
  }
  
  /**
   * Send special key
   */
  sendSpecialKey(key: 'up' | 'down' | 'left' | 'right' | 'enter' | 'escape' | 'tab' | 'backspace'): void {
    this.stdin.sendSpecialKey(key);
  }
  
  /**
   * Send Ctrl+key
   */
  sendCtrlKey(key: string): void {
    this.stdin.sendCtrlKey(key);
  }
  
  /**
   * Get stdout output
   */
  getOutput(): string {
    return this.stdout.getOutput();
  }
  
  /**
   * Get stderr output
   */
  getErrorOutput(): string {
    return this.stderr.getOutput();
  }
  
  /**
   * Get as TerminalStream for use with core modules
   */
  asStream(): TerminalStream {
    return {
      input: this.stdin as unknown as NodeJS.ReadStream,
      output: this.stdout as unknown as NodeJS.WriteStream,
      isTTY: true,
      colorMode: 'truecolor'
    };
  }
  
  /**
   * Clear all buffers
   */
  clear(): void {
    this.stdout.clearBuffer();
    this.stderr.clearBuffer();
  }
  
  /**
   * Resize terminal
   */
  resize(columns: number, rows: number): void {
    this.stdout.resize(columns, rows);
    this.stderr.resize(columns, rows);
  }
  
  /**
   * Set raw mode
   */
  setRawMode(mode: boolean): void {
    this.stdin.setRawMode(mode);
    this.stdout.setRawMode(mode);
  }
  
  /**
   * Create a snapshot of current state
   */
  snapshot(): {
    stdout: string;
    stderr: string;
    dimensions: { rows: number; columns: number };
    rawMode: boolean;
    cursorHidden: boolean;
    alternateBuffer: boolean;
  } {
    return {
      stdout: this.stdout.getOutput(),
      stderr: this.stderr.getOutput(),
      dimensions: {
        rows: this.stdout.rows,
        columns: this.stdout.columns
      },
      rawMode: this.stdin.isRaw(),
      cursorHidden: this.stdout.isCursorHidden(),
      alternateBuffer: this.stdout.isAlternateBuffer()
    };
  }
  
  /**
   * Wait for output to contain string
   */
  async waitForOutput(substring: string, timeout = 1000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.stdout.getOutput().includes(substring)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    return false;
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wrap a test function with TTY environment
 */
export function withTTY<T>(
  testFn: (env: TTYTestEnvironment) => T | Promise<T>,
  options?: {
    rows?: number;
    columns?: number;
    colorDepth?: number;
  }
): () => Promise<T> {
  return async () => {
    const env = new TTYTestEnvironment(options);
    
    // Setup raw mode by default
    env.setRawMode(true);
    
    try {
      return await testFn(env);
    } finally {
      // Cleanup
      env.setRawMode(false);
      env.clear();
    }
  };
}

/**
 * Create a mock process object with TTY streams
 */
export function createMockProcess(env: TTYTestEnvironment): {
  stdin: MockTTYInputStream;
  stdout: MockTTYStream;
  stderr: MockTTYStream;
  exit: (code?: number) => void;
  env: Record<string, string>;
} {
  return {
    stdin: env.stdin,
    stdout: env.stdout,
    stderr: env.stderr,
    exit: (code?: number) => {
      // Mock exit
      console.log(`Process exit with code: ${code}`);
    },
    env: {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3'
    }
  };
}

/**
 * Setup global TTY environment for testing
 */
export function setupGlobalTTY(): TTYTestEnvironment {
  const env = new TTYTestEnvironment({
    rows: 24,
    columns: 80,
    colorDepth: 24
  });
  
  // Override global process streams
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;
  const originalStderr = process.stderr;
  
  Object.defineProperty(process, 'stdin', {
    value: env.stdin,
    writable: true,
    configurable: true
  });
  
  Object.defineProperty(process, 'stdout', {
    value: env.stdout,
    writable: true,
    configurable: true
  });
  
  Object.defineProperty(process, 'stderr', {
    value: env.stderr,
    writable: true,
    configurable: true
  });
  
  // Return cleanup function
  const cleanup = () => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(process, 'stderr', {
      value: originalStderr,
      writable: true,
      configurable: true
    });
  };
  
  // Store cleanup function on env for convenience
  (env as any).cleanup = cleanup;
  
  return env;
}

// ============================================================================
// Export Factory Functions
// ============================================================================

/**
 * Create a TTY test environment
 */
export function createTTYTestEnvironment(options?: {
  rows?: number;
  columns?: number;
  colorDepth?: number;
}): TTYTestEnvironment {
  return new TTYTestEnvironment(options);
}

/**
 * Create a mock TTY output stream
 */
export function createMockTTYStream(options?: {
  rows?: number;
  columns?: number;
  colorDepth?: number;
}): MockTTYStream {
  return new MockTTYStream(options);
}

/**
 * Create a mock TTY input stream
 */
export function createMockTTYInputStream(): MockTTYInputStream {
  return new MockTTYInputStream();
}