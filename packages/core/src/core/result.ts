import { CommandError } from './error.js';

export interface ExecutionResult {
  // Basic data
  stdout: string;                       // Standard output
  stderr: string;                       // Error output
  exitCode: number;                     // Exit code
  signal?: string;                      // Exit signal

  // Status
  ok: boolean;                          // Success status (exitCode === 0)
  cause?: string;                       // Error cause (exitCode or signal) when not ok

  // Metadata
  command: string;                      // Executed command
  duration: number;                     // Execution time (ms)
  startedAt: Date;                      // Start time
  finishedAt: Date;                     // Finish time

  // Context
  adapter: string;                      // Used adapter
  host?: string;                        // Host (for SSH)
  container?: string;                   // Container (for Docker)

  // Methods
  toString(): string;
  toJSON(): object;
  throwIfFailed(): void;
  /**
   * @deprecated Use `result.ok` instead
   */
  isSuccess(): boolean;
}

export class ExecutionResultImpl implements ExecutionResult {
  public readonly ok: boolean;
  public readonly cause?: string;

  constructor(
    public stdout: string,
    public stderr: string,
    public exitCode: number,
    public signal: string | undefined,
    public command: string,
    public duration: number,
    public startedAt: Date,
    public finishedAt: Date,
    public adapter: string,
    public host?: string,
    public container?: string
  ) {
    this.ok = exitCode === 0;
    if (!this.ok) {
      this.cause = signal ? `signal: ${signal}` : `exitCode: ${exitCode}`;
    }
  }

  toString(): string {
    return this.stdout.trim();
  }

  toJSON(): object {
    return {
      stdout: this.stdout,
      stderr: this.stderr,
      exitCode: this.exitCode,
      signal: this.signal,
      command: this.command,
      duration: this.duration,
      startedAt: this.startedAt.toISOString(),
      finishedAt: this.finishedAt.toISOString(),
      adapter: this.adapter,
      host: this.host,
      container: this.container
    };
  }

  throwIfFailed(): void {
    if (this.exitCode !== 0) {
      throw new CommandError(
        this.command,
        this.exitCode,
        this.signal,
        this.stdout,
        this.stderr,
        this.duration
      );
    }
  }

  /**
   * @deprecated Use `result.ok` instead
   */
  isSuccess(): boolean {
    return this.ok;
  }
}