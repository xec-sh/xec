import { EventEmitter } from 'node:events';
import { createWriteStream } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { Readable, Writable, Transform, PassThrough } from 'node:stream';

import type { Command } from '../types/command.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

// Core StreamHandler functionality (previously in core/stream-handler.ts)
export interface StreamHandlerOptions {
  encoding?: BufferEncoding;
  maxBuffer?: number;
  onData?: (chunk: string) => void;
  onError?: (error: Error) => void;
}

export class StreamHandler {
  private buffer: Buffer[] = [];
  private totalLength = 0;
  private decoder: StringDecoder;
  private readonly encoding: BufferEncoding;
  private readonly maxBuffer: number;
  private readonly onData?: (chunk: string) => void;
  private readonly onError?: (error: Error) => void;
  private disposed = false;

  constructor(options: StreamHandlerOptions = {}) {
    this.encoding = options.encoding || 'utf8';
    this.decoder = new StringDecoder(this.encoding);
    this.maxBuffer = options.maxBuffer || 1024 * 1024 * 10; // 10MB default
    this.onData = options.onData;
    this.onError = options.onError;
  }

  createTransform(): Transform {
    const self = this;

    const transform = new Transform({
      transform(chunk: Buffer, encoding, callback) {
        try {
          if (self.disposed) {
            callback(new Error('StreamHandler has been disposed'));
            return;
          }

          if (self.totalLength + chunk.length > self.maxBuffer) {
            // Clean up buffer to prevent memory leak
            self.reset();
            const error = new Error(`Stream exceeded maximum buffer size of ${self.maxBuffer} bytes`);
            if (self.onError) {
              self.onError(error);
            }
            callback(error);
            return;
          }

          self.buffer.push(chunk);
          self.totalLength += chunk.length;

          const str = self.decoder.write(chunk);
          if (self.onData && str) {
            self.onData(str);
          }

          this.push(chunk);
          callback();
        } catch (error) {
          // Clean up on error
          self.reset();
          if (self.onError) {
            self.onError(error as Error);
          }
          callback(error as Error);
        }
      },

      flush(callback) {
        try {
          if (!self.disposed) {
            const str = self.decoder.end();
            if (self.onData && str) {
              self.onData(str);
            }
            // Don't reset here - buffer content is needed for getContent()
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },

      final(callback) {
        // Don't reset here - buffer content is needed for getContent()
        // Cleanup will happen on 'close' event or explicit dispose()
        callback();
      },

      // Add autoDestroy to ensure the stream is destroyed when it ends
      autoDestroy: true
    });

    // Don't automatically reset/dispose on close - user may need to access
    // buffer content via getContent() after stream ends
    // Memory cleanup should be handled explicitly by calling dispose() or reset()

    // Only reset on error to clean up partial/invalid data
    transform.on('error', () => {
      if (!self.disposed) {
        self.reset();
      }
    });

    return transform;
  }

  getContent(): string {
    if (this.disposed) {
      return '';
    }
    const fullBuffer = Buffer.concat(this.buffer, this.totalLength);
    return fullBuffer.toString(this.encoding);
  }

  getBuffer(): Buffer {
    if (this.disposed) {
      return Buffer.alloc(0);
    }
    return Buffer.concat(this.buffer, this.totalLength);
  }

  reset(): void {
    if (!this.disposed) {
      // Clear buffer references to allow garbage collection
      this.buffer.length = 0;
      this.buffer = [];
      this.totalLength = 0;
      this.decoder = new StringDecoder(this.encoding);
    }
  }

  dispose(): void {
    if (!this.disposed) {
      this.reset();
      this.disposed = true;
    }
  }
}

// Line transformation utilities
export function createLineTransform(onLine: (line: string) => void): Transform {
  let buffer = '';

  return new Transform({
    transform(chunk: Buffer, encoding, callback) {
      const str = chunk.toString();
      buffer += str;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        onLine(line);
      }

      this.push(chunk);
      callback();
    },

    flush(callback) {
      if (buffer) {
        onLine(buffer);
      }
      callback();
    }
  });
}

export class LineTransform extends Transform {
  private buffer = '';

  constructor(
    private transform: (line: string) => string | null,
    private encoding: BufferEncoding = 'utf8'
  ) {
    super();
  }

  override _transform(chunk: Buffer, encoding: string, callback: Function): void {
    this.buffer += chunk.toString(this.encoding);
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const transformed = this.transform(line);
      if (transformed !== null) {
        this.push(transformed + '\n');
      }
    }

    callback();
  }

  override _flush(callback: Function): void {
    if (this.buffer) {
      const transformed = this.transform(this.buffer);
      if (transformed !== null) {
        this.push(transformed);
      }
    }
    callback();
  }
}

// Stream conversion utilities
export async function streamToString(stream: Readable, encoding: BufferEncoding = 'utf8'): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString(encoding);
}

// Alias for backward compatibility
export const collectStream = streamToString;

// Stream combination utilities
export function combineStreams(stdout: Readable, stderr: Readable): Readable {
  const combined = new Readable({
    read() { }
  });

  let stdoutEnded = false;
  let stderrEnded = false;

  function checkEnd() {
    if (stdoutEnded && stderrEnded) {
      combined.push(null);
    }
  }

  function pipeStream(stream: Readable, prefix: string, onEnd: () => void) {
    stream.on('data', (chunk) => {
      combined.push(`[${prefix}] ${chunk}`);
    });

    stream.on('error', (error) => {
      combined.destroy(error);
    });

    stream.on('end', () => {
      onEnd();
      checkEnd();
    });
  }

  pipeStream(stdout, 'stdout', () => { stdoutEnded = true; });
  pipeStream(stderr, 'stderr', () => { stderrEnded = true; });

  return combined;
}

// Streaming execution
export interface StreamOptions {
  encoding?: BufferEncoding;
  lineMode?: boolean;
  bufferSize?: number;
}

export class StreamingExecution extends EventEmitter {
  private stdout = new PassThrough();
  private stderr = new PassThrough();
  private process: any;

  constructor(
    private engine: ExecutionEngine,
    private command: Command,
    private options: StreamOptions = {}
  ) {
    super();
  }

  async start(): Promise<void> {
    const streamCommand = {
      ...this.command,
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      stream: true
    };

    this.process = await this.engine.execute(streamCommand);

    if (this.process.stdout) {
      this.process.stdout.pipe(this.stdout);

      if (this.options.lineMode) {
        this.setupLineMode(this.process.stdout, 'stdout');
      }
    }

    if (this.process.stderr) {
      this.process.stderr.pipe(this.stderr);

      if (this.options.lineMode) {
        this.setupLineMode(this.process.stderr, 'stderr');
      }
    }

    this.process.on('exit', (code: number, signal: string) => {
      this.emit('exit', code, signal);
    });

    this.process.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private setupLineMode(stream: Readable, type: 'stdout' | 'stderr'): void {
    let buffer = '';

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString(this.options.encoding || 'utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        this.emit('line', line, type);
      }
    });

    stream.on('end', () => {
      if (buffer) {
        this.emit('line', buffer, type);
      }
    });
  }

  getStdout(): Readable {
    return this.stdout;
  }

  getStderr(): Readable {
    return this.stderr;
  }

  async *lines(): AsyncIterableIterator<{ line: string; stream: 'stdout' | 'stderr' }> {
    const lines: Array<{ line: string; stream: 'stdout' | 'stderr' }> = [];
    let done = false;

    this.on('line', (line, stream) => {
      lines.push({ line, stream });
    });

    this.on('exit', () => {
      done = true;
    });

    while (!done || lines.length > 0) {
      if (lines.length > 0) {
        yield lines.shift()!;
      } else {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }

  pipe(destination: Writable | Transform): StreamingExecution {
    this.stdout.pipe(destination);
    return this;
  }

  async wait(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.on('exit', (code) => resolve(code));
      this.on('error', reject);
    });
  }

  kill(signal?: NodeJS.Signals): void {
    if (this.process && this.process.kill) {
      this.process.kill(signal);
    }
  }
}

export function stream(
  engine: ExecutionEngine,
  command: string | Command,
  options: StreamOptions = {}
): StreamingExecution {
  const cmd: Command = typeof command === 'string' ? { command } : command;
  return new StreamingExecution(engine, cmd, options);
}

// Stream collectors and transformers
export class StreamCollector extends Transform {
  private chunks: Buffer[] = [];

  constructor(private maxSize?: number) {
    super();
  }

  override _transform(chunk: Buffer, encoding: string, callback: Function): void {
    this.chunks.push(chunk);

    if (this.maxSize) {
      const totalSize = this.chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize > this.maxSize) {
        this.chunks = this.chunks.slice(-Math.floor(this.chunks.length / 2));
      }
    }

    this.push(chunk);
    callback();
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  getText(encoding: BufferEncoding = 'utf8'): string {
    return this.getBuffer().toString(encoding);
  }
}

export class ProgressTracker extends Transform {
  private totalBytes = 0;
  private startTime = Date.now();

  constructor(
    private onProgress: (bytes: number, totalBytes: number, bytesPerSecond: number) => void
  ) {
    super();
  }

  override _transform(chunk: Buffer, encoding: string, callback: Function): void {
    this.totalBytes += chunk.length;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const bytesPerSecond = this.totalBytes / elapsed;

    this.onProgress(chunk.length, this.totalBytes, bytesPerSecond);

    this.push(chunk);
    callback();
  }
}

// Stream creation utilities
export function createOutputStream(
  option: string | Writable | ((chunk: string) => void),
  isStderr = false
): Writable {
  if (option === 'inherit') {
    return isStderr ? process.stderr : process.stdout;
  }

  if (option === 'ignore') {
    return new Writable({
      write(chunk, encoding, callback) {
        callback();
      }
    });
  }

  if (option === 'pipe') {
    return new PassThrough();
  }

  if (typeof option === 'string') {
    // File path
    return createWriteStream(option);
  }

  if (typeof option === 'function') {
    return new Writable({
      write(chunk, encoding, callback) {
        option(chunk.toString());
        callback();
      }
    });
  }

  if (option && typeof option.write === 'function') {
    return option as Writable;
  }

  throw new Error(`Invalid output stream option: ${option}`);
}

export function createInputStream(
  input: string | Buffer | Readable | null | undefined
): Readable | null | undefined {
  if (input === null || input === undefined) {
    return input as null | undefined;
  }

  if (typeof input === 'string' || Buffer.isBuffer(input)) {
    return Readable.from(input);
  }

  if (input && typeof input.pipe === 'function') {
    return input as Readable;
  }

  throw new Error(`Invalid input stream option: ${input}`);
}

export function pipeStreams(source: Readable, destination: Writable): void {
  source.pipe(destination);
}

