import { EventEmitter } from 'node:events';
import { Readable, Writable, Transform, PassThrough } from 'node:stream';

import type { Command } from '../core/command.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

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

