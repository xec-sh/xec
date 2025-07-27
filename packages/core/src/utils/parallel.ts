import type { Command } from '../core/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

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
  commands: Array<string | Command>,
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

  const normalizedCommands = commands.map(cmd =>
    typeof cmd === 'string' ? { command: cmd } : cmd
  );

  if (maxConcurrency === Infinity) {
    const promises = normalizedCommands.map(cmd =>
      executeWithTimeout(engine, cmd, timeout)
    );

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
        onProgress(i + 1, normalizedCommands.length, succeeded.length, failed.length);
      }
    }
  } else {
    const executing: Promise<void>[] = [];
    let index = 0;
    let shouldStop = false;

    async function executeNext(): Promise<void> {
      if (shouldStop || index >= normalizedCommands.length) return;

      const currentIndex = index++;
      const cmd = normalizedCommands[currentIndex];

      if (!cmd) return;

      try {
        const result = await executeWithTimeout(engine, cmd, timeout);
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
        onProgress(completed, normalizedCommands.length, succeeded.length, failed.length);
      }

      if (!shouldStop && index < normalizedCommands.length) {
        await executeNext();
      }
    }

    for (let i = 0; i < Math.min(maxConcurrency, normalizedCommands.length); i++) {
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

  async all(commands: Array<string | Command>, options?: ParallelOptions): Promise<ExecutionResult[]> {
    const result = await parallel(commands, this.engine, { ...options, stopOnError: true });

    if (result.failed.length > 0) {
      throw result.failed[0];
    }

    return result.succeeded;
  }

  async settled(commands: Array<string | Command>, options?: ParallelOptions): Promise<ParallelResult> {
    return parallel(commands, this.engine, options);
  }

  async race(commands: Array<string | Command>): Promise<ExecutionResult> {
    const promises = commands.map(cmd => {
      const normalizedCmd = typeof cmd === 'string' ? { command: cmd } : cmd;
      return this.engine.execute(normalizedCmd);
    });

    return Promise.race(promises);
  }

  async map<T>(
    items: T[],
    fn: (item: T, index: number) => string | Command,
    options?: ParallelOptions
  ): Promise<ParallelResult> {
    const commands = items.map((item, index) => fn(item, index));
    return parallel(commands, this.engine, options);
  }

  async filter<T>(
    items: T[],
    fn: (item: T, index: number) => string | Command,
    options?: ParallelOptions
  ): Promise<T[]> {
    const commandsWithItems = items.map((item, index) => ({
      item,
      command: fn(item, index)
    }));

    const results = await Promise.allSettled(
      commandsWithItems.map(({ command }) => {
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
    commands: Array<string | Command>,
    options?: ParallelOptions
  ): Promise<boolean> {
    const promises = commands.map(cmd => {
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
    commands: Array<string | Command>,
    options?: ParallelOptions
  ): Promise<boolean> {
    const result = await parallel(commands, this.engine, {
      ...options,
      stopOnError: true
    });

    return result.failed.length === 0;
  }
}

