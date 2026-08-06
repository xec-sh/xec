import type { Command } from '../types/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';

import { CommandError } from '../core/error.js';

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

export async function parallel(
  commands: Array<string | Command | ProcessPromise>,
  engine: ExecutionEngine | CallableExecutionEngine,
  options: ParallelOptions = {}
): Promise<ParallelResult> {
  const {
    stopOnError = false,
    timeout,
    onProgress
  } = options;

  const maxConcurrency = options.maxConcurrent ?? options.maxConcurrency ?? Infinity;

  const startTime = Date.now();
  const results: (ExecutionResult | Error)[] = [];
  const succeeded: ExecutionResult[] = [];
  const failed: (ExecutionResult | Error)[] = [];

  /**
   * A command counts as succeeded only if it exited zero and was not signalled.
   *
   * `ok` is computed by the result implementation, but a custom engine may
   * return a plain object without it, so fall back to the same rule rather
   * than reading `undefined` as failure.
   */
  const record = (result: ExecutionResult): boolean => {
    const ok = result.ok ?? (result.exitCode === 0 && !result.signal);

    (ok ? succeeded : failed).push(result);
    return ok;
  };

  // Helper to check if an object is a ProcessPromise
  const isProcessPromise = (obj: any): obj is ProcessPromise =>
    obj && typeof obj.then === 'function' && 'pipe' in obj && 'nothrow' in obj;

  if (maxConcurrency === Infinity) {
    // Only create promises upfront when using unlimited concurrency
    const promises = commands.map(cmd => {
      if (isProcessPromise(cmd)) {
        // ProcessPromise is already executing, just return it
        return cmd;
      } else {
        // Convert string or Command to a promise
        const normalizedCmd = typeof cmd === 'string' ? { command: cmd } : cmd;
        return executeWithTimeout(engine, normalizedCmd, timeout);
      }
    });

    const settled = await Promise.allSettled(promises);

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];

      if (result && result.status === 'fulfilled') {
        results.push(result.value);
        if (!record(result.value) && stopOnError) break;
      } else if (result && result.status === 'rejected') {
        results.push(result.reason);
        failed.push(result.reason);
        if (stopOnError) break;
      }

      // Call progress callback
      if (onProgress) {
        onProgress(i + 1, commands.length, succeeded.length, failed.length);
      }
    }
  } else {
    // Limited concurrency execution
    const executing: Promise<void>[] = [];
    let index = 0;
    let shouldStop = false;

    async function executeNext(): Promise<void> {
      if (shouldStop || index >= commands.length) return;

      const currentIndex = index++;
      const cmd = commands[currentIndex];

      if (!cmd) return;

      try {
        let result: ExecutionResult;
        if (isProcessPromise(cmd)) {
          // ProcessPromise is already executing
          result = await cmd;
        } else {
          // Convert and execute
          const normalizedCmd = typeof cmd === 'string' ? { command: cmd } : cmd;
          result = await executeWithTimeout(engine, normalizedCmd, timeout);
        }
        results[currentIndex] = result;
        if (!record(result) && stopOnError) {
          shouldStop = true;
        }
      } catch (error) {
        results[currentIndex] = error as Error;
        failed.push(error as Error);
        if (stopOnError) {
          shouldStop = true;
        }
      }

      // Call progress callback
      if (onProgress) {
        const completed = succeeded.length + failed.length;
        onProgress(completed, commands.length, succeeded.length, failed.length);
      }

      if (!shouldStop && index < commands.length) {
        await executeNext();
      }
    }

    for (let i = 0; i < Math.min(maxConcurrency, commands.length); i++) {
      executing.push(executeNext());
    }

    await Promise.all(executing);
  }

  return {
    results,
    succeeded,
    failed,
    duration: Date.now() - startTime
  };
}

async function executeWithTimeout(
  engine: ExecutionEngine | CallableExecutionEngine,
  command: Command,
  timeout?: number
): Promise<ExecutionResult> {
  if (!timeout) {
    return engine.execute(command);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const commandWithSignal = { ...command, signal: controller.signal };
    return await engine.execute(commandWithSignal);
  } finally {
    clearTimeout(timeoutId);
  }
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
    // Helper to check if an object is a ProcessPromise
    const isProcessPromise = (obj: any): obj is ProcessPromise =>
      obj && typeof obj.then === 'function' && 'pipe' in obj && 'nothrow' in obj;

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
    // Helper to check if an object is a ProcessPromise
    const isProcessPromise = (obj: any): obj is ProcessPromise =>
      obj && typeof obj.then === 'function' && 'pipe' in obj && 'nothrow' in obj;

    const commandsWithItems = items.map((item, index) => ({
      item,
      command: fn(item, index)
    }));

    const results = await Promise.allSettled(
      commandsWithItems.map(({ command }) => {
        if (isProcessPromise(command)) {
          return command;
        }
        const normalizedCmd = typeof command === 'string' ? { command } : command;
        return this.engine.execute(normalizedCmd);
      })
    );

    return commandsWithItems
      .filter((_, index) => {
        const result = results[index];
        return result && result.status === 'fulfilled' && result.value.exitCode === 0;
      })
      .map(({ item }) => item);
  }

  async some(
    commands: Array<string | Command | ProcessPromise>,
    options?: ParallelOptions
  ): Promise<boolean> {
    // Helper to check if an object is a ProcessPromise
    const isProcessPromise = (obj: any): obj is ProcessPromise =>
      obj && typeof obj.then === 'function' && 'pipe' in obj && 'nothrow' in obj;

    // Success is the same rule the rest of this file uses: a zero exit and
    // no signal. Treating any resolved execution as success — which is what
    // this did — answered `true` for a batch where every command had failed,
    // whenever the engine reports a failure by resolving rather than
    // throwing: `nothrow`, a mock, an adapter with throwOnNonZeroExit off.
    const succeeded = (result: ExecutionResult): boolean =>
      result.ok ?? (result.exitCode === 0 && !result.signal);

    const promises = commands.map(cmd => {
      if (isProcessPromise(cmd)) {
        return cmd.then(succeeded).catch(() => false);
      }
      const normalizedCmd = typeof cmd === 'string' ? { command: cmd } : cmd;
      return this.engine.execute(normalizedCmd)
        .then(succeeded)
        .catch(() => false);
    });

    const results = await Promise.race([
      Promise.any(promises.map((p, index) =>
        p.then(success => success ? index : Promise.reject())
      )),
      Promise.all(promises).then(() => false)
    ]);

    return typeof results === 'number';
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

