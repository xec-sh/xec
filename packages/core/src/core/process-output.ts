import { TextDecoder } from 'util';

import type { ProcessOutputOptions } from '../types/process.js';

export { ProcessOutputOptions } from '../types/process.js';

/**
 * ProcessOutput represents the result of command execution
 * Compatible with zx/xs ProcessOutput
 */
export class ProcessOutput extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly stdall: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly duration: number;
  readonly command?: string;
  readonly cwd?: string;

  constructor(options: ProcessOutputOptions) {
    const message = ProcessOutput.formatErrorMessage(options);
    super(message);
    
    this.name = 'ProcessOutput';
    this.stdout = ProcessOutput.bufferToString(options.stdout);
    this.stderr = ProcessOutput.bufferToString(options.stderr);
    this.stdall = options.stdall !== undefined 
      ? ProcessOutput.bufferToString(options.stdall)
      : this.stdout + this.stderr;
    this.exitCode = options.exitCode;
    this.signal = options.signal || null;
    this.duration = options.duration || 0;
    this.command = options.command;
    this.cwd = options.cwd;

    // Capture stack trace
    Error.captureStackTrace(this, ProcessOutput);
  }

  /**
   * Check if the process exited successfully
   */
  get ok(): boolean {
    return this.exitCode === 0 && this.signal === null;
  }

  /**
   * Return trimmed stdout when used as string
   */
  override toString(): string {
    return this.stdout.trim();
  }

  /**
   * Return trimmed stdout when used as value
   */
  override valueOf(): string {
    return this.stdout.trim();
  }

  /**
   * Get text output with optional encoding (trimmed)
   */
  text(encoding: BufferEncoding = 'utf8'): string {
    if (encoding === 'utf8') return this.stdout.trim();
    return Buffer.from(this.stdout).toString(encoding).trim();
  }

  /**
   * Parse stdout as JSON
   */
  json<T = any>(): T {
    const text = this.stdout.trim();
    if (!text) {
      throw new Error('Empty stdout');
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse JSON: ${message}\nOutput: ${text}`);
    }
  }

  /**
   * Split stdout into lines
   */
  lines(delimiter = '\n'): string[] {
    return this.stdout.split(delimiter).filter(line => line.length > 0);
  }

  /**
   * Get stdout as Buffer
   */
  buffer(): Buffer {
    return Buffer.from(this.stdout);
  }

  /**
   * Get stdout as Blob (if available)
   */
  blob(): Blob {
    if (typeof Blob === 'undefined') {
      throw new Error('Blob is not available in this environment');
    }
    return new Blob([this.stdout]);
  }

  /**
   * Support for iteration over lines
   */
  [Symbol.iterator](): Iterator<string> {
    const lines = this.lines();
    let index = 0;
    return {
      next(): IteratorResult<string> {
        if (index < lines.length) {
          return { value: lines[index++]!, done: false };
        }
        return { done: true, value: undefined as any };
      }
    };
  }

  /**
   * Support for async iteration (compatibility)
   */
  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    for (const line of this.lines()) {
      yield line;
    }
  }

  /**
   * Convert buffer or string to string
   */
  private static bufferToString(data?: string | Buffer): string {
    if (!data) return '';
    if (typeof data === 'string') return data;
    return new TextDecoder().decode(data);
  }

  /**
   * Format error message for non-zero exit codes
   */
  private static formatErrorMessage(options: ProcessOutputOptions): string {
    if (options.exitCode === 0 && !options.signal) {
      return '';
    }

    const parts: string[] = [];

    if (options.command) {
      parts.push(`Command failed: ${options.command}`);
    } else {
      parts.push('Command failed');
    }

    if (options.exitCode !== null && options.exitCode !== 0) {
      parts.push(`Exit code: ${options.exitCode}`);
      
      // Add human-readable error message for common exit codes
      const errorMessage = ProcessOutput.getErrorMessage(options.exitCode);
      if (errorMessage) {
        parts.push(`(${errorMessage})`);
      }
    }

    if (options.signal) {
      parts.push(`Signal: ${options.signal}`);
    }

    if (options.cwd) {
      parts.push(`Working directory: ${options.cwd}`);
    }

    const stderr = ProcessOutput.bufferToString(options.stderr);
    if (stderr) {
      parts.push(`\nstderr:\n${stderr}`);
    }

    return parts.join('\n');
  }

  /**
   * Get human-readable error message for exit code
   */
  private static getErrorMessage(code: number): string | null {
    const errorMessages: Record<number, string> = {
      1: 'General error',
      2: 'Misuse of shell builtins',
      126: 'Command invoked cannot execute',
      127: 'Command not found',
      128: 'Invalid exit argument',
      129: 'Hangup',
      130: 'Interrupt',
      131: 'Quit and dump core',
      132: 'Illegal instruction',
      133: 'Trace/breakpoint trap',
      134: 'Process aborted',
      135: 'Bus error',
      136: 'Floating point exception',
      137: 'Kill',
      138: 'User defined signal 1',
      139: 'Segmentation fault',
      140: 'User defined signal 2',
      141: 'Broken pipe',
      142: 'Alarm clock',
      143: 'Termination',
    };

    return errorMessages[code] || null;
  }

  /**
   * Create ProcessOutput from execution result
   */
  static fromResult(result: {
    stdout: string | Buffer;
    stderr: string | Buffer;
    exitCode: number | null;
    signal?: NodeJS.Signals | null;
    duration?: number;
    command?: string;
    cwd?: string;
  }): ProcessOutput {
    return new ProcessOutput(result);
  }

  /**
   * Create successful ProcessOutput
   */
  static success(stdout: string | Buffer = ''): ProcessOutput {
    return new ProcessOutput({
      stdout,
      stderr: '',
      exitCode: 0,
      signal: null,
    });
  }
}