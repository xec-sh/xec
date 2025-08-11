/**
 * Terminal Stream Implementation
 * Provides unified stream interface for different runtimes
 */

import { getPlatform, detectRuntime, getColorSupport, getTerminalSize } from './platform.js';

import type {
  Rows,
  Cols,
  Platform,
  ColorDepth,
  Disposable,
  TerminalStream,
  BufferEncoding
} from '../types.js';

/**
 * Terminal Stream implementation for Node.js
 */
export class NodeTerminalStream implements TerminalStream {
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly platform: Platform;
  readonly encoding: BufferEncoding = 'utf8';
  
  private _isRaw = false;
  private _colorDepth: ColorDepth;

  constructor(
    stdin?: NodeJS.ReadStream,
    stdout?: NodeJS.WriteStream,
    stderr?: NodeJS.WriteStream
  ) {
    // Use process streams by default
    this.stdin = stdin || process.stdin;
    this.stdout = stdout || process.stdout;
    this.stderr = stderr || process.stderr;
    this.platform = getPlatform();
    this._colorDepth = getColorSupport() as ColorDepth;
  }

  get rows(): Rows {
    const size = getTerminalSize();
    return (size?.rows || 24) as Rows;
  }

  get cols(): Cols {
    const size = getTerminalSize();
    return (size?.cols || 80) as Cols;
  }

  get isTTY(): boolean {
    return !!(this.stdout.isTTY && this.stdin.isTTY);
  }

  get colorDepth(): ColorDepth {
    return this._colorDepth;
  }

  get isRaw(): boolean {
    return this._isRaw;
  }

  setRawMode(enabled: boolean): void {
    if (!this.stdin.isTTY) {
      throw new Error('Cannot set raw mode on non-TTY stream');
    }
    
    // @ts-ignore - setRawMode exists on TTY streams
    if (this.stdin.setRawMode) {
      // @ts-ignore
      this.stdin.setRawMode(enabled);
      this._isRaw = enabled;
    }
  }

  useAlternateBuffer(): Disposable {
    const enableSequence = '\x1b[?1049h';
    const disableSequence = '\x1b[?1049l';
    
    this.write(enableSequence);
    
    let disposed = false;
    return {
      dispose: () => {
        if (!disposed) {
          this.write(disableSequence);
          disposed = true;
        }
      }
    };
  }

  clearScreen(): void {
    this.write('\x1b[2J\x1b[H');
  }

  write(data: string | Uint8Array): void {
    if (typeof data === 'string') {
      this.stdout.write(data);
    } else {
      this.stdout.write(Buffer.from(data));
    }
  }

  writeLine(data: string): void {
    this.write(data + '\n');
  }

  writeError(data: string | Uint8Array): void {
    if (typeof data === 'string') {
      this.stderr.write(data);
    } else {
      this.stderr.write(Buffer.from(data));
    }
  }

  async flush(): Promise<void> {
    return new Promise((resolve, _reject) => {
      // @ts-ignore - _writableState exists on streams
      if (this.stdout._writableState?.needDrain) {
        this.stdout.once('drain', resolve);
      } else {
        process.nextTick(resolve);
      }
    });
  }
}

/**
 * Terminal Stream implementation for Deno
 */
export class DenoTerminalStream implements TerminalStream {
  readonly stdin: ReadableStream<Uint8Array>;
  readonly stdout: WritableStream<Uint8Array>;
  readonly stderr: WritableStream<Uint8Array>;
  readonly platform: Platform;
  readonly encoding: BufferEncoding = 'utf8';
  
  private _isRaw = false;
  private _colorDepth: ColorDepth;
  private stdoutWriter: WritableStreamDefaultWriter<Uint8Array>;
  private stderrWriter: WritableStreamDefaultWriter<Uint8Array>;

  constructor(
    stdin?: ReadableStream<Uint8Array>,
    stdout?: WritableStream<Uint8Array>,
    stderr?: WritableStream<Uint8Array>
  ) {
    // @ts-ignore - Deno global
    this.stdin = stdin || Deno.stdin.readable;
    // @ts-ignore - Deno global
    this.stdout = stdout || Deno.stdout.writable;
    // @ts-ignore - Deno global
    this.stderr = stderr || Deno.stderr.writable;
    
    this.stdoutWriter = this.stdout.getWriter();
    this.stderrWriter = this.stderr.getWriter();
    
    this.platform = getPlatform();
    this._colorDepth = getColorSupport() as ColorDepth;
  }

  get rows(): Rows {
    const size = getTerminalSize();
    return (size?.rows || 24) as Rows;
  }

  get cols(): Cols {
    const size = getTerminalSize();
    return (size?.cols || 80) as Cols;
  }

  get isTTY(): boolean {
    // @ts-ignore - Deno global
    return Deno.isatty(0) && Deno.isatty(1);
  }

  get colorDepth(): ColorDepth {
    return this._colorDepth;
  }

  get isRaw(): boolean {
    return this._isRaw;
  }

  setRawMode(enabled: boolean): void {
    // @ts-ignore - Deno global
    Deno.stdin.setRaw(enabled);
    this._isRaw = enabled;
  }

  useAlternateBuffer(): Disposable {
    const enableSequence = '\x1b[?1049h';
    const disableSequence = '\x1b[?1049l';
    
    this.write(enableSequence);
    
    let disposed = false;
    return {
      dispose: () => {
        if (!disposed) {
          this.write(disableSequence);
          disposed = true;
        }
      }
    };
  }

  clearScreen(): void {
    this.write('\x1b[2J\x1b[H');
  }

  write(data: string | Uint8Array): void {
    const bytes = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;
    this.stdoutWriter.write(bytes);
  }

  writeLine(data: string): void {
    this.write(data + '\n');
  }

  writeError(data: string | Uint8Array): void {
    const bytes = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;
    this.stderrWriter.write(bytes);
  }

  async flush(): Promise<void> {
    await this.stdoutWriter.ready;
  }
}

/**
 * Terminal Stream implementation for Bun
 */
export class BunTerminalStream implements TerminalStream {
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly platform: Platform;
  readonly encoding: BufferEncoding = 'utf8';
  
  private _isRaw = false;
  private _colorDepth: ColorDepth;

  constructor(
    stdin?: NodeJS.ReadStream,
    stdout?: NodeJS.WriteStream,
    stderr?: NodeJS.WriteStream
  ) {
    // @ts-ignore - Bun globals
    this.stdin = stdin || Bun.stdin;
    // @ts-ignore - Bun globals
    this.stdout = stdout || Bun.stdout;
    // @ts-ignore - Bun globals
    this.stderr = stderr || Bun.stderr;
    
    this.platform = getPlatform();
    this._colorDepth = getColorSupport() as ColorDepth;
  }

  get rows(): Rows {
    const size = getTerminalSize();
    return (size?.rows || 24) as Rows;
  }

  get cols(): Cols {
    const size = getTerminalSize();
    return (size?.cols || 80) as Cols;
  }

  get isTTY(): boolean {
    // @ts-ignore - Bun global
    return Bun.isatty(this.stdout) && Bun.isatty(this.stdin);
  }

  get colorDepth(): ColorDepth {
    return this._colorDepth;
  }

  get isRaw(): boolean {
    return this._isRaw;
  }

  setRawMode(enabled: boolean): void {
    // @ts-ignore - Bun specific
    if (this.stdin.setRawMode) {
      // @ts-ignore
      this.stdin.setRawMode(enabled);
      this._isRaw = enabled;
    }
  }

  useAlternateBuffer(): Disposable {
    const enableSequence = '\x1b[?1049h';
    const disableSequence = '\x1b[?1049l';
    
    this.write(enableSequence);
    
    let disposed = false;
    return {
      dispose: () => {
        if (!disposed) {
          this.write(disableSequence);
          disposed = true;
        }
      }
    };
  }

  clearScreen(): void {
    this.write('\x1b[2J\x1b[H');
  }

  write(data: string | Uint8Array): void {
    // @ts-ignore - Bun write method
    Bun.write(this.stdout, data);
  }

  writeLine(data: string): void {
    this.write(data + '\n');
  }

  writeError(data: string | Uint8Array): void {
    // @ts-ignore - Bun write method
    Bun.write(this.stderr, data);
  }

  async flush(): Promise<void> {
    // Bun handles flushing automatically
    return Promise.resolve();
  }
}

/**
 * Create appropriate terminal stream for current runtime
 */
export function createTerminalStream(
  stdin?: any,
  stdout?: any,
  stderr?: any
): TerminalStream {
  const runtime = detectRuntime();
  
  switch (runtime) {
    case 'deno':
      return new DenoTerminalStream(stdin, stdout, stderr);
    case 'bun':
      return new BunTerminalStream(stdin, stdout, stderr);
    case 'node':
    default:
      return new NodeTerminalStream(stdin, stdout, stderr);
  }
}

export default createTerminalStream;