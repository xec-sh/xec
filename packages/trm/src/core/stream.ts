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
    
    // Check if stdin is a TTY stream with setRawMode method
    if ('setRawMode' in this.stdin && typeof this.stdin.setRawMode === 'function') {
      (this.stdin as any).setRawMode(enabled);
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
      // Check if _writableState exists on streams
      if ((this.stdout as any)._writableState?.needDrain) {
        this.stdout.once('drain', resolve);
      } else {
        process.nextTick(resolve);
      }
    });
  }

  /**
   * Dispose of the stream resources
   */
  async dispose(): Promise<void> {
    // Reset raw mode if it was enabled
    if (this._isRaw) {
      this.setRawMode(false);
    }
    
    // Flush any pending output
    await this.flush();
    
    // Node streams don't need explicit cleanup
    // but we ensure everything is flushed
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
    // Deno global
    this.stdin = stdin || (globalThis as any).Deno.stdin.readable;
    // Deno global
    this.stdout = stdout || (globalThis as any).Deno.stdout.writable;
    // Deno global
    this.stderr = stderr || (globalThis as any).Deno.stderr.writable;
    
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
    // Deno global
    return (globalThis as any).Deno.isatty(0) && (globalThis as any).Deno.isatty(1);
  }

  get colorDepth(): ColorDepth {
    return this._colorDepth;
  }

  get isRaw(): boolean {
    return this._isRaw;
  }

  setRawMode(enabled: boolean): void {
    // Deno global
    (globalThis as any).Deno.stdin.setRaw(enabled);
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

  /**
   * Dispose of the stream resources
   */
  async dispose(): Promise<void> {
    // Reset raw mode if it was enabled
    if (this._isRaw) {
      this.setRawMode(false);
    }
    
    try {
      // Close and release writers
      await this.stdoutWriter?.close();
      await this.stderrWriter?.close();
    } catch {
      // If close fails, at least release the locks
      try {
        this.stdoutWriter?.releaseLock();
        this.stderrWriter?.releaseLock();
      } catch {
        // Ignore errors in cleanup
      }
    }
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
    // Bun globals
    this.stdin = stdin || (globalThis as any).Bun.stdin;
    // Bun globals
    this.stdout = stdout || (globalThis as any).Bun.stdout;
    // Bun globals
    this.stderr = stderr || (globalThis as any).Bun.stderr;
    
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
    // Bun global
    return (globalThis as any).Bun.isatty(this.stdout) && (globalThis as any).Bun.isatty(this.stdin);
  }

  get colorDepth(): ColorDepth {
    return this._colorDepth;
  }

  get isRaw(): boolean {
    return this._isRaw;
  }

  setRawMode(enabled: boolean): void {
    // Bun specific
    if ('setRawMode' in this.stdin && typeof this.stdin.setRawMode === 'function') {
      // setRawMode method exists on Bun stdin but not in type definitions
      (this.stdin as any).setRawMode(enabled);
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
    // Bun write method
    (globalThis as any).Bun.write(this.stdout, data);
  }

  writeLine(data: string): void {
    this.write(data + '\n');
  }

  writeError(data: string | Uint8Array): void {
    // Bun write method
    (globalThis as any).Bun.write(this.stderr, data);
  }

  async flush(): Promise<void> {
    // Bun handles flushing automatically
    return Promise.resolve();
  }

  /**
   * Dispose of the stream resources
   */
  async dispose(): Promise<void> {
    // Reset raw mode if it was enabled
    if (this._isRaw) {
      this.setRawMode(false);
    }
    
    // Flush any pending output
    await this.flush();
    
    // Bun streams don't need explicit cleanup
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