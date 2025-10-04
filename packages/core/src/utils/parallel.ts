import type { Command } from '../types/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';

export interface ParallelOptions {
  maxConcurrency?: number;
  stopOnError?: boolean;
  timeout?: number;
  onProgress?: (completed: number, total: number, succeeded: number, failed: number) => void;
}

export interface ParallelResult {
  results: (ExecutionResult | Error)[];
  succeeded: ExecutionResult[];
  failed: Error[];
  duration: number;
}

export async function parallel(
  commands: Array<string | Command | ProcessPromise>,
  engine: ExecutionEngine | CallableExecutionEngine,
  options: ParallelOptions = {}
): Promise<ParallelResult> {
  const {
    maxConcurrency = Infinity,
    stopOnError = false,
    timeout,
    onProgress
  } = options;

  const startTime = Date.now();
  const results: (ExecutionResult | Error)[] = [];
  const succeeded: ExecutionResult[] = [];
  const failed: Error[] = [];

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
        succeeded.push(result.value);
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
        succeeded.push(result);
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
      throw result.failed[0];
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

    const promises = commands.map(cmd => {
      if (isProcessPromise(cmd)) {
        return cmd.then(() => true).catch(() => false);
      }
      const normalizedCmd = typeof cmd === 'string' ? { command: cmd } : cmd;
      return this.engine.execute(normalizedCmd)
        .then(() => true)
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

