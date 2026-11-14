import type { LocalAdapter } from './index.js';
import type { Command } from '../../types/command.js';
import type { ExecutionResult } from '../../core/result.js';

import { Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import { ExecutionError, MaxBufferExceededError, sanitizeCommandForError, sanitizeErrorForDiagnostics } from '../../core/error.js';

interface LocalCommandSessionOptions {
  encoding?: BufferEncoding;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
  onNonZero?: (result: ExecutionResult) => Error;
}

function diagnosticError(value: unknown): Error {
  return value instanceof Error ? sanitizeErrorForDiagnostics(value) : new Error(sanitizeCommandForError(String(value)));
}

/** Own one local CLI lifetime, including output consumption and cancellation. */
export class LocalCommandSession {
  readonly result: Promise<ExecutionResult>;
  readonly completion: Promise<void>;
  private controller = new AbortController();
  private failure: unknown;
  private stopping = false;
  private settled = false;

  get stopped(): boolean { return this.stopping; }

  constructor(local: LocalAdapter, command: Command, options: LocalCommandSessionOptions = {}) {
    if (command.signal?.aborted) throw diagnosticError(command.signal.reason);
    const fail = (error: unknown) => {
      if (!this.settled && this.failure === undefined) {
        this.failure = error;
        this.controller.abort();
      }
    };
    const output = (onLine: ((data: string) => void) | undefined, fallback: Command['stdout'], stream: 'stdout' | 'stderr') =>
      onLine ? new LineOutput(onLine, command.maxBuffer!, options.encoding ?? 'utf8', stream, fail) : (fallback ?? 'pipe');
    const abort = () => fail(command.signal!.reason);
    command.signal?.addEventListener('abort', abort, { once: true });
    this.result = local.execute({
      ...command,
      signal: this.controller.signal,
      stdout: output(options.onStdout, command.stdout, 'stdout'),
      stderr: output(options.onStderr, command.stderr, 'stderr'),
      throwOnNonZeroExit: false,
      nothrow: undefined,
    }).then(result => {
      if (this.failure !== undefined) throw this.failure;
      if (command.throwOnNonZeroExit && !result.ok && !(this.stopping && (result.signal || result.aborted))) {
        throw options.onNonZero?.(result) ?? new ExecutionError(
          `Command exited with code ${result.exitCode}: ${result.stderr}`,
          'COMMAND_FAILED', { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
        );
      }
      return result;
    }).catch(error => { throw diagnosticError(error); }).finally(() => {
      this.settled = true;
      command.signal?.removeEventListener('abort', abort);
    });
    this.completion = this.result.then(() => {});
    // Handles remain safe to stop without awaiting; completion still exposes failures.
    void this.completion.catch(() => {});
  }

  cancel(error: Error): void {
    if (!this.settled && this.failure === undefined) {
      this.failure = error;
      this.controller.abort();
    }
  }

  stop(): Promise<void> {
    if (!this.settled && !this.stopping) {
      this.stopping = true;
      this.controller.abort();
    }
    return this.completion;
  }
}

/** Decode full lines across OS chunks, retaining blank lines and an unterminated tail. */
class LineOutput extends Writable {
  private decoder: StringDecoder;
  private pending = '';
  private failed = false;

  constructor(
    private onLine: (line: string) => void,
    private maxBuffer: number,
    private encoding: BufferEncoding,
    private stream: 'stdout' | 'stderr',
    private onFailure: (error: unknown) => void,
  ) {
    super();
    this.decoder = new StringDecoder(encoding);
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.consume(this.decoder.write(chunk), false);
    done();
  }

  override _final(done: () => void): void {
    this.consume(this.decoder.end(), true);
    done();
  }

  private consume(text: string, final: boolean): void {
    if (this.failed) return;
    try {
      this.pending += text;
      let newline: number;
      while ((newline = this.pending.indexOf('\n')) !== -1) {
        const line = this.pending.slice(0, newline + 1);
        this.checkLimit(line);
        this.pending = this.pending.slice(newline + 1);
        this.onLine(line);
      }
      this.checkLimit(this.pending);
      if (final && this.pending) {
        this.onLine(this.pending);
        this.pending = '';
      }
    } catch (error) {
      this.failed = true;
      this.pending = '';
      this.onFailure(error);
    }
  }

  private checkLimit(text: string): void {
    if (Buffer.byteLength(text, this.encoding) > this.maxBuffer) {
      throw new MaxBufferExceededError(this.maxBuffer, this.stream);
    }
  }
}
