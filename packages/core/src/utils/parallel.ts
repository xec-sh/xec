import type { Command } from '../types/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';

import { within, getExecutionSignal } from './within.js';
import { CommandError, TimeoutError } from '../core/error.js';

export interface ParallelOptions {
  /**
   * How many commands may run at once.
   *
   * For infrastructure work this is a safety control, not a tuning knob:
   * "roll out to 100 hosts, 5 at a time" is a different operation from
   * "hit all 100 now". The option was previously spelled only
   * `maxConcurrency` while every example — including both READMEs — said
   * `maxConcurrent`, so the documented form was accepted and ignored, and
   * the limit silently became Infinity. Both spellings work.
   */
  maxConcurrent?: number;

  /** Alias of {@link maxConcurrent}. */
  maxConcurrency?: number;

  stopOnError?: boolean;
  timeout?: number;
  onProgress?: (completed: number, total: number, succeeded: number, failed: number) => void;
}

export interface ParallelResult {
  results: (ExecutionResult | Error)[];
  /** Commands that ran and exited zero. */
  succeeded: ExecutionResult[];
  /**
   * Commands that did not.
   *
   * Holds an ExecutionResult for a command that ran and exited non-zero, and
   * an Error for one that could not run at all. Sorting by whether the promise
   * settled instead put every `.nothrow()` failure in `succeeded` — and
   * `.nothrow()` is exactly what you use to reach every host in a rollout.
   */
  failed: (ExecutionResult | Error)[];
  duration: number;
}

function isProcessPromise(command: unknown): command is ProcessPromise {
  return !!command && typeof (command as ProcessPromise).then === 'function'
    && 'pipe' in (command as object) && 'nothrow' in (command as object);
}

function successful(result: ExecutionResult | Error): result is ExecutionResult {
  return !(result instanceof Error) && (result.ok ?? (result.exitCode === 0 && !result.signal));
}

export async function parallel(
  commands: Array<string | Command | ProcessPromise>,
  engine: ExecutionEngine | CallableExecutionEngine,
  options: ParallelOptions = {}
): Promise<ParallelResult> {
  const limit = options.maxConcurrent ?? options.maxConcurrency ?? Infinity;
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) {
    throw new RangeError('maxConcurrent must be a positive safe integer or Infinity');
  }
  if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout < 0)) {
    throw new RangeError('parallel timeout must be a non-negative finite duration');
  }
  const startTime = Date.now();
  const results: (ExecutionResult | Error)[] = [];
  let index = 0;
  let succeeded = 0;
  let failed = 0;
  let stopped = false;
  let progressError: unknown;
  let progressFailed = false;

  const worker = async () => {
    while (!stopped && index < commands.length) {
      const current = index++;
      try {
        results[current] = await executeWithTimeout(engine, commands[current]!, options.timeout);
      } catch (error) {
        results[current] = error instanceof Error ? error : new Error(String(error));
      }
      if (successful(results[current]!)) succeeded++;
      else { failed++; if (options.stopOnError) stopped = true; }
      if (!progressFailed) {
        try { options.onProgress?.(succeeded + failed, commands.length, succeeded, failed); }
        catch (error) { progressError = error; progressFailed = true; stopped = true; }
      }
    }
  };
  // Every started command is joined and recorded, including those still running
  // when stopOnError or a progress callback stops admission of new work.
  await Promise.all(Array.from({ length: Math.min(limit, commands.length) }, () => worker()));
  if (progressFailed) throw progressError;
  return {
    results,
    succeeded: results.filter(successful),
    failed: results.filter(result => !successful(result)),
    duration: Date.now() - startTime,
  };
}

async function executeWithTimeout(
  engine: ExecutionEngine | CallableExecutionEngine,
  command: string | Command | ProcessPromise,
  timeout?: number
): Promise<ExecutionResult> {
  const run = () => {
    if (isProcessPromise(command)) return command;
    const normalized = typeof command === 'string' ? { command } : command;
    return engine.execute({ ...normalized, signal: getExecutionSignal(normalized.signal) });
  };
  if (!timeout) return run();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError('parallel command', timeout)), timeout);
  try { return await within({ signal: controller.signal }, run); }
  finally { clearTimeout(timer); }
}

export class ParallelEngine {
  constructor(private engine: ExecutionEngine | CallableExecutionEngine) { }

  async all(commands: Array<string | Command | ProcessPromise>, options?: ParallelOptions): Promise<ExecutionResult[]> {
    const result = await parallel(commands, this.engine, { ...options, stopOnError: true });

    if (result.failed.length > 0) {
      const first = result.failed[0]!;

      // `failed` now also holds results of commands that ran and exited
      // non-zero, and throwing one of those would hand the caller a value
      // that is not an Error.
      throw first instanceof Error
        ? first
        : new CommandError(
          first.command,
          first.exitCode,
          first.signal,
          first.stdout,
          first.stderr,
          first.duration
        );
    }

    return result.succeeded;
  }

  async settled(commands: Array<string | Command | ProcessPromise>, options?: ParallelOptions): Promise<ParallelResult> {
    return parallel(commands, this.engine, options);
  }

  async race(commands: Array<string | Command | ProcessPromise>): Promise<ExecutionResult> {
    const promises = commands.map(cmd => {
      if (isProcessPromise(cmd)) {
        return cmd;
      }
      const normalizedCmd = typeof cmd === 'string' ? { command: cmd } : cmd;
      return this.engine.execute(normalizedCmd);
    });

    return Promise.race(promises);
  }

  async map<T>(
    items: T[],
    fn: (item: T, index: number) => string | Command | ProcessPromise,
    options?: ParallelOptions
  ): Promise<ParallelResult> {
    const commands = items.map((item, index) => fn(item, index));
    return parallel(commands, this.engine, options);
  }

  async filter<T>(
    items: T[],
    fn: (item: T, index: number) => string | Command | ProcessPromise,
    options?: ParallelOptions
  ): Promise<T[]> {
    const result = await parallel(items.map(fn), this.engine, options);
    return items.filter((_, index) => result.results[index] !== undefined && successful(result.results[index]!));
  }

  async some(
    commands: Array<string | Command | ProcessPromise>,
    options?: ParallelOptions
  ): Promise<boolean> {
    const result = await parallel(commands, this.engine, options);
    return result.succeeded.length > 0;
  }

  async every(
    commands: Array<string | Command | ProcessPromise>,
    options?: ParallelOptions
  ): Promise<boolean> {
    const result = await parallel(commands, this.engine, {
      ...options,
      stopOnError: true
    });

    return result.failed.length === 0;
  }
}

