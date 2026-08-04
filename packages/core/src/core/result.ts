import type { ExecutionResult } from '../types/result.js';

import { CommandError } from './error.js';

export type { ExecutionResult } from '../types/result.js';

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
    // A process killed by a signal reports no exit code, and coalescing that
    // to 0 made an OOM kill or an orchestrator SIGTERM indistinguishable from
    // success. A signal is never success.
    this.ok = exitCode === 0 && !signal;

    if (!this.ok) {
      this.cause = signal ? `signal: ${signal}` : `exitCode: ${exitCode}`;
    }
  }


  /**
   * Interpolating a result yields its stdout, shaped like `$(...)` command
   * substitution in a shell: one trailing newline removed.
   *
   * Without this, `` `Branch: ${await $`git branch --show-current`}` ``
   * produced `Branch: [object Object]` — the flagship interpolation syntax
   * yielding garbage for the most common use of a captured result.
   */
  toString(): string {
    return this.stdout.replace(/\r?\n$/, '');
  }

  /** Fully trimmed stdout, so comparisons like `result == 'value'` behave. */
  valueOf(): string {
    return this.stdout.trim();
  }

  toMetadata(): object {
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

  text(): string {
    return this.stdout.trim();
  }

  json<T = any>(): T {
    const text = this.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}\nOutput: ${text}`, { cause: error });
    }
  }

  lines(): string[] {
    return this.stdout.split('\n').filter(line => line.length > 0);
  }

  buffer(): Buffer {
    return Buffer.from(this.stdout);
  }
}